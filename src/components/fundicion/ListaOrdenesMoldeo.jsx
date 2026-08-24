import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { ClipboardList, ChevronDown, ChevronUp, Search, PlusCircle, CheckCircle2, AlertTriangle } from 'lucide-react'

function numOrden(n) {
  return `ORD-MOL-${String(n).padStart(4, '0')}`
}

function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
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

  // resultados[orden_id][pieza_id] = { conforme, nc, motivo }
  const [resultados,   setResultados]   = useState({})
  const [guardandoRes, setGuardandoRes] = useState(null)
  const [errorRes,     setErrorRes]     = useState({})
  const [vistaOrden,   setVistaOrden]   = useState({})   // { orden_id: 'pieza' | 'moldeador' }

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
            items(id, nombre, precio_costo)
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

  const filtradas = ordenes.filter(o => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return true
    return (
      numOrden(o.numero).toLowerCase().includes(q) ||
      fmtFecha(o.fecha).includes(q) ||
      (o.estado || '').includes(q) ||
      (o.ordenes_moldeo_piezas || []).some(p => p.items?.nombre?.toLowerCase().includes(q)) ||
      (o.ordenes_moldeo_maquinas || []).some(m => m.maquinas_fundicion?.nombre?.toLowerCase().includes(q))
    )
  })

  function toggle(id) {
    setExpandido(prev => prev === id ? null : id)
  }

  function setRes(ordenId, piezaId, campo, val) {
    setResultados(prev => ({
      ...prev,
      [ordenId]: {
        ...(prev[ordenId] || {}),
        [piezaId]: {
          ...(prev[ordenId]?.[piezaId] || {}),
          [campo]: val,
        },
      },
    }))
  }

  function getRes(ordenId, piezaId, campo, fallback = '') {
    return resultados[ordenId]?.[piezaId]?.[campo] ?? fallback
  }

  async function registrarResultados(orden) {
    setErrorRes(prev => ({ ...prev, [orden.id]: '' }))
    const piezas = orden.ordenes_moldeo_piezas || []

    // Validar que cada pieza tenga al menos conforme o NC
    for (const p of piezas) {
      const conf = Number(getRes(orden.id, p.id, 'conforme') || 0)
      const nc   = Number(getRes(orden.id, p.id, 'nc') || 0)
      if (conf < 0 || nc < 0) {
        setErrorRes(prev => ({ ...prev, [orden.id]: 'Las cantidades no pueden ser negativas.' }))
        return
      }
      const planeada = Number(p.cantidad_planeada)
      if (conf + nc > planeada + planeada * 0.2) {
        // Advertencia: más del 120% de lo planeado (permitimos algo de holgura)
        setErrorRes(prev => ({ ...prev, [orden.id]: `Verifica ${p.items?.nombre}: conformes + NC superan lo planeado (${planeada}).` }))
        return
      }
    }

    setGuardandoRes(orden.id)
    try {
      // 1. Actualizar ordenes_moldeo_piezas con resultados
      for (const p of piezas) {
        const conf   = Number(getRes(orden.id, p.id, 'conforme') || 0)
        const nc     = Number(getRes(orden.id, p.id, 'nc') || 0)
        const motivo = getRes(orden.id, p.id, 'motivo') || null
        const { error: err } = await supabase.from('ordenes_moldeo_piezas')
          .update({ cantidad_conforme: conf, cantidad_nc: nc, motivo_nc: motivo || null })
          .eq('id', p.id)
        if (err) throw err
      }

      // 2. Crear movimientos de entrada por piezas conformes
      const piezasConformes = piezas.filter(p => {
        const conf = Number(getRes(orden.id, p.id, 'conforme') || 0)
        return conf > 0 && fundBodegaId
      })

      if (piezasConformes.length > 0 && fundBodegaId) {
        const numero = await generarNumMovimiento(perfil)
        const movPayloads = piezasConformes.map(p => ({
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
        const { error: errMov } = await supabase.from('movimientos').insert(movPayloads)
        if (errMov) throw errMov
      }

      // 3. Marcar orden como completada
      const { error: errOrd } = await supabase.from('ordenes_moldeo')
        .update({ estado: 'completado' }).eq('id', orden.id)
      if (errOrd) throw errOrd

      // Recargar
      await cargar()
      // Mantener expandido para ver resultados
      setExpandido(orden.id)
    } catch (e) {
      setErrorRes(prev => ({ ...prev, [orden.id]: 'Error al guardar: ' + e.message }))
    } finally {
      setGuardandoRes(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2.5 rounded-xl">
            <ClipboardList size={22} className="text-feisen-azul" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Órdenes de Moldeo</h1>
            <p className="text-xs text-gray-500">
              {ordenes.filter(o => o.estado === 'pendiente').length} pendientes · {ordenes.filter(o => o.estado === 'completado').length} completadas
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/moldeo/nueva')}
          className="flex items-center gap-2 bg-feisen-rojo text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <PlusCircle size={16} /> Nueva orden
        </button>
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por N°, fecha, pieza, máquina…"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
        />
      </div>

      {/* Lista */}
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
            const piezas = orden.ordenes_moldeo_piezas || []
            const maquinas = orden.ordenes_moldeo_maquinas || []

            return (
              <div key={orden.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

                {/* Fila resumen */}
                <button type="button" onClick={() => toggle(orden.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="bg-blue-100 text-feisen-azul font-bold text-sm px-3 py-1 rounded-lg font-mono shrink-0">
                      {numOrden(orden.numero)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{fmtFecha(orden.fecha)}</p>
                      <p className="text-xs text-gray-500">
                        {piezas.length} piezas · {orden.tipo === 'maquinas' ? 'Por máquinas' : 'Libre'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      completada
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {completada ? '✓ Completada' : '⏳ Pendiente'}
                    </span>
                    {expandido === orden.id
                      ? <ChevronUp size={16} className="text-gray-400" />
                      : <ChevronDown size={16} className="text-gray-400" />
                    }
                  </div>
                </button>

                {/* Detalle expandido */}
                {expandido === orden.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-5 space-y-5">

                    {/* Máquinas (si tipo = 'maquinas') */}
                    {maquinas.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-2">Máquinas planeadas</p>
                        <div className="grid grid-cols-2 gap-2">
                          {maquinas.map((m, i) => (
                            <div key={i} className="flex justify-between items-center bg-white rounded-lg px-3 py-2 text-sm border border-gray-100">
                              <span className="text-gray-700">{m.maquinas_fundicion?.nombre}</span>
                              <span className="font-bold text-feisen-azul">{m.cantidad_maquinas}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Toggle vista */}
                    {(() => {
                      const modo = vistaOrden[orden.id] || 'pieza'
                      const setModo = v => setVistaOrden(prev => ({ ...prev, [orden.id]: v }))

                      // Agrupar por moldeador
                      const porMoldeador = {}
                      piezas.forEach(p => {
                        const k = p.asignado_a?.trim() || 'Sin asignar'
                        if (!porMoldeador[k]) porMoldeador[k] = []
                        porMoldeador[k].push(p)
                      })

                      return (
                        <div>
                          {/* Selector de vista */}
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold text-gray-400 uppercase">Piezas</p>
                            <div className="flex rounded-xl overflow-hidden border border-gray-200 text-xs font-semibold">
                              {[['pieza','Por pieza'],['moldeador','Por moldeador']].map(([val, lab]) => (
                                <button key={val} type="button" onClick={() => setModo(val)}
                                  className={`px-3 py-1.5 transition-colors ${
                                    modo === val
                                      ? 'bg-feisen-azul text-white'
                                      : 'bg-white text-gray-500 hover:bg-gray-50'
                                  }`}>
                                  {lab}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* ── VISTA POR PIEZA ── */}
                          {modo === 'pieza' && completada && (
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-100 text-xs text-gray-500 font-semibold uppercase">
                                    <th className="text-left px-3 py-2.5">Pieza</th>
                                    <th className="text-left px-3 py-2.5">Moldeador</th>
                                    <th className="text-center px-3 py-2.5">Plan.</th>
                                    <th className="text-center px-3 py-2.5">✓ Conf.</th>
                                    <th className="text-center px-3 py-2.5">✗ NC</th>
                                    <th className="text-left px-3 py-2.5">Motivo NC</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {piezas.map((p, i) => {
                                    const rend = p.cantidad_planeada > 0
                                      ? Math.round(((p.cantidad_conforme || 0) / p.cantidad_planeada) * 100) : null
                                    return (
                                      <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                        <td className="px-3 py-2.5 font-medium text-gray-800">{p.items?.nombre}</td>
                                        <td className="px-3 py-2.5 text-gray-500 text-xs">{p.asignado_a || '—'}</td>
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
                                    <td className="px-3 py-2 text-center">{piezas.reduce((s,p) => s + Number(p.cantidad_planeada||0), 0)}</td>
                                    <td className="px-3 py-2 text-center text-green-600">{piezas.reduce((s,p) => s + Number(p.cantidad_conforme||0), 0)}</td>
                                    <td className="px-3 py-2 text-center text-red-500">{piezas.reduce((s,p) => s + Number(p.cantidad_nc||0), 0)}</td>
                                    <td />
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}

                          {/* ── VISTA POR PIEZA — pendiente (inputs) ── */}
                          {modo === 'pieza' && !completada && (
                            <>
                              {errorRes[orden.id] && (
                                <div className="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-2">
                                  <AlertTriangle size={15} /> {errorRes[orden.id]}
                                </div>
                              )}
                              <div className="space-y-3">
                                {piezas.map(p => (
                                  <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-3">
                                      <div>
                                        <p className="font-semibold text-gray-800 text-sm">{p.items?.nombre}</p>
                                        {p.asignado_a && <p className="text-xs text-gray-400">{p.asignado_a}</p>}
                                      </div>
                                      <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2.5 py-1 rounded-full">Plan: {p.cantidad_planeada}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                      <div>
                                        <label className="block text-xs font-semibold text-green-600 mb-1">✓ Conformes</label>
                                        <input type="number" min="0" step="1" value={getRes(orden.id, p.id, 'conforme')}
                                          onChange={e => setRes(orden.id, p.id, 'conforme', e.target.value)} placeholder="0"
                                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400" />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-semibold text-red-500 mb-1">✗ NC</label>
                                        <input type="number" min="0" step="1" value={getRes(orden.id, p.id, 'nc')}
                                          onChange={e => setRes(orden.id, p.id, 'nc', e.target.value)} placeholder="0"
                                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-red-300" />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Motivo NC</label>
                                        <input type="text" value={getRes(orden.id, p.id, 'motivo')}
                                          onChange={e => setRes(orden.id, p.id, 'motivo', e.target.value)} placeholder="Ej: rotura"
                                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <button onClick={() => registrarResultados(orden)} disabled={guardandoRes === orden.id}
                                className="mt-4 w-full bg-feisen-azul text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2">
                                <CheckCircle2 size={16} />
                                {guardandoRes === orden.id ? 'Guardando…' : 'Registrar resultados y completar orden'}
                              </button>
                              <p className="text-xs text-gray-400 text-center mt-1">Las piezas conformes ingresarán automáticamente al inventario de FUNDICIÓN.</p>
                            </>
                          )}

                          {/* ── VISTA POR MOLDEADOR — completada ── */}
                          {modo === 'moldeador' && completada && (
                            <div className="space-y-4">
                              {Object.entries(porMoldeador).map(([mol, mPiezas]) => {
                                const totPlan  = mPiezas.reduce((s,p) => s + Number(p.cantidad_planeada||0), 0)
                                const totConf  = mPiezas.reduce((s,p) => s + Number(p.cantidad_conforme||0), 0)
                                const totNC    = mPiezas.reduce((s,p) => s + Number(p.cantidad_nc||0), 0)
                                const rendGlob = totPlan > 0 ? Math.round((totConf / totPlan) * 100) : null
                                return (
                                  <div key={mol} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    {/* Header moldeador */}
                                    <div className="flex items-center justify-between px-4 py-3 bg-feisen-azul/5 border-b border-gray-100">
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-feisen-azul text-white text-xs font-bold flex items-center justify-center shrink-0">
                                          {mol === 'Sin asignar' ? '?' : mol.charAt(0).toUpperCase()}
                                        </div>
                                        <p className={`text-sm font-bold ${mol === 'Sin asignar' ? 'text-gray-400 italic' : 'text-gray-800'}`}>{mol}</p>
                                      </div>
                                      <div className="flex items-center gap-3 text-xs">
                                        <span className="text-gray-500">{mPiezas.length} piezas</span>
                                        <span className="font-bold text-green-600">{totConf} conf.</span>
                                        <span className="font-bold text-red-500">{totNC} NC</span>
                                        {rendGlob != null && (
                                          <span className={`font-bold px-2 py-0.5 rounded-full ${rendGlob >= 80 ? 'bg-green-100 text-green-700' : rendGlob >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                                            {rendGlob}%
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {/* Piezas del moldeador */}
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-xs text-gray-400 font-semibold uppercase border-b border-gray-50">
                                          <th className="text-left px-4 py-2">Pieza</th>
                                          <th className="text-center px-3 py-2 w-16">Plan.</th>
                                          <th className="text-center px-3 py-2 w-20">✓ Conf.</th>
                                          <th className="text-center px-3 py-2 w-16">✗ NC</th>
                                          <th className="text-left px-3 py-2">Motivo NC</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-50">
                                        {mPiezas.map(p => {
                                          const rend = p.cantidad_planeada > 0
                                            ? Math.round(((p.cantidad_conforme||0)/p.cantidad_planeada)*100) : null
                                          return (
                                            <tr key={p.id} className="hover:bg-gray-50/50">
                                              <td className="px-4 py-2.5 font-medium text-gray-800">{p.items?.nombre}</td>
                                              <td className="px-3 py-2.5 text-center text-gray-500">{p.cantidad_planeada}</td>
                                              <td className="px-3 py-2.5 text-center font-bold text-green-600">
                                                {p.cantidad_conforme ?? '—'}
                                                {rend != null && <span className="ml-1 text-xs font-normal text-gray-300">({rend}%)</span>}
                                              </td>
                                              <td className="px-3 py-2.5 text-center font-bold text-red-500">{p.cantidad_nc ?? '—'}</td>
                                              <td className="px-3 py-2.5 text-xs text-gray-400">{p.motivo_nc || '—'}</td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* ── VISTA POR MOLDEADOR — pendiente (inputs agrupados) ── */}
                          {modo === 'moldeador' && !completada && (
                            <>
                              {errorRes[orden.id] && (
                                <div className="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-2">
                                  <AlertTriangle size={15} /> {errorRes[orden.id]}
                                </div>
                              )}
                              <div className="space-y-4">
                                {Object.entries(porMoldeador).map(([mol, mPiezas]) => (
                                  <div key={mol} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    {/* Header moldeador */}
                                    <div className="flex items-center gap-2 px-4 py-3 bg-feisen-azul/5 border-b border-gray-100">
                                      <div className="w-7 h-7 rounded-full bg-feisen-azul text-white text-xs font-bold flex items-center justify-center shrink-0">
                                        {mol === 'Sin asignar' ? '?' : mol.charAt(0).toUpperCase()}
                                      </div>
                                      <p className={`text-sm font-bold ${mol === 'Sin asignar' ? 'text-gray-400 italic' : 'text-gray-800'}`}>{mol}</p>
                                      <span className="ml-auto text-xs text-gray-400">{mPiezas.length} piezas</span>
                                    </div>
                                    {/* Cards de piezas */}
                                    <div className="p-3 space-y-2">
                                      {mPiezas.map(p => (
                                        <div key={p.id} className="border border-gray-100 rounded-xl p-3">
                                          <div className="flex items-center justify-between mb-2">
                                            <p className="font-semibold text-gray-800 text-sm">{p.items?.nombre}</p>
                                            <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">Plan: {p.cantidad_planeada}</span>
                                          </div>
                                          <div className="grid grid-cols-3 gap-2">
                                            <div>
                                              <label className="block text-xs font-semibold text-green-600 mb-1">✓ Conf.</label>
                                              <input type="number" min="0" step="1" value={getRes(orden.id, p.id, 'conforme')}
                                                onChange={e => setRes(orden.id, p.id, 'conforme', e.target.value)} placeholder="0"
                                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400" />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-semibold text-red-500 mb-1">✗ NC</label>
                                              <input type="number" min="0" step="1" value={getRes(orden.id, p.id, 'nc')}
                                                onChange={e => setRes(orden.id, p.id, 'nc', e.target.value)} placeholder="0"
                                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-red-300" />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-semibold text-gray-500 mb-1">Motivo NC</label>
                                              <input type="text" value={getRes(orden.id, p.id, 'motivo')}
                                                onChange={e => setRes(orden.id, p.id, 'motivo', e.target.value)} placeholder="Ej: rotura"
                                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <button onClick={() => registrarResultados(orden)} disabled={guardandoRes === orden.id}
                                className="mt-4 w-full bg-feisen-azul text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2">
                                <CheckCircle2 size={16} />
                                {guardandoRes === orden.id ? 'Guardando…' : 'Registrar resultados y completar orden'}
                              </button>
                              <p className="text-xs text-gray-400 text-center mt-1">Las piezas conformes ingresarán automáticamente al inventario de FUNDICIÓN.</p>
                            </>
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
