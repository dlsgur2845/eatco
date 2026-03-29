import { useCallback, useRef, useState } from 'react'
import { logEvent } from '../api/events'
import { analyzeReceipt, registerItems, type ScannedItem } from '../api/scan'
import ResultsModal from '../components/scan/ResultsModal'

const PROGRESS_STEPS = ['영수증 읽는 중...', '항목 분석 중...', '유통기한 추정 중...']

interface Props {
  onRegistered: () => void
}

export default function ScanPage({ onRegistered }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const [items, setItems] = useState<ScannedItem[]>([])
  const [showResults, setShowResults] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCapture = useCallback(async (file: File) => {
    setError(null)
    setScanning(true)
    setProgressStep(0)

    const interval = setInterval(() => {
      setProgressStep(prev => Math.min(prev + 1, PROGRESS_STEPS.length - 1))
    }, 1200)

    try {
      const result = await analyzeReceipt(file)
      clearInterval(interval)

      logEvent('scan', { source: 'receipt', items_count: result.total })

      if (result.total === 0) {
        setError('인식된 항목이 없어요. 영수증을 다시 찍어주세요.')
        setScanning(false)
        return
      }

      setItems(result.items)
      setShowResults(true)
    } catch (err: unknown) {
      clearInterval(interval)
      const msg = err instanceof Error ? err.message : '스캔에 실패했어요. 다시 시도해주세요.'
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const resp = (err as { response?: { data?: { detail?: string } } }).response
        setError(resp?.data?.detail ?? msg)
      } else {
        setError(msg)
      }
    } finally {
      setScanning(false)
      setProgressStep(0)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleCapture(file)
    e.target.value = ''
  }

  const handleRegister = async (finalItems: ScannedItem[]) => {
    try {
      await registerItems(finalItems)
      logEvent('register', { items_count: finalItems.length })
      setShowResults(false)
      setItems([])
      onRegistered()
    } catch {
      setError('등록에 실패했어요. 다시 시도해주세요.')
    }
  }

  return (
    <div className="flex flex-col items-center px-5 pt-8 pb-24 min-h-screen">
      <h1
        className="text-2xl font-bold tracking-tight mb-1"
        style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
      >
        장 봤어요?
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-on-surface-variant)' }}>
        영수증을 찍으면 자동으로 등록됩니다
      </p>

      {scanning ? (
        <div
          className="w-full aspect-[3/4] rounded-2xl flex flex-col items-center justify-center gap-4"
          style={{ backgroundColor: 'var(--color-surface-container-low)' }}
        >
          <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-container-high)' }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${((progressStep + 1) / PROGRESS_STEPS.length) * 100}%`,
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))',
              }}
            />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
            {PROGRESS_STEPS[progressStep]}
          </p>
        </div>
      ) : (
        <div
          className="w-full aspect-[3/4] rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer"
          style={{ backgroundColor: 'var(--color-surface-container-low)' }}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="text-5xl opacity-30">📷</span>
          <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            영수증을 여기에 찍어주세요
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
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

      <p className="mt-3 text-xs" style={{ color: 'var(--color-outline)' }}>
        이마트, 홈플러스, GS25 등 대부분의 영수증을 인식합니다
      </p>

      {showResults && (
        <ResultsModal
          items={items}
          onConfirm={handleRegister}
          onClose={() => setShowResults(false)}
        />
      )}
    </div>
  )
}
