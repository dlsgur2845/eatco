import { Hono } from 'hono'
import { ApiError, readJson } from '../lib/errors'
import { nowIso } from '../lib/dates'
import type { Env, Vars } from '../lib/types'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

/** 초대코드. 예전 구현은 token_urlsafe(8).upper() 라 base64url 62심볼을 36으로
 *  접어서 엔트로피가 ~64bit -> ~40bit 로 떨어지고, 이어지는 replace 로 길이가
 *  8보다 짧아질 수도 있었다. 처음부터 대문자+숫자 알파벳에서 균등하게 뽑는다. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 0/O/1/I 제외
function inviteCode(len = 8): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

app.get('/me', async (c) => {
  const user = c.get('user')
  let family: unknown = null
  if (user.family_id) {
    family = await c.env.DB.prepare(
      'SELECT id, name, invite_code, allow_shared_edit, monthly_budget, master_id FROM families WHERE id = ?',
    )
      .bind(user.family_id)
      .first()
  }
  return c.json({ user, family })
})

app.patch('/me', async (c) => {
  const user = c.get('user')
  const body = await readJson<{ nickname: string }>(c.req)
  const nickname = (body.nickname || '').trim()
  if (!nickname) throw new ApiError(422, '이름을 입력해주세요.')
  if (nickname.length > 50) throw new ApiError(422, '이름은 50자 이내로 입력해주세요.')
  await c.env.DB.prepare('UPDATE users SET nickname = ? WHERE id = ?').bind(nickname, user.id).run()
  return c.json({ ...user, nickname })
})

app.post('/family', async (c) => {
  const user = c.get('user')
  if (user.family_id) throw new ApiError(409, '이미 가족 그룹에 속해 있습니다.')
  const body = await readJson<{ name: string }>(c.req)
  const name = (body.name || '우리집').trim().slice(0, 100)

  const id = crypto.randomUUID()
  // invite_code 는 UNIQUE. 충돌하면 몇 번 다시 뽑는다.
  let code = ''
  for (let i = 0; i < 5; i++) {
    code = inviteCode()
    const dup = await c.env.DB.prepare('SELECT 1 FROM families WHERE invite_code = ?').bind(code).first()
    if (!dup) break
    code = ''
  }
  if (!code) throw new ApiError(503, '초대코드 생성에 실패했습니다. 다시 시도해주세요.')

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO families (id, name, invite_code, allow_shared_edit, created_at, master_id) VALUES (?, ?, ?, 1, ?, ?)',
    ).bind(id, name, code, nowIso(), user.id),
    c.env.DB.prepare('UPDATE users SET family_id = ? WHERE id = ?').bind(id, user.id),
    ...defaultNotificationSettings(c.env.DB, id),
  ])

  return c.json({ id, name, invite_code: code, allow_shared_edit: true, master_id: user.id }, 201)
})

app.post('/family/join', async (c) => {
  const user = c.get('user')
  if (user.family_id) throw new ApiError(409, '이미 가족 그룹에 속해 있습니다.')
  const body = await readJson<{ invite_code: string }>(c.req)
  const code = (body.invite_code || '').trim().toUpperCase()
  if (!code) throw new ApiError(422, '초대코드를 입력해주세요.')

  const fam = await c.env.DB.prepare('SELECT id, name FROM families WHERE invite_code = ?')
    .bind(code)
    .first<{ id: string; name: string }>()
  if (!fam) throw new ApiError(404, '초대코드를 찾을 수 없습니다.')

  await c.env.DB.prepare('UPDATE users SET family_id = ? WHERE id = ?').bind(fam.id, user.id).run()
  return c.json({ id: fam.id, name: fam.name })
})

app.get('/family/members', async (c) => {
  const user = c.get('user')
  if (!user.family_id) return c.json([])
  const rows = await c.env.DB.prepare(
    'SELECT id, email, nickname, created_at FROM users WHERE family_id = ? ORDER BY created_at ASC',
  )
    .bind(user.family_id)
    .all()
  return c.json(rows.results ?? [])
})

app.post('/family/leave', async (c) => {
  const user = c.get('user')
  if (!user.family_id) throw new ApiError(400, '가족 그룹에 속해 있지 않습니다.')
  const famId = user.family_id

  await c.env.DB.prepare('UPDATE users SET family_id = NULL WHERE id = ?').bind(user.id).run()

  // 마스터가 나가면 남은 멤버 중 가장 오래된 사람에게 넘긴다 (기존 동작 유지).
  const fam = await c.env.DB.prepare('SELECT master_id FROM families WHERE id = ?')
    .bind(famId)
    .first<{ master_id: string | null }>()
  if (fam?.master_id === user.id) {
    const next = await c.env.DB.prepare(
      'SELECT id FROM users WHERE family_id = ? ORDER BY created_at ASC LIMIT 1',
    )
      .bind(famId)
      .first<{ id: string }>()
    await c.env.DB.prepare('UPDATE families SET master_id = ? WHERE id = ?')
      .bind(next?.id ?? null, famId)
      .run()
  }
  return c.json({ left: true })
})

/** 가족 생성 시 기본 알림 설정 8개. 기존 seed 와 동일한 days_before 집합. */
function defaultNotificationSettings(db: D1Database, familyId: string) {
  // backend/app/seed.py 의 DEFAULT_NOTIFICATION_DAYS 와 동일하게 유지
  const daysSet = [0, 1, 3, 5, 7, 14, 21, 30]
  return daysSet.map((d) =>
    db
      .prepare(
        'INSERT INTO notification_settings (id, family_id, days_before, enabled, push_time) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(crypto.randomUUID(), familyId, d, d <= 3 ? 1 : 0, '09:00'),
  )
}

export default app
