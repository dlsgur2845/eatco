import { useEffect, useRef, useState } from 'react'
import { useRafLoop } from '../../hooks/useRafLoop'
import { useReducedMotion } from '../../hooks/useReducedMotion'

/**
 * 영수증 스캔 대기 화면 (실측 9초대).
 *
 * 왜 진행률이 아니라 이건가: Gemini 호출은 진행률을 알려주지 않는다. 예전에
 * 가짜 퍼센트를 그렸다가 2.4초에 100% 가 되고 멈춰서, 사용자가 작업이 죽은 줄
 * 알고 뒤로가기를 눌러 스캔을 날렸다. 여기서는 "얼마나 남았나" 대신
 * **"지금 읽고 있다"** 를 보여준다. 빛줄기가 지나간 자리의 항목이 하나씩
 * 또렷해진다. 끝나면 처음부터 다시 훑는다. 9초든 20초든 거짓말을 하지 않는다.
 *
 * 라이브러리를 쓰지 않는다. 이미 746 kB 인 번들에 모션 라이브러리 40~60 kB 를
 * 얹는 건 기다림을 예쁘게 만들려고 모두의 첫 로딩을 늦추는 거래다.
 */

const LINES = 7
const SWEEP_MS = 2600

/** CSS 변수를 읽는다. 디자인 토큰이 한 곳(index.css)에만 있게 유지하기 위함. */
function token(el: HTMLElement, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return v || fallback
}

export default function ScanLoader({ label }: { label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const colorsRef = useRef({ primary: '#006e1c', ink: '#191c1b', faint: '#dfe3e0', paper: '#ffffff' })
  const sizeRef = useRef({ w: 0, h: 0 })
  // getContext('2d') 는 null 을 반환할 수 있다 (메모리 압박, 컨텍스트 수 상한).
  // 그때 캔버스만 두면 로딩 화면이 빈 칸이 된다. 기존 막대로 되돌아간다.
  const [failed, setFailed] = useState(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setFailed(true)
      return
    }
    ctxRef.current = ctx

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      // 레티나에서 무한정 올리지 않는다. 3x 는 픽셀이 2.25배인데 눈에는 같다.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = parent.clientWidth
      const h = Math.round(w * 0.62)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { w, h }
      colorsRef.current = {
        primary: token(canvas, '--color-primary', '#006e1c'),
        ink: token(canvas, '--color-on-surface', '#191c1b'),
        faint: token(canvas, '--color-surface-container-high', '#e6e9e7'),
        paper: token(canvas, '--color-surface-container-lowest', '#ffffff'),
      }
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const draw = (elapsed: number) => {
    const ctx = ctxRef.current
    const { w, h } = sizeRef.current
    if (!ctx || !w) return
    const c = colorsRef.current

    // 동작 줄이기: 훑지 않고 완성된 정지 프레임 하나.
    const progress = reduced ? 1 : (elapsed % SWEEP_MS) / SWEEP_MS

    ctx.clearRect(0, 0, w, h)

    // ── 영수증 ──
    const rw = w * 0.52
    const rh = h * 0.82
    const rx = (w - rw) / 2
    const ry = (h - rh) / 2

    ctx.fillStyle = c.paper
    ctx.beginPath()
    ctx.roundRect(rx, ry, rw, rh, 6)
    ctx.fill()
    ctx.strokeStyle = c.faint
    ctx.lineWidth = 1
    ctx.stroke()

    // 아래쪽 톱니 (영수증 절취선)
    const teeth = 9
    ctx.fillStyle = c.paper
    ctx.beginPath()
    ctx.moveTo(rx, ry + rh)
    for (let i = 0; i < teeth; i++) {
      const x0 = rx + (rw / teeth) * i
      ctx.lineTo(x0 + rw / teeth / 2, ry + rh + 5)
      ctx.lineTo(x0 + rw / teeth, ry + rh)
    }
    ctx.closePath()
    ctx.fill()

    // ── 항목 줄 ──
    const padX = rw * 0.12
    const top = ry + rh * 0.18
    const gap = (rh * 0.66) / LINES
    const sweepY = ry + rh * progress

    for (let i = 0; i < LINES; i++) {
      const y = top + gap * i
      // 줄 길이를 조금씩 다르게 해서 실제 영수증처럼 보이게 한다.
      const len = (rw - padX * 2) * (0.55 + ((i * 37) % 45) / 100)
      const passed = y < sweepY
      ctx.fillStyle = passed ? c.ink : c.faint
      ctx.globalAlpha = passed ? 0.85 : 1
      ctx.beginPath()
      ctx.roundRect(rx + padX, y, len, Math.max(2, gap * 0.28), 2)
      ctx.fill()
      // 인식된 줄 오른쪽에 가격 자리
      if (passed) {
        ctx.fillStyle = c.primary
        ctx.beginPath()
        ctx.roundRect(rx + rw - padX - rw * 0.16, y, rw * 0.16, Math.max(2, gap * 0.28), 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // ── 빛줄기 ──
    if (!reduced) {
      const band = rh * 0.16
      const g = ctx.createLinearGradient(0, sweepY - band, 0, sweepY + band * 0.35)
      g.addColorStop(0, 'transparent')
      g.addColorStop(0.75, c.primary)
      g.addColorStop(1, 'transparent')
      ctx.globalAlpha = 0.22
      ctx.fillStyle = g
      ctx.fillRect(rx, sweepY - band, rw, band * 1.35)
      ctx.globalAlpha = 1

      ctx.strokeStyle = c.primary
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(rx, sweepY)
      ctx.lineTo(rx + rw, sweepY)
      ctx.stroke()
    }
  }

  // 정지 프레임은 루프를 돌리지 않는다.
  useRafLoop(draw, !failed && !reduced)
  useEffect(() => {
    if (reduced && !failed) draw(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, failed])

  if (failed) {
    // 기존 불확정 막대. 캔버스를 못 쓰는 기기에서도 "살아 있다"는 신호는 남는다.
    return (
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-48 h-1.5 rounded-full overflow-hidden bg-surface-container-high"
          role="progressbar"
          aria-label={label}
        >
          <div className="h-full w-1/3 rounded-full bg-primary scan-indeterminate" />
        </div>
        <p className="text-sm font-medium text-primary">{label}</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[260px] flex flex-col items-center gap-3">
      <canvas ref={canvasRef} role="img" aria-label={label} className="block" />
      <p className="text-sm font-medium text-primary" role="status">
        {label}
      </p>
    </div>
  )
}
