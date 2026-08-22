import { Hono } from 'hono'
import { ApiError, readJson } from '../lib/errors'
import { nowIso } from '../lib/dates'
import type { Env, Vars } from '../lib/types'
import { hashPassword, verifyPassword } from '../lib/password'
import { createSession, sessionCookie, clearCookie } from '../lib/session'
import { uniqueInviteCode, notificationSettingStatements, createSoloFamily, consumeInviteCode, rotateInviteCode } from '../lib/family'
import { roleForNewUser, requireFamily } from '../lib/identity'

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
  const b = await readJson<{ email: string; nickname: string; password: string; invite_code?: string }>(c.req)
  const email = String(b.email ?? '').trim().toLowerCase()
  const nickname = String(b.nickname ?? '').trim()
  const password = String(b.password ?? '')
  const invite = String(b.invite_code ?? '').trim().toUpperCase()

  if (!EMAIL_RE.test(email)) throw new ApiError(422, '이메일 형식이 올바르지 않습니다.')
  if (!nickname) throw new ApiError(422, '이름을 입력해주세요.')
  if (password.length < 8) throw new ApiError(422, '비밀번호는 8자 이상이어야 합니다.')
  if (password.length > 200) throw new ApiError(422, '비밀번호가 너무 깁니다.')

  const dup = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()
  if (dup) throw new ApiError(409, '이미 가입된 이메일입니다.')

  const id = crypto.randomUUID()
  // 첫 가입자는 관리자 1호. 판정은 INSERT 직전에 한다.
  const role = await roleForNewUser(c.env.DB)

  /* 초대 링크로 온 가입이면 코드를 **먼저** 소비한다.
   *
   * 계정을 만들고 나서 코드를 확인하면, 이미 쓰인 링크로 가입했을 때
   * 승인 대기 계정만 덩그러니 남는다. 순서를 뒤집어서 코드가 죽었으면
   * 계정을 아예 안 만든다.
   *
   * 소비에 성공하면 **관리자 승인을 건너뛴다.** 가족 구성원이 보낸 초대
   * 자체를 인가로 본다는 결정이다. 링크가 일회용이라 성립한다 — 새어나간
   * 링크도 한 번밖에 못 쓰고, 쓰이는 순간 코드가 바뀌며, 가족 화면에
   * 모르는 사람이 나타나므로 들킨다. */
  let invitedFamily: { id: string; name: string } | null = null
  if (invite) {
    invitedFamily = await consumeInviteCode(c.env.DB, invite)
    if (!invitedFamily) {
      throw new ApiError(409, '이미 사용됐거나 만료된 초대 링크예요. 가족에게 새 링크를 요청해주세요.')
    }
  }

  // 가입 승인제. 예전엔 URL 만 알면 누구나 계정을 만들고 바로 들어왔다.
  // 관리자 1호는 승인해줄 사람이 없으므로 자동 승인한다 — 안 그러면 아무도 못 들어온다.
  // 초대 링크로 온 사람도 자동 승인이다 (위 주석 참고).
  const approved = role === 'admin' || invitedFamily ? 1 : 0
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, nickname, hashed_password, family_id, created_at, role, approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, email, nickname.slice(0, 50), await hashPassword(password), invitedFamily?.id ?? null, nowIso(), role, approved)
    .run()

  // 초대로 들어왔으면 가족이 이미 정해졌다. 1인 가족을 만들지 않는다.
  if (invitedFamily) {
    c.header('Set-Cookie', sessionCookie(await createSession(c.env, id)))
    return c.json(
      { id, email, nickname, family_id: invitedFamily.id, family_name: invitedFamily.name, role, approved: true },
      201,
    )
  }

  // 승인 대기 상태면 여기서 끝낸다.
  //
  // 세션을 주지 않는다 — 쿠키를 주면 들어와서 화면을 돌아다닌다.
  // **가족도 만들지 않는다.** createSoloFamily 는 families 1행 + 알림 설정 8행,
  // 합쳐서 9번의 D1 쓰기다. 가입 자체는 여전히 누구나 할 수 있으므로(막는 건
  // 로그인이다), 미승인 가입마다 9행씩 쌓으면 그것만으로 무료 티어 쓰기 한도
  // (10만/일)를 갉아먹고 고아 가족이 관리자 목록에 쌓인다. 실제로 배포 확인용
  // 계정 하나가 고아 가족 + 알림 설정 8행을 남겼고, 손으로 지워야 했다.
  //
  // 승인된 뒤 첫 요청에서 identity.ts 의 withFamily() 가 만들어준다.
  // 그게 원래 "가족 없는 사용자를 신원 확정 지점 한 곳에서 구제한다" 는 설계다.
  if (!approved) {
    return c.json(
      { id, email, nickname, approved: false, message: '가입 신청이 접수됐어요. 관리자 승인 후 이용할 수 있어요.' },
      201,
    )
  }

  // 승인된 경우(= 관리자 1호)에만 즉시 만든다. 안 만들면 가입 직후 가족 스코프
  // 엔드포인트가 전부 400 이고, 프론트에는 가족 생성 온보딩 화면이 없다.
  const familyId = await createSoloFamily(c.env.DB, id, nickname.slice(0, 50))
  c.header('Set-Cookie', sessionCookie(await createSession(c.env, id)))
  return c.json({ id, email, nickname, family_id: familyId, role, approved: true }, 201)
})

