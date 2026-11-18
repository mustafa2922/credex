import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent
} from 'react'
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router'
import {
  formatPaisa,
  formatQuantityThousandths,
  formatRatePaisa,
  formatRupees,
  invoiceTotalPaisa,
  lineTotalPaisa,
  parseQuantityThousandths,
  parseRatePaisa
} from '../../../../core/money'
import type { Client } from '../../../../shared/clients'
import {
  INVOICE_IMAGE_NAME,
  invoiceImageUrl,
  isInvoiceDate,
  type InvoiceDetail,
  type InvoiceStatus,
  type SaveInvoiceInput,
  type SaveInvoiceLine
} from '../../../../shared/invoices'
import {
  isPaymentDate,
  paymentMethodLabel,
  paymentStatusLabel,
  type CreatePaymentInput,
  type Payment,
  type PaymentMethod,
  type PaymentRecordStatus,
  type PaymentStatus
} from '../../../../shared/payments'
import type { Unit } from '../../../../shared/units'
import { Icon } from '@renderer/components/icons/Icon'
import { Page } from '@renderer/components/layout/Page'
import { AlertToast, type AlertAction, type AlertTone } from '@renderer/components/ui/AlertToast'
import { Button } from '@renderer/components/ui/Button'
import { ImageViewer } from '@renderer/components/ui/ImageViewer'
import { Modal } from '@renderer/components/ui/Modal'
import { SearchableSelect } from '@renderer/components/ui/SearchableSelect'
import styles from './InvoicePage.module.css'

type LineDraft = {
  key: string
  persisted: boolean
  name: string
  imagePath: string | null
  unitId: string
  unitName: string
  quantity: string
  rate: string
}

type EditorState = {
  clientId: string
  invoiceDate: string
  lines: LineDraft[]
}

type LineError = {
  name?: string
  unit?: string
  quantity?: string
  rate?: string
  image?: string
}

type EditorErrors = {
  client?: string
  date?: string
  form?: string
  lines: Record<string, LineError>
}

type Choice = {
  id: string
  name: string
  inactive: boolean
}

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'cheque', 'online']

function todayLocal(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function blankLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    persisted: false,
    name: '',
    imagePath: null,
    unitId: '',
    unitName: '',
    quantity: '',
    rate: ''
  }
}

function blankEditor(): EditorState {
  return { clientId: '', invoiceDate: todayLocal(), lines: [blankLine()] }
}

function emptyErrors(): EditorErrors {
  return { lines: {} }
}

function ipcErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

function firstErrorMessage(errors: EditorErrors): string | null {
  if (errors.form) return errors.form
  if (errors.client) return errors.client
  if (errors.date) return errors.date
  for (const lineError of Object.values(errors.lines)) {
    if (lineError.name) return lineError.name
    if (lineError.unit) return lineError.unit
    if (lineError.quantity) return lineError.quantity
    if (lineError.rate) return lineError.rate
    if (lineError.image) return lineError.image
  }
  return null
}

function readArrivalError(state: unknown): string {
  if (!state || typeof state !== 'object' || !('formError' in state)) return ''
  const message = (state as { formError?: unknown }).formError
  return typeof message === 'string' ? message : ''
}

type ArrivalToast = {
  title: string
  message: string
  tone: AlertTone
}

function readArrivalToast(state: unknown): ArrivalToast | null {
  if (!state || typeof state !== 'object' || !('toast' in state)) return null
  const toast = (state as { toast?: unknown }).toast
  if (!toast || typeof toast !== 'object') return null
  const { title, message, tone } = toast as {
    title?: unknown
    message?: unknown
    tone?: unknown
  }
  if (typeof title !== 'string' || typeof message !== 'string') return null
  if (tone !== 'success' && tone !== 'error') return null
  return { title, message, tone }
}

