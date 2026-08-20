import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import MealDetailModal from '../components/calendar/MealDetailModal'
import Reveal from '../components/motion/Reveal'
import { useModal } from '../hooks/useModal'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { MEAL_SLOTS, MEAL_SLOT_LABEL, type MealPlan, type MealSlot, type User } from '../types'

/* ──────────────────────────────────────────────
   날짜

   전부 KST 기준 'YYYY-MM-DD' 문자열로 다룬다. Date 객체를 들고 다니면
   기기 타임존에 따라 하루가 밀린다 — 서버도 같은 표현을 쓴다.
   ────────────────────────────────────────────── */

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

function shift(date: string, days: number): string {
  return new Date(new Date(date + 'T00:00:00Z').getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/** 그 주 월요일. 한국에서 주는 월요일에 시작한다. */
function weekStart(date: string): string {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay() // 0=일
  return shift(date, dow === 0 ? -6 : 1 - dow)
}

/** 그 달 1일. */
function monthStart(date: string): string {
  return date.slice(0, 8) + '01'
}

/** 그 달의 일수. */
function daysInMonth(date: string): number {
  const [y, m] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 월 단위 이동. 말일 넘침을 피하려 1일 기준으로 계산한다. */
function shiftMonth(date: string, months: number): string {
  const [y, m] = date.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + months, 1))
  return d.toISOString().slice(0, 10)
}

/** 월요일 시작 격자에서 그 날짜가 몇 번째 칸인지 (0=월). */
function gridIndex(date: string): number {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay()
  return dow === 0 ? 6 : dow - 1
}

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

const DOW = ['월', '화', '수', '목', '금', '토', '일']

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
                  className="w-full min-h-[44px] flex items-center gap-2 text-left bg-surface-container-low rounded-xl px-3 py-2 active:scale-[0.98] transition-transform"
                >
                  <span className="flex-1 min-w-0 truncate text-sm font-medium text-on-surface">
                    {p.title}
                  </span>
                  {!!p.comment_count && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 text-xs text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
                      {p.comment_count}
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={() => onAdd(date, slot)}
                aria-label={`${date} ${MEAL_SLOT_LABEL[slot]} 식단 추가`}
                className="w-full min-h-[44px] flex items-center gap-1.5 rounded-xl px-3 text-sm text-outline active:scale-[0.98] transition-transform"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
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
   * 내 신원. AuthGuard 가 앱에 들어올 때 /auth/me 를 받아 localStorage 에
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
      return JSON.parse(localStorage.getItem('user') || 'null')
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
  // 어떤 주까지 스크롤을 맞춰줬는지. 식단을 추가해서 목록이 새로고침될 때마다
  // 화면을 잡아채면 안 된다 — 사용자가 보던 자리를 뺏는다.
  const scrolledFor = useRef<string | null>(null)
  const viewRef = useRef<View>('week')

  const days = useMemo(() => {
    const n = view === 'week' ? 7 : daysInMonth(anchor)
    return Array.from({ length: n }, (_, i) => shift(anchor, i))
  }, [anchor, view])
  const rangeEnd = days[days.length - 1]

  const load = useCallback(async () => {
    // 이미 한 번 보여준 뒤라면 이전 데이터를 그대로 두고 조용히 바꿔 끼운다.
    // D1 조회가 0.2초대라 스켈레톤이 깜빡였다 사라지는 게 더 거슬린다.
    if (!booted.current) setState('loading')
    try {
      const p = await api.get<MealPlan[]>('/calendar', {
        params: { from: anchor, to: rangeEnd },
      })
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
      // 하루 카드가 224px 이고 상단바(79px)·하단바(94px)를 빼면 한 화면에
      // 3일뿐이다. 주 전체는 1690px. 수요일만 돼도 오늘이 화면 밖이다.
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
            const node = todayRef.current
            if (!node || scrolledFor.current !== key) return
            const margin = parseFloat(getComputedStyle(node).scrollMarginTop) || 0
            window.scrollTo({ top: Math.max(0, docTop(node) - margin), behavior: 'auto' })
          }),
        )
      }
    } catch (e: any) {
      if (e?.response?.status === 401) {
        navigate('/login')
        return
      }
      setState('error')
    }
  }, [anchor, rangeEnd, navigate, today])

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    load()
  }, [load])

  /**
   * 월 보기에서 날짜를 누르면 펼쳐진 패널이 화면 밖일 수 있다.
   *
   * **정말 안 보일 때만** 움직인다. 이미 일부라도 보이는데 스크롤하면
   * 주별/월별 토글과 월 라벨이 화면 위로 밀려나서, 날짜 하나 눌렀을 뿐인데
   * 어느 보기에 있는지 모르게 된다.
   */
  useEffect(() => {
    if (view !== 'month' || !expanded) return
    requestAnimationFrame(() => {
      const el = expandedRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      // 하단 네비(94px)에 가려지는 부분도 '안 보이는' 것으로 친다.
      const fold = window.innerHeight - 94
      if (r.top < fold - 80) return
      el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
    })
  }, [view, expanded, reduced])

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

  const switchView = (next: View) => {
    if (next === view) return
    // 보고 있던 날짜 감각을 유지한다. 주→월이면 그 주가 속한 달, 월→주면 그 달 1일이 속한 주.
    setAnchor(next === 'month' ? monthStart(anchor) : weekStart(anchor))
    setExpanded(null)
    setView(next)
    // 주 보기로 돌아오면 다시 오늘로 맞춰준다.
    scrolledFor.current = null
    // 월 보기는 주 보기보다 훨씬 짧다. 스크롤을 유지하면 빈 화면이 뜬다.
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  /**
   * 기간 이동. 맨 위로 되돌린다.
   *
   * 스크롤을 그대로 두면 지난 주로 갔을 때 그 주의 금·토·일부터 보인다.
   * 이유 없는 위치다. 새 주는 월요일부터 보여준다 — 그 주에 오늘이 있으면
   * 아래 효과가 다시 오늘로 내려준다.
   */
  const jump = (nextAnchor: string) => {
    setAnchor(nextAnchor)
    // 가드를 푼다. 안 풀면 지난 주에 갔다 이번 주로 돌아왔을 때
    // "이 주는 이미 맞춰줬다" 로 판단해서 오늘로 안 내려간다.
    scrolledFor.current = null
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
  const goPrev = () => jump(view === 'week' ? shift(anchor, -7) : shiftMonth(anchor, -1))
  const goNext = () => jump(view === 'week' ? shift(anchor, 7) : shiftMonth(anchor, 1))
  const goToday = () => {
    jump(view === 'week' ? weekStart(today) : monthStart(today))
    setExpanded(view === 'month' ? today : null)
  }

  const closeDetail = () => {
    setOpenId(null)
    if (deepLinkId) navigate('/calendar', { replace: true })
  }

  /* ── 상태별 화면 ── */

  const label =
    view === 'week'
      ? `${anchor.slice(5).replace('-', '.')} – ${rangeEnd.slice(5).replace('-', '.')}`
      : `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`

  return (
    <>
      <div className="mb-6">
        <h2 className="font-headline font-bold text-4xl text-on-surface tracking-tight mb-2">식단</h2>
        <p className="text-on-surface-variant">가족이 뭘 먹을지 같이 정해요.</p>
      </div>

      {/* 주 / 월 전환 */}
      <div
        role="tablist"
        aria-label="보기 단위"
        className="flex gap-2 mb-4 bg-surface-container-high p-1.5 rounded-2xl"
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

      {/* 기간 이동 */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <button
          onClick={goPrev}
          aria-label={view === 'week' ? '지난 주' : '지난 달'}
          className="min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-full bg-surface-container-low active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-on-surface">chevron_left</span>
        </button>
        <button
          onClick={goToday}
          className="min-w-0 min-h-[48px] px-4 inline-flex items-center justify-center rounded-full bg-surface-container-low text-sm font-bold text-on-surface active:scale-95 transition-transform"
        >
          <span className="truncate">{label}</span>
        </button>
        <button
          onClick={goNext}
          aria-label={view === 'week' ? '다음 주' : '다음 달'}
          className="min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-full bg-surface-container-low active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-on-surface">chevron_right</span>
        </button>
      </div>

      {state === 'loading' ? (
        <div aria-busy="true" className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-surface-container-high animate-pulse" />
          ))}
        </div>
      ) : state === 'error' ? (
        <div className="text-center py-20" role="status">
          <span className="material-symbols-outlined text-tertiary text-5xl mb-4 block">error</span>
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
      {plans.length === 0 && (
        <p className="text-center text-sm text-on-surface-variant py-6">
          {view === 'week' ? '이번 주' : '이번 달'} 식단이 비어 있어요.{' '}
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
          <div className="bg-surface-container-lowest rounded-2xl p-3">
            <div className="grid grid-cols-7 mb-1">
              {DOW.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-on-surface-variant py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
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
