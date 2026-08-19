import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // httpOnly 쿠키 전송을 위해 필수
  // 기본값은 무한이다. 백엔드가 멈추면 스캔 진행바가 100% 인 채로 영원히 남았다.
  // 영수증 스캔은 실측 9초대라 넉넉하게 60초.
  timeout: 60000,
})

// 401 응답 시 로그인 페이지로 리다이렉트 (로그인/회원가입 API는 제외)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register')

    if (error.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('user')

      // 세션 만료 메시지가 있으면 쿼리 파라미터로 전달
      const detail = error.response?.data?.detail || ''
      const params = detail.includes('다른 기기')
        ? '?reason=session_expired'
        : ''
      window.location.href = `/login${params}`
    }
    return Promise.reject(error)
  },
)

export default api
