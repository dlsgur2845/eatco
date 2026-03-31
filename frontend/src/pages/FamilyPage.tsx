import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import type { Family, User } from '../types'

/* ──────────────────────────────────────────────
   가족 관리 뷰 (메인)
   ────────────────────────────────────────────── */
function FamilyManageView({
  family,
  currentUser,
  onRefresh,
}: {
  family: Family
  currentUser: User
  onRefresh: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [localFamily, setLocalFamily] = useState(family)

  // 외부에서 family가 변경되면 동기화
  useEffect(() => {
    setLocalFamily(family)
  }, [family])

  const copyCode = () => {
    navigator.clipboard.writeText(localFamily.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleJoinFamily = async (e: React.FormEvent) => {
    e.preventDefault()
    setJoinError('')
    try {
      await api.post<Family>('/auth/family/join', { invite_code: joinCode })
      // 참여 성공 → 서버에서 최신 유저 + 가족 정보를 다시 불러옴
      setJoinCode('')
      setShowJoin(false)
      onRefresh()
    } catch {
      setJoinError('유효하지 않은 초대 코드입니다.')
    }
  }

  const toggleSetting = async (key: 'allow_shared_edit') => {
    try {
      const res = await api.put<Family>('/auth/family/settings', {
        [key]: !localFamily[key],
      })
      setLocalFamily(res.data)
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      {/* Hero */}
      <div className="mb-10">
        <h2 className="font-headline font-bold text-4xl text-on-surface tracking-tight mb-2">
          가족 관리
        </h2>
        <p className="text-on-surface-variant">
          우리 집 냉장고를 함께 관리할 구성원을 초대하고 권한을 설정하세요.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* ── Member List ── */}
        <div className="lg:col-span-7 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-headline font-semibold text-xl flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container">group</span>
                현재 가족 구성원
              </h3>
              <span className="text-[10px] bg-primary-container/10 text-primary font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                {localFamily.members.length} MEMBERS
              </span>
            </div>

            <div className="space-y-4">
              {localFamily.members.map((member) => {
                const isMe = member.id === currentUser.id
                const isAdmin = member.id === localFamily.master_id

                return (
                  <div
                    key={member.id}
                    className={`bg-surface-container-lowest p-5 rounded-xl flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:scale-[1.01] transition-transform duration-300 ${
                      isAdmin ? 'border-l-4 border-primary' : 'border-l-4 border-primary-container'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-14 h-14 rounded-full bg-surface-container-high flex items-center justify-center">
                          <span className="material-symbols-outlined text-on-surface-variant text-2xl">
                            person
                          </span>
                        </div>
                        {isAdmin && (
                          <div className="absolute -bottom-1 -right-1 bg-primary text-white p-0.5 rounded-full border-2 border-white">
                            <span className="material-symbols-outlined text-[14px] block">verified</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-headline font-bold text-on-surface">
                          {member.nickname}
                          {isMe && ' (나)'}
                        </p>
                        <p className="text-sm text-on-surface-variant">
                          {isAdmin ? '관리자' : '구성원'} &bull; {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <span className="text-[10px] text-primary font-bold tracking-widest bg-primary/5 px-2 py-1 rounded">
                          MASTER
                        </span>
                      )}
                      {!isAdmin && !isMe && currentUser.id === localFamily.master_id && (
                        <button
                          onClick={async () => {
                            if (!confirm(`${member.nickname}님을 가족에서 내보내시겠습니까?`)) return
                            try {
                              await api.post(`/auth/family/kick/${member.id}`)
                              onRefresh()
                            } catch {
                              alert('내보내기에 실패했습니다.')
                            }
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg text-tertiary hover:bg-tertiary/10 transition-colors"
                        >
                          내보내기
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* 가족 탈퇴 (2인 이상일 때만 표시) */}
          {localFamily.members.length > 1 && (
            <button
              onClick={async () => {
                if (!confirm('정말 이 가족에서 탈퇴하시겠습니까?\n탈퇴하면 새로운 1인 가족이 생성됩니다.')) return
                try {
                  await api.post('/auth/family/leave')
                  onRefresh()
                } catch {
                  alert('탈퇴에 실패했습니다.')
                }
              }}
              className="w-full p-4 bg-surface-container-lowest rounded-2xl flex items-center gap-4 hover:bg-tertiary-fixed/30 transition-colors text-left group"
            >
              <div className="w-10 h-10 bg-tertiary-fixed rounded-xl flex items-center justify-center group-hover:bg-tertiary-container/20">
                <span className="material-symbols-outlined text-tertiary">logout</span>
              </div>
              <div>
                <p className="font-headline font-semibold text-tertiary">가족에서 탈퇴하기</p>
                <p className="text-xs text-on-surface-variant">탈퇴 후 새로운 1인 가족이 생성됩니다</p>
              </div>
            </button>
          )}

          {/* 다른 가족에 참여하기 */}
          <section>
            {!showJoin ? (
              <button
                onClick={() => setShowJoin(true)}
                className="w-full p-5 bg-surface-container-lowest rounded-2xl flex items-center gap-4 hover:shadow-lg transition-shadow text-left"
              >
                <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-surface-variant">group_add</span>
                </div>
                <div>
                  <p className="font-headline font-semibold">다른 가족에 참여하기</p>
                  <p className="text-sm text-on-surface-variant">초대 코드를 입력하여 가족을 변경합니다</p>
                </div>
              </button>
            ) : (
              <form onSubmit={handleJoinFamily} className="bg-surface-container-highest rounded-2xl p-6 space-y-4">
                <h4 className="font-headline font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined">group_add</span>
                  초대 코드로 가족 변경
                </h4>
                <input
                  type="text"
                  required
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="w-full bg-surface-container-lowest border-none rounded-xl px-6 py-4 text-center text-2xl font-mono tracking-widest focus:ring-2 focus:ring-primary-container placeholder:text-outline-variant"
                  placeholder="CODE-1234"
                />
                {joinError && <p className="text-tertiary text-sm">{joinError}</p>}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowJoin(false); setJoinCode(''); setJoinError('') }}
                    className="flex-1 py-3 rounded-full bg-surface-container-high text-on-surface font-bold"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-full bg-on-surface text-surface font-bold active:scale-95 transition-transform"
                  >
                    참여하기
                  </button>
                </div>
                <p className="text-[11px] text-on-surface-variant text-center">
                  참여 시 현재 가족에서 탈퇴됩니다
                </p>
              </form>
            )}
          </section>
        </div>

        {/* ── Side Panel: Invite & Settings ── */}
        <div className="lg:col-span-5 space-y-8">
          {/* Invite Card */}
          <section className="bg-primary p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-primary-container rounded-full blur-[80px] opacity-40" />
            <div className="relative z-10">
              <h3 className="font-headline font-bold text-2xl mb-2">새 구성원 초대</h3>
              <p className="text-white/70 mb-8 font-light leading-relaxed">
                냉장고를 함께 관리할 가족을 초대해 보세요.
              </p>

              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
                <p className="text-[10px] text-white/60 font-bold tracking-[0.2em] mb-3">
                  INVITATION CODE
                </p>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-2xl md:text-3xl font-headline font-extrabold tracking-widest">
                    {localFamily.invite_code}
                  </span>
                  <button
                    onClick={copyCode}
                    className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-primary active:scale-95 transition-transform"
                  >
                    <span className="material-symbols-outlined">
                      {copied ? 'check' : 'content_copy'}
                    </span>
                  </button>
                </div>
              </div>
              <p className="text-white/50 text-xs text-center mt-3">
                초대 코드를 가족에게 공유하세요
              </p>
            </div>
          </section>

          {/* Settings */}
          <section className="bg-surface-container-low p-8 rounded-[2rem]">
            <h3 className="font-headline font-semibold text-xl mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary-container">shield_person</span>
              공유 및 권한 설정
            </h3>

            <div className="space-y-6">
              {/* 공동 편집 */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-headline font-medium text-on-surface">공동 편집 허용</p>
                  <p className="text-[12px] text-on-surface-variant">
                    {currentUser.id === localFamily.master_id
                      ? '모든 구성원이 품목을 추가/삭제할 수 있습니다.'
                      : '마스터만 이 설정을 변경할 수 있습니다.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSetting('allow_shared_edit')}
                  disabled={currentUser.id !== localFamily.master_id}
                  className={`w-12 h-6 rounded-full relative p-1 flex items-center transition-colors ${
                    localFamily.allow_shared_edit ? 'bg-primary justify-end' : 'bg-surface-container-highest justify-start'
                  } ${currentUser.id !== localFamily.master_id ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <div className="w-4 h-4 bg-white rounded-full" />
                </button>
              </div>

              {/* 알림 설정 안내 */}
              <div className="flex items-center gap-3 p-4 bg-surface-container-lowest rounded-xl">
                <span className="material-symbols-outlined text-primary text-xl">notifications</span>
                <div className="flex-1">
                  <p className="text-[12px] text-on-surface-variant">
                    소비기한 알림 주기는 <span className="font-bold text-on-surface">설정</span> 페이지에서 변경할 수 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

/* ──────────────────────────────────────────────
   Main Page
   ────────────────────────────────────────────── */
export default function FamilyPage() {
  const navigate = useNavigate()
  const [family, setFamily] = useState<Family | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // 항상 서버에서 최신 유저 정보를 가져옴
      const meRes = await api.get<User>('/auth/me')
      const user = meRes.data
      setCurrentUser(user)
      localStorage.setItem('user', JSON.stringify(user))

      if (user.family_id) {
        const famRes = await api.get<Family>(`/auth/family/${user.family_id}`)
        setFamily(famRes.data)
      } else {
        setFamily(null)
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        navigate('/login')
        return
      }
      setError('가족 정보를 불러올 수 없습니다. 새로고침해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-symbols-outlined text-primary animate-spin text-4xl">
          progress_activity
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <span className="material-symbols-outlined text-tertiary-container text-5xl mb-4 block">
          error
        </span>
        <p className="text-on-surface-variant mb-4">{error}</p>
        <button onClick={refresh} className="text-primary font-bold hover:underline">
          다시 시도
        </button>
      </div>
    )
  }

  if (family && currentUser) {
    return (
      <FamilyManageView
        family={family}
        currentUser={currentUser}
        onRefresh={refresh}
      />
    )
  }

  // 이 경우는 발생하지 않아야 함 (회원가입 시 1인 가족 자동 생성)
  return (
    <div className="text-center py-20 text-on-surface-variant">
      <p>가족 정보를 불러올 수 없습니다.</p>
      <button onClick={() => navigate('/')} className="text-primary font-bold mt-4">
        대시보드로 이동
      </button>
    </div>
  )
}
