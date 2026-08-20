import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import api from './api/client'
import LoginPage from './pages/LoginPage'
import RegisterAccountPage from './pages/RegisterAccountPage'
import Layout from './components/layout/Layout'
import FamilyPage from './pages/FamilyPage'
import InventoryPage from './pages/InventoryPage'
import MvpDashboardPage from './pages/MvpDashboardPage'
import NotificationsPage from './pages/NotificationsPage'
import ScanPage from './pages/ScanPage'
import ExpensesPage from './pages/ExpensesPage'
import SettingsPage from './pages/SettingsPage'

// 등록 성공은 앱에서 가장 기분 좋은 순간인데, window.location.href 는 전체
// 페이지 리로드라 스탠드얼론 PWA 에서 흰 화면 깜빡임 + 콜드 부팅 + 전체 재조회가 났다.
function ScanRoute() {
  const navigate = useNavigate()
  return <ScanPage onRegistered={() => navigate('/')} />
}

/**
 * 신원은 서버에 물어본다. localStorage 는 캐시일 뿐 신뢰의 근거가 아니다.
 * 인증은 두 갈래를 지원한다:
 *   1) Cloudflare Access 가 앞에 있으면 그 신원
 *   2) 없으면 앱 자체 세션 쿠키 (PBKDF2 100k)
 * 어느 쪽이든 /auth/me 가 200 이면 통과, 401 이면 로그인 화면으로.
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
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 공개 라우트 */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<RegisterAccountPage />} />

        {/* Protected routes */}
        <Route element={<AuthGuard />}>
          <Route element={<Layout />}>
            <Route path="/" element={<MvpDashboardPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/scan" element={<ScanRoute />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/family" element={<FamilyPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
