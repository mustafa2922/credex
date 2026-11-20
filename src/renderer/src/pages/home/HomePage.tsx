import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import type { DashboardSummary } from '../../../../shared/dashboard'
import { ipcErrorMessage } from '../../../../shared/ipcError'
import { paymentStatusLabel, type PaymentStatus } from '../../../../shared/payments'
import { Icon } from '@renderer/components/icons/Icon'
import { Page } from '@renderer/components/layout/Page'
import { Money } from '@renderer/components/ui/Money'
import { InvoiceStatusChart } from './InvoiceStatusChart'
import { RevenueChart } from './RevenueChart'
import styles from './HomePage.module.css'

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning!'
  if (hour < 17) return 'Good afternoon!'
  return 'Good evening!'
}

function formatTimestamp(now: Date): string {
  const date = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const time = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })
  return `${date} - ${time}`
}

function paymentBadgeClass(status: PaymentStatus): string {
  if (status === 'paid') return styles.badgePaid
  if (status === 'partial') return styles.badgePartial
  return styles.badgeUnpaid
}

export function HomePage(): React.JSX.Element {
  const navigate = useNavigate()
  const [now, setNow] = useState(() => new Date())
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const next = await window.api.dashboard.getSummary()
      setSummary(next)
    } catch (err) {
      setSummary(null)
      setError(ipcErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <Page fullWidth hideDescription>
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <p className={styles.crumb}>Home / Overview</p>
          <h2 className={styles.greeting}>
            {greetingForHour(now.getHours())}{' '}
            <span className={styles.wave} aria-hidden>
              👋
            </span>
          </h2>
          <p className={styles.timestamp}>{formatTimestamp(now)}</p>
        </header>

        {error ? <p className={`${styles.stateMessage} ${styles.errorMessage}`}>{error}</p> : null}

        <section className={styles.kpis} aria-label="Key metrics">
          <article className={`${styles.card} ${styles.kpi}`}>
            <div className={styles.kpiTop}>
              <p className={styles.kpiLabel}>Receivable</p>
              <span className={styles.kpiIcon} aria-hidden>
                <Icon name="payments" width={16} height={16} />
              </span>
            </div>
            <p className={`${styles.kpiValue} ${styles.kpiValuePositive}`}>
              {loading && !summary ? '…' : <Money paisa={summary?.receivable ?? 0} />}
            </p>
            <p className={styles.kpiNote}>Outstanding balance</p>
          </article>

          <article className={`${styles.card} ${styles.kpi}`}>
            <div className={styles.kpiTop}>
              <p className={styles.kpiLabel}>Open invoices</p>
              <span className={styles.kpiIcon} aria-hidden>
                <Icon name="invoices" width={16} height={16} />
              </span>
            </div>
            <p className={styles.kpiValue}>{summary ? summary.open_invoices : loading ? '…' : 0}</p>
            <p className={styles.kpiNote}>Unpaid + partial</p>
          </article>

          <article className={`${styles.card} ${styles.kpi}`}>
            <div className={styles.kpiTop}>
              <p className={styles.kpiLabel}>Collected this month</p>
              <span className={styles.kpiIcon} aria-hidden>
                <Icon name="check" width={16} height={16} />
              </span>
            </div>
            <p className={`${styles.kpiValue} ${styles.kpiValuePositive}`}>
              {loading && !summary ? '…' : <Money paisa={summary?.collected_this_month ?? 0} />}
            </p>
            <p className={styles.kpiNote}>Active payments</p>
          </article>

          <article className={`${styles.card} ${styles.kpi}`}>
            <div className={styles.kpiTop}>
              <p className={styles.kpiLabel}>Active clients</p>
              <span className={styles.kpiIcon} aria-hidden>
                <Icon name="clients" width={16} height={16} />
              </span>
            </div>
            <p className={`${styles.kpiValue} ${styles.kpiValueAccent}`}>
              {summary ? summary.active_clients : loading ? '…' : 0}
            </p>
            <p className={styles.kpiNote}>Registered clients</p>
          </article>
        </section>

        <section className={styles.charts} aria-label="Charts">
          <article className={`${styles.card} ${styles.chartCard}`}>
            <div className={styles.cardHeading}>
              <div>
                <h3 className={styles.cardTitle}>Revenue &amp; collections</h3>
                <p className={styles.cardSubtitle}>Last 6 months</p>
              </div>
            </div>
            <div className={styles.chartBody}>
              <RevenueChart months={summary?.monthly ?? []} />
            </div>
            <div className={styles.legend} aria-hidden>
              <span className={styles.legendItem}>
                <i className={`${styles.dot} ${styles.dotInvoiced}`} />
                Invoiced
              </span>
              <span className={styles.legendItem}>
                <i className={`${styles.dot} ${styles.dotCollected}`} />
                Collected
              </span>
            </div>
          </article>

          <article className={`${styles.card} ${styles.chartCard}`}>
            <div className={styles.cardHeading}>
              <div>
                <h3 className={styles.cardTitle}>Invoice status</h3>
                <p className={styles.cardSubtitle}>Issued invoices only</p>
              </div>
            </div>
            <InvoiceStatusChart
              paid={summary?.invoice_status.paid ?? 0}
              partial={summary?.invoice_status.partial ?? 0}
              unpaid={summary?.invoice_status.unpaid ?? 0}
            />
          </article>
        </section>

        <section className={`${styles.card} ${styles.recent}`} aria-label="Recent invoices">
          <div className={styles.recentHeader}>
            <h3 className={styles.cardTitle}>Recent invoices</h3>
            <button type="button" className={styles.viewAll} onClick={() => navigate('/invoices')}>
              View all →
            </button>
          </div>

          {!summary || summary.recent_invoices.length === 0 ? (
            <p className={styles.stateMessage}>
              {loading ? 'Loading…' : 'No issued invoices yet.'}
            </p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th className={styles.num}>Total</th>
                    <th className={styles.num}>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recent_invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className={styles.clickable}
                      tabIndex={0}
                      onClick={() => navigate(`/invoices/${invoice.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          navigate(`/invoices/${invoice.id}`)
                        }
                      }}
                    >
                      <td className={styles.invoiceNumber}>{invoice.number}</td>
                      <td className={styles.clientName}>{invoice.client_name}</td>
                      <td className={styles.num}>
                        <Money paisa={invoice.total} />
                      </td>
                      <td className={styles.num}>
                        <Money paisa={invoice.due} />
                      </td>
                      <td>
                        <span className={paymentBadgeClass(invoice.payment_status)}>
                          {paymentStatusLabel(invoice.payment_status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
