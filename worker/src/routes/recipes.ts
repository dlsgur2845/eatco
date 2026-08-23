import { Hono } from 'hono'
import { ApiError } from '../lib/errors'
import { requireFamily } from '../lib/identity'
import { scoreRecipe } from '../lib/recipe-match'
import { fetchCatalog, findInCatalog, searchCatalog, type CatalogRecipe } from '../lib/recipe-catalog'
import { MAX_QUERY_CHARS, rankByQuery } from '../lib/recipe-search'
import { findSharedForViewer, publicRecipe, searchShared } from '../lib/shared-recipe-scope'
import { loadFridge } from '../lib/fridge'
import type { Env, Vars } from '../lib/types'

/**
 * 레시피 추천 / 검색 / 단건.
 *
 * 카탈로그를 읽는 코드는 `lib/recipe-catalog.ts` 로 옮겼다 — 식단 화면도
 * 같은 카탈로그를 쓰는데, `routes/calendar.ts` 가 이 파일을 import 하면
 * 라우트가 라우트를 부르는 꼴이 되기 때문이다.
 */

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

/** 검색 결과 상한. 식단 추가 모달 안에 들어가는 목록이라 짧아야 한다. */
const SEARCH_LIMIT = 8
/** 공유 레시피 쪽 스캔 상한. 병합 전에 자른다. */
const SHARED_SCAN_LIMIT = 30

app.get('/recommend', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const limit = Math.min(Number(c.req.query('limit') || 6) || 6, 20)

  const { fridge, urgent } = await loadFridge(c.env.DB, familyId)
  if (!fridge.length) return c.json([])

  const recipes = await fetchCatalog(c.env)
  if (!recipes.length) return c.json([])

  const scored = recipes.map((rec) => ({
    ...rec,
    ...scoreRecipe(rec.ingredients, fridge, urgent),
  }))

  scored.sort(
    (a, b) =>
      b.urgent_used.length - a.urgent_used.length ||
      b.match_ratio - a.match_ratio ||
      b.match_count - a.match_count,
  )
  return c.json(scored.filter((s) => s.match_count > 0).slice(0, limit))
})

/**
 * 검색 — 식단에 붙일 레시피를 고르는 용도.
 *
 * 두 카탈로그를 합쳐서 준다:
 *   1. `shared_recipes` — 내 가족 것 + 공개 승인된 것 (`lib/shared-recipe-scope`)
 *   2. 식품안전나라 1,146건 (메모리 → Cache API → 공공 API)
 *
 * **`/recommend` 와 달리 냉장고가 비어도 검색은 된다.** 그때는 전부 "부족" 인데,
 * 그게 오히려 맞는 정보다.
 *
 * 카탈로그를 못 읽어도 공유 결과는 돌려준다. 전부 실패로 만들면 살아 있는
 * 결과까지 버리게 된다. 대신 `catalog_ok:false` 로 알린다 — 화면이 "0건" 과
 * "일부만 불러옴" 을 구분해서 말해야 하기 때문이다. 같은 화면으로 처리하면
 * 사용자는 "그런 레시피가 없구나" 로 결론짓는다. 그건 거짓 정보다.
 */
app.get('/search', async (c) => {
  const user = c.get('user')
  // 두 카탈로그가 같은 문자열을 보도록 여기서 한 번만 자른다.
  const q = (c.req.query('q') ?? '').trim().slice(0, MAX_QUERY_CHARS)
  if (!q) return c.json({ items: [], catalog_ok: true })

  const { fridge, urgent } = user.family_id
    ? await loadFridge(c.env.DB, user.family_id)
    : { fridge: [], urgent: [] }

  // 공유 레시피는 DB 가 필터하고, 카탈로그는 이미 캐시된 배열을 필터한다.
  const sharedRows = await searchShared(c.env.DB, user.family_id, q, SHARED_SCAN_LIMIT)
  const shared = rankByQuery(sharedRows, (r) => r.title, q, SEARCH_LIMIT).map((r) =>
    publicRecipe(r, user.id, fridge, urgent),
  )

  const catalog = await fetchCatalog(c.env)
  const catalogOk = catalog.length > 0
  const fromCatalog = searchCatalog(catalog, q, SEARCH_LIMIT).map((r) => ({
    ...r,
    source: 'foodsafety' as const,
    ...scoreRecipe(r.ingredients, fridge, urgent),
  }))

  /* 우리 집에서 올린 레시피를 앞에 둔다. 같은 이름이면 남의 것보다 우리 것이
     사용자가 찾던 것일 가능성이 높다. 각 행에 출처 라벨이 보이므로 헷갈리지 않는다.
     단 **절반까지만** 준다. 그냥 이어 붙이면 우리 가족 레시피가 8건 매칭되는
     순간 1,146건짜리 카탈로그가 화면에서 통째로 사라진다. */
  const sharedSlots = Math.ceil(SEARCH_LIMIT / 2)
  const head = shared.slice(0, sharedSlots)
  const items = [...head, ...fromCatalog].slice(0, SEARCH_LIMIT)
  return c.json({ items, catalog_ok: catalogOk })
})

/**
 * 단건 — 식단에 붙은 레시피의 조리법을 다시 볼 때.
 *
 * **`GET /calendar/:id` 가 이걸 대신 부르지 않는다.** 상세를 열 때마다
 * 1,146건 카탈로그를 읽으면 식단 화면이 공공 API 에 묶인다. 조리법은
 * 사용자가 "조리법 보기" 를 눌렀을 때만 가져온다.
 *
 * `source=custom` 은 **반드시** 목록과 같은 가시성 규칙을 탄다 (`findShared`).
 * 안 그러면 공개했다 내린 레시피가 id 만으로 계속 읽힌다 —
 * 그 id 는 공개돼 있던 동안 이미 모두가 봤다.
 */
app.get('/one', async (c) => {
  const user = c.get('user')
  const source = c.req.query('source') ?? ''
  const id = (c.req.query('id') ?? '').trim()
  if (!id) throw new ApiError(422, '레시피를 지정해주세요.')

  const { fridge, urgent } = user.family_id
    ? await loadFridge(c.env.DB, user.family_id)
    : { fridge: [], urgent: [] }

  if (source === 'custom') {
    const row = await findSharedForViewer(c.env.DB, user.family_id, user.id, id)
    if (!row) {
      console.warn('공유 레시피 단건 조회 실패 (없거나 권한 밖):', id)
      throw new ApiError(404, '레시피를 찾을 수 없어요.')
    }
    return c.json(publicRecipe(row, user.id, fridge, urgent))
  }

  if (source === 'foodsafety') {
    const catalog = await fetchCatalog(c.env)
    if (!catalog.length) throw new ApiError(503, '레시피를 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
    const hit: CatalogRecipe | null = findInCatalog(catalog, id)
    if (!hit) {
      console.warn('식품안전나라 레시피를 카탈로그에서 못 찾음:', id)
      throw new ApiError(404, '레시피를 찾을 수 없어요.')
    }
    return c.json({ ...hit, source: 'foodsafety' as const, ...scoreRecipe(hit.ingredients, fridge, urgent) })
  }

  throw new ApiError(422, '레시피 출처가 올바르지 않습니다.')
})

export default app
