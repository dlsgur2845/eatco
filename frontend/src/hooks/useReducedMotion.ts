import { useEffect, useState } from 'react'

/**
 * iOS 설정 > 손쉬운 사용 > 동작 > 동작 줄이기.
 *
 * CSS 는 index.css 의 전역 @media 로 막지만, canvas 는 CSS 가 닿지 않는다.
 * rAF 루프를 도는 컴포넌트는 이 값을 보고 정지 프레임 하나만 그려야 한다.
 *
 * 설정을 켜는 사람은 대개 전정기관 문제(어지럼증)가 있다. 취향이 아니라
 * 증상이다. 무시하면 앱을 못 쓴다.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    // Safari 13 이하는 addEventListener 가 없다. 이 앱은 iOS 가 주 타깃이라 둘 다 본다.
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [])

  return reduced
}
