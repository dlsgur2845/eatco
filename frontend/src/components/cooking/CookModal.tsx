import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import { formatAmount, formatQuantity } from '../../lib/format'
import type {
  CookingLog,
  CookingLogCreate,
  Ingredient,
  IngredientNutrition,
  IngredientUnit,
} from '../../types'
import { UNIT_LABEL } from '../../types'

type NutritionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: IngredientNutrition }
  | { status: 'missing' }
  | { status: 'error' }

interface Props {
  /** 레시피 연결 모드일 때 prefill. 생략 시 freestyle 요리. */
  recipeId?: string | null
  recipeName?: string
  onClose: () => void
  onSuccess: (log: CookingLog) => void
}

interface Row {
  ingredient: Ingredient
  checked: boolean
  amount: number
}

function computeKcal(
  nutrition: IngredientNutrition | null,
  amount: number,
  unit: IngredientUnit,
): { kcal: number; hasData: boolean; source: string | null } {
  if (!nutrition) return { kcal: 0, hasData: false, source: null }
  if (unit === 'g' && nutrition.kcal_per_100g != null) {
    return {
      kcal: Math.round((nutrition.kcal_per_100g * amount) / 100),
      hasData: true,
      source: nutrition.source,
    }
  }
  if (unit === 'ml' && nutrition.kcal_per_100ml != null) {
    return {
      kcal: Math.round((nutrition.kcal_per_100ml * amount) / 100),
      hasData: true,
      source: nutrition.source,
    }
  }
  if (unit === 'piece' && nutrition.kcal_per_piece != null) {
    return {
      kcal: Math.round(nutrition.kcal_per_piece * amount),
      hasData: true,
      source: nutrition.source,
    }
  }
  return { kcal: 0, hasData: false, source: nutrition.source }
}

