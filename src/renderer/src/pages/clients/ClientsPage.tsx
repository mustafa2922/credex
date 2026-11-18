import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatRupees } from '../../../../core/money'
import type { Client, ClientListStatus } from '../../../../shared/clients'
import { Icon } from '@renderer/components/icons/Icon'
import { Page } from '@renderer/components/layout/Page'
import { Button } from '@renderer/components/ui/Button'
import { Modal } from '@renderer/components/ui/Modal'
import { SearchableSelect } from '@renderer/components/ui/SearchableSelect'
import styles from './ClientsPage.module.css'

const phoneChars = /^[\d\s+\-()]*$/

type FormErrors = {
  name?: string
  phone?: string
  form?: string
}

type ClientFormModalProps = {
  title: string
  initialName: string
  initialPhone: string
  busy: boolean
  onClose: () => void
  onSubmit: (name: string, phone: string) => Promise<void>
}

function validateClientForm(name: string, phone: string): FormErrors {
  const errors: FormErrors = {}
  const trimmedName = name.trim()
  if (!trimmedName) {
    errors.name = 'Name is required'
  } else if (trimmedName.length > 100) {
    errors.name = 'Name must be at most 100 characters'
  }
  const trimmedPhone = phone.trim()
  if (trimmedPhone.length > 20) {
    errors.phone = 'Phone must be at most 20 characters'
  } else if (trimmedPhone && !phoneChars.test(trimmedPhone)) {
    errors.phone = 'Phone may only contain digits, spaces, and + - ( )'
  }
  return errors
}

function ipcErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

