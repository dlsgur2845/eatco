import { useState } from 'react'
import { logEvent } from '../../api/events'
import type { ScannedItem } from '../../api/scan'

interface Props {
  items: ScannedItem[]
  onConfirm: (items: ScannedItem[]) => void
  onClose: () => void
}

export default function ResultsModal({ items: initialItems, onConfirm, onClose }: Props) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* 오버레이 */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'var(--color-on-surface)', opacity: 0.15, backdropFilter: 'blur(24px)' }}
        onClick={onClose}
      />

      {/* 모달 */}
      <div
        className="relative w-full max-w-md max-h-[85vh] rounded-t-3xl overflow-y-auto pb-8"
        style={{ backgroundColor: 'var(--color-surface-container-lowest)' }}
      >
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-4">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--color-outline-variant)' }} />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 mb-4">
          <h2
            className="text-lg font-bold"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            인식된 식재료
          </h2>
          <span
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-primary)' }}
          >
            {items.length}개 발견
          </span>
        </div>

        {/* 항목이 없을 때 */}
        {items.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              인식된 항목이 없어요
            </p>
          </div>
        )}

        {/* 항목 리스트 */}
        <div className="px-5 space-y-1">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 py-3 group"
              style={{ borderBottom: idx < items.length - 1 ? '1px solid var(--color-surface-container)' : 'none' }}
            >
              {/* 상태 바 */}
              <div
                className="w-1 h-9 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: item.auto_matched
                    ? 'var(--color-primary-container)'
                    : 'var(--color-secondary-container)',
                }}
              />

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                {editingIdx === idx ? (
                  <div className="flex gap-2">
                    <input
                      className="flex-1 text-sm px-2 py-1 rounded-lg border-none outline-none"
                      style={{ backgroundColor: 'var(--color-surface-container-low)' }}
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
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {storageMethodLabel(item.storage_method)} 보관 · 예상 {item.shelf_life_days}일
                      {!item.auto_matched && (
                        <span style={{ color: 'var(--color-secondary-container)' }}> · ⚠️ 자동 분류 실패</span>
                      )}
                    </p>
                  </>
                )}
              </div>

              {/* D-day */}
              <span
                className="text-xs font-semibold flex-shrink-0"
                style={{
                  color: item.shelf_life_days <= 1
                    ? 'var(--color-tertiary-container)'
                    : item.shelf_life_days <= 3
                      ? 'var(--color-secondary-container)'
                      : 'var(--color-primary)',
                }}
              >
                D-{item.shelf_life_days}
              </span>

              {/* 삭제 */}
              <button
                className="text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                style={{ color: 'var(--color-error)' }}
                onClick={() => handleDelete(idx)}
                aria-label={`${item.name} 삭제`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* 등록 버튼 */}
        {items.length > 0 && (
          <div className="px-5 mt-6">
            <button
              className="w-full py-4 rounded-full text-base font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))' }}
              disabled={submitting}
              onClick={async () => { setSubmitting(true); await onConfirm(items) }}
            >
              {submitting ? '등록 중...' : '전부 등록하기'}
            </button>
            <p className="text-center text-xs mt-2" style={{ color: 'var(--color-outline)' }}>
              잘못 인식된 항목은 탭해서 수정할 수 있어요
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
