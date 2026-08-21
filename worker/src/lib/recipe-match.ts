/**
 * 냉장고 재료 ↔ 레시피 재료 매칭.
 *
 * recipes.ts 안에만 있던 것을 끌어냈다. 공유 레시피(shared-recipes.ts)도 같은
 * 점수를 붙여야 하기 때문이다 — 붙이지 않으면 RecipeCard 와 RecipeDetailModal 이
 * match_ratio 없는 객체를 받고, 두 컴포넌트에 전부 `'match_ratio' in recipe`
 * 분기가 생긴다. 서버에서 한 번 계산해 같은 모양으로 내보내는 쪽이 싸다.
 *
 * **복사하지 말 것.** 매칭 규칙이 두 벌이 되면 같은 재료가 화면에 따라
 * 매칭되기도 하고 안 되기도 한다.
 *
 * **여기는 순수 함수만 둔다 — DB 도, Cloudflare 타입도 넣지 말 것.**
 * 냉장고를 읽는 loadFridge 는 lib/fridge.ts 로 뺐다. 이 파일이 D1Database 를
 * 참조하는 순간 프론트 테스트(recipe-match.test.ts)가 이걸 import 하면서
 * `tsc -b` 가 통째로 깨진다 — 프론트 tsconfig 에는 workers-types 가 없다.
 * 실제로 그렇게 빌드가 깨져서 갈랐다.
 */

const PAREN = /\([^)]*\)/g
const QUANTITY = /\s*[\d/.]+\s*(g|kg|ml|L|개|모|마리|줄기|큰술|작은술|쪽|cm|장|컵|봉지|포기).*$/
const PREFIX = /^(다진|썬|채썬|간|삶은|데친|볶은|구운|찐|튀긴)\s*/

export function normalizeIngredient(text: string): string {
  let t = text.trim()
  t = t.replace(PAREN, '')
  t = t.replace(QUANTITY, '')
  t = t.replace(PREFIX, '')
  t = t.replace(/\d+/g, '')
  return t.replace(/^[\s,.]+|[\s,.]+$/g, '')
}

export function extractIngredients(parts: string): string[] {
  const out: string[] = []
  for (let line of parts.replace(/\n/g, ',').split(',')) {
    line = line.trim()
    if (!line || line.length < 2) continue
    if (line.endsWith(':') || line.startsWith('●') || line.startsWith('·')) {
      line = line.replace(/^[●·]+/, '').replace(/:$/, '').trim()
      if (line.length < 2) continue
    }
    const name = normalizeIngredient(line)
    if (name && name.length >= 2) out.push(name)
  }
  return out
}

/** 단어 경계 + 접미사 매칭. "순두부" 는 "두부" 를 포함하지만 "삼겹살" 은 "돼지고기" 와 무관. */
export function isWordMatch(a: string, b: string): boolean {
  if (a === b) return true
  const aw = a.split(/\s+/).filter(Boolean)
  const bw = b.split(/\s+/).filter(Boolean)
  const bset = new Set(bw)
  for (const w of aw) if (w.length >= 2 && bset.has(w)) return true
  const aset = new Set(aw)
  for (const w of bw) if (w.length >= 2 && aset.has(w)) return true
  for (const x of aw) {
    for (const y of bw) {
      const [short, long] = x.length <= y.length ? [x, y] : [y, x]
      if (short.length >= 2 && long.endsWith(short)) return true
    }
  }
  return false
}

export interface MatchScore {
  match_count: number
  total_ingredients: number
  match_ratio: number
  matched_items: string[]
  missing_items: string[]
  urgent_used: string[]
}

/** 레시피 하나에 매칭 점수를 붙인다. fridge/urgent 는 소문자 정규화된 상태여야 한다. */
export function scoreRecipe(ingredients: string[], fridge: string[], urgent: string[]): MatchScore {
  const matched: string[] = []
  const missing: string[] = []
  const urgentUsed: string[] = []
  for (const ri of ingredients) {
    const r = ri.toLowerCase().trim()
    const hit = fridge.find((f) => isWordMatch(r, f))
    if (hit) {
      matched.push(ri)
      if (urgent.includes(hit)) urgentUsed.push(ri)
    } else {
      missing.push(ri)
    }
  }
  const total = ingredients.length || 1
  // 한 레시피가 같은 재료를 여러 줄에 적는 경우가 흔하다(양념/고명 등).
  // 화면에 "두부, 양파, 두부, 양파" 로 보이지 않게 중복을 제거한다.
  const uniq = (xs: string[]) => [...new Set(xs)]
  const matchedU = uniq(matched)
  return {
    match_count: matchedU.length,
    total_ingredients: total,
    match_ratio: matched.length / total,
    matched_items: matchedU,
    missing_items: uniq(missing),
    urgent_used: uniq(urgentUsed),
  }
}
