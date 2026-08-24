import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  ClipboardList, ChevronDown, ChevronUp, Search, PlusCircle,
  CheckCircle2, AlertTriangle, TrendingUp, Lock, Plus,
} from 'lucide-react'

function numOrden(n) { return `ORD-MOL-${String(n).padStart(4, '0')}` }
function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}
function hoyCol() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}
async function generarNumMovimiento(perfil) {
  const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
  const prefix = `ENT-${iniciales}-`
  const { data: last } = await supabase
    .from('movimientos').select('numero').like('numero', `${prefix}%`)
    .order('numero', { ascending: false }).limit(1).maybeSingle()
  const n = last?.numero ? parseInt(last.numero.replace(prefix, ''), 10) || 0 : 0
  return `${prefix}${String(n + 1).padStart(4, '0')}`
}

export default function ListaOrdenesMoldeo() {
  const navigate = useNavigate()
  const { perfil } = useAuth()

  const [ordenes,      setOrdenes]      = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [expandido,    setExpandido]    = useState(null)
  const [busqueda,     setBusqueda]     = useState('')
  const [fundBodegaId, setFundBodegaId] = useState(null)

  // Avances diarios cargados por orden: { [ordenId]: { [piezaId]: { total, dias[] } } }
  const [avancesData,  setAvancesData]  = useState({})
  // Stock actual: { [ordenId]: { [itemId]: stock } }
  const [stockData,    setStockData]    = useState({})

  // Paneles activos por orden
  const [panelAvance,  setPanelAvance]  = useState({}) // { [ordenId]: bool }
  const [panelCierre,  setPanelCierre]  = useState({}) // { [ordenId]: bool }

  // Inputs avance del día
  const [avanceHoy,    setAvanceHoy]    = useState({}) // { [ordenId]: { [piezaId]: string } }
  const [fechaAvance,  setFechaAvance]  = useState({}) // { [ordenId]: string }
  const [guardandoAv,  setGuardandoAv]  = useState(null)
  const [errorAv,      setErrorAv]      = useState({})

  // Inputs cierre / recogida
  const [resultados,   setResultados]   = useState({})
  const [guardandoRes, setGuardandoRes] = useState(null)
  const [errorRes,     setErrorRes]     = useState({})

  // Vista completadas
  const [vistaOrden,   setVistaOrden]   = useState({})

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: bods }, { data: ords }] = await Promise.all([
      supabase.from('bodegas').select('id').ilike('nombre', '%FUNDICIÓN%').single(),
      supabase.from('ordenes_moldeo')
        .select(`
          id, numero, fecha, tipo, estado, created_at,
          ordenes_moldeo_piezas(
            id, item_id, cantidad_planeada, asignado_a,
            cantidad_conforme, cantidad_nc, motivo_nc,
            items(id, nombre, precio_costo, peso_unitario)
          ),
          ordenes_moldeo_maquinas(
            cantidad_maquinas,
            maquinas_fundicion(nombre)
          )
        `)
        .order('created_at', { ascending: false })
    ])
    setFundBodegaId(bods?.id || null)
    setOrdenes(ords || [])
    setCargando(false)
  }

  async function cargarAvancesYStock(orden, bodegaId) {
    const piezas   = orden.ordenes_moldeo_piezas || []
    const piezaIds = piezas.map(p => p.id)
    const itemIds  = piezas.map(p => p.item_id)

    const [{ data: avData }, { data: stData }] = await Promise.all([
      piezaIds.length > 0
        ? supabase.from('ordenes_moldeo_avances')
            .select('orden_pieza_id, fecha, cantidad_moldeada')
            .in('orden_pieza_id', piezaIds)
            .order('fecha')
        : { data: [] },
      itemIds.length > 0 && bodegaId
        ? supabase.from('stock')
            .select('item_id, cantidad_actual')
            .in('item_id', itemIds)
            .eq('bodega_id', bodegaId)
        : { data: [] },
    ])

    // Agrupar avances por pieza
    const avMap = {}
    for (const a of (avData || [])) {
      if (!avMap[a.orden_pieza_id]) avMap[a.orden_pieza_id] = { total: 0, dias: [] }
      avMap[a.orden_pieza_id].total += a.cantidad_moldeada
      avMap[a.orden_pieza_id].dias.push({ fecha: a.fecha, cantidad: a.cantidad_moldeada })
    }

    const stMap = {}
    for (const s of (stData || [])) stMap[s.item_id] = s.cantidad_actual ?? 0

    setAvancesData(prev => ({ ...prev, [orden.id]: avMap }))
    setStockData(prev => ({ ...prev, [orden.id]: stMap }))
  }

  async function toggle(orden) {
    const id = orden.id
    if (expandido === id) { setExpandido(null); return }
    setExpandido(id)
    if (!avancesData[id]) await cargarAvancesYStock(orden, fundBodegaId)
  }

  const filtradas = ordenes.filter(o => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return true
    return (
      numOrden(o.numero).toLowerCase().includes(q) ||
      fmtFecha(o.fecha).includes(q) ||
      (o.ordenes_moldeo_piezas || []).some(p => p.items?.nombre?.toLowerCase().includes(q)) ||
      (o.ordenes_moldeo_maquinas || []).some(m => m.maquinas_fundicion?.nombre?.toLowerCase().includes(q))
    )
  })

  // ── Avance diario ──────────────────────────────────────────────────────────
  function setAv(ordenId, piezaId, val) {
    setAvanceHoy(prev => ({
      ...prev,
      [ordenId]: { ...(prev[ordenId] || {}), [piezaId]: val }
    }))
  }
  function getAv(ordenId, piezaId) { return avanceHoy[ordenId]?.[piezaId] ?? '' }

  async function guardarAvance(orden) {
    setErrorAv(prev => ({ ...prev, [orden.id]: '' }))
    const fecha = fechaAvance[orden.id] || hoyCol()
    const piezas = orden.ordenes_moldeo_piezas || []
    const rows = piezas
      .map(p => ({ pieza: p, cant: Number(getAv(orden.id, p.id) || 0) }))
      .filter(r => r.cant > 0)

    if (rows.length === 0) {
      setErrorAv(prev => ({ ...prev, [orden.id]: 'Ingresa al menos una cantidad mayor a 0.' }))
      return
    }

    setGuardandoAv(orden.id)
    try {
      const { error } = await supabase.from('ordenes_moldeo_avances').insert(
        rows.map(r => ({
          orden_pieza_id:    r.pieza.id,
          fecha,
          cantidad_moldeada: r.cant,
          registrado_por_id: perfil?.id || null,
        }))
      )
      if (error) throw error
      // Limpiar inputs
      setAvanceHoy(prev => ({ ...prev, [orden.id]: {} }))
      setPanelAvance(prev => ({ ...prev, [orden.id]: false }))
      await cargarAvancesYStock(orden, fundBodegaId)
    } catch (e) {
      setErrorAv(prev => ({ ...prev, [orden.id]: 'Error al guardar: ' + e.message }))
    } finally {
      setGuardandoAv(null)
    }
  }

  // ── Cierre / Recogida ──────────────────────────────────────────────────────
  function setRes(ordenId, piezaId, campo, val) {
    setResultados(prev => ({
      ...prev,
      [ordenId]: { ...(prev[ordenId] || {}), [piezaId]: { ...(prev[ordenId]?.[piezaId] || {}), [campo]: val } }
    }))
  }
  function getRes(ordenId, piezaId, campo) { return resultados[ordenId]?.[piezaId]?.[campo] ?? '' }

  async function registrarCierre(orden) {
    setErrorRes(prev => ({ ...prev, [orden.id]: '' }))
    const piezas = orden.ordenes_moldeo_piezas || []

    for (const p of piezas) {
      const conf = Number(getRes(orden.id, p.id, 'conforme') || 0)
      const nc   = Number(getRes(orden.id, p.id, 'nc') || 0)
      if (conf < 0 || nc < 0) {
        setErrorRes(prev => ({ ...prev, [orden.id]: 'Las cantidades no pueden ser negativas.' }))
        return
      }
    }

    setGuardandoRes(orden.id)
    try {
      for (const p of piezas) {
        const conf   = Number(getRes(orden.id, p.id, 'conforme') || 0)
        const nc     = Number(getRes(orden.id, p.id, 'nc') || 0)
        const motivo = getRes(orden.id, p.id, 'motivo') || null
        await supabase.from('ordenes_moldeo_piezas')
          .update({ cantidad_conforme: conf, cantidad_nc: nc, motivo_nc: motivo || null })
          .eq('id', p.id)
      }

      const piezasConformes = piezas.filter(p => Number(getRes(orden.id, p.id, 'conforme') || 0) > 0)
      if (piezasConformes.length > 0 && fundBodegaId) {
        const numero = await generarNumMovimiento(perfil)
        await supabase.from('movimientos').insert(
          piezasConformes.map(p => ({
            numero,
            tipo:                  'entrada',
            item_id:               p.item_id,
            bodega_destino_id:     fundBodegaId,
            bodega_origen_id:      null,
            cantidad:              Number(getRes(orden.id, p.id, 'conforme')),
            precio_costo_snapshot: p.items?.precio_costo || 0,
            centro_costo:          'FUNDICIÓN',
            usuario_id:            perfil.id,
            proveedor:             'Producción interna',
            referencia:            numOrden(orden.numero),
            fecha_movimiento:      orden.fecha || null,
            foto_remision_url: null, destino: null,
            numero_of: null, serial_motor: null, motivo: null, cliente: null,
          }))
        )
      }

      await supabase.from('ordenes_moldeo').update({ estado: 'completado' }).eq('id', orden.id)
      await cargar()
      setExpandido(orden.id)
    } catch (e) {
      setErrorRes(prev => ({ ...prev, [orden.id]: 'Error al guardar: ' + e.message }))
    } finally {
      setGuardandoRes(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto p-4">

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2.5 rounded-xl">
            <ClipboardList size={22} className="text-feisen-azul" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Órdenes de Moldeo</h1>
            <p className="text-xs text-gray-500">
              {ordenes.filter(o => o.estado === 'pendiente').length} en curso · {ordenes.filter(o => o.estado === 'completado').length} completadas
            </p>
          </div>
        </div>
        <button onClick={() => navigate('/moldeo/nueva')}
          className="flex items-center gap-2 bg-feisen-rojo text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90">
          <PlusCircle size={16} /> Nueva orden
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por N°, fecha, pieza, máquina…"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
        />
      </div>

      {cargando ? (
        <p className="text-center text-gray-400 py-16">Cargando…</p>
      ) : filtradas.length === 0 ? (
        <p className="text-center text-gray-400 py-16">
          {busqueda ? 'Sin resultados.' : 'Aún no hay órdenes de moldeo.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtradas.map(orden => {
            const completada = orden.estado === 'completado'
            const piezas     = orden.ordenes_moldeo_piezas || []
            const maquinas   = orden.ordenes_moldeo_maquinas || []
            const avOrden    = avancesData[orden.id] || {}
            const stOrden    = stockData[orden.id]   || {}

            // Totales de avance
            const totalPlaneado   = piezas.reduce((s, p) => s + Number(p.cantidad_planeada || 0), 0)
            const totalMoldeado   = piezas.reduce((s, p) => s + (avOrden[p.id]?.total || 0), 0)
            const pctAvance       = totalPlaneado > 0 ? Math.round((totalMoldeado / totalPlaneado) * 100) : 0
            const hayStockAlerta  = !completada && piezas.some(p => {
              const stock     = stOrden[p.item_id] ?? null
              const pendiente = Number(p.cantidad_planeada || 0) - (avOrden[p.id]?.total || 0)
              return stock !== null && stock < pendiente && pendiente > 0
            })

            return (
              <div key={orden.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

                {/* Fila resumen */}
                <button type="button" onClick={() => toggle(orden)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="bg-blue-100 text-feisen-azul font-bold text-sm px-3 py-1 rounded-lg font-mono shrink-0">
                      {numOrden(orden.numero)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{fmtFecha(orden.fecha)}</p>
                      <p className="text-xs text-gray-500">{piezas.length} piezas</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    {hayStockAlerta && (
                      <AlertTriangle size={15} className="text-orange-400" />
                    )}
                    {!completada && avancesData[orden.id] && totalMoldeado > 0 && (
                      <span className="text-xs font-bold text-feisen-azul bg-blue-50 px-2 py-0.5 rounded-full">
                        {pctAvance}%
                      </span>
                    )}
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      completada ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {completada ? '✓ Completada' : '⏳ En curso'}
                    </span>
                    {expandido === orden.id
                      ? <ChevronUp size={16} className="text-gray-400" />
                      : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </button>

                {/* Detalle expandido */}
                {expandido === orden.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-5 space-y-5">

                    {/* Máquinas */}
                    {maquinas.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {maquinas.map((m, i) => (
                          <span key={i} className="bg-white border border-blue-200 text-feisen-azul text-xs font-semibold px-2.5 py-1 rounded-full">
                            {m.cantidad_maquinas} × {m.maquinas_fundicion?.nombre}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* ══ ORDEN EN CURSO ══ */}
                    {!completada && (
                      <>
                        {/* Tabla de progreso */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-gray-400 uppercase">Progreso de la orden</p>
                            {totalMoldeado > 0 && (
                              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                pctAvance >= 80 ? 'bg-green-100 text-green-700'
                                : pctAvance >= 40 ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-500'
                              }`}>
                                {pctAvance}% completado
                              </span>
                            )}
                          </div>
                          <div className="overflow-x-auto rounded-xl border border-gray-200">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-100 text-xs text-gray-500 font-bold uppercase">
                                  <th className="text-left px-3 py-2.5">Pieza</th>
                                  <th className="text-left px-3 py-2.5 hidden sm:table-cell">Moldeador</th>
                                  <th className="text-center px-2 py-2.5">Plan.</th>
                                  <th className="text-center px-2 py-2.5">Moldeadas</th>
                                  <th className="text-center px-2 py-2.5">Pendiente</th>
                                  <th className="text-center px-2 py-2.5">Stock</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {piezas.map(p => {
                                  const avP      = avOrden[p.id]?.total || 0
                                  const pendiente = Math.max(0, Number(p.cantidad_planeada || 0) - avP)
                                  const stock     = stOrden[p.item_id] ?? null
                                  const alerta    = stock !== null && stock < pendiente && pendiente > 0
                                  return (
                                    <tr key={p.id} className={alerta ? 'bg-orange-50' : 'bg-white hover:bg-gray-50/50'}>
                                      <td className="px-3 py-2.5 font-medium text-gray-800 text-sm">{p.items?.nombre}</td>
                                      <td className="px-3 py-2.5 text-xs text-gray-400 hidden sm:table-cell">{p.asignado_a || '—'}</td>
                                      <td className="px-2 py-2.5 text-center text-gray-500">{p.cantidad_planeada}</td>
                                      <td className="px-2 py-2.5 text-center font-bold text-feisen-azul">{avP || '—'}</td>
                                      <td className="px-2 py-2.5 text-center">
                                        <span className={`font-bold ${pendiente > 0 ? 'text-gray-700' : 'text-green-600'}`}>
                                          {pendiente === 0 ? '✓' : pendiente}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2.5 text-center">
                                        {stock !== null ? (
                                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                            alerta ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                                          }`}>
                                            {stock}
                                            {alerta && ' ⚠'}
                                          </span>
                                        ) : <span className="text-gray-300">—</span>}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                          {hayStockAlerta && (
                            <p className="text-xs text-orange-500 mt-1.5 font-medium">
                              ⚠ Stock insuficiente para terminar la cantidad planeada en alguna pieza.
                            </p>
                          )}
                        </div>

                        {/* ── PANEL: Registrar avance del día ── */}
                        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                          <button type="button"
                            onClick={() => setPanelAvance(prev => ({ ...prev, [orden.id]: !prev[orden.id] }))}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-2">
                              <TrendingUp size={16} className="text-feisen-azul" />
                              <span className="text-sm font-bold text-gray-700">Registrar avance del día</span>
                            </div>
                            {panelAvance[orden.id]
                              ? <ChevronUp size={15} className="text-gray-400" />
                              : <ChevronDown size={15} className="text-gray-400" />}
                          </button>

                          {panelAvance[orden.id] && (
                            <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                              {/* Fecha del avance */}
                              <div className="flex items-center gap-3">
                                <label className="text-xs font-semibold text-gray-600 shrink-0">Fecha del avance</label>
                                <input type="date"
                                  value={fechaAvance[orden.id] || hoyCol()}
                                  onChange={e => setFechaAvance(prev => ({ ...prev, [orden.id]: e.target.value }))}
                                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                                />
                              </div>

                              {errorAv[orden.id] && (
                                <p className="text-xs text-red-600 font-medium bg-red-50 rounded-lg px-3 py-2">
                                  {errorAv[orden.id]}
                                </p>
                              )}

                              {/* Inputs por pieza */}
                              <div className="space-y-2">
                                {piezas.map(p => {
                                  const avP      = avOrden[p.id]?.total || 0
                                  const pendiente = Math.max(0, Number(p.cantidad_planeada || 0) - avP)
                                  return (
                                    <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{p.items?.nombre}</p>
                                        {p.asignado_a && <p className="text-xs text-gray-400">{p.asignado_a}</p>}
                                        <p className="text-xs text-gray-400 mt-0.5">
                                          Pendiente: <span className="font-bold text-gray-600">{pendiente}</span>
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs text-gray-400">Moldeadas hoy</span>
                                        <input type="number" min="0" step="1"
                                          value={getAv(orden.id, p.id)}
                                          onChange={e => setAv(orden.id, p.id, e.target.value)}
                                          placeholder="0"
                                          className="w-20 border-2 border-gray-200 rounded-xl px-2 py-1.5 text-center text-sm font-bold focus:outline-none focus:border-feisen-azul"
                                        />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>

                              <button onClick={() => guardarAvance(orden)} disabled={guardandoAv === orden.id}
                                className="w-full flex items-center justify-center gap-2 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity">
                                <Plus size={15} />
                                {guardandoAv === orden.id ? 'Guardando…' : 'Guardar avance'}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* ── PANEL: Cerrar orden / Recogida ── */}
                        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                          <button type="button"
                            onClick={() => setPanelCierre(prev => ({ ...prev, [orden.id]: !prev[orden.id] }))}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-2">
                              <Lock size={15} className="text-gray-500" />
                              <span className="text-sm font-bold text-gray-700">Cerrar orden — Recogida post-fundida</span>
                            </div>
                            {panelCierre[orden.id]
                              ? <ChevronUp size={15} className="text-gray-400" />
                              : <ChevronDown size={15} className="text-gray-400" />}
                          </button>

                          {panelCierre[orden.id] && (
                            <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                              <p className="text-xs text-gray-400">
                                Registra las piezas conformes y no conformes recogidas después de la fundida. Al guardar, la orden se marca como completada y las piezas conformes entran al inventario.
                              </p>

                              {errorRes[orden.id] && (
                                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm flex items-center gap-2">
                                  <AlertTriangle size={14} /> {errorRes[orden.id]}
                                </div>
                              )}

                              <div className="space-y-3">
                                {piezas.map(p => (
                                  <div key={p.id} className="bg-gray-50 rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <div>
                                        <p className="font-semibold text-gray-800 text-sm">{p.items?.nombre}</p>
                                        {p.asignado_a && <p className="text-xs text-gray-400">{p.asignado_a}</p>}
                                      </div>
                                      <span className="bg-gray-200 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                                        Plan: {p.cantidad_planeada}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                      <div>
                                        <label className="block text-xs font-semibold text-green-600 mb-1">✓ Conformes</label>
                                        <input type="number" min="0" step="1"
                                          value={getRes(orden.id, p.id, 'conforme')}
                                          onChange={e => setRes(orden.id, p.id, 'conforme', e.target.value)}
                                          placeholder="0"
                                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-semibold text-red-500 mb-1">✗ NC</label>
                                        <input type="number" min="0" step="1"
                                          value={getRes(orden.id, p.id, 'nc')}
                                          onChange={e => setRes(orden.id, p.id, 'nc', e.target.value)}
                                          placeholder="0"
                                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-red-300"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Motivo NC</label>
                                        <input type="text"
                                          value={getRes(orden.id, p.id, 'motivo')}
                                          onChange={e => setRes(orden.id, p.id, 'motivo', e.target.value)}
                                          placeholder="Ej: rotura"
                                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <button onClick={() => registrarCierre(orden)} disabled={guardandoRes === orden.id}
                                className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2">
                                <CheckCircle2 size={16} />
                                {guardandoRes === orden.id ? 'Guardando…' : 'Registrar recogida y cerrar orden'}
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* ══ ORDEN COMPLETADA ══ */}
                    {completada && (() => {
                      const modo    = vistaOrden[orden.id] || 'pieza'
                      const setModo = v => setVistaOrden(prev => ({ ...prev, [orden.id]: v }))
                      const porMoldeador = {}
                      piezas.forEach(p => {
                        const k = p.asignado_a?.trim() || 'Sin asignar'
                        if (!porMoldeador[k]) porMoldeador[k] = []
                        porMoldeador[k].push(p)
                      })
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold text-gray-400 uppercase">Resultados</p>
                            <div className="flex rounded-xl overflow-hidden border border-gray-200 text-xs font-semibold">
                              {[['pieza','Por pieza'],['moldeador','Por moldeador']].map(([val, lab]) => (
                                <button key={val} type="button" onClick={() => setModo(val)}
                                  className={`px-3 py-1.5 transition-colors ${modo === val ? 'bg-feisen-azul text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                  {lab}
                                </button>
                              ))}
                            </div>
                          </div>

                          {modo === 'pieza' && (
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-100 text-xs text-gray-500 font-bold uppercase">
                                    <th className="text-left px-3 py-2.5">Pieza</th>
                                    <th className="text-left px-3 py-2.5">Moldeador</th>
                                    <th className="text-center px-3 py-2.5">Plan.</th>
                                    <th className="text-center px-3 py-2.5">✓ Conf.</th>
                                    <th className="text-center px-3 py-2.5">✗ NC</th>
                                    <th className="text-left px-3 py-2.5">Motivo</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {piezas.map((p, i) => {
                                    const rend = p.cantidad_planeada > 0
                                      ? Math.round(((p.cantidad_conforme || 0) / p.cantidad_planeada) * 100) : null
                                    return (
                                      <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                        <td className="px-3 py-2.5 font-medium text-gray-800">{p.items?.nombre}</td>
                                        <td className="px-3 py-2.5 text-xs text-gray-400">{p.asignado_a || '—'}</td>
                                        <td className="px-3 py-2.5 text-center text-gray-600">{p.cantidad_planeada}</td>
                                        <td className="px-3 py-2.5 text-center font-bold text-green-600">
                                          {p.cantidad_conforme ?? '—'}
                                          {rend != null && <span className="ml-1 text-xs font-normal text-gray-400">({rend}%)</span>}
                                        </td>
                                        <td className="px-3 py-2.5 text-center font-bold text-red-500">{p.cantidad_nc ?? '—'}</td>
                                        <td className="px-3 py-2.5 text-xs text-gray-500">{p.motivo_nc || '—'}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-blue-50 font-semibold text-sm border-t border-blue-100">
                                    <td colSpan={2} className="px-3 py-2 text-gray-600">Totales</td>
                                    <td className="px-3 py-2 text-center">{piezas.reduce((s,p)=>s+Number(p.cantidad_planeada||0),0)}</td>
                                    <td className="px-3 py-2 text-center text-green-600">{piezas.reduce((s,p)=>s+Number(p.cantidad_conforme||0),0)}</td>
                                    <td className="px-3 py-2 text-center text-red-500">{piezas.reduce((s,p)=>s+Number(p.cantidad_nc||0),0)}</td>
                                    <td />
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}

                          {modo === 'moldeador' && (
                            <div className="space-y-3">
                              {Object.entries(porMoldeador).map(([mol, mPiezas]) => {
                                const totPlan = mPiezas.reduce((s,p)=>s+Number(p.cantidad_planeada||0),0)
                                const totConf = mPiezas.reduce((s,p)=>s+Number(p.cantidad_conforme||0),0)
                                const totNC   = mPiezas.reduce((s,p)=>s+Number(p.cantidad_nc||0),0)
                                const rend    = totPlan > 0 ? Math.round((totConf/totPlan)*100) : null
                                return (
                                  <div key={mol} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-3 bg-feisen-azul/5 border-b border-gray-100">
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-feisen-azul text-white text-xs font-bold flex items-center justify-center shrink-0">
                                          {mol === 'Sin asignar' ? '?' : mol.charAt(0).toUpperCase()}
                                        </div>
                                        <p className={`text-sm font-bold ${mol==='Sin asignar'?'text-gray-400 italic':'text-gray-800'}`}>{mol}</p>
                                      </div>
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="font-bold text-green-600">{totConf} conf.</span>
                                        <span className="font-bold text-red-500">{totNC} NC</span>
                                        {rend != null && (
                                          <span className={`font-bold px-2 py-0.5 rounded-full ${rend>=80?'bg-green-100 text-green-700':rend>=60?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-600'}`}>
                                            {rend}%
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <table className="w-full text-sm">
                                      <tbody className="divide-y divide-gray-50">
                                        {mPiezas.map(p => (
                                          <tr key={p.id} className="hover:bg-gray-50/50">
                                            <td className="px-4 py-2.5 font-medium text-gray-800">{p.items?.nombre}</td>
                                            <td className="px-3 py-2.5 text-center text-gray-400 text-xs">Plan: {p.cantidad_planeada}</td>
                                            <td className="px-3 py-2.5 text-center font-bold text-green-600">{p.cantidad_conforme ?? '—'}</td>
                                            <td className="px-3 py-2.5 text-center font-bold text-red-500">{p.cantidad_nc ?? '—'}</td>
                                            <td className="px-3 py-2.5 text-xs text-gray-400">{p.motivo_nc || ''}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
