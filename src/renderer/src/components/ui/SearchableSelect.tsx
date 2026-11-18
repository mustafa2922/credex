import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@renderer/components/icons/Icon'
import styles from './SearchableSelect.module.css'

export type SearchableSelectOption = {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

type SearchableSelectProps = {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  invalid?: boolean
  clearable?: boolean
  variant?: 'outlined' | 'underline'
  ariaLabel?: string
  className?: string
}

type MenuPosition = {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: 'bottom' | 'top'
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function matchesQuery(option: SearchableSelectOption, query: string): boolean {
  if (!query) return true
  const haystack = normalize(`${option.label} ${option.description ?? ''}`)
  return haystack.includes(query)
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to search…',
  emptyMessage = 'No matches',
  disabled = false,
  invalid = false,
  clearable = false,
  variant = 'outlined',
  ariaLabel,
  className
}: SearchableSelectProps): React.JSX.Element {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  )

  const filtered = useMemo(() => {
    const normalized = normalize(query)
    return options.filter((option) => matchesQuery(option, normalized))
  }, [options, query])

  // Closed: show the selected label. Open: show the live search query.
  const inputValue = open ? query : (selected?.label ?? '')

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null)
      return
    }

    function updatePosition(): void {
      const trigger = rootRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const gap = 6
      const preferredHeight = 280
      const spaceBelow = window.innerHeight - rect.bottom - gap - 8
      const spaceAbove = rect.top - gap - 8
      const placement = spaceBelow < 160 && spaceAbove > spaceBelow ? 'top' : 'bottom'
      const maxHeight = Math.max(
        120,
        Math.min(preferredHeight, placement === 'bottom' ? spaceBelow : spaceAbove)
      )
      setMenuPosition({
        top: placement === 'bottom' ? rect.bottom + gap : rect.top - gap,
        left: rect.left,
        width: rect.width,
        maxHeight,
        placement
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, filtered.length])

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
      setQuery('')
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const selectedIndex = filtered.findIndex((option) => option.value === value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [open, filtered, value])

  useEffect(() => {
    if (!open) return
    const option = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    option?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  function close(): void {
    setOpen(false)
    setQuery('')
  }

  function openMenu(): void {
    if (disabled || open) return
    setOpen(true)
    setQuery('')
  }

  function selectOption(option: SearchableSelectOption): void {
    if (option.disabled) return
    onChange(option.value)
    close()
    inputRef.current?.blur()
  }

  function clearSelection(event: ReactMouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    onChange('')
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function moveActive(delta: number): void {
    if (filtered.length === 0) return
    setActiveIndex((current) => {
      let next = current
      for (let step = 0; step < filtered.length; step += 1) {
        next = (next + delta + filtered.length) % filtered.length
        if (!filtered[next]?.disabled) return next
      }
      return current
    })
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (disabled) return

    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      event.preventDefault()
      openMenu()
      return
    }

    if (!open) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const option = filtered[activeIndex]
      if (option) selectOption(option)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  const rootClass = [
    styles.root,
    variant === 'underline' ? styles.underline : styles.outlined,
    open ? styles.open : null,
    invalid ? styles.invalid : null,
    disabled ? styles.disabled : null,
    className
  ]
    .filter(Boolean)
    .join(' ')

  const menuStyle: CSSProperties | undefined = menuPosition
    ? {
        top: menuPosition.placement === 'bottom' ? menuPosition.top : undefined,
        bottom:
          menuPosition.placement === 'top'
            ? window.innerHeight - menuPosition.top
            : undefined,
        left: menuPosition.left,
        width: menuPosition.width,
        maxHeight: menuPosition.maxHeight
      }
    : undefined

  return (
    <div ref={rootRef} className={rootClass}>
      <div className={styles.control}>
        <input
          ref={inputRef}
          className={styles.input}
          value={inputValue}
          disabled={disabled}
          placeholder={open ? searchPlaceholder : placeholder}
          aria-label={ariaLabel ?? placeholder}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && filtered[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined
          }
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          onFocus={openMenu}
          onChange={(event) => {
            if (!open) setOpen(true)
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={onInputKeyDown}
        />
        <span className={styles.trailing}>
          {clearable && selected && !disabled ? (
            <button
              type="button"
              className={styles.clear}
              tabIndex={-1}
              aria-label="Clear selection"
              onMouseDown={clearSelection}
            >
              <Icon name="close" width={14} height={14} />
            </button>
          ) : null}
          <Icon name={open ? 'chevronUp' : 'chevronDown'} width={16} height={16} />
        </span>
      </div>

      {open && menuPosition
        ? createPortal(
            <div
              ref={listRef}
              id={listboxId}
              className={styles.menu}
              style={menuStyle}
              role="listbox"
              aria-label={ariaLabel ?? placeholder}
            >
              {filtered.length === 0 ? (
                <div className={styles.empty}>{emptyMessage}</div>
              ) : (
                filtered.map((option, index) => {
                  const active = index === activeIndex
                  const isSelected = option.value === value
                  return (
                    <button
                      key={option.value}
                      id={`${listboxId}-option-${index}`}
                      type="button"
                      role="option"
                      data-index={index}
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      className={[
                        styles.option,
                        active ? styles.optionActive : null,
                        isSelected ? styles.optionSelected : null
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => {
                        // Keep input focus; prevent blur-close before click selects.
                        event.preventDefault()
                      }}
                      onClick={() => selectOption(option)}
                    >
                      <span className={styles.optionLabel}>{option.label}</span>
                      {option.description ? (
                        <span className={styles.optionDescription}>{option.description}</span>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
