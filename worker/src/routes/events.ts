import { Hono } from 'hono'
import { readJson } from '../lib/errors'
import { nowIso } from '../lib/dates'
import type { Env, Vars } from '../lib/types'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

/**
 * 사용 이벤트 로깅 — 수요 검증용.
 * 예전 FastAPI 판에는 쓰기만 있고 읽기 엔드포인트가 없어서, 몇 달치 데이터를
 * 쌓아두고도 아무도 본 적이 없었다. 여기서는 조회도 같이 둔다.
 */
app.post('/', async (c) => {
  const user = c.get('user')
  const b = await readJson<{ event_type: string; metadata: unknown }>(c.req)
  const type = String(b.event_type ?? '').slice(0, 50)
  if (!type) return c.json({ logged: false })
  await c.env.DB.prepare(
    'INSERT INTO usage_events (id, family_code, event_type, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      user.family_id ?? user.id,
      type,
      b.metadata === undefined ? null : JSON.stringify(b.metadata),
      nowIso(),
    )
    .run()
  return c.json({ logged: true })
})

app.get('/summary', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    `SELECT date(created_at) AS day, event_type, COUNT(*) AS n
       FROM usage_events
      WHERE family_code = ?
      GROUP BY day, event_type
      ORDER BY day DESC
      LIMIT 100`,
  )
    .bind(user.family_id ?? user.id)
    .all()
  return c.json(results ?? [])
})

export default app
