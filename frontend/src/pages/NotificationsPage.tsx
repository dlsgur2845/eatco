import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  link: string | null
  created_at: string
}

interface PaginatedResponse {
  items: Notification[]
  total: number
  limit: number
  offset: number
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const PAGE_SIZE = 20

  const fetchNotifications = async (offset: number, append: boolean) => {
    try {
      const r = await api.get('/notification-logs', {
        params: { limit: PAGE_SIZE, offset },
      })
      // 방어: 응답이 배열이면(구 버전) 그대로 사용, 객체면 paginated 형식
      const data = r.data as PaginatedResponse | Notification[]
      let items: Notification[]
      let total: number

      if (Array.isArray(data)) {
        items = data
        total = data.length
      } else {
        items = data.items ?? []
        total = data.total ?? 0
      }

      if (append) {
        setNotifications((prev) => [...prev, ...items])
      } else {
        setNotifications(items)
      }
      setHasMore(offset + PAGE_SIZE < total)
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchNotifications(0, false)
  }, [])

  const loadMore = async () => {
    setLoadingMore(true)
    await fetchNotifications(notifications.length, true)
    setLoadingMore(false)
  }

  const markAsRead = async (notif: Notification) => {
    if (!notif.is_read) {
      await api.put(`/notification-logs/${notif.id}/read`).catch(() => {})
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)),
      )
    }
    if (notif.link) {
      navigate(notif.link)
    }
  }

  const markAllRead = async () => {
    await api.put('/notification-logs/read-all').catch(() => {})
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const typeIcon: Record<string, string> = {
    expiry_today: 'warning',
    expiry_soon: 'timer',
    family_join: 'group_add',
    system: 'info',
  }

  const typeColor: Record<string, string> = {
    expiry_today: 'border-tertiary-container',
    expiry_soon: 'border-secondary-container',
    family_join: 'border-primary-container',
    system: 'border-outline-variant',
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '방금 전'
    if (mins < 60) return `${mins}분 전`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    return `${days}일 전`
  }

  return (
    <div className="max-w-screen-md mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="font-headline font-bold text-2xl text-on-surface">알림</h2>
        {notifications.some((n) => !n.is_read) && (
          <button
            onClick={markAllRead}
            className="text-sm font-bold text-primary hover:underline"
          >
            모두 읽음
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-20">
          <span className="material-symbols-outlined text-outline-variant text-6xl mb-4 block">
            notifications_off
          </span>
          <p className="text-on-surface-variant">아직 알림이 없습니다.</p>
          <p className="text-sm text-on-surface-variant mt-1">
            식재료를 등록하면 소비기한 알림을 받아요.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <button
              key={notif.id}
              onClick={() => markAsRead(notif)}
              className={`w-full text-left bg-surface-container-lowest p-5 rounded-xl border-l-4 ${
                typeColor[notif.type] || 'border-outline-variant'
              } flex gap-4 items-start shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-lg transition-shadow ${
                !notif.is_read ? 'bg-primary/[0.02]' : ''
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  notif.type === 'expiry_today'
                    ? 'bg-tertiary-fixed'
                    : notif.type === 'expiry_soon'
                      ? 'bg-secondary-fixed'
                      : 'bg-primary-fixed'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {typeIcon[notif.type] || 'notifications'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-on-surface leading-snug truncate">
                    {notif.title}
                  </p>
                  {!notif.is_read && (
                    <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-on-surface-variant mt-0.5 line-clamp-2">
                  {notif.message}
                </p>
                <p className="text-xs text-outline mt-1">{timeAgo(notif.created_at)}</p>
              </div>
              {notif.link && (
                <span className="material-symbols-outlined text-outline-variant text-sm self-center">
                  arrow_forward_ios
                </span>
              )}
            </button>
          ))}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 text-sm font-medium text-primary hover:bg-primary/5 rounded-xl transition-colors disabled:opacity-50"
            >
              {loadingMore ? '불러오는 중...' : '더 보기'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
