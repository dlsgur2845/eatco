import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import api from '../api/client'

/**
 * 안 읽은 알림 수를 상단바와 알림 화면이 같이 본다.
 *
 * 예전에는 TopAppBar 가 30초마다 혼자 폴링하고, 읽음 처리는 NotificationsPage
 * 안에서만 일어났다. 둘이 상태를 공유하지 않아서 **알림을 읽어도 배지가
 * 최대 30초 동안 옛날 숫자를 들고 있었다.** 사용자 눈에는 읽음 처리가
 * 안 먹은 것으로 보인다.
 *
 * 여기서는 읽는 즉시 낙관적으로 줄이고(체감 0ms), 곧바로 서버 값으로
 * 맞춘다. 낙관적 갱신만 하면 다른 기기에서 읽은 것과 어긋난다.
 */

interface Ctx {
  count: number
  /** 서버에서 다시 읽어온다. */
  refresh: () => void
  /** n건을 읽었다. 즉시 줄이고 서버로 확인한다. */
  markRead: (n: number) => void
  /** 전부 읽었다. */
  markAllRead: () => void
}

const UnreadContext = createContext<Ctx>({
  count: 0,
  refresh: () => {},
  markRead: () => {},
  markAllRead: () => {},
})

const POLL_MS = 30_000

export function UnreadCountProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0)

  const refresh = useCallback(() => {
    api
      .get<{ count: number }>('/notification-logs/unread-count')
      .then((r) => setCount(r.data.count))
      .catch(() => {})
  }, [])

  const markRead = useCallback(
    (n: number) => {
      setCount((c) => Math.max(0, c - n))
      refresh()
    },
    [refresh],
  )

  const markAllRead = useCallback(() => {
    setCount(0)
    refresh()
  }, [refresh])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, POLL_MS)
    // 앱으로 돌아왔을 때 옛날 숫자를 들고 있으면 안 된다. 폴링을 기다리지 않는다.
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return (
    <UnreadContext.Provider value={{ count, refresh, markRead, markAllRead }}>
      {children}
    </UnreadContext.Provider>
  )
}

export function useUnreadCount(): Ctx {
  return useContext(UnreadContext)
}
