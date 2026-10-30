import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { LayoutDashboard, Package, ArrowUpDown, BarChart2, ShoppingCart, Settings, LogOut, Menu, X, KeyRound, RefreshCw, Sparkles, CalendarDays, Eye, Flame, Layers, Factory, FileSpreadsheet, PackageCheck, Download, Upload, ClipboardList, TrendingUp, Activity, Wrench, ShieldAlert, Boxes, FileText, Users, Warehouse, Truck, ChevronDown, ChevronRight, ClipboardCheck, Scale, Receipt, HardHat, Network, CalendarClock, Wallet, Target, FilePlus, ListChecks, Building2, Calculator, Coins, Cog, History, ArrowsLeftRight, Table, CalendarCheck, Swap, TreeStructure, Money, ChartLine, TrayArrowDown, Invoice, BookOpenText, BookOpen, Files, CalendarDots, Tag, UserList, Engine, UsersThree, SealCheck, Handshake, Toolbox, Bank, ChartPieSlice, HandCoins } from './iconos'
import { useUpdateAvailable } from '../../hooks/useUpdateAvailable'
import { useEffect, useState } from 'react'
import Modal from './Modal'
import Alerta from './Alerta'
import logoFeisen from '../../assets/logo-feisen.png'

// Admin: menú por módulos de la empresa. Cada `modulo` se muestra desplegable con sus
// submódulos; `abajo` va al final, separado (Configuración).
const MODULOS = {
  'Inventarios':      Warehouse,
  'Logística':        Truck,
  'Mecanizados':      Wrench,
  'Fundición':        Flame,
  'Producción y Ensamble': Factory,
  'Ventas':           Handshake,
  'Costeo':           Calculator,
  'Recursos Humanos': HardHat,
  'Calidad':          SealCheck,
  'Mantenimiento':    Toolbox,
  'Finanzas':         Bank,
}

// Nombre corto en el menú para que no ocupe dos renglones (en las pantallas sigue el completo)
const NOMBRE_EN_MENU = { 'Producción y Ensamble': 'Ensamble' }

