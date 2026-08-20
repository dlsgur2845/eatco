import { Hono } from 'hono'
import { ApiError, readJson } from '../lib/errors'
import { nowIso } from '../lib/dates'
import type { Env, Vars } from '../lib/types'
import { hashPassword, verifyPassword } from '../lib/password'
import { createSession, sessionCookie, clearCookie } from '../lib/session'
import { uniqueInviteCode, notificationSettingStatements, createSoloFamily } from '../lib/family'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

/**
 * 비밀번호 인증. 이 경로들만 미들웨어 앞에서 열려 있다 (index.ts 참조).
 *
 * Cloudflare Access 를 앞에 두면 이쪽은 안 쓰이고 Access 신원이 우선한다.
 * Access 없이도 앱이 동작해야 해서 자체 인증을 둔다 —
 * PBKDF2-SHA256 100,000회(Workers 플랫폼 상한, 무료 CPU 예산 안에서 실측 확인).
 */
export const publicAuth = new Hono<{ Bindings: Env; Variables: Vars }>()

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

publicAuth.post('/register', async (c) => {
  const b = await readJson<{ email: string; nickname: string; password: string }>(c.req)
  const email = String(b.email ?? '').trim().toLowerCase()
  const nickname = String(b.nickname ?? '').trim()
  const password = String(b.password ?? '')

  if (!EMAIL_RE.test(email)) throw new ApiError(422, '이메일 형식이 올바르지 않습니다.')
  if (!nickname) throw new ApiError(422, '이름을 입력해주세요.')
  if (password.length < 8) throw new ApiError(422, '비밀번호는 8자 이상이어야 합니다.')
  if (password.length > 200) throw new ApiError(422, '비밀번호가 너무 깁니다.')

  const dup = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()
  if (dup) throw new ApiError(409, '이미 가입된 이메일입니다.')

  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, nickname, hashed_password, family_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
  )
    .bind(id, email, nickname.slice(0, 50), await hashPassword(password), nowIso())
    .run()

  // 기존 FastAPI register 와 동일하게 1인 가족을 같이 만든다.
  // 안 만들면 가입 직후 가족 스코프 엔드포인트가 전부 400 이고,
  // 프론트에는 가족 생성 온보딩 화면이 없다.
  const familyId = await createSoloFamily(c.env.DB, id, nickname.slice(0, 50))

  c.header('Set-Cookie', sessionCookie(await createSession(c.env, id)))
  return c.json({ id, email, nickname, family_id: familyId }, 201)
})

publicAuth.post('/login', async (c) => {
  const b = await readJson<{ email: string; password: string }>(c.req)
  const email = String(b.email ?? '').trim().toLowerCase()
  const password = String(b.password ?? '')

  const user = await c.env.DB
    .prepare('SELECT id, email, nickname, family_id, hashed_password FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; email: string; nickname: string; family_id: string | null; hashed_password: string }>()

  // 이메일 존재 여부를 메시지로 구분하지 않는다 (사용자 열거 방지).
  const ok = user ? await verifyPassword(password, user.hashed_password) : false
  if (!user || !ok) throw new ApiError(401, '이메일 또는 비밀번호가 올바르지 않습니다.')

  c.header('Set-Cookie', sessionCookie(await createSession(c.env, user.id)))
  return c.json({ id: user.id, email: user.email, nickname: user.nickname, family_id: user.family_id })
})

publicAuth.post('/logout', (c) => {
  c.header('Set-Cookie', clearCookie())
  return c.json({ ok: true })
})

app.get('/me', (c) => c.json(c.get('user')))

app.patch('/family/settings', async (c) => {
  const user = c.get('user')
  const famId = user.family_id
  if (!famId) throw new ApiError(400, '가족 그룹에 속해 있지 않습니다.')
  const b = await readJson<{ name: string; allow_shared_edit: boolean; monthly_budget: number | null }>(c.req)
  const sets: string[] = []
  const binds: unknown[] = []
  if (b.name !== undefined) { sets.push('name = ?'); binds.push(String(b.name).slice(0, 100)) }
  if (b.allow_shared_edit !== undefined) { sets.push('allow_shared_edit = ?'); binds.push(b.allow_shared_edit ? 1 : 0) }
  if (b.monthly_budget !== undefined) {
    sets.push('monthly_budget = ?')
    binds.push(b.monthly_budget == null ? null : Math.trunc(Number(b.monthly_budget)))
  }
  if (!sets.length) throw new ApiError(422, '변경할 내용이 없습니다.')
  binds.push(famId)
  await c.env.DB.prepare(`UPDATE families SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  const fam = await c.env.DB.prepare('SELECT * FROM families WHERE id = ?').bind(famId).first()
  return c.json(fam)
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
  const code = await uniqueInviteCode(c.env.DB)

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO families (id, name, invite_code, allow_shared_edit, created_at, master_id) VALUES (?, ?, ?, 1, ?, ?)',
    ).bind(id, name, code, nowIso(), user.id),
    c.env.DB.prepare('UPDATE users SET family_id = ? WHERE id = ?').bind(id, user.id),
    ...notificationSettingStatements(c.env.DB, id),
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

// 와일드카드는 반드시 구체 경로들보다 뒤에 둔다.
// 먼저 등록하면 /family/members 나 /family/settings 를 :id 로 삼켜버린다.
app.get('/family/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  // 남의 가족 정보를 id 만 알면 볼 수 있으면 안 된다.
  if (user.family_id !== id) throw new ApiError(403, '접근 권한이 없습니다.')
  const fam = await c.env.DB.prepare(
    'SELECT id, name, invite_code, allow_shared_edit, monthly_budget, master_id FROM families WHERE id = ?',
  )
    .bind(id)
    .first()
  if (!fam) throw new ApiError(404, '가족을 찾을 수 없습니다.')
  return c.json(fam)
})

export default app
