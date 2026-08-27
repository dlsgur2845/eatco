import { describe, expect, it } from 'vitest'
import { groupRecipes } from './MyRecipesPage'
import type { SharedRecipe } from '../api/sharedRecipes'

const base = {
  id: 'r1', name: '김치찌개', category: '', cooking_method: '끓이기', calories: '',
  image_url: '', ingredients: [], manual_steps: [], tip: '',
  match_count: 0, total_ingredients: 3, match_ratio: 0,
  matched_items: [], missing_items: [], urgent_used: [],
  author_label: '나', is_mine: true, status_reason: null,
  created_at: '', updated_at: '',
} as unknown as SharedRecipe

const make = (over: Partial<SharedRecipe>): SharedRecipe => ({ ...base, ...over })

/**
 * 「나의 요리」의 축은 **공개 범위**다. 승인 상태가 아니다.
 * 이 저장소에 `pending` 은 존재하지 않는다 — 워커의 낡은 주석을 믿고
 * 없는 상태를 위한 화면을 설계할 뻔했다.
 */
describe('groupRecipes', () => {
  it('공개 + 승인 유효 → 모두가 보고 있어요', () => {
    const g = groupRecipes([make({ visibility: 'public', status: 'approved', approval_valid: true })])
    expect(g.map((x) => x.title)).toEqual(['모두가 보고 있어요'])
  })

  it('가족 범위 → 우리 가족만 봐요', () => {
    const g = groupRecipes([make({ visibility: 'family', status: 'none', approval_valid: false })])
    expect(g.map((x) => x.title)).toEqual(['우리 가족만 봐요'])
  })

  it('거절 → 공개가 안 됐어요', () => {
    const g = groupRecipes([make({ visibility: 'family', status: 'rejected', approval_valid: false })])
    expect(g.map((x) => x.title)).toEqual(['공개가 안 됐어요'])
  })

  it('공개했다가 고쳐서 승인이 깨진 것도 공개가 안 됐어요', () => {
    // 서버가 approval_valid 로 알려주는데 지금까지 화면 어디서도 안 썼다.
    // 사용자는 남들이 자기 글을 못 본다는 걸 알 방법이 없었다.
    const g = groupRecipes([make({ visibility: 'public', status: 'approved', approval_valid: false })])
    expect(g.map((x) => x.title)).toEqual(['공개가 안 됐어요'])
  })

  it('빈 묶음은 아예 안 만든다', () => {
    const g = groupRecipes([make({ visibility: 'family', status: 'none', approval_valid: false })])
    expect(g).toHaveLength(1)
  })

  it('아무것도 없으면 빈 배열', () => {
    expect(groupRecipes([])).toEqual([])
  })
})
