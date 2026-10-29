import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { BODEGA_FUNDICION_ID } from '../../utils/bodegasCatalogo'
import { coincideBusqueda } from '../../utils/busqueda'
import { EncabezadoPagina, PanelLateral, useAviso, useAtajoBuscar } from '../shared/ui'
import { ChevronRight, Plus, Trash2, Pencil, Check, X, Factory, Search, AlertTriangle } from '../shared/iconos'

const fmtN = n => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es')

// ── Input editable inline ─────────────────────────────────────────────────────
function InlineEdit({ valor, onGuardar, className = '' }) {
  const [editando, setEditando] = useState(false)
  const [draft,    setDraft]    = useState(valor)
  const ref = useRef()

  function activar() { setDraft(valor); setEditando(true); setTimeout(() => ref.current?.focus(), 50) }
  function cancelar() { setDraft(valor); setEditando(false) }
  function guardar() {
    if (draft.trim() && draft.trim() !== valor) onGuardar(draft.trim())
    setEditando(false)
  }

  if (!editando) return (
    <button type="button" onClick={activar} title="Cambiar nombre"
      className={`flex items-center gap-2 group text-left min-h-[44px] max-w-full ${className}`}>
      <span className="break-words">{valor}</span>
      <Pencil size={15} className="text-gray-400 group-hover:text-feisen-azul transition-colors shrink-0" />
    </button>
  )

  return (
    <div className="flex items-center gap-1">
      <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)} aria-label="Nombre de la máquina"
        onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') { e.stopPropagation(); cancelar() } }}
        className="flex-1 min-w-0 border border-feisen-azul rounded-lg px-3 h-11 text-base font-semibold text-feisen-texto focus:outline-none focus:ring-2 focus:ring-feisen-azul-suave"
      />
      <button type="button" onClick={guardar} aria-label="Guardar nombre"
        className="w-11 h-11 grid place-items-center rounded-lg text-feisen-azul hover:bg-feisen-azul-suave"><Check size={18} /></button>
      <button type="button" onClick={cancelar} aria-label="Cancelar"
        className="w-11 h-11 grid place-items-center rounded-lg text-gray-400 hover:bg-feisen-fondo"><X size={18} /></button>
    </div>
  )
}

