import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import type { DashboardSummary, Ingredient } from '../types'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary>({ critical: 0, warning: 0, safe: 0 })
  const [recent, setRecent] = useState<Ingredient[]>([])

  useEffect(() => {
    api.get<DashboardSummary>('/dashboard/summary').then((r) => setSummary(r.data)).catch(() => {})
    api.get<Ingredient[]>('/dashboard/recent').then((r) => setRecent(r.data)).catch(() => {})
  }, [])

  const getDday = (expiryDate: string) => {
    const diff = Math.ceil(
      (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    )
    return diff
  }

  const getDdayStyle = (d: number) => {
    if (d <= 3) return 'bg-tertiary-container/10 text-tertiary-container border-tertiary-container'
    if (d <= 7) return 'bg-secondary-container/10 text-secondary-container border-secondary-container'
    return 'bg-primary-container/10 text-primary border-primary-container'
  }

  return (
    <div className="space-y-10">
      {/* Title */}
      <section>
        <h2 className="font-headline font-extrabold text-4xl tracking-tight text-on-surface mb-2">
          나의 냉장고 대시보드
        </h2>
        <p className="text-on-surface-variant font-medium">
          오늘도 신선한 재료들로 건강한 식사를 준비해보세요.
        </p>
      </section>

      {/* Expiry Alert */}
      {summary.critical > 0 && (
        <section>
          <div className="bg-tertiary-container/10 border-l-4 border-tertiary-container rounded-xl p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-tertiary-container text-white p-3 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  timer_off
                </span>
              </div>
              <div>
                <h3 className="font-headline font-bold text-lg text-on-tertiary-container">유통기한 임박 알림</h3>
                <p className="text-on-surface-variant text-sm mt-0.5">
                  {summary.critical}개의 식재료가 곧 만료됩니다.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/inventory')}
              className="bg-tertiary-container text-white px-5 py-2.5 rounded-full font-bold text-sm active:scale-95 transition-transform"
            >
              확인하기
            </button>
          </div>
        </section>
      )}

      {/* Status Cards */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-headline font-bold text-xl">식재료 현황</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatusCard label="3일 이내" count={summary.critical} icon="warning" variant="critical" />
          <StatusCard label="7일 이내" count={summary.warning} icon="schedule" variant="warning" />
          <StatusCard label="안전" count={summary.safe} icon="verified" variant="safe" />
        </div>
      </section>

      {/* Recent Items */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h3 className="font-headline font-bold text-xl">최근 등록된 식재료</h3>
          <button
            onClick={() => navigate('/inventory')}
            className="text-sm font-bold text-primary flex items-center gap-1 hover:underline"
          >
            전체보기 <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
        <div className="space-y-4">
          {recent.length === 0 && (
            <p className="text-on-surface-variant text-center py-12">
              등록된 식재료가 없습니다. 식재료를 추가해보세요.
            </p>
          )}
          {recent.map((item) => {
            const d = getDday(item.expiry_date)
            return (
              <div
                key={item.id}
                className={`bg-surface-container-lowest rounded-2xl p-5 flex items-center gap-5 hover:shadow-lg transition-shadow border-l-4 ${
                  d <= 3 ? 'border-tertiary-container' : d <= 7 ? 'border-secondary-container' : 'border-primary-container'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant">nutrition</span>
                </div>
                <div className="flex-grow min-w-0">
                  <h4 className="font-headline font-semibold text-lg text-on-surface truncate">{item.name}</h4>
                  <div className="flex items-center gap-1 mt-1 text-on-surface-variant text-sm">
                    <span className="material-symbols-outlined text-base">calendar_month</span>
                    {item.registered_at.slice(0, 10)} 등록
                  </div>
                </div>
                <span className={`inline-block px-4 py-1.5 rounded-full font-headline font-bold text-sm whitespace-nowrap ${getDdayStyle(d)}`}>
                  D{d <= 0 ? '-DAY' : `-${d}`}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function StatusCard({
  label,
  count,
  icon,
  variant,
}: {
  label: string
  count: number
  icon: string
  variant: 'critical' | 'warning' | 'safe'
}) {
  const styles = {
    critical: 'border-tertiary-container text-tertiary-container',
    warning: 'border-secondary-container text-secondary-container',
    safe: 'border-primary-container text-primary',
  }

  return (
    <div className={`bg-surface-container-lowest rounded-[2rem] p-8 shadow-[0_10px_40px_rgba(25,28,27,0.02)] border-l-4 relative overflow-hidden group ${styles[variant]}`}>
      <div className="relative z-10">
        <p className="font-body text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-4">
          {label}
        </p>
        <div className="flex items-baseline gap-2">
          <span className="font-headline font-bold text-5xl">{count}</span>
          <span className="font-headline font-bold text-xl text-on-surface">개</span>
        </div>
      </div>
      <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
        <span className="material-symbols-outlined text-8xl">{icon}</span>
      </div>
    </div>
  )
}
