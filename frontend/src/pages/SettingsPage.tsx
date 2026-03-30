import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import type { NotificationSetting } from '../types'

const cycleLabels: Record<number, string> = {
  0: '당일 알림',
  1: '1일 전 알림',
  3: '3일 전 알림',
  5: '5일 전 알림',
  7: '7일 전 알림',
  14: '14일 전 알림',
  21: '21일 전 알림',
  30: '한 달 전 알림',
}

const cycleColors: Record<number, string> = {
  0: 'bg-tertiary-container',
  1: 'bg-secondary-container',
  3: 'bg-primary',
  5: 'bg-primary/60',
  7: 'bg-primary/40',
  14: 'bg-primary/30',
  21: 'bg-primary/20',
  30: 'bg-primary/10',
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<NotificationSetting[]>([])
  const user = sessionStorage.getItem('user') ? JSON.parse(sessionStorage.getItem('user')!) : null

  useEffect(() => {
    api.get<NotificationSetting[]>('/notifications/settings').then((r) => setSettings(r.data)).catch(() => {})
  }, [])

  const toggleSetting = async (setting: NotificationSetting) => {
    try {
      const res = await api.put<NotificationSetting>(`/notifications/settings/${setting.id}`, {
        enabled: !setting.enabled,
      })
      setSettings(settings.map((s) => (s.id === setting.id ? res.data : s)))
    } catch {
      /* ignore */
    }
  }

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem('user')
    navigate('/login')
  }

  return (
    <div className="max-w-screen-md mx-auto space-y-10">
      <h2 className="font-headline font-bold text-2xl text-on-surface">알림 설정</h2>

      {/* Notification Cycle */}
      <section className="bg-surface-container-low p-8 rounded-[2.5rem]">
        <h3 className="font-headline font-bold text-lg text-on-surface mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">notifications_active</span>
          유통기한 알림 주기
        </h3>
        <div className="space-y-3">
          {settings.length === 0 && (
            <p className="text-on-surface-variant text-sm text-center py-4">
              알림 설정이 없습니다. 서버가 초기화되면 기본 설정이 생성됩니다.
            </p>
          )}
          {settings.map((s) => (
            <label
              key={s.id}
              className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl cursor-pointer group hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`w-1.5 h-6 ${cycleColors[s.days_before] || 'bg-primary/10'} rounded-full`} />
                <span className="font-medium">{cycleLabels[s.days_before] || `${s.days_before}일 전 알림`}</span>
              </div>
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={() => toggleSetting(s)}
                className="w-6 h-6 rounded-md text-primary border-outline focus:ring-primary"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Account */}
      <section className="space-y-4 px-2">
        <h3 className="font-headline font-bold text-lg text-on-surface mb-4">계정 및 서비스 정보</h3>
        <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm space-y-1">
          {user && (
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-outline">account_circle</span>
                <div>
                  <span className="font-medium block">{user.nickname}</span>
                  <span className="text-sm text-on-surface-variant">{user.email}</span>
                </div>
              </div>
            </div>
          )}
          <Link
            to="/my-recipes"
            className="flex items-center justify-between p-5 hover:bg-primary/5 transition-colors"
          >
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-outline">menu_book</span>
              <span className="font-medium">나의 레시피</span>
            </div>
            <span className="material-symbols-outlined text-outline text-sm">chevron_right</span>
          </Link>
          <Link
            to="/family"
            className="flex items-center justify-between p-5 hover:bg-primary/5 transition-colors"
          >
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-outline">group</span>
              <span className="font-medium">가족 관리</span>
            </div>
            <span className="material-symbols-outlined text-outline text-sm">chevron_right</span>
          </Link>
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-outline">info</span>
              <span className="font-medium">버전 정보</span>
            </div>
            <span className="text-sm text-primary font-bold">v1.2.0</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 p-5 hover:bg-red-50 text-tertiary transition-colors"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="font-medium">로그아웃</span>
          </button>
        </div>
      </section>
    </div>
  )
}
