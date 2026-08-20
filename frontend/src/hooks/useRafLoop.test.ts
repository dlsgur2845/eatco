import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRafLoop } from './useRafLoop'

/**
 * 이 훅이 틀리면 주머니 속 앱이 배터리를 먹는다. 브라우저 없이 확인할
 * 방법이 이것뿐이라 rAF 를 직접 목으로 둔다.
 */
describe('useRafLoop', () => {
  let frames: Array<(t: number) => void>
  let cancelled: number[]
  let hidden = false

  beforeEach(() => {
    frames = []
    cancelled = []
    hidden = false
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      frames.push(cb)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      cancelled.push(id)
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** 큐에 쌓인 마지막 프레임을 실행한다. */
  const step = (t: number) => {
    const cb = frames[frames.length - 1]
    cb?.(t)
  }

  it('enabled 이면 루프를 시작한다', () => {
    const cb = vi.fn()
    renderHook(() => useRafLoop(cb))
    expect(frames.length).toBe(1)
    step(performance.now() + 16)
    expect(cb).toHaveBeenCalled()
  })

  it('enabled=false 면 프레임을 요청하지 않는다', () => {
    const cb = vi.fn()
    renderHook(() => useRafLoop(cb, false))
    expect(frames.length).toBe(0)
    expect(cb).not.toHaveBeenCalled()
  })

  it('unmount 하면 프레임을 취소하고 더 이상 콜백을 부르지 않는다', () => {
    const cb = vi.fn()
    const { unmount } = renderHook(() => useRafLoop(cb))
    unmount()
    expect(cancelled.length).toBeGreaterThan(0)

    const before = cb.mock.calls.length
    step(performance.now() + 32) // 죽은 컴포넌트에 그리려는 시도
    expect(cb.mock.calls.length).toBe(before)
  })

  it('탭이 숨으면 멈추고, 돌아오면 다시 돈다 (배터리)', () => {
    const cb = vi.fn()
    renderHook(() => useRafLoop(cb))
    const framesBefore = frames.length

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(cancelled.length).toBeGreaterThan(0)
    // 숨은 동안에는 새 프레임을 요청하지 않는다
    expect(frames.length).toBe(framesBefore)

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.length).toBeGreaterThan(framesBefore)
  })

  it('숨어 있던 시간은 경과에 포함하지 않는다 (복귀 시 순간이동 방지)', () => {
    const seen: number[] = []
    renderHook(() => useRafLoop((e) => seen.push(e)))

    const t0 = performance.now()
    step(t0 + 100)
    const beforeHide = seen[seen.length - 1]

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))

    // 복귀 직후의 경과는 숨기 직전 값 근처여야 한다. 몇 분 숨어 있었어도
    // 경과가 그만큼 뛰면 애니메이션이 순간이동한다.
    step(performance.now() + 1)
    const afterShow = seen[seen.length - 1]
    expect(afterShow - beforeHide).toBeLessThan(1000)
  })
})
