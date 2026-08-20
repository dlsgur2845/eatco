import { Hono } from 'hono'
import { ApiError, readJson } from '../lib/errors'
import { nowIso } from '../lib/dates'
import type { Env, Vars } from '../lib/types'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

/**
 * 재료 영양 캐시.
 *
 * Gemini 호출은 **브라우저가** 한다. 배포된 Worker 에서 Gemini 는 지역 차단되기
 * 때문이다(프로덕션 10회 측정에서 9회 "User location is not supported").
 * 영수증 스캔이 브라우저 직접 호출로 간 것과 같은 이유다.
 * Worker 는 캐시 읽기/쓰기만 한다.
 *
 * 테이블은 가족 구분이 없는 전역 캐시다. 재료의 영양성분은 가족마다 다르지 않다.
 */

export interface NutritionRow {
  normalized_name: string
  kcal_per_100g: number | null
  kcal_per_100ml: number | null
  kcal_per_piece: number | null
  carb_g: number | null
  protein_g: number | null
  fat_g: number | null
  source: string
  confidence: number
}

app.get('/', async (c) => {
  const raw = (c.req.query('names') || '').trim()
  if (!raw) return c.json([])
  const names = [...new Set(raw.split(',').map((n) => n.trim()).filter(Boolean))].slice(0, 50)
  if (!names.length) return c.json([])
  const ph = names.map(() => '?').join(',')
  const { results } = await c.env.DB.prepare(
    `SELECT normalized_name, kcal_per_100g, kcal_per_100ml, kcal_per_piece,
            carb_g, protein_g, fat_g, source, confidence
       FROM ingredient_nutrition WHERE normalized_name IN (${ph})`,
  )
    .bind(...names)
    .all<NutritionRow>()
  return c.json(results ?? [])
})

interface UpsertBody {
  items: {
    normalized_name: string
    basis: 'g' | 'ml' | 'piece'
    kcal: number
    carb_g: number | null
    protein_g: number | null
    fat_g: number | null
    confidence?: number
  }[]
}

app.post('/', async (c) => {
  const body = await readJson<UpsertBody>(c.req)
  const items = (body.items ?? []).slice(0, 50)
  if (!items.length) throw new ApiError(422, '저장할 항목이 없습니다.')

  const now = nowIso()
  const stmts = items
    .filter((it) => it.normalized_name && Number.isFinite(Number(it.kcal)))
    .map((it) => {
      const kcal = Number(it.kcal)
      const g = it.basis === 'g' ? kcal : null
      const ml = it.basis === 'ml' ? kcal : null
      const piece = it.basis === 'piece' ? kcal : null
      const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))
      // 사용자가 직접 고친 값(source='user')은 자동 추정으로 덮어쓰지 않는다.
      return c.env.DB.prepare(
        `INSERT INTO ingredient_nutrition
           (normalized_name, kcal_per_100g, kcal_per_100ml, kcal_per_piece,
            carb_g, protein_g, fat_g, source, confidence, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'gemini', ?, ?)
         ON CONFLICT(normalized_name) DO UPDATE SET
           kcal_per_100g = excluded.kcal_per_100g,
           kcal_per_100ml = excluded.kcal_per_100ml,
           kcal_per_piece = excluded.kcal_per_piece,
           carb_g = excluded.carb_g,
           protein_g = excluded.protein_g,
           fat_g = excluded.fat_g,
           confidence = excluded.confidence,
           updated_at = excluded.updated_at
         WHERE ingredient_nutrition.source <> 'user'`,
      ).bind(
        it.normalized_name.slice(0, 100),
        g, ml, piece,
        num(it.carb_g), num(it.protein_g), num(it.fat_g),
        Math.max(0, Math.min(1, Number(it.confidence ?? 0.7))),
        now,
      )
    })
  if (!stmts.length) throw new ApiError(422, '유효한 항목이 없습니다.')
  await c.env.DB.batch(stmts)
  return c.json({ cached: stmts.length })
})

export default app
