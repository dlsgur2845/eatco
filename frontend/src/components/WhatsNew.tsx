import { useEffect, useState } from 'react'

const CURRENT_VERSION = '1.1.1'
const STORAGE_KEY = 'eatco_changelog_seen'

const CHANGELOG = [
  {
    version: '1.1.1',
    date: '2026-03-30',
    features: [
      { icon: 'palette', text: '디자인 리뷰 기반 UI 개선 8건' },
    ],
    improvements: [
      'AI 생성 느낌 제거 (좌측 컬러 바, 이모지)',
      '디자인 토큰 기반 색상 체계 통일',
      '터치 타겟/타이포그래피/레이아웃 최적화',
    ],
  },
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
  {
    version: '1.0.0',
    date: '2026-03-22',
    features: [
      { icon: 'kitchen', text: '식재료 등록/관리 (냉장/냉동/실온)' },
      { icon: 'timer', text: '유통기한 D-Day 추적 + 알림' },
      { icon: 'group', text: '가족 공유 (초대 코드, 공동 편집)' },
      { icon: 'search', text: '보관기한 자동 추천 (221종 DB)' },
      { icon: 'edit', text: '실시간 자동완성 검색' },
    ],
    improvements: [],
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

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={dismiss} />
      <div className="relative z-10 w-full max-w-md max-h-[85vh] overflow-y-auto bg-surface rounded-[2rem] mx-4 shadow-2xl">

        {CHANGELOG.map((entry, idx) => (
          <div key={entry.version}>
            {/* 헤더 */}
            <div className={`p-6 pb-0 ${idx > 0 ? 'pt-2' : ''}`}>
              <div className="flex items-center gap-3 mb-2">
                {idx === 0 ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))' }}>
                    <span className="material-symbols-outlined text-white text-xl">auto_awesome</span>
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--color-surface-container-high)' }}>
                    <span className="material-symbols-outlined text-on-surface-variant text-xl">history</span>
                  </div>
                )}
                <div>
                  <h2 className={`font-headline font-bold text-on-surface ${idx === 0 ? 'text-xl' : 'text-base'}`}>
                    {idx === 0 ? '새로운 기능' : `v${entry.version}`}
                  </h2>
                  <p className="text-xs text-on-surface-variant">v{entry.version} · {entry.date}</p>
                </div>
              </div>
            </div>

            {/* 주요 기능 */}
            <div className="px-6 py-4 space-y-3">
              {entry.features.map((f, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    idx === 0 ? '' : 'opacity-60'
                  }`} style={{ backgroundColor: idx === 0 ? 'var(--color-primary-container)' : 'var(--color-surface-container-high)', color: idx === 0 ? 'white' : 'var(--color-on-surface-variant)' }}>
                    <span className="material-symbols-outlined text-sm">{f.icon}</span>
                  </div>
                  <p className={`text-sm pt-1 ${idx === 0 ? 'text-on-surface' : 'text-on-surface-variant'}`}>{f.text}</p>
                </div>
              ))}
            </div>

            {/* 개선사항 */}
            {entry.improvements && entry.improvements.length > 0 && (
              <div className="px-6 pb-4">
                <p className="text-xs font-semibold text-on-surface-variant mb-2">개선사항</p>
                <div className="space-y-1">
                  {entry.improvements.map((imp, i) => (
                    <p key={i} className="text-xs text-on-surface-variant flex items-start gap-2">
                      <span className="text-primary mt-0.5">·</span>
                      {imp}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* 버전 구분선 */}
            {idx < CHANGELOG.length - 1 && (
              <div className="mx-6 my-2 h-px" style={{ backgroundColor: 'var(--color-surface-container)' }} />
            )}
          </div>
        ))}

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
