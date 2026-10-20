import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Alerta from '../shared/Alerta'
import { CalendarDays, RefreshCw, Package, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { exportarCorteInventario } from '../../utils/exportExcel'
import { fetchAllPages } from '../../utils/fetchAllPages'

// Fecha de hoy en hora Colombia (UTC-5); toISOString() solo da UTC y después de las 7 p.m. ya marcaría mañana
const HOY = new Date(Date.now() - 5 * 3600 * 1000).toISOString().split('T')[0]

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
  const [bodegaId,       setBodegaId]       = useState('')   // '' = TODO (todas las bodegas)
  const [bodegasDisp,    setBodegasDisp]    = useState([])

  // Cargar bodegas activas una sola vez, para el selector
  useEffect(() => {
    supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setBodegasDisp(data || []))
  }, [])

  async function calcular() {
    setCargando(true)
    setError('')
    setResultado(null)

    try {
      // Corte contable: el movimiento cuenta hasta `fecha` si su fecha_movimiento (o, si no tiene,
      // la fecha de created_at) es <= fecha.
      // OJO: movimientos.created_at guarda la hora de Bogotá ya convertida (aunque la etiqueta
      // diga UTC), así que el corte se compara tal cual, SIN convertir de zona horaria.
      const corte = `${fecha}T23:59:59`

      // Todo se trae paginado (fetchAllPages): el servidor de Supabase corta las respuestas a
      // 1.000 filas aunque se pida .limit(50000). Antes, con más de 1.000 movimientos
      // posteriores al corte, solo se deshacían unos pocos (sin orden) y por eso el
      // inventario "a fecha" salía igual al de hoy.
      const [rItems, rMovs, rStock, rBod] = await Promise.all([
        fetchAllPages((d, h) =>
          supabase.from('items')
            .select('id, nombre, unidad_medida, precio_costo, activo, categorias(nombre)')
            .order('nombre').order('id').range(d, h)
        ),
        // Solo movimientos POSTERIORES al corte (los que hay que deshacer).
        fetchAllPages((d, h) =>
          supabase.from('movimientos')
            .select('id, item_id, tipo, cantidad, bodega_origen_id, bodega_destino_id, fecha_movimiento, created_at')
            .or(`fecha_movimiento.gt.${fecha},and(fecha_movimiento.is.null,created_at.gt.${corte})`)
            .order('created_at').order('id').range(d, h)
        ),
        // Stock por (producto, bodega). Un mismo producto puede tener stock en varias bodegas.
        fetchAllPages((d, h) =>
          supabase.from('stock').select('item_id, bodega_id, cantidad_actual')
            .order('item_id').order('bodega_id').range(d, h)
        ),
        supabase.from('bodegas').select('id, nombre, activo'),
      ])

      if (rItems.error) throw rItems.error
      if (rMovs.error)  throw rMovs.error
      if (rStock.error) throw rStock.error
      if (rBod.error)   throw rBod.error

      const itemsMap = {}
      for (const i of rItems.data || []) itemsMap[i.id] = i
      const bodMap = {}
      for (const b of rBod.data || []) bodMap[b.id] = b

      const stockMap = {}
      for (const s of rStock.data || []) {
        stockMap[`${s.item_id}_${s.bodega_id}`] = Number(s.cantidad_actual ?? 0)
      }

      // Efecto de cada movimiento POSTERIOR sobre cada (producto, bodega), con las mismas
      // reglas del trigger fn_actualizar_stock:
      //   entrada / entrada_compra / devolucion → suma en bodega_destino
      //   salida / salida_produccion / salida_venta → resta en bodega_origen
      //   traslado → resta en origen y suma en destino
      //   ajuste_inventario → suma el valor (con signo) en bodega_destino
      // Antes el delta se acumulaba solo por producto (sin bodega) y el stock solo se leía de la
      // bodega "de origen" del producto, así que lo que estaba en otras bodegas se ignoraba.
      const TIPOS_ENTRADA = new Set(['entrada', 'entrada_compra', 'devolucion'])
      const TIPOS_SALIDA  = new Set(['salida', 'salida_produccion', 'salida_venta'])
      const deltas = {}
      const sumar = (itemId, bodegaId, v) => {
        if (!itemId || !bodegaId) return
        const k = `${itemId}_${bodegaId}`
        deltas[k] = (deltas[k] || 0) + v
      }
      for (const m of rMovs.data || []) {
        const c = Number(m.cantidad || 0)
        if (TIPOS_ENTRADA.has(m.tipo))      sumar(m.item_id, m.bodega_destino_id, c)
        else if (TIPOS_SALIDA.has(m.tipo))  sumar(m.item_id, m.bodega_origen_id, -c)
        else if (m.tipo === 'traslado') {
          sumar(m.item_id, m.bodega_origen_id, -c)
          sumar(m.item_id, m.bodega_destino_id, c)
        } else if (m.tipo === 'ajuste_inventario') sumar(m.item_id, m.bodega_destino_id, c)
      }

      // Stock en fecha = stock actual − (efecto neto de los movimientos posteriores)
      const claves = new Set([...Object.keys(stockMap), ...Object.keys(deltas)])
      let negativos = 0
      const snapshot = []
      for (const k of claves) {
        const [itemId, bId] = k.split('_')
        const item = itemsMap[itemId]
        const bod  = bodMap[bId]
        if (!item || !item.activo || !bod || bod.activo === false) continue
        if (bodegaId && bId !== bodegaId) continue
        const stockActual = stockMap[k] ?? 0
        const delta = deltas[k] || 0
        if (stockActual === 0 && delta === 0) continue
        const bruto = Number((stockActual - delta).toFixed(3))
        if (bruto < 0) negativos++
        const stockEnFecha = Math.max(0, bruto)
        snapshot.push({
          id:            itemId,
          nombre:        item.nombre,
          unidad:        item.unidad_medida,
          precio:        item.precio_costo || 0,
          bodega_nombre: bod.nombre,
          categoria:     item.categorias?.nombre || 'Sin categoría',
          stock_actual:  stockActual,
          stock_en_fecha: stockEnFecha,
          valor:         stockEnFecha * (item.precio_costo || 0),
        })
      }
      snapshot.sort((a, b) => a.nombre.localeCompare(b.nombre))

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
        bodegaNombre:    bodegaId ? (bodegasDisp.find(b => b.id === bodegaId)?.nombre || null) : null,
        total_general:   snapshot.reduce((s, r) => s + r.valor, 0),
        total_productos: snapshot.length,
        negativos,
        movsDeshechos:   (rMovs.data || []).length,
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
          Selecciona una fecha de corte para ver el stock tal como estaba ese día — de una bodega puntual
          o de <strong>todas</strong> ("Todas las bodegas"). El cálculo parte del inventario actual y
          deshace todos los movimientos posteriores a la fecha.
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
          <div className="flex-1">
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Bodega</label>
            <select
              value={bodegaId}
              onChange={e => setBodegaId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white"
            >
              <option value="">Todas las bodegas</option>
              {bodegasDisp.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
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
              <p className="text-sm text-blue-200 mb-0.5">
                Inventario al {fechaLabel}{resultado.bodegaNombre ? ` · ${resultado.bodegaNombre}` : ' · Todas las bodegas'}
              </p>
              <p className="text-3xl font-bold">{fmt(resultado.total_general)}</p>
              <p className="text-xs text-blue-300 mt-1">
                {resultado.total_productos} productos · {resultado.bodegas.length} bodegas · {resultado.movsDeshechos} movimientos posteriores deshechos
              </p>
            </div>
            <Package size={40} className="text-blue-300 opacity-60 hidden sm:block" />
          </div>

          {resultado.negativos > 0 && (
            <Alerta
              tipo="alerta"
              mensaje={`${resultado.negativos} producto(s) salen negativos en esa fecha y se muestran en 0: se registraron salidas antes que su entrada. Revisa esos movimientos (o haz un conteo físico).`}
            />
          )}

          {/* Botón descargar */}
          <div className="flex justify-end">
            <button
              onClick={() => exportarCorteInventario(resultado, resultado.bodegaNombre)}
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
