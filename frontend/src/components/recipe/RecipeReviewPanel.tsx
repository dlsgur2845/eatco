import { useEffect, useState } from 'react'
import {
  getSharedRecipe, requestImprovement, publishRecipe, unpublishRecipe,
  type SharedRecipeDetail, type Improvement,
} from '../../api/sharedRecipes'
import { formatDate } from '../../lib/format'

interface Props {
  recipeId: string
  /** 수정 시트를 연다. 상세 모달을 닫는 것도 부모가 한다. */
  onEdit: (detail: SharedRecipeDetail) => void
  onChanged: () => void
}

/**
 * 상세 화면 아래에 붙는 검토 패널 — **내가 올린 레시피에만 보인다.**
 *
 * 두 버튼의 목적이 다르다:
 *   개선 검토 — 부족한 점을 말해준다. 아무것도 바뀌지 않는다. 반영 여부는 내 판단.
 *   공개 검토 — 먹을 수 있는 음식인지 승인받고 가족 밖으로 내보낸다.
 *
 * 개선 이력은 **최신 1개만 펼치고 나머지는 접어둔다.** 한 번에 쭉 나열하면
 * 조언 목록이 레시피보다 길어져서, 정작 고칠 내용을 보러 온 화면이 아니게 된다.
 */
export default function RecipeReviewPanel({ recipeId, onEdit, onChanged }: Props) {
  const [detail, setDetail] = useState<SharedRecipeDetail | null>(null)
  const [busy, setBusy] = useState<'improve' | 'publish' | 'unpublish' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showOlder, setShowOlder] = useState(false)

  useEffect(() => {
    let alive = true
    getSharedRecipe(recipeId)
      .then((d) => alive && setDetail(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [recipeId])

  const detailOf = (e: unknown, fb: string) =>
    (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fb

  async function reload() {
    const d = await getSharedRecipe(recipeId).catch(() => null)
    if (d) setDetail(d)
    onChanged()
  }

  async function improve() {
    setBusy('improve')
    setMsg(null)
    try {
      await requestImprovement(recipeId)
      await reload()
      setShowOlder(false) // 새 조언이 최신이 됐으니 접힌 상태로 되돌린다
      setMsg({ ok: true, text: '검토가 도착했어요.' })
    } catch (e) {
      // 429 면 서버가 "N분 뒤에 다시" 를 문장으로 준다. 그대로 쓴다.
      setMsg({ ok: false, text: detailOf(e, '검토를 받지 못했어요.') })
    } finally {
      setBusy(null)
    }
  }

  async function publish() {
    setBusy('publish')
    setMsg(null)
    try {
      const r = await publishRecipe(recipeId)
      await reload()
      if (r.status === 'rejected') {
        setMsg({ ok: false, text: r.reason || '공개할 수 없는 레시피예요.' })
      } else {
        setMsg({
          ok: true,
          // reused 면 이전 승인을 그대로 썼다는 뜻. 사용자에게는 "빨랐다" 로만 보이면 된다.
          text: r.reused ? '이미 검토된 내용이라 바로 공개했어요.' : '검토를 통과해서 공개했어요.',
        })
      }
    } catch (e) {
      setMsg({ ok: false, text: detailOf(e, '공개 검토를 받지 못했어요.') })
    } finally {
      setBusy(null)
    }
  }

  async function unpublish() {
    setBusy('unpublish')
    setMsg(null)
    try {
      await unpublishRecipe(recipeId)
      await reload()
      setMsg({ ok: true, text: '가족만 볼 수 있게 되돌렸어요.' })
    } catch (e) {
      setMsg({ ok: false, text: detailOf(e, '되돌리지 못했어요.') })
    } finally {
      setBusy(null)
    }
  }

  if (!detail || !detail.is_mine) return null

  const isPublic = detail.visibility === 'public'
  /**
   * **지금 실제로 가족 밖에서 보이는가.** `visibility` 만으로는 알 수 없다.
   *
   * 공개한 뒤 내용을 고치면 `content_hash` 가 승인 해시와 어긋나고, 서버의
   * `VISIBLE_WHERE` 가 `approvalStillValid` 로 걸러내서 남에게 안 보인다.
   * 그런데 `visibility` 는 'public' 인 채로 남는다. 그것만 읽던 이 패널은
   * 아무도 못 보는 레시피에 "모두가 볼 수 있어요" 라고 말하고 있었다.
   * (「나의 요리」에서 같은 레시피가 "공개가 안 됐어요" 묶음에 있는 채로.)
   */
  const liveToAll = isPublic && detail.approval_valid
  const notes = detail.improvements
  const latest: Improvement | undefined = notes[0]
  const older = notes.slice(1)

  const btn =
    'flex-1 min-h-[48px] rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40'

  return (
    <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--color-outline-variant)' }}>
      {/* 지금 누가 보는지부터 말한다. 버튼이 뭘 하는지가 여기서 갈린다. */}
      <div className="flex items-center gap-2 mb-1">
        <span
          aria-hidden="true"
          className="material-symbols-outlined"
          style={{ fontSize: '18px', color: liveToAll ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}
        >
          {liveToAll ? 'public' : 'home'}
        </span>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
          {liveToAll ? '모두가 볼 수 있어요' : '우리 가족만 볼 수 있어요'}
        </p>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-on-surface-variant)' }}>
        {liveToAll
          ? '내용을 고치면 다시 검토를 받아야 해요.'
          : isPublic
            ? '내용을 고친 뒤라 지금은 가족 밖에서 안 보여요. 공개 검토를 다시 받아주세요.'
            : '공개 검토를 통과하면 가족 밖에서도 볼 수 있어요.'}
      </p>

      {detail.status === 'rejected' && detail.status_reason && (
        <p
          className="text-xs mb-4 px-3 py-2 rounded-lg"
          style={{
            color: 'var(--color-tertiary)',
            backgroundColor: 'color-mix(in srgb, var(--color-tertiary-container) 30%, white)',
          }}
        >
          {detail.status_reason}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={improve}
          disabled={busy !== null}
          className={btn}
          style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)' }}
        >
          {busy === 'improve' ? '검토 중…' : '개선 검토'}
        </button>
        {liveToAll ? (
          <button
            type="button"
            onClick={unpublish}
            disabled={busy !== null}
            className={btn}
            style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' }}
          >
            {busy === 'unpublish' ? '되돌리는 중…' : '가족만 보기'}
          </button>
        ) : (
          <button
            type="button"
            onClick={publish}
            disabled={busy !== null}
            className={btn}
            style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
          >
            {busy === 'publish' ? '검토 중…' : '공개 검토'}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onEdit(detail)}
        className="mt-2 w-full min-h-[48px] rounded-xl text-sm font-medium"
        style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' }}
      >
        고치기
      </button>

      {msg && (
        <p
          role="status"
          className="text-sm mt-3"
          style={{ color: msg.ok ? 'var(--color-primary)' : 'var(--color-tertiary)' }}
        >
          {msg.text}
        </p>
      )}

      {/* 개선 검토 결과. 최신 하나만 펼친다. */}
      {latest && (
        <div className="mt-5">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>
            개선 검토 · {formatDate(latest.created_at)}
            {latest.stale && (
              <span style={{ color: 'var(--color-tertiary)' }}> · 이 뒤로 레시피가 바뀌었어요</span>
            )}
          </p>
          <ul className="space-y-1.5">
            {latest.body.split('\n').filter(Boolean).map((line, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: 'var(--color-on-surface)' }}>
                <span aria-hidden="true" style={{ color: 'var(--color-primary)' }}>·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          {/* 이전 것들은 접어둔다. 쭉 나열하면 조언이 레시피보다 길어진다. */}
          {older.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowOlder(!showOlder)}
                aria-expanded={showOlder}
                className="mt-3 min-h-[48px] text-xs font-medium"
                style={{ color: 'var(--color-primary)' }}
              >
                {showOlder ? '이전 검토 접기' : `이전 검토 ${older.length}건 보기`}
              </button>
              {showOlder && (
                <div className="mt-1 space-y-4">
                  {older.map((o) => (
                    <div key={o.id}>
                      <p className="text-xs mb-1" style={{ color: 'var(--color-outline)' }}>
                        {formatDate(o.created_at)}
                      </p>
                      <ul className="space-y-1">
                        {o.body.split('\n').filter(Boolean).map((line, i) => (
                          <li key={i} className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                            · {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
