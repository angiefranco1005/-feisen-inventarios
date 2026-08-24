import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { ClipboardList, CheckCircle2, Plus, Trash2, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'

function hoyCol() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}
function numOrden(n) {
  return `ORD-MOL-${String(n).padStart(4, '0')}`
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ paso, onBack }) {
  const pasos = [
    { n: 1, label: 'Configurar',       sub: 'Fecha y máquinas' },
    { n: 2, label: 'Revisar y asignar', sub: 'Piezas y moldeadores' },
  ]
  return (
    <div className="flex items-center gap-0 mb-6">
      {pasos.map((p, i) => {
        const activo    = paso === p.n
        const completado = paso > p.n
        return (
          <div key={p.n} className="flex items-center flex-1">
            <button type="button" disabled={p.n >= paso} onClick={() => p.n < paso && onBack()}
              className={`flex items-center gap-3 flex-1 px-4 py-3 rounded-2xl transition-all
                ${activo     ? 'bg-feisen-azul text-white shadow-md' : ''}
                ${completado ? 'bg-blue-50 text-feisen-azul cursor-pointer hover:bg-blue-100' : ''}
                ${!activo && !completado ? 'bg-gray-100 text-gray-400 cursor-default' : ''}
              `}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                ${activo     ? 'bg-white text-feisen-azul' : ''}
                ${completado ? 'bg-feisen-azul text-white' : ''}
                ${!activo && !completado ? 'bg-gray-300 text-white' : ''}
              `}>
                {completado ? '✓' : p.n}
              </div>
              <div className="text-left min-w-0">
                <p className={`text-sm font-semibold leading-tight ${activo ? 'text-white' : ''}`}>{p.label}</p>
                <p className={`text-xs leading-tight mt-0.5 ${activo ? 'text-blue-100' : 'opacity-60'}`}>{p.sub}</p>
              </div>
            </button>
            {i < pasos.length - 1 && (
              <div className={`h-0.5 w-4 shrink-0 ${paso > p.n ? 'bg-feisen-azul' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Selector de pieza desde inventario ───────────────────────────────────────
function SelectorPieza({ value, onChange, items, placeholder, excluirIds = [] }) {
  const [busqueda, setBusqueda] = useState(value || '')
  const [abierto,  setAbierto]  = useState(false)

  const disponibles = items.filter(i => !excluirIds.includes(i.id))
  const filtrados   = busqueda.trim()
    ? disponibles.filter(i => i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
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
      <input type="text" value={busqueda}
        onChange={e => { setBusqueda(e.target.value); onChange(null); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
      />
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
          {filtrados.slice(0, 40).map(i => (
            <button key={i.id} type="button" onMouseDown={() => elegir(i)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0">
              {i.nombre}
            </button>
          ))}
        </div>
      )}
      {abierto && busqueda.trim() && filtrados.length === 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-sm mt-1 px-3 py-2 text-sm text-gray-400">
          Sin resultados
        </div>
      )}
    </div>
  )
}

// ── Input con sugerencias localStorage ───────────────────────────────────────
function InputSug({ value, onChange, placeholder, storageKey }) {
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
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
      />
      {mostrar && sugs.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-32 overflow-y-auto">
          {sugs.map(s => (
            <button key={s} type="button" onMouseDown={() => { onChange(s); setMostrar(false) }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50">{s}</button>
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

  const [guardando,    setGuardando]    = useState(false)
  const [error,        setError]        = useState('')
  const [exito,        setExito]        = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [{ data: maq }, { data: bod }] = await Promise.all([
      supabase.from('maquinas_fundicion').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('bodegas').select('id').ilike('nombre', '%FUNDICIÓN%').single(),
    ])
    setMaquinas(maq || [])
    setFundBodegaId(bod?.id || null)
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
      const tipo = hayMaquinas ? 'maquinas' : 'libre'
      const { data: orden, error: err1 } = await supabase.from('ordenes_moldeo')
        .insert({ fecha, tipo, usuario_id: perfil.id })
        .select('id, numero').single()
      if (err1) throw err1

      if (hayMaquinas) {
        const maqRows = Object.entries(cantidades)
          .filter(([_, c]) => Number(c) > 0)
          .map(([maquina_id, cantidad_maquinas]) => ({ orden_id: orden.id, maquina_id, cantidad_maquinas }))
        if (maqRows.length > 0) await supabase.from('ordenes_moldeo_maquinas').insert(maqRows)
      }

      const { error: err2 } = await supabase.from('ordenes_moldeo_piezas').insert(
        piezas.map(p => ({
          orden_id:          orden.id,
          item_id:           p.item_id,
          cantidad_planeada: Number(p.cantidad_planeada),
          asignado_a:        p.asignado_a?.trim() || null,
        }))
      )
      if (err2) throw err2
      setExito({ numero: orden.numero })
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  function limpiar() {
    setFecha(hoyCol()); setPaso(1); setCantidades({})
    setPiezas([]); setLibreItem(null); setLibreCant('')
    setError(''); setExito(null)
  }

  if (exito) {
    return (
      <div className="max-w-xl mx-auto p-4 flex flex-col items-center justify-center gap-5 py-20">
        <CheckCircle2 size={60} className="text-green-500" />
        <div className="text-center">
          <p className="text-xl font-bold text-gray-800">¡Orden de moldeo creada!</p>
          <p className="text-feisen-azul font-bold text-2xl mt-2">{numOrden(exito.numero)}</p>
        </div>
        <button onClick={limpiar}
          className="bg-feisen-rojo text-white rounded-xl px-8 py-3 text-sm font-semibold hover:opacity-90">
          Crear otra orden
        </button>
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

  return (
    <div className="max-w-3xl mx-auto p-4 pb-28">

      <div className="flex items-center gap-3 mb-5">
        <div className="bg-blue-100 p-2.5 rounded-xl">
          <ClipboardList size={22} className="text-feisen-azul" />
        </div>
        <h1 className="text-xl font-bold text-gray-800">Nueva Orden de Moldeo</h1>
      </div>

      <Stepper paso={paso} onBack={irAtras} />

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      {/* ══ PASO 1 ══ */}
      {paso === 1 && (
        <div className="space-y-5">

          {/* Fecha */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Fecha</h2>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>

          {/* Máquinas — accordion */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <button type="button" onClick={() => setMaqExpandida(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-700 text-left">Máquinas a producir</p>
                  <p className="text-xs text-gray-400 text-left mt-0.5">
                    {hayMaquinas
                      ? `${Object.values(cantidades).filter(c=>Number(c)>0).length} máquinas seleccionadas · el BOM se calcula automático`
                      : 'Opcional — déjalo vacío si la orden es solo de piezas libres'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hayMaquinas && (
                  <span className="bg-feisen-azul text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {Object.values(cantidades).filter(c=>Number(c)>0).reduce((s,c)=>s+Number(c),0)} uds
                  </span>
                )}
                {maqExpandida ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
              </div>
            </button>

            {maqExpandida && (
              <div className="px-5 pb-5 border-t border-gray-100">
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {maquinas.map(m => (
                    <div key={m.id} className="flex items-center gap-3">
                      <label className="text-sm text-gray-700 flex-1 leading-tight">{m.nombre}</label>
                      <input type="number" min="0" step="1"
                        value={cantidades[m.id] ?? ''}
                        onChange={e => setCant(m.id, e.target.value)}
                        placeholder="0"
                        className="w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                      />
                    </div>
                  ))}
                </div>
                {hayMaquinas && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="flex flex-wrap gap-2">
                      {maquinas.filter(m => Number(cantidades[m.id]) > 0).map(m => (
                        <span key={m.id} className="bg-blue-100 text-feisen-azul text-xs font-semibold px-2.5 py-1 rounded-full">
                          {Number(cantidades[m.id])} × {m.nombre}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Continuar */}
          <button onClick={calcularYAvanzar} disabled={calculando}
            className="w-full bg-feisen-azul text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity">
            {calculando
              ? 'Calculando…'
              : hayMaquinas
                ? 'Calcular piezas del BOM →'
                : 'Continuar → Agregar piezas manualmente'}
          </button>
        </div>
      )}

      {/* ══ PASO 2 ══ */}
      {paso === 2 && (
        <div className="space-y-5">

          <button onClick={irAtras}
            className="flex items-center gap-2 text-sm font-semibold text-feisen-azul hover:opacity-70 transition-opacity">
            <ArrowLeft size={16} /> Volver a configuración
          </button>

          {/* Chips de máquinas seleccionadas (si aplica) */}
          {hayMaquinas && (
            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
              <p className="text-xs font-bold text-feisen-azul uppercase mb-2">Máquinas en esta orden</p>
              <div className="flex flex-wrap gap-2">
                {maquinas.filter(m => Number(cantidades[m.id]) > 0).map(m => (
                  <span key={m.id} className="bg-white border border-blue-200 text-feisen-azul text-xs font-semibold px-2.5 py-1 rounded-full">
                    {Number(cantidades[m.id])} × {m.nombre}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Panel agregar pieza libre ──────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Agregar pieza adicional
            </h2>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Pieza (inventario fundición)</label>
                <SelectorPieza
                  value={libreItem?.nombre || ''}
                  onChange={setLibreItem}
                  items={allItems}
                  excluirIds={itemsEnOrden}
                  placeholder="Buscar pieza…"
                />
              </div>
              <div className="w-28">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Cantidad</label>
                <input type="number" min="1" value={libreCant} onChange={e => setLibreCant(e.target.value)}
                  placeholder="0"
                  onKeyDown={e => e.key === 'Enter' && agregarLibre()}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
              </div>
              <button onClick={agregarLibre}
                className="bg-feisen-azul text-white rounded-lg p-2 hover:opacity-80 transition-opacity">
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* ── Tabla de piezas ───────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <p className="text-base font-bold text-gray-700">Piezas a moldear</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  {piezas.length} ítems
                  {piezas.some(p=>p.origen==='bom')  && ` · ${piezas.filter(p=>p.origen==='bom').length} del BOM`}
                  {piezas.some(p=>p.origen==='libre') && ` · ${piezas.filter(p=>p.origen==='libre').length} libres`}
                </p>
              </div>
              {hayMaquinas && (
                <button onClick={calcularYAvanzar} disabled={calculando}
                  className="text-sm font-semibold text-feisen-azul bg-blue-50 px-4 py-2 rounded-lg hover:bg-blue-100 disabled:opacity-60 transition-colors">
                  {calculando ? '…' : '↻ Recalcular BOM'}
                </button>
              )}
            </div>

            {piezas.length === 0 ? (
              <p className="text-center text-gray-400 py-14 text-sm">
                Sin piezas. Agrega máquinas o piezas libres arriba.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 font-bold uppercase border-b border-gray-200 tracking-wide">
                      <th className="text-left px-6 py-4">Pieza</th>
                      <th className="text-center px-3 py-4 w-12">Origen</th>
                      <th className="text-center px-4 py-4 w-36">Cantidad</th>
                      <th className="text-center px-4 py-4 w-28">Stock</th>
                      <th className="text-left px-4 py-4">Moldeador</th>
                      <th className="w-10 px-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {piezas.map(p => (
                      <tr key={p.item_id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-6 py-4 font-semibold text-gray-800 text-sm leading-snug">{p.nombre}</td>
                        <td className="px-3 py-4 text-center">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            p.origen === 'bom'
                              ? 'bg-blue-100 text-feisen-azul'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {p.origen === 'bom' ? 'BOM' : 'Libre'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <input type="number" min="0" step="1"
                            value={p.cantidad_planeada}
                            onChange={e => actualizarPieza(p.item_id, 'cantidad_planeada', e.target.value)}
                            className="w-24 border-2 border-gray-200 rounded-xl px-2 py-2 text-center text-base font-semibold focus:outline-none focus:border-feisen-azul"
                          />
                        </td>
                        <td className="px-4 py-4 text-center">
                          {p.stock_actual != null
                            ? <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                                Number(p.stock_actual) < Number(p.cantidad_planeada)
                                  ? 'bg-orange-100 text-orange-600'
                                  : 'bg-green-100 text-green-600'
                              }`}>{p.stock_actual}</span>
                            : <span className="text-gray-300 text-sm">—</span>
                          }
                        </td>
                        <td className="px-4 py-4">
                          <InputSug value={p.asignado_a}
                            onChange={v => actualizarPieza(p.item_id, 'asignado_a', v)}
                            placeholder="Moldeador" storageKey="feisen_moldeadores" />
                        </td>
                        <td className="px-3 py-4">
                          <button onClick={() => quitarPieza(p.item_id)}
                            className="text-gray-300 hover:text-red-400 transition-colors p-1.5">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Balance moldeadores */}
          {balanceMoldeadores && (
            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
              <p className="text-xs font-bold text-feisen-azul uppercase tracking-wider mb-3">Carga por moldeador</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(balanceMoldeadores).map(([mol, d]) => (
                  <div key={mol} className="flex justify-between items-center bg-white rounded-xl px-3 py-2.5 text-sm border border-blue-100">
                    <span className={`font-medium ${mol === 'Sin asignar' ? 'text-gray-400 italic' : 'text-gray-700'}`}>{mol}</span>
                    <div className="text-right">
                      <span className="text-feisen-azul font-bold text-sm">{d.piezas}</span>
                      <span className="text-gray-400 text-xs ml-1">pzas</span>
                      {d.kg > 0 && <p className="text-xs text-gray-400">{d.kg.toLocaleString('es-CO',{maximumFractionDigits:1})} kg</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={handleGuardar} disabled={guardando || piezas.length === 0}
            className="w-full bg-feisen-rojo text-white rounded-xl py-3.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity">
            {guardando ? 'Guardando…' : '💾 Guardar orden de moldeo'}
          </button>
        </div>
      )}
    </div>
  )
}
