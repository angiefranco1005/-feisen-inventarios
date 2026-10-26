import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './components/auth/LoginPage'
import ResetPasswordPage from './components/auth/ResetPasswordPage'
import Layout from './components/shared/Layout'
import Spinner from './components/shared/Spinner'

import DashboardAdmin      from './components/admin/Dashboard'
import DashboardEjecutivo from './components/admin/DashboardEjecutivo'
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
import OrdenesCompra            from './components/compras/OrdenesCompra'
import ListaEmpleados           from './components/rrhh/ListaEmpleados'
import FichaEmpleado            from './components/rrhh/FichaEmpleado'

function Cargando() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Spinner />
    </div>
  )
}

function AppRoutes() {
  const { session, perfil, cargando, rolEfectivo } = useAuth()

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

  // CONSULTOR → dashboard + pedidos propios
  if (rolEfectivo === 'CONSULTOR') {
    return (
      <Routes>
        <Route path="/"          element={<Layout><DashboardConsultor /></Layout>} />
        <Route path="/dashboard" element={<Layout><DashboardConsultor /></Layout>} />
        <Route path="/pedidos"   element={<Layout><ListaPedidos /></Layout>} />
        <Route path="*"          element={<Layout><DashboardConsultor /></Layout>} />
      </Routes>
    )
  }

  // RRHH (coordinadora de Recursos Humanos) — solo el módulo de personas
  if (rolEfectivo === 'RRHH') {
    return (
      <Routes>
        <Route path="/rrhh/empleados"     element={<Layout><ListaEmpleados /></Layout>} />
        <Route path="/rrhh/empleados/:id" element={<Layout><FichaEmpleado /></Layout>} />
        <Route path="*"                   element={<Navigate to="/rrhh/empleados" replace />} />
      </Routes>
    )
  }

  // LOGISTICA
  if (rolEfectivo === 'LOGISTICA') {
    return (
      <Routes>
        <Route path="/"                  element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/dashboard"         element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/productos"         element={<Layout><GestionProductos /></Layout>} />
        <Route path="/movimientos/nuevo" element={<Layout><RegistrarMovimiento /></Layout>} />
        <Route path="/movimientos"       element={<Layout><Historial /></Layout>} />
        <Route path="/pedidos"           element={<Layout><ListaPedidos /></Layout>} />
        <Route path="/calidad"           element={<Layout><NoConformidades /></Layout>} />
        <Route path="/ordenes-compra"    element={<Layout><OrdenesCompra /></Layout>} />
        <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
      </Routes>
    )
  }

  // OPERARIO
  if (rolEfectivo === 'OPERARIO') {
    return (
      <Routes>
        <Route path="/"                  element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/dashboard"         element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/productos"         element={<Layout><GestionProductos /></Layout>} />
        <Route path="/movimientos/nuevo" element={<Layout><RegistrarMovimientoAlmacenista /></Layout>} />
        <Route path="/movimientos"       element={<Layout><Historial /></Layout>} />
        <Route path="/pedidos"           element={<Layout><ListaPedidos /></Layout>} />
        <Route path="/calidad"           element={<Layout><NoConformidades /></Layout>} />
        <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
      </Routes>
    )
  }

  // ALMACENISTA
  if (rolEfectivo === 'ALMACENISTA') {
    return (
      <Routes>
        <Route path="/"                  element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/dashboard"         element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/productos"         element={<Layout><GestionProductos /></Layout>} />
        <Route path="/movimientos/nuevo" element={<Layout><RegistrarMovimientoAlmacenista /></Layout>} />
        <Route path="/movimientos"       element={<Layout><Historial /></Layout>} />
        <Route path="/pedidos"           element={<Layout><ListaPedidos /></Layout>} />
        <Route path="/calidad"           element={<Layout><NoConformidades /></Layout>} />
        <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
      </Routes>
    )
  }

  // JEFE_FUNDICION
  if (rolEfectivo === 'JEFE_FUNDICION') {
    return (
      <Routes>
        <Route path="/"                  element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/dashboard"         element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/productos"         element={<Layout><GestionProductos /></Layout>} />
        <Route path="/movimientos/nuevo" element={<Layout><RegistrarMovimientoAlmacenista /></Layout>} />
        <Route path="/movimientos"       element={<Layout><Historial /></Layout>} />
        <Route path="/pedidos"           element={<Layout><ListaPedidos /></Layout>} />
        <Route path="/transferencias"    element={<Layout><TransferenciasPendientes /></Layout>} />
        <Route path="/calidad"           element={<Layout><NoConformidades /></Layout>} />
        <Route path="/fundidas"          element={<Layout><ListaFundidas /></Layout>} />
        <Route path="/fundidas/nueva"    element={<Layout><RegistrarFundida /></Layout>} />
        <Route path="/moldeo"            element={<Layout><ListaOrdenesMoldeo /></Layout>} />
        <Route path="/moldeo/nueva"      element={<Layout><CrearOrdenMoldeo /></Layout>} />
        <Route path="/moldeo/catalogo"   element={<Layout><GestionBOM /></Layout>} />
        <Route path="/recogida"          element={<Layout><RecogidaFundida /></Layout>} />
        <Route path="/nomina/fundicion"  element={<Layout><InformeNomina /></Layout>} />
        <Route path="/analitica/fundicion" element={<Layout><AnaliticaFundicion /></Layout>} />
        <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
      </Routes>
    )
  }

  // JEFE_MECANIZADOS
  if (rolEfectivo === 'JEFE_MECANIZADOS') {
    return (
      <Routes>
        <Route path="/"                     element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/dashboard"            element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/productos"            element={<Layout><GestionProductos /></Layout>} />
        <Route path="/movimientos/nuevo"    element={<Layout><RegistrarMovimientoAlmacenista /></Layout>} />
        <Route path="/movimientos"          element={<Layout><Historial /></Layout>} />
        <Route path="/pedidos"              element={<Layout><ListaPedidos /></Layout>} />
        <Route path="/transferencias"       element={<Layout><TransferenciasPendientes /></Layout>} />
        <Route path="/calidad"              element={<Layout><NoConformidades /></Layout>} />
        <Route path="/mecanizados/registro" element={<Layout><RegistroMecanizado /></Layout>} />
        <Route path="*"                     element={<Navigate to="/dashboard" replace />} />
      </Routes>
    )
  }

  // ADMIN (y cualquier otro)
  return (
    <Routes>
      <Route path="/"                  element={<Layout><DashboardAdmin /></Layout>} />
      <Route path="/dashboard"         element={<Layout><DashboardAdmin /></Layout>} />
      <Route path="/productos"         element={<Layout><GestionProductos /></Layout>} />
      <Route path="/movimientos/nuevo" element={<Layout><RegistrarMovimiento /></Layout>} />
      <Route path="/movimientos"       element={<Layout><Historial /></Layout>} />
      <Route path="/pedidos"           element={<Layout><ListaPedidos /></Layout>} />
      <Route path="/ordenes-compra"    element={<Layout><OrdenesCompra /></Layout>} />
      <Route path="/config"            element={<Layout><GestionConfig /></Layout>} />
      <Route path="/mecanizados/paquetes" element={<Layout><GestionPaquetes /></Layout>} />
      <Route path="/analitica"              element={<Layout><DashboardEjecutivo /></Layout>} />
      <Route path="/reportes"               element={<Layout><HubReportes /></Layout>} />
      <Route path="/reportes/corte"         element={<Layout><CorteInventario /></Layout>} />
      <Route path="/reportes/inventario-fisico" element={<Layout><InventarioFisico /></Layout>} />
      <Route path="/reportes/kardex"        element={<Layout><InformeKardex /></Layout>} />
      <Route path="/reportes/ventas-internas-fundicion" element={<Layout><InformeVentasInternasFundicion /></Layout>} />
      <Route path="/reportes/balance-hierro" element={<Layout><InformeBalanceHierro /></Layout>} />
      <Route path="/fundidas"          element={<Layout><ListaFundidas /></Layout>} />
      <Route path="/fundidas/nueva"    element={<Layout><RegistrarFundida /></Layout>} />
      <Route path="/moldeo"            element={<Layout><ListaOrdenesMoldeo /></Layout>} />
      <Route path="/moldeo/nueva"      element={<Layout><CrearOrdenMoldeo /></Layout>} />
      <Route path="/moldeo/catalogo"   element={<Layout><GestionBOM /></Layout>} />
      <Route path="/recogida"          element={<Layout><RecogidaFundida /></Layout>} />
      <Route path="/nomina/fundicion"       element={<Layout><InformeNomina /></Layout>} />
      <Route path="/analitica/fundicion"    element={<Layout><AnaliticaFundicion /></Layout>} />
      <Route path="/mecanizados/registro"   element={<Layout><RegistroMecanizado /></Layout>} />
      <Route path="/calidad"               element={<Layout><NoConformidades /></Layout>} />
      <Route path="/rrhh/empleados"        element={<Layout><ListaEmpleados /></Layout>} />
      <Route path="/rrhh/empleados/:id"    element={<Layout><FichaEmpleado /></Layout>} />
      <Route path="*"                      element={<Navigate to="/dashboard" replace />} />
    </Routes>
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
