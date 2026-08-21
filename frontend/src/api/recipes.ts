import api from './client'

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
  source: 'custom' | 'gemini' | 'foodsafety' | 'fallback'
}

export async function getRecommendations(): Promise<Recipe[]> {
  const resp = await api.get<Recipe[]>('/recipes/recommend')
  return resp.data
}
