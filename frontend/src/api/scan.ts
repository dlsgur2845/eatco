import api from './client'

export interface ScannedItem {
  name: string
  matched_keyword: string | null
  normalized_name: string | null
  storage_method: string
  shelf_life_days: number
  expiry_date: string
  confidence: number
  auto_matched: boolean
  quantity: string | null
  price: number | null
}

export interface ScanResponse {
  items: ScannedItem[]
  total: number
  store_name: string | null
}

export interface DashboardItem {
  id: string
  name: string
  storage_method: string
  quantity: string | null
  price: number | null
  expiry_date: string
  registered_at: string
  registered_by: string | null
  days_left: number
}

interface ScanConfig {
  api_key: string
  models: string[]
  prompt: string
  max_bytes: number
}

let configCache: ScanConfig | null = null

async function getScanConfig(): Promise<ScanConfig> {
  if (configCache) return configCache
  const resp = await api.get<ScanConfig>('/scan/config')
  configCache = resp.data
  return configCache
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/**
 * 영수증 분석은 **브라우저에서 Gemini 를 직접** 호출한다.
 *
 * 서버(Cloudflare Worker)에서 부르면 Gemini 가 지역 차단한다 — 프로덕션 10회
 * 측정에서 9회가 "User location is not supported for the API use" 였다.
 * Worker 의 egress 위치는 통제할 수 없고 지역 고정은 Enterprise 전용이다.
 * 사용자의 폰은 한국에 있어서 직접 부르면 문제가 없다.
 *
 * API 키는 정적 번들에 넣지 않는다. Access 인증을 통과한 뒤 /scan/config 로만
 * 받아온다. 실패하면 서버 경로로 폴백한다(운 좋게 허용 리전이면 동작).
 */
export async function analyzeReceipt(file: File): Promise<ScanResponse> {
  try {
    return await analyzeViaBrowser(file)
  } catch (err) {
    console.warn('브라우저 직접 호출 실패, 서버 경로로 폴백:', err)
    const formData = new FormData()
    formData.append('file', file)
    const resp = await api.post<ScanResponse>('/scan/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return resp.data
  }
}

async function analyzeViaBrowser(file: File): Promise<ScanResponse> {
  const cfg = await getScanConfig()
  const b64 = await fileToBase64(file)

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { inline_data: { mime_type: file.type || 'image/jpeg', data: b64 } },
          { text: cfg.prompt },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  })

  let lastErr: unknown = null
  for (const model of cfg.models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.api_key },
          body,
        },
      )
      if (!res.ok) {
        lastErr = new Error(`${model}: HTTP ${res.status}`)
        continue
      }
      const json = await res.json()
      return toScanResponse(json)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error('AI 호출에 실패했습니다.')
}

interface GeminiCandidatePart { text?: string }
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiCandidatePart[] } }[]
}

function toScanResponse(json: unknown): ScanResponse {
  const g = json as GeminiResponse
  const text = (g.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  if (!text) throw new Error('AI 응답이 비어 있습니다.')

  const parsed = JSON.parse(text) as
    | { store_name?: string | null; items?: RawItem[] }
    | RawItem[]

  const storeName = Array.isArray(parsed) ? null : (parsed.store_name ?? null)
  const raw = Array.isArray(parsed) ? parsed : (parsed.items ?? [])

  const today = new Date()
  const items: ScannedItem[] = raw
    .filter((r) => r && typeof r.name === 'string' && r.name.trim())
    .map((r) => {
      const shelf = Number.isFinite(Number(r.shelf_life_days)) ? Number(r.shelf_life_days) : 5
      const exp = new Date(today.getTime() + shelf * 86400000)
      const storage = ['refrigerated', 'frozen', 'room_temp'].includes(String(r.storage_method))
        ? String(r.storage_method)
        : 'refrigerated'
      return {
        name: String(r.name).trim(),
        matched_keyword: String(r.name).trim(),
        normalized_name: r.normalized_name ?? null,
        storage_method: storage,
        shelf_life_days: shelf,
        expiry_date: exp.toISOString().slice(0, 10),
        confidence: 0.9,
        auto_matched: true,
        quantity: r.quantity == null ? null : String(r.quantity),
        price: r.price == null ? null : Number(r.price) || null,
      }
    })

  return { items, total: items.length, store_name: storeName }
}

interface RawItem {
  name?: string
  normalized_name?: string | null
  quantity?: string | number | null
  price?: number | null
  storage_method?: string
  shelf_life_days?: number
}

export async function registerItems(items: ScannedItem[], storeName?: string | null): Promise<void> {
  await api.post('/scan/register', { items, store_name: storeName ?? null })
}

export async function getItems(): Promise<DashboardItem[]> {
  const resp = await api.get<DashboardItem[]>('/scan/items')
  return resp.data
}

export async function updateItem(itemId: string, data: { quantity?: string; name?: string }): Promise<void> {
  await api.patch(`/scan/items/${itemId}`, data)
}

export async function deleteItem(itemId: string): Promise<void> {
  await api.delete(`/scan/items/${itemId}`)
}
