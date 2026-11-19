import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from 'react'
import {
  formatAmountInput,
  formatPaisa,
  formatRupees,
  parseRatePaisa
} from '../../../../core/money'
import type { Client } from '../../../../shared/clients'
import { invoiceImageUrl, type InvoiceSummary } from '../../../../shared/invoices'
import { ipcErrorMessage } from '../../../../shared/ipcError'
import {
  isPaymentDate,
  paymentMethodLabel,
  type CreatePaymentResult,
  type PaymentMethod
} from '../../../../shared/payments'
import { Icon } from '@renderer/components/icons/Icon'
import { Button } from '@renderer/components/ui/Button'
import { Modal } from '@renderer/components/ui/Modal'
import { SearchableSelect } from '@renderer/components/ui/SearchableSelect'
import styles from './NewPaymentModal.module.css'

const AUTO_INVOICE = ''
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'cheque', 'online']

type FieldErrors = {
  clientId?: string
  amount?: string
  method?: string
  paymentDate?: string
}

export type NewPaymentModalProps = {
  busy?: boolean
  locked?: boolean
  initialClientId?: string
  initialInvoiceId?: string
  onClose: () => void
  onCreated: (result: CreatePaymentResult) => void | Promise<void>
  onError: (message: string) => void
}

function todayLocal(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function formatInvoiceDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function payableClients(clients: Client[]): Client[] {
  return clients
    .filter((client) => client.status === 'active' || client.balance > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function payableInvoices(invoices: InvoiceSummary[], clientId: string): InvoiceSummary[] {
  return invoices
    .filter(
      (invoice) =>
        invoice.client_id === clientId &&
        invoice.status === 'issued' &&
        invoice.due > 0 &&
        Boolean(invoice.number)
    )
    .sort((a, b) => {
      if (a.invoice_date !== b.invoice_date) return a.invoice_date < b.invoice_date ? -1 : 1
      const aNumber = a.number ?? ''
      const bNumber = b.number ?? ''
      if (aNumber !== bNumber) return aNumber < bNumber ? -1 : 1
      return a.id < b.id ? -1 : 1
    })
}

function significantCount(value: string): number {
  return value.replace(/,/g, '').length
}

function caretFromSignificantCount(formatted: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let index = 0; index < formatted.length; index += 1) {
    if (formatted[index] !== ',') seen += 1
    if (seen >= count) return index + 1
  }
  return formatted.length
}

export function NewPaymentModal({
  busy = false,
  locked = false,
  initialClientId = '',
  initialInvoiceId = '',
  onClose,
  onCreated,
  onError
}: NewPaymentModalProps): React.JSX.Element {
  const [clients, setClients] = useState<Client[]>([])
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [clientId, setClientId] = useState(initialClientId)
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId || AUTO_INVOICE)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [paymentDate, setPaymentDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [pickingAttachment, setPickingAttachment] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const onErrorRef = useRef(onError)
  const amountInputRef = useRef<HTMLInputElement>(null)
  const amountCaretRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (amountCaretRef.current == null || !amountInputRef.current) return
    const caret = amountCaretRef.current
    amountCaretRef.current = null
    amountInputRef.current.setSelectionRange(caret, caret)
  }, [amount])

  function handleAmountChange(event: ChangeEvent<HTMLInputElement>): void {
    const raw = event.target.value
    const cursor = event.target.selectionStart ?? raw.length
    const formatted = formatAmountInput(raw)
    amountCaretRef.current = caretFromSignificantCount(
      formatted,
      significantCount(raw.slice(0, cursor))
    )
    setAmount(formatted)
    setErrors((current) => ({ ...current, amount: undefined }))
  }

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    let cancelled = false
    async function loadOptions(): Promise<void> {
      if (!window.api?.clients || !window.api?.invoices) {
        onErrorRef.current('Payments are unavailable')
        if (!cancelled) setLoadingOptions(false)
        return
      }
      try {
        const [clientRows, invoiceRows] = await Promise.all([
          window.api.clients.list({ status: 'all' }),
          window.api.invoices.list({ status: 'issued' })
        ])
        if (cancelled) return
        setClients(clientRows)
        setInvoices(invoiceRows)

        let nextClientId = initialClientId
        const nextInvoiceId = initialInvoiceId || AUTO_INVOICE
        if (!nextClientId && nextInvoiceId) {
          const match = invoiceRows.find((invoice) => invoice.id === nextInvoiceId)
          if (match) nextClientId = match.client_id
        }
        setClientId(nextClientId)
        setInvoiceId(nextInvoiceId)
      } catch (error) {
        if (!cancelled) onErrorRef.current(ipcErrorMessage(error))
      } finally {
        if (!cancelled) setLoadingOptions(false)
      }
    }
    void loadOptions()
    return () => {
      cancelled = true
    }
  }, [initialClientId, initialInvoiceId])

  const clientOptions = useMemo(() => {
    const rows = payableClients(clients)
    if (clientId && !rows.some((client) => client.id === clientId)) {
      const selected = clients.find((client) => client.id === clientId)
      if (selected) rows.push(selected)
    }
    return rows.map((client) => ({
      value: client.id,
      label: client.name,
      description:
        client.status === 'inactive'
          ? `Inactive · balance ${formatRupees(client.balance)}`
          : `Balance ${formatRupees(client.balance)}`
    }))
  }, [clients, clientId])

  const clientInvoices = useMemo(
    () => (clientId ? payableInvoices(invoices, clientId) : []),
    [clientId, invoices]
  )

  const selectedInvoice = useMemo(
    () => clientInvoices.find((invoice) => invoice.id === invoiceId) ?? null,
    [clientInvoices, invoiceId]
  )

  const receivable = useMemo(() => {
    if (selectedInvoice) return selectedInvoice.due
    return clientInvoices.reduce((sum, invoice) => sum + invoice.due, 0)
  }, [clientInvoices, selectedInvoice])

  const invoiceOptions = useMemo(() => {
    const options = [
      {
        value: AUTO_INVOICE,
        label: 'Auto (oldest first)',
        description: clientId
          ? `Receivable ${formatRupees(clientInvoices.reduce((sum, invoice) => sum + invoice.due, 0))}`
          : undefined
      },
      ...clientInvoices.map((invoice) => ({
        value: invoice.id,
        label: invoice.number ?? 'Invoice',
        description: `${formatInvoiceDate(invoice.invoice_date)} · due ${formatRupees(invoice.due)}`
      }))
    ]
    if (
      invoiceId &&
      invoiceId !== AUTO_INVOICE &&
      !options.some((option) => option.value === invoiceId)
    ) {
      const lockedInvoice = invoices.find((invoice) => invoice.id === invoiceId)
      if (lockedInvoice) {
        options.push({
          value: lockedInvoice.id,
          label: lockedInvoice.number ?? 'Invoice',
          description: `${formatInvoiceDate(lockedInvoice.invoice_date)} · due ${formatRupees(lockedInvoice.due)}`
        })
      }
    }
    return options
  }, [clientId, clientInvoices, invoiceId, invoices])

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

  function validate(): { errors: FieldErrors; amountPaisa?: number } {
    const next: FieldErrors = {}
    if (!clientId) next.clientId = 'Client is required'

    let parsedAmount: number | undefined
    if (!amount.trim()) {
      next.amount = 'Amount is required'
    } else {
      try {
        parsedAmount = parseRatePaisa(amount)
        if (parsedAmount <= 0) {
          next.amount = 'Amount must be greater than zero'
          parsedAmount = undefined
        }
      } catch {
        next.amount = 'Amount must be a number with up to 2 decimal places'
      }
    }

    if (!method) next.method = 'Method is required'
    if (!isPaymentDate(paymentDate)) next.paymentDate = 'Enter a valid date'

    return { errors: next, amountPaisa: parsedAmount }
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!window.api?.payments) return

    const next = validate()
    if (Object.keys(next.errors).length > 0 || next.amountPaisa === undefined) {
      setErrors(next.errors)
      const message = Object.values(next.errors).filter(Boolean).join(' ')
      onError(message || 'Check the payment details')
      return
    }

    setErrors({})
    setSubmitting(true)
    try {
      const result = await window.api.payments.create({
        client_id: clientId,
        invoice_id: invoiceId || null,
        amount: next.amountPaisa,
        method: method as PaymentMethod,
        payment_date: paymentDate,
        note: note.trim() || null,
        attachment_path: attachmentPath
      })
      await onCreated(result)
    } catch (error) {
      onError(ipcErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const modalBusy = busy || submitting
  const saveDisabled = modalBusy || loadingOptions || !clientId

  return (
    <Modal labelledBy="new-payment-title" size="wide" busy={modalBusy} onClose={onClose}>
      <h2 id="new-payment-title" className={styles.modalTitle}>
        New payment
      </h2>
      <form className={styles.modalForm} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className={styles.fieldRow}>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Client</span>
            <SearchableSelect
              value={clientId}
              disabled={modalBusy || loadingOptions || locked}
              invalid={Boolean(errors.clientId)}
              ariaLabel="Client"
              placeholder={loadingOptions ? 'Loading…' : 'Select client'}
              searchPlaceholder="Search client"
              options={clientOptions}
              onChange={(next) => {
                setClientId(next)
                setInvoiceId(AUTO_INVOICE)
                setErrors((current) => ({ ...current, clientId: undefined }))
              }}
            />
            {errors.clientId ? <span className={styles.fieldError}>{errors.clientId}</span> : null}
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Invoice</span>
            <SearchableSelect
              value={invoiceId}
              disabled={modalBusy || loadingOptions || locked || !clientId}
              ariaLabel="Invoice"
              placeholder={!clientId ? 'Select a client first' : 'Auto (oldest first)'}
              searchPlaceholder="Search invoice"
              options={invoiceOptions}
              onChange={(next) => {
                setInvoiceId(next)
              }}
            />
          </label>
        </div>

        <label className={styles.modalField}>
          <span className={styles.modalLabel}>Amount</span>
          <div className={styles.amountRow}>
            <div className={errors.amount ? styles.amountInputInvalid : styles.amountInput}>
              <span className={styles.amountPrefix} aria-hidden="true">
                Rs
              </span>
              <input
                ref={amountInputRef}
                className={styles.amountField}
                value={amount}
                disabled={modalBusy}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Payment amount"
                onChange={handleAmountChange}
              />
            </div>
            <Button
              type="button"
              disabled={modalBusy || !clientId || receivable <= 0}
              onClick={() => {
                setAmount(formatPaisa(receivable))
                setErrors((current) => ({ ...current, amount: undefined }))
              }}
            >
              {selectedInvoice ? 'Pay full due' : 'Pay full receivable'}
            </Button>
          </div>
          {errors.amount ? <span className={styles.fieldError}>{errors.amount}</span> : null}
        </label>

        <div className={styles.fieldRow}>
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
            {errors.method ? <span className={styles.fieldError}>{errors.method}</span> : null}
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
            {errors.paymentDate ? (
              <span className={styles.fieldError}>{errors.paymentDate}</span>
            ) : null}
          </label>
        </div>

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
          {attachmentPath ? (
            <div className={styles.attachmentSelected}>
              <img
                className={styles.attachmentThumb}
                src={invoiceImageUrl(attachmentPath)}
                alt=""
              />
              <div className={styles.attachmentSelectedMeta}>
                <span className={styles.attachmentSelectedLabel}>Attachment ready</span>
                <button
                  type="button"
                  className={styles.attachmentChange}
                  disabled={modalBusy || pickingAttachment}
                  onClick={() => void handlePickAttachment()}
                >
                  Change file
                </button>
              </div>
              <button
                type="button"
                className={styles.imageClear}
                disabled={modalBusy}
                aria-label="Remove attachment"
                onClick={() => setAttachmentPath(null)}
              >
                <Icon name="close" width={14} height={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.attachmentDropzone}
              disabled={modalBusy || pickingAttachment}
              onClick={() => void handlePickAttachment()}
            >
              <Icon name="upload" width={22} height={22} />
              <span className={styles.attachmentDropzoneTitle}>
                {pickingAttachment ? 'Opening…' : 'Click to upload'}
              </span>
              <span className={styles.attachmentDropzoneHint}>PNG, JPG, or WebP</span>
            </button>
          )}
        </div>

        <div className={styles.modalActions}>
          <Button type="button" disabled={modalBusy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saveDisabled}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
