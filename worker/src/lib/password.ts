/**
 * 비밀번호 해싱 — PBKDF2-SHA256 (WebCrypto 네이티브).
 *
 * bcrypt 를 쓸 수 없어서가 아니라, Workers 에 bcrypt 가 없고 순수 JS 구현은
 * 무료 티어 CPU 10ms 를 크게 넘기기 때문이다. PBKDF2 는 네이티브라 훨씬 싸다.
 *
 * 실측 (배포된 Worker, 무료 플랜):
 *   100,000회 -> 10/10 성공
 *   100,001회 -> NotSupportedError: iteration counts above 100000 are not supported
 * 즉 100,000 이 플랫폼 상한이고, 그 값이 무료 CPU 예산 안에 들어온다.
 *
 * OWASP 최신 권고(PBKDF2-SHA256 600k)보다 낮지만 플랫폼이 허용하는 최대치다.
 * 솔트는 요청마다 난수 16바이트, 비교는 상수시간.
 */

const ITERATIONS = 100_000 // Workers 상한. 올리면 NotSupportedError.
const KEY_BITS = 256
const SALT_BYTES = 16

function toB64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

/** 저장 형식: pbkdf2$<iterations>$<salt_b64>$<hash_b64> */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt)
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`
}

/** 타이밍 공격 방지를 위해 길이가 달라도 끝까지 비교한다. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations <= 0) return false

  const salt = fromB64(parts[2])
  const expected = fromB64(parts[3])

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    expected.length * 8,
  )
  return constantTimeEqual(new Uint8Array(bits), expected)
}
