import { useState } from 'react'
import Dashboard from './Dashboard'
import DashboardVentas from './ventas/DashboardVentas'

const VISTAS = [
  { id: 'pedidos', label: 'Pedidos (OF)' },
  { id: 'ventas',  label: 'Dashboard de ventas' },
]

// Dashboard del módulo Ventas: el análisis de las OF y el dashboard de ventas de Odoo.
// La vista elegida se recuerda en este navegador.
export default function DashboardVentasOF() {
  const [vista, setVista] = useState(() => {
    try { return localStorage.getItem('feisen-of-dashboard') === 'ventas' ? 'ventas' : 'pedidos' } catch { return 'pedidos' }
  })

  function elegir(v) {
    setVista(v)
    try { localStorage.setItem('feisen-of-dashboard', v) } catch { /* sin almacenamiento */ }
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex bg-white border border-feisen-borde rounded-lg p-1">
        {VISTAS.map(v => (
          <button key={v.id} onClick={() => elegir(v.id)}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${vista === v.id ? 'bg-feisen-azul-suave text-feisen-azul' : 'text-feisen-texto-2 hover:text-feisen-texto'}`}>
            {v.label}
          </button>
        ))}
      </div>
      {vista === 'pedidos' ? <Dashboard /> : <DashboardVentas />}
    </div>
  )
}
