import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { BODEGA_FUNDICION_ID } from '../../utils/bodegasCatalogo'
import { coincideBusqueda } from '../../utils/busqueda'
import {
  ClipboardList, ChevronRight, Search, Plus, AlertTriangle, TrendingUp, Calendar,
  Pencil, XCircle, X, Check, Clock,
} from '../shared/iconos'
import Modal from '../shared/Modal'
import { EncabezadoPagina, Segmentado, Contador, PanelLateral, useAviso, useAtajoBuscar } from '../shared/ui'

function numOrden(n) { return `ORD-MOL-${String(n).padStart(4, '0')}` }
function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}
function hoyCol() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}
const kg = n => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })
const num = n => Number(n || 0).toLocaleString('es-CO')

// Días que lleva abierta una orden (desde su fecha hasta hoy en Colombia)
function diasDesde(fecha) {
  if (!fecha) return 0
  const ms = new Date(`${hoyCol()}T00:00:00`) - new Date(`${fecha}T00:00:00`)
  return Math.max(0, Math.round(ms / 86400000))
}
// Una orden en curso con más de estos días se resalta arriba
const DIAS_ALERTA = 7

const claseInput = 'w-full border border-feisen-borde rounded-lg px-3 min-h-[44px] text-sm bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'
const claseSecundario = 'inline-flex items-center justify-center gap-1.5 border border-feisen-borde rounded-lg px-3 min-h-[40px] text-sm font-medium text-feisen-texto bg-white hover:bg-feisen-fondo transition-colors'
const claseEtiqueta = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400'

