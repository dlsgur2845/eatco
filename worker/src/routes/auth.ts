import { Hono } from 'hono'
import { ApiError, readJson } from '../lib/errors'
import { nowIso } from '../lib/dates'
import type { Env, Vars } from '../lib/types'
import { hashPassword, verifyPassword } from '../lib/password'
import { createSession, sessionCookie, clearCookie } from '../lib/session'
import { validateNickname } from '../lib/nickname'
import { uniqueInviteCode, notificationSettingStatements, createSoloFamily, consumeInviteCode, rotateInviteCode } from '../lib/family'
import { roleForNewUser, requireFamily } from '../lib/identity'
import {
  RESET_TABLES, countResettable, totalCount, buildResetStatements, buildRestoreStatements,
  allConsented, membershipChanged, isExpired, isPurgeDue, expiryFrom, purgeFrom,
} from '../lib/family-reset'
import { addKey, providerLabel } from '../lib/api-keys'

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
  const nicknameCheck = validateNickname(b.nickname)
  if (!nicknameCheck.ok) throw new ApiError(422, nicknameCheck.message)
  const nickname = nicknameCheck.value
  const password = String(b.password ?? '')
  const invite = String(b.invite_code ?? '').trim().toUpperCase()

  if (!EMAIL_RE.test(email)) throw new ApiError(422, '이메일 형식이 올바르지 않습니다.')
  if (password.length < 8) throw new ApiError(422, '비밀번호는 8자 이상이어야 합니다.')
  if (password.length > 200) throw new ApiError(422, '비밀번호가 너무 깁니다.')

  /* 이메일과 닉네임 둘 다 중복 금지.
   *
   * 진짜 방어선은 DB 다 — 이메일은 테이블 UNIQUE, 닉네임은 0007 의
   * UNIQUE INDEX(LOWER(nickname)). 두 사람이 동시에 같은 값으로 가입하면
   * 아래 SELECT 는 둘 다 통과하지만 INSERT 는 하나만 성공한다.
   *
   * 그런데도 여기서 미리 보는 이유는 **메시지** 때문이다. 제약에 걸리면
   * 사용자에게는 500 이 나간다. "이미 가입된 이메일입니다" 를 보여주려면
   * 먼저 물어봐야 한다. 경합에서 진 쪽은 아래 catch 가 받는다. */
  const dupEmail = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()
  if (dupEmail) throw new ApiError(409, '이미 가입된 이메일입니다.')
  const dupNick = await c.env.DB
    .prepare('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER(?)')
    .bind(nickname)
    .first()
  if (dupNick) throw new ApiError(409, '이미 쓰이고 있는 닉네임이에요. 다른 이름을 써주세요.')

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
  try {
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, nickname, hashed_password, family_id, created_at, role, approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, email, nickname, await hashPassword(password), invitedFamily?.id ?? null, nowIso(), role, approved)
      .run()
  } catch (e) {
    // 위 SELECT 와 이 INSERT 사이에 누가 먼저 같은 값으로 들어온 경우.
    // UNIQUE 제약이 잡아주고, 여기서 사람이 읽을 문장으로 바꾼다.
    if (/UNIQUE|constraint/i.test(String(e))) {
      throw new ApiError(409, '이미 쓰이고 있는 이메일 또는 닉네임이에요.')
    }
    throw e
  }

  // 초대로 들어왔으면 가족이 이미 정해졌다. 1인 가족을 만들지 않는다.
  if (invitedFamily) {
    // 가입 화면에는 "로그인 유지" 가 없다. 유지하지 않는 쪽이 기본이다.
    c.header('Set-Cookie', sessionCookie(await createSession(c.env, id, false), false))
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
  c.header('Set-Cookie', sessionCookie(await createSession(c.env, id, false), false))
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
  const b = await readJson<{ email: string; password: string; remember?: boolean }>(c.req)
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

  /* "로그인 유지" 를 켰을 때만 브라우저가 쿠키를 저장한다.
     안 켜면 Max-Age 없는 세션 쿠키라 브라우저를 닫는 순간 사라진다.
     예전엔 항상 7일이라, 공용 컴퓨터에서 브라우저만 닫으면 다음 사람이
     그대로 로그인 상태로 들어갔다. */
  const remember = b.remember === true
  c.header('Set-Cookie', sessionCookie(await createSession(c.env, user.id, remember), remember))
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
  const checked = validateNickname(body.nickname)
  if (!checked.ok) throw new ApiError(422, checked.message)
  const nickname = checked.value
  if (nickname === user.nickname) return c.json({ ...user, nickname })

  // 남이 쓰고 있는 닉네임으로는 못 바꾼다 (가입과 같은 규칙).
  const taken = await c.env.DB
    .prepare('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER(?) AND id != ?')
    .bind(nickname, user.id)
    .first()
  if (taken) throw new ApiError(409, '이미 쓰이고 있는 닉네임이에요. 다른 이름을 써주세요.')

  /* 닉네임 사본이 **네 군데** 있다. 전부 같이 바꾼다.
   *
   *   meal_plans.created_by_name   — 식단을 올린 사람
   *   meal_comments.created_by_name — 댓글 쓴 사람
   *   shared_recipes.author_name    — 공유 레시피 작성자
   *   ingredients.registered_by     — 식재료를 넣은 사람 (FK 가 아니라 이름 문자열이다)
   *
   * 안 바꾸면 손보경님이 이름을 바꿨을 때 냉장고에는 옛 이름이, 식단에는 새
   * 이름이 남아서 "이거 누구지" 가 된다. 가족 앱이라 같은 사람이 여러 화면에
   * 흩어져 나온다.
   *
   * ingredients 는 id 가 아니라 **이름으로** 매칭한다 (그 컬럼이 이름이다).
   * 그래서 동명이인이 있으면 남의 것도 바뀐다 — 가족 단위라 실질적으로
   * 일어나지 않지만, family_id 로 좁혀서 범위를 최소화한다.
   *
   * batch 는 원자적이다. 하나라도 실패하면 전부 롤백된다. */
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare('UPDATE users SET nickname = ? WHERE id = ?').bind(nickname, user.id),
    c.env.DB.prepare('UPDATE meal_plans SET created_by_name = ? WHERE created_by = ?').bind(nickname, user.id),
    c.env.DB.prepare('UPDATE meal_comments SET created_by_name = ? WHERE created_by = ?').bind(nickname, user.id),
    c.env.DB.prepare('UPDATE shared_recipes SET author_name = ? WHERE author_id = ?').bind(nickname, user.id),
  ]
  if (user.family_id) {
    stmts.push(
      c.env.DB.prepare('UPDATE ingredients SET registered_by = ? WHERE registered_by = ? AND family_id = ?')
        .bind(nickname, user.nickname, user.family_id),
    )
  }
  try {
    await c.env.DB.batch(stmts)
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e))) {
      throw new ApiError(409, '이미 쓰이고 있는 닉네임이에요. 다른 이름을 써주세요.')
    }
    throw e
  }
  return c.json({ ...user, nickname })
})

