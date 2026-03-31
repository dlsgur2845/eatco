import api from '../../api/client'

interface NotificationSetting {
  id: string
  days_before: number
  enabled: boolean
  push_time: string
}

interface Props {
  settings: NotificationSetting[]
  onToggle: (id: string, enabled: boolean) => void
}

const cycleLabels: Record<number, string> = {
  0: '당일 알림',
  1: '1일 전',
  3: '3일 전',
  5: '5일 전',
  7: '7일 전',
  14: '14일 전',
  21: '21일 전',
  30: '30일 전',
}

const cycleColors: Record<number, string> = {
  0: 'bg-error',
  1: 'bg-error/80',
  3: 'bg-tertiary',
  5: 'bg-tertiary/80',
  7: 'bg-secondary',
  14: 'bg-secondary/60',
  21: 'bg-primary/60',
  30: 'bg-primary/40',
}

export default function NotificationCycleForm({ settings, onToggle }: Props) {
  const handleToggle = async (setting: NotificationSetting) => {
    const newEnabled = !setting.enabled
    onToggle(setting.id, newEnabled)
    try {
      await api.put(`/notifications/settings/${setting.id}`, { enabled: newEnabled })
    } catch {
      onToggle(setting.id, setting.enabled)
    }
  }

  return (
    <div className="space-y-2">
      {settings.map((s) => (
        <button
          key={s.id}
          onClick={() => handleToggle(s)}
          className="w-full flex items-center gap-3 p-3 rounded-2xl bg-surface-container-low min-h-[44px] transition-all active:scale-[0.98]"
        >
          <div
            className={`w-3 h-3 rounded-full transition-opacity ${cycleColors[s.days_before] || 'bg-outline'} ${
              s.enabled ? 'opacity-100' : 'opacity-30'
            }`}
          />
          <span
            className={`text-sm flex-1 text-left ${
              s.enabled ? 'text-on-surface' : 'text-on-surface-variant'
            }`}
          >
            {cycleLabels[s.days_before] || `${s.days_before}일 전`}
          </span>
          <div
            className={`w-10 h-6 rounded-full transition-colors relative ${
              s.enabled ? 'bg-primary' : 'bg-outline/30'
            }`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                s.enabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </div>
        </button>
      ))}
    </div>
  )
}
