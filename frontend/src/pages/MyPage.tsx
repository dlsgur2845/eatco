import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import type { User } from '../types'

/* 서버(worker/src/lib/nickname.ts)의 규칙과 같은 값. 한글 1자를 2로,
   영문·숫자를 1로 세어 14까지 = 한글 7자 / 영문·숫자 14자.

   **서버에서 import 하지 않는다** — 그 모듈은 비속어 사전 두 개(korcen,
   @2toad/profanity)를 끌고 오고, 숫자 하나 때문에 브라우저 번들이
   438 → 591 kB 로 뛴다(실측). 진짜 검증은 서버가 한다. 여기 있는 건
   버튼을 미리 잠그는 용도일 뿐이다. */
const NICKNAME_MAX = 14
const widthOf = (s: string) => [...s].reduce((n, ch) => n + (/[가-힣]/.test(ch) ? 2 : 1), 0)

/**
 * 마이페이지 — 닉네임, 비밀번호, 로그아웃.
 *
 * 상단바 아바타에서 들어온다. 로그아웃이 여기 있는 이유: 상단바에 가계부를
 * 넣으면서 자리가 없어졌고(360px 에서 여유 118px), 무엇보다 계정 메뉴가
 * 로그아웃의 제자리다. 자주 누르는 버튼도 아니다.
 */
