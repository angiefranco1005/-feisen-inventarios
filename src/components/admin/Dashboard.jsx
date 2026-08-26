import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Package, ArrowUpDown, ShoppingCart, Plus, Warehouse, TrendingUp, AlertTriangle } from 'lucide-react'
import Spinner from '../shared/Spinner'

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function DashboardAdmin() {
  const { perfil } = useAuth()
  const [stats,      setStats]      = useState({ productos: 0, movHoy: 0, pedidos: 0 })
  const [bodegas,    setBodegas]    = useState([])
  const [stockBajos, setStockBajos] = useState([])
  const [cargando,   setCargando]   = useState(true)

  useEffect(() => {
    async function cargar() {
      const hoy = new Date(); hoy.setHours(0,0,0,0)
      const [{ count: productos }, { count: movHoy }, { count: pedidos }, { data: stockData }, { data: stockAll }] = await Promise.all([
        supabase.from('items').select('*', { count: 'exact', head: true }).eq('activo', true),
        supabase.from('movimientos').select('*', { count: 'exact', head: true }).gte('created_at', hoy.toISOString()),
        supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
        supabase.from('stock').select('cantidad_actual, bodegas(id, nombre), items(precio_costo, activo)'),
        supabase.from('stock').select('cantidad_actual, items(id, nombre, stock_minimo, unidad_medida, activo), bodegas(nombre)'),
      ])

      setStats({ productos: productos || 0, movHoy: movHoy || 0, pedidos: pedidos || 0 })

      // Agrupar por bodega
      const mapa = {}
      ;(stockData || []).forEach(s => {
        if (!s.items?.activo) return
        const bid   = s.bodegas?.id
        const bnomb = s.bodegas?.nombre
        if (!bid) return
        if (!mapa[bid]) mapa[bid] = { nombre: bnomb, valor: 0, unidades: 0 }
        mapa[bid].valor    += (s.cantidad_actual || 0) * (s.items?.precio_costo || 0)
        mapa[bid].unidades += (s.cantidad_actual || 0)
      })
      setBodegas(Object.values(mapa))

      // Productos con stock bajo mínimo
      const bajos = (stockAll || []).filter(s =>
        s.items?.activo &&
        s.items?.stock_minimo > 0 &&
        s.cantidad_actual <= s.items.stock_minimo
      )
      setStockBajos(bajos)
      setCargando(false)
    }
    cargar()
  }, [])

  const totalInventario = bodegas.reduce((sum, b) => sum + b.valor, 0)

  if (cargando) return <Spinner />

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-feisen-azul">Hola, {perfil?.nombre?.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm mt-1">Panel de administración</p>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Package size={20} className="text-feisen-azul" />
            </div>
            <p className="text-sm font-medium text-gray-500">Productos activos</p>
          </div>
          <p className="text-3xl font-bold text-gray-800">{stats.productos}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <ArrowUpDown size={20} className="text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-500">Movimientos hoy</p>
          </div>
          <p className="text-3xl font-bold text-gray-800">{stats.movHoy}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <ShoppingCart size={20} className="text-amber-500" />
            </div>
            <p className="text-sm font-medium text-gray-500">Pedidos pendientes</p>
          </div>
          <p className="text-3xl font-bold text-gray-800">{stats.pedidos}</p>
        </div>
      </div>

      {/* Valor del inventario */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <TrendingUp size={18} className="text-feisen-azul" /> Valor del inventario
          </h2>
          <span className="text-lg font-bold text-feisen-azul">{fmt(totalInventario)}</span>
        </div>
        <div className="divide-y divide-gray-50">
          {bodegas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin datos de stock.</p>
          ) : bodegas.map(b => (
            <div key={b.nombre} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Warehouse size={16} className="text-feisen-azul" />
                </div>
                <div>
                  <p className="font-medium text-gray-800 text-sm">{b.nombre}</p>
                  <p className="text-xs text-gray-400">{b.unidades} unidades en stock</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-feisen-azul">{fmt(b.valor)}</p>
                <p className="text-xs text-gray-400">
                  {totalInventario > 0 ? Math.round((b.valor / totalInventario) * 100) : 0}% del total
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alertas stock bajo */}
      {stockBajos.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-100 flex items-center gap-2 bg-amber-50">
            <AlertTriangle size={18} className="text-amber-500" />
            <h2 className="font-semibold text-amber-800">Stock bajo mínimo — {stockBajos.length} producto{stockBajos.length > 1 ? 's' : ''}</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {stockBajos.map((s, i) => (
              <div key={i} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800 text-sm">{s.items?.nombre}</p>
                  <p className="text-xs text-gray-400">{s.bodegas?.nombre}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-amber-500 text-sm">{s.cantidad_actual} {s.items?.unidad_medida}</p>
                  <p className="text-xs text-gray-400">mín. {s.items?.stock_minimo}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acciones rápidas */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/movimientos/nuevo"
          className="bg-feisen-azul text-white rounded-2xl p-5 text-center font-bold hover:opacity-90 transition-opacity">
          <Plus size={28} className="mx-auto mb-2" />
          Nuevo movimiento
        </Link>
        <Link to="/productos"
          className="bg-feisen-rojo text-white rounded-2xl p-5 text-center font-bold hover:opacity-90 transition-opacity">
          <Package size={28} className="mx-auto mb-2" />
          Ver productos
        </Link>
      </div>
    </div>
  )
}
