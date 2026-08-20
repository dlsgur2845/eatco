import type { Env } from './types'

/**
 * 세션 토큰 — HMAC-SHA256 서명. JWT 라이브러리를 쓸 만큼 복잡하지 않다.
 * 형식: <payload_b64url>.<sig_b64url>
 * 쿠키는 httpOnly + Secure + SameSite=Lax (같은 오리진에서만 쓰므로 Lax 로 충분).
 */

const COOKIE = 'eatco_session'
const MAX_AGE_SEC = 7 * 24 * 60 * 60 // 7일 — 기존 앱과 동일

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

export async function createSession(env: Env, userId: string): Promise<string> {
  const secret = env.SECRET_KEY
  if (!secret) throw new Error('SECRET_KEY 가 설정되지 않았습니다.')
  const payload: Payload = { uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC }
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

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`
}
export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}
export function readCookie(header: string | undefined): string | null {
  if (!header) return null
  const m = header.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return m ? m[1] : null
}
