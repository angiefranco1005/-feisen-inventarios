import { Link } from 'react-router-dom'
import { CalendarDays, ClipboardList, TrendingUp, ChevronRight } from 'lucide-react'

const REPORTES = [
  {
    to: '/reportes/corte',
    icon: CalendarDays,
    titulo: 'Inventario en fecha',
    descripcion: 'Ve el stock de todas las bodegas tal como estaba en cualquier fecha pasada. Exporta a Excel.',
    color: 'text-feisen-azul',
    bg: 'bg-blue-50',
  },
  {
    to: '/reportes/inventario-fisico',
    icon: ClipboardList,
    titulo: 'Inventario físico',
    descripcion: 'Plantilla para hacer conteo físico y compararlo contra el sistema.',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
  },
  {
    to: '/reportes/kardex',
    icon: TrendingUp,
    titulo: 'Kardex de movimientos',
    descripcion: 'Stock al inicio del período, entradas, salidas, transferencias y stock final. Exporta a Excel.',
    color: 'text-feisen-rojo',
    bg: 'bg-red-50',
  },
]

export default function HubReportes() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-feisen-azul">Informes</h1>
        <p className="text-sm text-gray-500 mt-1">Selecciona el tipo de informe que necesitas generar.</p>
      </div>

      <div className="grid gap-4">
        {REPORTES.map(r => (
          <Link
            key={r.to}
            to={r.to}
            className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex items-center gap-5 hover:shadow-md hover:border-gray-200 transition-all group"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${r.bg}`}>
              <r.icon size={24} className={r.color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 group-hover:text-feisen-azul transition-colors">{r.titulo}</p>
              <p className="text-sm text-gray-500 mt-0.5">{r.descripcion}</p>
            </div>
            <ChevronRight size={20} className="text-gray-300 group-hover:text-feisen-azul transition-colors flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
