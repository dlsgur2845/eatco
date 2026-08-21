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
let onFridgeChange: (() => void) | null = null

/** 순환 import 를 피하려고 api/recipes.ts 가 자기 무효화 함수를 등록한다. */
export function registerFridgeChangeHandler(fn: () => void): void {
  onFridgeChange = fn
}

// 401 응답 시 저장된 신원만 비우고 호출부가 처리하게 둔다.
// 401 은 세션 만료다. 리다이렉트는 화면마다 사정이 달라 여기서 하지 않는다.
api.interceptors.response.use(
  (response) => {
    const method = (response.config.method ?? 'get').toLowerCase()
    if (method !== 'get' && MUTATES_FRIDGE.test(response.config.url ?? '')) {
      onFridgeChange?.()
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('user')
    }
    return Promise.reject(error)
  },
)

export default api
