import { useCallback, useEffect, useState } from 'react'
import Reveal from '../components/motion/Reveal'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useModal } from '../hooks/useModal'
import type { AdminFamily, AdminStats, AdminUser, User } from '../types'

/* ──────────────────────────────────────────────
   확인 모달

   삭제는 되돌릴 수 없다. native confirm() 은 스탠드얼론 PWA 에서 OS 시트로
   떠서 앱과 이질적이고, 무엇보다 Android 뒤로가기 처리가 useModal 과 다르다.
   여기서는 무엇이 사라지는지 숫자로 보여주고 누르게 한다.
   ────────────────────────────────────────────── */
function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: React.ReactNode
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const panelRef = useModal(open, onCancel)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md bg-surface-container-lowest rounded-[2rem] p-7 outline-none"
      >
        <div className="w-12 h-12 rounded-2xl bg-error-container flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-error">warning</span>
        </div>
        <h3 id="confirm-title" className="font-headline font-bold text-xl text-on-surface mb-2">
          {title}
        </h3>
        <div className="text-sm text-on-surface-variant leading-relaxed mb-7">{body}</div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 min-h-[48px] inline-flex items-center justify-center rounded-full bg-surface-container-high text-on-surface font-bold active:scale-95 transition-transform disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 min-h-[48px] inline-flex items-center justify-center rounded-full bg-error text-on-error font-bold active:scale-95 transition-transform disabled:opacity-40"
          >
            {busy ? '처리 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   요약 카드
   ────────────────────────────────────────────── */
function StatTile({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5">
      <span className="material-symbols-outlined text-on-surface-variant text-xl mb-2 block">
        {icon}
      </span>
      <p className="font-headline font-bold text-3xl text-on-surface leading-none">
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-on-surface-variant mt-2">{label}</p>
    </div>
  )
}

function formatDate(iso: string): string {
  // D1 은 'YYYY-MM-DD HH:MM:SS' 또는 ISO 로 준다. 앞 10자만 쓰면 둘 다 맞는다.
  return (iso || '').slice(0, 10)
}

/* ──────────────────────────────────────────────
   사용자 목록
   ────────────────────────────────────────────── */
function UserRow({
  u,
  me,
  onRole,
  onDelete,
}: {
  u: AdminUser
  me: User
  onRole: (u: AdminUser, role: 'admin' | 'member') => void
  onDelete: (u: AdminUser) => void
}) {
  const isMe = u.id === me.id
  const isAdmin = u.role === 'admin'

  return (
    <li className="bg-surface-container-lowest rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-headline font-bold text-on-surface truncate">
            {u.nickname}
            {isMe && <span className="text-on-surface-variant font-normal"> (나)</span>}
          </p>
          <p className="text-xs text-on-surface-variant truncate mt-0.5">{u.email}</p>
          <p className="text-xs text-on-surface-variant mt-2">
            {u.family_name ?? '가족 없음'}
            {u.is_family_master ? ' · 마스터' : ''} · 재료 {u.ingredient_count}개 ·{' '}
            {formatDate(u.created_at)} 가입
          </p>
        </div>
        {isAdmin && (
          <span className="shrink-0 text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            관리자
          </span>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() => onRole(u, isAdmin ? 'member' : 'admin')}
          disabled={isMe && isAdmin}
          className="flex-1 min-h-[48px] inline-flex items-center justify-center rounded-xl bg-surface-container-high text-on-surface text-sm font-bold active:scale-95 transition-transform disabled:opacity-40"
        >
          {isAdmin ? '관리자 해제' : '관리자로'}
        </button>
        <button
          type="button"
          onClick={() => onDelete(u)}
          disabled={isMe}
          aria-label={`${u.nickname} 계정 삭제`}
          className="min-h-[48px] inline-flex items-center justify-center px-5 rounded-xl bg-surface-container-high text-error text-sm font-bold active:scale-95 transition-transform disabled:opacity-40"
        >
          삭제
        </button>
      </div>
    </li>
  )
}

/* ──────────────────────────────────────────────
   가족 목록
   ────────────────────────────────────────────── */
function FamilyRow({
  f,
  me,
  onDelete,
}: {
  f: AdminFamily
  me: User
  onDelete: (f: AdminFamily) => void
}) {
  const isMine = f.id === me.family_id

  return (
    <li className="bg-surface-container-lowest rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-headline font-bold text-on-surface truncate">
            {f.name}
            {isMine && <span className="text-on-surface-variant font-normal"> (내 가족)</span>}
          </p>
          <p className="text-xs text-on-surface-variant mt-2">
            마스터 {f.master_nickname ?? '없음'} · 구성원 {f.member_count}명 · 재료{' '}
            {f.ingredient_count}개 · {formatDate(f.created_at)} 생성
          </p>
        </div>
        <span className="shrink-0 text-xs font-mono text-on-surface-variant bg-surface-container-high px-2.5 py-1 rounded-full">
          {f.invite_code}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onDelete(f)}
        disabled={isMine}
        className="w-full min-h-[48px] flex items-center justify-center mt-4 rounded-xl bg-surface-container-high text-error text-sm font-bold active:scale-95 transition-transform disabled:opacity-40"
      >
        {isMine ? '내 가족은 삭제할 수 없어요' : '가족 삭제'}
      </button>
    </li>
  )
}

/* ──────────────────────────────────────────────
   메인
   ────────────────────────────────────────────── */
type Pending =
  | { kind: 'delete-user'; user: AdminUser }
  | { kind: 'delete-family'; family: AdminFamily }
  | null

export default function AdminPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'users' | 'families'>('users')
  const [me, setMe] = useState<User | null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [families, setFamilies] = useState<AdminFamily[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'denied'>('loading')
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const meRes = await api.get<User>('/auth/me')
      setMe(meRes.data)
      if (meRes.data.role !== 'admin') {
        setState('denied')
        return
      }
      const [s, u, f] = await Promise.all([
        api.get<AdminStats>('/admin/stats'),
        api.get<AdminUser[]>('/admin/users'),
        api.get<AdminFamily[]>('/admin/families'),
      ])
      setStats(s.data)
      setUsers(u.data)
      setFamilies(f.data)
      setState('ready')
    } catch (err: any) {
      if (err?.response?.status === 401) {
        navigate('/login')
        return
      }
      if (err?.response?.status === 403) {
        setState('denied')
        return
      }
      setState('error')
    }
  }, [navigate])

  useEffect(() => {
    load()
  }, [load])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const changeRole = async (u: AdminUser, role: 'admin' | 'member') => {
    try {
      await api.patch(`/admin/users/${u.id}/role`, { role })
      flash(`${u.nickname}님을 ${role === 'admin' ? '관리자로 지정' : '관리자에서 해제'}했어요.`)
      load()
    } catch (err: any) {
      flash(err?.response?.data?.detail ?? '역할을 바꾸지 못했어요.')
    }
  }

  const runPending = async () => {
    if (!pending) return
    setBusy(true)
    try {
      if (pending.kind === 'delete-user') {
        await api.delete(`/admin/users/${pending.user.id}`)
        flash(`${pending.user.nickname}님을 삭제했어요.`)
      } else {
        await api.delete(`/admin/families/${pending.family.id}`)
        flash(`${pending.family.name}을(를) 삭제했어요.`)
      }
      setPending(null)
      load()
    } catch (err: any) {
      flash(err?.response?.data?.detail ?? '삭제하지 못했어요.')
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  /* ── 상태별 화면 ── */

  if (state === 'loading') {
    return (
      <div aria-busy="true" className="space-y-4">
        <div className="h-10 w-40 rounded-xl bg-surface-container-high animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-surface-container-high animate-pulse" />
          ))}
        </div>
        <div className="space-y-3 pt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-surface-container-high animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="text-center py-20">
        <span className="material-symbols-outlined text-on-surface-variant text-5xl mb-4 block">
          lock
        </span>
        <p className="text-on-surface font-headline font-bold text-lg mb-1">
          관리자만 볼 수 있어요
        </p>
        <p className="text-sm text-on-surface-variant mb-6">
          이 화면은 관리자 계정에서만 열립니다.
        </p>
        <button
          onClick={() => navigate('/')}
          className="min-h-[48px] inline-flex items-center justify-center px-6 rounded-full bg-on-surface text-surface font-bold active:scale-95 transition-transform"
        >
          홈으로
        </button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="text-center py-20" role="status">
        <span className="material-symbols-outlined text-tertiary text-5xl mb-4 block">error</span>
        <p className="text-on-surface-variant mb-6">관리 정보를 불러오지 못했어요.</p>
        <button
          onClick={load}
          className="min-h-[48px] inline-flex items-center justify-center px-6 rounded-full bg-on-surface text-surface font-bold active:scale-95 transition-transform"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <h2 className="font-headline font-bold text-4xl text-on-surface tracking-tight mb-2">
          관리자
        </h2>
        <p className="text-on-surface-variant">
          전체 사용자와 가족 그룹을 관리합니다. 삭제는 되돌릴 수 없어요.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          <StatTile label="사용자" value={stats.users} icon="person" />
          <StatTile label="관리자" value={stats.admins} icon="shield_person" />
          <StatTile label="가족 그룹" value={stats.families} icon="group" />
          <StatTile label="등록 재료" value={stats.ingredients} icon="kitchen" />
          <StatTile label="소비 기록" value={stats.usage_events} icon="receipt_long" />
        </div>
      )}

      {/* 탭 */}
      <div
        role="tablist"
        aria-label="관리 대상"
        className="flex gap-2 mb-5 bg-surface-container-high p-1.5 rounded-2xl"
      >
        {(
          [
            ['users', `사용자 ${users.length}`],
            ['families', `가족 ${families.length}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex-1 min-h-[48px] inline-flex items-center justify-center rounded-xl font-bold text-sm transition-colors ${
              tab === key
                ? 'bg-surface-container-lowest text-on-surface'
                : 'text-on-surface-variant'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {toast && (
        <p
          role="status"
          className="mb-4 text-sm text-on-surface bg-surface-container-high rounded-xl px-4 py-3"
        >
          {toast}
        </p>
      )}

      {tab === 'users' &&
        (users.length === 0 ? (
          <p className="text-center text-on-surface-variant py-16 text-sm">
            아직 가입한 사용자가 없어요.
          </p>
        ) : (
          <ul className="space-y-3">
            {me &&
              users.map((u, i) => (
                <Reveal key={u.id} index={i}>
                <UserRow
                  u={u}
                  me={me}
                  onRole={changeRole}
                  onDelete={(user) => setPending({ kind: 'delete-user', user })}
                />
                </Reveal>
              ))}
          </ul>
        ))}

      {tab === 'families' &&
        (families.length === 0 ? (
          <p className="text-center text-on-surface-variant py-16 text-sm">
            아직 만들어진 가족 그룹이 없어요.
          </p>
        ) : (
          <ul className="space-y-3">
            {me &&
              families.map((f, i) => (
                <Reveal key={f.id} index={i}>
                <FamilyRow
                  f={f}
                  me={me}
                  onDelete={(family) => setPending({ kind: 'delete-family', family })}
                />
                </Reveal>
              ))}
          </ul>
        ))}

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        title={pending?.kind === 'delete-user' ? '계정을 삭제할까요?' : '가족 그룹을 삭제할까요?'}
        confirmLabel="삭제"
        onCancel={() => setPending(null)}
        onConfirm={runPending}
        body={
          pending?.kind === 'delete-user' ? (
            <>
              <span className="font-bold text-on-surface">{pending.user.nickname}</span>(
              {pending.user.email}) 계정이 사라집니다. 이 사람이 가족 마스터였다면 다음으로 오래된
              구성원에게 넘어갑니다. 등록한 재료는 가족에 남습니다.
            </>
          ) : pending?.kind === 'delete-family' ? (
            <>
              <span className="font-bold text-on-surface">{pending.family.name}</span>의 재료{' '}
              {pending.family.ingredient_count}개와 알림·소비 기록이 함께 사라집니다. 구성원{' '}
              {pending.family.member_count}명의 계정은 남고, 소속만 해제되어 각자 새 1인 가족이
              만들어집니다.
            </>
          ) : null
        }
      />
    </>
  )
}