/* 비밀번호 변경.
 *
 * 현재 비밀번호를 반드시 확인한다. 세션만으로 바꾸게 하면, 자리를 비운
 * 사이 남이 만진 브라우저로 비밀번호가 바뀌어 계정을 통째로 뺏긴다.
 *
 * 바꾼 뒤 **새 세션을 발급한다.** 안 그러면 옛 토큰이 그대로 살아서,
 * 비밀번호를 바꾼 이유(누가 아는 것 같다)가 해결되지 않는다.
 * 유지 여부는 지금 쿠키를 따라가지 않고 false 로 둔다 — 비밀번호를 방금
 * 바꾼 시점에 오래 사는 쿠키를 새로 주는 건 방향이 반대다. */
app.post('/me/password', async (c) => {
  const user = c.get('user')
  const b = await readJson<{ current_password: string; new_password: string }>(c.req)
  const current = String(b.current_password ?? '')
  const next = String(b.new_password ?? '')

  if (next.length < 8) throw new ApiError(422, '새 비밀번호는 8자 이상이어야 해요.')
  if (next.length > 200) throw new ApiError(422, '새 비밀번호가 너무 깁니다.')
  if (next === current) throw new ApiError(422, '지금 쓰는 비밀번호와 달라야 해요.')

  const row = await c.env.DB.prepare('SELECT hashed_password FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ hashed_password: string }>()
  if (!row?.hashed_password) throw new ApiError(400, '비밀번호를 쓰지 않는 계정이에요.')
  if (!(await verifyPassword(current, row.hashed_password))) {
    throw new ApiError(403, '현재 비밀번호가 올바르지 않아요.')
  }

  await c.env.DB.prepare('UPDATE users SET hashed_password = ? WHERE id = ?')
    .bind(await hashPassword(next), user.id)
    .run()

  c.header('Set-Cookie', sessionCookie(await createSession(c.env, user.id, false), false))
  return c.json({ ok: true })
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

/* 초대 링크 새로 만들기 (대표 전용).
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

/* ──────────────────────────────────────────────
   가족 API 키 (BYOK)

   **와일드카드 `/family/:id` 보다 위에 있어야 한다.** 아래면 :id 가 'keys' 를
   삼켜서 이 경로들이 영영 안 불린다.

   푸는 문제: 비용·할당량을 가족끼리 나눈다.
   **안 푸는 문제: Gemini 지역차단.** 그건 워커 위치 문제라 키로 안 고쳐진다.
   ────────────────────────────────────────────── */

const PROVIDERS = new Set(['gemini', 'anthropic', 'openai'])

app.get('/family/keys', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)
  const { results } = await c.env.DB.prepare(
    `SELECT id, provider, label, key_hint, added_by, created_at, priority,
            calls, last_used_at, cooldown_until, disabled, last_error
       FROM family_api_keys WHERE family_id = ? ORDER BY provider, created_at`,
  )
    .bind(famId)
    .all()
  const fam = await c.env.DB.prepare('SELECT key_strategy FROM families WHERE id = ?')
    .bind(famId)
    .first<{ key_strategy: string }>()
  return c.json({
    keys: (results ?? []).map((r) => ({ ...r, provider_label: providerLabel(String(r.provider)) })),
    strategy: fam?.key_strategy ?? 'least_used',
  })
})

app.post('/family/keys', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)
  const b = await readJson<{ provider?: string; label?: string; key?: string }>(c.req)

  const provider = String(b.provider ?? '').trim()
  if (!PROVIDERS.has(provider)) throw new ApiError(422, '지원하지 않는 제공자예요.')

  const key = String(b.key ?? '').trim()
  // 키 형식은 제공자마다 다르고 바뀐다. 길이만 최소한으로 본다 —
  // 정규식으로 조이면 제공자가 형식을 바꾼 날 멀쩡한 키가 거절된다.
  if (key.length < 20) throw new ApiError(422, '키가 너무 짧아요. 다시 확인해주세요.')

  const label = String(b.label ?? '').trim().slice(0, 40) || `${user.nickname ?? '가족'}의 ${providerLabel(provider)}`

  const { id, key_hint } = await addKey(c.env, famId, user.id, provider, label, key)
  return c.json({ id, label, key_hint, provider })
})

