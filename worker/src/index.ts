import { Hono } from 'hono'
import { onError } from './lib/errors'
import { requireUser } from './lib/identity'
import { todayKst, hourKst, nowIso } from './lib/dates'
import type { Env, Vars } from './lib/types'
import { visionModels } from './lib/gemini'

import auth from './routes/auth'
import ingredients from './routes/ingredients'
import dashboard from './routes/dashboard'
import storage from './routes/storage'
import categories, { DEFAULT_CATEGORIES } from './routes/categories'
import scan from './routes/scan'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()
app.onError(onError)

// ── 공개 (인증 불필요) ─────────────────────────────────────────
app.get('/api/health', async (c) => {
  const components: Record<string, string> = {}
  let ok = true
  try {
    await c.env.DB.prepare('SELECT 1').first()
    components.database = 'ok'
  } catch (e) {
    console.error('헬스체크: D1 실패', e)
    components.database = 'error'
    ok = false
  }
  components.gemini_key = c.env.GEMINI_API_KEY ? 'ok' : 'missing'
  components.access = c.env.ACCESS_TEAM_DOMAIN ? 'ok' : 'not_configured'
  return c.json({ status: ok ? 'ok' : 'degraded', components }, ok ? 200 : 503)
})

app.get('/api/health/ai', async (c) => {
  const { generate } = await import('./lib/gemini')
  try {
    const text = await generate(c.env, ['ok 라고만 답하세요.'], {
      models: visionModels(c.env),
      timeoutMs: 15_000,
    })
    return c.json({ status: 'ok', models: visionModels(c.env), sample: text.slice(0, 40) })
  } catch (e) {
    return c.json({
      status: 'error',
      models: visionModels(c.env),
      detail: e instanceof Error ? e.message : String(e),
    })
  }
})

// ── 인증 필요 ─────────────────────────────────────────────────
app.use('/api/*', requireUser)

app.route('/api/auth', auth) // /api/auth/me, /api/auth/family...
app.route('/api/ingredients', ingredients)
app.route('/api/dashboard', dashboard)
app.route('/api/storage-guide', storage)
app.route('/api/categories', categories)
app.route('/api/scan', scan)

// 매칭 안 된 /api/* 는 HTML 대신 404 JSON. 프론트가 파싱 에러로 죽지 않게.
app.all('/api/*', (c) => c.json({ detail: 'Not Found' }, 404))

export default {
  fetch: app.fetch,

  /**
   * 소비기한 알림 (매시 정각).
   * 예전 APScheduler 는 15분 간격 인메모리 + (now-15분, now] 윈도우라,
   * 배포/재시작으로 한 틱을 놓치면 그 창의 알림이 영구히 유실됐다 (따라잡기 없음).
   * 여기서는 DB 의 push_time 기준으로 "이번 시각" 을 고른다. 한 번 걸러도
   * 다음 실행이 같은 조건을 다시 만족시키고, 중복 생성은 아래 dedupe 로 막는다.
   */
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const today = todayKst()
    const hh = hourKst().slice(0, 2)

    const { results: settings } = await env.DB.prepare(
      `SELECT family_id, days_before FROM notification_settings
        WHERE enabled = 1 AND family_id IS NOT NULL AND substr(push_time, 1, 2) = ?`,
    )
      .bind(hh)
      .all<{ family_id: string; days_before: number }>()

    let created = 0
    for (const s of settings ?? []) {
      const target = new Date(new Date(today + 'T00:00:00Z').getTime() + s.days_before * 86_400_000)
        .toISOString()
        .slice(0, 10)

      const { results: items } = await env.DB.prepare(
        'SELECT name FROM ingredients WHERE family_id = ? AND expiry_date = ?',
      )
        .bind(s.family_id, target)
        .all<{ name: string }>()
      if (!items?.length) continue

      // 같은 (가족, days_before) 알림이 오늘 이미 있으면 건너뛴다 -> 멱등.
      const dup = await env.DB.prepare(
        `SELECT 1 FROM notification_logs
          WHERE family_id = ? AND days_before = ? AND date(created_at) = ?`,
      )
        .bind(s.family_id, s.days_before, today)
        .first()
      if (dup) continue

      const names = items.map((i) => i.name)
      const title =
        s.days_before === 0 ? '오늘까지예요' : `${s.days_before}일 뒤 소비기한이에요`
      const message =
        names.length <= 3
          ? names.join(', ')
          : `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}개`

      await env.DB.prepare(
        `INSERT INTO notification_logs
           (id, family_id, type, title, message, is_read, link, days_before, created_at)
         VALUES (?, ?, 'EXPIRY', ?, ?, 0, '/', ?, ?)`,
      )
        .bind(crypto.randomUUID(), s.family_id, title, message, s.days_before, nowIso())
        .run()
      created++
    }
    if (created) console.log(`소비기한 알림 ${created}건 생성 (${hh}시)`)
  },
} satisfies ExportedHandler<Env>

/** 카테고리 시드 — 최초 1회. 라우터에서 참조만 하고 실행은 하지 않는다. */
export async function seedCategories(db: D1Database) {
  const exists = await db.prepare('SELECT 1 FROM categories LIMIT 1').first()
  if (exists) return 0
  await db.batch(
    DEFAULT_CATEGORIES.map((name) =>
      db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').bind(crypto.randomUUID(), name),
    ),
  )
  return DEFAULT_CATEGORIES.length
}
