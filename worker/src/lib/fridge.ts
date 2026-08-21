import { todayKst, daysBetween } from './dates'

/**
 * 가족 냉장고를 매칭에 쓸 수 있는 형태로 읽는다. 소문자 정규화까지 여기서 한다.
 *
 * lib/recipe-match.ts 에서 갈라져 나왔다. 그쪽은 순수 함수만 두어야 한다 —
 * D1Database 타입이 섞이면 프론트 테스트가 import 할 때 빌드가 깨진다.
 */
export async function loadFridge(
  db: D1Database,
  familyId: string,
): Promise<{ fridge: string[]; urgent: string[] }> {
  const { results } = await db
    .prepare('SELECT name, normalized_name, expiry_date FROM ingredients WHERE family_id = ?')
    .bind(familyId)
    .all<{ name: string; normalized_name: string | null; expiry_date: string }>()

  const today = todayKst()
  const rows = results ?? []
  const norm = (r: { name: string; normalized_name: string | null }) =>
    (r.normalized_name || r.name).toLowerCase().trim()
  return {
    fridge: rows.map(norm),
    urgent: rows.filter((r) => daysBetween(today, r.expiry_date) <= 3).map(norm),
  }
}
