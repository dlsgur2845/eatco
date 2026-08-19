import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import { CookModal } from '../components/cooking/CookModal'
import { formatAmount } from '../lib/format'
import type { CookingLog } from '../types'
import { UNIT_LABEL } from '../types'

function groupByDate(logs: CookingLog[]): Record<string, CookingLog[]> {
  const grouped: Record<string, CookingLog[]> = {}
  for (const log of logs) {
    const d = log.cooked_at.slice(0, 10)
    if (!grouped[d]) grouped[d] = []
    grouped[d].push(log)
  }
  return grouped
}

function formatDateKr(yyyymmdd: string): string {
  const d = new Date(yyyymmdd)
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', weekday: 'short' }
  return d.toLocaleDateString('ko-KR', opts)
}

export default function CookingLogPage() {
  const [logs, setLogs] = useState<CookingLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showCook, setShowCook] = useState(false)
  const [selected, setSelected] = useState<CookingLog | null>(null)
  const [error, setError] = useState('')

  const fetchLogs = useCallback(() => {
    setLoading(true)
    api
      .get<CookingLog[]>('/cooking-logs', { params: { limit: 100 } })
      .then((r) => setLogs(r.data))
      .catch(() => setError('기록을 불러오지 못했어요.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleDelete = async (id: string) => {
    if (!confirm('이 기록을 삭제할까요? 재고는 복구되지 않아요.')) return
    try {
      await api.delete(`/cooking-logs/${id}`)
      setSelected(null)
      fetchLogs()
    } catch {
      alert('삭제에 실패했어요.')
    }
  }

  const grouped = groupByDate(logs)
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="px-5 pt-8 pb-24 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            요리 기록
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            오늘까지 {logs.length}번 요리했어요
          </p>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-surface-container-lowest animate-pulse" />
          ))}
        </div>
      )}

      {!loading && logs.length === 0 && (
        <div className="rounded-2xl py-16 text-center bg-surface-container-low">
          <span className="material-symbols-outlined text-outline-variant text-6xl mb-3 block">
            restaurant
          </span>
          <p className="text-on-surface-variant mb-4">아직 기록된 요리가 없어요.</p>
          <button
            onClick={() => setShowCook(true)}
            className="text-primary font-bold hover:underline inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            첫 요리 기록하기
          </button>
        </div>
      )}

      {!loading &&
        dates.map((date) => (
          <div key={date} className="mb-6">
            <h2
              className="text-xs font-bold uppercase tracking-wider mb-2"
              style={{ color: 'var(--color-outline)' }}
            >
              {formatDateKr(date)}
            </h2>
            <div className="space-y-2">
              {grouped[date].map((log) => (
                <button
                  key={log.id}
                  onClick={() => setSelected(log)}
                  className="w-full text-left bg-surface-container-lowest rounded-2xl p-4 flex items-center gap-4 shadow-sm active:scale-[0.98] transition-transform"
                >
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-primary">restaurant</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-on-surface truncate">
                      {log.recipe_name_snapshot}
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                      {log.items.length}개 재료 · {log.cooked_by || '가족'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">{Math.round(log.total_kcal)} kcal</p>
                    <p className="text-[10px] text-on-surface-variant">
                      {log.cooked_at.slice(11, 16)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

      {error && <p className="text-tertiary text-center mt-4">{error}</p>}

      {/* FAB */}
      <button
        onClick={() => setShowCook(true)}
        className="fixed right-6 bottom-28 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-container text-white shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {showCook && (
        <CookModal
          onClose={() => setShowCook(false)}
          onSuccess={() => {
            setShowCook(false)
            fetchLogs()
          }}
        />
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          />
          <div className="relative z-10 w-full max-w-md bg-surface rounded-[2rem] p-6 shadow-2xl mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline font-bold text-xl">{selected.recipe_name_snapshot}</h3>
              <button
                onClick={() => setSelected(null)}
                className="p-2 hover:bg-surface-container-high rounded-full"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-xs text-on-surface-variant mb-4">
              {new Date(selected.cooked_at).toLocaleString('ko-KR')} · {selected.cooked_by || '가족'}
            </p>

            <div className="bg-primary/5 rounded-xl p-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-on-surface-variant">총 칼로리</span>
              <span className="font-headline font-bold text-2xl">
                {Math.round(selected.total_kcal)} kcal
              </span>
            </div>

            <h4 className="text-xs font-bold uppercase tracking-wider text-outline mb-2">
              사용한 재료
            </h4>
            <div className="space-y-2 mb-6">
              {selected.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between bg-surface-container-lowest rounded-lg p-3"
                >
                  <div>
                    <p className="font-semibold text-sm">{item.ingredient_name_snapshot}</p>
                    <p className="text-[11px] text-on-surface-variant">
                      {formatAmount(item.amount_used, item.unit)} {UNIT_LABEL[item.unit]}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{Math.round(item.kcal)} kcal</p>
                    {item.nutrition_source === 'gemini' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container">
                        추정
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelected(null)
                  setShowCook(true)
                }}
                className="flex-1 py-3 rounded-full bg-surface-container-high text-on-surface font-bold flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                다시 입력
              </button>
              <button
                onClick={() => handleDelete(selected.id)}
                className="flex-1 py-3 rounded-full bg-tertiary-container text-on-tertiary-container font-bold flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                삭제
              </button>
            </div>
            <p className="text-[10px] text-on-surface-variant text-center mt-2">
              삭제해도 재고는 복구되지 않아요.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
