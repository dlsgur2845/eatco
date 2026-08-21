import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// **실제 컴포넌트를 가져온다.** 규칙을 테스트 안에 베껴 쓰면 App.tsx 가 바뀌어도
// 테스트는 계속 통과한다 — 사본을 검증하는 셈이라 아무것도 못 막는다.
import { ScrollToTopOnTabChange } from './App'

// App.tsx 는 AuthGuard 에서 api 를 부른다. 여기서는 그 컴포넌트만 쓰므로 막아둔다.
vi.mock('./api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

function Nav() {
  const navigate = useNavigate()
  return (
    <div>
      <button onClick={() => navigate('/calendar')}>식단</button>
      <button onClick={() => navigate('/calendar/abc123')}>식단상세</button>
      <button onClick={() => navigate('/calendar', { replace: true })}>상세닫기</button>
      <button onClick={() => navigate('/inventory')}>재고</button>
      <button onClick={() => navigate('/')}>냉장고</button>
    </div>
  )
}

function harness(initial = '/') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <ScrollToTopOnTabChange />
      <Nav />
      <Routes>
        <Route path="/" element={<div>대시보드</div>} />
        <Route path="/inventory" element={<div>재고화면</div>} />
        <Route path="/calendar" element={<div>식단화면</div>} />
        <Route path="/calendar/:id" element={<div>식단화면</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

let scrollTo: ReturnType<typeof vi.fn>

beforeEach(() => {
  scrollTo = vi.fn()
  Object.defineProperty(window, 'scrollTo', { value: scrollTo, writable: true })
})

describe('탭 이동 시 스크롤 초기화', () => {
  it('다른 탭으로 가면 맨 위로 올린다', async () => {
    harness('/calendar')
    scrollTo.mockClear()
    screen.getByText('재고').click()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' }))
  })

  it('탭을 여러 번 옮겨도 매번 올린다', async () => {
    harness('/calendar')
    scrollTo.mockClear()
    screen.getByText('재고').click()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1))
    screen.getByText('냉장고').click()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(2))
    screen.getByText('식단').click()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(3))
  })

  it('같은 탭 안의 딥링크 이동은 건드리지 않는다', async () => {
    // 알림에서 /calendar/<id> 로 들어왔다가 상세를 닫으면 /calendar 로 replace 한다.
    // 여기서 맨 위로 올리면 모달을 닫는 순간 보던 자리를 뺏긴다.
    harness('/calendar')
    scrollTo.mockClear()
    screen.getByText('식단상세').click()
    await waitFor(() => expect(screen.getByText('식단화면')).toBeTruthy())
    expect(scrollTo).not.toHaveBeenCalled()
    screen.getByText('상세닫기').click()
    await new Promise((r) => setTimeout(r, 20))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('딥링크로 바로 들어온 뒤 다른 탭으로 나가면 올린다', async () => {
    harness('/calendar/abc123')
    scrollTo.mockClear()
    screen.getByText('재고').click()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' }))
  })

  it('같은 탭을 다시 눌러도 올리지 않는다', async () => {
    harness('/inventory')
    scrollTo.mockClear()
    screen.getByText('재고').click()
    await new Promise((r) => setTimeout(r, 20))
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
