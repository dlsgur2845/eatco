import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'

export default function TopAppBar() {
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const user = localStorage.getItem('user')
    ? JSON.parse(localStorage.getItem('user')!)
    : null

  useEffect(() => {
    if (!user) return
    const fetchUnread = () => {
      api
        .get<{ count: number }>('/notification-logs/unread-count')
        .then((r) => setUnreadCount(r.data.count))
        .catch(() => {})
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000) // 30초마다 갱신
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      /* ignore */
    }
    localStorage.removeItem('user')
    navigate('/login')
  }

  return (
    <header className="bg-surface sticky top-0 z-50 shadow-[0_10px_40px_rgba(25,28,27,0.04)]">
      <div className="flex justify-between items-center px-6 py-4 w-full max-w-screen-xl mx-auto">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">restaurant_menu</span>
          <h1 className="font-headline font-bold text-xl text-primary tracking-tight">Eatco</h1>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant font-medium hidden sm:inline">
              {user.nickname}
            </span>

            {/* 알림 아이콘 */}
            <button
              onClick={() => navigate('/notifications')}
              className="relative p-2 rounded-full hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-xl">
                notifications
              </span>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-tertiary-container text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* 로그아웃 */}
            <button
              onClick={handleLogout}
              className="text-on-surface-variant hover:text-tertiary transition-colors p-2 rounded-full hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-xl">logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
