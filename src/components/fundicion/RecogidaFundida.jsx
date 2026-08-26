import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  PackageCheck, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Search, Flame,
} from 'lucide-react'

const HIERRO_COLADO_ITEM_ID = '52546e1a-dd2b-46c6-8857-9895497f228a'

function numOrden(n) { return `ORD-MOL-${String(n).padStart(4, '0')}` }
function numFun(n)   { return `FUN-${String(n).padStart(4, '0')}` }
function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

async function generarNumero(perfil, prefix) {
  const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
  const pre = `${prefix}-${iniciales}-`
  const { data: last } = await supabase
    .from('movimientos').select('numero').like('numero', `${pre}%`)
    .order('numero', { ascending: false }).limit(1).maybeSingle()
  const n = last?.numero ? parseInt(last.numero.replace(pre, ''), 10) || 0 : 0
  return `${pre}${String(n + 1).padStart(4, '0')}`
}

export default function RecogidaFundida() {
  const { perfil } = useAuth()

  const [ordenes,      setOrdenes]      = useState([])
  const [fundidas,     setFundidas]     = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [expandido,    setExpandido]    = useState(null)
  const [busqueda,     setBusqueda]     = useState('')
  const [fundBodegaId, setFundBodegaId] = useState(null)

  // avances por orden: { [ordenId]: { [piezaId]: totalMoldeado } }
  const [avancesRef,   setAvancesRef]   = useState({})

  // inputs por orden: { [ordenId]: { [piezaId]: { conforme, nc, motivo } } }
  const [inputs,       setInputs]       = useState({})
  const [guardando,    setGuardando]    = useState(null)
  const [errores,      setErrores]      = useState({})
  const [exitoOrden,   setExitoOrden]   = useState(null)

  // fundida vinculada por orden: { [ordenId]: fundidaId }
  const [fundidaSel,   setFundidaSel]   = useState({})

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: bods }, { data: ords }, { data: funs }] = await Promise.all([
      supabase.from('bodegas').select('id').ilike('nombre', '%FUNDICIÓN%').single(),
      supabase.from('ordenes_moldeo')
        .select(`
          id, numero, fecha, estado,
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
        .eq('estado', 'pendiente')
        .order('fecha', { ascending: false }),
      supabase.from('fundidas')
        .select('id, numero, fecha, hierro_colado')
        .not('hierro_colado', 'is', null)
        .gt('hierro_colado', 0)
        .order('fecha', { ascending: false })
        .limit(90),
    ])
    setFundBodegaId(bods?.id || null)
    setOrdenes(ords || [])
    setFundidas(funs || [])
    setCargando(false)
  }

  async function cargarAvances(orden) {
    const piezaIds = (orden.ordenes_moldeo_piezas || []).map(p => p.id)
    if (piezaIds.length === 0) return
    const { data } = await supabase
      .from('ordenes_moldeo_avances')
      .select('orden_pieza_id, cantidad_moldeada')
      .in('orden_pieza_id', piezaIds)
    const map = {}
    for (const a of (data || [])) {
      map[a.orden_pieza_id] = (map[a.orden_pieza_id] || 0) + a.cantidad_moldeada
    }
    setAvancesRef(prev => ({ ...prev, [orden.id]: map }))
  }

  async function toggle(orden) {
    if (expandido === orden.id) { setExpandido(null); return }
    setExpandido(orden.id)
    if (!avancesRef[orden.id]) await cargarAvances(orden)
  }

  function setField(ordenId, piezaId, campo, val) {
    setInputs(prev => ({
      ...prev,
      [ordenId]: {
        ...(prev[ordenId] || {}),
        [piezaId]: { ...(prev[ordenId]?.[piezaId] || {}), [campo]: val },
      },
    }))
  }
  function getField(ordenId, piezaId, campo) {
    return inputs[ordenId]?.[piezaId]?.[campo] ?? ''
  }

  // Pre-rellenar conformes con el avance registrado
  function preRellenar(orden) {
    const avOrden = avancesRef[orden.id] || {}
    const nuevos = {}
    for (const p of (orden.ordenes_moldeo_piezas || [])) {
      const av = avOrden[p.id] || 0
      nuevos[p.id] = {
        conforme: av > 0 ? String(av) : '',
        nc:       '',
        motivo:   '',
      }
    }
    setInputs(prev => ({ ...prev, [orden.id]: nuevos }))
  }

  // Calcular kg de piezas buenas para una orden
  function calcKgPiezas(orden) {
    return (orden.ordenes_moldeo_piezas || []).reduce((s, p) => {
      const conf = Number(getField(orden.id, p.id, 'conforme') || 0)
      const peso = Number(p.items?.peso_unitario || 0)
      return s + conf * peso
    }, 0)
  }

  async function guardarRecogida(orden) {
    setErrores(prev => ({ ...prev, [orden.id]: '' }))
    const piezas = orden.ordenes_moldeo_piezas || []

    // Validaciones
    for (const p of piezas) {
      const conf = Number(getField(orden.id, p.id, 'conforme') || 0)
      const nc   = Number(getField(orden.id, p.id, 'nc') || 0)
      if (conf < 0 || nc < 0) {
        setErrores(prev => ({ ...prev, [orden.id]: 'Las cantidades no pueden ser negativas.' }))
        return
      }
    }

    const hayAlgo = piezas.some(p => {
      const conf = Number(getField(orden.id, p.id, 'conforme') || 0)
      const nc   = Number(getField(orden.id, p.id, 'nc') || 0)
      return conf > 0 || nc > 0
    })
    if (!hayAlgo) {
      setErrores(prev => ({ ...prev, [orden.id]: 'Ingresa al menos una cantidad de conformes o NC.' }))
      return
    }

    setGuardando(orden.id)
    try {
      // 1. Actualizar piezas con conformes/NC/motivo
      for (const p of piezas) {
        const conf   = Number(getField(orden.id, p.id, 'conforme') || 0)
        const nc     = Number(getField(orden.id, p.id, 'nc') || 0)
        const motivo = getField(orden.id, p.id, 'motivo') || null
        const { error } = await supabase.from('ordenes_moldeo_piezas')
          .update({ cantidad_conforme: conf, cantidad_nc: nc, motivo_nc: motivo || null })
          .eq('id', p.id)
        if (error) throw error
      }

      // 2. Movimientos de entrada por piezas conformes
      const piezasConformes = piezas.filter(p => Number(getField(orden.id, p.id, 'conforme') || 0) > 0)
      if (piezasConformes.length > 0 && fundBodegaId) {
        const numero = await generarNumero(perfil, 'ENT')
        const { error: errMov } = await supabase.from('movimientos').insert(
          piezasConformes.map(p => ({
            numero,
            tipo:                  'entrada',
            item_id:               p.item_id,
            bodega_destino_id:     fundBodegaId,
            bodega_origen_id:      null,
            cantidad:              Number(getField(orden.id, p.id, 'conforme')),
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
        if (errMov) throw errMov
      }

      // 3. Salida automática de HIERRO COLADO si hay fundida vinculada
      const fundidaId = fundidaSel[orden.id]
      if (fundidaId && fundBodegaId) {
        const fundida = fundidas.find(f => f.id === fundidaId)
        if (fundida?.hierro_colado > 0) {
          const numSal = await generarNumero(perfil, 'SAL')
          const { error: errHC } = await supabase.from('movimientos').insert({
            numero:                numSal,
            tipo:                  'salida',
            item_id:               HIERRO_COLADO_ITEM_ID,
            bodega_origen_id:      fundBodegaId,
            bodega_destino_id:     null,
            cantidad:              fundida.hierro_colado,
            precio_costo_snapshot: 0,
            centro_costo:          'FUNDICIÓN',
            usuario_id:            perfil.id,
            referencia:            `${numOrden(orden.numero)} · ${numFun(fundida.numero)}`,
            fecha_movimiento:      orden.fecha || null,
            motivo:                'Consumo horno fundición',
            foto_remision_url: null, destino: null,
            numero_of: null, serial_motor: null, cliente: null, proveedor: null,
          })
          if (errHC) throw errHC
        }
      }

      // 4. Marcar orden como completada
      const { error: errOrd } = await supabase.from('ordenes_moldeo')
        .update({ estado: 'completado' }).eq('id', orden.id)
      if (errOrd) throw errOrd

      setExitoOrden(orden.id)
      setTimeout(() => {
        setExitoOrden(null)
        setExpandido(null)
        cargar()
      }, 2500)
    } catch (e) {
      setErrores(prev => ({ ...prev, [orden.id]: 'Error al guardar: ' + e.message }))
    } finally {
      setGuardando(null)
    }
  }

  const filtradas = ordenes.filter(o => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return true
    return (
      numOrden(o.numero).toLowerCase().includes(q) ||
      fmtFecha(o.fecha).includes(q) ||
      (o.ordenes_moldeo_piezas || []).some(p => p.items?.nombre?.toLowerCase().includes(q))
    )
  })

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-orange-100 p-2.5 rounded-xl">
          <PackageCheck size={22} className="text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Recogida de Fundida</h1>
          <p className="text-xs text-gray-500">Registra conformes, NC y vincula la fundida para calcular la merma</p>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por N°, fecha o pieza…"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
        />
      </div>

      {cargando ? (
        <p className="text-center text-gray-400 py-16">Cargando…</p>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-16">
          <PackageCheck size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">
            {busqueda ? 'Sin resultados.' : 'No hay órdenes pendientes de recogida.'}
          </p>
          {!busqueda && <p className="text-xs text-gray-300 mt-1">Cuando se creen órdenes de moldeo aparecerán aquí.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map(orden => {
            const piezas  = orden.ordenes_moldeo_piezas || []
            const avOrden = avancesRef[orden.id] || {}
            const totalMoldeado = piezas.reduce((s, p) => s + (avOrden[p.id] || 0), 0)
            const totalPlaneado = piezas.reduce((s, p) => s + Number(p.cantidad_planeada || 0), 0)

            return (
              <div key={orden.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

                {/* Fila resumen */}
                <button type="button" onClick={() => toggle(orden)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="bg-orange-100 text-orange-700 font-bold text-sm px-3 py-1 rounded-lg font-mono shrink-0">
                      {numOrden(orden.numero)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{fmtFecha(orden.fecha)}</p>
                      <p className="text-xs text-gray-500">
                        {piezas.length} piezas · {totalPlaneado} planeadas
                        {avancesRef[orden.id] && totalMoldeado > 0 && ` · ${totalMoldeado} moldeadas`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
                      Pendiente recogida
                    </span>
                    {expandido === orden.id
                      ? <ChevronUp size={16} className="text-gray-400" />
                      : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </button>

                {/* Éxito */}
                {exitoOrden === orden.id && (
                  <div className="border-t border-green-100 bg-green-50 px-5 py-6 flex flex-col items-center gap-3">
                    <CheckCircle2 size={40} className="text-green-500" />
                    <p className="text-sm font-bold text-green-700">¡Recogida registrada!</p>
                    <p className="text-xs text-green-600 text-center">
                      Las piezas conformes ingresaron al inventario de FUNDICIÓN
                      {fundidaSel[orden.id] ? ' y se descontó el hierro colado consumido.' : '.'}
                    </p>
                  </div>
                )}

                {/* Detalle expandido */}
                {expandido === orden.id && exitoOrden !== orden.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-5 space-y-4">

                    {/* ── Vincular fundida ── */}
                    <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Flame size={15} className="text-orange-500 shrink-0" />
                        <p className="text-xs font-bold text-orange-700">¿A qué fundida corresponde esta orden?</p>
                      </div>

                      <select
                        value={fundidaSel[orden.id] || ''}
                        onChange={e => setFundidaSel(prev => ({ ...prev, [orden.id]: e.target.value }))}
                        className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                      >
                        <option value="">— Seleccionar (opcional) —</option>
                        {fundidas.map(f => (
                          <option key={f.id} value={f.id}>
                            {numFun(f.numero)} · {fmtFecha(f.fecha)} · {f.hierro_colado} kg hierro colado
                          </option>
                        ))}
                      </select>

                      {/* Panel de merma */}
                      {fundidaSel[orden.id] && (() => {
                        const fundida  = fundidas.find(f => f.id === fundidaSel[orden.id])
                        const kgEntrada = Number(fundida?.hierro_colado || 0)
                        const kgPiezas  = calcKgPiezas(orden)
                        const hayPesos  = piezas.some(p => Number(p.items?.peso_unitario || 0) > 0)
                        const kgMerma   = kgEntrada - kgPiezas
                        const pctMerma  = kgEntrada > 0 ? (kgMerma / kgEntrada * 100) : 0

                        return (
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-white rounded-xl p-2.5 border border-orange-100 text-center">
                                <p className="text-xs text-gray-400 mb-0.5">Hierro colado (entrada)</p>
                                <p className="font-bold text-gray-800 text-sm">{kgEntrada} kg</p>
                              </div>
                              <div className="bg-white rounded-xl p-2.5 border border-orange-100 text-center">
                                <p className="text-xs text-gray-400 mb-0.5">Piezas buenas</p>
                                {hayPesos
                                  ? <p className="font-bold text-green-700 text-sm">{kgPiezas.toFixed(1)} kg</p>
                                  : <p className="text-xs text-gray-400 mt-0.5 italic">sin peso unitario</p>
                                }
                              </div>
                              <div className={`rounded-xl p-2.5 border text-center ${kgMerma > 0 && hayPesos ? 'bg-red-50 border-red-200' : 'bg-white border-orange-100'}`}>
                                <p className="text-xs text-gray-400 mb-0.5">Merma</p>
                                {hayPesos
                                  ? <p className={`font-bold text-sm ${kgMerma > 0 ? 'text-feisen-rojo' : 'text-gray-400'}`}>
                                      {kgMerma > 0
                                        ? `${kgMerma.toFixed(1)} kg (${pctMerma.toFixed(1)}%)`
                                        : '—'}
                                    </p>
                                  : <p className="text-xs text-gray-400 italic">—</p>
                                }
                              </div>
                            </div>
                            <p className="text-xs text-orange-600 font-medium">
                              ✓ Al guardar se descontarán <strong>{kgEntrada} kg</strong> de HIERRO COLADO del inventario de FUNDICIÓN.
                            </p>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Referencia de avance */}
                    {avancesRef[orden.id] && totalMoldeado > 0 && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                        <p className="text-xs font-bold text-feisen-azul mb-2">Referencia — avance registrado en moldeo</p>
                        <div className="grid grid-cols-2 gap-2">
                          {piezas.map(p => {
                            const av = avOrden[p.id] || 0
                            if (!av) return null
                            return (
                              <div key={p.id} className="flex justify-between items-center bg-white rounded-lg px-3 py-1.5 text-xs border border-blue-100">
                                <span className="text-gray-600 truncate flex-1 mr-2">{p.items?.nombre}</span>
                                <span className="font-bold text-feisen-azul shrink-0">{av} moldeadas</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {errores[orden.id] && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm">
                        <AlertTriangle size={15} /> {errores[orden.id]}
                      </div>
                    )}

                    {/* Formulario por pieza */}
                    <div className="space-y-3">
                      {piezas.map(p => (
                        <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">

                          {/* Encabezado pieza */}
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-semibold text-gray-800 text-sm">{p.items?.nombre}</p>
                              {p.asignado_a && (
                                <p className="text-xs text-gray-400 mt-0.5">Moldeador: {p.asignado_a}</p>
                              )}
                              {p.items?.peso_unitario && (
                                <p className="text-xs text-orange-500 mt-0.5 font-medium">
                                  {p.items.peso_unitario} kg/ud
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <span className="text-xs text-gray-400">Planeadas</span>
                              <p className="font-bold text-gray-700 text-base leading-tight">{p.cantidad_planeada}</p>
                              {avOrden[p.id] > 0 && (
                                <p className="text-xs text-feisen-azul font-semibold mt-0.5">
                                  {avOrden[p.id]} moldeadas
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Inputs conforme / NC / motivo */}
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-green-600 mb-1.5">✓ Conformes</label>
                              <input type="number" min="0" step="1"
                                value={getField(orden.id, p.id, 'conforme')}
                                onChange={e => setField(orden.id, p.id, 'conforme', e.target.value)}
                                placeholder="0"
                                className="w-full border-2 border-gray-200 rounded-xl px-2 py-2.5 text-center text-base font-bold focus:outline-none focus:border-green-400 focus:ring-0"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-red-500 mb-1.5">✗ No conformes</label>
                              <input type="number" min="0" step="1"
                                value={getField(orden.id, p.id, 'nc')}
                                onChange={e => setField(orden.id, p.id, 'nc', e.target.value)}
                                placeholder="0"
                                className="w-full border-2 border-gray-200 rounded-xl px-2 py-2.5 text-center text-base font-bold focus:outline-none focus:border-red-400 focus:ring-0"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1.5">Razón de calidad</label>
                              <input type="text"
                                value={getField(orden.id, p.id, 'motivo')}
                                onChange={e => setField(orden.id, p.id, 'motivo', e.target.value)}
                                placeholder="Ej: porosidad, grieta…"
                                disabled={Number(getField(orden.id, p.id, 'nc') || 0) === 0}
                                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 focus:ring-0 disabled:opacity-40 disabled:bg-gray-50"
                              />
                            </div>
                          </div>

                          {/* Alerta si conformes + NC > planeado */}
                          {(() => {
                            const conf = Number(getField(orden.id, p.id, 'conforme') || 0)
                            const nc   = Number(getField(orden.id, p.id, 'nc') || 0)
                            const plan = Number(p.cantidad_planeada || 0)
                            if (conf + nc > plan && plan > 0) {
                              return (
                                <p className="text-xs text-orange-500 mt-2 font-medium flex items-center gap-1">
                                  <AlertTriangle size={12} /> La suma ({conf + nc}) supera lo planeado ({plan}).
                                </p>
                              )
                            }
                            return null
                          })()}
                        </div>
                      ))}
                    </div>

                    {/* Resumen antes de guardar */}
                    {piezas.some(p => Number(getField(orden.id, p.id, 'conforme') || 0) + Number(getField(orden.id, p.id, 'nc') || 0) > 0) && (
                      <div className="bg-gray-100 rounded-xl px-4 py-3 flex justify-between text-sm font-semibold">
                        <span className="text-gray-500">Total a registrar</span>
                        <div className="flex gap-4">
                          <span className="text-green-600">
                            ✓ {piezas.reduce((s,p) => s + Number(getField(orden.id, p.id, 'conforme') || 0), 0)} conformes
                          </span>
                          <span className="text-red-500">
                            ✗ {piezas.reduce((s,p) => s + Number(getField(orden.id, p.id, 'nc') || 0), 0)} NC
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Guardar */}
                    <button onClick={() => guardarRecogida(orden)} disabled={guardando === orden.id}
                      className="w-full flex items-center justify-center gap-2 bg-orange-500 text-white rounded-xl py-3.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity">
                      <CheckCircle2 size={16} />
                      {guardando === orden.id ? 'Registrando…' : 'Registrar recogida y cerrar orden'}
                    </button>
                    <p className="text-xs text-gray-400 text-center -mt-1">
                      Las piezas conformes entrarán al inventario de FUNDICIÓN
                      {fundidaSel[orden.id] ? ' y se descontará el hierro colado automáticamente.' : '.'}
                    </p>

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
