import api from './client'

/**
 * 가족 API 키 (BYOK).
 *
 * **키 평문은 여기서 서버로 올라가기만 하고 절대 내려오지 않는다.**
 * 목록은 마스킹된 힌트(`••••4f2a`)만 준다. 실제 키는 워커가 제공자를 부를 때만
 * 복호화해서 쓰고 브라우저로 오지 않는다.
 */

export type Provider = 'gemini' | 'anthropic' | 'openai'
export type KeyStrategy = 'least_used' | 'priority'

export interface FamilyKey {
  id: string
  provider: Provider
  provider_label: string
  label: string
  key_hint: string
  added_by: string
  created_at: string
  priority: number | null
  calls: number
  last_used_at: string | null
  cooldown_until: string | null
  disabled: number
  last_error: string | null
}

export interface KeyState {
  keys: FamilyKey[]
  strategy: KeyStrategy
}

export async function getFamilyKeys(): Promise<KeyState> {
  const r = await api.get<KeyState>('/auth/family/keys')
  return r.data
}

export async function addFamilyKey(provider: Provider, key: string, label?: string): Promise<void> {
  await api.post('/auth/family/keys', { provider, key, label })
}

export async function deleteFamilyKey(id: string): Promise<void> {
  await api.delete(`/auth/family/keys/${id}`)
}

export async function enableFamilyKey(id: string): Promise<void> {
  await api.post(`/auth/family/keys/${id}/enable`)
}

export async function setKeyStrategy(strategy: KeyStrategy, order?: string[]): Promise<void> {
  await api.patch('/auth/family/key-strategy', { strategy, order })
}
