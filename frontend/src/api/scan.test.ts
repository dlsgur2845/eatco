import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock 은 파일 맨 위로 끌어올려지므로 vi.hoisted 로 같이 끌어올린다.
// mergeScans 는 순수 함수라 이 목에 영향받지 않는다.
const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('./client', () => ({
  default: { post },
  registerFridgeChangeHandler: vi.fn(),
}))

import { mergeScans, restoreItem } from './scan'
import type { DashboardItem, ScanResponse, ScannedItem } from './scan'

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


/**
 * 되돌리기는 **재등록**이다. 그래서 보내는 필드가 곧 되돌려지는 재료다.
 *
 * 예전 되돌리기는 삭제를 3초 미루는 방식이라 보낼 필드가 없었다. 즉시 삭제로
 * 바꾸면서 이 함수가 생겼고, 여기서 필드를 하나 빠뜨리면 **되돌린 재료가
 * 되돌리기 전과 달라진다.** 화면에는 이름이 같게 보이므로 눈으로는 안 잡힌다.
 */
const restorable = {
  id: 'old-id',
  name: '대파',
  normalized_name: '대파',
  category_id: 3,
  storage_method: 'fridge',
  quantity: '1단',
  amount_value: 1,
  unit: '단',
  price: 3000,
  // 오래된 행에는 시각이 붙어 있다.
  expiry_date: '2026-09-01T00:00:00.000Z',
  image_url: null,
  store_name: '이마트',
  registered_by: 'me',
  days_left: 5,
} as unknown as DashboardItem

describe('되돌리기 — 재등록', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { ...restorable, id: 'new-id' } })
  })

  it('expiry_date 를 10자로 자른다', async () => {
    await restoreItem(restorable)
    // 서버가 ^\d{4}-\d{2}-\d{2}$ 로 검증한다. 시각이 붙어 가면 422 가 나고
    // 되돌리기가 실패해 재료가 영영 사라진다.
    expect(post.mock.calls[0][1].expiry_date).toBe('2026-09-01')
  })

  it('normalized_name 을 함께 보낸다', async () => {
    await restoreItem(restorable)
    // 워커의 loadFridge 가 `normalized_name || name` 으로 레시피를 매칭한다.
    // 이걸 잃으면 되돌린 뒤 추천이 되돌리기 전과 달라진다.
    expect(post.mock.calls[0][1].normalized_name).toBe('대파')
  })

  it('수량·단위·가격을 그대로 되돌린다', async () => {
    await restoreItem(restorable)
    expect(post.mock.calls[0][1]).toMatchObject({
      name: '대파', quantity: '1단', amount_value: 1, unit: '단',
      price: 3000, storage_method: 'fridge', category_id: 3, store_name: '이마트',
    })
  })

  it('서버가 준 새 행을 돌려준다 (옛 id 를 재사용하지 않는다)', async () => {
    const restored = await restoreItem(restorable)
    // 옛 id 를 쓰면 되돌린 행의 삭제·수정 버튼이 없는 id 를 때려 404 가 난다.
    expect(restored.id).toBe('new-id')
  })
})
