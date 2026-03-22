import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import api from '../../api/client'

const navItems = [
  { to: '/', icon: 'dashboard', label: '대시보드' },
  { to: '/inventory', icon: 'kitchen', label: '식재료' },
  { to: '/notifications', icon: 'notifications', label: '알림', badge: true },
  { to: '/family', icon: 'group', label: '가족 관리' },
  { to: '/settings', icon: 'settings', label: '설정' },
]

export default function BottomNav() {
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const fetchUnread = () => {
      api
        .get<{ count: number }>('/notification-logs/unread-count')
        .then((r) => setUnreadCount(r.data.count))
        .catch(() => {})
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-6 pt-3 bg-surface/80 backdrop-blur-xl rounded-t-[2.5rem] z-50 shadow-[0_-10px_40px_rgba(25,28,27,0.04)]">
      {navItems.map(({ to, icon, label, badge }) => (
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
              {badge && unreadCount > 0 && (
                <span className="absolute -top-1 right-0 min-w-[16px] h-[16px] bg-tertiary-container text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
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
