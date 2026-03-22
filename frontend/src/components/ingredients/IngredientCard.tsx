import type { Ingredient } from '../../types'

export default function IngredientCard({ ingredient }: { ingredient: Ingredient }) {
  return (
    <div className="relative bg-surface-container-lowest rounded-[2.5rem] p-6 flex items-center gap-5 transition-all hover:shadow-lg group">
      <div className="flex-1">
        <h3 className="font-semibold text-lg text-on-surface">{ingredient.name}</h3>
        <p className="text-xs text-on-surface-variant mb-2">
          등록일: {ingredient.registered_at.slice(0, 10)}
        </p>
      </div>
    </div>
  )
}
