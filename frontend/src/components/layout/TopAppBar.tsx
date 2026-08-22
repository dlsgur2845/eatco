import { useNavigate } from 'react-router-dom'
import { useUnreadCount } from '../../hooks/useUnreadCount'

export default function TopAppBar() {
  const navigate = useNavigate()
  const { count: unreadCount } = useUnreadCount()
  const user = sessionStorage.getItem('user')
    ? JSON.parse(sessionStorage.getItem('user')!)
    : null

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
          <span aria-hidden="true" className="material-symbols-outlined text-primary">restaurant_menu</span>
          <span className="font-headline font-bold text-xl text-primary tracking-tight">Eatco</span>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            {/* 가계부. 설정 안에 묻혀 있던 걸 꺼냈다.
                자주 보는 화면인데 설정 → 스크롤 → 가계부 였다. */}
            <button
              onClick={() => navigate('/expenses')}
              className="min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors"
              aria-label="가계부"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-on-surface-variant text-xl">
                account_balance_wallet
              </span>
            </button>

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
              <span aria-hidden="true" className="material-symbols-outlined text-on-surface-variant text-xl">
                notifications
              </span>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-tertiary text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* 아바타 = 마이페이지.
                예전엔 닉네임을 글자로 띄웠는데 `hidden sm:inline` 이라
                **핸드폰에서는 아예 안 보였다.** 누를 것 자체가 없었다.
                첫 글자 동그라미는 어느 폭에서도 보이고 48×48 을 채운다.
                로그아웃은 이 안으로 들어갔다 — 계정 메뉴가 제자리다. */}
            <button
              onClick={() => navigate('/me')}
              className="min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors"
              aria-label={`${user.nickname} 마이페이지`}
            >
              <span
                aria-hidden="true"
                className="w-9 h-9 rounded-full inline-flex items-center justify-center text-sm font-bold"
                style={{ backgroundColor: 'var(--color-primary-container)', color: 'var(--color-on-primary-container)' }}
              >
                {user.nickname.trim().charAt(0).toUpperCase()}
              </span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
