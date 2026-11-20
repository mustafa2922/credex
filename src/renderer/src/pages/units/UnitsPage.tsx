import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ipcErrorMessage } from '../../../../shared/ipcError'
import type { Unit, UnitListStatus } from '../../../../shared/units'
import { Icon } from '@renderer/components/icons/Icon'
import { Page } from '@renderer/components/layout/Page'
import { Button } from '@renderer/components/ui/Button'
import { Modal } from '@renderer/components/ui/Modal'
import { Pagination } from '@renderer/components/ui/Pagination'
import { SearchableSelect } from '@renderer/components/ui/SearchableSelect'
import { useTablePagination } from '@renderer/hooks/useTablePagination'
import styles from './UnitsPage.module.css'

type FormErrors = {
  name?: string
  form?: string
}

type UnitFormModalProps = {
  title: string
  initialName: string
  busy: boolean
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}

function validateUnitForm(name: string): FormErrors {
  const errors: FormErrors = {}
  const trimmedName = name.trim()
  if (!trimmedName) {
    errors.name = 'Name is required'
  } else if (trimmedName.length > 30) {
    errors.name = 'Name must be at most 30 characters'
  }
  return errors
}

function UnitFormModal({
  title,
  initialName,
  busy,
  onClose,
  onSubmit
}: UnitFormModalProps): React.JSX.Element {
  const [name, setName] = useState(initialName)
  const [errors, setErrors] = useState<FormErrors>({})

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const next = validateUnitForm(name)
    if (next.name) {
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await onSubmit(name)
    } catch (error) {
      const message = ipcErrorMessage(error)
      if (message.includes('Unit already exists')) {
        setErrors({ name: 'Unit already exists' })
      } else {
        setErrors({ form: message })
      }
    }
  }

  return (
    <Modal labelledBy="unit-form-title" busy={busy} onClose={onClose}>
      <h2 id="unit-form-title" className={styles.modalTitle}>
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
  unit: Unit
  busy: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}

function StatusConfirmModal({
  unit,
  busy,
  onClose,
  onConfirm
}: StatusConfirmModalProps): React.JSX.Element {
  const activating = unit.status === 'inactive'
  const title = activating ? 'Activate unit' : 'Deactivate unit'
  const message = activating
    ? `Activate "${unit.name}"? It will show up again in the active unit list.`
    : `Deactivate "${unit.name}"? You can activate it again later.`

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

export function UnitsPage(): React.JSX.Element {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<UnitListStatus>('active')
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; unit: Unit } | null>(null)
  const [statusConfirm, setStatusConfirm] = useState<Unit | null>(null)
  const [saving, setSaving] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const pagination = useTablePagination(units, `${search}|${statusFilter}`)

  const refresh = useCallback(async () => {
    if (!window.api?.units) return
    setLoading(true)
    setLoadError('')
    try {
      const rows = await window.api.units.list({
        search: search.trim() || undefined,
        status: statusFilter
      })
      setUnits(rows)
    } catch (error) {
      setLoadError(ipcErrorMessage(error))
      setUnits([])
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const noResults = search.trim() !== '' || statusFilter !== 'active'
  const showEmpty = !loading && !loadError && units.length === 0 && !noResults
  const showNoResults = !loading && !loadError && units.length === 0 && noResults

  async function handleCreate(name: string): Promise<void> {
    if (!window.api?.units) return
    setSaving(true)
    try {
      await window.api.units.create({ name })
      setModal(null)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(unit: Unit, name: string): Promise<void> {
    if (!window.api?.units) return
    setSaving(true)
    try {
      await window.api.units.update({ id: unit.id, name })
      setModal(null)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function confirmStatusChange(unit: Unit): Promise<void> {
    if (!window.api?.units) return
    const next = unit.status === 'active' ? 'inactive' : 'active'
    setStatusBusy(true)
    try {
      await window.api.units.setStatus({ id: unit.id, status: next })
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
        <h2 className={styles.pageTitle}>Units</h2>
        <p className={styles.pageSubtitle}>Create and review units.</p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search units"
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
            onChange={(next) => setStatusFilter(next as UnitListStatus)}
          />
        </div>
        <Button
          variant="primary"
          disabled={!window.api?.units}
          onClick={() => setModal({ mode: 'create' })}
        >
          Add unit
        </Button>
      </div>

      <section className={styles.card} aria-labelledby="units-table-heading">
        <h2 id="units-table-heading" className={styles.visuallyHidden}>
          Units
        </h2>
        {loadError ? <p className={styles.stateMessage}>{loadError}</p> : null}
        {loading ? <p className={styles.stateMessage}>Loading…</p> : null}
        {showEmpty ? (
          <p className={styles.stateMessage}>No units yet. Add your first unit to get started.</p>
        ) : null}
        {showNoResults ? (
          <p className={styles.stateMessage}>No units match your search or filters.</p>
        ) : null}
        {!loading && !loadError && units.length > 0 ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className={styles.visuallyHidden}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.rows.map((unit) => (
                    <tr
                      key={unit.id}
                      className={unit.status === 'inactive' ? styles.rowInactive : undefined}
                    >
                      <td>{unit.name}</td>
                      <td>
                        <span
                          className={
                            unit.status === 'active' ? styles.badgeActive : styles.badgeInactive
                          }
                        >
                          {unit.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className={styles.actionsCell}>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={`Edit ${unit.name}`}
                            onClick={() => setModal({ mode: 'edit', unit })}
                          >
                            <Icon name="edit" />
                          </button>
                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={
                              unit.status === 'active'
                                ? `Deactivate ${unit.name}`
                                : `Activate ${unit.name}`
                            }
                            disabled={!window.api?.units}
                            onClick={() => setStatusConfirm(unit)}
                          >
                            <Icon name={unit.status === 'active' ? 'pause' : 'check'} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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

      {modal?.mode === 'create' ? (
        <UnitFormModal
          title="Add unit"
          initialName=""
          busy={saving}
          onClose={() => setModal(null)}
          onSubmit={handleCreate}
        />
      ) : null}
      {modal?.mode === 'edit' ? (
        <UnitFormModal
          title="Edit unit"
          initialName={modal.unit.name}
          busy={saving}
          onClose={() => setModal(null)}
          onSubmit={(name) => handleUpdate(modal.unit, name)}
        />
      ) : null}
      {statusConfirm ? (
        <StatusConfirmModal
          unit={statusConfirm}
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
