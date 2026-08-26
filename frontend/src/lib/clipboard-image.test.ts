import { describe, expect, it } from 'vitest'
import {
  fileKey,
  filesFromClipboardItems,
  filesFromDataTransfer,
  pasteMessage,
  shouldIgnorePaste,
  takeUpToLimit,
  type ClipboardItemLike,
} from './clipboard-image'

function img(name = 'a.png', type = 'image/png', bytes = 'x'): File {
  return new File([bytes], name, { type })
}

/** jsdom 에는 DataTransfer 가 없다. 이 함수들이 실제로 읽는 모양만 흉내낸다. */
function dt(parts: { files?: File[]; items?: { kind: string; file: File | null }[] }) {
  return {
    files: parts.files ?? [],
    items: parts.items?.map((i) => ({ kind: i.kind, getAsFile: () => i.file })),
  } as unknown as DataTransfer
}

describe('filesFromDataTransfer', () => {
  it('null 이면 빈 배열', () => {
    expect(filesFromDataTransfer(null)).toEqual([])
    expect(filesFromDataTransfer(undefined)).toEqual([])
  })

  it('아무것도 없으면 빈 배열', () => {
    expect(filesFromDataTransfer(dt({}))).toEqual([])
  })

  it('텍스트만 있으면 빈 배열', () => {
    expect(filesFromDataTransfer(dt({ items: [{ kind: 'string', file: null }] }))).toEqual([])
  })

  it('files 에서 이미지를 꺼낸다', () => {
    expect(filesFromDataTransfer(dt({ files: [img()] }))).toHaveLength(1)
  })

  it('여러 장의 순서를 유지한다', () => {
    const got = filesFromDataTransfer(dt({ files: [img('1.png'), img('2.png'), img('3.png')] }))
    expect(got.map((f) => f.name)).toEqual(['1.png', '2.png', '3.png'])
  })

  it('files 가 비었을 때만 items 를 본다 (폴백)', () => {
    const got = filesFromDataTransfer(dt({ files: [], items: [{ kind: 'file', file: img() }] }))
    expect(got).toHaveLength(1)
  })

  it('files 와 items 를 합치지 않는다 — 합치면 한 장이 두 장이 된다', () => {
    // 브라우저는 같은 내용물을 양쪽에 다 채운다. 합집합으로 읽으면 한 번 붙여넣은
    // 스크린샷이 두 장이 되고, mergeScans 가 「2장 중복」 배지를 붙여버린다.
    const one = img()
    const got = filesFromDataTransfer(dt({ files: [one], items: [{ kind: 'file', file: one }] }))
    expect(got).toHaveLength(1)
  })

  it('getAsFile() 이 null 이어도 죽지 않는다', () => {
    expect(filesFromDataTransfer(dt({ items: [{ kind: 'file', file: null }] }))).toEqual([])
  })

  it('0바이트 파일은 거른다', () => {
    // 워커의 검증(타입·크기 상한)을 전부 통과해서 그대로 Gemini 로 간다.
    const empty = new File([], 'empty.png', { type: 'image/png' })
    expect(empty.size).toBe(0)
    expect(filesFromDataTransfer(dt({ files: [empty] }))).toEqual([])
  })

  it('이미지가 아닌 File 은 거른다', () => {
    expect(filesFromDataTransfer(dt({ files: [img('a.txt', 'text/plain')] }))).toEqual([])
  })

  it('gif 는 거르지 않는다 — 거절 대상이 아니라 변환 대상이다', () => {
    expect(filesFromDataTransfer(dt({ files: [img('a.gif', 'image/gif')] }))).toHaveLength(1)
  })

  it('MIME 이 빈 문자열이어도 통과시킨다 — 디코더가 판단한다', () => {
    expect(filesFromDataTransfer(dt({ files: [img('a', '')] }))).toHaveLength(1)
  })
})

describe('filesFromClipboardItems', () => {
  const item = (types: string[], blob: Blob | Error = new Blob(['x'])): ClipboardItemLike => ({
    types,
    getType: async () => {
      if (blob instanceof Error) throw blob
      return blob
    },
  })

  it('빈 배열', async () => {
    expect(await filesFromClipboardItems([])).toEqual([])
  })

  it('이미지 타입이 없으면 건너뛴다', async () => {
    expect(await filesFromClipboardItems([item(['text/plain'])])).toEqual([])
  })

  it('이미지를 File 로 만든다', async () => {
    const got = await filesFromClipboardItems([item(['image/png'])])
    expect(got).toHaveLength(1)
    expect(got[0].type).toBe('image/png')
  })

  it('혼합 타입에서 이미지만 고른다', async () => {
    const got = await filesFromClipboardItems([item(['text/plain', 'image/png'])])
    expect(got).toHaveLength(1)
  })

  it('한 항목이 실패해도 나머지는 살린다', async () => {
    const got = await filesFromClipboardItems([
      item(['image/png'], new Error('denied')),
      item(['image/png']),
    ])
    expect(got).toHaveLength(1)
  })

  it('0바이트 blob 은 거른다', async () => {
    expect(await filesFromClipboardItems([item(['image/png'], new Blob([]))])).toEqual([])
  })
})

