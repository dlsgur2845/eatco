import { useCallback, useEffect, useRef, useState } from 'react'
import CountUp from '../components/motion/CountUp'
import { freshnessColor, daysLabel as fmtDays } from '../lib/freshness'
import api from '../api/client'
import { logEvent } from '../api/events'
import { getRecommendations, type Recipe } from '../api/recipes'
import { deleteItem, getItems, restoreItem, updateItem, type DashboardItem } from '../api/scan'
import RecipeCard from '../components/recipe/RecipeCard'
import AddRecipeSheet from '../components/recipe/AddRecipeSheet'
import SharedRecipeCard from '../components/recipe/SharedRecipeCard'
import { getSharedRecipes, type SharedRecipe } from '../api/sharedRecipes'
import { josa } from '../lib/korean'
import { formatDate, meansUsedUp } from '../lib/format'

interface InflationAlert { name: string; current_price: number; old_price: number; change_pct: number }
interface BudgetInfo { monthly_budget: number | null; spent_this_month: number }

export default function MvpDashboardPage() {
  const [items, setItems] = useState<DashboardItem[]>([])
  // 되돌리기가 네트워크 요청이 되면서 연타·실패를 처리해야 한다.
  const undoBusyRef = useRef(false)
  const [undoError, setUndoError] = useState<string | null>(null)
  const [restoredName, setRestoredName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [undoItem, setUndoItem] = useState<{ item: DashboardItem } | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [recipesLoading, setRecipesLoading] = useState(true)
  const [shared, setShared] = useState<SharedRecipe[]>([])
  const [showAddRecipe, setShowAddRecipe] = useState(false)
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
    // 실패해도 대시보드는 그려야 한다 (추천과 같은 방식으로 조용히 삼킨다).
    getSharedRecipes().then(setShared).catch(() => {})
    api.get<InflationAlert[]>('/expenses/alerts').then(r => setAlerts(r.data)).catch(() => {})
    api.get<BudgetInfo>('/expenses/budget').then(r => setBudget(r.data)).catch(() => {})
  }, [fetchItems])

  /**
   * 「다 썼어요」 — **즉시 삭제한다.**
   *
   * 예전에는 3초 뒤에 삭제했다. 그 3초 안에 새로고침하면 타이머가 죽어서 삭제가
   * 아예 안 나갔고(재현 확인: 8개 → 클릭 → 새로고침 → 여전히 8개), 추천도
   * 3.4초 동안 옛 목록 그대로였다. 두 문제가 같은 원인이었다.
   * 이제 즉시 지우고, 되돌리기가 다시 넣는다.
   */
  const handleDelete = async (item: DashboardItem) => {
    setItems(prev => prev.filter(i => i.id !== item.id))
    setUndoError(null)
    try {
      await deleteItem(item.id)
      logEvent('use_item', { item_name: item.name })
      getRecommendations().then(setRecipes).catch(() => {})
      getSharedRecipes().then(setShared).catch(() => {})
      setUndoItem({ item })
    } catch {
      // 실패했으면 화면을 되돌린다. 조용히 사라지게 두면 안 된다.
      setItems(prev => [...prev, item].sort((a, b) => a.days_left - b.days_left))
      setUndoError('지우지 못했어요. 다시 시도해주세요.')
    }
  }

  /**
   * 되돌리기 — 서버에 **다시 등록**한다. 더 이상 로컬 취소가 아니다.
   *
   * 그래서 실패할 수 있고, 새 id 를 받는다. 둘 다 처리해야 한다.
   */
  const handleUndo = async () => {
    if (!undoItem || undoBusyRef.current) return
    undoBusyRef.current = true          // 동기 ref — state 로는 연타를 못 막는다
    setUndoError(null)
    try {
      const restored = await restoreItem(undoItem.item)
      // **응답의 새 id 로 교체한다.** 옛 id 를 넣으면 그 행의 버튼이 404 를 때린다.
      setItems(prev => [...prev, restored].sort((a, b) => a.days_left - b.days_left))
      setUndoItem(null)
      setRestoredName(undoItem.item.name)
      // 무효화만으로는 화면이 안 바뀐다. 지울 때와 똑같이 다시 받아야 한다.
      getRecommendations().then(setRecipes).catch(() => {})
      getSharedRecipes().then(setShared).catch(() => {})
    } catch {
      // 재료가 이미 서버에서 사라졌으므로 조용히 끝내면 영영 못 되돌린다.
      setUndoError('다시 넣지 못했어요.')
    } finally {
      undoBusyRef.current = false
    }
  }

  /* 스낵바를 치우는 타이머. 예전에는 「3초 뒤 삭제」 타이머가 이 일까지 겸했는데,
     즉시 삭제로 바꾸면서 그 타이머가 사라졌다. 없으면 스낵바가 영영 안 없어진다.
     5초다 — 3초는 삭제 지연 시간이었지 읽는 시간이 아니었고, 한글 이름을 읽고
     되돌릴지 정하기엔 짧다. */
  useEffect(() => {
    if (!undoItem) return
    const t = setTimeout(() => setUndoItem(null), 5000)
    return () => clearTimeout(t)
  }, [undoItem])

  useEffect(() => {
    if (!restoredName) return
    const t = setTimeout(() => setRestoredName(null), 3000)
    return () => clearTimeout(t)
  }, [restoredName])

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

  const daysColor = freshnessColor

  const daysLabel = fmtDays

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
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
          className="px-6 min-h-[48px] inline-flex items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
          onClick={fetchItems}
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className="">
      {/* 헤더 */}
      <h1
        className="text-2xl font-bold mb-1"
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
          <span aria-hidden="true" className="material-symbols-outlined text-4xl opacity-30" style={{ color: 'var(--color-primary)' }}>eco</span>
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
            <div key={i} className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: 'color-mix(in srgb, var(--color-tertiary-container) 10%, white)' }}>
              <span aria-hidden="true" className="material-symbols-outlined text-sm" style={{ color: 'var(--color-tertiary)' }}>trending_up</span>
              <p className="text-xs" style={{ color: 'var(--color-on-surface)' }}>
                <strong>{a.name}</strong>
                {josa(a.name, '이')} {a.change_pct}% 비싸졌어요
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
                  ? 'var(--color-tertiary)'
                  : 'var(--color-primary)',
              }}
            />
          </div>
        </div>
      )}

      {/* 요약 카드 */}
      {items.length > 0 && (
        <div className="flex gap-3 mb-6">
          <StatCard count={urgent.length} label="오늘 써야 해요" color="var(--color-tertiary)" bgColor="color-mix(in srgb, var(--color-tertiary-container) 10%, white)" />
          <StatCard count={soon.length} label="3일 이내" color="var(--color-secondary)" bgColor="color-mix(in srgb, var(--color-secondary-container) 15%, white)" />
          <StatCard count={fresh.length} label="여유 있어요" color="var(--color-primary)" bgColor="color-mix(in srgb, var(--color-primary) 10%, white)" />
        </div>
      )}

      {/* 오늘의 추천 */}
      {/* 섹션 순서에 이유가 있다.
          예전 순서는 요약 → 추천 → 모두의 메뉴 → 오늘 써야 할 식재료였다.
          그래서 「다 썼어요」 버튼이 959px, 추천 캐러셀이 250px 에 있었고,
          설치형 PWA 화면이 614px 이라 **둘이 같은 화면에 절대 못 왔다.**
          재료를 소비해도 추천이 바뀌는 걸 볼 수 없으니, 지연을 없애도 체감이 그대로였다.
          오늘 써야 할 식재료를 추천 바로 위로 올려 둘을 한 화면에 넣는다. */}
      {/* 오늘 써야 할 식재료 */}
      {urgent.length > 0 && (
        <Section title="오늘 써야 할 식재료">
          {urgent.map(item => (
            <ItemRow key={item.id} item={item} daysColor={daysColor} daysLabel={daysLabel} onDelete={handleDelete} onUpdate={handleUpdateQty} />
          ))}
        </Section>
      )}

      {/* 곧 써야 할 식재료 */}
      {recipesLoading ? (
        <div className="flex gap-3 mb-6 overflow-x-auto">
          {[1, 2].map(i => (
            <div key={i} className="flex-shrink-0 w-56 h-48 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--color-surface-container-low)' }} />
          ))}
        </div>
      ) : recipes.length > 0 ? (
        /* 한 줄만 남는다. 서버(`/recipes/recommend`)가 이미 `match_count > 0` 만
           보내므로, 예전의 「이런 요리는 어때요?」(매칭 0건) 블록은 **항상 비어 있었다.**
           브라우저에서도 렌더되지 않는 것을 확인하고 지웠다. */
        <div className="mb-6">
          <h3 className="text-base font-semibold tracking-wide mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
            냉장고 재료로 만들 수 있어요
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
            {recipes.map((r, i) => (
              <RecipeCard key={i} recipe={r} />
            ))}
          </div>
        </div>
      ) : (
        /* 냉장고가 비면 서버가 `[]` 를 준다. 예전에는 여기서 아무것도 안 그려서
           신규 가족에게 추천 자리가 통째로 사라졌다 — 고장으로 읽힌다.
           비어 있음과 오류를 구분해서 말한다 (DESIGN.md 5절). */
        <div className="mb-6">
          <h3 className="text-base font-semibold tracking-wide mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
            냉장고 재료로 만들 수 있어요
          </h3>
          <p
            className="w-full py-6 rounded-2xl text-sm text-center"
            style={{
              backgroundColor: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            재료를 등록하면 만들 수 있는 요리를 찾아드려요.
          </p>
        </div>
      )}

      {/* 모두의 메뉴 — 이 앱에서 유일하게 가족 경계를 넘는 화면 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>
            모두의 메뉴
          </h3>
          {/* 눈에 띄어야 한다는 요구가 있었다. 목록이 비어 있어도 항상 보인다 —
              첫 사용자에게는 이 버튼이 유일한 진입점이다. */}
          <button
            type="button"
            onClick={() => setShowAddRecipe(true)}
            className="flex items-center gap-1 pl-4 pr-5 min-h-[48px] rounded-full text-sm font-semibold transition-transform active:scale-95"
            style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
          >
            <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
            나의 메뉴 추가
          </button>
        </div>

        {shared.length > 0 ? (
          /* 매칭 높은 순. 0건도 숨기지 않는다 — 이 화면이 비면 커뮤니티가 죽는다.
             sort 는 안정 정렬이라 동점은 서버가 준 최신순을 유지한다. */
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
            {[...shared].sort((a, b) => b.match_count - a.match_count).map(r => (
              <SharedRecipeCard key={r.id} recipe={r} onDeleted={() => getSharedRecipes().then(setShared).catch(() => {})} />
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddRecipe(true)}
            className="w-full py-6 rounded-2xl text-sm text-center"
            style={{
              backgroundColor: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface-variant)',
              border: '1px dashed var(--color-outline-variant)',
            }}
          >
            아직 올라온 메뉴가 없어요.<br />우리 집 요리를 처음으로 올려보세요.
          </button>
        )}
      </div>

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

      {/* 스낵바 — 「지웠어요」는 과거형이다. 실제로 이미 지웠기 때문이다.
          예전 문구 「삭제됨」은 아직 안 지운 상태에서 지웠다고 말하는 거짓말이었다. */}
      {undoItem && (
        <div
          role="status"
          className="fixed bottom-28 left-4 right-4 mx-auto max-w-md flex items-center justify-between px-4 py-3 rounded-xl shadow-lg z-50"
          style={{ backgroundColor: 'var(--color-on-surface)', color: 'var(--color-surface)' }}
        >
          <span className="text-sm min-w-0 truncate">
            {undoItem.item.name} 지웠어요
          </span>
          <button
            className="text-sm font-semibold ml-4 shrink-0 min-h-[48px] px-2"
            style={{ color: 'var(--color-primary)' }}
            onClick={handleUndo}
          >
            되돌리기
          </button>
        </div>
      )}

      {/* 되돌린 뒤. 「되돌렸어요」가 아니라 「다시 넣었어요」다 — 실제로 재등록이다. */}
      {restoredName && (
        <div
          role="status"
          className="fixed bottom-28 left-4 right-4 mx-auto max-w-md px-4 py-3 rounded-xl shadow-lg z-50 text-sm"
          style={{ backgroundColor: 'var(--color-on-surface)', color: 'var(--color-surface)' }}
        >
          {restoredName} 다시 넣었어요
        </div>
      )}

      {/* 삭제·되돌리기 실패. 재료가 서버에서 사라진 뒤라 조용히 넘기면 안 된다. */}
      {undoError && (
        <div
          role="alert"
          className="fixed bottom-28 left-4 right-4 mx-auto max-w-md flex items-center justify-between px-4 py-3 rounded-xl shadow-lg z-50"
          style={{ backgroundColor: 'var(--color-error-container)', color: 'var(--color-error)' }}
        >
          <span className="text-sm min-w-0">{undoError}</span>
          {undoItem && (
            <button
              className="text-sm font-semibold ml-4 shrink-0 min-h-[48px] px-2"
              style={{ color: 'var(--color-error)' }}
              onClick={handleUndo}
            >
              다시 시도
            </button>
          )}
        </div>
      )}

      {/* 나의 메뉴 추가 시트 */}
      {showAddRecipe && (
        <AddRecipeSheet
          onClose={() => setShowAddRecipe(false)}
          onCreated={() => getSharedRecipes().then(setShared).catch(() => {})}
        />
      )}
    </div>
  )
}

function StatCard({ count, label, color, bgColor }: { count: number; label: string; color: string; bgColor: string }) {
  return (
    <div className="flex-1 py-4 rounded-2xl text-center" style={{ backgroundColor: bgColor }}>
      <p className="text-3xl font-bold" style={{ fontFamily: 'var(--font-headline)', color }}>
        <CountUp value={count} />
      </p>
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
  /* 수량 0 을 저장하려 할 때 한 번 묻는다.
     예전에는 그냥 저장됐고, 워커의 `loadFridge` 가 수량을 안 읽기 때문에
     「0 개 남은 재료」가 냉장고에 그대로 있는 것으로 계산됐다 — 추천이 한 글자도
     안 바뀌는 원인이었다. 모달이 아니라 이 행 안에서 묻는다. 걸린 데이터가
     글자 하나뿐이라 오버레이가 결정보다 비싸다. */
  const [confirmUsedUp, setConfirmUsedUp] = useState(false)

  const commitQty = () => {
    if (meansUsedUp(editQty)) { setConfirmUsedUp(true); return }
    onUpdate(item, editQty)
    setEditing(false)
  }
  const storageLabel = item.storage_method === 'refrigerated' ? '냉장' : item.storage_method === 'frozen' ? '냉동' : '실온'
  /* 예전엔 화면에 "8. 21.일" 로 나왔다.
     toLocaleDateString('ko-KR', {month:'numeric', day:'numeric'}) 은 이미
     "8. 21." 을 돌려주는데 거기에 '일' 을 또 붙이고 있었다.
     재고 화면은 같은 값을 "2026-08-21" 로 보여주고 있어서 형식도 둘로 갈렸다.
     한 곳에서 "8월 21일" 로 통일한다. */
  const regDate = item.registered_at ? formatDate(item.registered_at) : ''
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

      {/* 「다 쓰셨나요?」 — 행 안에서 묻는다.
          아니요는 **0 을 저장하지 않는다.** 저장하면 고치려던 버그를 그대로 재현한다
          (수량 0 인 재료가 냉장고에 남아 추천을 계속 오염시킨다). 다시 입력으로 돌아간다. */}
      {confirmUsedUp ? (
        <div className="flex items-center gap-1 flex-shrink-0" role="group" aria-label={`${item.name} 다 썼는지 확인`}>
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>다 쓰셨나요?</span>
          <button
            className="text-xs font-semibold px-2 min-h-[48px]"
            style={{ color: 'var(--color-primary)' }}
            onClick={() => { setConfirmUsedUp(false); setEditing(false); onDelete(item) }}
          >
            네
          </button>
          <button
            className="text-xs px-2 min-h-[48px]"
            style={{ color: 'var(--color-on-surface-variant)' }}
            onClick={() => { setConfirmUsedUp(false); setEditQty(item.quantity || '') }}
          >
            아니요
          </button>
        </div>
      ) : editing ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            className="w-16 text-xs px-2 py-1 rounded-md outline-none"
            style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)' }}
            value={editQty}
            onChange={e => setEditQty(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitQty()
              if (e.key === 'Escape') { setEditing(false); setConfirmUsedUp(false) }
            }}
            autoFocus
            placeholder="수량"
          />
          <button
            className="text-xs font-semibold px-1 min-h-[48px]"
            style={{ color: 'var(--color-primary)' }}
            onClick={commitQty}
          >
            확인
          </button>
        </div>
      ) : (
        // 터치 기기 전용 제품이라 :hover 뒤에 숨기면 안 된다. iOS 는 첫 탭이
        // emulated hover 라 더블탭이 필요했고, Android 는 탭 후 hover 가 남았다.
        // 식재료를 소비하는 유일한 두 버튼이므로 항상 보여야 한다.
        <div className="flex items-center gap-1 flex-shrink-0">
          {item.quantity && (
            <button
              className="text-xs px-3 py-2.5 rounded-lg min-h-[48px]"
              style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' }}
              onClick={() => setEditing(true)}
              aria-label={`${item.name} 수량 변경`}
            >
              일부 사용
            </button>
          )}
          <button
            className="text-xs px-3 py-2.5 rounded-lg min-h-[48px]"
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
