export default function ExpiryAlertBanner({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <div className="bg-tertiary-container/10 border-l-4 border-tertiary-container rounded-xl p-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="bg-tertiary-container text-white p-3 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            timer_off
          </span>
        </div>
        <div>
          <h3 className="font-headline font-bold text-lg text-on-tertiary-container">
            소비기한 임박 알림
          </h3>
          <p className="text-on-surface-variant text-sm mt-0.5">
            {count}개의 식재료가 곧 만료됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}
