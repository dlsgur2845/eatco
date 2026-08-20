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
  /** 여러 장에서 같은 항목이 나왔을 때 몇 장에서 나왔는지. 1이면 표시하지 않는다. */
  duplicate_count?: number
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


/* ──────────────────────────────────────────────
   여러 장 한 번에

   온라인 주문내역은 한 화면에 다 안 들어와서 스크롤하며 여러 장을 찍게 된다.
   ────────────────────────────────────────────── */

/** Gemini 무료 한도가 분당 20회다. 5장이면 연속 두 번 스캔해도 안전하다. */
export const MAX_SCAN_IMAGES = 5

export interface MultiScanResult extends ScanResponse {
  attempted: number
  succeeded: number
  failed: number
}

/** 중복 판정 키. 이름의 공백·대소문자 차이는 같은 것으로 본다. */
function dedupeKey(it: ScannedItem): string {
  const name = (it.normalized_name || it.name).replace(/\s+/g, '').toLowerCase()
  return `${name}|${it.price ?? ''}`
}

/**
 * 여러 장을 동시에 보낸다.
 *
 * 순차로 돌리면 5장에 45초다(장당 실측 9초대). 동시에 보내면 12초대로 끝난다.
 * allSettled 를 쓰는 이유: 5장 중 1장이 흐려서 실패해도 나머지 4장 결과는
 * 살려야 한다. 사진 찍고 기다린 걸 전부 버리게 하면 안 된다.
 *
 * onProgress 는 "몇 장 끝났는지" 를 알려준다. 진행률이 아니라 완료 개수다 —
 * 각 장이 얼마나 남았는지는 알 수 없으므로 거짓말하지 않는다.
 */
export async function analyzeReceipts(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<MultiScanResult> {
  const list = files.slice(0, MAX_SCAN_IMAGES)
  let done = 0

  const settled = await Promise.allSettled(
    list.map((f) =>
      analyzeReceipt(f).finally(() => {
        done += 1
        onProgress?.(done, list.length)
      }),
    ),
  )

  const ok = settled.map((r) => (r.status === 'fulfilled' ? r.value : null))
  return mergeScans(ok)
}

/**
 * 장별 결과를 하나로 합친다. null 은 실패한 장이다.
 *
 * 같은 장 안의 중복은 세지 않는다 — Gemini 가 이미 한 번만 넣도록 지시받았고,
 * 진짜로 두 개를 산 경우일 수 있다. **다른 장**에서 같은 항목이 나올 때만
 * 겹쳐 찍은 것으로 보고 합친다.
 */
export function mergeScans(results: (ScanResponse | null)[]): MultiScanResult {
  const merged: ScannedItem[] = []
  const seen = new Map<string, { item: ScannedItem; sources: Set<number> }>()
  let storeName: string | null = null
  let succeeded = 0

  results.forEach((r, idx) => {
    if (!r) return
    succeeded += 1
    if (!storeName && r.store_name) storeName = r.store_name

    const inThisShot = new Set<string>()
    for (const item of r.items) {
      const k = dedupeKey(item)
      const hit = seen.get(k)
      if (hit) {
        // 같은 장 안에서 또 나온 것은 별개 항목으로 둔다.
        if (inThisShot.has(k)) {
          merged.push({ ...item })
          continue
        }
        hit.sources.add(idx)
        hit.item.duplicate_count = hit.sources.size
      } else {
        const copy = { ...item }
        seen.set(k, { item: copy, sources: new Set([idx]) })
        merged.push(copy)
      }
      inThisShot.add(k)
    }
  })

  return {
    items: merged,
    total: merged.length,
    store_name: storeName,
    attempted: results.length,
    succeeded,
    failed: results.length - succeeded,
  }
}
