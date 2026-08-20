import { useCallback, useRef, useState } from 'react'
import { logEvent } from '../api/events'
import { analyzeReceipt, registerItems, type ScannedItem } from '../api/scan'
import { downscaleImage } from '../lib/image'
import ResultsModal from '../components/scan/ResultsModal'

const PROGRESS_STEPS = ['영수증을 읽고 있어요...', '식재료를 찾고 있어요...', '소비기한을 계산하고 있어요...']

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
  const abortRef = useRef<AbortController | null>(null)

  const handleCapture = useCallback(async (file: File) => {
    setError(null)
    setScanning(true)
    setProgressStep(0)

    setSlow(false)
    abortRef.current = new AbortController()
    const interval = setInterval(() => {
      setProgressStep(prev => Math.min(prev + 1, PROGRESS_STEPS.length - 1))
    }, 1800)
    // 10초 넘어가면 "멈췄나?" 를 없애준다. 실측 소요가 9초대라 대부분은 그 전에 끝난다.
    const slowTimer = setTimeout(() => setSlow(true), 10_000)

    try {
      // 업로드 전에 줄인다. 원본 그대로 보내면 업로드가 느리고 토큰만 늘어난다.
      const prepared = await downscaleImage(file)
      const result = await analyzeReceipt(prepared)
      clearInterval(interval)
      clearTimeout(slowTimer)

      logEvent('scan', { source: 'receipt', items_count: result.total })

      if (result.total === 0) {
        setError('식재료를 찾지 못했어요. 영수증이 잘 보이게 다시 찍어주세요.')
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
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleCapture(file)
    e.target.value = ''
  }

  const handleRegister = async (finalItems: ScannedItem[]) => {
    setRegisterError(null)
    try {
      await registerItems(finalItems, storeName)
      logEvent('register', { items_count: finalItems.length, store: storeName })
      setShowResults(false)
      setItems([])
      onRegistered()
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
        영수증을 찍으면 자동으로 등록됩니다
      </p>

      {scanning ? (
        <div
          className="w-full py-16 rounded-2xl flex flex-col items-center justify-center gap-4"
          style={{ backgroundColor: 'var(--color-surface-container-low)' }}
        >
          {/* 불확정형. 예전에는 2.4초에 100% 가 되고 멈춰 있었는데 실제 소요는 9초대라,
              사용자가 멈춘 줄 알고 뒤로가기를 눌러 스캔을 날렸다. */}
          <div
            className="w-48 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--color-surface-container-high)' }}
            role="progressbar"
            aria-label="영수증 분석 중"
          >
            <div
              className="h-full w-1/3 rounded-full scan-indeterminate"
              style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))' }}
            />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
            {PROGRESS_STEPS[progressStep]}
          </p>
          {slow && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                조금 오래 걸리고 있어요. 잠시만요.
              </p>
              <button
                onClick={() => { abortRef.current?.abort(); setScanning(false); setSlow(false) }}
                className="px-5 py-2.5 rounded-full text-sm font-medium"
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
          <span className="material-symbols-outlined text-5xl" style={{ color: 'var(--color-outline)', opacity: 0.4 }}>photo_camera</span>
          <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            여기를 눌러 영수증을 촬영하세요
          </span>
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
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        className="w-full mt-6 py-4 rounded-full text-base font-semibold text-white disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))' }}
        onClick={() => fileInputRef.current?.click()}
        disabled={scanning}
      >
        영수증 촬영하기
      </button>

      <button
        className="w-full mt-3 py-3 rounded-full text-sm font-medium disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)' }}
        onClick={() => galleryInputRef.current?.click()}
        disabled={scanning}
      >
        앨범에서 선택
      </button>

      <p className="mt-3 text-xs" style={{ color: 'var(--color-outline)' }}>
        대형마트, 편의점 영수증 대부분 인식 가능해요
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
