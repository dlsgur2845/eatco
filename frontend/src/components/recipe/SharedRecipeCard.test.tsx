import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SharedRecipeCard from './SharedRecipeCard'
import type { SharedRecipe } from '../../api/sharedRecipes'

vi.mock('../../api/sharedRecipes', async () => {
  const actual = await vi.importActual<typeof import('../../api/sharedRecipes')>('../../api/sharedRecipes')
  return { ...actual, getSharedRecipe: vi.fn().mockResolvedValue(null), deleteSharedRecipe: vi.fn() }
})

/**
 * 배지는 「지금 누가 보는가」를 한 글자로 요약한다. 틀리면 조용히 틀린다.
 *
 * 공개한 뒤 내용을 고치면 승인 해시가 어긋나 서버가 가족 밖에 안 보여주는데
 * `visibility` 는 'public' 인 채로 남는다. 그것만 보던 배지는 **아무것도 안 달아서**
 * "잘 공개돼 있다" 로 읽혔다.
 */
const base = {
  id: 'r1',
  name: '김치찌개',
  category: '한식',
  cooking_method: '끓이기',
  calories: '320',
  image_url: null,
  ingredients: ['김치'],
  manual_steps: ['끓인다'],
  manual_images: [],
  tip: '',
  match_count: 1,
  total_ingredients: 1,
  match_ratio: 1,
  matched_items: ['김치'],
  missing_items: [],
  urgent_used: [],
  source: 'custom',
  author_label: '나',
  is_mine: true,
  visibility: 'public',
  status: 'approved',
  approval_valid: true,
  status_reason: null,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
} as unknown as SharedRecipe

describe('공유 카드 배지', () => {
  it('공개 + 승인 유효 → 배지 없음', () => {
    render(<SharedRecipeCard recipe={base} onDeleted={() => {}} />)
    expect(screen.queryByText('검토 필요')).toBeNull()
    expect(screen.queryByText('가족만')).toBeNull()
  })

  it('공개 + 승인 깨짐 → 「검토 필요」', () => {
    render(<SharedRecipeCard recipe={{ ...base, approval_valid: false }} onDeleted={() => {}} />)
    expect(screen.getByText('검토 필요')).toBeTruthy()
  })

  it('가족 범위 → 「가족만」', () => {
    render(<SharedRecipeCard recipe={{ ...base, visibility: 'family', approval_valid: false }} onDeleted={() => {}} />)
    expect(screen.getByText('가족만')).toBeTruthy()
  })

  it('거절 → 「공개 안 됨」', () => {
    render(<SharedRecipeCard recipe={{ ...base, status: 'rejected', visibility: 'family', approval_valid: false }} onDeleted={() => {}} />)
    expect(screen.getByText('공개 안 됨')).toBeTruthy()
  })

  it('남의 레시피면 배지를 안 단다', () => {
    render(<SharedRecipeCard recipe={{ ...base, is_mine: false, approval_valid: false }} onDeleted={() => {}} />)
    expect(screen.queryByText('검토 필요')).toBeNull()
  })
})
