export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  UPLOADS: R2Bucket

  // Secrets (wrangler secret put)
  GEMINI_API_KEY?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_CLAIM_EMAIL?: string
  RECIPE_API_KEY?: string
  SECRET_KEY?: string
  DATA_GO_KR_API_KEY?: string

  // Vars
  GEMINI_MODELS_VISION?: string
  GEMINI_MODELS_FAST?: string
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  /** "1" 이면 Access 헤더 없이도 DEV_EMAIL 로 동작. 프로덕션에서 절대 켜지 말 것. */
  ALLOW_INSECURE_DEV?: string
  DEV_EMAIL?: string
}

export interface User {
  id: string
  email: string
  nickname: string
  family_id: string | null
}

export type Vars = { user: User }
