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

// BODEGUERO
import DashboardBodeguero from './components/bodeguero/Dashboard'

// JEFE_AREA
import DashboardJefeArea from './components/jefe_area/Dashboard'

// OPERARIO
import DashboardOperario from './components/operario/Dashboard'

// Movimientos (compartido)
import RegistrarMovimiento from './components/movimientos/RegistrarMovimiento'

// Componente que protege rutas y redirige según rol
function RutaProtegida({ children }) {
  const { session, cargando } = useAuth()
  if (cargando) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

// Redirige al dashboard correcto según el rol
function RedirectDashboard() {
  const { perfil, cargando } = useAuth()
  if (cargando) return <Spinner />
  if (perfil?.rol === 'OPERARIO') return <DashboardOperario />
  if (perfil?.rol === 'BODEGUERO') return <DashboardBodeguero />
  if (perfil?.rol === 'JEFE_AREA') return <DashboardJefeArea />
  return <DashboardAdmin />
}

// Reportes según rol
function ReportesRol() {
  const { perfil } = useAuth()
  if (perfil?.rol === 'OPERARIO') return <Navigate to="/dashboard" replace />
  return <Reportes />
}

function AppRoutes() {
  const { session, perfil, cargando } = useAuth()

  if (cargando) return <div className="min-h-screen flex items-center justify-center bg-feisen-gris"><Spinner /></div>

  // Operario tiene su propia pantalla sin Layout
  if (session && perfil?.rol === 'OPERARIO') {
    return (
      <Routes>
        <Route path="*" element={<DashboardOperario />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/" element={<RutaProtegida><Layout><RedirectDashboard /></Layout></RutaProtegida>} />
      <Route path="/dashboard" element={<RutaProtegida><Layout><RedirectDashboard /></Layout></RutaProtegida>} />

      <Route path="/items" element={<RutaProtegida><Layout><GestionItems /></Layout></RutaProtegida>} />
      <Route path="/items/nuevo" element={<RutaProtegida><Layout><GestionItems /></Layout></RutaProtegida>} />

      <Route path="/movimientos" element={<RutaProtegida><Layout><ReportesRol /></Layout></RutaProtegida>} />
      <Route path="/movimientos/nuevo" element={<RutaProtegida><Layout><RegistrarMovimiento /></Layout></RutaProtegida>} />

      <Route path="/reportes" element={<RutaProtegida><Layout><ReportesRol /></Layout></RutaProtegida>} />

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
