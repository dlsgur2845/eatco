import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import NotificationCycleForm from '../components/settings/NotificationCycleForm'
import PushTimeSelector from '../components/settings/PushTimeSelector'
import { usePushNotification } from '../hooks/usePushNotification'
import type { NotificationSetting } from '../types'

export default function SettingsPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<NotificationSetting[]>([])
  const user = sessionStorage.getItem('user') ? JSON.parse(sessionStorage.getItem('user')!) : null
  const { permission, subscribed, loading: pushLoading, subscribe, unsubscribe, isSupported, isIOS } =
    usePushNotification()

  useEffect(() => {
    api
      .get<NotificationSetting[]>('/notifications/settings')
      .then((r) => setSettings(r.data))
      .catch(() => {})
  }, [])

  const handlePushToggle = async () => {
    if (subscribed) {
      await unsubscribe()
    } else {
      await subscribe()
    }
  }

  const handleCycleToggle = (id: string, enabled: boolean) => {
    setSettings(settings.map((s) => (s.id === id ? { ...s, enabled } : s)))
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

  const pushTime = settings.length > 0 ? settings[0].push_time : '09:00'

  return (
    <div className="max-w-screen-md mx-auto space-y-10">
      <h2 className="font-headline font-bold text-2xl text-on-surface">알림 설정</h2>

      {/* Push Notification Toggle (gate) */}
      {isSupported && (
        <section className="bg-surface-container-low p-8 rounded-[2.5rem]">
          <h3 className="font-headline font-bold text-lg text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">notifications</span>
            푸시 알림
          </h3>

          <button
            onClick={handlePushToggle}
            disabled={pushLoading || permission === 'denied'}
            className="w-full flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl min-h-[44px] transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-on-surface-variant">
                {subscribed ? 'notifications_active' : 'notifications_off'}
              </span>
              <div className="text-left">
                <span className="font-medium block">
                  {subscribed ? '푸시 알림 켜짐' : '푸시 알림 꺼짐'}
                </span>
                {subscribed && (
                  <span className="text-xs text-on-surface-variant">
                    소비기한 알림을 이 기기로 받아요
                  </span>
                )}
              </div>
            </div>
            <div
              className={`w-12 h-7 rounded-full transition-colors relative ${
                subscribed ? 'bg-primary' : 'bg-outline/30'
              }`}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  subscribed ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </button>

          {permission === 'denied' && (
            <p className="mt-3 text-xs text-error px-2">
              브라우저에서 알림이 차단되어 있습니다. 브라우저 설정에서 이 사이트의 알림을 허용해주세요.
            </p>
          )}

          {isIOS && !subscribed && (
            <p className="mt-3 text-xs text-on-surface-variant px-2">
              iPhone/iPad에서는 "홈 화면에 추가"로 앱을 설치한 후 푸시 알림을 받을 수 있습니다.
            </p>
          )}

          {pushLoading && (
            <p className="mt-3 text-xs text-on-surface-variant px-2 animate-pulse">처리 중...</p>
          )}

          {subscribed && (
            <div className="mt-4 px-2">
              <PushTimeSelector initialTime={pushTime} />
            </div>
          )}
        </section>
      )}

      {/* Notification Cycle */}
      <section className="bg-surface-container-low p-8 rounded-[2.5rem]">
        <h3 className="font-headline font-bold text-lg text-on-surface mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">notifications_active</span>
          소비기한 알림 주기
        </h3>
        {settings.length === 0 ? (
          <p className="text-on-surface-variant text-sm text-center py-4">
            알림 설정이 없습니다. 서버가 초기화되면 기본 설정이 생성됩니다.
          </p>
        ) : (
          <NotificationCycleForm settings={settings} onToggle={handleCycleToggle} />
        )}
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
            <span className="text-sm text-primary font-bold">v1.4.1</span>
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
