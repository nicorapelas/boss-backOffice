import type { StaffShiftPerformanceResponse } from '../api/types'

type StaffShiftPerformancePanelProps = {
  data: StaffShiftPerformanceResponse | null
}

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

export function StaffShiftPerformancePanel({ data }: StaffShiftPerformancePanelProps) {
  if (!data) {
    return <p className="muted">Loading staff shift stats…</p>
  }

  if (!data.attendanceEnabled) {
    return (
      <p className="muted">
        Staff attendance is disabled in store settings. Enable it to track shift performance here.
      </p>
    )
  }

  if (data.staff.length === 0) {
    return <p className="muted">No staff are clocked in right now.</p>
  }

  return (
    <>
      <p className="muted dashboard-staff-shift-lead">
        Live stats since each person&apos;s clock-in · updated {formatWhen(data.generatedAt)}
      </p>
      <div className="dashboard-staff-shift-table-wrap">
        <table className="table dashboard-staff-shift-table">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Clock in</th>
              <th>Shift</th>
              <th>Till</th>
              <th className="num">Sales</th>
              <th className="num">Turnover</th>
              <th className="num">Net</th>
              <th className="num">Refunds</th>
            </tr>
          </thead>
          <tbody>
            {data.staff.map((row) => (
              <tr key={row.sessionId}>
                <td>
                  <div className="dashboard-staff-shift-name">
                    <strong>{row.displayName}</strong>
                    {row.roleName ? <span className="muted dashboard-staff-shift-role">{row.roleName}</span> : null}
                  </div>
                </td>
                <td>{formatWhen(row.clockInAt)}</td>
                <td>{formatDuration(row.shiftMinutes)}</td>
                <td>{row.tillCode ?? '—'}</td>
                <td className="num">{row.salesCount.toLocaleString()}</td>
                <td className="num">
                  <span>{formatMoney(row.turnover)}</span>
                  <span className="muted dashboard-staff-shift-tenders">
                    {formatMoney(row.cashTotal)} cash · {formatMoney(row.cardTotal)} card
                  </span>
                </td>
                <td className="num">{formatMoney(row.netTurnover)}</td>
                <td className="num">
                  {row.refundCount > 0 ? (
                    <>
                      {row.refundCount} · {formatMoney(row.refundTotal)}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