function ClientFormModal({
  title,
  initialName,
  initialPhone,
  busy,
  onClose,
  onSubmit
}: ClientFormModalProps): React.JSX.Element {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [errors, setErrors] = useState<FormErrors>({})

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const next = validateClientForm(name, phone)
    if (next.name || next.phone) {
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await onSubmit(name, phone)
    } catch (error) {
      setErrors({ form: ipcErrorMessage(error) })
    }
  }

  return (
    <Modal labelledBy="client-form-title" busy={busy} onClose={onClose}>
      <h2 id="client-form-title" className={styles.modalTitle}>
        {title}
      </h2>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input
            className={errors.name ? styles.inputInvalid : styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            disabled={busy}
          />
          {errors.name ? <span className={styles.fieldError}>{errors.name}</span> : null}
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Phone</span>
          <input
            className={errors.phone ? styles.inputInvalid : styles.input}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={busy}
            placeholder="Optional"
          />
          {errors.phone ? <span className={styles.fieldError}>{errors.phone}</span> : null}
        </label>
        {errors.form ? <p className={styles.formError}>{errors.form}</p> : null}
        <div className={styles.modalActions}>
          <Button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}

type StatusConfirmModalProps = {
  client: Client
  busy: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}

function StatusConfirmModal({
  client,
  busy,
  onClose,
  onConfirm
}: StatusConfirmModalProps): React.JSX.Element {
  const activating = client.status === 'inactive'
  const title = activating ? 'Activate client' : 'Deactivate client'
  const message = activating
    ? `Activate "${client.name}"? They will show up again in the active client list.`
    : `Deactivate "${client.name}"? You can activate them again later.`

  return (
    <Modal labelledBy="status-confirm-title" busy={busy} onClose={onClose}>
      <h2 id="status-confirm-title" className={styles.modalTitle}>
        {title}
      </h2>
      <p className={styles.confirmMessage}>{message}</p>
      {busy ? <p className={styles.confirmBusy}>Updating…</p> : null}
      <div className={styles.modalActions}>
        <Button type="button" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="primary" disabled={busy} onClick={() => void onConfirm()}>
          {activating ? 'Activate' : 'Deactivate'}
        </Button>
      </div>
    </Modal>
  )
}

export function ClientsPage(): React.JSX.Element {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientListStatus>('active')
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; client: Client } | null>(
    null
  )
  const [statusConfirm, setStatusConfirm] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.api?.clients) return
    setLoading(true)
    setLoadError('')
    try {
      const rows = await window.api.clients.list({
        search: search.trim() || undefined,
        status: statusFilter
      })
      setClients(rows)
    } catch (error) {
      setLoadError(ipcErrorMessage(error))
      setClients([])
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const noResults = search.trim() !== '' || statusFilter !== 'active'
  const showEmpty = !loading && !loadError && clients.length === 0 && !noResults
  const showNoResults = !loading && !loadError && clients.length === 0 && noResults

  async function handleCreate(name: string, phone: string): Promise<void> {
    if (!window.api?.clients) return
    setSaving(true)
    try {
      await window.api.clients.create({ name, phone })
      setModal(null)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(client: Client, name: string, phone: string): Promise<void> {
    if (!window.api?.clients) return
    setSaving(true)
    try {
      await window.api.clients.update({ id: client.id, name, phone })
      setModal(null)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function confirmStatusChange(client: Client): Promise<void> {
    if (!window.api?.clients) return
    const next = client.status === 'active' ? 'inactive' : 'active'
    setStatusBusy(true)
    try {
      await window.api.clients.setStatus({ id: client.id, status: next })
      setStatusConfirm(null)
      await refresh()
    } catch (error) {
      setLoadError(ipcErrorMessage(error))
    } finally {
      setStatusBusy(false)
    }
  }

  return (
    <Page fullWidth hideDescription>
      <div className={styles.pageHeading}>
        <h2 className={styles.pageTitle}>Clients</h2>
        <p className={styles.pageSubtitle}>Create and review clients.</p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search name or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search clients"
          />
          <SearchableSelect
            className={styles.filterSelect}
            value={statusFilter}
            ariaLabel="Filter by status"
            placeholder="Status"
            searchPlaceholder="Search status"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
              { value: 'all', label: 'All' }
            ]}
            onChange={(next) => setStatusFilter(next as ClientListStatus)}
          />
        </div>
        <Button variant="primary" disabled={!window.api?.clients} onClick={() => setModal({ mode: 'create' })}>
          Add client
        </Button>
      </div>

      <section className={styles.card} aria-labelledby="clients-table-heading">
        <h2 id="clients-table-heading" className={styles.visuallyHidden}>
          Clients
        </h2>
        {loadError ? <p className={styles.stateMessage}>{loadError}</p> : null}
        {loading ? <p className={styles.stateMessage}>Loading…</p> : null}
        {showEmpty ? (
          <p className={styles.stateMessage}>No clients yet. Add your first client to get started.</p>
        ) : null}
        {showNoResults ? (
          <p className={styles.stateMessage}>No clients match your search or filters.</p>
        ) : null}
        {!loading && !loadError && clients.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Phone</th>
                  <th className={styles.num} scope="col">
                    Balance
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className={styles.visuallyHidden}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className={client.status === 'inactive' ? styles.rowInactive : undefined}
                  >
                    <td>{client.name}</td>
                    <td>{client.phone ?? '—'}</td>
                    <td className={styles.num}>{formatRupees(client.balance)}</td>
                    <td>
                      <span
                        className={
                          client.status === 'active' ? styles.badgeActive : styles.badgeInactive
                        }
                      >
                        {client.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Edit ${client.name}`}
                          onClick={() => setModal({ mode: 'edit', client })}
                        >
                          <Icon name="edit" />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={
                            client.status === 'active'
                              ? `Deactivate ${client.name}`
                              : `Activate ${client.name}`
                          }
                          disabled={!window.api?.clients}
                          onClick={() => setStatusConfirm(client)}
                        >
                          <Icon name={client.status === 'active' ? 'pause' : 'check'} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {modal?.mode === 'create' ? (
        <ClientFormModal
          title="Add client"
          initialName=""
          initialPhone=""
          busy={saving}
          onClose={() => setModal(null)}
          onSubmit={handleCreate}
        />
      ) : null}
      {modal?.mode === 'edit' ? (
        <ClientFormModal
          title="Edit client"
          initialName={modal.client.name}
          initialPhone={modal.client.phone ?? ''}
          busy={saving}
          onClose={() => setModal(null)}
          onSubmit={(name, phone) => handleUpdate(modal.client, name, phone)}
        />
      ) : null}
      {statusConfirm ? (
        <StatusConfirmModal
          client={statusConfirm}
          busy={statusBusy}
          onClose={() => {
            if (!statusBusy) setStatusConfirm(null)
          }}
          onConfirm={() => confirmStatusChange(statusConfirm)}
        />
      ) : null}
    </Page>
  )
}