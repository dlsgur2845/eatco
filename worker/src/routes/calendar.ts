import { Hono } from 'hono'
import { ApiError, readJson } from '../lib/errors'
import { nowIso } from '../lib/dates'
import { requireFamily } from '../lib/identity'
import type { Env, Vars } from '../lib/types'

/**
 * 가족 식단 캘린더.
 *
 * 범용 캘린더가 아니다. 날짜 + 끼니 + 뭘 먹을지 세 개만 다룬다.
 *
 * 알림은 새로 만들지 않고 notification_logs 에 행을 넣는다. 우측상단 배지
 * (TopAppBar 가 /notification-logs/unread-count 를 폴링)와 알림 목록이
 * 이미 돌고 있어서, 행만 들어가면 양쪽이 그대로 동작한다.
 *
 * 알림에는 actor_id (만든 사람) 를 남긴다. 이게 없던 동안에는 내가 올린
 * 식단·내가 쓴 댓글이 내 배지 숫자를 올렸다. 배지는 actor_id 가 나인 행을
 * 빼고 센다. 목록에는 그대로 남는다 — 가족 피드로서 흐름이 끊기지 않게.
 * actor_id 가 NULL 이면 사람이 아니라 cron 이 만든 소비기한 알림이다.
 */
const app = new Hono<{ Bindings: Env; Variables: Vars }>()

const SLOTS = ['breakfast', 'lunch', 'dinner'] as const
type Slot = (typeof SLOTS)[number]
const SLOT_LABEL: Record<Slot, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁' }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const TITLE_MAX = 100
const MEMO_MAX = 500
const COMMENT_MAX = 500

/** 'YYYY-MM-DD' → '8월 22일'. 알림 문구용. */
function human(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}

/**
 * 알림 한 건. type 은 notification_logs.type 이 VARCHAR(12) 라
 * 12자를 넘기면 안 된다 ('meal_plan'=9, 'comment'=7).
 */
