import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { exportarKardex } from '../../utils/exportExcel'
import Alerta from '../shared/Alerta'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { coincideBusqueda } from '../../utils/busqueda'
import { EncabezadoPagina } from '../shared/ui'
import { TrendingUp, Download, RefreshCw, Search } from 'lucide-react'

function primerDiaMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function ultimoDiaMes() {
  const d = new Date()
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return ultimo.toISOString().split('T')[0]
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
  const [busqueda,     setBusqueda]     = useState('')
  const [soloMov,      setSoloMov]      = useState(true)   // ocultar productos sin movimientos en el periodo
  const [limite,       setLimite]       = useState(PAGINA)

  // Cargar bodegas una sola vez
  useEffect(() => {
    supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setBodegas(data || []))
  }, [])

  // Categorías reactivas a la bodega seleccionada
  useEffect(() => {
    if (!bodegaId) {
      supabase.from('categorias').select('id, nombre').order('nombre')
        .then(({ data }) => setCategorias(data || []))
    } else {
      supabase.from('items')
        .select('categoria_id, categorias(id, nombre)')
        .eq('bodega_id', bodegaId)
        .eq('activo', true)
        .then(({ data }) => {
          const map = new Map()
          for (const item of (data || [])) {
            if (item.categoria_id && item.categorias)
              map.set(item.categoria_id, item.categorias.nombre)
          }
          const cats = [...map.entries()]
            .map(([id, nombre]) => ({ id, nombre }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
          setCategorias(cats)
          // Si la categoría seleccionada ya no está en esta bodega, resetear
          if (categoriaId && !map.has(categoriaId)) setCategoriaId('')
        })
    }
  }, [bodegaId])

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

      // Un .limit() más alto desde el cliente NO puede superar el tope de
      // filas por request del servidor de Supabase/PostgREST (por defecto
      // 1000) — .limit(50000) por sí solo no alcanza. Se pagina con
      // fetchAllPages() para traer todo sin importar ese tope (mismo bug
      // encontrado y corregido 2026-10-03 en Analítica/Reportes/
      // GestionProductos — ver OBSERVACIONES.md).

      // ── 1. Stock actual ──────────────────────────────────────────────────────
      const stockQ = (desde, hasta) => {
        let q = supabase
          .from('stock')
          .select('item_id, bodega_id, cantidad_actual, items(id, nombre, unidad_medida, precio_costo, activo), bodegas(id, nombre)')
          .range(desde, hasta)
        if (bodegaId)      q = q.eq('bodega_id', bodegaId)
        if (filtroItemIds) q = q.in('item_id', filtroItemIds)
        return q
      }

      // ── 2. Movimientos en el período ────────────────────────────────────────
      const movsQ = (desde, hasta) => {
        let q = supabase
          .from('movimientos')
          .select('tipo, item_id, bodega_origen_id, bodega_destino_id, cantidad, precio_costo_snapshot, fecha_movimiento, created_at, items(id, nombre, unidad_medida, precio_costo, activo)')
          .or(`and(fecha_movimiento.gte.${fechaInicio},fecha_movimiento.lte.${fechaFin}),and(fecha_movimiento.is.null,created_at.gte.${fechaInicio}T00:00:00,created_at.lte.${fechaFin}T23:59:59)`)
          .range(desde, hasta)
        if (bodegaId)      q = q.or(`bodega_origen_id.eq.${bodegaId},bodega_destino_id.eq.${bodegaId}`)
        if (filtroItemIds) q = q.in('item_id', filtroItemIds)
        return q
      }

      // ── 3. Movimientos DESPUÉS del período (para retrotraer stock actual) ───
      const movsPostQ = (desde, hasta) => {
        let q = supabase
          .from('movimientos')
          .select('tipo, item_id, bodega_origen_id, bodega_destino_id, cantidad, fecha_movimiento, created_at')
          .or(`fecha_movimiento.gt.${fechaFin},and(fecha_movimiento.is.null,created_at.gt.${fechaFin}T23:59:59)`)
          .range(desde, hasta)
        if (bodegaId) q = q.or(`bodega_origen_id.eq.${bodegaId},bodega_destino_id.eq.${bodegaId}`)
        return q
      }

      const [
        { data: stocks,     error: e1 },
        { data: movsPeriod, error: e2 },
        { data: movsPost,   error: e3 },
      ] = await Promise.all([fetchAllPages(stockQ), fetchAllPages(movsQ), fetchAllPages(movsPostQ)])

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

      // Clasificación por tipo — debe reflejar lo mismo que el trigger
      // fn_actualizar_stock() en la base de datos (ver supabase/schema.sql),
      // para que este informe cuente exactamente lo mismo que realmente
      // mueve el stock. Antes solo reconocía 'entrada'/'salida' literales y
      // excluía en silencio 'entrada_compra', 'devolucion', 'salida_produccion',
      // 'salida_venta' y 'ajuste_inventario' — el mismo tipo de bug ya
      // corregido en Historial/RecogidaFundida/RegistrarFundida/RegistrarMovimientoAlmacenista.
      // Hoy en producción solo se usa 'salida_produccion' además de 'entrada'/'salida',
      // pero se deja preparado para los demás tipos que reconoce el trigger.
      const TIPOS_ENTRADA = new Set(['entrada', 'entrada_compra', 'devolucion', 'ajuste_inventario', 'traslado'])
      const TIPOS_SALIDA  = new Set(['salida', 'salida_produccion', 'salida_venta', 'traslado'])

      // net post-período por item_id::bodega_id
      // positivo = más entradas que salidas después del fin → stockFinal < stockActual
      const postNet = {}
      for (const m of (movsPost || [])) {
        if (TIPOS_ENTRADA.has(m.tipo) && m.bodega_destino_id) {
          const k = `${m.item_id}::${m.bodega_destino_id}`
          postNet[k] = (postNet[k] || 0) + m.cantidad
        }
        if (TIPOS_SALIDA.has(m.tipo) && m.bodega_origen_id) {
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
        const esEntradaExterna = TIPOS_ENTRADA.has(m.tipo) && !m.bodega_origen_id && m.bodega_destino_id
        const esSalidaExterna  = TIPOS_SALIDA.has(m.tipo)  && !m.bodega_destino_id && m.bodega_origen_id
        const esTransfSalida   = TIPOS_SALIDA.has(m.tipo)  && m.bodega_destino_id  && m.bodega_origen_id
        const esTransfEntrada  = TIPOS_ENTRADA.has(m.tipo) && m.bodega_origen_id   && m.bodega_destino_id

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

  const periodoLabel = fechaInicio && fechaFin ? `${fechaCorta(fechaInicio)} – ${fechaCorta(fechaFin)}` : ''

  // Periodos rápidos (además de elegir fechas a mano)
  const hoy = new Date()
  const iso = d => d.toLocaleDateString('en-CA')
  const PERIODOS = [
    ['Este mes',      primerDiaMes(), ultimoDiaMes()],
    ['Mes pasado',    iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0))],
    ['Últimos 30 días', iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29)), iso(hoy)],
    ['Este año',      `${hoy.getFullYear()}-01-01`, iso(hoy)],
  ]

  const conMovimiento = f => f.entradas || f.salidasExt || f.transfEnt || f.transfSal
  const filasVista = resultado
    ? resultado.filas.filter(f => (!soloMov || conMovimiento(f)) && (!busqueda.trim() || coincideBusqueda(`${f.nombreProducto} ${f.nombreBodega}`, busqueda)))
    : []
  const visibles = filasVista.slice(0, limite)
  const nConMov = resultado ? resultado.filas.filter(conMovimiento).length : 0

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <EncabezadoPagina modulo="Inventarios" titulo="Kardex"
        subtitulo="Cuánto había al inicio de un periodo, qué entró, qué salió y cuánto quedó.">
        {resultado && (
          <button onClick={descargar}
            className="inline-flex items-center gap-1.5 border border-feisen-borde bg-white rounded-lg px-3 py-2.5 text-sm font-semibold text-feisen-texto hover:bg-feisen-fondo">
            <Download size={16} /> Excel
          </button>
        )}
      </EncabezadoPagina>

      {/* ── Filtros ── */}
      <div className="bg-white border border-feisen-borde rounded-xl p-4 space-y-3">
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 [scrollbar-width:none]">
          {PERIODOS.map(([t, a, b]) => {
            const activo = fechaInicio === a && fechaFin === b
            return (
              <button key={t} type="button" aria-pressed={activo} onClick={() => { setFechaInicio(a); setFechaFin(b) }}
                className={`shrink-0 min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors
                  ${activo ? 'bg-feisen-texto text-white border-feisen-texto' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
                {t}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr_1.3fr_auto] gap-3 items-end">
          <Campo etiqueta="Desde">
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} max={fechaFin || undefined} className={claseInput} />
          </Campo>
          <Campo etiqueta="Hasta">
            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} min={fechaInicio || undefined} className={claseInput} />
          </Campo>
          <Campo etiqueta="Bodega">
            <select value={bodegaId} onChange={e => setBodegaId(e.target.value)} className={claseInput}>
              <option value="">Todas las bodegas</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Categoría">
            <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} className={claseInput}>
              <option value="">Todas las categorías</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <button onClick={() => { setLimite(PAGINA); generar() }} disabled={cargando || !fechaInicio || !fechaFin}
            className="col-span-2 lg:col-span-1 inline-flex items-center justify-center gap-2 bg-feisen-azul text-white rounded-lg px-5 min-h-[44px] text-sm font-semibold hover:opacity-90 active:scale-[.98] transition disabled:opacity-60">
            {cargando && <RefreshCw size={16} className="animate-spin" />}
            {cargando ? 'Calculando…' : 'Calcular'}
          </button>
        </div>
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}

      {!resultado && !cargando && !error && (
        <div className="bg-white border border-dashed border-feisen-borde rounded-xl text-center px-6 py-12">
          <TrendingUp size={30} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-feisen-texto">Elige el periodo y toca “Calcular”</p>
          <p className="text-sm text-feisen-texto-2 mt-1">Puedes filtrar por bodega o categoría. El Excel trae también los traslados y los valores por producto.</p>
        </div>
      )}

      {/* ── Resumen ── */}
      {resultado && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Valor al inicio', resultado.totalValorInicio, `al ${fechaCorta(fechaInicio)}`],
              ['Entradas',        resultado.totalEntradas,    'compras y producción'],
              ['Salidas',         resultado.totalSalidas,     'consumos y ventas'],
              ['Valor al final',  resultado.totalValorFinal,  `al ${fechaCorta(fechaFin)}`],
            ].map(([t, v, ctx]) => (
              <div key={t} className="bg-white border border-feisen-borde rounded-xl px-4 py-3" title={cop(v)}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t}</p>
                <p className="text-2xl font-semibold text-feisen-texto tabular-nums mt-0.5">{copCorto(v)}</p>
                <p className="text-xs text-feisen-texto-2">{ctx}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2.5">
            <div className="relative">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="search" value={busqueda} onChange={e => { setBusqueda(e.target.value); setLimite(PAGINA) }}
                placeholder="Buscar producto o bodega…"
                className="w-full border border-feisen-borde rounded-lg pl-10 pr-3 py-2.5 bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
            </div>
            <div className="flex gap-1.5">
              {[[true, 'Con movimiento', nConMov], [false, 'Todos', resultado.filas.length]].map(([v, t, n]) => (
                <button key={t} type="button" aria-pressed={soloMov === v} onClick={() => { setSoloMov(v); setLimite(PAGINA) }}
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors
                    ${soloMov === v ? 'bg-feisen-texto text-white border-feisen-texto' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
                  {t} <span className={`tabular-nums ${soloMov === v ? 'text-white/70' : 'text-gray-400'}`}>{n.toLocaleString('es-CO')}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_5.5rem_5.5rem_5.5rem_5.5rem_5.5rem_7rem] gap-3 px-4 py-2 border-b border-feisen-borde text-[11px] font-semibold uppercase tracking-wide text-gray-400 text-right">
              <span className="text-left">Producto</span><span>Inicio</span><span>Entradas</span><span>Salidas</span><span>Traslados</span><span>Final</span><span>Valor final</span>
            </div>
            {visibles.length === 0 ? (
              <p className="text-center text-sm text-feisen-texto-2 px-6 py-10">
                {busqueda.trim() ? `Ningún producto coincide con “${busqueda.trim()}”.` : 'Ningún producto tuvo movimientos en este periodo. Toca “Todos” para ver el stock completo.'}
              </p>
            ) : (
              <ul className="divide-y divide-feisen-borde-suave">
                {visibles.map((f, i) => {
                  const traslado = f.transfEnt - f.transfSal
                  const celdas = [
                    ['Inicio', cant(f.stockInicio), 'text-feisen-texto-2'],
                    ['Entradas', f.entradas ? `+${cant(f.entradas)}` : '—', f.entradas ? 'text-feisen-texto' : 'text-gray-300'],
                    ['Salidas', f.salidasExt ? `−${cant(f.salidasExt)}` : '—', f.salidasExt ? 'text-feisen-texto' : 'text-gray-300'],
                    ['Traslados', traslado ? `${traslado > 0 ? '+' : '−'}${cant(Math.abs(traslado))}` : '—', traslado ? 'text-feisen-texto-2' : 'text-gray-300'],
                    ['Final', cant(f.stockFinal), 'font-semibold text-feisen-texto'],
                  ]
                  return (
                    <li key={i} className="px-4 py-2.5 md:grid md:grid-cols-[1fr_5.5rem_5.5rem_5.5rem_5.5rem_5.5rem_7rem] md:gap-3 md:items-center">
                      <div className="min-w-0 flex justify-between gap-3 md:block">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-feisen-texto break-words">{f.nombreProducto}</p>
                          <p className="text-xs text-gray-400">{[bodegaId ? null : f.nombreBodega, f.unidad].filter(Boolean).join(' · ')}</p>
                        </div>
                        <p className="md:hidden text-sm font-semibold text-feisen-texto tabular-nums whitespace-nowrap">{f.valorFinalEst > 0 ? cop(f.valorFinalEst) : '—'}</p>
                      </div>
                      <div className="grid grid-cols-5 gap-1 mt-2 md:contents">
                        {celdas.map(([t, v, c]) => (
                          <p key={t} className={`text-sm tabular-nums md:text-right ${c}`}>
                            <span className="md:hidden block text-[11px] text-gray-400">{t}</span>{v}
                          </p>
                        ))}
                      </div>
                      <p className="hidden md:block text-sm text-right tabular-nums text-feisen-texto">{f.valorFinalEst > 0 ? cop(f.valorFinalEst) : <span className="text-gray-300">—</span>}</p>
                    </li>
                  )
                })}
              </ul>
            )}
            {filasVista.length > visibles.length && (
              <button type="button" onClick={() => setLimite(l => l + PAGINA)}
                className="w-full border-t border-feisen-borde py-3 text-sm font-medium text-feisen-azul hover:bg-feisen-fondo">
                Mostrar {Math.min(PAGINA, filasVista.length - visibles.length)} más · van {visibles.length.toLocaleString('es-CO')} de {filasVista.length.toLocaleString('es-CO')}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 text-right">{periodoLabel} · valores a precio de costo actual del producto</p>
        </>
      )}
    </div>
  )
}

const PAGINA = 200
const claseInput = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'
const cant = n => Number(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
const cop = n => `$${Math.round(n).toLocaleString('es-CO')}`
function copCorto(n) {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  if (a >= 1e6) return `${s}$${(a / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  return `${s}$${Math.round(a).toLocaleString('es-CO')}`
}
const fechaCorta = f => new Date(`${f}T12:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })

function Campo({ etiqueta, children }) {
  return (
    <label className="block space-y-1.5 min-w-0">
      <span className="block text-xs font-medium text-feisen-texto-2">{etiqueta}</span>
      {children}
    </label>
  )
}
