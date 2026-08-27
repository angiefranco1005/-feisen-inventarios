import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  PackageCheck, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Search, Flame,
} from 'lucide-react'

const HIERRO_COLADO_ITEM_ID = '52546e1a-dd2b-46c6-8857-9895497f228a'
const VACEADERO_ITEM_ID     = 'afc4f062-48c1-47cc-92c2-c9e4536bfff5'

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

  const [tab,          setTab]          = useState('pendientes')
  const [ordenes,      setOrdenes]      = useState([])
  const [completadas,  setCompletadas]  = useState([])
  const [fundidas,     setFundidas]     = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [expandido,    setExpandido]    = useState(null)
  const [busqueda,     setBusqueda]     = useState('')
  const [busquedaComp, setBusquedaComp] = useState('')
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
  // vaceadero en kg por orden: { [ordenId]: string }
  const [vaceaderoKg,  setVaceaderoKg]  = useState({})
  // movimientos hierro/vaceadero de órdenes completadas: { [numOrden]: { hierro, vaceadero } }
  const [movsComp,     setMovsComp]     = useState({})

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const piezasSelect = `
      id, item_id, cantidad_planeada, asignado_a,
      cantidad_conforme, cantidad_nc, motivo_nc,
      items(id, nombre, precio_costo, peso_unitario)
    `
    const [{ data: bods }, { data: ords }, { data: comps }, { data: funs }] = await Promise.all([
      supabase.from('bodegas').select('id').ilike('nombre', '%FUNDICIÓN%').single(),
      supabase.from('ordenes_moldeo')
        .select(`id, numero, fecha, estado, ordenes_moldeo_piezas(${piezasSelect}), ordenes_moldeo_maquinas(cantidad_maquinas, maquinas_fundicion(nombre))`)
        .eq('estado', 'pendiente')
        .order('fecha', { ascending: false }),
      supabase.from('ordenes_moldeo')
        .select(`id, numero, fecha, estado, ordenes_moldeo_piezas(${piezasSelect})`)
        .eq('estado', 'completado')
        .order('fecha', { ascending: false })
        .limit(60),
      supabase.from('fundidas')
        .select('id, numero, fecha, hierro_colado')
        .not('hierro_colado', 'is', null)
        .gt('hierro_colado', 0)
        .order('fecha', { ascending: false })
        .limit(90),
    ])
    setFundBodegaId(bods?.id || null)
    setOrdenes(ords || [])
    setCompletadas(comps || [])
    setFundidas(funs || [])

    // Cargar movimientos de hierro colado y vaceadero para órdenes completadas
    const numRefs = (comps || []).map(o => numOrden(o.numero))
    if (numRefs.length > 0) {
      const orFilter = numRefs.map(r => `referencia.like.${r}%`).join(',')
      const { data: movsData } = await supabase
        .from('movimientos')
        .select('referencia, item_id, tipo, cantidad')
        .or(orFilter)
        .in('item_id', [HIERRO_COLADO_ITEM_ID, VACEADERO_ITEM_ID])
        .eq('revertido', false)
      const mapa = {}
      for (const m of (movsData || [])) {
        const ref = numRefs.find(r => m.referencia?.startsWith(r))
        if (!ref) continue
        if (!mapa[ref]) mapa[ref] = { hierro: 0, vaceadero: 0 }
        if (m.item_id === HIERRO_COLADO_ITEM_ID && m.tipo === 'salida') mapa[ref].hierro += Number(m.cantidad)
        if (m.item_id === VACEADERO_ITEM_ID     && m.tipo === 'entrada') mapa[ref].vaceadero += Number(m.cantidad)
      }
      setMovsComp(mapa)
    }

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
      const plan = Number(p.cantidad_planeada || 0)
      if (conf < 0 || nc < 0) {
        setErrores(prev => ({ ...prev, [orden.id]: 'Las cantidades no pueden ser negativas.' }))
        return
      }
      if (plan > 0 && conf + nc !== plan) {
        setErrores(prev => ({ ...prev, [orden.id]: `"${p.items?.nombre}": conformes (${conf}) + NC (${nc}) = ${conf + nc}, pero la orden tiene ${plan} planeadas. Deben sumar exactamente.` }))
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

      // 4. Entrada de VACEADERO = kg manual + kg de piezas NC (vuelven al horno)
      const kgManual = Number(vaceaderoKg[orden.id] || 0)
      const kgNC = piezas.reduce((s, p) => {
        const nc   = Number(getField(orden.id, p.id, 'nc') || 0)
        const peso = Number(p.items?.peso_unitario || 0)
        return s + nc * peso
      }, 0)
      const kgVacTotal = kgManual + kgNC
      if (kgVacTotal > 0 && fundBodegaId) {
        const numVac = await generarNumero(perfil, 'ENT')
        const { error: errVac } = await supabase.from('movimientos').insert({
          numero:                numVac,
          tipo:                  'entrada',
          item_id:               VACEADERO_ITEM_ID,
          bodega_destino_id:     fundBodegaId,
          bodega_origen_id:      null,
          cantidad:              kgVacTotal,
          precio_costo_snapshot: 0,
          centro_costo:          'FUNDICIÓN',
          usuario_id:            perfil.id,
          proveedor:             'Producción interna',
          referencia:            numOrden(orden.numero),
          fecha_movimiento:      orden.fecha || null,
          motivo:                `Vaceadero recogida: ${kgManual > 0 ? `${kgManual} kg manual` : ''}${kgManual > 0 && kgNC > 0 ? ' + ' : ''}${kgNC > 0 ? `${kgNC.toFixed(2)} kg piezas NC` : ''}`,
          foto_remision_url: null, destino: null,
          numero_of: null, serial_motor: null, cliente: null,
        })
        if (errVac) throw errVac
      }

      // 5. Marcar orden como completada
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

      {/* Pestañas */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {[['pendientes', `Pendientes (${ordenes.length})`], ['completadas', `Completadas (${completadas.length})`]].map(([id, label]) => (
          <button key={id} type="button"
            onClick={() => { setTab(id); setBusqueda(''); setBusquedaComp('') }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input type="text"
          value={tab === 'pendientes' ? busqueda : busquedaComp}
          onChange={e => tab === 'pendientes' ? setBusqueda(e.target.value) : setBusquedaComp(e.target.value)}
          placeholder="Buscar por N°, fecha o pieza…"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
        />
      </div>

      {/* ── Vista Completadas ── */}
      {tab === 'completadas' && !cargando && (() => {
        const q = busquedaComp.toLowerCase().trim()
        const filtComp = completadas.filter(o =>
          !q ||
          numOrden(o.numero).toLowerCase().includes(q) ||
          fmtFecha(o.fecha).includes(q) ||
          (o.ordenes_moldeo_piezas || []).some(p => p.items?.nombre?.toLowerCase().includes(q))
        )
        return filtComp.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">{q ? 'Sin resultados.' : 'No hay recogidas completadas.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtComp.map(orden => {
              const piezas = orden.ordenes_moldeo_piezas || []
              const totalConf = piezas.reduce((s, p) => s + Number(p.cantidad_conforme || 0), 0)
              const totalNC   = piezas.reduce((s, p) => s + Number(p.cantidad_nc || 0), 0)
              return (
                <div key={orden.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="bg-green-100 text-green-700 font-bold text-sm px-3 py-1 rounded-lg font-mono">
                        {numOrden(orden.numero)}
                      </span>
                      <span className="text-sm text-gray-500">{fmtFecha(orden.fecha)}</span>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                      ✓ Completada
                    </span>
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const hayAsignados = piezas.some(p => p.asignado_a)
                      if (!hayAsignados) {
                        return piezas.map(p => (
                          <div key={p.id} className="flex items-center justify-between text-sm px-3 py-2 bg-gray-50 rounded-xl">
                            <span className="text-gray-700 font-medium truncate flex-1 mr-2">{p.items?.nombre}</span>
                            <div className="flex gap-3 shrink-0 text-xs font-semibold">
                              <span className="text-green-600">✓ {p.cantidad_conforme || 0}</span>
                              {Number(p.cantidad_nc || 0) > 0 && <span className="text-feisen-rojo">✗ {p.cantidad_nc}</span>}
                            </div>
                          </div>
                        ))
                      }
                      // Agrupar por moldeador
                      const grupos = {}
                      for (const p of piezas) {
                        const key = p.asignado_a || 'Sin asignar'
                        if (!grupos[key]) grupos[key] = []
                        grupos[key].push(p)
                      }
                      return Object.entries(grupos).map(([persona, ps]) => (
                        <div key={persona}>
                          <p className="text-xs font-bold text-feisen-azul mb-1.5 px-1">👤 {persona}</p>
                          <div className="space-y-1">
                            {ps.map(p => {
                              const conf = Number(p.cantidad_conforme || 0)
                              const nc   = Number(p.cantidad_nc || 0)
                              const kg   = Number(p.items?.peso_unitario || 0)
                              const kgTotal = conf * kg
                              return (
                                <div key={p.id} className="flex items-center justify-between text-sm px-3 py-2 bg-gray-50 rounded-xl">
                                  <div className="flex-1 mr-2 min-w-0">
                                    <span className="text-gray-700 font-medium truncate block">{p.items?.nombre}</span>
                                    {kg > 0 && <span className="text-xs text-orange-500">{kg} kg/ud</span>}
                                  </div>
                                  <div className="flex gap-3 shrink-0 text-xs font-semibold">
                                    <span className="text-green-600">✓ {conf}{kg > 0 ? ` (${kgTotal.toFixed(1)} kg)` : ''}</span>
                                    {nc > 0 && <span className="text-feisen-rojo">✗ {nc}</span>}
                                  </div>
                                </div>
                              )
                            })}
                            <div className="flex gap-3 px-3 text-xs text-gray-400 font-medium">
                              <span>Subtotal: <strong className="text-green-600">{ps.reduce((s,p) => s + Number(p.cantidad_conforme||0), 0)} conf</strong></span>
                              {ps.some(p => Number(p.items?.peso_unitario||0) > 0) && (
                                <strong className="text-orange-600">
                                  {ps.reduce((s,p) => s + Number(p.cantidad_conforme||0) * Number(p.items?.peso_unitario||0), 0).toFixed(1)} kg
                                </strong>
                              )}
                              {ps.some(p => Number(p.cantidad_nc||0) > 0) && (
                                <span><strong className="text-feisen-rojo">{ps.reduce((s,p) => s + Number(p.cantidad_nc||0), 0)} NC</strong></span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                  {(totalConf > 0 || totalNC > 0) && (
                    <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100 text-xs font-bold">
                      <span className="text-green-600">Total conformes: {totalConf}</span>
                      {totalNC > 0 && <span className="text-feisen-rojo">NC: {totalNC}</span>}
                    </div>
                  )}
                  {/* Panel merma completada */}
                  {(() => {
                    const ref = numOrden(orden.numero)
                    const mov = movsComp[ref]
                    const kgHierro    = mov?.hierro    || 0
                    const kgVaceadero = mov?.vaceadero || 0
                    const kgPiezas    = piezas.reduce((s, p) => s + Number(p.cantidad_conforme || 0) * Number(p.items?.peso_unitario || 0), 0)
                    const hayPesos    = piezas.some(p => Number(p.items?.peso_unitario || 0) > 0)
                    if (!kgHierro && !kgVaceadero) return null
                    const kgMerma  = kgHierro - kgPiezas - kgVaceadero
                    const pctMerma = kgHierro > 0 ? (kgMerma / kgHierro * 100) : 0
                    return (
                      <div className="mt-3 pt-3 border-t border-orange-100 grid grid-cols-2 gap-2">
                        <div className="bg-orange-50 rounded-xl p-2 text-center">
                          <p className="text-xs text-gray-400">🔥 Hierro colado</p>
                          <p className="font-bold text-gray-800 text-sm">{kgHierro} kg</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-2 text-center">
                          <p className="text-xs text-gray-400">✅ Piezas buenas</p>
                          <p className="font-bold text-green-700 text-sm">{hayPesos ? `${kgPiezas.toFixed(1)} kg` : '—'}</p>
                        </div>
                        <div className="bg-yellow-50 rounded-xl p-2 text-center">
                          <p className="text-xs text-gray-400">♻️ Vaceadero</p>
                          <p className="font-bold text-yellow-700 text-sm">{kgVaceadero > 0 ? `${kgVaceadero.toFixed(2)} kg` : '0 kg'}</p>
                        </div>
                        <div className={`rounded-xl p-2 text-center ${kgMerma > 0 && hayPesos ? 'bg-red-50' : 'bg-gray-50'}`}>
                          <p className="text-xs text-gray-400">⚠️ Merma real</p>
                          <p className={`font-bold text-sm ${kgMerma > 0 && hayPesos ? 'text-feisen-rojo' : 'text-gray-400'}`}>
                            {hayPesos && kgMerma > 0 ? `${kgMerma.toFixed(1)} kg (${pctMerma.toFixed(1)}%)` : '—'}
                          </p>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )
      })()}

      {tab === 'pendientes' && cargando ? (
        <p className="text-center text-gray-400 py-16">Cargando…</p>
      ) : tab === 'pendientes' && filtradas.length === 0 ? (
        <div className="text-center py-16">
          <PackageCheck size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">
            {busqueda ? 'Sin resultados.' : 'No hay órdenes pendientes de recogida.'}
          </p>
          {!busqueda && <p className="text-xs text-gray-300 mt-1">Cuando se creen órdenes de moldeo aparecerán aquí.</p>}
        </div>
      ) : tab === 'pendientes' ? (
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
                      {fundidaSel[orden.id] ? ' · se descontó el hierro colado' : ''}
                      {Number(vaceaderoKg[orden.id] || 0) > 0 ? ` · ${vaceaderoKg[orden.id]} kg de vaceadero registrados` : ''}.
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
                        const fundida   = fundidas.find(f => f.id === fundidaSel[orden.id])
                        const kgEntrada = Number(fundida?.hierro_colado || 0)
                        const kgPiezas  = calcKgPiezas(orden)
                        const hayPesos  = piezas.some(p => Number(p.items?.peso_unitario || 0) > 0)
                        // Vaceadero = manual + piezas NC con peso
                        const kgVacManual = Number(vaceaderoKg[orden.id] || 0)
                        const kgVacNC = piezas.reduce((s, p) => {
                          const nc   = Number(getField(orden.id, p.id, 'nc') || 0)
                          const peso = Number(p.items?.peso_unitario || 0)
                          return s + nc * peso
                        }, 0)
                        const kgVaceadero = kgVacManual + kgVacNC
                        // Merma real = hierro - piezas buenas - vaceadero
                        const kgMerma  = kgEntrada - kgPiezas - kgVaceadero
                        const pctMerma = kgEntrada > 0 ? (kgMerma / kgEntrada * 100) : 0

                        return (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white rounded-xl p-2.5 border border-orange-100 text-center">
                                <p className="text-xs text-gray-400 mb-0.5">🔥 Hierro colado</p>
                                <p className="font-bold text-gray-800 text-sm">{kgEntrada} kg</p>
                              </div>
                              <div className="bg-white rounded-xl p-2.5 border border-orange-100 text-center">
                                <p className="text-xs text-gray-400 mb-0.5">✅ Piezas buenas</p>
                                {hayPesos
                                  ? <p className="font-bold text-green-700 text-sm">{kgPiezas.toFixed(1)} kg</p>
                                  : <p className="text-xs text-gray-400 italic">sin peso unitario</p>
                                }
                              </div>
                              <div className="bg-yellow-50 rounded-xl p-2.5 border border-yellow-200 text-center">
                                <p className="text-xs text-gray-400 mb-0.5">♻️ Vaceadero</p>
                                <p className="font-bold text-yellow-700 text-sm">
                                  {kgVaceadero > 0 ? `${kgVaceadero.toFixed(2)} kg` : '0 kg'}
                                </p>
                                {kgVacNC > 0 && kgVacManual > 0 && (
                                  <p className="text-xs text-yellow-600">{kgVacNC.toFixed(2)} NC + {kgVacManual} manual</p>
                                )}
                              </div>
                              <div className={`rounded-xl p-2.5 border text-center ${kgMerma > 0 && hayPesos ? 'bg-red-50 border-red-200' : 'bg-white border-orange-100'}`}>
                                <p className="text-xs text-gray-400 mb-0.5">⚠️ Merma real</p>
                                {hayPesos
                                  ? <p className={`font-bold text-sm ${kgMerma > 0 ? 'text-feisen-rojo' : 'text-green-600'}`}>
                                      {kgMerma > 0
                                        ? `${kgMerma.toFixed(1)} kg (${pctMerma.toFixed(1)}%)`
                                        : '0 kg ✓'}
                                    </p>
                                  : <p className="text-xs text-gray-400 italic">—</p>
                                }
                              </div>
                            </div>
                            {hayPesos && kgEntrada > 0 && (
                              <p className="text-xs text-gray-500 font-medium">
                                Merma = hierro colado ({kgEntrada} kg) − piezas buenas ({kgPiezas.toFixed(1)} kg) − vaceadero ({kgVaceadero.toFixed(2)} kg)
                              </p>
                            )}
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
                                onChange={e => {
                                  const conf = e.target.value
                                  setField(orden.id, p.id, 'conforme', conf)
                                  const plan = Number(p.cantidad_planeada || 0)
                                  const ncAuto = Math.max(0, plan - Number(conf || 0))
                                  if (plan > 0) setField(orden.id, p.id, 'nc', String(ncAuto))
                                }}
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

                    {/* ── Vaceadero ── */}
                    {(() => {
                      const kgManual = Number(vaceaderoKg[orden.id] || 0)
                      const kgNC = piezas.reduce((s, p) => {
                        const nc   = Number(getField(orden.id, p.id, 'nc') || 0)
                        const peso = Number(p.items?.peso_unitario || 0)
                        return s + nc * peso
                      }, 0)
                      const kgTotal = kgManual + kgNC
                      return (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">♻️</span>
                            <p className="text-xs font-bold text-yellow-800">Vaceadero — entrada al inventario</p>
                          </div>
                          <input
                            type="number" min="0" step="0.1"
                            value={vaceaderoKg[orden.id] || ''}
                            onChange={e => setVaceaderoKg(prev => ({ ...prev, [orden.id]: e.target.value }))}
                            placeholder="Kg de vaceadero manual (opcional)"
                            className="w-full border-2 border-yellow-300 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:border-yellow-500 bg-white"
                          />
                          {(kgNC > 0 || kgManual > 0) && (
                            <div className="text-xs text-yellow-800 space-y-0.5">
                              {kgNC > 0 && (
                                <p>🔴 Piezas NC → <strong>{kgNC.toFixed(2)} kg</strong> (automático por peso unitario)</p>
                              )}
                              {kgManual > 0 && (
                                <p>➕ Vaceadero manual → <strong>{kgManual} kg</strong></p>
                              )}
                              <p className="font-bold text-yellow-900 border-t border-yellow-200 pt-1 mt-1">
                                Total VACEADERO a ingresar: {kgTotal.toFixed(2)} kg
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })()}

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
                      Piezas conformes → inventario FUNDICIÓN
                      {fundidaSel[orden.id] ? ' · hierro colado descontado' : ''}
                      {Number(vaceaderoKg[orden.id] || 0) > 0 ? ' · vaceadero ingresado' : ''}.
                    </p>

                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
