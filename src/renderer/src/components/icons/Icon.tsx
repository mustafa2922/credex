import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'home'
  | 'panel'
  | 'settings'
  | 'clients'
  | 'units'
  | 'invoices'
  | 'payments'
  | 'edit'
  | 'pause'
  | 'check'
  | 'chevronDown'
  | 'chevronUp'
  | 'chevronLeft'
  | 'chevronRight'
  | 'image'
  | 'minimize'
  | 'maximize'
  | 'restore'
  | 'close'
  | 'trash'
  | 'plus'
  | 'reopen'
  | 'export'

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName
}

const glyphs: Record<IconName, ReactNode> = {
  home: (
    <path d="M4 10.8 12 4.5l8 6.3V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19v-8.2Z" />
  ),
  panel: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
    </>
  ),
  settings: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  clients: (
    <>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-7 0V19" />
      <circle cx="12.5" cy="8.5" r="3" />
      <path d="M5 19v-1.2a2.5 2.5 0 0 1 4.2-1.8" />
      <circle cx="7" cy="9" r="2.5" />
      <path d="M19 19v-1.2a2.5 2.5 0 0 0-4.2-1.8" />
      <circle cx="18" cy="9" r="2.5" />
    </>
  ),
  units: (
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 8z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  invoices: (
    <>
      <path d="M14.5 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V8l-3.5-4.5Z" />
      <path d="M14 3.5V8h4" />
      <path d="M8.5 12.5h7" />
      <path d="M8.5 16h4.5" />
    </>
  ),
  payments: (
    <>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M7.5 14h3" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  chevronDown: <path d="m7 10 5 5 5-5" />,
  chevronUp: <path d="m7 14 5-5 5 5" />,
  chevronLeft: <path d="m14 6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-4.5-4.5a2 2 0 0 0-2.8 0L5 20" />
    </>
  ),
  minimize: <path d="M5 19h14" />,
  maximize: <path d="M5 5h14v14H5z" />,
  restore: (
    <>
      <path d="M8 8h11v11H8z" />
      <path d="M5 16V5h11" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M6.5 7l.7 11.2A1.5 1.5 0 0 0 8.7 19.5h6.6a1.5 1.5 0 0 0 1.5-1.3L17.5 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </>
  ),
  plus: (
    <>
      <path d="M12 6v12" />
      <path d="M6 12h12" />
    </>
  ),
  reopen: (
    <>
      <path d="M3.5 12a8.5 8.5 0 0 1 14.5-6" />
      <path d="M18 3.5v4h-4" />
      <path d="M20.5 12a8.5 8.5 0 0 1-14.5 6" />
      <path d="M6 20.5v-4h4" />
    </>
  ),
  export: (
    <>
      <path d="M12 4v10" />
      <path d="m8.5 10.5 3.5 3.5 3.5-3.5" />
      <path d="M5 18h14" />
    </>
  )
}

export function Icon({ name, ...props }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {glyphs[name]}
    </svg>
  )
}
