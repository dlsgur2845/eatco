import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RecipeDetailModal from './RecipeDetailModal'
import type { Recipe } from '../../api/recipes'

/**
 * 이 화면이 흰 화면이 됐던 이유를 고정한다.
 *
 * 서버(`worker/src/routes/recipes.ts`)는 `manual_images` 를 보낸 적이 없는데
 * 프론트 타입은 `manual_images: string[]` 이라고 단언했다. `api.get<Recipe[]>` 는
 * 그 단언을 검증하지 않으므로 타입체크는 통과하고, 조리 순서가 있는 레시피를
 * 열면 `undefined[i]` 에서 터졌다. 실측한 프로덕션 응답 키에도 없었다.
 */

// 실제 프로덕션 /api/recipes/recommend 응답에서 그대로 옮긴 모양 (manual_images 없음)
const fromServer = {
  name: '묵은지가지말이',
  category: '반찬',
  cooking_method: '끓이기',
  calories: '312.2',
  image_url: 'https://example.test/main.jpg',
  ingredients: ['돼지고기', '가지', '묵은지'],
  manual_steps: ['가지를 썬다', '고기를 볶는다', '함께 찐다'],
  tip: '묵은지는 씻어서 쓰면 덜 십니다',
  match_count: 1,
  total_ingredients: 3,
  match_ratio: 0.33,
  matched_items: ['돼지고기'],
  missing_items: ['가지', '묵은지'],
  urgent_used: ['돼지고기'],
} as unknown as Recipe

describe('RecipeDetailModal', () => {
  it('manual_images 가 아예 없어도 터지지 않는다', () => {
    expect(() =>
      render(<RecipeDetailModal recipe={fromServer} onClose={() => {}} />),
    ).not.toThrow()
    // 흰 화면이 아니라 내용이 그려져야 한다
    expect(screen.getByText('묵은지가지말이')).toBeTruthy()
    expect(screen.getByText('가지를 썬다')).toBeTruthy()
    expect(screen.getByText(/조리 순서/)).toBeTruthy()
  })

  it('manual_images 가 있으면 단계 사진을 그린다', () => {
    const withImages = {
      ...fromServer,
      manual_images: ['https://example.test/s1.jpg', '', 'https://example.test/s3.jpg'],
    } as Recipe
    render(<RecipeDetailModal recipe={withImages} onClose={() => {}} />)
    const imgs = [...document.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(imgs).toContain('https://example.test/s1.jpg')
    expect(imgs).toContain('https://example.test/s3.jpg')
    // 빈 문자열 단계는 img 를 만들지 않는다 (깨진 이미지 아이콘 방지)
    expect(imgs.filter((s) => s === '')).toHaveLength(0)
  })

  it('조리 순서가 비어 있어도 터지지 않는다', () => {
    const noSteps = { ...fromServer, manual_steps: [] } as Recipe
    expect(() =>
      render(<RecipeDetailModal recipe={noSteps} onClose={() => {}} />),
    ).not.toThrow()
    expect(screen.queryByText(/조리 순서/)).toBeNull()
  })
})
