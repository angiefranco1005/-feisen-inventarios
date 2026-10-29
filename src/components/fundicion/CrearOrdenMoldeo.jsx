import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { BODEGA_FUNDICION_ID } from '../../utils/bodegasCatalogo'
import { coincideBusqueda } from '../../utils/busqueda'
import {
  CheckCircle2, Plus, Trash2, ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Check,
  Search, AlertTriangle, RefreshCw, Factory, Package,
} from '../shared/iconos'
import { EncabezadoPagina, Contador } from '../shared/ui'

function hoyCol() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}
function numOrden(n) {
  return `ORD-MOL-${String(n).padStart(4, '0')}`
}
const num = n => Number(n || 0).toLocaleString('es-CO')
const kg  = n => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })

const claseInput = 'w-full border border-feisen-borde rounded-lg px-3 min-h-[44px] text-sm bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'

function Tarjeta({ titulo, detalle, accion, children, sinPadding = false }) {
  return (
    <section className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
      {titulo && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-feisen-texto">{titulo}</h2>
            {detalle && <p className="text-xs text-feisen-texto-2 mt-0.5">{detalle}</p>}
          </div>
          {accion}
        </div>
      )}
      <div className={sinPadding ? '' : 'px-4 sm:px-5 pb-4'}>{children}</div>
    </section>
  )
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ paso, onBack }) {
  const pasos = [
    { n: 1, label: 'Configurar',        sub: 'Fecha y máquinas' },
    { n: 2, label: 'Revisar y asignar', sub: 'Piezas y moldeadores' },
  ]
  return (
    <ol className="flex items-center gap-3">
      {pasos.map((p, i) => {
        const actual = paso === p.n
        const hecho  = paso > p.n
        return (
          <li key={p.n} className="contents">
            {i > 0 && <div aria-hidden="true" className={`flex-1 h-px min-w-[16px] ${hecho || actual ? 'bg-feisen-azul' : 'bg-feisen-borde'}`} />}
            <button type="button" disabled={p.n >= paso} onClick={() => p.n < paso && onBack()}
              aria-current={actual ? 'step' : undefined}
              className={`flex items-center gap-2.5 text-left min-h-[44px] rounded-lg ${hecho ? 'hover:bg-white px-1 -mx-1' : 'cursor-default'}`}>
              <span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-semibold shrink-0 border
                ${actual ? 'bg-feisen-azul border-feisen-azul text-white' : hecho ? 'bg-feisen-azul-suave border-feisen-azul-suave text-feisen-azul' : 'bg-white border-feisen-borde text-gray-400'}`}>
                {hecho ? <Check size={14} weight="bold" /> : p.n}
              </span>
              <span className={actual ? '' : 'hidden sm:block'}>
                <span className={`block text-sm leading-tight ${actual ? 'font-semibold text-feisen-azul' : 'font-medium text-feisen-texto-2'}`}>{p.label}</span>
                <span className="block text-xs text-gray-400 leading-tight mt-0.5">{p.sub}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// ── Selector de pieza desde inventario ───────────────────────────────────────
// Busca por palabras sueltas sin importar tildes ("polea 8" encuentra "POLEA 8 X 2B")
function SelectorPieza({ value, onChange, items, placeholder, excluirIds = [] }) {
  const [busqueda, setBusqueda] = useState(value || '')
  const [abierto,  setAbierto]  = useState(false)

  const disponibles = items.filter(i => !excluirIds.includes(i.id))
  const filtrados   = busqueda.trim()
    ? disponibles.filter(i => coincideBusqueda(i.nombre, busqueda))
    : disponibles

  function elegir(item) { setBusqueda(item.nombre); onChange(item); setAbierto(false) }

  function handleBlur() {
    setTimeout(() => {
      setAbierto(false)
      const coincide = items.some(i => i.nombre === busqueda)
      if (busqueda && !coincide) { setBusqueda(''); onChange(null) }
    }, 150)
  }

  // Sync desde afuera si se limpia
  useEffect(() => { if (!value) setBusqueda('') }, [value])

  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input type="text" value={busqueda}
        onChange={e => { setBusqueda(e.target.value); onChange(null); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        aria-label="Buscar pieza del inventario de fundición"
        className={`${claseInput} pl-9`}
      />
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-30 w-full bg-white border border-feisen-borde rounded-xl shadow-sm mt-1 max-h-60 overflow-y-auto overscroll-contain">
          {filtrados.slice(0, 200).map(i => (
            <button key={i.id} type="button" onMouseDown={() => elegir(i)}
              className="w-full text-left px-3 min-h-[44px] text-sm text-feisen-texto hover:bg-feisen-azul-suave border-b border-feisen-borde-suave last:border-0">
              {i.nombre}
            </button>
          ))}
        </div>
      )}
      {abierto && busqueda.trim() && filtrados.length === 0 && (
        <div className="absolute z-30 w-full bg-white border border-feisen-borde rounded-xl shadow-sm mt-1 px-3 py-3 text-sm text-feisen-texto-2">
          Ninguna pieza de fundición coincide. Prueba con otra palabra del nombre.
        </div>
      )}
    </div>
  )
}

// ── Input con sugerencias localStorage ───────────────────────────────────────
function InputSug({ value, onChange, placeholder, storageKey, etiqueta }) {
  const [mostrar, setMostrar] = useState(false)
  const [sugs,    setSugs]    = useState([])

  function abrir() {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
    setSugs(saved.filter(s => s.toLowerCase().includes((value || '').toLowerCase()) && s !== value))
    setMostrar(true)
  }
  function guardar(v) {
    if (!v?.trim()) return
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
    if (!saved.includes(v.trim()))
      localStorage.setItem(storageKey, JSON.stringify([v.trim(), ...saved].slice(0, 40)))
  }
  return (
    <div className="relative">
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        onFocus={abrir}
        onBlur={() => { setTimeout(() => setMostrar(false), 150); guardar(value) }}
        placeholder={placeholder}
        aria-label={etiqueta}
        className={claseInput}
      />
      {mostrar && sugs.length > 0 && (
        <div className="absolute z-30 w-full bg-white border border-feisen-borde rounded-xl shadow-sm mt-1 max-h-44 overflow-y-auto overscroll-contain">
          {sugs.map(s => (
            <button key={s} type="button" onMouseDown={() => { onChange(s); setMostrar(false) }}
              className="w-full text-left px-3 min-h-[40px] text-sm text-feisen-texto hover:bg-feisen-azul-suave">{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Principal ─────────────────────────────────────────────────────────────────
export default function CrearOrdenMoldeo() {
  const { perfil } = useAuth()

  const [fecha,        setFecha]        = useState(hoyCol())
  const [paso,         setPaso]         = useState(1)

  const [maquinas,     setMaquinas]     = useState([])
  const [allItems,     setAllItems]     = useState([])
  const [fundBodegaId, setFundBodegaId] = useState(null)

  const [cantidades,   setCantidades]   = useState({})   // { maqId: número }
  const [calculando,   setCalculando]   = useState(false)
  const [maqExpandida, setMaqExpandida] = useState(true) // accordion paso 1

  // Piezas en la orden  (BOM + libres juntas)
  const [piezas,       setPiezas]       = useState([])

  // Selector pieza libre
  const [libreItem,    setLibreItem]    = useState(null)   // objeto item completo
  const [libreCant,    setLibreCant]    = useState('')

  const [guardando,      setGuardando]      = useState(false)
  const [error,          setError]          = useState('')
  const [exito,          setExito]          = useState(null)
  // Orden ya insertada en un intento que falló después (máquinas o piezas): { id, numero }
  const [ordenCreada,    setOrdenCreada]    = useState(null)
  const [proximoNumero,  setProximoNumero]  = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [{ data: maq }, { data: bod }, { data: lastOrd }] = await Promise.all([
      supabase.from('maquinas_fundicion').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('bodegas').select('id').eq('id', BODEGA_FUNDICION_ID).maybeSingle(),
      supabase.from('ordenes_moldeo').select('numero').order('numero', { ascending: false }).limit(1).maybeSingle(),
    ])
    setMaquinas(maq || [])
    setFundBodegaId(bod?.id || null)
    setProximoNumero((lastOrd?.numero || 0) + 1)
    if (bod?.id) {
      const { data: fi } = await supabase.from('items')
        .select('id, nombre, peso_unitario').eq('bodega_id', bod.id).eq('activo', true).order('nombre')
      setAllItems(fi || [])
    }
  }

  function setCant(maqId, val) {
    setCantidades(prev => ({ ...prev, [maqId]: val === '' ? '' : Math.max(0, parseInt(val) || 0) }))
  }

  const hayMaquinas = Object.values(cantidades).some(c => Number(c) > 0)

  // Calcula piezas BOM y pasa al paso 2, preservando libres ya agregadas y moldeadores
  async function calcularYAvanzar() {
    setError('')
    setCalculando(true)
    try {
      let bomPiezas = []
      if (hayMaquinas) {
        const maqIds = Object.entries(cantidades).filter(([_, c]) => Number(c) > 0).map(([id]) => id)
        const { data: bom } = await supabase
          .from('bom_maquina_piezas')
          .select('maquina_id, item_id, cantidad_por_maquina, items(id, nombre, peso_unitario)')
          .in('maquina_id', maqIds)

        const agregado = {}
        for (const row of (bom || [])) {
          const cantMaq = Number(cantidades[row.maquina_id]) || 0
          if (!agregado[row.item_id]) {
            agregado[row.item_id] = {
              item_id: row.item_id, nombre: row.items?.nombre || '',
              peso_unitario: row.items?.peso_unitario || 0,
              cantidad_planeada: 0, asignado_a: '', origen: 'bom',
            }
          }
          agregado[row.item_id].cantidad_planeada += row.cantidad_por_maquina * cantMaq
        }
        bomPiezas = Object.values(agregado)
      }

      // Preservar moldeadores y piezas libres ya agregadas
      const prevMap = {}
      piezas.forEach(p => { prevMap[p.item_id] = p })

      const bomIds = new Set(bomPiezas.map(p => p.item_id))
      const libresExistentes = piezas.filter(p => p.origen === 'libre')

      const nuevasBom = bomPiezas.map(p => ({
        ...p,
        asignado_a: prevMap[p.item_id]?.asignado_a || '',
      }))

      // Unir BOM + libres (sin duplicar)
      const libresNoEnBom = libresExistentes.filter(p => !bomIds.has(p.item_id))

      // Stock actual
      const todasIds = [...nuevasBom, ...libresNoEnBom].map(p => p.item_id)
      let stockMap = {}
      if (todasIds.length > 0 && fundBodegaId) {
        const { data: stocks } = await supabase.from('stock')
          .select('item_id, cantidad_actual').in('item_id', todasIds).eq('bodega_id', fundBodegaId)
        for (const s of (stocks || [])) stockMap[s.item_id] = s.cantidad_actual ?? 0
      }
      const conStock = p => ({ ...p, stock_actual: stockMap[p.item_id] ?? null })

      const merged = [
        ...nuevasBom.map(conStock),
        ...libresNoEnBom.map(conStock),
      ].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

      setPiezas(merged)
      setPaso(2)
    } finally {
      setCalculando(false)
    }
  }

  function irAtras() { setError(''); setPaso(1) }

  // Agregar pieza libre desde el panel del paso 2
  async function agregarLibre() {
    if (!libreItem || !libreCant || Number(libreCant) <= 0) {
      setError('Selecciona una pieza y una cantidad válida.'); return
    }
    if (piezas.some(p => p.item_id === libreItem.id)) {
      setError('Esa pieza ya está en la lista.'); return
    }
    // Stock
    let stockActual = null
    if (fundBodegaId) {
      const { data: s } = await supabase.from('stock')
        .select('cantidad_actual').eq('item_id', libreItem.id).eq('bodega_id', fundBodegaId).single()
      stockActual = s?.cantidad_actual ?? null
    }
    setPiezas(prev => [...prev, {
      item_id: libreItem.id, nombre: libreItem.nombre,
      peso_unitario: libreItem.peso_unitario || 0,
      cantidad_planeada: Number(libreCant),
      asignado_a: '', origen: 'libre', stock_actual: stockActual,
    }].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    setLibreItem(null); setLibreCant(''); setError('')
  }

  function actualizarPieza(item_id, campo, val) {
    setPiezas(prev => prev.map(p => p.item_id === item_id ? { ...p, [campo]: val } : p))
  }
  function quitarPieza(item_id) {
    setPiezas(prev => prev.filter(p => p.item_id !== item_id))
  }

  async function handleGuardar() {
    setError('')
    if (piezas.length === 0) { setError('Sin piezas en la orden.'); return }
    setGuardando(true)
    try {
      // Si un intento anterior ya creó la orden pero falló después, se reutiliza (no se duplica)
      let orden = ordenCreada
      if (!orden) {
        const tipo = hayMaquinas ? 'maquinas' : 'libre'
        const { data, error: err1 } = await supabase.from('ordenes_moldeo')
          .insert({ fecha, tipo, usuario_id: perfil.id })
          .select('id, numero').single()
        if (err1) throw err1
        orden = data
        setOrdenCreada(data)
      }

      if (hayMaquinas) {
        const maqRows = Object.entries(cantidades)
          .filter(([_, c]) => Number(c) > 0)
          .map(([maquina_id, cantidad_maquinas]) => ({ orden_id: orden.id, maquina_id, cantidad_maquinas }))
        const { data: maqPrev, error: errMp } = await supabase.from('ordenes_moldeo_maquinas').select('orden_id').eq('orden_id', orden.id)
        if (errMp) throw errMp
        if (maqRows.length > 0 && (maqPrev || []).length === 0) {
          const { error: errMaq } = await supabase.from('ordenes_moldeo_maquinas').insert(maqRows)
          if (errMaq) throw errMaq
        }
      }

      const { data: pzPrev, error: errPp } = await supabase.from('ordenes_moldeo_piezas').select('id').eq('orden_id', orden.id)
      if (errPp) throw errPp
      if ((pzPrev || []).length === 0) {
        const { error: err2 } = await supabase.from('ordenes_moldeo_piezas').insert(
          piezas.map(p => ({
            orden_id:          orden.id,
            item_id:           p.item_id,
            cantidad_planeada: Number(p.cantidad_planeada),
            asignado_a:        p.asignado_a?.trim() || null,
          }))
        )
        if (err2) throw err2
      }
      setOrdenCreada(null)
      setExito({ numero: orden.numero })
    } catch (e) {
      setError('Error al guardar: ' + e.message + '. Puedes volver a intentar: la orden no se duplica.')
    } finally {
      setGuardando(false)
    }
  }

  function limpiar() {
    setFecha(hoyCol()); setPaso(1); setCantidades({})
    setPiezas([]); setLibreItem(null); setLibreCant('')
    setError(''); setExito(null); setOrdenCreada(null)
  }

  if (exito) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="bg-white border border-feisen-borde rounded-xl px-6 py-10 flex flex-col items-center text-center gap-4">
          <span className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center">
            <CheckCircle2 size={32} />
          </span>
          <div>
            <p className="text-lg font-semibold text-feisen-texto">Orden de moldeo creada</p>
            <p className="font-mono text-2xl font-semibold text-feisen-azul mt-1">{numOrden(exito.numero)}</p>
            <p className="text-sm text-feisen-texto-2 mt-2">Ya aparece en Órdenes de moldeo, donde se registra el avance de cada día.</p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto pt-2">
            <Link to="/moldeo"
              className="inline-flex items-center justify-center gap-1.5 border border-feisen-borde rounded-lg px-4 min-h-[44px] text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
              Ver órdenes
            </Link>
            <button type="button" onClick={limpiar}
              className="inline-flex items-center justify-center gap-1.5 bg-feisen-azul text-white rounded-lg px-5 min-h-[44px] text-sm font-semibold hover:opacity-90 active:scale-[.98] transition">
              <Plus size={16} /> Crear otra orden
            </button>
          </div>
        </div>
      </div>
    )
  }

  const balanceMoldeadores = piezas.length > 0 ? (() => {
    const por = {}
    piezas.forEach(p => {
      const k = p.asignado_a?.trim() || 'Sin asignar'
      if (!por[k]) por[k] = { piezas: 0, kg: 0 }
      por[k].piezas += Number(p.cantidad_planeada) || 0
      por[k].kg     += (Number(p.cantidad_planeada) || 0) * (p.peso_unitario || 0)
    })
    return por
  })() : null

  const itemsEnOrden = piezas.map(p => p.item_id)

  // Solo para mostrar (resúmenes de la barra inferior y encabezados)
  const maqSeleccionadas = maquinas.filter(m => Number(cantidades[m.id]) > 0)
  const totalMaquinas    = Object.values(cantidades).filter(c => Number(c) > 0).reduce((s, c) => s + Number(c), 0)
  const totalPiezas      = piezas.reduce((s, p) => s + (Number(p.cantidad_planeada) || 0), 0)
  const totalKg          = piezas.reduce((s, p) => s + (Number(p.cantidad_planeada) || 0) * (p.peso_unitario || 0), 0)
  const nBom             = piezas.filter(p => p.origen === 'bom').length
  const nLibres          = piezas.filter(p => p.origen === 'libre').length

  const chipsMaquinas = (
    <div className="flex flex-wrap gap-1.5">
      {maqSeleccionadas.map(m => (
        <span key={m.id} className="bg-feisen-azul-suave text-feisen-azul text-xs font-medium px-2 py-0.5 rounded-md tabular-nums">
          {Number(cantidades[m.id])} × {m.nombre}
        </span>
      ))}
    </div>
  )

  const barraAccion = (contenido, boton, atras = null) => (
    <div className="sticky bottom-[calc(4.5rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10">
      <div className="flex items-center gap-2 sm:gap-3 bg-white border border-feisen-borde rounded-xl shadow-sm pl-2 sm:pl-4 pr-2 py-2">
        {atras}
        <div className="flex-1 min-w-0 text-sm leading-tight">{contenido}</div>
        {boton}
      </div>
    </div>
  )
  const clasePrincipal = 'inline-flex items-center justify-center gap-1.5 bg-feisen-azul text-white rounded-lg px-4 sm:px-5 min-h-[48px] text-[15px] font-semibold disabled:opacity-60 hover:opacity-90 active:scale-[.98] transition shrink-0'

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      <EncabezadoPagina modulo="Fundición" titulo="Nueva orden de moldeo"
        subtitulo={proximoNumero
          ? <>Será la <span className="font-mono font-medium text-feisen-texto">{numOrden(proximoNumero)}</span> · elige las máquinas y el sistema calcula las piezas.</>
          : 'Elige las máquinas a producir y el sistema calcula las piezas a moldear.'}>
        <Link to="/moldeo"
          className="inline-flex items-center gap-1.5 border border-feisen-borde bg-white rounded-lg px-3 min-h-[44px] text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">
          Ver órdenes
        </Link>
      </EncabezadoPagina>

      <Stepper paso={paso} onBack={irAtras} />

      {error && (
        <div role="alert" className="flex items-start gap-2 bg-feisen-rojo-suave text-feisen-rojo rounded-lg px-4 py-3 text-sm font-medium">
          <AlertTriangle size={16} className="shrink-0 mt-px" /> {error}
        </div>
      )}

      {/* ══ PASO 1 ══ */}
      {paso === 1 && (
        <div className="space-y-5">

          <Tarjeta titulo="Fecha de la orden">
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              aria-label="Fecha de la orden" className={`${claseInput} sm:max-w-xs`} />
          </Tarjeta>

          {/* Máquinas — accordion */}
          <Tarjeta sinPadding titulo="Máquinas a producir"
            detalle={hayMaquinas
              ? `${maqSeleccionadas.length} ${maqSeleccionadas.length === 1 ? 'máquina' : 'máquinas'} · las piezas salen del BOM automáticamente`
              : 'Opcional: déjalo vacío si la orden es solo de piezas sueltas.'}
            accion={
              <button type="button" onClick={() => setMaqExpandida(v => !v)} aria-expanded={maqExpandida}
                aria-label={maqExpandida ? 'Ocultar máquinas' : 'Mostrar máquinas'}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2 min-h-[44px] min-w-[44px] justify-center text-feisen-texto-2 hover:bg-feisen-fondo">
                {hayMaquinas && <span className="bg-feisen-azul-suave text-feisen-azul text-xs font-semibold px-2 py-0.5 rounded-md tabular-nums">{num(totalMaquinas)} uds</span>}
                {maqExpandida ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            }>
            {maqExpandida && (
              maquinas.length === 0 ? (
                <div className="border-t border-feisen-borde-suave px-4 sm:px-5 py-8 text-center">
                  <Factory size={28} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm font-medium text-feisen-texto">No hay máquinas activas</p>
                  <p className="text-xs text-feisen-texto-2 mt-1 max-w-sm mx-auto">
                    Créalas con su BOM en <Link to="/moldeo/catalogo" className="text-feisen-azul font-medium hover:underline">Catálogo BOM</Link>, o continúa y agrega piezas sueltas.
                  </p>
                </div>
              ) : (
                <ul className="border-t border-feisen-borde-suave grid sm:grid-cols-2 sm:gap-x-6 px-4 sm:px-5 divide-y divide-feisen-borde-suave sm:divide-y-0">
                  {maquinas.map(m => {
                    const activa = Number(cantidades[m.id]) > 0
                    return (
                      <li key={m.id} className="flex items-center gap-3 py-2.5 sm:border-b sm:border-feisen-borde-suave">
                        <span className={`flex-1 min-w-0 text-sm leading-tight break-words ${activa ? 'font-semibold text-feisen-texto' : 'text-feisen-texto-2'}`}>{m.nombre}</span>
                        <Contador valor={cantidades[m.id] ?? ''} onCambiar={v => setCant(m.id, v)}
                          etiqueta={`Cantidad de ${m.nombre}`} ancho="w-14" />
                      </li>
                    )
                  })}
                </ul>
              )
            )}
            {maqExpandida && hayMaquinas && (
              <div className="px-4 sm:px-5 py-3 border-t border-feisen-borde-suave bg-feisen-fondo/60">{chipsMaquinas}</div>
            )}
          </Tarjeta>

          {barraAccion(
            hayMaquinas
              ? <><p className="font-semibold text-feisen-texto tabular-nums">{num(totalMaquinas)} {totalMaquinas === 1 ? 'máquina' : 'máquinas'}</p>
                  <p className="text-xs text-feisen-texto-2 truncate">{maqSeleccionadas.map(m => m.nombre).join(', ')}</p></>
              : <><p className="font-semibold text-feisen-texto">Sin máquinas</p>
                  <p className="text-xs text-feisen-texto-2">Agregarás las piezas a mano</p></>,
            <button type="button" onClick={calcularYAvanzar} disabled={calculando} className={clasePrincipal}>
              {calculando ? 'Calculando…' : hayMaquinas ? 'Calcular piezas' : 'Continuar'}
              {!calculando && <ArrowRight size={16} />}
            </button>
          )}
        </div>
      )}

      {/* ══ PASO 2 ══ */}
      {paso === 2 && (
        <div className="space-y-5">
          <div className="grid lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-5 items-start">

            {/* ── Piezas a moldear ───────────────────────────────────────── */}
            <Tarjeta sinPadding titulo="Piezas a moldear"
              detalle={piezas.length === 0 ? 'Ninguna todavía'
                : `${piezas.length} ${piezas.length === 1 ? 'pieza' : 'piezas'}${nBom ? ` · ${nBom} del BOM` : ''}${nLibres ? ` · ${nLibres} ${nLibres === 1 ? 'adicional' : 'adicionales'}` : ''}`}
              accion={hayMaquinas && (
                <button type="button" onClick={calcularYAvanzar} disabled={calculando}
                  className="shrink-0 inline-flex items-center gap-1.5 border border-feisen-borde rounded-lg px-3 min-h-[40px] text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-60">
                  <RefreshCw size={14} className={calculando ? 'animate-spin' : ''} /> Recalcular BOM
                </button>
              )}>
              {piezas.length === 0 ? (
                <div className="border-t border-feisen-borde-suave text-center px-6 py-12">
                  <Package size={30} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm font-medium text-feisen-texto">Todavía no hay piezas</p>
                  <p className="text-xs text-feisen-texto-2 mt-1 max-w-xs mx-auto">
                    {hayMaquinas
                      ? 'Las máquinas elegidas no tienen BOM. Agrega las piezas con el buscador de “Agregar pieza”.'
                      : 'Busca las piezas en “Agregar pieza” o vuelve atrás y elige máquinas.'}
                  </p>
                </div>
              ) : (
                <ul className="border-t border-feisen-borde-suave divide-y divide-feisen-borde-suave">
                  {piezas.map(p => {
                    const cant   = Number(p.cantidad_planeada) || 0
                    const falta  = p.stock_actual != null && Number(p.stock_actual) < Number(p.cantidad_planeada)
                    return (
                      <li key={p.item_id} className="px-4 sm:px-5 py-3">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-feisen-texto break-words">{p.nombre}</p>
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs">
                              <span className={`rounded-md px-1.5 py-px font-medium ${p.origen === 'bom' ? 'bg-feisen-azul-suave text-feisen-azul' : 'bg-gray-100 text-feisen-texto-2'}`}>
                                {p.origen === 'bom' ? 'BOM' : 'Adicional'}
                              </span>
                              {p.stock_actual != null && (
                                <span className={`tabular-nums ${falta ? 'text-amber-700 font-medium' : 'text-feisen-texto-2'}`}>
                                  {falta && <AlertTriangle size={12} className="inline -mt-0.5 mr-0.5" />}
                                  Stock {num(p.stock_actual)}
                                </span>
                              )}
                              {cant > 0 && p.peso_unitario > 0 && <span className="text-feisen-texto-2 tabular-nums">{kg(cant * p.peso_unitario)} kg</span>}
                            </p>
                          </div>
                          <button type="button" onClick={() => quitarPieza(p.item_id)} aria-label={`Quitar ${p.nombre}`}
                            className="-mr-2 -mt-1 w-11 h-11 grid place-items-center rounded-lg text-gray-400 hover:text-feisen-rojo hover:bg-feisen-rojo-suave transition-colors shrink-0">
                            <Trash2 size={17} />
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-2 items-center">
                          <Contador valor={p.cantidad_planeada} onCambiar={v => actualizarPieza(p.item_id, 'cantidad_planeada', v)}
                            etiqueta={`Cantidad de ${p.nombre}`} ancho="w-14" />
                          <InputSug value={p.asignado_a}
                            onChange={v => actualizarPieza(p.item_id, 'asignado_a', v)}
                            placeholder="Moldeador" etiqueta={`Moldeador de ${p.nombre}`} storageKey="feisen_moldeadores" />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Tarjeta>

            <div className="space-y-5 lg:sticky lg:top-6">
              {/* ── Agregar pieza adicional ─────────────────────────────── */}
              <Tarjeta titulo="Agregar pieza" detalle="Del inventario de fundición, por fuera del BOM.">
                <div className="space-y-2">
                  <SelectorPieza
                    value={libreItem?.nombre || ''}
                    onChange={setLibreItem}
                    items={allItems}
                    excluirIds={itemsEnOrden}
                    placeholder="Buscar pieza…"
                  />
                  <div className="flex gap-2">
                    <input type="number" inputMode="numeric" min="1" value={libreCant} onChange={e => setLibreCant(e.target.value)}
                      placeholder="Cantidad" aria-label="Cantidad de la pieza a agregar"
                      onKeyDown={e => e.key === 'Enter' && agregarLibre()}
                      className={`${claseInput} tabular-nums`} />
                    <button type="button" onClick={agregarLibre}
                      className="shrink-0 inline-flex items-center gap-1.5 border border-feisen-azul text-feisen-azul rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:bg-feisen-azul-suave transition-colors">
                      <Plus size={16} /> Agregar
                    </button>
                  </div>
                </div>
              </Tarjeta>

              {/* Balance moldeadores */}
              {balanceMoldeadores && (
                <Tarjeta titulo="Carga por moldeador" detalle="Piezas planeadas y kilos de cada uno.">
                  <ul className="divide-y divide-feisen-borde-suave -mt-1">
                    {Object.entries(balanceMoldeadores).map(([mol, d]) => (
                      <li key={mol} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className={`min-w-0 truncate ${mol === 'Sin asignar' ? 'text-gray-400 italic' : 'text-feisen-texto font-medium'}`}>{mol}</span>
                        <span className="text-right shrink-0 tabular-nums">
                          <span className="font-semibold text-feisen-texto">{num(d.piezas)}</span>
                          <span className="text-xs text-feisen-texto-2"> pzas</span>
                          {d.kg > 0 && <span className="block text-xs text-feisen-texto-2">{kg(d.kg)} kg</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Tarjeta>
              )}

              {hayMaquinas && (
                <Tarjeta titulo="Máquinas en esta orden">{chipsMaquinas}</Tarjeta>
              )}
            </div>
          </div>

          {barraAccion(
            piezas.length === 0
              ? <><p className="font-semibold text-feisen-texto">Sin piezas</p><p className="text-xs text-feisen-texto-2">Agrega al menos una</p></>
              : <><p className="font-semibold text-feisen-texto tabular-nums">{num(totalPiezas)} piezas</p>
                  <p className="text-xs text-feisen-texto-2 tabular-nums truncate">{piezas.length} {piezas.length === 1 ? 'referencia' : 'referencias'}{totalKg > 0 ? ` · ${kg(totalKg)} kg` : ''}</p></>,
            <button type="button" onClick={handleGuardar} disabled={guardando || piezas.length === 0} className={clasePrincipal}>
              {guardando ? 'Guardando…' : 'Guardar orden'}
            </button>,
            <button type="button" onClick={irAtras} aria-label="Volver a configuración"
              className="shrink-0 w-11 h-11 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo">
              <ArrowLeft size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
