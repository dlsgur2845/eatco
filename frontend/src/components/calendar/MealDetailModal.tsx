import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../../api/client'
import { useModal } from '../../hooks/useModal'
import { MEAL_SLOT_LABEL, type MealPlanDetail, type User } from '../../types'

/**
 * 식단 상세 + 댓글.
 *
 * useModal 을 쓰는 이유는 Android 뒤로가기다. 홈화면에 설치된 PWA 에서
 * 모달이 히스토리를 안 가지면 뒤로가기가 라우트를 팝하고 앱이 그냥 닫힌다.
 * 댓글을 반쯤 쓰다가 뒤로가기를 누르면 앱이 종료된다는 뜻이다.
 */
export default function MealDetailModal({
  planId,
  me,
  onClose,
  onChanged,
}: {
  planId: string
  me: User | null
  onClose: () => void
  onChanged: () => void
}) {
  const panelRef = useModal(true, onClose)
  const [detail, setDetail] = useState<MealPlanDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const r = await api.get<MealPlanDetail>(`/calendar/${planId}`)
      setDetail(r.data)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [planId])

  useEffect(() => {
    load()
  }, [load])

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = body.trim()
    if (!text || posting) return
    setPosting(true)
    setErr('')
    try {
      await api.post(`/calendar/${planId}/comments`, { body: text })
      setBody('')
      await load()
      onChanged()
      // 새 댓글이 목록 아래에 붙는다. 보이게 스크롤한다.
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'nearest' }))
    } catch {
      setErr('댓글을 남기지 못했어요. 다시 시도해주세요.')
    } finally {
      setPosting(false)
    }
  }

  const removeComment = async (cid: string) => {
    try {
      await api.delete(`/calendar/comments/${cid}`)
      await load()
      onChanged()
    } catch {
      setErr('댓글을 지우지 못했어요.')
    }
  }

  const removePlan = async () => {
    try {
      await api.delete(`/calendar/${planId}`)
      onChanged()
      onClose()
    } catch {
      setErr('식단을 지우지 못했어요.')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-on-surface/40 backdrop-blur-sm">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-title"
        className="w-full max-w-lg bg-surface-container-lowest rounded-t-[2rem] sm:rounded-[2rem] outline-none max-h-[88vh] flex flex-col"
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 p-6 pb-4">
          <div className="min-w-0">
            {state === 'ready' && detail ? (
              <>
                <p className="text-xs text-on-surface-variant mb-1">
                  {detail.plan_date} · {MEAL_SLOT_LABEL[detail.meal_slot]}
                </p>
                <h3 id="meal-title" className="font-headline font-bold text-2xl text-on-surface break-words">
                  {detail.title}
                </h3>
              </>
            ) : (
              <h3 id="meal-title" className="font-headline font-bold text-2xl text-on-surface">
                식단
              </h3>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 min-w-[48px] min-h-[48px] inline-flex items-center justify-center rounded-full active:scale-95 transition-transform"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        {/* 본문 */}
        <div className="modal-scroll flex-1 overflow-y-auto px-6">
          {state === 'loading' && (
            <div aria-busy="true" className="space-y-3 pb-6">
              <div className="h-16 rounded-2xl bg-surface-container-high animate-pulse" />
              <div className="h-20 rounded-2xl bg-surface-container-high animate-pulse" />
            </div>
          )}

          {state === 'error' && (
            <div className="text-center py-12" role="status">
              <span aria-hidden="true" className="material-symbols-outlined text-tertiary text-4xl mb-3 block">error</span>
              <p className="text-on-surface-variant mb-5">식단을 불러오지 못했어요.</p>
              <button
                onClick={load}
                className="min-h-[48px] px-6 inline-flex items-center justify-center rounded-full bg-on-surface text-surface font-bold active:scale-95 transition-transform"
              >
                다시 시도
              </button>
            </div>
          )}

          {state === 'ready' && detail && (
            <>
              {detail.memo && (
                <p className="text-sm text-on-surface-variant whitespace-pre-wrap break-words mb-4">
                  {detail.memo}
                </p>
              )}
              <p className="text-xs text-outline mb-6">{detail.created_by_name}님이 올림</p>

              <h4 className="text-sm font-semibold text-on-surface-variant mb-3">
                댓글 {detail.comments.length}
              </h4>

              {detail.comments.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-6 text-center">
                  아직 댓글이 없어요. 먼저 한마디 남겨보세요.
                </p>
              ) : (
                <ul className="space-y-3 pb-2">
                  {detail.comments.map((cm) => (
                    <li key={cm.id} className="bg-surface-container-low rounded-2xl p-4">
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-sm font-bold text-on-surface truncate min-w-0">
                          {cm.created_by_name}
                        </span>
                        <span className="text-xs text-outline shrink-0">
                          {cm.created_at.slice(5, 10)}
                        </span>
                      </div>
                      <p className="text-sm text-on-surface whitespace-pre-wrap break-words">{cm.body}</p>
                      {me && cm.created_by === me.id && (
                        <button
                          onClick={() => removeComment(cm.id)}
                          className="mt-2 text-xs text-error font-medium"
                        >
                          삭제
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* 입력 */}
        {state === 'ready' && (
          <div className="p-6 pt-4 border-t border-outline-variant/40">
            {err && (
              <p role="status" className="text-xs text-error mb-2">
                {err}
              </p>
            )}
            <form onSubmit={addComment} className="flex gap-2 items-center">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="댓글 남기기"
                maxLength={500}
                /* min-w-0 이 없으면 input 의 고유 최소폭 때문에 행이 넘친다. */
                className="flex-1 min-w-0 bg-surface-container-low rounded-full px-5 py-3 text-on-surface placeholder:text-outline outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="submit"
                disabled={!body.trim() || posting}
                className="shrink-0 min-h-[48px] px-5 inline-flex items-center justify-center rounded-full bg-primary text-on-primary font-bold active:scale-95 transition-transform disabled:opacity-40"
              >
                {posting ? '...' : '등록'}
              </button>
            </form>
            <button
              onClick={removePlan}
              className="mt-3 w-full min-h-[48px] flex items-center justify-center rounded-xl text-error text-sm font-bold active:scale-95 transition-transform"
            >
              이 식단 삭제
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
