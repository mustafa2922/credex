import { useRef, useState, type Ref } from 'react'
import { NavLink } from 'react-router'
import { navSections, screenHref, screens, type AppScreen } from '@renderer/app/screens'
import { Icon } from '@renderer/components/icons/Icon'
import styles from './Sidebar.module.css'

type SidebarProps = {
  open: boolean
  onToggle: () => void
  sidebarRef: Ref<HTMLElement>
}

type TipPoint = {
  top: number
  left: number
}

function useRailTooltip<T extends HTMLElement>(
  enabled: boolean
): {
  ref: Ref<T>
  tip: TipPoint | null
  show: () => void
  hide: () => void
} {
  const ref = useRef<T>(null)
  const [tip, setTip] = useState<TipPoint | null>(null)

  function show(): void {
    if (!enabled) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setTip({ top: rect.top + rect.height / 2, left: rect.right + 12 })
  }

  function hide(): void {
    setTip(null)
  }

  return { ref, tip: enabled ? tip : null, show, hide }
}

function RailTooltip({ tip, label }: { tip: TipPoint; label: string }): React.JSX.Element {
  return (
    <span className={styles.tooltip} style={{ top: tip.top, left: tip.left }} role="tooltip">
      {label}
    </span>
  )
}

function SidebarHeader({
  collapsed,
  onToggle
}: {
  collapsed: boolean
  onToggle: () => void
}): React.JSX.Element {
  const { ref, tip, show, hide } = useRailTooltip<HTMLButtonElement>(collapsed)
  const label = collapsed ? 'Open sidebar' : 'Close sidebar'

  return (
    <div className={styles.brand}>
      <span className={styles.brandName}>CredEx</span>
      <button
        ref={ref}
        id="sidebar-toggle"
        type="button"
        className={styles.toggle}
        aria-expanded={!collapsed}
        aria-controls="app-sidebar"
        aria-keyshortcuts="Control+B"
        aria-label={label}
        onClick={onToggle}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Icon name="panel" />
      </button>
      {tip ? <RailTooltip tip={tip} label={label} /> : null}
    </div>
  )
}

function SidebarLink({
  item,
  collapsed
}: {
  item: AppScreen
  collapsed: boolean
}): React.JSX.Element {
  const { ref, tip, show, hide } = useRailTooltip<HTMLAnchorElement>(collapsed)

  return (
    <>
      <NavLink
        ref={ref}
        to={screenHref(item)}
        end={item.index === true}
        className={styles.link}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Icon name={item.icon} />
        <span className={styles.label}>{item.label}</span>
      </NavLink>
      {tip ? <RailTooltip tip={tip} label={item.label} /> : null}
    </>
  )
}

export function Sidebar({ open, onToggle, sidebarRef }: SidebarProps): React.JSX.Element {
  const sections = navSections(screens.filter((screen) => screen.sidebar !== false))
  const collapsed = !open

  return (
    <aside
      id="app-sidebar"
      ref={sidebarRef}
      className={collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar}
      aria-label="Sidebar"
    >
      <div className={styles.inner}>
        <SidebarHeader collapsed={collapsed} onToggle={onToggle} />
        <nav className={styles.nav} aria-label="Primary">
          {sections.map((section) => (
            <div key={section.id}>
              {section.label ? <p className={styles.sectionLabel}>{section.label}</p> : null}
              <ul className={styles.list}>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <SidebarLink item={item} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  )
}
