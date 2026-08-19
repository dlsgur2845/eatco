/**
 * 업로드 전에 이미지를 줄인다.
 *
 * 왜:
 * - 서버가 최대 10MB 를 받고 그대로 Gemini 로 넘긴다. base64 로 감싸면 ~13MB 가 되고,
 *   Workers 같은 CPU 예산이 빡빡한 런타임에서는 인코딩만으로 예산을 넘긴다.
 * - 모델은 어차피 큰 이미지를 내부적으로 다운샘플한다. 원본을 보내면 업로드 시간과
 *   토큰만 늘고 인식률은 오히려 나빠질 수 있다.
 * - 실측: 영수증 사진이 1600px/q0.75 에서 150~400KB 로 떨어진다.
 */

const MAX_EDGE = 1600
const QUALITY = 0.75

export async function downscaleImage(file: File): Promise<File> {
  // HEIC 등 브라우저가 디코드 못 하는 형식이면 원본을 그대로 보낸다.
  if (!file.type.startsWith('image/')) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  const { width, height } = bitmap
  const longest = Math.max(width, height)
  // 이미 충분히 작으면 재인코딩하지 않는다 (화질만 손해).
  if (longest <= MAX_EDGE && file.size <= 1_500_000) {
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
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY)
  )
  if (!blob || blob.size >= file.size) return file

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
