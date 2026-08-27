import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import ResetPanel from './ResetPanel'
import { getResetState, type ResetState } from '../../api/familyReset'

vi.mock('../../api/familyReset', async () => {
  const actual = await vi.importActual<typeof import('../../api/familyReset')>('../../api/familyReset')
  return {
    ...actual,
    getResetState: vi.fn(),
    requestReset: vi.fn(),
    consentReset: vi.fn(),
    withdrawConsent: vi.fn(),
    cancelReset: vi.fn(),
    restoreReset: vi.fn(),
  }
})

/**
 * DESIGN.md 5절: **「비어 있음」과 「오류」를 절대 같은 화면으로 처리하지 않는다.**
 *
 * 이 화면에서 그걸 어기면 특히 나쁘다 — 서버가 죽었을 때 "지울 데이터가 없어요"
 * 를 띄우면 가족에게 냉장고가 비었다고 거짓말하는 셈이고, 사용자는 초기화가
 * 이미 끝났다고 믿는다.
 */

const base: ResetState = {
  request: null,
  counts: { 재료: 6, 식단: 7, '우리 가족 요리': 1, '알림 기록': 3 },
  total: 17,
  members: 2,
}

beforeEach(() => vi.clearAllMocks())

function mount(state: ResetState | Error) {
  if (state instanceof Error) vi.mocked(getResetState).mockRejectedValue(state)
  else vi.mocked(getResetState).mockResolvedValue(state)
  render(<ResetPanel />)
}

describe('초기화 패널 — 네 상태', () => {
  it('로딩: 스켈레톤 + aria-busy', () => {
    vi.mocked(getResetState).mockReturnValue(new Promise(() => {}))
    const { container } = render(<ResetPanel />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('오류: 「불러오지 못했어요」 + 다시 시도 (비어 있음 문구가 아니다)', async () => {
    mount(new Error('down'))
    expect(await screen.findByText('불러오지 못했어요.')).toBeTruthy()
    expect(screen.getByText('다시 시도')).toBeTruthy()
    // 서버가 죽었는데 "지울 데이터가 없어요" 라고 하면 거짓말이다.
    expect(screen.queryByText(/지울 데이터가 없어요/)).toBeNull()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('요청 없음 + 데이터 있음: 개수와 동의 인원을 말하고 버튼을 연다', async () => {
    mount(base)
    expect(await screen.findByText(/17개를 지워요/)).toBeTruthy()
    expect(screen.getByText(/구성원 2명이 모두 동의/)).toBeTruthy()
    const btn = screen.getByRole('button', { name: '데이터 초기화' })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('요약 줄은 **실제로 개수가 있는** 분류만 부른다', async () => {
    // 하드코딩했을 때: 0개인 「우리 가족 요리」를 지운다고 말하고,
    // 정작 지우는 「알림 기록」은 빠졌었다.
    mount({ ...base, counts: { 재료: 6, 식단: 7, '우리 가족 요리': 0, '알림 기록': 9 }, total: 22 })
    const line = await screen.findByText(/개를 지워요/)
    expect(line.textContent).toContain('재료·식단·알림 기록')
    expect(line.textContent).not.toContain('우리 가족 요리')
  })

  it('요청 없음 + 데이터 0: 버튼이 잠긴다 (오류 화면이 아니다)', async () => {
    mount({ ...base, counts: {}, total: 0 })
    expect(await screen.findByText('지울 데이터가 없어요.')).toBeTruthy()
    expect((screen.getByRole('button', { name: '데이터 초기화' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText('불러오지 못했어요.')).toBeNull()
  })
})

describe('초기화 패널 — 동의 진행 중', () => {
  const pending = (over: Partial<NonNullable<ResetState['request']>> = {}): ResetState => ({
    ...base,
    request: {
      id: 'r1', status: 'pending', requested_by: 'u1', is_mine: true,
      i_agreed: true, agreed: 1, needed: 2,
      expires_at: new Date(Date.now() + 31 * 3600_000).toISOString(),
      executed_at: null, purge_after: null, ...over,
    },
  })

  it('몇 명 중 몇 명인지 말한다', async () => {
    mount(pending())
    // 문구가 <strong> 으로 쪼개져 있어 텍스트 노드 하나로는 안 잡힌다.
    await screen.findByText(/동의했어요/)
    const line = screen.getByText(/동의했어요/).textContent?.replace(/\s+/g, ' ')
    expect(line).toContain('2명 중')
    expect(line).toContain('1명')
  })

  it('아직 동의 안 했으면 「동의」', async () => {
    mount(pending({ i_agreed: false, agreed: 0, needed: 3 }))
    expect(await screen.findByText('동의')).toBeTruthy()
  })

  it('내가 마지막이면 「동의하고 초기화」 — 무슨 일이 벌어질지 정확히 말한다', async () => {
    // 3명 중 2명 동의. 내가 누르면 그 자리에서 지워진다.
    mount(pending({ i_agreed: false, agreed: 2, needed: 3 }))
    expect(await screen.findByText('동의하고 초기화')).toBeTruthy()
    expect(screen.queryByText('동의')).toBeNull()
  })

  it('이미 동의했으면 철회할 수 있다', async () => {
    mount(pending({ i_agreed: true }))
    expect(await screen.findByText('동의 철회')).toBeTruthy()
  })

  it('요청 취소가 항상 있다', async () => {
    mount(pending())
    expect(await screen.findByText('요청 취소')).toBeTruthy()
  })
})

describe('초기화 패널 — 실행 후 복구 창', () => {
  it('되돌리기와 남은 기간을 보여준다', async () => {
    mount({
      ...base,
      counts: {}, total: 0,
      request: {
        id: 'r1', status: 'done', requested_by: 'u1', is_mine: true,
        i_agreed: true, agreed: 2, needed: 2,
        expires_at: '2026-08-29T00:00:00Z',
        executed_at: '2026-08-27T00:00:00Z',
        purge_after: new Date(Date.now() + 6 * 86400_000).toISOString(),
      },
    })
    expect(await screen.findByText('되돌리기')).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/안에는 되돌릴 수 있어요/)).toBeTruthy())
    // 복구 창이 열려 있는 동안에는 새 초기화 버튼을 내밀지 않는다.
    expect(screen.queryByRole('button', { name: '데이터 초기화' })).toBeNull()
  })
})
