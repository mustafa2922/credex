import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { formatRupees } from '../../../../core/money'
import { invoiceImageUrl } from '../../../../shared/invoices'
import { ipcErrorMessage } from '../../../../shared/ipcError'
import type {
  CreatePaymentResult,
  PaymentListStatus,
  PaymentRecordStatus,
  PaymentSummary
} from '../../../../shared/payments'
import { paymentMethodLabel, summarizePaymentAllocations } from '../../../../shared/payments'
import { NewPaymentModal } from '@renderer/components/payments/NewPaymentModal'
import { Icon } from '@renderer/components/icons/Icon'
import { Page } from '@renderer/components/layout/Page'
import { Money } from '@renderer/components/ui/Money'
import { AlertToast, type AlertTone } from '@renderer/components/ui/AlertToast'
import { Button } from '@renderer/components/ui/Button'
import { ImageViewer } from '@renderer/components/ui/ImageViewer'
import { Modal } from '@renderer/components/ui/Modal'
import { Pagination } from '@renderer/components/ui/Pagination'
import { SearchableSelect } from '@renderer/components/ui/SearchableSelect'
import { useTablePagination } from '@renderer/hooks/useTablePagination'
import styles from './PaymentsPage.module.css'

type PaymentsLocationState = {
  invoiceId?: string
  clientId?: string
}

type AlertState = {
  id: number
  title: string
  message: string
  tone: AlertTone
}

function statusLabel(status: PaymentRecordStatus): string {
  return status === 'void' ? 'Trash' : 'Active'
}

function statusClass(status: PaymentRecordStatus): string {
  return status === 'void' ? styles.badgeVoid : styles.badgeActive
}

