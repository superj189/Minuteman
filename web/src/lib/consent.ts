import { BRAND } from './brand'

// The exact wording people agree to on the public forms. It's saved with each
// sign-up / check-in as proof of consent, so change it with care.
export const EMAIL_CONSENT = `Yes, email me news and event invites from the ${BRAND.name}. I can unsubscribe anytime.`
export const SMS_CONSENT = `Yes, text me updates and event reminders from the ${BRAND.name} at the number above. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Agreeing is not required to join.`

export function consentText(emailOk: boolean, smsOk: boolean): string | null {
  const parts = [emailOk ? EMAIL_CONSENT : null, smsOk ? SMS_CONSENT : null].filter(Boolean)
  return parts.length ? parts.join(' | ') : null
}
