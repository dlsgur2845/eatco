import api from './client'

export async function logEvent(
  eventType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await api.post('/events', {
      event_type: eventType,
      metadata: metadata ?? null,
    })
  } catch {
    // 이벤트 로깅 실패는 사용자에게 영향 없음
  }
}
