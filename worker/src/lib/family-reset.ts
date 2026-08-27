import { isExpired } from './family-reset-rules'
export * from './family-reset-rules'

/**
 * 가족 데이터 초기화 — 보관 후 삭제, 7일 안에 복구 가능.
 *
 * **세는 규칙과 지우는 규칙이 이 파일 하나에만 있다.** 갈라지면
 * "재료 3개 지웁니다" 라고 보여주고 5개를 지운다. 같은 WHERE 를 공유한다.
 */

/**
 * 지울 테이블과, 그 테이블에서 「우리 가족 것」을 고르는 조건.
 *
 * `columns` 는 복구를 위해 필요하다. `SELECT *` 로 보관하면 컬럼 순서에 기대게
 * 되는데, 복구는 이름으로 되돌려야 안전하다.
 *
 * 순서가 중요하다 — 자식을 먼저 보관하고 먼저 지운다. 부모를 먼저 지우면
 * `ON DELETE CASCADE` 가 자식을 **보관하기 전에** 날려버린다.
 */
export interface ResetTable {
  name: string
  columns: string[]
  /** `?` 는 family_id 하나만 받는다. */
  where: string
  /** 사용자에게 보여줄 이름. null 이면 개수를 안 보여준다(내부 정리용). */
  label: string | null
}

/**
 * **`name` 과 `where` 는 SQL 에 그대로 끼워넣는다.** 아래 상수 배열이 유일한
 * 출처이고 전부 하드코딩된 문자열이라 안전하다. 사용자 입력이나 요청 파라미터로
 * 이 값을 만들면 그 순간 SQL 인젝션이 된다 — family_id 처럼 바인딩(`?`)을 쓸 것.
 */
export const RESET_TABLES: ResetTable[] = [
  // 지워질 레시피의 개선 이력. 부모(shared_recipes)보다 **먼저** 보관/삭제해야 한다.
  // CASCADE 가 걸려 있어서, 부모를 먼저 지우면 이건 보관되지 못하고 사라진다.
  {
    name: 'recipe_improvements',
    columns: ['id', 'recipe_id', 'body', 'content_hash', 'created_at'],
    where: `recipe_id IN (SELECT id FROM shared_recipes WHERE family_id = ? AND visibility = 'family')`,
    label: null,
  },
  {
    name: 'meal_comments',
    columns: ['id', 'meal_plan_id', 'family_id', 'body', 'created_by', 'created_by_name', 'created_at'],
    where: 'family_id = ?',
    label: null,
  },
  {
    name: 'ingredients',
    columns: [
      'id', 'name', 'category_id', 'storage_method', 'quantity', 'amount_value', 'unit',
      'price', 'expiry_date', 'registered_at', 'image_url', 'family_id', 'registered_by',
      'store_name', 'normalized_name',
    ],
    where: 'family_id = ?',
    label: '재료',
  },
  {
    name: 'meal_plans',
    columns: [
      'id', 'family_id', 'plan_date', 'meal_slot', 'title', 'memo', 'created_by',
      'created_by_name', 'created_at', 'recipe_source', 'recipe_id', 'recipe_ingredients',
    ],
    where: 'family_id = ?',
    label: '식단',
  },
  {
    // **가족 공개분만.** 전체 공개된 레시피는 이미 다른 가족이 보고 있다.
    // 우리 냉장고를 비우는 일이 남의 화면에서 글을 지우는 일이 되면 안 된다.
    name: 'shared_recipes',
    columns: [
      'id', 'family_id', 'title', 'category', 'cooking_method', 'ingredients', 'manual_steps',
      'tip', 'calories', 'author_id', 'author_name', 'author_key', 'is_anonymous', 'visibility',
      'status', 'status_reason', 'moderated_at', 'content_hash', 'approved_hash',
      'created_at', 'updated_at',
    ],
    where: `family_id = ? AND visibility = 'family'`,
    label: '우리 가족 요리',
  },
  {
    name: 'notification_logs',
    columns: ['id', 'family_id', 'type', 'title', 'message', 'is_read', 'link', 'days_before', 'created_at', 'actor_id'],
    where: 'family_id = ?',
    label: '알림 기록',
  },
]