// ── Selector de ítem de inventario ────────────────────────────────────────────
function SelectorItem({ items, excluir = [], onSeleccionar }) {
  const [busqueda, setBusqueda] = useState('')
  const [abierto,  setAbierto]  = useState(false)

  const filtrados = (busqueda.trim()
    ? items.filter(i => coincideBusqueda(i.nombre, busqueda))
    : items
  ).filter(i => !excluir.includes(i.id))

  function elegir(item) { onSeleccionar(item); setBusqueda(''); setAbierto(false) }

  return (
    <div className="relative">
      <Search size={17} className="absolute left-3 top-[22px] -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input value={busqueda}
        onChange={e => { setBusqueda(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={e => { if (e.key === 'Escape' && abierto) { e.stopPropagation(); setAbierto(false) } }}
        placeholder="Buscar pieza de la bodega de fundición…"
        aria-label="Buscar pieza"
        className="w-full border border-feisen-borde rounded-lg pl-10 pr-3 h-11 text-base sm:text-sm bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave"
      />
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-feisen-borde rounded-lg shadow-sm mt-1 max-h-60 overflow-y-auto divide-y divide-feisen-borde-suave">
          {filtrados.slice(0, 200).map(i => (
            <button key={i.id} type="button" onMouseDown={() => elegir(i)}
              className="w-full text-left px-3 min-h-[44px] py-2 text-sm hover:bg-feisen-azul-suave text-feisen-texto">
              {i.nombre}
            </button>
          ))}
        </div>
      )}
      {abierto && busqueda.trim() && filtrados.length === 0 && (
        <div className="absolute z-50 w-full bg-white border border-feisen-borde rounded-lg shadow-sm mt-1 px-3 py-3 text-sm text-feisen-texto-2">
          Ninguna pieza activa de la bodega de fundición coincide con «{busqueda.trim()}», o ya está en esta máquina.
        </div>
      )}
    </div>
  )
}

function Badge({ tono, children }) {
  const c = {
    gris: 'bg-feisen-borde-suave text-feisen-texto-2',
    ambar: 'bg-amber-50 text-amber-700',
    azul: 'bg-feisen-azul-suave text-feisen-azul',
  }[tono]
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${c}`}>{children}</span>
}

function Indicador({ etiqueta, valor, contexto, tono, activo, onClick }) {
  const color = tono === 'ambar' ? 'text-amber-700' : 'text-feisen-texto'
  const cuerpo = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 leading-tight">{etiqueta}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-1 ${color}`}>{valor}</p>
      <p className="text-xs text-feisen-texto-2 mt-0.5">{contexto}</p>
    </>
  )
  const base = 'bg-white border rounded-xl p-3.5 sm:p-4 text-left min-w-0'
  if (!onClick) return <div className={`${base} border-feisen-borde`}>{cuerpo}</div>
  return (
    <button type="button" onClick={onClick} aria-pressed={activo}
      className={`${base} transition-colors hover:bg-feisen-fondo ${activo ? 'border-feisen-azul ring-1 ring-feisen-azul' : 'border-feisen-borde'}`}>
      {cuerpo}
    </button>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function GestionBOM() {
  const [maquinas,     setMaquinas]     = useState([])
  const [bom,          setBom]          = useState({})   // { maquina_id: [{ id, item_id, nombre, cantidad }] }
  const [allItems,     setAllItems]     = useState([])
  const [expandido,    setExpandido]    = useState(null) // máquina abierta en el panel lateral
  const [cargando,     setCargando]     = useState(true)

  // Nueva máquina
  const [nuevaMaq,     setNuevaMaq]     = useState('')
  const [agregandoMaq, setAgregandoMaq] = useState(false)

  // Nueva pieza por máquina: { maquina_id: { item: {id,nombre}, cantidad: '' } }
  const [nuevaPieza,   setNuevaPieza]   = useState({})

  // Filas en edición de cantidad: { bom_id: cantidad_draft }
  const [editCant,     setEditCant]     = useState({})

  const [error, setError] = useState('')

  // Solo visual: búsqueda, filtro de la lista y confirmación de quitar pieza
  const [busqueda,    setBusqueda]    = useState('')
  const [filtro,      setFiltro]      = useState('todas') // todas | sinPiezas | inactivas
  const [porQuitar,   setPorQuitar]   = useState(null)
  const buscarRef = useRef(null)
  useAtajoBuscar(buscarRef)
  const [aviso, avisar] = useAviso()

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: maqs }, { data: bod }] = await Promise.all([
      supabase.from('maquinas_fundicion').select('id, nombre, activo').order('nombre'),
      supabase.from('bodegas').select('id').eq('id', BODEGA_FUNDICION_ID).maybeSingle(),
    ])
    setMaquinas(maqs || [])

    if (bod?.id) {
      const { data: items } = await supabase.from('items')
        .select('id, nombre').eq('bodega_id', bod.id).eq('activo', true).order('nombre')
      setAllItems(items || [])
    }

    // Cargar todo el BOM de una sola vez
    const { data: bomRows } = await supabase.from('bom_maquina_piezas')
      .select('id, maquina_id, item_id, cantidad_por_maquina, items(nombre)')
      .order('items(nombre)')

    const bomMap = {}
    for (const row of (bomRows || [])) {
      if (!bomMap[row.maquina_id]) bomMap[row.maquina_id] = []
      bomMap[row.maquina_id].push({
        id:       row.id,
        item_id:  row.item_id,
        nombre:   row.items?.nombre || '',
        cantidad: Number(row.cantidad_por_maquina),
      })
    }
    setBom(bomMap)
    setCargando(false)
  }

  // ── Máquinas ────────────────────────────────────────────────────────────────
  async function renombrarMaquina(maqId, nuevoNombre) {
    await supabase.from('maquinas_fundicion').update({ nombre: nuevoNombre }).eq('id', maqId)
    setMaquinas(prev => prev.map(m => m.id === maqId ? { ...m, nombre: nuevoNombre } : m))
  }

  async function toggleActivo(maqId, actual) {
    await supabase.from('maquinas_fundicion').update({ activo: !actual }).eq('id', maqId)
    setMaquinas(prev => prev.map(m => m.id === maqId ? { ...m, activo: !actual } : m))
  }

  async function crearMaquina() {
    if (!nuevaMaq.trim()) return
    const { data, error: err } = await supabase.from('maquinas_fundicion')
      .insert({ nombre: nuevaMaq.trim(), activo: true }).select().single()
    if (err) { setError('Error al crear máquina: ' + err.message); return }
    setMaquinas(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    setBom(prev => ({ ...prev, [data.id]: [] }))
    setNuevaMaq('')
    setAgregandoMaq(false)
    setExpandido(data.id)
    avisar(`Máquina «${data.nombre}» creada. Agrégale sus piezas.`)
  }

  // ── BOM rows ────────────────────────────────────────────────────────────────
  async function guardarCantidad(bomId, maqId, nuevaCant) {
    const n = Number(nuevaCant)
    if (!n || n <= 0) return
    await supabase.from('bom_maquina_piezas').update({ cantidad_por_maquina: n }).eq('id', bomId)
    setBom(prev => ({
      ...prev,
      [maqId]: prev[maqId].map(r => r.id === bomId ? { ...r, cantidad: n } : r),
    }))
    setEditCant(prev => { const n2 = { ...prev }; delete n2[bomId]; return n2 })
  }

  async function eliminarFila(bomId, maqId) {
    await supabase.from('bom_maquina_piezas').delete().eq('id', bomId)
    setBom(prev => ({ ...prev, [maqId]: prev[maqId].filter(r => r.id !== bomId) }))
  }

  async function agregarPieza(maqId) {
    const np = nuevaPieza[maqId]
    if (!np?.item?.id || !np.cantidad || Number(np.cantidad) <= 0) {
      setError('Selecciona una pieza y una cantidad válida.'); return
    }
    setError('')
    const { data, error: err } = await supabase.from('bom_maquina_piezas')
      .insert({ maquina_id: maqId, item_id: np.item.id, cantidad_por_maquina: Number(np.cantidad) })
      .select('id').single()
    if (err) { setError('Error: ' + err.message); return }
    setBom(prev => ({
      ...prev,
      [maqId]: [...(prev[maqId] || []), { id: data.id, item_id: np.item.id, nombre: np.item.nombre, cantidad: Number(np.cantidad) }]
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }))
    setNuevaPieza(prev => ({ ...prev, [maqId]: { item: null, cantidad: '' } }))
    avisar(`${np.item.nombre} agregada`)
  }

  function setNP(maqId, campo, val) {
    setNuevaPieza(prev => ({ ...prev, [maqId]: { ...(prev[maqId] || {}), [campo]: val } }))
  }

  function cancelarEdicion(bomId) {
    setEditCant(prev => { const n = { ...prev }; delete n[bomId]; return n })
  }

  // ── Derivados solo para mostrar ─────────────────────────────────────────────
  const conteos = useMemo(() => ({
    todas: maquinas.length,
    activas: maquinas.filter(m => m.activo).length,
    sinPiezas: maquinas.filter(m => (bom[m.id] || []).length === 0).length,
    inactivas: maquinas.filter(m => !m.activo).length,
    piezasDistintas: new Set(Object.values(bom).flat().map(r => r.item_id)).size,
  }), [maquinas, bom])

  const visibles = useMemo(() => maquinas
    .filter(m => filtro === 'sinPiezas' ? (bom[m.id] || []).length === 0
      : filtro === 'inactivas' ? !m.activo : true)
    .filter(m => coincideBusqueda(m.nombre, busqueda)),
  [maquinas, bom, filtro, busqueda])

  const maqAbierta = maquinas.find(m => m.id === expandido)

  if (cargando) return (
    <div className="max-w-3xl mx-auto p-4 space-y-4" aria-busy="true">
      <div className="h-12 w-60 rounded-lg bg-feisen-borde-suave animate-pulse" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-feisen-borde-suave animate-pulse" />)}
      </div>
      {[0, 1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-feisen-borde-suave animate-pulse" />)}
      <p className="sr-only">Cargando catálogo de máquinas…</p>
    </div>
  )

  const chips = [
    ['todas', 'Todas', conteos.todas],
    ['sinPiezas', 'Sin piezas', conteos.sinPiezas],
    ['inactivas', 'Inactivas', conteos.inactivas],
  ]

  const bannerError = error && (
    <div role="alert" className="flex items-start gap-2 bg-feisen-rojo-suave text-feisen-rojo rounded-xl pl-4 pr-2 py-2 text-sm font-medium">
      <AlertTriangle size={18} className="shrink-0 mt-1" />
      <span className="flex-1 py-1">{error}</span>
      <button type="button" onClick={() => setError('')} aria-label="Cerrar mensaje"
        className="w-9 h-9 grid place-items-center rounded-lg hover:bg-white/60 shrink-0"><X size={16} /></button>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20 space-y-5">

      <EncabezadoPagina modulo="Fundición" titulo="Catálogo de máquinas"
        subtitulo="Piezas de fundición que lleva cada máquina (lista de materiales)">
        <button type="button" onClick={() => setAgregandoMaq(v => !v)} aria-expanded={agregandoMaq}
          className="inline-flex items-center gap-2 bg-feisen-azul text-white rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:bg-feisen-azul-claro transition-colors">
          <Plus size={18} /> Nueva máquina
        </button>
      </EncabezadoPagina>

      {!maqAbierta && bannerError}

      {/* Formulario nueva máquina */}
      {agregandoMaq && (
        <div className="bg-white border border-feisen-borde rounded-xl p-4 space-y-2">
          <label htmlFor="nueva-maquina" className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Nombre de la máquina
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input id="nueva-maquina" value={nuevaMaq} onChange={e => setNuevaMaq(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && crearMaquina()}
              placeholder="Ej: Mezcladora 1 Bulto"
              className="flex-1 min-w-0 border border-feisen-borde rounded-lg px-3 h-11 text-base sm:text-sm focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave"
              autoFocus
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAgregandoMaq(false); setNuevaMaq('') }}
                className="flex-1 sm:flex-none border border-feisen-borde rounded-lg px-4 min-h-[44px] text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">
                Cancelar
              </button>
              <button type="button" onClick={crearMaquina} disabled={!nuevaMaq.trim()}
                className="flex-1 sm:flex-none border border-feisen-azul text-feisen-azul rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:bg-feisen-azul-suave disabled:opacity-40">
                Crear máquina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Indicadores */}
      {maquinas.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Indicador etiqueta="Máquinas activas" valor={conteos.activas.toLocaleString('es-CO')}
            contexto={`de ${conteos.todas.toLocaleString('es-CO')} · ${conteos.piezasDistintas.toLocaleString('es-CO')} piezas distintas`} />
          <Indicador etiqueta="Sin piezas" valor={conteos.sinPiezas.toLocaleString('es-CO')}
            tono={conteos.sinPiezas > 0 ? 'ambar' : undefined}
            contexto={conteos.sinPiezas > 0 ? 'falta cargar su BOM' : 'todas tienen BOM'}
            activo={filtro === 'sinPiezas'}
            onClick={() => setFiltro(f => f === 'sinPiezas' ? 'todas' : 'sinPiezas')} />
          <Indicador etiqueta="Inactivas" valor={conteos.inactivas.toLocaleString('es-CO')}
            contexto="no se usan en producción"
            activo={filtro === 'inactivas'}
            onClick={() => setFiltro(f => f === 'inactivas' ? 'todas' : 'inactivas')} />
        </div>
      )}

      {/* Lista */}
      {maquinas.length === 0 ? (
        <div className="bg-white border border-dashed border-feisen-borde rounded-xl px-6 py-12 text-center">
          <Factory size={32} className="mx-auto text-gray-300" />
          <p className="mt-3 font-semibold text-feisen-texto">Aún no hay máquinas en el catálogo</p>
          <p className="mt-1 text-sm text-feisen-texto-2 max-w-sm mx-auto">
            Crea una con «Nueva máquina» y luego agrégale las piezas de fundición que lleva y cuántas de cada una.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input ref={buscarRef} type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar máquina…" aria-label="Buscar máquina"
              className="w-full border border-feisen-borde rounded-lg pl-10 pr-10 h-11 text-base sm:text-sm bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
            <kbd className="hidden lg:block absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 border border-feisen-borde rounded px-1.5">/</kbd>
          </div>
          <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
            {chips.map(([k, t, n]) => (
              <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}
                className={`shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors
                  ${filtro === k ? 'bg-feisen-texto text-white border-feisen-texto' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
                {t} <span className={`tabular-nums ${filtro === k ? 'text-white/70' : 'text-gray-400'}`}>{n.toLocaleString('es-CO')}</span>
                {filtro === k && k !== 'todas' && <X size={14} aria-label="Quitar filtro" />}
              </button>
            ))}
          </div>

          {visibles.length === 0 ? (
            <div className="bg-white border border-feisen-borde rounded-xl px-6 py-10 text-center">
              <p className="font-semibold text-feisen-texto">Ninguna máquina coincide</p>
              <p className="mt-1 text-sm text-feisen-texto-2">
                {busqueda.trim() ? `No hay máquinas con «${busqueda.trim()}»${filtro !== 'todas' ? ' en este filtro' : ''}. ` : ''}
                Prueba con otra palabra o{' '}
                <button type="button" onClick={() => { setBusqueda(''); setFiltro('todas') }}
                  className="text-feisen-azul font-medium hover:underline">ver todas las máquinas</button>.
              </p>
            </div>
          ) : (
            <ul className="bg-white border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave overflow-hidden">
              {visibles.map(maq => {
                const filas = bom[maq.id] || []
                const totalPiezas = filas.reduce((s, r) => s + r.cantidad, 0)
                return (
                  <li key={maq.id}>
                    <button type="button" onClick={() => { setExpandido(maq.id); setPorQuitar(null) }}
                      className="w-full flex items-center gap-3 px-4 py-3 min-h-[60px] text-left hover:bg-feisen-fondo transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold truncate ${maq.activo ? 'text-feisen-texto' : 'text-feisen-texto-2'}`}>{maq.nombre}</p>
                        <p className="text-xs text-feisen-texto-2 mt-0.5">
                          {filas.length === 0 ? 'Sin piezas cargadas' : `${filas.length} ${filas.length === 1 ? 'tipo de pieza' : 'tipos de pieza'}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!maq.activo && <Badge tono="gris">Inactiva</Badge>}
                        {filas.length === 0 && <Badge tono="ambar">Sin piezas</Badge>}
                        {filas.length > 0 && (
                          <span className="text-right">
                            <span className="block font-semibold tabular-nums text-feisen-texto">{fmtN(totalPiezas)}</span>
                            <span className="block text-[11px] text-gray-400 leading-tight">uds/máq.</span>
                          </span>
                        )}
                        <ChevronRight size={18} className="text-gray-400" />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {visibles.length > 0 && (
            <p className="text-xs text-gray-400 text-center tabular-nums">
              Mostrando {visibles.length.toLocaleString('es-CO')} de {maquinas.length.toLocaleString('es-CO')} máquinas
            </p>
          )}
        </section>
      )}

      {/* Detalle de la máquina */}
      {maqAbierta && (() => {
        const maq        = maqAbierta
        const filas      = bom[maq.id] || []
        const ordenadas  = [...filas].sort(porNombre)
        const idsUsados  = filas.map(r => r.item_id)
        const np         = nuevaPieza[maq.id] || {}
        const totalPiezas = filas.reduce((s, r) => s + r.cantidad, 0)

        return (
          <PanelLateral etiqueta={`Máquina ${maq.nombre}`} onCerrar={() => { setExpandido(null); setPorQuitar(null) }}
            encabezado={
              <div>
                <p className="text-xs text-gray-400">Máquina de fundición</p>
                <InlineEdit key={maq.id} valor={maq.nombre}
                  onGuardar={nuevoNombre => renombrarMaquina(maq.id, nuevoNombre)}
                  className="text-lg font-semibold text-feisen-texto"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {maq.activo ? <Badge tono="azul">Activa</Badge> : <Badge tono="gris">Inactiva</Badge>}
                  <span className="text-xs text-feisen-texto-2 tabular-nums">
                    {filas.length} {filas.length === 1 ? 'tipo de pieza' : 'tipos de pieza'} · {fmtN(totalPiezas)} uds/máq.
                  </span>
                </div>
              </div>
            }>

            {bannerError}

            {/* Piezas */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Piezas por máquina</h2>
              {filas.length === 0 ? (
                <div className="border border-dashed border-feisen-borde rounded-xl px-4 py-6 text-center">
                  <p className="text-sm font-medium text-feisen-texto">Esta máquina aún no tiene piezas</p>
                  <p className="text-sm text-feisen-texto-2 mt-1">Busca abajo cada pieza de fundición que lleva y escribe cuántas usa una máquina.</p>
                </div>
              ) : (
                <ul className="border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
                  {ordenadas.map(row => {
                    const enEdicion = editCant[row.id] !== undefined
                    const confirmando = porQuitar === row.id
                    return (
                      <li key={row.id} className="flex items-center gap-2 pl-3 pr-1 py-1.5 min-h-[56px]">
                        <span className="flex-1 min-w-0 text-sm text-feisen-texto break-words">{row.nombre}</span>
                        {confirmando ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => setPorQuitar(null)}
                              className="px-3 min-h-[44px] rounded-lg text-sm text-feisen-texto-2 hover:bg-feisen-fondo">No</button>
                            <button type="button"
                              onClick={() => { eliminarFila(row.id, maq.id); setPorQuitar(null); avisar(`${row.nombre} quitada de ${maq.nombre}`) }}
                              className="px-3 min-h-[44px] rounded-lg text-sm font-semibold bg-feisen-rojo-suave text-feisen-rojo hover:bg-feisen-rojo hover:text-white">
                              Quitar
                            </button>
                          </div>
                        ) : enEdicion ? (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <input type="number" min="1" step="1" inputMode="decimal" aria-label={`Cantidad de ${row.nombre}`}
                              value={editCant[row.id]}
                              onChange={e => setEditCant(prev => ({ ...prev, [row.id]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter')  guardarCantidad(row.id, maq.id, editCant[row.id])
                                if (e.key === 'Escape') { e.stopPropagation(); cancelarEdicion(row.id) }
                              }}
                              className="w-20 h-11 border border-feisen-azul rounded-lg px-2 text-right font-semibold tabular-nums text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul-suave"
                              autoFocus
                            />
                            <button type="button" onClick={() => guardarCantidad(row.id, maq.id, editCant[row.id])} aria-label="Guardar cantidad"
                              className="w-11 h-11 grid place-items-center rounded-lg text-feisen-azul hover:bg-feisen-azul-suave">
                              <Check size={18} />
                            </button>
                            <button type="button" onClick={() => cancelarEdicion(row.id)} aria-label="Cancelar"
                              className="w-11 h-11 grid place-items-center rounded-lg text-gray-400 hover:bg-feisen-fondo">
                              <X size={18} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center shrink-0">
                            <button type="button"
                              onClick={() => setEditCant(prev => ({ ...prev, [row.id]: row.cantidad }))}
                              aria-label={`Cambiar cantidad de ${row.nombre}`}
                              className="flex items-center justify-end gap-1.5 min-w-[64px] min-h-[44px] px-2 rounded-lg hover:bg-feisen-fondo group/cant">
                              <span className="font-semibold tabular-nums text-feisen-texto">{fmtN(row.cantidad)}</span>
                              <Pencil size={14} className="text-gray-400 group-hover/cant:text-feisen-azul transition-colors" />
                            </button>
                            <button type="button" onClick={() => setPorQuitar(row.id)} aria-label={`Quitar ${row.nombre}`}
                              className="w-11 h-11 grid place-items-center rounded-lg text-gray-400 hover:text-feisen-rojo hover:bg-feisen-rojo-suave transition-colors">
                              <Trash2 size={17} />
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Agregar pieza */}
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Agregar pieza</h2>
              {np.item ? (
                <div className="flex items-center gap-2 bg-feisen-azul-suave rounded-lg pl-3 pr-1 min-h-[44px]">
                  <span className="flex-1 min-w-0 text-sm font-medium text-feisen-azul break-words py-2">{np.item.nombre}</span>
                  <button type="button" onClick={() => setNP(maq.id, 'item', null)} aria-label="Cambiar pieza"
                    className="w-11 h-11 grid place-items-center rounded-lg text-feisen-azul hover:bg-white/60 shrink-0"><X size={16} /></button>
                </div>
              ) : (
                <SelectorItem
                  items={allItems}
                  excluir={idsUsados}
                  onSeleccionar={item => setNP(maq.id, 'item', item)}
                />
              )}
              <div className="flex gap-2">
                <label className="sr-only" htmlFor={`cant-${maq.id}`}>Cantidad por máquina</label>
                <input id={`cant-${maq.id}`} type="number" min="1" step="1" inputMode="decimal"
                  value={np.cantidad || ''}
                  onChange={e => setNP(maq.id, 'cantidad', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && np.item && np.cantidad && agregarPieza(maq.id)}
                  placeholder="Cant. por máquina"
                  className="flex-1 min-w-0 border border-feisen-borde rounded-lg px-3 h-11 text-base sm:text-sm text-right tabular-nums focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave"
                />
                <button type="button" onClick={() => agregarPieza(maq.id)}
                  disabled={!np.item || !np.cantidad}
                  className="inline-flex items-center gap-1.5 bg-feisen-azul text-white rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:bg-feisen-azul-claro disabled:opacity-40 transition-colors shrink-0">
                  <Plus size={18} /> Agregar
                </button>
              </div>
            </section>

            {/* Estado */}
            <section className="pt-4 border-t border-feisen-borde-suave">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Estado</h2>
              <div className="flex items-center gap-3">
                <p className="flex-1 text-sm text-feisen-texto-2">
                  {maq.activo ? 'La máquina está activa y se puede usar en producción.' : 'La máquina está inactiva: no se usa en producción.'}
                </p>
                <button type="button"
                  onClick={() => { toggleActivo(maq.id, maq.activo); avisar(maq.activo ? 'Máquina desactivada' : 'Máquina activada') }}
                  className="shrink-0 border border-feisen-borde rounded-lg px-4 min-h-[44px] text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
                  {maq.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </section>
          </PanelLateral>
        )
      })()}

      {aviso}
    </div>
  )
}
