import { nowIso } from './dates'

/** 초대코드 — 0/O/1/I 를 뺀 대문자+숫자에서 균등 추출.
 *  예전 token_urlsafe(8).upper() 는 base64url 62심볼을 36으로 접어
 *  엔트로피를 ~64bit -> ~40bit 로 떨어뜨렸고 길이도 8보다 짧아질 수 있었다. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function inviteCode(len = 8): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

export async function uniqueInviteCode(db: D1Database): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = inviteCode()
    const dup = await db.prepare('SELECT 1 FROM families WHERE invite_code = ?').bind(code).first()
    if (!dup) return code
  }
  throw new Error('초대코드 생성 실패')
}

/** 가족 생성 시 기본 알림 설정. backend/app/seed.py 의 DEFAULT_NOTIFICATION_DAYS 와 동일. */
export const DEFAULT_NOTIFICATION_DAYS = [0, 1, 3, 5, 7, 14, 21, 30]

export function notificationSettingStatements(db: D1Database, familyId: string) {
  return DEFAULT_NOTIFICATION_DAYS.map((d) =>
    db
      .prepare(
        'INSERT INTO notification_settings (id, family_id, days_before, enabled, push_time) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(crypto.randomUUID(), familyId, d, d <= 3 ? 1 : 0, '09:00'),
  )
}

/**
 * 1인 가족 자동 생성 — 기존 FastAPI register 와 동일한 동작.
 *
 * 이게 없으면 가입 직후 family_id 가 NULL 이라 가족 스코프 엔드포인트가 전부
 * 400 을 뱉는다. 화면에는 "추가하지 못했어요" / "식재료를 불러오지 못했어요" 로만
 * 보여서 원인을 알 수 없다. 프론트에는 가족 생성 온보딩 화면이 없다 —
 * 원래 필요가 없었기 때문이다.
 */
export async function createSoloFamily(
  db: D1Database,
  userId: string,
  nickname: string,
): Promise<string> {
  const familyId = crypto.randomUUID()
  const code = await uniqueInviteCode(db)
  await db.batch([
    db
      .prepare(
        'INSERT INTO families (id, name, invite_code, allow_shared_edit, created_at, master_id) VALUES (?, ?, ?, 1, ?, ?)',
      )
      .bind(familyId, `${nickname}의 냉장고`.slice(0, 100), code, nowIso(), userId),
    db.prepare('UPDATE users SET family_id = ? WHERE id = ?').bind(familyId, userId),
    ...notificationSettingStatements(db, familyId),
  ])
  return familyId
}
