import { describe, expect, it } from 'vitest'
import { mergeScans } from './scan'
import type { ScanResponse, ScannedItem } from './scan'

/**
 * 여러 장 스캔의 병합 규칙. 여기가 틀리면 냉장고에 같은 게 두 번 들어가거나
 * (겹쳐 찍었는데 안 합쳐짐), 진짜로 두 개 산 걸 하나로 지워버린다.
 */

function item(name: string, price: number | null = null, extra: Partial<ScannedItem> = {}): ScannedItem {
  return {
    name,
    matched_keyword: name,
    normalized_name: name,
    storage_method: 'refrigerated',
    shelf_life_days: 5,
    expiry_date: '2026-09-01',
    confidence: 0.9,
    auto_matched: true,
    quantity: null,
    price,
    ...extra,
  }
}

function shot(items: ScannedItem[], store: string | null = null): ScanResponse {
  return { items, total: items.length, store_name: store }
}

describe('mergeScans', () => {
  it('한 장이면 그대로 나온다', () => {
    const r = mergeScans([shot([item('두부'), item('우유')], '메가마트')])
    expect(r.items.map((i) => i.name)).toEqual(['두부', '우유'])
    expect(r.store_name).toBe('메가마트')
    expect(r.attempted).toBe(1)
    expect(r.succeeded).toBe(1)
    expect(r.failed).toBe(0)
  })

  it('다른 장의 같은 항목은 합치고 몇 장인지 표시한다', () => {
    const r = mergeScans([
      shot([item('두부', 3000), item('우유', 2500)]),
      shot([item('두부', 3000), item('계란', 6000)]),
    ])
    expect(r.items.map((i) => i.name)).toEqual(['두부', '우유', '계란'])
    expect(r.items.find((i) => i.name === '두부')?.duplicate_count).toBe(2)
    expect(r.items.find((i) => i.name === '우유')?.duplicate_count).toBeUndefined()
  })

  it('같은 장 안에 두 번 나오면 별개로 둔다 (진짜 두 개 샀을 수 있다)', () => {
    const r = mergeScans([shot([item('두부', 3000), item('두부', 3000)])])
    expect(r.items).toHaveLength(2)
    expect(r.items[0].duplicate_count).toBeUndefined()
  })

  it('가격이 다르면 다른 항목이다', () => {
    const r = mergeScans([shot([item('두부', 3000)]), shot([item('두부', 4500)])])
    expect(r.items).toHaveLength(2)
  })

  it('이름의 공백·대소문자 차이는 같은 것으로 본다', () => {
    const r = mergeScans([
      shot([item('냉동 삼겹살', 11285)]),
      shot([item('냉동삼겹살', 11285)]),
    ])
    expect(r.items).toHaveLength(1)
    expect(r.items[0].duplicate_count).toBe(2)
  })

  it('실패한 장은 건너뛰고 성공한 것만 살린다', () => {
    const r = mergeScans([shot([item('두부')]), null, shot([item('계란')])])
    expect(r.items.map((i) => i.name)).toEqual(['두부', '계란'])
    expect(r.attempted).toBe(3)
    expect(r.succeeded).toBe(2)
    expect(r.failed).toBe(1)
  })

  it('전부 실패하면 빈 결과를 준다', () => {
    const r = mergeScans([null, null])
    expect(r.items).toHaveLength(0)
    expect(r.succeeded).toBe(0)
    expect(r.failed).toBe(2)
    expect(r.store_name).toBeNull()
  })

  it('매장명은 처음 나온 것을 쓴다', () => {
    const r = mergeScans([shot([], null), shot([item('두부')], '쿠팡'), shot([], 'SSG')])
    expect(r.store_name).toBe('쿠팡')
  })

  it('normalized_name 이 있으면 그걸로 비교한다', () => {
    const a = item('서울우유 1L', 2500, { normalized_name: '우유' })
    const b = item('매일우유 1L', 2500, { normalized_name: '우유' })
    const r = mergeScans([shot([a]), shot([b])])
    expect(r.items).toHaveLength(1)
    expect(r.items[0].duplicate_count).toBe(2)
  })
})
