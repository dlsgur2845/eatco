import { useState } from 'react'
import api from '../../api/client'

interface Props {
  initialTime: string
  disabled?: boolean
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
})

export default function PushTimeSelector({ initialTime, disabled }: Props) {
  const [time, setTime] = useState(initialTime || '09:00')
  const [saving, setSaving] = useState(false)

  const handleChange = async (value: string) => {
    setTime(value)
    try {
      setSaving(true)
      await api.put('/notifications/push-time', { push_time: value })
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-on-surface-variant">알림 시간</span>
      <select
        value={time}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled || saving}
        className="px-3 py-2 rounded-xl bg-surface-container text-on-surface text-sm min-h-[44px] min-w-[100px] disabled:opacity-50"
      >
        {TIME_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {saving && <span className="text-xs text-on-surface-variant">저장 중...</span>}
    </div>
  )
}
