export type StorageMethod = 'refrigerated' | 'frozen' | 'room_temp'

export type IngredientUnit = 'g' | 'ml' | 'piece'

export const UNIT_LABEL: Record<IngredientUnit, string> = {
  g: 'g',
  ml: 'ml',
  piece: '개',
}

export interface Ingredient {
  id: string
  name: string
  category_id: string | null
  storage_method: StorageMethod
  quantity: string | null
  amount_value: number | null
  unit: IngredientUnit | null
  price: number | null
  expiry_date: string
  registered_at: string
  image_url: string | null
  family_id: string | null
  store_name: string | null
  normalized_name: string | null
}

export type Role = 'admin' | 'member'

export interface User {
  id: string
  email: string
  nickname: string
  family_id: string | null
  created_at: string
  /** 'admin' 이면 /admin 접근 가능. 서버가 진짜 게이트고 이건 메뉴 표시용이다. */
  role: Role
}

export interface Family {
  id: string
  name: string
  invite_code: string
  allow_shared_edit: boolean
  master_id: string | null
  created_at: string
  members: User[]
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface Category {
  id: string
  name: string
}

export interface DashboardSummary {
  critical: number
  warning: number
  safe: number
}

export interface NotificationSetting {
  id: string
  family_id: string | null
  days_before: number
  enabled: boolean
  push_time: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface IngredientCreate {
  name: string
  category_id?: string
  storage_method: StorageMethod
  quantity?: string | null
  amount_value?: number | null
  unit?: IngredientUnit | null
  expiry_date: string
  image_url?: string
  price?: number
  store_name?: string
}


/* ── 관리자 화면 ─────────────────────────────────────────── */

export interface AdminStats {
  users: number
  admins: number
  families: number
  ingredients: number
  usage_events: number
}

export interface AdminUser {
  id: string
  email: string
  nickname: string
  role: Role
  created_at: string
  family_id: string | null
  family_name: string | null
  /** SQLite 는 불리언이 없다. 0/1 로 온다. */
  is_family_master: number | null
  ingredient_count: number
  /** 가입 승인 여부. 0 이면 로그인이 막혀 있다. */
  approved: number
}

export interface AdminFamily {
  id: string
  name: string
  invite_code: string
  allow_shared_edit: number
  monthly_budget: number | null
  created_at: string
  master_id: string | null
  master_nickname: string | null
  member_count: number
  ingredient_count: number
}

/* ── 가족 식단 캘린더 ────────────────────────────────────── */

export type MealSlot = 'breakfast' | 'lunch' | 'dinner'

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
}

export interface MealPlan {
  id: string
  family_id: string
  plan_date: string
  meal_slot: MealSlot
  title: string
  memo: string | null
  created_by: string | null
  /** 이름 스냅샷. 계정이 지워져도 누가 적었는지는 남는다. */
  created_by_name: string
  created_at: string
  comment_count?: number
  /** 붙은 레시피 기준 부족한 재료 수. **레시피가 없으면 아예 안 온다.**
      0 은 "재료가 다 있다" 는 뜻이라 undefined 와 구분해야 한다. */
  missing_count?: number
  recipe_source?: string | null
  recipe_id?: string | null
}

/**
 * 식단에 붙은 레시피.
 *
 * 서버가 저장하는 건 재료 목록뿐이고, matched/missing 은 **화면을 열 때마다
 * 지금 냉장고로 다시 계산해서** 보낸다. 장을 보면 다음에 열 때 부족 목록에서
 * 빠진다. 그래서 이 값을 클라이언트가 캐시하면 안 된다.
 */
export interface MealPlanRecipe {
  source: 'foodsafety' | 'custom'
  id: string
  ingredients: string[]
  match_count: number
  total_ingredients: number
  match_ratio: number
  matched_items: string[]
  missing_items: string[]
  urgent_used: string[]
}

export interface MealComment {
  id: string
  body: string
  created_by: string | null
  created_by_name: string
  created_at: string
}

export interface MealPlanDetail extends MealPlan {
  comments: MealComment[]
  /** 레시피를 안 붙였으면 null. 서버가 항상 이 키를 보낸다. */
  recipe: MealPlanRecipe | null
}
