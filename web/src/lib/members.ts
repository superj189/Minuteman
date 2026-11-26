// Club members (people who signed up or were added by an officer).

export type MemberStatus = 'new' | 'contacted' | 'active' | 'dues_paid' | 'inactive'

export interface ClubMember {
  id: string
  campaign_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  birth_date: string | null
  zip: string | null
  interests: string[]
  how_heard: string | null
  email_opt_in: boolean
  sms_opt_in: boolean
  consent_text: string | null
  consent_at: string | null
  status: MemberStatus
  source: 'signup_page' | 'event' | 'manual' | 'import' | 'account'
  notes: string | null
  created_at: string
  user_id?: string | null // set when this person has a member login
}

export interface ConsentEvent {
  id: string
  channel: 'email' | 'sms'
  granted: boolean
  source: string
  occurred_at: string
}

export const STATUSES: { value: MemberStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: '#2563eb' },
  { value: 'contacted', label: 'Contacted', color: '#7c3aed' },
  { value: 'active', label: 'Active', color: '#16a34a' },
  { value: 'dues_paid', label: 'Dues paid', color: '#b45309' },
  { value: 'inactive', label: 'Inactive', color: '#64748b' },
]

export const statusInfo = (s: MemberStatus) => STATUSES.find((x) => x.value === s) ?? STATUSES[0]

export const SOURCE_LABELS: Record<ClubMember['source'], string> = {
  signup_page: 'Sign-up page',
  event: 'Event',
  manual: 'Added by officer',
  import: 'Imported',
  account: 'Created an account',
}

export function ageFrom(birth: string | null): number | null {
  if (!birth) return null
  const b = new Date(birth + 'T00:00:00')
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--
  return age
}

export function formatPhone(p: string | null): string {
  if (!p) return ''
  const d = p.replace(/\D/g, '')
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p
}

// Build a CSV file and hand it to the browser as a download.
export function downloadCsv(filename: string, rows: ClubMember[]) {
  const cols: [string, (m: ClubMember) => string | number | null][] = [
    ['First name', (m) => m.first_name],
    ['Last name', (m) => m.last_name],
    ['Email', (m) => m.email],
    ['Phone', (m) => m.phone],
    ['Age', (m) => ageFrom(m.birth_date)],
    ['ZIP', (m) => m.zip],
    ['Status', (m) => statusInfo(m.status).label],
    ['Email OK', (m) => (m.email_opt_in ? 'yes' : 'no')],
    ['Text OK', (m) => (m.sms_opt_in ? 'yes' : 'no')],
    ['Interests', (m) => m.interests.join('; ')],
    ['How heard', (m) => m.how_heard],
    ['Source', (m) => SOURCE_LABELS[m.source]],
    ['Joined', (m) => m.created_at.slice(0, 10)],
    ['Notes', (m) => m.notes],
  ]
  const esc = (v: string | number | null) => {
    let s = v == null ? '' : String(v)
    // Sign-ups come from the public, so stop Excel treating text as a formula.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.map((c) => c[0]).join(','), ...rows.map((m) => cols.map((c) => esc(c[1](m))).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