const NAV_ADMIN = [
  { to: '/dashboard',                         icon: LayoutDashboard, label: 'Inicio' },
  { to: '/productos',                         icon: Package,         label: 'Productos',          modulo: 'Inventarios' },
  { to: '/movimientos/nuevo',                 icon: ArrowsLeftRight,     label: 'Movimiento',         modulo: 'Inventarios' },
  { to: '/mecanizados/paquetes',              icon: Boxes,           label: 'Paquetes',           modulo: 'Inventarios' },
  { to: '/movimientos',                       icon: History,       label: 'Historial',          modulo: 'Inventarios' },
  { to: '/reportes/inventario-fisico',        icon: ClipboardCheck,  label: 'Inventario físico',  modulo: 'Inventarios' },
  { to: '/reportes/kardex',                   icon: Table, label: 'Kardex',             modulo: 'Inventarios' },
  { to: '/reportes/corte',                    icon: CalendarCheck,    label: 'Corte de inventario', modulo: 'Inventarios' },
  { to: '/pedidos',                           icon: ShoppingCart,    label: 'Pedidos',            modulo: 'Logística' },
  { to: '/ordenes-compra',                    icon: FileText,        label: 'Órdenes de compra',  modulo: 'Logística' },
  { to: '/mecanizados/registro',              icon: Wrench,          label: 'Registro',           modulo: 'Mecanizados' },
  { to: '/transferencias',                    icon: Swap,   label: 'Transferencias',     modulo: 'Mecanizados' },
  { to: '/fundidas',                          icon: Flame,           label: 'Fundidas',           modulo: 'Fundición' },
  { to: '/moldeo',                            icon: Layers,          label: 'Moldeo',             modulo: 'Fundición' },
  { to: '/recogida',                          icon: TrayArrowDown,    label: 'Recogida',           modulo: 'Fundición' },
  { to: '/moldeo/catalogo',                   icon: TreeStructure,         label: 'BOM',                modulo: 'Fundición' },
  { to: '/nomina/fundicion',                  icon: Money, label: 'Nómina',             modulo: 'Fundición' },
  { to: '/analitica/fundicion',               icon: ChartLine,        label: 'Analítica',          modulo: 'Fundición' },
  { to: '/reportes/balance-hierro',           icon: Scale,           label: 'Balance de hierro',  modulo: 'Fundición' },
  { to: '/reportes/ventas-internas-fundicion', icon: Invoice,        label: 'Ventas internas',    modulo: 'Fundición' },
  { to: '/ensamble',                          icon: Factory,         label: 'Órdenes de ensamble', modulo: 'Producción y Ensamble' },
  { to: '/ensamble/recetas',                  icon: BookOpenText,   label: 'Recetas',            modulo: 'Producción y Ensamble' },
  { to: '/of/nueva',                          icon: FilePlus,        label: 'Nueva OF',           modulo: 'Ventas' },
  { to: '/of/ordenes',                        icon: Files,   label: 'Órdenes',            modulo: 'Ventas' },
  { to: '/of/resumen',                        icon: ListChecks,      label: 'Resumen',            modulo: 'Ventas' },
  { to: '/of/calendario',                     icon: CalendarDots,    label: 'Calendario',         modulo: 'Ventas' },
  { to: '/of/dashboard',                      icon: BarChart2,       label: 'Dashboard',          modulo: 'Ventas' },
  { to: '/of/productos',                      icon: Tag,         label: 'Productos OF',       modulo: 'Ventas' },
  { to: '/of/clientes',                       icon: Building2,       label: 'Clientes',           modulo: 'Ventas' },
  { to: '/costeo',                            icon: Calculator,      label: 'Fichas',             modulo: 'Costeo' },
  { to: '/costeo/etapas',                     icon: UserList,           label: 'Responsables por etapa', modulo: 'Costeo' },
  { to: '/costeo/cif',                        icon: Coins,           label: 'CIF de planta',      modulo: 'Costeo' },
  { to: '/costeo/equipos',                    icon: Engine,             label: 'Equipos de planta',  modulo: 'Costeo' },
  { to: '/rrhh/empleados',                    icon: UsersThree,           label: 'Colaboradores',      modulo: 'Recursos Humanos' },
  { to: '/rrhh/organigrama',                  icon: Network,         label: 'Organigrama',        modulo: 'Recursos Humanos' },
  { to: '/rrhh/novedades',                    icon: CalendarClock,   label: 'Novedades',          modulo: 'Recursos Humanos' },
  { to: '/rrhh/calendario',                   icon: CalendarDays,    label: 'Calendario',         modulo: 'Recursos Humanos' },
  { to: '/rrhh/nomina',                       icon: Wallet,          label: 'Nómina',             modulo: 'Recursos Humanos' },
  { to: '/rrhh/desempeno',                    icon: Target,          label: 'Desempeño',          modulo: 'Recursos Humanos' },
  { to: '/calidad',                           icon: SealCheck,     label: 'No conformidades',   modulo: 'Calidad' },
  { to: '/mantenimiento',                     icon: Toolbox,       label: 'Equipos de planta',  modulo: 'Mantenimiento' },
  { to: '/finanzas/resultado',                icon: ChartPieSlice, label: 'Resultado por centro', modulo: 'Finanzas' },
  { to: '/finanzas/cartera',                  icon: HandCoins,     label: 'Cartera',            modulo: 'Finanzas' },
  { to: '/finanzas/por-pagar',                icon: Receipt,       label: 'Cuentas por pagar',  modulo: 'Finanzas' },
  { to: '/finanzas/flujo',                    icon: Bank,          label: 'Flujo de caja',      modulo: 'Finanzas' },
  // Suelto (sin módulo): sale arriba en el menú, pero al final para no cambiar la barra inferior del celular
  { to: '/manuales',                          icon: BookOpen,        label: 'Manuales' },
  { to: '/config',                            icon: Settings,        label: 'Configuración',      abajo: true },
]

const NAV_LOGISTICA = [
  { to: '/dashboard',         icon: LayoutDashboard, label: 'Inicio' },
  { to: '/productos',         icon: Package,         label: 'Productos' },
  { to: '/movimientos',       icon: History,        label: 'Historial' },
  { to: '/movimientos/nuevo', icon: ArrowsLeftRight,      label: 'Movimiento' },
  { to: '/pedidos',           icon: ShoppingCart,     label: 'Pedidos' },
  { to: '/ordenes-compra',    icon: FileText,         label: 'Órdenes de compra' },
  { to: '/calidad',           icon: SealCheck,      label: 'Calidad' },
]

