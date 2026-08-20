import { Hono } from 'hono'
import { ApiError } from '../lib/errors'
import { requireFamily } from '../lib/identity'
import { todayKst } from '../lib/dates'
import type { Env, Vars } from '../lib/types'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

/**
 * 가계부. Postgres 판은 func.to_char(registered_at,'YYYY-MM') 를 썼는데
 * SQLite/D1 에는 to_char 가 없다. strftime 으로 바꾼다 — 이게 D1 이전에서
 * 실제로 손봐야 했던 세 곳 중 하나다.
 */
const MONTH = "strftime('%Y-%m', registered_at)"

app.get('/monthly', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const months = Math.min(Math.max(Number(c.req.query('months') || 6) || 6, 1), 24)
  const { results } = await c.env.DB.prepare(
    `SELECT ${MONTH} AS month, SUM(price) AS total, COUNT(*) AS count
       FROM ingredients
      WHERE family_id = ? AND price IS NOT NULL
      GROUP BY month
      ORDER BY month DESC
      LIMIT ?`,
  )
    .bind(familyId, months)
    .all<{ month: string; total: number; count: number }>()
  // 차트는 오래된 달이 왼쪽이어야 한다.
  return c.json((results ?? []).reverse())
})

app.get('/budget', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const fam = await c.env.DB.prepare('SELECT monthly_budget FROM families WHERE id = ?')
    .bind(familyId)
    .first<{ monthly_budget: number | null }>()
  const thisMonth = todayKst().slice(0, 7)
  const spent = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(price), 0) AS spent FROM ingredients
      WHERE family_id = ? AND price IS NOT NULL AND ${MONTH} = ?`,
  )
    .bind(familyId, thisMonth)
    .first<{ spent: number }>()
  return c.json({
    monthly_budget: fam?.monthly_budget ?? null,
    spent_this_month: spent?.spent ?? 0,
  })
})

app.post('/budget', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const amount = Number(c.req.query('amount'))
  if (!Number.isFinite(amount) || amount < 0) throw new ApiError(422, '예산 금액이 올바르지 않습니다.')
  await c.env.DB.prepare('UPDATE families SET monthly_budget = ? WHERE id = ?')
    .bind(Math.trunc(amount), familyId)
    .run()
  return c.json({ monthly_budget: Math.trunc(amount) })
})

/** 물가 알림 — 같은 재료의 최근 가격이 예전보다 크게 올랐을 때. */
app.get('/alerts', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const { results } = await c.env.DB.prepare(
    `SELECT COALESCE(normalized_name, name) AS name, price, registered_at
       FROM ingredients
      WHERE family_id = ? AND price IS NOT NULL
      ORDER BY registered_at ASC`,
  )
    .bind(familyId)
    .all<{ name: string; price: number; registered_at: string }>()

  const byName = new Map<string, { price: number }[]>()
  for (const r of results ?? []) {
    if (!byName.has(r.name)) byName.set(r.name, [])
    byName.get(r.name)!.push({ price: r.price })
  }

  const alerts: { name: string; current_price: number; old_price: number; change_pct: number }[] = []
  for (const [name, rows] of byName) {
    if (rows.length < 2) continue
    const oldest = rows[0].price
    const latest = rows[rows.length - 1].price
    if (!oldest) continue
    const pct = Math.round(((latest - oldest) / oldest) * 100)
    if (pct >= 15) alerts.push({ name, current_price: latest, old_price: oldest, change_pct: pct })
  }
  alerts.sort((a, b) => b.change_pct - a.change_pct)
  return c.json(alerts.slice(0, 10))
})

app.get('/suggest-items', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const q = (c.req.query('q') || '').trim()
  let sql = `SELECT DISTINCT COALESCE(normalized_name, name) AS name
               FROM ingredients WHERE family_id = ? AND price IS NOT NULL`
  const binds: unknown[] = [familyId]
  if (q) {
    sql += ' AND (name LIKE ? OR normalized_name LIKE ?)'
    binds.push(`%${q}%`, `%${q}%`)
  }
  sql += ' ORDER BY name LIMIT 50'
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all<{ name: string }>()
  return c.json((results ?? []).map((r) => r.name))
})

app.get('/by-item', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const name = (c.req.query('name') || '').trim()
  if (!name) return c.json([])
  const { results } = await c.env.DB.prepare(
    `SELECT date(registered_at) AS date, price, store_name, quantity, name
       FROM ingredients
      WHERE family_id = ? AND price IS NOT NULL
        AND (name = ? OR normalized_name = ? OR name LIKE ? OR normalized_name LIKE ?)
      ORDER BY registered_at ASC
      LIMIT 200`,
  )
    .bind(familyId, name, name, `%${name}%`, `%${name}%`)
    .all()
  return c.json(results ?? [])
})

app.get('/compare', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const name = (c.req.query('name') || '').trim()
  if (!name) return c.json([])
  const { results } = await c.env.DB.prepare(
    `SELECT store_name,
            price AS latest_price,
            date(MAX(registered_at)) AS latest_date
       FROM ingredients
      WHERE family_id = ? AND price IS NOT NULL AND store_name IS NOT NULL
        AND (name = ? OR normalized_name = ? OR name LIKE ? OR normalized_name LIKE ?)
      GROUP BY store_name
      ORDER BY latest_price ASC`,
  )
    .bind(familyId, name, name, `%${name}%`, `%${name}%`)
    .all()
  return c.json(results ?? [])
})

export default app
