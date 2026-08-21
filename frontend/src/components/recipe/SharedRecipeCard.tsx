import { useState } from 'react'
import RecipeCard from './RecipeCard'
import { deleteSharedRecipe, type SharedRecipe } from '../../api/sharedRecipes'

interface Props {
  recipe: SharedRecipe
  onDeleted: () => void
}

/* 검열 결과 배지.
   approved 는 배지를 안 단다 — 정상이 기본이고, 모든 카드에 «승인» 이 붙으면
   그 배지는 정보가 아니라 소음이다. pending/rejected 는 작성자에게만 보인다
   (서버가 남의 pending 을 목록에 아예 안 넣는다). */
const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: {
    label: '검토 중',
    color: 'var(--color-on-surface-variant)',
    bg: 'color-mix(in srgb, var(--color-surface-container-low) 92%, black)',
  },
  rejected: {
    label: '공개 안 됨',
    color: 'var(--color-tertiary)',
    bg: 'color-mix(in srgb, var(--color-tertiary-container) 30%, white)',
  },
}

export default function SharedRecipeCard({ recipe, onDeleted }: Props) {
  const [busy, setBusy] = useState(false)
  const badge = STATUS[recipe.status]

  async function remove() {
    // window.confirm 은 이 저장소가 이미 쓰는 방식이다 (일관성).
    if (!window.confirm(`«${recipe.name}» 을(를) 지울까요?`)) return
    setBusy(true)
    try {
      await deleteSharedRecipe(recipe.id)
      onDeleted()
    } catch {
      setBusy(false)
    }
  }

  return (
    /* RecipeCard 는 통째로 <button> 이다. 삭제 버튼을 그 안에 넣으면 중첩 button
       이 되어 HTML 이 깨진다. 형제로 두고 위치만 겹친다. */
    <div className="relative flex-shrink-0">
      <RecipeCard recipe={recipe} />

      {/* 작성자 — 익명이면 서버가 이미 '익명' 으로 바꿔서 보낸다.
          닉네임을 감추는 판단을 프론트에 두지 않는다. */}
      <span
        className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs pointer-events-none"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-surface-container-lowest) 85%, transparent)',
          color: 'var(--color-on-surface-variant)',
          backdropFilter: 'blur(4px)',
        }}
      >
        {recipe.author_label}
      </span>

      {badge && (
        <span
          className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium pointer-events-none"
          style={{ backgroundColor: badge.bg, color: badge.color }}
        >
          {badge.label}
        </span>
      )}

      {recipe.is_mine && !badge && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          aria-label={`${recipe.name} 삭제`}
          className="absolute top-1.5 right-1.5 w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-surface-container-lowest) 85%, transparent)',
            backdropFilter: 'blur(4px)',
            opacity: busy ? 0.4 : 1,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-on-surface-variant)' }}>
            delete
          </span>
        </button>
      )}

      {/* 거절 사유는 작성자에게만 온다 (서버가 남에게는 null 로 지운다). */}
      {recipe.status === 'rejected' && recipe.status_reason && (
        <p className="mt-1.5 px-1 text-xs w-56" style={{ color: 'var(--color-tertiary)' }}>
          {recipe.status_reason}
        </p>
      )}

      {/* 검토 중·거절은 삭제 버튼이 배지에 가려지므로 카드 밑에 따로 둔다. */}
      {recipe.is_mine && badge && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="mt-1.5 px-1 text-xs underline"
          style={{ color: 'var(--color-on-surface-variant)', opacity: busy ? 0.4 : 1 }}
        >
          지우기
        </button>
      )}
    </div>
  )
}
