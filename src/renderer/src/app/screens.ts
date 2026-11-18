import type { ComponentType } from 'react'
import type { IconName } from '@renderer/components/icons/Icon'
import { HomePage } from '@renderer/pages/home/HomePage'
import { ClientsPage } from '@renderer/pages/clients/ClientsPage'
import { UnitsPage } from '@renderer/pages/units/UnitsPage'
import { InvoicesPage } from '@renderer/pages/invoices/InvoicesPage'
import { InvoicePage } from '@renderer/pages/invoices/InvoicePage'
import { SettingsPage } from '@renderer/pages/settings/SettingsPage'

export type ScreenModule = {
  Component: ComponentType
}

type ScreenBase = {
  id: string
  label: string
  description?: string
  icon: IconName
  /** Sidebar group heading. Contiguous screens with the same section render together. */
  section?: string
  /** When false, the screen is routed but omitted from the sidebar. */
  sidebar?: boolean
}

type ScreenModuleSource =
  | { Component: ComponentType; load?: never }
  | { Component?: never; load: () => Promise<ScreenModule> }

type ScreenPath = { index: true; path?: never } | { index?: false; path: string }

export type AppScreen = ScreenBase & ScreenModuleSource & ScreenPath

/**
 * Register a screen here. It is added to the router and, in this order, to the sidebar.
 * Set `Component` to include it in the initial bundle, or `load` to code-split it.
 * A non-index `path` is the URL segment under `#/` (for example `path: 'customers'`).
 */
export const screens: AppScreen[] = [
  {
    id: 'home',
    index: true,
    label: 'Home',
    icon: 'home',
    Component: HomePage
  },
  {
    id: 'clients',
    path: 'clients',
    label: 'Clients',
    description: 'Manage client records.',
    icon: 'clients',
    Component: ClientsPage
  },
  {
    id: 'units',
    path: 'units',
    label: 'Units',
    description: 'Manage unit records.',
    icon: 'units',
    Component: UnitsPage
  },
  {
    id: 'invoices',
    path: 'invoices',
    label: 'Invoices',
    description: 'Create and review sales invoices.',
    icon: 'invoices',
    Component: InvoicesPage
  },
  {
    id: 'invoice-new',
    path: 'invoices/new',
    label: 'New invoice',
    description: 'Draft a sales invoice.',
    icon: 'invoices',
    sidebar: false,
    Component: InvoicePage
  },
  {
    id: 'invoice',
    path: 'invoices/:invoiceId',
    label: 'Invoice',
    description: 'Sales invoice.',
    icon: 'invoices',
    sidebar: false,
    Component: InvoicePage
  },
  {
    id: 'settings',
    path: 'settings',
    label: 'Settings',
    description: 'Appearance and application status.',
    icon: 'settings',
    Component: SettingsPage
  }
]

export type NavSection = {
  id: string
  sectionKey: string
  label?: string
  items: AppScreen[]
}

export function navSections(items: readonly AppScreen[]): NavSection[] {
  const sections: NavSection[] = []

  for (const item of items) {
    const sectionKey = item.section ?? ''
    const current = sections[sections.length - 1]

    if (current?.sectionKey === sectionKey) {
      current.items.push(item)
      continue
    }

    sections.push({
      id: `${sectionKey || 'main'}-${sections.length}`,
      sectionKey,
      label: item.section,
      items: [item]
    })
  }

  return sections
}

export function screenHref(screen: AppScreen): string {
  return screen.index ? '/' : `/${screen.path}`
}