/* 초대 링크 미리보기. **소비하지 않는다.**
 *
 * 링크를 연 사람에게 "OO 가족에 참여할까요?" 를 보여주려면 가족 이름이
 * 필요한데, 이름을 얻자고 코드를 태우면 확인 화면을 띄우는 것만으로 링크가
 * 죽는다. 조회와 소비를 갈라놓는다.
 *
 * 인증이 없는 엔드포인트다. 내보내는 건 가족 이름 하나뿐이고, 코드는 32^8
 * (약 1조) 이라 이름을 캐려고 훑는 건 현실성이 없다. 그래도 존재 여부만
 * 답하고 다른 건 아무것도 붙이지 않는다. */
publicAuth.get('/family/invite/:code', async (c) => {
  const code = (c.req.param('code') || '').trim().toUpperCase()
  if (!code) throw new ApiError(422, '초대 코드가 없습니다.')
  const fam = await c.env.DB.prepare('SELECT name FROM families WHERE invite_code = ?')
    .bind(code)
    .first<{ name: string }>()
  if (!fam) throw new ApiError(404, '이미 사용됐거나 만료된 초대 링크예요.')
  return c.json({ family_name: fam.name })
})

publicAuth.post('/login', async (c) => {
  const b = await readJson<{ email: string; password: string }>(c.req)
  const email = String(b.email ?? '').trim().toLowerCase()
  const password = String(b.password ?? '')

  const user = await c.env.DB
    .prepare('SELECT id, email, nickname, family_id, role, approved, hashed_password FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; email: string; nickname: string; family_id: string | null; role: 'admin' | 'member'; approved: number; hashed_password: string }>()

  // 이메일 존재 여부를 메시지로 구분하지 않는다 (사용자 열거 방지).
  const ok = user ? await verifyPassword(password, user.hashed_password) : false
  if (!user || !ok) throw new ApiError(401, '이메일 또는 비밀번호가 올바르지 않습니다.')

  // 비밀번호 검증 **뒤에** 승인 여부를 본다. 순서를 뒤집으면 아무 이메일이나 넣어보고
  // "승인 대기" 응답이 오는지로 가입 여부를 알아낼 수 있다.
  if (!user.approved) {
    throw new ApiError(403, '아직 승인되지 않은 계정이에요. 관리자 승인 후 이용할 수 있어요.')
  }

  c.header('Set-Cookie', sessionCookie(await createSession(c.env, user.id)))
  return c.json({ id: user.id, email: user.email, nickname: user.nickname, family_id: user.family_id, role: user.role })
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

/**
 * 초대코드로 가족 합류. **가족 이동이지 최초 가입이 아니다.**
 *
 * 예전에는 `if (user.family_id) throw 409` 가 맨 앞에 있었다. 그런데
 * requireUser 의 withFamily 가 가족 없는 사용자에게 1인 가족을 즉시
 * 만들어준다. 탈퇴하면 바로 다음 요청에서 새 가족이 생기므로
 * **user.family_id 는 항상 값이 있고, 아무도 합류할 수 없었다.**
 * 초대코드 기능 전체가 죽어 있었다.
 *
 * 프론트도 원래 이동을 의도했다 — FamilyPage 에 "참여 시 현재 가족에서
 * 탈퇴됩니다" 라고 적혀 있다. 409 쪽이 틀렸다.
 */
app.post('/family/join', async (c) => {
  const user = c.get('user')
  const body = await readJson<{ invite_code: string }>(c.req)
  const code = (body.invite_code || '').trim().toUpperCase()
  if (!code) throw new ApiError(422, '초대코드를 입력해주세요.')

  /* 내 가족의 코드인지 **먼저** 본다. 소비부터 하면 "이미 이 가족" 으로
     튕기면서도 코드는 이미 갈려버려서, 아무 일도 안 했는데 남들 링크만 죽는다. */
  const mine = user.family_id
    ? await c.env.DB.prepare('SELECT invite_code FROM families WHERE id = ?')
        .bind(user.family_id)
        .first<{ invite_code: string }>()
    : null
  if (mine?.invite_code === code) throw new ApiError(409, '이미 이 가족에 속해 있습니다.')

  // 소비 = 확인 + 코드 교체를 한 번에. 링크는 일회용이다.
  const fam = await consumeInviteCode(c.env.DB, code)
  if (!fam) throw new ApiError(409, '이미 사용됐거나 만료된 초대 링크예요. 가족에게 새 링크를 요청해주세요.')
  if (fam.id === user.family_id) throw new ApiError(409, '이미 이 가족에 속해 있습니다.')

  const prev = user.family_id
  const stmts: D1PreparedStatement[] = []

  if (prev) {
    // 마스터였다면 남은 사람 중 가장 오래된 계정에게 넘긴다.
    // 안 넘기면 master_id 가 떠난 사람을 계속 가리킨다.
    const prevFam = await c.env.DB.prepare('SELECT master_id FROM families WHERE id = ?')
      .bind(prev)
      .first<{ master_id: string | null }>()
    const others = await c.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM users WHERE family_id = ? AND id != ?',
    )
      .bind(prev, user.id)
      .first<{ n: number }>()
    const remaining = others?.n ?? 0

    if (prevFam?.master_id === user.id) {
      const next = await c.env.DB.prepare(
        'SELECT id FROM users WHERE family_id = ? AND id != ? ORDER BY created_at ASC LIMIT 1',
      )
        .bind(prev, user.id)
        .first<{ id: string }>()
      stmts.push(
        c.env.DB.prepare('UPDATE families SET master_id = ? WHERE id = ?').bind(next?.id ?? null, prev),
      )
    }

    // 나 혼자였고 아무것도 안 담긴 가족이면 흔적을 남기지 않는다.
    // 재료가 하나라도 있으면 남긴다 — 데이터를 조용히 지우지 않는다.
    if (remaining === 0) {
      const items = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM ingredients WHERE family_id = ?')
        .bind(prev)
        .first<{ n: number }>()
      if ((items?.n ?? 0) === 0) {
        stmts.push(
          c.env.DB.prepare('DELETE FROM meal_comments WHERE family_id = ?').bind(prev),
          c.env.DB.prepare('DELETE FROM meal_plans WHERE family_id = ?').bind(prev),
          c.env.DB.prepare('DELETE FROM notification_logs WHERE family_id = ?').bind(prev),
          c.env.DB.prepare('DELETE FROM notification_settings WHERE family_id = ?').bind(prev),
          c.env.DB.prepare('DELETE FROM push_subscriptions WHERE family_id = ?').bind(prev),
          c.env.DB.prepare('UPDATE families SET master_id = NULL WHERE id = ?').bind(prev),
        )
      }
    }
  }

  stmts.push(c.env.DB.prepare('UPDATE users SET family_id = ? WHERE id = ?').bind(fam.id, user.id))

  // 빈 가족 삭제는 users 를 옮긴 뒤에 해야 FK 가 안 깨진다.
  if (prev) {
    const items = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM ingredients WHERE family_id = ?')
      .bind(prev)
      .first<{ n: number }>()
    const others = await c.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM users WHERE family_id = ? AND id != ?',
    )
      .bind(prev, user.id)
      .first<{ n: number }>()
    if ((others?.n ?? 0) === 0 && (items?.n ?? 0) === 0) {
      stmts.push(c.env.DB.prepare('DELETE FROM families WHERE id = ?').bind(prev))
    }
  }

  await c.env.DB.batch(stmts)

  /* 떠나온 가족이 살아남았다면 그쪽 코드도 돌린다. 구성원이 줄었으므로
     "가족이 변경될 때마다" 에 해당한다. 삭제된 가족은 돌릴 게 없다. */
  if (prev && prev !== fam.id) {
    const still = await c.env.DB.prepare('SELECT 1 FROM families WHERE id = ?').bind(prev).first()
    if (still) await rotateInviteCode(c.env.DB, prev)
  }

  return c.json({ id: fam.id, name: fam.name })
})

app.get('/family/members', async (c) => {
  const user = c.get('user')
  if (!user.family_id) return c.json([])
  const rows = await c.env.DB.prepare(
    'SELECT id, email, nickname, role, created_at FROM users WHERE family_id = ? ORDER BY created_at ASC',
  )
    .bind(user.family_id)
    .all()
  return c.json(rows.results ?? [])
})

/* 초대 링크 새로 만들기 (방장 전용).
 *
 * 자동 회전은 누군가 합류·탈퇴했을 때만 돈다. 아직 아무도 안 쓴 채로 새어나간
 * 링크는 그 조건에 안 걸려서 계속 살아 있다. 잘못 공유했을 때 되돌릴 수단은
 * 이것뿐이다. */
app.post('/family/invite/rotate', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)
  const fam = await c.env.DB.prepare('SELECT master_id FROM families WHERE id = ?')
    .bind(famId)
    .first<{ master_id: string | null }>()
  if (fam?.master_id !== user.id) throw new ApiError(403, '가족 마스터만 새 링크를 만들 수 있습니다.')
  const code = await rotateInviteCode(c.env.DB, famId)
  return c.json({ invite_code: code })
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
  // 구성원이 줄었다. 옛 링크를 죽인다.
  await rotateInviteCode(c.env.DB, famId)

  return c.json({ left: true })
})

