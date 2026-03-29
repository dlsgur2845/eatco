import { useEffect, useRef, useState } from 'react'
import api from '../api/client'
import type { Category, Ingredient, IngredientCreate, StorageMethod } from '../types'

/* ── Constants ── */
const storageFilters: { value: StorageMethod | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'refrigerated', label: '냉장' },
  { value: 'frozen', label: '냉동' },
  { value: 'room_temp', label: '실온' },
]

const storageMethods: { value: StorageMethod; icon: string; label: string }[] = [
  { value: 'refrigerated', icon: 'ac_unit', label: '냉장' },
  { value: 'frozen', icon: 'kitchen', label: '냉동' },
  { value: 'room_temp', icon: 'wb_sunny', label: '실온' },
]

const storageIcons: Record<StorageMethod, string> = {
  refrigerated: 'ac_unit',
  frozen: 'kitchen',
  room_temp: 'wb_sunny',
}

interface StorageGuide {
  keyword: string
  refrigerated_days: number | null
  frozen_days: number | null
  room_temp_days: number | null
}

function formatDays(d: number | null | undefined): string {
  if (d == null) return '보관 비권장'
  if (d >= 365) return `약 ${Math.round(d / 365)}년`
  if (d >= 30) return `약 ${Math.round(d / 30)}개월`
  return `약 ${d}일`
}