// Barra de progreso fina (un solo color: azul = avance)
function BarraProgreso({ pct }) {
  return (
    <div className="w-full bg-feisen-borde-suave rounded-full h-1.5 overflow-hidden">
      <div className="h-full rounded-full bg-feisen-azul transition-all motion-reduce:transition-none" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function BadgeEstado({ estado }) {
  const [clase, texto] =
    estado === 'cancelado'  ? ['bg-gray-100 text-gray-500', 'Cancelada']
    : estado === 'completado' ? ['bg-feisen-borde-suave text-feisen-texto-2', 'Completada']
    : ['bg-feisen-azul-suave text-feisen-azul', 'En curso']
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${clase}`}>{texto}</span>
}

function BadgeAtencion({ children, icono: Icono = AlertTriangle }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-amber-50 text-amber-700">
      <Icono size={12} /> {children}
    </span>
  )
}

function Avatar({ nombre, chico = false }) {
  const sin = nombre === 'Sin asignar'
  return (
    <span className={`rounded-full grid place-items-center shrink-0 font-semibold
      ${chico ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'}
      ${sin ? 'bg-gray-100 text-gray-400' : 'bg-feisen-azul-suave text-feisen-azul'}`}>
      {sin ? '?' : nombre.charAt(0).toUpperCase()}
    </span>
  )
}

function Cifra({ etiqueta, valor, detalle }) {
  return (
    <div className="min-w-0">
      <p className={claseEtiqueta}>{etiqueta}</p>
      <p className="text-xl font-semibold text-feisen-texto tabular-nums mt-0.5 truncate">{valor}</p>
      {detalle && <p className="text-xs text-feisen-texto-2 tabular-nums truncate">{detalle}</p>}
    </div>
  )
}

// Cálculos de una orden a partir de sus piezas y los avances cargados (mismas fórmulas de siempre)
function resumenOrden(orden, avOrden, stOrden) {
  const completada = orden.estado === 'completado'
  const piezas     = orden.ordenes_moldeo_piezas || []

  const totalPlaneado  = piezas.reduce((s, p) => s + Number(p.cantidad_planeada || 0), 0)
  const totalMoldeado  = piezas.reduce((s, p) => s + (avOrden[p.id]?.total || 0), 0)
  const pctAvance      = totalPlaneado > 0 ? Math.round((totalMoldeado / totalPlaneado) * 100) : 0
  const hayStockAlerta = !completada && piezas.some(p => {
    const stock     = stOrden[p.item_id] ?? null
    const pendiente = Number(p.cantidad_planeada || 0) - (avOrden[p.id]?.total || 0)
    return stock !== null && stock < pendiente && pendiente > 0
  })

  // Datos por moldeador
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
  const kgMoldeados = Object.values(porMoldeador).reduce((s, d) => s + d.kg, 0)

  return { totalPlaneado, totalMoldeado, pctAvance, hayStockAlerta, porMoldeador, historialPorFecha, fechasDesc, kgMoldeados }
}

export default function ListaOrdenesMoldeo() {
  const navigate  = useNavigate()
  const { perfil } = useAuth()
  const buscarRef = useRef(null)
  useAtajoBuscar(buscarRef)
  const [aviso, avisar] = useAviso()

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

  // Vista dentro de la orden abierta: 'pieza' | 'moldeador' | 'historial'
  const [vistaAbierta, setVistaAbierta] = useState({})
  // Vista de orden completada: 'pieza' | 'moldeador'
  const [vistaOrden,   setVistaOrden]   = useState({})

  // Cancelar
  const [confirmCancelar,   setConfirmCancelar]   = useState(null)
  const [cancelando,        setCancelando]        = useState(false)
  // Editar
  const [editModal,         setEditModal]         = useState(null)
  const [editForm,          setEditForm]          = useState({ fecha: '', piezas: [] })
  const [editGuardando,     setEditGuardando]     = useState(false)
  const [msgEdit,           setMsgEdit]           = useState('')
  // Filtro por estado (chips): 'todas' (sin canceladas, como antes) | 'pendiente' | 'completado' | 'cancelado'
  const [filtroEstado,      setFiltroEstado]      = useState('todas')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: bods }, { data: ords }] = await Promise.all([
      supabase.from('bodegas').select('id').eq('id', BODEGA_FUNDICION_ID).maybeSingle(),
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
      avisar(`Avance registrado en ${numOrden(orden.numero)}`)
    } catch (e) {
      setErrorAv(prev => ({ ...prev, [orden.id]: 'Error: ' + e.message }))
    } finally {
      setGuardandoAv(null)
    }
  }

  // ── Cancelar orden ────────────────────────────────────────────────────────────
  async function cancelarOrden(orden) {
    setCancelando(true)
    await supabase.from('ordenes_moldeo').update({ estado: 'cancelado' }).eq('id', orden.id)
    setOrdenes(prev => prev.map(o => o.id === orden.id ? { ...o, estado: 'cancelado' } : o))
    setCancelando(false)
    setConfirmCancelar(null)
    setExpandido(null)
    avisar(`${numOrden(orden.numero)} quedó cancelada`)
  }

  // ── Editar orden ──────────────────────────────────────────────────────────────
  function abrirEdicion(orden) {
    setEditForm({
      fecha: orden.fecha || '',
      piezas: (orden.ordenes_moldeo_piezas || []).map(p => ({
        id: p.id,
        nombre: p.items?.nombre || '',
        cantidad_planeada: String(p.cantidad_planeada || ''),
        asignado_a: p.asignado_a || '',
      })),
    })
    setMsgEdit('')
    setEditModal(orden)
  }

  async function guardarEdicion() {
    setEditGuardando(true)
    setMsgEdit('')
    const { error: e1 } = await supabase.from('ordenes_moldeo')
      .update({ fecha: editForm.fecha }).eq('id', editModal.id)
    if (e1) { setMsgEdit('Error: ' + e1.message); setEditGuardando(false); return }

    for (const p of editForm.piezas) {
      const { error: e2 } = await supabase.from('ordenes_moldeo_piezas').update({
        cantidad_planeada: Number(p.cantidad_planeada) || 0,
        asignado_a: p.asignado_a.trim() || null,
      }).eq('id', p.id)
      if (e2) { setMsgEdit('Error en pieza: ' + e2.message); setEditGuardando(false); return }
    }

    setEditGuardando(false)
    avisar(`Cambios guardados en ${numOrden(editModal.numero)}`)
    setEditModal(null)
    cargar()
  }

  function setPieza(idx, campo, val) {
    setEditForm(prev => ({
      ...prev,
      piezas: prev.piezas.map((p, i) => i === idx ? { ...p, [campo]: val } : p),
    }))
  }

  // ── Búsqueda y filtros ────────────────────────────────────────────────────────
  // Palabras sueltas, sin importar tildes ni orden: N°, fecha, pieza, máquina o moldeador
  const coincide = o => {
    if (!busqueda.trim()) return true
    const texto = [
      numOrden(o.numero), String(o.numero), fmtFecha(o.fecha),
      ...(o.ordenes_moldeo_piezas || []).map(p => `${p.items?.nombre || ''} ${p.asignado_a || ''}`),
      ...(o.ordenes_moldeo_maquinas || []).map(m => m.maquinas_fundicion?.nombre || ''),
    ].join(' ')
    return coincideBusqueda(texto, busqueda)
  }
  const buscadas = ordenes.filter(coincide)
  const conteos = {
    todas:      buscadas.filter(o => o.estado !== 'cancelado').length,
    pendiente:  buscadas.filter(o => o.estado === 'pendiente').length,
    completado: buscadas.filter(o => o.estado === 'completado').length,
    cancelado:  buscadas.filter(o => o.estado === 'cancelado').length,
  }
  const filtradas = buscadas.filter(o =>
    filtroEstado === 'todas' ? o.estado !== 'cancelado' : o.estado === filtroEstado)

  // Excepciones arriba: órdenes en curso que llevan muchos días abiertas (las más viejas primero)
  const esVieja   = o => o.estado === 'pendiente' && diasDesde(o.fecha) > DIAS_ALERTA
  const atencion  = filtradas.filter(esVieja).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
  const enCurso   = filtradas.filter(o => o.estado !== 'completado' && o.estado !== 'cancelado' && !esVieja(o))
  const completas = filtradas.filter(o => o.estado === 'completado')
  const canceladas = filtradas.filter(o => o.estado === 'cancelado')
  const secciones = [
    { clave: 'atencion', titulo: 'Requieren atención', nota: `en curso hace más de ${DIAS_ALERTA} días`, lista: atencion },
    { clave: 'curso', titulo: 'En curso', lista: enCurso },
    { clave: 'completas', titulo: 'Completadas', lista: completas },
    { clave: 'canceladas', titulo: 'Canceladas', lista: canceladas },
  ].filter(s => s.lista.length > 0)

  const abierta = expandido ? ordenes.find(o => o.id === expandido) : null
  const totalPendientes = ordenes.filter(o => o.estado === 'pendiente').length

  const chips = [
    ['todas', 'Todas'], ['pendiente', 'En curso'], ['completado', 'Completadas'], ['cancelado', 'Canceladas'],
  ]

  // ── Fila de la lista (tarjeta en celular) ─────────────────────────────────────
  function filaOrden(orden) {
    const cancelada  = orden.estado === 'cancelado'
    const piezas     = orden.ordenes_moldeo_piezas || []
    const maquinas   = orden.ordenes_moldeo_maquinas || []
    const cargada    = !!avancesData[orden.id]
    const r          = resumenOrden(orden, avancesData[orden.id] || {}, stockData[orden.id] || {})
    const dias       = diasDesde(orden.fecha)
    const textoMaq   = maquinas.length > 0
      ? maquinas.map(m => `${m.cantidad_maquinas} × ${m.maquinas_fundicion?.nombre || '—'}`).join(', ')
      : 'Piezas sueltas'
    const activa = expandido === orden.id
    return (
      <li key={orden.id}>
        <button type="button" onClick={() => toggle(orden)} aria-current={activa ? 'true' : undefined}
          className={`w-full text-left flex items-center gap-3 px-4 py-3 min-h-[64px] transition-colors
            ${activa ? 'bg-feisen-azul-suave/60' : 'hover:bg-feisen-fondo'}`}>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`font-mono text-sm font-semibold ${cancelada ? 'text-gray-400 line-through' : 'text-feisen-texto'}`}>
                {numOrden(orden.numero)}
              </span>
              <BadgeEstado estado={orden.estado} />
              {esVieja(orden) && <BadgeAtencion icono={Clock}>Abierta hace {dias} días</BadgeAtencion>}
              {r.hayStockAlerta && !cancelada && <BadgeAtencion>Stock bajo</BadgeAtencion>}
            </div>
            <p className="text-xs text-feisen-texto-2 mt-1 truncate">
              {fmtFecha(orden.fecha)} · {piezas.length} {piezas.length === 1 ? 'pieza' : 'piezas'} · {textoMaq}
            </p>
            {orden.estado === 'pendiente' && cargada && r.totalMoldeado > 0 && (
              <div className="flex items-center gap-2 mt-2 max-w-[260px]">
                <BarraProgreso pct={r.pctAvance} />
                <span className="text-xs text-feisen-texto-2 tabular-nums w-9 text-right shrink-0">{r.pctAvance}%</span>
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-semibold tabular-nums ${cancelada ? 'text-gray-400' : 'text-feisen-texto'}`}>{num(r.totalPlaneado)}</p>
            <p className="text-[11px] text-gray-400">planeadas</p>
          </div>
          <ChevronRight size={16} className="text-gray-400 shrink-0" />
        </button>
      </li>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {aviso}
      <EncabezadoPagina modulo="Fundición" titulo="Órdenes de moldeo"
        subtitulo={totalPendientes > 0
          ? `${totalPendientes} en curso · registra aquí el avance diario de cada moldeador.`
          : 'Lo que se va a moldear, quién lo moldea y cuánto lleva.'}>
        <button type="button" onClick={() => navigate('/moldeo/nueva')}
          className="inline-flex items-center gap-1.5 bg-feisen-azul text-white rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:opacity-90 active:scale-[.98] transition">
          <Plus size={16} /> Nueva orden
        </button>
      </EncabezadoPagina>

      {/* Búsqueda y filtros */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input ref={buscarRef} type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por N°, fecha, pieza, máquina o moldeador…" aria-label="Buscar órdenes"
            className="w-full border border-feisen-borde rounded-lg pl-10 pr-10 min-h-[44px] text-sm bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
          {busqueda
            ? <button type="button" onClick={() => setBusqueda('')} aria-label="Borrar búsqueda"
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-gray-400 hover:text-feisen-texto"><X size={16} /></button>
            : <kbd className="hidden lg:block absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 border border-feisen-borde rounded px-1.5">/</kbd>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
          {chips.map(([k, t]) => {
            const activo = filtroEstado === k
            if (k === 'cancelado' && conteos.cancelado === 0 && !activo) return null
            return (
              <button key={k} type="button" aria-pressed={activo} onClick={() => setFiltroEstado(k)}
                className={`shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full text-sm font-medium border transition-colors
                  ${activo ? 'bg-feisen-texto text-white border-feisen-texto' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
                {t} <span className={`tabular-nums ${activo ? 'text-white/70' : 'text-gray-400'}`}>{conteos[k]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista */}
      {cargando && ordenes.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave" aria-busy="true">
          {[0, 1, 2].map(i => (
            <div key={i} className="px-4 py-4 space-y-2 animate-pulse motion-reduce:animate-none">
              <div className="h-3.5 w-40 bg-feisen-borde-suave rounded" />
              <div className="h-3 w-64 max-w-full bg-feisen-borde-suave rounded" />
            </div>
          ))}
        </div>
      ) : secciones.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl text-center px-6 py-14">
          <ClipboardList size={32} className="mx-auto mb-3 text-gray-300" />
          {busqueda.trim() ? (
            <>
              <p className="font-medium text-feisen-texto">Nada coincide con “{busqueda.trim()}”</p>
              <p className="text-sm text-feisen-texto-2 mt-1">Busca por número (ORD-MOL-0012), una palabra de la pieza, la máquina o el moldeador.</p>
            </>
          ) : ordenes.length === 0 ? (
            <>
              <p className="font-medium text-feisen-texto">Aún no hay órdenes de moldeo</p>
              <p className="text-sm text-feisen-texto-2 mt-1 max-w-sm mx-auto">
                Crea la primera con “Nueva orden”: eliges las máquinas a producir y el sistema calcula las piezas a moldear.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-feisen-texto">No hay órdenes {filtroEstado === 'pendiente' ? 'en curso' : filtroEstado === 'completado' ? 'completadas' : filtroEstado === 'cancelado' ? 'canceladas' : 'con este filtro'}</p>
              <p className="text-sm text-feisen-texto-2 mt-1">Prueba con “Todas”.</p>
            </>
          )}
        </div>
      ) : secciones.map(sec => (
        <section key={sec.clave} className="space-y-1.5">
          <h2 className={`text-xs font-semibold px-0.5 ${sec.clave === 'atencion' ? 'text-amber-700' : 'text-feisen-texto-2'}`}>
            {sec.titulo} <span className="font-normal text-gray-400">· {sec.lista.length}{sec.nota ? ` · ${sec.nota}` : ''}</span>
          </h2>
          <ul className={`bg-white border rounded-xl overflow-hidden divide-y divide-feisen-borde-suave
            ${sec.clave === 'atencion' ? 'border-amber-200' : 'border-feisen-borde'} ${sec.clave === 'canceladas' ? 'opacity-75' : ''}`}>
            {sec.lista.map(filaOrden)}
          </ul>
        </section>
      ))}

      {!cargando && filtradas.length > 0 && (
        <p className="text-xs text-gray-400 text-right tabular-nums">
          Mostrando {filtradas.length} de {ordenes.length} {ordenes.length === 1 ? 'orden' : 'órdenes'}
        </p>
      )}

      {/* ── Panel de detalle ─────────────────────────────────────────────────── */}
      {abierta && detalleOrden(abierta)}

      {/* ── Modal confirmar cancelación ──────────────────────────────────────── */}
      {confirmCancelar && (
        <Modal titulo="Cancelar orden" onCerrar={() => setConfirmCancelar(null)}>
          <div className="space-y-4">
            <p className="text-sm text-feisen-texto">
              ¿Cancelar <span className="font-mono font-semibold">{numOrden(confirmCancelar.numero)}</span>?
              La orden quedará como <b>cancelada</b>: no se borra del historial y deja de aparecer en curso.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmCancelar(null)}
                className="flex-1 border border-feisen-borde rounded-lg min-h-[44px] text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">
                No, volver
              </button>
              <button type="button" onClick={() => cancelarOrden(confirmCancelar)} disabled={cancelando}
                className="flex-1 bg-feisen-rojo text-white rounded-lg min-h-[44px] text-sm font-semibold disabled:opacity-60 active:scale-[.98] transition">
                {cancelando ? 'Cancelando…' : 'Sí, cancelar orden'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal editar orden ───────────────────────────────────────────────── */}
      {editModal && (
        <Modal titulo={`Editar ${numOrden(editModal.numero)}`} onCerrar={() => setEditModal(null)}>
          <div className="space-y-4">
            {msgEdit && (
              <div role="alert" className="flex items-start gap-2 bg-feisen-rojo-suave text-feisen-rojo rounded-lg px-3 py-2.5 text-sm">
                <AlertTriangle size={16} className="shrink-0 mt-px" /> {msgEdit}
              </div>
            )}

            <label className="block">
              <span className="text-xs font-medium text-feisen-texto-2 block mb-1">Fecha de la orden</span>
              <input type="date" value={editForm.fecha}
                onChange={e => setEditForm(prev => ({ ...prev, fecha: e.target.value }))}
                className={claseInput} />
            </label>

            {editForm.piezas.length > 0 && (
              <div>
                <p className="text-xs font-medium text-feisen-texto-2 mb-1">Piezas · {editForm.piezas.length}</p>
                <ul className="divide-y divide-feisen-borde-suave border-y border-feisen-borde-suave">
                  {editForm.piezas.map((p, idx) => (
                    <li key={p.id} className="py-3 space-y-2">
                      <p className="text-sm font-medium text-feisen-texto break-words">{p.nombre}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-2 sm:items-end">
                        <div>
                          <span className="text-[11px] text-feisen-texto-2 block mb-0.5">Cantidad planeada</span>
                          <Contador valor={p.cantidad_planeada} onCambiar={v => setPieza(idx, 'cantidad_planeada', v)}
                            etiqueta={`Cantidad planeada de ${p.nombre}`} />
                        </div>
                        <label className="block">
                          <span className="text-[11px] text-feisen-texto-2 block mb-0.5">Moldeador asignado</span>
                          <input type="text" value={p.asignado_a}
                            onChange={e => setPieza(idx, 'asignado_a', e.target.value)}
                            placeholder="Nombre del moldeador" className={claseInput} />
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditModal(null)}
                className="flex-1 border border-feisen-borde rounded-lg min-h-[44px] text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">
                Cancelar
              </button>
              <button type="button" onClick={guardarEdicion} disabled={editGuardando}
                className="flex-1 bg-feisen-azul text-white rounded-lg min-h-[44px] text-sm font-semibold disabled:opacity-60 active:scale-[.98] transition">
                {editGuardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )

  // ── Detalle de la orden en el panel lateral ────────────────────────────────────
  function detalleOrden(orden) {
    const completada = orden.estado === 'completado'
    const cancelada  = orden.estado === 'cancelado'
    const piezas     = orden.ordenes_moldeo_piezas || []
    const maquinas   = orden.ordenes_moldeo_maquinas || []
    const cargada    = !!avancesData[orden.id]
    const avOrden    = avancesData[orden.id] || {}
    const stOrden    = stockData[orden.id]   || {}
    const r          = resumenOrden(orden, avOrden, stOrden)
    const registrando = !completada && !cancelada && !!panelAvance[orden.id]

    const encabezado = (
      <div className="space-y-1.5">
        <h3 className={`font-mono text-base font-semibold ${cancelada ? 'text-gray-400 line-through' : 'text-feisen-texto'}`}>{numOrden(orden.numero)}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <BadgeEstado estado={orden.estado} />
          <span className="inline-flex items-center gap-1 text-xs text-feisen-texto-2"><Calendar size={13} /> {fmtFecha(orden.fecha)}</span>
          {esVieja(orden) && <BadgeAtencion icono={Clock}>Abierta hace {diasDesde(orden.fecha)} días</BadgeAtencion>}
        </div>
        {!completada && !cancelada && (
          <div className="flex flex-wrap gap-2 pt-1.5">
            <button type="button" onClick={() => abrirEdicion(orden)} className={claseSecundario}>
              <Pencil size={14} /> Editar
            </button>
            <button type="button" onClick={() => setConfirmCancelar(orden)}
              className={`${claseSecundario} text-feisen-rojo hover:bg-feisen-rojo-suave`}>
              <XCircle size={14} /> Cancelar orden
            </button>
          </div>
        )}
      </div>
    )

    return (
      <PanelLateral etiqueta={`Detalle de ${numOrden(orden.numero)}`} onCerrar={() => setExpandido(null)} encabezado={encabezado}>
        {maquinas.length > 0 && (
          <section>
            <h4 className={`${claseEtiqueta} mb-1.5`}>Máquinas</h4>
            <div className="flex flex-wrap gap-1.5">
              {maquinas.map((m, i) => (
                <span key={i} className="bg-feisen-azul-suave text-feisen-azul text-xs font-medium px-2 py-0.5 rounded-md tabular-nums">
                  {m.cantidad_maquinas} × {m.maquinas_fundicion?.nombre}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ══ ORDEN EN CURSO (o cancelada sin completar) ══ */}
        {!completada && !cargada && (
          <p className="text-sm text-feisen-texto-2 py-6 text-center" aria-busy="true">Cargando avance…</p>
        )}

        {!completada && cargada && !registrando && (
          <>
            <section className="space-y-2">
              <div className="grid grid-cols-3 gap-3">
                <Cifra etiqueta="Moldeadas" valor={num(r.totalMoldeado)} detalle={`de ${num(r.totalPlaneado)}`} />
                <Cifra etiqueta="Avance" valor={`${r.pctAvance}%`} />
                <Cifra etiqueta="Kg" valor={kg(r.kgMoldeados)} detalle="moldeados" />
              </div>
              <BarraProgreso pct={r.pctAvance} />
              {r.hayStockAlerta && !cancelada && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertTriangle size={14} className="shrink-0 mt-px" />
                  Hay piezas con stock en bodega menor a lo que falta por moldear.
                </p>
              )}
            </section>

            <Segmentado valor={vistaAbierta[orden.id] || 'pieza'}
              onCambiar={v => setVistaAbierta(prev => ({ ...prev, [orden.id]: v }))}
              opciones={[{ valor: 'pieza', texto: 'Por pieza' }, { valor: 'moldeador', texto: 'Por moldeador' }, { valor: 'historial', texto: 'Historial' }]} />

            {/* Vista: Por pieza */}
            {(vistaAbierta[orden.id] || 'pieza') === 'pieza' && (
              <ul className="divide-y divide-feisen-borde-suave -mt-1">
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
                    <li key={p.id} className="py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-feisen-texto break-words">{p.items?.nombre}</p>
                          <p className="text-xs text-feisen-texto-2 mt-0.5">
                            {p.asignado_a || 'Sin moldeador'}{av > 0 && peso > 0 ? ` · ${kg(kgAv)} kg` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-feisen-texto tabular-nums">
                            {num(av)} <span className="font-normal text-gray-400">/ {num(plan)}</span>
                          </p>
                          <p className="text-xs tabular-nums text-feisen-texto-2">
                            {pendiente === 0
                              ? <span className="inline-flex items-center gap-1"><Check size={12} /> Completa</span>
                              : `Faltan ${num(pendiente)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <BarraProgreso pct={pct} />
                        <span className="text-xs text-feisen-texto-2 tabular-nums w-9 text-right shrink-0">{pct}%</span>
                      </div>
                      {stock !== null && (
                        <p className={`mt-1.5 text-xs tabular-nums ${alerta ? 'text-amber-700' : 'text-gray-400'}`}>
                          {alerta && <AlertTriangle size={12} className="inline -mt-0.5 mr-1" />}
                          Stock en bodega: {num(stock)}{alerta ? ' · menor a lo que falta' : ''}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Vista: Por moldeador */}
            {(vistaAbierta[orden.id] || 'pieza') === 'moldeador' && (
              <ul className="space-y-4">
                {Object.entries(r.porMoldeador).map(([mol, d]) => {
                  const pct = d.plan > 0 ? Math.round((d.moldeado / d.plan) * 100) : 0
                  return (
                    <li key={mol} className="border border-feisen-borde rounded-xl p-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar nombre={mol} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${mol === 'Sin asignar' ? 'text-gray-400 italic' : 'text-feisen-texto'}`}>{mol}</p>
                          <p className="text-xs text-feisen-texto-2">{d.piezas.length} pieza{d.piezas.length !== 1 ? 's' : ''} asignada{d.piezas.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-feisen-texto tabular-nums">{num(d.moldeado)} <span className="font-normal text-gray-400">/ {num(d.plan)}</span></p>
                          <p className="text-xs text-feisen-texto-2 tabular-nums">{pct}%{d.kg > 0 ? ` · ${kg(d.kg)} kg` : ''}</p>
                        </div>
                      </div>
                      <div className="mt-2.5"><BarraProgreso pct={pct} /></div>
                      <ul className="mt-2 divide-y divide-feisen-borde-suave">
                        {d.piezas.map(p => {
                          const pPct = p.cantidad_planeada > 0 ? Math.round((p.avance / p.cantidad_planeada) * 100) : 0
                          const pKg  = p.avance * Number(p.items?.peso_unitario || 0)
                          return (
                            <li key={p.id} className="flex items-center gap-3 py-2">
                              <span className="text-xs text-feisen-texto flex-1 min-w-0 break-words">{p.items?.nombre}</span>
                              <span className="text-xs text-feisen-texto-2 tabular-nums text-right shrink-0">
                                {num(p.avance)}/{num(p.cantidad_planeada)}{pKg > 0 ? ` · ${kg(pKg)} kg` : ''}
                              </span>
                              <span className="text-xs font-medium text-feisen-texto-2 tabular-nums w-9 text-right shrink-0">{pPct}%</span>
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Vista: Historial diario */}
            {(vistaAbierta[orden.id] || 'pieza') === 'historial' && (
              r.fechasDesc.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingUp size={28} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm font-medium text-feisen-texto">Sin avances registrados</p>
                  {!cancelada && <p className="text-xs text-feisen-texto-2 mt-1">Usa “Registrar avance del día” al final de cada turno.</p>}
                </div>
              ) : (
                <div className="space-y-4">
                  {r.fechasDesc.map(fecha => {
                    const entradas = r.historialPorFecha[fecha]
                    const totalDia = entradas.reduce((s, e) => s + e.cantidad, 0)
                    return (
                      <section key={fecha}>
                        <h4 className="flex items-center justify-between text-xs font-semibold text-feisen-texto-2 mb-1">
                          <span className="inline-flex items-center gap-1.5"><Calendar size={13} /> {fmtFecha(fecha)}</span>
                          <span className="font-normal tabular-nums">{num(totalDia)} moldeadas</span>
                        </h4>
                        <ul className="divide-y divide-feisen-borde-suave border-y border-feisen-borde-suave">
                          {entradas.map((e, i) => (
                            <li key={i} className="flex items-start gap-3 py-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-feisen-texto break-words">{e.pieza}</p>
                                <p className="text-xs text-feisen-texto-2">{e.moldeador}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold text-feisen-texto tabular-nums">{num(e.cantidad)}</p>
                                {e.kg > 0 && <p className="text-xs text-feisen-texto-2 tabular-nums">{kg(e.kg)} kg</p>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )
                  })}
                </div>
              )
            )}

            {!cancelada && (
              <div className="sticky -bottom-4 -mx-5 px-5 pt-3 pb-4 bg-white border-t border-feisen-borde-suave">
                <button type="button" onClick={() => setPanelAvance(prev => ({ ...prev, [orden.id]: true }))}
                  className="w-full inline-flex items-center justify-center gap-2 bg-feisen-azul text-white rounded-lg min-h-[48px] text-[15px] font-semibold hover:opacity-90 active:scale-[.98] transition">
                  <TrendingUp size={18} /> Registrar avance del día
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Formulario: registrar avance del día ── */}
        {registrando && cargada && (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-feisen-texto">Registrar avance del día</h4>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-feisen-texto-2 block mb-1">Fecha del avance</span>
                <input type="date"
                  value={fechaAvance[orden.id] || hoyCol()}
                  onChange={e => setFechaAvance(prev => ({ ...prev, [orden.id]: e.target.value }))}
                  className={claseInput} />
              </label>

              {errorAv[orden.id] && (
                <div role="alert" className="flex items-start gap-2 bg-feisen-rojo-suave text-feisen-rojo text-sm rounded-lg px-3 py-2.5">
                  <AlertTriangle size={16} className="shrink-0 mt-px" /> {errorAv[orden.id]}
                </div>
              )}

              <p className="text-xs text-feisen-texto-2">Escribe cuántas piezas se moldearon. Deja en blanco las que no tuvieron avance.</p>
              <ul className="divide-y divide-feisen-borde-suave border-y border-feisen-borde-suave">
                {piezas.map(p => {
                  const av        = avOrden[p.id]?.total || 0
                  const pendiente = Math.max(0, Number(p.cantidad_planeada || 0) - av)
                  const cant      = Number(getAv(orden.id, p.id)) || 0
                  const peso      = Number(p.items?.peso_unitario || 0)
                  return (
                    <li key={p.id} className="flex items-center gap-3 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-feisen-texto break-words">{p.items?.nombre}</p>
                        <p className="text-xs text-feisen-texto-2 tabular-nums">
                          {p.asignado_a ? `${p.asignado_a} · ` : ''}Faltan {num(pendiente)}
                          {cant > 0 && peso > 0 && <span className="text-feisen-azul font-medium"> · {kg(cant * peso)} kg</span>}
                        </p>
                      </div>
                      <Contador valor={getAv(orden.id, p.id)} onCambiar={v => setAv(orden.id, p.id, v)}
                        etiqueta={`Moldeadas de ${p.items?.nombre || 'la pieza'}`} ancho="w-14" />
                    </li>
                  )
                })}
              </ul>
            </section>

            <div className="sticky -bottom-4 -mx-5 px-5 pt-3 pb-4 bg-white border-t border-feisen-borde-suave flex gap-2">
              <button type="button" onClick={() => setPanelAvance(prev => ({ ...prev, [orden.id]: false }))}
                className="border border-feisen-borde rounded-lg px-4 min-h-[48px] text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">
                Volver
              </button>
              <button type="button" onClick={() => guardarAvance(orden)} disabled={guardandoAv === orden.id}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-feisen-azul text-white rounded-lg min-h-[48px] text-[15px] font-semibold hover:opacity-90 disabled:opacity-60 active:scale-[.98] transition">
                <Plus size={16} />
                {guardandoAv === orden.id ? 'Guardando…' : 'Guardar avance'}
              </button>
            </div>
          </>
        )}

        {/* ══ ORDEN COMPLETADA ══ */}
        {completada && (() => {
          const modo    = vistaOrden[orden.id] || 'pieza'
          const setModo = v => setVistaOrden(prev => ({ ...prev, [orden.id]: v }))
          const totPlan = piezas.reduce((s, p) => s + Number(p.cantidad_planeada || 0), 0)
          const totConf = piezas.reduce((s, p) => s + Number(p.cantidad_conforme || 0), 0)
          const totNC   = piezas.reduce((s, p) => s + Number(p.cantidad_nc || 0), 0)
          const rendTot = totPlan > 0 ? Math.round((totConf / totPlan) * 100) : null
          return (
            <>
              <section className="grid grid-cols-3 gap-3">
                <Cifra etiqueta="Planeadas" valor={num(totPlan)} />
                <Cifra etiqueta="Conformes" valor={num(totConf)} detalle={rendTot != null ? `${rendTot}% del plan` : null} />
                <div className="min-w-0">
                  <p className={claseEtiqueta}>No conformes</p>
                  <p className={`text-xl font-semibold tabular-nums mt-0.5 ${totNC > 0 ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{num(totNC)}</p>
                </div>
              </section>

              <Segmentado valor={modo} onCambiar={setModo}
                opciones={[{ valor: 'pieza', texto: 'Por pieza' }, { valor: 'moldeador', texto: 'Por moldeador' }]} />

              {modo === 'pieza' && (
                <ul className="divide-y divide-feisen-borde-suave -mt-1">
                  {piezas.map(p => {
                    const rend = p.cantidad_planeada > 0
                      ? Math.round(((p.cantidad_conforme || 0) / p.cantidad_planeada) * 100) : null
                    return (
                      <li key={p.id} className="py-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-feisen-texto break-words">{p.items?.nombre}</p>
                            <p className="text-xs text-feisen-texto-2 mt-0.5">{p.asignado_a || 'Sin moldeador'} · Plan {num(p.cantidad_planeada)}</p>
                          </div>
                          <div className="text-right shrink-0 tabular-nums">
                            <p className="text-sm font-semibold text-feisen-texto">
                              {p.cantidad_conforme ?? '—'} <span className="font-normal text-gray-400 text-xs">conf.</span>
                            </p>
                            <p className="text-xs text-feisen-texto-2">
                              {rend != null && `${rend}% · `}
                              <span className={Number(p.cantidad_nc) > 0 ? 'text-feisen-rojo font-medium' : ''}>{p.cantidad_nc ?? '—'} NC</span>
                            </p>
                          </div>
                        </div>
                        {p.motivo_nc && <p className="mt-1.5 text-xs text-feisen-texto-2 bg-feisen-fondo rounded-md px-2 py-1">Motivo NC: {p.motivo_nc}</p>}
                      </li>
                    )
                  })}
                  <li className="flex items-center justify-between py-3 text-sm font-semibold text-feisen-texto tabular-nums">
                    <span>Totales</span>
                    <span>
                      {num(totPlan)} plan · {num(totConf)} conf. · <span className={totNC > 0 ? 'text-feisen-rojo' : ''}>{num(totNC)} NC</span>
                    </span>
                  </li>
                </ul>
              )}

              {modo === 'moldeador' && (
                <ul className="space-y-4">
                  {Object.entries(r.porMoldeador).map(([mol, d]) => {
                    const mConf = d.piezas.reduce((s, p) => s + Number(p.cantidad_conforme || 0), 0)
                    const mNC   = d.piezas.reduce((s, p) => s + Number(p.cantidad_nc || 0), 0)
                    const rend  = d.plan > 0 ? Math.round((mConf / d.plan) * 100) : null
                    return (
                      <li key={mol} className="border border-feisen-borde rounded-xl overflow-hidden">
                        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-feisen-borde-suave">
                          <Avatar nombre={mol} chico />
                          <p className={`flex-1 min-w-0 truncate text-sm font-semibold ${mol === 'Sin asignar' ? 'text-gray-400 italic' : 'text-feisen-texto'}`}>{mol}</p>
                          <div className="text-right shrink-0 text-xs tabular-nums">
                            <p className="font-semibold text-feisen-texto">{num(mConf)} conf. · <span className={mNC > 0 ? 'text-feisen-rojo' : ''}>{num(mNC)} NC</span></p>
                            {rend != null && <p className="text-feisen-texto-2">{rend}% del plan</p>}
                          </div>
                        </div>
                        <ul className="divide-y divide-feisen-borde-suave px-3.5">
                          {d.piezas.map(p => (
                            <li key={p.id} className="py-2.5">
                              <div className="flex items-start gap-3">
                                <span className="flex-1 min-w-0 text-sm text-feisen-texto break-words">{p.items?.nombre}</span>
                                <span className="text-xs text-feisen-texto-2 tabular-nums text-right shrink-0">
                                  Plan {num(p.cantidad_planeada)} · <b className="font-semibold text-feisen-texto">{p.cantidad_conforme ?? '—'}</b> conf. · <span className={Number(p.cantidad_nc) > 0 ? 'text-feisen-rojo' : ''}>{p.cantidad_nc ?? '—'} NC</span>
                                </span>
                              </div>
                              {p.motivo_nc && <p className="text-xs text-feisen-texto-2 mt-0.5">{p.motivo_nc}</p>}
                            </li>
                          ))}
                        </ul>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )
        })()}
      </PanelLateral>
    )
  }
}
