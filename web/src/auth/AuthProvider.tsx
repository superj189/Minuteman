import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Membership } from '../lib/types'
import { isBoardRole, type Feature } from '../lib/access'

interface AuthState {
  session: Session | null
  loading: boolean
  membershipsLoaded: boolean
  memberships: Membership[]
  activeCampaign: Membership | null
  isBoard: boolean
  isChairman: boolean
  access: Feature[] // gated pages this person can open (board: all)
  can: (f: Feature) => boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [membershipsLoaded, setMembershipsLoaded] = useState(false)
  const [access, setAccess] = useState<Feature[]>([])

  // Track the auth session.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  // Which clubs this user belongs to (and their role), plus their granted pages.
  const refresh = useCallback(async () => {
    if (!userId) {
      setMemberships([])
      setAccess([])
      setMembershipsLoaded(true)
      return
    }
    setMembershipsLoaded(false)
    const { data, error } = await supabase
      .from('campaign_members')
      .select('campaign_id, role, campaigns!inner(id, name, slug, district_label)')
      // Only THIS user's memberships — staff can read the whole roster, so
      // without this filter we'd load everyone and misread our own role.
      .eq('user_id', userId)
      // Skip retired organizations (e.g. the HD-100 campaign).
      .eq('campaigns.is_active', true)
    const list = error ? [] : ((data as unknown as Membership[]) ?? [])
    if (error) console.error('Failed to load memberships:', error.message)
    setMemberships(list)
    if (list[0]) {
      const { data: acc } = await supabase.rpc('my_access', { p_campaign_id: list[0].campaign_id })
      setAccess((acc as Feature[]) ?? [])
    } else {
      setAccess([])
    }
    setMembershipsLoaded(true)
  }, [userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const activeCampaign = memberships[0] ?? null
  const value: AuthState = {
    session,
    loading,
    membershipsLoaded,
    memberships,
    activeCampaign,
    isBoard: isBoardRole(activeCampaign?.role),
    isChairman: activeCampaign?.role === 'manager',
    access,
    can: (f) => access.includes(f),
    refresh,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
