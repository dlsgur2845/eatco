import { Component, type ReactNode } from 'react'

/**
 * 지연 로딩(React.lazy) 청크가 사라졌을 때를 처리한다.
 *
 * 배포하면 번들 해시가 바뀐다. 그런데 앱을 이미 열어둔 사람의 HTML 은 옛
 * 해시를 가리키고 있다. 그 상태로 가계부를 누르면 브라우저가
 * /assets/ExpensesPage-<옛해시>.js 를 요청하는데, Workers Static Assets 는
 * not_found_handling: single-page-application 이라 **404 가 아니라 200 +
 * text/html** (index.html) 을 돌려준다.
 *
 * 그러면 "Expected a JavaScript-or-Wasm module script but the server responded
 * with a MIME type of text/html" 로 import 가 거부되고, 에러 경계가 없으면
 * React 가 트리를 통째로 버려서 **빈 화면**이 된다. 실측으로 확인했다.
 *
 * 새 코드는 서버에 있으니 한 번 새로고침하면 해결된다. 사용자가 그걸 알
 * 방법이 없으므로 여기서 자동으로 한 번만 새로고침한다. 두 번째부터는
 * 무한 새로고침이 되므로 버튼으로 넘긴다.
 */

const RELOAD_FLAG = 'eatco:chunk-reloaded'

/** 청크를 못 받아서 난 에러인가. 진짜 코드 버그까지 새로고침으로 덮으면 안 된다. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  return (
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk|Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed|error loading dynamically imported module/i.test(msg) ||
    /MIME type/i.test(msg)
  )
}

interface Props {
  children: ReactNode
  fallback: ReactNode
}

interface State {
  failed: boolean
}

export default class LazyBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    if (!isChunkLoadError(error)) {
      // 청크 문제가 아니면 새로고침해도 소용없다. 화면만 보여준다.
      console.error('지연 로딩 화면에서 오류:', error)
      return
    }
    // 배포 직후 한 번만 자동 복구. 반복되면 다른 문제다.
    if (sessionStorage.getItem(RELOAD_FLAG)) return
    sessionStorage.setItem(RELOAD_FLAG, '1')
    window.location.reload()
  }

  componentDidMount() {
    // 정상적으로 떴다는 건 새 번들을 받았다는 뜻. 다음 배포를 위해 푼다.
    sessionStorage.removeItem(RELOAD_FLAG)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="text-center py-20" role="status">
        <span className="material-symbols-outlined text-tertiary text-5xl mb-4 block">
          sync_problem
        </span>
        <p className="text-on-surface font-headline font-bold text-lg mb-1">
          새 버전이 올라왔어요
        </p>
        <p className="text-sm text-on-surface-variant mb-6">
          앱을 다시 불러오면 정상으로 돌아와요.
        </p>
        <button
          onClick={() => {
            sessionStorage.removeItem(RELOAD_FLAG)
            window.location.reload()
          }}
          className="min-h-[48px] px-6 inline-flex items-center justify-center rounded-full bg-on-surface text-surface font-bold active:scale-95 transition-transform"
        >
          다시 불러오기
        </button>
      </div>
    )
  }
}
