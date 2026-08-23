import { describe, it, expect } from 'vitest'
import {
  MAX_LIKE_PATTERN_BYTES,
  escapeLike,
  likePattern,
  normalizeQuery,
  parseRecipeAttachment,
  queryRank,
  rankAll,
  readRecipeAttachment,
} from '../../../worker/src/lib/recipe-search'
import { cleanText, safeStringArray } from '../../../worker/src/lib/sanitize'

/* 워커 소스를 직접 import 한다 — `recipe-match.test.ts`, `korean.test.ts` 와 같은 방식.
   워커에는 테스트 러너가 없고, 이 파일들은 순수 함수만 두기로 돼 있어서 가능하다. */

describe('normalizeQuery', () => {
  it('공백을 없애서 "김치 찌개" 와 "김치찌개" 를 같게 본다', () => {
    expect(normalizeQuery('김치 찌개')).toBe('김치찌개')
    expect(normalizeQuery('  김치\tGGG찌개 '.replace('GGG', ''))).toBe('김치찌개')
  })
  it('대소문자를 무시한다', () => {
    expect(normalizeQuery('Kimchi')).toBe('kimchi')
  })
})

describe('escapeLike', () => {
  it('% 를 턴다 — 안 그러면 전부 매칭된다', () => {
    expect(escapeLike('%')).toBe('\\%')
    expect(escapeLike('김치%')).toBe('김치\\%')
  })
  it('_ 도 와일드카드다', () => {
    expect(escapeLike('a_b')).toBe('a\\_b')
  })
  it('역슬래시를 먼저 바꾼다 — 나중에 하면 방금 넣은 이스케이프를 또 이스케이프한다', () => {
    expect(escapeLike('\\%')).toBe('\\\\\\%')
  })
  it('평범한 글자는 그대로 둔다', () => {
    expect(escapeLike('김치찌개')).toBe('김치찌개')
  })
})

describe('likePattern — D1 의 50바이트 LIKE 상한', () => {
  const bytes = (x: string) => new TextEncoder().encode(x).length

  it('짧은 질의는 그대로 감싼다', () => {
    expect(likePattern('김치')).toBe('%김치%')
  })
  it('와일드카드를 턴다', () => {
    expect(likePattern('김치%')).toBe('%김치\\%%')
  })

  /* 한글은 UTF-8 3바이트라 17글자면 상한을 넘는다. 안 자르면
     `D1_ERROR: LIKE or GLOB pattern too complex` 로 검색이 통째로 500 이 난다.
     로컬 D1 로 이분해서 확인한 값이다. */
  it('한글 17자를 넘겨도 상한 안에 들어온다', () => {
    const p = likePattern('가'.repeat(17))
    expect(bytes(p)).toBeLessThanOrEqual(MAX_LIKE_PATTERN_BYTES)
  })
  it('아주 긴 질의도 상한 안에 들어온다', () => {
    expect(bytes(likePattern('가'.repeat(500)))).toBeLessThanOrEqual(MAX_LIKE_PATTERN_BYTES)
    expect(bytes(likePattern('a'.repeat(500)))).toBeLessThanOrEqual(MAX_LIKE_PATTERN_BYTES)
  })
  it('전부 와일드카드여도 (이스케이프로 2배가 되어도) 상한 안이다', () => {
    expect(bytes(likePattern('%'.repeat(200)))).toBeLessThanOrEqual(MAX_LIKE_PATTERN_BYTES)
  })
  it('자른 결과는 접두사라 결과가 넓어질 뿐 틀리지 않는다', () => {
    expect(likePattern('가'.repeat(20))).toBe('%' + '가'.repeat(16) + '%')
  })
  it('빈 질의도 터지지 않는다', () => {
    expect(likePattern('')).toBe('%%')
  })
})

describe('queryRank', () => {
  it('접두사가 포함보다 앞선다', () => {
    expect(queryRank('김치찌개', '김치')).toBe(0)
    expect(queryRank('돼지고기김치찜', '김치')).toBe(1)
  })
  it('없으면 -1', () => {
    expect(queryRank('된장국', '김치')).toBe(-1)
  })
  it('빈 질의는 아무것도 매칭하지 않는다', () => {
    expect(queryRank('김치찌개', '')).toBe(-1)
  })
  it('이름의 공백을 무시한다', () => {
    expect(queryRank('김치 찌개', '김치찌')).toBe(0)
  })
})

describe('rankAll — 페이지를 넘길 수 있으려면 전체 순서가 안정적이어야 한다', () => {
  const names = ['돼지고기김치찜', '김치찌개', '김치볶음밥', '된장국', '김치전']
  const items = names.map((name) => ({ name }))
  const run = (q: string) => rankAll(items, (x) => x.name, q).map((x) => x.name)

  it('접두사 먼저, 같은 등급에서는 짧은 이름 먼저', () => {
    expect(run('김치')).toEqual(['김치전', '김치찌개', '김치볶음밥', '돼지고기김치찜'])
  })
  it('매칭 없는 건 버린다', () => {
    expect(run('김치')).not.toContain('된장국')
  })
  it('자르지 않고 전부 준다 — 자르는 건 offset 을 아는 호출부의 일이다', () => {
    expect(run('김치')).toHaveLength(4)
  })
  it('빈 질의는 빈 배열', () => {
    expect(run('')).toEqual([])
  })

  /* 페이지네이션의 핵심 계약: 같은 질의를 두 번 물어도 순서가 같아야 한다.
     안 그러면 2페이지가 1페이지와 겹치거나 건너뛴다. */
  it('같은 질의는 항상 같은 순서를 준다', () => {
    expect(run('김치')).toEqual(run('김치'))
  })
  it('페이지로 잘라 이어붙이면 전체와 같다', () => {
    const all = run('김치')
    const p1 = all.slice(0, 2)
    const p2 = all.slice(2, 4)
    expect([...p1, ...p2]).toEqual(all)
    expect(new Set([...p1, ...p2]).size).toBe(all.length) // 겹침 없음
  })
})

