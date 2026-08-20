import { Hono } from 'hono'
import { STORAGE_GUIDES, type StorageGuide } from '../data/storage-guides'
import type { Env, Vars } from '../lib/types'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

/** guide 하나가 가진 모든 검색어 (대표 keyword + 별칭). */
function allKeywords(g: StorageGuide): string[] {
  return [g.keyword, ...g.keywords]
}

app.get('/lookup', (c) => {
  const name = (c.req.query('name') || '').toLowerCase()
  if (!name) return c.json(null)

  // 가장 긴 키워드가 이긴다. "순두부" 가 "두부" 보다 우선.
  let best: StorageGuide | null = null
  let bestLen = 0
  for (const g of STORAGE_GUIDES) {
    for (const kw of allKeywords(g)) {
      const k = kw.trim().toLowerCase()
      if (k.length >= 2 && name.includes(k) && k.length > bestLen) {
        best = g
        bestLen = k.length
      }
    }
  }
  return c.json(best)
})

app.get('/suggest', (c) => {
  const q = (c.req.query('q') || '').trim().toLowerCase()
  if (!q) return c.json([])
  const limit = Math.min(Number(c.req.query('limit') || 10) || 10, 50)

  const matches: { priority: number; g: StorageGuide }[] = []
  for (const g of STORAGE_GUIDES) {
    for (const kw of allKeywords(g)) {
      const k = kw.trim().toLowerCase()
      if (k && k.includes(q)) {
        matches.push({ priority: k.startsWith(q) ? 0 : 1, g })
        break // 같은 guide 중복 방지
      }
    }
  }
  matches.sort((a, b) => a.priority - b.priority || a.g.keyword.length - b.g.keyword.length)
  return c.json(matches.slice(0, limit).map((m) => m.g))
})

export default app
