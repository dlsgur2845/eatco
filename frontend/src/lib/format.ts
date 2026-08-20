import type { Ingredient, IngredientUnit } from '../types'
import { UNIT_LABEL } from '../types'

/**
 * 재고 row 의 수량 표시 규칙.
 * 우선순위: (amount_value + unit) → legacy quantity 문자열 → '수량 확인 필요' 배지
 */
export function formatQuantity(ing: Pick<Ingredient, 'amount_value' | 'unit' | 'quantity'>): string {
  if (ing.amount_value != null && ing.unit) {
    return `${stripTrailingZero(ing.amount_value)}${UNIT_LABEL[ing.unit]}`
  }
  if (ing.quantity && ing.quantity.trim() !== '') {
    return ing.quantity
  }
  return '수량 확인 필요'
}

/** 수량 재입력이 필요한 row 인지. */
export function stripTrailingZero(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 1000) / 1000
  const s = rounded.toString()
  return s
}

/** unit 별 step 값 (CookModal 의 stepper/slider). */
export function stepForUnit(unit: IngredientUnit): number {
  if (unit === 'piece') return 0.25
  return 1
}

/** piece 는 소수 3자리 허용 (1/4, 1/2, 3/4), g/ml 은 정수. */
export function formatAmount(amount: number, unit: IngredientUnit): string {
  if (unit === 'piece') return stripTrailingZero(amount)
  return Math.round(amount).toString()
}
