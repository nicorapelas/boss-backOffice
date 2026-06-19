import type { BackOfficeUser, UserHrProfile, UserPaymentTerms } from '../api/types'

export const PAYMENT_TERM_OPTIONS: { value: UserPaymentTerms; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
]

export type HrProfileDraft = {
  phone: string
  startDate: string
  paymentTerms: UserPaymentTerms | ''
  paymentAmount: string
  notes: string
  loans: Array<{
    key: string
    startDate: string
    amount: string
    terms: string
    notes: string
  }>
}

export function emptyHrProfileDraft(): HrProfileDraft {
  return {
    phone: '',
    startDate: '',
    paymentTerms: '',
    paymentAmount: '',
    notes: '',
    loans: [],
  }
}

export function hrProfileDraftFromUser(user: BackOfficeUser): HrProfileDraft {
  const hr = user.hrProfile
  if (!hr) return emptyHrProfileDraft()
  return {
    phone: hr.phone ?? '',
    startDate: hr.startDate ?? '',
    paymentTerms: hr.paymentTerms ?? '',
    paymentAmount: hr.paymentAmount != null ? String(hr.paymentAmount) : '',
    notes: hr.notes ?? '',
    loans: (hr.loans ?? []).map((loan, i) => ({
      key: loan._id ?? `loan-${i}`,
      startDate: loan.startDate ?? '',
      amount: loan.amount != null ? String(loan.amount) : '',
      terms: loan.terms ?? '',
      notes: loan.notes ?? '',
    })),
  }
}

export function hrProfilePayloadFromDraft(draft: HrProfileDraft): UserHrProfile {
  const paymentAmount = draft.paymentAmount.trim()
  const parsedAmount = paymentAmount ? Number(paymentAmount.replace(',', '.')) : null
  return {
    phone: draft.phone.trim() || null,
    startDate: draft.startDate.trim() || null,
    paymentTerms: draft.paymentTerms || null,
    paymentAmount:
      parsedAmount != null && Number.isFinite(parsedAmount) && parsedAmount >= 0
        ? Math.round(parsedAmount * 100) / 100
        : null,
    notes: draft.notes.trim() || null,
    loans: draft.loans.map((loan) => {
      const amountStr = loan.amount.trim()
      const amount = amountStr ? Number(amountStr.replace(',', '.')) : null
      return {
        startDate: loan.startDate.trim() || null,
        amount:
          amount != null && Number.isFinite(amount) && amount >= 0
            ? Math.round(amount * 100) / 100
            : null,
        terms: loan.terms.trim() || null,
        notes: loan.notes.trim() || null,
      }
    }),
  }
}
