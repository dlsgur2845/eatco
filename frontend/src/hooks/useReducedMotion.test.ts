import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useReducedMotion } from './useReducedMotion'

/**
 * jsdom 에는 matchMedia 가 없다. 목을 두되 addEventListener 만 있는 것과
 * addListener 만 있는 것(구형 Safari) 둘 다 확인한다 — iOS 가 주 타깃이다.
 */
function mockMatchMedia(matches: boolean, legacy = false) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = []
  const mq: Record<string, unknown> = { matches, media: '(prefers-reduced-motion: reduce)' }
  if (legacy) {
    mq.addListener = (cb: (e: MediaQueryListEvent) => void) => listeners.push(cb)
    mq.removeListener = () => {}
  } else {
    mq.addEventListener = (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb)
    mq.removeEventListener = () => {}
  }
  vi.stubGlobal('matchMedia', () => mq)
  return { fire: (m: boolean) => listeners.forEach((l) => l({ matches: m } as MediaQueryListEvent)) }
}

afterEach(() => vi.unstubAllGlobals())

describe('useReducedMotion', () => {
  it('설정이 꺼져 있으면 false', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('설정이 켜져 있으면 true', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
  })

  it('앱 실행 중에 설정을 바꾸면 따라간다', () => {
    const { fire } = mockMatchMedia(false)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
    act(() => fire(true))
    expect(result.current).toBe(true)
  })

  it('addEventListener 가 없는 구형 Safari 에서도 동작한다', () => {
    const { fire } = mockMatchMedia(false, true)
    const { result } = renderHook(() => useReducedMotion())
    act(() => fire(true))
    expect(result.current).toBe(true)
  })

  it('matchMedia 자체가 없어도 터지지 않는다', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })
})
