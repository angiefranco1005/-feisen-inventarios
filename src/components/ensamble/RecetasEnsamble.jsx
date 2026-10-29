import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { BODEGA_ENSAMBLE_ID } from '../../utils/bodegasCatalogo'
import { ChevronDown, ChevronUp, Plus, Trash2, Pencil, Check, X, Wrench } from '../shared/iconos'
import Spinner from '../shared/Spinner'
import { cargarCatalogo, cargarRecetas, costoUnitario, num } from './ensambleDatos'
import { formatCOP } from '../../utils/formatters'

// ── Selector de producto con buscador ─────────────────────────────────────────
function SelectorItem({ items, excluir = [], placeholder, mostrarBodega, onSeleccionar }) {
  const [busqueda, setBusqueda] = useState('')
  const [abierto,  setAbierto]  = useState(false)

  const q = busqueda.trim().toLowerCase()
  const filtrados = (q ? items.filter(i => i.nombre.toLowerCase().includes(q)) : items)
    .filter(i => !excluir.includes(i.id))

  function elegir(item) { onSeleccionar(item); setBusqueda(''); setAbierto(false) }

  return (
    <div className="relative flex-1 min-w-0">
      <input value={busqueda}
        onChange={e => { setBusqueda(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder={placeholder}
        className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
      />
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-60 overflow-y-auto">
          {filtrados.slice(0, 200).map(i => (
            <button key={i.id} type="button" onMouseDown={() => elegir(i)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0">
              <span className="font-medium text-gray-800">{i.nombre}</span>
              {mostrarBodega && <span className="block text-xs text-gray-400">{i.bodega_nombre}</span>}
            </button>
          ))}
        </div>
      )}
      {abierto && q && filtrados.length === 0 && (
        <div className="absolute z-50 w-full bg-white border border-feisen-borde rounded-xl mt-1 px-3 py-2 text-sm text-gray-400">
          Sin resultados
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function RecetasEnsamble() {
  const [items,     setItems]     = useState([])
  const [bodegas,   setBodegas]   = useState([])
  const [recetas,   setRecetas]   = useState([])
  const [expandido, setExpandido] = useState(null)
  const [cargando,  setCargando]  = useState(true)
  const [error,     setError]     = useState('')

  const [creando,   setCreando]   = useState(false)
  // Nuevo componente por receta: { receta_id: { item, cantidad } }
  const [nuevo,     setNuevo]     = useState({})
  // Bodega de la que se eligen componentes (por defecto Ensamble)
  const [bodegaComp, setBodegaComp] = useState(BODEGA_ENSAMBLE_ID)
  const [editCant,  setEditCant]  = useState({})

  const itemsPorId = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])
  const itemsBodegaComp = useMemo(() => items.filter(i => i.bodega_id === bodegaComp), [items, bodegaComp])

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    try {
      const cat = await cargarCatalogo()
      const porId = Object.fromEntries(cat.items.map(i => [i.id, i]))
      setItems(cat.items)
      setBodegas(cat.bodegas)
      setRecetas(await cargarRecetas(porId))
    } catch (err) {
      setError('Error al cargar: ' + err.message)
    }
    setCargando(false)
  }

  async function crearReceta(item) {
    setError('')
    const { data, error: err } = await supabase.from('recetas_ensamble')
      .insert({ item_id: item.id }).select('id, item_id, notas, activo').single()
    if (err) { setError(err.code === '23505' ? 'Esa máquina ya tiene receta.' : 'Error al crear receta: ' + err.message); return }
    setRecetas(prev => [...prev, { ...data, item, componentes: [] }]
      .sort((a, b) => (a.item?.nombre || '').localeCompare(b.item?.nombre || '', 'es')))
    setCreando(false)
    setExpandido(data.id)
  }

  async function toggleActivo(r) {
    const { error: err } = await supabase.from('recetas_ensamble').update({ activo: !r.activo }).eq('id', r.id)
    if (err) { setError('Error: ' + err.message); return }
    setRecetas(prev => prev.map(x => x.id === r.id ? { ...x, activo: !r.activo } : x))
  }

  async function eliminarReceta(r) {
    if (!window.confirm(`¿Eliminar la receta de "${r.item?.nombre}"? Las órdenes que ya la usan impiden borrarla; en ese caso desactívala.`)) return
    const { error: err } = await supabase.from('recetas_ensamble').delete().eq('id', r.id)
    if (err) { setError(err.code === '23503' ? 'Esta receta ya tiene órdenes de ensamble: desactívala en vez de borrarla.' : 'Error: ' + err.message); return }
    setRecetas(prev => prev.filter(x => x.id !== r.id))
  }

  function actualizarComponentes(recetaId, fn) {
    setRecetas(prev => prev.map(r => r.id === recetaId ? { ...r, componentes: fn(r.componentes) } : r))
  }

  async function agregarComponente(recetaId) {
    const nc = nuevo[recetaId]
    const cant = Number(nc?.cantidad)
    if (!nc?.item || !cant || cant <= 0) { setError('Selecciona un componente y una cantidad válida.'); return }
    setError('')
    const { data, error: err } = await supabase.from('receta_ensamble_items')
      .insert({ receta_id: recetaId, item_id: nc.item.id, cantidad: cant }).select('id').single()
    if (err) { setError('Error: ' + err.message); return }
    actualizarComponentes(recetaId, cs => [...cs, { id: data.id, receta_id: recetaId, item_id: nc.item.id, cantidad: cant, item: nc.item }]
      .sort((a, b) => (a.item?.nombre || '').localeCompare(b.item?.nombre || '', 'es')))
    setNuevo(prev => ({ ...prev, [recetaId]: { item: null, cantidad: '' } }))
  }

  async function guardarCantidad(recetaId, filaId) {
    const cant = Number(editCant[filaId])
    if (!cant || cant <= 0) return
    const { error: err } = await supabase.from('receta_ensamble_items').update({ cantidad: cant }).eq('id', filaId)
    if (err) { setError('Error: ' + err.message); return }
    actualizarComponentes(recetaId, cs => cs.map(c => c.id === filaId ? { ...c, cantidad: cant } : c))
    setEditCant(prev => { const n = { ...prev }; delete n[filaId]; return n })
  }

  async function quitarComponente(recetaId, filaId) {
    const { error: err } = await supabase.from('receta_ensamble_items').delete().eq('id', filaId)
    if (err) { setError('Error: ' + err.message); return }
    actualizarComponentes(recetaId, cs => cs.filter(c => c.id !== filaId))
  }

  const setNC = (recetaId, campo, val) =>
    setNuevo(prev => ({ ...prev, [recetaId]: { ...(prev[recetaId] || {}), [campo]: val } }))

  if (cargando) return <Spinner />

  const conReceta = recetas.map(r => r.item_id)

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20">

      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-teal-100 p-2.5 rounded-xl">
            <Wrench size={22} className="text-teal-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Recetas de ensamble</h1>
            <p className="text-xs text-gray-500">Qué piezas e insumos lleva cada máquina</p>
          </div>
        </div>
        <button onClick={() => setCreando(v => !v)}
          className="flex items-center gap-2 bg-feisen-rojo text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">Nueva receta</span><span className="sm:hidden">Nueva</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>
      )}

      {creando && (
        <div className="mb-4 bg-white border border-feisen-azul/30 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">Máquina terminada</p>
          <div className="flex gap-3 items-center">
            <SelectorItem items={items} excluir={conReceta} mostrarBodega
              placeholder="Buscar la máquina (ej: Mezcladora 1 Bulto)…"
              onSeleccionar={crearReceta} />
            <button onClick={() => setCreando(false)} className="text-gray-400 hover:text-gray-600 p-2"><X size={18} /></button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Las máquinas terminadas entran a la bodega donde está este producto. Si no aparece, créalo primero en Productos.
          </p>
        </div>
      )}

      {recetas.length === 0 && !creando && (
        <p className="text-center text-gray-400 py-16 text-sm">Aún no hay recetas. Crea la primera con “Nueva receta”.</p>
      )}

      <div className="space-y-3">
        {recetas.map(r => {
          const abierto = expandido === r.id
          const nc = nuevo[r.id] || {}
          const costo = costoUnitario(r.componentes)
          return (
            <div key={r.id} className={`bg-white rounded-2xl border transition-all ${abierto ? 'border-feisen-azul/40 shadow-md' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3 px-5 py-4">
                <button onClick={() => toggleActivo(r)}
                  title={r.activo ? 'Activa — clic para desactivar' : 'Inactiva — clic para activar'}
                  className={`w-3 h-3 rounded-full shrink-0 transition-colors ${r.activo ? 'bg-green-400' : 'bg-gray-300'}`} />
                <button onClick={() => setExpandido(abierto ? null : r.id)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-bold text-gray-800 truncate">{r.item?.nombre || '(producto eliminado)'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {r.componentes.length} componentes · materiales {formatCOP(costo)} / máq. · entra a {r.item?.bodega_nombre || '—'}
                  </p>
                </button>
                <button onClick={() => setExpandido(abierto ? null : r.id)}
                  className="p-2 text-gray-400 hover:text-feisen-azul transition-colors rounded-lg hover:bg-blue-50">
                  {abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>

              {abierto && (
                <div className="border-t border-gray-100">
                  {r.componentes.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 font-bold uppercase border-b border-gray-100">
                          <th className="text-left px-5 py-3">Componente</th>
                          <th className="text-center px-3 py-3 w-36">Cant. por máquina</th>
                          <th className="w-10 px-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {r.componentes.map(c => {
                          const enEdicion = editCant[c.id] !== undefined
                          return (
                            <tr key={c.id} className="hover:bg-gray-50/50 group">
                              <td className="px-5 py-3">
                                <p className="font-medium text-gray-800">{c.item?.nombre || '(producto eliminado)'}</p>
                                <p className="text-xs text-gray-400">{c.item?.bodega_nombre}</p>
                              </td>
                              <td className="px-3 py-3 text-center">
                                {enEdicion ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <input type="number" min="0" step="any" value={editCant[c.id]} autoFocus
                                      onChange={e => setEditCant(prev => ({ ...prev, [c.id]: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter') guardarCantidad(r.id, c.id) }}
                                      className="w-20 border-2 border-feisen-azul rounded-lg px-2 py-1.5 text-center font-semibold text-sm focus:outline-none" />
                                    <button onClick={() => guardarCantidad(r.id, c.id)} className="text-green-500 hover:text-green-600"><Check size={15} /></button>
                                  </div>
                                ) : (
                                  <button onClick={() => setEditCant(prev => ({ ...prev, [c.id]: c.cantidad }))}
                                    className="flex items-center justify-center gap-1.5 mx-auto group/cant">
                                    <span className="font-bold text-feisen-azul text-base">{num(c.cantidad)}</span>
                                    <span className="text-xs text-gray-400">{c.item?.unidad_medida}</span>
                                    <Pencil size={12} className="text-gray-300 group-hover/cant:text-feisen-azul" />
                                  </button>
                                )}
                              </td>
                              <td className="px-2 py-3">
                                <button onClick={() => quitarComponente(r.id, c.id)}
                                  className="text-gray-300 hover:text-red-400 p-1 sm:opacity-0 sm:group-hover:opacity-100">
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-center text-gray-400 py-6 text-sm">Sin componentes aún. Agrega el primero abajo.</p>
                  )}

                  <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold text-gray-400 uppercase">Agregar componente</p>
                      <select value={bodegaComp} onChange={e => setBodegaComp(e.target.value)}
                        className="border border-feisen-borde rounded-lg px-2 py-1.5 text-xs bg-white max-w-[55%]">
                        {bodegas.map(b => <option key={b.id} value={b.id}>Desde: {b.nombre}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                      <SelectorItem items={itemsBodegaComp} excluir={r.componentes.map(c => c.item_id).concat(r.item_id)}
                        placeholder="Buscar pieza o insumo…" onSeleccionar={item => setNC(r.id, 'item', item)} />
                      {nc.item && (
                        <span className="text-xs bg-blue-100 text-feisen-azul font-semibold px-2.5 py-1.5 rounded-lg max-w-40 truncate">
                          {nc.item.nombre}
                        </span>
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        <input type="number" min="0" step="any" value={nc.cantidad || ''}
                          onChange={e => setNC(r.id, 'cantidad', e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && agregarComponente(r.id)}
                          placeholder="Cant."
                          className="w-20 border border-feisen-borde rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
                        <button onClick={() => agregarComponente(r.id)} disabled={!nc.item || !nc.cantidad}
                          className="bg-feisen-azul text-white rounded-xl p-2.5 hover:opacity-80 disabled:opacity-40">
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button onClick={() => eliminarReceta(r)} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                        <Trash2 size={13} /> Eliminar receta
                      </button>
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
