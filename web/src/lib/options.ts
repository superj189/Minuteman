// Dropdown / form option lists, matching the enums defined in the database
// (migrations 0001 / 0004). Each entry is [db value, human label].

export const CONTACT_OUTCOMES = [
  ['talked', 'Talked'],
  ['not_home', 'Not home'],
  ['refused', 'Refused'],
  ['not_interested', 'Not interested'],
  ['moved', 'Moved'],
  ['wrong_address', 'Wrong address'],
  ['deceased', 'Deceased'],
  ['other', 'Other'],
] as const

export const CONTACT_CHANNELS = [
  ['door', 'Door'],
  ['phone', 'Phone'],
  ['sms', 'Text'],
  ['email', 'Email'],
  ['event', 'Event'],
] as const

export const CONTACT_SOURCES = [
  ['door', 'At the door'],
  ['event', 'Event'],
  ['self_reported', 'Self-reported'],
  ['purchased', 'Purchased'],
  ['party', 'Party'],
  ['other', 'Other'],
] as const

// Support score: 1 = strong opponent … 5 = strong supporter.
export const SUPPORT_SCORES = [
  [1, 'Strong opponent'],
  [2, 'Lean opponent'],
  [3, 'Undecided'],
  [4, 'Lean support'],
  [5, 'Strong support'],
] as const

// The consent permissions a voter can grant/revoke (enum consent_kind).
export const CONSENT_TYPES = [
  ['contact_general', 'General contact'],
  ['contact_phone', 'Phone calls'],
  ['contact_sms', 'Text messages'],
  ['contact_email', 'Email'],
  ['donation_solicitation', 'OK to ask for donations'],
  ['yard_sign', 'Yard sign'],
] as const

export function labelFor(
  list: readonly (readonly [string | number, string])[],
  value: string | number | null | undefined,
): string {
  if (value == null) return ''
  const found = list.find(([v]) => v === value)
  return found ? found[1] : String(value)
}
