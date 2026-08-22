import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import api from './api/client'
import LoginPage from './pages/LoginPage'
import RegisterAccountPage from './pages/RegisterAccountPage'
import InvitePage from './pages/InvitePage'
import Layout from './components/layout/Layout'
import FamilyPage from './pages/FamilyPage'
import InventoryPage from './pages/InventoryPage'
import MvpDashboardPage from './pages/MvpDashboardPage'
import NotificationsPage from './pages/NotificationsPage'
import ScanPage from './pages/ScanPage'
// 지출/통계는 recharts 를 쓴다. 초기 번들에서 빼면 746 kB → 392 kB (-47%).
// 냉장고를 확인하러 여는 앱인데 첫 로딩에 차트 라이브러리를 들고 갈 이유가 없다.
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'))
import SettingsPage from './pages/SettingsPage'
import CalendarPage from './pages/CalendarPage'
import AdminPage from './pages/AdminPage'
import LazyBoundary from './components/LazyBoundary'

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
/** 지연 로딩되는 지출 화면의 자리표시자. 실제 레이아웃과 같은 높이를 잡는다. */
function ChartSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <div className="h-10 w-40 rounded-xl bg-surface-container-high animate-pulse" />
      <div className="h-64 rounded-2xl bg-surface-container-high animate-pulse" />
      <div className="h-64 rounded-2xl bg-surface-container-high animate-pulse" />
    </div>
  )
}

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

/**
 * 탭을 옮기면 화면 맨 위에서 시작한다.
 *
 * `BrowserRouter` 는 스크롤을 건드리지 않는다. react-router 의 `ScrollRestoration`
 * 은 데이터 라우터(`createBrowserRouter`) 전용이라 여기서는 못 쓴다. 그래서
 * 라우트가 바뀌어도 `window.scrollY` 가 그대로 남는다.
 *
 * 식단 탭이 오늘 날짜로 984px 을 자동으로 내려놓기 때문에 이게 특히 아팠다.
 * 실측(390×844, 식단에서 scrollY 984):
 *   재고로 이동 → scrollY 707, "식재료" 제목이 화면 위 548px 밖
 *   설정으로   → scrollY 811, "알림 설정" 제목이 652px 밖
 *   냉장고로   → scrollY 0     (우연히 멀쩡했다)
 *
 * 냉장고가 멀쩡했던 건 고쳐져 있어서가 아니라, 로딩 스켈레톤이 3줄뿐이라
 * 문서가 잠깐 짧아지면서 **브라우저가 스크롤을 0 으로 눌러줬기** 때문이다.
 * 재고·설정은 헤더와 폼을 바로 그려서 문서가 계속 길고, 그래서 살아남았다.
 * 즉 어느 탭이 맨 위에서 시작하느냐가 우연에 달려 있었다.
 *
 * **같은 탭 안의 이동은 건드리지 않는다.** 알림에서 온 딥링크가
 * `/calendar/<id>` 이고, 상세를 닫으면 `/calendar` 로 replace 한다.
 * 경로가 바뀔 때마다 위로 올리면 모달을 닫는 순간 보던 자리를 뺏긴다.
 * 첫 경로 조각만 비교해서 탭이 실제로 바뀐 경우에만 올린다.
 */
export function ScrollToTopOnTabChange() {
  const { pathname } = useLocation()
  const lastTab = useRef<string | null>(null)

  useEffect(() => {
    const tab = pathname.split('/')[1] ?? ''
    if (lastTab.current === tab) return
    lastTab.current = tab
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTopOnTabChange />
      <Routes>
        {/* 공개 라우트 */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<RegisterAccountPage />} />
        {/* 초대 링크. AuthGuard 밖에 둔다 — 로그인 안 한 사람이 열면
            가입 화면으로 코드를 들고 넘어가야 하는데, 가드 안에 있으면
            로그인 화면으로 튕기면서 코드가 사라진다. */}
        <Route path="/invite/:code" element={<InvitePage />} />

        {/* Protected routes */}
        <Route element={<AuthGuard />}>
          <Route element={<Layout />}>
            <Route path="/" element={<MvpDashboardPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            {/* 알림의 link 가 /calendar/<id> 다. 같은 화면에서 상세를 바로 연다. */}
            <Route path="/calendar/:id" element={<CalendarPage />} />
            <Route path="/scan" element={<ScanRoute />} />
            {/* fallback 이 null 이면 차트 청크(108 kB)를 받는 동안 화면이
                빈 칸이 된다. 느린 회선에서 "안 열린다"로 읽힌다. */}
            <Route
              path="/expenses"
              element={
                /* 배포로 청크 해시가 바뀌면 옛 HTML 을 들고 있던 사용자는
                   없는 파일을 요청하고, SPA 폴백이 200 + text/html 을 준다.
                   에러 경계가 없으면 빈 화면이 된다. */
                <LazyBoundary fallback={<ChartSkeleton />}>
                  <Suspense fallback={<ChartSkeleton />}>
                    <ExpensesPage />
                  </Suspense>
                </LazyBoundary>
              }
            />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/family" element={<FamilyPage />} />
            {/* 진짜 게이트는 서버(/api/admin/*)다. 이 라우트는 숨기지 않고,
                관리자가 아니면 AdminPage 가 안내 화면을 띄운다. */}
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
