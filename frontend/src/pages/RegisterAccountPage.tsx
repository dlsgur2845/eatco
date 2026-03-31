import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import type { User } from '../types'

export default function RegisterAccountPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', nickname: '', password: '' })
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res = await api.post<User>('/auth/register', form)
      sessionStorage.setItem('user', JSON.stringify(res.data))
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
              {/* 이름 */}
              <div className="flex flex-col gap-2">
                <label className="font-body text-[11px] font-bold uppercase tracking-widest text-on-surface-variant pl-1">
                  이름
                </label>
                <input
                  type="text"
                  required
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-4 text-on-surface focus:ring-2 focus:ring-primary-container transition-all placeholder:text-outline-variant"
                  placeholder="홍길동"
                />
              </div>

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
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-4 text-on-surface focus:ring-2 focus:ring-primary-container transition-all placeholder:text-outline-variant"
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
                <span className="font-body text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  또는
                </span>
                <div className="h-px flex-1 bg-outline-variant opacity-30" />
              </div>
              <p className="text-on-surface-variant text-sm">
                이미 계정이 있으신가요?
                <button
                  onClick={() => navigate('/login')}
                  className="text-primary font-bold ml-2 hover:underline"
                >
                  로그인
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
