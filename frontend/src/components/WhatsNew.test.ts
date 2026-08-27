import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURRENT_VERSION, CHANGELOG } from './WhatsNew'

/**
 * 이 모달은 `seen !== CURRENT_VERSION` 일 때만 뜬다. 그래서 **CURRENT_VERSION 을
 * 안 올리면 기능 전체가 조용히 죽는다** — 오류도, 빈 화면도 없다. 그냥 안 뜬다.
 *
 * 실제로 '1.6.0' 에 멈춰 있었고 v1.7.0·v1.8.0 이 소식 없이 나갔다. 두 릴리스
 * 동안 아무도 몰랐다. 사람이 기억해야 하는 규칙은 언젠가 잊힌다 — 고정해 둔다.
 */

// vite 변환 뒤의 `import.meta.url` 은 file: URL 이 아니라 new URL(...) 이 던진다.
// vitest 의 cwd 는 frontend/ 이므로 저장소 루트는 한 단계 위다.
const changelogMd = readFileSync(resolve(process.cwd(), '..', 'CHANGELOG.md'), 'utf8')

describe('새로운 소식 — 버전 동기화', () => {
  it('CURRENT_VERSION 이 최신 항목과 같다', () => {
    // 다르면 최신 릴리스를 본 사람에게 모달이 영영 안 뜬다.
    expect(CURRENT_VERSION).toBe(CHANGELOG[0].version)
  })

  it('CURRENT_VERSION 이 CHANGELOG.md 의 최신 릴리스와 같다', () => {
    const top = changelogMd.match(/^## v(\d+\.\d+\.\d+)/m)?.[1]
    expect(top).toBeTruthy()
    expect(CURRENT_VERSION).toBe(top)
  })

  it('버전이 내림차순이다', () => {
    const nums = CHANGELOG.map((e) => e.version.split('.').map(Number))
    for (let i = 1; i < nums.length; i++) {
      const [a, b] = [nums[i - 1], nums[i]]
      const cmp = a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
      expect(cmp).toBeGreaterThan(0)
    }
  })

  it('항목마다 최소 한 줄은 있다', () => {
    for (const e of CHANGELOG) {
      expect((e.features?.length ?? 0) + (e.improvements?.length ?? 0)).toBeGreaterThan(0)
    }
  })
})
