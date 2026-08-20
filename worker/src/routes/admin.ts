import { Hono } from 'hono'
import { ApiError, readJson } from '../lib/errors'
import type { Env, Vars } from '../lib/types'

/**
 * 관리자 전용 API.
 *
 * 게이트는 전적으로 서버에 있다. 프론트가 메뉴를 숨기는 것은 UI 편의일 뿐
 * 권한이 아니다 — /api/admin/* 은 role='admin' 이 아니면 전부 403 이다.
 *
 * 세 가지를 특히 조심한다:
 *  1) hashed_password 는 어떤 응답에도 넣지 않는다.
 *  2) 마지막 관리자를 강등하거나 삭제할 수 없다. 잠기면 복구 수단이 DB 직접 수정뿐이다.
 *  3) 가족을 지워도 사람은 지우지 않는다. 소속만 끊는다 —
 *     다음 요청에서 withFamily 가 1인 가족을 다시 만들어준다.
 */
const app = new Hono<{ Bindings: Env; Variables: Vars }>()

app.use('*', async (c, next) => {
  const user = c.get('user')
  if (user.role !== 'admin') throw new ApiError(403, '관리자만 접근할 수 있습니다.')
  return next()
})

async function adminCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
    .first<{ n: number }>()
  return row?.n ?? 0
}

/* ── 요약 ────────────────────────────────────────────────── */

app.get('/stats', async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users)                          AS users,
      (SELECT COUNT(*) FROM users WHERE role = 'admin')     AS admins,
      (SELECT COUNT(*) FROM families)                       AS families,
      (SELECT COUNT(*) FROM ingredients)                    AS ingredients,
      (SELECT COUNT(*) FROM usage_events)                   AS usage_events
  `).first()
  return c.json(row)
})

/* ── 사용자 관리 ─────────────────────────────────────────── */

app.get('/users', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT
      u.id, u.email, u.nickname, u.role, u.created_at, u.family_id,
      f.name AS family_name,
      (f.master_id = u.id) AS is_family_master,
      (SELECT COUNT(*) FROM ingredients i WHERE i.family_id = u.family_id) AS ingredient_count
    FROM users u
    LEFT JOIN families f ON f.id = u.family_id
    ORDER BY u.created_at ASC, u.id ASC
  `).all()
  return c.json(rows.results ?? [])
})

app.patch('/users/:id/role', async (c) => {
  const me = c.get('user')
  const targetId = c.req.param('id')
  const body = await readJson<{ role: string }>(c.req)
  const role = String(body.role ?? '')
  if (role !== 'admin' && role !== 'member') {
    throw new ApiError(422, "역할은 'admin' 또는 'member' 여야 합니다.")
  }

  const target = await c.env.DB
    .prepare('SELECT id, nickname, role FROM users WHERE id = ?')
    .bind(targetId)
    .first<{ id: string; nickname: string; role: string }>()
  if (!target) throw new ApiError(404, '사용자를 찾을 수 없습니다.')
  if (target.role === role) return c.json({ id: target.id, role })

  // 마지막 관리자를 내리면 아무도 이 화면에 못 들어온다.
  if (target.role === 'admin' && role === 'member' && (await adminCount(c.env.DB)) <= 1) {
    throw new ApiError(422, '마지막 관리자는 강등할 수 없습니다.')
  }
  if (target.id === me.id && role === 'member') {
    throw new ApiError(422, '자기 자신을 강등할 수 없습니다.')
  }

  await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, targetId).run()
  return c.json({ id: targetId, role })
})

