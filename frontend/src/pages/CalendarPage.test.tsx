import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarPage from './CalendarPage'
import { kstToday, shift, weekStart } from '../components/calendar/dates'

vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import api from '../api/client'
vi.mock('../api/recipes', () => ({ searchRecipes: vi.fn() }))
import { searchRecipes, type RecipeSearchResult } from '../api/recipes'

/**
 * jsdom 은 레이아웃을 계산하지 않는다 — getBoundingClientRect 는 전부 0,
 * offsetTop 은 0, offsetParent 는 null. 그래서 **스크롤 위치**를 단언하는
 * 테스트는 전부 연극이다: 뭘 넣어도 {top: 0} 이 나와서 통과한다.
 *
 * 여기서는 위치가 아니라 **횟수와 시점**만 본다. 그건 jsdom 에서도 진짜다.
 * 실제 위치(오늘 카드가 바 아래에 오는가, 폭이 맞는가)는 실기기 뷰포트에서
 * Playwright 로 확인했다.
 */

const today = kstToday()

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/calendar']}>
      <CalendarPage />
    </MemoryRouter>,
  )
}

let scrollTo: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue({ data: [] } as never)
  scrollTo = vi.fn()
  Object.defineProperty(window, 'scrollTo', { value: scrollTo, writable: true })
  // rAF 를 타이머로 바꾼다. **동기로 돌리면 안 된다** — load() 는 두 프레임을
  // 기다려서 React 가 날짜 카드를 커밋한 뒤에 위치를 잰다. 동기로 돌리면
  // 커밋 전에 실행돼서 todayRef 가 아직 null 이고 조용히 아무것도 안 한다.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0) as unknown as number,
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CalendarPage — 스크롤 계약', () => {
  it('이번 주면 최초 로드에서 오늘로 한 번 내려준다', async () => {
    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1))
  })

  it('지난 주로 가면 그 주에서는 오늘로 내려주지 않는다', async () => {
    renderPage()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1))

    // ◀ 를 누르면 기간 이동 스크롤 1회. 그 뒤 load() 가 끝나도
    // 지난 주에는 오늘이 없으므로 추가 스크롤이 없어야 한다.
    screen.getByLabelText('지난 주').click()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(2))
    await new Promise((r) => setTimeout(r, 30))
    expect(scrollTo).toHaveBeenCalledTimes(2)
  })

  it('기간 이동은 매번 스크롤을 맞춘다', async () => {
    renderPage()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1))
    screen.getByLabelText('다음 주').click()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(2))
  })
})

describe('CalendarPage — 요청 순서 보호', () => {
  it('늦게 도착한 옛 응답은 버린다', async () => {
    // ◀ 연타 시 응답이 뒤바뀌면 라벨과 목록이 다른 기간을 가리킨다.
    let resolveFirst: (v: unknown) => void = () => {}
    const first = new Promise((r) => {
      resolveFirst = r
    })
    vi.mocked(api.get)
      .mockReturnValueOnce(first as never)
      .mockResolvedValue({ data: [{ id: 'new', plan_date: today, meal_slot: 'dinner', title: '나중응답', comment_count: 0 }] } as never)

    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1))
    screen.getByLabelText('다음 주').click()
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))

    // 이제 첫 요청이 뒤늦게 응답한다. 화면에 반영되면 안 된다.
    resolveFirst({ data: [{ id: 'old', plan_date: today, meal_slot: 'dinner', title: '옛응답', comment_count: 0 }] })
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByText('옛응답')).toBeNull()
  })
})

