import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { formatRatePaisa, formatRupees, parseRatePaisa } from '../../../../core/money'
import { invoiceImageUrl } from '../../../../shared/invoices'
import type { InvoiceSummary } from '../../../../shared/invoices'
import type {
  CreatePaymentInput,
  PaymentListStatus,
  PaymentMethod,
  PaymentRecordStatus,
  PaymentSummary
} from '../../../../shared/payments'
import { isPaymentDate, paymentMethodLabel } from '../../../../shared/payments'
import { Icon } from '@renderer/components/icons/Icon'
import { Page } from '@renderer/components/layout/Page'
import { AlertToast, type AlertTone } from '@renderer/components/ui/AlertToast'
import { Button } from '@renderer/components/ui/Button'
import { ImageViewer } from '@renderer/components/ui/ImageViewer'
import { Modal } from '@renderer/components/ui/Modal'
import { SearchableSelect } from '@renderer/components/ui/SearchableSelect'
import styles from './PaymentsPage.module.css'

type PaymentsLocationState = {
  invoiceId?: string
}

type AlertState = {
  id: number
  title: string
  message: string
  tone: AlertTone
}

type NewPaymentFieldErrors = {
  invoiceId?: string
  amount?: string
  method?: string
  paymentDate?: string
}

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'cheque', 'online']

function ipcErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

