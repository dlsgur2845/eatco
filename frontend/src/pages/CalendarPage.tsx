import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import MealDetailModal from '../components/calendar/MealDetailModal'
import Reveal from '../components/motion/Reveal'
import { useModal } from '../hooks/useModal'
import { useReducedMotion } from '../hooks/useReducedMotion'
import {
  DOW,
  daysInMonth,
  gridIndex,
  kstToday,
  monthStart,
  periodLabel,
  shift,
  shiftMonth,
  weekStart,
} from '../components/calendar/dates'
import { MEAL_SLOTS, MEAL_SLOT_LABEL, type MealPlan, type MealSlot, type User } from '../types'

/**
 * 문서 기준 세로 위치. **transform 에 영향받지 않는다.**
 *
 * getBoundingClientRect 를 쓰면 등장 애니메이션(Reveal 이 부모 div 를
 * translateY 로 8px 움직인다)이 도는 동안 잰 값이 그만큼 어긋난다.
 * 실측에서 목표 88px 대신 80px, 심할 땐 12px 에 멈췄다.
 * offsetTop 은 레이아웃 값이라 애니메이션 중에도 확정적이다.
 */
function docTop(el: HTMLElement): number {
  let y = 0
  let n: HTMLElement | null = el
  while (n) {
    y += n.offsetTop
    n = n.offsetParent as HTMLElement | null
  }
  return y
}

/**
 * 하단 네비가 가리는 높이. BottomNav 는 `fixed` 라 스크롤 계산에 안 잡힌다.
 *
 * **상수로 두면 안 된다.** 예전엔 `const BOTTOM_NAV_H = 94` 였는데, 94px 은
 * `env(safe-area-inset-bottom)` 이 0 일 때의 값이다. BottomNav 의 패딩은
 * `max(1.5rem, env(safe-area-inset-bottom))` 이라 노치 iPhone 설치형에서는
 * **104px** 이다. 즉 이 앱의 주 사용 환경에서 10px 낙관적이었고, 하필 그 값이
 * 위 월 패널 가림 판정을 지키는 경계였다. 상단바 높이를 단일 출처로 만들면서
 * 없앤 바로 그 종류의 드리프트를 다시 들여놨던 셈이다. 매번 잰다.
 */
function bottomNavH(): number {
  return document.querySelector('nav')?.getBoundingClientRect().height ?? 94
}

type View = 'week' | 'month'

/* ──────────────────────────────────────────────
   식단 추가
   ────────────────────────────────────────────── */
