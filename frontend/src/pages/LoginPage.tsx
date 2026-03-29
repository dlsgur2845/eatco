import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import type { User } from '../types'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionExpired = searchParams.get('reason') === 'session_expired'

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [showExpiredBanner, setShowExpiredBanner] = useState(sessionExpired)

  const [loading, setLoading] = useState(false)

  const doLogin = async () => {
    if (!form.email || !form.password) return
    setError('')
    setLoading(true)
    try {
      const res = await api.post<User>('/auth/login', form)
      sessionStorage.setItem('user', JSON.stringify(res.data))
      navigate('/')
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    doLogin()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      doLogin()
    }
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
            <span className="material-symbols-outlined text-primary text-4xl">restaurant_menu</span>
            <span className="font-headline font-extrabold text-2xl tracking-tight text-primary">
              Eatco
            </span>
          </div>
          <h1 className="font-headline text-5xl font-bold tracking-tight text-on-surface mt-2">
            로그인
          </h1>
          <p className="text-on-surface-variant text-lg leading-relaxed max-w-sm">
            이메일과 비밀번호를 입력해주세요.
          </p>
        </header>

        {/* Session Expired Banner */}
        {showExpiredBanner && (
          <div className="bg-secondary-container/10 rounded-2xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-secondary-container mt-0.5">warning</span>
            <div className="flex-1">
              <p className="font-medium text-on-surface text-sm">다른 기기에서 로그인되어 세션이 만료되었습니다.</p>
              <p className="text-on-surface-variant text-xs mt-1">다시 로그인해 주세요.</p>
            </div>
            <button onClick={() => setShowExpiredBanner(false)} className="text-on-surface-variant hover:text-on-surface p-1">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Form Card */}
        <main className="w-full">
          <section className="bg-surface-container-low rounded-3xl p-8 md:p-10 shadow-[0_10px_40px_rgba(25,28,27,0.04)]">
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* 이메일 */}
              <div className="flex flex-col gap-2">
                <label className="font-body text-[11px] font-bold uppercase tracking-widest text-on-surface-variant pl-1">
                  이메일 주소
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-4 text-on-surface focus:ring-2 focus:ring-primary-container transition-all placeholder:text-outline-variant"
                  placeholder="example@pantry.com"
                />
              </div>

              {/* 비밀번호 */}
              <div className="flex flex-col gap-2">
                <label className="font-body text-[11px] font-bold uppercase tracking-widest text-on-surface-variant pl-1">
                  비밀번호
                </label>
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-4 text-on-surface focus:ring-2 focus:ring-primary-container transition-all placeholder:text-outline-variant"
                  placeholder="••••••••"
                />
              </div>

              {error && <p className="text-tertiary text-sm text-center">{error}</p>}

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-bold py-5 rounded-full text-lg shadow-lg active:scale-95 transition-all duration-200 disabled:opacity-50"
                >
                  {loading ? '로그인 중...' : '로그인'}
                </button>
              </div>
            </form>

            {/* Divider & Signup Link */}
            <div className="mt-8 flex flex-col items-center gap-6">
              <div className="flex items-center justify-center w-full py-2">
                <span className="font-body text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  또는
                </span>
              </div>
              <p className="text-on-surface-variant text-sm">
                계정이 없으신가요?
                <button
                  onClick={() => navigate('/signup')}
                  className="text-primary font-bold ml-2 hover:underline"
                >
                  회원가입
                </button>
              </p>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="text-center">
          <p className="font-body text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
            &copy; 2026 THE EDITORIAL PANTRY. ALL RIGHTS RESERVED.
          </p>
        </footer>
      </div>
    </div>
  )
}