app.delete('/family/keys/:id', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)
  const res = await c.env.DB.prepare('DELETE FROM family_api_keys WHERE id = ? AND family_id = ?')
    .bind(c.req.param('id'), famId)
    .run()
  if (!res.meta.changes) throw new ApiError(404, '그 키를 찾을 수 없어요.')
  return c.json({ deleted: true })
})

/** 꺼진 키를 다시 켠다 (키를 고쳐 넣은 뒤). */
app.post('/family/keys/:id/enable', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)
  const res = await c.env.DB.prepare(
    'UPDATE family_api_keys SET disabled = 0, cooldown_until = NULL, last_error = NULL WHERE id = ? AND family_id = ?',
  )
    .bind(c.req.param('id'), famId)
    .run()
  if (!res.meta.changes) throw new ApiError(404, '그 키를 찾을 수 없어요.')
  return c.json({ enabled: true })
})

app.patch('/family/key-strategy', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)
  const b = await readJson<{ strategy?: string; order?: string[] }>(c.req)
  const strategy = b.strategy === 'priority' ? 'priority' : 'least_used'

  const stmts = [
    c.env.DB.prepare('UPDATE families SET key_strategy = ? WHERE id = ?').bind(strategy, famId),
  ]
  // 순서 지정 모드면 순위도 같이 받는다. 한 번에 저장해야 화면과 어긋나지 않는다.
  if (Array.isArray(b.order)) {
    b.order.forEach((id, i) => {
      stmts.push(
        c.env.DB.prepare('UPDATE family_api_keys SET priority = ? WHERE id = ? AND family_id = ?')
          .bind(i, id, famId),
      )
    })
  }
  await c.env.DB.batch(stmts)
  return c.json({ strategy })
})

