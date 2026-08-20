import type { MiddlewareHandler } from 'hono'
import { ApiError } from './errors'
import type { Env, User, Vars } from './types'
import { nowIso } from './dates'
import { readCookie, readSession } from './session'
import { createSoloFamily } from './family'

/**
 * 신원 확인. **현재는 앱 자체 세션 쿠키만 쓴다.**
 *
 * 이 주석은 원래 "비밀번호를 쓰지 않는다, bcrypt 가 무료 CPU 예산 10ms 를
 * 넘기니 Access 로 간다" 였다. 둘 다 틀린 서술이 됐다:
 *  - PBKDF2-SHA256 100,000회가 무료 CPU 예산 안에서 도는 것을 실측했다.
 *    (Workers 는 100,000회가 플랫폼 상한이다.) 그래서 비밀번호 인증을 쓴다.
 *  - Cloudflare Access 는 결국 붙이지 않았다. wrangler.jsonc 에서
 *    ACCESS_TEAM_DOMAIN 을 뺐으므로 아래 Access 분기는 비활성이다.
 *
 * Access 를 나중에 붙일 때를 위해 검증 코드는 남긴다. 단 aud 없이는 열리지
 * 않는다 — 그게 없던 동안 같은 Zero Trust 조직의 다른 애플리케이션 토큰까지
 * 통과했다. Access 는 검증된 JWT 를 Cf-Access-Jwt-Assertion 헤더로 넣어주지만
 * Worker 가 직접 서명을 다시 검증한다. 헤더를 그대로 믿으면 Access 를 우회한
 * 직접 요청이 아무 이메일이나 주장할 수 있다.
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
  // 필수다. 옵셔널이던 시절에 aud 검사가 조건부로 건너뛰어져서, 같은 Zero Trust
  // 조직의 다른 애플리케이션 토큰까지 통과했다. 타입으로 막는다.
  expectedAud: string,
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
  const auds = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : []
  if (!auds.includes(expectedAud)) throw new ApiError(401, '이 애플리케이션 토큰이 아닙니다.')
  if (!claims.email) throw new ApiError(401, '토큰에 이메일이 없습니다.')
  return claims
}

/**
 * 새로 만들어질 계정의 역할.
 *
 * "제일 처음 가입한 사용자가 관리자 1호" — users 테이블이 비어 있으면 admin.
 * 가입 경로가 두 개(비밀번호 register, Access resolveUser)라서 한 곳에 둔다.
 * 한쪽에만 넣으면 Access 로 먼저 들어온 사람이 영영 관리자가 되지 못한다.
 */
export async function roleForNewUser(db: D1Database): Promise<'admin' | 'member'> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()
  return (row?.n ?? 0) === 0 ? 'admin' : 'member'
}

/** 이메일로 사용자 행을 찾고, 없으면 만든다. Access 가 이미 허용한 사람이다. */
export async function resolveUser(db: D1Database, email: string): Promise<User> {
  const found = await db
    .prepare('SELECT id, email, nickname, family_id, role FROM users WHERE email = ?')
    .bind(email)
    .first<User>()
  if (found) return found

  const id = crypto.randomUUID()
  // 닉네임 기본값은 이메일 로컬파트. 설정에서 바꿀 수 있다.
  const nickname = email.split('@')[0].slice(0, 50)
  const role = await roleForNewUser(db)
  // hashed_password 는 스키마상 NOT NULL 이지만 Access 로 전환해서 쓰지 않는다.
  // 0002 마이그레이션에서 nullable 로 바꾸기 전까지 빈 문자열을 넣는다.
  await db
    .prepare(
      'INSERT INTO users (id, email, nickname, hashed_password, family_id, created_at, role) VALUES (?, ?, ?, ?, NULL, ?, ?)',
    )
    .bind(id, email, nickname, '', nowIso(), role)
    .run()
  return { id, email, nickname, family_id: null, role }
}

export const requireUser: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const env = c.env
  const token =
    c.req.header('Cf-Access-Jwt-Assertion') ||
    // 브라우저는 쿠키로도 들고 온다
    (c.req.header('Cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1]

  // 1) Cloudflare Access 가 앞에 있으면 그 신원을 쓴다 (가장 강함).
  //
  // aud 없이는 열지 않는다. ACCESS_TEAM_DOMAIN 만 있고 ACCESS_AUD 가 없으면
  // 그 Zero Trust 조직의 **어떤 애플리케이션에서 발급된 토큰이든** 통과하고,
  // resolveUser 가 그 토큰의 이메일로 계정을 자동 생성한다. 애플리케이션 간
  // 토큰 혼용이다. 예전에 실제로 이 상태였다.
  //
  // 설정 실수로 다시 열리지 않게 여기서 막는다. 조용히 통과시키느니
  // 눈에 띄게 실패하는 쪽이 낫다.
  if (token && env.ACCESS_TEAM_DOMAIN) {
    if (!env.ACCESS_AUD) {
      console.error('ACCESS_TEAM_DOMAIN 은 있는데 ACCESS_AUD 가 없다. Access 인증을 거부한다.')
      throw new ApiError(500, '인증 설정이 올바르지 않습니다. 관리자에게 문의하세요.')
    }
    const claims = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD)
    const user = await withFamily(env.DB, await resolveUser(env.DB, claims.email!))
    c.set('user', user)
    return next()
  }

  // 2) 앱 자체 세션 쿠키 (PBKDF2 100k + HMAC 서명 세션).
  const sess = readCookie(c.req.header('Cookie'))
  if (sess) {
    const uid = await readSession(env, sess)
    if (uid) {
      const user = await env.DB
        .prepare('SELECT id, email, nickname, family_id, role FROM users WHERE id = ?')
        .bind(uid)
        .first<User>()
      if (user) {
        c.set('user', await withFamily(env.DB, user))
        return next()
      }
    }
  }

  // 3) 로컬 개발 전용 탈출구. 프로덕션에 이 변수를 두면 앱이 무방비가 된다.
  if (env.ALLOW_INSECURE_DEV === '1' && env.DEV_EMAIL) {
    const user = await withFamily(env.DB, await resolveUser(env.DB, env.DEV_EMAIL))
    c.set('user', user)
    return next()
  }

  throw new ApiError(401, '로그인이 필요합니다.')
}

/**
 * 가족이 없는 사용자에게 1인 가족을 만들어준다.
 * 기존 FastAPI 는 register 안에서만 했는데, 그러면 Access 로 들어온 사용자와
 * 이미 만들어진 고아 계정이 구제되지 않는다. 신원 확정 지점 한 곳에서 처리한다.
 */
async function withFamily(db: D1Database, user: User): Promise<User> {
  if (user.family_id) return user
  const familyId = await createSoloFamily(db, user.id, user.nickname)
  return { ...user, family_id: familyId }
}

/** 가족에 소속돼 있어야 하는 엔드포인트용. */
export function requireFamily(user: User): string {
  if (!user.family_id) throw new ApiError(400, '가족 그룹에 먼저 가입해주세요.')
  return user.family_id
}
