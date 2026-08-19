import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { QuantityInput } from '../components/ingredients/QuantityInput'
import { needsQuantityCleanup } from '../lib/format'
import type { Ingredient, IngredientUnit } from '../types'

interface Draft {
  id: string
  amount: number | null
  unit: IngredientUnit
}

export default function QuantityCleanupPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Ingredient[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<Ingredient[]>('/ingredients')
      .then((r) => {
        const pending = r.data.filter(needsQuantityCleanup)
        setRows(pending)
        const init: Record<string, Draft> = {}
        pending.forEach((ing) => {
          init[ing.id] = { id: ing.id, amount: null, unit: 'g' }
        })
        setDrafts(init)
      })
      .catch(() => setError('목록을 불러오지 못했어요.'))
      .finally(() => setLoading(false))
  }, [])

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  const handleSaveAll = async () => {
    setError('')
    setSaving(true)
    try {
      const ready = Object.values(drafts).filter((d) => d.amount != null && d.amount >= 0)
      for (const d of ready) {
        await api.put(`/ingredients/${d.id}`, { amount_value: d.amount, unit: d.unit })
      }
      navigate('/inventory')
    } catch {
      setError('저장 중 오류가 발생했어요. 일부 항목만 저장됐을 수 있어요.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-on-surface-variant">불러오는 중...</div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <span className="material-symbols-outlined text-primary text-6xl mb-4 block">check_circle</span>
        <h2 className="font-headline font-bold text-xl mb-2">모든 재고 수량이 정리됐어요</h2>
        <p className="text-on-surface-variant mb-6">재입력이 필요한 항목이 없습니다.</p>
        <button
          onClick={() => navigate('/inventory')}
          className="px-6 py-3 rounded-full bg-primary text-white font-bold"
        >
          재고 목록으로
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto pb-32">
      <div className="mb-6">
        <h1 className="font-headline font-bold text-2xl text-on-surface mb-2">수량 정리</h1>
        <p className="text-sm text-on-surface-variant">
          아래 <span className="font-bold">{rows.length}개</span> 재료는 수량을 숫자와 단위로 다시
          확인해 주세요. 요리 기록 기능을 사용하려면 정확한 수량이 필요해요.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((ing) => {
          const d = drafts[ing.id]
          return (
            <div
              key={ing.id}
              className="bg-surface-container-lowest rounded-2xl p-4 flex items-center gap-4 shadow-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-on-surface truncate">{ing.name}</p>
                <p className="text-[11px] text-on-surface-variant truncate">
                  원본: {ing.quantity || '(수량 정보 없음)'}
                </p>
              </div>
              <div className="w-48">
                <QuantityInput
                  amount={d?.amount ?? null}
                  unit={d?.unit ?? 'g'}
                  onAmountChange={(v) => updateDraft(ing.id, { amount: v })}
                  onUnitChange={(u) => updateDraft(ing.id, { unit: u })}
                />
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="text-tertiary text-sm mt-4 text-center">{error}</p>}

      <div className="fixed left-0 right-0 bottom-20 px-6 md:bottom-6 flex justify-center pointer-events-none">
        <button
          onClick={handleSaveAll}
          disabled={saving || Object.values(drafts).every((d) => d.amount == null)}
          className="pointer-events-auto px-6 py-4 rounded-full bg-gradient-to-r from-primary to-primary-container text-white font-headline font-bold shadow-2xl active:scale-95 transition-transform disabled:opacity-50 flex items-center gap-2"
        >
          <span className="material-symbols-outlined">save</span>
          {saving ? '저장 중...' : '입력한 항목 한 번에 저장'}
        </button>
      </div>
    </div>
  )
}
