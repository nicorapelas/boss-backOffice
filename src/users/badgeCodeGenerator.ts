export const BADGE_CODE_LENGTH = 25

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghjkmnpqrstuvwxyz'
const DIGIT = '23456789'
const ALPHABET = UPPER + LOWER + DIGIT

export function collectUsedBadgeCodes(users: { badgeCode?: string | null }[]): Set<string> {
  const used = new Set<string>()
  for (const u of users) {
    const value = u.badgeCode?.trim()
    if (value) used.add(value.toUpperCase())
  }
  return used
}

function isBadgeTaken(used: Set<string>, candidate: string): boolean {
  return used.has(candidate.trim().toUpperCase())
}

function randomChar(from: string): string {
  const bytes = new Uint8Array(1)
  crypto.getRandomValues(bytes)
  return from[bytes[0] % from.length]!
}

function shuffleChars(chars: string[]): string[] {
  const out = [...chars]
  for (let i = out.length - 1; i > 0; i--) {
    const bytes = new Uint8Array(1)
    crypto.getRandomValues(bytes)
    const j = bytes[0] % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** One 25-character badge with upper, lower, and digit characters. */
function generateRandomBadgeCandidate(): string {
  const chars: string[] = [randomChar(UPPER), randomChar(LOWER), randomChar(DIGIT)]
  while (chars.length < BADGE_CODE_LENGTH) {
    chars.push(randomChar(ALPHABET))
  }
  return shuffleChars(chars).join('')
}

/** Produces a 25-character badge code not present in `used` (case-insensitive). */
export function generateUniqueBadgeCode(used: Set<string>): string {
  for (let attempt = 0; attempt < 120; attempt++) {
    const candidate = generateRandomBadgeCandidate()
    if (!isBadgeTaken(used, candidate)) return candidate
  }
  throw new Error('Could not generate a unique badge code. Try again or enter one manually.')
}
