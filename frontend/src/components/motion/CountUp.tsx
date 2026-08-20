import { useState } from 'react'
import { useRafLoop } from '../../hooks/useRafLoop'
import { useReducedMotion } from '../../hooks/useReducedMotion'

/**
 * 숫자가 0에서 목표까지 올라간다. 대시보드의 큰 숫자용.
 *
 * 두 가지를 지킨다:
 *  - 동작 줄이기면 즉시 최종값. 애니메이션 없음.
 *  - 끝나면 rAF 를 멈춘다. 다 올라간 숫자에 계속 프레임을 쓰지 않는다.
 *
 * 짧아야 한다(600ms). 냉장고에 뭐가 몇 개 있는지 보러 온 사람을 기다리게
 * 하면 안 된다. 숫자를 읽는 데 걸리는 시간보다 애니메이션이 길면 방해다.
 */
const DURATION = 600

// 끝에서 부드럽게 멈춘다. 등속이면 기계처럼 보인다.
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export default function CountUp({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(reduced ? value : 0)
  const [done, setDone] = useState(reduced)

  useRafLoop(
    (elapsed) => {
      const t = Math.min(elapsed / DURATION, 1)
      setShown(Math.round(value * easeOut(t)))
      if (t >= 1) setDone(true)
    },
    !reduced && !done,
  )

  return <span className={className}>{(done ? value : shown).toLocaleString()}</span>
}