describe('takeUpToLimit', () => {
  it('0장', () => {
    expect(takeUpToLimit([], 5)).toEqual({ taken: [], capped: false })
  })
  it('상한 미만', () => {
    expect(takeUpToLimit([1, 2, 3], 5)).toEqual({ taken: [1, 2, 3], capped: false })
  })
  it('정확히 상한이면 capped 가 아니다', () => {
    expect(takeUpToLimit([1, 2, 3, 4, 5], 5).capped).toBe(false)
  })
  it('상한 초과는 앞에서 자르고 capped', () => {
    const got = takeUpToLimit([1, 2, 3, 4, 5, 6, 7], 5)
    expect(got.taken).toEqual([1, 2, 3, 4, 5])
    expect(got.capped).toBe(true)
  })
})

describe('shouldIgnorePaste', () => {
  it('null 은 무시하지 않는다', () => {
    expect(shouldIgnorePaste(null)).toBe(false)
  })

  it('document 와 window 에서 던지지 않는다', () => {
    // `target?.closest(...)` 로 쓰면 여기서 TypeError 가 난다 — 옵셔널 체이닝은
    // target 이 null 인 경우만 지켜주고, closest 가 없는 non-null 객체는 못 지킨다.
    expect(() => shouldIgnorePaste(document)).not.toThrow()
    expect(() => shouldIgnorePaste(window)).not.toThrow()
    expect(shouldIgnorePaste(document)).toBe(false)
    expect(shouldIgnorePaste(window)).toBe(false)
  })

  it('body 는 무시하지 않는다', () => {
    expect(shouldIgnorePaste(document.body)).toBe(false)
  })

  it('input 은 무시한다', () => {
    const el = document.createElement('input')
    document.body.appendChild(el)
    expect(shouldIgnorePaste(el)).toBe(true)
    el.remove()
  })

  it('textarea 는 무시한다', () => {
    const el = document.createElement('textarea')
    document.body.appendChild(el)
    expect(shouldIgnorePaste(el)).toBe(true)
    el.remove()
  })

  it('input 안쪽 자손에서도 무시한다', () => {
    const wrap = document.createElement('div')
    wrap.innerHTML = '<label><span>이름</span><input /></label>'
    document.body.appendChild(wrap)
    expect(shouldIgnorePaste(wrap.querySelector('input'))).toBe(true)
    wrap.remove()
  })

  it('contenteditable 은 무시한다', () => {
    const el = document.createElement('div')
    el.setAttribute('contenteditable', 'true')
    document.body.appendChild(el)
    expect(shouldIgnorePaste(el)).toBe(true)
    el.remove()
  })

  it('contenteditable="false" 는 무시하지 않는다', () => {
    const el = document.createElement('div')
    el.setAttribute('contenteditable', 'false')
    document.body.appendChild(el)
    expect(shouldIgnorePaste(el)).toBe(false)
    el.remove()
  })
})

describe('pasteMessage', () => {
  it('비어 있음과 오류는 서로 다른 문구다', () => {
    // DESIGN.md 5절: 「비어 있음」과 「오류」를 절대 같은 화면으로 처리하지 않는다.
    // 사용자가 할 행동이 다르다 — 먼저 복사하기 vs 다시 누르기.
    const empty = pasteMessage('no-image')
    const failed = pasteMessage('read-failed')
    expect(empty).toBeTruthy()
    expect(failed).toBeTruthy()
    expect(empty).not.toBe(failed)
  })

  it('중복은 또 다른 문구다', () => {
    expect(pasteMessage('duplicate')).not.toBe(pasteMessage('no-image'))
  })

  it('정상이면 아무 말도 하지 않는다', () => {
    expect(pasteMessage('ok')).toBeNull()
    expect(pasteMessage('ok', { capped: false, limit: 5 })).toBeNull()
  })

  it('상한을 넘으면 몇 장만 읽는지 알려준다', () => {
    expect(pasteMessage('ok', { capped: true, limit: 5 })).toContain('5장')
  })
})

describe('fileKey', () => {
  it('**서로 다른 File 객체**라도 같은 이미지면 같은 키다', async () => {
    // 이게 이 함수의 존재 이유다. 예전 키는 lastModified 를 포함했고,
    // `new File(...)` 은 그걸 **생성 시각**으로 채운다 — 그래서 클립보드를 두 번 읽으면
    // 같은 이미지인데도 키가 달라져서 중복 판정이 **한 번도 참이 되지 않았다.**
    // 예전 테스트는 File 객체 하나를 재사용해서 이 버그를 못 봤다.
    const a = img()
    await new Promise((r) => setTimeout(r, 5))
    const b = img()
    expect(a.lastModified).not.toBe(b.lastModified)   // 진짜로 다른 객체다
    expect(fileKey(a)).toBe(fileKey(b))               // 그래도 같은 키여야 한다
  })

  it('이름이 다르면 다른 키', () => {
    expect(fileKey(img('a.png'))).not.toBe(fileKey(img('b.png')))
  })

  it('크기가 다르면 다른 키', () => {
    expect(fileKey(img('a.png', 'image/png', 'x'))).not.toBe(fileKey(img('a.png', 'image/png', 'xxxx')))
  })
})

describe('pasteMessage — 드롭은 클립보드가 아니다', () => {
  it('드롭 실패 문구가 클립보드를 언급하지 않는다', () => {
    const drop = pasteMessage('drop-no-image')!
    expect(drop).not.toContain('클립보드')
    expect(drop).not.toBe(pasteMessage('no-image'))
  })
})
