import api from './client'
import type { Ingredient } from '../types'

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

/**
 * 대시보드가 다루는 재료.
 *
 * `Ingredient` 를 **그대로 확장한다.** 예전에는 9개 필드만 따로 선언했는데,
 * 서버는 16개를 다 보낸다(`GET /scan/items` 는 `SELECT *` + `days_left`).
 * 되돌리기가 재등록으로 바뀌면서 `normalized_name`·`amount_value`·`unit` 같은
 * 필드를 그대로 되돌려줘야 하는데, 좁은 타입으로는 그게 컴파일에 안 잡힌다.
 *
 * `normalized_name` 이 특히 중요하다 — 워커의 `loadFridge` 가
 * `normalized_name || name` 으로 레시피를 매칭한다. 되돌리며 이걸 잃으면
 * 되돌린 뒤 추천이 되돌리기 전과 달라진다.
 */
export interface DashboardItem extends Omit<Ingredient, 'storage_method'> {
  /** 서버가 소문자로 내려준다 (`scan.ts` 의 `shape()`). */
  storage_method: string
  registered_by: string | null
  days_left: number
}

/**
 * 영수증/주문내역 분석. **서버(Worker)에서 Gemini 를 호출한다.**
 *
 * 예전에는 브라우저에서 Gemini 를 직접 불렀다. Worker 에서 부르면 10번 중
 * 9번이 지역차단("User location is not supported")이었기 때문이다. 그러느라
 * /scan/config 로 API 키를 클라이언트에 내려줘야 했고, 로그인한 사람은 누구나
 * 개발자도구 한 줄로 키를 꺼내 앱 밖에서 쓸 수 있었다.
 *
 * Smart Placement 로 Worker 가 D1 옆(싱가포르)에서 돌게 되면서 서버 호출이
 * 15/15 성공으로 바뀌었다. 실제 이미지로 /scan/analyze 를 5회 호출해 3~6초에
 * 정상 인식되는 것도 확인했다. 키를 내보낼 이유가 없어져서 되돌렸다.
 *
 * CPU 우려도 근거가 없다. 원래 걱정은 "10MB 원본을 base64 로 감싸면 무료
 * 티어 예산 초과" 였는데, downscaleImage 가 1600px/q0.75 로 줄여서 150~400KB
 * 로 보낸다.
 */
export async function analyzeReceipt(file: File, signal?: AbortSignal): Promise<ScanResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const resp = await api.post<ScanResponse>('/scan/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // signal 이 없던 동안 «취소» 버튼은 화면만 멈췄다. 요청은 끝까지 갔고,
    // 응답이 도착하면 취소한 뒤에 결과 모달이 튀어나왔다. Gemini 쿼터도 생으로 나갔다.
    signal,
  })
  return resp.data
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

/**
 * 지운 재료를 다시 넣는다 — 「되돌리기」용.
 *
 * 예전 되돌리기는 삭제를 3초 **미루는** 방식이었다. 그 3초 안에 새로고침하거나
 * 앱을 닫으면 타이머가 죽어서 삭제가 아예 안 나갔다. 화면에서만 사라지고 서버엔
 * 남았다 — 다 썼다고 믿은 재료가 냉장고에 계속 있고 추천도 계속 틀렸다.
 * 이제 삭제는 즉시 하고, 되돌리기가 **다시 등록**한다.
 *
 * `normalized_name` 을 반드시 같이 보낸다. 워커의 `loadFridge` 가
 * `normalized_name || name` 으로 레시피를 매칭하므로, 이걸 잃으면 되돌린 뒤
 * 추천 결과가 되돌리기 전과 달라진다.
 *
 * `expiry_date` 는 10자로 자른다. 서버가 `^\d{4}-\d{2}-\d{2}$` 로 검증하는데
 * 오래된 행에 시각이 붙어 있으면 422 가 나고 재료가 영영 사라진다.
 * (`InventoryPage` 도 같은 이유로 자른다.)
 *
 * **돌려주는 행은 새 id 를 가진다.** 호출부는 반드시 이 응답으로 교체해야 한다 —
 * 옛 id 를 그대로 쓰면 그 행의 삭제·수정 버튼이 없는 id 를 때려 404 가 난다.
 */
export async function restoreItem(item: DashboardItem): Promise<DashboardItem> {
  const resp = await api.post<DashboardItem>('/ingredients', {
    name: item.name,
    category_id: item.category_id,
    storage_method: item.storage_method,
    quantity: item.quantity,
    amount_value: item.amount_value,
    unit: item.unit,
    price: item.price,
    expiry_date: item.expiry_date.slice(0, 10),
    image_url: item.image_url,
    store_name: item.store_name,
    normalized_name: item.normalized_name,
  })
  return resp.data
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
  /**
   * 전부 실패했을 때 **서버가 말한 이유**.
   *
   * allSettled 는 거절 사유를 통째로 버린다. 그래서 워커가
   * "AI 기능이 일시적으로 중단됐어요"(지역차단 503) 라고 정확히 말해줘도
   * 화면에는 "사진을 읽지 못했어요" 가 떴다 — **사진 탓이 아닌데 사진 탓을 하니
   * 사용자는 다시 찍는다.** 아무리 다시 찍어도 안 된다.
   * 실제로 프로덕션에서 났다(2026-08-27, Smart Placement 가 차단 리전으로 이동).
   */
  failureDetail: string | null
}

/** axios 오류에서 서버가 준 문구만 꺼낸다. 없으면 null. */
function serverDetail(e: unknown): string | null {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === 'string' && d.trim() ? d : null
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
  signal?: AbortSignal,
): Promise<MultiScanResult> {
  const list = files.slice(0, MAX_SCAN_IMAGES)
  let done = 0

  const settled = await Promise.allSettled(
    list.map((f) =>
      analyzeReceipt(f, signal).finally(() => {
        done += 1
        onProgress?.(done, list.length)
      }),
    ),
  )

  const ok = settled.map((r) => (r.status === 'fulfilled' ? r.value : null))

  // 거절 사유 중 **서버가 문구를 준 첫 번째**를 살린다. 네트워크 끊김처럼
  // 서버 문구가 없는 실패는 null 로 두고 호출부의 기본 문구를 쓰게 한다.
  const detail = settled
    .map((r) => (r.status === 'rejected' ? serverDetail(r.reason) : null))
    .find((d): d is string => d !== null) ?? null

  return { ...mergeScans(ok), failureDetail: detail }
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
    failureDetail: null,
  }
}
