import type { HouseAccountStatement } from '../api/types'

function csvCell(value: string | number): string {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function houseAccountStatementToCsv(statement: HouseAccountStatement): string {
  const lines: string[] = []
  const a = statement.account
  lines.push('House account statement')
  lines.push(`Store,${csvCell(statement.store.name)}`)
  lines.push(`Account number,${csvCell(a.accountNumber)}`)
  lines.push(`Account name,${csvCell(a.name)}`)
  lines.push(`Period from,${csvCell(fmtDate(statement.periodFrom))}`)
  lines.push(`Period to,${csvCell(fmtDate(statement.periodTo))}`)
  lines.push(`Opening balance,${csvCell(statement.openingBalance.toFixed(2))}`)
  lines.push(`Closing balance,${csvCell(statement.closingBalance.toFixed(2))}`)
  lines.push('')
  lines.push(
    [
      'Date',
      'Type',
      'Sale ref',
      'PO',
      'Till',
      'Description',
      'Qty',
      'Unit price',
      'Line total',
      'Debit',
      'Credit',
      'Balance',
      'Note',
    ].join(','),
  )

  for (const row of statement.rows) {
    if (row.kind === 'charge' && row.charge) {
      const c = row.charge
      const ref = c.saleId ?? ''
      const po = c.purchaseOrderNumber ?? ''
      const till = c.tillCode ?? ''
      if (c.items.length > 0) {
        for (const item of c.items) {
          lines.push(
            [
              fmtDate(row.date),
              'charge',
              csvCell(ref),
              csvCell(po),
              csvCell(till),
              csvCell(item.name),
              csvCell(item.quantity),
              csvCell(item.unitPrice.toFixed(2)),
              csvCell(item.lineTotal.toFixed(2)),
              csvCell(row.debit.toFixed(2)),
              '',
              csvCell(row.balanceAfter.toFixed(2)),
              csvCell(row.note ?? ''),
            ].join(','),
          )
        }
        if (c.saleTotal > c.onAccountAmount + 0.005) {
          lines.push(
            [
              '',
              '',
              '',
              '',
              '',
              csvCell(`Sale total ${c.saleTotal.toFixed(2)} · On account ${c.onAccountAmount.toFixed(2)}`),
              '',
              '',
              '',
              '',
              '',
              '',
              '',
            ].join(','),
          )
        }
      } else {
        lines.push(
          [
            fmtDate(row.date),
            'charge',
            csvCell(ref),
            csvCell(po),
            csvCell(till),
            csvCell(row.note ?? 'Charge'),
            '',
            '',
            '',
            csvCell(row.debit.toFixed(2)),
            '',
            csvCell(row.balanceAfter.toFixed(2)),
            csvCell(row.note ?? ''),
          ].join(','),
        )
      }
      continue
    }
    lines.push(
      [
        fmtDate(row.date),
        row.kind,
        '',
        '',
        '',
        csvCell(row.kind === 'payment' ? 'Payment' : row.kind),
        '',
        '',
        '',
        '',
        csvCell(row.credit.toFixed(2)),
        csvCell(row.balanceAfter.toFixed(2)),
        csvCell(
          [
            row.note,
            row.cashAmount != null ? `cash ${row.cashAmount.toFixed(2)}` : '',
            row.cardAmount != null ? `card ${row.cardAmount.toFixed(2)}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        ),
      ].join(','),
    )
  }

  return `${lines.join('\n')}\n`
}

export function downloadHouseAccountStatementCsv(statement: HouseAccountStatement): void {
  const csv = houseAccountStatementToCsv(statement)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = statement.account.accountNumber.replace(/[^\w-]+/g, '_')
  a.href = url
  a.download = `house-account-${safeName}-statement.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function formatStatementDate(iso: string): string {
  return fmtDate(iso)
}
