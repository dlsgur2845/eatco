/**
 * 사용자 입력을 다듬는 순수 함수 두 개.
 *
 * 원래 `routes/shared-recipes.ts` 안에 있었다. 식단이 레시피를 붙이면서
 * `routes/calendar.ts` 와 `lib/recipe-search.ts` 도 같은 규칙이 필요해졌다.
 * 세 벌이 되면 한 곳만 상한을 고쳤을 때 화면마다 다른 길이가 통과한다.
 *
 * **여기는 순수 함수만 둔다 — DB 도, Cloudflare 타입도 넣지 말 것.**
 * `lib/recipe-match.ts` 와 같은 이유다: 프론트 vitest 가 이 파일을 직접
 * import 하므로, D1Database 를 참조하는 순간 `tsc -b` 가 통째로 깨진다
 * (프론트 tsconfig 에는 workers-types 가 없다).
 */

/**
 * 제어문자와 꺾쇠를 턴다.
 *
 * 범위는 \x00-\x1f 와 \x7f(DEL). **이스케이프로 쓴다** — 리터럴 제어문자를
 * 그대로 넣으면 파일에 NUL 바이트가 박혀서 git 이 이 파일을 바이너리로 보고
 * diff 도 blame 도 안 준다. 실제로 한 번 그렇게 커밋됐다.
 *
 * 지금 렌더러는 JSX 라 꺾쇠를 안 털어도 안전하지만, 다음 렌더러는 모른다.
 */
export function cleanText(s: string, max: number): string {
  return s
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max)
}

/**
 * JSON 문자열 → 문자열 배열. **절대 throw 하지 않는다.**
 *
 * 읽기 경로에서 쓰인다. 깨진 행 하나가 그날 식단 전체를 500 으로 만들면 안 된다.
 * 배열이 아니거나 원소가 문자열이 아니면 조용히 버린다.
 */
export function safeStringArray(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
