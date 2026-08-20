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
// 401 은 Access 세션 만료다. 비밀번호 로그인 페이지가 없으므로
// 리다이렉트 대신 저장된 신원만 비우고 호출부가 처리하게 둔다.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('user')
    }
    return Promise.reject(error)
  },
)

export default api
