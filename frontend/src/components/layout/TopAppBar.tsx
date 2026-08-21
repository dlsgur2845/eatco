import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import { useUnreadCount } from '../../hooks/useUnreadCount'

export default function TopAppBar() {
  const navigate = useNavigate()
  const { count: unreadCount } = useUnreadCount()
  const user = localStorage.getItem('user')
    ? JSON.parse(localStorage.getItem('user')!)
    : null

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      /* ignore */
    }
    localStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  return (
    <header
      className="bg-surface sticky top-0 z-50 shadow-[0_10px_40px_rgba(25,28,27,0.04)]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* 높이를 index.css 의 --eatco-topbar-h 로 못박는다.
          캘린더 컨트롤 바가 이 바로 아래에 붙기 때문에, 여기 내용이 바뀌어
          높이가 흔들리면 그 바가 겹치거나 틈이 생긴다. 숫자는 한 곳에만 둔다. */}
      <div
        className="flex justify-between items-center px-6 py-4 w-full max-w-screen-xl mx-auto"
        style={{ minHeight: 'var(--eatco-topbar-h)' }}
      >
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">restaurant_menu</span>
          <span className="font-headline font-bold text-xl text-primary tracking-tight">Eatco</span>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant font-medium hidden sm:inline">
              {user.nickname}
            </span>

            {/* 알림 아이콘.

                `p-2` 만 있어서 실측 **40×47px** 이었다. iOS HIG 44pt 와
                DESIGN.md §4 의 48×48 을 둘 다 밑돌았고, 앱에서 가장 자주 닿는
                버튼인데다 **모든 화면에 있었다.** 패딩으로 크기를 맞추면
                아이콘 크기가 바뀔 때 조용히 무너지므로 최소치를 명시한다. */}
            <button
              onClick={() => navigate('/notifications')}
              className="relative min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors"
              aria-label="알림"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-xl">
                notifications
              </span>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-tertiary text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* 로그아웃 */}
            <button
              onClick={handleLogout}
              className="text-on-surface-variant hover:text-tertiary transition-colors min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-full hover:bg-surface-container-high"
              aria-label="로그아웃"
            >
              <span className="material-symbols-outlined text-xl">logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
