import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { LayoutDashboard, Package, ArrowUpDown, BarChart2, ShoppingCart, Settings, LogOut, Menu, X, ChevronRight, KeyRound } from 'lucide-react'
import { useState } from 'react'
import Modal from './Modal'
import Alerta from './Alerta'

const NAV_ADMIN = [
  { to: '/dashboard',         icon: LayoutDashboard, label: 'Inicio' },
  { to: '/productos',         icon: Package,         label: 'Productos' },
  { to: '/movimientos',       icon: BarChart2,        label: 'Historial' },
  { to: '/movimientos/nuevo', icon: ArrowUpDown,      label: 'Movimiento' },
  { to: '/pedidos',           icon: ShoppingCart,     label: 'Pedidos' },
  { to: '/config',            icon: Settings,         label: 'Configuración' },
]

const NAV_LOGISTICA = [
  { to: '/dashboard',         icon: LayoutDashboard, label: 'Inicio' },
  { to: '/productos',         icon: Package,         label: 'Productos' },
  { to: '/movimientos',       icon: BarChart2,        label: 'Historial' },
  { to: '/movimientos/nuevo', icon: ArrowUpDown,      label: 'Movimiento' },
  { to: '/pedidos',           icon: ShoppingCart,     label: 'Pedidos' },
]

const NAV_ALMACENISTA = [
  { to: '/dashboard',         icon: LayoutDashboard, label: 'Inicio' },
  { to: '/productos',         icon: Package,         label: 'Productos' },
  { to: '/movimientos',       icon: BarChart2,        label: 'Historial' },
  { to: '/movimientos/nuevo', icon: ArrowUpDown,      label: 'Movimiento' },
  { to: '/pedidos',           icon: ShoppingCart,     label: 'Pedidos' },
]

const BADGE = {
  ADMIN:       { color: 'bg-feisen-rojo text-white',   label: 'Admin' },
  LOGISTICA:   { color: 'bg-feisen-azul text-white',   label: 'Logística' },
  ALMACENISTA: { color: 'bg-emerald-600 text-white',   label: 'Almacenista' },
  CONSULTOR:   { color: 'bg-gray-500 text-white',      label: 'Consultor' },
}

