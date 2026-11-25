import { useAuth } from '../auth/AuthProvider'
import { FEATURES, type Feature } from '../lib/access'
import NoAccess from '../components/NoAccess'

// What each section will hold once its data exists. Until then the page shows
// what's coming, so granted members know they're in the right place.
const COMING: Partial<Record<Feature, string[]>> = {
  precinct_info: [
    'A map of every Gwinnett precinct with its polling place.',
    'Precinct captains and the members who live in each precinct.',
    'Turnout history for young Republican voters by precinct.',
  ],
  voter_outreach: [
    'Lists of voters to contact, assigned to you by the board.',
    'Door-knocking maps and a way to log each conversation.',
    'Call and text scripts, with opt-outs tracked automatically.',
  ],
  recruiting: [
    'Young Republican voters in Gwinnett (ages 18–40) who are not members yet.',
    'Filters by city, ZIP and precinct to plan outreach.',
    'Track who has been invited and who joined.',
  ],
}

export default function GatedPage({ feature }: { feature: Feature }) {
  const { can } = useAuth()
  const meta = FEATURES.find((f) => f.key === feature)!
  if (!can(feature)) return <NoAccess what={meta.label} />

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900">{meta.label}</h1>
      <p className="text-sm text-slate-500 mt-1">{meta.blurb}</p>
      <div className="mt-5 bg-white rounded-lg border border-slate-200 p-5">
        <div className="text-sm font-semibold text-slate-900">Coming once the Gwinnett voter file is loaded</div>
        <ul className="mt-3 space-y-2 text-sm text-slate-600 list-disc pl-5">
          {(COMING[feature] ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
