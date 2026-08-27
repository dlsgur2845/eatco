import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import ApiKeyPanel from './ApiKeyPanel'
import { getFamilyKeys, type KeyState, type FamilyKey } from '../../api/familyKeys'

vi.mock('../../api/familyKeys', async () => {
  const actual = await vi.importActual<typeof import('../../api/familyKeys')>('../../api/familyKeys')
  return {
    ...actual,
    getFamilyKeys: vi.fn(),
    addFamilyKey: vi.fn(),
    deleteFamilyKey: vi.fn(),
    enableFamilyKey: vi.fn(),
    setKeyStrategy: vi.fn(),
  }
})

/**
 * 이 화면이 **기대치를 정확히 세우는지**가 핵심이다.
 * 키 등록은 비용·할당량 기능이지 지역차단 해결책이 아니다. 화면이 그걸
 * 뭉뚱그리면 키를 넣고도 스캔이 죽을 때 사용자가 배신감을 느낀다.
 */

function key(over: Partial<FamilyKey> & { id: string }): FamilyKey {
  return {
    provider: 'gemini', provider_label: 'Gemini', label: '우리집 Gemini',
    key_hint: '••••4f2a', added_by: 'u1', created_at: '2026-08-27T00:00:00Z',
    priority: null, calls: 0, last_used_at: null, cooldown_until: null,
    disabled: 0, last_error: null, ...over,
  }
}

function mount(state: KeyState | Error) {
  if (state instanceof Error) vi.mocked(getFamilyKeys).mockRejectedValue(state)
  else vi.mocked(getFamilyKeys).mockResolvedValue(state)
  render(<ApiKeyPanel />)
}

beforeEach(() => vi.clearAllMocks())

describe('AI 키 패널 — 네 상태', () => {
  it('로딩: 스켈레톤 + aria-busy', () => {
    vi.mocked(getFamilyKeys).mockReturnValue(new Promise(() => {}))
    const { container } = render(<ApiKeyPanel />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('오류: 「불러오지 못했어요」 — 「등록된 키가 없어요」가 아니다', async () => {
    mount(new Error('down'))
    expect(await screen.findByText('불러오지 못했어요.')).toBeTruthy()
    // 서버가 죽었는데 "키가 없다"고 하면 멀쩡한 키를 다시 등록하게 만든다.
    expect(screen.queryByText(/등록된 키가 없어요/)).toBeNull()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('비어 있음: 공용 키로 동작 중이라고 알려준다', async () => {
    mount({ keys: [], strategy: 'least_used' })
    expect(await screen.findByText(/등록된 키가 없어요/)).toBeTruthy()
    expect(screen.getByText(/앱 공용 키로 동작하고 있어요/)).toBeTruthy()
  })

  it('정상: 키와 사용량을 보여준다', async () => {
    mount({ keys: [key({ id: 'k1', calls: 62 })], strategy: 'least_used' })
    expect(await screen.findByText(/우리집 Gemini/)).toBeTruthy()
    expect(screen.getByText(/62회 사용/)).toBeTruthy()
  })
})

describe('AI 키 패널 — 기대치', () => {
  it('한 사람만 등록해도 온 가족이 쓴다고 말한다', async () => {
    mount({ keys: [], strategy: 'least_used' })
    expect(await screen.findByText(/한 사람만 등록해도 온 가족이 써요/)).toBeTruthy()
  })

  it('등록 안 해도 쓸 수 있다고 말한다 — 의무처럼 보이면 안 된다', async () => {
    mount({ keys: [], strategy: 'least_used' })
    expect(await screen.findByText(/등록하지 않아도 지금처럼 쓸 수 있어요/)).toBeTruthy()
  })
})

describe('AI 키 패널 — 키 상태', () => {
  it('꺼진 키는 이유와 함께 「다시 켜기」를 준다', async () => {
    mount({ keys: [key({ id: 'k1', disabled: 1, last_error: 'HTTP 401' })], strategy: 'least_used' })
    expect(await screen.findByText(/꺼짐 \(HTTP 401\)/)).toBeTruthy()
    expect(screen.getByText('다시 켜기')).toBeTruthy()
  })

  it('멀쩡한 키에는 「다시 켜기」가 없다', async () => {
    mount({ keys: [key({ id: 'k1' })], strategy: 'least_used' })
    await screen.findByText(/우리집 Gemini/)
    expect(screen.queryByText('다시 켜기')).toBeNull()
  })

  it('키가 하나면 전략 선택을 안 보여준다 — 고를 게 없다', async () => {
    mount({ keys: [key({ id: 'k1' })], strategy: 'least_used' })
    await screen.findByText(/우리집 Gemini/)
    expect(screen.queryByText('교대로')).toBeNull()
  })

  it('키가 둘이면 전략을 고를 수 있다', async () => {
    mount({ keys: [key({ id: 'k1' }), key({ id: 'k2', label: '두 번째 Gemini' })], strategy: 'least_used' })
    expect(await screen.findByText('교대로')).toBeTruthy()
    expect(screen.getByText('순서대로')).toBeTruthy()
  })
})

describe('AI 키 패널 — 등록 폼', () => {
  it('키가 짧으면 등록 버튼이 잠긴다', async () => {
    mount({ keys: [], strategy: 'least_used' })
    ;(await screen.findByText('키 등록하기')).click()
    const btn = await screen.findByText('등록')
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('키 입력란은 password 타입이다 — 어깨너머로 안 보이게', async () => {
    mount({ keys: [], strategy: 'least_used' })
    ;(await screen.findByText('키 등록하기')).click()
    const input = await screen.findByLabelText('API 키')
    expect((input as HTMLInputElement).type).toBe('password')
  })

  it('다시 볼 수 없다는 걸 등록 전에 말한다', async () => {
    mount({ keys: [], strategy: 'least_used' })
    ;(await screen.findByText('키 등록하기')).click()
    expect(await screen.findByText(/등록하면 다시 볼 수 없어요/)).toBeTruthy()
  })
})
