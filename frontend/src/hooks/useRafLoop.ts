import { useEffect, useRef } from 'react'

/**
 * requestAnimationFrame 루프. 배터리를 지키는 쪽에 무게를 둔다.
 *
 * 왜 직접 쓰지 않는가:
 *  1) 탭이 숨으면 멈춰야 한다. 브라우저가 대개 rAF 를 throttle 하지만
 *     iOS 스탠드얼론 PWA 에서 보장되지 않는다. 홈 화면에 설치해 두고
 *     주머니에 넣은 앱이 배터리를 먹는 건 사용자가 앱을 지우는 이유가 된다.
 *  2) unmount 에서 취소하지 않으면 죽은 컴포넌트에 계속 그린다.
 *  3) 다시 보이게 됐을 때 경과시간이 튀면 애니메이션이 순간이동한다.
 *     복귀 시 기준 시각을 다시 잡는다.
 *
 * cb 는 "루프 시작 이후 경과 밀리초"를 받는다. 숨어 있던 시간은 빠진다.
 */
export function useRafLoop(cb: (elapsedMs: number) => void, enabled = true) {
  const cbRef = useRef(cb)
  useEffect(() => {
    cbRef.current = cb
  })

  useEffect(() => {
    if (!enabled) return

    let frame = 0
    let start = performance.now()
    let accumulated = 0
    let running = true

    const tick = (now: number) => {
      if (!running) return
      cbRef.current(accumulated + (now - start))
      frame = requestAnimationFrame(tick)
    }

    const onVisibility = () => {
      if (document.hidden) {
        // 지금까지의 경과를 적립하고 루프를 끊는다.
        accumulated += performance.now() - start
        running = false
        cancelAnimationFrame(frame)
      } else if (!running) {
        // 숨어 있던 시간은 버리고 이어서 그린다.
        start = performance.now()
        running = true
        frame = requestAnimationFrame(tick)
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    frame = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled])
}
