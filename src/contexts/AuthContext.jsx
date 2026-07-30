import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,           setSession]           = useState(null)
  const [perfil,            setPerfil]            = useState(null)
  const [bodegasPermitidas, setBodegasPermitidas] = useState(null) // null = todas (admin)
  const [cargando,          setCargando]          = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else setCargando(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else { setPerfil(null); setBodegasPermitidas(null); setCargando(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function cargarPerfil(userId) {
    const [{ data: p }, { data: pb }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('profile_bodegas').select('bodega_id').eq('profile_id', userId),
    ])
    setPerfil(p)
    // Admin ve todo (null = sin restricción). Otros: array de IDs permitidos.
    setBodegasPermitidas(p?.rol === 'ADMIN' ? null : (pb || []).map(r => r.bodega_id))
    setCargando(false)
  }

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const esAdmin     = perfil?.rol === 'ADMIN'
  const esLogistica = perfil?.rol === 'LOGISTICA'
  const esConsultor = perfil?.rol === 'CONSULTOR'

  return (
    <AuthContext.Provider value={{
      session, perfil, cargando,
      login, logout,
      esAdmin, esLogistica, esConsultor,
      bodegasPermitidas,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
