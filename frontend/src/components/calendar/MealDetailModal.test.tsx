import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MealDetailModal from './MealDetailModal'

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import api from '../../api/client'
vi.mock('../../api/recipes', () => ({ getRecipeOne: vi.fn() }))
import { getRecipeOne } from '../../api/recipes'

/**
 * 식단 상세의 레시피 블록.
 *
 * 여기서 지키는 계약 두 가지:
 *   1. 부족한 재료는 **서버가 지금 냉장고로 계산해서 보낸 값**을 그대로 보여준다.
 *      화면이 캐시하거나 다시 계산하지 않는다.
 *   2. 조리법은 **누르기 전에는 안 부른다.** 상세를 열 때마다 1,146건 카탈로그를
 *      읽으면 식단 화면이 공공 API 에 묶인다.
 */

const BASE = {
  id: 'p1',
  family_id: 'f1',
  plan_date: '2026-08-25',
  meal_slot: 'dinner' as const,
  title: '김치양배추볶음',
  memo: null,
  created_by: 'u1',
  created_by_name: '송인혁',
  created_at: '2026-08-23T00:00:00.000Z',
  comments: [],
}

const RECIPE = {
  source: 'foodsafety' as const,
  id: '3000',
  ingredients: ['배추김치', '양배추', '대파'],
  match_count: 1,
  total_ingredients: 3,
  match_ratio: 1 / 3,
  matched_items: ['배추김치'],
  missing_items: ['양배추', '대파'],
  urgent_used: [],
}

function show(recipe: typeof RECIPE | null) {
  vi.mocked(api.get).mockResolvedValue({ data: { ...BASE, recipe } } as never)
  return render(<MealDetailModal planId="p1" me={null} onClose={() => {}} onChanged={() => {}} />)
}

beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue({ data: { ...BASE, recipe: null } } as never)
})
afterEach(() => vi.clearAllMocks())

describe('MealDetailModal — 붙은 레시피', () => {
  it('부족한 재료를 개수와 이름으로 보여준다', async () => {
    show(RECIPE)
    expect(await screen.findByText('부족한 재료 2개')).toBeTruthy()
    expect(screen.getByText('양배추 · 대파')).toBeTruthy()
    expect(screen.getByText('재료 1/3개 보유')).toBeTruthy()
  })

  it('다 있으면 "재료가 다 있어요" 라고 말한다 — "0개 부족" 은 헷갈린다', async () => {
    show({ ...RECIPE, missing_items: [], matched_items: RECIPE.ingredients, match_count: 3, match_ratio: 1 })
    expect(await screen.findByText('재료가 다 있어요')).toBeTruthy()
  })

  it('레시피가 안 붙었으면 블록 자체가 없다', async () => {
    show(null)
    await screen.findByText('김치양배추볶음')
    expect(screen.queryByRole('button', { name: '조리법 보기' })).toBeNull()
    expect(screen.queryByText(/부족한 재료/)).toBeNull()
  })

  it('조리법은 누르기 전에는 안 부른다', async () => {
    show(RECIPE)
    await screen.findByText('부족한 재료 2개')
    expect(getRecipeOne).not.toHaveBeenCalled()

    vi.mocked(getRecipeOne).mockResolvedValue({
      name: '김치양배추볶음', category: '반찬', cooking_method: '볶음', calories: '120',
      image_url: '', ingredients: RECIPE.ingredients, manual_steps: ['볶는다'], tip: '',
      match_count: 1, total_ingredients: 3, match_ratio: 1 / 3,
      matched_items: ['배추김치'], missing_items: ['양배추', '대파'], urgent_used: [],
    })
    fireEvent.click(screen.getByRole('button', { name: '조리법 보기' }))
    await waitFor(() => expect(getRecipeOne).toHaveBeenCalledWith('foodsafety', '3000'))
    expect(await screen.findByText('조리 순서')).toBeTruthy()
  })

  /* 공공 API 가 죽어도 재료는 스냅샷에 있다. "뭘 사야 하는지" 는 계속 보여야 한다. */
  it('조리법을 못 불러와도 부족 재료는 그대로 남는다', async () => {
    show(RECIPE)
    await screen.findByText('부족한 재료 2개')
    vi.mocked(getRecipeOne).mockRejectedValue(new Error('503'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '조리법 보기' }))
    })
    expect(await screen.findByText(/조리법을 불러오지 못했어요/)).toBeTruthy()
    expect(screen.getByText('양배추 · 대파')).toBeTruthy()
  })
})

describe('MealDetailModal — 접근성', () => {
  it('댓글 입력에 이름이 있다 (placeholder 는 라벨이 아니다)', async () => {
    show(null)
    expect(await screen.findByLabelText('댓글')).toBeTruthy()
  })
})
