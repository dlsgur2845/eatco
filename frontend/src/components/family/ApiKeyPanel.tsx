import { useCallback, useEffect, useState } from 'react'
import {
  getFamilyKeys, addFamilyKey, deleteFamilyKey, enableFamilyKey, setKeyStrategy,
  type KeyState, type Provider, type KeyStrategy,
} from '../../api/familyKeys'

/**
 * 가족 AI 키 관리.
 *
 * **이 기능이 무엇을 하고 무엇을 안 하는지 화면에서도 정직해야 한다.**
 * 비용·할당량을 가족끼리 나누는 기능이지, 스캔이 죽는 지역차단을 고치는
 * 기능이 아니다. 그걸 뭉뚱그리면 키를 넣고도 스캔이 죽을 때 사용자가
 * "키를 넣었는데 왜 안 되냐" 고 묻게 된다.
 *
 * DESIGN.md 5절: 로딩·비어있음·오류·정상을 구분한다.
 */

const PROVIDERS: { value: Provider; label: string; help: string }[] = [
  { value: 'gemini', label: 'Gemini', help: 'aistudio.google.com 에서 무료로 발급받아요' },
  { value: 'anthropic', label: 'Claude', help: 'console.anthropic.com 에서 발급받아요' },
  { value: 'openai', label: 'GPT', help: 'platform.openai.com 에서 발급받아요' },
]

export default function ApiKeyPanel() {
  const [state, setState] = useState<KeyState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [provider, setProvider] = useState<Provider>('gemini')
  const [keyText, setKeyText] = useState('')
  const [label, setLabel] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    getFamilyKeys()
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
    }
  }

  function submit() {
    // 평문 키는 저장 성공 즉시 화면에서도 지운다. 폼에 남겨두면
    // 스크린샷·어깨너머로 새는 경로가 하나 더 생긴다.
    const k = keyText.trim()
    act(() => addFamilyKey(provider, k, label.trim() || undefined), '키를 등록했어요.').then(() => {
      setKeyText('')
      setLabel('')
      setAdding(false)
    })
  }

  if (loading) {
    return (
      <section className="mt-6" aria-busy="true" aria-label="AI 키 불러오는 중">
        <div className="h-5 w-28 rounded animate-pulse mb-2" style={{ backgroundColor: 'var(--color-surface-container-high)' }} />
        <div className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--color-surface-container-low)' }} />
      </section>
    )
  }

  if (error || !state) {
    return (
      <section className="mt-6">
        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-on-surface)' }}>AI 키</h3>
        <div role="alert" className="rounded-xl p-3 flex items-center justify-between gap-3"
          style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
          <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>불러오지 못했어요.</span>
          <button type="button" onClick={load} className="text-sm font-semibold px-3 min-h-[48px] min-w-[48px]"
            style={{ color: 'var(--color-primary)' }}>다시 시도</button>
        </div>
      </section>
    )
  }

  const sel = PROVIDERS.find((p) => p.value === provider)!

  return (
    <section className="mt-6">
      <h3 className="text-base font-semibold" style={{ color: 'var(--color-on-surface)' }}>AI 키</h3>
      {/* 기대치를 여기서 정확히 세운다. 지역차단은 이걸로 안 고쳐진다. */}
      <p className="text-xs mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
        가족이 등록한 키로 영수증을 읽어요. 한 사람만 등록해도 온 가족이 써요.
        등록하지 않아도 지금처럼 쓸 수 있어요.
      </p>

      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className="text-sm mb-2"
          style={{ color: msg.ok ? 'var(--color-primary)' : 'var(--color-error)' }}>{msg.text}</p>
      )}

      {state.keys.length === 0 ? (
        <p className="text-sm mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
          등록된 키가 없어요. 앱 공용 키로 동작하고 있어요.
        </p>
      ) : (
        <ul className="space-y-1 mb-3">
          {state.keys.map((k) => (
            <li key={k.id} className="flex items-center gap-2 rounded-xl px-3 py-2 min-h-[48px]"
              style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-on-surface)' }}>
                  {k.label} <span style={{ color: 'var(--color-outline)' }}>{k.key_hint}</span>
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {k.provider_label} · {k.calls}회 사용
                  {k.disabled ? ` · 꺼짐${k.last_error ? ` (${k.last_error})` : ''}` : ''}
                </p>
              </div>
              {k.disabled ? (
                <button type="button" disabled={busy} onClick={() => act(() => enableFamilyKey(k.id), '다시 켰어요.')}
                  className="text-xs font-semibold px-2 min-h-[48px] min-w-[48px] disabled:opacity-40"
                  style={{ color: 'var(--color-primary)' }}>다시 켜기</button>
              ) : null}
              <button type="button" disabled={busy}
                onClick={() => act(() => deleteFamilyKey(k.id), '키를 지웠어요.')}
                aria-label={`${k.label} 지우기`}
                className="text-xs px-2 min-h-[48px] min-w-[48px] disabled:opacity-40"
                style={{ color: 'var(--color-error)' }}>지우기</button>
            </li>
          ))}
        </ul>
      )}

      {/* 키가 2개 이상일 때만 전략 선택이 의미가 있다. 하나뿐이면 고를 게 없다. */}
      {state.keys.length > 1 && (
        <div className="flex gap-2 mb-3">
          {([['least_used', '교대로'], ['priority', '순서대로']] as [KeyStrategy, string][]).map(([v, t]) => (
            <button key={v} type="button" disabled={busy}
              onClick={() => act(() => setKeyStrategy(v), '방식을 바꿨어요.')}
              className="flex-1 min-h-[48px] rounded-xl text-sm font-semibold disabled:opacity-40"
              style={state.strategy === v
                ? { backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }
                : { backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' }}>
              {t}
            </button>
          ))}
        </div>
      )}

      {!adding ? (
        <button type="button" onClick={() => setAdding(true)}
          className="w-full min-h-[48px] rounded-xl text-sm font-semibold"
          style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-primary)' }}>
          키 등록하기
        </button>
      ) : (
        <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-container-low)' }}>
          <div className="flex gap-1 mb-2">
            {PROVIDERS.map((p) => (
              <button key={p.value} type="button" onClick={() => setProvider(p.value)}
                className="flex-1 min-h-[48px] rounded-lg text-sm"
                style={provider === p.value
                  ? { backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }
                  : { backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>{sel.help}</p>
          <input
            type="password"
            value={keyText}
            onChange={(e) => setKeyText(e.target.value)}
            placeholder="키를 붙여넣으세요"
            aria-label="API 키"
            className="w-full text-base px-3 py-2 rounded-lg outline-none mb-2"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-on-surface)' }}
          />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="이름 (선택) — 예: 송인혁의 Gemini"
            aria-label="키 이름"
            className="w-full text-base px-3 py-2 rounded-lg outline-none mb-2"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-on-surface)' }}
          />
          <p className="text-xs mb-3" style={{ color: 'var(--color-outline)' }}>
            등록하면 다시 볼 수 없어요. 가족 구성원 모두가 이 키로 스캔해요.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAdding(false); setKeyText(''); setLabel('') }}
              className="flex-1 min-h-[48px] rounded-xl text-sm"
              style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
              그만두기
            </button>
            <button type="button" disabled={busy || keyText.trim().length < 20} onClick={submit}
              className="flex-1 min-h-[48px] rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>
              {busy ? '등록 중…' : '등록'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
