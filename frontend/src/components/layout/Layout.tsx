import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import TopAppBar from './TopAppBar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-surface">
      <TopAppBar />
      <main className="max-w-screen-xl mx-auto px-6 pt-8 pb-32">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