function todayLocal(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
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

function invoiceSelectOptions(
  issued: InvoiceSummary[],
  selectedId: string
): { value: string; label: string; description?: string }[] {
  const payable = issued.filter((invoice) => invoice.due > 0)
  const selected = issued.find((invoice) => invoice.id === selectedId)
  const rows =
    selected && !payable.some((invoice) => invoice.id === selected.id)
      ? [...payable, selected]
      : payable
  return rows.map((invoice) => ({
    value: invoice.id,
    label: invoice.number ?? 'Draft',
    description: `${invoice.client_name} · due ${formatRupees(invoice.due)}`
  }))
}

function validateNewPayment(
  invoiceId: string,
  amountText: string,
  due: number,
  method: PaymentMethod | '',
  paymentDate: string
): { errors: NewPaymentFieldErrors; amountPaisa?: number } {
  const errors: NewPaymentFieldErrors = {}
  if (!invoiceId) {
    errors.invoiceId = 'Invoice is required'
  }

  let amountPaisa: number | undefined
  if (!amountText.trim()) {
    errors.amount = 'Amount is required'
  } else {
    try {
      amountPaisa = parseRatePaisa(amountText)
      if (amountPaisa <= 0) {
        errors.amount = 'Amount must be greater than zero'
        amountPaisa = undefined
      } else if (invoiceId && amountPaisa > due) {
        errors.amount = `Amount cannot exceed due ${formatRupees(due)}`
        amountPaisa = undefined
      }
    } catch {
      errors.amount = 'Amount must be a number with up to 2 decimal places'
    }
  }

  if (!method) {
    errors.method = 'Method is required'
  }
  if (!isPaymentDate(paymentDate)) {
    errors.paymentDate = 'Enter a valid date'
  }

  return { errors, amountPaisa }
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

type NewPaymentModalProps = {
  busy: boolean
  issuedInvoices: InvoiceSummary[]
  loadingInvoices: boolean
  initialInvoiceId: string
  onClose: () => void
  onCreated: () => Promise<void>
  onError: (message: string) => void
}

function NewPaymentModal({
  busy,
  issuedInvoices,
  loadingInvoices,
  initialInvoiceId,
  onClose,
  onCreated,
  onError
}: NewPaymentModalProps): React.JSX.Element {
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [paymentDate, setPaymentDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null)
  const [errors, setErrors] = useState<NewPaymentFieldErrors>({})
  const [pickingAttachment, setPickingAttachment] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setInvoiceId(initialInvoiceId)
  }, [initialInvoiceId])

  const selectedInvoice = useMemo(
    () => issuedInvoices.find((invoice) => invoice.id === invoiceId),
    [issuedInvoices, invoiceId]
  )
  const due = selectedInvoice?.due ?? 0

  const invoiceOptions = useMemo(
    () => invoiceSelectOptions(issuedInvoices, invoiceId),
    [issuedInvoices, invoiceId]
  )

  async function handlePickAttachment(): Promise<void> {
    if (!window.api?.payments || pickingAttachment) return
    setPickingAttachment(true)
    try {
      const path = await window.api.payments.pickAttachment()
      if (path) setAttachmentPath(path)
    } catch (error) {
      onError(ipcErrorMessage(error))
    } finally {
      setPickingAttachment(false)
    }
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!window.api?.payments) return
    const next = validateNewPayment(invoiceId, amount, due, method, paymentDate)
    if (Object.keys(next.errors).length > 0 || next.amountPaisa === undefined) {
      setErrors(next.errors)
      const message = Object.values(next.errors).filter(Boolean).join(' ')
      onError(message || 'Check the payment details')
      return
    }
    setErrors({})

    const input: CreatePaymentInput = {
      invoice_id: invoiceId,
      amount: next.amountPaisa,
      method: method as PaymentMethod,
      payment_date: paymentDate,
      note: note.trim() || null,
      attachment_path: attachmentPath
    }

    setSubmitting(true)
    try {
      await window.api.payments.create(input)
      await onCreated()
    } catch (error) {
      onError(ipcErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const modalBusy = busy || submitting

  return (
    <Modal labelledBy="new-payment-title" size="wide" busy={modalBusy} onClose={onClose}>
      <h2 id="new-payment-title" className={styles.modalTitle}>
        New payment
      </h2>
      <form className={styles.modalForm} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label className={styles.modalField}>
          <span className={styles.modalLabel}>Invoice</span>
          <SearchableSelect
            value={invoiceId}
            disabled={modalBusy || loadingInvoices}
            ariaLabel="Invoice"
            placeholder={loadingInvoices ? 'Loading…' : 'Select invoice'}
            searchPlaceholder="Search invoice or client"
            options={invoiceOptions}
            invalid={Boolean(errors.invoiceId)}
            onChange={(next) => {
              setInvoiceId(next)
              setErrors((current) => ({ ...current, invoiceId: undefined, amount: undefined }))
            }}
          />
        </label>

        <label className={styles.modalField}>
          <span className={styles.modalLabel}>Amount</span>
          <div className={styles.amountRow}>
            <input
              className={errors.amount ? styles.inputInvalid : styles.input}
              value={amount}
              disabled={modalBusy}
              inputMode="decimal"
              aria-label="Payment amount"
              onChange={(event) => {
                setAmount(event.target.value)
                setErrors((current) => ({ ...current, amount: undefined }))
              }}
            />
            <Button
              type="button"
              disabled={modalBusy || !selectedInvoice || due <= 0}
              onClick={() => {
                if (!selectedInvoice) return
                setAmount(formatRatePaisa(selectedInvoice.due))
                setErrors((current) => ({ ...current, amount: undefined }))
              }}
            >
              Pay full due
            </Button>
          </div>
        </label>

        <label className={styles.modalField}>
          <span className={styles.modalLabel}>Method</span>
          <SearchableSelect
            className={styles.filterSelect}
            value={method}
            disabled={modalBusy}
            invalid={Boolean(errors.method)}
            ariaLabel="Payment method"
            placeholder="Method"
            searchPlaceholder="Search method"
            options={PAYMENT_METHODS.map((value) => ({
              value,
              label: paymentMethodLabel(value)
            }))}
            onChange={(next) => {
              setMethod(next as PaymentMethod)
              setErrors((current) => ({ ...current, method: undefined }))
            }}
          />
        </label>

        <label className={styles.modalField}>
          <span className={styles.modalLabel}>Date</span>
          <input
            type="date"
            className={errors.paymentDate ? styles.inputInvalid : styles.input}
            value={paymentDate}
            disabled={modalBusy}
            onChange={(event) => {
              setPaymentDate(event.target.value)
              setErrors((current) => ({ ...current, paymentDate: undefined }))
            }}
          />
        </label>

        <label className={styles.modalField}>
          <span className={styles.modalLabel}>Note</span>
          <input
            className={styles.input}
            value={note}
            disabled={modalBusy}
            placeholder="Optional"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <div className={styles.modalField}>
          <span className={styles.modalLabel}>Attachment</span>
          <div className={styles.attachmentRow}>
            <Button
              type="button"
              disabled={modalBusy || pickingAttachment}
              onClick={() => void handlePickAttachment()}
            >
              {attachmentPath ? 'Change file' : 'Choose file'}
            </Button>
            {attachmentPath ? (
              <>
                <img
                  className={styles.attachmentThumb}
                  src={invoiceImageUrl(attachmentPath)}
                  alt=""
                />
                <button
                  type="button"
                  className={styles.imageClear}
                  disabled={modalBusy}
                  aria-label="Remove attachment"
                  onClick={() => setAttachmentPath(null)}
                >
                  <Icon name="close" width={14} height={14} />
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className={styles.modalActions}>
          <Button type="button" disabled={modalBusy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={modalBusy || loadingInvoices}>
            Save
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
  const [newPaymentInvoiceId, setNewPaymentInvoiceId] = useState('')
  const [issuedInvoices, setIssuedInvoices] = useState<InvoiceSummary[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [alert, setAlert] = useState<AlertState | null>(null)
  const alertIdRef = useRef(0)
  const requestId = useRef(0)
  const preselectApplied = useRef(false)

  const showAlert = useCallback((message: string, title: string, tone: AlertTone): void => {
    alertIdRef.current += 1
    setAlert({ id: alertIdRef.current, title, message, tone })
  }, [])

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

  const loadIssuedInvoices = useCallback(async (): Promise<void> => {
    if (!window.api?.invoices) return
    setLoadingInvoices(true)
    try {
      const rows = await window.api.invoices.list({ status: 'issued' })
      setIssuedInvoices(rows)
    } catch (error) {
      showAlert(ipcErrorMessage(error), 'Invoice list needs attention', 'error')
      setIssuedInvoices([])
    } finally {
      setLoadingInvoices(false)
    }
  }, [showAlert])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  useEffect(() => {
    const invoiceId = locationState?.invoiceId
    if (!invoiceId || preselectApplied.current) return
    preselectApplied.current = true
    setNewPaymentInvoiceId(invoiceId)
    setNewPaymentOpen(true)
  }, [locationState])

  useEffect(() => {
    if (!newPaymentOpen) return
    void loadIssuedInvoices()
  }, [newPaymentOpen, loadIssuedInvoices])

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

  function openNewPayment(invoiceId = ''): void {
    setNewPaymentInvoiceId(invoiceId)
    setNewPaymentOpen(true)
  }

  async function handleCreated(): Promise<void> {
    setNewPaymentOpen(false)
    setNewPaymentInvoiceId('')
    await refresh()
    showAlert('Payment recorded successfully.', 'Success', 'success')
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
                {payments.map((payment) => {
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
                      <td className={styles.num}>{formatRupees(payment.amount)}</td>
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

      {newPaymentOpen ? (
        <NewPaymentModal
          busy={false}
          issuedInvoices={issuedInvoices}
          loadingInvoices={loadingInvoices}
          initialInvoiceId={newPaymentInvoiceId}
          onClose={() => {
            setNewPaymentOpen(false)
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