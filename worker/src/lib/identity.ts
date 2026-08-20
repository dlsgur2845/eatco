import type { MiddlewareHandler } from 'hono'
import { ApiError } from './errors'
import type { Env, User, Vars } from './types'
import { nowIso } from './dates'

/**
 * Cloudflare Access 기반 신원 확인.
 *
 * 왜 비밀번호를 쓰지 않는가: 무료 Workers 는 요청당 CPU 10ms 인데 bcrypt 는
 * 200~300ms 다. PBKDF2 를 예산에 맞추려면 반복 횟수를 안전 기준 아래로 낮춰야 한다.
 * Access 는 무료 티어(50석)이고, 비밀번호 해싱·레이트리밋·사용자 열거 공격면을
 * 통째로 없앤다. 가족 4명에게는 엄격히 더 낫다.
 *
 * Access 는 검증된 JWT 를 Cf-Access-Jwt-Assertion 헤더로 넣어준다.
 * 그래도 Worker 가 직접 서명을 검증한다 — 헤더를 그대로 믿으면 Access 를
 * 우회한 직접 요청이 아무 이메일이나 주장할 수 있다.
 */

interface Jwk {
  kid: string
  kty: string
  alg: string
  use?: string
  n: string
  e: string
}

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null
const JWKS_TTL_MS = 60 * 60 * 1000

async function getJwks(teamDomain: string): Promise<Jwk[]> {
  const now = Date.now()
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys
  const url = `https://${teamDomain}/cdn-cgi/access/certs`
  const res = await fetch(url)
  if (!res.ok) throw new ApiError(503, '인증 서버에 연결할 수 없습니다.')
  const body = (await res.json()) as { keys?: Jwk[] }
  const keys = body.keys ?? []
  jwksCache = { keys, fetchedAt: now }
  return keys
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function b64urlToJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))) as T
}

interface AccessClaims {
  email?: string
  aud?: string | string[]
  exp?: number
  iss?: string
  sub?: string
}

export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  expectedAud: string | undefined,
): Promise<AccessClaims> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new ApiError(401, '인증 토큰 형식이 올바르지 않습니다.')
  const [h, p, s] = parts

  const header = b64urlToJson<{ kid?: string; alg?: string }>(h)
  if (header.alg !== 'RS256') throw new ApiError(401, '지원하지 않는 서명 알고리즘입니다.')

  const keys = await getJwks(teamDomain)
  const jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) throw new ApiError(401, '인증 키를 찾을 수 없습니다.')

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  )
  if (!ok) throw new ApiError(401, '인증 토큰 서명이 올바르지 않습니다.')

  const claims = b64urlToJson<AccessClaims>(p)

  const nowSec = Math.floor(Date.now() / 1000)
  if (typeof claims.exp === 'number' && claims.exp < nowSec) {
    throw new ApiError(401, '로그인이 만료되었습니다. 새로고침해주세요.')
  }
  if (claims.iss && claims.iss !== `https://${teamDomain}`) {
    throw new ApiError(401, '인증 발급자가 올바르지 않습니다.')
  }
  if (expectedAud) {
    const auds = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : []
    if (!auds.includes(expectedAud)) throw new ApiError(401, '이 애플리케이션 토큰이 아닙니다.')
  }
  if (!claims.email) throw new ApiError(401, '토큰에 이메일이 없습니다.')
  return claims
}

/** 이메일로 사용자 행을 찾고, 없으면 만든다. Access 가 이미 허용한 사람이다. */
export async function resolveUser(db: D1Database, email: string): Promise<User> {
  const found = await db
    .prepare('SELECT id, email, nickname, family_id FROM users WHERE email = ?')
    .bind(email)
    .first<User>()
  if (found) return found

  const id = crypto.randomUUID()
  // 닉네임 기본값은 이메일 로컬파트. 설정에서 바꿀 수 있다.
  const nickname = email.split('@')[0].slice(0, 50)
  // hashed_password 는 스키마상 NOT NULL 이지만 Access 로 전환해서 쓰지 않는다.
  // 0002 마이그레이션에서 nullable 로 바꾸기 전까지 빈 문자열을 넣는다.
  await db
    .prepare(
      'INSERT INTO users (id, email, nickname, hashed_password, family_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
    )
    .bind(id, email, nickname, '', nowIso())
    .run()
  return { id, email, nickname, family_id: null }
}

export const requireUser: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const env = c.env
  const token =
    c.req.header('Cf-Access-Jwt-Assertion') ||
    // 브라우저는 쿠키로도 들고 온다
    (c.req.header('Cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1]

  let email: string | undefined

  if (token && env.ACCESS_TEAM_DOMAIN) {
    const claims = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD)
    email = claims.email
  } else if (env.ALLOW_INSECURE_DEV === '1' && env.DEV_EMAIL) {
    // 로컬 개발 전용 탈출구. 프로덕션에 이 변수를 두면 앱이 무방비가 된다.
    email = env.DEV_EMAIL
  }

  if (!email) {
    throw new ApiError(401, '로그인이 필요합니다.')
  }

  const user = await resolveUser(env.DB, email)
  c.set('user', user)
  await next()
}

/** 가족에 소속돼 있어야 하는 엔드포인트용. */
export function requireFamily(user: User): string {
  if (!user.family_id) throw new ApiError(400, '가족 그룹에 먼저 가입해주세요.')
  return user.family_id
}
