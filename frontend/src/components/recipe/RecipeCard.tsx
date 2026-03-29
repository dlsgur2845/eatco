import { useState } from 'react'
import type { Recipe } from '../../api/recipes'
import RecipeDetailModal from './RecipeDetailModal'

interface Props {
  recipe: Recipe
}

export default function RecipeCard({ recipe }: Props) {
  const [showDetail, setShowDetail] = useState(false)
  const pct = Math.round(recipe.match_ratio * 100)

  return (
    <>
      <div
        className="flex-shrink-0 w-56 rounded-2xl overflow-hidden cursor-pointer transition-transform active:scale-95"
        style={{ backgroundColor: 'var(--color-surface-container-lowest)' }}
        onClick={() => setShowDetail(true)}
      >
        {recipe.image_url ? (
          <img src={recipe.image_url} alt={recipe.name} className="w-full h-32 object-cover" />
        ) : (
          <div className="w-full h-32 flex items-center justify-center text-3xl" style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
            🍳
          </div>
        )}

        <div className="p-3">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-on-surface)' }}>
            {recipe.name}
          </p>

          {recipe.urgent_used.length > 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-tertiary-container)' }}>
              D-day {recipe.urgent_used[0]} 활용
            </p>
          )}

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              {recipe.cooking_method} · {recipe.calories}kcal
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: pct >= 80 ? '#e8f5e9' : pct >= 50 ? '#fff3e0' : '#fce4e4',
                color: pct >= 80 ? 'var(--color-primary)' : pct >= 50 ? 'var(--color-secondary-container)' : 'var(--color-tertiary-container)',
              }}
            >
              {pct}%
            </span>
          </div>
        </div>
      </div>

      {showDetail && (
        <RecipeDetailModal recipe={recipe} onClose={() => setShowDetail(false)} />
      )}
    </>
  )
}
