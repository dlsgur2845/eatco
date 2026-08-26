/**
 * 업로드 전에 이미지를 줄인다. 필요하면 **형식까지 바꾼다.**
 *
 * 왜 줄이나:
 * - 서버가 최대 2MB 를 받고 그대로 Gemini 로 넘긴다. base64 로 감싸면 ~1.3배가 되고,
 *   Workers 같은 CPU 예산이 빡빡한 런타임에서는 인코딩만으로 예산을 넘긴다.
 * - 모델은 어차피 큰 이미지를 내부적으로 다운샘플한다. 원본을 보내면 업로드 시간과
 *   토큰만 늘고 인식률은 오히려 나빠질 수 있다.
 * - 실측: 영수증 사진이 1600px/q0.75 에서 150~400KB 로 떨어진다.
 *
 * 왜 형식까지 바꾸나:
 * - 클립보드와 드래그앤드롭으로는 gif·tiff·bmp, 심지어 **MIME 이 빈 문자열인 File**
 *   이 들어온다. 워커는 jpeg/png/webp 만 받으므로 그대로 보내면 422 다.
 * - 예전에는 그런 걸 클라이언트에서 **거절**하려 했다. 그러면 사용자에게 막다른 길이
 *   된다 — 웹에서 「이미지 복사」한 gif 가 그 자리에서 죽는다.
 *   변환 수단(캔버스)이 이미 여기 있는데 거절하는 건 게으른 설계다.
 *   **거르지 말고 변환한다.**
 */

/**
 * 워커가 받는 타입. `worker/src/routes/scan.ts` 의 `ALLOWED_TYPES` 와 **같아야 한다.**
 * 한쪽만 고치면 클라이언트가 통과시킨 파일이 서버에서 422 로 죽는다.
 */
export const UPLOADABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const UPLOADABLE = new Set<string>(UPLOADABLE_TYPES)

/**
 * 워커 상한. `worker/src/routes/scan.ts` 의 `MAX_IMAGE_BYTES` 와 **같아야 한다.**
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

const MAX_EDGE = 1600
const QUALITY = 0.75

/**
 * JPEG 으로 강제 변환해야 하는 파일인가.
 *
 * 순수 함수로 빼둔 이유: jsdom 에는 `createImageBitmap` 이 없고
 * `canvas.getContext('2d')` 가 `null` 이라 **`downscaleImage` 는 테스트 환경에서
 * 항상 입력을 그대로 돌려준다.** 변환 자체는 자동 테스트가 불가능하다.
 * 그래서 최소한 "변환할지 말지 판단하는 규칙" 만이라도 테스트 가능하게 분리한다.
 */
export function needsReencode(file: File): boolean {
  return !UPLOADABLE.has(file.type)
}

/** 축소·변환을 마친 파일이 실제로 업로드 가능한 상태인가. */
export function canUpload(file: File): boolean {
  return UPLOADABLE.has(file.type) && file.size > 0 && file.size <= MAX_UPLOAD_BYTES
}

