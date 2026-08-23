import { approvalStillValid } from './recipe-content'
import { scoreRecipe } from './recipe-match'
import { likePattern } from './recipe-search'
import { safeStringArray } from './sanitize'

/**
 * 공유 레시피 접근 계층 — **누가 볼 수 있는가**와 **행이 응답이 되는 법**.
 *
 * 라우트 세 곳(`shared-recipes.ts` 목록/단건, `recipes.ts` 검색/단건)이 전부
 * 여기를 통한다. 라우트가 라우트를 import 하지 않기 위해서이기도 하지만,
 * 더 중요한 건 아래 이유다.
 *
 * 이걸 상수로 뽑아낸 이유는 DRY 가 아니라 **보안**이다.
 *
 * 규칙을 복제하면 언젠가 한쪽만 고쳐진다. 그리고 이 규칙의 한쪽이 느슨해지면
 * 이런 일이 벌어진다:
 *
 *   작성자가 공개 검토 통과  →  모든 사용자가 목록에서 그 레시피 id 를 본다
 *        →  작성자가 "가족만 보기" 로 내린다
 *        →  id 는 여전히 유효하다
 *        →  스코프를 검사하지 않는 엔드포인트가 하나라도 있으면 계속 읽힌다
 *        →  **공개를 내린 행위가 아무 효과가 없다**
 *
 * UUID 라서 추측은 못 하지만, 한 번 공개됐던 id 는 이미 모두가 봤다.
 * 그래서 목록·검색·단건 조회 셋이 반드시 같은 WHERE 를 타야 한다.
 *
 * `approved_hash = content_hash` 조건이 붙는 것도 같은 이유다 — 공개한 뒤
 * 내용을 고치면 해시가 어긋나고, 그 순간 남에게는 안 보인다.
 */
export const VISIBLE_WHERE = `(family_id = ?
        OR (visibility = 'public' AND status = 'approved' AND approved_hash = content_hash))`

/** 응답을 만들 때 필요한 컬럼 전부. `SELECT *` 를 쓰지 않는다. */
export const RECIPE_COLUMNS = `id, family_id, visibility, content_hash, approved_hash, updated_at,
            title, category, cooking_method, ingredients, manual_steps, tip, calories,
            author_id, author_name, author_key, is_anonymous, status, status_reason, created_at`

export interface SharedRecipeRow {
  id: string
  family_id: string | null
  visibility: string
  content_hash: string
  approved_hash: string | null
  updated_at: string
  title: string
  category: string
  cooking_method: string
  ingredients: string
  manual_steps: string
  tip: string | null
  calories: string | null
  author_id: string | null
  author_name: string
  author_key: string
  is_anonymous: number
  status: string
  status_reason: string | null
  created_at: string
}

/**
 * 제목으로 검색. **볼 수 있는 것만.**
 *
 * LIKE 는 인덱스를 못 타므로 테이블 전체를 스캔한다. D1 은 스캔한 행 수로
 * 과금하지만(무료 5M행/일) 이 테이블은 가족 단위라 작고, LIMIT 도 걸려 있다.
 * 카탈로그 쪽 검색은 이미 캐시된 배열을 필터하므로 0행이다.
 */
