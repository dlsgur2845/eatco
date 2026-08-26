import { useCallback, useEffect, useRef, useState } from 'react'
import ScanLoader from '../components/motion/ScanLoader'
import { logEvent } from '../api/events'
import { MAX_SCAN_IMAGES, analyzeReceipts, registerItems, type ScannedItem } from '../api/scan'
import { prepareForUpload } from '../lib/image'
import {
  fileKey,
  filesFromClipboardItems,
  filesFromDataTransfer,
  pasteMessage,
  shouldIgnorePaste,
  takeUpToLimit,
  type ClipboardItemLike,
} from '../lib/clipboard-image'
import ResultsModal from '../components/scan/ResultsModal'

const PROGRESS_STEPS = ['사진을 읽고 있어요…', '식재료를 찾고 있어요…', '소비기한을 계산하고 있어요…']

/** 어느 입구로 들어왔는지. 하드코딩된 'photo' 하나로는 무엇이 쓰이는지 알 수 없었다. */
type ScanSource = 'photo' | 'gallery' | 'clipboard' | 'drop'

/**
 * 클립보드 읽기를 지원하는가.
 *
 * 어느 브라우저가 지원하는지 외워서 분기하지 않는다 — 기능 감지라 내 기억이 틀려도
 * 코드가 깨지지 않는다. 비보안 컨텍스트(예: 폰에서 http://<LAN-IP>:5173 으로 여는
 * 개발 서버)에서는 `navigator.clipboard` 자체가 없어서 버튼이 안 보인다. 버그가 아니다.
 */
function canReadClipboard(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'
}

interface Props {
  onRegistered: () => void
}

