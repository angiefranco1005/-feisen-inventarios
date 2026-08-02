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

function Cargando() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Spinner />
    </div>
  )
}

function AppRoutes() {
  const { session, perfil, cargando } = useAuth()

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
  if (esRol(perfil, 'CONSULTOR')) {
    return (
      <Routes>
        <Route path="*" element={<Layout><DashboardConsultor /></Layout>} />
      </Routes>
    )
  }

  // LOGISTICA
  if (esRol(perfil, 'LOGISTICA')) {
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
  if (esRol(perfil, 'ALMACENISTA')) {
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
  if (esRol(perfil, 'JEFE_FUNDICION')) {
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
      <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function esRol(perfil, rol) {
  return perfil?.rol === rol
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
