import { useEffect, useState } from 'react'
import Reveal from '../components/motion/Reveal'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useUnreadCount } from '../hooks/useUnreadCount'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  link: string | null
  created_at: string
  /** 이 알림을 만든 사람. 내가 만든 것은 배지 숫자에 안 들어간다. */
  actor_id: string | null
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
  // 로딩/오류/비어있음을 구분한다. 예전에는 catch 가 silent 라서 백엔드가 죽어도
  // "아직 알림이 없습니다" 를 띄웠다 — 문제 없다고 거짓말하는 화면이었다.
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const unread = useUnreadCount()
  const myId: string | null = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null')?.id ?? null } catch { return null }
  })()

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
      setState('ready')
    } catch {
      // 첫 로드 실패는 오류 화면. 더보기 실패는 이미 보고 있는 목록을 지우지 않는다.
      if (!append) setState('error')
    }
  }

  useEffect(() => {
    fetchNotifications(0, false)
  }, [])

  const retry = () => {
    setState('loading')
    fetchNotifications(0, false)
  }

  const loadMore = async () => {
    setLoadingMore(true)
    await fetchNotifications(notifications.length, true)
    setLoadingMore(false)
  }

  const markAsRead = async (notif: Notification) => {
    if (!notif.is_read) {
      await api.put(`/notification-logs/${notif.id}/read`).catch(() => {})
      // 배지를 바로 줄인다. 예전에는 상단바가 30초 폴링을 기다려서
      // 읽어도 숫자가 안 바뀌는 것처럼 보였다.
      // 내가 만든 알림은 애초에 배지에 안 들어가 있으니 빼지 않는다.
      if (notif.actor_id !== myId) unread.markRead(1)
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
    unread.markAllRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const typeIcon: Record<string, string> = {
    expiry_today: 'warning',
    expiry_soon: 'timer',
    meal_plan: 'restaurant',
    comment: 'chat_bubble',
    family_join: 'group_add',
    system: 'info',
  }

  const typeColor: Record<string, string> = {
    expiry_today: 'border-tertiary-container',
    expiry_soon: 'border-secondary-container',
    meal_plan: 'border-primary',
    comment: 'border-primary-container',
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
        {/* 실측 52×20px 이었다. 높이가 기준의 절반도 안 됐다.
            글자 크기는 그대로 두고 탭 영역만 넓힌다 (-mr-3 로 시각적 정렬 유지). */}
        {notifications.some((n) => !n.is_read) && (
          <button
            onClick={markAllRead}
            className="min-h-[48px] px-3 -mr-3 inline-flex items-center justify-center text-sm font-bold text-primary hover:underline"
          >
            모두 읽음
          </button>
        )}
      </div>

      {state === 'loading' ? (
        <div aria-busy="true" className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-surface-container-high animate-pulse" />
          ))}
        </div>
      ) : state === 'error' ? (
        <div className="text-center py-20" role="status">
          <span className="material-symbols-outlined text-tertiary text-5xl mb-4 block">error</span>
          <p className="text-on-surface-variant mb-6">알림을 불러오지 못했어요.</p>
          <button
            onClick={retry}
            className="min-h-[48px] inline-flex items-center justify-center px-6 rounded-full bg-on-surface text-surface font-bold active:scale-95 transition-transform"
          >
            다시 시도
          </button>
        </div>
      ) : notifications.length === 0 ? (
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
          {notifications.map((notif, i) => (
            <Reveal key={notif.id} index={i}>
            <button
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
                    ? 'bg-tertiary/10'
                    : notif.type === 'expiry_soon'
                      ? 'bg-secondary/10'
                      : 'bg-primary/10'
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
                  {/* 내가 만든 알림은 배지에도 안 세므로 점도 찍지 않는다.
                      점은 있는데 숫자는 안 오르면 어긋나 보인다. */}
                  {!notif.is_read && notif.actor_id !== myId && (
                    <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-on-surface-variant mt-0.5 line-clamp-2">
                  {notif.message}
                </p>
                <p className="text-xs text-outline mt-1">{timeAgo(notif.created_at)}</p>
              </div>
              {/* `outline-variant` 는 흰 배경에서 **1.7:1** 이라 사실상 안 보였다.
                  안 보이는 장식은 장식 노릇도 못 한다 — "눌러서 이동" 을 알려주는
                  화살표다.

                  다만 `outline` 로 그냥 올렸더니 이번엔 본문 글자와 같은 무게가 됐다.
                  장식이 제목보다 눈에 띄면 안 된다. 게다가 이 아이콘은 `text-sm` 이
                  안 먹는다 — 구글 스타일시트가 레이어 밖에 있어서 Tailwind 의
                  `@layer utilities` 를 이기고 24px 로 그린다. 크기는 인라인으로,
                  무게는 투명도로 낮춘다.

                  낭독은 막는다 — 카드 전체가 이미 링크다. */}
              {notif.link && (
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-outline/70 self-center"
                  style={{ fontSize: '18px' }}
                >
                  arrow_forward_ios
                </span>
              )}
            </button>
            </Reveal>
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
