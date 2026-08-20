import { Hono } from 'hono'
import { ApiError, readJson } from '../lib/errors'
import { requireFamily } from '../lib/identity'
import { generateJson, visionModels, type InlineImage } from '../lib/gemini'
import { RECEIPT_PROMPT } from '../data/receipt-prompt'
import { todayKst, addDays, nowIso, daysBetween } from '../lib/dates'
import type { Env, Vars } from '../lib/types'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * 업로드 상한을 10MB -> 2MB 로 낮췄다.
 * 프론트가 업로드 전에 1600px/q0.75 로 줄이므로 영수증은 150~400KB 로 떨어진다.
 * Worker 는 무료 티어 CPU 10ms 인데 10MB 를 base64 로 감싸면(~13MB) 인코딩만으로
 * 예산을 몇 배 넘긴다. 원본을 그대로 받을 이유가 없다.
 */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

interface GeminiItem {
  name?: string
  normalized_name?: string | null
  quantity?: string | number | null
  price?: number | null
  storage_method?: string
  shelf_life_days?: number
}
interface GeminiResult {
  store_name?: string | null
  items?: GeminiItem[]
}

app.post('/analyze', async (c) => {
  requireFamily(c.get('user'))

  const form = await c.req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw new ApiError(422, '이미지 파일을 첨부해주세요.')
  if (!ALLOWED_TYPES.has(file.type)) throw new ApiError(422, 'JPG, PNG, WebP 이미지만 지원합니다.')
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(413, '이미지가 너무 큽니다. 앱을 새로고침한 뒤 다시 시도해주세요.')
  }

  const image: InlineImage = {
    kind: 'image',
    data: await file.arrayBuffer(),
    mimeType: file.type,
  }

  const parsed = await generateJson<GeminiResult | GeminiItem[]>(c.env, [image, RECEIPT_PROMPT], {
    models: visionModels(c.env),
    temperature: 0.1,
    timeoutMs: 60_000,
  })

  let storeName: string | null = null
  let entries: GeminiItem[] = []
  if (Array.isArray(parsed)) {
    entries = parsed // 이전 형식 호환
  } else if (parsed && Array.isArray(parsed.items)) {
    storeName = parsed.store_name ?? null
    entries = parsed.items
  } else {
    throw new ApiError(503, 'AI 응답 형식이 올바르지 않습니다.')
  }

  const today = todayKst()
  const items = entries
    .filter((e) => e && typeof e.name === 'string' && e.name.trim())
    .map((e) => {
      const shelf = Number.isFinite(Number(e.shelf_life_days)) ? Number(e.shelf_life_days) : 5
      return {
        name: String(e.name).trim(),
        normalized_name: e.normalized_name ?? null,
        quantity: e.quantity == null ? null : String(e.quantity),
        price: e.price == null ? null : Math.trunc(Number(e.price)) || null,
        storage_method: normalizeStorage(e.storage_method),
        shelf_life_days: shelf,
        expiry_date: addDays(today, shelf),
        confidence: 0.9,
      }
    })

  return c.json({ items, total: items.length, store_name: storeName })
})

function normalizeStorage(v: unknown): string {
  const s = String(v ?? 'refrigerated').toLowerCase()
  return ['refrigerated', 'frozen', 'room_temp'].includes(s) ? s : 'refrigerated'
}

interface RegisterBody {
  items: {
    name: string
    normalized_name?: string | null
    quantity?: string | null
    price?: number | null
    storage_method?: string
    expiry_date: string
  }[]
  store_name?: string | null
}

