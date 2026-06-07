import { useCallback, useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import type { GeoJsonObject } from 'geojson'
import boundaryRaw from '../data/hd100_boundary.json'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { fetchAllHouseholds } from '../lib/households'
import type { Household, Turf, TurfAssignmentRow, TeamMember } from '../lib/types'

const boundary = boundaryRaw as GeoJsonObject
const CENTER: [number, number] = [34.1238, -84.0623]
const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']

function memberName(m: TeamMember | undefined): string {
  if (!m) return 'Unknown'
  return m.full_name || m.email || 'User'
}

// Faded grey dots showing where voters live, for context while drawing turf.
function HouseholdDots({ households }: { households: Household[] }) {
  const map = useMap()
  useEffect(() => {
    const group = L.layerGroup().addTo(map)
    for (const hh of households) {
      if (hh.lat == null || hh.lon == null) continue
      L.circleMarker([hh.lat, hh.lon], {
        radius: 1.5,
        color: '#94a3b8',
        weight: 0,
        fillOpacity: 0.5,
      }).addTo(group)
    }
    return () => {
      map.removeLayer(group)
    }
  }, [households, map])
  return null
}

// Adds Geoman's draw controls (admins only) and reports finished polygons.
function TurfDrawer({ onCreate }: { onCreate: (geom: GeoJsonObject) => void }) {
  const map = useMap()
  const cbRef = useRef(onCreate)
  cbRef.current = onCreate
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pm = (map as any).pm
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
      map.removeLayer(e.layer) // we re-render from the database after saving
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

export default function TurfPage() {
  const { activeCampaign, session } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const myUserId = session?.user.id
  const isAdmin = activeCampaign?.role === 'manager' || activeCampaign?.role === 'deputy'

  const [households, setHouseholds] = useState<Household[]>([])
  const [turfs, setTurfs] = useState<Turf[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [assignments, setAssignments] = useState<TurfAssignmentRow[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const turfsRef = useRef<Turf[]>([])
  turfsRef.current = turfs

  const loadTurfs = useCallback(async () => {
    if (!campaignId) return
    const { data } = await supabase.from('turfs_geojson').select('*').eq('campaign_id', campaignId)
    const list = (data as unknown as Turf[]) ?? []
    setTurfs(list)
    const entries = await Promise.all(
      list.map(async (t) => {
        const { data: c } = await supabase.rpc('turf_voter_count', { p_turf_id: t.id })
        return [t.id, (c as number) ?? 0] as const
      }),
    )
    setCounts(Object.fromEntries(entries))
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
    if (!campaignId) return
    fetchAllHouseholds(campaignId).then(setHouseholds).catch(() => {})
    loadTurfs()
    loadAssignments()
    loadMembers()
  }, [campaignId, loadTurfs, loadAssignments, loadMembers])

  const handleCreate = useCallback(
    async (geom: GeoJsonObject) => {
      if (!campaignId) return
      const name = window.prompt('Name this turf (e.g. "Sugar Hill North"):')?.trim()
      if (!name) return
      const color = PALETTE[turfsRef.current.length % PALETTE.length]
      setBusy(true)
      setError(null)
      const { error } = await supabase.rpc('create_turf', {
        p_campaign_id: campaignId,
        p_name: name,
        p_color: color,
        p_geojson: geom,
      })
      if (error) setError(error.message)
      else await loadTurfs()
      setBusy(false)
    },
    [campaignId, loadTurfs],
  )

  const assignTurf = async (turfId: string, userId: string) => {
    setBusy(true)
    setError(null)
    await supabase.from('turf_assignments').delete().eq('turf_id', turfId)
    if (userId) {
      const { error } = await supabase.from('turf_assignments').insert({
        campaign_id: campaignId,
        turf_id: turfId,
        assigned_to: userId,
        assigned_by: myUserId,
        status: 'assigned',
      })
      if (error) setError(error.message)
    }
    await loadAssignments()
    setBusy(false)
  }

  const deleteTurf = async (turfId: string) => {
    if (!window.confirm('Delete this turf? This also removes its assignment.')) return
    setBusy(true)
    await supabase.from('turfs').delete().eq('id', turfId)
    await Promise.all([loadTurfs(), loadAssignments()])
    setBusy(false)
  }

  return (
    <div className="flex" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="flex-1 relative">
        <MapContainer center={CENTER} zoom={12} preferCanvas style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap contributors'
          />
          <GeoJSON data={boundary} style={{ color: '#60a5fa', weight: 2, dashArray: '6', fillOpacity: 0 }} />
          <HouseholdDots households={households} />
          {turfs.map((t) => (
            <GeoJSON
              key={t.id}
              data={t.geojson}
              style={{ color: t.color, weight: 2, fillColor: t.color, fillOpacity: 0.18 }}
            >
              <Tooltip sticky>{t.name}</Tooltip>
            </GeoJSON>
          ))}
          {isAdmin && <TurfDrawer onCreate={handleCreate} />}
        </MapContainer>
      </div>

      {/* Side panel */}
      <aside className="w-80 bg-white border-l border-slate-200 overflow-y-auto p-4">
        <h2 className="font-semibold text-slate-900 mb-1">Turf</h2>
        {isAdmin ? (
          <p className="text-xs text-slate-500 mb-3">
            Use the ▭ / polygon tools at the top-left of the map to draw a zone, name it, then assign it
            to a volunteer. Grey dots show where voters live.
          </p>
        ) : (
          <p className="text-xs text-slate-500 mb-3">Zones assigned to your team.</p>
        )}

        {error && <div className="text-xs text-red-600 bg-red-50 rounded p-2 mb-2">{error}</div>}
        {busy && <div className="text-xs text-slate-400 mb-2">Saving…</div>}

        {turfs.length === 0 && <div className="text-sm text-slate-400">No turf drawn yet.</div>}

        {turfs.map((t) => {
          const a = assignments.find((x) => x.turf_id === t.id)
          return (
            <div key={t.id} className="border border-slate-200 rounded-lg p-2.5 mb-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: t.color }} />
                <span className="font-medium text-slate-900 flex-1 text-sm">{t.name}</span>
                {isAdmin && (
                  <button
                    onClick={() => deleteTurf(t.id)}
                    title="Delete turf"
                    className="text-slate-300 hover:text-red-600"
                  >
                    🗑
                  </button>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {counts[t.id] != null ? counts[t.id].toLocaleString() : '…'} voters
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
      </aside>
    </div>
  )
}
