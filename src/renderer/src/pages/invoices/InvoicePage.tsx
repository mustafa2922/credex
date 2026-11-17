import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router'
import {
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
import type { Unit } from '../../../../shared/units'
import { Icon } from '@renderer/components/icons/Icon'
import { Page } from '@renderer/components/layout/Page'
import { Button } from '@renderer/components/ui/Button'
import { Modal } from '@renderer/components/ui/Modal'
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

function todayLocal(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function blankEditor(): EditorState {
  return { clientId: '', invoiceDate: todayLocal(), lines: [] }
}

function emptyErrors(): EditorErrors {
  return { lines: {} }
}

function ipcErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

function readArrivalError(state: unknown): string {
  if (!state || typeof state !== 'object' || !('formError' in state)) return ''
  const message = (state as { formError?: unknown }).formError
  return typeof message === 'string' ? message : ''
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
  if (status === 'void') return 'Void'
  return 'Draft'
}

function statusClass(status: InvoiceStatus): string {
  if (status === 'issued') return styles.badgeIssued
  if (status === 'void') return styles.badgeVoid
  return styles.badgeDraft
}

function lineTotalText(line: LineDraft): string {
  try {
    return formatRupees(
      lineTotalPaisa(parseRatePaisa(line.rate), parseQuantityThousandths(line.quantity))
    )
  } catch {
    return '—'
  }
}

function invoiceTotalText(lines: LineDraft[]): string {
  try {
    const totals = lines.map((line) =>
      lineTotalPaisa(parseRatePaisa(line.rate), parseQuantityThousandths(line.quantity))
    )
    return formatRupees(invoiceTotalPaisa(totals))
  } catch {
    return '—'
  }
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
        Void invoice
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
            Void
          </Button>
        </div>
      </form>
    </Modal>
  )
}

type ExportModalProps = {
  busy: boolean
  error: string
  onClose: () => void
  onExport: (hideRates: boolean) => Promise<void>
}

function ExportModal({ busy, error, onClose, onExport }: ExportModalProps): React.JSX.Element {
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
      {error ? <p className={styles.formError}>{error}</p> : null}
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

export function InvoicePage(): React.JSX.Element {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const arrivalError = readArrivalError(location.state)
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
  const [exportError, setExportError] = useState('')

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
          if (arrivalError) setErrors({ lines: {}, form: arrivalError })
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
      lines: [
        ...current.lines,
        {
          key: crypto.randomUUID(),
          persisted: false,
          name: '',
          imagePath: null,
          unitId: '',
          unitName: '',
          quantity: '',
          rate: ''
        }
      ]
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

  async function pickImage(key: string): Promise<void> {
    if (!window.api?.invoices || locked) return
    const previous = editor.lines.find((line) => line.key === key)?.imagePath ?? null
    setBusy(true)
    try {
      const filename = await window.api.invoices.pickImage()
      if (!filename) return
      updateLine(key, { imagePath: filename })
      if (previous && previous !== filename) rememberRemoved(previous)
      forgetRemoved(filename)
    } catch (error) {
      setErrors((current) => ({ ...current, form: ipcErrorMessage(error) }))
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
      setErrors(nextErrors)
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
      setErrors({ lines: {}, form: ipcErrorMessage(error) })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleSave(): Promise<void> {
    const saved = await persist()
    if (!saved || invoiceId) return
    leavingRef.current = true
    navigate(`/invoices/${saved.id}`, { replace: true })
  }

  async function handleIssue(): Promise<void> {
    const saved = await persist()
    if (!saved || !window.api?.invoices) return
    setBusy(true)
    try {
      const issued = await window.api.invoices.issue(saved.id)
      applyInvoice(issued)
      if (!invoiceId) {
        leavingRef.current = true
        navigate(`/invoices/${issued.id}`, { replace: true })
      }
    } catch (error) {
      const message = ipcErrorMessage(error)
      if (!invoiceId) {
        leavingRef.current = true
        navigate(`/invoices/${saved.id}`, { replace: true, state: { formError: message } })
      } else {
        setErrors({ lines: {}, form: message })
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
      setErrors({ lines: {}, form: ipcErrorMessage(error) })
      setConfirm(null)
      setBusy(false)
    }
  }

  async function handleReopen(): Promise<void> {
    if (!recordId || !window.api?.invoices) return
    setBusy(true)
    try {
      applyInvoice(await window.api.invoices.reopen(recordId))
      setConfirm(null)
    } catch (error) {
      setErrors({ lines: {}, form: ipcErrorMessage(error) })
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  async function handleVoid(reason: string): Promise<void> {
    if (!recordId || !window.api?.invoices) return
    setBusy(true)
    try {
      applyInvoice(await window.api.invoices.void({ id: recordId, reason }))
      setVoidOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleExport(hideRates: boolean): Promise<void> {
    if (!recordId || !window.api?.invoices) return
    setBusy(true)
    setExportError('')
    try {
      await window.api.invoices.exportPdf({ id: recordId, hideRates })
      setExportOpen(false)
    } catch (error) {
      setExportError(ipcErrorMessage(error))
    } finally {
      setBusy(false)
    }
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

  if (loading) {
    return (
      <Page fullWidth>
        <p className={styles.stateMessage}>Loading…</p>
      </Page>
    )
  }

  if (loadError) {
    return (
      <Page fullWidth>
        <Link className={styles.back} to="/invoices">
          All invoices
        </Link>
        <p className={styles.formError}>{loadError}</p>
      </Page>
    )
  }

  return (
    <Page fullWidth>
      <Link className={styles.back} to="/invoices">
        All invoices
      </Link>
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
              <Button type="button" disabled={busy} onClick={() => setConfirm('reopen')}>
                Reopen
              </Button>
              <Button type="button" disabled={busy} onClick={() => setVoidOpen(true)}>
                Void
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => {
                  setExportError('')
                  setExportOpen(true)
                }}
              >
                Export PDF
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {invoice?.status === 'void' && invoice.void_reason ? (
        <p className={styles.voidReason}>Voided: {invoice.void_reason}</p>
      ) : null}
      {errors.form ? <p className={styles.formError}>{errors.form}</p> : null}
      {editable && clients.length === 0 ? (
        <p className={styles.hint}>Add an active client before saving an invoice.</p>
      ) : null}

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.label}>Client</span>
          <select
            className={errors.client ? styles.selectInvalid : styles.select}
            value={editor.clientId}
            disabled={locked}
            onChange={(event) => {
              setEditor((current) => ({ ...current, clientId: event.target.value }))
              setErrors((current) => ({ ...current, client: undefined, form: undefined }))
            }}
          >
            <option value="">Select a client</option>
            {clientOptions.map((client) => (
              <option key={client.id} value={client.id}>
                {client.inactive ? `${client.name} (inactive)` : client.name}
              </option>
            ))}
          </select>
          {errors.client ? <span className={styles.fieldError}>{errors.client}</span> : null}
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
          {errors.date ? <span className={styles.fieldError}>{errors.date}</span> : null}
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
                <th scope="col">Name</th>
                <th scope="col">Unit</th>
                <th className={styles.num} scope="col">
                  Qty
                </th>
                <th className={styles.num} scope="col">
                  Rate
                </th>
                <th className={styles.num} scope="col">
                  Total
                </th>
                {editable ? (
                  <th scope="col">
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
                        {line.imagePath ? (
                          <img
                            className={styles.thumb}
                            src={invoiceImageUrl(line.imagePath)}
                            alt=""
                          />
                        ) : (
                          <span className={styles.thumbPlaceholder} />
                        )}
                        {editable ? (
                          <div className={styles.imageActions}>
                            <button
                              type="button"
                              className={styles.textButton}
                              disabled={locked}
                              onClick={() => void pickImage(line.key)}
                            >
                              {line.imagePath ? 'Change' : 'Add'}
                            </button>
                            {line.imagePath ? (
                              <button
                                type="button"
                                className={styles.textButton}
                                disabled={locked}
                                onClick={() => clearImage(line.key)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {lineError?.image ? (
                        <span className={styles.fieldError}>{lineError.image}</span>
                      ) : null}
                    </td>
                    <td>
                      <input
                        className={lineError?.name ? styles.inputInvalid : styles.input}
                        value={line.name}
                        disabled={locked}
                        aria-label="Design name"
                        onChange={(event) => updateLine(line.key, { name: event.target.value })}
                      />
                      {lineError?.name ? (
                        <span className={styles.fieldError}>{lineError.name}</span>
                      ) : null}
                    </td>
                    <td>
                      <select
                        className={lineError?.unit ? styles.selectInvalid : styles.select}
                        value={line.unitId}
                        disabled={locked}
                        aria-label="Unit"
                        onChange={(event) => {
                          const unit = units.find((item) => item.id === event.target.value)
                          updateLine(line.key, {
                            unitId: event.target.value,
                            unitName: unit?.name ?? line.unitName
                          })
                        }}
                      >
                        <option value="">Unit</option>
                        {unitChoices(line, units).map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.inactive ? `${unit.name} (inactive)` : unit.name}
                          </option>
                        ))}
                      </select>
                      {lineError?.unit ? (
                        <span className={styles.fieldError}>{lineError.unit}</span>
                      ) : null}
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
                      {lineError?.quantity ? (
                        <span className={styles.fieldError}>{lineError.quantity}</span>
                      ) : null}
                    </td>
                    <td className={styles.num}>
                      <input
                        className={lineError?.rate ? styles.inputInvalid : styles.input}
                        value={line.rate}
                        disabled={locked}
                        inputMode="decimal"
                        aria-label="Rate"
                        onChange={(event) => updateLine(line.key, { rate: event.target.value })}
                        onBlur={(event) => commitRate(line.key, event.target.value)}
                      />
                      {lineError?.rate ? (
                        <span className={styles.fieldError}>{lineError.rate}</span>
                      ) : null}
                    </td>
                    <td className={styles.num}>
                      <div className={styles.lineTotal}>{lineTotalText(line)}</div>
                    </td>
                    {editable ? (
                      <td>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Remove ${line.name.trim() || 'design'}`}
                          disabled={locked}
                          onClick={() => removeLine(line.key)}
                        >
                          <Icon name="close" />
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
          <span>Total</span>
          <span>{invoiceTotalText(editor.lines)}</span>
        </div>
      </section>

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
          error={exportError}
          onClose={() => {
            if (!busy) setExportOpen(false)
          }}
          onExport={handleExport}
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
    </Page>
  )
}