export default function Layout({ children }) {
  const { perfil, logout, esAdmin, esLogistica, esAlmacenista } = useAuth()
  const location  = useLocation()
  const navigate  = useNavigate()
  const [menuAbierto,   setMenuAbierto]   = useState(false)
  const [modalPwd,      setModalPwd]      = useState(false)
  const [formPwd,       setFormPwd]       = useState({ nueva: '', confirmar: '' })
  const [msgPwd,        setMsgPwd]        = useState(null)
  const [guardandoPwd,  setGuardandoPwd]  = useState(false)

  const navItems = esAdmin ? NAV_ADMIN : esLogistica ? NAV_LOGISTICA : esAlmacenista ? NAV_ALMACENISTA : []
  const badge    = BADGE[perfil?.rol] || { color: 'bg-gray-400 text-white', label: perfil?.rol }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  async function cambiarPassword(e) {
    e.preventDefault()
    if (formPwd.nueva !== formPwd.confirmar) { setMsgPwd({ tipo: 'error', texto: 'Las contraseñas no coinciden.' }); return }
    if (formPwd.nueva.length < 6) { setMsgPwd({ tipo: 'error', texto: 'Mínimo 6 caracteres.' }); return }
    setGuardandoPwd(true)
    const { error } = await supabase.auth.updateUser({ password: formPwd.nueva })
    setGuardandoPwd(false)
    if (error) { setMsgPwd({ tipo: 'error', texto: error.message }); return }
    setMsgPwd({ tipo: 'exito', texto: '¡Contraseña actualizada!' })
    setFormPwd({ nueva: '', confirmar: '' })
    setTimeout(() => { setModalPwd(false); setMsgPwd(null) }, 1500)
  }

  const NavLink = ({ item }) => {
    const activo = location.pathname === item.to
    return (
      <Link to={item.to} onClick={() => setMenuAbierto(false)}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors
          ${activo ? 'bg-feisen-azul text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
        <item.icon size={20} />
        <span>{item.label}</span>
        {activo && <ChevronRight size={16} className="ml-auto" />}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">

      {/* SIDEBAR DESKTOP */}
      <aside className="hidden lg:flex flex-col w-64 bg-white shadow-sm min-h-screen px-4 py-6 border-r border-gray-100">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #064794 0%, #B4271D 100%)' }}>
            <span className="text-white font-bold text-lg">F</span>
          </div>
          <div>
            <p className="font-bold text-feisen-azul leading-tight">Feisen</p>
            <p className="text-xs text-gray-400 leading-tight">Inventarios</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1">
          {navItems.map(item => <NavLink key={item.to} item={item} />)}
        </nav>

        {/* Perfil */}
        <div className="border-t pt-4 mt-4 space-y-1">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-feisen-azul text-sm">
                {perfil?.nombre?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
            <div className="overflow-hidden">
              <p className="font-semibold text-sm text-gray-800 truncate">{perfil?.nombre}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
                {badge.label}
              </span>
            </div>
          </div>
          <button onClick={() => { setFormPwd({ nueva: '', confirmar: '' }); setMsgPwd(null); setModalPwd(true) }}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-medium transition-colors">
            <KeyRound size={16} /> Cambiar contraseña
          </button>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-feisen-rojo hover:bg-red-50 text-sm font-medium transition-colors">
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* HEADER MÓVIL */}
      <header className="lg:hidden bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-40 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #064794 0%, #B4271D 100%)' }}>
            <span className="text-white font-bold text-sm">F</span>
          </div>
          <span className="font-bold text-feisen-azul">Feisen</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.label}</span>
          <button onClick={() => setMenuAbierto(v => !v)} className="text-gray-600 p-1">
            {menuAbierto ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* MENÚ MÓVIL */}
      {menuAbierto && (
        <div className="lg:hidden fixed inset-0 z-30 bg-white pt-16 px-4 pb-6 overflow-y-auto">
          <nav className="space-y-1 mb-6">
            {navItems.map(item => <NavLink key={item.to} item={item} />)}
          </nav>
          <div className="border-t pt-4 space-y-1">
            <button onClick={() => { setMenuAbierto(false); setFormPwd({ nueva: '', confirmar: '' }); setMsgPwd(null); setModalPwd(true) }}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100 font-medium">
              <KeyRound size={18} /> Cambiar contraseña
            </button>
            <button onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-feisen-rojo bg-red-50 font-medium">
              <LogOut size={18} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {/* CONTENIDO */}
      <main className="flex-1 p-4 lg:p-8 pb-24 lg:pb-8">
        {children}
      </main>

      {/* BARRA INFERIOR MÓVIL */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-20">
        {navItems.slice(0, 5).map(item => {
          const activo = location.pathname === item.to
          return (
            <Link key={item.to} to={item.to}
              className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors
                ${activo ? 'text-feisen-azul' : 'text-gray-400'}`}>
              <item.icon size={20} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* MODAL CONTRASEÑA */}
      {modalPwd && (
        <Modal titulo="Cambiar contraseña" onCerrar={() => setModalPwd(false)}>
          <form onSubmit={cambiarPassword} className="space-y-4">
            {msgPwd && <Alerta tipo={msgPwd.tipo} mensaje={msgPwd.texto} />}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nueva contraseña *</label>
              <input required type="password" minLength={6} value={formPwd.nueva}
                onChange={e => setFormPwd(f => ({ ...f, nueva: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Confirmar contraseña *</label>
              <input required type="password" minLength={6} value={formPwd.confirmar}
                onChange={e => setFormPwd(f => ({ ...f, confirmar: e.target.value }))}
                placeholder="Repite la contraseña"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalPwd(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit" disabled={guardandoPwd}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {guardandoPwd ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
