export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function maskPhone(phone: string): string {
  const digits = normalizePhone(phone)
  if (digits.length <= 4) return '****'
  const last4 = digits.slice(-4)
  if (digits.length <= 7) return `*** ${last4}`
  return `*** *** ${last4}`
}
