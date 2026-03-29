import { useEffect, useState } from 'react'

const CURRENT_VERSION = '1.1.0'
const STORAGE_KEY = 'eatco_changelog_seen'

const CHANGELOG = [
  {
    version: '1.1.0',
    date: '2026-03-30',
    features: [
      { icon: 'document_scanner', text: '영수증 스캔으로 식재료 자동 등록 (Gemini AI)' },
      { icon: 'restaurant', text: 'AI 레시피 추천 (냉장고 재료 기반)' },
      { icon: 'account_balance_wallet', text: '가계부 — 지출 차트, 가격 추이, 매장 비교' },
      { icon: 'menu_book', text: '나만의 레시피 등록 (사진 업로드 지원)' },
      { icon: 'trending_up', text: '인플레이션 알림 (3개월 전 대비 가격 상승)' },
      { icon: 'savings', text: '월별 예산 설정 및 초과 경고' },
    ],
    improvements: [
      '직접 등록에 가격/매장명 필드 추가',
      '가족 구성원 내보내기 기능',
      '식재료 이름 정규화 (냉동/생 구분 유지)',
    ],
  },
]

export default function WhatsNew() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY)
    if (seen !== CURRENT_VERSION) {
      setShow(true)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION)
    setShow(false)
  }

  if (!show) return null

  const latest = CHANGELOG[0]

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={dismiss} />
      <div className="relative z-10 w-full max-w-md max-h-[85vh] overflow-y-auto bg-surface rounded-[2rem] mx-4 shadow-2xl">
        {/* 헤더 */}
        <div className="p-6 pb-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))' }}>
              <span className="material-symbols-outlined text-white text-xl">auto_awesome</span>
            </div>
            <div>
              <h2 className="font-headline font-bold text-xl text-on-surface">새로운 기능</h2>
              <p className="text-xs text-on-surface-variant">v{latest.version} · {latest.date}</p>
            </div>
          </div>
        </div>

        {/* 주요 기능 */}
        <div className="px-6 py-4 space-y-3">
          {latest.features.map((f, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--color-primary-container)', color: 'white' }}>
                <span className="material-symbols-outlined text-sm">{f.icon}</span>
              </div>
              <p className="text-sm text-on-surface pt-1">{f.text}</p>
            </div>
          ))}
        </div>

        {/* 개선사항 */}
        {latest.improvements && (
          <div className="px-6 pb-4">
            <p className="text-xs font-semibold text-on-surface-variant mb-2">개선사항</p>
            <div className="space-y-1">
              {latest.improvements.map((imp, i) => (
                <p key={i} className="text-xs text-on-surface-variant flex items-start gap-2">
                  <span className="text-primary mt-0.5">·</span>
                  {imp}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* 확인 버튼 */}
        <div className="p-6 pt-2">
          <button
            onClick={dismiss}
            className="w-full py-3.5 rounded-full font-bold text-white active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))' }}
          >
            확인했어요
          </button>
        </div>
      </div>
    </div>
  )
}
