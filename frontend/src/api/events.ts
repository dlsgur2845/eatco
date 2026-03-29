import axios from 'axios'

const api = axios.create({ baseURL: '/api', withCredentials: true })

export async function logEvent(
  familyCode: string,
  eventType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await api.post(`/events?code=${encodeURIComponent(familyCode)}`, {
      event_type: eventType,
      metadata: metadata ?? null,
    })
  } catch {
    // 이벤트 로깅 실패는 사용자에게 영향 없음 — 조용히 무시
  }
}