describe('CalendarPage — "오늘로" (B1)', () => {
  it('이번 주에서 눌러도 맨 위가 아니라 오늘 카드로 간다', async () => {
    // jsdom 은 레이아웃이 없어서 offsetTop 이 0 이다. 그대로 두면 고친 코드와
    // 고치기 전 코드가 **둘 다 {top: 0}** 을 내서 테스트가 버그를 못 잡는다.
    // 오늘 카드에만 오프셋을 심어 두 경로를 구분한다.
    const spy = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.tagName === 'SECTION' ? 1234 : 0
    })
    try {
      renderPage()
      await waitFor(() => expect(scrollTo).toHaveBeenCalled())
      scrollTo.mockClear()
      vi.mocked(api.get).mockClear()

      screen.getByLabelText(/오늘로 이동/).click()
      await waitFor(() => expect(scrollTo).toHaveBeenCalled())

      const top = scrollTo.mock.calls.at(-1)?.[0]?.top
      // 예전 버그: jump() 가 돌면서 scrollTo({top: 0}) — 오늘로부터 반대 방향
      expect(top).toBeGreaterThan(0)
      // 같은 주라 anchor 가 안 바뀌므로 재조회도 없어야 한다
      expect(api.get).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('CalendarPage — 월 보기', () => {
  const openMonth = async () => {
    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    screen.getByRole('tab', { name: '월별' }).click()
    await waitFor(() => expect(screen.getByRole('tab', { name: '월별' }).getAttribute('aria-selected')).toBe('true'))
  }

  it('기간을 넘기면 펼쳐둔 날짜 패널이 남지 않는다', async () => {
    // 예전엔 jump() 가 expanded 를 안 지워서, 9월 격자 아래에 "8월 21일" 패널이
    // 그대로 남았다. 그 패널의 "추가" 는 화면에 없는 날짜로 식단을 등록한다.
    await openMonth()
    const cells = screen.getAllByRole('button', { expanded: false })
    cells[cells.length - 1].click()
    await waitFor(() => expect(screen.queryByText(/^\d+월 \d+일$/)).toBeTruthy())

    screen.getByLabelText('다음 달').click()
    await waitFor(() => expect(screen.queryByText(/^\d+월 \d+일$/)).toBeNull())
    // 안내 문구가 다시 보이면 아무것도 안 펼쳐진 상태다
    expect(screen.getByText(/날짜를 누르면/)).toBeTruthy()
  })
})

describe('CalendarPage — 보기 전환 왕복', () => {
  it('주별 → 월별 → 주별 이 과거로 보내지 않는다', async () => {
    // 예전엔 월→주에서 weekStart(그 달 1일) 을 써서, 8/21 에서 왕복하면
    // 7/27 로 3주 전에 가 있었다.
    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    const label = () => screen.getByLabelText(/오늘로 이동/).textContent ?? ''
    const before = label()

    screen.getByRole('tab', { name: '월별' }).click()
    await new Promise((r) => setTimeout(r, 10))
    screen.getByRole('tab', { name: '주별' }).click()
    await new Promise((r) => setTimeout(r, 10))

    expect(label()).toBe(before)
  })
})

describe('CalendarPage — 컨트롤 바 스크롤-오프', () => {
  const bar = () => document.querySelector('.cal-subbar')
  const scrollBy = async (total: number, step: number) => {
    const sign = Math.sign(total)
    for (let moved = 0; moved < Math.abs(total); moved += step) {
      const next = Math.max(0, window.scrollY + sign * step)
      Object.defineProperty(window, 'scrollY', { value: next, writable: true, configurable: true })
      window.dispatchEvent(new Event('scroll'))
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
  })

  it('읽는 속도(프레임당 6px)로 내려가도 바가 물러난다', async () => {
    // **여기가 원래 깨져 있었다.** 프레임당 델타를 임계값과 직접 비교하고
    // 기준점을 매 프레임 갱신해서, 한 프레임에 12px 넘게 안 움직이면 영영
    // 안 숨었다. 프레임당 6px 은 60Hz 에서 초당 360px — 흔한 읽기 속도다.
    renderPage()
    await waitFor(() => expect(bar()).toBeTruthy())
    expect(bar()?.getAttribute('data-hidden')).toBe('false')

    await scrollBy(300, 6)
    await waitFor(() => expect(bar()?.getAttribute('data-hidden')).toBe('true'))
  })

  it('위로 조금만 올려도 돌아온다', async () => {
    renderPage()
    await waitFor(() => expect(bar()).toBeTruthy())
    await scrollBy(400, 20)
    await waitFor(() => expect(bar()?.getAttribute('data-hidden')).toBe('true'))

    // 40px 만 올린다 — "위로 살짝 올리면 돌아온다" 가 사실이어야 한다
    await scrollBy(-40, 5)
    await waitFor(() => expect(bar()?.getAttribute('data-hidden')).toBe('false'))
  })

  it('작은 흔들림으로는 바뀌지 않는다', async () => {
    renderPage()
    await waitFor(() => expect(bar()).toBeTruthy())
    await scrollBy(400, 20)
    await waitFor(() => expect(bar()?.getAttribute('data-hidden')).toBe('true'))

    // iOS 관성 스크롤의 방향 떨림 흉내 — 임계값을 못 넘어야 한다
    for (let i = 0; i < 6; i++) {
      await scrollBy(-3, 3)
      await scrollBy(3, 3)
    }
    expect(bar()?.getAttribute('data-hidden')).toBe('true')
  })

  it('맨 위 근처에서는 무조건 보인다', async () => {
    renderPage()
    await waitFor(() => expect(bar()).toBeTruthy())
    await scrollBy(400, 20)
    await waitFor(() => expect(bar()?.getAttribute('data-hidden')).toBe('true'))
    await scrollBy(-400, 20)
    await waitFor(() => expect(bar()?.getAttribute('data-hidden')).toBe('false'))
  })
})

describe('CalendarPage — 라벨', () => {
  it('빈 상태 문구가 보고 있는 기간을 말한다 ("이번 주" 로 못박지 않는다)', async () => {
    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    // 3주 전으로 간다
    for (let i = 0; i < 3; i++) {
      screen.getByLabelText('지난 주').click()
      await new Promise((r) => setTimeout(r, 5))
    }
    await waitFor(() => {
      const past = weekStart(shift(today, -21))
      const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8))}`
      // 빈 상태 문단만 본다 — 날짜 문자열은 카드에도 나온다.
      const empty = screen.getByText(/식단이 비어 있어요/)
      expect(empty.textContent).toContain(md(past))
      expect(empty.textContent).not.toContain('이번 주')
    })
  })
})


/* ──────────────────────────────────────────────
   식단 추가 — 레시피 검색

   입력창 하나가 두 가지를 다 한다: 타이핑하면 후보가 뜨고, 고르면 붙고,
   무시하고 올리면 직접 입력이다. 직접 입력에 탭을 하나 더 물리지 않는 게
   이 설계의 핵심이라, "고르지 않아도 올라간다" 를 반드시 지킨다.
   ────────────────────────────────────────────── */

const RECIPE = {
  id: '3000',
  name: '김치양배추볶음',
  source: 'foodsafety' as const,
  category: '반찬',
  cooking_method: '볶음',
  calories: '120',
  image_url: '',
  ingredients: ['배추김치', '양배추', '대파'],
  manual_steps: ['볶는다'],
  tip: '',
  match_count: 1,
  total_ingredients: 3,
  match_ratio: 1 / 3,
  matched_items: ['배추김치'],
  missing_items: ['양배추', '대파'],
  urgent_used: [],
}

async function openAddModal() {
  renderPage()
  await waitFor(() => expect(api.get).toHaveBeenCalled())
  const add = screen.getAllByRole('button', { name: /식단 추가$/ })[0]
  fireEvent.click(add)
  return await screen.findByLabelText('메뉴')
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } })
}

describe('식단 추가 — 레시피 검색', () => {
  it('타이핑하면 후보가 뜨고, 고르면 부족한 재료를 보여준다', async () => {
    vi.mocked(searchRecipes).mockResolvedValue({ items: [RECIPE], total: 1, has_more: false, catalog_ok: true })
    const input = await openAddModal()
    type(input, '김치')

    const hit = await screen.findByRole('button', { name: /김치양배추볶음/ })
    expect(screen.getByText(/식품안전나라/)).toBeTruthy()
    fireEvent.click(hit)

    expect(await screen.findByText('부족한 재료 2개')).toBeTruthy()
    expect(screen.getByText('양배추 · 대파')).toBeTruthy()
    // 고르면 제목이 채워진다
    expect((screen.getByLabelText('메뉴') as HTMLInputElement).value).toBe('김치양배추볶음')
  })

  it('고르면 레시피 정보를 셋 다 함께 보낸다', async () => {
    vi.mocked(searchRecipes).mockResolvedValue({ items: [RECIPE], total: 1, has_more: false, catalog_ok: true })
    vi.mocked(api.post).mockResolvedValue({ data: {} } as never)
    const input = await openAddModal()
    type(input, '김치')
      fireEvent.click(await screen.findByRole('button', { name: /김치양배추볶음/ }))
    await screen.findByText('부족한 재료 2개')
    fireEvent.click(screen.getByRole('button', { name: '올리기' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const body = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>
    expect(body.recipe_source).toBe('foodsafety')
    expect(body.recipe_id).toBe('3000')
    expect(body.recipe_ingredients).toEqual(['배추김치', '양배추', '대파'])
  })

  it('후보를 무시하고 그대로 올리면 직접 입력이다 (레시피 필드가 안 나간다)', async () => {
    vi.mocked(searchRecipes).mockResolvedValue({ items: [RECIPE], total: 1, has_more: false, catalog_ok: true })
    vi.mocked(api.post).mockResolvedValue({ data: {} } as never)
    const input = await openAddModal()
    type(input, '라면')
    fireEvent.click(screen.getByRole('button', { name: '올리기' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const body = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>
    expect(body.title).toBe('라면')
    expect('recipe_source' in body).toBe(false)
  })

  it('연결을 떼면 부족 재료가 사라지고 제목은 남는다', async () => {
    vi.mocked(searchRecipes).mockResolvedValue({ items: [RECIPE], total: 1, has_more: false, catalog_ok: true })
    const input = await openAddModal()
    type(input, '김치')
      fireEvent.click(await screen.findByRole('button', { name: /김치양배추볶음/ }))
    await screen.findByText('부족한 재료 2개')

    fireEvent.click(screen.getByRole('button', { name: '연결 해제' }))
    await waitFor(() => expect(screen.queryByText('부족한 재료 2개')).toBeNull())
    expect((screen.getByLabelText('메뉴') as HTMLInputElement).value).toBe('김치양배추볶음')
  })

  /* 검색 실패와 0건을 같은 화면으로 처리하면 사용자는 "그런 레시피가 없구나" 로
     결론짓는다. 그건 거짓 정보다 (DESIGN.md §5). */
  it('검색이 실패하면 0건 문구가 아니라 오류를 보여준다', async () => {
    vi.mocked(searchRecipes).mockRejectedValue(new Error('네트워크'))
    const input = await openAddModal()
    type(input, '김치')

    expect(await screen.findByText(/검색하지 못했어요/)).toBeTruthy()
    expect(screen.queryByText(/찾은 레시피가 없어요/)).toBeNull()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy()
  })

  it('0건이면 직접 입력으로 갈 길을 알려준다', async () => {
    vi.mocked(searchRecipes).mockResolvedValue({ items: [], total: 0, has_more: false, catalog_ok: true })
    const input = await openAddModal()
    type(input, 'zzzz')
    expect(await screen.findByText(/그대로 적어서 올릴 수 있어요/)).toBeTruthy()
  })

  it('카탈로그를 일부만 읽었으면 그렇다고 말한다', async () => {
    vi.mocked(searchRecipes).mockResolvedValue({ items: [RECIPE], total: 1, has_more: false, catalog_ok: false })
    const input = await openAddModal()
    type(input, '김치')
    expect(await screen.findByText(/일부만 불러왔어요/)).toBeTruthy()
  })

  /* 빠르게 타이핑하면 늦게 뜬 옛 응답이 나중에 도착해서 새 결과를 덮을 수 있다. */
  it('늦게 도착한 옛 검색 응답은 버린다', async () => {
    let resolveOld: (v: RecipeSearchResult) => void = () => {}
    const old = new Promise<RecipeSearchResult>((r) => {
      resolveOld = r
    })
    vi.mocked(searchRecipes)
      .mockReturnValueOnce(old)
      .mockResolvedValue({ items: [{ ...RECIPE, id: '1', name: '나중결과' }], total: 1, has_more: false, catalog_ok: true })

    const input = await openAddModal()
    type(input, '김')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    type(input, '김치')
    await screen.findByRole('button', { name: /나중결과/ })

    await act(async () => {
      resolveOld({ items: [{ ...RECIPE, id: '9', name: '옛결과' }], total: 1, has_more: false, catalog_ok: true })
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(screen.queryByText('옛결과')).toBeNull()
    expect(screen.getByText('나중결과')).toBeTruthy()
  })
})

describe('주간 카드 — 부족 재료 배지', () => {
  const plan = (extra: Record<string, unknown>) => ({
    id: 'p1', plan_date: today, meal_slot: 'dinner', title: '김치찌개', comment_count: 0, ...extra,
  })

  it('부족한 재료가 있으면 개수를 띄운다', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [plan({ missing_count: 2 })] } as never)
    renderPage()
    expect(await screen.findByText('2개 부족')).toBeTruthy()
  })

  it('레시피가 없으면 배지가 없다', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [plan({})] } as never)
    renderPage()
    await screen.findByText('김치찌개')
    expect(screen.queryByText(/개 부족/)).toBeNull()
  })

  it('부족한 게 0 이면 배지가 없다 — 할 일이 없다는 뜻이다', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [plan({ missing_count: 0 })] } as never)
    renderPage()
    await screen.findByText('김치찌개')
    expect(screen.queryByText(/개 부족/)).toBeNull()
  })
})


/* ──────────────────────────────────────────────
   검색 페이지네이션

   왜 필요한가: 1,156개 카탈로그에서 흔한 질의가 실측 46~96건이다
   («김치» 46, «닭» 62, «국» 78, «두부» 88, «밥» 96). 한 페이지만 보여주면
   원하는 걸 못 찾는다.
   ────────────────────────────────────────────── */

const mk = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ ...RECIPE, id: String(from + i), name: `요리${from + i}` }))

describe('식단 추가 — 검색 페이지네이션', () => {
  it('전체 개수와 지금 보는 개수를 말해준다', async () => {
    vi.mocked(searchRecipes).mockResolvedValue({ items: mk(10), total: 46, has_more: true, catalog_ok: true })
    const input = await openAddModal()
    type(input, '김치')
    expect(await screen.findByText('레시피 46건 중 10건')).toBeTruthy()
  })

  it('«더 보기» 가 남은 개수를 말한다', async () => {
    vi.mocked(searchRecipes).mockResolvedValue({ items: mk(10), total: 46, has_more: true, catalog_ok: true })
    const input = await openAddModal()
    type(input, '김치')
    expect(await screen.findByRole('button', { name: '더 보기 (36건 남음)' })).toBeTruthy()
  })

  it('더 보기를 누르면 다음 페이지가 **덧붙는다** (갈아끼우지 않는다)', async () => {
    vi.mocked(searchRecipes)
      .mockResolvedValueOnce({ items: mk(10), total: 46, has_more: true, catalog_ok: true })
      .mockResolvedValueOnce({ items: mk(10, 10), total: 46, has_more: true, catalog_ok: true })
    const input = await openAddModal()
    type(input, '김치')
    await screen.findByText('요리0')

    fireEvent.click(await screen.findByRole('button', { name: /더 보기/ }))
    await screen.findByText('요리10')
    // 1페이지가 살아 있어야 한다
    expect(screen.getByText('요리0')).toBeTruthy()
    expect(await screen.findByText('레시피 46건 중 20건')).toBeTruthy()
  })

  /* 서버가 센 개수로 offset 을 잡아야 한다. 화면에 남은 개수를 쓰면
     id 없는 결과를 걸러낸 만큼 어긋나서 같은 페이지를 또 받는다. */
  it('offset 은 서버가 준 개수로 센다 (걸러낸 개수가 아니라)', async () => {
    vi.mocked(searchRecipes)
      .mockResolvedValueOnce({
        // 10건 중 2건은 id 가 없어서 화면에서 걸러진다
        items: [...mk(8), { ...RECIPE, id: undefined as unknown as string, name: 'x' }, { ...RECIPE, id: '', name: 'y' }],
        total: 46, has_more: true, catalog_ok: true,
      })
      .mockResolvedValueOnce({ items: mk(10, 10), total: 46, has_more: true, catalog_ok: true })
    const input = await openAddModal()
    type(input, '김치')
    await screen.findByText('요리0')

    fireEvent.click(await screen.findByRole('button', { name: /더 보기/ }))
    await waitFor(() => expect(vi.mocked(searchRecipes).mock.calls.length).toBe(2))
    // 화면엔 8건뿐이지만 서버는 10건을 줬으므로 offset 은 10 이어야 한다
    expect(vi.mocked(searchRecipes).mock.calls[1]).toEqual(['김치', 10])
  })

  it('같은 것이 두 번 와도 한 번만 보인다', async () => {
    vi.mocked(searchRecipes)
      .mockResolvedValueOnce({ items: mk(3), total: 6, has_more: true, catalog_ok: true })
      // 2페이지가 밀려서 1페이지 마지막(요리2)이 다시 왔다
      .mockResolvedValueOnce({ items: mk(3, 2), total: 6, has_more: false, catalog_ok: true })
    const input = await openAddModal()
    type(input, '김치')
    await screen.findByText('요리0')
    fireEvent.click(await screen.findByRole('button', { name: /더 보기/ }))
    await screen.findByText('요리4')
    expect(screen.getAllByText('요리2')).toHaveLength(1)
  })

  it('마지막 페이지면 «더 보기» 가 사라진다', async () => {
    vi.mocked(searchRecipes).mockResolvedValue({ items: mk(3), total: 3, has_more: false, catalog_ok: true })
    const input = await openAddModal()
    type(input, '김치')
    await screen.findByText('요리0')
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull()
  })

  it('질의를 바꾸면 처음부터 다시 센다', async () => {
    vi.mocked(searchRecipes)
      .mockResolvedValueOnce({ items: mk(10), total: 46, has_more: true, catalog_ok: true })
      .mockResolvedValueOnce({ items: mk(2, 100), total: 2, has_more: false, catalog_ok: true })
    const input = await openAddModal()
    type(input, '김치')
    await screen.findByText('레시피 46건 중 10건')

    type(input, '스파게티')
    await screen.findByText('레시피 2건 중 2건')
    expect(screen.queryByText('요리0')).toBeNull()
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull()
  })

  it('더 보기가 실패해도 이미 받은 결과는 남는다', async () => {
    vi.mocked(searchRecipes)
      .mockResolvedValueOnce({ items: mk(10), total: 46, has_more: true, catalog_ok: true })
      .mockRejectedValueOnce(new Error('네트워크'))
    const input = await openAddModal()
    type(input, '김치')
    await screen.findByText('요리0')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /더 보기/ }))
    })
    expect(await screen.findByText('더 불러오지 못했어요.')).toBeTruthy()
    expect(screen.getByText('요리0')).toBeTruthy()
  })
})
