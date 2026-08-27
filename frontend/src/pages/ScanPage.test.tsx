import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ScanPage from './ScanPage'

vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
import api from '../api/client'

/**
 * **여기서 보는 것은 배선과 가드뿐이다.** 클립보드에서 File 을 꺼내는 로직은
 * `lib/clipboard-image.test.ts` 가, 변환 정책은 `lib/image.test.ts` 가 본다.
 *
 * jsdom 은 레이아웃을 계산하지 않는다 — 버튼이 390×844 안에 들어가는지, 2단 그리드가
 * 실제로 나란한지는 **여기서 확인할 수 없다.** 실기기 뷰포트에서 눈으로 본다.
 *
 * `fireEvent.paste` 는 손으로 이벤트를 만들 필요가 없다: @testing-library/dom 이
 * `window.DataTransfer` 부재를 감지해 `clipboardData` 를 직접 정의해준다.
 */

function pngFile(name = 'shot.png') {
  return new File(['x'], name, { type: 'image/png' })
}

/**
 * 붙여넣기 → **확인** → 읽기.
 *
 * 붙여넣기·드롭은 보내기 전에 「이걸 읽을까요?」를 한 번 세운다. 파일 선택창과 달리
 * 사용자가 무엇을 보내는지 볼 기회가 그 지점밖에 없기 때문이다.
 */
async function pasteAndRead(files: File[]) {
  fireEvent.paste(document.body, { clipboardData: { files, items: [], types: ['Files'] } })
  fireEvent.click(await screen.findByRole('button', { name: '읽을게요' }))
}

/** /scan/analyze 호출만 센다. logEvent 도 같은 api.post 를 쓰기 때문이다. */
function analyzeCalls() {
  return vi.mocked(api.post).mock.calls.filter((c) => c[0] === '/scan/analyze')
}

function eventCalls(type: string) {
  return vi.mocked(api.post).mock.calls.filter(
    (c) => c[0] === '/events' && (c[1] as { event_type?: string })?.event_type === type,
  )
}

const OK_SCAN = {
  data: {
    items: [{
      name: '두부', matched_keyword: null, normalized_name: '두부', storage_method: 'refrigerated',
      shelf_life_days: 5, expiry_date: '2026-09-01', confidence: 0.9, auto_matched: true,
      quantity: '1모', price: 2000,
    }],
    total: 1,
    store_name: '이마트',
  },
}
const EMPTY_SCAN = { data: { items: [], total: 0, store_name: null } }

/** url 로 갈라서 응답한다. /events 는 언제나 성공. */
function routePost(analyze: unknown | (() => unknown)) {
  vi.mocked(api.post).mockImplementation((url: string) => {
    if (url === '/scan/analyze') {
      const r = typeof analyze === 'function' ? (analyze as () => unknown)() : analyze
      return Promise.resolve(r) as never
    }
    return Promise.resolve({ data: {} }) as never
  })
}

function setClipboardRead(read: (() => Promise<unknown>) | null) {
  if (read === null) {
    Object.defineProperty(window.navigator, 'clipboard', { value: undefined, configurable: true })
  } else {
    Object.defineProperty(window.navigator, 'clipboard', { value: { read }, configurable: true })
  }
}

let objUrl = 0
beforeEach(() => {
  vi.clearAllMocks()
  // jsdom 에는 createObjectURL 이 없다. 썸네일 미리보기가 이걸 쓴다.
  URL.createObjectURL = vi.fn(() => `blob:mock/${objUrl++}`)
  URL.revokeObjectURL = vi.fn()
  routePost(OK_SCAN)
  setClipboardRead(null)
})

afterEach(() => {
  Object.defineProperty(window.navigator, 'clipboard', { value: undefined, configurable: true })
})

