import { describe, expect, it } from 'vitest'
import { isChunkLoadError } from './LazyBoundary'

/**
 * 이 판별이 너무 넓으면 진짜 버그를 새로고침으로 덮어버리고,
 * 너무 좁으면 배포할 때마다 사용자가 빈 화면을 본다.
 */
describe('isChunkLoadError', () => {
  it('MIME 타입 불일치 — 배포 후 옛 청크가 index.html 을 받은 경우', () => {
    expect(
      isChunkLoadError(
        new TypeError(
          'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
        ),
      ),
    ).toBe(true)
  })

  it('Vite 의 동적 import 실패 문구', () => {
    expect(
      isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/X.js')),
    ).toBe(true)
  })

  it('webpack 계열 ChunkLoadError', () => {
    const e = new Error('Loading chunk 42 failed')
    e.name = 'ChunkLoadError'
    expect(isChunkLoadError(e)).toBe(true)
  })

  it('Safari 문구', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
  })

  it('진짜 코드 버그는 새로고침 대상이 아니다', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(isChunkLoadError(new RangeError('Maximum call stack size exceeded'))).toBe(false)
    expect(isChunkLoadError(new Error('식재료를 불러오지 못했어요'))).toBe(false)
  })

  it('Error 가 아닌 것도 안전하게 처리한다', () => {
    expect(isChunkLoadError('그냥 문자열')).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})
