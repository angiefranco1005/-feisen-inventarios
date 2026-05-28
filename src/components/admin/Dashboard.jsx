import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatCOP, formatNumero } from '../../utils/formatters'
import Spinner from '../shared/Spinner'
import {
  Package, AlertTriangle, TrendingUp, ArrowUpDown,
  Factory, Hammer, CircleDollarSign
} from 'lucide-react'
import { Link } from 'react-router-dom'

export default function DashboardAdmin() {
  const { perfil } = useAuth()
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    setCargando(true)

    // Stock completo con precio para valorización
    const { data: stockData } = await supabase
      .from('stock')
      .select('cantidad_actual, item_id, items(precio_costo, centro_costo, activo, stock_minimo, nombre)')
      .eq('items.activo', true)

    // Movimientos del día
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const { count: movHoy } = await supabase
      .from('movimientos')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', hoy.toISOString())

    // Total ítems activos
    const { count: totalItems } = await supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('activo', true)

    // Alertas de stock bajo
    const alertas = (stockData || []).filter(s =>
      s.items?.activo && s.cantidad_actual < s.items?.stock_minimo && s.items?.stock_minimo > 0
    )

    // Valorización global y por centro de costo
    let valorTotal = 0
    const porCentro = { 'Lámina': 0, 'Ferretería': 0, 'Mecanizado': 0, 'Almacén': 0, 'Motores': 0, 'Fundición Hierro': 0, 'Fundición de Aluminio': 0 }

    // Agrupar stock por item_id para sumar entre bodegas
    const stockPorItem = {}
    ;(stockData || []).forEach(s => {
      if (!s.items?.activo) return
      const key = s.item_id
      if (!stockPorItem[key]) stockPorItem[key] = { ...s.items, total: 0 }
      stockPorItem[key].total += Number(s.cantidad_actual || 0)
    })

    Object.values(stockPorItem).forEach(item => {
      const val = item.total * Number(item.precio_costo || 0)
      valorTotal += val
      if (porCentro[item.centro_costo] !== undefined) porCentro[item.centro_costo] += val
    })

    setDatos({ valorTotal, porCentro, alertas, movHoy, totalItems })
    setCargando(false)
  }

  if (cargando) return <Spinner texto="Cargando dashboard..." />

  const TarjetaValor = ({ titulo, valor, icono: Icon, color }) => (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-feisen-gris-oscuro text-sm font-medium">{titulo}</p>
        <div className={`p-2 rounded-xl ${color}`}><Icon size={20} className="text-white" /></div>
      </div>
      <p className="text-2xl font-bold text-feisen-azul">{formatCOP(valor)}</p>
    </div>
  )

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Saludo */}
      <div>
        <h1 className="text-2xl font-bold text-feisen-azul">
          Hola, {perfil?.nombre?.split(' ')[0]} 👋
        </h1>
        <p className="text-feisen-gris-medio text-sm mt-1">
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Tarjetas de resumen rápido */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-1">
          <Package size={22} className="text-feisen-azul" />
          <p className="text-2xl font-bold text-feisen-gris-oscuro">{formatNumero(datos.totalItems, 0)}</p>
          <p className="text-xs text-feisen-gris-medio">Productos activos</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-1">
          <ArrowUpDown size={22} className="text-feisen-azul" />
          <p className="text-2xl font-bold text-feisen-gris-oscuro">{datos.movHoy || 0}</p>
          <p className="text-xs text-feisen-gris-medio">Movimientos hoy</p>
        </div>
        <div className={`rounded-2xl p-4 shadow-sm flex flex-col gap-1 col-span-2 lg:col-span-2
          ${datos.alertas.length > 0 ? 'bg-feisen-rojo' : 'bg-white'}`}>
          <AlertTriangle size={22} className={datos.alertas.length > 0 ? 'text-white' : 'text-amber-500'} />
          <p className={`text-2xl font-bold ${datos.alertas.length > 0 ? 'text-white' : 'text-feisen-gris-oscuro'}`}>
            {datos.alertas.length}
          </p>
          <p className={`text-xs ${datos.alertas.length > 0 ? 'text-red-100' : 'text-feisen-gris-medio'}`}>
            Alertas de stock bajo
          </p>
        </div>
      </div>

      {/* Valorización */}
      <div>
        <h2 className="text-lg font-semibold text-feisen-gris-oscuro mb-3 flex items-center gap-2">
          <CircleDollarSign size={20} className="text-feisen-azul" />
          Valor del inventario en tiempo real
        </h2>
        <div className="bg-feisen-azul rounded-2xl p-6 shadow-md text-white mb-4">
          <p className="text-sm text-blue-200 font-medium mb-1">VALOR TOTAL DEL INVENTARIO</p>
          <p className="text-4xl font-bold tracking-tight">{formatCOP(datos.valorTotal)}</p>
          <p className="text-blue-200 text-sm mt-2">Suma de todos los ítems activos × precio de costo</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <TarjetaValor titulo="Lámina" valor={datos.porCentro['Lámina']} icono={TrendingUp} color="bg-cyan-600" />
          <TarjetaValor titulo="Ferretería" valor={datos.porCentro['Ferretería']} icono={Hammer} color="bg-amber-500" />
          <TarjetaValor titulo="Mecanizado" valor={datos.porCentro['Mecanizado']} icono={Factory} color="bg-slate-600" />
          <TarjetaValor titulo="Almacén" valor={datos.porCentro['Almacén']} icono={Package} color="bg-feisen-azul" />
          <TarjetaValor titulo="Motores" valor={datos.porCentro['Motores']} icono={Factory} color="bg-purple-600" />
          <TarjetaValor titulo="Fundición Hierro" valor={datos.porCentro['Fundición Hierro']} icono={Hammer} color="bg-orange-600" />
          <TarjetaValor titulo="Fundición de Aluminio" valor={datos.porCentro['Fundición de Aluminio']} icono={TrendingUp} color="bg-emerald-600" />
        </div>
      </div>

      {/* Alertas de stock bajo */}
      {datos.alertas.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-feisen-rojo mb-3 flex items-center gap-2">
            <AlertTriangle size={20} />
            Productos con stock bajo
          </h2>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-red-50 text-feisen-rojo">
                    <th className="text-left px-4 py-3 font-semibold">Producto</th>
                    <th className="text-right px-4 py-3 font-semibold">Stock actual</th>
                    <th className="text-right px-4 py-3 font-semibold">Mínimo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {datos.alertas.slice(0, 8).map((a, i) => (
                    <tr key={i} className="hover:bg-red-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-feisen-gris-oscuro">{a.items?.nombre}</td>
                      <td className="px-4 py-3 text-right text-feisen-rojo font-bold">
                        {formatNumero(a.cantidad_actual)}
                      </td>
                      <td className="px-4 py-3 text-right text-feisen-gris-medio">
                        {formatNumero(a.items?.stock_minimo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {datos.alertas.length > 8 && (
              <div className="px-4 py-3 bg-red-50 text-center">
                <Link to="/reportes?tab=stock_bajo" className="text-feisen-rojo text-sm font-medium hover:underline">
                  Ver todos los {datos.alertas.length} productos con stock bajo →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-lg font-semibold text-feisen-gris-oscuro mb-3">Acciones rápidas</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { to: '/movimientos/nuevo?tipo=entrada_compra', label: 'Registrar entrada', color: 'bg-emerald-600' },
            { to: '/movimientos/nuevo?tipo=salida_produccion', label: 'Registrar salida', color: 'bg-feisen-azul' },
            { to: '/items/nuevo', label: 'Nuevo producto', color: 'bg-amber-500' },
            { to: '/reportes', label: 'Ver reportes', color: 'bg-feisen-rojo' },
          ].map(acc => (
            <Link key={acc.to} to={acc.to}
              className={`${acc.color} text-white rounded-2xl p-4 text-center font-semibold text-sm hover:opacity-90 transition-opacity`}>
              {acc.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
