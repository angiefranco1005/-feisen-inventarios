import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Alerta from '../shared/Alerta'
import { CalendarDays, RefreshCw, Package, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { exportarCorteInventario } from '../../utils/exportExcel'

const HOY = new Date().toISOString().split('T')[0]

function fmt(n) {
  return `$${Math.round(n).toLocaleString('es-CO')}`
}

export default function CorteInventario() {
  const [fecha,          setFecha]          = useState(HOY)
  const [cargando,       setCargando]       = useState(false)
  const [resultado,      setResultado]      = useState(null)
  const [error,          setError]          = useState('')
  const [bodegasAbiertas,setBodegasAbiertas]= useState({})
  const [soloConStock,   setSoloConStock]   = useState(true)

  async function calcular() {
    setCargando(true)
    setError('')
    setResultado(null)

    try {
      // Fin del día en hora Colombia (UTC-5) → convertido a UTC para comparar con Supabase
      const cutoffISO = new Date(`${fecha}T23:59:59-05:00`).toISOString()

      const [{ data: items, error: e1 }, { data: movs, error: e2 }] = await Promise.all([
        supabase
          .from('items')
          .select('id, nombre, unidad_medida, precio_costo, bodega_id, activo, categorias(nombre), bodegas!bodega_id(nombre), stock(cantidad_actual)')
          .order('nombre'),
        supabase
          .from('movimientos')
          .select('item_id, tipo, cantidad, fecha_movimiento, created_at'),
      ])

      if (e1) throw e1
      if (e2) throw e2

      // Filtrar movimientos DESPUÉS de la fecha de corte
      // Usa fecha_movimiento si existe, de lo contrario created_at
      const movsDespues = (movs || []).filter(m => {
        const fechaEfectiva = m.fecha_movimiento
          ? new Date(`${m.fecha_movimiento}T23:59:59`)
          : new Date(m.created_at)
        return fechaEfectiva > new Date(cutoffISO)
      })

      // delta[item_id] = entradas_after - salidas_after
      // stock_en_fecha = stock_actual - delta
      const deltas = {}
      for (const m of movsDespues) {
        if (!m.item_id) continue
        deltas[m.item_id] = (deltas[m.item_id] || 0) + (m.tipo === 'entrada' ? m.cantidad : -m.cantidad)
      }

      const snapshot = (items || [])
        .filter(i => i.activo)
        .map(item => {
          const stockActual  = item.stock?.[0]?.cantidad_actual ?? 0
          const delta        = deltas[item.id] || 0
          const stockEnFecha = Math.max(0, stockActual - delta)
          return {
            id:            item.id,
            nombre:        item.nombre,
            unidad:        item.unidad_medida,
            precio:        item.precio_costo || 0,
            bodega_nombre: item.bodegas?.nombre || 'Sin bodega',
            categoria:     item.categorias?.nombre || 'Sin categoría',
            stock_actual:  stockActual,
            stock_en_fecha: stockEnFecha,
            valor:         stockEnFecha * (item.precio_costo || 0),
          }
        })

      // Agrupar por bodega
      const mapa = {}
      for (const row of snapshot) {
        if (!mapa[row.bodega_nombre]) {
          mapa[row.bodega_nombre] = { nombre: row.bodega_nombre, items: [], total_valor: 0 }
        }
        mapa[row.bodega_nombre].items.push(row)
        mapa[row.bodega_nombre].total_valor += row.valor
      }

      const bodegas = Object.values(mapa).sort((a, b) => a.nombre.localeCompare(b.nombre))

      // Abrir todas por defecto
      const abiertas = {}
      bodegas.forEach(b => { abiertas[b.nombre] = true })
      setBodegasAbiertas(abiertas)

      setResultado({
        fecha,
        bodegas,
        total_general:   snapshot.reduce((s, r) => s + r.valor, 0),
        total_productos: snapshot.length,
      })
    } catch (err) {
      setError('Error al calcular: ' + err.message)
    } finally {
      setCargando(false)
    }
  }

  function toggleBodega(nombre) {
    setBodegasAbiertas(prev => ({ ...prev, [nombre]: !prev[nombre] }))
  }

  const fechaLabel = resultado
    ? new Date(`${resultado.fecha}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-feisen-azul">Inventario en fecha</h1>

      {/* ── Selector ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <p className="text-sm text-gray-500 mb-4">
          Selecciona una fecha de corte para ver el stock de todas las bodegas tal como estaba ese día.
          El cálculo parte del inventario actual y deshace todos los movimientos posteriores a la fecha.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Fecha de corte</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              max={HOY}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
            />
          </div>
          <button
            onClick={calcular}
            disabled={cargando || !fecha}
            className="flex items-center gap-2 bg-feisen-azul text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition-opacity whitespace-nowrap"
          >
            {cargando
              ? <RefreshCw size={16} className="animate-spin" />
              : <CalendarDays size={16} />
            }
            {cargando ? 'Calculando...' : 'Ver inventario'}
          </button>
        </div>
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}

      {/* ── Resultados ── */}
      {resultado && (
        <>
          {/* Banner resumen */}
          <div className="bg-feisen-azul text-white rounded-2xl px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-200 mb-0.5">Inventario al {fechaLabel}</p>
              <p className="text-3xl font-bold">{fmt(resultado.total_general)}</p>
              <p className="text-xs text-blue-300 mt-1">
                {resultado.total_productos} productos · {resultado.bodegas.length} bodegas
              </p>
            </div>
            <Package size={40} className="text-blue-300 opacity-60 hidden sm:block" />
          </div>

          {/* Botón descargar */}
          <div className="flex justify-end">
            <button
              onClick={() => exportarCorteInventario(resultado)}
              className="flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              <Download size={16} /> Descargar Excel
            </button>
          </div>

          {/* Filtro */}
          <div className="flex justify-end">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
              <input
                type="checkbox"
                checked={soloConStock}
                onChange={e => setSoloConStock(e.target.checked)}
                className="w-4 h-4 accent-feisen-azul rounded"
              />
              Ocultar productos con stock 0 en esa fecha
            </label>
          </div>

          {/* Por bodega */}
          {resultado.bodegas.map(bodega => {
            const filas = soloConStock
              ? bodega.items.filter(i => i.stock_en_fecha > 0)
              : bodega.items
            const abierta = bodegasAbiertas[bodega.nombre]

            return (
              <div key={bodega.nombre} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header bodega */}
                <button
                  type="button"
                  onClick={() => toggleBodega(bodega.nombre)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {abierta
                      ? <ChevronDown  size={18} className="text-feisen-azul" />
                      : <ChevronRight size={18} className="text-gray-400" />
                    }
                    <span className="font-semibold text-gray-800">{bodega.nombre}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {filas.length} producto{filas.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="font-bold text-feisen-azul">{fmt(bodega.total_valor)}</span>
                </button>

                {/* Tabla */}
                {abierta && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    {filas.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">
                        {soloConStock
                          ? 'Todos los productos tenían stock 0 en esta fecha.'
                          : 'Esta bodega no tiene productos activos.'
                        }
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs">Producto</th>
                            <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs hidden md:table-cell">Categoría</th>
                            <th className="text-center px-4 py-2.5 font-semibold text-gray-500 text-xs">Stock en fecha</th>
                            <th className="text-center px-4 py-2.5 font-semibold text-gray-500 text-xs hidden sm:table-cell">Stock actual</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Precio costo</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filas.map(item => (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-2.5">
                                <p className="font-medium text-gray-800">{item.nombre}</p>
                                <p className="text-xs text-gray-400">{item.unidad}</p>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-gray-500 hidden md:table-cell">
                                {item.categoria}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`font-bold px-3 py-1 rounded-xl inline-block text-sm
                                  ${item.stock_en_fecha === 0
                                    ? 'bg-red-100 text-red-600'
                                    : 'bg-green-100 text-green-700'}`}>
                                  {item.stock_en_fecha}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                                <span className={`text-xs px-2 py-0.5 rounded-full
                                  ${item.stock_actual !== item.stock_en_fecha
                                    ? 'bg-blue-50 text-feisen-azul font-medium'
                                    : 'text-gray-400'}`}>
                                  {item.stock_actual}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                                {item.precio > 0
                                  ? fmt(item.precio)
                                  : <span className="text-gray-300">—</span>
                                }
                              </td>
                              <td className="px-4 py-2.5 text-right font-semibold text-feisen-azul">
                                {item.valor > 0
                                  ? fmt(item.valor)
                                  : <span className="text-gray-300 font-normal">—</span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td colSpan={5} className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">
                              Subtotal {bodega.nombre}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-feisen-azul">
                              {fmt(bodega.total_valor)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Total general */}
          <div className="rounded-2xl px-5 py-4 flex items-center justify-between"
            style={{ background: 'linear-gradient(135deg, #064794 0%, #B4271D 100%)' }}>
            <span className="text-white font-semibold text-sm">
              Total general · {fechaLabel}
            </span>
            <span className="text-white text-xl font-bold">{fmt(resultado.total_general)}</span>
          </div>
        </>
      )}
    </div>
  )
}