describe('parseRecipeAttachment — 셋 다 있거나 셋 다 없거나', () => {
  const full = { recipe_source: 'foodsafety', recipe_id: '3000', recipe_ingredients: ['두부', '파'] }

  it('아무것도 없으면 연결 없음', () => {
    expect(parseRecipeAttachment({})).toEqual({ ok: true, value: null })
  })
  it('셋 다 있으면 연결', () => {
    expect(parseRecipeAttachment(full)).toEqual({
      ok: true,
      value: { source: 'foodsafety', id: '3000', ingredients: ['두부', '파'] },
    })
  })

  /* 반쪽 상태가 저장되면 조리법 버튼은 보이는데 부족 재료는 못 세는 식단이 생긴다.
     PATCH 로 레시피만 바꾸고 재료를 안 보내는 경로가 특히 위험하다. */
  it('재료 없이 id 만 오면 거절', () => {
    expect(parseRecipeAttachment({ recipe_source: 'foodsafety', recipe_id: '3000' }).ok).toBe(false)
  })
  it('출처 없이 재료만 오면 거절', () => {
    expect(parseRecipeAttachment({ recipe_ingredients: ['두부'] }).ok).toBe(false)
  })

  it('모르는 출처는 거절', () => {
    expect(parseRecipeAttachment({ ...full, recipe_source: 'evil' }).ok).toBe(false)
  })
  it('재료가 배열이 아니면 거절', () => {
    expect(parseRecipeAttachment({ ...full, recipe_ingredients: '두부' }).ok).toBe(false)
  })

  it('재료 30개를 넘기면 자른다 (페이로드 폭탄 방어)', () => {
    const r = parseRecipeAttachment({ ...full, recipe_ingredients: Array(400).fill('두부') })
    expect(r.ok && r.value?.ingredients).toHaveLength(30)
  })
  it('재료 이름의 꺾쇠를 턴다', () => {
    const r = parseRecipeAttachment({ ...full, recipe_ingredients: ['<script>두부'] })
    expect(r.ok && r.value?.ingredients[0]).toBe('script두부')
  })
  it('재료 이름의 제어문자를 공백으로 바꾼다', () => {
    const r = parseRecipeAttachment({ ...full, recipe_ingredients: ['두' + String.fromCharCode(1) + '부'] })
    expect(r.ok && r.value?.ingredients[0]).toBe('두 부')
  })
  it('재료가 전부 빈 문자열이면 연결하지 않는다 — "0개 부족" 은 "다 있다" 로 읽힌다', () => {
    expect(parseRecipeAttachment({ ...full, recipe_ingredients: ['', '   '] })).toEqual({ ok: true, value: null })
  })
  it('null 을 명시해서 보내면 연결 해제로 읽는다', () => {
    expect(parseRecipeAttachment({ recipe_source: null, recipe_id: null, recipe_ingredients: null })).toEqual({
      ok: true,
      value: null,
    })
  })
})

describe('readRecipeAttachment — 읽기 경로는 절대 throw 하지 않는다', () => {
  it('정상 행', () => {
    expect(
      readRecipeAttachment({ recipe_source: 'custom', recipe_id: 'abc', recipe_ingredients: '["두부"]' }),
    ).toEqual({ source: 'custom', id: 'abc', ingredients: ['두부'] })
  })
  it('JSON 이 깨져도 null — 깨진 한 행이 그날 식단을 500 으로 만들면 안 된다', () => {
    expect(
      readRecipeAttachment({ recipe_source: 'custom', recipe_id: 'abc', recipe_ingredients: '{깨짐' }),
    ).toBeNull()
  })
  it('컬럼이 비어 있으면 null', () => {
    expect(readRecipeAttachment({ recipe_source: null, recipe_id: null, recipe_ingredients: null })).toBeNull()
  })
  it('모르는 출처가 DB 에 있어도 null', () => {
    expect(
      readRecipeAttachment({ recipe_source: 'evil', recipe_id: 'a', recipe_ingredients: '["두부"]' }),
    ).toBeNull()
  })
})

describe('safeStringArray', () => {
  it('깨진 JSON → []', () => {
    expect(safeStringArray('{깨짐')).toEqual([])
  })
  it('배열이 아니면 []', () => {
    expect(safeStringArray('{"a":1}')).toEqual([])
  })
  it('문자열 아닌 원소는 버린다', () => {
    expect(safeStringArray('["두부",1,null,"파"]')).toEqual(['두부', '파'])
  })
  it('null / 빈 문자열 → []', () => {
    expect(safeStringArray(null)).toEqual([])
    expect(safeStringArray('')).toEqual([])
  })
})

describe('cleanText', () => {
  it('꺾쇠를 턴다', () => {
    expect(cleanText('<b>두부</b>', 50)).toBe('b두부/b')
  })
  it('상한을 지킨다', () => {
    expect(cleanText('가'.repeat(100), 10)).toHaveLength(10)
  })
  it('앞뒤 공백을 턴다', () => {
    expect(cleanText('  두부  ', 50)).toBe('두부')
  })
})
