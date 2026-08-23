import { useCallback, useRef, useState } from 'react'
import ScanLoader from '../components/motion/ScanLoader'
import { logEvent } from '../api/events'
import { MAX_SCAN_IMAGES, analyzeReceipts, registerItems, type ScannedItem } from '../api/scan'
import { downscaleImage } from '../lib/image'
import ResultsModal from '../components/scan/ResultsModal'

const PROGRESS_STEPS = ['사진을 읽고 있어요…', '식재료를 찾고 있어요…', '소비기한을 계산하고 있어요…']

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
  const abortRef = useRef<AbortController | null>(null)

  const handleCapture = useCallback(async (files: File[]) => {
    setError(null)
    setScanning(true)
    setProgressStep(0)

    setSlow(false)
    setPartial(null)
    setShotProgress(files.length > 1 ? { done: 0, total: files.length } : null)
    abortRef.current = new AbortController()
    const interval = setInterval(() => {
      setProgressStep(prev => Math.min(prev + 1, PROGRESS_STEPS.length - 1))
    }, 1800)
    // 10초 넘어가면 "멈췄나?" 를 없애준다. 실측 소요가 9초대라 대부분은 그 전에 끝난다.
    const slowTimer = setTimeout(() => setSlow(true), 10_000)

    try {
      // 업로드 전에 줄인다. 원본 그대로 보내면 업로드가 느리고 토큰만 늘어난다.
      const prepared = await Promise.all(files.map((f) => downscaleImage(f)))
      const result = await analyzeReceipts(prepared, (done, total) =>
        setShotProgress({ done, total }),
      )
      clearInterval(interval)
      clearTimeout(slowTimer)

      logEvent('scan', { source: 'photo', shots: result.attempted, items_count: result.total })

      // 일부만 실패했으면 성공한 것은 살리고 사실만 알린다. 사진 찍고
      // 기다린 결과를 전부 버리게 하면 안 된다.
      if (result.failed > 0 && result.succeeded > 0) {
        setPartial(result.attempted + '장 중 ' + result.failed + '장을 읽지 못했어요. 나머지 결과예요.')
      }

      if (result.total === 0) {
        setError(
          result.succeeded === 0
            ? '사진을 읽지 못했어요. 다시 시도해주세요.'
            : '식재료를 찾지 못했어요. 글자가 잘 보이게 다시 찍어주세요.',
        )
        setScanning(false)
        return
      }

      setItems(result.items)
      setStoreName(result.store_name)
      setShowResults(true)
    } catch (err: unknown) {
      clearInterval(interval)
      clearTimeout(slowTimer)
      let msg = '읽기에 실패했어요. 다시 시도해주세요.'
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const resp = (err as { response?: { status?: number; data?: { detail?: string } } }).response
        if (resp?.status === 503 || resp?.status === 429) {
          msg = 'AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.'
        } else if (resp?.data?.detail && !resp.data.detail.includes('API') && !resp.data.detail.includes('{')) {
          msg = resp.data.detail
        }
      }
      setError(msg)
    } finally {
      clearInterval(interval)
      clearTimeout(slowTimer)
      setScanning(false)
      setProgressStep(0)
      setSlow(false)
      setShotProgress(null)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length) {
      if (picked.length > MAX_SCAN_IMAGES) {
        setError('한 번에 ' + MAX_SCAN_IMAGES + '장까지 읽을 수 있어요. 앞의 ' + MAX_SCAN_IMAGES + '장만 읽을게요.')
      }
      handleCapture(picked.slice(0, MAX_SCAN_IMAGES))
    }
    e.target.value = ''
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

      {scanning ? (
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
        <div
          className="w-full py-16 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer"
          style={{ backgroundColor: 'var(--color-surface-container-low)' }}
          onClick={() => fileInputRef.current?.click()}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-5xl" style={{ color: 'var(--color-outline)', opacity: 0.4 }}>photo_camera</span>
          <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            여기를 눌러 영수증을 촬영하세요
          </span>
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
          className="w-full mt-4 px-4 py-3 rounded-xl text-sm"
          style={{ backgroundColor: 'var(--color-error-container)', color: 'var(--color-error)' }}
        >
          {error}
        </div>
      )}

      {/* 카메라 촬영용 (모바일) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 갤러리 업로드용 (카메라 없는 기기) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        className="w-full mt-6 py-4 rounded-full text-base font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-primary)' }}
        onClick={() => fileInputRef.current?.click()}
        disabled={scanning}
      >
        영수증 촬영하기
      </button>

      <button
        className="w-full mt-3 min-h-[48px] rounded-full text-sm font-medium disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)' }}
        onClick={() => galleryInputRef.current?.click()}
        disabled={scanning}
      >
        앨범에서 선택 (최대 {MAX_SCAN_IMAGES}장)
      </button>

      <p className="mt-3 text-xs" style={{ color: 'var(--color-outline)' }}>
        마트 영수증과 쿠팡·마켓컬리 같은 주문내역 화면도 읽어요
      </p>

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
