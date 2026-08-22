import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import type { User } from '../types'

export default function RegisterAccountPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  /* 초대 링크에서 넘어온 코드. 사용자가 손으로 넣는 값이 아니라
     /invite/:code 가 붙여준 값이다. 그래서 화면에는 보이되 수정은 막는다. */
  const invite = (params.get('invite') || '').trim().toUpperCase()
  const [familyName, setFamilyName] = useState('')
  const [inviteDead, setInviteDead] = useState(false)
  const [form, setForm] = useState({ email: '', nickname: '', password: '' })
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  // 코드가 어느 가족인지 미리 확인한다. 소비하지 않는 조회다.
  useEffect(() => {
    if (!invite) return
    let alive = true
    api
      .get<{ family_name: string }>(`/auth/family/invite/${invite}`)
      .then((r) => alive && setFamilyName(r.data.family_name))
      .catch(() => alive && setInviteDead(true))
    return () => {
      alive = false
    }
  }, [invite])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res = await api.post<User & { approved?: boolean }>(
        '/auth/register',
        invite ? { ...form, invite_code: invite } : form,
      )
      /* 승인 대기면 세션 쿠키가 안 나온다. 여기서 '/' 로 보내면 AuthGuard 가
         401 을 받아 로그인 화면으로 튕기고, 사용자는 가입이 실패한 줄 안다.
         localStorage 에도 넣지 않는다 — 로그인한 적이 없는 계정이다. */
      if (res.data.approved === false) {
        setPending(true)
        return
      }
      localStorage.setItem('user', JSON.stringify(res.data))
      navigate('/')
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        const msgs = detail.map((d: any) => {
          if (d.loc?.includes('password')) return '비밀번호는 8자 이상이어야 합니다.'
          if (d.loc?.includes('email')) return '올바른 이메일 주소를 입력해주세요.'
          return d.msg
        })
        setError(msgs.join(' '))
      } else if (typeof detail === 'string') {
        setError(detail)
      } else {
        setError('회원가입에 실패했습니다. 다시 시도해주세요.')
      }
    }
  }

  if (pending) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
        <span
          aria-hidden="true"
          className="material-symbols-outlined"
          style={{ fontSize: '48px', color: 'var(--color-primary)' }}
        >
          how_to_reg
        </span>
        <h1
          className="mt-4 text-xl font-bold"
          style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
        >
          가입 신청이 접수됐어요
        </h1>
        <p className="mt-2 text-sm max-w-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          관리자가 승인하면 로그인할 수 있어요.<br />승인 후 이 이메일로 다시 로그인해주세요.
        </p>
        <p className="mt-1 text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
          {form.email}
        </p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="mt-8 px-6 py-3 rounded-xl text-base font-semibold"
          style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
        >
          로그인 화면으로
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 md:p-12 overflow-x-hidden relative">
      {/* Background blurs */}
      <div className="fixed -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed -bottom-24 -left-24 w-96 h-96 bg-secondary-container/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-lg mx-auto flex flex-col gap-10">
        {/* Header */}
        <header className="flex flex-col gap-4 text-center md:text-left md:pl-10">
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <span aria-hidden="true" className="material-symbols-outlined text-primary text-4xl">restaurant_menu</span>
            <span className="font-headline font-extrabold text-2xl tracking-tight text-primary">
              Eatco
            </span>
          </div>
          <h1 className="font-headline text-5xl font-bold tracking-tight text-on-surface mt-2">
            회원가입
          </h1>
          <p className="text-on-surface-variant text-lg leading-relaxed max-w-sm">
            신선한 일상을 큐레이팅하세요.
          </p>
        </header>

        {/* Form Card */}
        <main className="w-full">
          <section className="bg-surface-container-low rounded-3xl p-8 md:p-10 shadow-[0_10px_40px_rgba(25,28,27,0.04)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary-container" />

            <form onSubmit={handleSubmit} className="flex flex-col gap-6 relative z-10">
              {/* 가족 코드 — 초대 링크로 들어왔을 때만 보인다.
                  **읽기 전용이다.** 사용자가 고칠 수 있으면 남의 가족 코드를
                  넣어보는 입력창이 되고, 링크가 일회용인 의미가 없어진다.
                  disabled 대신 readOnly 를 쓴다 — disabled 는 스크린리더가
                  건너뛰어서 "어느 가족에 들어가는지" 를 못 듣는다. */}
              {invite && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="signup-invite" className="font-body text-xs font-semibold text-on-surface-variant pl-1">
                    가족 코드
                  </label>
                  <input
                    id="signup-invite"
                    type="text"
                    readOnly
                    aria-readonly="true"
                    value={invite}
                    className="w-full bg-surface-container border-none rounded-xl px-4 py-4 font-mono tracking-[0.2em] text-on-surface-variant cursor-not-allowed"
                  />
                  <p className="text-xs pl-1" style={{ color: inviteDead ? 'var(--color-tertiary)' : 'var(--color-primary)' }}>
                    {inviteDead
                      ? '이미 사용됐거나 만료된 링크예요. 가족에게 새 링크를 요청해주세요.'
                      : familyName
                        ? `«${familyName}»에 바로 참여해요`
                        : '초대를 확인하는 중…'}
                  </p>
                </div>
              )}

              {/* 이름 */}
              <div className="flex flex-col gap-2">
                <label htmlFor="signup-nickname" className="font-body text-xs font-semibold text-on-surface-variant pl-1">
                  이름
                </label>
                <input
                  type="text"
                  id="signup-nickname"
                  required
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-4 text-on-surface focus:ring-2 focus:ring-primary-container transition-all placeholder:text-outline"
                  placeholder="홍길동"
                />
              </div>

              {/* 이메일 */}
              <div className="flex flex-col gap-2">
                <label htmlFor="signup-email" className="font-body text-xs font-semibold text-on-surface-variant pl-1">
                  이메일 주소
                </label>
                <input
                  type="email"
                  id="signup-email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-4 text-on-surface focus:ring-2 focus:ring-primary-container transition-all placeholder:text-outline"
                  placeholder="example@pantry.com"
                />
              </div>

              {/* 비밀번호 */}
              <div className="flex flex-col gap-2">
                <label htmlFor="signup-password" className="font-body text-xs font-semibold text-on-surface-variant pl-1">
                  비밀번호
                </label>
                <input
                  id="signup-password"
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-4 text-on-surface focus:ring-2 focus:ring-primary-container transition-all placeholder:text-outline"
                  placeholder="••••••••"
                />
              </div>

              {error && <p className="text-tertiary text-sm text-center">{error}</p>}

              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-bold py-5 rounded-full text-lg shadow-lg active:scale-95 transition-all duration-200"
                >
                  계정 생성하기
                </button>
              </div>
            </form>

            {/* Divider & Login Link */}
            <div className="mt-8 flex flex-col items-center gap-6">
              <div className="flex items-center gap-4 w-full">
                <div className="h-px flex-1 bg-outline-variant opacity-30" />
                <span className="font-body text-xs font-semibold text-on-surface-variant">
                  또는
                </span>
                <div className="h-px flex-1 bg-outline-variant opacity-30" />
              </div>
              <p className="text-on-surface-variant text-sm">
                이미 계정이 있으신가요?
                <button
                  onClick={() => navigate('/login')}
                  className="text-primary font-bold ml-2 hover:underline inline-flex items-center min-h-[48px] px-2"
                >
                  로그인
                </button>
              </p>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="text-center">
          <p className="font-body text-xs font-semibold text-on-surface-variant">
            &copy; 2026 THE EDITORIAL PANTRY. ALL RIGHTS RESERVED.
          </p>
        </footer>
      </div>
    </div>
  )
}
