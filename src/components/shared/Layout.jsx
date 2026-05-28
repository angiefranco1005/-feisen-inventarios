import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  LayoutDashboard, Package, ArrowUpDown, BarChart2,
  Settings, LogOut, Menu, X, ChevronRight
} from 'lucide-react'
import { useState } from 'react'

// Navegación por rol
const NAV_ADMIN = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { to: '/items',     icon: Package,         label: 'Productos' },
  { to: '/movimientos', icon: ArrowUpDown,   label: 'Movimientos' },
  { to: '/reportes',  icon: BarChart2,        label: 'Reportes' },
  { to: '/config',    icon: Settings,         label: 'Configuración' },
]

const NAV_BODEGUERO = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Inicio' },
  { to: '/movimientos', icon: ArrowUpDown,    label: 'Movimientos' },
  { to: '/reportes',   icon: BarChart2,        label: 'Reportes' },
]

const NAV_JEFE = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Inicio' },
  { to: '/movimientos', icon: ArrowUpDown,    label: 'Movimientos' },
  { to: '/reportes',   icon: BarChart2,        label: 'Reportes' },
]

const NAV_OPERARIO = [
  { to: '/salida',    icon: ArrowUpDown,     label: 'Registrar salida' },
  { to: '/historial', icon: BarChart2,        label: 'Mi historial' },
]

const BADGE_COLOR = {
  ADMIN:     'bg-feisen-rojo text-white',
  BODEGUERO: 'bg-feisen-azul text-white',
  JEFE_AREA: 'bg-amber-500 text-white',
  OPERARIO:  'bg-emerald-600 text-white',
}

const BADGE_LABEL = {
  ADMIN:     'Admin',
  BODEGUERO: 'Bodeguero',
  JEFE_AREA: 'Jefe de Área',
  OPERARIO:  'Operario',
}

export default function Layout({ children }) {
  const { perfil, logout, esAdmin, esBodeguero, esJefeArea } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuAbierto, setMenuAbierto] = useState(false)

  const navItems = esAdmin ? NAV_ADMIN
    : esBodeguero ? NAV_BODEGUERO
    : esJefeArea  ? NAV_JEFE
    : NAV_OPERARIO

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const NavLink = ({ item }) => {
    const activo = location.pathname === item.to
    return (
      <Link
        to={item.to}
        onClick={() => setMenuAbierto(false)}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium
          ${activo
            ? 'bg-feisen-azul text-white'
            : 'text-feisen-gris-oscuro hover:bg-feisen-gris'}`}
      >
        <item.icon size={20} />
        <span>{item.label}</span>
        {activo && <ChevronRight size={16} className="ml-auto" />}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-feisen-gris flex flex-col lg:flex-row">

      {/* SIDEBAR DESKTOP */}
      <aside className="hidden lg:flex flex-col w-64 bg-white shadow-md min-h-screen px-4 py-6">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #064794 0%, #B4271D 100%)' }}>
            <span className="text-white font-bold text-lg">F</span>
          </div>
          <div>
            <p className="font-bold text-feisen-azul leading-tight">Feisen</p>
            <p className="text-xs text-feisen-gris-medio leading-tight">Inventarios</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(item => <NavLink key={item.to} item={item} />)}
        </nav>

        {/* Perfil usuario */}
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-9 h-9 rounded-full bg-feisen-gris flex items-center justify-center">
              <span className="font-bold text-feisen-azul text-sm">
                {perfil?.nombre?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
            <div className="overflow-hidden">
              <p className="font-semibold text-sm text-feisen-gris-oscuro truncate">{perfil?.nombre}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_COLOR[perfil?.rol]}`}>
                {BADGE_LABEL[perfil?.rol]}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-feisen-rojo hover:bg-red-50 transition-colors text-sm font-medium"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* HEADER MÓVIL */}
      <header className="lg:hidden bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #064794 0%, #B4271D 100%)' }}>
            <span className="text-white font-bold text-sm">F</span>
          </div>
          <span className="font-bold text-feisen-azul">Feisen</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_COLOR[perfil?.rol]}`}>
            {BADGE_LABEL[perfil?.rol]}
          </span>
          <button onClick={() => setMenuAbierto(v => !v)} className="text-feisen-gris-oscuro p-1">
            {menuAbierto ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* MENÚ MÓVIL DESPLEGABLE */}
      {menuAbierto && (
        <div className="lg:hidden fixed inset-0 z-30 bg-white pt-16 px-4 pb-6 overflow-y-auto">
          <p className="text-sm font-semibold text-feisen-gris-medio mb-3 px-2">Menú</p>
          <nav className="space-y-1 mb-6">
            {navItems.map(item => <NavLink key={item.to} item={item} />)}
          </nav>
          <div className="border-t pt-4">
            <p className="px-2 font-semibold text-feisen-gris-oscuro mb-1">{perfil?.nombre}</p>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-feisen-rojo bg-red-50 font-medium mt-2"
            >
              <LogOut size={18} />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-4 lg:p-8 pb-24 lg:pb-8">
        {children}
      </main>

      {/* BARRA INFERIOR MÓVIL (solo roles no-operario con más ítems) */}
      {!perfil?.rol || perfil.rol !== 'OPERARIO' ? (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-20">
          {navItems.slice(0, 4).map(item => {
            const activo = location.pathname === item.to
            return (
              <Link key={item.to} to={item.to}
                className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors
                  ${activo ? 'text-feisen-azul' : 'text-feisen-gris-medio'}`}>
                <item.icon size={22} />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
