import { useState } from 'react'
import RecipeCard from './RecipeCard'
import { deleteSharedRecipe, type SharedRecipe, type SharedRecipeDetail } from '../../api/sharedRecipes'
import RecipeReviewPanel from './RecipeReviewPanel'
import AddRecipeSheet from './AddRecipeSheet'
import { josa } from '../../lib/korean'

interface Props {
  recipe: SharedRecipe
  onDeleted: () => void
}

/* 카드 배지.
   'pending' 은 없어졌다 — 자동 검열이 사라지면서 그 상태 자체가 없다.
   이제 말할 것은 **범위**(가족만/모두)와 거절이다.
   공개된 글에는 배지를 안 단다 — 그게 기본 기대값이고, 모든 카드에
   «공개» 가 붙으면 그 배지는 정보가 아니라 소음이다. */
const BADGE: Record<string, { label: string; color: string; bg: string }> = {
  family: {
    label: '가족만',
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
  const [editing, setEditing] = useState<SharedRecipeDetail | null>(null)
  /* 내 글에만 범위 배지를 단다. 남의 글은 어차피 공개된 것만 보이므로
     «가족만» 이 뜰 일이 없고, 뜬다면 그건 우리 가족 글이라 이미 안다. */
  const badge = recipe.is_mine
    ? recipe.status === 'rejected'
      ? BADGE.rejected
      : recipe.visibility === 'family'
        ? BADGE.family
        : null
    : null

  async function remove() {
    // window.confirm 은 이 저장소가 이미 쓰는 방식이다 (일관성).
    // withJosa 를 쓴다. 이 세션 초반에 앱 5곳의 "을(를)" 을 걷어냈는데,
    // 이 파일을 나중에 만들면서 같은 걸 다시 넣었다.
    if (!window.confirm(`«${recipe.name}»${josa(recipe.name, '을')} 지울까요?`)) return
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
       이 되어 HTML 이 깨진다. 형제로 두고 위치만 겹친다.

       **w-56 을 빼지 말 것.** RecipeCard 는 w-56 짜리 <button> = inline-block 이다.
       래퍼에 폭이 없으면 뒤에 오는 "지우기" 버튼(역시 inline-block)이 카드 **옆**
       으로 흘러서, 래퍼가 263px 로 벌어지고 버튼이 카드 밖 허공에 뜬다.
       거절 카드는 사이에 block <p>(사유)가 있어서 우연히 줄바꿈돼 멀쩡해 보였다 —
       즉 검토 중 카드에서만 드러났다. 실측으로 확인한 값이다. */
    <div className="relative flex-shrink-0 w-56">
      <RecipeCard
        recipe={recipe}
        hideSource
        detailExtra={
          recipe.is_mine ? (
            <RecipeReviewPanel
              recipeId={recipe.id}
              onEdit={(d) => setEditing(d)}
              onChanged={onDeleted}
            />
          ) : undefined
        }
      />

      {/* 작성자와 상태를 **둘 다 좌상단**에 둔다. 우상단은 삭제 버튼 전용이다.
          예전엔 상태 배지가 우상단을 차지해서, 검토 중·거절 카드만 삭제를
          카드 **밑**에 따로 그렸다. 같은 동작의 버튼이 상태에 따라 다른 자리에
          나타났고, flex 가 래퍼를 가장 큰 카드(316px)에 맞춰 늘려서 승인 카드
          아래에 빈 공간이 생겼다. 자리를 하나로 합치면 둘 다 사라진다.

          폭 계산: 8 + 작성자(~47) + 4 + 배지(~63) = 122 < 삭제 시작점 170. */}
      <div className="absolute top-2 left-2 flex items-center gap-1 pointer-events-none">
        {/* 익명이면 서버가 이미 '익명' 으로 바꿔서 보낸다.
            닉네임을 감추는 판단을 프론트에 두지 않는다. */}
        <span
          className="px-2 py-0.5 rounded-full text-xs"
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
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: badge.bg, color: badge.color }}
          >
            {badge.label}
          </span>
        )}
      </div>

      {recipe.is_mine && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          aria-label={`${recipe.name} 삭제`}
          className="absolute top-1.5 right-1.5 w-12 h-12 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-surface-container-lowest) 85%, transparent)',
            backdropFilter: 'blur(4px)',
            opacity: busy ? 0.4 : 1,
          }}
        >
          <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-on-surface-variant)' }}>
            delete
          </span>
        </button>
      )}

      {/* 거절 사유는 작성자에게만 온다 (서버가 남에게는 null 로 지운다). */}
      {recipe.status === 'rejected' && recipe.status_reason && (
        <p className="mt-1.5 px-1 text-xs" style={{ color: 'var(--color-tertiary)' }}>
          {recipe.status_reason}
        </p>
      )}

      {/* 고치기 시트. 등록과 같은 폼을 수정 모드로 연다. */}
      {editing && (
        <AddRecipeSheet
          editing={editing}
          onClose={() => setEditing(null)}
          onCreated={onDeleted}
        />
      )}
    </div>
  )
}
