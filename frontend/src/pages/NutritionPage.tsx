import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import { getNutrition, type NutritionRow } from '../api/nutrition'
import type { Ingredient } from '../types'

/**
 * 요리 영양 계산 — 일회성.
 *
 * 기록을 남기지 않고 재고를 차감하지도 않는다. 재고 차감은 대시보드의
 * "다 썼어요"(1탭 + 3초 되돌리기)가 이미 같은 일을 훨씬 싸게 한다.
 * 여기는 "지금 이 재료들 합치면 얼마" 한 가지 질문에만 답한다.
 *
 * 표시 원칙 (숫자를 늘리지 않는다):
 *  - 큰 숫자 하나 = kcal. 10 단위 반올림. 오차가 ±30~40% 인데 일의 자리는 허구다.
 *  - 탄단지는 **열량 비율** 막대 하나. 그램 비율로 그리면 지방이 9kcal/g 이라
 *    막대가 위의 kcal 과 반대되는 이야기를 한다.
 *  - 그램 수치는 12px 한 줄. 궁금한 사람만 읽으면 된다.
 *  - 조리유·양념은 기록되지 않으므로 항상 낮게 나온다. 그걸 명시한다.
 */

const ATWATER = { carb: 4, protein: 4, fat: 9 }

interface Picked {
  id: string
  name: string
  key: string       // normalized_name 또는 name
  amount: number    // g / ml / 개
  unitLabel: string
}

function basisOf(n: NutritionRow): { per: number; unit: string } | null {
  if (n.kcal_per_100g != null) return { per: n.kcal_per_100g / 100, unit: 'g' }
  if (n.kcal_per_100ml != null) return { per: n.kcal_per_100ml / 100, unit: 'ml' }
  if (n.kcal_per_piece != null) return { per: n.kcal_per_piece, unit: '개' }
  return null
}

