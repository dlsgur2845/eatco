import { useEffect, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import api from '../api/client'

interface MonthlyExpense { month: string; total: number; count: number }
interface ItemPricePoint { date: string; price: number; store_name: string | null; quantity: string | null }
interface InflationAlert { name: string; current_price: number; old_price: number; change_pct: number }
interface StoreComparison { store_name: string; latest_price: number; latest_date: string }
interface BudgetInfo { monthly_budget: number | null; spent_this_month: number }

export default function ExpensesPage() {
  const [monthly, setMonthly] = useState<MonthlyExpense[]>([])
  const [alerts, setAlerts] = useState<InflationAlert[]>([])
  const [budget, setBudget] = useState<BudgetInfo | null>(null)
  const [searchName, setSearchName] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [itemPrices, setItemPrices] = useState<ItemPricePoint[]>([])
  const [stores, setStores] = useState<StoreComparison[]>([])
  const [budgetInput, setBudgetInput] = useState('')
  const [tab, setTab] = useState<'overview' | 'item'>('overview')
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    api.get<MonthlyExpense[]>('/expenses/monthly?months=6').then(r => setMonthly(r.data)).catch(() => {})
    api.get<InflationAlert[]>('/expenses/alerts').then(r => setAlerts(r.data)).catch(() => {})
    api.get<BudgetInfo>('/expenses/budget').then(r => {
      setBudget(r.data)
      if (r.data.monthly_budget) setBudgetInput(String(r.data.monthly_budget))
    }).catch(() => {})
  }, [])

  const fetchSuggestions = (q: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    if (!q.trim()) { setSuggestions([]); setShowSuggestions(false); return }
    suggestTimer.current = setTimeout(() => {
      api.get<string[]>(`/expenses/suggest-items?q=${encodeURIComponent(q)}`)
        .then(r => { setSuggestions(r.data); setShowSuggestions(r.data.length > 0) })
        .catch(() => { setSuggestions([]); setShowSuggestions(false) })
    }, 200)
  }

  const selectSuggestion = (name: string) => {
    setSearchName(name)
    setShowSuggestions(false)
    searchItem(name)
  }

  const searchItem = (name?: string) => {
    const q = name || searchName
    if (!q.trim()) return
    setShowSuggestions(false)
    api.get<ItemPricePoint[]>(`/expenses/by-item?name=${encodeURIComponent(q)}`).then(r => setItemPrices(r.data)).catch(() => {})
    api.get<StoreComparison[]>(`/expenses/compare?name=${encodeURIComponent(q)}`).then(r => setStores(r.data)).catch(() => {})
  }

  const saveBudget = () => {
    const amount = parseInt(budgetInput)
    if (isNaN(amount) || amount < 0) return
    api.post(`/expenses/budget?amount=${amount}`).then(() => {
      setBudget(prev => prev ? { ...prev, monthly_budget: amount } : { monthly_budget: amount, spent_this_month: 0 })
    }).catch(() => {})
  }

  const thisMonth = monthly[monthly.length - 1]
  const lastMonth = monthly[monthly.length - 2]
  const monthDelta = thisMonth && lastMonth && lastMonth.total > 0
    ? Math.round(((thisMonth.total - lastMonth.total) / lastMonth.total) * 100)
    : null

  const formatPrice = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}만` : `${v.toLocaleString()}`

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <h2 className="font-headline font-bold text-4xl tracking-tight text-on-surface mb-2">가계부</h2>
        <p className="text-on-surface-variant">식재료 지출 분석 · 가격 추이 · 예산 관리</p>
      </div>

      {/* 인플레이션 알림 */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="bg-tertiary-container/10 rounded-2xl p-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-tertiary-container">trending_up</span>
              <p className="text-sm text-on-surface flex-1">
                <strong>{a.name}</strong>이(가) 3개월 전보다 <strong className="text-tertiary-container">{a.change_pct}%</strong> 비싸졌어요
                <span className="text-on-surface-variant ml-2">
                  ({a.old_price.toLocaleString()}원 → {a.current_price.toLocaleString()}원)
                </span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 예산 프로그레스 */}
      {budget && budget.monthly_budget && budget.monthly_budget > 0 && (
        <div className="bg-surface-container-lowest rounded-[2rem] p-6">
          <div className="flex justify-between items-baseline mb-3">
            <span className="text-sm font-semibold text-on-surface-variant">이번 달 식재료 예산</span>
            <span className="text-sm text-on-surface">
              <strong className="text-lg font-headline">{formatPrice(budget.spent_this_month)}</strong>
              <span className="text-on-surface-variant"> / {formatPrice(budget.monthly_budget)}원</span>
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-container)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (budget.spent_this_month / budget.monthly_budget) * 100)}%`,
                backgroundColor: budget.spent_this_month > budget.monthly_budget
                  ? 'var(--color-tertiary-container)'
                  : budget.spent_this_month > budget.monthly_budget * 0.8
                    ? 'var(--color-secondary-container)'
                    : 'var(--color-primary)',
              }}
            />
          </div>
          {budget.spent_this_month > budget.monthly_budget && (
            <p className="text-xs text-tertiary-container mt-2 font-medium">예산을 초과했어요!</p>
          )}
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('overview')}
          className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${
            tab === 'overview' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'
          }`}
        >
          지출 요약
        </button>
        <button
          onClick={() => setTab('item')}
          className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${
            tab === 'item' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'
          }`}
        >
          식재료별 추이
        </button>
      </div>

      {tab === 'overview' && (
        <>
          {/* 월별 지출 요약 */}
          <div className="bg-surface-container-lowest rounded-[2rem] p-6">
            <div className="flex justify-between items-baseline mb-4">
              <h3 className="text-sm font-semibold text-on-surface-variant">월별 식재료 지출</h3>
              {monthDelta !== null && (
                <span className={`text-xs font-bold ${monthDelta > 0 ? 'text-tertiary-container' : 'text-primary'}`}>
                  지난달 대비 {monthDelta > 0 ? '+' : ''}{monthDelta}%
                </span>
              )}
            </div>
            {monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-container)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatPrice(v as number)} />
                  <Tooltip formatter={(v) => [`${Number(v).toLocaleString()}원`, '지출']} />
                  <Bar dataKey="total" fill="var(--color-primary-container)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-on-surface-variant py-12">가격 데이터가 없어요. 식재료 등록 시 가격을 입력해보세요.</p>
            )}
          </div>

          {/* 예산 설정 */}
          <div className="bg-surface-container-lowest rounded-[2rem] p-6">
            <h3 className="text-sm font-semibold text-on-surface-variant mb-4">월 예산 설정</h3>
            <div className="flex gap-3 items-center">
              <input
                type="number"
                value={budgetInput}
                onChange={e => setBudgetInput(e.target.value)}
                placeholder="예: 300000"
                className="flex-1 bg-surface-container-low rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={saveBudget}
                className="bg-gradient-to-r from-primary to-primary-container text-white px-5 py-3 rounded-full font-medium active:scale-95 transition-transform"
              >
                저장
              </button>
            </div>
          </div>
        </>
      )}

      {tab === 'item' && (
        <>
          {/* 식재료 검색 + 자동완성 */}
          <div className="relative">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-outline">search</span>
            </div>
            <input
              type="text"
              value={searchName}
              onChange={e => { setSearchName(e.target.value); fetchSuggestions(e.target.value) }}
              onKeyDown={e => e.key === 'Enter' && searchItem()}
              onFocus={() => searchName && suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full bg-surface-container-low rounded-2xl py-4 pl-14 pr-6 text-on-surface placeholder:text-outline outline-none focus:ring-2 focus:ring-primary"
              placeholder="식재료 이름 검색 (예: 양파, 우유)"
            />
            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-surface-container-lowest rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => selectSuggestion(s)}
                    className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm text-outline">history</span>
                    <span className="text-sm font-medium text-on-surface">{s}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 가격 추이 차트 */}
          {itemPrices.length > 0 && (
            <div className="bg-surface-container-lowest rounded-[2rem] p-6">
              <h3 className="text-sm font-semibold text-on-surface-variant mb-4">
                "{searchName}" 가격 추이
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={itemPrices}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-container)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v as number).toLocaleString()}`} />
                  <Tooltip
                    formatter={(v) => [`${Number(v).toLocaleString()}원`, '가격']}
                    labelFormatter={l => `${l}`}
                  />
                  <Line type="monotone" dataKey="price" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 4, fill: 'var(--color-primary)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 매장별 비교 */}
          {stores.length > 0 && (
            <div className="bg-surface-container-lowest rounded-[2rem] p-6">
              <h3 className="text-sm font-semibold text-on-surface-variant mb-4">매장별 가격 비교</h3>
              <div className="space-y-2">
                {stores.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-on-surface-variant">store</span>
                      <span className="font-medium text-on-surface">{s.store_name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-on-surface">{s.latest_price.toLocaleString()}원</span>
                      <span className="text-xs text-on-surface-variant ml-2">{s.latest_date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {itemPrices.length === 0 && searchName && (
            <p className="text-center text-sm text-on-surface-variant py-8">
              "{searchName}"에 대한 가격 데이터가 없어요.
            </p>
          )}
        </>
      )}
    </div>
  )
}
