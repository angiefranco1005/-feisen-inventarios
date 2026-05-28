import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatCOP, formatNumero, formatFechaHora, TIPOS_MOVIMIENTO } from '../../utils/formatters'
import { exportarStockExcel, exportarMovimientosExcel } from '../../utils/exportExcel'
import Spinner from '../shared/Spinner'
import { BarChart2, Download, Package, ArrowUpDown, AlertTriangle } from 'lucide-react'

const TABS_ADMIN = [
  { key: 'stock',       label: 'Stock actual',  icon: Package },
  { key: 'movimientos', label: 'Movimientos',   icon: ArrowUpDown },
  { key: 'stock_bajo',  label: 'Stock bajo',     icon: AlertTriangle },
  { key: 'valor',       label: 'Valorización',   icon: BarChart2 },
]

export default function Reportes() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'ADMIN'
  const TABS = esAdmin ? TABS_ADMIN : TABS_ADMIN.filter(t => t.key !== 'valor')
  const [tab, setTab] = useState('stock')
  const [datos, setDatos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [filtroFecha, setFiltroFecha] = useState({ desde: '', hasta: '' })
  const [filtroBodega, setFiltroBodega] = useState('')
  const [bodegas, setBodegas] = useState([])

  useEffect(() => {
    supabase.from('bodegas').select('*').eq('activo', true).order('nombre').then(({ data }) => setBodegas(data || []))
  }, [])

  useEffect(() => { cargar() }, [tab, filtroFecha, filtroBodega])

  async function cargar() {
    setCargando(true)
    let data = []

    if (tab === 'stock' || tab === 'stock_bajo' || tab === 'valor') {
      let q = supabase.from('stock')
        .select('cantidad_actual, item_id, bodega_id, items(nombre, unidad_medida, precio_costo, centro_costo, stock_minimo, activo, categorias(nombre)), bodegas(nombre)')
        .eq('items.activo', true)
      if (filtroBodega) q = q.eq('bodega_id', filtroBodega)
      const { data: d } = await q
      data = d || []
      if (tab === 'stock_bajo') {
        data = data.filter(s => s.items?.stock_minimo > 0 && s.cantidad_actual < s.items.stock_minimo)
      }
    }

    if (tab === 'movimientos') {
      let q = supabase.from('movimientos')
        .select('*, items(nombre, unidad_medida), bodega_origen:bodega_origen_id(nombre), bodega_destino:bodega_destino_id(nombre), profiles(nombre)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (filtroFecha.desde) q = q.gte('created_at', filtroFecha.desde)
      if (filtroFecha.hasta) q = q.lte('created_at', filtroFecha.hasta + 'T23:59:59')
      const { data: d } = await q
      data = d || []
    }

    setDatos(data)
    setCargando(false)
  }

  // Valorización total para tab valor
  const valorTotal = tab === 'valor'
    ? datos.reduce((acc, s) => acc + ((s.cantidad_actual || 0) * (s.items?.precio_costo || 0)), 0)
    : 0

  const porCentro = tab === 'valor'
    ? datos.reduce((acc, s) => {
        const cc = s.items?.centro_costo || 'Sin asignar'
        acc[cc] = (acc[cc] || 0) + ((s.cantidad_actual || 0) * (s.items?.precio_costo || 0))
        return acc
      }, {})
    : {}

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-feisen-azul">Reportes</h1>
        <button
          onClick={() => tab === 'movimientos' ? exportarMovimientosExcel(datos) : exportarStockExcel(datos)}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-emerald-700 transition-colors text-sm">
          <Download size={16} /> Exportar Excel
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-sm overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors
              ${tab === t.key ? 'bg-feisen-azul text-white' : 'text-feisen-gris-oscuro hover:bg-feisen-gris'}`}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      {tab === 'movimientos' && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-feisen-gris-oscuro">Desde:</label>
            <input type="date" value={filtroFecha.desde} onChange={e => setFiltroFecha(f => ({ ...f, desde: e.target.value }))}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-feisen-gris-oscuro">Hasta:</label>
            <input type="date" value={filtroFecha.hasta} onChange={e => setFiltroFecha(f => ({ ...f, hasta: e.target.value }))}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
        </div>
      )}

      {(tab === 'stock' || tab === 'stock_bajo' || tab === 'valor') && (
        <select value={filtroBodega} onChange={e => setFiltroBodega(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul">
          <option value="">Todas las bodegas</option>
          {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
      )}

      {cargando ? <Spinner texto="Cargando reporte..." /> : (
        <>
          {/* TAB VALORIZACIÓN */}
          {tab === 'valor' && (
            <div className="space-y-4">
              <div className="bg-feisen-azul rounded-2xl p-6 text-white">
                <p className="text-blue-200 text-sm mb-1">VALOR TOTAL DEL INVENTARIO</p>
                <p className="text-4xl font-bold">{formatCOP(valorTotal)}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Object.entries(porCentro).map(([cc, val]) => (
                  <div key={cc} className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="text-sm text-feisen-gris-medio mb-1">{cc}</p>
                    <p className="text-xl font-bold text-feisen-azul">{formatCOP(val)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB STOCK y STOCK BAJO */}
          {(tab === 'stock' || tab === 'stock_bajo') && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {datos.length === 0 ? (
                <div className="text-center py-16 text-feisen-gris-medio">
                  <Package size={40} className="mx-auto mb-3 opacity-30" />
                  <p>{tab === 'stock_bajo' ? 'No hay productos con stock bajo. ¡Todo en orden!' : 'No hay datos de stock.'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-feisen-gris">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro">Producto</th>
                        <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro hidden sm:table-cell">Bodega</th>
                        <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro hidden md:table-cell">Almacén</th>
                        <th className="text-right px-4 py-3 font-semibold text-feisen-gris-oscuro">Cantidad</th>
                        {tab === 'stock_bajo' && <th className="text-right px-4 py-3 font-semibold text-feisen-rojo">Mínimo</th>}
                        {esAdmin && <th className="text-right px-4 py-3 font-semibold text-feisen-gris-oscuro">Valor COP</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {datos.map((s, i) => (
                        <tr key={i} className={`hover:bg-feisen-gris/50 ${tab === 'stock_bajo' ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-feisen-gris-oscuro">{s.items?.nombre}</p>
                            <p className="text-xs text-feisen-gris-medio">{s.items?.unidad_medida}</p>
                          </td>
                          <td className="px-4 py-3 text-feisen-gris-medio hidden sm:table-cell">{s.bodegas?.nombre}</td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-xs bg-feisen-gris px-2 py-0.5 rounded-full">{s.items?.centro_costo}</span>
                          </td>
                          <td className={`px-4 py-3 text-right font-bold ${tab === 'stock_bajo' ? 'text-feisen-rojo' : 'text-feisen-gris-oscuro'}`}>
                            {formatNumero(s.cantidad_actual)}
                          </td>
                          {tab === 'stock_bajo' && (
                            <td className="px-4 py-3 text-right text-feisen-gris-medio">
                              {formatNumero(s.items?.stock_minimo)}
                            </td>
                          )}
                          {esAdmin && (
                            <td className="px-4 py-3 text-right text-feisen-azul font-semibold">
                              {formatCOP((s.cantidad_actual || 0) * (s.items?.precio_costo || 0))}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB MOVIMIENTOS */}
          {tab === 'movimientos' && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {datos.length === 0 ? (
                <div className="text-center py-16 text-feisen-gris-medio">
                  <ArrowUpDown size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No hay movimientos en el período seleccionado.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-feisen-gris">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro">Fecha</th>
                        <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro">Tipo</th>
                        <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro">Producto</th>
                        <th className="text-right px-4 py-3 font-semibold text-feisen-gris-oscuro">Cantidad</th>
                        {esAdmin && <th className="text-right px-4 py-3 font-semibold text-feisen-gris-oscuro hidden md:table-cell">Valor COP</th>}
                        <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro hidden lg:table-cell">Usuario</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {datos.map(m => (
                        <tr key={m.id} className="hover:bg-feisen-gris/50">
                          <td className="px-4 py-3 text-xs text-feisen-gris-medio whitespace-nowrap">{formatFechaHora(m.created_at)}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-feisen-gris px-2 py-1 rounded-full font-medium">
                              {TIPOS_MOVIMIENTO[m.tipo] || m.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-feisen-gris-oscuro">{m.items?.nombre}</td>
                          <td className="px-4 py-3 text-right font-semibold text-feisen-azul">
                            {formatNumero(m.cantidad)} {m.items?.unidad_medida}
                          </td>
                          {esAdmin && (
                            <td className="px-4 py-3 text-right text-feisen-gris-oscuro hidden md:table-cell">
                              {formatCOP((m.cantidad || 0) * (m.precio_costo_snapshot || 0))}
                            </td>
                          )}
                          <td className="px-4 py-3 text-feisen-gris-medio text-xs hidden lg:table-cell">{m.profiles?.nombre}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
