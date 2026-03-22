import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import type { Category, IngredientCreate, StorageMethod } from '../types'

interface StorageGuide {
  keyword: string
  refrigerated_days: number | null
  frozen_days: number | null
  room_temp_days: number | null
}

const storageMethods: { value: StorageMethod; icon: string; label: string }[] = [
  { value: 'refrigerated', icon: 'ac_unit', label: '냉장' },
  { value: 'frozen', icon: 'kitchen', label: '냉동' },
  { value: 'room_temp', icon: 'wb_sunny', label: '실온' },
]

function formatDays(d: number | null | undefined): string {
  if (d == null) return '보관 비권장'
  if (d >= 365) return `약 ${Math.round(d / 365)}년`
  if (d >= 30) return `약 ${Math.round(d / 30)}개월`
  return `약 ${d}일`
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState<IngredientCreate>({
    name: '',
    storage_method: 'refrigerated',
    quantity: 1,
    expiry_date: '',
  })
  const [guide, setGuide] = useState<StorageGuide | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    api.get<Category[]>('/categories').then((r) => setCategories(r.data)).catch(() => {})
  }, [])

  // 상품명 변경 시 보관기한 가이드 조회 (debounce 500ms)
  const handleNameChange = (name: string) => {
    setForm((f) => ({ ...f, name }))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (name.trim().length < 1) {
      setGuide(null)
      return
    }
    debounceRef.current = setTimeout(() => {
      api
        .get<StorageGuide | null>('/storage-guide/lookup', { params: { name } })
        .then((r) => setGuide(r.data))
        .catch(() => setGuide(null))
    }, 500)
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
    try {
      await api.post('/ingredients', form)
      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        navigate('/')
      }, 1500)
    } catch {
      setError('식재료 등록에 실패했습니다.')
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <h2 className="font-headline font-bold text-2xl text-on-surface">식재료 등록</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 상품명 */}
        <div className="bg-surface-container-lowest p-5 rounded-[1.5rem] shadow-sm flex flex-col gap-2">
          <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">상품명</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full border-none p-0 text-lg font-medium bg-transparent focus:ring-0 placeholder:text-surface-container-highest"
            placeholder="예: 유기농 우유 1L"
          />
          {guide && (
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary-container/10 rounded-lg text-secondary text-[11px] font-medium mt-1">
              <span className="material-symbols-outlined text-sm">lightbulb</span>
              "{guide.keyword}" 보관 정보를 찾았어요
            </div>
          )}
        </div>

        {/* 보관 방법 */}
        <div className="bg-surface-container-lowest p-5 rounded-[1.5rem] shadow-sm flex flex-col gap-4">
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
          {/* 보관 가이드 표시 (3종 모두) */}
          {guide && (
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
          )}
          {!guide && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg text-primary text-[11px] font-medium">
              <span className="material-symbols-outlined text-sm">info</span>
              {getTipForMethod(form.storage_method)}
            </div>
          )}
        </div>

        {/* 카테고리 + 수량 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-container-lowest p-5 rounded-[1.5rem] shadow-sm flex flex-col gap-2">
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
          <div className="bg-surface-container-lowest p-5 rounded-[1.5rem] shadow-sm flex flex-col gap-2">
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
        <div className="bg-surface-container-lowest p-5 rounded-[1.5rem] shadow-sm flex flex-col gap-2 relative overflow-hidden">
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
        {success && <p className="text-primary text-sm text-center font-bold">등록 완료!</p>}

        <button
          type="submit"
          className="w-full py-5 rounded-full bg-gradient-to-r from-primary to-primary-container text-white font-headline font-bold text-lg shadow-xl active:scale-95 transition-transform duration-200 flex items-center justify-center gap-3"
        >
          <span className="material-symbols-outlined">check_circle</span>
          등록하기
        </button>
      </form>
    </div>
  )
}
