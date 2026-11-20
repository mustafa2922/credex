import { useMemo, useState } from 'react'
import styles from './HomePage.module.css'

type StatusKey = 'paid' | 'partial' | 'unpaid'

type InvoiceStatusChartProps = {
  paid: number
  partial: number
  unpaid: number
}

const SEGMENTS: Array<{ key: StatusKey; label: string; color: string; dot: string }> = [
  { key: 'paid', label: 'Paid', color: '#6fbf88', dot: styles.dotPaid },
  { key: 'partial', label: 'Partial', color: '#d4a85a', dot: styles.dotPartial },
  { key: 'unpaid', label: 'Unpaid', color: '#c48a6a', dot: styles.dotUnpaid }
]

const RADIUS = 54
const STROKE = 16
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function InvoiceStatusChart({
  paid,
  partial,
  unpaid
}: InvoiceStatusChartProps): React.JSX.Element {
  const [active, setActive] = useState<StatusKey | null>(null)

  const counts = useMemo(
    () => ({ paid, partial, unpaid }) satisfies Record<StatusKey, number>,
    [paid, partial, unpaid]
  )

  const total = paid + partial + unpaid

  const arcs = useMemo(() => {
    let offset = 0
    return SEGMENTS.map((segment) => {
      const value = counts[segment.key]
      const length = total > 0 ? (value / total) * CIRCUMFERENCE : 0
      const arc = {
        ...segment,
        value,
        percent: total > 0 ? Math.round((value / total) * 100) : 0,
        length,
        offset: -offset
      }
      offset += length
      return arc
    })
  }, [counts, total])

  function segmentAtPoint(clientX: number, clientY: number, svg: SVGSVGElement): StatusKey | null {
    if (total <= 0) return null
    const rect = svg.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    const dist = Math.hypot(dx, dy)
    const scale = rect.width / 140
    const outer = (RADIUS + STROKE / 2 + 2) * scale
    const inner = (RADIUS - STROKE / 2 - 2) * scale
    if (dist < inner || dist > outer) return null

    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    if (angle < 0) angle += 360
    const ratio = angle / 360

    let cursor = 0
    for (let i = 0; i < SEGMENTS.length; i++) {
      const segment = SEGMENTS[i]!
      const share = counts[segment.key] / total
      if (share <= 0) continue
      if (ratio <= cursor + share || i === SEGMENTS.length - 1) return segment.key
      cursor += share
    }
    return null
  }

  const focus = active ? arcs.find((arc) => arc.key === active) : null
  const centerValue = focus ? focus.value : total
  const centerLabel = focus ? `${focus.label} · ${focus.percent}%` : 'Issued'

  return (
    <div className={styles.statusBody}>
      <div className={styles.donutWrap}>
        <svg
          className={styles.donutSvg}
          viewBox="0 0 140 140"
          role="img"
          aria-label="Invoice payment status breakdown"
          onMouseMove={(event) => {
            const next = segmentAtPoint(event.clientX, event.clientY, event.currentTarget)
            setActive(next)
          }}
          onMouseLeave={() => setActive(null)}
        >
          <circle
            cx="70"
            cy="70"
            r={RADIUS}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={STROKE}
            opacity={total > 0 ? 0.35 : 1}
          />
          {arcs.map((arc) => {
            if (arc.length <= 0) return null
            const dimmed = active != null && active !== arc.key
            const emphasized = active === arc.key
            return (
              <circle
                key={arc.key}
                cx="70"
                cy="70"
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={emphasized ? STROKE + 4 : STROKE}
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                strokeDashoffset={arc.offset}
                strokeLinecap="butt"
                transform="rotate(-90 70 70)"
                opacity={dimmed ? 0.22 : 1}
                className={styles.donutSegment}
              />
            )
          })}
        </svg>
        <div className={styles.donutCenter} aria-live="polite">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>

      <div className={styles.statusLegend}>
        {arcs.map((arc) => (
          <button
            key={arc.key}
            type="button"
            className={`${styles.statusItem} ${active === arc.key ? styles.statusItemActive : ''}`}
            onMouseEnter={() => setActive(arc.key)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(arc.key)}
            onBlur={() => setActive(null)}
            aria-pressed={active === arc.key}
          >
            <i className={`${styles.dot} ${arc.dot}`} />
            {arc.label} <strong>{arc.value}</strong>
            <span className={styles.statusPercent}>{arc.percent}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}
