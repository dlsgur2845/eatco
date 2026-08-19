import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import type { CookingLog } from '../../types'

export function CookingStatsCard() {
  const [todayKcal, setTodayKcal] = useState(0)
  const [weekCount, setWeekCount] = useState(0)

  useEffect(() => {
    api
      .get<CookingLog[]>('/cooking-logs', { params: { limit: 50 } })
      .then((r) => {
        const now = new Date()
        const todayStr = now.toISOString().slice(0, 10)
        const weekAgo = new Date(now.getTime() - 7 * 86400_000)
        let kcal = 0
        let count = 0
        for (const log of r.data) {
          const d = new Date(log.cooked_at)
          if (log.cooked_at.slice(0, 10) === todayStr) kcal += log.total_kcal
          if (d >= weekAgo) count += 1
        }
        setTodayKcal(Math.round(kcal))
        setWeekCount(count)
      })
      .catch(() => {})
  }, [])

  return (
    <Link
      to="/cooking-logs"
      className="block mb-4 bg-gradient-to-r from-primary/10 to-primary-container/10 rounded-2xl p-4 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-outline mb-1">요리 기록</p>
          <div className="flex items-baseline gap-3">
            <div>
              <span className="font-headline font-bold text-2xl text-on-surface">{todayKcal}</span>
              <span className="text-sm text-on-surface-variant ml-1">kcal 오늘</span>
            </div>
            <div className="text-sm text-on-surface-variant">
              이번 주 <span className="font-bold text-on-surface">{weekCount}</span>번
            </div>
          </div>
        </div>
        <span className="material-symbols-outlined text-primary">chevron_right</span>
      </div>
    </Link>
  )
}
