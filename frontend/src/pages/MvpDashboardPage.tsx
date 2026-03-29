import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import { logEvent } from '../api/events'
import { getRecommendations, type Recipe } from '../api/recipes'
import { deleteItem, getItems, updateItem, type DashboardItem } from '../api/scan'
import RecipeCard from '../components/recipe/RecipeCard'

interface InflationAlert { name: string; current_price: number; old_price: number; change_pct: number }
interface BudgetInfo { monthly_budget: number | null; spent_this_month: number }

export default function MvpDashboardPage() {
  const [items, setItems] = useState<DashboardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [undoItem, setUndoItem] = useState<{ item: DashboardItem; timeout: ReturnType<typeof setTimeout> } | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [recipesLoading, setRecipesLoading] = useState(true)
  const [alerts, setAlerts] = useState<InflationAlert[]>([])
  const [budget, setBudget] = useState<BudgetInfo | null>(null)

  const fetchItems = useCallback(async () => {
    try {
      setError(null)
      const data = await getItems()
      setItems(data)
      logEvent('view_dashboard', { items_count: data.length })
    } catch {
      setError('식재료를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
    getRecommendations()
      .then(setRecipes)
      .catch(() => {})
      .finally(() => setRecipesLoading(false))
    api.get<InflationAlert[]>('/expenses/alerts').then(r => setAlerts(r.data)).catch(() => {})
    api.get<BudgetInfo>('/expenses/budget').then(r => setBudget(r.data)).catch(() => {})
  }, [fetchItems])

  const handleDelete = async (item: DashboardItem) => {
    // 이전 undo가 있으면 즉시 확정
    if (undoItem) {
      clearTimeout(undoItem.timeout)
      deleteItem(undoItem.item.id).catch(() => {
        setItems(prev => [...prev, undoItem.item].sort((a, b) => a.days_left - b.days_left))
      })
    }

    // 일단 UI에서 제거 (optimistic)
    setItems(prev => prev.filter(i => i.id !== item.id))

    // 3초 undo 스냅바
    const timeout = setTimeout(async () => {
      try {
        await deleteItem(item.id)
        logEvent('use_item', { item_name: item.name })
        // 삭제 확정 후 추천 갱신
        getRecommendations().then(setRecipes).catch(() => {})
      } catch {
        setItems(prev => [...prev, item].sort((a, b) => a.days_left - b.days_left))
      }
      setUndoItem(null)
    }, 3000)

    setUndoItem({ item, timeout })
  }

  const handleUndo = () => {
    if (!undoItem) return
    clearTimeout(undoItem.timeout)
    setItems(prev => [...prev, undoItem.item].sort((a, b) => a.days_left - b.days_left))
    setUndoItem(null)
  }

  const handleUpdateQty = async (item: DashboardItem, newQty: string) => {
    try {
      await updateItem(item.id, { quantity: newQty })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: newQty } : i))
      logEvent('update_quantity', { item_name: item.name, new_quantity: newQty })
    } catch {
      // 실패 시 무시
    }
  }

  // 긴급도 분류
  const urgent = items.filter(i => i.days_left <= 1)
  const soon = items.filter(i => i.days_left >= 2 && i.days_left <= 3)
  const fresh = items.filter(i => i.days_left >= 4)

  const daysColor = (d: number) => {
    if (d <= 1) return 'var(--color-tertiary-container)'
    if (d <= 3) return 'var(--color-secondary-container)'
    return 'var(--color-primary)'
  }

  const daysLabel = (d: number) => {
    if (d < 0) return `D+${Math.abs(d)}`
    if (d === 0) return 'D-Day'
    return `D-${d}`
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-5 pt-8">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--color-surface-container-low)' }} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-5">
        <p className="text-sm mb-4" style={{ color: 'var(--color-error)' }}>{error}</p>
        <button
          className="px-6 py-2 rounded-full text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))' }}
          onClick={fetchItems}
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className="px-5 pt-8 pb-24 min-h-screen">
      {/* 헤더 */}
      <h1
        className="text-xl font-bold mb-1"
        style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
      >
        우리 집 냉장고
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--color-on-surface-variant)' }}>
        총 {items.length}개 식재료
      </p>

      {/* 빈 상태 */}
      {items.length === 0 && (
        <div
          className="rounded-2xl py-16 flex flex-col items-center gap-3"
          style={{ backgroundColor: 'var(--color-surface-container-low)' }}
        >
          <span className="text-4xl opacity-30">🥬</span>
          <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            아직 등록된 식재료가 없어요
          </p>
          <p className="text-xs" style={{ color: 'var(--color-outline)' }}>
            스캔 탭에서 영수증을 등록해보세요
          </p>
        </div>
      )}

      {/* 인플레이션 알림 */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-4">
          {alerts.slice(0, 2).map((a, i) => (
            <div key={i} className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#fce4e4' }}>
              <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-tertiary-container)' }}>trending_up</span>
              <p className="text-xs" style={{ color: 'var(--color-on-surface)' }}>
                <strong>{a.name}</strong>이(가) {a.change_pct}% 비싸졌어요
                <span className="ml-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                  ({a.old_price.toLocaleString()}원 → {a.current_price.toLocaleString()}원)
                </span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 예산 프로그레스 */}
      {budget && budget.monthly_budget && budget.monthly_budget > 0 && (
        <div className="mb-4 px-1">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>이번 달 예산</span>
            <span className="text-xs" style={{ color: 'var(--color-on-surface)' }}>
              {budget.spent_this_month.toLocaleString()}원 / {budget.monthly_budget.toLocaleString()}원
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-container)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (budget.spent_this_month / budget.monthly_budget) * 100)}%`,
                backgroundColor: budget.spent_this_month > budget.monthly_budget
                  ? 'var(--color-tertiary-container)'
                  : 'var(--color-primary)',
              }}
            />
          </div>
        </div>
      )}

      {/* 요약 카드 */}
      {items.length > 0 && (
        <div className="flex gap-3 mb-6">
          <StatCard count={urgent.length} label="오늘 써야 해요" color="var(--color-tertiary-container)" bgColor="#fce4e4" />
          <StatCard count={soon.length} label="3일 이내" color="var(--color-secondary-container)" bgColor="#fff3e0" />
          <StatCard count={fresh.length} label="여유 있어요" color="var(--color-primary)" bgColor="#e8f5e9" />
        </div>
      )}

      {/* 오늘의 추천 */}
      {recipesLoading ? (
        <div className="flex gap-3 mb-6 overflow-x-auto">
          {[1, 2].map(i => (
            <div key={i} className="flex-shrink-0 w-56 h-48 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--color-surface-container-low)' }} />
          ))}
        </div>
      ) : recipes.length > 0 ? (
        <>
          {/* 재료 기반 추천 */}
          {recipes.filter(r => r.match_count > 0).length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold tracking-wide mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
                냉장고 재료로 만들 수 있어요
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
                {recipes.filter(r => r.match_count > 0).map((r, i) => (
                  <RecipeCard key={i} recipe={r} />
                ))}
              </div>
            </div>
          )}
          {/* 추가 추천 (매칭 무관) */}
          {recipes.filter(r => r.match_count === 0).length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold tracking-wide mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
                이런 요리는 어때요?
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
                {recipes.filter(r => r.match_count === 0).map((r, i) => (
                  <RecipeCard key={i} recipe={r} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* 오늘 써야 할 식재료 */}
      {urgent.length > 0 && (
        <Section title="오늘 써야 할 식재료">
          {urgent.map(item => (
            <ItemRow key={item.id} item={item} daysColor={daysColor} daysLabel={daysLabel} onDelete={handleDelete} onUpdate={handleUpdateQty} />
          ))}
        </Section>
      )}

      {/* 곧 써야 할 식재료 */}
      {soon.length > 0 && (
        <Section title="곧 써야 할 식재료">
          {soon.map(item => (
            <ItemRow key={item.id} item={item} daysColor={daysColor} daysLabel={daysLabel} onDelete={handleDelete} onUpdate={handleUpdateQty} />
          ))}
        </Section>
      )}

      {/* 여유 있는 식재료 */}
      {fresh.length > 0 && (
        <Section title="여유 있어요">
          {fresh.map(item => (
            <ItemRow key={item.id} item={item} daysColor={daysColor} daysLabel={daysLabel} onDelete={handleDelete} onUpdate={handleUpdateQty} />
          ))}
        </Section>
      )}

      {/* 스냅바 undo */}
      {undoItem && (
        <div
          className="fixed bottom-28 left-4 right-4 mx-auto max-w-md flex items-center justify-between px-4 py-3 rounded-xl shadow-lg z-50"
          style={{ backgroundColor: 'var(--color-on-surface)', color: 'var(--color-surface)' }}
        >
          <span className="text-sm">
            {undoItem.item.name} 삭제됨
          </span>
          <button
            className="text-sm font-semibold ml-4"
            style={{ color: 'var(--color-primary-container)' }}
            onClick={handleUndo}
          >
            되돌리기
          </button>
        </div>
      )}
    </div>
  )
}

function StatCard({ count, label, color, bgColor }: { count: number; label: string; color: string; bgColor: string }) {
  return (
    <div className="flex-1 py-4 rounded-2xl text-center" style={{ backgroundColor: bgColor }}>
      <p className="text-3xl font-bold" style={{ fontFamily: 'var(--font-headline)', color }}>{count}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold tracking-wide mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>
        {title}
      </h3>
      <div>{children}</div>
    </div>
  )
}

function ItemRow({
  item,
  daysColor,
  daysLabel,
  onDelete,
  onUpdate,
}: {
  item: DashboardItem
  daysColor: (d: number) => string
  daysLabel: (d: number) => string
  onDelete: (item: DashboardItem) => void
  onUpdate: (item: DashboardItem, newQty: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editQty, setEditQty] = useState(item.quantity || '')
  const storageLabel = item.storage_method === 'refrigerated' ? '냉장' : item.storage_method === 'frozen' ? '냉동' : '실온'
  const regDate = item.registered_at ? new Date(item.registered_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) + '일' : ''
  const byWho = item.registered_by ? ` · ${item.registered_by}` : ''
  const qtyText = item.quantity ? ` · ${item.quantity}` : ''
  const priceText = item.price ? ` · ${item.price.toLocaleString()}원` : ''

  return (
    <div className="flex items-center gap-3 py-3 group">
      {/* 상태 바 */}
      <div className="w-1 h-9 rounded-full flex-shrink-0" style={{ backgroundColor: daysColor(item.days_left) }} />

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--color-on-surface)' }}>
          {item.name}{qtyText}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-on-surface-variant)' }}>
          {regDate}{byWho}{priceText} · {storageLabel}
        </p>
      </div>

      {/* D-day */}
      <span className="text-xs font-semibold flex-shrink-0" style={{ color: daysColor(item.days_left) }}>
        {daysLabel(item.days_left)}
      </span>

      {/* 수량 수정 모드 */}
      {editing ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            className="w-16 text-xs px-2 py-1 rounded-md outline-none"
            style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)' }}
            value={editQty}
            onChange={e => setEditQty(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { onUpdate(item, editQty); setEditing(false) }
              if (e.key === 'Escape') setEditing(false)
            }}
            autoFocus
            placeholder="수량"
          />
          <button
            className="text-xs font-semibold px-1"
            style={{ color: 'var(--color-primary)' }}
            onClick={() => { onUpdate(item, editQty); setEditing(false) }}
          >
            확인
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {item.quantity && (
            <button
              className="text-xs px-3 py-2.5 rounded-lg min-h-[44px]"
              style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' }}
              onClick={() => setEditing(true)}
              aria-label={`${item.name} 수량 변경`}
            >
              일부 사용
            </button>
          )}
          <button
            className="text-xs px-3 py-2.5 rounded-lg min-h-[44px]"
            style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' }}
            onClick={() => onDelete(item)}
            aria-label={`${item.name} 사용 완료`}
          >
            다 썼어요
          </button>
        </div>
      )}
    </div>
  )
}
