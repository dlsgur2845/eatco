import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import RecipeReviewPanel from './RecipeReviewPanel'
import { getSharedRecipe, type SharedRecipeDetail } from '../../api/sharedRecipes'

vi.mock('../../api/sharedRecipes', async () => {
  const actual = await vi.importActual<typeof import('../../api/sharedRecipes')>('../../api/sharedRecipes')
  return { ...actual, getSharedRecipe: vi.fn() }
})

/**
 * 이 패널은 **지금 누가 보는지**부터 말한다. 그 한 줄이 틀리면 나머지가 다 틀린다.
 *
 * 예전에는 `visibility === 'public'` 만 봤다. 그런데 공개한 뒤 내용을 고치면
 * 승인 해시가 어긋나 서버가 가족 밖에 안 보여주는데도 `visibility` 는 'public'
 * 인 채로 남는다. 그래서 **아무도 못 보는 레시피에 "모두가 볼 수 있어요"** 라고
 * 말했다. 「나의 요리」에서 같은 레시피가 "공개가 안 됐어요" 묶음에 들어가 있어서,
 * 한 화면 안에서 두 문장이 서로를 부정했다.
 *
 * 버튼도 같이 틀렸다. 이미 가족만 보고 있는데 「가족만 보기」를 내밀었다 —
 * 눌러도 화면상 아무 변화가 없는 버튼이다. 필요한 건 「공개 검토」다.
 */

const base: SharedRecipeDetail = {
  id: 'r1',
  name: '김치볶음밥',
  category: '한식',
  cooking_method: '볶기',
  calories: '430',
  image_url: null,
  ingredients: ['김치', '밥'],
  manual_steps: ['볶는다'],
  manual_images: [],
  tip: '',
  match_count: 1,
  total_ingredients: 2,
  match_ratio: 0.5,
  matched_items: ['김치'],
  missing_items: ['밥'],
  urgent_used: [],
  source: 'custom',
  author_label: 'me',
  is_mine: true,
  visibility: 'public',
  status: 'approved',
  approval_valid: true,
  status_reason: null,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
  improvements: [],
} as unknown as SharedRecipeDetail

function mount(over: Partial<SharedRecipeDetail>) {
  vi.mocked(getSharedRecipe).mockResolvedValue({ ...base, ...over })
  render(<RecipeReviewPanel recipeId="r1" onEdit={() => {}} onChanged={() => {}} />)
}

describe('검토 패널 — 지금 누가 보는가', () => {
  beforeEach(() => vi.clearAllMocks())

  it('공개 + 승인 유효 → 모두가 본다고 말하고, 내릴 수 있게 한다', async () => {
    mount({ visibility: 'public', approval_valid: true })
    expect(await screen.findByText('모두가 볼 수 있어요')).toBeTruthy()
    expect(screen.getByText('가족만 보기')).toBeTruthy()
    expect(screen.queryByText('공개 검토')).toBeNull()
  })

  it('공개 + 승인 깨짐 → 가족만 본다고 말하고, 다시 검토받게 한다', async () => {
    mount({ visibility: 'public', approval_valid: false })
    expect(await screen.findByText('우리 가족만 볼 수 있어요')).toBeTruthy()
    // 「가족만 보기」는 이미 가족만 보고 있는 상태를 또 만드는 무의미한 버튼이다.
    expect(screen.queryByText('가족만 보기')).toBeNull()
    expect(screen.getByText('공개 검토')).toBeTruthy()
  })

  it('공개 + 승인 깨짐 → 왜 안 보이는지와 무엇을 할지 함께 말한다', async () => {
    mount({ visibility: 'public', approval_valid: false })
    await waitFor(() =>
      expect(screen.getByText(/내용을 고친 뒤라 지금은 가족 밖에서 안 보여요/)).toBeTruthy(),
    )
  })

  it('가족 범위 → 공개 검토를 권한다', async () => {
    mount({ visibility: 'family', status: 'none', approval_valid: false })
    expect(await screen.findByText('우리 가족만 볼 수 있어요')).toBeTruthy()
    expect(screen.getByText(/공개 검토를 통과하면/)).toBeTruthy()
    expect(screen.getByText('공개 검토')).toBeTruthy()
  })

  it('거절이면 사유를 보여준다', async () => {
    mount({ visibility: 'family', status: 'rejected', approval_valid: false, status_reason: '재료가 음식이 아니에요' })
    expect(await screen.findByText('재료가 음식이 아니에요')).toBeTruthy()
  })
})
