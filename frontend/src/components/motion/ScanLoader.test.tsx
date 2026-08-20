import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScanLoader from './ScanLoader'

/**
 * 이 컴포넌트가 조용히 실패하면 9초 동안 빈 칸이 뜬다. 사용자는 앱이 죽은
 * 줄 알고 뒤로가기를 누르고, 사진 찍고 기다린 결과가 날아간다.
 * 그래서 폴백 경로를 명시적으로 검사한다.
 */
describe('ScanLoader', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => vi.unstubAllGlobals())

  it('canvas 를 쓸 수 있으면 캔버스를 그리고 라벨을 읽어준다', () => {
    // jsdom 은 2d 컨텍스트를 구현하지 않는다. 최소한만 흉내낸다.
    const ctx = {
      setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
      fillRect: vi.fn(), createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)

    render(<ScanLoader label="영수증을 읽고 있어요..." />)
    expect(screen.getByRole('img', { name: '영수증을 읽고 있어요...' })).toBeTruthy()
  })

  it('getContext 가 null 이면 불확정 막대로 폴백한다 (빈 칸 금지)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    render(<ScanLoader label="영수증을 읽고 있어요..." />)
    // 캔버스가 아니라 progressbar 가 떠야 한다
    const bar = screen.getByRole('progressbar', { name: '영수증을 읽고 있어요...' })
    expect(bar).toBeTruthy()
    expect(bar.querySelector('.scan-indeterminate')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('어느 경로든 라벨 문구는 항상 화면에 남는다', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<ScanLoader label="식재료를 찾고 있어요..." />)
    expect(screen.getByText('식재료를 찾고 있어요...')).toBeTruthy()
  })
})
