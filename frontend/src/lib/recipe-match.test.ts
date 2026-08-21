import { describe, it, expect } from 'vitest'
import { isWordMatch, scoreRecipe, normalizeIngredient } from '../../../worker/src/lib/recipe-match'

/* 이 매칭기는 원래 routes/recipes.ts 안에 있었다. 공유 레시피가 같은 점수를
   써야 해서 lib 으로 끌어냈고, 이제 **두 엔드포인트가 같은 코드를 탄다.**
   여기가 깨지면 추천과 «모두의 메뉴» 가 동시에 틀린다.

   korean.test.ts 와 같은 방식으로 worker 소스를 직접 import 한다. */

describe('normalizeIngredient', () => {
  it('수량·괄호·수식어를 턴다', () => {
    expect(normalizeIngredient('돼지고기 300g')).toBe('돼지고기')
    expect(normalizeIngredient('양파(중) 1개')).toBe('양파')
    expect(normalizeIngredient('다진 마늘')).toBe('마늘')
  })
})

describe('isWordMatch', () => {
  it('접미사가 겹치면 매칭한다', () => {
    // 원 주석이 명시한 의도: "순두부" 는 "두부" 를 포함한다.
    expect(isWordMatch('순두부', '두부')).toBe(true)
  })

  it('무관한 재료를 매칭하지 않는다', () => {
    // 같은 주석의 반대쪽: "삼겹살" 은 "돼지고기" 와 무관하다.
    expect(isWordMatch('삼겹살', '돼지고기')).toBe(false)
    expect(isWordMatch('양파', '파프리카')).toBe(false)
  })

  it('한 글자로는 매칭하지 않는다', () => {
    // 그렇지 않으면 "파" 가 "파프리카"·"대파"·"파슬리" 를 전부 먹는다.
    expect(isWordMatch('파', '파프리카')).toBe(false)
  })
})

describe('scoreRecipe', () => {
  it('보유/부족을 가르고 비율을 낸다', () => {
    const s = scoreRecipe(['두부', '양파', '고춧가루'], ['두부', '양파'], [])
    expect(s.match_count).toBe(2)
    expect(s.total_ingredients).toBe(3)
    expect(s.missing_items).toEqual(['고춧가루'])
  })

  it('중복 재료를 한 번만 센다', () => {
    // 한 레시피가 같은 재료를 양념/고명에 또 적는 경우가 흔하다.
    // 화면에 "양파, 양파" 로 나오면 안 된다.
    const s = scoreRecipe(['양파', '양파', '두부'], ['양파', '두부'], [])
    expect(s.matched_items).toEqual(['양파', '두부'])
    expect(s.match_count).toBe(2)
  })

  it('임박 재료를 따로 표시한다', () => {
    const s = scoreRecipe(['두부', '양파'], ['두부', '양파'], ['두부'])
    expect(s.urgent_used).toEqual(['두부'])
  })

  it('빈 재료 목록에서 0 으로 나누지 않는다', () => {
    const s = scoreRecipe([], ['두부'], [])
    expect(s.match_ratio).toBe(0)
    expect(Number.isNaN(s.match_ratio)).toBe(false)
  })

  it('냉장고가 비면 아무것도 매칭되지 않는다', () => {
    const s = scoreRecipe(['두부', '양파'], [], [])
    expect(s.match_count).toBe(0)
    expect(s.missing_items).toEqual(['두부', '양파'])
  })
})