app.post('/register', async (c) => {
  const user = c.get('user')
  const familyId = requireFamily(user)
  const body = await readJson<RegisterBody>(c.req)
  const items = body.items ?? []
  if (!items.length) throw new ApiError(422, '등록할 식재료가 없습니다.')
  if (items.length > 100) throw new ApiError(422, '한 번에 100개까지 등록할 수 있습니다.')

  const now = nowIso()
  const stmts = items.map((it) => {
    const expiry = String(it.expiry_date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw new ApiError(422, '소비기한이 올바르지 않습니다.')
    return c.env.DB.prepare(
      `INSERT INTO ingredients
         (id, name, category_id, storage_method, quantity, amount_value, unit, price,
          expiry_date, registered_at, image_url, family_id, registered_by, store_name, normalized_name)
       VALUES (?, ?, NULL, ?, ?, NULL, NULL, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      String(it.name ?? '').trim().slice(0, 200),
      normalizeStorage(it.storage_method).toUpperCase(),
      it.quantity == null ? null : String(it.quantity).slice(0, 50),
      it.price == null ? null : Math.trunc(Number(it.price)),
      expiry,
      now,
      familyId,
      user.nickname,
      body.store_name ?? null,
      it.normalized_name ?? null,
    )
  })

  // D1 batch 는 원자적이다. 일부만 들어가는 상태가 없다.
  await c.env.DB.batch(stmts)
  return c.json({ registered: stmts.length })
})

/**
 * 브라우저가 Gemini 를 직접 호출하기 위한 설정.
 *
 * 왜 서버에서 안 부르는가: 배포된 Worker 에서 Gemini 가 지역 차단된다
 * (프로덕션 10회 측정에서 9회 "User location is not supported").
 * Worker egress 위치는 통제 불가, 지역 고정은 Enterprise 전용.
 * 사용자의 폰은 한국에 있어서 직접 호출하면 문제가 없다.
 *
 * 키는 정적 번들에 넣지 않고 이 엔드포인트로만 내려준다.
 * Access 인증을 통과한 가족만 받을 수 있다.
 */
app.get('/config', (c) => {
  if (!c.env.GEMINI_API_KEY) throw new ApiError(503, 'AI 기능이 설정되지 않았습니다.')
  return c.json({
    api_key: c.env.GEMINI_API_KEY,
    models: visionModels(c.env),
    prompt: RECEIPT_PROMPT,
    max_bytes: MAX_IMAGE_BYTES,
  })
})

// ── 프론트가 쓰는 /scan/items 계약 (재고 화면) ──────────────────
app.get('/items', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM ingredients WHERE family_id = ? ORDER BY expiry_date ASC',
  )
    .bind(familyId)
    .all<Record<string, unknown>>()
  const today = todayKst()
  return c.json(
    (results ?? []).map((r) => ({
      ...r,
      storage_method: String(r.storage_method).toLowerCase(),
      days_left: daysBetween(today, String(r.expiry_date)),
    })),
  )
})

app.patch('/items/:id', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const b = await readJson<{ quantity: string; name: string; price: number; expiry_date: string }>(c.req)
  const sets: string[] = []
  const binds: unknown[] = []
  if (b.name !== undefined) { sets.push('name = ?'); binds.push(String(b.name).slice(0, 200)) }
  if (b.quantity !== undefined) { sets.push('quantity = ?'); binds.push(b.quantity == null ? null : String(b.quantity).slice(0, 50)) }
  if (b.price !== undefined) { sets.push('price = ?'); binds.push(b.price == null ? null : Math.trunc(Number(b.price))) }
  if (b.expiry_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.expiry_date))) throw new ApiError(422, '소비기한이 올바르지 않습니다.')
    sets.push('expiry_date = ?'); binds.push(String(b.expiry_date))
  }
  if (!sets.length) throw new ApiError(422, '변경할 내용이 없습니다.')
  binds.push(c.req.param('id'), familyId)
  const res = await c.env.DB.prepare(`UPDATE ingredients SET ${sets.join(', ')} WHERE id = ? AND family_id = ?`)
    .bind(...binds)
    .run()
  if (!res.meta.changes) throw new ApiError(404, '식재료를 찾을 수 없습니다.')
  return c.json({ updated: true })
})

app.delete('/items/:id', async (c) => {
  const familyId = requireFamily(c.get('user'))
  const res = await c.env.DB.prepare('DELETE FROM ingredients WHERE id = ? AND family_id = ?')
    .bind(c.req.param('id'), familyId)
    .run()
  if (!res.meta.changes) throw new ApiError(404, '식재료를 찾을 수 없습니다.')
  return c.json({ deleted: true })
})

export default app
