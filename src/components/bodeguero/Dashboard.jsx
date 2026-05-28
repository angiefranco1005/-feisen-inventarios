import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatNumero, formatFechaHora, TIPOS_MOVIMIENTO } from '../../utils/formatters'
import Spinner from '../shared/Spinner'
import { Link } from 'react-router-dom'
import { Plus, Package, ArrowUpDown, AlertTriangle } from 'lucide-react'

export default function DashboardBodeguero() {
  const { perfil } = useAuth()
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: movRecientes }, { data: alertas }] = await Promise.all([
      supabase.from('movimientos')
        .select('*, items(nombre, unidad_medida)')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('stock')
        .select('cantidad_actual, items(nombre, stock_minimo, activo)')
        .eq('items.activo', true)
    ])

    const stockBajo = (alertas || []).filter(s =>
      s.items?.stock_minimo > 0 && s.cantidad_actual < s.items.stock_minimo
    )
    setDatos({ movRecientes: movRecientes || [], stockBajo })
    setCargando(false)
  }

  if (cargando) return <Spinner />

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-feisen-azul">Hola, {perfil?.nombre?.split(' ')[0]}</h1>
        <p className="text-feisen-gris-medio text-sm mt-1">Panel de bodeguero</p>
      </div>

      {/* Acciones rápidas */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/movimientos/nuevo?tipo=entrada_compra"
          className="bg-emerald-600 text-white rounded-2xl p-5 text-center font-bold text-base hover:bg-emerald-700 transition-colors">
          <Package size={28} className="mx-auto mb-2" />
          Registrar entrada
        </Link>
        <Link to="/movimientos/nuevo?tipo=ajuste_inventario"
          className="bg-feisen-azul text-white rounded-2xl p-5 text-center font-bold text-base hover:bg-feisen-azul-claro transition-colors">
          <ArrowUpDown size={28} className="mx-auto mb-2" />
          Ajuste de inventario
        </Link>
      </div>

      {/* Alertas stock bajo */}
      {datos.stockBajo.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 bg-red-50 border-b border-red-100">
            <AlertTriangle size={18} className="text-feisen-rojo" />
            <h2 className="font-semibold text-feisen-rojo">{datos.stockBajo.length} productos con stock bajo</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {datos.stockBajo.slice(0, 5).map((s, i) => (
              <div key={i} className="px-5 py-3 flex justify-between items-center">
                <p className="text-sm font-medium text-feisen-gris-oscuro">{s.items?.nombre}</p>
                <span className="text-feisen-rojo font-bold text-sm">{formatNumero(s.cantidad_actual)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movimientos recientes */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-feisen-gris-oscuro">Movimientos recientes</h2>
        </div>
        {datos.movRecientes.length === 0 ? (
          <p className="text-center text-feisen-gris-medio py-10 text-sm">No hay movimientos recientes.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {datos.movRecientes.map(m => (
              <div key={m.id} className="px-5 py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-feisen-gris-oscuro">{m.items?.nombre}</p>
                  <p className="text-xs text-feisen-gris-medio">{TIPOS_MOVIMIENTO[m.tipo]} · {formatFechaHora(m.created_at)}</p>
                </div>
                <span className="font-bold text-feisen-azul text-sm">{formatNumero(m.cantidad)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