/* ──────────────────────────────────────────────
   가족 데이터 초기화 — 전원 동의 + 7일 복구

   **와일드카드 `/family/:id` 보다 위에 있어야 한다.** 아래에 두면 :id 가
   'reset' 을 삼켜서 이 경로들이 영영 안 불린다. (파일 아래 주석 참조)
   ────────────────────────────────────────────── */

interface ResetRow {
  id: string
  requested_by: string
  member_ids: string
  status: string
  created_at: string
  expires_at: string
  executed_at: string | null
  purge_after: string | null
}

/** 지금 살아 있는 요청 하나. 읽는 김에 만료를 정리한다. */
async function activeReset(db: D1Database, familyId: string): Promise<ResetRow | null> {
  const row = await db
    .prepare(
      `SELECT id, requested_by, member_ids, status, created_at, expires_at, executed_at, purge_after
         FROM family_reset_requests
        WHERE family_id = ? AND status IN ('pending','done')
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(familyId)
    .first<ResetRow>()
  if (!row) return null

  // 만료 정리를 여기서 한다. 별도 cron 을 붙이지 않는 이유: 이 화면을 아무도
  // 열지 않는 동안 상태가 낡아 있어도 아무에게도 안 보인다.
  if (row.status === 'pending' && isExpired(row.expires_at, new Date())) {
    await db.prepare(`UPDATE family_reset_requests SET status='expired' WHERE id = ? AND status='pending'`)
      .bind(row.id).run()
    return null
  }
  return row
}

async function memberIdsOf(db: D1Database, familyId: string): Promise<string[]> {
  const r = await db.prepare('SELECT id FROM users WHERE family_id = ? ORDER BY id').bind(familyId).all<{ id: string }>()
  return (r.results ?? []).map((x) => x.id)
}

async function consentIdsOf(db: D1Database, requestId: string): Promise<string[]> {
  const r = await db.prepare('SELECT user_id FROM family_reset_consents WHERE request_id = ?')
    .bind(requestId).all<{ user_id: string }>()
  return (r.results ?? []).map((x) => x.user_id)
}

/**
 * 전원 동의됐으면 실행한다. **요청 생성과 동의 두 곳에서 부른다.**
 *
 * 1인 가족에서는 요청이 곧 전원 동의다. 실행이 동의 엔드포인트에만 있으면
 * 혼자인 사람은 자기 요청에 다시 동의할 방법이 없어 영영 못 지운다.
 *
 * 상태 전이가 원자적인 게 핵심이다 — 두 사람이 동시에 마지막 동의를 누르면
 * 둘 다 여기까지 온다. UPDATE 를 이긴 쪽만 실제 삭제를 돌린다.
 */
async function maybeExecute(
  db: D1Database, famId: string, requestId: string, snapshot: string[], actorId: string,
): Promise<boolean> {
  const consents = await consentIdsOf(db, requestId)
  if (!allConsented(snapshot, consents)) return false

  const now = new Date()
  const won = await db.prepare(
    `UPDATE family_reset_requests SET status='done', executed_at=?, purge_after=?
      WHERE id=? AND status='pending'`,
  ).bind(nowIso(), purgeFrom(now), requestId).run()
  if (!won.meta.changes) return true // 이미 남이 했다. 결과는 같다.

  await db.batch([
    ...buildResetStatements(db, famId, requestId),
    db.prepare(
      `INSERT INTO notification_logs (id, family_id, type, title, message, is_read, link, created_at, actor_id)
       VALUES (?, ?, 'RESET_DONE', ?, ?, 0, '/family', ?, ?)`,
    ).bind(
      crypto.randomUUID(), famId,
      '데이터를 초기화했어요',
      '7일 안에는 되돌릴 수 있어요. 공개한 요리는 남겨뒀어요.',
      nowIso(), actorId,
    ),
  ])
  return true
}

app.get('/family/reset', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)
  const row = await activeReset(c.env.DB, famId)
  const counts = await countResettable(c.env.DB, famId)
  const members = await memberIdsOf(c.env.DB, famId)

  if (!row) return c.json({ request: null, counts, total: totalCount(counts), members: members.length })

  const consents = await consentIdsOf(c.env.DB, row.id)
  return c.json({
    request: {
      id: row.id,
      status: row.status,
      requested_by: row.requested_by,
      is_mine: row.requested_by === user.id,
      i_agreed: consents.includes(user.id),
      agreed: consents.length,
      needed: JSON.parse(row.member_ids).length,
      expires_at: row.expires_at,
      executed_at: row.executed_at,
      purge_after: row.purge_after,
    },
    counts,
    total: totalCount(counts),
    members: members.length,
  })
})

app.post('/family/reset', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)

  const existing = await activeReset(c.env.DB, famId)
  if (existing?.status === 'pending') throw new ApiError(409, '이미 진행 중인 초기화 요청이 있어요.')
  if (existing?.status === 'done') throw new ApiError(409, '되돌릴 수 있는 초기화가 남아 있어요. 먼저 정리해주세요.')

  const counts = await countResettable(c.env.DB, famId)
  if (totalCount(counts) === 0) throw new ApiError(422, '지울 데이터가 없어요.')

  const members = await memberIdsOf(c.env.DB, famId)
  const now = new Date()
  const id = crypto.randomUUID()

  // 요청은 곧 동의다. 요청해놓고 따로 또 동의하게 만들 이유가 없다.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO family_reset_requests (id, family_id, requested_by, member_ids, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    ).bind(id, famId, user.id, JSON.stringify(members), nowIso(), expiryFrom(now)),
    c.env.DB.prepare('INSERT INTO family_reset_consents (request_id, user_id, agreed_at) VALUES (?, ?, ?)')
      .bind(id, user.id, nowIso()),
    // 인앱 알림이 유일한 통로다 — 푸시 발송 코드가 없다. type 은 VARCHAR(12).
    c.env.DB.prepare(
      `INSERT INTO notification_logs (id, family_id, type, title, message, is_read, link, created_at, actor_id)
       VALUES (?, ?, 'RESET_REQ', ?, ?, 0, '/family', ?, ?)`,
    ).bind(
      crypto.randomUUID(), famId,
      '데이터 초기화에 동의가 필요해요',
      `${user.nickname ?? '가족'}님이 초기화를 요청했어요. 모두 동의하면 지워져요.`,
      nowIso(), user.id,
    ),
  ])

  // 1인 가족이면 여기서 이미 전원 동의다. 바로 실행한다.
  const executed = await maybeExecute(c.env.DB, famId, id, members, user.id)
  return c.json({ id, expires_at: expiryFrom(now), executed })
})

app.post('/family/reset/consent', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)
  const row = await activeReset(c.env.DB, famId)
  if (!row) throw new ApiError(404, '진행 중인 초기화 요청이 없어요.')
  /* 이미 끝났으면 성공으로 답한다.
     동시에 마지막 동의를 누르면 진 쪽이 여기 온다. 그 사람의 의도(초기화)는
     이미 이뤄졌는데 404 를 주면 **초기화는 됐는데 화면엔 오류가 뜬다.**
     실측으로 잡았다 — 동시 요청 2발에서 한 쪽이 이 문구를 받았다. */
  if (row.status === 'done') return c.json({ executed: true, already: true })
  if (row.status !== 'pending') throw new ApiError(404, '진행 중인 초기화 요청이 없어요.')

  const snapshot: string[] = JSON.parse(row.member_ids)
  const current = await memberIdsOf(c.env.DB, famId)
  if (membershipChanged(snapshot, current)) {
    await c.env.DB.prepare(`UPDATE family_reset_requests SET status='stale' WHERE id=? AND status='pending'`)
      .bind(row.id).run()
    throw new ApiError(409, '그 사이 가족 구성원이 바뀌었어요. 다시 요청해주세요.')
  }
  if (!snapshot.includes(user.id)) throw new ApiError(403, '이 요청의 구성원이 아니에요.')

  await c.env.DB.prepare('INSERT OR IGNORE INTO family_reset_consents (request_id, user_id, agreed_at) VALUES (?, ?, ?)')
    .bind(row.id, user.id, nowIso()).run()

  const executed = await maybeExecute(c.env.DB, famId, row.id, snapshot, user.id)
  if (executed) return c.json({ executed: true })
  const consents = await consentIdsOf(c.env.DB, row.id)
  return c.json({ executed: false, agreed: consents.length, needed: snapshot.length })
})

app.delete('/family/reset/consent', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)
  const row = await activeReset(c.env.DB, famId)
  if (!row || row.status !== 'pending') throw new ApiError(404, '진행 중인 초기화 요청이 없어요.')
  await c.env.DB.prepare('DELETE FROM family_reset_consents WHERE request_id = ? AND user_id = ?')
    .bind(row.id, user.id).run()
  return c.json({ withdrawn: true })
})

app.post('/family/reset/cancel', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)
  const row = await activeReset(c.env.DB, famId)
  if (!row || row.status !== 'pending') throw new ApiError(404, '진행 중인 초기화 요청이 없어요.')

  const fam = await c.env.DB.prepare('SELECT master_id FROM families WHERE id = ?')
    .bind(famId).first<{ master_id: string | null }>()
  if (row.requested_by !== user.id && fam?.master_id !== user.id) {
    throw new ApiError(403, '요청한 사람이나 대표만 취소할 수 있어요.')
  }
  await c.env.DB.prepare(`UPDATE family_reset_requests SET status='cancelled' WHERE id=? AND status='pending'`)
    .bind(row.id).run()
  return c.json({ cancelled: true })
})

/** 되돌리기. 7일 안에만. */
app.post('/family/reset/restore', async (c) => {
  const user = c.get('user')
  const famId = requireFamily(user)
  const row = await activeReset(c.env.DB, famId)
  if (!row || row.status !== 'done') throw new ApiError(404, '되돌릴 초기화가 없어요.')
  // isExpired 가 아니라 isPurgeDue 다. 둘은 다른 기한을 본다 —
  // isExpired 는 동의 마감(48h), 이건 복구 창(7일)이다. null 가드도 안에 있다.
  if (isPurgeDue(row.purge_after, new Date())) {
    throw new ApiError(409, '되돌릴 수 있는 기간(7일)이 지났어요.')
  }

  // 여기도 원자적으로. 두 명이 동시에 되돌리면 행이 두 번 들어갈 수 있다.
  const won = await c.env.DB.prepare(
    `UPDATE family_reset_requests SET status='restored' WHERE id=? AND status='done'`,
  ).bind(row.id).run()
  if (!won.meta.changes) return c.json({ restored: true, already: true })

  await c.env.DB.batch(buildRestoreStatements(c.env.DB, row.id))
  return c.json({ restored: true })
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
