import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './components/auth/LoginPage'
import ResetPasswordPage from './components/auth/ResetPasswordPage'
import Layout from './components/shared/Layout'
import Spinner from './components/shared/Spinner'

// ADMIN
import DashboardAdmin from './components/admin/Dashboard'
import GestionItems from './components/admin/GestionItems'
import GestionConfig from './components/admin/GestionConfig'
import Reportes from './components/admin/Reportes'

// LOGISTICA (reutiliza dashboard de jefe)
import DashboardLogistica from './components/jefe_area/Dashboard'

// CONSULTOR
import DashboardConsultor from './components/consultor/Dashboard'

// PEDIDOS
import ListaPedidos from './components/pedidos/ListaPedidos'

// Movimientos (compartido)
import RegistrarMovimiento from './components/movimientos/RegistrarMovimiento'

// Componente que protege rutas y redirige según rol
function RutaProtegida({ children }) {
  const { session, cargando } = useAuth()
  if (cargando) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

// Reportes según rol
function ReportesRol() {
  return <Reportes />
}

function AppRoutes() {
  const { session, perfil, cargando } = useAuth()

  if (cargando) return <div className="min-h-screen flex items-center justify-center bg-feisen-gris"><Spinner /></div>

  // CONSULTOR: solo ve stock
  if (session && perfil?.rol === 'CONSULTOR') {
    return (
      <Routes>
        <Route path="*" element={<Layout><DashboardConsultor /></Layout>} />
      </Routes>
    )
  }

  // LOGISTICA: dashboard + productos + movimientos + reportes + pedidos
  if (session && perfil?.rol === 'LOGISTICA') {
    return (
      <Routes>
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/" element={<Layout><DashboardLogistica /></Layout>} />
        <Route path="/items" element={<Layout><GestionItems /></Layout>} />
        <Route path="/movimientos" element={<Layout><Reportes /></Layout>} />
        <Route path="/movimientos/nuevo" element={<Layout><RegistrarMovimiento /></Layout>} />
        <Route path="/reportes" element={<Layout><Reportes /></Layout>} />
        <Route path="/pedidos" element={<Layout><ListaPedidos /></Layout>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/" element={<RutaProtegida><Layout><DashboardAdmin /></Layout></RutaProtegida>} />
      <Route path="/dashboard" element={<RutaProtegida><Layout><DashboardAdmin /></Layout></RutaProtegida>} />

      <Route path="/items" element={<RutaProtegida><Layout><GestionItems /></Layout></RutaProtegida>} />
      <Route path="/items/nuevo" element={<RutaProtegida><Layout><GestionItems /></Layout></RutaProtegida>} />

      <Route path="/movimientos" element={<RutaProtegida><Layout><ReportesRol /></Layout></RutaProtegida>} />
      <Route path="/movimientos/nuevo" element={<RutaProtegida><Layout><RegistrarMovimiento /></Layout></RutaProtegida>} />

      <Route path="/reportes" element={<RutaProtegida><Layout><ReportesRol /></Layout></RutaProtegida>} />

      <Route path="/pedidos" element={<RutaProtegida><Layout><ListaPedidos /></Layout></RutaProtegida>} />

      <Route path="/config" element={<RutaProtegida><Layout><GestionConfig /></Layout></RutaProtegida>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
