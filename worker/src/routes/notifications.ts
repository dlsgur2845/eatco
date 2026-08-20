import { Hono } from 'hono'
import { ApiError, readJson } from '../lib/errors'
import { requireFamily } from '../lib/identity'
import { nowIso } from '../lib/dates'
import type { Env, Vars } from '../lib/types'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

// ── 알림 기록 ────────────────────────────────────────────────
export const logs = new Hono<{ Bindings: Env; Variables: Vars }>()

logs.get('/', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const limit = Math.min(Number(c.req.query('limit') || 50) || 50, 200)
  const { results } = await c.env.DB.prepare(
    `SELECT id, type, title, message, is_read, link, days_before, created_at
       FROM notification_logs WHERE family_id = ?
      ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(familyId, limit)
    .all()
  return c.json(results ?? [])
})

logs.get('/unread-count', async (c) => {
  const user = c.get('user')
  if (!user.family_id) return c.json({ count: 0 })
  const row = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM notification_logs WHERE family_id = ? AND is_read = 0',
  )
    .bind(user.family_id)
    .first<{ count: number }>()
  return c.json({ count: row?.count ?? 0 })
})

/**
 * 프론트(`NotificationsPage.tsx:71`)는 PUT /:id/read 를 부르는데 라우트가 없었고,
 * `:82` 의 read-all 은 PUT 인데 여기는 POST 였다. 둘 다 `.catch(()=>{})` 로 삼켜져서
 * **안 읽은 뱃지가 영원히 지워지지 않았다.** 소비기한 알림이 이 앱의 존재 이유인데
 * 뱃지가 무의미해지면 아무도 알림을 열지 않는다.
 * 메서드는 양쪽 다 받는다 — 프론트를 고쳐도 구버전 캐시가 남을 수 있다.
 */
logs.put('/:id/read', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const res = await c.env.DB.prepare(
    'UPDATE notification_logs SET is_read = 1 WHERE id = ? AND family_id = ?',
  )
    .bind(c.req.param('id'), familyId)
    .run()
  if (!res.meta.changes) throw new ApiError(404, '알림을 찾을 수 없습니다.')
  return c.json({ read: true })
})

logs.on(['POST', 'PUT'], '/read-all', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const res = await c.env.DB.prepare(
    'UPDATE notification_logs SET is_read = 1 WHERE family_id = ? AND is_read = 0',
  )
    .bind(familyId)
    .run()
  return c.json({ updated: res.meta.changes })
})

// ── 알림 설정 / 푸시 구독 ─────────────────────────────────────
app.get('/settings', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const { results } = await c.env.DB.prepare(
    'SELECT id, days_before, enabled, push_time FROM notification_settings WHERE family_id = ? ORDER BY days_before',
  )
    .bind(familyId)
    .all()
  return c.json(results ?? [])
})

app.patch('/settings/:id', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const b = await readJson<{ enabled: boolean }>(c.req)
  if (b.enabled === undefined) throw new ApiError(422, '변경할 내용이 없습니다.')
  const res = await c.env.DB.prepare(
    'UPDATE notification_settings SET enabled = ? WHERE id = ? AND family_id = ?',
  )
    .bind(b.enabled ? 1 : 0, c.req.param('id'), familyId)
    .run()
  if (!res.meta.changes) throw new ApiError(404, '설정을 찾을 수 없습니다.')
  return c.json({ updated: true })
})

app.get('/push-time', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const row = await c.env.DB.prepare(
    'SELECT push_time FROM notification_settings WHERE family_id = ? LIMIT 1',
  )
    .bind(familyId)
    .first<{ push_time: string }>()
  return c.json({ push_time: row?.push_time ?? '09:00' })
})

app.patch('/push-time', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const b = await readJson<{ push_time: string }>(c.req)
  const t = String(b.push_time ?? '')
  if (!/^\d{2}:\d{2}$/.test(t)) throw new ApiError(422, '시간 형식은 HH:MM 이어야 합니다.')
  await c.env.DB.prepare('UPDATE notification_settings SET push_time = ? WHERE family_id = ?')
    .bind(t, familyId)
    .run()
  return c.json({ push_time: t })
})

app.get('/vapid-public-key', (c) => {
  if (!c.env.VAPID_PUBLIC_KEY) throw new ApiError(503, '푸시 알림이 설정되지 않았습니다.')
  return c.json({ public_key: c.env.VAPID_PUBLIC_KEY })
})

app.post('/push-subscription', async (c) => {
  const user = c.get('user')
  const familyId = requireFamily(user)
  const b = await readJson<{ endpoint: string; keys: { p256dh: string; auth: string } }>(c.req)
  const endpoint = String(b.endpoint ?? '')
  if (!endpoint || !b.keys?.p256dh || !b.keys?.auth) throw new ApiError(422, '구독 정보가 올바르지 않습니다.')

  const existing = await c.env.DB.prepare('SELECT id, family_id FROM push_subscriptions WHERE endpoint = ?')
    .bind(endpoint)
    .first<{ id: string; family_id: string }>()

  // 같은 가족 안에서의 재할당(공용 태블릿)은 허용, 다른 가족으로의 이동은 막는다.
  // 예전 코드는 소유자 확인 없이 덮어써서 남의 endpoint 를 아는 사람이 그 기기를
  // 자기 가족 알림 수신처로 바꿀 수 있었다.
  if (existing) {
    if (existing.family_id !== familyId) {
      throw new ApiError(409, '이 기기는 다른 가족에 등록되어 있습니다.')
    }
    await c.env.DB.prepare(
      'UPDATE push_subscriptions SET p256dh = ?, auth = ?, user_id = ? WHERE id = ?',
    )
      .bind(b.keys.p256dh, b.keys.auth, user.id, existing.id)
      .run()
    return c.json({ subscribed: true })
  }

  await c.env.DB.prepare(
    'INSERT INTO push_subscriptions (id, user_id, family_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), user.id, familyId, endpoint, b.keys.p256dh, b.keys.auth, nowIso())
    .run()
  return c.json({ subscribed: true }, 201)
})

app.delete('/push-subscription', async (c) => {
  const user = c.get('user')
  const b = await readJson<{ endpoint: string }>(c.req)
  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
    .bind(String(b.endpoint ?? ''), user.id)
    .run()
  return c.body(null, 204)
})

app.get('/push-subscription/status', async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?',
  )
    .bind(user.id)
    .first<{ count: number }>()
  return c.json({ subscribed: (row?.count ?? 0) > 0 })
})

export default app
