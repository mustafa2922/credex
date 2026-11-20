import { useCallback, useEffect, useRef, useState } from 'react'
import { formatRupees } from '../../../../core/money'
import type { DashboardMonth } from '../../../../shared/dashboard'
import styles from './HomePage.module.css'

type RevenueChartProps = {
  months: readonly DashboardMonth[]
}

type Layout = {
  width: number
  height: number
  padding: { top: number; bottom: number; left: number; right: number }
  chartW: number
  chartH: number
  maxPaisa: number
  maxRupees: number
  groupW: number
  barW: number
}

type HoverState = {
  index: number
  x: number
  y: number
}

function readColor(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  return value || fallback
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

function buildLayout(width: number, height: number, months: readonly DashboardMonth[]): Layout {
  const padding = { top: 10, bottom: 24, left: 40, right: 8 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom
  const maxRaw = Math.max(0, ...months.map((m) => Math.max(m.invoiced, m.collected)))
  const maxRupees = Math.max(1, Math.ceil(maxRaw / 100 / 75_000) * 75_000)
  const groupW = months.length > 0 ? chartW / months.length : chartW
  return {
    width,
    height,
    padding,
    chartW,
    chartH,
    maxRupees,
    maxPaisa: maxRupees * 100,
    groupW,
    barW: Math.min(14, groupW * 0.28)
  }
}

function hitMonthIndex(layout: Layout, monthsLength: number, x: number, y: number): number | null {
  const { padding, chartH, groupW } = layout
  if (x < padding.left || x > layout.width - padding.right) return null
  if (y < padding.top || y > padding.top + chartH + 16) return null
  if (monthsLength === 0) return null
  const index = Math.floor((x - padding.left) / groupW)
  if (index < 0 || index >= monthsLength) return null
  return index
}

export function RevenueChart({ months }: RevenueChartProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<Layout | null>(null)
  const hoverIndexRef = useRef<number | null>(null)
  const [hover, setHover] = useState<HoverState | null>(null)

  const draw = useCallback((): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width <= 0 || height <= 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const layout = buildLayout(width, height, months)
    layoutRef.current = layout

    const muted = readColor('--color-text-muted', '#969ba7')
    const text = readColor('--color-text', muted)
    const faint = readColor('--color-border', '#eff0f4')
    const invoicedColor = readColor('--color-accent', '#8ea2f0')
    const collectedColor = '#6fbf88'
    const active = hoverIndexRef.current

    ctx.font = '10px Segoe UI, sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'

    for (let i = 0; i <= 4; i++) {
      const y = layout.padding.top + (layout.chartH * i) / 4
      const value = layout.maxRupees * (1 - i / 4)

      ctx.strokeStyle = faint
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(layout.padding.left, y)
      ctx.lineTo(width - layout.padding.right, y)
      ctx.stroke()

      ctx.fillStyle = muted
      ctx.fillText(value === 0 ? '0' : `${value / 1000}k`, layout.padding.left - 8, y)
    }

    if (months.length === 0) return

    months.forEach((item, index) => {
      const center = layout.padding.left + layout.groupW * (index + 0.5)
      const invoicedH = (item.invoiced / layout.maxPaisa) * layout.chartH
      const collectedH = (item.collected / layout.maxPaisa) * layout.chartH
      const dimmed = active != null && active !== index
      const emphasized = active === index
      const barW = emphasized ? layout.barW + 1.5 : layout.barW

      if (emphasized) {
        ctx.fillStyle = withAlpha(faint, 0.65)
        ctx.fillRect(
          layout.padding.left + layout.groupW * index + 2,
          layout.padding.top,
          Math.max(0, layout.groupW - 4),
          layout.chartH
        )
      }

      ctx.fillStyle = withAlpha(invoicedColor, dimmed ? 0.22 : 1)
      ctx.beginPath()
      ctx.roundRect(
        center - barW - 2,
        layout.padding.top + layout.chartH - invoicedH,
        barW,
        Math.max(invoicedH, item.invoiced > 0 ? 2 : 0),
        3
      )
      ctx.fill()

      ctx.fillStyle = withAlpha(collectedColor, dimmed ? 0.22 : 1)
      ctx.beginPath()
      ctx.roundRect(
        center + 2,
        layout.padding.top + layout.chartH - collectedH,
        barW,
        Math.max(collectedH, item.collected > 0 ? 2 : 0),
        3
      )
      ctx.fill()

      ctx.fillStyle = emphasized ? text : muted
      ctx.textAlign = 'center'
      ctx.fillText(item.label, center, height - 8)
    })
  }, [months])

  useEffect(() => {
    hoverIndexRef.current = null
    setHover(null)
    draw()

    const canvas = canvasRef.current
    if (!canvas) return

    const resizeObserver = new ResizeObserver(() => draw())
    resizeObserver.observe(canvas)

    const themeObserver = new MutationObserver(() => draw())
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })

    return () => {
      resizeObserver.disconnect()
      themeObserver.disconnect()
    }
  }, [draw])

  function updateHover(clientX: number, clientY: number): void {
    const canvas = canvasRef.current
    const layout = layoutRef.current
    if (!canvas || !layout) return

    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const index = hitMonthIndex(layout, months.length, x, y)

    if (index === hoverIndexRef.current) {
      if (index != null) setHover({ index, x, y })
      return
    }

    hoverIndexRef.current = index
    setHover(index == null ? null : { index, x, y })
    draw()
  }

  function clearHover(): void {
    if (hoverIndexRef.current == null && hover == null) return
    hoverIndexRef.current = null
    setHover(null)
    draw()
  }

  const tip = hover ? months[hover.index] : null
  const tipLeft = hover
    ? Math.min(Math.max(hover.x, 78), (layoutRef.current?.width ?? 200) - 78)
    : 0

  return (
    <div className={styles.chartInteractive}>
      <canvas
        ref={canvasRef}
        className={styles.revenueCanvas}
        onMouseMove={(event) => updateHover(event.clientX, event.clientY)}
        onMouseLeave={clearHover}
        role="img"
        aria-label="Invoiced versus collected for the last 6 months"
      />
      {tip && hover ? (
        <div
          className={styles.chartTooltip}
          style={{ left: tipLeft, top: Math.max(hover.y - 10, 8) }}
          role="tooltip"
        >
          <div className={styles.chartTooltipTitle}>{tip.label}</div>
          <div className={styles.chartTooltipRow}>
            <span className={styles.chartTooltipKey}>
              <i className={`${styles.dot} ${styles.dotInvoiced}`} />
              Invoiced
            </span>
            <strong>{formatRupees(tip.invoiced)}</strong>
          </div>
          <div className={styles.chartTooltipRow}>
            <span className={styles.chartTooltipKey}>
              <i className={`${styles.dot} ${styles.dotCollected}`} />
              Collected
            </span>
            <strong>{formatRupees(tip.collected)}</strong>
          </div>
        </div>
      ) : null}
    </div>
  )
}
