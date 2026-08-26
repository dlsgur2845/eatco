/**
 * 클립보드·드래그앤드롭에서 이미지 File 을 꺼낸다.
 *
 * **왜 컴포넌트가 아니라 여기에 있나.** jsdom 에는 `ClipboardEvent.clipboardData` 도
 * `navigator.clipboard.read` 도 `ClipboardItem` 도 없다. 이 로직이 `ScanPage` 안에
 * 있으면 테스트할 방법이 아예 없다. `lib/recipe-search.ts` 를 뺐던 것과 같은 이유다.
 *
 * **타입으로 거르지 않는다.** 여기서 하는 일은 "이미지처럼 생긴 것을 꺼내오기" 까지다.
 * gif 든 tiff 든 MIME 이 비었든 일단 통과시키고, 형식 변환은 `lib/image.ts` 의
 * `downscaleImage` 가, 최종 판정은 `canUpload` 가 한다. 거르면 막다른 길이 되고
 * 변환하면 성공이 된다.
 */

/** 붙여넣기를 무시해야 하는 대상인가 (사용자가 글자를 입력하는 중). */
export function shouldIgnorePaste(target: EventTarget | null): boolean {
  // `target?.closest(...)` 로 쓰면 안 된다. 옵셔널 체이닝은 target 이 null 인 경우만
  // 지켜주고, target 이 `document` 나 `window` 일 때(둘 다 non-null 인데 `closest` 가
  // 없다) `undefined is not a function` 으로 **던진다.** window 리스너 안에서 던지면
  // 잡아줄 곳이 없다.
  if (!(target instanceof Element)) return false
  // `[contenteditable]` 만 쓰면 `contenteditable="false"` 도 잡힌다 — 편집 대상이
  // 아닌 것을 편집 대상으로 오인한다.
  return target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])') !== null
}

/** 이미지로 볼 만한 File 인가. 빈 MIME 도 통과시킨다 — 디코더가 판단하게 둔다. */
function looksLikeImage(f: File | null): f is File {
  if (!f) return false
  if (f.size === 0) return false
  // 빈 문자열이면 클립보드가 타입을 안 준 것이다. `downscaleImage` 가 바이트를 보고
  // 판단한다. 반대로 `text/plain` 처럼 명확히 이미지가 아닌 것만 걷어낸다.
  return f.type === '' || f.type.startsWith('image/')
}

/**
 * `paste` 이벤트와 `drop` 이벤트의 DataTransfer 에서 File 을 꺼낸다.
 *
 * **`files` 와 `items` 는 합집합이 아니라 폴백이다.** 둘은 같은 내용물을 다르게
 * 표현한 것이라, 합치면 한 장이 두 장이 된다. 그러면 `mergeScans` 가 서로 다른
 * "장" 에서 온 중복으로 보고 `duplicate_count: 2` 를 붙여서, 한 번 붙여넣었을 뿐인데
 * 결과 목록 모든 줄에 「2장 중복」 배지가 뜬다.
 */
export function filesFromDataTransfer(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return []

  const fromFiles = Array.from(dt.files ?? []).filter(looksLikeImage)
  if (fromFiles.length) return fromFiles

  // `files` 가 비어 있을 때만 본다. `getAsFile()` 은 null 을 돌려줄 수 있고,
  // 그 null 을 그대로 흘리면 `downscaleImage` 가 TypeError 로 죽는다.
  if (!dt.items) return []
  return Array.from(dt.items)
    .filter((i) => i.kind === 'file')
    .map((i) => i.getAsFile())
    .filter(looksLikeImage)
}

/**
 * `navigator.clipboard.read()` 결과에서 File 을 꺼낸다.
 *
 * `ClipboardItem` 을 `instanceof` 로 확인하지 않는다 — jsdom 에도 미지원 브라우저에도
 * 그 전역이 없어서 **프로덕션 ReferenceError** 가 된다. 구조로만 다룬다.
 */
export interface ClipboardItemLike {
  readonly types: readonly string[]
  getType(type: string): Promise<Blob>
}

export async function filesFromClipboardItems(items: readonly ClipboardItemLike[]): Promise<File[]> {
  const out: File[] = []
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (!type) continue
    try {
      const blob = await item.getType(type)
      if (blob.size === 0) continue
      out.push(new File([blob], `clipboard.${type.slice('image/'.length) || 'bin'}`, { type }))
    } catch {
      // 이 항목만 건너뛴다. 한 장이 실패해도 나머지는 살린다.
    }
  }
  return out
}

/** 상한까지만 취한다. 세 입력 경로가 전부 이걸 쓴다 — 문구도 한 곳에서만 만든다. */
export function takeUpToLimit<T>(files: T[], limit: number): { taken: T[]; capped: boolean } {
  return { taken: files.slice(0, limit), capped: files.length > limit }
}

/**
 * 같은 이미지를 또 붙여넣었는지 판정하는 키.
 *
 * **`lastModified` 를 쓰지 않는다.** `new File(bits, name, {type})` 은 스펙상
 * `lastModified` 를 **생성 시각**으로 채운다. 클립보드를 두 번 읽으면 같은 이미지라도
 * 매번 새 타임스탬프가 찍혀서, 그걸 키에 넣으면 중복 판정이 **영원히 참이 되지 않는다.**
 * 실제로 그랬다 — 테스트는 File 객체 하나를 재사용해서 통과하고 있었을 뿐이다.
 */
export function fileKey(f: File): string {
  return `${f.name}|${f.size}|${f.type}`
}

export type PasteOutcome = 'ok' | 'no-image' | 'drop-no-image' | 'read-failed' | 'duplicate'

/**
 * 사용자에게 보일 문구. `null` 이면 아무 말도 하지 않는다.
 *
 * **「비어 있음」과 「오류」를 절대 같은 문구로 만들지 않는다** (DESIGN.md 5절).
 * 클립보드가 비었으면 사용자가 할 일은 "먼저 복사하기" 고, 못 읽었으면 "다시 누르기"다.
 */
export function pasteMessage(
  outcome: PasteOutcome,
  opts?: { capped?: boolean; limit?: number },
): string | null {
  switch (outcome) {
    case 'no-image':
      return '클립보드에 이미지가 없어요.'
    case 'drop-no-image':
      // 드롭에는 클립보드가 관여하지 않는다. 같은 문구를 쓰면 거짓말이 된다.
      return '이미지 파일만 놓을 수 있어요.'
    case 'read-failed':
      return '클립보드를 읽지 못했어요.'
    case 'duplicate':
      return '방금 붙여넣은 이미지예요.'
    case 'ok':
      return opts?.capped
        ? `한 번에 ${opts.limit}장까지 읽을 수 있어요. 앞의 ${opts.limit}장만 읽을게요.`
        : null
  }
}
