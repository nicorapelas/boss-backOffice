import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { UserPerformanceSummary } from '../api/types'

type UserScoreCardPanelProps = {
  userId: string
  userLabel: string
}

const PERIOD_OPTIONS = [7, 30, 90] as const

function formatMoney(value: number): string {
  return `R ${value.toFixed(2)}`
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function UserScoreCardPanel({ userId, userLabel }: UserScoreCardPanelProps) {
  const [days, setDays] = useState<(typeof PERIOD_OPTIONS)[number]>(30)
  const [data, setData] = useState<UserPerformanceSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const summary = await apiFetch<UserPerformanceSummary>(
        `/users/${encodeURIComponent(userId)}/performance?days=${days}`,
      )
      setData(summary)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : 'Could not load score card')
    } finally {
      setLoading(false)
    }
  }, [userId, days])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="user-card-block user-score-card">
      <div className="user-card-block-header">
        <h4>Score card</h4>
        <div className="user-score-card-period" role="group" aria-label="Performance period">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`btn ghost small${days === option ? ' active' : ''}`}
              disabled={loading}
              onClick={() => setDays(option)}
            >
              {option}d
            </button>
          ))}
          <button
            type="button"
            className="btn ghost small"
            disabled={loading}
            onClick={() => void load()}
            title="Refresh"
          >
            {loading ? '…' : '↻'}
          </button>
        </div>
      </div>

      <p className="muted user-score-card-subtitle">
        Computed from sales, refunds, and attendance for {userLabel}.
      </p>

      {error ? <p className="error">{error}</p> : null}

      {data ? (
        <>
          <div className="user-score-card-kpis">
            <article className="user-score-card-kpi">
              <span className="user-score-card-kpi-label">Sales</span>
              <strong>{data.sales.count}</strong>
              <span className="muted">{formatMoney(data.sales.turnover)} turnover</span>
            </article>
            <article className="user-score-card-kpi">
              <span className="user-score-card-kpi-label">Net turnover</span>
              <strong>{formatMoney(data.sales.netTurnover)}</strong>
              <span className="muted">
                Cash {formatMoney(data.sales.cashTotal)} · Card {formatMoney(data.sales.cardTotal)}
              </span>
            </article>
            <article className="user-score-card-kpi">
              <span className="user-score-card-kpi-label">Refunds</span>
              <strong>{data.refunds.count}</strong>
              <span className="muted">{formatMoney(data.refunds.total)}</span>
            </article>
            <article className="user-score-card-kpi">
              <span className="user-score-card-kpi-label">Attendance</span>
              <strong>{data.attendance.totalHours}h</strong>
              <span className="muted">
                {data.attendance.sessionCount} session
                {data.attendance.sessionCount === 1 ? '' : 's'}
                {data.attendance.currentlyClockedIn ? (
                  <>
                    {' '}
                    ·{' '}
                    <span className="user-score-card-live">Clocked in</span>
                    {data.attendance.openSince
                      ? ` since ${formatWhen(data.attendance.openSince)}`
                      : ''}
                  </>
                ) : null}
              </span>
            </article>
          </div>

          {data.attendance.recentSessions.length > 0 ? (
            <div className="user-score-card-sessions">
              <h5>Recent attendance</h5>
              <table className="user-score-card-table">
                <thead>
                  <tr>
                    <th>Clock in</th>
                    <th>Clock out</th>
                    <th>Duration</th>
                    <th>Till</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attendance.recentSessions.map((session) => (
                    <tr key={session.id} className={session.status === 'open' ? 'is-open' : undefined}>
                      <td>{formatWhen(session.clockInAt)}</td>
                      <td>
                        {session.clockOutAt
                          ? formatWhen(session.clockOutAt)
                          : session.status === 'open'
                            ? '—'
                            : '—'}
                      </td>
                      <td>{formatDuration(session.durationMinutes)}</td>
                      <td>{session.tillCode ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted user-score-card-empty">No attendance sessions in this period.</p>
          )}
        </>
      ) : loading && !error ? (
        <p className="muted">Loading score card…</p>
      ) : null}
    </section>
  )
}
