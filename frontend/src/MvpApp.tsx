import { useState } from 'react'
import { verifyFamilyCode } from './api/scan'
import MvpDashboardPage from './pages/MvpDashboardPage'
import ScanPage from './pages/ScanPage'

type Tab = 'scan' | 'dashboard'

export default function MvpApp() {
  const [familyCode, setFamilyCode] = useState<string>(() => {
    return sessionStorage.getItem('eatco_family_code') || ''
  })
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('scan')
  const [dashboardKey, setDashboardKey] = useState(0)

  // 가정 코드 진입
  if (!familyCode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6" style={{ backgroundColor: 'var(--color-surface)' }}>
        <h1
          className="text-3xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-primary)' }}
        >
          Eatco
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--color-on-surface-variant)' }}>
          가족 식재료 관리
        </p>

        <div className="w-full max-w-sm">
          <input
            className="w-full px-4 py-3 rounded-xl text-center text-lg tracking-widest outline-none"
            style={{
              backgroundColor: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: codeError ? '2px solid var(--color-error)' : '2px solid transparent',
            }}
            placeholder="가정 코드 입력"
            value={codeInput}
            onChange={e => {
              setCodeInput(e.target.value)
              setCodeError(false)
            }}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
          {codeError && (
            <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-error)' }}>
              유효하지 않은 코드예요
            </p>
          )}

          <button
            className="w-full mt-4 py-3 rounded-full text-base font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))' }}
            onClick={handleJoin}
            disabled={verifying}
          >
            {verifying ? '확인 중...' : '시작하기'}
          </button>
        </div>
      </div>
    )
  }

  async function handleJoin() {
    const code = codeInput.trim()
    if (!code) {
      setCodeError(true)
      return
    }
    setVerifying(true)
    setCodeError(false)
    try {
      await verifyFamilyCode(code)
      sessionStorage.setItem('eatco_family_code', code)
      setFamilyCode(code)
    } catch {
      setCodeError(true)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-surface)' }}>
      {/* 콘텐츠 */}
      {activeTab === 'scan' ? (
        <ScanPage
          familyCode={familyCode}
          onRegistered={() => {
            setDashboardKey(prev => prev + 1)
            setActiveTab('dashboard')
          }}
        />
      ) : (
        <MvpDashboardPage key={dashboardKey} familyCode={familyCode} />
      )}

      {/* 하단 탭 바 */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex border-t"
        style={{ backgroundColor: 'var(--color-surface-container-lowest)', borderColor: 'var(--color-surface-container)' }}
      >
        <TabButton
          label="스캔"
          icon="📷"
          active={activeTab === 'scan'}
          onClick={() => setActiveTab('scan')}
        />
        <TabButton
          label="냉장고"
          icon="🥬"
          active={activeTab === 'dashboard'}
          onClick={() => setActiveTab('dashboard')}
        />
      </nav>
    </div>
  )
}

function TabButton({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className="flex-1 flex flex-col items-center py-3 gap-0.5"
      style={{ color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}
      onClick={onClick}
      aria-label={label}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}
