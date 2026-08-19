import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { needsQuantityCleanup } from '../../lib/format'
import type { Ingredient } from '../../types'

const DISMISS_KEY = 'eatco.quantity_cleanup_dismissed'

export function QuantityCleanupBanner() {
  const [count, setCount] = useState(0)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true')

  useEffect(() => {
    if (dismissed) return
    api
      .get<Ingredient[]>('/ingredients')
      .then((r) => {
        setCount(r.data.filter(needsQuantityCleanup).length)
      })
      .catch(() => {})
  }, [dismissed])

  if (dismissed || count === 0) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div className="mb-4 bg-secondary-container/30 border-l-4 border-secondary rounded-2xl p-4 flex items-center gap-3">
      <span className="material-symbols-outlined text-secondary">info</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-on-surface text-sm">
          <span className="font-bold">{count}개</span> 재료 수량을 다시 확인해 주세요
        </p>
        <p className="text-[11px] text-on-surface-variant">
          요리 기록 기능을 사용하려면 숫자와 단위로 정리가 필요해요.
        </p>
      </div>
      <Link
        to="/quantity-cleanup"
        className="text-secondary font-bold text-sm whitespace-nowrap hover:underline"
      >
        정리하기
      </Link>
      <button
        onClick={handleDismiss}
        className="p-1 text-on-surface-variant hover:bg-surface-container rounded-full"
        aria-label="닫기"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  )
}
