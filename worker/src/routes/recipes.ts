import { Hono } from 'hono'
import { requireFamily } from '../lib/identity'
import { todayKst, daysBetween } from '../lib/dates'
import type { Env, Vars } from '../lib/types'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

/**
 * 식품안전나라 COOKRCP01 기반 레시피 추천.
 *
 * Gemini 보충 생성은 뺐다 — 배포된 Worker 에서 Gemini 가 지역 차단되기 때문이다
 * (영수증 스캔은 그래서 브라우저에서 직접 호출한다). 공공 API 만으로도
 * 1,000여 개 레시피에서 냉장고 재료 매칭이 된다.
 */

interface Recipe {
  name: string
  category: string
  cooking_method: string
  calories: string
  image_url: string
  ingredients: string[]
  manual_steps: string[]
  /* 단계별 사진. 공공 API 가 MANUAL_IMG01~20 으로 주는데 파싱하지 않고 있었다.
     상세 화면에는 이걸 그리는 코드가 이미 있었고, 서버가 안 보내니
     `manual_images[i]` 에서 터져 흰 화면이 됐다. */
  manual_images: string[]
  tip: string
}

// 아이소레이트 수명 동안만 유지되는 캐시. 공공 API 는 하루 트래픽 제한이 있다.
let recipeCache: { at: number; data: Recipe[] } | null = null
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

const PAREN = /\([^)]*\)/g
const QUANTITY = /\s*[\d/.]+\s*(g|kg|ml|L|개|모|마리|줄기|큰술|작은술|쪽|cm|장|컵|봉지|포기).*$/
const PREFIX = /^(다진|썬|채썬|간|삶은|데친|볶은|구운|찐|튀긴)\s*/

function normalizeIngredient(text: string): string {
  let t = text.trim()
  t = t.replace(PAREN, '')
  t = t.replace(QUANTITY, '')
  t = t.replace(PREFIX, '')
  t = t.replace(/\d+/g, '')
  return t.replace(/^[\s,.]+|[\s,.]+$/g, '')
}

function extractIngredients(parts: string): string[] {
  const out: string[] = []
  for (let line of parts.replace(/\n/g, ',').split(',')) {
    line = line.trim()
    if (!line || line.length < 2) continue
    if (line.endsWith(':') || line.startsWith('●') || line.startsWith('·')) {
      line = line.replace(/^[●·]+/, '').replace(/:$/, '').trim()
      if (line.length < 2) continue
    }
    const name = normalizeIngredient(line)
    if (name && name.length >= 2) out.push(name)
  }
  return out
}

/** 단어 경계 + 접미사 매칭. "순두부" 는 "두부" 를 포함하지만 "삼겹살" 은 "돼지고기" 와 무관. */
function isWordMatch(a: string, b: string): boolean {
  if (a === b) return true
  const aw = a.split(/\s+/).filter(Boolean)
  const bw = b.split(/\s+/).filter(Boolean)
  const bset = new Set(bw)
  for (const w of aw) if (w.length >= 2 && bset.has(w)) return true
  const aset = new Set(aw)
  for (const w of bw) if (w.length >= 2 && aset.has(w)) return true
  for (const x of aw) {
    for (const y of bw) {
      const [short, long] = x.length <= y.length ? [x, y] : [y, x]
      if (short.length >= 2 && long.endsWith(short)) return true
    }
  }
  return false
}

/* R2 에 올려두는 카탈로그 사본. 아이소레이트 캐시만으로는 부족해서 넣었다.

   `recipeCache` 는 **아이소레이트 메모리**다. Cloudflare 는 아이소레이트를 수시로
   재활용하므로 6시간 TTL 이 실제로 6시간 가는 게 아니다. 콜드 아이소레이트마다
   공공 API 로 1,000건짜리 요청을 두 번 날린다. 그 API 는 하루 트래픽 제한이 있다.

   R2 는 아이소레이트와 무관하게 남는다. 순서는 메모리 → R2 → 공공 API 이고,
   공공 API 를 부르는 건 R2 사본까지 만료됐을 때뿐이다. */
const R2_CATALOG_KEY = 'recipes/foodsafety-catalog.json'

async function readCatalogFromR2(env: Env): Promise<Recipe[] | null> {
  try {
    const obj = await env.UPLOADS.get(R2_CATALOG_KEY)
    if (!obj) return null
    const savedAt = Number(obj.customMetadata?.savedAt ?? 0)
    if (!savedAt || Date.now() - savedAt >= CACHE_TTL_MS) return null
    const data = (await obj.json()) as Recipe[]
    return Array.isArray(data) && data.length ? data : null
  } catch (e) {
    // 캐시는 있으면 좋은 것이지 없으면 안 되는 게 아니다. 실패하면 공공 API 로 간다.
    console.warn('레시피 R2 캐시 읽기 실패:', e)
    return null
  }
}

