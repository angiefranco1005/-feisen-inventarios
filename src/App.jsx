import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './components/auth/LoginPage'
import ResetPasswordPage from './components/auth/ResetPasswordPage'
import Layout from './components/shared/Layout'
import Spinner from './components/shared/Spinner'

import DashboardAdmin     from './components/admin/Dashboard'
import DashboardLogistica from './components/logistica/Dashboard'
import DashboardConsultor from './components/consultor/Dashboard'
import GestionProductos   from './components/productos/GestionProductos'
import RegistrarMovimiento           from './components/movimientos/RegistrarMovimiento'
import RegistrarMovimientoAlmacenista from './components/movimientos/RegistrarMovimientoAlmacenista'
import Historial          from './components/movimientos/Historial'
import ListaPedidos       from './components/pedidos/ListaPedidos'
import GestionConfig      from './components/config/GestionConfig'
import CorteInventario    from './components/reportes/CorteInventario'
import InventarioFisico   from './components/reportes/InventarioFisico'
import RegistrarFundida    from './components/fundicion/RegistrarFundida'
import ListaFundidas       from './components/fundicion/ListaFundidas'
import CrearOrdenMoldeo    from './components/fundicion/CrearOrdenMoldeo'
import ListaOrdenesMoldeo  from './components/fundicion/ListaOrdenesMoldeo'
import GestionBOM          from './components/fundicion/GestionBOM'
import RecogidaFundida     from './components/fundicion/RecogidaFundida'
import InformeNomina       from './components/reportes/InformeNomina'

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

  // CONSULTOR → solo ve su dashboard
  if (rolEfectivo === 'CONSULTOR') {
    return (
      <Routes>
        <Route path="*" element={<Layout><DashboardConsultor /></Layout>} />
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
        <Route path="/fundidas"          element={<Layout><ListaFundidas /></Layout>} />
        <Route path="/fundidas/nueva"    element={<Layout><RegistrarFundida /></Layout>} />
        <Route path="/moldeo"            element={<Layout><ListaOrdenesMoldeo /></Layout>} />
        <Route path="/moldeo/nueva"      element={<Layout><CrearOrdenMoldeo /></Layout>} />
        <Route path="/moldeo/catalogo"   element={<Layout><GestionBOM /></Layout>} />
        <Route path="/recogida"          element={<Layout><RecogidaFundida /></Layout>} />
        <Route path="/nomina/fundicion"  element={<Layout><InformeNomina /></Layout>} />
        <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
      </Routes>
    )
  }

  // JEFE_MECANIZADOS
  if (rolEfectivo === 'JEFE_MECANIZADOS') {
    return (
      <Routes>
        <Route path="/"                  element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/dashboard"         element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/productos"         element={<Layout><GestionProductos /></Layout>} />
        <Route path="/movimientos/nuevo" element={<Layout><RegistrarMovimientoAlmacenista /></Layout>} />
        <Route path="/movimientos"       element={<Layout><Historial /></Layout>} />
        <Route path="/pedidos"           element={<Layout><ListaPedidos /></Layout>} />
        <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
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
      <Route path="/config"            element={<Layout><GestionConfig /></Layout>} />
      <Route path="/reportes/corte"         element={<Layout><CorteInventario /></Layout>} />
      <Route path="/reportes/inventario-fisico" element={<Layout><InventarioFisico /></Layout>} />
      <Route path="/fundidas"          element={<Layout><ListaFundidas /></Layout>} />
      <Route path="/fundidas/nueva"    element={<Layout><RegistrarFundida /></Layout>} />
      <Route path="/moldeo"            element={<Layout><ListaOrdenesMoldeo /></Layout>} />
      <Route path="/moldeo/nueva"      element={<Layout><CrearOrdenMoldeo /></Layout>} />
      <Route path="/moldeo/catalogo"   element={<Layout><GestionBOM /></Layout>} />
      <Route path="/recogida"          element={<Layout><RecogidaFundida /></Layout>} />
      <Route path="/nomina/fundicion"  element={<Layout><InformeNomina /></Layout>} />
      <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
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
