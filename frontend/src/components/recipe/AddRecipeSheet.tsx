import { useState } from 'react'
import { useModal } from '../../hooks/useModal'
import { createSharedRecipe, CATEGORIES, METHODS } from '../../api/sharedRecipes'

interface Props {
  onClose: () => void
  onCreated: () => void
}

/* 서버(shared-recipes.ts)와 같은 상한. 여기서 막는 건 편의고, 진짜 방어는 서버다. */
const MAX_INGREDIENTS = 30
const MAX_STEPS = 20

/* 행마다 안정적인 id 를 준다.
   배열 인덱스를 key 로 쓰면서 가운데 행을 지우면 React 가 DOM 을 인덱스로
   재사용한다. 값은 controlled 라 맞게 보이지만, **한글 조합 중이던 IME 상태와
   포커스가 옆 칸으로 옮겨간다.** 재료 이름은 대부분 한글이라 바로 밟는다. */
interface Row {
  id: number
  value: string
}
let rowSeq = 0
function newRow(): Row {
  return { id: rowSeq++, value: '' }
}

export default function AddRecipeSheet({ onClose, onCreated }: Props) {
  const panelRef = useModal(true, onClose)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>(CATEGORIES[0])
  const [method, setMethod] = useState<string>(METHODS[0])
  // 빈 칸 두 개로 시작한다. 재료는 최소 2개라서, 하나만 보이면 "더 넣어야 하나?" 를 묻게 된다.
  const [ingredients, setIngredients] = useState<Row[]>(() => [newRow(), newRow()])
  const [steps, setSteps] = useState<Row[]>(() => [newRow()])
  const [tip, setTip] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filledIngredients = ingredients.map((r) => r.value.trim()).filter(Boolean)
  const filledSteps = steps.map((r) => r.value.trim()).filter(Boolean)
  const canSubmit =
    title.trim().length > 0 && filledIngredients.length >= 2 && filledSteps.length >= 1 && !saving

  function setAt(list: Row[], id: number, v: string): Row[] {
    return list.map((r) => (r.id === id ? { ...r, value: v } : r))
  }
  function removeAt(list: Row[], id: number): Row[] {
    return list.filter((r) => r.id !== id)
  }

  async function submit() {
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      await createSharedRecipe({
        title: title.trim(),
        category,
        cooking_method: method,
        ingredients: filledIngredients,
        manual_steps: filledSteps,
        tip: tip.trim(),
        is_anonymous: anonymous,
      })
      onCreated()
      onClose()
    } catch (e: unknown) {
      // 서버가 주는 문구를 그대로 쓴다 (하루 상한, 검증 실패 등 사유가 다 다르다).
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || '등록에 실패했어요. 잠시 후 다시 시도해주세요.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'var(--color-on-surface)', opacity: 0.15 }}
        onClick={onClose}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="나의 메뉴 추가"
        className="modal-scroll relative w-full max-w-md max-h-[90vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto sm:mx-4"
        style={{
          backgroundColor: 'var(--color-surface-container-lowest)',
          // 홈 인디케이터에 버튼이 가리지 않게. 바닥에 붙는 시트라 필요하다.
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--color-outline-variant)' }} />
        </div>

        <div className="px-5">
          <h2
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            나의 메뉴 추가
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
            올린 메뉴는 모든 사용자가 볼 수 있어요.
          </p>

          {/* 요리 이름 */}
          <label className="block mt-5 text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
            요리 이름
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="예: 할머니 김치찌개"
              className="mt-1.5 w-full px-4 py-3 rounded-xl text-base"
              style={{
                backgroundColor: 'var(--color-surface-container-low)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
            />
          </label>

          {/* 종류 · 조리 방법 */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <label className="block text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
              종류
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1.5 w-full px-3 min-h-[48px] rounded-xl text-base"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
              조리 방법
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="mt-1.5 w-full px-3 min-h-[48px] rounded-xl text-base"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>

          {/* 재료 */}
          <div className="mt-5">
            <p className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
              재료 <span style={{ color: 'var(--color-on-surface-variant)' }}>(2개 이상)</span>
            </p>
            {ingredients.map((row, i) => (
              <div key={row.id} className="flex gap-2 mt-1.5">
                <input
                  value={row.value}
                  onChange={(e) => setIngredients(setAt(ingredients, row.id, e.target.value))}
                  maxLength={50}
                  placeholder={i === 0 ? '예: 돼지고기 300g' : '재료를 입력하세요'}
                  aria-label={`재료 ${i + 1}`}
                  className="flex-1 min-w-0 px-4 py-3 rounded-xl text-base"
                  style={{
                    backgroundColor: 'var(--color-surface-container-low)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                />
                {ingredients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setIngredients(removeAt(ingredients, row.id))}
                    aria-label={`재료 ${i + 1} 삭제`}
                    className="flex-shrink-0 w-12 min-h-[48px] rounded-xl flex items-center justify-center active:scale-95 transition-transform"
                    style={{
                      backgroundColor: 'var(--color-surface-container-low)',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      close
                    </span>
                  </button>
                )}
              </div>
            ))}
            {ingredients.length < MAX_INGREDIENTS && (
              <button
                type="button"
                onClick={() => setIngredients([...ingredients, newRow()])}
                className="mt-2 w-full min-h-[48px] rounded-xl text-sm font-medium"
                style={{ color: 'var(--color-primary)', backgroundColor: 'var(--color-surface-container-low)' }}
              >
                + 재료 추가
              </button>
            )}
          </div>

          {/* 조리 순서 */}
          <div className="mt-5">
            <p className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
              조리 순서
            </p>
            {steps.map((row, i) => (
              <div key={row.id} className="flex gap-2 mt-1.5 items-start">
                <span
                  className="flex-shrink-0 w-7 h-7 mt-2.5 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <textarea
                  value={row.value}
                  onChange={(e) => setSteps(setAt(steps, row.id, e.target.value))}
                  maxLength={500}
                  rows={2}
                  placeholder={i === 0 ? '예: 냄비에 물을 붓고 끓입니다' : '다음 순서를 입력하세요'}
                  aria-label={`조리 순서 ${i + 1}`}
                  className="flex-1 min-w-0 px-4 py-3 rounded-xl text-base resize-none"
                  style={{
                    backgroundColor: 'var(--color-surface-container-low)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                />
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSteps(removeAt(steps, row.id))}
                    aria-label={`조리 순서 ${i + 1} 삭제`}
                    className="flex-shrink-0 w-12 min-h-[48px] rounded-xl flex items-center justify-center active:scale-95 transition-transform"
                    style={{
                      backgroundColor: 'var(--color-surface-container-low)',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      close
                    </span>
                  </button>
                )}
              </div>
            ))}
            {steps.length < MAX_STEPS && (
              <button
                type="button"
                onClick={() => setSteps([...steps, newRow()])}
                className="mt-2 w-full min-h-[48px] rounded-xl text-sm font-medium"
                style={{ color: 'var(--color-primary)', backgroundColor: 'var(--color-surface-container-low)' }}
              >
                + 순서 추가
              </button>
            )}
          </div>

          {/* 팁 */}
          <label className="block mt-5 text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
            팁 <span style={{ color: 'var(--color-on-surface-variant)' }}>(선택)</span>
            <textarea
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="예: 하루 묵힌 김치를 쓰면 더 맛있어요"
              className="mt-1.5 w-full px-4 py-3 rounded-xl text-base resize-none"
              style={{
                backgroundColor: 'var(--color-surface-container-low)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
            />
          </label>

          {/* 익명 여부 */}
          <button
            type="button"
            role="switch"
            aria-checked={anonymous}
            onClick={() => setAnonymous(!anonymous)}
            className="mt-5 w-full flex items-center justify-between px-4 py-3 rounded-xl text-left"
            style={{ backgroundColor: 'var(--color-surface-container-low)' }}
          >
            <span>
              <span className="text-sm font-medium block" style={{ color: 'var(--color-on-surface)' }}>
                익명으로 올리기
              </span>
              <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                {anonymous ? '작성자가 «익명»으로 표시돼요' : '내 닉네임이 표시돼요'}
              </span>
            </span>
            <span
              className="flex-shrink-0 w-12 h-7 rounded-full flex items-center px-1 transition-colors"
              style={{
                backgroundColor: anonymous ? 'var(--color-primary)' : 'var(--color-outline-variant)',
                justifyContent: anonymous ? 'flex-end' : 'flex-start',
              }}
            >
              <span className="w-5 h-5 rounded-full" style={{ backgroundColor: 'white' }} />
            </span>
          </button>

          {error && (
            <p className="mt-4 text-sm" role="alert" style={{ color: 'var(--color-tertiary)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl text-base font-medium"
              style={{
                backgroundColor: 'var(--color-surface-container-low)',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="flex-1 py-3.5 rounded-xl text-base font-semibold transition-opacity"
              style={{
                backgroundColor: 'var(--color-primary)',
                color: 'white',
                opacity: canSubmit ? 1 : 0.4,
              }}
            >
              {saving ? '등록 중…' : '등록하기'}
            </button>
          </div>

          <p className="mt-3 text-xs text-center" style={{ color: 'var(--color-outline)' }}>
            {/* 검열이 게이트가 아니라 라벨이라는 걸 미리 말해둔다.
                "검토 중" 배지를 처음 본 사용자가 실패로 오해하지 않게. */}
            등록하면 먹을 수 있는 음식인지 자동으로 확인해요. 확인되면 바로 공개돼요.
          </p>
        </div>
      </div>
    </div>
  )
}
