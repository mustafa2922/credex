import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import { formatRupees } from '../../../../core/money'
import type {
  InvoiceListStatus,
  InvoicePaymentStatusFilter,
  InvoiceStatus,
  InvoiceSummary
} from '../../../../shared/invoices'
import { paymentStatusLabel } from '../../../../shared/payments'
import { Icon } from '@renderer/components/icons/Icon'
import { Page } from '@renderer/components/layout/Page'
import { AlertToast, type AlertAction, type AlertTone } from '@renderer/components/ui/AlertToast'
import { Button } from '@renderer/components/ui/Button'
import { Modal } from '@renderer/components/ui/Modal'
import { SearchableSelect } from '@renderer/components/ui/SearchableSelect'
import styles from './InvoicesPage.module.css'

function ipcErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

function statusLabel(status: InvoiceStatus): string {
  if (status === 'issued') return 'Issued'
  if (status === 'void') return 'Trash'
  return 'Draft'
}

function statusClass(status: InvoiceStatus): string {
  if (status === 'issued') return styles.badgeIssued
  if (status === 'void') return styles.badgeVoid
  return styles.badgeDraft
}

function formatInvoiceStamp(value: string): { date: string; time: string } | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return {
    date: date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }),
    time: date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  }
}

type AlertState = {
  id: number
  title: string
  message: string
  tone: AlertTone
  actions?: AlertAction[]
}

type TrashModalProps = {
  invoice: InvoiceSummary
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

function TrashModal({ invoice, busy, onClose, onConfirm }: TrashModalProps): React.JSX.Element {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('A reason is required')
      return
    }
    if (trimmed.length > 200) {
      setError('Reason must be at most 200 characters')
      return
    }
    setError('')
    await onConfirm(trimmed)
  }

  return (
    <Modal labelledBy="trash-invoice-title" busy={busy} onClose={onClose}>
      <h2 id="trash-invoice-title" className={styles.modalTitle}>
        Trash invoice
      </h2>
      <p className={styles.modalMessage}>
        Move {invoice.number ?? 'this draft'} to trash? This can be reviewed later in Trash.
      </p>
      <form className={styles.modalForm} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label className={styles.modalField}>
          <span className={styles.modalLabel}>Reason</span>
          <textarea
            className={error ? styles.modalTextareaInvalid : styles.modalTextarea}
            value={reason}
            disabled={busy}
            rows={3}
            onChange={(event) => {
              setReason(event.target.value)
              setError('')
            }}
          />
          {error ? <span className={styles.fieldError}>{error}</span> : null}
        </label>
        <div className={styles.modalActions}>
          <Button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Trash
          </Button>
        </div>
      </form>
    </Modal>
  )
}

