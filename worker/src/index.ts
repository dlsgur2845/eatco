import { Hono } from 'hono'

export interface Env {
  ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) =>
  c.json({ status: 'ok', runtime: 'workers', ts: new Date().toISOString() })
)

// /api/* 중 매칭되지 않은 것은 명시적으로 404 JSON. 예전 배포처럼 HTML 이
// 돌아가면 프론트가 파싱 에러로 죽어서 원인 파악이 어렵다.
app.all('/api/*', (c) => c.json({ detail: 'Not Found' }, 404))

export default app