const NAV_ALMACENISTA = [
  { to: '/dashboard',                      icon: LayoutDashboard, label: 'Inicio' },
  { to: '/productos',                      icon: Package,         label: 'Productos' },
  { to: '/movimientos',                    icon: History,        label: 'Historial' },
  { to: '/movimientos/nuevo',              icon: ArrowsLeftRight,      label: 'Movimiento' },
  { to: '/pedidos',                        icon: ShoppingCart,     label: 'Pedidos' },
]

const NAV_JEFE_FUNDICION = [
  { to: '/dashboard',                      icon: LayoutDashboard, label: 'Inicio' },
  { to: '/productos',                      icon: Package,         label: 'Productos' },
  { to: '/movimientos',                    icon: History,        label: 'Historial' },
  { to: '/movimientos/nuevo',              icon: ArrowsLeftRight,      label: 'Movimiento' },
  { to: '/pedidos',                        icon: ShoppingCart,     label: 'Pedidos' },
  { to: '/transferencias',                 icon: Swap,    label: 'Transferencias' },
  { to: '/calidad',                        icon: SealCheck,      label: 'Calidad' },
  { to: '/mantenimiento',                  icon: Toolbox,          label: 'Mantenimiento' },
  { to: '/fundidas',                       icon: Flame,            label: 'Fundidas',  grupo: 'Fundición' },
  { to: '/moldeo',                         icon: Layers,           label: 'Moldeo',    grupo: 'Fundición' },
  { to: '/recogida',                       icon: TrayArrowDown,     label: 'Recogida',  grupo: 'Fundición' },
  { to: '/nomina/fundicion',               icon: Money,  label: 'Nómina',    grupo: 'Fundición' },
  { to: '/analitica/fundicion',            icon: ChartLine,         label: 'Analítica', grupo: 'Fundición' },
  { to: '/moldeo/catalogo',                icon: TreeStructure,          label: 'BOM',       grupo: 'Fundición' },
]

const NAV_JEFE_MECANIZADOS = [
  { to: '/dashboard',                      icon: LayoutDashboard, label: 'Inicio' },
  { to: '/mecanizados/registro',           icon: Wrench,           label: 'Mecanizado' },
  { to: '/transferencias',                 icon: Swap,    label: 'Transferencias' },
  { to: '/calidad',                        icon: SealCheck,      label: 'Calidad' },
  { to: '/mantenimiento',                  icon: Toolbox,          label: 'Mantenimiento' },
  { to: '/productos',                      icon: Package,         label: 'Productos' },
  { to: '/movimientos',                    icon: History,        label: 'Historial' },
  { to: '/movimientos/nuevo',              icon: ArrowsLeftRight,      label: 'Movimiento' },
  { to: '/pedidos',                        icon: ShoppingCart,     label: 'Pedidos' },
]

const NAV_JEFE_ENSAMBLE = [
  { to: '/dashboard',                      icon: LayoutDashboard, label: 'Inicio' },
  { to: '/ensamble',                       icon: Factory,          label: 'Ensamble' },
  { to: '/ensamble/recetas',               icon: BookOpenText,    label: 'Recetas' },
  { to: '/productos',                      icon: Package,         label: 'Productos' },
  { to: '/movimientos',                    icon: History,        label: 'Historial' },
  { to: '/movimientos/nuevo',              icon: ArrowsLeftRight,      label: 'Movimiento' },
  { to: '/pedidos',                        icon: ShoppingCart,     label: 'Pedidos' },
  { to: '/calidad',                        icon: SealCheck,      label: 'Calidad' },
  { to: '/mantenimiento',                  icon: Toolbox,          label: 'Mantenimiento' },
]

const NAV_OPERARIO = [
  { to: '/dashboard',                      icon: LayoutDashboard, label: 'Inicio' },
  { to: '/productos',                      icon: Package,         label: 'Productos' },
  { to: '/movimientos',                    icon: History,        label: 'Historial' },
  { to: '/movimientos/nuevo',              icon: ArrowsLeftRight,      label: 'Movimiento' },
  { to: '/pedidos',                        icon: ShoppingCart,     label: 'Pedidos' },
]

