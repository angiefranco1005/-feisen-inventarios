import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  ClipboardList, ChevronDown, ChevronUp, Search, PlusCircle,
  AlertTriangle, TrendingUp, Plus, Calendar,
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

// Barra de progreso
function BarraProgreso({ pct }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-400' : 'bg-feisen-azul'
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

export default function ListaOrdenesMoldeo() {
  const navigate  = useNavigate()
  const { perfil } = useAuth()

  const [ordenes,      setOrdenes]      = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [expandido,    setExpandido]    = useState(null)
  const [busqueda,     setBusqueda]     = useState('')
  const [fundBodegaId, setFundBodegaId] = useState(null)

  // { [ordenId]: { [piezaId]: { total, dias:[{fecha,cant}] } } }
  const [avancesData,  setAvancesData]  = useState({})
  // { [ordenId]: { [itemId]: stock } }
  const [stockData,    setStockData]    = useState({})

  // Panel avance diario
  const [panelAvance,  setPanelAvance]  = useState({})
  const [avanceHoy,    setAvanceHoy]    = useState({})  // { [ordenId]: { [piezaId]: string } }
  const [fechaAvance,  setFechaAvance]  = useState({})
  const [guardandoAv,  setGuardandoAv]  = useState(null)
  const [errorAv,      setErrorAv]      = useState({})

  // Vista dentro de la orden abierta: 'pieza' | 'moldeador'
  const [vistaAbierta, setVistaAbierta] = useState({})
  // Vista de orden completada: 'pieza' | 'moldeador'
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

  // ── Inputs avance diario ───────────────────────────────────────────────────
  function setAv(ordenId, piezaId, val) {
    setAvanceHoy(prev => ({
      ...prev, [ordenId]: { ...(prev[ordenId] || {}), [piezaId]: val }
    }))
  }
  function getAv(ordenId, piezaId) { return avanceHoy[ordenId]?.[piezaId] ?? '' }

  async function guardarAvance(orden) {
    setErrorAv(prev => ({ ...prev, [orden.id]: '' }))
    const fecha  = fechaAvance[orden.id] || hoyCol()
    const piezas = orden.ordenes_moldeo_piezas || []
    const rows   = piezas
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
      setAvanceHoy(prev => ({ ...prev, [orden.id]: {} }))
      setPanelAvance(prev => ({ ...prev, [orden.id]: false }))
      await cargarAvancesYStock(orden, fundBodegaId)
    } catch (e) {
      setErrorAv(prev => ({ ...prev, [orden.id]: 'Error: ' + e.message }))
    } finally {
      setGuardandoAv(null)
    }
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

            const totalPlaneado  = piezas.reduce((s, p) => s + Number(p.cantidad_planeada || 0), 0)
            const totalMoldeado  = piezas.reduce((s, p) => s + (avOrden[p.id]?.total || 0), 0)
            const pctAvance      = totalPlaneado > 0 ? Math.round((totalMoldeado / totalPlaneado) * 100) : 0
            const hayStockAlerta = !completada && piezas.some(p => {
              const stock     = stOrden[p.item_id] ?? null
              const pendiente = Number(p.cantidad_planeada || 0) - (avOrden[p.id]?.total || 0)
              return stock !== null && stock < pendiente && pendiente > 0
            })

            // ── Datos por moldeador (para vista moldeador) ────────────────
            const porMoldeador = {}
            piezas.forEach(p => {
              const k    = p.asignado_a?.trim() || 'Sin asignar'
              const peso = Number(p.items?.peso_unitario || 0)
              if (!porMoldeador[k]) porMoldeador[k] = { piezas: [], plan: 0, moldeado: 0, kg: 0 }
              const av = avOrden[p.id]?.total || 0
              porMoldeador[k].piezas.push({ ...p, avance: av, peso })
              porMoldeador[k].plan     += Number(p.cantidad_planeada || 0)
              porMoldeador[k].moldeado += av
              porMoldeador[k].kg       += av * peso
            })

            // Historial diario global (todas las piezas, agrupado por fecha)
            const historialPorFecha = {}
            piezas.forEach(p => {
              const nombre = p.items?.nombre || '—'
              const mol    = p.asignado_a?.trim() || 'Sin asignar'
              const peso   = Number(p.items?.peso_unitario || 0)
              ;(avOrden[p.id]?.dias || []).forEach(d => {
                if (!historialPorFecha[d.fecha]) historialPorFecha[d.fecha] = []
                historialPorFecha[d.fecha].push({ pieza: nombre, moldeador: mol, cantidad: d.cantidad, kg: d.cantidad * peso })
              })
            })
            const fechasDesc = Object.keys(historialPorFecha).sort((a, b) => b.localeCompare(a))

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
                    {hayStockAlerta && <AlertTriangle size={15} className="text-orange-400" />}
                    {!completada && avancesData[orden.id] && totalMoldeado > 0 && (
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        pctAvance >= 80 ? 'bg-green-100 text-green-700'
                        : pctAvance >= 40 ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-blue-100 text-feisen-azul'
                      }`}>
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
                        {/* Toggle vista */}
                        <div className="flex items-center justify-between">
                          <div className="flex rounded-xl overflow-hidden border border-gray-200 text-xs font-semibold">
                            {[['pieza','Por pieza'],['moldeador','Por moldeador'],['historial','Historial']].map(([val, lab]) => (
                              <button key={val} type="button"
                                onClick={() => setVistaAbierta(prev => ({ ...prev, [orden.id]: val }))}
                                className={`px-3 py-1.5 transition-colors ${
                                  (vistaAbierta[orden.id] || 'pieza') === val
                                    ? 'bg-feisen-azul text-white'
                                    : 'bg-white text-gray-500 hover:bg-gray-50'
                                }`}>
                                {lab}
                              </button>
                            ))}
                          </div>
                          {totalMoldeado > 0 && (
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                              pctAvance >= 80 ? 'bg-green-100 text-green-700'
                              : pctAvance >= 40 ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-blue-50 text-feisen-azul'
                            }`}>
                              {pctAvance}% avance general
                            </span>
                          )}
                        </div>

                        {/* Vista: Por pieza */}
                        {(vistaAbierta[orden.id] || 'pieza') === 'pieza' && (
                          <div className="overflow-x-auto rounded-xl border border-gray-200">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-100 text-xs text-gray-500 font-bold uppercase">
                                  <th className="text-left px-3 py-2.5">Pieza</th>
                                  <th className="text-left px-3 py-2.5">Moldeador</th>
                                  <th className="text-center px-2 py-2.5">Plan.</th>
                                  <th className="text-center px-2 py-2.5">Moldeadas</th>
                                  <th className="text-center px-2 py-2.5">Kg</th>
                                  <th className="text-center px-2 py-2.5">Pendiente</th>
                                  <th className="text-center px-2 py-2.5">Stock</th>
                                  <th className="px-2 py-2.5 w-24">%</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {piezas.map(p => {
                                  const av        = avOrden[p.id]?.total || 0
                                  const plan      = Number(p.cantidad_planeada || 0)
                                  const pendiente = Math.max(0, plan - av)
                                  const pct       = plan > 0 ? Math.round((av / plan) * 100) : 0
                                  const stock     = stOrden[p.item_id] ?? null
                                  const alerta    = stock !== null && stock < pendiente && pendiente > 0
                                  const peso      = Number(p.items?.peso_unitario || 0)
                                  const kgAv      = av * peso
                                  return (
                                    <tr key={p.id} className={alerta ? 'bg-orange-50' : 'bg-white hover:bg-gray-50/40'}>
                                      <td className="px-3 py-3 font-medium text-gray-800 text-sm">{p.items?.nombre}</td>
                                      <td className="px-3 py-3 text-xs text-gray-500">{p.asignado_a || '—'}</td>
                                      <td className="px-2 py-3 text-center text-gray-500">{plan}</td>
                                      <td className="px-2 py-3 text-center font-bold text-feisen-azul">{av || '—'}</td>
                                      <td className="px-2 py-3 text-center text-xs font-semibold text-gray-500">
                                        {av > 0 && peso > 0 ? `${kgAv.toLocaleString('es-CO',{maximumFractionDigits:1})}` : '—'}
                                      </td>
                                      <td className="px-2 py-3 text-center">
                                        <span className={`font-bold text-sm ${pendiente === 0 ? 'text-green-600' : 'text-gray-700'}`}>
                                          {pendiente === 0 ? '✓' : pendiente}
                                        </span>
                                      </td>
                                      <td className="px-2 py-3 text-center">
                                        {stock !== null ? (
                                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${alerta ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                                            {stock}{alerta ? ' ⚠' : ''}
                                          </span>
                                        ) : <span className="text-gray-300">—</span>}
                                      </td>
                                      <td className="px-2 py-3">
                                        <div className="flex items-center gap-1.5">
                                          <BarraProgreso pct={pct} />
                                          <span className="text-xs text-gray-400 w-8 text-right shrink-0">{pct}%</span>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Vista: Por moldeador */}
                        {(vistaAbierta[orden.id] || 'pieza') === 'moldeador' && (
                          <div className="space-y-3">
                            {Object.entries(porMoldeador).map(([mol, d]) => {
                              const pct = d.plan > 0 ? Math.round((d.moldeado / d.plan) * 100) : 0
                              return (
                                <div key={mol} className="bg-white rounded-xl border border-gray-200 p-4">
                                  <div className="flex items-center gap-3 mb-3">
                                    <div className="w-9 h-9 rounded-full bg-feisen-azul text-white text-sm font-bold flex items-center justify-center shrink-0">
                                      {mol === 'Sin asignar' ? '?' : mol.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm font-bold ${mol === 'Sin asignar' ? 'text-gray-400 italic' : 'text-gray-800'}`}>{mol}</p>
                                      <p className="text-xs text-gray-400">{d.piezas.length} pieza{d.piezas.length !== 1 ? 's' : ''} asignada{d.piezas.length !== 1 ? 's' : ''}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="text-sm font-bold text-feisen-azul">{d.moldeado} <span className="text-xs font-normal text-gray-400">/ {d.plan}</span></p>
                                      {d.kg > 0 && <p className="text-xs text-gray-400 font-medium">{d.kg.toLocaleString('es-CO',{maximumFractionDigits:1})} kg</p>}
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                        pct >= 80 ? 'bg-green-100 text-green-700'
                                        : pct >= 40 ? 'bg-yellow-100 text-yellow-700'
                                        : 'bg-gray-100 text-gray-500'
                                      }`}>{pct}%</span>
                                    </div>
                                  </div>
                                  <BarraProgreso pct={pct} />
                                  {/* Mini tabla de piezas del moldeador */}
                                  <div className="mt-3 divide-y divide-gray-50">
                                    {d.piezas.map(p => {
                                      const pPct = p.cantidad_planeada > 0 ? Math.round((p.avance / p.cantidad_planeada) * 100) : 0
                                      const pKg  = p.avance * Number(p.items?.peso_unitario || 0)
                                      return (
                                        <div key={p.id} className="flex items-center justify-between py-2">
                                          <span className="text-xs text-gray-600 truncate flex-1">{p.items?.nombre}</span>
                                          <div className="flex items-center gap-3 ml-2 shrink-0">
                                            <span className="text-xs text-gray-400">{p.avance}/{p.cantidad_planeada}</span>
                                            {pKg > 0 && <span className="text-xs text-gray-400">{pKg.toLocaleString('es-CO',{maximumFractionDigits:1})} kg</span>}
                                            <div className="w-16">
                                              <BarraProgreso pct={pPct} />
                                            </div>
                                            <span className="text-xs font-semibold text-gray-500 w-8 text-right">{pPct}%</span>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Vista: Historial diario */}
                        {(vistaAbierta[orden.id] || 'pieza') === 'historial' && (
                          <div>
                            {fechasDesc.length === 0 ? (
                              <p className="text-center text-gray-400 py-8 text-sm">Sin avances registrados aún.</p>
                            ) : (
                              <div className="space-y-3">
                                {fechasDesc.map(fecha => {
                                  const entradas = historialPorFecha[fecha]
                                  const totalDia = entradas.reduce((s, e) => s + e.cantidad, 0)
                                  return (
                                    <div key={fecha} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                      <div className="flex items-center justify-between px-4 py-2.5 bg-feisen-azul/5 border-b border-gray-100">
                                        <div className="flex items-center gap-2">
                                          <Calendar size={13} className="text-feisen-azul" />
                                          <span className="text-sm font-bold text-feisen-azul">{fmtFecha(fecha)}</span>
                                        </div>
                                        <span className="text-xs font-semibold text-gray-500">{totalDia} moldeadas</span>
                                      </div>
                                      <table className="w-full text-sm">
                                        <tbody className="divide-y divide-gray-50">
                                          {entradas.map((e, i) => (
                                            <tr key={i} className="hover:bg-gray-50/40">
                                              <td className="px-4 py-2 text-gray-700 font-medium">{e.pieza}</td>
                                              <td className="px-3 py-2 text-xs text-gray-400">{e.moldeador}</td>
                                              <td className="px-3 py-2 text-right font-bold text-feisen-azul">{e.cantidad}</td>
                                              <td className="px-3 py-2 text-right text-xs text-gray-400">
                                                {e.kg > 0 ? `${e.kg.toLocaleString('es-CO',{maximumFractionDigits:1})} kg` : '—'}
                                              </td>
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
                        )}

                        {/* ── Panel: Registrar avance del día ── */}
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
                              <div className="flex items-center gap-3">
                                <label className="text-xs font-semibold text-gray-600 shrink-0">Fecha</label>
                                <input type="date"
                                  value={fechaAvance[orden.id] || hoyCol()}
                                  onChange={e => setFechaAvance(prev => ({ ...prev, [orden.id]: e.target.value }))}
                                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                                />
                              </div>

                              {errorAv[orden.id] && (
                                <div className="flex items-center gap-2 bg-red-50 text-red-600 text-xs font-medium rounded-lg px-3 py-2">
                                  <AlertTriangle size={13} /> {errorAv[orden.id]}
                                </div>
                              )}

                              <div className="space-y-2">
                                {piezas.map(p => {
                                  const av        = avOrden[p.id]?.total || 0
                                  const pendiente = Math.max(0, Number(p.cantidad_planeada || 0) - av)
                                  return (
                                    <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{p.items?.nombre}</p>
                                        <p className="text-xs text-gray-400">
                                          {p.asignado_a && <span className="mr-2">{p.asignado_a}</span>}
                                          Pendiente: <span className="font-bold text-gray-600">{pendiente}</span>
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-xs text-gray-400">Hoy:</span>
                                        <input type="number" min="0" step="1"
                                          value={getAv(orden.id, p.id)}
                                          onChange={e => setAv(orden.id, p.id, e.target.value)}
                                          placeholder="0"
                                          className="w-20 border-2 border-gray-200 rounded-xl px-2 py-1.5 text-center text-sm font-bold focus:outline-none focus:border-feisen-azul"
                                        />
                                        {(() => {
                                          const cant = Number(getAv(orden.id, p.id)) || 0
                                          const peso = Number(p.items?.peso_unitario || 0)
                                          return cant > 0 && peso > 0
                                            ? <span className="text-xs text-feisen-azul font-semibold">{(cant * peso).toLocaleString('es-CO',{maximumFractionDigits:1})} kg</span>
                                            : null
                                        })()}
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
                      </>
                    )}

                    {/* ══ ORDEN COMPLETADA ══ */}
                    {completada && (() => {
                      const modo    = vistaOrden[orden.id] || 'pieza'
                      const setModo = v => setVistaOrden(prev => ({ ...prev, [orden.id]: v }))
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
                              {Object.entries(porMoldeador).map(([mol, d]) => {
                                const totConf = d.piezas.reduce((s,p)=>s+Number(p.cantidad_conforme||0),0)
                                const totNC   = d.piezas.reduce((s,p)=>s+Number(p.cantidad_nc||0),0)
                                const rend    = d.plan > 0 ? Math.round((totConf/d.plan)*100) : null
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
                                        {d.piezas.map(p => (
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
