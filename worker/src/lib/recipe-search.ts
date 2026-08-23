import { cleanText, safeStringArray } from './sanitize'

/**
 * 레시피 검색과 «식단에 붙은 레시피» 검증.
 *
 * **여기는 순수 함수만 둔다 — DB 도, Cloudflare 타입도, ApiError 도 넣지 말 것.**
 * `lib/recipe-match.ts` 와 같은 규칙이다. 프론트 vitest 가 이 파일을 직접
 * import 해서 테스트한다 (`frontend/src/lib/recipe-search.test.ts`).
 * ApiError 를 던지지 않고 결과 객체를 돌려주는 것도 그래서다 — errors.ts 는
 * hono 를 import 하고, 그게 프론트 타입체크에 딸려 들어오면 안 된다.
 * 422 로 바꾸는 건 라우트의 일이다.
 */

/** 소문자 + 공백 제거. "김치 찌개" 와 "김치찌개" 를 같게 본다. */
export function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, '')
}

/**
 * SQL LIKE 의 와일드카드를 턴다.
 *
 * 안 하면 `q='%'` 가 `LIKE '%%%'` 가 되어 **전부 매칭**된다. 스코프는 그대로
 * 강제되므로 보안 구멍은 아니지만, 사용자가 '%' 를 치면 남의 레시피가 아니라
 * 자기 가족 것 전부가 쏟아진다 — 그냥 틀린 결과다.
 *
 * 역슬래시를 **먼저** 바꿔야 한다. 나중에 바꾸면 방금 넣은 이스케이프 문자를
 * 또 이스케이프한다. 호출부는 `LIKE ? ESCAPE '\'` 로 써야 한다.
 */
export function escapeLike(q: string): string {
  return q.replace(/\\/g, '\\\\').replace(/[%_]/g, (m) => '\\' + m)
}

/**
 * 검색어 상한. 요리 이름을 찾는 자리라 이 정도면 넉넉하다.
 *
 * 두 카탈로그가 **같은 문자열**을 봐야 결과가 어긋나지 않으므로 라우트에서
 * 한 번 자른다. LIKE 패턴 쪽 한계는 아래 likePattern 이 따로 지킨다.
 */
export const MAX_QUERY_CHARS = 40

/**
 * 한 페이지에 보여주는 검색 결과 수.
 *
 * 8 이었다가 10 으로 올렸다. 실측하니 흔한 질의가 **8건보다 훨씬 많다** —
 * "김치" 46건, "닭" 62건, "국" 78건, "두부" 88건, "밥" 96건 (1,156개 카탈로그
 * 기준, 공유 레시피 제외). 8건은 «다 못 찾겠다» 는 말이 나올 수밖에 없는 크기였다.
 */
export const SEARCH_PAGE_SIZE = 10

/** offset 상한. 이보다 깊이 가려면 질의를 좁히는 게 맞다. */
export const MAX_SEARCH_OFFSET = 500

/**
 * D1 의 LIKE 패턴 바이트 상한. **실측값이다.**
 *
 * SQLite 의 SQLITE_MAX_LIKE_PATTERN_LENGTH 기본값은 50,000 인데 D1 은 **50** 이다.
 * 로컬 D1 로 이분해서 확인했다:
 *   ascii 48바이트 → 200,  49바이트 → 500
 *   한글 16자(48바이트) → 200,  17자(51바이트) → 500
 * 넘으면 `D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR` 로 500 이 난다.
 *
 * **한글은 UTF-8 3바이트라 16글자면 걸린다.** 사용자가 긴 이름을 붙여넣기만 해도
 * 검색이 통째로 깨진다. 실제로 브라우저 점검에서 그렇게 터졌다.
 */
export const MAX_LIKE_PATTERN_BYTES = 50

const utf8Len = (s: string): number => new TextEncoder().encode(s).length

/**
 * `%...%` LIKE 패턴을 만든다. **상한을 넘지 않을 때까지 뒤에서 줄인다.**
 *
 * 이스케이프가 길이를 늘리기 때문에(`%` → `\%`) 원본 길이만 재면 안 된다.
 * 줄이면 접두사 검색이 되어 결과가 **더 넓어질 뿐** 틀리지 않는다 —
 * 0건이라고 거짓말하는 것보다 낫고, 500 보다는 훨씬 낫다.
 */
export function likePattern(q: string): string {
  let s = q
  for (;;) {
    const p = `%${escapeLike(s)}%`
    if (!s || utf8Len(p) <= MAX_LIKE_PATTERN_BYTES) return p
    s = s.slice(0, -1)
  }
}

/**
 * 질의 적합도. 낮을수록 먼저 나온다. -1 은 매칭 없음.
 *
 *   0 — 이름이 질의로 **시작**한다  ("김치" → "김치찌개")
 *   1 — 이름이 질의를 **포함**한다  ("김치" → "돼지고기김치볶음")
 *  -1 — 없음
 *
 * 접두사를 먼저 두는 이유: 사람이 "김치" 를 치면 김치로 시작하는 요리를
 * 찾는 중이지, 김치가 재료로 들어간 요리를 훑는 중이 아니다.
 */
export function queryRank(name: string, normalizedQuery: string): number {
  if (!normalizedQuery) return -1
  const n = normalizeQuery(name)
  if (n.startsWith(normalizedQuery)) return 0
  if (n.includes(normalizedQuery)) return 1
  return -1
}

