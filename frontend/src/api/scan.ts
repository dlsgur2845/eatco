import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

export interface ScannedItem {
  name: string
  matched_keyword: string | null
  storage_method: string
  shelf_life_days: number
  expiry_date: string
  confidence: number
  auto_matched: boolean
}

export interface ScanResponse {
  items: ScannedItem[]
  total: number
}

export interface DashboardItem {
  id: string
  name: string
  storage_method: string
  expiry_date: string
  registered_at: string
  days_left: number
}

export async function verifyFamilyCode(code: string): Promise<{ valid: boolean; family_name: string }> {
  const resp = await api.get<{ valid: boolean; family_name: string }>(`/scan/verify?code=${encodeURIComponent(code)}`)
  return resp.data
}

export async function analyzeReceipt(file: File, familyCode: string): Promise<ScanResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const resp = await api.post<ScanResponse>(
    `/scan/analyze?code=${encodeURIComponent(familyCode)}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return resp.data
}

export async function registerItems(items: ScannedItem[], familyCode: string): Promise<void> {
  await api.post(`/scan/register?code=${encodeURIComponent(familyCode)}`, { items })
}

export async function getItems(familyCode: string): Promise<DashboardItem[]> {
  const resp = await api.get<DashboardItem[]>(`/scan/items?code=${encodeURIComponent(familyCode)}`)
  return resp.data
}

export async function deleteItem(itemId: string, familyCode: string): Promise<void> {
  await api.delete(`/scan/items/${itemId}?code=${encodeURIComponent(familyCode)}`)
}
