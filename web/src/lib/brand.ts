// One place for the club's name and colors, so a rename is a one-file change.
export const BRAND = {
  name: 'Gwinnett County Young Republicans',
  short: 'Gwinnett YR',
  slug: 'gcyr', // the organization's slug in the `campaigns` table
  navy: '#0f2a5e',
  red: '#C8102E',
}

// Public sign-up link for sharing (QR codes, Instagram bio, flyers).
export function joinUrl(slug: string = BRAND.slug) {
  return `${window.location.origin}/join${slug === BRAND.slug ? '' : `/${slug}`}`
}
