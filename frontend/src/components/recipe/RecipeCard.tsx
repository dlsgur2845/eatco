import { useState } from 'react'
import type { Recipe } from '../../api/recipes'
import RecipeDetailModal from './RecipeDetailModal'

interface Props {
  recipe: Recipe
  /** 상세 모달 아래에 붙일 것. SharedRecipeCard 가 검토 패널을 넘긴다. */
  detailExtra?: React.ReactNode
  /**
   * 출처 줄을 숨긴다.
   *
   * 공유 레시피는 서버가 전부 `source: 'custom'` 으로 보내고(`shared-recipe-scope.ts`),
   * 그 라벨이 「나의 레시피」다. 그래서 **남이 올린 레시피에도 「나의 레시피」가 찍혔다.**
   * 공유 카드에는 작성자 배지가 이미 있으니 출처 줄은 정보가 아니라 거짓말이다.
   * 추천 레일은 식품안전나라/AI 를 구분해야 하므로 그대로 둔다.
   */
  hideSource?: boolean
}

const SOURCE_LABEL: Record<string, string> = {
  custom: '나의 레시피',
  gemini: 'AI 추천',
  foodsafety: '식품안전나라',
  fallback: '기본 레시피',
}

const SOURCE_ICON: Record<string, string> = {
  custom: 'book_2',
  gemini: 'auto_awesome',
  foodsafety: 'public',
  fallback: 'public',
}

export default function RecipeCard({ recipe, detailExtra, hideSource }: Props) {
  const [showDetail, setShowDetail] = useState(false)
  const pct = Math.round(recipe.match_ratio * 100)
  /* 「78%」는 옆의 「320kcal」와 나란히 놓이면 **평점**처럼 읽힌다. 무엇의 78% 인지
     말하지 않기 때문이다. 상세 모달은 이미 「재료 3/5개 보유」라고 제대로 말한다 —
     카드만 다르게 말하고 있었다. 같은 말로 맞춘다. 픽셀 비용 0.
     매칭이 0건이면 알약을 아예 안 그린다. 모두의 메뉴는 0건도 남겨두는데,
     빨간 「재료 0/6」이 줄줄이 뜨면 "이 커뮤니티는 나에게 쓸모없다"고 말하는 셈이다. */
  const showMatch = recipe.match_count > 0
  /* `source` 는 서버가 실제로 안 보낸다 (응답 키 실측 확인). 타입을 optional 로
     바꾸자 여기가 타입 에러로 드러났다 — manual_images 를 흰 화면으로 만든 것과
     같은 종류의 거짓말이 두 곳 더 있었던 것이다. 없으면 출처 줄을 안 그린다. */
  const sourceLabel = hideSource ? '' : recipe.source ? SOURCE_LABEL[recipe.source] || recipe.source : ''
  const sourceIcon = (recipe.source && SOURCE_ICON[recipe.source]) || 'public'

  return (
    <>
      {/* button 이어야 한다. 예전엔 onClick 만 달린 div 라 키보드로 못 열고
          스크린리더에는 컨트롤로 보이지도 않았다 (DESIGN.md §6: 클릭 가능한 div 에는
          role·tabIndex·키 핸들러를 붙이거나 button 을 쓴다). 안에 다른 컨트롤이
          없으므로 통째로 button 으로 바꾸는 게 가장 단순하다. */}
      <button
        type="button"
        aria-label={`${recipe.name} 레시피 보기`}
        className="flex-shrink-0 w-56 text-left rounded-2xl overflow-hidden transition-transform active:scale-95"
        style={{ backgroundColor: 'var(--color-surface-container-lowest)' }}
        onClick={() => setShowDetail(true)}
      >
        {recipe.image_url ? (
          <img src={recipe.image_url} alt={recipe.name} className="w-full h-32 object-cover" />
        ) : (
          <div className="w-full h-32 flex items-center justify-center" style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
            <span aria-hidden="true" className="material-symbols-outlined text-4xl" style={{ color: 'var(--color-outline)', opacity: 0.5 }}>restaurant</span>
          </div>
        )}

        <div className="p-3">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-on-surface)' }}>
            {recipe.name}
          </p>

          {recipe.urgent_used.length > 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-tertiary)' }}>
              D-day {recipe.urgent_used[0]} 활용
            </p>
          )}

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              {/* 칼로리가 없으면 단위도 안 쓴다. 예전엔 "굽기 · kcal" 이 나왔다 —
                  사용자가 올린 레시피는 Gemini 가 추정에 실패하면 빈 값이다. */}
              {recipe.calories ? `${recipe.cooking_method} · ${recipe.calories}kcal` : recipe.cooking_method}
            </span>
            {showMatch && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: pct >= 80 ? 'color-mix(in srgb, var(--color-primary) 10%, white)' : pct >= 50 ? 'color-mix(in srgb, var(--color-secondary-container) 15%, white)' : 'color-mix(in srgb, var(--color-tertiary-container) 10%, white)',
                  color: pct >= 80 ? 'var(--color-primary)' : pct >= 50 ? 'var(--color-secondary)' : 'var(--color-tertiary)',
                }}
              >
                재료 {recipe.match_count}/{recipe.total_ingredients}
              </span>
            )}
          </div>

          {/* 아이콘이 10px 이었고 옆 라벨은 비어 있었다. 실기기 캡처에서는
              **의미를 알 수 없는 10px 점 하나**만 남았다. 라벨이 없으면 아이콘도
              띄우지 않는다 — 출처를 말해주지 못하는 출처 표시는 장식일 뿐이다.
              라벨이 있을 때는 아이콘도 글자와 같은 눈높이(14px)로 올린다. */}
          {sourceLabel && (
            <div className="mt-2 flex items-center gap-1">
              <span
                aria-hidden="true"
                className="material-symbols-outlined"
                style={{ fontSize: '14px', color: 'var(--color-outline)' }}
              >
                {sourceIcon}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-outline)' }}>
                {sourceLabel}
              </span>
            </div>
          )}
        </div>
      </button>

      {showDetail && (
        <RecipeDetailModal recipe={recipe} onClose={() => setShowDetail(false)} extra={detailExtra} />
      )}
    </>
  )
}