export default function ScanPage({ onRegistered }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const [items, setItems] = useState<ScannedItem[]>([])
  const [storeName, setStoreName] = useState<string | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)
  const [registeredCount, setRegisteredCount] = useState<number | null>(null)
  const [shotProgress, setShotProgress] = useState<{ done: number; total: number } | null>(null)
  const [partial, setPartial] = useState<string | null>(null)
  // 알림은 오류가 아니다. 예전에는 「5장까지만」·「방금 붙여넣은 이미지예요」가
  // 빨간 error 배너에 role="alert" 로 떴다 — DESIGN.md 5절이 금지하는, 정상 상태를
  // 오류로 보여주는 처리다. 중립 배너(role="status")로 따로 뺀다.
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  /**
   * 붙여넣기·드롭으로 들어온 이미지는 **보여주고 물어본 뒤** 보낸다.
   *
   * 파일 선택창은 사용자가 무엇을 고르는지 눈으로 보고 고른다. ⌘V 는 안 보인다 —
   * 은행 화면이나 비밀번호 관리자 스크린샷이 클립보드에 있는 채로 오발하면
   * 보기 전에 이미 Gemini 로 나간다. 되돌릴 수 없는 전송이라 한 번 세운다.
   */
  const [pending, setPending] = useState<{ files: File[]; source: ScanSource; notice: string | null } | null>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)
  // `scanning` 은 state 라 렌더 뒤에야 참이 된다. navigator.clipboard.read() 가
  // 권한 프롬프트에서 몇 초 멈춰 있는 동안 드롭이 들어오면 스캔이 **두 개** 돈다 —
  // abortRef 가 덮어써져서 취소가 앞 요청을 못 끊는다. 동기 ref 로 막는다.
  const busyRef = useRef(false)
  // 같은 이미지를 두 번 붙여넣는 것을 막는다. Gemini 무료 한도가 분당 20회라
  // 0건 나온 뒤 홧김에 ⌘V 를 연타하면 그게 그대로 호출이 된다.
  const lastAcceptedRef = useRef<string | null>(null)
  const [pasteSupported] = useState(canReadClipboard)

  const handleCapture = useCallback(async (files: File[], source: ScanSource, notice?: string | null) => {
    // 빈 배열로 들어오면 아래에서 total===0 && succeeded===0 이 되어 사용자에게
    // "사진을 읽지 못했어요" 라는 **틀린 문구**가 뜨고, logEvent 가 shots:0 으로
    // 새 계기판을 오염시킨다. 네 입구 전부를 여기서 한 번에 막는다.
    if (!files.length) return
    if (busyRef.current) return
    busyRef.current = true

    // notice 는 "5장까지만 읽을게요" 같은 **알림**이다. 여기서 같이 세우지 않으면
    // 아래 setError(null) 이 호출부가 방금 세운 문구를 즉시 지운다 —
    // 예전 코드가 정확히 그랬고, 그래서 상한 안내는 **한 번도 보인 적이 없다.**
    setError(null)
    setNotice(notice ?? null)
    setScanning(true)
    setProgressStep(0)

    setSlow(false)
    setPartial(null)
    setShotProgress(files.length > 1 ? { done: 0, total: files.length } : null)
    const controller = new AbortController()
    abortRef.current = controller
    const interval = setInterval(() => {
      setProgressStep(prev => Math.min(prev + 1, PROGRESS_STEPS.length - 1))
    }, 1800)
    // 10초 넘어가면 "멈췄나?" 를 없애준다. 실측 소요가 9초대라 대부분은 그 전에 끝난다.
    const slowTimer = setTimeout(() => setSlow(true), 10_000)

    try {
      // 업로드 전에 줄이고, 허용목록 밖 형식(gif·tiff·빈 MIME)은 JPEG 으로 바꾼다.
      // 동시 실행이 제한돼 있다 — 4K 5장을 한꺼번에 디코드하면 iOS 가 탭을 죽인다.
      const { ok, rejected } = await prepareForUpload(files)

      // 한 장이 변환에 실패해도 나머지는 살린다. 전부-아니면-전무로 굴면
      // 아래 부분 실패 처리(성공한 장은 살린다)와 원칙이 어긋난다.
      if (!ok.length) {
        // 재시도를 막지 않는다. 안 그러면 같은 이미지를 다시 붙여넣을 수 없다.
        lastAcceptedRef.current = null
        setError(
          rejected.some((r) => r.reason === 'too-big')
            ? '이미지가 너무 커요. 화면을 나눠서 캡처해주세요.'
            : '이 이미지는 읽을 수 없어요. JPG, PNG, WebP 로 저장한 뒤 다시 시도해주세요.',
        )
        return
      }
      if (rejected.length) {
        setPartial(files.length + '장 중 ' + rejected.length + '장은 읽을 수 없는 형식이에요. 나머지만 읽을게요.')
      }

      const result = await analyzeReceipts(
        ok,
        (done, total) => setShotProgress({ done, total }),
        controller.signal,
      )
      clearInterval(interval)
      clearTimeout(slowTimer)

      // 취소를 눌렀으면 결과를 띄우지 않는다. 예전에는 요청이 끝까지 가서
      // 취소한 **뒤에** 결과 모달이 튀어나왔다.
      if (controller.signal.aborted) {
        lastAcceptedRef.current = null
        return
      }

      // 일부만 실패했으면 성공한 것은 살리고 사실만 알린다. 사진 찍고
      // 기다린 결과를 전부 버리게 하면 안 된다.
      if (result.failed > 0 && result.succeeded > 0) {
        setPartial(result.attempted + '장 중 ' + result.failed + '장을 읽지 못했어요. 나머지 결과예요.')
      }

      if (result.total === 0) {
        // **재시도를 막지 않는다 — 양쪽 다.** 특히 "식재료를 찾지 못했어요. 다시 찍어주세요"
        // 는 재시도를 시키는 문구인데, 키를 남겨두면 다시 붙여넣었을 때
        // "방금 붙여넣은 이미지예요" 로 막힌다. 안내와 가드가 서로 모순된다.
        lastAcceptedRef.current = null

        if (result.succeeded === 0) {
          // **여기가 진짜 실패 경로다.** analyzeReceipts 는 allSettled 를 쓰므로
          // 장별 실패(503·타임아웃·네트워크)를 삼키고 resolve 한다 — 아래 catch 로는
          // 절대 오지 않는다. 실패를 catch 에만 기록하면 가장 흔한 실패를 통째로 놓친다.
          logEvent('scan_failed', { source, shots: result.attempted, reason: 'all_shots_failed' })
        }
        setError(
          result.succeeded === 0
            ? '사진을 읽지 못했어요. 다시 시도해주세요.'
            : '식재료를 찾지 못했어요. 글자가 잘 보이게 다시 찍어주세요.',
        )
        return
      }

      // 진짜로 뭔가 찾았을 때만 성공으로 센다. 위에서 찍으면 전부 실패한 스캔도
      // items_count:0 인 **성공**으로 기록돼 계기판이 "다들 잘 쓰는데 결과가 없다" 로 읽힌다.
      logEvent('scan', { source, shots: result.attempted, items_count: result.total })
      setNotice(null)
      setItems(result.items)
      setStoreName(result.store_name)
      setShowResults(true)
    } catch (err: unknown) {
      clearInterval(interval)
      clearTimeout(slowTimer)
      // 실패했으면 같은 이미지로 다시 시도할 수 있어야 한다. 이걸 안 지우면
      // "다시 시도해주세요" 라고 해놓고 다시 시도하면 "방금 붙여넣은 이미지예요" 가 뜬다.
      lastAcceptedRef.current = null
      if (controller.signal.aborted) return
      let msg = '읽기에 실패했어요. 다시 시도해주세요.'
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const resp = (err as { response?: { status?: number; data?: { detail?: string } } }).response
        if (resp?.status === 503 || resp?.status === 429) {
          msg = 'AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.'
        } else if (resp?.data?.detail && !resp.data.detail.includes('API') && !resp.data.detail.includes('{')) {
          msg = resp.data.detail
        }
      }
      // 실패도 남긴다. 성공만 기록하면 "아무도 안 씀" 과 "다들 썼는데 실패함" 을
      // 구분할 수 없다 — iOS 에서 제스처 사슬이 끊기면 후자가 100% 다.
      logEvent('scan_failed', { source, shots: files.length, reason: 'exception' })
      setError(msg)
    } finally {
      busyRef.current = false
      clearInterval(interval)
      clearTimeout(slowTimer)
      setScanning(false)
      setProgressStep(0)
      setSlow(false)
      setShotProgress(null)
    }
  }, [])

  /**
   * 네 입구(카메라·앨범·클립보드·드롭)의 공통 진입점.
   * 상한 검사와 그 문구가 여기 한 곳에만 있다.
   */
  const acceptFiles = useCallback((files: File[], source: ScanSource) => {
    if (!files.length) return
    const { taken, capped } = takeUpToLimit(files, MAX_SCAN_IMAGES)

    // 붙여넣기·드롭만 중복을 본다. 파일 선택은 사용자가 창에서 직접 고른 것이라
    // 같은 파일을 다시 골랐다면 진짜로 다시 하려는 것이다.
    if (source === 'clipboard' || source === 'drop') {
      const key = taken.map(fileKey).join(',')
      if (key === lastAcceptedRef.current) {
        setNotice(pasteMessage('duplicate'))
        return
      }
      lastAcceptedRef.current = key
    }

    const capMsg = pasteMessage('ok', { capped, limit: MAX_SCAN_IMAGES })

    // 파일 선택창(photo·gallery)은 고를 때 이미 봤다. 확인을 또 받지 않는다.
    if (source === 'clipboard' || source === 'drop') {
      setError(null)
      setNotice(null)
      setPending({ files: taken, source, notice: capMsg })
      return
    }
    handleCapture(taken, source, capMsg)
  }, [handleCapture])

  const confirmPending = useCallback(() => {
    if (!pending) return
    const { files, source, notice } = pending
    setPending(null)
    handleCapture(files, source, notice)
  }, [pending, handleCapture])

  const cancelPending = useCallback(() => {
    // 다시 붙여넣을 수 있어야 한다. 안 그러면 취소가 곧 막다른 길이 된다.
    lastAcceptedRef.current = null
    setPending(null)
  }, [])

  /**
   * 미리보기 URL 수명. 안 풀면 blob 이 페이지가 살아 있는 내내 메모리에 남는다.
   *
   * `<img src>` 로 여는 SVG 는 브라우저가 스크립트를 실행하지 않는다(이미지 컨텍스트).
   * 그래서 image/* 를 넓게 받아도 여기서 XSS 가 생기지 않는다. DOM 에 넣거나
   * innerHTML 로 붙이면 이야기가 달라지므로 그러지 않는다.
   */
  useEffect(() => {
    if (!pending) {
      setPreviews([])
      return
    }
    const urls = pending.files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [pending])

  /**
   * 화면을 떠날 때 진행 중인 스캔을 끊는다.
   *
   * 없으면 탭을 옮겨도 Gemini 호출 5건이 계속 살아 있고, 1.8초 타이머가 언마운트된
   * 컴포넌트에 setState 를 때린다. 무료 한도가 분당 20회라 버려지는 호출이 그냥 비용이다.
   */
  useEffect(() => () => abortRef.current?.abort(), [])

  /**
   * 창 어디에 놓든 브라우저 기본동작(그 파일로 이동)을 막는다.
   *
   * 드롭존을 빗맞히면 브라우저가 이미지 파일로 페이지를 **이동시킨다.** 홈화면에 설치된
   * PWA 는 주소창이 없어서 돌아올 방법이 없다 — DESIGN.md 9절이 `window.location.href`
   * 를 금지하는 것과 같은 종류의 사고다.
   */
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  /**
   * ⌘V / Ctrl+V.
   *
   * **리스너를 조건부로 등록하지 않는다.** 스캔 중에 등록을 건너뛰면 그 9~12초
   * 동안 ⌘V 가 완전히 무반응이 된다 — 이 계획이 없애려던 바로 그 침묵을,
   * 가장 누르기 쉬운 순간에 새로 만드는 셈이다. 항상 등록하고 안에서 판단한다.
   */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // 글자를 입력하는 중이면 그쪽이 임자다 (결과 모달의 이름·수량 입력칸).
      if (shouldIgnorePaste(e.target)) return

      if (scanning) {
        setNotice('읽는 중이에요. 끝난 뒤에 붙여넣어 주세요.')
        return
      }
      // registeredCount 는 등록 축하 오버레이가 떠 있는 500ms 를 막는다.
      // 그 사이 showResults 는 이미 false 라 상태만으로는 구멍이 난다.
      if (showResults || registeredCount !== null || pending) return

      const files = filesFromDataTransfer(e.clipboardData)
      if (!files.length) {
        // 클립보드가 아예 비었으면 조용히 넘어간다. 텍스트라도 있었다면 사용자는
        // 방금 ⌘V 를 눌렀고 무언가 일어나길 기대했으므로 알려준다.
        // 「비어 있음」이지 「오류」가 아니다. 사용자가 할 일은 "먼저 복사하기" 지
        // "다시 누르기" 가 아니다. DESIGN.md 5절이 둘을 같은 화면으로 처리하는 걸 금지한다.
        if (e.clipboardData?.types?.length) setNotice(pasteMessage('no-image'))
        return
      }
      // 실제로 파일을 소비할 때만 막는다.
      e.preventDefault()
      acceptFiles(files, 'clipboard')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [scanning, showResults, registeredCount, pending, acceptFiles])

  /**
   * 「클립보드에서 붙여넣기」 버튼.
   *
   * `navigator.clipboard.read()` 가 **이 함수의 첫 문장**이어야 한다.
   * WebKit 은 사용자 제스처와 같은 턴에서 호출되기를 요구해서, 앞에 `await` 나
   * 상태 변경이 하나라도 끼면 제스처 사슬이 끊기고 `NotAllowedError` 가 난다.
   * 그러면 iOS 사용자는 **100%** 실패를 보고 버튼이 고장난 줄 안다.
   */
  const handlePasteButton = useCallback(() => {
    const reading = navigator.clipboard.read()
    setError(null)
    setNotice(null)
    reading
      .then((items) => filesFromClipboardItems(items as unknown as ClipboardItemLike[]))
      .then((files) => {
        if (!files.length) {
          setNotice(pasteMessage('no-image'))
          return
        }
        acceptFiles(files, 'clipboard')
      })
      .catch(() => {
        // iOS 는 제스처 사슬이 끊기면 여기로 100% 온다. 남기지 않으면
        // "아무도 안 씀" 과 "다들 썼는데 실패함" 을 영영 구분할 수 없다.
        logEvent('scan_failed', { source: 'clipboard', shots: 0, reason: 'clipboard_read' })
        setError(pasteMessage('read-failed'))
      })
  }, [acceptFiles])

  const handleFileChange = (source: ScanSource) => (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFiles(Array.from(e.target.files ?? []), source)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (scanning) {
      setNotice('읽는 중이에요. 끝난 뒤에 놓아주세요.')
      return
    }
    if (showResults || registeredCount !== null || pending) return
    const files = filesFromDataTransfer(e.dataTransfer)
    if (!files.length) {
      setNotice(pasteMessage('drop-no-image'))
      return
    }
    acceptFiles(files, 'drop')
  }

  const handleRegister = async (finalItems: ScannedItem[]) => {
    setRegisterError(null)
    try {
      await registerItems(finalItems, storeName)
      logEvent('register', { items_count: finalItems.length, store: storeName })
      setShowResults(false)
      setItems([])
      // 사진 한 장으로 여러 개가 한 번에 들어가는, 이 앱에서 가장 기분 좋은
      // 순간이다. 500ms 만 붙잡는다. 이보다 길면 축하가 아니라 장애물이 된다.
      // 동작 줄이기면 CSS 전역 규칙이 애니메이션을 죽이지만 화면은 그대로
      // 500ms 떠 있다 — 성공했다는 사실 자체는 봐야 한다.
      setRegisteredCount(finalItems.length)
      setTimeout(() => {
        setRegisteredCount(null)
        onRegistered()
      }, 500)
    } catch {
      // 예전에는 setError 만 하고 showResults 를 유지해서, 에러 배너가
      // z-[100] 모달 **뒤에** 렌더됐다. 사용자 눈에는 아무 일도 안 일어난 것처럼
      // 보였고 버튼만 다시 활성화돼서 계속 눌렀다 (매 탭이 실제 POST).
      // 모달 안에서 보여준다.
      setRegisterError('추가하지 못했어요. 다시 시도해주세요.')
    }
  }

  return (
    <div className="flex flex-col items-center">
      <h1
        className="text-2xl font-bold tracking-tight mb-1"
        style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
      >
        식재료 등록
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-on-surface-variant)' }}>
        영수증이나 주문내역을 찍으면 자동으로 등록돼요
      </p>

      {registeredCount !== null && (
        <div
          className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-4 bg-surface/90 backdrop-blur-sm"
          role="status"
        >
          <div className="eatco-pop w-20 h-20 rounded-full bg-primary flex items-center justify-center">
            <span aria-hidden="true" className="material-symbols-outlined text-on-primary text-4xl">check</span>
          </div>
          <p className="font-headline font-bold text-xl text-on-surface">
            {registeredCount}개 담았어요
          </p>
        </div>
      )}

      {pending ? (
        // 보내기 전에 무엇을 보내는지 보여준다. 되돌릴 수 없는 전송이라
        // 사용자가 오발을 알아챌 수 있는 유일한 지점이다.
        <div
          role="group"
          aria-label="붙여넣은 이미지 확인"
          className="w-full py-6 px-4 rounded-2xl flex flex-col items-center gap-4"
          style={{ backgroundColor: 'var(--color-surface-container-low)' }}
        >
          <div className="flex flex-wrap justify-center gap-2">
            {previews.map((url, i) => (
              <img
                key={url}
                src={url}
                alt={`붙여넣은 이미지 ${i + 1}`}
                className="w-24 h-24 object-cover rounded-xl"
                style={{ backgroundColor: 'var(--color-surface-container-high)' }}
              />
            ))}
          </div>
          <p className="text-sm text-center" style={{ color: 'var(--color-on-surface)' }}>
            {pending.files.length > 1
              ? `이 ${pending.files.length}장을 읽을까요?`
              : '이 이미지를 읽을까요?'}
          </p>
          <div className="w-full grid grid-cols-2 gap-3">
            <button
              className="min-w-0 min-h-[48px] rounded-full text-sm font-medium"
              style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
              onClick={cancelPending}
            >
              취소
            </button>
            <button
              className="min-w-0 min-h-[48px] rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
              onClick={confirmPending}
            >
              읽을게요
            </button>
          </div>
        </div>
      ) : scanning ? (
        <div
          className="w-full py-16 rounded-2xl flex flex-col items-center justify-center gap-4"
          style={{ backgroundColor: 'var(--color-surface-container-low)' }}
        >
          {/* 진행률을 그리지 않는다. Gemini 는 진행률을 알려주지 않고, 예전에
              가짜 퍼센트가 2.4초에 100% 로 멈춰서 사용자가 스캔을 취소했다.
              대신 "지금 읽고 있다"를 보여준다. canvas 를 못 쓰는 기기에서는
              ScanLoader 가 알아서 기존 불확정 막대로 되돌아간다. */}
          <ScanLoader
            label={
              shotProgress && shotProgress.total > 1
                ? shotProgress.total + '장 중 ' + shotProgress.done + '장 읽었어요'
                : PROGRESS_STEPS[progressStep]
            }
          />
          {slow && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                조금 오래 걸리고 있어요. 잠시만요.
              </p>
              <button
                onClick={() => { abortRef.current?.abort(); setScanning(false); setSlow(false) }}
                className="px-5 min-h-[48px] inline-flex items-center justify-center rounded-full text-sm font-medium"
                style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
              >
                취소
              </button>
            </div>
          )}
        </div>
      ) : (
        // py-16 이었다. 설치형 PWA 의 세로 예산(390×844 에서 콘텐츠 614px)을 재보니
        // 도움말 문구가 화면 밖으로 밀려 있었다. 이 영역은 폰에서 아무 일도 안 하는
        // 장식에 가까운데 페이지의 43% 를 먹고 있었다.
        <div
          role="button"
          tabIndex={0}
          className="w-full py-8 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors"
          style={{
            backgroundColor: dragging
              ? 'var(--color-surface-container-high)'
              : 'var(--color-surface-container-low)',
          }}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={(e) => {
            // 자식(<span>)으로 들어갈 때도 부모에 dragleave 가 뜬다. relatedTarget 이
            // 아직 이 영역 안이면 무시한다 — 안 그러면 배경이 깜빡인다.
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
            setDragging(false)
          }}
          onDrop={handleDrop}
        >
          {/* opacity 를 뺐다. outline 토큰과 0.4 를 겹쳐 쓰면 실측 대비가 1.71:1 로,
              배경에 거의 묻힌다(TODOS 의 "빈 상태 아이콘이 거의 안 보인다").
              드롭존을 py-8 로 줄이면서 이 아이콘이 "여기 놓을 수 있다" 를 알리는
              유일한 시각 신호가 됐다. 토큰만 쓰면 4.6:1 이다. */}
          <span aria-hidden="true" className="material-symbols-outlined text-5xl" style={{ color: 'var(--color-outline)' }}>photo_camera</span>
          <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            {dragging ? '여기에 놓으세요' : '여기를 눌러 영수증을 촬영하세요'}
          </span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="w-full mt-4 px-4 py-3 rounded-xl text-sm"
          style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
        >
          {notice}
        </div>
      )}

      {partial && (
        <div
          role="status"
          className="w-full mt-4 px-4 py-3 rounded-xl text-sm"
          style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
        >
          {partial}
        </div>
      )}

      {error && (
        <div
          // status 가 아니라 alert 다. 사용자가 방금 ⌘V 나 버튼으로 **직접 유발한**
          // 오류라 즉시 읽혀야 한다. ResultsModal 도 alert 를 쓴다.
          role="alert"
          className="w-full mt-4 px-4 py-3 rounded-xl text-sm"
          style={{ backgroundColor: 'var(--color-error-container)', color: 'var(--color-error)' }}
        >
          {error}
        </div>
      )}

      {/* 카메라 촬영용 (모바일).
          accept 가 image/* 인 이유: 붙여넣기는 gif·tiff 를 받아 JPEG 으로 바꿔주는데
          파일 선택창만 3개 타입으로 막아두면 같은 파일을 붙여넣을 순 있어도 고를 순
          없는 이상한 상태가 된다. 진짜 판정은 downscaleImage 뒤의 canUpload 가 한다.
          multiple 이 있는 이유: 데스크톱에서는 capture 가 무시되므로 이 input 이
          주 CTA 의 파일 선택창이 된다. 없으면 한 장밖에 못 골랐다. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFileChange('photo')}
      />

      {/* 갤러리 업로드용 (카메라 없는 기기) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange('gallery')}
      />

      {/* 확인 중에는 감춘다. 확인 패널이 드롭존보다 124px 크기 때문에 그냥 두면
          하단 네비가 이 버튼을 덮고 아래 2단 행은 통째로 가려진다(실측 142px 넘침).
          그리고 초록 주버튼이 「읽을게요」와 둘이 동시에 뜨면 위계가 무너진다. */}
      {!pending && (
        <button
          className="w-full mt-6 py-4 rounded-full text-base font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
        >
          영수증 촬영하기
        </button>
      )}

      {/* 2차 동작 두 개는 같은 종류다 — 둘 다 **이미 있는 이미지**를 고른다.
          세로로 쌓으면 설치형 PWA 의 좁은 세로 예산(390×844 에서 콘텐츠 614px)을
          넘긴다. 가로로 묶으면 한 줄로 끝난다.
          문자열 조합으로 클래스를 만들지 않는다 — Tailwind v4 는 소스에 리터럴로
          존재하는 클래스만 생성한다. */}
      {!pending && (
        <>
        <div className={pasteSupported ? 'w-full mt-3 grid grid-cols-2 gap-3' : 'w-full mt-3 grid grid-cols-1'}>
          <button
            className="min-w-0 min-h-[48px] rounded-full text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)' }}
            onClick={() => galleryInputRef.current?.click()}
            disabled={scanning}
          >
            앨범에서 선택
          </button>
          {pasteSupported && (
            <button
              className="min-w-0 min-h-[48px] rounded-full text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)' }}
              onClick={handlePasteButton}
              disabled={scanning}
            >
              붙여넣기
            </button>
          )}
        </div>

        <p className="mt-3 text-xs" style={{ color: 'var(--color-outline)' }}>
          한 번에 {MAX_SCAN_IMAGES}장까지 · 마트 영수증과 쿠팡·마켓컬리 같은 주문내역 화면도 읽어요
        </p>
        </>
      )}

      {showResults && (
        <ResultsModal
          items={items}
          storeName={storeName}
          error={registerError}
          onConfirm={handleRegister}
          onClose={() => setShowResults(false)}
        />
      )}
    </div>
  )
}
