import api, { registerFridgeChangeHandler } from './client'

export interface Recipe {
  /* 레시피를 다시 찾는 열쇠. foodsafety 면 RCP_SEQ, custom 이면 shared_recipes.id.
     **optional 이다** — `/recipes/recommend` 응답에도 들어 있지만, 옛 응답이
     캐시에 남아 있을 수 있다. 이 저장소는 서버가 안 보내는 필드를 필수로
     단언했다가 상세 화면이 흰 화면이 된 적이 있다 (`manual_images`). */
  id?: string
  name: string
  category: string
  cooking_method: string
  calories: string
  image_url: string
  ingredients: string[]
  manual_steps: string[]
  /* 선택 필드다. `manual_images: string[]` 이라고 단언해뒀더니 서버가 안 보내는데도
     타입체크가 통과했고(api.get<Recipe[]> 는 단언을 검증하지 않는다), 상세 화면이
     `manual_images[i]` 에서 터져 흰 화면이 됐다. 없을 수 있으면 없다고 적는다. */
  manual_images?: string[]
  tip: string
  match_count: number
  total_ingredients: number
  match_ratio: number
  matched_items: string[]
  missing_items: string[]
  urgent_used: string[]
  /* 위와 같은 이유로 optional. 서버 응답 키에 실제로 없다 (실측 확인). */
  source?: 'custom' | 'gemini' | 'foodsafety' | 'fallback'
}

/* 추천 결과 캐시.
 *
 * 대시보드가 뜰 때마다 불렀다. 탭을 오갈 때마다 요청이 하나씩 늘어난다 —
 * 실측: 냉장고 탭 3번 방문 = /recipes/recommend 3회.
 *
 * 추천은 냉장고 내용에서 나오는데 냉장고는 자주 안 바뀐다. 재료를 넣거나 뺐을 때
 * `invalidateRecommendations()` 로 직접 비우고, 그 외에는 이 창이 열려 있는 동안
 * 재사용한다. sessionStorage 대신 메모리를 쓰는 이유: 새로고침하면 어차피 다시
 * 받는 게 맞고, 직렬화 비용도 아낀다.
 */
const TTL_MS = 10 * 60 * 1000
let cache: { at: number; data: Recipe[] } | null = null
let inFlight: Promise<Recipe[]> | null = null
/* 세대 번호. `inFlight = null` 만으로는 **이미 나간 요청이 멈추지 않는다** —
   늦게 도착한 응답이 무효화 뒤에 캐시를 덮어쓴다. 삭제와 되돌리기가 몇백 ms 사이로
   두 번 무효화하는 지금 구조에서는 자주 일어난다. 응답이 자기 세대가 아직 유효할
   때만 캐시에 쓰게 한다. */
let generation = 0

/** 재료가 바뀌면 호출한다. 다음 조회에서 새로 받는다. */
export function invalidateRecommendations(): void {
  cache = null
  inFlight = null
  generation += 1
}

// /ingredients 나 /scan 에 쓰기가 성공하면 client.ts 가 이걸 불러준다.
registerFridgeChangeHandler(invalidateRecommendations)

export async function getRecommendations(): Promise<Recipe[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  // 같은 순간에 두 곳에서 부르면 요청은 하나만 나간다.
  if (inFlight) return inFlight

  const myGen = generation
  inFlight = api
    .get<Recipe[]>('/recipes/recommend')
    .then((resp) => {
      // 내가 나간 뒤 냉장고가 또 바뀌었으면 이 응답은 이미 낡았다. 캐시에 쓰지 않는다.
      if (myGen === generation) cache = { at: Date.now(), data: resp.data }
      return resp.data
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}


/* ── 검색 ──────────────────────────────────────────────────────────
   식단에 붙일 레시피를 고르는 용도. 두 카탈로그(우리 가족 + 식품안전나라)를
   서버가 합쳐서 준다.

   `catalog_ok` 가 왜 필요한가: 공공 API 가 죽었을 때 결과가 0건이면 화면은
   "그런 레시피가 없어요" 라고 말한다. 그건 거짓 정보다. 0건과 "일부만
   불러옴" 을 다르게 말할 수 있어야 한다 (DESIGN.md §5).
   서버가 **항상** 보내므로 optional 이 아니다. */
export interface RecipeSearchResult {
  items: Recipe[]
  /** 이 질의의 전체 매칭 수. 한 페이지 크기가 아니라 **다 합친 수**다. */
  total: number
  /** 더 받을 게 남았나. total 과 offset 으로도 계산되지만 서버가 판정한다. */
  has_more: boolean
  catalog_ok: boolean
}

/**
 * 레시피 검색 한 페이지.
 *
 * 페이지가 필요한 이유: 흔한 질의가 실측으로 46~96건이다 («김치» 46, «닭» 62,
 * «국» 78, «두부» 88, «밥» 96). 한 번에 8건만 보여주면 원하는 걸 못 찾는다.
 */
export async function searchRecipes(q: string, offset = 0): Promise<RecipeSearchResult> {
  const r = await api.get<RecipeSearchResult>('/recipes/search', { params: { q, offset } })
  return r.data
}

/** 식단에 붙은 레시피의 조리법. 못 찾거나 권한 밖이면 404 를 던진다. */
export async function getRecipeOne(source: string, id: string): Promise<Recipe> {
  const r = await api.get<Recipe>('/recipes/one', { params: { source, id } })
  return r.data
}
