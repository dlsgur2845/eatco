import { Hono } from 'hono'
import { ApiError, readJson } from '../lib/errors'
import { nowIso } from '../lib/dates'
import { requireFamily } from '../lib/identity'
import { withJosa } from '../lib/korean'
import { loadFridge } from '../lib/fridge'
import { scoreRecipe } from '../lib/recipe-match'
import { parseRecipeAttachment, readRecipeAttachment, type RecipeAttachment } from '../lib/recipe-search'
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
 * 식단에는 레시피를 붙일 수 있다 (0009). 붙이면 **재료 목록을 그 자리에서
 * 복사해 둔다.** 부족한 재료는 저장하지 않는다 — 화면을 열 때마다 지금
 * 냉장고로 다시 계산한다. 식단은 미래의 일이라, 고른 순간에 굳혀둔
 * "두부 없음" 은 장을 본 순간부터 거짓말이 되기 때문이다.
 * 왜 재료를 복사해 두는지는 migrations/0009 의 주석에 적어뒀다.
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

interface PlanRow {
  id: string
  family_id: string
  plan_date: string
  meal_slot: Slot
  title: string
  memo: string | null
  created_by: string | null
  created_by_name: string
  created_at: string
  recipe_source: string | null
  recipe_id: string | null
  recipe_ingredients: string | null
}

/* `SELECT *` 를 쓰지 않는다. 이 파일에 있던 습관인데, 0009 로 컬럼이 늘면서
   비싸졌다 — 주간 목록에 재료 JSON 이 통째로 실린다. 컬럼을 명시하면 어디에
   무엇이 나가는지가 코드에 보인다. */
const PLAN_COLUMNS = `id, family_id, plan_date, meal_slot, title, memo,
       created_by, created_by_name, created_at,
       recipe_source, recipe_id, recipe_ingredients`

/** 가족 스코프로 식단 한 건. 없거나 남의 가족이면 404 (존재 여부를 흘리지 않는다). */
async function findPlan(db: D1Database, id: string, familyId: string): Promise<PlanRow> {
  const row = await db
    .prepare(`SELECT ${PLAN_COLUMNS} FROM meal_plans WHERE id = ? AND family_id = ?`)
    .bind(id, familyId)
    .first<PlanRow>()
  if (!row) throw new ApiError(404, '식단을 찾을 수 없습니다.')
  return row
}

/**
 * 붙은 레시피를 응답 모양으로. **부족 여부는 지금 냉장고로 계산한다.**
 *
 * 저장된 건 재료 목록뿐이다. matched/missing 은 매번 새로 나온다 —
 * 그래서 장을 보고 두부를 넣으면 다음에 열 때 두부가 부족 목록에서 빠진다.
 *
 * 스냅샷이 깨져 있어도 **절대 throw 하지 않는다.** 깨진 한 행이 그날 식단
 * 전체를 500 으로 만들면 안 된다. readRecipeAttachment 가 null 을 주면
 * 레시피 블록만 없는 평범한 식단으로 보인다.
 */
function planRecipe(row: PlanRow, fridge: string[], urgent: string[]) {
  const att: RecipeAttachment | null = readRecipeAttachment(row)
  if (!att) {
    if (row.recipe_id) {
      // 여기 오면 스냅샷이 깨졌거나 비었다. 조용히 사라지는 유일한 경로라 로그를 남긴다.
      console.warn('식단 레시피 스냅샷을 읽지 못함:', row.id, row.recipe_source, row.recipe_id)
    }
    return null
  }
  return {
    source: att.source,
    id: att.id,
    ingredients: att.ingredients,
    ...scoreRecipe(att.ingredients, fridge, urgent),
  }
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
    `SELECT ${PLAN_COLUMNS},
            (SELECT COUNT(*) FROM meal_comments mc WHERE mc.meal_plan_id = meal_plans.id) AS comment_count
       FROM meal_plans
      WHERE family_id = ? AND plan_date BETWEEN ? AND ?
      ORDER BY plan_date ASC, created_at ASC`,
  )
    .bind(familyId, from, to)
    .all<PlanRow & { comment_count: number }>()
  const rows = results ?? []

  /* 냉장고는 **주 전체에 한 번**만 읽는다. 식단마다 읽으면 N+1 이다.
     레시피가 붙은 식단이 하나도 없으면 아예 안 읽는다. */
  const hasRecipe = rows.some((r) => r.recipe_id)
  const { fridge, urgent } = hasRecipe
    ? await loadFridge(c.env.DB, familyId)
    : { fridge: [], urgent: [] }

  /* 주간 목록에는 **개수만** 보낸다. 재료 배열까지 실으면 7일×3끼 만큼 곱해진다.
     0 도 의미가 있다("재료 다 있음"), 그래서 undefined 와 구분해서 내보낸다. */
  return c.json(
    rows.map((row) => {
      const recipe = planRecipe(row, fridge, urgent)
      const { recipe_ingredients: _drop, ...rest } = row
      return recipe ? { ...rest, missing_count: recipe.missing_items.length } : rest
    }),
  )
})

/* ── 등록 ────────────────────────────────────────────────── */