app.post('/family/kick/:id', async (c) => {
  const user = c.get('user')
  const famId = user.family_id
  if (!famId) throw new ApiError(400, '가족 그룹에 속해 있지 않습니다.')

  const fam = await c.env.DB.prepare('SELECT master_id FROM families WHERE id = ?')
    .bind(famId)
    .first<{ master_id: string | null }>()
  if (fam?.master_id !== user.id) throw new ApiError(403, '가족 마스터만 내보낼 수 있습니다.')

  const targetId = c.req.param('id')
  if (targetId === user.id) throw new ApiError(422, '자기 자신은 내보낼 수 없습니다.')

  const res = await c.env.DB.prepare(
    'UPDATE users SET family_id = NULL WHERE id = ? AND family_id = ?',
  )
    .bind(targetId, famId)
    .run()
  if (!res.meta.changes) throw new ApiError(404, '해당 구성원을 찾을 수 없습니다.')
  // 내보냈으면 그 사람이 가진 링크도 죽어야 한다.
  await rotateInviteCode(c.env.DB, famId)

  return c.json({ kicked: true })
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

  // members 를 같이 준다. FamilyPage 가 family.members.map 을 도는데 이 키가
  // 없어서 가족 화면이 통째로 흰 화면이었다. 별도 호출로 나누면 화면이
  // 두 번 껌뻑이고, 어차피 같은 가족 한 건이라 여기서 합쳐 보낸다.
  const members = await c.env.DB.prepare(
    'SELECT id, email, nickname, role, created_at FROM users WHERE family_id = ? ORDER BY created_at ASC',
  )
    .bind(id)
    .all()
  return c.json({ ...fam, members: members.results ?? [] })
})

export default app
