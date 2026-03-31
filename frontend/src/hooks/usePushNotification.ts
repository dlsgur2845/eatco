import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/client'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer as ArrayBuffer
}

export function usePushNotification() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)
  const vapidKeyRef = useRef<string | null>(null)

  // 마운트 시 VAPID 키 + 구독 상태를 동시에 가져옴 (병렬)
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission)
    }
    Promise.all([
      api
        .get<{ public_key: string }>('/notifications/vapid-public-key')
        .then((r) => { vapidKeyRef.current = r.data.public_key })
        .catch(() => {}),
      api
        .get<{ subscribed: boolean }>('/notifications/push-subscription/status')
        .then((r) => setSubscribed(r.data.subscribed))
        .catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const subscribe = useCallback(async () => {
    if (!vapidKeyRef.current) {
      alert('서버에 푸시 알림이 아직 설정되지 않았습니다. 관리자에게 문의하세요.')
      return
    }

    // 낙관적 업데이트: 토글 즉시 반영
    setSubscribed(true)

    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setSubscribed(false)
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKeyRef.current),
      })

      const json = sub.toJSON()
      // 서버 등록은 백그라운드로 (UI 이미 반영됨)
      api.post('/notifications/push-subscription', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      }).catch(() => {
        // 서버 등록 실패 시 롤백
        setSubscribed(false)
      })
    } catch (err) {
      console.error('푸시 구독 실패:', err)
      setSubscribed(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    setSubscribed(false)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const json = sub.toJSON()
        api.delete('/notifications/push-subscription', {
          data: {
            endpoint: json.endpoint,
            keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          },
        }).catch(() => {})
        await sub.unsubscribe()
      }
    } catch (err) {
      console.error('푸시 구독 해제 실패:', err)
      setSubscribed(true)
    }
  }, [])

  const isSupported =
    typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream

  return { permission, subscribed, loading, subscribe, unsubscribe, isSupported, isIOS }
}
