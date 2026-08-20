import { useState } from 'react'
import { freshnessColor } from '../../lib/freshness'
import { useModal } from '../../hooks/useModal'
import { logEvent } from '../../api/events'
import type { ScannedItem } from '../../api/scan'

interface Props {
  items: ScannedItem[]
  storeName?: string | null
  /** 등록 실패 메시지. 모달 **안**에서 보여줘야 한다 —
   *  밖에 두면 이 모달(z-100) 뒤로 가려서 사용자 눈에 아무 일도 안 일어난 것처럼 보인다. */
  error?: string | null
  onConfirm: (items: ScannedItem[]) => void
  onClose: () => void
}

export default function ResultsModal({ items: initialItems, storeName, error, onConfirm, onClose }: Props) {
  const panelRef = useModal(true, onClose)
  const [items, setItems] = useState<ScannedItem[]>(initialItems)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleDelete = (idx: number) => {
    logEvent('edit_item', { action: 'delete_before_register', item: items[idx].name })
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const handleEditStart = (idx: number) => {
    setEditingIdx(idx)
    setEditName(items[idx].name)
  }

  const handleEditConfirm = () => {
    if (editingIdx === null) return
    logEvent('edit_item', { action: 'rename', from: items[editingIdx].name, to: editName })
    setItems(prev => prev.map((item, i) => i === editingIdx ? { ...item, name: editName } : item))
    setEditingIdx(null)
  }

  const storageMethodLabel = (method: string) => {
    switch (method) {
      case 'refrigerated': return '냉장'
      case 'frozen': return '냉동'
      case 'room_temp': return '실온'
      default: return method
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 오버레이 */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'var(--color-on-surface)', opacity: 0.15, backdropFilter: 'blur(24px)' }}
        onClick={onClose}
      />

      {/* 모달 */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="인식된 식재료"
        className="modal-scroll relative w-full max-w-md max-h-[85vh] rounded-3xl flex flex-col mx-4"
        style={{ backgroundColor: 'var(--color-surface-container-lowest)' }}
      >
        {/* 핸들 + 헤더 (고정) */}
        <div className="flex-shrink-0">
          <div className="flex justify-center pt-3 pb-4">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--color-outline-variant)' }} />
          </div>
          <div className="flex items-center justify-between px-5 mb-4">
            <div>
              <h2
                className="text-lg font-bold"
                style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
              >
                인식된 식재료
              </h2>
              {storeName && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined text-xs align-middle mr-1">store</span>
                  {storeName}
                </p>
              )}
            </div>
            <span
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-primary)' }}
            >
              {items.length}개 발견
            </span>
          </div>
        </div>

        {/* 항목이 없을 때 */}
        {items.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              찾은 식재료가 없어요
            </p>
          </div>
        )}

        {/* 항목 리스트 (스크롤 영역) */}
        <div className="flex-1 overflow-y-auto px-5 space-y-1">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 py-3 group"
              // 교차 줄무늬를 쓰다가 홀수 행 배경(surface-container-low)이
              // 입력칸 배경과 같은 색이라 입력칸이 통째로 사라졌다. 행마다
              // 폼이 보였다 안 보였다 했다. 모든 행을 같은 카드로 통일하고
              // 입력칸은 한 단계 진한 톤을 쓴다.
              style={{ marginBottom: idx < items.length - 1 ? '6px' : '0', padding: '10px 12px', backgroundColor: 'var(--color-surface-container-low)', borderRadius: '12px' }}
            >
              {/* 상태 바 */}
              <div
                className="w-1 h-9 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: item.auto_matched
                    ? 'var(--color-primary-container)'
                    : 'var(--color-secondary)',
                }}
              />

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                {editingIdx === idx ? (
                  <div className="flex gap-2">
                    <input
                      className="flex-1 text-sm px-2 py-1 rounded-lg border-none outline-none"
                      style={{ backgroundColor: 'var(--color-surface-container-high)' }}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleEditConfirm()}
                      autoFocus
                    />
                    <button
                      className="text-xs font-semibold px-2"
                      style={{ color: 'var(--color-primary)' }}
                      onClick={handleEditConfirm}
                    >
                      확인
                    </button>
                  </div>
                ) : (
                  <>
                    <p
                      className="text-sm font-medium truncate cursor-pointer"
                      style={{ color: 'var(--color-on-surface)' }}
                      onClick={() => handleEditStart(idx)}
                    >
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <input
                        className="w-20 text-xs px-2 py-0.5 rounded-md outline-none"
                        style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
                        placeholder="수량 (예: 600g)"
                        value={item.quantity || ''}
                        onChange={e => {
                          const val = e.target.value
                          setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val || null } : it))
                        }}
                      />
                      <input
                        className="w-20 text-xs px-2 py-0.5 rounded-md outline-none"
                        style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
                        placeholder="가격 (원)"
                        type="number"
                        value={item.price ?? ''}
                        onChange={e => {
                          const val = e.target.value ? parseInt(e.target.value) : null
                          setItems(prev => prev.map((it, i) => i === idx ? { ...it, price: val } : it))
                        }}
                      />
                      <input
                        // 좁아서 "2026. 08." 로 잘렸다. 소비기한은 이 화면에서 가장 중요한 값이다.
                        className="w-full min-w-[8.5rem] text-sm px-2 py-2 rounded-md outline-none"
                        style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
                        type="date"
                        value={item.expiry_date}
                        onChange={e => {
                          const newDate = e.target.value
                          if (!newDate) return
                          const today = new Date()
                          today.setHours(0, 0, 0, 0)
                          const expiry = new Date(newDate)
                          const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                          setItems(prev => prev.map((it, i) => i === idx ? { ...it, expiry_date: newDate, shelf_life_days: diffDays } : it))
                        }}
                      />
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {storageMethodLabel(item.storage_method)} 보관 · 소비기한 {item.expiry_date}
                      {!item.auto_matched && (
                        <span style={{ color: 'var(--color-secondary)' }}> · ⚠️ 자동 분류 실패</span>
                      )}
                    </p>
                  </>
                )}
              </div>

              {/* D-day */}
              <span
                className="text-xs font-semibold flex-shrink-0"
                style={{
                  color: freshnessColor(item.shelf_life_days),
                }}
              >
                D-{item.shelf_life_days}
              </span>

              {/* 삭제 */}
              {/* 상시 노출 + 44px 터치 타겟. 예전에는 hover 로 숨겨져 있어서
                  오인식 항목을 지울 방법이 사실상 없었다. */}
              <button
                className="flex-shrink-0 flex items-center justify-center w-11 h-11 -mr-2 rounded-full active:scale-90 transition-transform"
                style={{ color: 'var(--color-error)' }}
                onClick={() => handleDelete(idx)}
                aria-label={`${item.name} 삭제`}
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
          ))}
        </div>

        {/* 등록 버튼 (하단 고정) */}
        {items.length > 0 && (
          <div className="flex-shrink-0 px-5 pt-4 pb-4" style={{ backgroundColor: 'var(--color-surface-container-lowest)' }}>
            {error && (
              <p
                role="alert"
                className="mb-3 px-4 py-3 rounded-xl text-sm text-center"
                style={{ backgroundColor: 'var(--color-error-container)', color: 'var(--color-error)' }}
              >
                {error}
              </p>
            )}
            <button
              className="w-full py-4 rounded-full text-base font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
              disabled={submitting}
              onClick={async () => { setSubmitting(true); try { await onConfirm(items) } finally { setSubmitting(false) } }}
            >
              {submitting ? '등록 중...' : '냉장고에 추가하기'}
            </button>
            <p className="text-center text-xs mt-2" style={{ color: 'var(--color-outline)' }}>
              이름을 눌러서 수정할 수 있어요
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
