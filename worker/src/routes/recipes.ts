import { Hono } from 'hono'
import { ApiError } from '../lib/errors'
import { requireFamily } from '../lib/identity'
import { scoreRecipe } from '../lib/recipe-match'
import { fetchCatalog, fetchCatalogFull, findFullRecipe } from '../lib/recipe-catalog'
import { MAX_QUERY_CHARS, MAX_SEARCH_OFFSET, SEARCH_PAGE_SIZE, rankAll } from '../lib/recipe-search'
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

/**
 * 공유 레시피 쪽 스캔 상한.
 *
 * 30 이었는데 페이지를 넘길 수 있게 되면서 올렸다 — 30 에서 자르면 31번째
 * 우리 가족 레시피는 몇 페이지를 넘겨도 영영 안 보인다.
 * LIKE 는 인덱스를 못 타서 어차피 테이블 전체를 스캔하므로, 이 숫자를 올려도
 * D1 이 읽는 행 수는 거의 그대로다 (가족 단위라 테이블 자체가 작다).
 */
const SHARED_SCAN_LIMIT = 200

app.get('/recommend', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const limit = Math.min(Number(c.req.query('limit') || 6) || 6, 20)

  const { fridge, urgent } = await loadFridge(c.env.DB, familyId)
  if (!fridge.length) return c.json([])

  /* 추천은 **전체**를 읽는다. 추천 카드가 상세(조리 순서·사진·팁)를 인라인으로
     그리기 때문이다 — 색인만 주면 사진과 조리법이 화면에서 사라진다.
     대시보드가 10분 캐시하므로 호출이 잦지 않다. 검색은 색인만 본다. */
  const recipes = await fetchCatalogFull(c.env)
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
  if (!q) return c.json({ items: [], total: 0, has_more: false, catalog_ok: true })

  const rawOffset = Number(c.req.query('offset') ?? 0)
  const offset = Number.isFinite(rawOffset)
    ? Math.min(Math.max(0, Math.floor(rawOffset)), MAX_SEARCH_OFFSET)
    : 0

  const { fridge, urgent } = user.family_id
    ? await loadFridge(c.env.DB, user.family_id)
    : { fridge: [], urgent: [] }

  // 공유 레시피는 DB 가 필터하고, 카탈로그는 이미 캐시된 배열을 필터한다.
  const sharedRows = await searchShared(c.env.DB, user.family_id, q, SHARED_SCAN_LIMIT)
  const shared = rankAll(sharedRows, (r) => r.title, q)

  const catalog = await fetchCatalog(c.env)
  const catalogOk = catalog.length > 0
  const fromCatalog = rankAll(catalog, (r) => r.name, q)

  /* 우리 집에서 올린 레시피를 앞에 둔다. 같은 이름이면 남의 것보다 우리 것이
     사용자가 찾던 것일 가능성이 높다. 각 행에 출처 라벨이 보이므로 헷갈리지 않는다.
     예전에는 «절반까지만» 이라는 상한을 뒀는데, 그건 **더 볼 방법이 없어서**
     우리 가족 레시피가 카탈로그를 통째로 밀어내는 걸 막던 임시방편이었다.
     이제 페이지를 넘길 수 있으므로 그 상한은 필요 없다 — 순서만 안정적이면 된다. */
  /* 두 출처를 섞기 전에 어느 쪽인지 표시해 둔다. 섞고 나서 `'title' in r` 같은
     구조로 되짚으면, 나중에 한쪽 타입에 필드가 하나 늘 때 조용히 틀린다. */
  const merged = [
    ...shared.map((row) => ({ kind: 'shared' as const, row })),
    ...fromCatalog.map((row) => ({ kind: 'catalog' as const, row })),
  ]
  const total = merged.length

  /* **잘라낸 한 페이지에만** 재료 매칭을 돌린다. 전체(수십~수백 건)에 돌리면
     10ms CPU 예산 안에서 할 일이 아니고, 어차피 화면에 안 나가는 값이다. */
  const items = merged.slice(offset, offset + SEARCH_PAGE_SIZE).map((e) =>
    e.kind === 'shared'
      ? publicRecipe(e.row, user.id, fridge, urgent)
      : { ...e.row, source: 'foodsafety' as const, ...scoreRecipe(e.row.ingredients, fridge, urgent) },
  )

  return c.json({
    items,
    total,
    has_more: offset + items.length < total,
    catalog_ok: catalogOk,
  })
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
    /* 여기서만 전체 파일(1.66MB)을 읽는다. 검색 경로는 색인(303KB)만 본다. */
    const hit = await findFullRecipe(c.env, id)
    if (!hit) {
      console.warn('식품안전나라 레시피를 카탈로그에서 못 찾음:', id)
      throw new ApiError(404, '레시피를 찾을 수 없어요.')
    }
    return c.json({ ...hit, source: 'foodsafety' as const, ...scoreRecipe(hit.ingredients, fridge, urgent) })
  }

  throw new ApiError(422, '레시피 출처가 올바르지 않습니다.')
})

export default app
