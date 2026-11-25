import type { MemberRole } from './types'

// Pages the board can switch on for individual members.
export type Feature = 'precinct_info' | 'voter_outreach' | 'event_checkin' | 'recruiting'

export const FEATURES: { key: Feature; label: string; path: string; blurb: string }[] = [
  { key: 'precinct_info', label: 'Precincts', path: '/app/precincts', blurb: 'Precinct maps, polling places and precinct captains.' },
  { key: 'voter_outreach', label: 'Voter outreach', path: '/app/outreach', blurb: 'Voter lists for door-knocking, calls and texts.' },
  { key: 'event_checkin', label: 'Check-in desk', path: '/app/checkin-desk', blurb: 'Run the door at events and see who checked in.' },
  { key: 'recruiting', label: 'Recruiting', path: '/app/recruiting', blurb: 'Young Republican voters to invite to the club.' },
]

// How each database role is shown in the club.
export const ROLE_LABELS: Record<MemberRole, string> = {
  manager: 'Chairman',
  deputy: 'Board',
  member: 'Member',
  volunteer: 'Volunteer',
  viewer: 'Viewer',
}

export const isBoardRole = (r: MemberRole | undefined) => r === 'manager' || r === 'deputy'
