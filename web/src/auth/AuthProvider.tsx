import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Membership } from '../lib/types'

interface AuthState {
  session: Session | null
  loading: boolean
  memberships: Membership[]
  activeCampaign: Membership | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [memberships, setMemberships] = useState<Membership[]>([])

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

  // Load which campaigns this user belongs to (and their role in each).
  useEffect(() => {
    if (!session) {
      setMemberships([])
      return
    }
    supabase
      .from('campaign_members')
      .select('campaign_id, role, campaigns(id, name, slug, district_label)')
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load memberships:', error.message)
          setMemberships([])
        } else {
          // supabase types the joined row loosely; coerce to our shape.
          setMemberships((data as unknown as Membership[]) ?? [])
        }
      })
  }, [session])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const value: AuthState = {
    session,
    loading,
    memberships,
    activeCampaign: memberships[0] ?? null,
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