/**
 * 적합도 → 짧은 이름 순으로 **전부** 정렬한다. 매칭 없는 건 버린다.
 *
 * 같은 적합도에서 짧은 이름을 앞에 두는 이유: "김치찌개" 가 "묵은지김치찌개
 * 만들기" 보다 사용자가 친 것에 가깝다. 동점이면 원래 순서를 지킨다(안정 정렬).
 *
 * **자르지 않고 다 준다.** 페이지를 넘기려면 전체 순서가 안정적이어야 하기
 * 때문이다 — 페이지마다 다시 자르면 2페이지가 1페이지와 겹치거나 건너뛴다.
 * 자르는 건 호출부가 offset 과 함께 한다. 1,156개 문자열 정렬은 무료 CPU
 * 예산(10ms) 안에서 무시할 수 있는 비용이고, 비싼 건 그 다음의 재료 매칭이라
 * **잘라낸 한 페이지에만** scoreRecipe 를 돌린다.
 */
export function rankAll<T>(items: T[], nameOf: (x: T) => string, q: string): T[] {
  const nq = normalizeQuery(q)
  if (!nq) return []
  const scored: { item: T; rank: number; len: number; i: number }[] = []
  for (let i = 0; i < items.length; i++) {
    const name = nameOf(items[i])
    const rank = queryRank(name, nq)
    if (rank >= 0) scored.push({ item: items[i], rank, len: name.length, i })
  }
  scored.sort((a, b) => a.rank - b.rank || a.len - b.len || a.i - b.i)
  return scored.map((s) => s.item)
}

/* ──────────────────────────────────────────────
   식단에 붙는 레시피
   ────────────────────────────────────────────── */

export const RECIPE_SOURCES = ['foodsafety', 'custom'] as const
export type RecipeSource = (typeof RECIPE_SOURCES)[number]

/** 재료 상한. `shared-recipes.ts` 의 등록 상한과 같은 값이어야 한다. */
export const MAX_ATTACHED_INGREDIENTS = 30
export const MAX_ATTACHED_INGREDIENT_LEN = 50
export const MAX_RECIPE_ID_LEN = 100

export interface RecipeAttachment {
  source: RecipeSource
  id: string
  ingredients: string[]
}

export type AttachmentResult =
  | { ok: true; value: RecipeAttachment | null }
  | { ok: false; reason: string }

/**
 * 본문에서 레시피 연결을 뽑아낸다. **셋 다 있거나, 셋 다 없거나.**
 *
 * 반쪽 상태(recipe_id 는 있는데 재료가 없는 것)를 여기서 막는다. 그 상태가
 * 저장되면 조리법 버튼은 보이는데 부족 재료는 못 세는 식단이 생긴다.
 * PATCH 로 레시피만 바꾸고 재료를 안 보내는 경로가 특히 위험하다.
 *
 * 서버는 검색 결과를 그대로 되돌려받는다고 **가정하지 않는다.** 재료는
 * 사용자가 보내는 배열이므로 등록 API 와 같은 상한·정화를 거친다.
 */
export function parseRecipeAttachment(b: {
  recipe_source?: unknown
  recipe_id?: unknown
  recipe_ingredients?: unknown
}): AttachmentResult {
  const hasSource = b.recipe_source != null && b.recipe_source !== ''
  const hasId = b.recipe_id != null && b.recipe_id !== ''
  const hasIngredients = b.recipe_ingredients != null

  if (!hasSource && !hasId && !hasIngredients) return { ok: true, value: null }
  if (!hasSource || !hasId || !hasIngredients) {
    return { ok: false, reason: '레시피 정보가 올바르지 않습니다.' }
  }

  const source = String(b.recipe_source)
  if (!(RECIPE_SOURCES as readonly string[]).includes(source)) {
    return { ok: false, reason: '레시피 출처가 올바르지 않습니다.' }
  }

  const id = cleanText(String(b.recipe_id), MAX_RECIPE_ID_LEN)
  if (!id) return { ok: false, reason: '레시피 정보가 올바르지 않습니다.' }

  if (!Array.isArray(b.recipe_ingredients)) {
    return { ok: false, reason: '레시피 재료가 올바르지 않습니다.' }
  }
  const ingredients = b.recipe_ingredients
    .slice(0, MAX_ATTACHED_INGREDIENTS)
    .map((x) => cleanText(String(x), MAX_ATTACHED_INGREDIENT_LEN))
    .filter(Boolean)

  /* 재료가 하나도 안 남으면 연결하지 않는다. 재료 0개짜리 연결은 부족 재료를
     "0개 부족" 으로 보여주는데, 그건 "다 있다" 로 읽힌다. 거짓말보다 없는 게 낫다. */
  if (!ingredients.length) return { ok: true, value: null }

  return { ok: true, value: { source: source as RecipeSource, id, ingredients } }
}

/** DB 행 → 연결 정보. 읽기 경로용이라 절대 throw 하지 않는다. */
export function readRecipeAttachment(row: {
  recipe_source: string | null
  recipe_id: string | null
  recipe_ingredients: string | null
}): RecipeAttachment | null {
  if (!row.recipe_source || !row.recipe_id) return null
  const ingredients = safeStringArray(row.recipe_ingredients)
  if (!ingredients.length) return null
  if (!(RECIPE_SOURCES as readonly string[]).includes(row.recipe_source)) return null
  return { source: row.recipe_source as RecipeSource, id: row.recipe_id, ingredients }
}
