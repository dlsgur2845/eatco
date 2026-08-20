import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import api from './api/client'
import Layout from './components/layout/Layout'
import FamilyPage from './pages/FamilyPage'
import InventoryPage from './pages/InventoryPage'
import MvpDashboardPage from './pages/MvpDashboardPage'
import NotificationsPage from './pages/NotificationsPage'
import ScanPage from './pages/ScanPage'
import ExpensesPage from './pages/ExpensesPage'
import MyRecipesPage from './pages/MyRecipesPage'
import SettingsPage from './pages/SettingsPage'
import QuantityCleanupPage from './pages/QuantityCleanupPage'
import CookingLogPage from './pages/CookingLogPage'

// 등록 성공은 앱에서 가장 기분 좋은 순간인데, window.location.href 는 전체
// 페이지 리로드라 스탠드얼론 PWA 에서 흰 화면 깜빡임 + 콜드 부팅 + 전체 재조회가 났다.
function ScanRoute() {
  const navigate = useNavigate()
  return <ScanPage onRegistered={() => navigate('/')} />
}

/**
 * Cloudflare Access 가 사이트 전체를 막고 있으므로, 이 화면이 보인다는 것 자체가
 * 이미 인증됐다는 뜻이다. 비밀번호 로그인은 없앴다 — 무료 Workers 의 요청당
 * CPU 10ms 안에서 bcrypt(200~300ms)를 돌릴 수 없기 때문이다.
 * 따라서 여기서는 localStorage 를 믿지 않고 서버에 신원을 물어본다.
 */
function AuthGuard() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    api
      .get('/auth/me')
      .then((r) => {
        if (!alive) return
        localStorage.setItem('user', JSON.stringify(r.data))
        setState('ready')
      })
      .catch(() => {
        if (alive) setState('error')
      })
    return () => {
      alive = false
    }
  }, [])

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-surface-container-high border-t-primary animate-spin" />
          <p className="text-on-surface-variant text-sm">불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-6">
        <div className="text-center max-w-sm">
          <span className="material-symbols-outlined text-outline text-5xl mb-3 block">lock</span>
          <h1 className="font-headline font-bold text-xl text-on-surface mb-2">로그인이 필요해요</h1>
          <p className="text-on-surface-variant text-sm mb-6">
            세션이 만료되었을 수 있어요. 새로고침하면 다시 로그인 화면으로 이동합니다.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-full font-semibold text-on-primary bg-primary active:scale-95 transition-transform"
          >
            새로고침
          </button>
        </div>
      </div>
    )
  }

  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 로그인/회원가입은 Cloudflare Access 가 처리한다. 남아있는 링크는 홈으로. */}
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />

        {/* Protected routes */}
        <Route element={<AuthGuard />}>
          <Route element={<Layout />}>
            <Route path="/" element={<MvpDashboardPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/scan" element={<ScanRoute />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/my-recipes" element={<MyRecipesPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/family" element={<FamilyPage />} />
            <Route path="/quantity-cleanup" element={<QuantityCleanupPage />} />
            <Route path="/cooking-logs" element={<CookingLogPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
