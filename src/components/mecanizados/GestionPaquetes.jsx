import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { ChevronDown, ChevronUp, Plus, Trash2, Pencil, Check, X, Boxes } from 'lucide-react'

const BODEGA_MECANIZADOS      = '03a709ac-0bee-457a-80a1-0a1603218d34'
const CAT_PRODUCTO_MECANIZADO = 'bff5d482-1647-426c-a88f-dedd72ff5b06'

// ── Input editable inline ─────────────────────────────────────────────────────
function InlineEdit({ valor, onGuardar, placeholder = '', className = '' }) {
  const [editando, setEditando] = useState(false)
  const [draft,    setDraft]    = useState(valor)
  const ref = useRef()

  function activar() { setDraft(valor); setEditando(true); setTimeout(() => ref.current?.focus(), 50) }
  function cancelar() { setDraft(valor); setEditando(false) }
  function guardar() {
    const v = draft.trim()
    if (v !== (valor || '')) onGuardar(v)
    setEditando(false)
  }

  if (!editando) return (
    <button type="button" onClick={activar}
      className={`flex items-center gap-2 group text-left ${className}`}>
      <span className={!valor ? 'text-gray-300 italic' : ''}>{valor || placeholder}</span>
      <Pencil size={13} className="text-gray-300 group-hover:text-feisen-azul transition-colors shrink-0" />
    </button>
  )

  return (
    <div className="flex items-center gap-2">
      <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') cancelar() }}
        placeholder={placeholder}
        className="border-b-2 border-feisen-azul bg-transparent text-sm font-semibold text-gray-800 focus:outline-none px-1 py-0.5 min-w-0 w-52"
      />
      <button onClick={guardar}  className="text-green-500 hover:text-green-600"><Check size={15} /></button>
      <button onClick={cancelar} className="text-gray-400 hover:text-gray-600"><X size={15} /></button>
    </div>
  )
}

