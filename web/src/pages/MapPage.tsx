import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GeoJsonObject } from 'geojson'
import boundaryRaw from '../data/hd100_boundary.json'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { TIER_ORDER, tierMeta } from '../lib/tiers'
import {
  HOUSEHOLD_COLUMNS,
  ROSTER_COLUMNS,
  VOTER_COLUMNS,
  type Household,
  type RosterVoter,
  type Voter,
} from '../lib/types'
import VoterDetail from '../components/VoterDetail'

const boundary = boundaryRaw as GeoJsonObject
const CENTER: [number, number] = [34.1238, -84.0623] // district centroid (project doc §3)

// A household's headline tier: its best (lowest-#) non-DNC resident, or T6 if the
// whole door is do-not-contact. Drives both the marker color and the tier filter.
function displayTier(hh: Household): number {
  return hh.best_tier ?? 6
}

// Pull every geocoded household for the campaign, 1,000 rows at a time
// (Supabase caps a single response at 1,000 rows).
async function fetchAllHouseholds(campaignId: string): Promise<Household[]> {
  const pageSize = 1000
  let from = 0
  const all: Household[] = []
  for (;;) {
    const { data, error } = await supabase
      .from('households')
      .select(HOUSEHOLD_COLUMNS)
      .eq('campaign_id', campaignId)
      .not('lat', 'is', null)
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data as unknown as Household[]) ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

// Imperatively draws the household markers onto Leaflet's canvas. Doing this with
// a plain Leaflet layer (rather than ~18k React components) keeps it fast.
function HouseholdLayer({
  households,
  visible,
  onSelect,
}: {
  households: Household[]
  visible: Set<number>
  onSelect: (hh: Household) => void
}) {
  const map = useMap()
  useEffect(() => {
    const group = L.layerGroup().addTo(map)
    for (const hh of households) {
      if (hh.lat == null || hh.lon == null) continue
      const dt = displayTier(hh)
      if (!visible.has(dt)) continue
      const color = tierMeta(dt).color
      const marker = L.circleMarker([hh.lat, hh.lon], {
        radius: 3 + Math.min(hh.voter_count, 8) * 0.7, // bigger door = bigger dot
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 0,
      })
      marker.on('click', () => onSelect(hh))
      marker.addTo(group)
    }
    return () => {
      map.removeLayer(group)
    }
  }, [households, visible, map, onSelect])
  return null
}

export default function MapPage() {
  const { activeCampaign } = useAuth()
  const campaignId = activeCampaign?.campaign_id

  const [households, setHouseholds] = useState<Household[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState<Set<number>>(new Set(TIER_ORDER))

  const [selected, setSelected] = useState<Household | null>(null)
  const [roster, setRoster] = useState<RosterVoter[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [selectedVoter, setSelectedVoter] = useState<Voter | null>(null)

  // Load households once per campaign.
  useEffect(() => {
    if (!campaignId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAllHouseholds(campaignId)
      .then((rows) => {
        if (!cancelled) setHouseholds(rows)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? 'Failed to load households')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [campaignId])

  // Load the roster for the clicked household.
  useEffect(() => {
    if (!selected) {
      setRoster([])
      return
    }
    let cancelled = false
    setRosterLoading(true)
    supabase
      .from('voters')
      .select(ROSTER_COLUMNS)
      .eq('household_id', selected.id)
      .order('tier', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        if (!cancelled) {
          setRoster((data as unknown as RosterVoter[]) ?? [])
          setRosterLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  // Count households per headline tier (for the legend).
  const counts = useMemo(() => {
    const c: Record<number, number> = {}
    for (const hh of households) {
      const dt = displayTier(hh)
      c[dt] = (c[dt] ?? 0) + 1
    }
    return c
  }, [households])

  const toggleTier = useCallback((tier: number) => {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })
  }, [])

  const handleSelect = useCallback((hh: Household) => setSelected(hh), [])

  // Clicking a resident loads their full record and opens the logging drawer.
  const openVoter = useCallback(async (id: string) => {
    const { data } = await supabase.from('voters').select(VOTER_COLUMNS).eq('id', id).single()
    if (data) setSelectedVoter(data as unknown as Voter)
  }, [])

  return (
    <div className="relative" style={{ height: 'calc(100vh - 56px)' }}>
      <MapContainer center={CENTER} zoom={12} preferCanvas style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap contributors'
        />
        <GeoJSON
          data={boundary}
          style={{ color: '#60a5fa', weight: 2, dashArray: '6', fillOpacity: 0 }}
        />
        {!loading && (
          <HouseholdLayer households={households} visible={visible} onSelect={handleSelect} />
        )}
      </MapContainer>

      {/* Legend + tier filter */}
      <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur rounded-lg shadow-lg p-3 text-sm w-56">
        <div className="font-semibold text-slate-900 mb-2">
          {households.length.toLocaleString()} households
        </div>
        <div className="space-y-1">
          {TIER_ORDER.map((t) => {
            const tm = tierMeta(t)
            return (
              <label
                key={t}
                className="flex items-center gap-2 cursor-pointer select-none hover:bg-slate-50 rounded px-1 py-0.5"
              >
                <input
                  type="checkbox"
                  checked={visible.has(t)}
                  onChange={() => toggleTier(t)}
                />
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: tm.color }} />
                <span className="text-slate-700 flex-1">
                  {tm.short} {tm.label}
                </span>
                <span className="text-slate-400 text-xs">{(counts[t] ?? 0).toLocaleString()}</span>
              </label>
            )
          })}
        </div>
        <div className="text-[11px] text-slate-400 mt-2 leading-tight">
          Each dot is one address, colored by its best target. Bigger dot = more voters.
        </div>
      </div>

      {/* Loading / error overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 text-white">
          Loading households…
        </div>
      )}
      {error && (
        <div className="absolute top-3 left-3 z-[1000] bg-red-600 text-white text-sm rounded-lg px-3 py-2 shadow-lg">
          {error}
        </div>
      )}

      {/* Selected household roster card */}
      {selected && (
        <div className="absolute bottom-3 left-3 z-[1000] bg-white rounded-lg shadow-xl p-4 text-sm w-80 max-h-[60%] overflow-y-auto">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="font-semibold text-slate-900">{selected.full_address}</div>
            <button
              onClick={() => setSelected(null)}
              className="text-slate-400 hover:text-slate-700 leading-none text-lg"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="text-xs text-slate-500 mb-1">
            {selected.voter_count} {selected.voter_count === 1 ? 'voter' : 'voters'} at this address
          </div>
          <div className="text-[11px] text-blue-600 mb-2">Tap a name to log a visit →</div>
          {rosterLoading ? (
            <div className="text-slate-400">Loading residents…</div>
          ) : (
            <ul className="space-y-0.5">
              {roster.map((v) => {
                const tm = tierMeta(v.tier)
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => openVoter(v.id)}
                      className="w-full flex items-center gap-2 text-left rounded px-1.5 py-1 hover:bg-blue-50"
                    >
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white shrink-0"
                        style={{ background: tm.color }}
                      >
                        {tm.short}
                      </span>
                      <span className="text-slate-800 flex-1">
                        {(v.last_name ?? '').trim()}, {(v.first_name ?? '').trim()}
                      </span>
                      <span className="text-slate-400 text-xs">{v.age ?? ''}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {selectedVoter && (
        <VoterDetail voter={selectedVoter} onClose={() => setSelectedVoter(null)} />
      )}
    </div>
  )
}