export default function NutritionPage() {
  const [inventory, setInventory] = useState<Ingredient[]>([])
  const [picked, setPicked] = useState<Picked[]>([])
  const [nutrition, setNutrition] = useState<Map<string, NutritionRow>>(new Map())
  const [servings, setServings] = useState(2)
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Ingredient[]>('/ingredients')
      .then((r) => setInventory(r.data))
      .catch(() => setError('재고를 불러오지 못했어요.'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (ing: Ingredient) => {
    setPicked((prev) => {
      const hit = prev.find((p) => p.id === ing.id)
      if (hit) return prev.filter((p) => p.id !== ing.id)
      return [
        ...prev,
        {
          id: ing.id,
          name: ing.name,
          key: (ing.normalized_name || ing.name).trim(),
          amount: ing.amount_value ?? 100,
          unitLabel: ing.unit === 'ml' ? 'ml' : ing.unit === 'piece' ? '개' : 'g',
        },
      ]
    })
  }

  const calculate = async () => {
    if (!picked.length) return
    setCalculating(true)
    setError(null)
    try {
      setNutrition(await getNutrition(picked.map((p) => p.key)))
    } catch {
      setError('영양 정보를 가져오지 못했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setCalculating(false)
    }
  }

  const total = useMemo(() => {
    let kcal = 0, carb = 0, protein = 0, fat = 0, counted = 0
    const missing: string[] = []
    for (const p of picked) {
      const n = nutrition.get(p.key)
      const b = n && basisOf(n)
      if (!n || !b) { missing.push(p.name); continue }
      const factor = b.unit === '개' ? p.amount : p.amount / 100
      kcal += (n.kcal_per_100g ?? n.kcal_per_100ml ?? n.kcal_per_piece ?? 0) * (b.unit === '개' ? p.amount : p.amount / 100)
      carb += (n.carb_g ?? 0) * factor
      protein += (n.protein_g ?? 0) * factor
      fat += (n.fat_g ?? 0) * factor
      counted++
    }
    return { kcal, carb, protein, fat, counted, missing }
  }, [picked, nutrition])

  const hasResult = total.counted > 0
  // 헤드라인 kcal 은 탄단지에서 역산한 값을 쓴다. 그래야 아래 그램 줄과 절대 모순되지 않는다.
  const reconciled = total.carb * ATWATER.carb + total.protein * ATWATER.protein + total.fat * ATWATER.fat
  const shownKcal = Math.round((reconciled > 0 ? reconciled : total.kcal) / 10) * 10
  const perServing = Math.round(shownKcal / Math.max(1, servings) / 10) * 10

  const energy = {
    carb: total.carb * ATWATER.carb,
    protein: total.protein * ATWATER.protein,
    fat: total.fat * ATWATER.fat,
  }
  const energyTotal = energy.carb + energy.protein + energy.fat || 1
  const pct = (v: number) => (v / energyTotal) * 100

  const headline = (() => {
    const top = Math.max(energy.carb, energy.protein, energy.fat)
    if (top / energyTotal < 0.45) return '고르게 섞였어요'
    if (top === energy.protein) return '단백질 위주예요'
    if (top === energy.fat) return '지방 위주예요'
    return '탄수화물 위주예요'
  })()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline font-bold text-2xl tracking-tight text-on-surface mb-1">요리 영양 계산</h1>
        <p className="text-sm text-on-surface-variant">쓸 재료를 고르면 합쳐서 얼마인지 알려줘요</p>
      </div>

      {loading && <div className="h-24 rounded-2xl bg-surface-container-low animate-pulse" />}

      {error && (
        <p role="alert" className="px-4 py-3 rounded-xl text-sm text-center"
           style={{ backgroundColor: 'var(--color-error-container)', color: 'var(--color-error)' }}>
          {error}
        </p>
      )}

      {!loading && inventory.length === 0 && (
        <p className="text-center text-sm text-on-surface-variant py-12">
          냉장고가 비어 있어요. 영수증을 먼저 스캔해보세요.
        </p>
      )}

      {inventory.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-on-surface-variant mb-3">재료 고르기</h2>
          <div className="flex flex-wrap gap-2">
            {inventory.map((ing) => {
              const on = picked.some((p) => p.id === ing.id)
              return (
                <button
                  key={ing.id}
                  onClick={() => toggle(ing)}
                  aria-pressed={on}
                  className={`px-4 min-h-[48px] inline-flex items-center justify-center rounded-full text-sm font-medium transition-transform active:scale-95 ${
                    on ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface'
                  }`}
                >
                  {ing.name}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {picked.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-on-surface-variant mb-3">얼마나 쓸까요</h2>
          <div className="space-y-3">
            {picked.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-on-surface truncate">{p.name}</span>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={p.amount}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setPicked((prev) => prev.map((x, j) => (j === i ? { ...x, amount: Number.isFinite(v) ? v : 0 } : x)))
                  }}
                  className="w-24 px-3 py-2 rounded-xl bg-surface-container-low text-on-surface text-right"
                  aria-label={`${p.name} 사용량`}
                />
                <span className="w-8 text-sm text-on-surface-variant">{p.unitLabel}</span>
              </div>
            ))}
          </div>

          <button
            onClick={calculate}
            disabled={calculating}
            className="w-full mt-6 py-4 rounded-full text-base font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {calculating ? '계산 중...' : '영양 계산하기'}
          </button>
        </section>
      )}

      {hasResult && (
        <section className="rounded-[2rem] p-6 bg-surface-container-low">
          <p className="text-xs font-semibold text-on-surface-variant mb-2">전체</p>
          <p className="font-headline font-bold text-4xl text-on-surface mb-1">
            약 {shownKcal.toLocaleString()} kcal
          </p>
          <p className="text-sm text-on-surface-variant mb-5">
            {servings}인분 → 1인 약 {perServing.toLocaleString()} kcal
          </p>

          <div className="flex items-center gap-3 mb-5">
            <span className="text-xs text-on-surface-variant">인분</span>
            <button onClick={() => setServings((s) => Math.max(1, s - 1))}
                    aria-label="인분 줄이기"
                    className="w-9 h-9 rounded-full bg-surface-container-high text-on-surface font-bold">−</button>
            <span className="w-6 text-center text-sm font-semibold text-on-surface">{servings}</span>
            <button onClick={() => setServings((s) => Math.min(12, s + 1))}
                    aria-label="인분 늘리기"
                    className="w-9 h-9 rounded-full bg-surface-container-high text-on-surface font-bold">+</button>
          </div>

          {/* 열량 비율 막대. 그램 비율이 아니라 kcal 비율이어야 위 숫자와 같은 이야기를 한다. */}
          <div className="flex h-3 rounded-full overflow-hidden mb-2" role="img"
               aria-label={`탄수화물 ${Math.round(pct(energy.carb))}%, 단백질 ${Math.round(pct(energy.protein))}%, 지방 ${Math.round(pct(energy.fat))}%`}>
            <div style={{ width: `${pct(energy.carb)}%`, backgroundColor: 'var(--color-primary-container)' }} />
            <div style={{ width: `${pct(energy.protein)}%`, backgroundColor: 'var(--color-secondary-container)' }} />
            <div style={{ width: `${pct(energy.fat)}%`, backgroundColor: 'var(--color-tertiary-container)' }} />
          </div>
          <p className="text-sm font-semibold text-on-surface mb-1">{headline}</p>
          <p className="text-xs text-on-surface-variant">
            탄 {Math.round(total.carb)}g · 단 {Math.round(total.protein)}g · 지 {Math.round(total.fat)}g
          </p>

          <p className="text-xs text-on-surface-variant mt-4 leading-relaxed">
            AI 추정값이에요. 조리유·양념은 빠져 있어서 실제보다 낮게 나와요.
            {total.missing.length > 0 && (
              <> <br />재료 {picked.length}개 중 {total.counted}개 반영 · {total.missing.join(', ')} 제외</>
            )}
          </p>
        </section>
      )}
    </div>
  )
}
