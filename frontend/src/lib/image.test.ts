import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canUpload, downscaleImage, needsReencode, MAX_UPLOAD_BYTES, UPLOADABLE_TYPES } from './image'

function f(type: string, size = 10, name = 'a'): File {
  return new File([new Uint8Array(size)], name, { type })
}

/**
 * **여기서 테스트할 수 있는 것은 정책뿐이다.**
 *
 * jsdom 에는 `createImageBitmap` 이 없고 `canvas.getContext('2d')` 가 `null` 이라
 * `downscaleImage` 는 이 환경에서 **항상 입력을 그대로 돌려준다.** 실제 JPEG 변환은
 * 자동 테스트가 불가능하다 — 브라우저에서 눈으로 확인해야 한다.
 * 그래서 "변환할지 말지" 판단만 순수 함수로 빼서 여기서 지킨다.
 */
describe('needsReencode — 변환 정책', () => {
  it('워커가 받는 타입은 변환하지 않는다', () => {
    expect(needsReencode(f('image/jpeg'))).toBe(false)
    expect(needsReencode(f('image/png'))).toBe(false)
    expect(needsReencode(f('image/webp'))).toBe(false)
  })

  it('허용목록 밖 이미지는 변환한다 — 거절이 아니라 변환', () => {
    // 거르면 웹에서 「이미지 복사」한 gif 가 그 자리에서 막다른 길이 된다.
    expect(needsReencode(f('image/gif'))).toBe(true)
    expect(needsReencode(f('image/tiff'))).toBe(true)
    expect(needsReencode(f('image/bmp'))).toBe(true)
    expect(needsReencode(f('image/avif'))).toBe(true)
    expect(needsReencode(f('image/heic'))).toBe(true)
  })

  it('MIME 이 빈 문자열이면 변환한다 — 클립보드 File 에 흔하다', () => {
    expect(needsReencode(f(''))).toBe(true)
  })
})

describe('canUpload — 업로드 직전 사후 검사', () => {
  it('허용 타입에 적당한 크기면 통과', () => {
    expect(canUpload(f('image/jpeg', 1000))).toBe(true)
  })

  it('변환에 실패해 형식이 그대로 남았으면 막는다', () => {
    // downscaleImage 는 실패해도 원본을 돌려주므로 반환값만으로는 성공/실패를
    // 구분할 수 없다. 이 검사가 그 구분을 대신한다.
    expect(canUpload(f('image/gif', 1000))).toBe(false)
    expect(canUpload(f('image/svg+xml', 1000))).toBe(false)
    expect(canUpload(f('', 1000))).toBe(false)
  })

  it('0바이트는 막는다', () => {
    expect(canUpload(f('image/png', 0))).toBe(false)
  })

  it('워커 상한을 넘으면 막는다', () => {
    expect(canUpload(f('image/jpeg', MAX_UPLOAD_BYTES + 1))).toBe(false)
    expect(canUpload(f('image/jpeg', MAX_UPLOAD_BYTES))).toBe(true)
  })
})

describe('downscaleImage — jsdom 한계를 명시한다', () => {
  it('jsdom 에서는 항상 입력을 그대로 돌려준다 (변환은 수동 확인 대상)', async () => {
    // 이 단언은 기능이 아니라 **테스트 환경의 한계**를 기록한다.
    // createImageBitmap 이 없어 catch 로 떨어진다. 언젠가 canvas 패키지가 들어와서
    // 이 테스트가 깨지면, 그때는 진짜 변환 테스트를 쓸 수 있다는 신호다.
    expect(typeof globalThis.createImageBitmap).toBe('undefined')
    const input = f('image/gif', 100, 'a.gif')
    const out = await downscaleImage(input)
    expect(out).toBe(input)
  })

  it('그래서 변환 실패가 canUpload 로 잡힌다', async () => {
    const out = await downscaleImage(f('image/gif', 100, 'a.gif'))
    expect(canUpload(out)).toBe(false)
  })
})

describe('워커와의 계약 — 주석이 아니라 테스트로 강제한다', () => {
  // UPLOADABLE_TYPES/MAX_UPLOAD_BYTES 는 worker/src/routes/scan.ts 의
  // ALLOWED_TYPES/MAX_IMAGE_BYTES 와 같아야 한다. 한쪽만 바뀌면 클라이언트가
  // 통과시킨 파일이 서버에서 422/413 으로 죽는데, 지금까지 그걸 막는 건 주석뿐이었다.
  // 워커를 import 하면 hono 까지 딸려오므로 소스를 읽어서 리터럴을 대조한다.
  // vitest 는 frontend/ 에서 돈다. import.meta.url 은 Vite 변환을 거치면
  // file: 스킴이 아니라서 readFileSync 가 못 받는다.
  const workerSrc = readFileSync(resolve(process.cwd(), '../worker/src/routes/scan.ts'), 'utf-8')

  it('허용 타입 목록이 워커와 같다', () => {
    const m = workerSrc.match(/const ALLOWED_TYPES = new Set\(\[([^\]]+)\]\)/)
    expect(m, 'worker 의 ALLOWED_TYPES 선언을 찾지 못했다').toBeTruthy()
    const workerTypes = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    expect(workerTypes).toEqual([...UPLOADABLE_TYPES])
  })

  it('업로드 크기 상한이 워커와 같다', () => {
    const m = workerSrc.match(/const MAX_IMAGE_BYTES = ([^\n]+)/)
    expect(m, 'worker 의 MAX_IMAGE_BYTES 선언을 찾지 못했다').toBeTruthy()
    // eslint-disable-next-line no-eval
    expect(eval(m![1].replace(/\/\/.*$/, '').trim())).toBe(MAX_UPLOAD_BYTES)
  })
})
