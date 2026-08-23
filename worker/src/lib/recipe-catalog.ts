import type { Env } from './types'

/**
 * 식품안전나라 레시피 카탈로그 (1,156건).
 *
 * ── 왜 배포 자산에서 읽는가 ──────────────────────────────────────────
 *
 * 예전에는 요청 시점에 공공 API 로 2.5MB 를 받고 Cache API 에 넣었다.
 * 캐시가 살아 있으면 5ms 였지만 **비어 있으면 8.44초**였다 (실측).
 * 내역: `COOKRCP01/1/1000` 이 첫 바이트 0.43초, 총 6.99초. 서버가 느린 게
 * 아니라 2.5MB 를 흘려보내는 데 6.5초가 걸린다.
 *
 * 그리고 Cache API 는 **콜로 단위**다. TTL 6시간이고 언제든 축출된다.
 * 가족 2명이 쓰는 앱은 트래픽이 적어서 아이소레이트도 캐시도 자주 식는다.
 * 즉 8.44초는 예외가 아니라 정기적으로 돌아오는 일이었다.
 *
 * 카탈로그는 거의 안 바뀌는 읽기 전용 공공 데이터다. 요청 때 받아올 이유가
 * 없다. `scripts/build-recipe-catalog.mjs` 가 빌드 때 받아서
 * `frontend/public/` 에 두고, 워커는 ASSETS 바인딩으로 읽는다.
 * **런타임에 외부 네트워크가 아예 없다.**
 *
 * ── 왜 두 파일인가 ──────────────────────────────────────────────────
 *
 * 읽는 시점이 다르다. 검색은 매 타이핑마다 돌고 이름·재료만 쓴다(303KB).
 * 조리 순서·단계 사진·팁(1.36MB, 전체의 82%)은 «조리법 보기» 를 눌렀을
 * 때만 필요하다. 한 덩어리로 두면 이름을 찾으려고 조리 사진을 같이 파싱한다.
 */

/** 검색·추천이 쓰는 최소 정보. */
export interface CatalogRecipe {
  /** RCP_SEQ. 식단이 이걸로 레시피를 다시 찾는다. */
  id: string
  name: string
  category: string
  cooking_method: string
  calories: string
  ingredients: string[]
}

/** 조리법 화면이 쓰는 전체 정보. */
export interface CatalogRecipeFull extends CatalogRecipe {
  image_url: string
  manual_steps: string[]
  /** 단계별 사진. 단계마다 있을 수도 없을 수도 있어서 인덱스를 빈 문자열로 맞춘다. */
  manual_images: string[]
  tip: string
}

/* 아이소레이트 메모리 캐시. **TTL 이 없다** — 자산은 배포마다 불변이라
   식을 이유가 없다. 예전 6시간 TTL 은 공공 API 의 신선도를 좇던 것이고,
   이제 신선도는 배포가 결정한다. */
let indexCache: CatalogRecipe[] | null = null
let fullCache: CatalogRecipeFull[] | null = null

/* 자산 바인딩은 실제 호스트를 안 본다. 경로만 맞으면 된다. */
const ASSET_ORIGIN = 'https://eatco.assets'

async function readAsset<T>(env: Env, path: string): Promise<T[]> {
  try {
    const res = await env.ASSETS.fetch(new Request(ASSET_ORIGIN + path))
    if (!res.ok) {
      console.warn('레시피 카탈로그 자산을 못 읽었다:', path, res.status)
      return []
    }
    const data = (await res.json()) as T[]
    return Array.isArray(data) ? data : []
  } catch (e) {
    /* 여기서 throw 하면 검색이 500 이 된다. 빈 배열이면 화면이
       «레시피 목록을 일부만 불러왔어요» 로 정직하게 degrade 한다. */
    console.warn('레시피 카탈로그 자산 읽기 실패:', path, e)
    return []
  }
}

/** 검색·추천용 색인 (303KB). 실패하면 빈 배열 — **절대 throw 하지 않는다.** */
export async function fetchCatalog(env: Env): Promise<CatalogRecipe[]> {
  if (indexCache) return indexCache
  const data = await readAsset<CatalogRecipe>(env, '/recipe-catalog-index.json')
  if (data.length) indexCache = data
  return data
}

/**
 * 조리법까지 있는 전체 (1.66MB).
 *
 * **검색 경로에서 부르면 안 된다** — 파일을 나눈 의미가 없어진다.
 * 부르는 곳은 둘뿐이다:
 *   - `/recipes/one` — «조리법 보기» 를 눌렀을 때
 *   - `/recipes/recommend` — 추천 카드가 상세를 인라인으로 그린다
 *     (대시보드가 10분 캐시하므로 호출이 잦지 않다)
 */
export async function fetchCatalogFull(env: Env): Promise<CatalogRecipeFull[]> {
  if (fullCache) return fullCache
  const data = await readAsset<CatalogRecipeFull>(env, '/recipe-catalog-full.json')
  if (data.length) fullCache = data
  return data
}

/** 전체에서 한 건. 없으면 null. */
export async function findFullRecipe(env: Env, id: string): Promise<CatalogRecipeFull | null> {
  if (!id) return null
  const all = await fetchCatalogFull(env)
  return all.find((r) => r.id === id) ?? null
}
