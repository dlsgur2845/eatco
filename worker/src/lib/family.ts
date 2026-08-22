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

/**
 * 초대코드를 **원자적으로 소비**한다. 성공하면 곧바로 새 코드로 갈아끼우고
 * 가족을 돌려준다. 이미 쓰인 코드면 null.
 *
 * 링크는 일회용이다. 그래서 "읽고 나서 쓰기" 로 하면 안 된다 — 두 사람이
 * 같은 링크를 동시에 누르면 둘 다 SELECT 를 통과한다. UPDATE 의 WHERE 에
 * 옛 코드를 넣어 비교-후-교체(CAS)로 만든다. 먼저 도착한 하나만 changes=1 을
 * 받고, 나머지는 0 을 받아 조용히 실패한다.
 *
 * `meta.changes` 는 Workers 런타임 D1 바인딩이 준다 (auth.ts 의 kick 이 이미
 * 같은 방식을 쓴다). wrangler CLI 의 --local 출력에는 안 담기니, 이걸
 * CLI 로 확인하려 하지 말 것.
 */
export async function consumeInviteCode(
  db: D1Database,
  code: string,
): Promise<{ id: string; name: string } | null> {
  const fam = await db
    .prepare('SELECT id, name FROM families WHERE invite_code = ?')
    .bind(code)
    .first<{ id: string; name: string }>()
  if (!fam) return null

  const next = await uniqueInviteCode(db)
  const res = await db
    .prepare('UPDATE families SET invite_code = ? WHERE id = ? AND invite_code = ?')
    .bind(next, fam.id, code)
    .run()
  // 0 이면 그 사이에 누가 먼저 썼다. 링크는 하나뿐이므로 지금 사람은 실패한다.
  if (!res.meta.changes) return null
  return fam
}

/**
 * 구성원이 바뀌면 코드를 돌린다.
 *
 * 합류·탈퇴·내보내기 뒤에 부른다. 옛 링크가 계속 살아 있으면 "일회용" 이
 * 아니게 된다. 코드를 눈으로 보고 타이핑하던 시절엔 잘 안 샜지만, URL 은
 * 브라우저 기록·링크 미리보기·스크린샷으로 훨씬 쉽게 샌다.
 */
export async function rotateInviteCode(db: D1Database, familyId: string): Promise<string> {
  const next = await uniqueInviteCode(db)
  await db.prepare('UPDATE families SET invite_code = ? WHERE id = ?').bind(next, familyId).run()
  return next
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