// Barra inferior móvil curada — prioriza las acciones más usadas por cada rol
const MOBILE_OPERARIO = [
  { to: '/dashboard',                      icon: LayoutDashboard, label: 'Inicio' },
  { to: '/movimientos/nuevo',              icon: ArrowsLeftRight,      label: 'Movimiento' },
  { to: '/pedidos',                        icon: ShoppingCart,     label: 'Pedidos' },
  { to: '/productos',                      icon: Package,          label: 'Productos' },
]
const MOBILE_ALMACENISTA = [
  { to: '/dashboard',         icon: LayoutDashboard, label: 'Inicio' },
  { to: '/movimientos',       icon: History,        label: 'Historial' },
  { to: '/movimientos/nuevo', icon: ArrowsLeftRight,      label: 'Movimiento' },
  { to: '/pedidos',           icon: ShoppingCart,     label: 'Pedidos' },
  { to: '/productos',         icon: Package,          label: 'Productos' },
]
const MOBILE_JEFE_MECANIZADOS = [
  { to: '/dashboard',                      icon: LayoutDashboard, label: 'Inicio' },
  { to: '/mecanizados/registro',           icon: Wrench,          label: 'Mecanizado' },
  { to: '/transferencias',                 icon: Swap,   label: 'Transf.' },
  { to: '/pedidos',                        icon: ShoppingCart,     label: 'Pedidos' },
  { to: '/movimientos/nuevo',              icon: ArrowsLeftRight,      label: 'Movimiento' },
  { to: '/calidad',                        icon: SealCheck,      label: 'Calidad' },
]
const MOBILE_JEFE_ENSAMBLE = [
  { to: '/dashboard',                      icon: LayoutDashboard, label: 'Inicio' },
  { to: '/ensamble',                       icon: Factory,          label: 'Ensamble' },
  { to: '/movimientos/nuevo',              icon: ArrowsLeftRight,      label: 'Movimiento' },
  { to: '/pedidos',                        icon: ShoppingCart,     label: 'Pedidos' },
  { to: '/productos',                      icon: Package,          label: 'Productos' },
]
const MOBILE_JEFE_FUNDICION = [
  { to: '/dashboard',                      icon: LayoutDashboard, label: 'Inicio' },
  { to: '/movimientos/nuevo',              icon: ArrowsLeftRight,      label: 'Movimiento' },
  { to: '/transferencias',                 icon: Swap,   label: 'Transferencias' },
  { to: '/pedidos',                        icon: ShoppingCart,     label: 'Pedidos' },
  { to: '/fundidas',                       icon: Flame,            label: 'Fundidas' },
  { to: '/calidad',                        icon: SealCheck,      label: 'Calidad' },
]

const NAV_RRHH = [
  { to: '/rrhh/empleados',   icon: UsersThree,   label: 'Colaboradores' },
  { to: '/rrhh/organigrama', icon: Network, label: 'Organigrama' },
  { to: '/rrhh/novedades',   icon: CalendarClock, label: 'Novedades' },
  { to: '/rrhh/calendario',  icon: CalendarDays,  label: 'Calendario' },
  { to: '/rrhh/nomina',      icon: Wallet,        label: 'Nómina' },
  { to: '/rrhh/desempeno',   icon: Target,        label: 'Desempeño' },
  // Bodega de Administración: dotación, papelería y aseo
  { to: '/productos',         icon: Package,      label: 'Productos',  grupo: 'Bodega Administración' },
  { to: '/movimientos/nuevo', icon: ArrowsLeftRight,  label: 'Movimiento', grupo: 'Bodega Administración' },
  { to: '/movimientos',       icon: History,    label: 'Historial',  grupo: 'Bodega Administración' },
  { to: '/pedidos',           icon: ShoppingCart, label: 'Pedidos',    grupo: 'Bodega Administración' },
]
const MOBILE_RRHH = [
  { to: '/rrhh/empleados', icon: UsersThree,         label: 'Personas' },
  { to: '/rrhh/novedades', icon: CalendarClock, label: 'Novedades' },
  { to: '/rrhh/nomina',    icon: Wallet,        label: 'Nómina' },
  { to: '/pedidos',        icon: ShoppingCart,  label: 'Pedidos' },
  { to: '/movimientos/nuevo', icon: ArrowsLeftRight, label: 'Movimiento' },
]

