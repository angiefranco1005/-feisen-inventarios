import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Alerta from '../shared/Alerta'
import { CalendarDays, RefreshCw, ChevronRight, Download, Search } from 'lucide-react'
import { EncabezadoPagina } from '../shared/ui'
import { coincideBusqueda } from '../../utils/busqueda'
import { exportarCorteInventario } from '../../utils/exportExcel'
import { fetchAllPages } from '../../utils/fetchAllPages'

// Fecha de hoy en hora Colombia (UTC-5); toISOString() solo da UTC y después de las 7 p.m. ya marcaría mañana
const HOY = new Date(Date.now() - 5 * 3600 * 1000).toISOString().split('T')[0]

export default function CorteInventario() {
  const [fecha,          setFecha]          = useState(HOY)
  const [cargando,       setCargando]       = useState(false)
  const [resultado,      setResultado]      = useState(null)
  const [error,          setError]          = useState('')
  const [bodegasAbiertas,setBodegasAbiertas]= useState({})
  const [soloConStock,   setSoloConStock]   = useState(true)
  const [bodegaId,       setBodegaId]       = useState('')   // '' = TODO (todas las bodegas)
  const [bodegasDisp,    setBodegasDisp]    = useState([])
  const [busqueda,       setBusqueda]       = useState('')

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
  const filtrar = items => items.filter(i =>
    (!soloConStock || i.stock_en_fecha > 0) &&
    (!busqueda.trim() || coincideBusqueda(`${i.nombre} ${i.categoria}`, busqueda)))
  const esHoy = resultado?.fecha === HOY

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <EncabezadoPagina modulo="Inventarios" titulo="Inventario a una fecha"
        subtitulo="El stock y su valor tal como estaban un día puntual, para cierres y auditorías.">
        {resultado && (
          <button onClick={() => exportarCorteInventario(resultado, resultado.bodegaNombre)}
            className="inline-flex items-center gap-1.5 border border-feisen-borde bg-white rounded-lg px-3 py-2.5 text-sm font-semibold text-feisen-texto hover:bg-feisen-fondo">
            <Download size={16} /> Excel
          </button>
        )}
      </EncabezadoPagina>

      {/* ── Selector ── */}
      <div className="bg-white border border-feisen-borde rounded-xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_1.4fr_auto] gap-3 items-end">
          <label className="block space-y-1.5 min-w-0">
            <span className="block text-xs font-medium text-feisen-texto-2">Fecha de corte</span>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} max={HOY} className={claseInput} />
          </label>
          <label className="block space-y-1.5 min-w-0">
            <span className="block text-xs font-medium text-feisen-texto-2">Bodega</span>
            <select value={bodegaId} onChange={e => setBodegaId(e.target.value)} className={claseInput}>
              <option value="">Todas las bodegas</option>
              {bodegasDisp.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </label>
          <button onClick={calcular} disabled={cargando || !fecha}
            className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 bg-feisen-azul text-white rounded-lg px-5 min-h-[44px] text-sm font-semibold hover:opacity-90 active:scale-[.98] transition disabled:opacity-60">
            {cargando && <RefreshCw size={16} className="animate-spin" />}
            {cargando ? 'Calculando…' : 'Ver inventario'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2.5">Parte del stock de hoy y deshace los movimientos registrados después de la fecha.</p>
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}

      {!resultado && !cargando && !error && (
        <div className="bg-white border border-dashed border-feisen-borde rounded-xl text-center px-6 py-12">
          <CalendarDays size={30} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-feisen-texto">Elige la fecha y toca “Ver inventario”</p>
          <p className="text-sm text-feisen-texto-2 mt-1">Por ejemplo, el último día del mes para el cierre contable.</p>
        </div>
      )}

      {/* ── Resultados ── */}
      {resultado && (
        <>
          <div className="bg-white border border-feisen-borde rounded-xl px-5 py-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Valor al {fechaLabel} · {resultado.bodegaNombre || 'Todas las bodegas'}
              </p>
              <p className="text-3xl font-semibold text-feisen-texto tabular-nums mt-0.5">{cop(resultado.total_general)}</p>
            </div>
            <p className="text-sm text-feisen-texto-2 tabular-nums">
              {resultado.total_productos.toLocaleString('es-CO')} productos · {resultado.bodegas.length} {resultado.bodegas.length === 1 ? 'bodega' : 'bodegas'}
              {!esHoy && ` · ${resultado.movsDeshechos.toLocaleString('es-CO')} movimientos posteriores deshechos`}
            </p>
          </div>

          {resultado.negativos > 0 && (
            <Alerta tipo="alerta"
              mensaje={`${resultado.negativos} producto(s) salen negativos en esa fecha y se muestran en 0: se registraron salidas antes que su entrada. Revisa esos movimientos (o haz un conteo físico).`} />
          )}

          <div className="space-y-2.5">
            <div className="relative">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar producto o categoría…"
                className="w-full border border-feisen-borde rounded-lg pl-10 pr-3 py-2.5 bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
            </div>
            <div className="flex gap-1.5">
              {[[true, 'Con stock'], [false, 'Todos, también en 0']].map(([v, t]) => (
                <button key={t} type="button" aria-pressed={soloConStock === v} onClick={() => setSoloConStock(v)}
                  className={`min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors
                    ${soloConStock === v ? 'bg-feisen-texto text-white border-feisen-texto' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Por bodega */}
          {resultado.bodegas.map(bodega => {
            const filas = filtrar(bodega.items)
            const abierta = bodegasAbiertas[bodega.nombre]
            if (busqueda.trim() && filas.length === 0) return null
            return (
              <section key={bodega.nombre} className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
                <button type="button" onClick={() => toggleBodega(bodega.nombre)} aria-expanded={!!abierta}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-feisen-fondo transition-colors text-left">
                  <ChevronRight size={18} className={`text-gray-400 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-feisen-texto">{bodega.nombre}</span>
                    <span className="block text-xs text-feisen-texto-2 tabular-nums">{filas.length.toLocaleString('es-CO')} producto{filas.length !== 1 ? 's' : ''}</span>
                  </span>
                  <span className="font-semibold text-feisen-texto tabular-nums">{cop(bodega.total_valor)}</span>
                </button>

                {abierta && (
                  <div className="border-t border-feisen-borde-suave">
                    {filas.length === 0 ? (
                      <p className="text-sm text-feisen-texto-2 text-center py-8">
                        {soloConStock ? 'Ningún producto de esta bodega tenía stock en esa fecha.' : 'Esta bodega no tiene productos activos.'}
                      </p>
                    ) : (
                      <>
                        <div className="hidden sm:grid grid-cols-[1fr_7rem_7rem_8rem] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 text-right border-b border-feisen-borde-suave">
                          <span className="text-left">Producto</span><span>Stock</span><span>Costo</span><span>Valor</span>
                        </div>
                        <ul className="divide-y divide-feisen-borde-suave">
                          {filas.map(item => (
                            <li key={item.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_7rem_7rem_8rem] gap-x-3 gap-y-0.5 px-4 py-2.5 items-center">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-feisen-texto break-words">{item.nombre}</p>
                                <p className="text-xs text-gray-400">{item.categoria}</p>
                              </div>
                              <p className="text-sm tabular-nums sm:text-right text-feisen-texto-2 col-start-1 sm:col-start-auto">
                                <b className={`font-semibold ${item.stock_en_fecha === 0 ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{cant(item.stock_en_fecha)}</b> {item.unidad}
                                {!esHoy && item.stock_actual !== item.stock_en_fecha && <span className="block text-xs text-gray-400">hoy {cant(item.stock_actual)}</span>}
                              </p>
                              <p className="hidden sm:block text-sm tabular-nums text-right text-feisen-texto-2">{item.precio > 0 ? cop(item.precio) : <span className="text-gray-300">—</span>}</p>
                              <p className="text-sm font-semibold tabular-nums text-right text-feisen-texto col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto">
                                {item.valor > 0 ? cop(item.valor) : <span className="text-gray-300 font-normal">—</span>}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </section>
            )
          })}

          <div className="flex items-center justify-between gap-3 px-1 text-sm">
            <span className="text-feisen-texto-2">Total al {fechaLabel}</span>
            <span className="text-lg font-semibold text-feisen-texto tabular-nums">{cop(resultado.total_general)}</span>
          </div>
        </>
      )}
    </div>
  )
}

const claseInput = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'
const cant = n => Number(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
const cop = n => `$${Math.round(n).toLocaleString('es-CO')}`
