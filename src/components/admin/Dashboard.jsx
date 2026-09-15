import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Package, ArrowUpDown, ShoppingCart, Plus, Warehouse,
  TrendingUp, AlertTriangle, ChevronDown, ChevronRight, Tag,
} from 'lucide-react'
import Spinner from '../shared/Spinner'

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ───── Panel de desglose de una bodega ─────────────────────────
function DesgloseBodega({ datos }) {
  const [catAbierta, setCatAbierta] = useState(null)

  const cats = Object.keys(datos).sort()

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-4 pb-3 pt-2">
      {cats.map(cat => {
        const items    = datos[cat]
        const subTotal = items.reduce((s, i) => s + i.valor, 0)
        const abierta  = catAbierta === cat

        return (
          <div key={cat} className="mb-1 rounded-xl overflow-hidden border border-gray-100">
            {/* Fila categoría */}
            <button
              type="button"
              onClick={() => setCatAbierta(abierta ? null : cat)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-white hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {abierta
                  ? <ChevronDown size={13} className="text-feisen-azul" />
                  : <ChevronRight size={13} className="text-gray-400" />
                }
                <Tag size={13} className="text-feisen-azul" />
                <span className="text-sm font-semibold text-gray-700">{cat}</span>
                <span className="text-xs text-gray-400 ml-1">({items.length} ítem{items.length !== 1 ? 's' : ''})</span>
              </div>
              <span className="text-sm font-bold text-feisen-azul">{fmt(subTotal)}</span>
            </button>

            {/* Ítems de la categoría */}
            {abierta && (
              <div className="divide-y divide-gray-50 bg-white">
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between px-6 py-2">
                    <div>
                      <p className="text-sm text-gray-700">{it.nombre}</p>
                      <p className="text-xs text-gray-400">
                        {Number(it.cantidad).toLocaleString('es-CO')} {it.unidad}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-700">{fmt(it.valor)}</p>
                      {it.precio > 0 && (
                        <p className="text-xs text-gray-400">@ {fmt(it.precio)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ───── Dashboard principal ──────────────────────────────────────
export default function DashboardAdmin() {
  const { perfil } = useAuth()
  const [stats,      setStats]      = useState({ productos: 0, movHoy: 0, pedidos: 0 })
  const [bodegas,    setBodegas]    = useState([])   // [{ id, nombre, valor, unidades, categorias: { cat: [items] } }]
  const [stockBajos, setStockBajos] = useState([])
  const [cargando,   setCargando]   = useState(true)
  const [bodegaOpen, setBodegaOpen] = useState(null)

  useEffect(() => {
    async function cargar() {
      const hoy = new Date(); hoy.setHours(0,0,0,0)

      const [
        { count: productos },
        { count: movHoy },
        { count: pedidos },
        { data: stockData },
        { data: stockAll },
      ] = await Promise.all([
        supabase.from('items').select('*', { count: 'exact', head: true }).eq('activo', true),
        supabase.from('movimientos').select('*', { count: 'exact', head: true }).gte('created_at', hoy.toISOString()),
        supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
        supabase.from('stock')
          .select('cantidad_actual, bodegas(id, nombre), items(id, nombre, precio_costo, unidad_medida, activo, categorias(nombre))')
          .limit(50000),
        supabase.from('stock')
          .select('cantidad_actual, items(id, nombre, stock_minimo, unidad_medida, activo), bodegas(nombre)')
          .limit(50000),
      ])

      setStats({ productos: productos || 0, movHoy: movHoy || 0, pedidos: pedidos || 0 })

      // Agrupar por bodega → categoría → items
      const mapa = {}
      ;(stockData || []).forEach(s => {
        if (!s.items?.activo) return
        const bid   = s.bodegas?.id
        const bnomb = s.bodegas?.nombre
        if (!bid) return

        const valor   = (s.cantidad_actual || 0) * (s.items?.precio_costo || 0)
        const cat     = s.items?.categorias?.nombre || 'Sin categoría'

        if (!mapa[bid]) mapa[bid] = { nombre: bnomb, valor: 0, unidades: 0, categorias: {} }
        mapa[bid].valor    += valor
        mapa[bid].unidades += (s.cantidad_actual || 0)

        if (!mapa[bid].categorias[cat]) mapa[bid].categorias[cat] = []
        mapa[bid].categorias[cat].push({
          nombre:   s.items.nombre,
          cantidad: s.cantidad_actual || 0,
          unidad:   s.items.unidad_medida || '',
          precio:   s.items.precio_costo || 0,
          valor,
        })
      })

      // Ordenar ítems dentro de cada categoría por nombre
      const lista = Object.entries(mapa).map(([id, b]) => {
        const cats = {}
        for (const [cat, items] of Object.entries(b.categorias)) {
          cats[cat] = items.sort((a, z) => a.nombre.localeCompare(z.nombre))
        }
        return { id, nombre: b.nombre, valor: b.valor, unidades: b.unidades, categorias: cats }
      })
      setBodegas(lista)

      // Productos stock bajo
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

      {/* Valor del inventario — expandible por bodega */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <TrendingUp size={18} className="text-feisen-azul" /> Valor del inventario
          </h2>
          <span className="text-lg font-bold text-feisen-azul">{fmt(totalInventario)}</span>
        </div>

        {bodegas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin datos de stock.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {bodegas.map(b => {
              const abierta = bodegaOpen === b.id
              return (
                <div key={b.id}>
                  {/* Fila bodega — clickable */}
                  <button
                    type="button"
                    onClick={() => setBodegaOpen(abierta ? null : b.id)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Warehouse size={16} className="text-feisen-azul" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-800 text-sm">{b.nombre}</p>
                        <p className="text-xs text-gray-400">{b.unidades.toLocaleString('es-CO')} unidades en stock</p>
                      </div>
                      {abierta
                        ? <ChevronDown size={15} className="text-feisen-azul ml-1" />
                        : <ChevronRight size={15} className="text-gray-400 ml-1" />
                      }
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-feisen-azul">{fmt(b.valor)}</p>
                      <p className="text-xs text-gray-400">
                        {totalInventario > 0 ? Math.round((b.valor / totalInventario) * 100) : 0}% del total
                      </p>
                    </div>
                  </button>

                  {/* Desglose por categoría */}
                  {abierta && <DesgloseBodega datos={b.categorias} />}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Alertas stock bajo */}
      {stockBajos.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-100 flex items-center gap-2 bg-amber-50">
            <AlertTriangle size={18} className="text-amber-500" />
            <h2 className="font-semibold text-amber-800">
              Stock bajo mínimo — {stockBajos.length} producto{stockBajos.length > 1 ? 's' : ''}
            </h2>
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
