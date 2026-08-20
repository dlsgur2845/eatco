import type { ReactNode } from 'react'

/**
 * 카드/목록 항목이 아래에서 살짝 올라오며 나타난다.
 *
 * 전부 CSS 다. JS 는 delay 숫자 하나만 넘긴다 — 목록 20개에 rAF 루프 20개를
 * 돌리면 저사양 기기에서 스크롤이 끊긴다. 동작 줄이기 대응은 index.css 의
 * 전역 @media 가 처리한다(여기서 훅을 또 구독하지 않는다).
 *
 * stagger 상한을 두는 이유: 40번째 항목이 0.4초 뒤에 나타나면 목록이
 * "로딩 중"처럼 보인다. 8번째부터는 같이 나타난다.
 */
const STEP_MS = 45
const MAX_STEPS = 8

export default function Reveal({
  index = 0,
  children,
  className = '',
}: {
  index?: number
  children: ReactNode
  className?: string
}) {
  const delay = Math.min(index, MAX_STEPS) * STEP_MS
  return (
    <div
      className={`eatco-reveal ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
