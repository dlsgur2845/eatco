import { ApiError } from './errors'
import { nowIso } from './dates'
import { pickKey, cooldownFor, shouldDisable, maskKey, type KeyRow, type KeyStrategy } from './api-keys-rules'

export * from './api-keys-rules'

/**
 * 가족 API 키 보관·선택 — 암호화는 여기에만 있다.
 *
 * 평문 키가 D1 에 들어가는 경로는 하나도 없어야 한다. 백업이 평문 덤프라
 * 한 번 새면 모든 백업 파일에 남는다.
 */

const IV_BYTES = 12

/**
 * SECRET_KEY 에서 **이 용도 전용** 암호화 키를 파생한다.
 *
 * 세션 서명에도 같은 SECRET_KEY 를 쓰지만, HKDF 의 info 를 다르게 줘서
 * 서로 다른 키가 나오게 한다. 한 키를 서명과 암호화 양쪽에 쓰면 한쪽의
 * 약점이 다른 쪽으로 번진다.
 */
async function aesKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('eatco/family-api-keys/v1'),
      info: new TextEncoder().encode('aes-gcm'),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function unb64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function requireSecret(env: { SECRET_KEY?: string }): string {
  if (!env.SECRET_KEY) throw new ApiError(500, 'SECRET_KEY 가 설정되지 않았습니다.')
  return env.SECRET_KEY
}

/** 평문 키 → `base64(iv‖ciphertext)`. IV 는 매번 새로 만든다. */
export async function encryptKey(env: { SECRET_KEY?: string }, plain: string): Promise<string> {
  const key = await aesKey(requireSecret(env))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  const joined = new Uint8Array(iv.length + ct.byteLength)
  joined.set(iv, 0)
  joined.set(new Uint8Array(ct), iv.length)
  return b64(joined)
}

/**
 * `base64(iv‖ciphertext)` → 평문 키.
 *
 * 복호화 실패는 **키가 아니라 설정 문제**다 (SECRET_KEY 가 바뀌었거나 손상).
 * 그 경우 사용자에게 "키가 잘못됐다" 고 하면 멀쩡한 키를 지우게 만든다.
 */
export async function decryptKey(env: { SECRET_KEY?: string }, cipher: string): Promise<string> {
  const key = await aesKey(requireSecret(env))
  const raw = unb64(cipher)
  const iv = raw.slice(0, IV_BYTES)
  const ct = raw.slice(IV_BYTES)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    return new TextDecoder().decode(plain)
  } catch {
    throw new ApiError(500, '저장된 키를 읽지 못했어요. 키를 다시 등록해주세요.')
  }
}

const COLS = 'id, provider, calls, priority, disabled, cooldown_until'

export interface LeasedKey {
  id: string
  provider: string
  apiKey: string
}

/**
 * 쓸 수 있는 키를 **전략 순서대로 전부** 복호화해서 돌려준다.
 *
 * 하나만 돌려주면 그 키가 고장났을 때 스캔이 통째로 죽는다. 실측으로 잡았다 —
 * 고장난 키 하나 때문에 요청 전체가 503 이 됐다. 폴백이 이 기능의 값어치다.
 */
export async function leaseKeys(
  env: { DB: D1Database; SECRET_KEY?: string },
  familyId: string,
  provider: string,
): Promise<LeasedKey[]> {
  const fam = await env.DB.prepare('SELECT key_strategy FROM families WHERE id = ?')
    .bind(familyId)
    .first<{ key_strategy: string }>()
  const strategy = (fam?.key_strategy === 'priority' ? 'priority' : 'least_used') as KeyStrategy

  const { results } = await env.DB.prepare(
    `SELECT ${COLS} FROM family_api_keys WHERE family_id = ? AND provider = ?`,
  )
    .bind(familyId, provider)
    .all<KeyRow>()

  // pickKey 를 반복해서 부르는 대신 같은 규칙으로 정렬만 한다 —
  // 순서 규칙이 두 벌이 되면 언젠가 갈라진다.
  const now = new Date()
  const out: LeasedKey[] = []
  const pool = [...(results ?? [])]
  for (;;) {
    const next = pickKey(pool, strategy, now)
    if (!next) break
    pool.splice(pool.findIndex((k) => k.id === next.id), 1)
    const row = await env.DB.prepare('SELECT key_cipher FROM family_api_keys WHERE id = ?')
      .bind(next.id)
      .first<{ key_cipher: string }>()
    if (row) out.push({ id: next.id, provider: next.provider, apiKey: await decryptKey(env, row.key_cipher) })
  }
  return out
}

/** 하나만 필요할 때. 순서 규칙을 두 벌로 만들지 않으려고 leaseKeys 를 재사용한다. */
export async function leaseKey(
  env: { DB: D1Database; SECRET_KEY?: string },
  familyId: string,
  provider: string,
): Promise<LeasedKey | null> {
  return (await leaseKeys(env, familyId, provider))[0] ?? null
}

/**
 * 호출 결과를 기록한다. **성공·실패 둘 다 부른다** — 실패만 기록하면
 * 카운터가 안 올라서 그 키가 영원히 「가장 적게 쓴 키」로 뽑힌다.
 */
export async function reportKeyUse(
  db: D1Database,
  keyId: string,
  ok: boolean,
  status?: number,
  detail?: string,
): Promise<void> {
  const now = new Date()
  if (ok) {
    await db
      .prepare('UPDATE family_api_keys SET calls = calls + 1, last_used_at = ?, last_error = NULL WHERE id = ?')
      .bind(nowIso(), keyId)
      .run()
    return
  }
  const cooldown = status ? cooldownFor(status, now) : null
  const disable = status ? shouldDisable(status, detail) : false
  await db
    .prepare(
      `UPDATE family_api_keys
          SET calls = calls + 1, last_used_at = ?, cooldown_until = ?, disabled = ?, last_error = ?
        WHERE id = ?`,
    )
    .bind(nowIso(), cooldown, disable ? 1 : 0, status ? `HTTP ${status}` : '알 수 없는 오류', keyId)
    .run()
}

/** 등록. 평문은 여기서만 잠깐 존재하고 암호문·힌트만 남는다. */
export async function addKey(
  env: { DB: D1Database; SECRET_KEY?: string },
  familyId: string,
  userId: string,
  provider: string,
  label: string,
  plain: string,
): Promise<{ id: string; key_hint: string }> {
  const id = crypto.randomUUID()
  const hint = maskKey(plain)
  await env.DB.prepare(
    `INSERT INTO family_api_keys (id, family_id, provider, label, key_cipher, key_hint, added_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, familyId, provider, label, await encryptKey(env, plain), hint, userId, nowIso())
    .run()
  return { id, key_hint: hint }
}
