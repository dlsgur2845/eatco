import { useEffect, useState } from 'react'
import { useModal } from '../hooks/useModal'

export const CURRENT_VERSION = '1.11.0'
const STORAGE_KEY = 'eatco_changelog_seen'

export const CHANGELOG = [
  {
    version: '1.11.0',
    date: '2026-08-27',
    features: [
      { icon: 'key', text: '가족 AI 키 — 한 사람만 등록해도 온 가족이 써요 (가족 화면)' },
      { icon: 'swap_horiz', text: '키가 여러 개면 가장 적게 쓴 것부터 돌아가며 써요' },
    ],
    improvements: [
      '키 하나가 막히면 다음 키로 넘어가요. 다 안 되면 앱 키로 돌아가요',
      '키는 암호화해서 보관하고 뒤 4자리만 보여요',
      '스캔이 실패했을 때 사진 탓을 하던 문구를 고쳤어요',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-08-27',
    features: [
      { icon: 'restart_alt', text: '가족 데이터 초기화 — 구성원 모두가 동의해야 지워져요 (가족 화면)' },
      { icon: 'history', text: '지운 뒤 7일 안에는 되돌릴 수 있어요' },
    ],
    improvements: [
      '공개한 요리와 계정·가족 정보는 초기화해도 남아요',
      '초기화 요청은 48시간 뒤 만료돼요',
      '가족 구성원 목록의 「방장」을 「대표」로 바꿨어요',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-08-27',
    features: [
      { icon: 'menu_book', text: '나의 요리 — 내가 올린 요리를 공개 범위별로 모아서 봐요 (설정 안)' },
    ],
    improvements: [
      '재료를 다 쓰면 추천이 바로 바뀌어요 — 예전에는 3초 뒤에 지워져서, 그 사이 새로고침하면 삭제가 아예 안 나갔어요',
      '「일부 사용」에서 수량을 0 으로 두면 다 썼는지 물어봐요',
      '되돌리기가 재료를 실제로 다시 넣어줘요 (새로고침해도 어긋나지 않아요)',
      '레시피 카드가 「78%」 대신 「재료 3/5」 로 말해요',
      '남이 올린 레시피에 「나의 레시피」가 찍히던 표시를 고쳤어요',
      '공개한 뒤 고쳐서 검토가 필요해진 요리를 알려줘요',
      '재고 화면에서 재료 수정이 저장되지 않던 문제를 고쳤어요',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-08-26',
    features: [
      { icon: 'content_paste', text: '영수증·주문내역을 클립보드에서 바로 붙여넣기 (⌘V)' },
      { icon: 'drag_pan', text: '이미지를 끌어다 놓아도 스캔돼요' },
    ],
    improvements: [
      '보내기 전에 무엇을 보낼지 확인하는 단계가 생겼어요',
      '「취소」가 실제로 요청을 멈춰요',
      '여러 장 중 한 장이 잘못돼도 나머지는 살려요',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-08-23',
    features: [
      { icon: 'restaurant', text: '식단에 레시피 붙이기 — 부족한 재료를 그때의 냉장고로 계산해서 알려줘요' },
      { icon: 'rate_review', text: '개선 검토 / 공개 검토 — 올린 요리는 기본적으로 가족만 봐요' },
      { icon: 'link', text: '가족 초대 링크 (한 번 쓰면 만료)' },
      { icon: 'person', text: '마이페이지 — 닉네임·비밀번호 변경' },
    ],
    improvements: [
      '「로그인 유지」를 켰을 때만 유지돼요',
      '닉네임 규칙 — 한글 7자까지, 비속어·중복 거름',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-08-21',
    features: [
      { icon: 'restaurant_menu', text: '나의 메뉴 추가 — 우리 집 요리를 올리면 모든 사용자가 봐요' },
      { icon: 'visibility_off', text: '익명/기명 선택해서 올리기' },
      { icon: 'how_to_reg', text: '가입 승인제 — 관리자가 승인해야 가입이 완료돼요' },
    ],
    improvements: [
      '올린 메뉴는 먹을 수 있는 음식인지 자동으로 확인해요',
      '레시피 카드 캐싱 — 탭을 오갈 때 다시 부르지 않아요',
      '관리자 화면에서 식단을 올린 사용자도 삭제할 수 있어요',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-03-31',
    features: [
      { icon: 'mail', text: '이메일 저장 + 자동 로그인 유지 (7일)' },
      { icon: 'security', text: 'CORS 보안 강화 + Nginx 보안 헤더 추가' },
    ],
    improvements: [
      'HTTP → HTTPS 자동 리다이렉트',
      '접속 포트 80/443으로 변경 (포트 입력 불필요)',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-03-31',
    features: [
      { icon: 'install_mobile', text: '홈화면에 앱 아이콘 추가 가능 (PWA 설치)' },
      { icon: 'notifications_active', text: '푸시 알림 활성화 (VAPID 키 설정)' },
    ],
    improvements: [
      '"유통기한" → "소비기한" 용어 통일',
      '회원가입/설정 페이지 문구 간소화',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-31',
    features: [
      { icon: 'notifications', text: '푸시 알림 — 소비기한 알림을 기기로 전송' },
      { icon: 'schedule', text: '알림 시간/주기 설정 (가족별 독립)' },
    ],
    improvements: [
      'DB 커넥션 풀 + 인덱스 최적화',
      '알림 설정 보안 강화 (IDOR 수정)',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-03-30',
    features: [
      { icon: 'shield', text: '보안 강화 — JWT/IDOR/인증/비밀번호 정책 등 6건 수정' },
      { icon: 'edit_note', text: '식재료 클릭 시 수정 가능 (이름, 가격, 매장, 소비기한)' },
      { icon: 'admin_panel_settings', text: '가족 마스터 권한 시스템 (master_id 기반)' },
      { icon: 'list', text: '식재료별 추이에서 전체 식재료 목록 바로 확인' },
    ],
    improvements: [
      '공동 편집 설정은 마스터만 변경 가능',
      '가격 검색 정확도 개선 (부분 매칭 제거)',
      '직접등록 시 Gemini 기반 이름 정규화',
      '회원가입 비밀번호 에러 메시지 한국어 표시',
    ],
  },
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
      { icon: 'timer', text: '소비기한 D-Day 추적 + 알림' },
      { icon: 'group', text: '가족 공유 (초대 코드, 공동 편집)' },
      { icon: 'search', text: '보관기한 자동 추천 (221종 DB)' },
      { icon: 'edit', text: '실시간 자동완성 검색' },
    ],
    improvements: [],
  },
]

export default function WhatsNew() {
  const [show, setShow] = useState(false)
  const panelRef = useModal(show, () => setShow(false))

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY)
    // 첫 실행 분기가 없어서, 새로 가입한 가족 구성원이 앱을 열자마자
    // "CORS 보안 강화", "JWT/IDOR", "커넥션 풀 최적화" 같은 엔지니어링 체인지로그를
    // 전체 화면 차단 모달로 마주했다. 처음 온 사람에게 보여줄 내용이 아니다.
    // 처음이면 조용히 현재 버전만 기록하고 넘어간다.
    if (seen === null) {
      localStorage.setItem(STORAGE_KEY, CURRENT_VERSION)
      return
    }
    if (seen !== CURRENT_VERSION) setShow(true)
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION)
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm" onClick={dismiss} />
      <div ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="새로운 소식"
        className="modal-scroll relative z-10 w-full max-w-md max-h-[85vh] overflow-y-auto bg-surface rounded-[2rem] mx-4 shadow-2xl">

        {CHANGELOG.map((entry, idx) => (
          <div key={entry.version}>
            {/* 헤더 */}
            <div className={`p-6 pb-0 ${idx > 0 ? 'pt-2' : ''}`}>
              <div className="flex items-center gap-3 mb-2">
                {idx === 0 ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--color-primary)' }}>
                    <span aria-hidden="true" className="material-symbols-outlined text-white text-xl">auto_awesome</span>
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--color-surface-container-high)' }}>
                    <span aria-hidden="true" className="material-symbols-outlined text-on-surface-variant text-xl">history</span>
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
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">{f.icon}</span>
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
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            확인했어요
          </button>
        </div>
      </div>
    </div>
  )
}