app.post('/', async (c) => {
  const user = c.get('user')
  const familyId = requireFamily(user)
  const b = await readJson<{
    plan_date: string
    meal_slot: string
    title: string
    memo?: string
    recipe_source?: unknown
    recipe_id?: unknown
    recipe_ingredients?: unknown
  }>(c.req)

  const planDate = String(b.plan_date ?? '')
  const slot = String(b.meal_slot ?? '') as Slot
  const title = String(b.title ?? '').trim()
  const memo = b.memo == null ? null : String(b.memo).trim().slice(0, MEMO_MAX) || null

  if (!DATE_RE.test(planDate)) throw new ApiError(422, '날짜를 YYYY-MM-DD 로 주세요.')
  if (!SLOTS.includes(slot)) throw new ApiError(422, '끼니는 아침/점심/저녁 중 하나여야 합니다.')
  if (!title) throw new ApiError(422, '무엇을 먹을지 적어주세요.')

  /* 레시피 연결은 **셋 다 있거나 셋 다 없거나**다. 반쪽 상태(조리법은 보이는데
     부족 재료는 못 세는 식단)를 여기서 막는다. 재료는 사용자가 보내는 배열이므로
     등록 API 와 같은 상한·정화를 거친다 — 검색 결과를 그대로 되돌려받는다고
     가정하지 않는다. */
  const att = parseRecipeAttachment(b)
  if (!att.ok) throw new ApiError(422, att.reason)
  const recipe = att.value

  const id = crypto.randomUUID()
  const now = nowIso()

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO meal_plans
         (id, family_id, plan_date, meal_slot, title, memo, created_by, created_by_name, created_at,
          recipe_source, recipe_id, recipe_ingredients)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, familyId, planDate, slot, title.slice(0, TITLE_MAX), memo, user.id, user.nickname, now,
      recipe?.source ?? null,
      recipe?.id ?? null,
      recipe ? JSON.stringify(recipe.ingredients) : null,
    ),
    notify(
      c.env.DB,
      familyId,
      'meal_plan',
      '새 식단이 올라왔어요',
      // 예전엔 `${title}을(를)` 이라 화면에 "계란후라이을(를) 올렸어요" 로 나왔다.
      `${user.nickname}님이 ${human(planDate)} ${SLOT_LABEL[slot]}에 ${withJosa(title.slice(0, 60), '을')} 올렸어요`,
      `/calendar/${id}`,
      user.id,
    ),
  ])

  return c.json({ id, plan_date: planDate, meal_slot: slot, title, memo, recipe }, 201)
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

  /* 레시피가 안 붙었으면 냉장고를 읽지 않는다. 대부분의 식단이 그렇다.
     **카탈로그(공공 API)는 여기서 만지지 않는다** — 조리법은 사용자가
     "조리법 보기" 를 눌렀을 때 /recipes/one 이 따로 가져온다. 상세를 열
     때마다 1,146건을 읽으면 식단 화면이 공공 API 에 묶인다. */
  const { fridge, urgent } = plan.recipe_id
    ? await loadFridge(c.env.DB, familyId)
    : { fridge: [], urgent: [] }
  const { recipe_ingredients: _drop, ...rest } = plan
  const recipe = planRecipe(plan, fridge, urgent)

  return c.json({ ...rest, recipe, comments: results ?? [] })
})

/* ── 수정 ────────────────────────────────────────────────── */

app.patch('/:id', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const plan = await findPlan(c.env.DB, c.req.param('id'), familyId)
  const b = await readJson<{
    title?: string
    memo?: string | null
    plan_date?: string
    meal_slot?: string
    recipe_source?: unknown
    recipe_id?: unknown
    recipe_ingredients?: unknown
  }>(c.req)

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
  /* 레시피 연결은 세 키 중 하나라도 오면 통째로 갈아끼운다.
     하나도 안 오면 손대지 않는다 — PATCH 는 보낸 것만 바꾼다.
     `parseRecipeAttachment` 가 null 을 주면 연결을 떼는 것이다 (셋 다 NULL). */
  if ('recipe_source' in b || 'recipe_id' in b || 'recipe_ingredients' in b) {
    const att = parseRecipeAttachment(b)
    if (!att.ok) throw new ApiError(422, att.reason)
    sets.push('recipe_source = ?', 'recipe_id = ?', 'recipe_ingredients = ?')
    binds.push(
      att.value?.source ?? null,
      att.value?.id ?? null,
      att.value ? JSON.stringify(att.value.ingredients) : null,
    )
  }

  if (!sets.length) throw new ApiError(422, '변경할 내용이 없습니다.')

  binds.push(plan.id, familyId)
  await c.env.DB.prepare(`UPDATE meal_plans SET ${sets.join(', ')} WHERE id = ? AND family_id = ?`)
    .bind(...binds)
    .run()

  // 수정은 알림을 만들지 않는다. 오타 한 번 고칠 때마다 가족 전원에게
  // 알림이 가면 알림 자체를 무시하게 된다.
  const updated = await findPlan(c.env.DB, plan.id, familyId)
  const { fridge, urgent } = updated.recipe_id
    ? await loadFridge(c.env.DB, familyId)
    : { fridge: [], urgent: [] }
  const { recipe_ingredients: _drop, ...rest } = updated
  return c.json({ ...rest, recipe: planRecipe(updated, fridge, urgent) })
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