// ── Selector de ítem del catálogo de Mecanizados ──────────────────────────────
function SelectorItem({ items, excluir = [], onSeleccionar }) {
  const [busqueda, setBusqueda] = useState('')
  const [abierto,  setAbierto]  = useState(false)

  const filtrados = (busqueda.trim()
    ? items.filter(i => i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : items
  ).filter(i => !excluir.includes(i.id))

  function elegir(item) { onSeleccionar(item); setBusqueda(''); setAbierto(false) }

  return (
    <div className="relative w-full">
      <input value={busqueda}
        onChange={e => { setBusqueda(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Buscar pieza mecanizada…"
        className="w-full border-2 border-gray-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul focus:border-feisen-azul"
      />
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-72 overflow-y-auto">
          {filtrados.slice(0, 40).map(i => (
            <button key={i.id} type="button" onMouseDown={() => elegir(i)}
              className="w-full text-left px-4 py-3.5 text-base hover:bg-blue-50 border-b border-gray-50 last:border-0 font-medium text-gray-800">
              {i.nombre}
            </button>
          ))}
        </div>
      )}
      {abierto && busqueda.trim() && filtrados.length === 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-sm mt-1 px-4 py-3 text-sm text-gray-400">
          Sin resultados. Recuerda: solo piezas de categoría "Producto Mecanizado" en la bodega de Mecanizados.
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function GestionPaquetes() {
  const [paquetes,     setPaquetes]     = useState([])
  const [items,        setItems]        = useState([])  // catálogo de Mecanizados
  const [expandido,    setExpandido]    = useState(null)
  const [cargando,     setCargando]     = useState(true)

  // Nuevo paquete
  const [nuevoNombre,  setNuevoNombre]  = useState('')
  const [agregandoPaq, setAgregandoPaq] = useState(false)

  // Nueva pieza por paquete: { paquete_id: { item: {id,nombre}, cantidad: '' } }
  const [nuevaPieza,   setNuevaPieza]   = useState({})

  // Confirmación de eliminación de paquete completo
  const [confirmElim,  setConfirmElim]  = useState(null) // paquete a eliminar

  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: paqs }, { data: its }] = await Promise.all([
      supabase.from('paquetes')
        .select('id, nombre, descripcion, activo, paquete_items(id, item_id, cantidad, items(nombre, unidad_medida))')
        .order('nombre'),
      supabase.from('items')
        .select('id, nombre, unidad_medida')
        .eq('bodega_id', BODEGA_MECANIZADOS)
        .eq('categoria_id', CAT_PRODUCTO_MECANIZADO)
        .eq('activo', true)
        .order('nombre'),
    ])
    setPaquetes((paqs || []).map(p => ({
      ...p,
      paquete_items: (p.paquete_items || []).slice().sort((a, b) =>
        (a.items?.nombre || '').localeCompare(b.items?.nombre || '', 'es')),
    })))
    setItems(its || [])
    setCargando(false)
  }

  // ── Paquetes ──────────────────────────────────────────────────────────────
  async function renombrar(paqId, nuevoNombre) {
    if (!nuevoNombre.trim()) return
    await supabase.from('paquetes').update({ nombre: nuevoNombre.trim() }).eq('id', paqId)
    setPaquetes(prev => prev.map(p => p.id === paqId ? { ...p, nombre: nuevoNombre.trim() } : p))
  }

  async function cambiarDescripcion(paqId, nuevaDesc) {
    await supabase.from('paquetes').update({ descripcion: nuevaDesc || null }).eq('id', paqId)
    setPaquetes(prev => prev.map(p => p.id === paqId ? { ...p, descripcion: nuevaDesc || null } : p))
  }

  async function toggleActivo(paqId, actual) {
    await supabase.from('paquetes').update({ activo: !actual }).eq('id', paqId)
    setPaquetes(prev => prev.map(p => p.id === paqId ? { ...p, activo: !actual } : p))
  }

  async function crearPaquete() {
    if (!nuevoNombre.trim()) return
    const { data, error: err } = await supabase.from('paquetes')
      .insert({ nombre: nuevoNombre.trim(), activo: true }).select().single()
    if (err) { setError('Error al crear paquete: ' + err.message); return }
    setPaquetes(prev => [...prev, { ...data, paquete_items: [] }].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    setNuevoNombre('')
    setAgregandoPaq(false)
    setExpandido(data.id)
  }

  async function eliminarPaquete(paq) {
    const { error: err } = await supabase.from('paquetes').delete().eq('id', paq.id)
    if (err) { setError('Error al eliminar: ' + err.message); setConfirmElim(null); return }
    setPaquetes(prev => prev.filter(p => p.id !== paq.id))
    setConfirmElim(null)
  }

  // ── Piezas del paquete ────────────────────────────────────────────────────
  async function eliminarFila(filaId, paqId) {
    await supabase.from('paquete_items').delete().eq('id', filaId)
    setPaquetes(prev => prev.map(p => p.id === paqId
      ? { ...p, paquete_items: p.paquete_items.filter(r => r.id !== filaId) }
      : p))
  }

  async function agregarPieza(paqId) {
    const np = nuevaPieza[paqId]
    if (!np?.item?.id || !np.cantidad || Number(np.cantidad) <= 0) {
      setError('Selecciona una pieza y una cantidad válida.'); return
    }
    setError('')
    const { data, error: err } = await supabase.from('paquete_items')
      .insert({ paquete_id: paqId, item_id: np.item.id, cantidad: Number(np.cantidad) })
      .select('id').single()
    if (err) { setError('Error: ' + err.message); return }
    setPaquetes(prev => prev.map(p => p.id === paqId
      ? {
          ...p,
          paquete_items: [...p.paquete_items, { id: data.id, item_id: np.item.id, cantidad: Number(np.cantidad), items: { nombre: np.item.nombre, unidad_medida: np.item.unidad_medida } }]
            .sort((a, b) => (a.items?.nombre || '').localeCompare(b.items?.nombre || '', 'es')),
        }
      : p))
    setNuevaPieza(prev => ({ ...prev, [paqId]: { item: null, cantidad: '' } }))
  }

  function setNP(paqId, campo, val) {
    setNuevaPieza(prev => ({ ...prev, [paqId]: { ...(prev[paqId] || {}), [campo]: val } }))
  }

  if (cargando) return <p className="text-center text-gray-400 py-20">Cargando…</p>

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2.5 rounded-xl">
            <Boxes size={22} className="text-feisen-azul" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Paquetes de Mecanizados</h1>
            <p className="text-xs text-gray-500">Kits de piezas para la salida de ensamble (producción interna)</p>
          </div>
        </div>
        <button onClick={() => setAgregandoPaq(v => !v)}
          className="flex items-center gap-2 bg-feisen-rojo text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
          <Plus size={16} /> Nuevo paquete
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Formulario nuevo paquete */}
      {agregandoPaq && (
        <div className="mb-4 bg-white border border-feisen-azul/30 rounded-2xl p-4 flex gap-3 items-center shadow-sm">
          <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && crearPaquete()}
            placeholder="Nombre del paquete (ej: Mezcladora 1 Bulto)"
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
            autoFocus
          />
          <button onClick={crearPaquete}
            className="bg-feisen-azul text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
            Crear
          </button>
          <button onClick={() => { setAgregandoPaq(false); setNuevoNombre('') }}
            className="text-gray-400 hover:text-gray-600 p-2">
            <X size={18} />
          </button>
        </div>
      )}

      {paquetes.length === 0 && !agregandoPaq && (
        <p className="text-center text-gray-400 py-10 text-sm">No hay paquetes creados aún.</p>
      )}

      {/* Lista de paquetes */}
      <div className="space-y-3">
        {paquetes.map(paq => {
          const filas      = paq.paquete_items
          const abierto    = expandido === paq.id
          const idsUsados  = filas.map(r => r.item_id)
          const np         = nuevaPieza[paq.id] || {}

          return (
            <div key={paq.id} className={`bg-white rounded-2xl border overflow-hidden transition-all
              ${abierto ? 'border-feisen-azul/40 shadow-md' : 'border-gray-200'} ${!paq.activo ? 'opacity-60' : ''}`}>

              {/* Cabecera de paquete */}
              <div className="flex items-center gap-3 px-5 py-4">
                <button onClick={() => toggleActivo(paq.id, paq.activo)}
                  title={paq.activo ? 'Activo — clic para desactivar' : 'Inactivo — clic para activar'}
                  className={`w-3 h-3 rounded-full shrink-0 transition-colors ${paq.activo ? 'bg-green-400' : 'bg-gray-300'}`}
                />

                <div className="flex-1 min-w-0">
                  <InlineEdit valor={paq.nombre}
                    onGuardar={nuevoNombre => renombrar(paq.id, nuevoNombre)}
                    className="text-sm font-bold text-gray-800"
                  />
                  <InlineEdit valor={paq.descripcion} placeholder="Agregar descripción…"
                    onGuardar={desc => cambiarDescripcion(paq.id, desc)}
                    className="text-xs text-gray-400 mt-0.5"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">{filas.length} pieza{filas.length !== 1 ? 's' : ''}</p>
                </div>

                <button onClick={() => setConfirmElim(paq)}
                  className="p-2 text-gray-300 hover:text-feisen-rojo hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={16} />
                </button>

                <button onClick={() => setExpandido(abierto ? null : paq.id)}
                  className="p-2 text-gray-400 hover:text-feisen-azul transition-colors rounded-lg hover:bg-blue-50">
                  {abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>

              {abierto && (
                <div className="border-t border-gray-100">
                  {filas.length > 0 && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 font-bold uppercase border-b border-gray-100">
                          <th className="text-left px-6 py-3">Pieza</th>
                          <th className="text-center px-4 py-3 w-32">Cantidad</th>
                          <th className="w-10 px-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filas.map(row => (
                          <tr key={row.id} className="hover:bg-gray-50/50 transition-colors group">
                            <td className="px-6 py-3.5 font-medium text-gray-800">{row.items?.nombre || '(pieza eliminada)'}</td>
                            <td className="px-4 py-3.5 text-center font-bold text-feisen-azul">
                              {row.cantidad} <span className="font-normal text-gray-400">{row.items?.unidad_medida || ''}</span>
                            </td>
                            <td className="px-3 py-3.5">
                              <button onClick={() => eliminarFila(row.id, paq.id)}
                                className="text-gray-200 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100">
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {filas.length === 0 && (
                    <p className="text-center text-gray-400 py-6 text-sm">Sin piezas aún. Agrega la primera abajo.</p>
                  )}

                  <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Agregar pieza</p>
                    <p className="text-xs text-gray-400 mb-3">Solo piezas de categoría "Producto Mecanizado" en la bodega de Mecanizados.</p>
                    <div className="space-y-3">
                      <SelectorItem
                        items={items}
                        excluir={idsUsados}
                        onSeleccionar={item => setNP(paq.id, 'item', item)}
                      />
                      {np.item && (
                        <span className="text-sm bg-blue-100 text-feisen-azul font-semibold px-3 py-2 rounded-lg inline-block max-w-full truncate">
                          Seleccionada: {np.item.nombre}
                        </span>
                      )}
                      <div className="flex items-center gap-2">
                        <input type="number" min="0.001" step="0.001"
                          value={np.cantidad || ''}
                          onChange={e => setNP(paq.id, 'cantidad', e.target.value)}
                          placeholder="Cantidad"
                          className="flex-1 sm:flex-none sm:w-32 border-2 border-gray-300 rounded-xl px-4 py-3.5 text-base text-center focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                        />
                        <button onClick={() => agregarPieza(paq.id)}
                          disabled={!np.item || !np.cantidad}
                          className="bg-feisen-azul text-white rounded-xl px-5 py-3.5 hover:opacity-80 disabled:opacity-40 transition-opacity flex items-center gap-2 font-semibold text-sm shrink-0">
                          <Plus size={18} /> Agregar
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

      {/* Confirmar eliminación de paquete */}
      {confirmElim && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 px-0 sm:px-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-6 space-y-4">
            <p className="font-semibold text-gray-800">¿Eliminar el paquete "{confirmElim.nombre}"?</p>
            <p className="text-sm text-gray-500">Se eliminarán también sus {confirmElim.paquete_items.length} pieza(s). Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmElim(null)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button onClick={() => eliminarPaquete(confirmElim)}
                className="flex-1 bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
