import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import type { GeoJsonObject } from 'geojson'
import boundaryRaw from '../data/hd100_boundary.json'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { TIER_ORDER, tierMeta } from '../lib/tiers'
import { fetchAllHouseholds } from '../lib/households'
import {
  ROSTER_COLUMNS,
  VOTER_COLUMNS,
  type Household,
  type RosterVoter,
  type Voter,
  type Turf,
  type TurfAssignmentRow,
  type TeamMember,
} from '../lib/types'
import VoterDetail from '../components/VoterDetail'

const boundary = boundaryRaw as GeoJsonObject
const CENTER: [number, number] = [34.1238, -84.0623] // district centroid (project doc §3)
const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']

function displayTier(hh: Household): number {
  return hh.best_tier ?? 6
}

function memberName(m: TeamMember | undefined): string {
  if (!m) return 'Unknown'
  return m.full_name || m.email || 'User'
}

// Colored household markers, drawn imperatively on the canvas for speed.
// pmIgnore keeps Geoman from trying to snap to / edit the 18k dots.
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opts: any = {
        radius: 3 + Math.min(hh.voter_count, 8) * 0.7,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 0,
        pmIgnore: true,
      }
      const marker = L.circleMarker([hh.lat, hh.lon], opts)
      marker.on('click', () => onSelect(hh))
      marker.addTo(group)
    }
    return () => {
      map.removeLayer(group)
    }
  }, [households, visible, map, onSelect])
  return null
}

// Geoman draw controls (admins). Snapping magnetizes vertices to the district
// boundary and existing zone edges. Reports finished polygons.
function TurfDrawer({ onCreate }: { onCreate: (geom: GeoJsonObject) => void }) {
  const map = useMap()
  const cbRef = useRef(onCreate)
  cbRef.current = onCreate
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pm = (map as any).pm
    pm.setGlobalOptions({ snappable: true, snapDistance: 25, snapSegment: true })
    pm.addControls({
      position: 'topleft',
      drawPolygon: true,
      drawRectangle: true,
      drawMarker: false,
      drawPolyline: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawText: false,
      editMode: false,
      dragMode: false,
      cutPolygon: false,
      rotateMode: false,
      removalMode: false,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => {
      const geom = e.layer.toGeoJSON().geometry as GeoJsonObject
      map.removeLayer(e.layer) // re-rendered from the DB (clipped to district) after saving
      cbRef.current(geom)
    }
    map.on('pm:create', handler)
    return () => {
      map.off('pm:create', handler)
      pm.removeControls()
    }
  }, [map])
  return null
}

