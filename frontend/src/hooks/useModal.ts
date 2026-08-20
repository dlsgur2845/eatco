import { useEffect, useRef } from 'react'

/**
 * 모달 공통 동작. 8곳이 각자 손으로 오버레이를 만들면서 아래를 전부 빠뜨렸다.
 *
 * 가장 중요한 건 **Android 뒤로가기**다. 안드로이드에서 뒤로가기는 "취소" 제스처라
 * 반사적으로 누른다. 홈화면에 설치된 PWA 에는 브라우저 크롬이 없어서, 모달이
 * 히스토리 항목을 갖고 있지 않으면 뒤로가기가 현재 라우트를 팝하고 그 아래가 없어
 * **앱이 그냥 종료된다.** 반쯤 채운 등록 폼이나, 사진 찍고 9초 기다려 얻은 스캔
 * 결과가 통째로 날아간다. 접근성 문제처럼 보이지만 실제로는 데이터 유실 버그다.
 *
 * 함께 처리하는 것:
 * - Escape (외장 키보드/데스크톱)
 * - 열려 있는 동안 body 스크롤 잠금 (뒤 페이지로 스크롤이 새는 것 방지)
 * - 포커스: 열 때 패널로, 닫을 때 원래 자리로. 완전한 focus trap 은 아니지만
 *   6줄로 가치의 대부분을 가져온다.
 */
export function useModal(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<Element | null>(null)
  const closeRef = useRef(onClose)
  // 렌더 중에 ref 를 쓰면 안 된다. 최신 onClose 를 이펙트에서 동기화한다.
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    openerRef.current = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 뒤로가기가 앱을 종료시키지 않고 모달만 닫도록 히스토리 항목을 하나 쌓는다.
    history.pushState({ eatcoModal: true }, '')
    const onPop = () => closeRef.current()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)

    panelRef.current?.focus()

    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      // 우리가 쌓은 항목이 아직 남아 있으면(= 뒤로가기가 아니라 버튼으로 닫힘) 정리한다.
      if (history.state?.eatcoModal) history.back()
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus()
    }
  }, [open])

  return panelRef
}
