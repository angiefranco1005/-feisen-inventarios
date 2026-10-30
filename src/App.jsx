import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './components/auth/LoginPage'
import ResetPasswordPage from './components/auth/ResetPasswordPage'
import Layout from './components/shared/Layout'
import Spinner from './components/shared/Spinner'

import InicioGerencia     from './components/admin/inicio/InicioGerencia'
import DashboardLogistica from './components/logistica/Dashboard'
import DashboardConsultor from './components/consultor/Dashboard'
import GestionProductos   from './components/productos/GestionProductos'
import RegistrarMovimiento           from './components/movimientos/RegistrarMovimiento'
import RegistrarMovimientoAlmacenista from './components/movimientos/RegistrarMovimientoAlmacenista'
import Historial          from './components/movimientos/Historial'
import ListaPedidos       from './components/pedidos/ListaPedidos'
import GestionConfig      from './components/config/GestionConfig'
import HubReportes        from './components/reportes/HubReportes'
import CorteInventario    from './components/reportes/CorteInventario'
import InventarioFisico   from './components/reportes/InventarioFisico'
import InformeKardex      from './components/reportes/InformeKardex'
import InformeVentasInternasFundicion from './components/reportes/InformeVentasInternasFundicion'
import InformeBalanceHierro from './components/reportes/InformeBalanceHierro'
import RegistrarFundida    from './components/fundicion/RegistrarFundida'
import ListaFundidas       from './components/fundicion/ListaFundidas'
import CrearOrdenMoldeo    from './components/fundicion/CrearOrdenMoldeo'
import ListaOrdenesMoldeo  from './components/fundicion/ListaOrdenesMoldeo'
import GestionBOM          from './components/fundicion/GestionBOM'
import RecogidaFundida     from './components/fundicion/RecogidaFundida'
import AnaliticaFundicion  from './components/fundicion/AnaliticaFundicion'
import InformeNomina       from './components/reportes/InformeNomina'
import RegistroMecanizado       from './components/mecanizados/RegistroMecanizado'
import GestionPaquetes          from './components/mecanizados/GestionPaquetes'
import TransferenciasPendientes from './components/transferencias/TransferenciasPendientes'
import NoConformidades          from './components/calidad/NoConformidades'
import NuevaOrdenOF        from './components/of/NuevaOrden'
import ListaOrdenesOF       from './components/of/ListaOrdenes'
import ResumenPlaneacionOF  from './components/of/ResumenPlaneacion'
import CalendarioOF         from './components/of/Calendario'
import DashboardOF          from './components/of/DashboardVentasOF'
import ProductosOF          from './components/of/ProductosOF'
import ClientesOF           from './components/of/ClientesOF'
import CosteoFichas         from './components/costeo/CosteoFichas'
import CosteoFicha          from './components/costeo/CosteoFicha'
import EtapasMaestro        from './components/costeo/EtapasMaestro'
import CifMaestro           from './components/costeo/CifMaestro'
import EquiposMaestro       from './components/costeo/EquiposMaestro'
import OrdenesCompra            from './components/compras/OrdenesCompra'
import ListaEmpleados           from './components/rrhh/ListaEmpleados'
import FichaEmpleado            from './components/rrhh/FichaEmpleado'
import Organigrama              from './components/rrhh/Organigrama'
import FichaCargo               from './components/rrhh/FichaCargo'
import Novedades                from './components/rrhh/Novedades'
import Calendario               from './components/rrhh/Calendario'
import Nomina                   from './components/rrhh/nomina/Nomina'
import PeriodoNomina            from './components/rrhh/nomina/PeriodoNomina'
import LiquidacionPersona       from './components/rrhh/nomina/LiquidacionPersona'
import TarifasDestajo           from './components/rrhh/nomina/TarifasDestajo'
import Desempeno                from './components/rrhh/desempeno/Desempeno'
import CicloDesempeno           from './components/rrhh/desempeno/CicloDesempeno'
import EvaluacionPersona        from './components/rrhh/desempeno/EvaluacionPersona'
import OrdenesEnsamble          from './components/ensamble/OrdenesEnsamble'
import RecetasEnsamble          from './components/ensamble/RecetasEnsamble'
import Mantenimiento            from './components/mantenimiento/Mantenimiento'
import ResultadoCentros         from './components/finanzas/ResultadoCentros'
import PendientesFinanzas       from './components/finanzas/Pendientes'
import FlujoCaja                from './components/finanzas/FlujoCaja'
import Manuales                 from './components/manuales/Manuales'
import { MODULOS }              from './permisos/modulos'

// Al pasar de "Editar OF" (/of/nueva?editar=...) a "Nueva OF" React reutilizaba el formulario
// con los datos de la OF editada; con la clave arranca limpio cada vez que cambia la OF.
function NuevaOrdenOFConClave() {
  const [params] = useSearchParams()
  return <NuevaOrdenOF key={params.get('editar') || 'nueva'} />
}

function Cargando() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Spinner />
    </div>
  )
}

