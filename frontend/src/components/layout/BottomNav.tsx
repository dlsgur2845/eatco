import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', icon: 'kitchen', label: '냉장고' },
  { to: '/scan', icon: 'document_scanner', label: '스캔' },
  { to: '/inventory', icon: 'edit_note', label: '재고' },
  { to: '/expenses', icon: 'account_balance_wallet', label: '가계부' },
  { to: '/settings', icon: 'settings', label: '설정' },
]

export default function BottomNav() {
  // 홈 인디케이터를 피한다. index.html 의 viewport-fit=cover 가 있어야 env() 가 0이 아니다.
  const safeAreaPadding = { paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }

  return (
    <nav
      className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pt-3 bg-surface/80 backdrop-blur-xl rounded-t-[2.5rem] z-50 shadow-[0_-10px_40px_rgba(25,28,27,0.04)]"
      style={safeAreaPadding}
    >
      {navItems.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          // View Transitions API. 라이브러리 0 kB — react-router 가
          // document.startViewTransition 을 호출하고, 실제 전환 모양은
          // index.css 의 ::view-transition-* 가 정한다.
          // 미지원 브라우저(구형 Android)는 전환 없이 그냥 넘어간다. 깨지지 않는다.
          viewTransition
          className={({ isActive }) =>
            `flex flex-col items-center justify-center transition-all active:scale-90 duration-200 relative ${
              isActive
                ? 'bg-primary-container text-on-primary-container rounded-full px-5 py-2 scale-110'
                : 'text-on-surface-variant p-2 min-w-[48px] min-h-[48px] hover:text-primary'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className="material-symbols-outlined"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {icon}
              </span>
              {/* 한글에는 uppercase 가 무효이고 tracking-wider 는 음절을 벌려놓는다.
                  11px 한글은 가독 하한 미만이라 12px + 굵기 600 으로. */}
              <span className="font-body text-xs font-semibold mt-0.5">
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
