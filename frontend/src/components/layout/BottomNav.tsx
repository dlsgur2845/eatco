import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', icon: 'kitchen', label: '냉장고' },
  { to: '/scan', icon: 'document_scanner', label: '스캔' },
  { to: '/inventory', icon: 'edit_note', label: '직접등록' },
  { to: '/settings', icon: 'settings', label: '설정' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-6 pt-3 bg-surface/80 backdrop-blur-xl rounded-t-[2.5rem] z-50 shadow-[0_-10px_40px_rgba(25,28,27,0.04)]">
      {navItems.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center transition-all active:scale-90 duration-200 relative ${
              isActive
                ? 'bg-primary-container text-white rounded-full px-5 py-2 scale-110'
                : 'text-slate-400 p-2 hover:text-primary'
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
              <span className="font-body text-[11px] font-bold uppercase tracking-wider mt-0.5">
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
