import type { Ingredient } from '../../types'

export default function RecentItemList({ items }: { items: Ingredient[] }) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="bg-surface-container-lowest rounded-2xl p-5 flex items-center gap-5 hover:shadow-lg transition-shadow"
        >
          <div className="flex-grow">
            <h4 className="font-headline font-semibold text-lg text-on-surface">{item.name}</h4>
            <p className="text-on-surface-variant text-sm mt-1">{item.expiry_date}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
