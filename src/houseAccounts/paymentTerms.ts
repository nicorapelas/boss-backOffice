/** Mirrors server HOUSE_ACCOUNT_PAYMENT_TERMS */
export type HouseAccountPaymentTerms = '' | 'cod' | '7_days' | '30_days' | 'end_of_month'

export const HOUSE_ACCOUNT_PAYMENT_TERM_OPTIONS: { value: HouseAccountPaymentTerms; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: 'cod', label: 'COD (cash on delivery / pickup)' },
  { value: '7_days', label: '7 days' },
  { value: '30_days', label: '30 days' },
  { value: 'end_of_month', label: 'End of month' },
]

export function paymentTermsLabel(value: string | undefined | null): string {
  if (!value) return '—'
  return HOUSE_ACCOUNT_PAYMENT_TERM_OPTIONS.find((o) => o.value === value)?.label ?? value
}