function notify(
  db: D1Database,
  familyId: string,
  type: 'meal_plan' | 'comment',
  title: string,
  message: string,
  link: string,
  actorId: string,
) {
  return db
    .prepare(
      `INSERT INTO notification_logs
         (id, family_id, type, title, message, is_read, link, created_at, actor_id)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(), familyId, type,
      title.slice(0, 200), message.slice(0, 500), link, nowIso(),
      // 작성자를 남겨야 본인 배지에서 뺄 수 있다.
      actorId,
    )
}

/** 가족 스코프로 식단 한 건. 없거나 남의 가족이면 404 (존재 여부를 흘리지 않는다). */
async function findPlan(db: D1Database, id: string, familyId: string) {
  const row = await db
    .prepare('SELECT * FROM meal_plans WHERE id = ? AND family_id = ?')
    .bind(id, familyId)
    .first<{
      id: string
      family_id: string
      plan_date: string
      meal_slot: Slot
      title: string
      memo: string | null
      created_by: string | null
      created_by_name: string
      created_at: string
    }>()
  if (!row) throw new ApiError(404, '식단을 찾을 수 없습니다.')
  return row
}

/* ── 주간 조회 ───────────────────────────────────────────── */

app.get('/', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const from = c.req.query('from') ?? ''
  const to = c.req.query('to') ?? ''
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new ApiError(422, '조회 기간(from, to)을 YYYY-MM-DD 로 주세요.')
  }
  if (from > to) throw new ApiError(422, '시작일이 종료일보다 늦습니다.')

  const { results } = await c.env.DB.prepare(
    `SELECT p.*,
            (SELECT COUNT(*) FROM meal_comments mc WHERE mc.meal_plan_id = p.id) AS comment_count
       FROM meal_plans p
      WHERE p.family_id = ? AND p.plan_date BETWEEN ? AND ?
      ORDER BY p.plan_date ASC, p.created_at ASC`,
  )
    .bind(familyId, from, to)
    .all()
  return c.json(results ?? [])
})

/* ── 등록 ────────────────────────────────────────────────── */

app.post('/', async (c) => {
  const user = c.get('user')
  const familyId = requireFamily(user)
  const b = await readJson<{ plan_date: string; meal_slot: string; title: string; memo?: string }>(c.req)

  const planDate = String(b.plan_date ?? '')
  const slot = String(b.meal_slot ?? '') as Slot
  const title = String(b.title ?? '').trim()
  const memo = b.memo == null ? null : String(b.memo).trim().slice(0, MEMO_MAX) || null

  if (!DATE_RE.test(planDate)) throw new ApiError(422, '날짜를 YYYY-MM-DD 로 주세요.')
  if (!SLOTS.includes(slot)) throw new ApiError(422, '끼니는 아침/점심/저녁 중 하나여야 합니다.')
  if (!title) throw new ApiError(422, '무엇을 먹을지 적어주세요.')

  const id = crypto.randomUUID()
  const now = nowIso()

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO meal_plans
         (id, family_id, plan_date, meal_slot, title, memo, created_by, created_by_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, familyId, planDate, slot, title.slice(0, TITLE_MAX), memo, user.id, user.nickname, now),
    notify(
      c.env.DB,
      familyId,
      'meal_plan',
      '새 식단이 올라왔어요',
      `${user.nickname}님이 ${human(planDate)} ${SLOT_LABEL[slot]}에 ${title.slice(0, 60)}을(를) 올렸어요`,
      `/calendar/${id}`,
      user.id,
    ),
  ])

  return c.json({ id, plan_date: planDate, meal_slot: slot, title, memo }, 201)
})

/* ── 상세 (댓글 포함) ────────────────────────────────────── */

app.get('/:id', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const plan = await findPlan(c.env.DB, c.req.param('id'), familyId)
  const { results } = await c.env.DB.prepare(
    `SELECT id, body, created_by, created_by_name, created_at
       FROM meal_comments
      WHERE meal_plan_id = ? AND family_id = ?
      ORDER BY created_at ASC`,
  )
    .bind(plan.id, familyId)
    .all()
  return c.json({ ...plan, comments: results ?? [] })
})

/* ── 수정 ────────────────────────────────────────────────── */

app.patch('/:id', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const plan = await findPlan(c.env.DB, c.req.param('id'), familyId)
  const b = await readJson<{ title?: string; memo?: string | null; plan_date?: string; meal_slot?: string }>(c.req)

  const sets: string[] = []
  const binds: unknown[] = []
  if (b.title !== undefined) {
    const t = String(b.title).trim()
    if (!t) throw new ApiError(422, '무엇을 먹을지 적어주세요.')
    sets.push('title = ?'); binds.push(t.slice(0, TITLE_MAX))
  }
  if (b.memo !== undefined) {
    const m = b.memo == null ? null : String(b.memo).trim().slice(0, MEMO_MAX) || null
    sets.push('memo = ?'); binds.push(m)
  }
  if (b.plan_date !== undefined) {
    if (!DATE_RE.test(String(b.plan_date))) throw new ApiError(422, '날짜를 YYYY-MM-DD 로 주세요.')
    sets.push('plan_date = ?'); binds.push(b.plan_date)
  }
  if (b.meal_slot !== undefined) {
    if (!SLOTS.includes(String(b.meal_slot) as Slot)) throw new ApiError(422, '끼니가 올바르지 않습니다.')
    sets.push('meal_slot = ?'); binds.push(b.meal_slot)
  }
  if (!sets.length) throw new ApiError(422, '변경할 내용이 없습니다.')

  binds.push(plan.id, familyId)
  await c.env.DB.prepare(`UPDATE meal_plans SET ${sets.join(', ')} WHERE id = ? AND family_id = ?`)
    .bind(...binds)
    .run()

  // 수정은 알림을 만들지 않는다. 오타 한 번 고칠 때마다 가족 전원에게
  // 알림이 가면 알림 자체를 무시하게 된다.
  return c.json(await findPlan(c.env.DB, plan.id, familyId))
})

/* ── 삭제 ────────────────────────────────────────────────── */

app.delete('/:id', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const plan = await findPlan(c.env.DB, c.req.param('id'), familyId)

  // ON DELETE CASCADE 를 선언해 뒀지만 D1 이 FK 강제를 켜뒀는지에 의존하지
  // 않는다. 댓글을 명시적으로 먼저 지운다. 남으면 고아 행이 된다.
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM meal_comments WHERE meal_plan_id = ?').bind(plan.id),
    c.env.DB.prepare('DELETE FROM meal_plans WHERE id = ? AND family_id = ?').bind(plan.id, familyId),
    // 이 식단을 가리키던 알림도 정리한다. 안 지우면 눌렀을 때 404 로 간다.
    c.env.DB.prepare('DELETE FROM notification_logs WHERE family_id = ? AND link = ?')
      .bind(familyId, `/calendar/${plan.id}`),
  ])
  return c.json({ deleted: true, id: plan.id })
})

/* ── 댓글 ────────────────────────────────────────────────── */

app.post('/:id/comments', async (c) => {
  const user = c.get('user')
  const familyId = requireFamily(user)
  const plan = await findPlan(c.env.DB, c.req.param('id'), familyId)

  const b = await readJson<{ body: string }>(c.req)
  const body = String(b.body ?? '').trim()
  if (!body) throw new ApiError(422, '댓글을 입력해주세요.')

  const id = crypto.randomUUID()
  const now = nowIso()

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO meal_comments
         (id, meal_plan_id, family_id, body, created_by, created_by_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, plan.id, familyId, body.slice(0, COMMENT_MAX), user.id, user.nickname, now),
    notify(
      c.env.DB,
      familyId,
      'comment',
      '식단에 댓글이 달렸어요',
      `${user.nickname}님: ${body.slice(0, 60)}`,
      `/calendar/${plan.id}`,
      user.id,
    ),
  ])

  return c.json({ id, body, created_by_name: user.nickname, created_at: now }, 201)
})

app.delete('/comments/:cid', async (c) => {
  const user = c.get('user')
  const familyId = requireFamily(user)
  const cid = c.req.param('cid')

  const row = await c.env.DB
    .prepare('SELECT id, created_by FROM meal_comments WHERE id = ? AND family_id = ?')
    .bind(cid, familyId)
    .first<{ id: string; created_by: string | null }>()
  if (!row) throw new ApiError(404, '댓글을 찾을 수 없습니다.')

  // 본인 댓글이거나, 가족 마스터면 지울 수 있다.
  if (row.created_by !== user.id) {
    const fam = await c.env.DB
      .prepare('SELECT master_id FROM families WHERE id = ?')
      .bind(familyId)
      .first<{ master_id: string | null }>()
    if (fam?.master_id !== user.id) throw new ApiError(403, '본인 댓글만 삭제할 수 있습니다.')
  }

  await c.env.DB.prepare('DELETE FROM meal_comments WHERE id = ? AND family_id = ?')
    .bind(cid, familyId)
    .run()
  return c.json({ deleted: true, id: cid })
})

export default app
