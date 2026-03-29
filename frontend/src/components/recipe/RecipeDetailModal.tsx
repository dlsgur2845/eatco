import type { Recipe } from '../../api/recipes'

interface Props {
  recipe: Recipe
  onClose: () => void
}

export default function RecipeDetailModal({ recipe, onClose }: Props) {
  const pct = Math.round(recipe.match_ratio * 100)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'var(--color-on-surface)', opacity: 0.15 }}
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-md max-h-[90vh] rounded-t-3xl overflow-y-auto pb-8"
        style={{ backgroundColor: 'var(--color-surface-container-lowest)' }}
      >
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--color-outline-variant)' }} />
        </div>

        {/* 이미지 */}
        {recipe.image_url && (
          <img src={recipe.image_url} alt={recipe.name} className="w-full h-48 object-cover" />
        )}

        <div className="px-5 pt-4">
          {/* 헤더 */}
          <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
            {recipe.name}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
            {recipe.category} · {recipe.cooking_method} · {recipe.calories}kcal
          </p>

          {/* 매칭률 */}
          <div className="mt-4 px-3 py-2 rounded-xl" style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
              재료 {recipe.match_count}/{recipe.total_ingredients}개 보유 ({pct}%)
            </p>
            {recipe.urgent_used.length > 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-tertiary-container)' }}>
                곧 써야 할 재료 활용: {recipe.urgent_used.join(', ')}
              </p>
            )}
          </div>

          {/* 재료 목록 */}
          <h3 className="text-sm font-semibold mt-5 mb-2" style={{ color: 'var(--color-on-surface)' }}>재료</h3>
          <div className="space-y-1">
            {recipe.ingredients.map((ing, i) => {
              const have = recipe.matched_items.includes(ing)
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span style={{ color: have ? 'var(--color-primary)' : 'var(--color-outline)' }}>
                    {have ? '✓' : '✕'}
                  </span>
                  <span style={{ color: have ? 'var(--color-on-surface)' : 'var(--color-outline)' }}>
                    {ing}
                  </span>
                </div>
              )
            })}
          </div>

          {/* 조리 순서 */}
          {recipe.manual_steps.length > 0 && (
            <>
              <h3 className="text-sm font-semibold mt-5 mb-2" style={{ color: 'var(--color-on-surface)' }}>조리 순서</h3>
              <div className="space-y-3">
                {recipe.manual_steps.map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))' }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm" style={{ color: 'var(--color-on-surface)' }}>{step}</p>
                      {recipe.manual_images[i] && (
                        <img src={recipe.manual_images[i]} alt={`Step ${i + 1}`} className="mt-2 rounded-lg w-full" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 팁 */}
          {recipe.tip && (
            <div className="mt-5 px-3 py-2 rounded-xl" style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
              <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                💡 {recipe.tip}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
