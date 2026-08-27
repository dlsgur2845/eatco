import api from './client'

/**
 * 가족 데이터 초기화 — 전원 동의 + 7일 복구.
 *
 * **캐시하지 않는다.** 동의 상태는 다른 사람이 다른 기기에서 바꾼다.
 * 낡은 값을 보여주면 "나만 동의하면 되는데" 라고 믿고 기다리게 된다.
 */

export interface ResetRequest {
  id: string
  status: 'pending' | 'done'
  requested_by: string
  is_mine: boolean
  i_agreed: boolean
  agreed: number
  needed: number
  expires_at: string
  executed_at: string | null
  purge_after: string | null
}

export interface ResetState {
  request: ResetRequest | null
  /** 라벨 → 개수. 서버가 **지금** 다시 센 값이다(요청 시점 스냅샷이 아님). */
  counts: Record<string, number>
  total: number
  members: number
}

export async function getResetState(): Promise<ResetState> {
  const r = await api.get<ResetState>('/auth/family/reset')
  return r.data
}

export async function requestReset(): Promise<{ id: string; expires_at: string }> {
  const r = await api.post<{ id: string; expires_at: string }>('/auth/family/reset')
  return r.data
}

export async function consentReset(): Promise<{ executed: boolean; agreed?: number; needed?: number }> {
  const r = await api.post<{ executed: boolean; agreed?: number; needed?: number }>('/auth/family/reset/consent')
  return r.data
}

export async function withdrawConsent(): Promise<void> {
  await api.delete('/auth/family/reset/consent')
}

export async function cancelReset(): Promise<void> {
  await api.post('/auth/family/reset/cancel')
}

export async function restoreReset(): Promise<void> {
  await api.post('/auth/family/reset/restore')
}