function AppRoutes() {
  const { session, cargando, rolEfectivo, puede, puedeRuta } = useAuth()

  if (cargando) return <Cargando />

  // Sin sesión → Login
  if (!session) {
    return (
      <Routes>
        <Route path="/login"          element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*"               element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Pantallas por ruta. Qué rutas abre cada persona lo decide su rol en Configuración ›
  // Permisos (tabla rol_permisos, catálogo en src/permisos/modulos.js); ADMIN abre todo.
  const registrarMov = rolEfectivo === 'ADMIN' || rolEfectivo === 'LOGISTICA' ? <RegistrarMovimiento /> : <RegistrarMovimientoAlmacenista />
  const PANTALLAS = {
    '/productos': <GestionProductos />, '/movimientos/nuevo': registrarMov, '/movimientos': <Historial />,
    '/transferencias': <TransferenciasPendientes />, '/mecanizados/paquetes': <GestionPaquetes />,
    '/reportes': <HubReportes />, '/reportes/corte': <CorteInventario />, '/reportes/inventario-fisico': <InventarioFisico />, '/reportes/kardex': <InformeKardex />,
    '/pedidos': <ListaPedidos />, '/ordenes-compra': <OrdenesCompra />,
    '/fundidas': <ListaFundidas />, '/fundidas/nueva': <RegistrarFundida />, '/moldeo': <ListaOrdenesMoldeo />, '/moldeo/nueva': <CrearOrdenMoldeo />,
    '/moldeo/catalogo': <GestionBOM />, '/recogida': <RecogidaFundida />, '/nomina/fundicion': <InformeNomina />, '/analitica/fundicion': <AnaliticaFundicion />,
    '/reportes/balance-hierro': <InformeBalanceHierro />, '/reportes/ventas-internas-fundicion': <InformeVentasInternasFundicion />,
    '/mecanizados/registro': <RegistroMecanizado />, '/ensamble': <OrdenesEnsamble />, '/ensamble/recetas': <RecetasEnsamble />,
    '/calidad': <NoConformidades />, '/mantenimiento': <Mantenimiento />,
    '/of/nueva': <NuevaOrdenOFConClave />, '/of/ordenes': <ListaOrdenesOF />, '/of/resumen': <ResumenPlaneacionOF />, '/of/calendario': <CalendarioOF />,
    '/of/dashboard': <DashboardOF />, '/of/productos': <ProductosOF />, '/of/clientes': <ClientesOF />,
    '/costeo': <CosteoFichas />, '/costeo/fichas/:id': <CosteoFicha />, '/costeo/etapas': <EtapasMaestro />, '/costeo/cif': <CifMaestro />, '/costeo/equipos': <EquiposMaestro />,
    '/rrhh/empleados': <ListaEmpleados />, '/rrhh/empleados/:id': <FichaEmpleado />, '/rrhh/organigrama': <Organigrama />, '/rrhh/organigrama/:id': <FichaCargo />,
    '/rrhh/novedades': <Novedades />, '/rrhh/calendario': <Calendario />, '/rrhh/nomina': <Nomina />, '/rrhh/nomina/tarifas': <TarifasDestajo />,
    '/rrhh/nomina/:periodoId': <PeriodoNomina />, '/rrhh/nomina/:periodoId/:liqId': <LiquidacionPersona />,
    '/rrhh/desempeno': <Desempeno />, '/rrhh/desempeno/:cicloId': <CicloDesempeno />, '/rrhh/desempeno/:cicloId/:evalId': <EvaluacionPersona />,
    '/finanzas/resultado': <ResultadoCentros />, '/finanzas/cartera': <PendientesFinanzas key="cobrar" tipo="cobrar" />,
    '/finanzas/por-pagar': <PendientesFinanzas key="pagar" tipo="pagar" />, '/finanzas/flujo': <FlujoCaja />,
    '/manuales': <Manuales />,
    '/config': <GestionConfig />,
  }
  const permitidos = MODULOS.filter(m => puede(m.clave))
  const rutasPermitidas = permitidos.flatMap(m => m.rutas).filter(puedeRuta)
  const primera = rutasPermitidas.find(r => !r.includes(':'))

  // Inicio según el rol: gerencia, consulta de ventas, registro de bodega o la primera pantalla que tenga
  const inicio = rolEfectivo === 'ADMIN' ? <Layout><InicioGerencia /></Layout>
    : rolEfectivo === 'CONSULTOR' ? <Layout><DashboardConsultor /></Layout>
    : rolEfectivo === 'RRHH' && puede('rrhh') ? <Navigate to="/rrhh/empleados" replace />
    : puede('movimientos') ? <Layout><DashboardLogistica /></Layout>
    : primera ? <Navigate to={primera} replace />
    : <Layout><SinModulos /></Layout>

  return (
    <Routes>
      <Route path="/"          element={inicio} />
      <Route path="/dashboard" element={inicio} />
      {/* Analítica quedó dentro del Inicio de gerencia (2026-10-28) */}
      <Route path="/analitica" element={<Navigate to="/dashboard" replace />} />
      {rutasPermitidas.map(ruta => PANTALLAS[ruta] &&
        <Route key={ruta} path={ruta} element={<Layout>{PANTALLAS[ruta]}</Layout>} />)}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

// Rol sin ningún módulo asignado en Configuración › Permisos
function SinModulos() {
  return (
    <div className="max-w-md mx-auto mt-16 bg-white border border-feisen-borde rounded-xl p-6 text-center">
      <p className="font-semibold text-feisen-texto">Tu usuario todavía no tiene módulos asignados</p>
      <p className="text-sm text-feisen-texto-2 mt-1">Pídele a la administración que le dé permisos a tu rol en Configuración › Permisos.</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
