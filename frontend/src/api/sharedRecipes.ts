import api from './client'
import type { Recipe } from './recipes'

/**
 * 사용자가 올린 공유 레시피.
 *
 * 서버가 추천 목록과 **같은 모양**으로 내보낸다 (match_ratio 등 포함).
 * 그래서 RecipeCard / RecipeDetailModal 을 그대로 재사용한다.
 */
export interface SharedRecipe extends Recipe {
  id: string
  /** 익명이면 '익명', 기명이면 닉네임. 서버가 이미 골라서 보낸다. */
  author_label: string
  is_mine: boolean
  /** 지금 누가 볼 수 있나. 기본은 가족. */
  visibility: 'family' | 'public'
  /** 공개 검토 결과. 'none' 은 아직 눌러본 적 없음. */
  status: 'none' | 'approved' | 'rejected'
  /** 승인이 아직 유효한가. 수정하면 false 가 된다. */
  approval_valid: boolean
  /** 거절 사유. 작성자 본인에게만 온다. */
  status_reason: string | null
  created_at: string
  updated_at: string
}

/** 개선 검토 한 건. */
export interface Improvement {
  id: string
  body: string
  created_at: string
  /** 이 조언을 받은 뒤 레시피가 바뀌었나. */
  stale: boolean
}

/** 상세 조회 결과 — 개선 이력은 작성자에게만 온다. */
export interface SharedRecipeDetail extends SharedRecipe {
  improvements: Improvement[]
}

export interface NewRecipe {
  title: string
  category: string
  cooking_method: string
  ingredients: string[]
  manual_steps: string[]
  tip: string
  is_anonymous: boolean
}

/* 서버(shared-recipes.ts)의 CATEGORIES/METHODS 와 같아야 한다.
   다르면 서버가 422 를 던진다 — 사용자가 고를 수 없는 값을 화면에 띄우지 않는다. */
export const CATEGORIES = ['반찬', '국&찌개', '밥', '일품', '후식', '기타'] as const
export const METHODS = ['굽기', '끓이기', '볶음', '튀기기', '찌기', '무침', '절임', '회', '비빔', '기타'] as const

/* 목록 캐시. recipes.ts 와 같은 이유(탭을 오갈 때마다 요청이 늘어난다)로 둔다.
   단 TTL 이 짧다 — 방금 올린 글이 목록에 안 보이면 사용자는 등록이 실패한 줄 안다. */
const TTL_MS = 60 * 1000
let cache: { at: number; data: SharedRecipe[] } | null = null
let inFlight: Promise<SharedRecipe[]> | null = null

/** 등록·삭제 후 호출한다. 다음 조회에서 새로 받는다. */
export function invalidateSharedRecipes(): void {
  cache = null
  inFlight = null
}

export async function getSharedRecipes(): Promise<SharedRecipe[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  if (inFlight) return inFlight
  inFlight = api
    .get<SharedRecipe[]>('/shared-recipes')
    .then((r) => {
      cache = { at: Date.now(), data: r.data }
      return r.data
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export async function createSharedRecipe(body: NewRecipe): Promise<{ id: string; status: string }> {
  const r = await api.post<{ id: string; status: string }>('/shared-recipes', body)
  invalidateSharedRecipes()
  return r.data
}

export async function deleteSharedRecipe(id: string): Promise<void> {
  await api.delete(`/shared-recipes/${id}`)
  invalidateSharedRecipes()
}

export async function getSharedRecipe(id: string): Promise<SharedRecipeDetail> {
  const r = await api.get<SharedRecipeDetail>(`/shared-recipes/${id}`)
  return r.data
}

/** 수정. 내용이 그대로면 서버가 changed:false 만 돌려주고 아무것도 안 바꾼다. */
export async function updateSharedRecipe(
  id: string,
  body: NewRecipe,
): Promise<{ changed: boolean; visibility: 'family' | 'public'; status: string }> {
  const r = await api.patch<{ changed: boolean; visibility: 'family' | 'public'; status: string }>(
    `/shared-recipes/${id}`,
    body,
  )
  invalidateSharedRecipes()
  return r.data
}

/** 개선 검토. 요리마다 시간당 1회 — 넘으면 429 와 남은 시간이 온다. */
export async function requestImprovement(id: string): Promise<{ notes: string[]; created_at: string }> {
  const r = await api.post<{ id: string; notes: string[]; created_at: string }>(
    `/shared-recipes/${id}/improve`,
  )
  return r.data
}

/** 공개 검토. reused:true 면 승인이 살아 있어서 Gemini 를 안 불렀다는 뜻. */
export async function publishRecipe(
  id: string,
): Promise<{ visibility: string; status: string; reused?: boolean; reason?: string }> {
  const r = await api.post<{ visibility: string; status: string; reused?: boolean; reason?: string }>(
    `/shared-recipes/${id}/publish`,
  )
  invalidateSharedRecipes()
  return r.data
}

/** 공개 내리기. 승인 기록은 남으므로 내용이 그대로면 다시 올릴 때 호출이 없다. */
export async function unpublishRecipe(id: string): Promise<{ visibility: string }> {
  const r = await api.post<{ visibility: string }>(`/shared-recipes/${id}/unpublish`)
  invalidateSharedRecipes()
  return r.data
}
