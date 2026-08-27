import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock 은 파일 맨 위로 끌어올려지므로 평범한 const 는 아직 초기화 전이다.
// vi.hoisted 로 같이 끌어올린다.
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('./client', () => ({
  default: { get },
  registerFridgeChangeHandler: vi.fn(),
}))

import { getRecommendations, invalidateRecommendations } from './recipes'

/**
 * 대시보드가 뜰 때마다 /recipes/recommend 를 불렀다.
 * 실측: 냉장고 탭 3번 방문 = 3회 호출. 추천은 냉장고 내용에서 나오는데
 * 냉장고는 자주 안 바뀐다.
 */

const payload = [{ name: '김치찌개' }]

beforeEach(() => {
  get.mockReset()
  get.mockResolvedValue({ data: payload })
  invalidateRecommendations()
})

describe('레시피 추천 캐시', () => {
  it('두 번째 조회는 요청을 안 보낸다', async () => {
    await getRecommendations()
    await getRecommendations()
    await getRecommendations()
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('캐시된 값을 그대로 돌려준다', async () => {
    const a = await getRecommendations()
    const b = await getRecommendations()
    expect(b).toEqual(payload)
    expect(b).toBe(a)
  })

  it('동시에 불러도 요청은 한 번만 나간다', async () => {
    // 대시보드는 마운트와 삭제 확정 두 곳에서 부를 수 있다.
    let resolve!: (v: unknown) => void
    get.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const p1 = getRecommendations()
    const p2 = getRecommendations()
    resolve({ data: payload })
    await Promise.all([p1, p2])
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('재료가 바뀌면 다시 받는다', async () => {
    await getRecommendations()
    expect(get).toHaveBeenCalledTimes(1)
    invalidateRecommendations()
    await getRecommendations()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('요청이 실패하면 캐시에 남기지 않는다', async () => {
    get.mockRejectedValueOnce(new Error('네트워크 실패'))
    await expect(getRecommendations()).rejects.toThrow()
    // 다음 호출이 캐시된 실패를 재사용하면 안 된다
    get.mockResolvedValue({ data: payload })
    const out = await getRecommendations()
    expect(out).toEqual(payload)
    expect(get).toHaveBeenCalledTimes(2)
  })

  /**
   * 세대 카운터. `inFlight = null` 만으로는 **이미 나간 요청이 안 멈춘다.**
   *
   * 재료를 지우면 무효화가 일어나는데, 그 직전에 나간 조회는 여전히 살아 있다.
   * 그 응답이 뒤늦게 도착해 캐시를 채우면 **지우기 전 추천이 되살아난다.**
   * 삭제와 되돌리기가 몇백 ms 사이로 두 번 무효화하는 지금 구조에서는
   * 드문 일이 아니다.
   */
  it('무효화 뒤에 도착한 옛 응답은 캐시에 앉지 않는다', async () => {
    let resolveOld!: (v: unknown) => void
    get.mockReturnValueOnce(new Promise((r) => { resolveOld = r }))

    const stale = getRecommendations()      // 옛 세대로 출발
    invalidateRecommendations()             // 그 사이 재료가 바뀐다
    resolveOld({ data: [{ name: '옛날추천' }] })
    await stale

    // 캐시가 옛 응답으로 채워졌다면 여기서 요청이 안 나간다.
    get.mockResolvedValue({ data: [{ name: '새추천' }] })
    const fresh = await getRecommendations()
    expect(fresh).toEqual([{ name: '새추천' }])
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('무효화가 없으면 진행 중이던 응답은 정상적으로 캐시된다', async () => {
    let resolve!: (v: unknown) => void
    get.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const p = getRecommendations()
    resolve({ data: payload })
    await p
    await getRecommendations()
    expect(get).toHaveBeenCalledTimes(1)   // 두 번째는 캐시
  })
})