type ConfirmModalProps = {
  title: string
  message: string
  confirmLabel: string
  busy: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  busy,
  onClose,
  onConfirm
}: ConfirmModalProps): React.JSX.Element {
  return (
    <Modal labelledBy="invoices-confirm-title" busy={busy} onClose={onClose}>
      <h2 id="invoices-confirm-title" className={styles.modalTitle}>
        {title}
      </h2>
      <p className={styles.modalMessage}>{message}</p>
      <div className={styles.modalActions}>
        <Button type="button" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="primary" disabled={busy} onClick={() => void onConfirm()}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function InvoicesPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceListStatus>('all')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<InvoicePaymentStatusFilter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [trashTarget, setTrashTarget] = useState<InvoiceSummary | null>(null)
  const [reopenTarget, setReopenTarget] = useState<InvoiceSummary | null>(null)
  const [alert, setAlert] = useState<AlertState | null>(null)
  const alertIdRef = useRef(0)
  const requestId = useRef(0)

  const showAlert = useCallback(
    (message: string, title: string, tone: AlertTone, actions?: AlertAction[]): void => {
      alertIdRef.current += 1
      setAlert({ id: alertIdRef.current, title, message, tone, actions })
    },
    []
  )

  const refresh = useCallback(async (): Promise<void> => {
    const id = requestId.current + 1
    requestId.current = id
    try {
      const invoicesApi = window.api?.invoices
      const rows = invoicesApi
        ? await invoicesApi.list({
            search: search.trim() || undefined,
            status: statusFilter,
            payment_status: paymentStatusFilter
          })
        : await Promise.reject(new Error('Invoices are unavailable'))
      if (id !== requestId.current) return
      setInvoices(rows)
      setLoadError('')
    } catch (error) {
      if (id !== requestId.current) return
      setLoadError(ipcErrorMessage(error))
      setInvoices([])
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [search, statusFilter, paymentStatusFilter])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  const filtered =
    search.trim() !== '' || statusFilter !== 'all' || paymentStatusFilter !== 'all'
  const showEmpty = !loading && !loadError && invoices.length === 0 && !filtered
  const showNoResults = !loading && !loadError && invoices.length === 0 && filtered
  const actionBusy = busyId !== null

  function openInvoice(id: string): void {
    navigate(`/invoices/${id}`)
  }

  function stopRowActivation(event: MouseEvent): void {
    event.stopPropagation()
  }

  async function handleTrash(reason: string): Promise<void> {
    if (!trashTarget || !window.api?.invoices) return
    setBusyId(trashTarget.id)
    try {
      const voided = await window.api.invoices.void({ id: trashTarget.id, reason })
      setTrashTarget(null)
      await refresh()
      showAlert(
        voided.number ? `Invoice ${voided.number} moved to trash.` : 'Invoice moved to trash.',
        'Success',
        'success'
      )
    } catch (error) {
      showAlert(ipcErrorMessage(error), 'Invoice needs attention', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleReopen(): Promise<void> {
    if (!reopenTarget || !window.api?.invoices) return
    setBusyId(reopenTarget.id)
    try {
      const reopened = await window.api.invoices.reopen(reopenTarget.id)
      setReopenTarget(null)
      await refresh()
      showAlert(
        reopened.number
          ? `Invoice ${reopened.number} reopened as a draft.`
          : 'Invoice reopened as a draft.',
        'Success',
        'success'
      )
    } catch (error) {
      showAlert(ipcErrorMessage(error), 'Invoice needs attention', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleExport(invoice: InvoiceSummary): Promise<void> {
    if (!window.api?.invoices) return
    setBusyId(invoice.id)
    try {
      const exported = await window.api.invoices.exportPdf({ id: invoice.id })
      if (exported.saved) {
        showAlert(`Saved ${exported.filename}`, 'Success', 'success', [
          {
            label: 'Open file',
            onClick: () => void window.api?.settings.openPath(exported.filePath)
          },
          {
            label: 'Open folder',
            onClick: () => void window.api?.settings.showInFolder(exported.filePath)
          }
        ])
      }
    } catch (error) {
      showAlert(ipcErrorMessage(error), 'Could not export PDF', 'error', [
        {
          label: 'Change exports folder',
          onClick: () => navigate('/settings')
        }
      ])
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Page fullWidth hideDescription>
      <div className={styles.pageHeading}>
        <h2 className={styles.pageTitle}>Sales invoice</h2>
        <p className={styles.pageSubtitle}>Create and review sales invoices.</p>
      </div>

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
          <SearchableSelect
            className={styles.filterSelect}
            value={statusFilter}
            ariaLabel="Filter by status"
            placeholder="Status"
            searchPlaceholder="Search status"
            options={[
              { value: 'all', label: 'All' },
              { value: 'draft', label: 'Draft' },
              { value: 'issued', label: 'Issued' },
              { value: 'void', label: 'Trash' }
            ]}
            onChange={(next) => setStatusFilter(next as InvoiceListStatus)}
          />
          <SearchableSelect
            className={styles.filterSelect}
            value={paymentStatusFilter}
            ariaLabel="Filter by payment status"
            placeholder="Payment"
            searchPlaceholder="Search payment status"
            options={[
              { value: 'all', label: 'All payments' },
              { value: 'unpaid', label: 'Unpaid' },
              { value: 'partial', label: 'Partial' },
              { value: 'paid', label: 'Paid' }
            ]}
            onChange={(next) => setPaymentStatusFilter(next as InvoicePaymentStatusFilter)}
          />
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
                  <th scope="col">Date</th>
                  <th scope="col">Number</th>
                  <th scope="col">Client</th>
                  <th className={styles.num} scope="col">
                    Total
                  </th>
                  <th className={styles.num} scope="col">
                    Paid
                  </th>
                  <th className={styles.num} scope="col">
                    Due
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Payment</th>
                  <th className={styles.actionsCol} scope="col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const stamp = formatInvoiceStamp(invoice.created_at)
                  const issued = invoice.status === 'issued'
                  const exportable = invoice.status === 'issued' || invoice.status === 'void'
                  const rowBusy = busyId === invoice.id
                  return (
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
                      <td>
                        {stamp ? (
                          <div className={styles.stamp}>
                            <span className={styles.stampDate}>{stamp.date}</span>
                            <span className={styles.stampTime}>{stamp.time}</span>
                          </div>
                        ) : (
                          invoice.invoice_date
                        )}
                      </td>
                      <td>{invoice.number ?? 'Draft'}</td>
                      <td>{invoice.client_name}</td>
                      <td className={styles.num}>{formatRupees(invoice.total)}</td>
                      <td className={styles.num}>{formatRupees(invoice.paid)}</td>
                      <td className={styles.num}>{formatRupees(invoice.due)}</td>
                      <td>
                        <span className={statusClass(invoice.status)}>
                          {statusLabel(invoice.status)}
                        </span>
                      </td>
                      <td>
                        {invoice.status === 'issued' ? (
                          <span
                            className={
                              invoice.payment_status === 'paid'
                                ? styles.badgePaid
                                : invoice.payment_status === 'partial'
                                  ? styles.badgePartial
                                  : styles.badgeUnpaid
                            }
                          >
                            {paymentStatusLabel(invoice.payment_status)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={styles.actionsCol} onClick={stopRowActivation}>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.actionButton}
                            disabled={!issued || actionBusy}
                            aria-label={`Trash ${invoice.number ?? 'draft'}`}
                            title="Trash"
                            onClick={() => setTrashTarget(invoice)}
                          >
                            <Icon name="trash" width={15} height={15} />
                          </button>
                          <button
                            type="button"
                            className={styles.actionButton}
                            disabled={!issued || actionBusy}
                            aria-label={`Reopen ${invoice.number ?? 'invoice'}`}
                            title="Reopen"
                            onClick={() => setReopenTarget(invoice)}
                          >
                            <Icon name="reopen" width={15} height={15} />
                          </button>
                          <button
                            type="button"
                            className={styles.actionButton}
                            disabled={!exportable || actionBusy}
                            aria-label={`Export ${invoice.number ?? 'invoice'}`}
                            title="Export PDF"
                            onClick={() => void handleExport(invoice)}
                          >
                            <Icon name="export" width={15} height={15} />
                            {rowBusy ? <span className={styles.visuallyHidden}>Working…</span> : null}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {trashTarget ? (
        <TrashModal
          invoice={trashTarget}
          busy={busyId === trashTarget.id}
          onClose={() => {
            if (busyId !== trashTarget.id) setTrashTarget(null)
          }}
          onConfirm={handleTrash}
        />
      ) : null}

      {reopenTarget ? (
        <ConfirmModal
          title="Reopen invoice"
          message={`Reopen ${reopenTarget.number ?? 'this invoice'} as a draft?`}
          confirmLabel="Reopen"
          busy={busyId === reopenTarget.id}
          onClose={() => {
            if (busyId !== reopenTarget.id) setReopenTarget(null)
          }}
          onConfirm={handleReopen}
        />
      ) : null}

      {alert ? (
        <AlertToast
          key={alert.id}
          title={alert.title}
          message={alert.message}
          tone={alert.tone}
          actions={alert.actions}
          onClose={() => setAlert(null)}
        />
      ) : null}
    </Page>
  )
}
