import type { Context } from 'hono'

/** 사용자에게 그대로 보여줄 수 있는 오류. FastAPI 의 HTTPException 대응. */
export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 503,
    public detail: string,
  ) {
    super(detail)
  }
}

export function onError(err: Error, c: Context) {
  if (err instanceof ApiError) {
    return c.json({ detail: err.detail }, err.status)
  }
  // 예상치 못한 오류는 로그로 남기고 일반 메시지만 노출한다.
  // 예전 FastAPI 는 except 로 삼켜서 "왜 안 되는지" 를 아무도 몰랐다.
  console.error('unhandled error:', err?.stack || err)
  return c.json({ detail: '서버 오류가 발생했습니다.' }, 500)
}

/** 본문이 비어 있거나 JSON 이 아니어도 던지지 않고 빈 객체를 준다.
 *  `.catch(() => ({}))` 를 그대로 쓰면 타입이 `{}` 로 좁혀져서 필드 접근이 막힌다. */
export async function readJson<T extends object = Record<string, unknown>>(
  req: { json: () => Promise<unknown> },
): Promise<Partial<T>> {
  try {
    const v = await req.json()
    return (v && typeof v === 'object' ? v : {}) as Partial<T>
  } catch {
    return {} as Partial<T>
  }
}
