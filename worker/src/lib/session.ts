import type { Env } from './types'

/**
 * 세션 토큰 — HMAC-SHA256 서명. JWT 라이브러리를 쓸 만큼 복잡하지 않다.
 * 형식: <payload_b64url>.<sig_b64url>
 * 쿠키는 httpOnly + Secure + SameSite=Lax (같은 오리진에서만 쓰므로 Lax 로 충분).
 */

const COOKIE = 'eatco_session'
const MAX_AGE_SEC = 7 * 24 * 60 * 60 // 7일 — "로그인 유지" 를 켰을 때
/* 유지를 안 켰을 때의 토큰 수명. 브라우저를 닫으면 세션 쿠키가 사라지므로
   이 값이 실제로 쓰이는 건 "탭을 하루 넘게 열어둔" 경우뿐이다.
   7일짜리 토큰을 주지 않는 이유: 유지를 안 켠 사람의 의도보다 오래 산다. */
const SHORT_AGE_SEC = 24 * 60 * 60

interface Payload {
  uid: string
  exp: number
}

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function createSession(env: Env, userId: string, persist = false): Promise<string> {
  const secret = env.SECRET_KEY
  if (!secret) throw new Error('SECRET_KEY 가 설정되지 않았습니다.')
  const ttl = persist ? MAX_AGE_SEC : SHORT_AGE_SEC
  const payload: Payload = { uid: userId, exp: Math.floor(Date.now() / 1000) + ttl }
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(body))
  return `${body}.${b64url(new Uint8Array(sig))}`
}

export async function readSession(env: Env, token: string): Promise<string | null> {
  const secret = env.SECRET_KEY
  if (!secret) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    unb64url(sig),
    new TextEncoder().encode(body),
  )
  if (!ok) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body))) as Payload
    if (!payload.uid || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload.uid
  } catch {
    return null
  }
}

/**
 * 세션 쿠키.
 *
 * `persist` 가 false 면 **Max-Age 를 붙이지 않는다.** 그러면 브라우저가
 * 세션 쿠키로 다루고, 브라우저를 닫는 순간 버린다. 예전엔 항상 Max-Age 를
 * 붙여서 "로그인 유지" 를 고른 적이 없어도 7일간 로그인 상태였다.
 *
 * 공용 컴퓨터에서 로그아웃을 잊고 브라우저만 닫았을 때, 다음 사람이
 * 그대로 들어가지는 걸 막는 게 이 구분의 목적이다.
 */
export function sessionCookie(token: string, persist = false): string {
  const base = `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`
  return persist ? `${base}; Max-Age=${MAX_AGE_SEC}` : base
}
export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}
export function readCookie(header: string | undefined): string | null {
  if (!header) return null
  const m = header.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return m ? m[1] : null
}
