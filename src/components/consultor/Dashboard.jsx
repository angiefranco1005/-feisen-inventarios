import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useBodegasConsulta } from './useBodegasConsulta'
import Spinner from '../shared/Spinner'
import { coincideBusqueda } from '../../utils/busqueda'
import { Package, Search, X, History } from 'lucide-react'

// Vista de consulta (Ventas / Comercial): stock de sus bodegas asignadas (MOTORES),
// con búsqueda y filtros. Solo lectura, sin precios.
export default function DashboardConsultor() {
  const bodegas = useBodegasConsulta()
  const [stock, setStock]         = useState([])
  const [cargando, setCargando]   = useState(true)
  const [busqueda, setBusqueda]   = useState('')
  const [categoria, setCategoria] = useState('')
  const [soloConStock, setSoloConStock] = useState(true)

  useEffect(() => {
    if (bodegas === undefined) return
    async function cargar() {
      if (bodegas.length === 0) {
        // Sin bodegas asignadas — no mostrar nada
        setStock([])
        setCargando(false)
        return
      }
      const { data } = await supabase
        .from('stock')
        .select('cantidad_actual, item_id, items(nombre, unidad_medida, categorias(nombre)), bodegas(nombre)')
        .in('bodega_id', bodegas)
        .order('items(nombre)')
      setStock((data || []).filter(s => s.items != null))
      setCargando(false)
    }
    cargar()
  }, [bodegas])

  const categorias = useMemo(() =>
    [...new Set(stock.map(s => s.items?.categorias?.nombre).filter(Boolean))].sort()
  , [stock])

  const nombreBodegas = [...new Set(stock.map(s => s.bodegas?.nombre).filter(Boolean))].join(', ')

  const filtrados = stock.filter(s => {
    if (soloConStock && !(Number(s.cantidad_actual) > 0)) return false
    if (categoria && s.items?.categorias?.nombre !== categoria) return false
    if (!coincideBusqueda(`${s.items?.nombre || ''} ${s.items?.categorias?.nombre || ''}`, busqueda)) return false
    return true
  })

  if (cargando) return <Spinner texto="Cargando stock..." />

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-700 flex items-center gap-2">
        <Package size={22} className="text-feisen-azul" /> Stock actual{nombreBodegas ? ` — Bodega ${nombreBodegas}` : ''}
      </h1>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Escribe parte del nombre: forte, 6,5 hp…"
            className="w-full border border-feisen-borde rounded-xl pl-9 pr-8 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <X size={14} />
            </button>
          )}
        </div>
        {categorias.length > 1 && (
          <select value={categoria} onChange={e => setCategoria(e.target.value)}
            className="border border-feisen-borde rounded-xl px-3 py-2.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-feisen-azul">
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600 px-1 shrink-0 cursor-pointer">
          <input type="checkbox" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)}
            className="rounded border-feisen-borde text-feisen-azul focus:ring-feisen-azul" />
          Solo con existencias
        </label>
      </div>

      <div className="bg-white rounded-xl border border-feisen-borde overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p>{stock.length === 0 ? 'No hay productos con stock registrado.' : 'Ningún producto coincide con los filtros.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-500">Producto</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-500 hidden sm:table-cell">Categoría</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-500">Cantidad</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{s.items?.nombre}</td>
                  <td className="px-5 py-3 text-gray-400 hidden sm:table-cell">{s.items?.categorias?.nombre || '—'}</td>
                  <td className="px-5 py-3 text-right font-bold text-feisen-azul whitespace-nowrap">
                    {s.cantidad_actual} <span className="text-xs font-normal text-gray-400">{s.items?.unidad_medida}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link to={`/movimientos?item=${s.item_id}`} title="Ver historial del producto"
                      className="inline-flex p-1.5 text-gray-300 hover:text-feisen-azul hover:bg-feisen-azul-suave rounded-lg transition-colors">
                      <History size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 text-right">{filtrados.length} de {stock.length} productos</p>
    </div>
  )
}
