import { useCallback, useEffect, useState } from 'react'
import { useModal } from '../../hooks/useModal'
import {
  getResetState, requestReset, consentReset, withdrawConsent, cancelReset, restoreReset,
  type ResetState,
} from '../../api/familyReset'
import { remainingLabel } from '../../../../worker/src/lib/family-reset-rules'

/**
 * 가족 데이터 초기화 — 전원 동의 + 7일 복구.
 *
 * 푸시 발송 코드가 없어서(실증됨) 동의 요청은 **상대가 앱을 열어야만** 보인다.
 * 그래서 48시간 만료를 둔다. 만료가 없으면 3개월 전 동의로 오늘 데이터가 지워진다.
 *
 * DESIGN.md 5절: 네 상태(로딩·없음·오류·진행중)를 구분한다. 특히 **비어 있음과
 * 오류를 같은 화면으로 처리하지 않는다** — 서버가 죽었을 때 "지울 데이터가 없어요"
 * 를 띄우면 가족에게 거짓말을 하는 셈이다.
 */

function ConfirmModal({
  counts, total, onConfirm, onClose, busy,
}: {
  counts: Record<string, number>
  total: number
  onConfirm: () => void
  onClose: () => void
  busy: boolean
}) {
  const panelRef = useModal(true, onClose)
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0" style={{ backgroundColor: 'var(--color-on-surface)', opacity: 0.15 }} onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="데이터 초기화 확인"
        className="modal-scroll relative z-10 w-full max-w-sm mx-4 rounded-3xl p-6 max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-on-surface)' }}>
          정말 초기화할까요?
        </h2>
        {/* 되돌릴 수 없는 일괄 동작에 확인 단계를 뺄 수 없다(DESIGN.md 9절).
            무엇이 얼마나 지워지는지 숫자로 적는다. */}
        <p className="text-sm mb-4" style={{ color: 'var(--color-on-surface-variant)' }}>
          가족 구성원이 모두 동의하면 지워져요. 지운 뒤 <strong>7일 안에는 되돌릴 수 있어요.</strong>
        </p>
        <ul className="mb-4 rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
          {Object.entries(counts).filter(([, n]) => n > 0).map(([label, n]) => (
            <li key={label} className="flex justify-between text-sm py-0.5" style={{ color: 'var(--color-on-surface)' }}>
              <span>{label}</span>
              <span className="font-semibold">{n}개</span>
            </li>
          ))}
          {total === 0 && (
            <li className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>지울 데이터가 없어요.</li>
          )}
        </ul>
        <p className="text-xs mb-5" style={{ color: 'var(--color-outline)' }}>
          공개한 요리와 계정·가족 정보는 지워지지 않아요.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[48px] rounded-xl text-sm font-semibold"
            style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)' }}
          >
            그만두기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || total === 0}
            className="flex-1 min-h-[48px] rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-error)', color: 'var(--color-on-error)' }}
          >
            {busy ? '요청 중…' : '초기화 요청'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ResetPanel() {
  const [state, setState] = useState<ResetState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    getResetState()
      .then(setState)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  async function act(fn: () => Promise<unknown>, done: string) {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: done })
      load()
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setMsg({ ok: false, text: detail || '처리하지 못했어요.' })
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  /* 1. 로딩 — 스켈레톤 + aria-busy (DESIGN.md 5절) */
  if (loading) {
    return (
      <section className="mt-6" aria-busy="true" aria-label="초기화 상태 불러오는 중">
        <div className="h-5 w-28 rounded animate-pulse mb-2" style={{ backgroundColor: 'var(--color-surface-container-high)' }} />
        <div className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--color-surface-container-low)' }} />
      </section>
    )
  }

  /* 2. 오류 — 「없음」과 절대 같은 화면으로 처리하지 않는다 */
  if (error || !state) {
    return (
      <section className="mt-6">
        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-on-surface)' }}>데이터 초기화</h3>
        <div role="alert" className="rounded-xl p-3 flex items-center justify-between gap-3"
          style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
          <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>불러오지 못했어요.</span>
          <button type="button" onClick={load} className="text-sm font-semibold px-3 min-h-[48px] min-w-[48px]"
            style={{ color: 'var(--color-primary)' }}>
            다시 시도
          </button>
        </div>
      </section>
    )
  }

  const req = state.request
  const now = new Date()

  return (
    <section className="mt-6">
      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-on-surface)' }}>데이터 초기화</h3>

      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className="text-sm mb-2"
          style={{ color: msg.ok ? 'var(--color-primary)' : 'var(--color-error)' }}>
          {msg.text}
        </p>
      )}

      {/* 3-a. 실행됨 — 7일 복구 창 */}
      {req?.status === 'done' && req.purge_after && (
        <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
          <p className="text-sm mb-2" style={{ color: 'var(--color-on-surface)' }}>
            초기화했어요. <strong>{remainingLabel(req.purge_after, now)}</strong> 안에는 되돌릴 수 있어요.
          </p>
          <button type="button" disabled={busy} onClick={() => act(restoreReset, '되돌렸어요.')}
            className="w-full min-h-[48px] rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>
            {busy ? '되돌리는 중…' : '되돌리기'}
          </button>
        </div>
      )}

      {/* 3-b. 진행 중 — 동의 모으는 중 */}
      {req?.status === 'pending' && (
        <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
          <p className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
            {req.needed}명 중 <strong>{req.agreed}명</strong> 동의했어요
          </p>
          <p className="text-xs mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
            {remainingLabel(req.expires_at, now)} · 모두 동의하면 지워져요
          </p>
          <div className="flex gap-2">
            {!req.i_agreed ? (
              <button type="button" disabled={busy}
                onClick={() => act(consentReset, req.agreed + 1 >= req.needed ? '초기화했어요.' : '동의했어요.')}
                className="flex-1 min-h-[48px] rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-error)', color: 'var(--color-on-error)' }}>
                {/* 마지막 사람에게는 무슨 일이 벌어질지 정확히 말한다. */}
                {req.agreed + 1 >= req.needed ? '동의하고 초기화' : '동의'}
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => act(withdrawConsent, '동의를 철회했어요.')}
                className="flex-1 min-h-[48px] rounded-xl text-sm disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
                동의 철회
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => act(cancelReset, '요청을 취소했어요.')}
              className="flex-1 min-h-[48px] rounded-xl text-sm disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}>
              요청 취소
            </button>
          </div>
        </div>
      )}

      {/* 3-c. 요청 없음 */}
      {!req && (
        <>
          <p className="text-xs mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>
            {/* 분류 이름을 손으로 적으면 거짓말이 된다 — 실제로는 0개인 「우리 가족
                요리」를 지운다고 말하고, 정작 지우는 「알림 기록」은 빠졌었다.
                지금 개수가 있는 것만 이름을 부른다. */}
            {state.total > 0
              ? `${Object.entries(state.counts).filter(([, n]) => n > 0).map(([l]) => l).join('·')} ${state.total}개를 지워요. 구성원 ${state.members}명이 모두 동의해야 해요.`
              : '지울 데이터가 없어요.'}
          </p>
          <button type="button" disabled={state.total === 0}
            onClick={() => setConfirming(true)}
            className="w-full min-h-[48px] rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-error)' }}>
            데이터 초기화
          </button>
        </>
      )}

      {confirming && (
        <ConfirmModal
          counts={state.counts}
          total={state.total}
          busy={busy}
          onClose={() => setConfirming(false)}
          onConfirm={() => act(requestReset, '동의를 요청했어요.')}
        />
      )}
    </section>
  )
}
