import api, { registerFridgeChangeHandler } from './client'

export interface Recipe {
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

/** 재료가 바뀌면 호출한다. 다음 조회에서 새로 받는다. */
export function invalidateRecommendations(): void {
  cache = null
  inFlight = null
}

// /ingredients 나 /scan 에 쓰기가 성공하면 client.ts 가 이걸 불러준다.
registerFridgeChangeHandler(invalidateRecommendations)

export async function getRecommendations(): Promise<Recipe[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  // 같은 순간에 두 곳에서 부르면 요청은 하나만 나간다.
  if (inFlight) return inFlight

  inFlight = api
    .get<Recipe[]>('/recipes/recommend')
    .then((resp) => {
      cache = { at: Date.now(), data: resp.data }
      return resp.data
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
