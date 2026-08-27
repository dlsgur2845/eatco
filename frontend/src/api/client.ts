import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // httpOnly 쿠키 전송을 위해 필수
  // 기본값은 무한이다. 백엔드가 멈추면 스캔 진행바가 100% 인 채로 영원히 남았다.
  // 영수증 스캔은 실측 9초대라 넉넉하게 60초.
  timeout: 60000,
})

/* 냉장고 내용을 바꾸는 요청이 성공하면 레시피 추천 캐시를 비운다.
   호출부마다 기억하게 두면 반드시 한 곳을 빠뜨린다 — 재료 등록은 재고 화면,
   스캔 결과 저장, 대시보드의 "다 썼어요" 세 군데에서 일어난다.
   여기 한 곳에 두면 새 경로가 생겨도 저절로 걸린다. */
const MUTATES_FRIDGE = /^\/?(ingredients|scan)\b/
/**
 * **배열이다. 슬롯 하나가 아니다.**
 *
 * 예전에는 `let onFridgeChange = fn` 이었다. 등록하는 곳이 하나뿐이라 굴러갔지만,
 * 두 번째 소비자(모두의 메뉴 캐시)를 붙이는 순간 먼저 등록한 추천 캐시 무효화가
 * **조용히 죽는다.** 게다가 테스트가 이 모듈을 통째로 목킹해서 안 잡힌다.
 */
const fridgeChangeHandlers: (() => void)[] = []

/** 순환 import 를 피하려고 각 API 모듈이 자기 무효화 함수를 등록한다. */
export function registerFridgeChangeHandler(fn: () => void): void {
  fridgeChangeHandlers.push(fn)
}

// 401 응답 시 저장된 신원만 비우고 호출부가 처리하게 둔다.
// 401 은 세션 만료다. 리다이렉트는 화면마다 사정이 달라 여기서 하지 않는다.
//
// **403 을 여기 넣지 말 것.** 403 은 "로그인은 됐는데 이건 못 한다" 전반이다 —
// 남의 레시피 삭제, 관리자 전용 화면 접근 등. 403 에 로그아웃을 걸면 남의 글
// 삭제 버튼을 눌렀다가 튕겨 나간다. 승인 취소는 identity.ts 가 401 로 준다.
api.interceptors.response.use(
  (response) => {
    const method = (response.config.method ?? 'get').toLowerCase()
    if (method !== 'get' && MUTATES_FRIDGE.test(response.config.url ?? '')) {
      fridgeChangeHandlers.forEach((fn) => fn())
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('user')
    }
    return Promise.reject(error)
  },
)

export default api