export async function searchShared(
  db: D1Database,
  familyId: string | null,
  q: string,
  limit: number,
): Promise<SharedRecipeRow[]> {
  /* ESCAPE 를 명시하지 않으면 q 안의 % 가 와일드카드로 살아서 전부 매칭된다.
     likePattern 은 D1 의 50바이트 상한도 같이 지킨다 (넘기면 500 이 난다). */
  const pattern = likePattern(q)
  const { results } = await db
    .prepare(
      `SELECT ${RECIPE_COLUMNS}
         FROM shared_recipes
        WHERE ${VISIBLE_WHERE}
          AND title LIKE ? ESCAPE '\\'
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .bind(familyId ?? '', pattern, limit)
    .all<SharedRecipeRow>()
  return results ?? []
}

/**
 * id 로 한 건. **볼 수 없으면 null** — 존재 여부를 흘리지 않는다.
 *
 * 작성자는 언제나 자기 글을 본다. 가족을 떠나면 family_id 가 NULL 이 되는데
 * (0008 의 `ON DELETE SET NULL`), 그때도 본인 글은 열려야 한다.
 *
 * ── 이 함수가 고치는 실제 버그 ──────────────────────────────────────
 *
 * `routes/shared-recipes.ts` 의 `GET /:id` 는 이런 JS 검사를 쓰고 있었다:
 *
 *     const visible = row.family_id === user.family_id || approvalStillValid(row)
 *
 * `approvalStillValid` 는 status 와 해시만 본다 — **visibility 를 안 본다.**
 * 그런데 `POST /:id/unpublish` 는 `visibility` 만 'family' 로 바꾸고 status 와
 * approved_hash 는 그대로 둔다 (그래야 내용 안 바뀐 재공개가 공짜다).
 *
 * 그래서 공개했다가 내린 레시피가 **status='approved' + 해시 일치** 상태로 남고,
 * 목록에서는 사라지는데 `GET /:id` 는 아무에게나 계속 열어줬다. 그 id 는
 * 공개돼 있던 동안 이미 모두가 봤다. 로컬 D1 로 두 판정이 어긋나는 것을 확인했다:
 *     목록 WHERE → False,  GET /:id JS 검사 → True.
 *
 * 규칙이 두 벌이라 생긴 일이다. 이제 한 벌만 둔다.
 */
export async function findSharedForViewer(
  db: D1Database,
  familyId: string | null,
  viewerId: string,
  id: string,
): Promise<SharedRecipeRow | null> {
  if (!id) return null
  return await db
    .prepare(
      `SELECT ${RECIPE_COLUMNS}
         FROM shared_recipes
        WHERE id = ? AND (${VISIBLE_WHERE} OR author_id = ?)`,
    )
    .bind(id, familyId ?? '', viewerId)
    .first<SharedRecipeRow>()
}

/**
 * DB 행 → 응답. **응답을 만드는 유일한 곳이다.**
 *
 * `routes/shared-recipes.ts` 안에 있던 것을 옮겼다. 거기 있는 동안에는
 * "유일한 곳" 이 그 파일 안에서만 참이었다 — 검색 엔드포인트가 생기면서
 * 두 번째 호출부가 필요해졌고, 라우트에서 라우트를 import 할 수는 없다.
 *
 * 이 저장소는 `SELECT *` 한 뒤 그대로 c.json() 하는 습관이 있다
 * (calendar.ts, scan.ts:159). 그 습관이 이 테이블에 한 번만 적용되면
 * 익명 글의 author_id 가 모든 독자에게 나간다. 그래서 행을 펼치지 않는다.
 */
export function publicRecipe(
  r: SharedRecipeRow,
  viewerId: string,
  fridge: string[],
  urgent: string[],
) {
  const mine = r.author_id != null && r.author_id === viewerId
  const ingredients = safeStringArray(r.ingredients)
  return {
    id: r.id,
    name: r.title,
    category: r.category,
    cooking_method: r.cooking_method,
    calories: r.calories ?? '',
    image_url: '',
    ingredients,
    manual_steps: safeStringArray(r.manual_steps),
    manual_images: [] as string[],
    tip: r.tip ?? '',
    source: 'custom' as const,
    // 익명이면 이름을 아예 만들지 않는다. 작성자 본인에게만 "내가 올린" 을 알려준다.
    author_label: r.is_anonymous ? '익명' : r.author_name,
    is_mine: mine,
    status: r.status,
    visibility: r.visibility,
    /* 승인이 아직 유효한가. 수정하면 approved_hash 와 어긋나므로 false 가 된다.
       화면이 "수정해서 공개가 풀렸어요" 를 말할 근거다. */
    approval_valid: approvalStillValid(r),
    // 거절 사유는 작성자에게만. 남의 글이 왜 거절됐는지 알 이유가 없다.
    status_reason: mine ? r.status_reason : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    /* 추천 목록과 **같은 모양**으로 내보낸다. 이게 없으면 RecipeCard 와
       RecipeDetailModal 이 match_ratio 없는 객체를 받고, 두 컴포넌트에 전부
       분기가 생긴다. 계산은 lib/recipe-match.ts 한 곳에서 한다. */
    ...scoreRecipe(ingredients, fridge, urgent),
  }
}