describe('ScanPage — 클립보드 붙여넣기', () => {
  it('이미지를 붙여넣으면 스캔이 시작된다', async () => {
    render(<ScanPage onRegistered={() => {}} />)
    await pasteAndRead([pngFile()])
    await waitFor(() => expect(analyzeCalls()).toHaveLength(1))
  })

  it('붙여넣기로 들어온 스캔은 source 가 clipboard 로 기록된다', async () => {
    // 하드코딩된 'photo' 하나로는 이 기능이 쓰이는지 영영 알 수 없었다.
    render(<ScanPage onRegistered={() => {}} />)
    await pasteAndRead([pngFile()])
    await waitFor(() => expect(eventCalls('scan')).toHaveLength(1))
    const meta = (eventCalls('scan')[0][1] as { metadata: { source: string } }).metadata
    expect(meta.source).toBe('clipboard')
  })

  it('클립보드에 이미지가 없으면 그렇다고 알려준다', async () => {
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.paste(document.body, { clipboardData: { files: [], items: [], types: ['text/plain'] } })
    expect(await screen.findByText('클립보드에 이미지가 없어요.')).toBeTruthy()
    expect(analyzeCalls()).toHaveLength(0)
  })

  it('클립보드가 아예 비었으면 조용히 넘어간다', () => {
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.paste(document.body, { clipboardData: { files: [], items: [], types: [] } })
    expect(screen.queryByText('클립보드에 이미지가 없어요.')).toBeNull()
    expect(analyzeCalls()).toHaveLength(0)
  })

  it('스캔 중에는 새 스캔을 시작하지 않고 왜 안 되는지 말해준다', async () => {
    // 침묵이 최악이다. 9~12초짜리 스캔 중이 ⌘V 를 가장 누르기 쉬운 순간이다.
    routePost(() => new Promise(() => {}))
    render(<ScanPage onRegistered={() => {}} />)
    await pasteAndRead([pngFile()])
    await waitFor(() => expect(analyzeCalls()).toHaveLength(1))

    fireEvent.paste(document.body, { clipboardData: { files: [pngFile('b.png')], items: [], types: ['Files'] } })
    expect(await screen.findByText('읽는 중이에요. 끝난 뒤에 붙여넣어 주세요.')).toBeTruthy()
    expect(analyzeCalls()).toHaveLength(1)
  })

  it('결과 모달이 열려 있으면 새 스캔을 시작하지 않는다', async () => {
    render(<ScanPage onRegistered={() => {}} />)
    await pasteAndRead([pngFile()])
    await waitFor(() => expect(analyzeCalls()).toHaveLength(1))
    // 결과 모달이 떴는지 확인
    expect(await screen.findByText('두부')).toBeTruthy()

    fireEvent.paste(document.body, { clipboardData: { files: [pngFile('b.png')], items: [], types: ['Files'] } })
    await new Promise((r) => setTimeout(r, 0))
    expect(analyzeCalls()).toHaveLength(1)
  })

  it('입력칸에서 붙여넣으면 가로채지 않는다', async () => {
    // 결과 모달의 이름·수량 입력칸에서 붙여넣는 중이면 그쪽이 임자다.
    render(<ScanPage onRegistered={() => {}} />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.paste(input, { clipboardData: { files: [pngFile()], items: [], types: ['Files'] } })
    await new Promise((r) => setTimeout(r, 0))
    expect(analyzeCalls()).toHaveLength(0)
    input.remove()
  })

  it('0건이 나온 뒤 같은 이미지를 다시 붙여넣을 수 있다', async () => {
    // "식재료를 찾지 못했어요. 글자가 잘 보이게 다시 찍어주세요" 는 재시도를 시키는
    // 문구다. 중복 가드가 여기서 안 풀리면 안내와 가드가 서로 모순되고, 사용자는
    // 새로고침 말고는 빠져나갈 방법이 없다.
    routePost(EMPTY_SCAN)
    render(<ScanPage onRegistered={() => {}} />)
    await pasteAndRead([pngFile()])
    await waitFor(() => expect(analyzeCalls()).toHaveLength(1))
    await screen.findByText('식재료를 찾지 못했어요. 글자가 잘 보이게 다시 찍어주세요.')

    await pasteAndRead([pngFile()])
    await waitFor(() => expect(analyzeCalls()).toHaveLength(2))
    expect(screen.queryByText('방금 붙여넣은 이미지예요.')).toBeNull()
  })

  it('이미 결과를 본 이미지를 또 붙여넣으면 Gemini 를 다시 부르지 않는다', async () => {
    // 여기가 중복 가드가 실제로 값을 하는 유일한 경우다 — 결과를 이미 본 이미지.
    // 무료 한도가 분당 20회라 같은 이미지로 두 번 태울 이유가 없다.
    render(<ScanPage onRegistered={() => {}} />)
    await pasteAndRead([pngFile()])
    await waitFor(() => expect(analyzeCalls()).toHaveLength(1))
    await screen.findByText('두부')

    fireEvent.keyDown(window, { key: 'Escape' })          // 결과 모달을 닫는다
    await waitFor(() => expect(screen.queryByText('두부')).toBeNull())

    // **서로 다른 File 객체**로 다시 붙여넣는다. 실제 ⌘V 가 그렇게 준다.
    fireEvent.paste(document.body, { clipboardData: { files: [pngFile()], items: [], types: ['Files'] } })
    expect(await screen.findByText('방금 붙여넣은 이미지예요.')).toBeTruthy()
    expect(analyzeCalls()).toHaveLength(1)
  })

  it('5장을 넘기면 상한 안내가 실제로 보인다', async () => {
    // 예전 코드에서는 handleCapture 의 setError(null) 이 이 문구를 즉시 지워서
    // **한 번도 보인 적이 없었다.** notice 로 넘겨서 같이 세운다.
    render(<ScanPage onRegistered={() => {}} />)
    const six = Array.from({ length: 6 }, (_, i) => pngFile(`s${i}.png`))
    await pasteAndRead(six)
    expect(await screen.findByText(/한 번에 5장까지 읽을 수 있어요/)).toBeTruthy()
    await waitFor(() => expect(analyzeCalls()).toHaveLength(5))
  })

  it('변환 못 하는 형식은 422 대신 고칠 수 있는 안내를 준다', async () => {
    // downscaleImage 는 실패해도 원본을 돌려주므로, canUpload 사후 검사가 유일한 방어선이다.
    // jsdom 에는 createImageBitmap 이 없어서 gif 는 항상 이 경로로 온다.
    render(<ScanPage onRegistered={() => {}} />)
    const gif = new File(['x'], 'a.gif', { type: 'image/gif' })
    await pasteAndRead([gif])
    expect(await screen.findByText(/JPG, PNG, WebP 로 저장한 뒤/)).toBeTruthy()
    expect(analyzeCalls()).toHaveLength(0)
  })

  it('2MB 를 넘으면 크기 문제라고 말한다 (새로고침하라고 하지 않는다)', async () => {
    render(<ScanPage onRegistered={() => {}} />)
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    await pasteAndRead([big])
    expect(await screen.findByText('이미지가 너무 커요. 화면을 나눠서 캡처해주세요.')).toBeTruthy()
    expect(screen.queryByText(/새로고침/)).toBeNull()
  })

  it('한 장이 변환에 실패해도 나머지는 읽는다', async () => {
    // "일부만 실패하면 성공한 것은 살린다" 는 이 앱의 기존 원칙이다.
    render(<ScanPage onRegistered={() => {}} />)
    const good = pngFile('good.png')
    const bad = new File(['x'], 'bad.gif', { type: 'image/gif' })
    await pasteAndRead([good, bad])
    await waitFor(() => expect(analyzeCalls()).toHaveLength(1))
    expect(await screen.findByText(/2장 중 1장은 읽을 수 없는 형식이에요/)).toBeTruthy()
  })

  it('실패한 뒤 같은 이미지를 다시 붙여넣을 수 있다', async () => {
    // 중복 가드가 실패 경로에서 안 풀리면 "다시 시도해주세요" 라고 해놓고
    // 다시 시도하면 "방금 붙여넣은 이미지예요" 가 뜬다. 영구 막다른 길이다.
    // analyzeReceipts 가 allSettled 라 장별 실패는 예외로 안 온다 —
    // 「전부 실패」 경로로 온다. 그래서 그쪽에서 실패를 기록하는지 함께 본다.
    routePost(() => Promise.reject({ response: { status: 503 } }))
    render(<ScanPage onRegistered={() => {}} />)
    await pasteAndRead([pngFile()])
    expect(await screen.findByText('사진을 읽지 못했어요. 다시 시도해주세요.')).toBeTruthy()
    expect(eventCalls('scan_failed')).toHaveLength(1)

    routePost(OK_SCAN)
    await pasteAndRead([pngFile()])
    await waitFor(() => expect(analyzeCalls()).toHaveLength(2))
    expect(screen.queryByText('방금 붙여넣은 이미지예요.')).toBeNull()
  })

  it('서버가 이유를 말하면 그 문구를 그대로 보여준다 (사진 탓으로 돌리지 않는다)', async () => {
    /* 실제로 프로덕션에서 났다 (2026-08-27 06:57 UTC).
       Smart Placement 가 Gemini 미지원 리전으로 옮겨가서 워커가
       503 «AI 기능이 일시적으로 중단됐어요» 를 정확히 돌려줬는데,
       allSettled 가 거절 사유를 버려서 화면에는 «사진을 읽지 못했어요» 가 떴다.
       사진 탓이 아닌데 사진 탓을 하니 사용자는 다시 찍는다 — 아무리 찍어도 안 된다. */
    routePost(() =>
      Promise.reject({
        response: { status: 503, data: { detail: 'AI 기능이 일시적으로 중단됐어요. 잠시 후 다시 시도해주세요.' } },
      }),
    )
    render(<ScanPage onRegistered={() => {}} />)
    await pasteAndRead([pngFile()])
    expect(await screen.findByText('AI 기능이 일시적으로 중단됐어요. 잠시 후 다시 시도해주세요.')).toBeTruthy()
    expect(screen.queryByText('사진을 읽지 못했어요. 다시 시도해주세요.')).toBeNull()
  })

  it('서버가 문구를 안 주면 기본 문구로 돌아간다 (네트워크 끊김 등)', async () => {
    routePost(() => Promise.reject({ message: 'Network Error' }))
    render(<ScanPage onRegistered={() => {}} />)
    await pasteAndRead([pngFile()])
    expect(await screen.findByText('사진을 읽지 못했어요. 다시 시도해주세요.')).toBeTruthy()
  })

  it('알림과 오류는 다른 배너를 쓴다 (DESIGN.md 5절)', async () => {
    // 「비어 있음」은 role=status 중립 배너, 「오류」는 role=alert 빨간 배너.
    // 문자열이 다른 것만으로는 5절을 만족하지 않는다 — 표시가 달라야 한다.
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.paste(document.body, { clipboardData: { files: [], items: [], types: ['text/plain'] } })
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('클립보드에 이미지가 없어요.')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('앨범에서 고르면 source 가 gallery 로 기록된다', async () => {
    const { container } = render(<ScanPage onRegistered={() => {}} />)
    const gallery = container.querySelectorAll('input[type=file]')[1] as HTMLInputElement
    Object.defineProperty(gallery, 'files', { value: [pngFile()], configurable: true })
    fireEvent.change(gallery)
    await waitFor(() => expect(eventCalls('scan')).toHaveLength(1))
    const meta = (eventCalls('scan')[0][1] as { metadata: { source: string } }).metadata
    expect(meta.source).toBe('gallery')
  })

  it('언마운트하면 리스너가 남지 않는다', async () => {
    const { unmount } = render(<ScanPage onRegistered={() => {}} />)
    unmount()
    fireEvent.paste(document.body, { clipboardData: { files: [pngFile()], items: [], types: ['Files'] } })
    await new Promise((r) => setTimeout(r, 0))
    expect(analyzeCalls()).toHaveLength(0)
  })
})

describe('ScanPage — 보내기 전 확인', () => {
  it('붙여넣으면 바로 안 보내고 무엇을 보낼지 보여준다', async () => {
    // 파일 선택창은 고를 때 눈으로 본다. ⌘V 는 안 보인다 — 은행 화면이 클립보드에
    // 있는 채로 오발하면 되돌릴 수 없다. 여기가 알아챌 수 있는 유일한 지점이다.
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.paste(document.body, { clipboardData: { files: [pngFile()], items: [], types: ['Files'] } })

    expect(await screen.findByText('이 이미지를 읽을까요?')).toBeTruthy()
    expect(screen.getByAltText('붙여넣은 이미지 1')).toBeTruthy()
    expect(analyzeCalls()).toHaveLength(0)   // 아직 아무것도 안 나갔다
  })

  it('여러 장이면 장수를 말한다', async () => {
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.paste(document.body, {
      clipboardData: { files: [pngFile('a.png'), pngFile('b.png')], items: [], types: ['Files'] },
    })
    expect(await screen.findByText('이 2장을 읽을까요?')).toBeTruthy()
  })

  it('취소하면 아무것도 보내지 않는다', async () => {
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.paste(document.body, { clipboardData: { files: [pngFile()], items: [], types: ['Files'] } })
    fireEvent.click(await screen.findByRole('button', { name: '취소' }))
    await new Promise((r) => setTimeout(r, 0))
    expect(analyzeCalls()).toHaveLength(0)
    expect(screen.queryByText('이 이미지를 읽을까요?')).toBeNull()
  })

  it('취소한 뒤 같은 이미지를 다시 붙여넣을 수 있다', async () => {
    // 취소가 곧 막다른 길이 되면 안 된다 — 중복 가드를 같이 풀어줘야 한다.
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.paste(document.body, { clipboardData: { files: [pngFile()], items: [], types: ['Files'] } })
    fireEvent.click(await screen.findByRole('button', { name: '취소' }))

    await pasteAndRead([pngFile()])
    await waitFor(() => expect(analyzeCalls()).toHaveLength(1))
    expect(screen.queryByText('방금 붙여넣은 이미지예요.')).toBeNull()
  })

  it('확인창이 떠 있는 동안 새 붙여넣기를 받지 않는다', async () => {
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.paste(document.body, { clipboardData: { files: [pngFile('a.png')], items: [], types: ['Files'] } })
    await screen.findByText('이 이미지를 읽을까요?')

    fireEvent.paste(document.body, { clipboardData: { files: [pngFile('b.png')], items: [], types: ['Files'] } })
    // 여전히 처음 것 하나만 대기 중이어야 한다
    expect(screen.getByAltText('붙여넣은 이미지 1')).toBeTruthy()
    expect(screen.queryByAltText('붙여넣은 이미지 2')).toBeNull()
  })

  it('파일 선택창으로 고른 것은 확인을 다시 묻지 않는다', async () => {
    // 선택창에서 이미 무엇을 보내는지 보고 골랐다. 두 번 묻는 건 마찰만 는다.
    const { container } = render(<ScanPage onRegistered={() => {}} />)
    const gallery = container.querySelectorAll('input[type=file]')[1] as HTMLInputElement
    Object.defineProperty(gallery, 'files', { value: [pngFile()], configurable: true })
    fireEvent.change(gallery)
    await waitFor(() => expect(analyzeCalls()).toHaveLength(1))
    expect(screen.queryByText('이 이미지를 읽을까요?')).toBeNull()
  })
})

describe('ScanPage — 붙여넣기 버튼', () => {
  it('클립보드 읽기를 지원하지 않으면 버튼을 그리지 않는다', () => {
    setClipboardRead(null)
    render(<ScanPage onRegistered={() => {}} />)
    expect(screen.queryByRole('button', { name: '붙여넣기' })).toBeNull()
    // 앨범 버튼은 그대로 있어야 한다.
    expect(screen.getByRole('button', { name: '앨범에서 선택' })).toBeTruthy()
  })

  it('지원하면 버튼이 보인다', () => {
    setClipboardRead(async () => [])
    render(<ScanPage onRegistered={() => {}} />)
    expect(screen.getByRole('button', { name: '붙여넣기' })).toBeTruthy()
  })

  it('권한을 거부하면 「읽지 못했어요」 — 「이미지가 없어요」와 다른 문구다', async () => {
    setClipboardRead(() => Promise.reject(new Error('NotAllowedError')))
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '붙여넣기' }))
    expect(await screen.findByText('클립보드를 읽지 못했어요.')).toBeTruthy()
    expect(screen.queryByText('클립보드에 이미지가 없어요.')).toBeNull()
  })

  it('클립보드에 이미지가 없으면 「이미지가 없어요」', async () => {
    setClipboardRead(async () => [{ types: ['text/plain'], getType: async () => new Blob(['hi']) }])
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '붙여넣기' }))
    expect(await screen.findByText('클립보드에 이미지가 없어요.')).toBeTruthy()
  })

  it('read() 가 클릭 핸들러의 첫 문장이다 (iOS 제스처 사슬)', () => {
    // 앞에 await 나 setState 가 끼면 WebKit 이 제스처 사슬을 끊고 iOS 는 100% 실패한다.
    // 동기적으로 호출됐는지를 본다 — await 없이 바로 단언한다.
    const read = vi.fn(async () => [])
    setClipboardRead(read)
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '붙여넣기' }))
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('클립보드 읽기 실패도 텔레메트리에 남는다', async () => {
    setClipboardRead(() => Promise.reject(new Error('NotAllowedError')))
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '붙여넣기' }))
    await screen.findByText('클립보드를 읽지 못했어요.')
    expect(eventCalls('scan_failed')).toHaveLength(1)
  })

  it('이미지가 있으면 스캔을 시작한다', async () => {
    setClipboardRead(async () => [{ types: ['image/png'], getType: async () => new Blob(['x']) }])
    render(<ScanPage onRegistered={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '붙여넣기' }))
    fireEvent.click(await screen.findByRole('button', { name: '읽을게요' }))
    await waitFor(() => expect(analyzeCalls()).toHaveLength(1))
  })
})