app.delete('/users/:id', async (c) => {
  const me = c.get('user')
  const targetId = c.req.param('id')
  if (targetId === me.id) throw new ApiError(422, '자기 자신은 삭제할 수 없습니다.')

  const target = await c.env.DB
    .prepare('SELECT id, role, family_id FROM users WHERE id = ?')
    .bind(targetId)
    .first<{ id: string; role: string; family_id: string | null }>()
  if (!target) throw new ApiError(404, '사용자를 찾을 수 없습니다.')
  if (target.role === 'admin' && (await adminCount(c.env.DB)) <= 1) {
    throw new ApiError(422, '마지막 관리자는 삭제할 수 없습니다.')
  }

  // 가족 마스터였다면 남은 사람 중 가장 오래된 계정에게 넘긴다.
  // 넘기지 않고 지우면 master_id 가 사라진 사용자를 가리켜 FK 가 깨진다.
  let handover: D1PreparedStatement[] = []
  if (target.family_id) {
    const fam = await c.env.DB
      .prepare('SELECT master_id FROM families WHERE id = ?')
      .bind(target.family_id)
      .first<{ master_id: string | null }>()
    if (fam?.master_id === targetId) {
      const next = await c.env.DB
        .prepare('SELECT id FROM users WHERE family_id = ? AND id != ? ORDER BY created_at ASC LIMIT 1')
        .bind(target.family_id, targetId)
        .first<{ id: string }>()
      handover = [
        c.env.DB.prepare('UPDATE families SET master_id = ? WHERE id = ?')
          .bind(next?.id ?? null, target.family_id),
      ]
    }
  }

  await c.env.DB.batch([
    ...handover,
    c.env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(targetId),
    // 가족이 없던 동안 쌓인 이벤트는 family_code 에 사용자 id 가 들어 있다.
    c.env.DB.prepare('DELETE FROM usage_events WHERE family_code = ?').bind(targetId),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId),
  ])
  return c.json({ deleted: true, id: targetId })
})

/* ── 가족(그룹) 관리 ─────────────────────────────────────── */

app.get('/families', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT
      f.id, f.name, f.invite_code, f.allow_shared_edit, f.monthly_budget,
      f.created_at, f.master_id,
      m.nickname AS master_nickname,
      (SELECT COUNT(*) FROM users u      WHERE u.family_id = f.id) AS member_count,
      (SELECT COUNT(*) FROM ingredients i WHERE i.family_id = f.id) AS ingredient_count
    FROM families f
    LEFT JOIN users m ON m.id = f.master_id
    ORDER BY f.created_at ASC, f.id ASC
  `).all()
  return c.json(rows.results ?? [])
})

app.get('/families/:id/members', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, email, nickname, role, created_at FROM users WHERE family_id = ? ORDER BY created_at ASC',
  )
    .bind(c.req.param('id'))
    .all()
  return c.json(rows.results ?? [])
})

app.delete('/families/:id', async (c) => {
  const me = c.get('user')
  const famId = c.req.param('id')
  if (famId === me.family_id) {
    throw new ApiError(422, '본인이 속한 가족은 삭제할 수 없습니다. 먼저 다른 가족으로 옮겨주세요.')
  }

  const fam = await c.env.DB.prepare('SELECT id FROM families WHERE id = ?').bind(famId).first()
  if (!fam) throw new ApiError(404, '가족을 찾을 수 없습니다.')

  const db = c.env.DB
  // 순서가 중요하다. users.family_id 와 families.master_id 가 서로를 참조해서
  // 끊는 순서를 틀리면 FOREIGN KEY constraint failed 로 통째로 실패한다.
  await db.batch([
    // usage_events 만 family_id 가 아니라 family_code 다 (events.ts 가
    // `user.family_id ?? user.id` 를 넣는다). 가족이 없던 시절에 쌓인 행은
    // 사용자 id 로 들어가 있어서 구성원 id 도 같이 지운다.
    // users.family_id 를 끊기 전에 실행해야 아래 서브쿼리가 비지 않는다.
    db.prepare('DELETE FROM usage_events WHERE family_code = ? OR family_code IN (SELECT id FROM users WHERE family_id = ?)').bind(famId, famId),
    db.prepare('DELETE FROM ingredients          WHERE family_id = ?').bind(famId),
    db.prepare('DELETE FROM notification_logs    WHERE family_id = ?').bind(famId),
    db.prepare('DELETE FROM notification_settings WHERE family_id = ?').bind(famId),
    db.prepare('DELETE FROM push_subscriptions   WHERE family_id = ?').bind(famId),
    // 사람은 지우지 않는다. 소속만 끊으면 다음 요청에서 1인 가족이 다시 생긴다.
    db.prepare('UPDATE families SET master_id = NULL WHERE id = ?').bind(famId),
    db.prepare('UPDATE users SET family_id = NULL WHERE family_id = ?').bind(famId),
    db.prepare('DELETE FROM families WHERE id = ?').bind(famId),
  ])
  return c.json({ deleted: true, id: famId })
})

export default app
