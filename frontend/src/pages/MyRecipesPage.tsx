import { useCallback, useEffect, useState } from 'react'
import { getMyRecipes, type SharedRecipe, type SharedRecipeDetail } from '../api/sharedRecipes'
import RecipeDetailModal from '../components/recipe/RecipeDetailModal'
import RecipeReviewPanel from '../components/recipe/RecipeReviewPanel'
import AddRecipeSheet from '../components/recipe/AddRecipeSheet'

/**
 * 내가 올린 요리 전부.
 *
 * **축은 「승인 상태」가 아니라 「공개 범위」다.** 이 저장소에 `pending` 상태는
 * 없다(`status` 는 `'none' | 'approved' | 'rejected'`). 워커의
 * `GET /shared-recipes/mine` 주석이 아직 "검토 중" 을 말하지만 그건 낡은 서술이다.
 *
 * 대시보드의 모두의 메뉴는 우리 **가족** 것을 다 보여준다(거절된 것 포함).
 * 이 화면이 따로 있는 이유는 그걸 **나** 로 좁혀 보기 위해서다.
 *
 * 세 묶음으로 나눈다. 배지가 아니라 제목으로 나눈다 — 색만으로 상태를 말하지
 * 않는다는 규칙(DESIGN.md 1절)에 맞고, 배지 색을 새로 만들 필요도 없다.
 */
type Group = { title: string; hint: string; items: SharedRecipe[] }

export function groupRecipes(list: SharedRecipe[]): Group[] {
  const published: SharedRecipe[] = []
  const familyOnly: SharedRecipe[] = []
  const notPublic: SharedRecipe[] = []

  for (const r of list) {
    if (r.status === 'rejected') notPublic.push(r)
    // 공개를 눌렀는데 그 뒤 내용을 고치면 승인 해시가 어긋나 남에게 안 보인다.
    // 서버는 이 사실을 `approval_valid` 로 알려주는데 지금까지 어디서도 안 썼다.
    else if (r.visibility === 'public' && !r.approval_valid) notPublic.push(r)
    else if (r.visibility === 'public') published.push(r)
    else familyOnly.push(r)
  }
  return [
    { title: '모두가 보고 있어요', hint: '다른 가족들도 볼 수 있어요', items: published },
    { title: '우리 가족만 봐요', hint: '공개하지 않은 요리예요', items: familyOnly },
    { title: '공개가 안 됐어요', hint: '고친 뒤 다시 공개하거나, 사유를 확인해보세요', items: notPublic },
  ].filter((g) => g.items.length > 0)
}

export default function MyRecipesPage() {
  const [recipes, setRecipes] = useState<SharedRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [detail, setDetail] = useState<SharedRecipe | null>(null)
  const [editing, setEditing] = useState<SharedRecipeDetail | null>(null)
  const [composing, setComposing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    getMyRecipes()
      .then(setRecipes)
      // 실패를 삼키면 「아직 올린 요리가 없어요」가 뜬다. 요리가 있는 사람에게
      // 없다고 말하고 새로 쓰라고 권하는 화면이다 (DESIGN.md 5절).
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const groups = groupRecipes(recipes)

  return (
    <div>
      <h1
        className="text-2xl font-bold tracking-tight mb-1"
        style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
      >
        나의 요리
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--color-on-surface-variant)' }}>
        내가 올린 요리를 모아서 봐요
      </p>

      {loading ? (
        <div aria-busy="true" role="status" className="space-y-3">
          <span className="sr-only">불러오는 중</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--color-surface-container-low)' }} />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="w-full px-4 py-6 rounded-2xl text-sm text-center" style={{ backgroundColor: 'var(--color-error-container)', color: 'var(--color-error)' }}>
          <p className="mb-3">요리 목록을 불러오지 못했어요.</p>
          <button
            type="button"
            onClick={load}
            className="min-h-[48px] px-5 rounded-full text-sm font-semibold"
            style={{ backgroundColor: 'var(--color-error)', color: 'white' }}
          >
            다시 시도
          </button>
        </div>
      ) : recipes.length === 0 ? (
        /* 빈 상태 자체가 버튼이다. 설정에서 들어온 화면에 글자만 있으면 막다른 길이 된다. */
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="w-full py-8 rounded-2xl text-sm text-center"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface-variant)',
            border: '1px dashed var(--color-outline-variant)',
          }}
        >
          아직 올린 요리가 없어요.
          <br />
          우리 집에서 제일 자주 하는 요리부터 올려보세요.
        </button>
      ) : (
        groups.map((g) => (
          <section key={g.title} className="mb-6">
            <h2 className="text-base font-semibold tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>
              {g.title}
            </h2>
            <p className="text-xs mb-2" style={{ color: 'var(--color-outline)' }}>{g.hint}</p>
            <div className="space-y-1">
              {g.items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDetail(r)}
                  className="w-full flex items-center gap-3 min-h-[48px] px-3 py-2 rounded-xl text-left"
                  style={{ backgroundColor: 'var(--color-surface-container-low)' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--color-on-surface)' }}>{r.name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {r.cooking_method}
                      {r.status_reason ? ` · ${r.status_reason}` : ''}
                    </p>
                  </div>
                  {r.match_count > 0 && (
                    <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-primary)' }}>
                      재료 {r.match_count}/{r.total_ingredients}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {/* 검토 패널을 반드시 끼운다. 이게 없으면 이 화면은 **읽기 전용**이다 —
          「공개가 안 됐어요」의 안내가 "고친 뒤 다시 공개하거나, 사유를 확인해보세요"
          라고 말하는데 정작 공개 버튼도 거절 사유도 여기서 닿을 수 없었다.
          모두의 메뉴 카드는 진작 이걸 넘기고 있었다(SharedRecipeCard). 내 요리를
          관리하라고 만든 화면만 빠져 있었다. */}
      {detail && (
        <RecipeDetailModal
          recipe={detail}
          onClose={() => setDetail(null)}
          extra={
            <RecipeReviewPanel
              recipeId={detail.id}
              // 고치기 시트를 열면서 상세를 닫는다. 겹쳐 두면 시트를 닫았을 때
              // 방금 고치기 전 내용이 그대로인 상세가 남아 되돌아간 것처럼 보인다.
              onEdit={(d) => { setDetail(null); setEditing(d) }}
              onChanged={load}
            />
          }
        />
      )}
      {editing && (
        <AddRecipeSheet
          editing={editing}
          onClose={() => setEditing(null)}
          onCreated={() => { setEditing(null); load() }}
        />
      )}
      {composing && (
        <AddRecipeSheet
          onClose={() => setComposing(false)}
          onCreated={() => { setComposing(false); load() }}
        />
      )}
    </div>
  )
}
