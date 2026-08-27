import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RecipeCard from './RecipeCard'
import type { Recipe } from '../../api/recipes'

/**
 * 카드가 **무엇의 몇 퍼센트인지** 말하지 않던 문제와,
 * 남의 레시피에 「나의 레시피」가 찍히던 문제를 고정한다.
 */

const base = {
  name: '김치찌개',
  category: '한식',
  cooking_method: '끓이기',
  calories: '320',
  image_url: null,
  ingredients: ['김치', '두부', '대파'],
  manual_steps: ['끓인다'],
  manual_images: [],
  tip: '',
  match_count: 2,
  total_ingredients: 3,
  match_ratio: 0.67,
  matched_items: ['김치', '두부'],
  missing_items: ['대파'],
  urgent_used: [],
  source: 'custom',
} as unknown as Recipe

describe('레시피 카드', () => {
  it('매칭을 「재료 N/M」으로 말한다 (퍼센트가 아니라)', () => {
    render(<RecipeCard recipe={base} />)
    expect(screen.getByText('재료 2/3')).toBeTruthy()
    // 「67%」는 옆의 「320kcal」와 나란히 놓이면 평점처럼 읽힌다.
    expect(screen.queryByText(/67%/)).toBeNull()
  })

  it('매칭이 0건이면 알약을 아예 안 그린다', () => {
    render(<RecipeCard recipe={{ ...base, match_count: 0, matched_items: [] }} />)
    // 빨간 「재료 0/3」이 줄줄이 뜨면 "여긴 나에게 쓸모없다"고 말하는 셈이다.
    expect(screen.queryByText(/^재료 0\//)).toBeNull()
  })

  it('기본은 출처를 보여준다 (추천 레일)', () => {
    render(<RecipeCard recipe={{ ...base, source: 'foodsafety' }} />)
    expect(screen.getByText('식품안전나라')).toBeTruthy()
  })

  it('hideSource 면 출처 줄을 숨긴다', () => {
    // 서버는 공유 레시피를 전부 source:'custom' 으로 보낸다. 그 라벨이
    // 「나의 레시피」라서, 숨기지 않으면 **남이 올린 레시피에도** 그게 찍힌다.
    render(<RecipeCard recipe={base} hideSource />)
    expect(screen.queryByText('나의 레시피')).toBeNull()
  })
})
