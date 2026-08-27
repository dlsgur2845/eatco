import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MvpDashboardPage from './MvpDashboardPage'

vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  registerFridgeChangeHandler: vi.fn(),
}))
import api from '../api/client'

/**
 * 이 화면에는 테스트가 **하나도 없었다.** 그런데 이 앱에서 가장 파괴적인 상호작용
 * (재료 삭제)이 여기 있고, 그 동작을 「3초 뒤 삭제」에서 「즉시 삭제 + 재등록 되돌리기」로
 * 통째로 바꿨다. 최소한 아래 셋은 회귀로 막는다.
 */

const ITEM = {
  id: 'old-id', name: '두부', category_id: null, storage_method: 'refrigerated',
  quantity: '1모', amount_value: null, unit: null, price: 2000,
  expiry_date: '2026-09-01', registered_at: '2026-08-20T00:00:00Z',
  image_url: null, family_id: 'f1', store_name: null, normalized_name: '두부',
  registered_by: '엄마', days_left: 5,
}

function routeGet(items: unknown[]) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === '/scan/items') return Promise.resolve({ data: items }) as never
    return Promise.resolve({ data: [] }) as never
  })
}

function calls(method: 'post' | 'delete', urlPart: string) {
  return vi.mocked(api[method]).mock.calls.filter((c) => String(c[0]).includes(urlPart))
}

function renderPage() {
  return render(<MemoryRouter><MvpDashboardPage /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  routeGet([ITEM])
  vi.mocked(api.delete).mockResolvedValue({ data: {} } as never)
  vi.mocked(api.post).mockImplementation((url: string) => {
    if (url === '/ingredients') {
      // 서버는 **새 id** 를 발급한다. 이게 이 테스트의 핵심이다.
      return Promise.resolve({ data: { ...ITEM, id: 'new-id' } }) as never
    }
    return Promise.resolve({ data: {} }) as never
  })
})

describe('MvpDashboardPage — 재료 소비', () => {
  it('「다 썼어요」는 즉시 삭제한다 (3초 기다리지 않는다)', async () => {
    // 예전에는 setTimeout 3초 안에 있었고, 그 사이 새로고침하면 삭제가 증발했다.
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /두부 사용 완료/ }))
    await waitFor(() => expect(calls('delete', '/scan/items/old-id')).toHaveLength(1))
  })

  it('되돌리기는 재등록하고, 새 id 로 교체한다', async () => {
    // 옛 id 를 그대로 넣으면 되돌린 행의 버튼이 없는 id 를 때려 404 가 난다.
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /두부 사용 완료/ }))
    fireEvent.click(await screen.findByRole('button', { name: '되돌리기' }))

    await waitFor(() => expect(calls('post', '/ingredients')).toHaveLength(1))
    const body = calls('post', '/ingredients')[0][1] as Record<string, unknown>
    // loadFridge 가 normalized_name 으로 매칭한다. 잃으면 되돌린 뒤 추천이 달라진다.
    expect(body.normalized_name).toBe('두부')
    expect(body.expiry_date).toBe('2026-09-01')

    // 재등록 뒤 그 행을 다시 지우면 **새 id** 로 나가야 한다.
    await screen.findByText(/다시 넣었어요/)
    fireEvent.click(await screen.findByRole('button', { name: /두부 사용 완료/ }))
    await waitFor(() => expect(calls('delete', '/scan/items/new-id')).toHaveLength(1))
  })

  it('되돌리기를 연타해도 재등록은 한 번만 나간다', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /두부 사용 완료/ }))
    const undo = await screen.findByRole('button', { name: '되돌리기' })
    fireEvent.click(undo)
    fireEvent.click(undo)
    fireEvent.click(undo)
    await waitFor(() => expect(calls('post', '/ingredients')).toHaveLength(1))
  })

  it('되돌리기가 실패하면 조용히 넘어가지 않는다', async () => {
    // 재료는 이미 서버에서 사라진 뒤다. 여기서 침묵하면 영영 못 되돌린다.
    vi.mocked(api.post).mockRejectedValue(new Error('offline') as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /두부 사용 완료/ }))
    fireEvent.click(await screen.findByRole('button', { name: '되돌리기' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('다시 넣지 못했어요'))
  })
})

describe('MvpDashboardPage — 수량 0', () => {
  it('수량을 0 으로 저장하려 하면 먼저 물어본다', async () => {
    // fridge.ts 가 수량을 안 읽어서, 0 을 저장하면 재료가 그대로 냉장고에 남는다.
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /두부 수량 변경/ }))
    fireEvent.change(screen.getByPlaceholderText('수량'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '확인' }))

    expect(await screen.findByText('다 쓰셨나요?')).toBeTruthy()
    expect(calls('post', '/ingredients')).toHaveLength(0)
    expect(vi.mocked(api.patch).mock.calls).toHaveLength(0)   // 0 을 저장하지 않았다
  })

  it('「네」를 고르면 삭제 경로로 간다', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /두부 수량 변경/ }))
    fireEvent.change(screen.getByPlaceholderText('수량'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    fireEvent.click(await screen.findByRole('button', { name: '네' }))
    await waitFor(() => expect(calls('delete', '/scan/items/old-id')).toHaveLength(1))
  })

  it('「아니요」는 0 을 저장하지 않는다', async () => {
    // 저장하면 고치려던 버그를 그대로 재현한다 — 수량 0 인 재료가 추천을 계속 오염시킨다.
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /두부 수량 변경/ }))
    fireEvent.change(screen.getByPlaceholderText('수량'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    fireEvent.click(await screen.findByRole('button', { name: '아니요' }))

    expect(vi.mocked(api.patch).mock.calls).toHaveLength(0)
    expect(calls('delete', '/scan/items')).toHaveLength(0)
  })

  it('0 이 아닌 수량은 그냥 저장된다', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /두부 수량 변경/ }))
    fireEvent.change(screen.getByPlaceholderText('수량'), { target: { value: '0.5모' } })
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    await waitFor(() => expect(vi.mocked(api.patch).mock.calls.length).toBeGreaterThan(0))
    expect(screen.queryByText('다 쓰셨나요?')).toBeNull()
  })
})