function AddMealModal({
  date,
  slot,
  onClose,
  onSaved,
}: {
  date: string
  slot: MealSlot
  onClose: () => void
  onSaved: () => void
}) {
  const panelRef = useModal(true, onClose)
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t || saving) return
    setSaving(true)
    setErr('')
    try {
      await api.post('/calendar', { plan_date: date, meal_slot: slot, title: t, memo: memo.trim() || null })
      onSaved()
      onClose()
    } catch {
      setErr('등록하지 못했어요. 다시 시도해주세요.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-on-surface/40 backdrop-blur-sm">
      <form
        ref={panelRef as unknown as React.RefObject<HTMLFormElement>}
        tabIndex={-1}
        onSubmit={submit}
        className="w-full max-w-md bg-surface-container-lowest rounded-t-[2rem] sm:rounded-[2rem] p-6 outline-none"
      >
        <p className="text-xs text-on-surface-variant mb-1">
          {date} · {MEAL_SLOT_LABEL[slot]}
        </p>
        <h3 className="font-headline font-bold text-xl text-on-surface mb-5">뭘 먹을까요?</h3>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 김치찌개"
          maxLength={100}
          className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-on-surface placeholder:text-outline outline-none focus:ring-2 focus:ring-primary mb-3"
        />
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="메모 (선택) · 예: 두부 사와야 함"
          rows={2}
          maxLength={500}
          className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-on-surface placeholder:text-outline outline-none focus:ring-2 focus:ring-primary resize-none"
        />

        {err && (
          <p role="status" className="text-xs text-error mt-2">
            {err}
          </p>
        )}

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[48px] flex items-center justify-center rounded-full bg-surface-container-high text-on-surface font-bold active:scale-95 transition-transform"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="flex-1 min-h-[48px] flex items-center justify-center rounded-full bg-primary text-on-primary font-bold active:scale-95 transition-transform disabled:opacity-40"
          >
            {saving ? '올리는 중...' : '올리기'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ──────────────────────────────────────────────
   하루 (끼니 3줄)

   비어 있어도 자리를 남긴다. 빈 자리가 "적으라" 는 신호다.
   ────────────────────────────────────────────── */
function DaySlots({
  date,
  byCell,
  onOpen,
  onAdd,
}: {
  date: string
  byCell: Map<string, MealPlan[]>
  onOpen: (id: string) => void
  onAdd: (date: string, slot: MealSlot) => void
}) {
  return (
    <div className="space-y-2">
      {MEAL_SLOTS.map((slot) => {
        const cell = byCell.get(`${date}|${slot}`) ?? []
        return (
          <div key={slot} className="flex items-start gap-3">
            <span className="shrink-0 w-8 pt-2 text-xs font-semibold text-on-surface-variant">
              {MEAL_SLOT_LABEL[slot]}
            </span>
            <div className="flex-1 min-w-0 space-y-1.5">
              {cell.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onOpen(p.id)}
                  className="w-full min-h-[48px] flex items-center gap-2 text-left bg-surface-container-low rounded-xl px-3 py-2 active:scale-[0.98] transition-transform"
                >
                  <span className="flex-1 min-w-0 truncate text-sm font-medium text-on-surface">
                    {p.title}
                  </span>
                  {!!p.comment_count && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 text-xs text-on-surface-variant">
                      <span aria-hidden="true" className="material-symbols-outlined text-[14px]">chat_bubble</span>
                      {p.comment_count}
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={() => onAdd(date, slot)}
                aria-label={`${date} ${MEAL_SLOT_LABEL[slot]} 식단 추가`}
                className="w-full min-h-[48px] flex items-center gap-1.5 rounded-xl px-3 text-sm text-outline active:scale-[0.98] transition-transform"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
                추가
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ──────────────────────────────────────────────
   메인
   ────────────────────────────────────────────── */
export default function CalendarPage() {
  const navigate = useNavigate()
  const { id: deepLinkId } = useParams()

  const today = useMemo(() => kstToday(), [])
  const [view, setView] = useState<View>('week')
  // 주 보기면 그 주 월요일, 월 보기면 그 달 1일.
  const [anchor, setAnchor] = useState(() => weekStart(kstToday()))
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  // 첫 로드와 재조회를 구분한다. 주/월을 토글할 때마다 전체를 스켈레톤으로
  // 갈아치우면 제목도 토글도 사라져서 화면이 통째로 깜빡인다.
  const booted = useRef(false)
  /**
   * 내 신원. AuthGuard 가 앱에 들어올 때 /auth/me 를 받아 sessionStorage 에
   * 넣어둔다. 여기서 또 부르면 주를 넘길 때마다 왕복이 하나씩 더 붙는다.
   *
   * 실측(iPhone 390x844): /auth/me 408ms, /api/calendar 243ms.
   * Promise.all 로 둘을 기다려서 화면이 426ms 걸렸는데, 정작 느린 쪽이
   * 안 써도 되는 /auth/me 였다.
   *
   * 쓰는 곳은 댓글 삭제 버튼 하나뿐(cm.created_by === me.id)이고, 없으면
   * 버튼이 안 보일 뿐이다. 삭제 권한은 서버가 따로 검사한다.
   */
  const me = useMemo<User | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('user') || 'null')
    } catch {
      return null
    }
  }, [])
  const [adding, setAdding] = useState<{ date: string; slot: MealSlot } | null>(null)
  const [openId, setOpenId] = useState<string | null>(deepLinkId ?? null)
  // 월 보기에서 펼쳐 놓은 날짜. 폰 화면 격자 칸에는 메뉴 이름이 안 들어간다.
  const [expanded, setExpanded] = useState<string | null>(null)

  const reduced = useReducedMotion()
  const todayRef = useRef<HTMLElement | null>(null)
  const expandedRef = useRef<HTMLElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  // 어떤 주까지 스크롤을 맞춰줬는지. 식단을 추가해서 목록이 새로고침될 때마다
  // 화면을 잡아채면 안 된다 — 사용자가 보던 자리를 뺏는다.
  const scrolledFor = useRef<string | null>(null)
  const viewRef = useRef<View>('week')
  // 응답 순서 보호. 예전엔 없었고, ◀ 를 연타하면 늦게 뜬 옛 응답이 나중에
  // 도착해 **라벨은 3주 전인데 목록은 1주 전**이 될 수 있었다. 컨트롤이
  // 1000px 밖이라 실제로 누르기 어려웠을 뿐 경로는 열려 있었다.
  const reqId = useRef(0)
  // 컨트롤 바를 숨길지. 아래로 읽는 동안 물러나고, 위로 튕기면 돌아온다.
  const [barHidden, setBarHidden] = useState(false)
  const lastY = useRef(0)

  /**
   * 컨트롤 바 아래의 가려지지 않는 y 좌표(뷰포트 기준).
   *
   * 상수를 안 쓰고 매번 잰다. 아이콘 폰트(Material Symbols)가 늦게 오면
   * `chevron_left` 가 **글자 그대로** 그려져 바 높이가 잠깐 두 배가 되는데,
   * 하필 그때가 아래 스크롤 계산이 도는 창이다. 살아있는 값을 쓰면 안 어긋난다.
   */
  const contentTop = useCallback(() => {
    const header = document.querySelector('header')?.getBoundingClientRect().height ?? 0
    const bar = barRef.current?.offsetHeight ?? 0
    return header + bar
  }, [])

  /**
   * 앱이 사용자를 옮길 때 쓰는 스크롤.
   *
   * 두 가지를 같이 한다: (1) 스크롤 리스너가 이 점프를 "사용자가 아래로
   * 스크롤했다"로 오해해 바를 숨기지 않도록 기준점을 갱신하고, (2) 바를
   * 보이는 채로 둔다. 앱이 옮겨놨으면 컨트롤은 손 닿는 곳에 있어야 한다.
   */
  const scrollToY = useCallback((top: number) => {
    const y = Math.max(0, Math.round(top))
    lastY.current = y
    setBarHidden(false)
    window.scrollTo({ top: y, behavior: 'auto' })
  }, [])

  /** 오늘 카드를 컨트롤 바 바로 아래에 맞춘다. */
  const scrollToToday = useCallback(() => {
    const node = todayRef.current
    if (!node) return
    scrollToY(docTop(node) - contentTop() - 8)
  }, [contentTop, scrollToY])

  const days = useMemo(() => {
    const n = view === 'week' ? 7 : daysInMonth(anchor)
    return Array.from({ length: n }, (_, i) => shift(anchor, i))
  }, [anchor, view])
  const rangeEnd = days[days.length - 1]

  const load = useCallback(async () => {
    // 이미 한 번 보여준 뒤라면 이전 데이터를 그대로 두고 조용히 바꿔 끼운다.
    // D1 조회가 0.2초대라 스켈레톤이 깜빡였다 사라지는 게 더 거슬린다.
    if (!booted.current) setState('loading')
    const id = ++reqId.current
    try {
      const p = await api.get<MealPlan[]>('/calendar', {
        params: { from: anchor, to: rangeEnd },
      })
      // 더 최근 요청이 이미 나갔다. 이 응답은 버린다 — 안 그러면 라벨과
      // 목록이 다른 기간을 가리킨다.
      if (id !== reqId.current) return
      setPlans(p.data)
      booted.current = true
      setState('ready')

      // 오늘로 내려주는 일을 여기서 한다.
      //
      // useEffect 의존성으로 맞추려다 여러 번 어긋났다. anchor 는 클릭 즉시
      // 바뀌는데 데이터는 나중에 오고, 그 사이에 위치를 재면 이전 기간의
      // 레이아웃을 기준으로 삼는다(실측 68px 오차). 여기서는 기간과 데이터가
      // 반드시 일치한다.
      //
      // 하루 카드가 224px 이고 상단바·하단바를 빼면 한 화면에 3일뿐이다.
      // 주 전체는 1690px. 수요일만 돼도 오늘이 화면 밖이다.
      // 이번 주가 아니면 건드리지 않는다 — 지난 주를 보러 간 사람을 오늘로
      // 끌고 오면 안 된다.
      const key = 'week:' + anchor
      if (
        viewRef.current === 'week' &&
        today >= anchor &&
        today <= rangeEnd &&
        scrolledFor.current !== key
      ) {
        scrolledFor.current = key
        // 두 프레임 기다린다. 첫 프레임에 DOM 이 붙고 두 번째에 레이아웃이
        // 확정된다. 위치는 docTop(offsetTop 누적)으로 재서 등장 애니메이션의
        // transform 에 영향받지 않게 한다.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (scrolledFor.current !== key) return
            scrollToToday()
          }),
        )
      }
    } catch (e: any) {
      if (id !== reqId.current) return
      if (e?.response?.status === 401) {
        navigate('/login')
        return
      }
      setState('error')
    }
  }, [anchor, rangeEnd, navigate, today, scrollToToday])

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    load()
  }, [load])

  /**
   * 컨트롤 바를 스크롤 방향에 따라 넣고 뺀다.
   *
   * 아래로 읽는 동안은 0px 을 쓰고, 위로 한 번 튕기면 돌아온다. Material 이
   * 이 구성에 규정한 동작이고, 상시 고정하면 설치형 PWA 에서 화면의 43% 가
   * 크롬이 된다(실측: 콘텐츠 창 614px, 두 줄 바 136px).
   *
   * **한 프레임의 이동량이 아니라 같은 방향으로 누적한 거리로 판단한다.**
   * 처음엔 프레임당 델타를 임계값과 직접 비교하고 기준점을 매 프레임 갱신했는데,
   * 그러면 델타가 절대 쌓이지 않아서 **한 프레임에 12px 넘게 움직여야만** 숨었다.
   * rAF 60Hz 기준 초당 720px, ProMotion 120Hz 에서는 초당 1440px 이다.
   * 사람이 글 읽으며 스크롤하는 속도(초당 200~600px)로는 영영 안 숨는다.
   * 시뮬레이션으로 확인했다 — 프레임당 12px 로 2400px 을 굴려도 0번 숨었다.
   *
   * 지금은 방향이 바뀌면 누적을 버리고, 같은 방향으로 64px 내려가면 숨기고
   * 32px 올라오면 되돌린다. 되돌리는 쪽을 더 민감하게 둔 건 컨트롤이 필요해서
   * 올리는 동작이기 때문이다. 맨 위 근처(48px)에서는 무조건 보인다.
   */
  useEffect(() => {
    lastY.current = Math.max(0, window.scrollY)
    let acc = 0
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        // iOS 고무줄 스크롤은 음수 scrollY 를 준다. 0 으로 눌러 둔다.
        const y = Math.max(0, window.scrollY)
        const dy = y - lastY.current
        lastY.current = y
        if (y < 48) {
          acc = 0
          setBarHidden(false)
          return
        }
        if (dy === 0) return
        // 방향이 바뀌면 반대 방향으로 쌓아둔 건 버린다.
        if (Math.sign(dy) !== Math.sign(acc)) acc = 0
        acc += dy
        if (acc >= 64) {
          acc = 0
          setBarHidden(true)
        } else if (acc <= -32) {
          acc = 0
          setBarHidden(false)
        }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /**
   * 월 보기에서 날짜를 누르면 펼쳐진 패널이 화면 밖일 수 있다.
   *
   * **정말 안 보일 때만** 움직인다. 이미 일부라도 보이는데 스크롤하면
   * 사용자가 보던 자리를 뺏는다.
   *
   * 예전 검사는 `if (r.top < fold - 80) return` 하나였고 **상한이 없었다.**
   * 그래서 패널이 상단바 뒤에 완전히 숨어 있어도(r.top 이 음수여도)
   * "보인다"로 판정하고 아무것도 안 했다.
   *
   * scrollIntoView({block:'nearest'}) 도 버렸다. 요소가 아래에 있으면 그건
   * **아래쪽 가장자리**를 맞추면서 scroll-margin-bottom 을 쓰는데 그 값이 0
   * 이었고, BottomNav 는 fixed 라 스크롤포트에 포함되지도 않는다. 실측 결과
   * 격자 마지막 줄 날짜를 누르면 패널 아래 94px 이 잘려서 저녁 칸이 안 보였다.
   * 위아래 경계를 직접 계산한다.
   */
  const revealExpanded = useCallback(() => {
    requestAnimationFrame(() => {
      const el = expandedRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const top = contentTop()
      const fold = window.innerHeight - bottomNavH()
      // 위아래 모두에 가리지 않고 실제로 보이는 높이.
      const visible = Math.min(r.bottom, fold) - Math.max(r.top, top)
      // 들어갈 자리가 있으면 패널 전체를, 자리가 모자라면 자리를 꽉 채우기를 요구한다.
      //
      // 예전엔 `visible >= Math.min(r.height, 120)` 이었다. 224px 짜리 패널에서
      // 임계값이 120 이라 **104px 이 잘려도 통과**했다. 실제 기본 경로가 그랬다:
      // 월 보기는 문서가 화면보다 짧아 scrollY 가 0 에 고정되는데, 그 상태로
      // 격자 아래쪽 날짜를 누르면 visible=135 >= 120 이라 스크롤을 건너뛰고
      // 89px 이 하단바 뒤에 남았다. 저녁 칸이 안 보이는 그 증상 그대로다.
      // 내가 Playwright 로 "잘린 높이 0px" 을 받았던 건 하필 최대 스크롤 위치에서
      // 눌렀기 때문이었다.
      const room = fold - top
      const need = Math.min(r.height, room)
      if (visible >= need - 2) return
      // 앱이 옮기는 스크롤이므로 컨트롤 바는 보이는 채로 둔다 (scrollToY 와 같은 계약).
      lastY.current = Math.max(0, window.scrollY + r.top - top - 8)
      setBarHidden(false)
      window.scrollTo({
        top: lastY.current,
        behavior: reduced ? 'auto' : 'smooth',
      })
    })
  }, [reduced, contentTop])

  useEffect(() => {
    if (view !== 'month' || !expanded) return
    revealExpanded()
  }, [view, expanded, revealExpanded])

  const byCell = useMemo(() => {
    const m = new Map<string, MealPlan[]>()
    for (const p of plans) {
      const k = `${p.plan_date}|${p.meal_slot}`
      const arr = m.get(k)
      if (arr) arr.push(p)
      else m.set(k, [p])
    }
    return m
  }, [plans])

  /** 날짜별 식단 수. 월 보기 점 표시용. */
  const countByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of plans) m.set(p.plan_date, (m.get(p.plan_date) ?? 0) + 1)
    return m
  }, [plans])

  /**
   * 컨트롤 바가 정확히 고정되는 스크롤 위치.
   *
   * 기간을 넘길 때 `scrollTo(0)` 을 하면 바가 flow 위치로 되돌아가면서
   * **방금 누른 버튼이 화면에서 아래로 튄다.** ◀ 를 세 번 누르면 세 번 다시
   * 조준해야 한다. 여기로 보내면 바가 화면에서 전혀 움직이지 않고, 새 기간도
   * 첫날부터 보인다.
   */
  const barRestY = useCallback(() => {
    const bar = barRef.current
    if (!bar) return 0
    const header = document.querySelector('header')?.getBoundingClientRect().height ?? 0
    return Math.max(0, docTop(bar) - header)
  }, [])

  const switchView = (next: View) => {
    if (next === view) return
    // 보고 있던 날짜 감각을 유지한다.
    //
    // 예전엔 월→주에서 `weekStart(anchor)` 를 썼는데, 그때 anchor 는 그 달 1일이라
    // **주별→월별→주별 왕복이 사람을 과거로 보냈다.** 8/21 에서 주별→월별 하면
    // anchor 가 8/01, 다시 주별로 오면 weekStart('2026-08-01') = 7/27 — 3주 전이다.
    // 두 번 탭했을 뿐인데 조용히 지난달에 가 있고, 그 주엔 오늘이 없어서
    // 자동 스크롤도 안 돈다.
    //
    // 그 달 안에 오늘이 있으면 오늘 주로, 아니면 펼쳐 보던 날 주로 되돌린다.
    if (next === 'month') {
      setAnchor(monthStart(anchor))
    } else {
      const monthEnd = shift(anchor, daysInMonth(anchor) - 1)
      const focus = expanded ?? (today >= anchor && today <= monthEnd ? today : anchor)
      setAnchor(weekStart(focus))
    }
    setExpanded(null)
    setView(next)
    // 주 보기로 돌아오면 다시 오늘로 맞춰준다.
    scrolledFor.current = null
    // 월 보기는 주 보기보다 훨씬 짧다. 스크롤을 유지하면 빈 화면이 뜬다.
    scrollToY(barRestY())
  }

  /**
   * 기간 이동. 새 기간의 첫날부터 보여준다.
   *
   * 스크롤을 그대로 두면 지난 주로 갔을 때 그 주의 금·토·일부터 보인다.
   * 이유 없는 위치다 — 그 주에 오늘이 있으면 load() 가 다시 오늘로 내려준다.
   */
  const jump = (nextAnchor: string) => {
    setAnchor(nextAnchor)
    // 펼쳐둔 날짜를 반드시 접는다. `switchView` 는 접는데 여기서 안 접어서,
    // 월 보기에서 8/21 을 펼친 채 ▶ 를 누르면 **9월 격자 아래에 "8월 21일"
    // 패널이 그대로 남았다.** 그 패널의 "추가" 는 화면에 없는 날짜(8/21)로
    // 식단을 등록한다. 컨트롤을 상시 도달 가능하게 만들면서 실현된 경로다.
    setExpanded(null)
    // 가드를 푼다. 안 풀면 지난 주에 갔다 이번 주로 돌아왔을 때
    // "이 주는 이미 맞춰줬다" 로 판단해서 오늘로 안 내려간다.
    scrolledFor.current = null
    scrollToY(barRestY())
  }
  const goPrev = () => jump(view === 'week' ? shift(anchor, -7) : shiftMonth(anchor, -1))
  const goNext = () => jump(view === 'week' ? shift(anchor, 7) : shiftMonth(anchor, 1))

  /**
   * 오늘로 돌아가기.
   *
   * **여기 버그가 있었다.** 예전에는 무조건 `jump(weekStart(today))` 였는데,
   * 이미 이번 주를 보고 있으면 `setAnchor` 가 같은 문자열을 받아 React 가
   * 리렌더를 건너뛴다 → `load` 의 identity 가 그대로 → `useEffect([load])` 가
   * 안 돌아 `load()` 가 호출되지 않는다 → 오늘로 내려주는 코드가 영영 안 돈다.
   * 그런데 `scrollTo({top:0})` 은 이미 실행된 뒤다.
   *
   * 결과: 이번 주에서 "오늘로"를 누르면 오늘이 아니라 **월요일(맨 위)** 로 갔다.
   * 실측으로 확인했다 — 오늘로부터 1207px, 그것도 반대 방향.
   *
   * 지금까지 안 보였던 건 이 버튼을 누르려면 이미 맨 위에 있어야 했기 때문이다.
   * 컨트롤을 어디서나 닿게 만드는 순간 이게 대표 실패 모드가 된다.
   */
  const goToday = () => {
    const target = view === 'week' ? weekStart(today) : monthStart(today)
    if (view === 'month') {
      if (target !== anchor) {
        jump(target)
        setExpanded(today)
        return
      }
      if (expanded === today) {
        // **같은 함정이 월 보기에도 있었다.** 이미 이번 달이고 오늘이 이미
        // 펼쳐져 있으면 `setExpanded(today)` 가 같은 값이라 React 가 리렌더를
        // 건너뛰고, 펼침 스크롤 이펙트가 안 돌아서 버튼이 아무것도 안 했다.
        // 주 보기만 고치고 월 보기를 놓쳤던 것이다. 직접 맞춘다.
        revealExpanded()
        return
      }
      setExpanded(today)
      return
    }
    if (target === anchor) {
      // 이미 이번 주다. load() 가 안 돌 것이므로 직접 맞춘다.
      scrollToToday()
      return
    }
    jump(target)
  }

  const closeDetail = () => {
    setOpenId(null)
    if (deepLinkId) navigate('/calendar', { replace: true })
  }

  /* ── 상태별 화면 ── */

  const label = periodLabel(view, anchor, rangeEnd, today)

  return (
    <>
      {/* 컨트롤 바.

          제목("식단")과 부제를 지웠다. 자동 스크롤 때문에 0.2초 보이고
          사라졌고, 수요일 이후로는 아예 안 보였다. 어느 화면인지는 하단바의
          '식단' 칩(초록 배경, 4.58:1, scale-110)이 이미 알려준다.

          Reveal 로 감싸면 안 된다 — .eatco-reveal 이 transform 을 걸어
          조상이 sticky 의 기준 블록이 되면서 첫 260ms 동안 고정이 죽는다.

          그림자 대신 hairline: TopAppBar 가 이미 40px 블러 그림자를 z-50 에서
          뿌리므로 여기 또 넣으면 64px 간격의 이중 띠가 된다. 그리고 bg-surface
          (#f8faf8) 와 흰 카드(#ffffff)는 1.05:1 이라 경계가 안 보여서, 카드가
          바 속으로 녹아 사라지는 것처럼 보인다. outline-variant 는 1.62:1 이고
          DESIGN.md §1 이 구분선 전용으로 승인한 토큰이다. */}
      <div
        ref={barRef}
        data-hidden={barHidden}
        className="cal-subbar -mx-6 px-6 pt-2 pb-3 mb-4 bg-surface border-b border-outline-variant"
      >
        {/* 주 / 월 전환.

            라벨을 '주/월' 로 줄이지 않는다. 이 화면의 DOW 가
            ['월','화','수','목','금','토','일'] 이고 월 보기 요일 스트립이
            이 바 바로 아래에 '월 화 수 목 금 토 일' 을 그린다. [주][월] 은
            요일 칩 두 개로 읽힌다. 게다가 '주별' 은 28px 라 이미 48px 터치
            타겟보다 좁아서, 줄여도 8px 밖에 못 번다. 대신 날짜 라벨을 줄였다
            (dates.ts 의 periodLabel). */}
        <div
          role="tablist"
          aria-label="보기 단위"
          className="flex gap-2 mb-2 bg-surface-container-high p-1.5 rounded-2xl"
        >
          {([['week', '주별'], ['month', '월별']] as const).map(([k, t]) => (
            <button
              key={k}
              role="tab"
              aria-selected={view === k}
              onClick={() => switchView(k)}
              className={`flex-1 min-h-[48px] inline-flex items-center justify-center rounded-xl font-bold text-sm transition-colors ${
                view === k ? 'bg-surface-container-lowest text-on-surface' : 'text-on-surface-variant'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* 기간 이동. tablist 밖에 둔다 — tablist 의 자식은 tab 만 허용된다. */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={goPrev}
            aria-label={view === 'week' ? '지난 주' : '지난 달'}
            className="shrink-0 min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-full bg-surface-container-low active:scale-95 transition-transform"
          >
            {/* w-6 + overflow-hidden 은 FOUT 방어다. Material Symbols 가 오기
                전에는 'chevron_left' 가 글자 그대로 ~85px 로 그려져서 줄이
                넘치고 바 높이가 두 배가 된다 — 하필 스크롤 계산이 도는 창이다. */}
            <span aria-hidden="true" className="material-symbols-outlined text-on-surface inline-block w-6 overflow-hidden">
              chevron_left
            </span>
          </button>
          <button
            onClick={goToday}
            aria-label={`${label} · 오늘로 이동`}
            className="flex-1 min-w-0 min-h-[48px] px-4 inline-flex items-center justify-center rounded-full bg-surface-container-low text-sm font-bold text-on-surface active:scale-95 transition-transform"
          >
            <span className="truncate">{label}</span>
          </button>
          <button
            onClick={goNext}
            aria-label={view === 'week' ? '다음 주' : '다음 달'}
            className="shrink-0 min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-full bg-surface-container-low active:scale-95 transition-transform"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-on-surface inline-block w-6 overflow-hidden">
              chevron_right
            </span>
          </button>
        </div>
      </div>

      {state === 'loading' ? (
        <div aria-busy="true" className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-surface-container-high animate-pulse" />
          ))}
        </div>
      ) : state === 'error' ? (
        <div className="text-center py-20" role="status">
          <span aria-hidden="true" className="material-symbols-outlined text-tertiary text-5xl mb-4 block">error</span>
          <p className="text-on-surface-variant mb-6">식단을 불러오지 못했어요.</p>
          <button
            onClick={load}
            className="min-h-[48px] px-6 inline-flex items-center justify-center rounded-full bg-on-surface text-surface font-bold active:scale-95 transition-transform"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <>
      {/* "이번 주" 라고 못박여 있었다. 3주 전으로 넘겨도 "이번 주 식단이
          비어 있어요" 라고 말했다. 기간 이동이 쉬워질수록 더 자주 틀린다. */}
      {plans.length === 0 && (
        <p className="text-center text-sm text-on-surface-variant py-6">
          {label} 식단이 비어 있어요.{' '}
          {view === 'week' ? '아래에서 끼니를 눌러 추가하세요.' : '날짜를 눌러 추가하세요.'}
        </p>
      )}

      {view === 'week' ? (
        /* ── 주별: 날짜 카드 7장 ── */
        <div className="space-y-3">
          {days.map((d, i) => {
            const isToday = d === today
            const past = d < today
            return (
              <Reveal key={d} index={i}>
                <section
                  ref={isToday ? todayRef : undefined}
                  className={`scroll-anchor rounded-2xl p-5 bg-surface-container-lowest ${
                    isToday ? 'ring-2 ring-primary' : ''
                  } ${past && !isToday ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className={`font-headline font-bold ${isToday ? 'text-primary' : 'text-on-surface'}`}>
                      {DOW[gridIndex(d)]}
                    </span>
                    <span className="text-xs text-on-surface-variant">{d.slice(5).replace('-', '.')}</span>
                    {isToday && <span className="text-xs font-bold text-primary">오늘</span>}
                  </div>
                  <DaySlots date={d} byCell={byCell} onOpen={setOpenId} onAdd={(dt, sl) => setAdding({ date: dt, slot: sl })} />
                </section>
              </Reveal>
            )
          })}
        </div>
      ) : (
        /* ── 월별: 격자 + 탭하면 하루 펼침 ──
             칸에는 날짜와 점만 둔다. 360px 화면에서 칸당 45px 라
             메뉴 이름은 두 글자도 안 들어간다. */
        <>
          {/* 칸 폭이 실측 42px 이었다 (min-h-[48px] 는 높이만 잡는다).
              7열 격자에서 폭은 나눗셈 결과라 패딩과 gap 으로만 조절된다:
                390px 화면 → 본문 342px, p-3(24) + gap-1(24) 를 빼면 294/7 = 42px
                p-2(16) + gap-0.5(12) 로 줄이면        (342-28)/7 = 44.8px
              **48px 은 이 폭에서 기하학적으로 불가능하다** (7×48=336 > 318).
              iOS HIG 하한인 44 를 목표로 잡는다. */}
          <div className="bg-surface-container-lowest rounded-2xl p-2">
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {DOW.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-on-surface-variant py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {/* 1일이 월요일이 아니면 앞을 비운다 */}
              {Array.from({ length: gridIndex(anchor) }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {days.map((d) => {
                const n = countByDate.get(d) ?? 0
                const isToday = d === today
                const isOpen = expanded === d
                return (
                  <button
                    key={d}
                    onClick={() => setExpanded(isOpen ? null : d)}
                    aria-label={`${d} 식단 ${n}건`}
                    aria-expanded={isOpen}
                    className={`min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-xl transition-colors ${
                      isOpen ? 'bg-primary text-on-primary' : isToday ? 'ring-2 ring-primary' : ''
                    } ${!isOpen && d < today ? 'opacity-50' : ''}`}
                  >
                    <span className={`text-sm font-medium ${isOpen ? 'text-on-primary' : 'text-on-surface'}`}>
                      {Number(d.slice(8))}
                    </span>
                    <span className="flex gap-0.5 h-1.5 items-center">
                      {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                        <span
                          key={i}
                          className={`w-1 h-1 rounded-full ${isOpen ? 'bg-on-primary' : 'bg-primary'}`}
                        />
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {expanded && (
            <section ref={expandedRef} className="scroll-anchor mt-3 rounded-2xl p-5 bg-surface-container-lowest">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="font-headline font-bold text-on-surface">
                  {Number(expanded.slice(5, 7))}월 {Number(expanded.slice(8))}일
                </span>
                <span className="text-xs text-on-surface-variant">{DOW[gridIndex(expanded)]}요일</span>
                {expanded === today && <span className="text-xs font-bold text-primary">오늘</span>}
              </div>
              <DaySlots
                date={expanded}
                byCell={byCell}
                onOpen={setOpenId}
                onAdd={(dt, sl) => setAdding({ date: dt, slot: sl })}
              />
            </section>
          )}

          {!expanded && (
            <p className="text-center text-xs text-on-surface-variant mt-4">
              날짜를 누르면 그 날 식단이 펼쳐져요.
            </p>
          )}
        </>
      )}

        </>
      )}

      {adding && (
        <AddMealModal
          date={adding.date}
          slot={adding.slot}
          onClose={() => setAdding(null)}
          onSaved={load}
        />
      )}

      {openId && (
        <MealDetailModal planId={openId} me={me} onClose={closeDetail} onChanged={load} />
      )}
    </>
  )
}