async function writeCatalogToR2(env: Env, data: Recipe[]): Promise<void> {
  try {
    await env.UPLOADS.put(R2_CATALOG_KEY, JSON.stringify(data), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { savedAt: String(Date.now()), count: String(data.length) },
    })
  } catch (e) {
    console.warn('레시피 R2 캐시 쓰기 실패:', e)
  }
}

async function fetchRecipes(env: Env): Promise<Recipe[]> {
  const now = Date.now()
  if (recipeCache && now - recipeCache.at < CACHE_TTL_MS) return recipeCache.data

  // 아이소레이트가 새로 떴어도 R2 사본이 살아 있으면 공공 API 를 안 부른다.
  const cached = await readCatalogFromR2(env)
  if (cached) {
    recipeCache = { at: now, data: cached }
    return cached
  }

  const key = env.RECIPE_API_KEY
  if (!key) return []

  const out: Recipe[] = []
  // 총 1,146개. 1000개씩 2번이면 충분하다 (무료 티어 subrequest 50개 한도 안).
  for (const [start, end] of [[1, 1000], [1001, 1200]]) {
    const url = `https://openapi.foodsafetykorea.go.kr/api/${key}/COOKRCP01/json/${start}/${end}`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      if (!res.ok) break
      const json = (await res.json()) as { COOKRCP01?: { row?: Record<string, string>[] } }
      for (const r of json.COOKRCP01?.row ?? []) {
        const steps: string[] = []
        const stepImages: string[] = []
        for (let i = 1; i <= 20; i++) {
          const n = String(i).padStart(2, '0')
          const s = r[`MANUAL${n}`]
          if (s && s.trim()) {
            steps.push(s.trim())
            // 사진은 단계마다 있을 수도 없을 수도 있다. 인덱스를 맞춰 빈 문자열로 채운다.
            stepImages.push((r[`MANUAL_IMG${n}`] ?? '').trim())
          }
        }
        out.push({
          name: r.RCP_NM ?? '',
          category: r.RCP_PAT2 ?? '기타',
          cooking_method: r.RCP_WAY2 ?? '기타',
          calories: r.INFO_ENG ?? '',
          image_url: r.ATT_FILE_NO_MK || r.ATT_FILE_NO_MAIN || '',
          ingredients: extractIngredients(r.RCP_PARTS_DTLS ?? ''),
          manual_steps: steps,
          manual_images: stepImages,
          tip: r.RCP_NA_TIP ?? '',
        })
      }
    } catch (e) {
      console.warn('레시피 API 실패:', e)
      break
    }
  }
  if (out.length) {
    recipeCache = { at: now, data: out }
    // 다음 콜드 아이소레이트가 공공 API 를 다시 안 부르도록 사본을 남긴다.
    await writeCatalogToR2(env, out)
  }
  return out
}

app.get('/recommend', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const limit = Math.min(Number(c.req.query('limit') || 6) || 6, 20)

  const { results } = await c.env.DB.prepare(
    'SELECT name, normalized_name, expiry_date FROM ingredients WHERE family_id = ?',
  )
    .bind(familyId)
    .all<{ name: string; normalized_name: string | null; expiry_date: string }>()

  const today = todayKst()
  const fridge = (results ?? []).map((r) => (r.normalized_name || r.name).toLowerCase().trim())
  const urgent = (results ?? [])
    .filter((r) => daysBetween(today, r.expiry_date) <= 3)
    .map((r) => (r.normalized_name || r.name).toLowerCase().trim())

  if (!fridge.length) return c.json([])

  const recipes = await fetchRecipes(c.env)
  if (!recipes.length) return c.json([])

  const scored = recipes.map((rec) => {
    const matched: string[] = []
    const missing: string[] = []
    const urgentUsed: string[] = []
    for (const ri of rec.ingredients) {
      const r = ri.toLowerCase().trim()
      const hit = fridge.find((f) => isWordMatch(r, f))
      if (hit) {
        matched.push(ri)
        if (urgent.includes(hit)) urgentUsed.push(ri)
      } else {
        missing.push(ri)
      }
    }
    const total = rec.ingredients.length || 1
    // 한 레시피가 같은 재료를 여러 줄에 적는 경우가 흔하다(양념/고명 등).
    // 화면에 "두부, 양파, 두부, 양파" 로 보이지 않게 중복을 제거한다.
    const uniq = (xs: string[]) => [...new Set(xs)]
    const matchedU = uniq(matched)
    return {
      ...rec,
      match_count: matchedU.length,
      total_ingredients: total,
      match_ratio: matched.length / total,
      matched_items: matchedU,
      missing_items: uniq(missing),
      urgent_used: uniq(urgentUsed),
    }
  })

  scored.sort(
    (a, b) =>
      b.urgent_used.length - a.urgent_used.length ||
      b.match_ratio - a.match_ratio ||
      b.match_count - a.match_count,
  )
  return c.json(scored.filter((s) => s.match_count > 0).slice(0, limit))
})

export default app
