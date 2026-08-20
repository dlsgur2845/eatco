import api from './client'

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

interface ScanConfig {
  api_key: string
  models: string[]
}

/**
 * 재료 영양 조회.
 *
 * 캐시에 없는 것만 **브라우저에서** Gemini 로 한 번에 묶어 부른다.
 * - Worker 에서 부르면 지역 차단으로 90% 실패한다 (영수증 스캔이 브라우저로 간 이유와 동일)
 * - 무료 티어가 모델당 분당 20회라 재료마다 따로 부르면 금방 걸린다. 배열로 한 번에.
 */
export async function getNutrition(names: string[]): Promise<Map<string, NutritionRow>> {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  const map = new Map<string, NutritionRow>()
  if (!uniq.length) return map

  const cached = await api.get<NutritionRow[]>(`/nutrition?names=${encodeURIComponent(uniq.join(','))}`)
  for (const r of cached.data) map.set(r.normalized_name, r)

  const missing = uniq.filter((n) => !map.has(n))
  if (!missing.length) return map

  const fresh = await estimateViaBrowser(missing)
  for (const r of fresh) map.set(r.normalized_name, r)

  // 캐시에 심어둔다. 실패해도 이번 계산에는 지장 없다.
  if (fresh.length) {
    api
      .post('/nutrition', {
        items: fresh.map((r) => ({
          normalized_name: r.normalized_name,
          basis: r.kcal_per_100ml != null ? 'ml' : r.kcal_per_piece != null ? 'piece' : 'g',
          kcal: r.kcal_per_100g ?? r.kcal_per_100ml ?? r.kcal_per_piece ?? 0,
          carb_g: r.carb_g,
          protein_g: r.protein_g,
          fat_g: r.fat_g,
          confidence: r.confidence,
        })),
      })
      .catch(() => {})
  }
  return map
}

interface RawEstimate {
  name?: string
  basis?: string
  kcal?: number
  carb_g?: number
  protein_g?: number
  fat_g?: number
  confidence?: number
}

async function estimateViaBrowser(names: string[]): Promise<NutritionRow[]> {
  const cfg = (await api.get<ScanConfig>('/scan/config')).data

  const prompt =
    `다음 식재료 각각의 영양성분을 추정해주세요.\n` +
    `재료: ${names.join(', ')}\n\n` +
    `규칙:\n` +
    `- basis: 고기/채소/곡물 등 무게 재료는 "100g", 음료/국물은 "100ml", 계란/바나나 등 낱개 재료는 "piece"\n` +
    `- kcal, carb_g(탄수화물), protein_g(단백질), fat_g(지방) 은 그 basis 기준 값\n` +
    `- confidence 는 잘 모르면 0.3 이하\n\n` +
    `JSON 배열로만 답하세요:\n` +
    `[{"name":"재료명","basis":"100g|100ml|piece","kcal":숫자,"carb_g":숫자,"protein_g":숫자,"fat_g":숫자,"confidence":0~1}]`

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  })

  for (const model of cfg.models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.api_key }, body },
      )
      if (!res.ok) continue
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
      if (!text) continue
      const rows = JSON.parse(text) as RawEstimate[]
      return rows.filter((r) => r?.name).map(toRow)
    } catch {
      // 다음 폴백 모델로
    }
  }
  return []
}

function toRow(r: RawEstimate): NutritionRow {
  const kcal = Number(r.kcal) || 0
  const basis = String(r.basis ?? '100g')
  const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))
  return {
    normalized_name: String(r.name).trim(),
    kcal_per_100g: basis.includes('g') && !basis.includes('ml') ? kcal : null,
    kcal_per_100ml: basis.includes('ml') ? kcal : null,
    kcal_per_piece: basis === 'piece' ? kcal : null,
    carb_g: num(r.carb_g),
    protein_g: num(r.protein_g),
    fat_g: num(r.fat_g),
    source: 'gemini',
    confidence: Math.max(0, Math.min(1, Number(r.confidence ?? 0.7))),
  }
}