const NAV_CONSULTOR = [
  { to: '/dashboard',   icon: Package,      label: 'Stock' },
  { to: '/movimientos', icon: History,    label: 'Historial' },
]
const MOBILE_CONSULTOR = [
  { to: '/dashboard',   icon: Package,      label: 'Stock' },
  { to: '/movimientos', icon: History,    label: 'Historial' },
]

const BADGE = {
  ADMIN:             { color: 'bg-feisen-rojo text-white',   label: 'Admin' },
  LOGISTICA:         { color: 'bg-feisen-azul text-white',   label: 'Logística' },
  ALMACENISTA:       { color: 'bg-emerald-600 text-white',   label: 'Almacenista' },
  OPERARIO:          { color: 'bg-teal-600 text-white',       label: 'Operario' },
  CONSULTOR:         { color: 'bg-gray-500 text-white',      label: 'Consultor' },
  JEFE_FUNDICION:    { color: 'bg-orange-600 text-white',    label: 'Jefe Fundición' },
  JEFE_MECANIZADOS:  { color: 'bg-purple-600 text-white',    label: 'Jefe Mecanizados' },
  JEFE_ENSAMBLE:     { color: 'bg-teal-600 text-white',      label: 'Jefe Ensamble' },
  RRHH:              { color: 'bg-pink-600 text-white',      label: 'Recursos Humanos' },
}

