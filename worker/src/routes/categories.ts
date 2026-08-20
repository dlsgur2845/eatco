import { Hono } from 'hono'
import type { Env, Vars } from '../lib/types'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

export const DEFAULT_CATEGORIES = [
  '유제품', '채소/과일', '육류/수산', '가공식품', '음료', '양념/소스', '곡류/면류', '기타',
]

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, name FROM categories ORDER BY name').all()
  return c.json(results ?? [])
})

export default app