export default function MapPage() {
  const { activeCampaign, session } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const myUserId = session?.user.id
  const isAdmin = activeCampaign?.role === 'manager' || activeCampaign?.role === 'deputy'

  const [households, setHouseholds] = useState<Household[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState<Set<number>>(new Set(TIER_ORDER))
  // Panels start collapsed on phones so they don't cover the map; open on desktop.
  const [legendOpen, setLegendOpen] = useState(() => !window.matchMedia('(max-width: 640px)').matches)
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia('(max-width: 640px)').matches)

  const [selected, setSelected] = useState<Household | null>(null)
  const [roster, setRoster] = useState<RosterVoter[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [selectedVoter, setSelectedVoter] = useState<Voter | null>(null)

  // Turf state
  const [turfs, setTurfs] = useState<Turf[]>([])
  const [breakdowns, setBreakdowns] = useState<Record<string, Record<string, number>>>({})
  const [assignments, setAssignments] = useState<TurfAssignmentRow[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [turfBusy, setTurfBusy] = useState(false)
  const [turfError, setTurfError] = useState<string | null>(null)
  const turfsRef = useRef<Turf[]>([])
  turfsRef.current = turfs

  // Load households.
  useEffect(() => {
    if (!campaignId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAllHouseholds(campaignId)
      .then((rows) => !cancelled && setHouseholds(rows))
      .catch((e) => !cancelled && setError(e.message ?? 'Failed to load households'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [campaignId])

  // Roster for the clicked household.
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

  // ── Turf loaders ──
  const loadTurfs = useCallback(async () => {
    if (!campaignId) return
    const { data } = await supabase.from('turfs_geojson').select('*').eq('campaign_id', campaignId)
    const list = (data as unknown as Turf[]) ?? []
    setTurfs(list)
    const entries = await Promise.all(
      list.map(async (t) => {
        const { data: b } = await supabase.rpc('turf_tier_breakdown', { p_turf_id: t.id })
        return [t.id, (b as Record<string, number>) ?? {}] as const
      }),
    )
    setBreakdowns(Object.fromEntries(entries))
  }, [campaignId])

  const loadAssignments = useCallback(async () => {
    if (!campaignId) return
    const { data } = await supabase
      .from('turf_assignments')
      .select('id,turf_id,assigned_to,status')
      .eq('campaign_id', campaignId)
    setAssignments((data as unknown as TurfAssignmentRow[]) ?? [])
  }, [campaignId])

  const loadMembers = useCallback(async () => {
    if (!campaignId) return
    const { data } = await supabase
      .from('campaign_members')
      .select('user_id,role,profiles(full_name,email)')
      .eq('campaign_id', campaignId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((data as any[]) ?? []).map((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return { user_id: r.user_id, role: r.role, full_name: p?.full_name ?? null, email: p?.email ?? null }
    })
    setMembers(list as TeamMember[])
  }, [campaignId])

  useEffect(() => {
    loadTurfs()
    loadAssignments()
    loadMembers()
  }, [loadTurfs, loadAssignments, loadMembers])

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

  const openVoter = useCallback(async (id: string) => {
    const { data } = await supabase.from('voters').select(VOTER_COLUMNS).eq('id', id).single()
    if (data) setSelectedVoter(data as unknown as Voter)
  }, [])

  const handleCreateTurf = useCallback(
    async (geom: GeoJsonObject) => {
      if (!campaignId) return
      const name = window.prompt('Name this turf (e.g. "Sugar Hill North"):')?.trim()
      if (!name) return
      const color = PALETTE[turfsRef.current.length % PALETTE.length]
      setTurfBusy(true)
      setTurfError(null)
      const { error } = await supabase.rpc('create_turf', {
        p_campaign_id: campaignId,
        p_name: name,
        p_color: color,
        p_geojson: geom,
      })
      if (error) setTurfError(error.message)
      else await loadTurfs()
      setTurfBusy(false)
    },
    [campaignId, loadTurfs],
  )

  const assignTurf = async (turfId: string, userId: string) => {
    setTurfBusy(true)
    setTurfError(null)
    await supabase.from('turf_assignments').delete().eq('turf_id', turfId)
    if (userId) {
      const { error } = await supabase.from('turf_assignments').insert({
        campaign_id: campaignId,
        turf_id: turfId,
        assigned_to: userId,
        assigned_by: myUserId,
        status: 'assigned',
      })
      if (error) setTurfError(error.message)
    }
    await loadAssignments()
    setTurfBusy(false)
  }

  const deleteTurf = async (turfId: string) => {
    if (!window.confirm('Delete this turf? This also removes its assignment.')) return
    setTurfBusy(true)
    await supabase.from('turfs').delete().eq('id', turfId)
    await Promise.all([loadTurfs(), loadAssignments()])
    setTurfBusy(false)
  }

  // Voter counts for a zone, respecting the current tier filter.
  const filteredCount = (b: Record<string, number> = {}) =>
    TIER_ORDER.reduce((s, t) => (visible.has(t) ? s + (b[t] ?? 0) : s), 0)
  const totalCount = (b: Record<string, number> = {}) =>
    Object.values(b).reduce((a, c) => a + c, 0)
  const allTiersShown = visible.size === TIER_ORDER.length

  return (
    <div className="relative" style={{ height: 'calc(100dvh - 56px - env(safe-area-inset-top))' }}>
      <MapContainer center={CENTER} zoom={12} preferCanvas style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap contributors'
        />
        <GeoJSON data={boundary} style={{ color: '#60a5fa', weight: 2, dashArray: '6', fillOpacity: 0 }} />
        {!loading && <HouseholdLayer households={households} visible={visible} onSelect={handleSelect} />}
        {turfs.map((t) => (
          <GeoJSON
            key={t.id}
            data={t.geojson}
            style={{ color: t.color, weight: 2, fillColor: t.color, fillOpacity: 0.18 }}
          >
            <Tooltip sticky>{t.name}</Tooltip>
          </GeoJSON>
        ))}
        {isAdmin && <TurfDrawer onCreate={handleCreateTurf} />}
      </MapContainer>

      {/* Legend + tier filter (collapsible) */}
      <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur rounded-lg shadow-lg text-sm">
        <button
          onClick={() => setLegendOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-2 w-full font-semibold text-slate-900"
        >
          <span>{households.length.toLocaleString()} households</span>
          <span className="ml-auto text-slate-400">{legendOpen ? '▾' : '▸'}</span>
        </button>
        {legendOpen && (
          <div className="px-3 pb-3 w-44 sm:w-56 max-w-[calc(100vw-1.5rem)]">
            <div className="space-y-1">
              {TIER_ORDER.map((t) => {
                const tm = tierMeta(t)
                return (
                  <label
                    key={t}
                    className="flex items-center gap-2 cursor-pointer select-none hover:bg-slate-50 rounded px-1 py-0.5"
                  >
                    <input type="checkbox" checked={visible.has(t)} onChange={() => toggleTier(t)} />
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
              Filter the dots — zone counts update to match.
            </div>
          </div>
        )}
      </div>

      {/* Loading / error */}
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 text-white">
          Loading households…
        </div>
      )}
      {error && (
        <div className="absolute top-16 left-3 z-[1000] bg-red-600 text-white text-sm rounded-lg px-3 py-2 shadow-lg">
          {error}
        </div>
      )}

      {/* Turf panel (collapsible) */}
      <div
        className="absolute right-3 z-[1000] bg-white rounded-lg shadow-xl text-sm"
        style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => setPanelOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-2 w-full font-semibold text-slate-900"
        >
          <span>Turf zones ({turfs.length})</span>
          <span className="ml-auto text-slate-400">{panelOpen ? '▾' : '▸'}</span>
        </button>
        {panelOpen && (
          <div className="px-3 pb-3 w-56 sm:w-72 max-w-[calc(100vw-1.5rem)] max-h-[55vh] sm:max-h-[70vh] overflow-y-auto">
        {isAdmin ? (
          <p className="text-[11px] text-slate-500 mb-2 leading-tight">
            Draw with the ▭ / polygon tools (top-left). Vertices snap to the district edge, and zones are
            trimmed to the district line automatically.
          </p>
        ) : (
          <p className="text-[11px] text-slate-500 mb-2">Zones assigned to your team.</p>
        )}
        {turfError && <div className="text-xs text-red-600 bg-red-50 rounded p-2 mb-2">{turfError}</div>}
        {turfBusy && <div className="text-xs text-slate-400 mb-2">Saving…</div>}
        {turfs.length === 0 && <div className="text-slate-400">No turf drawn yet.</div>}
        {turfs.map((t) => {
          const a = assignments.find((x) => x.turf_id === t.id)
          const b = breakdowns[t.id]
          const f = filteredCount(b)
          const tot = totalCount(b)
          return (
            <div key={t.id} className="border border-slate-200 rounded-lg p-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: t.color }} />
                <span className="font-medium text-slate-900 flex-1">{t.name}</span>
                {isAdmin && (
                  <button onClick={() => deleteTurf(t.id)} title="Delete turf" className="text-slate-300 hover:text-red-600">
                    🗑
                  </button>
                )}
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                <span className="font-semibold">{b ? f.toLocaleString() : '…'}</span>
                {b && !allTiersShown && <span className="text-slate-400"> of {tot.toLocaleString()}</span>} voters
                {!allTiersShown && <span className="text-slate-400"> (filtered)</span>}
              </div>
              {isAdmin ? (
                <select
                  value={a?.assigned_to ?? ''}
                  onChange={(e) => assignTurf(t.id, e.target.value)}
                  className="mt-1.5 w-full text-xs border border-slate-300 rounded px-1.5 py-1 bg-white"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {memberName(m)} ({m.role})
                    </option>
                  ))}
                </select>
              ) : (
                a && (
                  <div className="text-xs text-slate-600 mt-1">
                    Assigned to {memberName(members.find((m) => m.user_id === a.assigned_to))}
                  </div>
                )
              )}
            </div>
          )
        })}
          </div>
        )}
      </div>

      {/* Household roster */}
      {selected && (
        <div
          className="absolute left-3 z-[1000] bg-white rounded-lg shadow-xl p-4 text-sm w-80 max-w-[calc(100vw-1.5rem)] max-h-[55%] sm:max-h-[60%] overflow-y-auto"
          style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
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

      {selectedVoter && <VoterDetail voter={selectedVoter} onClose={() => setSelectedVoter(null)} />}
    </div>
  )
}
