import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { formatRupees } from '../../../../core/money'
import type { InvoiceListStatus, InvoiceStatus, InvoiceSummary } from '../../../../shared/invoices'
import { Page } from '@renderer/components/layout/Page'
import { Button } from '@renderer/components/ui/Button'
import styles from './InvoicesPage.module.css'

function ipcErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

function statusLabel(status: InvoiceStatus): string {
  if (status === 'issued') return 'Issued'
  if (status === 'void') return 'Void'
  return 'Draft'
}

function statusClass(status: InvoiceStatus): string {
  if (status === 'issued') return styles.badgeIssued
  if (status === 'void') return styles.badgeVoid
  return styles.badgeDraft
}

export function InvoicesPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceListStatus>('all')
  const requestId = useRef(0)

  useEffect(() => {
    const id = requestId.current + 1
    requestId.current = id
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const invoicesApi = window.api?.invoices
        const rows = invoicesApi
          ? await invoicesApi.list({
              search: search.trim() || undefined,
              status: statusFilter
            })
          : await Promise.reject(new Error('Invoices are unavailable'))
        if (cancelled || id !== requestId.current) return
        setInvoices(rows)
        setLoadError('')
      } catch (error) {
        if (cancelled || id !== requestId.current) return
        setLoadError(ipcErrorMessage(error))
        setInvoices([])
      } finally {
        if (!cancelled && id === requestId.current) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [search, statusFilter])

  const filtered = search.trim() !== '' || statusFilter !== 'all'
  const showEmpty = !loading && !loadError && invoices.length === 0 && !filtered
  const showNoResults = !loading && !loadError && invoices.length === 0 && filtered

  function openInvoice(id: string): void {
    navigate(`/invoices/${id}`)
  }

  return (
    <Page fullWidth>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search number or client"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search invoices"
          />
          <select
            className={styles.select}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as InvoiceListStatus)}
            aria-label="Filter by status"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="void">Void</option>
          </select>
        </div>
        <Button
          variant="primary"
          disabled={!window.api?.invoices}
          onClick={() => navigate('/invoices/new')}
        >
          New invoice
        </Button>
      </div>

      <section className={styles.card} aria-labelledby="invoices-table-heading">
        <h2 id="invoices-table-heading" className={styles.visuallyHidden}>
          Invoices
        </h2>
        {loadError ? <p className={styles.stateMessage}>{loadError}</p> : null}
        {loading ? <p className={styles.stateMessage}>Loading…</p> : null}
        {showEmpty ? (
          <p className={styles.stateMessage}>
            No invoices yet. Create your first invoice to get started.
          </p>
        ) : null}
        {showNoResults ? (
          <p className={styles.stateMessage}>No invoices match your search or filters.</p>
        ) : null}
        {!loading && !loadError && invoices.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Number</th>
                  <th scope="col">Date</th>
                  <th scope="col">Client</th>
                  <th className={styles.num} scope="col">
                    Total
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className={styles.clickable}
                    tabIndex={0}
                    onClick={() => openInvoice(invoice.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openInvoice(invoice.id)
                      }
                    }}
                  >
                    <td>{invoice.number ?? 'Draft'}</td>
                    <td>{invoice.invoice_date}</td>
                    <td>{invoice.client_name}</td>
                    <td className={styles.num}>{formatRupees(invoice.total)}</td>
                    <td>
                      <span className={statusClass(invoice.status)}>
                        {statusLabel(invoice.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </Page>
  )
}
