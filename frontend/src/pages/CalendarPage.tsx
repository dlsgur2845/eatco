import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import MealDetailModal from '../components/calendar/MealDetailModal'
import Reveal from '../components/motion/Reveal'
import { useModal } from '../hooks/useModal'
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

const DOW = ['월', '화', '수', '목', '금', '토', '일']

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
   메인
   ────────────────────────────────────────────── */
export default function CalendarPage() {
  const navigate = useNavigate()
  // 알림에서 /calendar/<id> 로 들어오면 상세를 바로 연다.
  const { id: deepLinkId } = useParams()

  const today = useMemo(() => kstToday(), [])
  const [start, setStart] = useState(() => weekStart(kstToday()))
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [me, setMe] = useState<User | null>(null)
  const [adding, setAdding] = useState<{ date: string; slot: MealSlot } | null>(null)
  const [openId, setOpenId] = useState<string | null>(deepLinkId ?? null)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => shift(start, i)), [start])
  const end = days[6]

  const load = useCallback(async () => {
    setState('loading')
    try {
      const [p, u] = await Promise.all([
        api.get<MealPlan[]>('/calendar', { params: { from: start, to: end } }),
        api.get<User>('/auth/me'),
      ])
      setPlans(p.data)
      setMe(u.data)
      setState('ready')
    } catch (e: any) {
      if (e?.response?.status === 401) {
        navigate('/login')
        return
      }
      setState('error')
    }
  }, [start, end, navigate])

  useEffect(() => {
    load()
  }, [load])

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

  const closeDetail = () => {
    setOpenId(null)
    // 딥링크로 들어왔으면 URL 도 되돌린다.
    if (deepLinkId) navigate('/calendar', { replace: true })
  }

  /* ── 상태별 화면 ── */

  if (state === 'loading') {
    return (
      <div aria-busy="true" className="space-y-4">
        <div className="h-10 w-40 rounded-xl bg-surface-container-high animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-surface-container-high animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
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
    )
  }

  const isEmptyWeek = plans.length === 0

  return (
    <>
      <div className="mb-6">
        <h2 className="font-headline font-bold text-4xl text-on-surface tracking-tight mb-2">식단</h2>
        <p className="text-on-surface-variant">가족이 뭘 먹을지 같이 정해요.</p>
      </div>

      {/* 주간 이동 */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <button
          onClick={() => setStart(shift(start, -7))}
          aria-label="지난 주"
          className="min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-full bg-surface-container-low active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-on-surface">chevron_left</span>
        </button>
        <button
          onClick={() => setStart(weekStart(today))}
          className="min-w-0 min-h-[48px] px-4 inline-flex items-center justify-center rounded-full bg-surface-container-low text-sm font-bold text-on-surface active:scale-95 transition-transform"
        >
          <span className="truncate">
            {start.slice(5).replace('-', '.')} – {end.slice(5).replace('-', '.')}
          </span>
        </button>
        <button
          onClick={() => setStart(shift(start, 7))}
          aria-label="다음 주"
          className="min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-full bg-surface-container-low active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-on-surface">chevron_right</span>
        </button>
      </div>

      {isEmptyWeek && (
        <p className="text-center text-sm text-on-surface-variant py-6">
          이번 주 식단이 비어 있어요. 아래에서 끼니를 눌러 추가하세요.
        </p>
      )}

      {/* 날짜별 카드. 끼니 3줄은 비어 있어도 자리를 남긴다 — 빈 자리가 입력 유도다. */}
      <div className="space-y-3">
        {days.map((d, i) => {
          const isToday = d === today
          const past = d < today
          return (
            <Reveal key={d} index={i}>
              <section
                className={`rounded-2xl p-5 ${
                  isToday ? 'bg-surface-container-lowest ring-2 ring-primary' : 'bg-surface-container-lowest'
                } ${past && !isToday ? 'opacity-60' : ''}`}
              >
                <div className="flex items-baseline gap-2 mb-3">
                  <span className={`font-headline font-bold ${isToday ? 'text-primary' : 'text-on-surface'}`}>
                    {DOW[i]}
                  </span>
                  <span className="text-xs text-on-surface-variant">{d.slice(5).replace('-', '.')}</span>
                  {isToday && <span className="text-xs font-bold text-primary">오늘</span>}
                </div>

                <div className="space-y-2">
                  {MEAL_SLOTS.map((slot) => {
                    const cell = byCell.get(`${d}|${slot}`) ?? []
                    return (
                      <div key={slot} className="flex items-start gap-3">
                        <span className="shrink-0 w-8 pt-2 text-xs font-semibold text-on-surface-variant">
                          {MEAL_SLOT_LABEL[slot]}
                        </span>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {cell.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => setOpenId(p.id)}
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
                            onClick={() => setAdding({ date: d, slot })}
                            aria-label={`${d} ${MEAL_SLOT_LABEL[slot]} 식단 추가`}
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
              </section>
            </Reveal>
          )
        })}
      </div>

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
