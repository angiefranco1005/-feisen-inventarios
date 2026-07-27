import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatNumero } from '../../utils/formatters'
import Spinner from '../shared/Spinner'
import { Package, Search } from 'lucide-react'

export default function DashboardConsultor() {
  const { perfil } = useAuth()
  const [stock, setStock] = useState([])
  const [bodegas, setBodegas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroBodega, setFiltroBodega] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: stockData }, { data: bodegasData }] = await Promise.all([
      supabase.from('stock')
        .select('cantidad_actual, item_id, bodega_id, items(nombre, unidad_medida, activo), bodegas(nombre)')
        .eq('items.activo', true)
        .gt('cantidad_actual', 0),
      supabase.from('bodegas').select('*').eq('activo', true).order('nombre')
    ])
    setStock(stockData?.filter(s => s.items) || [])
    setBodegas(bodegasData || [])
    setCargando(false)
  }

  const stockFiltrado = stock.filter(s => {
    const coincideNombre = s.items?.nombre?.toLowerCase().includes(busqueda.toLowerCase())
    const coincideBodega = !filtroBodega || s.bodega_id === filtroBodega
    return coincideNombre && coincideBodega
  })

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-feisen-azul">Consulta de stock</h1>
        <p className="text-feisen-gris-medio text-sm mt-1">Hola, {perfil?.nombre?.split(' ')[0]} — vista de solo lectura</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full border border-gray-300 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <select value={filtroBodega} onChange={e => setFiltroBodega(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul">
          <option value="">Todas las bodegas</option>
          {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
      </div>

      {cargando ? <Spinner texto="Cargando stock..." /> : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {stockFiltrado.length === 0 ? (
            <div className="text-center py-16 text-feisen-gris-medio">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p>No hay productos con stock disponible.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-feisen-gris">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro">Producto</th>
                    <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro hidden sm:table-cell">Bodega</th>
                    <th className="text-right px-4 py-3 font-semibold text-feisen-gris-oscuro">Cantidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stockFiltrado.map((s, i) => (
                    <tr key={i} className="hover:bg-feisen-gris/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-feisen-gris-oscuro">{s.items?.nombre}</p>
                        <p className="text-xs text-feisen-gris-medio">{s.items?.unidad_medida}</p>
                      </td>
                      <td className="px-4 py-3 text-feisen-gris-medio hidden sm:table-cell">{s.bodegas?.nombre}</td>
                      <td className="px-4 py-3 text-right font-bold text-feisen-azul">
                        {formatNumero(s.cantidad_actual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
