import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PERMISOS_INICIALES, nivelDe } from '../permisos/modulos'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,           setSession]           = useState(null)
  const [perfil,            setPerfil]            = useState(null)
  const [bodegasPermitidas, setBodegasPermitidas] = useState(null) // null = ve todo (solo ADMIN); el resto solo sus bodegas
  const [bodegasOperacion,  setBodegasOperacion]  = useState(null) // null = opera en todo (solo ADMIN)
  const [cargando,          setCargando]          = useState(true)
  const [rolPreview,        setRolPreview]        = useState(null) // null = sin modo vista
  const [permisos,          setPermisos]          = useState(PERMISOS_INICIALES) // { rol: { modulo: nivel } }

  // Permisos editables (Configuración › Permisos). Si la tabla no responde o está vacía,
  // queda lo que cada rol tenía cuando se creó, para no dejar a nadie sin menú.
  const recargarPermisos = useCallback(async () => {
    const { data, error } = await supabase.from('rol_permisos').select('rol, modulo, nivel')
    if (error || !Array.isArray(data) || data.length === 0) return
    const m = {}
    for (const r of data) (m[r.rol] ||= {})[r.modulo] = r.nivel
    setPermisos(m)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else setCargando(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else { setPerfil(null); setBodegasPermitidas(null); setBodegasOperacion(null); setCargando(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function cargarPerfil(userId) {
    const [{ data: p }, { data: pb }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('profile_bodegas').select('bodega_id').eq('profile_id', userId),
    ])
    // Usuario desactivado en Configuración: se cierra la sesión (la base además le quita el rol)
    if (p && p.activo === false) {
      await supabase.auth.signOut()
      return
    }
    setPerfil(p)
    await recargarPermisos()
    const bids = (pb || []).map(r => r.bodega_id)
    // Ver stock: solo ADMIN ve todo; el resto solo sus bodegas asignadas
    const puedeVerTodo = p?.rol === 'ADMIN'
    setBodegasPermitidas(puedeVerTodo ? null : bids)
    // Operar (crear movimientos / pedidos): solo ADMIN opera en todo; el resto solo sus bodegas
    setBodegasOperacion(p?.rol === 'ADMIN' ? null : bids)
    setCargando(false)
  }

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const { data: p } = await supabase.from('profiles').select('activo').eq('id', data.user.id).single()
    if (p && p.activo === false) {
      await supabase.auth.signOut()
      throw new Error('Tu usuario está desactivado. Pídele a la administración que lo active.')
    }
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const esAdminReal        = perfil?.rol === 'ADMIN'
  const rolEfectivo        = rolPreview || perfil?.rol
  const esAdmin            = rolEfectivo === 'ADMIN'
  const esLogistica        = rolEfectivo === 'LOGISTICA'
  const esAlmacenista      = rolEfectivo === 'ALMACENISTA'
  const esOperario         = rolEfectivo === 'OPERARIO'
  const esConsultor        = rolEfectivo === 'CONSULTOR'
  const esJefeFundicion    = rolEfectivo === 'JEFE_FUNDICION'
  const esJefeMecanizados  = rolEfectivo === 'JEFE_MECANIZADOS'
  const esJefeEnsamble     = rolEfectivo === 'JEFE_ENSAMBLE'
  const esRRHH             = rolEfectivo === 'RRHH'
  // Nivel del rol efectivo en un módulo: 'no' | 've' | 'registra' | 'todo'
  const nivel              = modulo => nivelDe(permisos, rolEfectivo, modulo)
  const puede              = modulo => nivel(modulo) !== 'no'
  // Órdenes de fabricación: quien tiene el módulo (Registra o Todo) usa la vista comercial y ve
  // todas las OF; con Registra solo modifica las que creó. Jefe de área: pendiente de definir.
  const nivelOF            = nivel('of')
  const esComercial        = !esAdmin && (nivelOF === 'registra' || nivelOF === 'todo')
  const esJefeArea         = false
  const centroCosto        = perfil?.centro_costo_of || null
  const puedeEditarOF      = orden => esAdmin || nivelOF === 'todo' || (nivelOF === 'registra' && orden?.creado_por === perfil?.id)

  return (
    <AuthContext.Provider value={{
      session, perfil, cargando,
      login, logout,
      esAdmin, esLogistica, esAlmacenista, esOperario, esConsultor, esJefeFundicion, esJefeMecanizados, esJefeEnsamble, esRRHH,
      esComercial, esJefeArea, centroCosto, puedeEditarOF,
      esAdminReal, rolPreview, setRolPreview, rolEfectivo,
      bodegasPermitidas,
      bodegasOperacion,
      permisos, nivel, puede, recargarPermisos,
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
