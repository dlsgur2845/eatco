import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import FamilyPage from './pages/FamilyPage'
import InventoryPage from './pages/InventoryPage'
import LoginPage from './pages/LoginPage'
import MvpDashboardPage from './pages/MvpDashboardPage'
import NotificationsPage from './pages/NotificationsPage'
import RegisterAccountPage from './pages/RegisterAccountPage'
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

function AuthGuard() {
  const user = localStorage.getItem('user')
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<RegisterAccountPage />} />

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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