function toEditor(invoice: InvoiceDetail): EditorState {
  return {
    clientId: invoice.client_id,
    invoiceDate: invoice.invoice_date,
    lines: invoice.lines.map((line) => ({
      key: line.id,
      persisted: true,
      name: line.name,
      imagePath: line.image_path,
      unitId: line.unit_id,
      unitName: line.unit_name,
      quantity: formatQuantityThousandths(line.quantity),
      rate: formatRatePaisa(line.rate)
    }))
  }
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

function invoicePaymentStatusClass(status: PaymentStatus): string {
  if (status === 'paid') return styles.badgePaid
  if (status === 'partial') return styles.badgePartial
  return styles.badgeUnpaid
}

function paymentRecordStatusLabel(status: PaymentRecordStatus): string {
  return status === 'void' ? 'Trash' : 'Active'
}

function paymentRecordStatusClass(status: PaymentRecordStatus): string {
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

type AddPaymentFieldErrors = {
  amount?: string
  method?: string
  paymentDate?: string
}

function validateAddPayment(
  amountText: string,
  due: number,
  method: PaymentMethod | '',
  paymentDate: string
): { errors: AddPaymentFieldErrors; amountPaisa?: number } {
  const errors: AddPaymentFieldErrors = {}
  let amountPaisa: number | undefined

  if (!amountText.trim()) {
    errors.amount = 'Amount is required'
  } else {
    try {
      amountPaisa = parseRatePaisa(amountText)
      if (amountPaisa <= 0) {
        errors.amount = 'Amount must be greater than zero'
        amountPaisa = undefined
      } else if (amountPaisa > due) {
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

function lineTotalAmount(line: LineDraft): string | null {
  try {
    return formatPaisa(
      lineTotalPaisa(parseRatePaisa(line.rate), parseQuantityThousandths(line.quantity))
    )
  } catch {
    return null
  }
}

function invoiceTotalAmount(lines: LineDraft[]): string | null {
  const totals: number[] = []
  for (const line of lines) {
    try {
      totals.push(
        lineTotalPaisa(parseRatePaisa(line.rate), parseQuantityThousandths(line.quantity))
      )
    } catch {
      // Skip incomplete rows; show the sum of complete ones.
    }
  }
  if (totals.length === 0) return lines.length === 0 ? formatPaisa(0) : null
  return formatPaisa(invoiceTotalPaisa(totals))
}

function MoneyReadout({
  amount,
  emphasize = false
}: {
  amount: string | null
  emphasize?: boolean
}): React.JSX.Element {
  return (
    <div className={emphasize ? styles.moneyFieldStrong : styles.moneyField} aria-live="polite">
      <span className={styles.moneyCurrency}>Rs</span>
      <span className={amount ? styles.moneyAmount : styles.moneyAmountEmpty}>{amount ?? ''}</span>
    </div>
  )
}

function removedImages(lines: LineDraft[], discarded: string[]): string[] {
  const used = new Set(lines.flatMap((line) => (line.imagePath ? [line.imagePath] : [])))
  return discarded.filter((image) => !used.has(image))
}

function unitChoices(line: LineDraft, units: Unit[]): Choice[] {
  const options = units.map((unit) => ({ id: unit.id, name: unit.name, inactive: false }))
  if (line.unitId && !options.some((unit) => unit.id === line.unitId)) {
    options.push({ id: line.unitId, name: line.unitName || 'Unit', inactive: true })
  }
  return options
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
    <Modal labelledBy="invoice-confirm-title" busy={busy} onClose={onClose}>
      <h2 id="invoice-confirm-title" className={styles.modalTitle}>
        {title}
      </h2>
      <p className={styles.confirmMessage}>{message}</p>
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

type VoidModalProps = {
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

function VoidModal({ busy, onClose, onConfirm }: VoidModalProps): React.JSX.Element {
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
    try {
      await onConfirm(trimmed)
    } catch (submitError) {
      setError(ipcErrorMessage(submitError))
    }
  }

  return (
    <Modal labelledBy="void-invoice-title" busy={busy} onClose={onClose}>
      <h2 id="void-invoice-title" className={styles.modalTitle}>
        Trash invoice
      </h2>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label className={styles.field}>
          <span className={styles.label}>Reason</span>
          <textarea
            className={error ? styles.textareaInvalid : styles.textarea}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            rows={4}
            autoFocus
            disabled={busy}
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

type ExportModalProps = {
  busy: boolean
  onClose: () => void
  onExport: (hideRates: boolean) => Promise<void>
}

function ExportModal({ busy, onClose, onExport }: ExportModalProps): React.JSX.Element {
  const [hideRates, setHideRates] = useState(false)

  return (
    <Modal labelledBy="export-invoice-title" busy={busy} onClose={onClose}>
      <h2 id="export-invoice-title" className={styles.modalTitle}>
        Export PDF
      </h2>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={hideRates}
          onChange={(event) => setHideRates(event.target.checked)}
          disabled={busy}
        />
        Hide rates
      </label>
      <div className={styles.modalActions}>
        <Button type="button" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={() => void onExport(hideRates)}
        >
          Export
        </Button>
      </div>
    </Modal>
  )
}

type AddPaymentModalProps = {
  invoiceId: string
  invoiceNumber: string | null
  clientName: string
  due: number
  busy: boolean
  onClose: () => void
  onCreated: () => Promise<void>
  onError: (message: string) => void
}

function AddPaymentModal({
  invoiceId,
  invoiceNumber,
  clientName,
  due,
  busy,
  onClose,
  onCreated,
  onError
}: AddPaymentModalProps): React.JSX.Element {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [paymentDate, setPaymentDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null)
  const [errors, setErrors] = useState<AddPaymentFieldErrors>({})
  const [pickingAttachment, setPickingAttachment] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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
    const next = validateAddPayment(amount, due, method, paymentDate)
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
    <Modal labelledBy="add-payment-title" size="wide" busy={modalBusy} onClose={onClose}>
      <h2 id="add-payment-title" className={styles.modalTitle}>
        New payment
      </h2>
      <form className={styles.modalForm} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label className={styles.modalField}>
          <span className={styles.modalLabel}>Invoice</span>
          <SearchableSelect
            value={invoiceId}
            disabled
            ariaLabel="Invoice"
            placeholder="Select invoice"
            searchPlaceholder="Search invoice or client"
            options={[
              {
                value: invoiceId,
                label: invoiceNumber ?? 'Invoice',
                description: `${clientName} · due ${formatRupees(due)}`
              }
            ]}
            onChange={() => undefined}
          />
        </label>

        <label className={styles.modalField}>
          <span className={styles.modalLabel}>Amount</span>
          <div className={styles.amountRow}>
            <input
              className={errors.amount ? styles.modalInputInvalid : styles.modalInput}
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
              disabled={modalBusy || due <= 0}
              onClick={() => {
                setAmount(formatRatePaisa(due))
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
            className={errors.paymentDate ? styles.modalInputInvalid : styles.modalInput}
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
            className={styles.modalInput}
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
          <Button type="submit" variant="primary" disabled={modalBusy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}

type VoidPaymentModalProps = {
  payment: Payment
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

function VoidPaymentModal({
  payment,
  busy,
  onClose,
  onConfirm
}: VoidPaymentModalProps): React.JSX.Element {
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
    try {
      await onConfirm(trimmed)
    } catch (submitError) {
      setError(ipcErrorMessage(submitError))
    }
  }

  const label = formatRupees(payment.amount)

  return (
    <Modal labelledBy="void-payment-title" busy={busy} onClose={onClose}>
      <h2 id="void-payment-title" className={styles.modalTitle}>
        Trash payment
      </h2>
      <p className={styles.confirmMessage}>
        Move payment ({label}) to trash? This can be reviewed later in Trash.
      </p>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label className={styles.field}>
          <span className={styles.label}>Reason</span>
          <textarea
            className={error ? styles.textareaInvalid : styles.textarea}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            rows={4}
            autoFocus
            disabled={busy}
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

export function InvoicePage(): React.JSX.Element {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const arrivalError = readArrivalError(location.state)
  const arrivalToast = readArrivalToast(location.state)
  const [start] = useState(() => {
    const next = blankEditor()
    return { editor: next, baseline: JSON.stringify(next) }
  })
  const [editor, setEditor] = useState(start.editor)
  const [baseline, setBaseline] = useState(start.baseline)
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [recordId, setRecordId] = useState<string | undefined>(invoiceId)
  const [clients, setClients] = useState<Client[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [discardImages, setDiscardImages] = useState<string[]>([])
  const [errors, setErrors] = useState<EditorErrors>(emptyErrors)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'reopen' | null>(null)
  const [voidOpen, setVoidOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [addPaymentOpen, setAddPaymentOpen] = useState(false)
  const [voidPaymentTarget, setVoidPaymentTarget] = useState<Payment | null>(null)
  const [viewerImages, setViewerImages] = useState<string[] | null>(null)
  const [alert, setAlert] = useState<{
    id: number
    title: string
    message: string
    tone: AlertTone
    actions?: AlertAction[]
  } | null>(null)
  const alertIdRef = useRef(0)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function showAlert(
    message: string,
    title = 'Invoice needs attention',
    tone: AlertTone = 'error',
    actions?: AlertAction[]
  ): void {
    alertIdRef.current += 1
    setAlert({ id: alertIdRef.current, title, message, tone, actions })
  }

  function showSuccess(message: string, title = 'Success', actions?: AlertAction[]): void {
    showAlert(message, title, 'success', actions)
  }

  function publishErrors(nextErrors: EditorErrors, title = 'Invoice needs attention'): void {
    setErrors(nextErrors)
    const message = firstErrorMessage(nextErrors)
    if (message) showAlert(message, title, 'error')
  }

  const editable = !invoice || invoice.status === 'draft'
  const locked = !editable || busy
  const isDirty = !loading && editable && JSON.stringify(editor) !== baseline
  const dirtyRef = useRef(false)
  const leavingRef = useRef(false)
  dirtyRef.current = isDirty
  const routeKey = invoiceId ?? 'new'
  const [seenRoute, setSeenRoute] = useState(routeKey)
  if (seenRoute !== routeKey) {
    setSeenRoute(routeKey)
    setLoading(true)
    setLoadError('')
    setInvoice(null)
    setErrors(emptyErrors())
    setConfirm(null)
    setVoidOpen(false)
    setExportOpen(false)
    setAddPaymentOpen(false)
    setVoidPaymentTarget(null)
    leavingRef.current = false
  }

  const blocker = useBlocker(useCallback(() => dirtyRef.current && !leavingRef.current, []))

  const applyInvoice = useCallback((detail: InvoiceDetail): void => {
    const next = toEditor(detail)
    setInvoice(detail)
    setRecordId(detail.id)
    setEditor(next)
    setBaseline(JSON.stringify(next))
    setDiscardImages([])
    setErrors(emptyErrors())
  }, [])

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const api = window.api
        if (!api?.invoices || !api.clients || !api.units) {
          await Promise.reject(new Error('Invoices are unavailable'))
        } else {
          const [clientRows, unitRows, detail] = await Promise.all([
            api.clients.list({ status: 'active' }),
            api.units.list({ status: 'active' }),
            invoiceId ? api.invoices.get(invoiceId) : Promise.resolve(null)
          ])
          if (cancelled) return
          setClients(clientRows)
          setUnits(unitRows)
          if (detail) {
            applyInvoice(detail)
          } else {
            const next = blankEditor()
            setInvoice(null)
            setRecordId(undefined)
            setEditor(next)
            setBaseline(JSON.stringify(next))
          }
          if (arrivalError) publishErrors({ lines: {}, form: arrivalError })
          else if (arrivalToast) {
            showAlert(arrivalToast.message, arrivalToast.title, arrivalToast.tone)
          }
          if (arrivalError || arrivalToast) {
            navigate(location.pathname, { replace: true, state: null })
          }
        }
      } catch (error) {
        if (cancelled) return
        setLoadError(ipcErrorMessage(error))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [invoiceId, arrivalError, applyInvoice])

  function rememberRemoved(filename: string | null): void {
    if (!filename) return
    setDiscardImages((images) => (images.includes(filename) ? images : [...images, filename]))
  }

  function forgetRemoved(filename: string): void {
    setDiscardImages((images) => images.filter((image) => image !== filename))
  }

  function updateLine(key: string, patch: Partial<LineDraft>): void {
    setEditor((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line))
    }))
    setErrors((current) => {
      const lineError = { ...current.lines[key] }
      if ('name' in patch) delete lineError.name
      if ('unitId' in patch) delete lineError.unit
      if ('quantity' in patch) delete lineError.quantity
      if ('rate' in patch) delete lineError.rate
      if ('imagePath' in patch) delete lineError.image
      return { ...current, form: undefined, lines: { ...current.lines, [key]: lineError } }
    })
  }

  function addLine(): void {
    setEditor((current) => ({
      ...current,
      lines: [...current.lines, blankLine()]
    }))
  }

  function removeLine(key: string): void {
    const line = editor.lines.find((item) => item.key === key)
    rememberRemoved(line?.imagePath ?? null)
    setEditor((current) => ({
      ...current,
      lines: current.lines.filter((item) => item.key !== key)
    }))
  }

  function clearImage(key: string): void {
    const line = editor.lines.find((item) => item.key === key)
    rememberRemoved(line?.imagePath ?? null)
    updateLine(key, { imagePath: null })
  }

  function isImageFile(file: File): boolean {
    if (file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp') {
      return true
    }
    return /\.(png|jpe?g|webp)$/i.test(file.name)
  }

  async function applyImageFile(key: string, file: File): Promise<void> {
    if (!window.api?.invoices?.saveImage || locked) return
    if (!isImageFile(file)) {
      showAlert('Choose a PNG, JPG, or WebP image')
      return
    }
    const previous = editor.lines.find((line) => line.key === key)?.imagePath ?? null
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const filename = await window.api.invoices.saveImage(bytes)
      updateLine(key, { imagePath: filename })
      if (previous && previous !== filename) rememberRemoved(previous)
      forgetRemoved(filename)
      setErrors((current) => ({ ...current, form: undefined }))
    } catch (error) {
      showAlert(ipcErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function commitQuantity(key: string, value: string): void {
    try {
      updateLine(key, { quantity: formatQuantityThousandths(parseQuantityThousandths(value)) })
    } catch {
      // Keep the typed text so save can show the validation message.
    }
  }

  function commitRate(key: string, value: string): void {
    try {
      updateLine(key, { rate: formatRatePaisa(parseRatePaisa(value)) })
    } catch {
      // Keep the typed text so save can show the validation message.
    }
  }

  function buildSaveInput(): SaveInvoiceInput | null {
    const nextErrors: EditorErrors = { lines: {} }
    if (!editor.clientId) nextErrors.client = 'Client is required'
    if (!isInvoiceDate(editor.invoiceDate)) {
      nextErrors.date = 'Date must be a valid YYYY-MM-DD date'
    }

    const lines: SaveInvoiceLine[] = []
    for (const line of editor.lines) {
      const lineError: LineError = {}
      const name = line.name.trim()
      if (!name) lineError.name = 'Name is required'
      else if (name.length > 100) lineError.name = 'Name must be at most 100 characters'
      if (!line.unitId) lineError.unit = 'Unit is required'
      if (line.imagePath && !INVOICE_IMAGE_NAME.test(line.imagePath)) {
        lineError.image = 'Image file is invalid'
      }
      let quantity: number | null = null
      let rate: number | null = null
      try {
        quantity = parseQuantityThousandths(line.quantity)
      } catch (error) {
        lineError.quantity = ipcErrorMessage(error)
      }
      try {
        rate = parseRatePaisa(line.rate)
      } catch (error) {
        lineError.rate = ipcErrorMessage(error)
      }
      if (
        lineError.name ||
        lineError.unit ||
        lineError.quantity ||
        lineError.rate ||
        lineError.image
      ) {
        nextErrors.lines[line.key] = lineError
        continue
      }
      if (quantity === null || rate === null) continue
      lines.push({
        ...(line.persisted ? { id: line.key } : {}),
        name,
        image_path: line.imagePath,
        unit_id: line.unitId,
        quantity,
        rate
      })
    }

    if (nextErrors.client || nextErrors.date || Object.keys(nextErrors.lines).length > 0) {
      publishErrors(nextErrors)
      return null
    }
    setErrors(emptyErrors())
    return {
      ...(recordId ? { id: recordId } : {}),
      client_id: editor.clientId,
      invoice_date: editor.invoiceDate,
      lines,
      removed_images: removedImages(editor.lines, discardImages)
    }
  }

  async function persist(): Promise<InvoiceDetail | null> {
    const input = buildSaveInput()
    if (!input || !window.api?.invoices) return null
    setBusy(true)
    try {
      const saved = await window.api.invoices.save(input)
      applyInvoice(saved)
      return saved
    } catch (error) {
      publishErrors({ lines: {}, form: ipcErrorMessage(error) })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleSave(): Promise<void> {
    const saved = await persist()
    if (!saved) return
    const toast = {
      title: 'Success',
      message: 'Draft saved successfully.',
      tone: 'success' as const
    }
    if (!invoiceId) {
      leavingRef.current = true
      navigate(`/invoices/${saved.id}`, { replace: true, state: { toast } })
      return
    }
    showSuccess(toast.message, toast.title)
  }

  async function handleIssue(): Promise<void> {
    const saved = await persist()
    if (!saved || !window.api?.invoices) return
    setBusy(true)
    try {
      const issued = await window.api.invoices.issue(saved.id)
      applyInvoice(issued)
      const toast = {
        title: 'Success',
        message: issued.number
          ? `Invoice ${issued.number} issued successfully.`
          : 'Invoice issued successfully.',
        tone: 'success' as const
      }
      if (!invoiceId) {
        leavingRef.current = true
        navigate(`/invoices/${issued.id}`, { replace: true, state: { toast } })
      } else {
        showSuccess(toast.message, toast.title)
      }
    } catch (error) {
      const message = ipcErrorMessage(error)
      if (!invoiceId) {
        leavingRef.current = true
        navigate(`/invoices/${saved.id}`, { replace: true, state: { formError: message } })
      } else {
        publishErrors({ lines: {}, form: message })
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!recordId || !window.api?.invoices) return
    setBusy(true)
    try {
      await window.api.invoices.deleteDraft(recordId)
      leavingRef.current = true
      navigate('/invoices')
    } catch (error) {
      publishErrors({ lines: {}, form: ipcErrorMessage(error) })
      setConfirm(null)
      setBusy(false)
    }
  }

  async function handleReopen(): Promise<void> {
    if (!recordId || !window.api?.invoices) return
    setBusy(true)
    try {
      const reopened = await window.api.invoices.reopen(recordId)
      applyInvoice(reopened)
      setConfirm(null)
      showSuccess(
        reopened.number
          ? `Invoice ${reopened.number} reopened as a draft.`
          : 'Invoice reopened as a draft.'
      )
    } catch (error) {
      publishErrors({ lines: {}, form: ipcErrorMessage(error) })
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  async function handleVoid(reason: string): Promise<void> {
    if (!recordId || !window.api?.invoices) return
    setBusy(true)
    try {
      const voided = await window.api.invoices.void({ id: recordId, reason })
      applyInvoice(voided)
      setVoidOpen(false)
      showSuccess(
        voided.number ? `Invoice ${voided.number} moved to trash.` : 'Invoice moved to trash.'
      )
    } catch (error) {
      publishErrors({ lines: {}, form: ipcErrorMessage(error) })
      setVoidOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleExport(hideRates: boolean): Promise<void> {
    if (!recordId || !window.api?.invoices) return
    setBusy(true)
    try {
      const exported = await window.api.invoices.exportPdf({ id: recordId, hideRates })
      setExportOpen(false)
      if (exported.saved) {
        showSuccess(`Saved ${exported.filename}`, 'Success', [
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
      setExportOpen(false)
      showAlert(ipcErrorMessage(error), 'Could not export PDF', 'error', [
        {
          label: 'Change exports folder',
          onClick: () => navigate('/settings')
        }
      ])
    } finally {
      setBusy(false)
    }
  }

  async function refreshInvoiceDetail(): Promise<void> {
    if (!recordId || !window.api?.invoices) return
    const detail = await window.api.invoices.get(recordId)
    applyInvoice(detail)
  }

  async function handlePaymentCreated(): Promise<void> {
    setAddPaymentOpen(false)
    setBusy(true)
    try {
      await refreshInvoiceDetail()
      showSuccess('Payment recorded successfully.')
    } catch (error) {
      showAlert(ipcErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleVoidPayment(reason: string): Promise<void> {
    if (!voidPaymentTarget || !window.api?.payments) return
    setBusy(true)
    try {
      await window.api.payments.void({ id: voidPaymentTarget.id, reason })
      await refreshInvoiceDetail()
      setVoidPaymentTarget(null)
      showSuccess('Payment moved to trash.')
    } catch (error) {
      showAlert(ipcErrorMessage(error))
      setVoidPaymentTarget(null)
    } finally {
      setBusy(false)
    }
  }

  function openPaymentAttachmentViewer(payment: Payment): void {
    if (!payment.attachment_path) return
    setViewerImages([invoiceImageUrl(payment.attachment_path)])
  }

  const hasActivePayments =
    invoice?.payments.some((payment) => payment.status === 'active') ?? false

  function guardActivePayments(): boolean {
    if (hasActivePayments) {
      showAlert('Void its payments first')
      return true
    }
    return false
  }

  const clientOptions: Choice[] = clients.map((client) => ({
    id: client.id,
    name: client.name,
    inactive: client.status !== 'active'
  }))
  if (invoice && !clientOptions.some((client) => client.id === invoice.client_id)) {
    clientOptions.unshift({
      id: invoice.client_id,
      name: invoice.client_name,
      inactive: true
    })
  }

  const status = invoice?.status ?? 'draft'
  const leaveBlocked = blocker.state === 'blocked' ? blocker : null

  const pageTitle = invoiceId ? 'Sales invoice.' : 'Draft a sales invoice.'

  if (loading) {
    return (
      <Page fullWidth hideDescription>
        <p className={styles.stateMessage}>Loading…</p>
      </Page>
    )
  }

  if (loadError) {
    return (
      <Page fullWidth hideDescription>
        <div className={styles.pageIntro}>
          <Link className={styles.backButton} to="/invoices" aria-label="Back to invoices">
            <Icon name="chevronLeft" width={18} height={18} />
          </Link>
          <h2 className={styles.pageTitle}>{pageTitle}</h2>
        </div>
        <p className={styles.formError}>{loadError}</p>
      </Page>
    )
  }

  return (
    <Page fullWidth hideDescription>
      <div className={styles.pageIntro}>
        <Link className={styles.backButton} to="/invoices" aria-label="Back to invoices">
          <Icon name="chevronLeft" width={18} height={18} />
        </Link>
        <h2 className={styles.pageTitle}>{pageTitle}</h2>
      </div>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h2 className={styles.number}>{invoice?.number ?? 'Draft'}</h2>
          <span className={statusClass(status)}>{statusLabel(status)}</span>
        </div>
        <div className={styles.actions}>
          {editable ? (
            <>
              <Button type="button" disabled={busy} onClick={() => void handleSave()}>
                Save draft
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => void handleIssue()}
              >
                Issue
              </Button>
              {invoice && invoice.number === null ? (
                <Button type="button" disabled={busy} onClick={() => setConfirm('delete')}>
                  Delete draft
                </Button>
              ) : null}
            </>
          ) : null}
          {invoice?.status === 'issued' ? (
            <>
              <Button
                type="button"
                disabled={busy || hasActivePayments}
                onClick={() => {
                  if (guardActivePayments()) return
                  setConfirm('reopen')
                }}
              >
                Reopen
              </Button>
              <Button
                type="button"
                disabled={busy || hasActivePayments}
                onClick={() => {
                  if (guardActivePayments()) return
                  setVoidOpen(true)
                }}
              >
                Trash
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => setExportOpen(true)}
              >
                Export PDF
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {invoice?.status === 'void' && invoice.void_reason ? (
        <p className={styles.voidReason}>Trashed: {invoice.void_reason}</p>
      ) : null}
      {editable && clients.length === 0 ? (
        <p className={styles.hint}>Add an active client before saving an invoice.</p>
      ) : null}

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.label}>Client</span>
          <SearchableSelect
            value={editor.clientId}
            disabled={locked}
            invalid={Boolean(errors.client)}
            clearable
            placeholder="Select a client"
            searchPlaceholder="Search client name or phone"
            ariaLabel="Client"
            options={clientOptions.map((client) => {
              const phone =
                clients.find((item) => item.id === client.id)?.phone ??
                (invoice?.client_id === client.id ? invoice.client_phone : null)
              return {
                value: client.id,
                label: client.inactive ? `${client.name} (inactive)` : client.name,
                description: phone ?? undefined
              }
            })}
            onChange={(next) => {
              setEditor((current) => ({ ...current, clientId: next }))
              setErrors((current) => ({ ...current, client: undefined, form: undefined }))
            }}
          />
        </label>
        <label className={`${styles.field} ${styles.fieldNarrow}`}>
          <span className={styles.label}>Date</span>
          <input
            type="date"
            className={errors.date ? styles.inputInvalid : styles.input}
            value={editor.invoiceDate}
            disabled={locked}
            onChange={(event) => {
              setEditor((current) => ({ ...current, invoiceDate: event.target.value }))
              setErrors((current) => ({ ...current, date: undefined, form: undefined }))
            }}
          />
        </label>
      </div>

      <section className={styles.card} aria-labelledby="invoice-lines-heading">
        <h3 id="invoice-lines-heading" className={styles.visuallyHidden}>
          Designs
        </h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Image</th>
                <th scope="col">Design Name</th>
                <th className={styles.unitCol} scope="col">
                  Unit
                </th>
                <th className={styles.num} scope="col">
                  Qty
                </th>
                <th className={styles.num} scope="col">
                  Price
                </th>
                <th className={`${styles.num} ${styles.totalCol}`} scope="col">
                  Total
                </th>
                {editable ? (
                  <th className={styles.removeCol} scope="col">
                    <span className={styles.visuallyHidden}>Remove</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {editor.lines.map((line) => {
                const lineError = errors.lines[line.key]
                return (
                  <tr key={line.key}>
                    <td>
                      <div className={styles.imageCell}>
                        {editable ? (
                          <>
                            <button
                              type="button"
                              className={[
                                styles.imageDropzone,
                                dragOverKey === line.key ? styles.imageDropzoneActive : null,
                                lineError?.image ? styles.imageDropzoneInvalid : null
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              disabled={locked}
                              aria-label={line.imagePath ? 'Change image' : 'Add image'}
                              onClick={() => fileInputRefs.current[line.key]?.click()}
                              onDragEnter={(event: DragEvent<HTMLButtonElement>) => {
                                event.preventDefault()
                                if (!locked) setDragOverKey(line.key)
                              }}
                              onDragOver={(event: DragEvent<HTMLButtonElement>) => {
                                event.preventDefault()
                                event.dataTransfer.dropEffect = 'copy'
                                if (!locked) setDragOverKey(line.key)
                              }}
                              onDragLeave={(event: DragEvent<HTMLButtonElement>) => {
                                if (event.currentTarget.contains(event.relatedTarget as Node)) {
                                  return
                                }
                                setDragOverKey((current) => (current === line.key ? null : current))
                              }}
                              onDrop={(event: DragEvent<HTMLButtonElement>) => {
                                event.preventDefault()
                                setDragOverKey(null)
                                const file = event.dataTransfer.files?.[0]
                                if (file) void applyImageFile(line.key, file)
                              }}
                            >
                              {line.imagePath ? (
                                <img
                                  className={styles.thumbImage}
                                  src={invoiceImageUrl(line.imagePath)}
                                  alt=""
                                  draggable={false}
                                />
                              ) : (
                                <Icon name="plus" width={16} height={16} />
                              )}
                            </button>
                            <input
                              ref={(node) => {
                                fileInputRefs.current[line.key] = node
                              }}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                              className={styles.visuallyHidden}
                              tabIndex={-1}
                              disabled={locked}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                event.target.value = ''
                                if (file) void applyImageFile(line.key, file)
                              }}
                            />
                            {line.imagePath ? (
                              <button
                                type="button"
                                className={styles.imageClear}
                                disabled={locked}
                                aria-label="Remove image"
                                onClick={() => clearImage(line.key)}
                              >
                                <Icon name="close" width={12} height={12} />
                              </button>
                            ) : null}
                          </>
                        ) : line.imagePath ? (
                          <button
                            type="button"
                            className={styles.thumbButton}
                            aria-label="View image"
                            title="View image"
                            onClick={() =>
                              setViewerImages([invoiceImageUrl(line.imagePath as string)])
                            }
                          >
                            <img
                              className={styles.thumb}
                              src={invoiceImageUrl(line.imagePath)}
                              alt=""
                            />
                          </button>
                        ) : (
                          <span className={styles.thumbPlaceholder} />
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        className={lineError?.name ? styles.inputInvalid : styles.input}
                        value={line.name}
                        disabled={locked}
                        aria-label="Design name"
                        onChange={(event) => updateLine(line.key, { name: event.target.value })}
                      />
                    </td>
                    <td className={styles.unitCol}>
                      <SearchableSelect
                        value={line.unitId}
                        disabled={locked}
                        invalid={Boolean(lineError?.unit)}
                        clearable
                        variant="underline"
                        placeholder="Unit"
                        searchPlaceholder="Search unit"
                        ariaLabel="Unit"
                        options={unitChoices(line, units).map((unit) => ({
                          value: unit.id,
                          label: unit.inactive ? `${unit.name} (inactive)` : unit.name
                        }))}
                        onChange={(next) => {
                          const unit = units.find((item) => item.id === next)
                          updateLine(line.key, {
                            unitId: next,
                            unitName: unit?.name ?? (next ? line.unitName : '')
                          })
                        }}
                      />
                    </td>
                    <td className={styles.num}>
                      <input
                        className={lineError?.quantity ? styles.inputInvalid : styles.input}
                        value={line.quantity}
                        disabled={locked}
                        inputMode="decimal"
                        aria-label="Quantity"
                        onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                        onBlur={(event) => commitQuantity(line.key, event.target.value)}
                      />
                    </td>
                    <td className={styles.num}>
                      <input
                        className={lineError?.rate ? styles.inputInvalid : styles.input}
                        value={line.rate}
                        disabled={locked}
                        inputMode="decimal"
                        placeholder={
                          line.unitId && line.unitName ? `Price per ${line.unitName}` : undefined
                        }
                        aria-label={
                          line.unitId && line.unitName ? `Price per ${line.unitName}` : 'Price'
                        }
                        onChange={(event) => updateLine(line.key, { rate: event.target.value })}
                        onBlur={(event) => commitRate(line.key, event.target.value)}
                      />
                    </td>
                    <td className={`${styles.num} ${styles.totalCol}`}>
                      <MoneyReadout amount={lineTotalAmount(line)} />
                    </td>
                    {editable ? (
                      <td className={styles.removeCol}>
                        <button
                          type="button"
                          className={styles.trashButton}
                          aria-label={`Remove ${line.name.trim() || 'design'}`}
                          disabled={locked}
                          onClick={() => removeLine(line.key)}
                        >
                          <Icon name="trash" width={15} height={15} />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {editable ? (
          <div className={styles.addRow}>
            {units.length === 0 ? (
              <p className={styles.hint}>Add an active unit before adding a design.</p>
            ) : null}
            <Button type="button" disabled={locked} onClick={addLine}>
              Add design
            </Button>
          </div>
        ) : null}
        <div className={styles.footer}>
          <span className={styles.footerLabel}>Total</span>
          <MoneyReadout amount={invoiceTotalAmount(editor.lines)} emphasize />
        </div>
      </section>

      {invoice && invoice.status !== 'draft' ? (
        <div className={styles.paymentSummaryCard}>
          <div className={styles.paymentSummaryGrid}>
            <div className={styles.paymentSummaryField}>
              <span className={styles.label}>Total</span>
              <MoneyReadout amount={formatPaisa(invoice.total)} />
            </div>
            <div className={styles.paymentSummaryField}>
              <span className={styles.label}>Paid</span>
              <MoneyReadout amount={formatPaisa(invoice.paid)} />
            </div>
            <div className={styles.paymentSummaryField}>
              <span className={styles.label}>Due</span>
              <MoneyReadout amount={formatPaisa(invoice.due)} />
            </div>
            <div className={styles.paymentSummaryBadge}>
              <span className={styles.label}>Payment status</span>
              <span className={invoicePaymentStatusClass(invoice.payment_status)}>
                {paymentStatusLabel(invoice.payment_status)}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {invoice && invoice.status !== 'draft' ? (
        <section className={styles.paymentsSection} aria-labelledby="invoice-payments-heading">
          <div className={styles.paymentsHeader}>
            <h3 id="invoice-payments-heading" className={styles.sectionTitle}>
              Payments
            </h3>
            <Button
              type="button"
              variant="primary"
              disabled={busy || invoice.status !== 'issued' || !window.api?.payments}
              onClick={() => setAddPaymentOpen(true)}
            >
              New payment
            </Button>
          </div>
          <div className={styles.card}>
            {invoice.payments.length === 0 ? (
              <p className={styles.paymentEmpty}>No payments recorded yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Method</th>
                      <th className={styles.num} scope="col">
                        Amount
                      </th>
                      <th scope="col">Note</th>
                      <th className={styles.thumbCol} scope="col">
                        <span className={styles.visuallyHidden}>Attachment</span>
                      </th>
                      <th scope="col">Status</th>
                      <th className={styles.removeCol} scope="col">
                        <span className={styles.visuallyHidden}>Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map((payment) => {
                      const stamp = formatPaymentStamp(payment.created_at)
                      const active = payment.status === 'active'
                      return (
                        <tr key={payment.id}>
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
                          <td>{paymentMethodLabel(payment.method)}</td>
                          <td className={styles.num}>{formatRupees(payment.amount)}</td>
                          <td>
                            {payment.note ? (
                              payment.note
                            ) : (
                              <span className={styles.notAvailable}>Not Available</span>
                            )}
                          </td>
                          <td className={styles.thumbCol}>
                            {payment.attachment_path ? (
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.imageButton}`}
                                aria-label="View attachment"
                                title="View attachment"
                                onClick={() => openPaymentAttachmentViewer(payment)}
                              >
                                <Icon name="image" width={17} height={17} />
                              </button>
                            ) : null}
                          </td>
                          <td>
                            <span className={paymentRecordStatusClass(payment.status)}>
                              {paymentRecordStatusLabel(payment.status)}
                            </span>
                          </td>
                          <td className={styles.removeCol}>
                            <button
                              type="button"
                              className={styles.trashButton}
                              disabled={!active || busy}
                              aria-label="Trash payment"
                              title="Trash"
                              onClick={() => setVoidPaymentTarget(payment)}
                            >
                              <Icon name="trash" width={15} height={15} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {confirm === 'delete' ? (
        <ConfirmModal
          title="Delete draft"
          message="Delete this draft? This cannot be undone."
          confirmLabel="Delete draft"
          busy={busy}
          onClose={() => {
            if (!busy) setConfirm(null)
          }}
          onConfirm={handleDelete}
        />
      ) : null}
      {confirm === 'reopen' ? (
        <ConfirmModal
          title="Reopen invoice"
          message="Reopen this invoice as a draft? Its number will stay the same."
          confirmLabel="Reopen"
          busy={busy}
          onClose={() => {
            if (!busy) setConfirm(null)
          }}
          onConfirm={handleReopen}
        />
      ) : null}
      {voidOpen ? (
        <VoidModal
          busy={busy}
          onClose={() => {
            if (!busy) setVoidOpen(false)
          }}
          onConfirm={handleVoid}
        />
      ) : null}
      {exportOpen ? (
        <ExportModal
          busy={busy}
          onClose={() => {
            if (!busy) setExportOpen(false)
          }}
          onExport={handleExport}
        />
      ) : null}
      {addPaymentOpen && invoice ? (
        <AddPaymentModal
          invoiceId={invoice.id}
          invoiceNumber={invoice.number}
          clientName={invoice.client_name}
          due={invoice.due}
          busy={busy}
          onClose={() => setAddPaymentOpen(false)}
          onCreated={handlePaymentCreated}
          onError={(message) => showAlert(message, 'Payment needs attention', 'error')}
        />
      ) : null}
      {voidPaymentTarget ? (
        <VoidPaymentModal
          payment={voidPaymentTarget}
          busy={busy}
          onClose={() => {
            if (!busy) setVoidPaymentTarget(null)
          }}
          onConfirm={handleVoidPayment}
        />
      ) : null}
      {viewerImages ? (
        <ImageViewer
          images={viewerImages}
          title="Payment attachment"
          onClose={() => setViewerImages(null)}
        />
      ) : null}
      {leaveBlocked ? (
        <ConfirmModal
          title="Unsaved changes"
          message="You have unsaved changes. Leave without saving?"
          confirmLabel="Leave"
          busy={false}
          onClose={leaveBlocked.reset}
          onConfirm={leaveBlocked.proceed}
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