export function CookModal({ recipeId, recipeName, onClose, onSuccess }: Props) {
  const [recipeTitle, setRecipeTitle] = useState(recipeName ?? '')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [nutritionCache, setNutritionCache] = useState<Record<string, NutritionState>>({})

  // 1. 재고 로드 — amount_value + unit 이 있는 row 만
  useEffect(() => {
    api
      .get<Ingredient[]>('/ingredients')
      .then((r) => {
        const usable = r.data.filter(
          (i) => i.amount_value != null && i.amount_value > 0 && i.unit,
        )
        setRows(usable.map((ing) => ({ ingredient: ing, checked: false, amount: 0 })))
      })
      .catch(() => setError('재고를 불러오지 못했어요.'))
      .finally(() => setLoading(false))
  }, [])

  const checkedRows = useMemo(() => rows.filter((r) => r.checked && r.amount > 0), [rows])

  // 2. 선택된 재료 nutrition prefetch
  useEffect(() => {
    const namesNeeded = new Set<string>()
    checkedRows.forEach((r) => {
      const key = r.ingredient.normalized_name || r.ingredient.name
      if (!nutritionCache[key]) namesNeeded.add(key)
    })
    if (namesNeeded.size === 0) return

    namesNeeded.forEach((name) => {
      setNutritionCache((c) => ({ ...c, [name]: { status: 'loading' } }))
      api
        .get<IngredientNutrition>(`/cooking-logs/nutrition/${encodeURIComponent(name)}`)
        .then((r) => {
          setNutritionCache((c) => ({ ...c, [name]: { status: 'ready', data: r.data } }))
        })
        .catch((e) => {
          if (e?.response?.status === 404) {
            setNutritionCache((c) => ({ ...c, [name]: { status: 'missing' } }))
          } else {
            setNutritionCache((c) => ({ ...c, [name]: { status: 'error' } }))
          }
        })
    })
  }, [checkedRows, nutritionCache])

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.ingredient.id === id ? { ...r, ...patch } : r)))
  }

  // 3. 총 kcal (실시간)
  const totals = useMemo(() => {
    let totalKcal = 0
    let allHave = true
    checkedRows.forEach((r) => {
      const key = r.ingredient.normalized_name || r.ingredient.name
      const state = nutritionCache[key]
      if (state?.status === 'ready') {
        const { kcal, hasData } = computeKcal(state.data, r.amount, r.ingredient.unit!)
        totalKcal += kcal
        if (!hasData) allHave = false
      } else {
        allHave = false
      }
    })
    return { totalKcal, allHave }
  }, [checkedRows, nutritionCache])

  const handleSubmit = async () => {
    setError('')
    if (!recipeTitle.trim()) {
      setError('요리 이름을 입력해 주세요.')
      return
    }
    if (checkedRows.length === 0) {
      setError('사용한 재료를 최소 1개 이상 선택해 주세요.')
      return
    }
    setSubmitting(true)
    try {
      const body: CookingLogCreate = {
        recipe_id: recipeId ?? null,
        recipe_name: recipeTitle.trim(),
        items: checkedRows.map((r) => ({
          ingredient_id: r.ingredient.id,
          amount_used: r.amount,
          unit: r.ingredient.unit!,
        })),
      }
      const resp = await api.post<CookingLog>('/cooking-logs', body)
      onSuccess(resp.data)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail || '기록에 실패했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto bg-surface rounded-[2rem] p-6 shadow-2xl mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-headline font-bold text-2xl text-on-surface">요리 기록</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        {/* 요리 이름 */}
        <div className="bg-surface-container-lowest p-4 rounded-xl mb-4 flex flex-col gap-2">
          <label className="font-body text-[11px] font-bold uppercase tracking-wider text-outline">
            요리 이름
          </label>
          <input
            type="text"
            value={recipeTitle}
            onChange={(e) => setRecipeTitle(e.target.value)}
            placeholder="예: 김치찌개"
            className="w-full border-none p-0 text-lg font-medium bg-transparent focus:ring-0 placeholder:text-surface-container-highest"
          />
        </div>

        {/* 재료 리스트 */}
        <div className="mb-4">
          <h4 className="font-body text-[11px] font-bold uppercase tracking-wider text-outline mb-2">
            사용한 재료 · 얼마나 썼나요?
          </h4>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded-xl bg-surface-container-lowest animate-pulse"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-xl p-6 text-center">
              <p className="text-sm text-on-surface-variant mb-2">
                사용할 수 있는 재고가 없어요.
              </p>
              <p className="text-[11px] text-on-surface-variant">
                재고 페이지에서 수량을 정리해 주세요.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {rows.map((row) => {
                const ing = row.ingredient
                const maxAmount = ing.amount_value ?? 0
                const unit = ing.unit!
                const key = ing.normalized_name || ing.name
                const state = nutritionCache[key]
                const { kcal, hasData, source } = row.checked && state?.status === 'ready'
                  ? computeKcal(state.data, row.amount, unit)
                  : { kcal: 0, hasData: false, source: null }
                const step = unit === 'piece' ? 0.25 : 1

                return (
                  <div
                    key={ing.id}
                    className={`bg-surface-container-lowest rounded-xl p-3 transition-all ${
                      row.checked ? 'ring-2 ring-primary/40' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={row.checked}
                        onChange={(e) =>
                          updateRow(ing.id, {
                            checked: e.target.checked,
                            amount: e.target.checked && row.amount === 0 ? step : row.amount,
                          })
                        }
                        className="w-5 h-5 accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-on-surface truncate text-sm">
                          {ing.name}
                        </p>
                        <p className="text-[10px] text-on-surface-variant">
                          남은 재고 {formatQuantity(ing)}
                        </p>
                      </div>
                      {row.checked && (
                        <div className="text-right">
                          {state?.status === 'loading' && (
                            <span className="text-[10px] text-on-surface-variant">계산 중</span>
                          )}
                          {row.checked && state?.status === 'ready' && hasData && (
                            <div className="flex items-center gap-1 justify-end">
                              <span className="font-bold text-sm text-on-surface">{kcal} kcal</span>
                              {source === 'gemini' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container">
                                  추정
                                </span>
                              )}
                            </div>
                          )}
                          {row.checked && state?.status === 'ready' && !hasData && (
                            <span className="text-[10px] text-on-surface-variant">—</span>
                          )}
                          {(state?.status === 'missing' || state?.status === 'error') && (
                            <span className="text-[10px] text-on-surface-variant">—</span>
                          )}
                        </div>
                      )}
                    </div>
                    {row.checked && (
                      <div className="mt-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => updateRow(ing.id, { amount: Math.max(0, row.amount - step) })}
                            className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center active:scale-95"
                          >
                            <span className="material-symbols-outlined text-lg">remove</span>
                          </button>
                          {unit === 'piece' ? (
                            <span className="flex-1 text-center font-bold text-lg">
                              {formatAmount(row.amount, unit)} {UNIT_LABEL[unit]}
                            </span>
                          ) : (
                            <input
                              type="range"
                              min={0}
                              max={maxAmount}
                              step={step}
                              value={Math.min(row.amount, maxAmount)}
                              onChange={(e) => updateRow(ing.id, { amount: Number(e.target.value) })}
                              className="flex-1 accent-primary"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              updateRow(ing.id, {
                                amount: Math.min(maxAmount, row.amount + step),
                              })
                            }
                            className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center active:scale-95"
                          >
                            <span className="material-symbols-outlined text-lg">add</span>
                          </button>
                        </div>
                        {unit !== 'piece' && (
                          <div className="flex items-center justify-between text-[10px] text-on-surface-variant mt-1">
                            <span>0</span>
                            <span className="font-semibold">
                              {formatAmount(row.amount, unit)} / {formatAmount(maxAmount, unit)} {UNIT_LABEL[unit]}
                            </span>
                            <span>{formatAmount(maxAmount, unit)}</span>
                          </div>
                        )}
                        {/* quick chips */}
                        <div className="flex gap-1 mt-2">
                          {[0.25, 0.5, 1].map((frac) => (
                            <button
                              key={frac}
                              type="button"
                              onClick={() =>
                                updateRow(ing.id, {
                                  amount:
                                    unit === 'piece'
                                      ? Math.round(maxAmount * frac * 4) / 4
                                      : Math.round(maxAmount * frac),
                                })
                              }
                              className="px-2 py-0.5 rounded-full bg-surface-container text-[10px] text-on-surface-variant hover:bg-primary/10"
                            >
                              {frac === 1 ? '전부' : frac === 0.5 ? '절반' : '1/4'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 총 칼로리 */}
        <div className="bg-primary/5 rounded-xl p-4 mb-4 flex items-center justify-between">
          <span className="font-body text-sm text-on-surface-variant">예상 총 칼로리</span>
          <span className="font-headline font-bold text-2xl text-on-surface">
            {totals.allHave ? `${totals.totalKcal} kcal` : `약 ${totals.totalKcal} kcal`}
          </span>
        </div>

        {error && <p className="text-tertiary text-sm text-center mb-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || checkedRows.length === 0}
          className="w-full py-4 rounded-full bg-gradient-to-r from-primary to-primary-container text-white font-headline font-bold text-lg shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <span className="material-symbols-outlined">check_circle</span>
          {submitting ? '기록 중...' : '요리 기록하기'}
        </button>
      </div>
    </div>
  )
}
