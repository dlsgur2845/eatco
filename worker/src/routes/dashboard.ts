import { Hono } from 'hono'
import { requireFamily } from '../lib/identity'
import { todayKst, daysBetween } from '../lib/dates'
import { shape, type IngredientRow } from './ingredients'
import type { Env, Vars } from '../lib/types'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

/**
 * 신선도 구간은 여기 한 곳에서만 정한다.
 * 예전에는 대시보드(<=1/<=3), 재고(<=0/<=3/<=7), 스캔결과(<=1/<=3) 가 각각 달라서
 * 같은 3일 남은 재료가 화면마다 다른 색으로 보였다.
 */
export function freshness(daysLeft: number): 'expired' | 'critical' | 'warning' | 'safe' {
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 1) return 'critical'
  if (daysLeft <= 3) return 'warning'
  return 'safe'
}

app.get('/summary', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const today = todayKst()
  const { results } = await c.env.DB.prepare(
    'SELECT expiry_date FROM ingredients WHERE family_id = ?',
  )
    .bind(familyId)
    .all<{ expiry_date: string }>()

  const counts = { expired: 0, critical: 0, warning: 0, safe: 0 }
  for (const r of results ?? []) counts[freshness(daysBetween(today, r.expiry_date))]++

  return c.json({
    total: (results ?? []).length,
    ...counts,
    // 기존 프론트 호환 필드
    urgent: counts.expired + counts.critical,
  })
})

app.get('/recent', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const limit = Math.min(Number(c.req.query('limit') || 10) || 10, 50)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM ingredients WHERE family_id = ? ORDER BY registered_at DESC LIMIT ?',
  )
    .bind(familyId, limit)
    .all<IngredientRow>()
  const today = todayKst()
  return c.json((results ?? []).map((r) => shape(r, today)))
})

/** 오늘 써야 할 것 — 대시보드의 핵심 목록. */
app.get('/urgent', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const today = todayKst()
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM ingredients WHERE family_id = ? ORDER BY expiry_date ASC',
  )
    .bind(familyId)
    .all<IngredientRow>()
  const items = (results ?? [])
    .map((r) => shape(r, today))
    .filter((r) => freshness(r.days_left) !== 'safe')
  return c.json(items)
})

export default app
