import type { StorageMethod } from '../../types'

interface Props {
  value: StorageMethod
  onChange: (method: StorageMethod) => void
}

const methods = [
  { value: 'refrigerated' as const, icon: 'ac_unit', label: '냉장' },
  { value: 'frozen' as const, icon: 'kitchen', label: '냉동' },
  { value: 'room_temp' as const, icon: 'wb_sunny', label: '실온' },
]

export default function StorageMethodSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {methods.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 ${
            value === m.value
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-outline-variant bg-surface-container-lowest text-outline'
          }`}
        >
          <span className="material-symbols-outlined mb-1">{m.icon}</span>
          <span className="text-xs font-bold">{m.label}</span>
        </button>
      ))}
    </div>
  )
}