function formatPaymentStamp(value: string): { date: string; time: string } | null {
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

type VoidModalProps = {
  payment: PaymentSummary
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

function VoidModal({ payment, busy, onClose, onConfirm }: VoidModalProps): React.JSX.Element {
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

  const label = payment.invoice_number ?? formatRupees(payment.amount)

  return (
    <Modal labelledBy="void-payment-title" busy={busy} onClose={onClose}>
      <h2 id="void-payment-title" className={styles.modalTitle}>
        Trash payment
      </h2>
      <p className={styles.modalMessage}>
        Move payment for {label} to trash? This can be reviewed later in Trash.
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

export function PaymentsPage(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as PaymentsLocationState | null

  const [payments, setPayments] = useState<PaymentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PaymentListStatus>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<PaymentSummary | null>(null)
  const [viewerImages, setViewerImages] = useState<string[] | null>(null)
  const [newPaymentOpen, setNewPaymentOpen] = useState(false)
  const [newPaymentClientId, setNewPaymentClientId] = useState('')
  const [newPaymentInvoiceId, setNewPaymentInvoiceId] = useState('')
  const [alert, setAlert] = useState<AlertState | null>(null)
  const alertIdRef = useRef(0)
  const requestId = useRef(0)
  const preselectApplied = useRef(false)

  const showAlert = useCallback((message: string, title: string, tone: AlertTone): void => {
    alertIdRef.current += 1
    setAlert({ id: alertIdRef.current, title, message, tone })
  }, [])

  const pagination = useTablePagination(payments, `${search}|${statusFilter}`)

  const refresh = useCallback(async (): Promise<void> => {
    const id = requestId.current + 1
    requestId.current = id
    try {
      const paymentsApi = window.api?.payments
      const rows = paymentsApi
        ? await paymentsApi.list({
            search: search.trim() || undefined,
            status: statusFilter
          })
        : await Promise.reject(new Error('Payments are unavailable'))
      if (id !== requestId.current) return
      setPayments(rows)
      setLoadError('')
    } catch (error) {
      if (id !== requestId.current) return
      setLoadError(ipcErrorMessage(error))
      setPayments([])
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true)
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  useEffect(() => {
    const invoiceId = locationState?.invoiceId
    const clientId = locationState?.clientId
    if ((!invoiceId && !clientId) || preselectApplied.current) return
    preselectApplied.current = true
    setNewPaymentClientId(clientId ?? '')
    setNewPaymentInvoiceId(invoiceId ?? '')
    setNewPaymentOpen(true)
  }, [locationState])

  const filtered = search.trim() !== '' || statusFilter !== 'all'
  const showEmpty = !loading && !loadError && payments.length === 0 && !filtered
  const showNoResults = !loading && !loadError && payments.length === 0 && filtered
  const actionBusy = busyId !== null

  function openInvoice(invoiceId: string): void {
    navigate(`/invoices/${invoiceId}`)
  }

  function stopRowActivation(event: MouseEvent): void {
    event.stopPropagation()
  }

  function openAttachmentViewer(payment: PaymentSummary): void {
    if (!payment.attachment_path) return
    setViewerImages([invoiceImageUrl(payment.attachment_path)])
  }

  function openNewPayment(clientId = '', invoiceId = ''): void {
    setNewPaymentClientId(clientId)
    setNewPaymentInvoiceId(invoiceId)
    setNewPaymentOpen(true)
  }

  async function handleCreated(result: CreatePaymentResult): Promise<void> {
    setNewPaymentOpen(false)
    setNewPaymentClientId('')
    setNewPaymentInvoiceId('')
    await refresh()
    showAlert(
      summarizePaymentAllocations(result.created, formatRupees),
      'Payment recorded',
      'success'
    )
  }

  async function handleVoid(reason: string): Promise<void> {
    if (!voidTarget || !window.api?.payments) return
    setBusyId(voidTarget.id)
    try {
      await window.api.payments.void({ id: voidTarget.id, reason })
      setVoidTarget(null)
      await refresh()
      showAlert('Payment moved to trash.', 'Success', 'success')
    } catch (error) {
      showAlert(ipcErrorMessage(error), 'Payment needs attention', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Page fullWidth hideDescription>
      <div className={styles.pageHeading}>
        <h2 className={styles.pageTitle}>Payments</h2>
        <p className={styles.pageSubtitle}>Record and review invoice payments.</p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search invoice or client"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search payments"
          />
          <SearchableSelect
            className={styles.filterSelect}
            value={statusFilter}
            ariaLabel="Filter by status"
            placeholder="Status"
            searchPlaceholder="Search status"
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'void', label: 'Trash' }
            ]}
            onChange={(next) => setStatusFilter(next as PaymentListStatus)}
          />
        </div>
        <Button
          variant="primary"
          disabled={!window.api?.payments || actionBusy}
          onClick={() => openNewPayment()}
        >
          New payment
        </Button>
      </div>

      <section className={styles.card} aria-labelledby="payments-table-heading">
        <h2 id="payments-table-heading" className={styles.visuallyHidden}>
          Payments
        </h2>
        {loadError ? <p className={styles.stateMessage}>{loadError}</p> : null}
        {loading ? <p className={styles.stateMessage}>Loading…</p> : null}
        {showEmpty ? (
          <p className={styles.stateMessage}>
            No payments yet. Record a payment against an issued invoice to get started.
          </p>
        ) : null}
        {showNoResults ? (
          <p className={styles.stateMessage}>No payments match your search or filters.</p>
        ) : null}
        {!loading && !loadError && payments.length > 0 ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Client</th>
                    <th scope="col">Invoice</th>
                    <th scope="col">Method</th>
                    <th className={styles.num} scope="col">
                      Amount
                    </th>
                    <th scope="col">Status</th>
                    <th className={styles.actionsCol} scope="col">
                      <span className={styles.visuallyHidden}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.rows.map((payment) => {
                    const active = payment.status === 'active'
                    const rowBusy = busyId === payment.id
                    const stamp = formatPaymentStamp(payment.created_at)
                    return (
                      <tr
                        key={payment.id}
                        className={styles.clickable}
                        tabIndex={0}
                        onClick={() => openInvoice(payment.invoice_id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openInvoice(payment.invoice_id)
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
                            payment.payment_date
                          )}
                        </td>
                        <td>{payment.client_name}</td>
                        <td>{payment.invoice_number ?? '—'}</td>
                        <td>{paymentMethodLabel(payment.method)}</td>
                        <td className={styles.num}>
                          <Money paisa={payment.amount} />
                        </td>
                        <td>
                          <span className={statusClass(payment.status)}>
                            {statusLabel(payment.status)}
                          </span>
                        </td>
                        <td className={styles.actionsCol} onClick={stopRowActivation}>
                          <div className={styles.actions}>
                            {payment.attachment_path ? (
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.imageButton}`}
                                aria-label="View attachment"
                                title="View attachment"
                                onClick={() => openAttachmentViewer(payment)}
                              >
                                <Icon name="image" width={17} height={17} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={styles.actionButton}
                              disabled={!active || actionBusy}
                              aria-label="Trash payment"
                              title="Trash"
                              onClick={() => setVoidTarget(payment)}
                            >
                              <Icon name="trash" width={15} height={15} />
                              {rowBusy ? (
                                <span className={styles.visuallyHidden}>Working…</span>
                              ) : null}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pagination.page}
              total={pagination.total}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
            />
          </>
        ) : null}
      </section>

      {newPaymentOpen ? (
        <NewPaymentModal
          initialClientId={newPaymentClientId}
          initialInvoiceId={newPaymentInvoiceId}
          onClose={() => {
            setNewPaymentOpen(false)
            setNewPaymentClientId('')
            setNewPaymentInvoiceId('')
          }}
          onCreated={handleCreated}
          onError={(message) => showAlert(message, 'Payment needs attention', 'error')}
        />
      ) : null}

      {voidTarget ? (
        <VoidModal
          payment={voidTarget}
          busy={busyId === voidTarget.id}
          onClose={() => {
            if (busyId !== voidTarget.id) setVoidTarget(null)
          }}
          onConfirm={handleVoid}
        />
      ) : null}

      {viewerImages ? (
        <ImageViewer
          images={viewerImages}
          title="Payment attachment"
          onClose={() => setViewerImages(null)}
        />
      ) : null}

      {alert ? (
        <AlertToast
          key={alert.id}
          title={alert.title}
          message={alert.message}
          tone={alert.tone}
          onClose={() => setAlert(null)}
        />
      ) : null}
    </Page>
  )
}