export async function downscaleImage(
  file: File,
  opts?: { forceEncode?: boolean },
): Promise<File> {
  // 허용목록 밖 타입(gif·tiff·bmp·빈 MIME…)은 자동으로 강제 변환 대상이 된다.
  // 호출부가 아무것도 안 넘겨도 앨범·카메라 경로가 같이 고쳐진다.
  const force = opts?.forceEncode ?? needsReencode(file)

  // force 일 때는 이 검사를 건너뛴다. 클립보드 File 은 `type` 이 빈 문자열인 경우가
  // 흔한데, 그걸 여기서 돌려보내면 워커가 422 를 던진다. 디코더가 바이트를 보고
  // 판단하게 둔다.
  if (!force && !file.type.startsWith('image/')) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // 디코드 실패. 원본을 그대로 돌려준다 — 여기서 던지지 않는 이유는 호출부가
    // `canUpload()` 로 사후 검사를 하기 때문이다. 이 함수는 최선을 다할 뿐
    // 성공을 보장하지 않는다.
    return file
  }

  const { width, height } = bitmap
  const longest = Math.max(width, height)
  // 이미 충분히 작으면 재인코딩하지 않는다 (화질만 손해).
  //
  // **force 일 때는 반드시 건너뛴다.** 웹에서 복사한 gif 는 보통 800×600 / 200KB 라
  // 이 조건에 딱 걸린다. 여기서 돌려보내면 형식이 gif 인 채로 나가서 422 다.
  // 변환이 필요한 파일의 절대다수가 이 줄을 지난다.
  if (!force && longest <= MAX_EDGE && file.size <= 1_500_000) {
    bitmap.close()
    return file
  }

  const scale = Math.min(1, MAX_EDGE / longest)
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  // drawImage 가 던지면(저사양 기기에서 4K 소스 OOM) close() 를 건너뛰어
  // 33MB 짜리 비트맵이 GC 될 때까지 떠 있게 된다. finally 로 묶는다.
  try {
    ctx.drawImage(bitmap, 0, 0, w, h)
  } finally {
    bitmap.close()
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY)
  )
  // WebKit 은 캔버스 메모리를 페이지 예산에 달아두고 늦게 회수한다. 명시적으로 놓는다.
  canvas.width = 0
  canvas.height = 0
  if (!blob) return file

  // 크기가 안 줄었으면 원본을 쓴다 — **단 force 가 아닐 때만.**
  //
  // 평면 색 UI 스크린샷(쿠팡·마켓컬리 주문내역이 정확히 그렇다)은 PNG·GIF 가
  // q0.75 JPEG 보다 작은 게 **정상**이다. force 인데 여기서 되돌리면 형식이
  // 원본 그대로 나가서 422 가 되고, 변환 기능 전체가 조용히 무효가 된다.
  if (!force && blob.size >= file.size) return file

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}


/**
 * 업로드 직전 준비 — 축소·변환하고, 못 쓰는 것을 걸러낸다.
 *
 * **동시 실행을 제한한다.** 4K 스크린샷 한 장이 디코드 중 33MB 를 잡는다. 5장을 한꺼번에
 * 열면 비트맵만 160MB 를 넘겨서 iOS 사파리가 탭을 죽인다. 네트워크 구간이 9~12초라
 * 준비 단계를 순차로 돌려도 사용자 눈에는 차이가 없다.
 *
 * **한 장이 실패해도 나머지를 버리지 않는다.** 이 앱은 이미 "일부만 실패하면 성공한 것은
 * 살린다" 는 원칙으로 여러 장 스캔을 처리한다(api/scan.ts 의 allSettled). 준비 단계만
 * 전부-아니면-전무로 굴면 그 원칙이 깨진다.
 */
export interface PreparedUpload {
  ok: File[]
  rejected: { name: string; reason: 'too-big' | 'unreadable' }[]
}

export async function prepareForUpload(files: File[], concurrency = 2): Promise<PreparedUpload> {
  const prepared: File[] = new Array(files.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= files.length) return
      prepared[i] = await downscaleImage(files[i])
    }
  })
  await Promise.all(workers)

  const ok: File[] = []
  const rejected: PreparedUpload['rejected'] = []
  prepared.forEach((f, i) => {
    if (canUpload(f)) ok.push(f)
    // **형식을 먼저 본다.** 크기로 먼저 가르면, 디코드 못 한 3MB HEIC 사진이
    // "너무 커요. 화면을 나눠서 캡처해주세요" 로 진단된다 — 사진을 찍은 사람에게
    // 화면 캡처를 나누라는, 따라 할 수 없는 안내다.
    else if (!UPLOADABLE.has(f.type)) rejected.push({ name: files[i].name, reason: 'unreadable' })
    else rejected.push({ name: files[i].name, reason: 'too-big' })
  })
  return { ok, rejected }
}
