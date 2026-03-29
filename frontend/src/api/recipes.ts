import api from './client'

export interface Recipe {
  name: string
  category: string
  cooking_method: string
  calories: string
  image_url: string
  ingredients: string[]
  manual_steps: string[]
  manual_images: string[]
  tip: string
  match_count: number
  total_ingredients: number
  match_ratio: number
  matched_items: string[]
  missing_items: string[]
  urgent_used: string[]
  source: 'gemini' | 'foodsafety' | 'fallback'
}

export async function getRecommendations(): Promise<Recipe[]> {
  const resp = await api.get<Recipe[]>('/recipes/recommend')
  return resp.data
}
