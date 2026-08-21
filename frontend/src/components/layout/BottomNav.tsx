import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', icon: 'kitchen', label: '냉장고' },
  { to: '/scan', icon: 'document_scanner', label: '스캔' },
  { to: '/inventory', icon: 'edit_note', label: '재고' },
  { to: '/calendar', icon: 'calendar_month', label: '식단' },
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
            /* flex-1 min-w-0 를 **두 상태 모두**에 준다.
               예전엔 활성 탭만 px-5 + scale-110 인 알약이라 글자가 커지면 그만큼
               넓어졌다. 글꼴 크기 200%(iOS 손쉬운 사용 / Android 최대 글꼴)에서
               활성 탭이 156px 까지 부풀어 옆 탭을 7px 침범했고, 나머지 네 탭은
               간격 0으로 붙어버렸다. 실측값이다.
               다섯 칸이 폭을 균등하게 나눠 가지면 글자가 아무리 커져도 안 겹친다. */
            `flex-1 min-w-0 min-h-[48px] flex flex-col items-center justify-center transition-all active:scale-90 duration-200 relative ${
              isActive
                ? 'bg-primary-container text-on-primary-container rounded-full py-2'
                : 'text-on-surface-variant p-2 hover:text-primary'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span aria-hidden="true"
                className="material-symbols-outlined"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {icon}
              </span>
              {/* 한글에는 uppercase 가 무효이고 tracking-wider 는 음절을 벌려놓는다.
                  11px 한글은 가독 하한 미만이라 12px + 굵기 600 으로. */}
              {/* 라벨 크기에 상한을 둔다.
                  글꼴 200% 에서 "냉장고" 가 1/5 칸에 안 들어간다. truncate 를
                  걸었더니 다섯 탭이 전부 "냉…" "스…" "재…" 로 잘려서 겹침보다
                  나빠졌다. iOS 탭바가 실제로 하는 방식대로 라벨 크기에만 상한을
                  둔다 — 아이콘과 aria-label 이 의미를 지고 있으므로 라벨이 조금
                  덜 커져도 읽는 데 지장이 없다.
                  clamp: 100% 에서 12px, 200% 에서 14px 로 멈춘다. */}
              <span
                className="font-body font-semibold mt-0.5 max-w-full"
                style={{ fontSize: 'clamp(11px, 0.75rem, 14px)' }}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