/** 사용자에게 보여줄 개수만. label 이 null 인 내부 테이블은 뺀다. */
export interface ResetCounts {
  [label: string]: number
}

export async function countResettable(db: D1Database, familyId: string): Promise<ResetCounts> {
  const out: ResetCounts = {}
  for (const t of RESET_TABLES) {
    if (!t.label) continue
    const row = await db
      .prepare(`SELECT COUNT(*) AS n FROM ${t.name} WHERE ${t.where}`)
      .bind(familyId)
      .first<{ n: number }>()
    out[t.label] = row?.n ?? 0
  }
  return out
}

export function totalCount(counts: ResetCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0)
}

/**
 * 보관하고 지운다. **한 트랜잭션이다.**
 *
 * 순차 `run()` 으로 돌리면 재료를 지운 뒤 워커가 죽었을 때 식단만 남는다.
 * 반쯤 초기화된 냉장고는 초기화 안 한 것보다 나쁘다 — 무엇이 남았는지
 * 아무도 모른다. `batch()` 는 전부 성공하거나 전부 실패한다.
 */
export function buildResetStatements(
  db: D1Database,
  familyId: string,
  requestId: string,
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = []
  for (const t of RESET_TABLES) {
    const jsonPairs = t.columns.map((c) => `'${c}', ${c}`).join(', ')
    stmts.push(
      db
        .prepare(
          `INSERT INTO family_reset_archive (request_id, table_name, row_json)
           SELECT ?, ?, json_object(${jsonPairs}) FROM ${t.name} WHERE ${t.where}`,
        )
        .bind(requestId, t.name, familyId),
    )
    stmts.push(db.prepare(`DELETE FROM ${t.name} WHERE ${t.where}`).bind(familyId))
  }
  return stmts
}

/**
 * 보관분을 되돌려 넣는다.
 *
 * **역순으로 넣는다.** 보관은 자식 → 부모 순서였으니 복구는 부모 → 자식이어야
 * 외래키가 성립한다. 부모 없는 자식을 먼저 넣으면 FK 위반으로 전부 롤백된다.
 *
 * `INSERT OR IGNORE` 인 이유: 복구를 두 번 눌러도 중복 행이 생기면 안 된다.
 * 같은 id 가 이미 있으면 그냥 넘어간다.
 */
export function buildRestoreStatements(db: D1Database, requestId: string): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = []
  for (const t of [...RESET_TABLES].reverse()) {
    const cols = t.columns.join(', ')
    const extracts = t.columns.map((c) => `json_extract(row_json, '$.${c}')`).join(', ')
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO ${t.name} (${cols})
           SELECT ${extracts} FROM family_reset_archive
            WHERE request_id = ? AND table_name = ?`,
        )
        .bind(requestId, t.name),
    )
  }
  stmts.push(db.prepare('DELETE FROM family_reset_archive WHERE request_id = ?').bind(requestId))
  return stmts
}

/**
 * 복구 창이 지난 보관분을 진짜로 지운다. 시간당 cron 에서 부른다.
 *
 * 보관 테이블만 비우고 요청 행은 남긴다 — "언제 무엇을 초기화했다" 는 기록은
 * 남아야 한다. `status` 는 `done` 그대로 두되 `purge_after` 를 지워서
 * 「되돌리기」 버튼이 사라지게 한다.
 */
export async function purgeExpiredResets(db: D1Database): Promise<number> {
  const now = new Date().toISOString()
  const { results } = await db
    .prepare(`SELECT id FROM family_reset_requests WHERE status='done' AND purge_after IS NOT NULL AND purge_after <= ?`)
    .bind(now)
    .all<{ id: string }>()
  const ids = (results ?? []).map((r) => r.id)
  if (!ids.length) return 0

  for (const id of ids) {
    await db.batch([
      db.prepare('DELETE FROM family_reset_archive WHERE request_id = ?').bind(id),
      db.prepare('UPDATE family_reset_requests SET purge_after = NULL WHERE id = ?').bind(id),
    ])
  }
  return ids.length
}
