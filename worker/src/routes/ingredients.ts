import { Hono } from 'hono'
import { ApiError, readJson } from '../lib/errors'
import { requireFamily } from '../lib/identity'
import { todayKst, daysBetween, nowIso } from '../lib/dates'
import type { Env, Vars } from '../lib/types'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

const STORAGE = ['REFRIGERATED', 'FROZEN', 'ROOM_TEMP'] as const
type Storage = (typeof STORAGE)[number]
const UNITS = ['g', 'ml', 'piece'] as const

/** API 는 소문자(refrigerated), DB 는 대문자(REFRIGERATED) 로 저장한다.
 *  기존 Postgres 가 Enum 이름을 저장하고 있어서 그 형태를 그대로 유지한다.
 *  (같은 테이블의 unit 은 반대로 값(g/ml/piece)을 저장한다 — 헷갈리기 쉬운 지점.) */
function toDbStorage(v: unknown): Storage {
  const s = String(v ?? 'refrigerated').toUpperCase()
  if ((STORAGE as readonly string[]).includes(s)) return s as Storage
  throw new ApiError(422, '보관 방법이 올바르지 않습니다.')
}
function toApiStorage(v: string): string {
  return v.toLowerCase()
}

export interface IngredientRow {
  id: string
  name: string
  storage_method: string
  quantity: string | null
  amount_value: number | null
  unit: string | null
  price: number | null
  expiry_date: string
  registered_at: string
  registered_by: string | null
  store_name: string | null
  normalized_name: string | null
  family_id: string
  category_id: string | null
  image_url: string | null
}

export function shape(row: IngredientRow, today = todayKst()) {
  return {
    ...row,
    storage_method: toApiStorage(row.storage_method),
    days_left: daysBetween(today, row.expiry_date),
  }
}

app.get('/', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const search = (c.req.query('search') || '').trim()
  const storage = c.req.query('storage_method')

  let sql =
    'SELECT * FROM ingredients WHERE family_id = ?'
  const binds: unknown[] = [familyId]
  if (storage) {
    sql += ' AND storage_method = ?'
    binds.push(toDbStorage(storage))
  }
  if (search) {
    sql += ' AND (name LIKE ? OR normalized_name LIKE ?)'
    binds.push(`%${search}%`, `%${search}%`)
  }
  sql += ' ORDER BY expiry_date ASC'

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all<IngredientRow>()
  const today = todayKst()
  return c.json((results ?? []).map((r) => shape(r, today)))
})

app.post('/', async (c) => {
  const user = c.get('user')
  const familyId = requireFamily(user)
  const b = await readJson(c.req)

  const name = String(b.name ?? '').trim()
  if (!name) throw new ApiError(422, '이름을 입력해주세요.')
  const expiry = String(b.expiry_date ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw new ApiError(422, '소비기한이 올바르지 않습니다.')

  const amount = b.amount_value == null ? null : Number(b.amount_value)
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    throw new ApiError(422, '수량은 0 이상이어야 합니다.')
  }
  const unit = b.unit == null ? null : String(b.unit)
  if (unit != null && !(UNITS as readonly string[]).includes(unit)) {
    throw new ApiError(422, '단위는 g, ml, piece 중 하나여야 합니다.')
  }

  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO ingredients
       (id, name, category_id, storage_method, quantity, amount_value, unit, price,
        expiry_date, registered_at, image_url, family_id, registered_by, store_name, normalized_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      name.slice(0, 200),
      b.category_id ?? null,
      toDbStorage(b.storage_method),
      b.quantity == null ? null : String(b.quantity).slice(0, 50),
      amount,
      unit,
      b.price == null ? null : Math.trunc(Number(b.price)),
      expiry,
      nowIso(),
      b.image_url ?? null,
      familyId,
      user.nickname,
      b.store_name ?? null,
      b.normalized_name ?? null,
    )
    .run()

  const row = await c.env.DB.prepare('SELECT * FROM ingredients WHERE id = ?').bind(id).first<IngredientRow>()
  return c.json(shape(row!), 201)
})

app.patch('/:id', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const id = c.req.param('id')
  const b = await readJson(c.req)

  const sets: string[] = []
  const binds: unknown[] = []
  const put = (col: string, val: unknown) => {
    sets.push(`${col} = ?`)
    binds.push(val)
  }

  if (b.name !== undefined) put('name', String(b.name).slice(0, 200))
  if (b.quantity !== undefined) put('quantity', b.quantity == null ? null : String(b.quantity).slice(0, 50))
  if (b.price !== undefined) put('price', b.price == null ? null : Math.trunc(Number(b.price)))
  if (b.expiry_date !== undefined) {
    const e = String(b.expiry_date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) throw new ApiError(422, '소비기한이 올바르지 않습니다.')
    put('expiry_date', e)
  }
  if (b.storage_method !== undefined) put('storage_method', toDbStorage(b.storage_method))
  if (b.amount_value !== undefined) {
    const a = b.amount_value == null ? null : Number(b.amount_value)
    if (a != null && (!Number.isFinite(a) || a < 0)) throw new ApiError(422, '수량은 0 이상이어야 합니다.')
    put('amount_value', a)
  }
  if (b.unit !== undefined) {
    const u = b.unit == null ? null : String(b.unit)
    if (u != null && !(UNITS as readonly string[]).includes(u)) {
      throw new ApiError(422, '단위는 g, ml, piece 중 하나여야 합니다.')
    }
    put('unit', u)
  }
  if (!sets.length) throw new ApiError(422, '변경할 내용이 없습니다.')

  binds.push(id, familyId)
  const res = await c.env.DB.prepare(
    `UPDATE ingredients SET ${sets.join(', ')} WHERE id = ? AND family_id = ?`,
  )
    .bind(...binds)
    .run()
  if (!res.meta.changes) throw new ApiError(404, '식재료를 찾을 수 없습니다.')

  const row = await c.env.DB.prepare('SELECT * FROM ingredients WHERE id = ?').bind(id).first<IngredientRow>()
  return c.json(shape(row!))
})

app.delete('/:id', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const res = await c.env.DB.prepare('DELETE FROM ingredients WHERE id = ? AND family_id = ?')
    .bind(c.req.param('id'), familyId)
    .run()
  if (!res.meta.changes) throw new ApiError(404, '식재료를 찾을 수 없습니다.')
  return c.body(null, 204)
})

app.post('/batch-delete', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const b = await c.req.json<{ ids?: string[] }>().catch(() => ({}) as { ids?: string[] })
  const ids = (b.ids ?? []).filter((x) => typeof x === 'string')
  if (!ids.length) throw new ApiError(422, '삭제할 항목이 없습니다.')
  // family_id 를 같은 WHERE 에 둬서 남의 가족 것이 섞여 들어와도 지워지지 않게 한다.
  const placeholders = ids.map(() => '?').join(',')
  const res = await c.env.DB.prepare(
    `DELETE FROM ingredients WHERE family_id = ? AND id IN (${placeholders})`,
  )
    .bind(familyId, ...ids)
    .run()
  return c.json({ deleted: res.meta.changes })
})

export default app
