import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { ChevronDown, ChevronUp, Plus, Trash2, Pencil, Check, X, Factory } from 'lucide-react'

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
    <button onClick={activar}
      className={`flex items-center gap-2 group text-left ${className}`}>
      <span>{valor}</span>
      <Pencil size={13} className="text-gray-300 group-hover:text-feisen-azul transition-colors shrink-0" />
    </button>
  )

  return (
    <div className="flex items-center gap-2">
      <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') cancelar() }}
        className="border-b-2 border-feisen-azul bg-transparent text-sm font-semibold text-gray-800 focus:outline-none px-1 py-0.5 min-w-0 w-52"
      />
      <button onClick={guardar}  className="text-green-500 hover:text-green-600"><Check size={15} /></button>
      <button onClick={cancelar} className="text-gray-400 hover:text-gray-600"><X size={15} /></button>
    </div>
  )
}

// ── Selector de ítem de inventario ────────────────────────────────────────────
function SelectorItem({ items, excluir = [], onSeleccionar }) {
  const [busqueda, setBusqueda] = useState('')
  const [abierto,  setAbierto]  = useState(false)

  const filtrados = (busqueda.trim()
    ? items.filter(i => i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : items
  ).filter(i => !excluir.includes(i.id))

  function elegir(item) { onSeleccionar(item); setBusqueda(''); setAbierto(false) }

  return (
    <div className="relative flex-1">
      <input value={busqueda}
        onChange={e => { setBusqueda(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Buscar pieza…"
        className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
      />
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
          {filtrados.slice(0, 40).map(i => (
            <button key={i.id} type="button" onMouseDown={() => elegir(i)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 font-medium text-gray-800">
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

// ── Componente principal ──────────────────────────────────────────────────────
export default function GestionBOM() {
  const [maquinas,     setMaquinas]     = useState([])
  const [bom,          setBom]          = useState({})   // { maquina_id: [{ id, item_id, nombre, cantidad }] }
  const [allItems,     setAllItems]     = useState([])
  const [expandido,    setExpandido]    = useState(null)
  const [cargando,     setCargando]     = useState(true)

  // Nueva máquina
  const [nuevaMaq,     setNuevaMaq]     = useState('')
  const [agregandoMaq, setAgregandoMaq] = useState(false)

  // Nueva pieza por máquina: { maquina_id: { item: {id,nombre}, cantidad: '' } }
  const [nuevaPieza,   setNuevaPieza]   = useState({})

  // Filas en edición de cantidad: { bom_id: cantidad_draft }
  const [editCant,     setEditCant]     = useState({})

  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: maqs }, { data: bod }] = await Promise.all([
      supabase.from('maquinas_fundicion').select('id, nombre, activo').order('nombre'),
      supabase.from('bodegas').select('id').ilike('nombre', '%FUNDICIÓN%').single(),
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
  }

  function setNP(maqId, campo, val) {
    setNuevaPieza(prev => ({ ...prev, [maqId]: { ...(prev[maqId] || {}), [campo]: val } }))
  }

  if (cargando) return <p className="text-center text-gray-400 py-20">Cargando…</p>

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2.5 rounded-xl">
            <Factory size={22} className="text-feisen-azul" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Catálogo de máquinas</h1>
            <p className="text-xs text-gray-500">Componentes de fundición por máquina (BOM)</p>
          </div>
        </div>
        <button onClick={() => setAgregandoMaq(v => !v)}
          className="flex items-center gap-2 bg-feisen-rojo text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
          <Plus size={16} /> Nueva máquina
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Formulario nueva máquina */}
      {agregandoMaq && (
        <div className="mb-4 bg-white border border-feisen-azul/30 rounded-2xl p-4 flex gap-3 items-center shadow-sm">
          <input value={nuevaMaq} onChange={e => setNuevaMaq(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && crearMaquina()}
            placeholder="Nombre de la máquina (ej: Mezcladora 1 Bulto)"
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
            autoFocus
          />
          <button onClick={crearMaquina}
            className="bg-feisen-azul text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
            Crear
          </button>
          <button onClick={() => { setAgregandoMaq(false); setNuevaMaq('') }}
            className="text-gray-400 hover:text-gray-600 p-2">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Lista de máquinas */}
      <div className="space-y-3">
        {maquinas.map(maq => {
          const filas      = bom[maq.id] || []
          const abierto    = expandido === maq.id
          const idsUsados  = filas.map(r => r.item_id)
          const np         = nuevaPieza[maq.id] || {}
          const totalPiezas = filas.reduce((s, r) => s + r.cantidad, 0)

          return (
            <div key={maq.id} className={`bg-white rounded-2xl border overflow-hidden transition-all
              ${abierto ? 'border-feisen-azul/40 shadow-md' : 'border-gray-200'}`}>

              {/* Cabecera de máquina */}
              <div className="flex items-center gap-3 px-5 py-4">
                {/* Toggle activo */}
                <button onClick={() => toggleActivo(maq.id, maq.activo)}
                  title={maq.activo ? 'Activa — clic para desactivar' : 'Inactiva — clic para activar'}
                  className={`w-3 h-3 rounded-full shrink-0 transition-colors ${maq.activo ? 'bg-green-400' : 'bg-gray-300'}`}
                />

                {/* Nombre editable */}
                <div className="flex-1 min-w-0">
                  <InlineEdit valor={maq.nombre}
                    onGuardar={nuevoNombre => renombrarMaquina(maq.id, nuevoNombre)}
                    className="text-sm font-bold text-gray-800"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">
                    {filas.length} piezas · {totalPiezas.toLocaleString('es-CO')} uds/máq.
                  </p>
                </div>

                {/* Expandir */}
                <button onClick={() => setExpandido(abierto ? null : maq.id)}
                  className="p-2 text-gray-400 hover:text-feisen-azul transition-colors rounded-lg hover:bg-blue-50">
                  {abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>

              {/* BOM expandido */}
              {abierto && (
                <div className="border-t border-gray-100">

                  {/* Tabla de piezas */}
                  {filas.length > 0 && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 font-bold uppercase border-b border-gray-100">
                          <th className="text-left px-6 py-3">Pieza</th>
                          <th className="text-center px-4 py-3 w-40">Cant. por máquina</th>
                          <th className="w-10 px-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filas.map(row => {
                          const enEdicion = editCant[row.id] !== undefined
                          return (
                            <tr key={row.id} className="hover:bg-gray-50/50 transition-colors group">
                              <td className="px-6 py-3.5 font-medium text-gray-800">{row.nombre}</td>
                              <td className="px-4 py-3.5 text-center">
                                {enEdicion ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <input type="number" min="1" step="1"
                                      value={editCant[row.id]}
                                      onChange={e => setEditCant(prev => ({ ...prev, [row.id]: e.target.value }))}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter')  guardarCantidad(row.id, maq.id, editCant[row.id])
                                        if (e.key === 'Escape') setEditCant(prev => { const n = { ...prev }; delete n[row.id]; return n })
                                      }}
                                      className="w-20 border-2 border-feisen-azul rounded-lg px-2 py-1.5 text-center font-semibold text-sm focus:outline-none"
                                      autoFocus
                                    />
                                    <button onClick={() => guardarCantidad(row.id, maq.id, editCant[row.id])}
                                      className="text-green-500 hover:text-green-600">
                                      <Check size={15} />
                                    </button>
                                    <button onClick={() => setEditCant(prev => { const n = { ...prev }; delete n[row.id]; return n })}
                                      className="text-gray-400 hover:text-gray-600">
                                      <X size={15} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setEditCant(prev => ({ ...prev, [row.id]: row.cantidad }))}
                                    className="flex items-center justify-center gap-1.5 mx-auto group/cant">
                                    <span className="font-bold text-feisen-azul text-base">{row.cantidad}</span>
                                    <Pencil size={12} className="text-gray-300 group-hover/cant:text-feisen-azul transition-colors" />
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-3.5">
                                <button onClick={() => eliminarFila(row.id, maq.id)}
                                  className="text-gray-200 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100">
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}

                  {filas.length === 0 && (
                    <p className="text-center text-gray-400 py-6 text-sm">Sin piezas aún. Agrega la primera abajo.</p>
                  )}

                  {/* Agregar pieza */}
                  <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-3">Agregar pieza</p>
                    <div className="flex gap-3 items-center">
                      <SelectorItem
                        items={allItems}
                        excluir={idsUsados}
                        onSeleccionar={item => setNP(maq.id, 'item', item)}
                      />
                      {/* Muestra la pieza seleccionada */}
                      {np.item && (
                        <span className="text-xs bg-blue-100 text-feisen-azul font-semibold px-2.5 py-1.5 rounded-lg shrink-0 max-w-40 truncate">
                          {np.item.nombre}
                        </span>
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        <input type="number" min="1" step="1"
                          value={np.cantidad || ''}
                          onChange={e => setNP(maq.id, 'cantidad', e.target.value)}
                          placeholder="Cant."
                          className="w-20 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                        />
                        <button onClick={() => agregarPieza(maq.id)}
                          disabled={!np.item || !np.cantidad}
                          className="bg-feisen-azul text-white rounded-xl p-2.5 hover:opacity-80 disabled:opacity-40 transition-opacity">
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
