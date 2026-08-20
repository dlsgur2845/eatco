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

export interface IngredientNutrition {
  normalized_name: string
  kcal_per_100g: number | null
  kcal_per_100ml: number | null
  kcal_per_piece: number | null
  source: 'official' | 'user' | 'gemini'
  confidence: number
}

export interface CookingLogItem {
  id: string
  ingredient_id: string | null
  ingredient_name_snapshot: string
  amount_used: number
  unit: IngredientUnit
  kcal: number
  kcal_per_unit: number | null
  nutrition_source: string | null
}

export interface CookingLog {
  id: string
  family_id: string
  recipe_id: string | null
  recipe_name_snapshot: string
  cooked_by: string | null
  cooked_at: string
  total_kcal: number
  items: CookingLogItem[]
}

export interface CookingLogCreate {
  recipe_id?: string | null
  recipe_name: string
  cooked_by?: string
  items: {
    ingredient_id: string
    amount_used: number
    unit: string
  }[]
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
  nutrition_cache: number
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
