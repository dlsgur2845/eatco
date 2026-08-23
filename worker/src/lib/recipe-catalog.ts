import { extractIngredients } from './recipe-match'
import type { Env } from './types'

/**
 * 식품안전나라 COOKRCP01 카탈로그 (1,146건).
 *
 * `routes/recipes.ts` 안에 있던 것을 끌어냈다. 식단 화면이 레시피를 검색하고
 * 조리법을 다시 열어야 하는데, `routes/calendar.ts` 가 `routes/recipes.ts` 를
 * import 하면 **라우트가 라우트를 부르는 꼴**이 된다 (Hono 앱 인스턴스가
 * 딸려 오고 순환 위험이 생긴다).
 *
 * 이 파일은 Env 를 참조하므로 프론트 테스트가 import 할 수 없다.
 * 순수 로직(정렬·질의 정규화)은 `lib/recipe-search.ts` 에 두고 여기서 부른다.
 *
 * Gemini 보충 생성은 뺐다 — 배포된 Worker 에서 Gemini 가 지역 차단되기 때문이다
 * (영수증 스캔은 그래서 브라우저에서 직접 호출한다).
 */

export interface CatalogRecipe {
  /** RCP_SEQ. 공공 API 가 주는 안정된 식별자다. 식단이 이걸로 레시피를 다시 찾는다. */
  id: string
  name: string
  category: string
  cooking_method: string
  calories: string
  image_url: string
  ingredients: string[]
  manual_steps: string[]
  /** 단계별 사진. 단계마다 있을 수도 없을 수도 있어서 인덱스를 빈 문자열로 맞춘다. */
  manual_images: string[]
  tip: string
}

// 아이소레이트 수명 동안만 유지되는 캐시. 공공 API 는 하루 트래픽 제한이 있다.
let memoryCache: { at: number; data: CatalogRecipe[] } | null = null
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/* 아이소레이트 밖에서도 남는 카탈로그 사본.

   `memoryCache` 는 **아이소레이트 메모리**다. Cloudflare 는 아이소레이트를 수시로
   재활용하므로 6시간 TTL 이 실제로 6시간 가는 게 아니다. 콜드 아이소레이트마다
   공공 API 로 1,000건짜리 요청을 두 번 날린다. 그 API 는 하루 트래픽 제한이 있다.

   처음엔 R2(`env.UPLOADS`)에 넣으려 했는데 **이 계정은 R2 가 활성화돼 있지 않다.**
   바인딩은 wrangler.jsonc 에 있고 배포도 통과하지만 런타임에
   `code 10042: Please enable R2 through the Cloudflare Dashboard` 로 실패한다.
   try/catch 에 삼켜져서 조용히 아무 일도 안 하고 있었다.

   Cache API 는 계정 설정 없이 바로 된다. 콜로 단위라 전역은 아니지만, 가족이
   대부분 한 지역에서 접속하므로 실질적으로 같은 효과다.
   순서는 메모리 → Cache API → 공공 API. */
/* 키에 버전이 붙어 있다. **CatalogRecipe 모양을 바꾸면 반드시 올릴 것.**
   안 올리면 배포 직후 최대 6시간 동안 옛 모양의 캐시가 그대로 나온다.
   실제로 겪었다: `id`(RCP_SEQ) 를 추가했는데 캐시에는 그 필드가 없어서
   검색 결과의 식품안전나라 레시피가 전부 id 빈 문자열로 나왔다.
   그 상태로 식단에 붙이면 조리법을 다시 찾을 수 없다. */
const CATALOG_CACHE_URL = 'https://eatco.internal/cache/foodsafety-catalog-v2'
const CACHE_TTL_SEC = Math.floor(CACHE_TTL_MS / 1000)

async function readFromCache(): Promise<CatalogRecipe[] | null> {
  try {
    const hit = await caches.default.match(new Request(CATALOG_CACHE_URL))
    if (!hit) return null
    const data = (await hit.json()) as CatalogRecipe[]
    if (!Array.isArray(data) || !data.length) return null
    /* 모양 검사. 버전을 올리는 걸 잊어도 옛 캐시를 먹지 않게 하는 안전망이다.
       한 건만 봐도 충분하다 — 같은 코드가 통째로 쓴 배열이다. */
    if (typeof data[0]?.id !== 'string' || !data[0].id) {
      console.warn('레시피 캐시 모양이 옛 것이다. 버리고 다시 받는다.')
      return null
    }
    return data
  } catch (e) {
    // 캐시는 있으면 좋은 것이지 없으면 안 되는 게 아니다. 실패하면 공공 API 로 간다.
    console.warn('레시피 캐시 읽기 실패:', e)
    return null
  }
}

async function writeToCache(data: CatalogRecipe[]): Promise<void> {
  try {
    await caches.default.put(
      new Request(CATALOG_CACHE_URL),
      new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `max-age=${CACHE_TTL_SEC}`,
        },
      }),
    )
  } catch (e) {
    console.warn('레시피 캐시 쓰기 실패:', e)
  }
}

/** 카탈로그 전체. 실패하면 빈 배열 — **절대 throw 하지 않는다.** */
export async function fetchCatalog(env: Env): Promise<CatalogRecipe[]> {
  const now = Date.now()
  if (memoryCache && now - memoryCache.at < CACHE_TTL_MS) return memoryCache.data

  // 아이소레이트가 새로 떴어도 콜로 캐시가 살아 있으면 공공 API 를 안 부른다.
  const cached = await readFromCache()
  if (cached) {
    memoryCache = { at: now, data: cached }
    return cached
  }

  const key = env.RECIPE_API_KEY
  if (!key) return []

  const out: CatalogRecipe[] = []
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
            stepImages.push((r[`MANUAL_IMG${n}`] ?? '').trim())
          }
        }
        out.push({
          /* RCP_SEQ 를 지금까지 버리고 있었다. 추천만 할 때는 필요 없었지만,
             식단이 "이 레시피" 를 가리키려면 안정된 열쇠가 있어야 한다.
             실측 확인: COOKRCP01 응답에 RCP_SEQ 가 있다 (예: '28'). */
          id: String(r.RCP_SEQ ?? '').trim(),
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
    memoryCache = { at: now, data: out }
    // 다음 콜드 아이소레이트가 공공 API 를 다시 안 부르도록 사본을 남긴다.
    await writeToCache(out)
  }
  return out
}

/** RCP_SEQ 로 한 건. 없으면 null. */
export function findInCatalog(all: CatalogRecipe[], id: string): CatalogRecipe | null {
  if (!id) return null
  return all.find((r) => r.id === id) ?? null
}
