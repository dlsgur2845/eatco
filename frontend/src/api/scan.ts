import api from './client'

export interface ScannedItem {
  name: string
  matched_keyword: string | null
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

export async function analyzeReceipt(file: File): Promise<ScanResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const resp = await api.post<ScanResponse>('/scan/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
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
