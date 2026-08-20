import type { IngredientUnit } from '../../types'

interface Props {
  amount: number | null
  unit: IngredientUnit | null
  onAmountChange: (v: number | null) => void
  onUnitChange: (u: IngredientUnit) => void
  disabled?: boolean
  unitLocked?: boolean
  lockedHelper?: string
}

const UNIT_OPTIONS: { value: IngredientUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'piece', label: '개' },
]

export function QuantityInput({
  amount,
  unit,
  onAmountChange,
  onUnitChange,
  disabled,
  unitLocked,
  lockedHelper,
}: Props) {
  const step = unit === 'piece' ? 0.25 : 1
  return (
    <div className="flex flex-col gap-2">
      <label className="font-body text-xs font-semibold text-on-surface-variant">수량</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={amount ?? ''}
          onChange={(e) => {
            const v = e.target.value
            if (v === '') {
              onAmountChange(null)
            } else {
              const n = Number(v)
              onAmountChange(Number.isFinite(n) && n >= 0 ? n : null)
            }
          }}
          disabled={disabled}
          className="flex-1 min-w-0 border-none p-0 text-base font-medium bg-transparent focus:ring-0 placeholder:text-surface-container-highest"
          placeholder="숫자"
        />
        <select
          value={unit ?? 'g'}
          onChange={(e) => onUnitChange(e.target.value as IngredientUnit)}
          disabled={disabled || unitLocked}
          className="border border-outline-variant rounded-lg px-2 py-1 text-sm font-medium bg-surface-container-lowest disabled:opacity-60"
        >
          {UNIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {unitLocked && lockedHelper && (
        <p className="text-xs text-on-surface-variant">{lockedHelper}</p>
      )}
    </div>
  )
}