/* ── Register Form (inline modal) ── */
function RegisterForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState<IngredientCreate>({
    name: '',
    storage_method: 'refrigerated',
    quantity: 1,
    expiry_date: '',
  })
  const [guide, setGuide] = useState<StorageGuide | null>(null)
  const [suggestions, setSuggestions] = useState<StorageGuide[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const suggestRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    api.get<Category[]>('/categories').then((r) => setCategories(r.data)).catch(() => {})
  }, [])

  const handleNameChange = (name: string) => {
    setForm((f) => ({ ...f, name }))

    // Lookup (기존 — 보관기한 가이드)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (name.trim().length < 1) { setGuide(null); setSuggestions([]); setShowSuggestions(false); return }
    debounceRef.current = setTimeout(() => {
      api.get<StorageGuide | null>('/storage-guide/lookup', { params: { name } })
        .then((r) => setGuide(r.data))
        .catch(() => setGuide(null))
    }, 500)

    // Suggest (실시간 자동완성)
    if (suggestRef.current) clearTimeout(suggestRef.current)
    suggestRef.current = setTimeout(() => {
      api.get<StorageGuide[]>('/storage-guide/suggest', { params: { q: name.trim() } })
        .then((r) => { setSuggestions(r.data); setShowSuggestions(r.data.length > 0) })
        .catch(() => { setSuggestions([]); setShowSuggestions(false) })
    }, 200)
  }

  const selectSuggestion = (s: StorageGuide) => {
    setForm((f) => ({ ...f, name: s.keyword }))
    setGuide(s)
    setSuggestions([])
    setShowSuggestions(false)
  }

  const getTipForMethod = (method: StorageMethod): string => {
    if (!guide) {
      const defaults: Record<StorageMethod, string> = {
        refrigerated: '냉장 시 보통 3~5일 보관을 권장해요',
        frozen: '냉동 시 1~6개월 보관 가능해요',
        room_temp: '서늘하고 건조한 곳에 보관하세요',
      }
      return defaults[method]
    }
    const days: Record<StorageMethod, number | null> = {
      refrigerated: guide.refrigerated_days,
      frozen: guide.frozen_days,
      room_temp: guide.room_temp_days,
    }
    const d = days[method]
    if (d == null) return `${guide.keyword}은(는) 이 방법으로 보관을 권장하지 않아요`
    return `${guide.keyword} ${storageMethods.find((s) => s.value === method)!.label} 보관 시 ${formatDays(d)}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/ingredients', form)
      onSuccess()
    } catch {
      setError('식재료 등록에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-t-[2rem] sm:rounded-[2rem] p-6 sm:p-8 shadow-2xl mx-4 mb-0 sm:mb-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-headline font-bold text-xl text-on-surface">식재료 등록</h3>
          <button onClick={onClose} className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 상품명 + 자동완성 */}
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-2 relative">
            <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">상품명</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              className="w-full border-none p-0 text-lg font-medium bg-transparent focus:ring-0 placeholder:text-surface-container-highest"
              placeholder="예: 우유, 고등어, 삼겹살..."
              autoComplete="off"
            />
            {/* 자동완성 드롭다운 */}
            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-surface-container-lowest rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s.keyword}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSuggestion(s)}
                    className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-sm">search</span>
                      <span className="font-medium text-on-surface">{s.keyword}</span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-on-surface-variant">
                      {s.refrigerated_days != null && (
                        <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded">냉장 {formatDays(s.refrigerated_days)}</span>
                      )}
                      {s.frozen_days != null && (
                        <span className="bg-surface-container-high px-1.5 py-0.5 rounded">냉동 {formatDays(s.frozen_days)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {guide && !showSuggestions && (
              <div className="flex items-center gap-2 px-3 py-2 bg-secondary-container/10 rounded-lg text-secondary text-[11px] font-medium mt-1">
                <span className="material-symbols-outlined text-sm">lightbulb</span>
                &quot;{guide.keyword}&quot; 보관 정보를 찾았어요
              </div>
            )}
          </div>

          {/* 보관 방법 */}
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-3">
            <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">보관 방법</label>
            <div className="grid grid-cols-3 gap-3">
              {storageMethods.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setForm({ ...form, storage_method: m.value })}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors ${
                    form.storage_method === m.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-outline-variant bg-surface-container-lowest text-outline'
                  }`}
                >
                  <span className="material-symbols-outlined mb-1">{m.icon}</span>
                  <span className="text-xs font-bold">{m.label}</span>
                </button>
              ))}
            </div>
            {guide ? (
              <div className="space-y-1.5">
                {storageMethods.map((m) => {
                  const days: Record<StorageMethod, number | null> = {
                    refrigerated: guide.refrigerated_days,
                    frozen: guide.frozen_days,
                    room_temp: guide.room_temp_days,
                  }
                  const d = days[m.value]
                  const isSelected = form.storage_method === m.value
                  return (
                    <div
                      key={m.value}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium ${
                        isSelected ? 'bg-primary/10 text-primary' : 'bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">{m.icon}</span>
                      <span>{m.label}:</span>
                      <span className="font-bold">{formatDays(d)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg text-primary text-[11px] font-medium">
                <span className="material-symbols-outlined text-sm">info</span>
                {getTipForMethod(form.storage_method)}
              </div>
            )}
          </div>

          {/* 카테고리 + 수량 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-2">
              <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">카테고리</label>
              <select
                value={form.category_id || ''}
                onChange={(e) => setForm({ ...form, category_id: e.target.value || undefined })}
                className="w-full border-none p-0 text-base font-medium bg-transparent focus:ring-0"
              >
                <option value="">선택</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-2">
              <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">수량</label>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setForm({ ...form, quantity: Math.max(1, form.quantity - 1) })} className="text-primary">
                  <span className="material-symbols-outlined">remove_circle_outline</span>
                </button>
                <span className="text-lg font-bold">{form.quantity}</span>
                <button type="button" onClick={() => setForm({ ...form, quantity: form.quantity + 1 })} className="text-primary">
                  <span className="material-symbols-outlined">add_circle_outline</span>
                </button>
              </div>
            </div>
          </div>

          {/* 유통기한 */}
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-2 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary-container" />
            <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">유통기한</label>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-secondary-container">calendar_today</span>
              <input
                type="date"
                required
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                className="w-full border-none p-0 text-lg font-medium bg-transparent focus:ring-0"
              />
            </div>
          </div>

          {error && <p className="text-tertiary text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-full bg-gradient-to-r from-primary to-primary-container text-white font-headline font-bold text-lg shadow-xl active:scale-95 transition-transform duration-200 flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <span className="material-symbols-outlined">check_circle</span>
            {submitting ? '등록 중...' : '등록하기'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ── Main InventoryPage ── */
export default function InventoryPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StorageMethod | 'all'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [showRegister, setShowRegister] = useState(false)

  const fetchIngredients = () => {
    const params: Record<string, string> = {}
    if (filter !== 'all') params.storage_method = filter
    if (search) params.search = search
    api.get<Ingredient[]>('/ingredients', { params }).then((r) => setIngredients(r.data)).catch(() => {})
  }

  useEffect(() => {
    fetchIngredients()
  }, [filter, search])

  const getDday = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)

  const getDdayVariant = (d: number) => {
    if (d <= 0) return { border: 'border-tertiary-container', badge: 'bg-tertiary-container text-white', text: 'D-DAY' }
    if (d <= 3) return { border: 'border-tertiary-container', badge: 'bg-tertiary-container/10 text-tertiary-container', text: `D-${d}` }
    if (d <= 7) return { border: 'border-secondary-container', badge: 'bg-secondary-container/10 text-secondary-container', text: `D-${d}` }
    return { border: 'border-primary-container', badge: 'bg-primary-container/10 text-primary', text: `D-${d}` }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const handleBatchDelete = async () => {
    if (selected.size === 0) return
    await api.post('/ingredients/batch-delete', { ids: Array.from(selected) })
    setSelected(new Set())
    setSelectMode(false)
    fetchIngredients()
  }

  const progressWidth = (d: number) => {
    if (d <= 0) return 'w-full'
    if (d <= 3) return 'w-[80%]'
    if (d <= 7) return 'w-[50%]'
    if (d <= 14) return 'w-[30%]'
    return 'w-[10%]'
  }

  const progressColor = (d: number) => {
    if (d <= 3) return 'bg-tertiary-container'
    if (d <= 7) return 'bg-secondary-container'
    return 'bg-primary-container'
  }

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="font-headline font-bold text-4xl tracking-tight text-on-surface mb-2">식재료</h2>
          <p className="text-on-surface-variant">식재료 등록 · 관리 · 검색</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRegister(true)}
            className="bg-gradient-to-r from-primary to-primary-container text-white px-5 py-2.5 rounded-full font-medium flex items-center gap-2 active:scale-95 transition-transform shadow-lg"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            등록
          </button>
          <button
            onClick={() => { setSelectMode(!selectMode); setSelected(new Set()) }}
            className={`px-5 py-2.5 rounded-full font-medium flex items-center gap-2 active:scale-95 transition-transform ${
              selectMode ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">check_box</span>
            선택
          </button>
          {selectMode && selected.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="bg-tertiary-container text-white px-5 py-2.5 rounded-full font-medium flex items-center gap-2 active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-[20px]">delete</span>
              삭제 ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
          <span className="material-symbols-outlined text-outline">search</span>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface-container-low border-none rounded-2xl py-4 pl-14 pr-6 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary transition-all outline-none"
          placeholder="어떤 식재료를 찾으시나요?"
        />
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {storageFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-6 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-all ${
              filter === f.value ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ingredients.length === 0 && (
          <div className="col-span-full text-center py-16">
            <span className="material-symbols-outlined text-outline-variant text-6xl mb-4 block">inventory_2</span>
            <p className="text-on-surface-variant mb-4">등록된 식재료가 없습니다.</p>
            <button
              onClick={() => setShowRegister(true)}
              className="text-primary font-bold hover:underline flex items-center gap-1 mx-auto"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              식재료를 등록해보세요
            </button>
          </div>
        )}
        {ingredients.map((item) => {
          const d = getDday(item.expiry_date)
          const v = getDdayVariant(d)
          const isSelected = selected.has(item.id)

          return (
            <div
              key={item.id}
              onClick={() => selectMode && toggleSelect(item.id)}
              className={`relative bg-surface-container-lowest rounded-[2.5rem] p-6 flex items-center gap-5 transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] ${
                isSelected ? 'border-2 border-primary bg-surface-container-low' : ''
              } ${selectMode ? 'cursor-pointer' : ''}`}
            >
              <div className={`absolute left-0 top-1/4 bottom-1/4 w-1.5 ${v.border.replace('border-', 'bg-')} rounded-r-full`} />
              {isSelected && (
                <div className="absolute -top-2 -right-2 bg-primary text-white rounded-full p-1 shadow-lg">
                  <span className="material-symbols-outlined text-[18px]">check</span>
                </div>
              )}
              <div className="w-16 h-16 bg-surface-container rounded-3xl flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-on-surface-variant text-3xl">
                  {storageIcons[item.storage_method] || 'nutrition'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1 gap-2">
                  <h3 className="font-semibold text-lg text-on-surface truncate">{item.name}</h3>
                  <span className={`${v.badge} text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider whitespace-nowrap`}>
                    {v.text}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mb-2">등록일: {item.registered_at.slice(0, 10)}</p>
                <div className="h-1 w-full bg-surface-container rounded-full overflow-hidden">
                  <div className={`h-full ${progressColor(d)} ${progressWidth(d)}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* FAB (모바일) */}
      <button
        onClick={() => setShowRegister(true)}
        className="fixed right-6 bottom-28 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-container text-white shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40 md:hidden"
      >
        <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
      </button>

      {/* Register Modal */}
      {showRegister && (
        <RegisterForm
          onClose={() => setShowRegister(false)}
          onSuccess={() => {
            setShowRegister(false)
            fetchIngredients()
          }}
        />
      )}
    </div>
  )
}
