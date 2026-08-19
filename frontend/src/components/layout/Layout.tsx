import { Outlet } from 'react-router-dom'
import WhatsNew from '../WhatsNew'
import BottomNav from './BottomNav'
import TopAppBar from './TopAppBar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-surface">
      <TopAppBar />
      <main
        className="max-w-screen-lg mx-auto px-6 pt-8"
        style={{ paddingBottom: 'calc(8rem + env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </main>
      <BottomNav />
      <WhatsNew />
    </div>
  )
}