export default function Layout({ children }) {
  const { perfil, logout, esAdmin, esLogistica, esAlmacenista, esOperario, esJefeFundicion, esJefeMecanizados, esJefeEnsamble, esConsultor, esRRHH, esAdminReal, rolPreview, setRolPreview, puedeRuta } = useAuth()
  const location  = useLocation()
  const navigate  = useNavigate()
  const [menuAbierto,   setMenuAbierto]   = useState(false)
  const [modalPwd,      setModalPwd]      = useState(false)
  const [formPwd,       setFormPwd]       = useState({ nueva: '', confirmar: '' })
  const [msgPwd,        setMsgPwd]        = useState(null)
  const [guardandoPwd,  setGuardandoPwd]  = useState(false)

  // Contador de Manuales en el menú: documentos por leer, trámites que le tocan y revisiones
  // vencidas (función manuales_mis_avisos). La pantalla de Manuales avisa con 'manuales-cambio'.
  const [avisosManuales, setAvisosManuales] = useState(0)
  const veManuales = puedeRuta('/manuales')
  useEffect(() => {
    if (!veManuales) return
    let vivo = true
    const cargar = () => supabase.rpc('manuales_mis_avisos').then(({ data }) => {
      const a = data?.[0]
      if (vivo && a) setAvisosManuales(a.por_leer + a.te_toca + a.revision_vencida)
    })
    cargar()
    window.addEventListener('manuales-cambio', cargar)
    return () => { vivo = false; window.removeEventListener('manuales-cambio', cargar) }
  }, [veManuales, perfil?.id])

  // Menú: el orden curado de cada rol, filtrado por sus permisos (Configuración › Permisos),
  // más los módulos que se le hayan dado y no estaban en su lista, agrupados por módulo.
  const navBase = esAdmin          ? NAV_ADMIN
    : esLogistica        ? NAV_LOGISTICA
    : esAlmacenista      ? NAV_ALMACENISTA
    : esOperario         ? NAV_OPERARIO
    : esJefeFundicion    ? NAV_JEFE_FUNDICION
    : esJefeMecanizados  ? NAV_JEFE_MECANIZADOS
    : esJefeEnsamble     ? NAV_JEFE_ENSAMBLE
    : esConsultor        ? NAV_CONSULTOR
    : esRRHH             ? NAV_RRHH
    : []
  const permitido = item => item.to === '/dashboard' || puedeRuta(item.to)
  const propios = navBase.filter(permitido)
  const extras = esAdmin ? [] : NAV_ADMIN
    .filter(i => !i.abajo && i.to !== '/dashboard' && permitido(i) && !propios.some(p => p.to === i.to))
    .map(i => ({ to: i.to, icon: i.icon, label: i.label, grupo: i.modulo }))
  const conInicio = !esAdmin && !esRRHH && !propios.some(i => i.to === '/dashboard')
  const navItems = [...(conInicio ? [{ to: '/dashboard', icon: LayoutDashboard, label: 'Inicio' }] : []), ...propios, ...extras]

  // Barra inferior móvil — curada para que las acciones clave siempre sean visibles
  const mobileCurada = (esOperario        ? MOBILE_OPERARIO
    : esAlmacenista      ? MOBILE_ALMACENISTA
    : esJefeFundicion    ? MOBILE_JEFE_FUNDICION
    : esJefeMecanizados  ? MOBILE_JEFE_MECANIZADOS
    : esJefeEnsamble     ? MOBILE_JEFE_ENSAMBLE
    : esConsultor        ? MOBILE_CONSULTOR
    : esRRHH             ? MOBILE_RRHH
    : []).filter(permitido)
  const mobileItems = mobileCurada.length >= 3 ? mobileCurada : navItems.filter(i => !i.abajo).slice(0, 5)
  const badge    = BADGE[perfil?.rol] || { color: 'bg-gray-400 text-white', label: perfil?.rol }
  const { hayActualizacion, actualizar } = useUpdateAvailable()

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

  // Activo: coincidencia exacta, o subruta (/fundidas/nueva, /rrhh/empleados/:id…) siempre que
  // ningún otro ítem del menú coincida exacto (así /analitica/fundicion no marca Analítica general)
  const esActivo = (to) => {
    const ruta = location.pathname
    if (to.includes('?')) return ruta + location.search === to
    if (ruta === to) return true
    if (to === '/reportes' && ruta.startsWith('/reportes')) return true
    return ruta.startsWith(to + '/') && !navItems.some(i => i.to === ruta)
  }
  const moduloActual = navItems.find(i => i.modulo && esActivo(i.to))?.modulo
  const [modulosAbiertos, setModulosAbiertos] = useState(() => new Set(moduloActual ? [moduloActual] : []))
  const toggleModulo = (m) => setModulosAbiertos(prev => {
    const n = new Set(prev)
    n.has(m) ? n.delete(m) : n.add(m)
    return n
  })

  const NavLink = ({ item, sub }) => {
    const activo = esActivo(item.to)
    return (
      <Link to={item.to} onClick={() => setMenuAbierto(false)}
        className={sub
          ? `relative flex items-center px-2.5 py-1.5 rounded-lg transition-colors text-[13px]
            ${activo
              ? 'text-feisen-azul font-semibold before:absolute before:-left-[9px] before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-feisen-azul'
              : 'text-feisen-texto-2 hover:bg-white hover:text-feisen-texto'}`
          : `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-[13.5px]
            ${activo
              ? 'bg-white text-feisen-azul font-semibold ring-1 ring-feisen-borde'
              : 'text-gray-700 hover:bg-white hover:text-feisen-texto'}`}>
        {!sub && <item.icon size={18} weight="duotone" className={activo ? '' : 'text-gray-500'} />}
        <span className="truncate">{item.label}</span>
        {item.to === '/manuales' && avisosManuales > 0 && (
          <span aria-label={`${avisosManuales} pendientes`} className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-feisen-azul text-white text-[11px] font-semibold grid place-items-center tabular-nums">{avisosManuales}</span>
        )}
      </Link>
    )
  }

  // Ítems sueltos arriba; luego los módulos desplegables (Admin); luego los agrupados con título
  // (Fundición del Jefe de Fundición); al final los `abajo` (Configuración)
  const grupos  = [...new Set(navItems.filter(i => i.grupo).map(i => i.grupo))]
  const modulos = [...new Set(navItems.filter(i => i.modulo).map(i => i.modulo))]
  const abajo   = navItems.filter(i => i.abajo)
  const MenuNav = () => (
    <>
      <div className="space-y-0.5">
        {navItems.filter(i => !i.grupo && !i.modulo && !i.abajo).map(item => <NavLink key={item.to} item={item} />)}
      </div>
      {modulos.length > 0 && (
        <div className="pt-4 space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-feisen-gris-medio px-3 pb-1.5">Módulos</p>
          {modulos.map(m => {
            const Icono   = MODULOS[m] || Package
            const abierto = modulosAbiertos.has(m)
            const tieneActivo = m === moduloActual
            return (
              <div key={m}>
                <button type="button" onClick={() => toggleModulo(m)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-[13.5px] hover:bg-white
                    ${abierto ? 'text-feisen-texto font-medium' : tieneActivo ? 'text-feisen-azul font-medium' : 'text-gray-700 hover:text-feisen-texto'}`}>
                  <Icono size={18} weight="duotone" className={abierto || tieneActivo ? 'text-feisen-azul' : 'text-gray-500'} />
                  <span className="flex-1 text-left truncate">{NOMBRE_EN_MENU[m] || m}</span>
                  {abierto ? <ChevronDown size={15} className="text-feisen-gris-medio" /> : <ChevronRight size={15} className="text-feisen-gris-medio" />}
                </button>
                {abierto && (
                  <div className="ml-[21px] pl-2 border-l border-feisen-borde space-y-px mt-0.5 mb-1.5">
                    {navItems.filter(i => i.modulo === m).map(item => <NavLink key={item.to} item={item} sub />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {grupos.map(g => (
        <div key={g}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-feisen-gris-medio px-3 pt-5 pb-1.5">{g}</p>
          <div className="space-y-0.5">
            {navItems.filter(i => i.grupo === g).map(item => <NavLink key={item.to} item={item} />)}
          </div>
        </div>
      ))}
      {abajo.length > 0 && (
        <div className="border-t border-feisen-borde mt-4 pt-3 space-y-0.5">
          {abajo.map(item => <NavLink key={item.to} item={item} />)}
        </div>
      )}
    </>
  )

  const iniciales = perfil?.nombre?.trim().split(/\s+/).slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('') || '?'

  return (
    <div className="min-h-screen bg-feisen-fondo flex flex-col lg:flex-row">

      {/* SIDEBAR DESKTOP */}
      <aside className="hidden lg:flex flex-col w-60 bg-feisen-fondo border-r border-feisen-borde sticky top-0 self-start h-screen overflow-y-auto px-3 py-5">
        {/* Logo */}
        <div className="px-3 mb-6">
          <img src={logoFeisen} alt="Feisen" className="h-7 w-auto" />
          <p className="text-[11px] text-feisen-gris-medio mt-1.5">ERP · Inventarios</p>
        </div>

        {/* Nav */}
        <nav className="flex-1">
          <MenuNav />
        </nav>

        {/* Ver como (solo admin real) */}
        {esAdminReal && (
          <div className="border-t border-feisen-borde pt-3 mt-4 pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-feisen-gris-medio px-3 mb-1.5 flex items-center gap-1.5">
              <Eye size={12} /> Vista previa
            </p>
            <select
              value={rolPreview || ''}
              onChange={e => setRolPreview(e.target.value || null)}
              className="w-full border border-feisen-borde rounded-lg px-3 py-1.5 text-sm bg-white text-feisen-texto focus:outline-none focus:ring-2 focus:ring-feisen-azul"
            >
              <option value="">Mi vista (Admin)</option>
              <option value="LOGISTICA">Ver como Logística</option>
              <option value="ALMACENISTA">Ver como Almacenista</option>
              <option value="OPERARIO">Ver como Operario</option>
              <option value="CONSULTOR">Ver como Consultor</option>
              <option value="JEFE_FUNDICION">Ver como Jefe Fundición</option>
              <option value="JEFE_MECANIZADOS">Ver como Jefe Mecanizados</option>
              <option value="JEFE_ENSAMBLE">Ver como Jefe Ensamble</option>
              <option value="RRHH">Ver como Recursos Humanos</option>
            </select>
            {rolPreview && (
              <button onClick={() => setRolPreview(null)}
                className="w-full mt-1.5 text-xs text-feisen-rojo hover:underline text-center">
                Salir del modo vista
              </button>
            )}
          </div>
        )}

        {/* Perfil */}
        <div className="border-t border-feisen-borde pt-3 mt-4">
          <div className="flex items-center gap-2.5 px-3 mb-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${perfil?.rol === 'ADMIN' ? 'bg-feisen-rojo-suave text-feisen-rojo' : 'bg-feisen-azul-suave text-feisen-azul'}`}>
              <span className="font-semibold text-xs">{iniciales}</span>
            </div>
            <div className="overflow-hidden">
              <p className="font-semibold text-sm text-feisen-texto truncate">{perfil?.nombre}</p>
              <p className="text-[11px] text-feisen-gris-medio truncate">{badge.label}</p>
            </div>
          </div>
          <button onClick={() => { setFormPwd({ nueva: '', confirmar: '' }); setMsgPwd(null); setModalPwd(true) }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-feisen-texto-2 hover:bg-white transition-colors text-[13px]">
            <KeyRound size={15} strokeWidth={1.8} /> Cambiar contraseña
          </button>
          <button onClick={actualizar}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-feisen-texto-2 hover:bg-white transition-colors text-[13px]">
            <RefreshCw size={15} strokeWidth={1.8} /> Actualizar app
          </button>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-feisen-rojo hover:bg-feisen-rojo-suave transition-colors text-[13px]">
            <LogOut size={15} strokeWidth={1.8} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* HEADER MÓVIL */}
      <header className="lg:hidden bg-white border-b border-feisen-borde px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <img src={logoFeisen} alt="Feisen" className="h-7 w-auto" />
        <div className="flex items-center gap-3">
          <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-feisen-azul-suave text-feisen-azul">{badge.label}</span>
          <button onClick={() => setMenuAbierto(v => !v)} className="text-feisen-gris-oscuro p-1">
            {menuAbierto ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* MENÚ MÓVIL */}
      {menuAbierto && (
        <div className="lg:hidden fixed inset-0 z-30 bg-white pt-16 px-4 pb-6 overflow-y-auto">
          <nav className="mb-6">
            <MenuNav />
          </nav>
          <div className="border-t border-feisen-borde pt-4 space-y-1">
            <button onClick={() => { setMenuAbierto(false); setFormPwd({ nueva: '', confirmar: '' }); setMsgPwd(null); setModalPwd(true) }}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100 font-medium">
              <KeyRound size={18} /> Cambiar contraseña
            </button>
            <button onClick={actualizar}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100 font-medium">
              <RefreshCw size={18} /> Actualizar app
            </button>
            <button onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-feisen-rojo bg-red-50 font-medium">
              <LogOut size={18} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {/* CONTENIDO */}
      <main className="flex-1 min-w-0 p-4 lg:px-10 lg:py-8 pb-24 lg:pb-10">
        {rolPreview && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Eye size={16} className="text-amber-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-amber-800">
                Modo vista: <span className="text-amber-900">{BADGE[rolPreview]?.label || rolPreview}</span>
              </p>
              <span className="text-xs text-amber-600">— Estás viendo la app como lo vería este perfil</span>
            </div>
            <button onClick={() => setRolPreview(null)}
              className="text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              Salir
            </button>
          </div>
        )}
        {children}
      </main>

      {/* BARRA INFERIOR MÓVIL */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-feisen-borde pb-safe flex z-20">
        {mobileItems.map(item => {
          const activo = item.to.includes('?')
            ? location.pathname + location.search === item.to
            : location.pathname === item.to
          return (
            <Link key={item.to} to={item.to}
              className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors
                ${activo ? 'text-feisen-azul' : 'text-feisen-gris-medio'}`}>
              <item.icon size={20} weight="duotone" />
              <span className="text-xs font-medium leading-tight text-center">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* BANNER NUEVA VERSIÓN */}
      {hayActualizacion && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
          <div className="bg-feisen-azul text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4">
            <Sparkles size={22} className="flex-shrink-0 text-yellow-300" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">¡Nueva versión disponible!</p>
              <p className="text-xs text-blue-200 mt-0.5">Actualiza para ver los últimos cambios.</p>
            </div>
            <button onClick={actualizar}
              className="flex-shrink-0 bg-white text-feisen-azul text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-blue-50 transition-colors">
              Actualizar
            </button>
          </div>
        </div>
      )}

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
                className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Confirmar contraseña *</label>
              <input required type="password" minLength={6} value={formPwd.confirmar}
                onChange={e => setFormPwd(f => ({ ...f, confirmar: e.target.value }))}
                placeholder="Repite la contraseña"
                className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalPwd(false)}
                className="flex-1 border border-feisen-borde rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
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
