import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { exportarKardex } from '../../utils/exportExcel'
import Alerta from '../shared/Alerta'
import { TrendingUp, Download, RefreshCw } from 'lucide-react'

function primerDiaMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function ultimoDiaMes() {
  const d = new Date()
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return ultimo.toISOString().split('T')[0]
}

function fmt(n) {
  return `$${Math.round(n).toLocaleString('es-CO')}`
}

export default function InformeKardex() {
  const [fechaInicio,  setFechaInicio]  = useState(primerDiaMes())
  const [fechaFin,     setFechaFin]     = useState(ultimoDiaMes())
  const [bodegaId,     setBodegaId]     = useState('')   // '' = todas
  const [categoriaId,  setCategoriaId]  = useState('')   // '' = todas
  const [bodegas,      setBodegas]      = useState([])
  const [categorias,   setCategorias]   = useState([])
  const [cargando,     setCargando]     = useState(false)
  const [error,        setError]        = useState('')
  const [resultado,    setResultado]    = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('categorias').select('id, nombre').order('nombre'),
    ]).then(([{ data: b }, { data: c }]) => {
      setBodegas(b || [])
      setCategorias(c || [])
    })
  }, [])

  async function generar() {
    setCargando(true)
    setError('')
    setResultado(null)

    try {
      // ── 0. Si hay filtro de categoría, obtener los item_ids válidos ─────────
      let filtroItemIds = null
      if (categoriaId) {
        const { data: catItems, error: eCat } = await supabase
          .from('items')
          .select('id')
          .eq('categoria_id', categoriaId)
          .eq('activo', true)
        if (eCat) throw eCat
        filtroItemIds = (catItems || []).map(i => i.id)
        if (filtroItemIds.length === 0) {
          setResultado({ filas: [], totalValorInicio: 0, totalValorFinal: 0, totalEntradas: 0, totalSalidas: 0 })
          setCargando(false)
          return
        }
      }

      // ── 1. Stock actual ──────────────────────────────────────────────────────
      let stockQ = supabase
        .from('stock')
        .select('item_id, bodega_id, cantidad_actual, items(id, nombre, unidad_medida, precio_costo, activo), bodegas(id, nombre)')
      if (bodegaId)      stockQ = stockQ.eq('bodega_id', bodegaId)
      if (filtroItemIds) stockQ = stockQ.in('item_id', filtroItemIds)

      // ── 2. Movimientos en el período ────────────────────────────────────────
      let movsQ = supabase
        .from('movimientos')
        .select('tipo, item_id, bodega_origen_id, bodega_destino_id, cantidad, precio_costo_snapshot, fecha_movimiento, items(id, nombre, unidad_medida, precio_costo, activo)')
        .gte('fecha_movimiento', fechaInicio)
        .lte('fecha_movimiento', fechaFin)
      if (bodegaId)      movsQ = movsQ.or(`bodega_origen_id.eq.${bodegaId},bodega_destino_id.eq.${bodegaId}`)
      if (filtroItemIds) movsQ = movsQ.in('item_id', filtroItemIds)

      // ── 3. Movimientos DESPUÉS del período (para retrotraer stock actual) ───
      let movsPostQ = supabase
        .from('movimientos')
        .select('tipo, item_id, bodega_origen_id, bodega_destino_id, cantidad, fecha_movimiento')
        .gt('fecha_movimiento', fechaFin)
      if (bodegaId) movsPostQ = movsPostQ.or(`bodega_origen_id.eq.${bodegaId},bodega_destino_id.eq.${bodegaId}`)

      const [
        { data: stocks,     error: e1 },
        { data: movsPeriod, error: e2 },
        { data: movsPost,   error: e3 },
      ] = await Promise.all([stockQ, movsQ, movsPostQ])

      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3

      // ── Mapas de referencia ─────────────────────────────────────────────────
      // stock actual por item_id::bodega_id
      const stockMap = {}
      const bodegaNameMap = {}
      for (const s of (stocks || [])) {
        if (!s.items?.activo) continue
        stockMap[`${s.item_id}::${s.bodega_id}`] = s
        if (s.bodegas) bodegaNameMap[s.bodega_id] = s.bodegas.nombre
      }
      // También cargar nombres de bodegas desde el estado del componente
      for (const b of bodegas) {
        if (!bodegaNameMap[b.id]) bodegaNameMap[b.id] = b.nombre
      }

      // Mapa de info de ítems desde movimientos (para ítems sin stock record)
      const itemInfoMap = {}
      for (const m of (movsPeriod || [])) {
        if (m.items && !itemInfoMap[m.item_id]) itemInfoMap[m.item_id] = m.items
      }

      // net post-período por item_id::bodega_id
      // positivo = más entradas que salidas después del fin → stockFinal < stockActual
      const postNet = {}
      for (const m of (movsPost || [])) {
        if (m.tipo === 'entrada' && m.bodega_destino_id) {
          const k = `${m.item_id}::${m.bodega_destino_id}`
          postNet[k] = (postNet[k] || 0) + m.cantidad
        }
        if (m.tipo === 'salida' && m.bodega_origen_id) {
          const k = `${m.item_id}::${m.bodega_origen_id}`
          postNet[k] = (postNet[k] || 0) - m.cantidad
        }
      }

      // acumuladores por item_id::bodega_id durante el período
      const acc = {} // { entradas, salidasExt, transfSal, transfEnt, valorEnt, valorSal }
      function getAcc(k) {
        if (!acc[k]) acc[k] = { entradas: 0, salidasExt: 0, transfSal: 0, transfEnt: 0, valorEnt: 0, valorSal: 0 }
        return acc[k]
      }

      for (const m of (movsPeriod || [])) {
        const precio = m.precio_costo_snapshot || 0
        const esEntradaExterna = m.tipo === 'entrada' && !m.bodega_origen_id && m.bodega_destino_id
        const esSalidaExterna  = m.tipo === 'salida'  && !m.bodega_destino_id && m.bodega_origen_id
        const esTransfSalida   = m.tipo === 'salida'  && m.bodega_destino_id  && m.bodega_origen_id
        const esTransfEntrada  = m.tipo === 'entrada' && m.bodega_origen_id   && m.bodega_destino_id

        if (esEntradaExterna) {
          const a = getAcc(`${m.item_id}::${m.bodega_destino_id}`)
          a.entradas += m.cantidad
          a.valorEnt += m.cantidad * precio
        }
        if (esSalidaExterna) {
          const a = getAcc(`${m.item_id}::${m.bodega_origen_id}`)
          a.salidasExt += m.cantidad
          a.valorSal   += m.cantidad * precio
        }
        if (esTransfSalida) {
          const a = getAcc(`${m.item_id}::${m.bodega_origen_id}`)
          a.transfSal += m.cantidad
        }
        if (esTransfEntrada) {
          const a = getAcc(`${m.item_id}::${m.bodega_destino_id}`)
          a.transfEnt += m.cantidad
        }
      }

      // Combinar stock + acumuladores → filas
      // Claves = todo lo que aparece en stock activo
      const keys = Object.keys(stockMap)
      // Agregar claves que solo están en movimientos del período
      for (const m of (movsPeriod || [])) {
        if (m.bodega_destino_id) keys.indexOf(`${m.item_id}::${m.bodega_destino_id}`) === -1 && keys.push(`${m.item_id}::${m.bodega_destino_id}`)
        if (m.bodega_origen_id)  keys.indexOf(`${m.item_id}::${m.bodega_origen_id}`)  === -1 && keys.push(`${m.item_id}::${m.bodega_origen_id}`)
      }

      const filas = []
      const seenKeys = new Set()

      for (const k of keys) {
        if (seenKeys.has(k)) continue
        seenKeys.add(k)

        const [kItemId, kBodegaId] = k.split('::')
        const s = stockMap[k]

        let itemNombre, itemUnidad, itemPrecio, nombreBodega, stockActual

        if (s) {
          if (!s.items?.activo) continue
          itemNombre   = s.items?.nombre        || '—'
          itemUnidad   = s.items?.unidad_medida || ''
          itemPrecio   = s.items?.precio_costo  || 0
          nombreBodega = s.bodegas?.nombre      || bodegaNameMap[kBodegaId] || '—'
          stockActual  = s.cantidad_actual ?? 0
        } else {
          // Sin registro en tabla stock, pero hay movimientos → mostrar igualmente
          const itemInfo = itemInfoMap[kItemId]
          if (!itemInfo || !itemInfo.activo) continue
          itemNombre   = itemInfo.nombre        || '—'
          itemUnidad   = itemInfo.unidad_medida || ''
          itemPrecio   = itemInfo.precio_costo  || 0
          nombreBodega = bodegaNameMap[kBodegaId] || '—'
          stockActual  = 0
        }

        const a           = acc[k] || { entradas: 0, salidasExt: 0, transfSal: 0, transfEnt: 0, valorEnt: 0, valorSal: 0 }
        const net         = postNet[k] || 0
        const stockFinal  = Math.max(0, stockActual - net)
        const stockInicio = Math.max(0, stockFinal - a.entradas - a.transfEnt + a.salidasExt + a.transfSal)

        filas.push({
          nombreProducto: itemNombre,
          nombreBodega,
          unidad:         itemUnidad,
          stockInicio,
          entradas:       a.entradas,
          salidasExt:     a.salidasExt,
          transfSal:      a.transfSal,
          transfEnt:      a.transfEnt,
          stockFinal,
          precio:         itemPrecio,
          valorInicioEst: Math.round(stockInicio * itemPrecio),
          valorFinalEst:  Math.round(stockFinal  * itemPrecio),
          valorEntradas:  Math.round(a.valorEnt),
          valorSalidas:   Math.round(a.valorSal),
        })
      }

      filas.sort((a, b) =>
        a.nombreBodega.localeCompare(b.nombreBodega) || a.nombreProducto.localeCompare(b.nombreProducto)
      )

      const totalValorInicio = filas.reduce((s, f) => s + f.valorInicioEst, 0)
      const totalValorFinal  = filas.reduce((s, f) => s + f.valorFinalEst,  0)
      const totalEntradas    = filas.reduce((s, f) => s + f.valorEntradas,   0)
      const totalSalidas     = filas.reduce((s, f) => s + f.valorSalidas,    0)

      setResultado({ filas, totalValorInicio, totalValorFinal, totalEntradas, totalSalidas })

    } catch (err) {
      setError('Error al generar: ' + (err.message || JSON.stringify(err)))
    } finally {
      setCargando(false)
    }
  }

  function descargar() {
    if (!resultado) return
    const bodegaNombre    = bodegaId    ? bodegas.find(b => b.id === bodegaId)?.nombre         || 'bodega'    : 'todas las bodegas'
    const categoriaNombre = categoriaId ? categorias.find(c => c.id === categoriaId)?.nombre   || 'categoria' : null
    exportarKardex(resultado.filas, fechaInicio, fechaFin, bodegaNombre, categoriaNombre)
  }

  const periodoLabel = fechaInicio && fechaFin
    ? `${new Date(`${fechaInicio}T12:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })} — ${new Date(`${fechaFin}T12:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : ''

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-feisen-azul flex items-center gap-2">
        <TrendingUp size={24} /> Kardex de movimientos
      </h1>

      {/* ── Filtros ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <p className="text-sm text-gray-500">
          Muestra el stock al inicio y al fin del período, más todas las entradas, salidas y transferencias intermedias,
          con su valor en COP.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Fecha inicio</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => setFechaInicio(e.target.value)}
              max={fechaFin || undefined}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Fecha fin</label>
            <input
              type="date"
              value={fechaFin}
              onChange={e => setFechaFin(e.target.value)}
              min={fechaInicio || undefined}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Bodega</label>
            <select
              value={bodegaId}
              onChange={e => setBodegaId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white"
            >
              <option value="">Todas las bodegas</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Categoría de producto</label>
            <select
              value={categoriaId}
              onChange={e => setCategoriaId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white"
            >
              <option value="">Todas las categorías</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={generar}
            disabled={cargando || !fechaInicio || !fechaFin}
            className="flex items-center gap-2 bg-feisen-azul text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {cargando ? <RefreshCw size={16} className="animate-spin" /> : <TrendingUp size={16} />}
            {cargando ? 'Calculando...' : 'Calcular'}
          </button>

          {resultado && (
            <button
              onClick={descargar}
              className="flex items-center gap-2 border border-feisen-azul text-feisen-azul px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-50 transition-colors"
            >
              <Download size={16} /> Descargar Excel
            </button>
          )}
        </div>
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}

      {/* ── Resumen ── */}
      {resultado && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Valor inicio período', valor: resultado.totalValorInicio, color: 'text-gray-700' },
              { label: 'Entradas (valor)',      valor: resultado.totalEntradas,   color: 'text-green-700' },
              { label: 'Salidas (valor)',        valor: resultado.totalSalidas,    color: 'text-feisen-rojo' },
              { label: 'Valor fin período',      valor: resultado.totalValorFinal, color: 'text-feisen-azul' },
            ].map(({ label, valor, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className={`font-bold text-lg ${color}`}>{fmt(valor)}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 text-right">{periodoLabel} · {resultado.filas.length} ítems</p>

          {/* Tabla preview */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Producto</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Bodega</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Inicio</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 hidden sm:table-cell">Entradas</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 hidden sm:table-cell">Salidas</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Final</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Valor final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {resultado.filas.map((f, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-800 leading-tight">{f.nombreProducto}</p>
                        <p className="text-xs text-gray-400">{f.unidad}</p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs hidden md:table-cell">{f.nombreBodega}</td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{f.stockInicio}</td>
                      <td className="px-3 py-2.5 text-center hidden sm:table-cell">
                        {f.entradas > 0
                          ? <span className="text-green-700 font-medium">+{f.entradas}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-center hidden sm:table-cell">
                        {f.salidasExt > 0
                          ? <span className="text-feisen-rojo font-medium">-{f.salidasExt}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-center font-bold text-feisen-azul">{f.stockFinal}</td>
                      <td className="px-4 py-2.5 text-right text-feisen-azul font-semibold text-xs">
                        {f.valorFinalEst > 0 ? fmt(f.valorFinalEst) : <span className="text-gray-300 font-normal">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={descargar}
              className="flex items-center gap-2 bg-feisen-azul text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <Download size={16} /> Descargar Excel completo
            </button>
          </div>
        </>
      )}
    </div>
  )
}
