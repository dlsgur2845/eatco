export type StorageMethod = 'refrigerated' | 'frozen' | 'room_temp'

export interface Ingredient {
  id: string
  name: string
  category_id: string | null
  storage_method: StorageMethod
  quantity: number
  expiry_date: string
  registered_at: string
  image_url: string | null
  family_id: string | null
}

export interface User {
  id: string
  email: string
  nickname: string
  family_id: string | null
  created_at: string
}

export interface Family {
  id: string
  name: string
  invite_code: string
  allow_shared_edit: boolean
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
  days_before: number
  enabled: boolean
  push_time: string
}

export interface IngredientCreate {
  name: string
  category_id?: string
  storage_method: StorageMethod
  quantity: number
  expiry_date: string
  image_url?: string
}
