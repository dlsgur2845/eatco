import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import type { Family, User } from '../types'

/**
 * 초대 링크 착지 화면 — `/invite/:code`
 *
 * 로그인 안 했으면 가입 화면으로 코드를 들고 넘긴다.
 * 로그인했으면 **잃을 게 있는지 보고** 결정한다:
 *   - 혼자 + 재료 0개인 1인 가족 → 바로 합류 (새 구성원 대부분이 이 경우)
 *   - 구성원이나 재료가 있으면 → 무엇이 사라지는지 숫자로 보여주고 확인받는다
 *
 * 확인 화면이 필요한 이유: /auth/family/join 은 되돌릴 수 없다. 기존 가족에서
 * 나가고, 방장이었으면 넘기고, 혼자였고 재료가 0개면 그 가족을 아예 지운다.
 * 링크 한 번에 그게 조용히 일어나면 안 된다.
 */
export default function InvitePage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()

  const [state, setState] = useState<'loading' | 'confirm' | 'joining' | 'already' | 'error'>('loading')
  const [familyName, setFamilyName] = useState('')
  const [loss, setLoss] = useState<{ members: number; items: number }>({ members: 0, items: 0 })
  const [error, setError] = useState('')
  // StrictMode 는 effect 를 두 번 돌린다. 합류는 링크를 소비하므로 두 번 돌면
  // 두 번째가 "이미 사용된 링크" 로 실패한다. 한 번만 돌게 잠근다.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    ;(async () => {
      try {
        // 1) 어느 가족인지 먼저 본다. 이 호출은 링크를 소비하지 않는다.
        const preview = await api.get<{ family_name: string }>(`/auth/family/invite/${code}`)
        setFamilyName(preview.data.family_name)

        // 2) 로그인 상태 확인
        let me: User | null = null
        try {
          me = (await api.get<User>('/auth/me')).data
        } catch {
          me = null
        }
        if (!me) {
          navigate(`/signup?invite=${encodeURIComponent(code)}`, { replace: true })
          return
        }

        /* 3) 내 가족의 링크를 내가 연 경우. 가족 화면에서 링크를 복사해
              스스로 눌러보면 여기로 온다. 참여를 권하면 안 된다 — 서버는
              409 로 막지만 화면이 먼저 말해줘야 한다.
              미리보기는 가족 id 를 안 준다(인증 없는 엔드포인트라 일부러
              이름만 준다). 내 가족의 코드를 가져와 비교한다. */
        if (me.family_id) {
          const myFam = await api
            .get<Family>(`/auth/family/${me.family_id}`)
            .catch(() => null)
          if (myFam?.data.invite_code === code) {
            setFamilyName(myFam.data.name)
            setState('already')
            return
          }
        }

        // 4) 지금 가족에 잃을 게 있나
        let members = 0
        let items = 0
        if (me.family_id) {
          const [mem, ing] = await Promise.all([
            api.get<User[]>('/auth/family/members').catch(() => ({ data: [] as User[] })),
            api.get<unknown[]>('/ingredients').catch(() => ({ data: [] as unknown[] })),
          ])
          members = mem.data.length
          items = ing.data.length
        }
        setLoss({ members, items })

        // 혼자이고 재료도 없으면 잃을 게 없다. 바로 합류한다.
        if (members <= 1 && items === 0) {
          await join()
          return
        }
        setState('confirm')
      } catch (e: unknown) {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setError(detail || '초대 링크를 확인할 수 없어요.')
        setState('error')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function join() {
    setState('joining')
    try {
      const res = await api.post<Family>('/auth/family/join', { invite_code: code })
      setFamilyName(res.data.name)
      navigate('/family', { replace: true })
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || '가족에 참여하지 못했어요.')
      setState('error')
    }
  }

  const wrap = 'min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center'

  if (state === 'loading' || state === 'joining') {
    return (
      <div className={wrap} role="status">
        <div
          className="w-10 h-10 rounded-full animate-spin"
          style={{ border: '3px solid var(--color-outline-variant)', borderTopColor: 'var(--color-primary)' }}
        />
        <p className="mt-4 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {state === 'joining' ? '가족에 참여하는 중…' : '초대를 확인하는 중…'}
        </p>
      </div>
    )
  }

  if (state === 'already') {
    return (
      <div className={wrap}>
        <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--color-primary)' }}>
          check_circle
        </span>
        <h1 className="mt-4 text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          이미 «{familyName}» 구성원이에요
        </h1>
        <p className="mt-2 text-sm max-w-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          이 링크는 가족에게 보내주세요. 한 사람만 쓸 수 있어요.
        </p>
        <button
          type="button"
          onClick={() => navigate('/family', { replace: true })}
          className="mt-8 px-6 min-h-[48px] rounded-xl text-base font-semibold"
          style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
        >
          가족 화면으로
        </button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className={wrap}>
        <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--color-tertiary)' }}>
          link_off
        </span>
        <h1 className="mt-4 text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          링크를 쓸 수 없어요
        </h1>
        <p className="mt-2 text-sm max-w-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          {error}
        </p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="mt-8 px-6 min-h-[48px] rounded-xl text-base font-semibold"
          style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
        >
          홈으로
        </button>
      </div>
    )
  }

  // confirm — 잃을 게 있는 경우에만 온다
  return (
    <div className={wrap}>
      <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--color-primary)' }}>
        group_add
      </span>
      <h1 className="mt-4 text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
        «{familyName}»에 참여할까요?
      </h1>

      <div
        className="mt-5 w-full max-w-xs px-4 py-3 rounded-xl text-left"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-tertiary-container) 30%, white)' }}
      >
        <p className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
          지금 가족에서 나가게 돼요
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
          구성원 {loss.members}명 · 식재료 {loss.items}개가 있는 가족이에요.
          {loss.members <= 1 && loss.items > 0 && ' 나가면 이 재료는 더 이상 보이지 않아요.'}
        </p>
      </div>

      <div className="flex gap-3 mt-6 w-full max-w-xs">
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="flex-1 min-h-[48px] rounded-xl text-base font-medium"
          style={{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' }}
        >
          그대로 둘게요
        </button>
        <button
          type="button"
          onClick={join}
          className="flex-1 min-h-[48px] rounded-xl text-base font-semibold"
          style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
        >
          참여하기
        </button>
      </div>
    </div>
  )
}