export default function MyPage() {
  const navigate = useNavigate()
  const cached = sessionStorage.getItem('user')
  const user: User | null = cached ? JSON.parse(cached) : null

  const [nickname, setNickname] = useState(user?.nickname ?? '')
  /* 한글과 영문이 다르게 세어지므로 maxLength 로는 못 막는다.
     넘으면 버튼을 잠그고 한 줄로 알려준다. */
  const overBytes = widthOf(nickname.trim()) > NICKNAME_MAX
  const [nickBusy, setNickBusy] = useState(false)
  const [nickMsg, setNickMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const detailOf = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback

  async function saveNickname() {
    if (!nickname.trim() || nickname === user?.nickname) return
    setNickBusy(true)
    setNickMsg(null)
    try {
      const r = await api.patch<User>('/auth/me', { nickname: nickname.trim() })
      sessionStorage.setItem('user', JSON.stringify(r.data))
      setNickMsg({ ok: true, text: '닉네임을 바꿨어요.' })
    } catch (e) {
      // 서버 문구를 그대로 쓴다. 규칙 위반·중복·비속어가 각각 다른 문장이다.
      setNickMsg({ ok: false, text: detailOf(e, '닉네임을 바꾸지 못했어요.') })
    } finally {
      setNickBusy(false)
    }
  }

  async function savePassword() {
    if (pw.next !== pw.confirm) {
      setPwMsg({ ok: false, text: '새 비밀번호가 서로 달라요.' })
      return
    }
    setPwBusy(true)
    setPwMsg(null)
    try {
      await api.post('/auth/me/password', { current_password: pw.current, new_password: pw.next })
      setPw({ current: '', next: '', confirm: '' })
      setPwMsg({ ok: true, text: '비밀번호를 바꿨어요.' })
    } catch (e) {
      setPwMsg({ ok: false, text: detailOf(e, '비밀번호를 바꾸지 못했어요.') })
    } finally {
      setPwBusy(false)
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } catch {
      /* 서버가 실패해도 이 기기에서는 나간다. */
    }
    sessionStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  const field =
    'w-full px-4 min-h-[48px] rounded-xl text-base bg-surface-container-lowest text-on-surface border border-outline-variant focus:ring-2 focus:ring-primary outline-none'

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-8">
        <h2 className="font-headline font-bold text-4xl text-on-surface tracking-tight mb-2">마이페이지</h2>
        <p className="text-on-surface-variant">{user?.email}</p>
      </div>

      {/* 닉네임 */}
      <section className="bg-surface-container-lowest rounded-2xl p-5 mb-5">
        <h3 className="font-headline font-bold text-lg text-on-surface mb-1">닉네임</h3>
        <p className="text-xs text-on-surface-variant mb-4">
          완성된 한글, 영문, 숫자만 쓸 수 있어요. 한글 7자, 영문·숫자 14자까지.
        </p>
        <label htmlFor="my-nickname" className="sr-only">닉네임</label>
        <input
          id="my-nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className={field}
        />
        {/* 길이가 넘으면 그렇다고만 말한다. 숫자 카운터는 두지 않는다 —
            "바이트" 는 우리 구현 사정이고, 화면에 12/14 같은 게 떠 있으면
            한글과 영문이 왜 다르게 세어지는지 설명할 일이 생긴다. */}
        {overBytes && (
          <p className="text-xs mt-1.5" style={{ color: 'var(--color-tertiary)' }}>
            닉네임이 너무 길어요.
          </p>
        )}
        {nickMsg && (
          <p
            role="status"
            className="text-sm mt-2"
            style={{ color: nickMsg.ok ? 'var(--color-primary)' : 'var(--color-tertiary)' }}
          >
            {nickMsg.text}
          </p>
        )}
        <button
          type="button"
          onClick={saveNickname}
          disabled={nickBusy || !nickname.trim() || nickname === user?.nickname || overBytes}
          className="mt-4 w-full min-h-[48px] rounded-xl text-base font-semibold transition-opacity"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'white',
            opacity: nickBusy || !nickname.trim() || nickname === user?.nickname || overBytes ? 0.4 : 1,
          }}
        >
          {nickBusy ? '바꾸는 중…' : '닉네임 바꾸기'}
        </button>
      </section>

      {/* 비밀번호 */}
      <section className="bg-surface-container-lowest rounded-2xl p-5 mb-5">
        <h3 className="font-headline font-bold text-lg text-on-surface mb-1">비밀번호</h3>
        <p className="text-xs text-on-surface-variant mb-4">8자 이상. 바꾸면 다시 로그인해야 할 수 있어요.</p>

        <label htmlFor="pw-current" className="block text-xs font-semibold text-on-surface-variant mb-1">
          현재 비밀번호
        </label>
        <input
          id="pw-current"
          type="password"
          autoComplete="current-password"
          value={pw.current}
          onChange={(e) => setPw({ ...pw, current: e.target.value })}
          className={field}
        />

        <label htmlFor="pw-next" className="block text-xs font-semibold text-on-surface-variant mt-3 mb-1">
          새 비밀번호
        </label>
        <input
          id="pw-next"
          type="password"
          autoComplete="new-password"
          value={pw.next}
          onChange={(e) => setPw({ ...pw, next: e.target.value })}
          className={field}
        />

        <label htmlFor="pw-confirm" className="block text-xs font-semibold text-on-surface-variant mt-3 mb-1">
          새 비밀번호 확인
        </label>
        <input
          id="pw-confirm"
          type="password"
          autoComplete="new-password"
          value={pw.confirm}
          onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
          className={field}
        />

        {pwMsg && (
          <p
            role="status"
            className="text-sm mt-2"
            style={{ color: pwMsg.ok ? 'var(--color-primary)' : 'var(--color-tertiary)' }}
          >
            {pwMsg.text}
          </p>
        )}
        <button
          type="button"
          onClick={savePassword}
          disabled={pwBusy || !pw.current || pw.next.length < 8 || !pw.confirm}
          className="mt-4 w-full min-h-[48px] rounded-xl text-base font-semibold transition-opacity"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'white',
            opacity: pwBusy || !pw.current || pw.next.length < 8 || !pw.confirm ? 0.4 : 1,
          }}
        >
          {pwBusy ? '바꾸는 중…' : '비밀번호 바꾸기'}
        </button>
      </section>

      {/* 로그아웃 */}
      <button
        type="button"
        onClick={logout}
        className="w-full min-h-[48px] rounded-xl text-base font-semibold bg-surface-container-lowest text-error active:scale-95 transition-transform"
      >
        로그아웃
      </button>
    </div>
  )
}