describe('ScanPage — 드래그 앤 드롭', () => {
  it('떨어뜨린 이미지로 스캔을 시작한다', async () => {
    // macOS 기본 캡처(⌘⇧3)는 클립보드가 아니라 바탕화면 파일이다.
    render(<ScanPage onRegistered={() => {}} />)
    const zone = screen.getByRole('button', { name: /여기를 눌러 영수증을 촬영하세요/ })
    fireEvent.drop(zone, { dataTransfer: { files: [pngFile()], items: [], types: ['Files'] } })
    fireEvent.click(await screen.findByRole('button', { name: '읽을게요' }))
    await waitFor(() => expect(analyzeCalls()).toHaveLength(1))
    const meta = (eventCalls('scan')[0][1] as { metadata: { source: string } }).metadata
    expect(meta.source).toBe('drop')
  })

  it('이미지가 아닌 것을 떨어뜨리면 알려준다', async () => {
    render(<ScanPage onRegistered={() => {}} />)
    const zone = screen.getByRole('button', { name: /여기를 눌러 영수증을 촬영하세요/ })
    fireEvent.drop(zone, { dataTransfer: { files: [], items: [], types: ['text/plain'] } })
    // 드롭에는 클립보드가 관여하지 않는다.
    expect(await screen.findByText('이미지 파일만 놓을 수 있어요.')).toBeTruthy()
    expect(screen.queryByText('클립보드에 이미지가 없어요.')).toBeNull()
    expect(analyzeCalls()).toHaveLength(0)
  })
})
