/**
 * 레시피 내용 해시 — "수정됐는가" 를 판정하는 유일한 기준.
 *
 * 승인 시점 해시(approved_hash)와 지금 해시(content_hash)를 비교해서
 * 재승인이 필요한지 정한다. 저장 버튼을 눌렀어도 내용이 그대로면 해시가
 * 같으므로 Gemini 를 다시 부르지 않는다.
 *
 * **무엇을 넣고 무엇을 뺐는가가 이 함수의 전부다.**
 *   넣는다: 제목, 분류, 조리방법, 재료, 조리순서, 팁
 *           — 먹을 수 있는 음식인지 판단에 영향을 주는 것들
 *   뺀다  : 칼로리(Gemini 가 채운다 — 넣으면 승인 직후 해시가 달라져서
 *           무한 재승인이 된다), 작성자, 익명 여부, 공개 범위, 시각
 *
 * 재료·순서는 배열이라 **순서가 의미를 갖는다.** ["소금","설탕"] 과
 * ["설탕","소금"] 은 다른 레시피로 본다. 정렬하지 않는다.
 */
export interface RecipeContent {
  title: string
  category: string
  cooking_method: string
  ingredients: string[]
  manual_steps: string[]
  tip: string | null
}

export async function contentHash(c: RecipeContent): Promise<string> {
  /* JSON.stringify 는 키 순서를 보존한다. 여기서 직접 배열을 만들어
     넘기므로 객체 키 순서에 의존하지 않는다 — 나중에 인터페이스에
     필드를 추가해도 순서 때문에 해시가 흔들리지 않는다. */
  const canonical = JSON.stringify([
    c.title.trim(),
    c.category,
    c.cooking_method,
    c.ingredients.map((s) => s.trim()),
    c.manual_steps.map((s) => s.trim()),
    (c.tip ?? '').trim(),
  ])
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 승인이 아직 유효한가. 내용이 승인 시점과 같아야 한다. */
export function approvalStillValid(row: {
  status: string
  content_hash: string
  approved_hash: string | null
}): boolean {
  return row.status === 'approved' && !!row.approved_hash && row.approved_hash === row.content_hash
}
