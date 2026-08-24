import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { ClipboardList, CheckCircle2, Plus, Trash2, ArrowLeft } from 'lucide-react'

function hoyCol() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

function numOrden(n) {
  return `ORD-MOL-${String(n).padStart(4, '0')}`
}

// ── Stepper visual ────────────────────────────────────────────────────────────
function Stepper({ paso, onBack }) {
  const pasos = [
    { n: 1, label: 'Configurar',       sub: 'Fecha, tipo y máquinas' },
    { n: 2, label: 'Revisar y asignar', sub: 'Piezas y moldeadores' },
  ]
  return (
    <div className="flex items-center gap-0 mb-6">
      {pasos.map((p, i) => {
        const activo    = paso === p.n
        const completado = paso > p.n
        return (
          <div key={p.n} className="flex items-center flex-1">
            {/* Paso */}
            <button
              type="button"
              disabled={p.n >= paso}  // solo se puede navegar atrás
              onClick={() => p.n < paso && onBack()}
              className={`flex items-center gap-3 flex-1 px-4 py-3 rounded-2xl transition-all
                ${activo    ? 'bg-feisen-azul text-white shadow-md'             : ''}
                ${completado ? 'bg-blue-50 text-feisen-azul cursor-pointer hover:bg-blue-100' : ''}
                ${!activo && !completado ? 'bg-gray-100 text-gray-400 cursor-default' : ''}
              `}
            >
              {/* Círculo número */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                ${activo    ? 'bg-white text-feisen-azul'  : ''}
                ${completado ? 'bg-feisen-azul text-white'  : ''}
                ${!activo && !completado ? 'bg-gray-300 text-white' : ''}
              `}>
                {completado ? '✓' : p.n}
              </div>
              <div className="text-left min-w-0">
                <p className={`text-sm font-semibold leading-tight ${activo ? 'text-white' : ''}`}>{p.label}</p>
                <p className={`text-xs leading-tight mt-0.5 ${activo ? 'text-blue-100' : 'opacity-60'}`}>{p.sub}</p>
              </div>
            </button>
            {/* Conector */}
            {i < pasos.length - 1 && (
              <div className={`h-0.5 w-4 shrink-0 ${paso > p.n ? 'bg-feisen-azul' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
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

// ── Componente principal ──────────────────────────────────────────────────────
export default function CrearOrdenMoldeo() {
  const { perfil } = useAuth()

  const [tipo,         setTipo]         = useState('maquinas')
  const [fecha,        setFecha]        = useState(hoyCol())
  const [paso,         setPaso]         = useState(1)

  const [maquinas,     setMaquinas]     = useState([])
  const [allItems,     setAllItems]     = useState([])
  const [fundBodegaId, setFundBodegaId] = useState(null)

  const [cantidades,   setCantidades]   = useState({})
  const [calculando,   setCalculando]   = useState(false)

  const [piezas,       setPiezas]       = useState([])

  const [libreItem,    setLibreItem]    = useState('')
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
      const { data: fundItems } = await supabase.from('items')
        .select('id, nombre, peso_unitario').eq('bodega_id', bod.id).eq('activo', true).order('nombre')
      setAllItems(fundItems || [])
    }
  }

  function setCant(maqId, val) {
    setCantidades(prev => ({ ...prev, [maqId]: val === '' ? '' : Math.max(0, parseInt(val) || 0) }))
  }

  // Preserva asignaciones existentes al recalcular
  async function calcularPiezas() {
    setError('')
    const seleccionadas = Object.entries(cantidades).filter(([_, c]) => Number(c) > 0)
    if (seleccionadas.length === 0) { setError('Ingresa cantidad en al menos una máquina.'); return }

    setCalculando(true)
    try {
      const maqIds = seleccionadas.map(([id]) => id)
      const { data: bom } = await supabase
        .from('bom_maquina_piezas')
        .select('maquina_id, item_id, cantidad_por_maquina, items(id, nombre, peso_unitario)')
        .in('maquina_id', maqIds)

      // Mapa de piezas ya asignadas (para preservar moldeador al recalcular)
      const prevMap = {}
      piezas.forEach(p => { prevMap[p.item_id] = p })

      const agregado = {}
      for (const row of (bom || [])) {
        const cantMaq = Number(cantidades[row.maquina_id]) || 0
        const total   = row.cantidad_por_maquina * cantMaq
        if (!agregado[row.item_id]) {
          agregado[row.item_id] = {
            item_id:           row.item_id,
            nombre:            row.items?.nombre || '',
            peso_unitario:     row.items?.peso_unitario || 0,
            cantidad_planeada: 0,
            // Preservar moldeador ya asignado
            asignado_a:        prevMap[row.item_id]?.asignado_a || '',
            stock_actual:      null,
          }
        }
        agregado[row.item_id].cantidad_planeada += total
      }

      // Stock actual
      const itemIds = Object.keys(agregado)
      if (itemIds.length > 0 && fundBodegaId) {
        const { data: stocks } = await supabase.from('stock')
          .select('item_id, cantidad_actual').in('item_id', itemIds).eq('bodega_id', fundBodegaId)
        for (const s of (stocks || [])) {
          if (agregado[s.item_id]) agregado[s.item_id].stock_actual = s.cantidad_actual ?? 0
        }
      }

      setPiezas(Object.values(agregado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      setPaso(2)
    } finally {
      setCalculando(false)
    }
  }

  function irAtras() {
    setError('')
    setPaso(1)
  }

  function agregarLibre() {
    if (!libreItem || !libreCant || Number(libreCant) <= 0) {
      setError('Selecciona una pieza y una cantidad válida.'); return
    }
    const item = allItems.find(i => i.nombre === libreItem)
    if (!item) { setError('Pieza no encontrada en el catálogo.'); return }
    if (piezas.some(p => p.item_id === item.id)) { setError('Esa pieza ya está en la lista.'); return }
    setPiezas(prev => [...prev, {
      item_id: item.id, nombre: item.nombre, peso_unitario: item.peso_unitario || 0,
      cantidad_planeada: Number(libreCant), asignado_a: '', stock_actual: null,
    }].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    setLibreItem(''); setLibreCant(''); setError('')
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
      const { data: orden, error: err1 } = await supabase.from('ordenes_moldeo')
        .insert({ fecha, tipo, usuario_id: perfil.id })
        .select('id, numero').single()
      if (err1) throw err1

      if (tipo === 'maquinas') {
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
    setTipo('maquinas'); setFecha(hoyCol()); setPaso(1)
    setCantidades({}); setPiezas([]); setLibreItem(''); setLibreCant('')
    setError(''); setExito(null)
  }

  // ── Éxito ──────────────────────────────────────────────────────────────────
  if (exito) {
    return (
      <div className="max-w-xl mx-auto p-4 flex flex-col items-center justify-center gap-5 py-20">
        <CheckCircle2 size={60} className="text-green-500" />
        <div className="text-center">
          <p className="text-xl font-bold text-gray-800">¡Orden de moldeo creada!</p>
          <p className="text-feisen-azul font-bold text-2xl mt-2">{numOrden(exito.numero)}</p>
        </div>
        <button onClick={limpiar}
          className="bg-feisen-rojo text-white rounded-xl px-8 py-3 text-sm font-semibold hover:opacity-90 transition-opacity">
          Crear otra orden
        </button>
      </div>
    )
  }

  // ── Resumen de carga por moldeador ─────────────────────────────────────────
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

  return (
    <div className="max-w-3xl mx-auto p-4 pb-28">

      {/* Header fijo */}
      <div className="flex items-center gap-3 mb-5">
        <div className="bg-blue-100 p-2.5 rounded-xl">
          <ClipboardList size={22} className="text-feisen-azul" />
        </div>
        <h1 className="text-xl font-bold text-gray-800">Nueva Orden de Moldeo</h1>
      </div>

      {/* Stepper siempre visible — paso 1 clickeable desde paso 2 */}
      <Stepper paso={paso} onBack={irAtras} />

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      {/* ══ PASO 1 ══ */}
      {paso === 1 && (
        <div className="space-y-5">
          {/* Info general */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Información general</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fecha *</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tipo de orden</label>
                <div className="flex rounded-xl overflow-hidden border border-gray-300">
                  {[['maquinas','Por máquinas'],['libre','Libre']].map(([val, lab]) => (
                    <button key={val} type="button"
                      onClick={() => { setTipo(val); setPiezas([]) }}
                      className={`flex-1 py-2.5 text-sm font-semibold transition-colors
                        ${tipo === val ? 'bg-feisen-azul text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {lab}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Máquinas */}
          {tipo === 'maquinas' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                Cantidad de máquinas a producir
              </h2>
              <div className="grid grid-cols-2 gap-3">
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

              {/* Resumen de lo seleccionado */}
              {Object.values(cantidades).some(c => Number(c) > 0) && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 font-medium mb-2">Seleccionadas:</p>
                  <div className="flex flex-wrap gap-2">
                    {maquinas.filter(m => Number(cantidades[m.id]) > 0).map(m => (
                      <span key={m.id} className="bg-blue-100 text-feisen-azul text-xs font-semibold px-2.5 py-1 rounded-full">
                        {Number(cantidades[m.id])} × {m.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={calcularPiezas} disabled={calculando}
                className="mt-5 w-full bg-feisen-azul text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity">
                {calculando ? 'Calculando…' : 'Calcular piezas →'}
              </button>
            </div>
          )}

          {tipo === 'libre' && (
            <button onClick={() => { setPaso(2) }}
              className="w-full bg-feisen-azul text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity">
              Continuar → Agregar piezas manualmente
            </button>
          )}
        </div>
      )}

      {/* ══ PASO 2 ══ */}
      {paso === 2 && (
        <div className="space-y-5">

          {/* Botón atrás prominente */}
          <button onClick={irAtras}
            className="flex items-center gap-2 text-sm font-semibold text-feisen-azul hover:opacity-70 transition-opacity">
            <ArrowLeft size={16} /> Volver a configuración
          </button>

          {/* Resumen de máquinas (solo tipo maquinas) */}
          {tipo === 'maquinas' && Object.values(cantidades).some(c => Number(c) > 0) && (
            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
              <p className="text-xs font-bold text-feisen-azul uppercase mb-2">Máquinas seleccionadas</p>
              <div className="flex flex-wrap gap-2">
                {maquinas.filter(m => Number(cantidades[m.id]) > 0).map(m => (
                  <span key={m.id} className="bg-white border border-blue-200 text-feisen-azul text-xs font-semibold px-2.5 py-1 rounded-full">
                    {Number(cantidades[m.id])} × {m.nombre}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Agregar pieza (modo libre) */}
          {tipo === 'libre' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Agregar pieza</h2>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Pieza</label>
                  <InputSug value={libreItem} onChange={setLibreItem}
                    placeholder="Nombre de la pieza" storageKey="feisen_piezas_moldeo" />
                </div>
                <div className="w-28">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Cantidad</label>
                  <input type="number" min="1" value={libreCant} onChange={e => setLibreCant(e.target.value)}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
                </div>
                <button onClick={agregarLibre}
                  className="bg-feisen-azul text-white rounded-lg p-2 hover:opacity-80 transition-opacity">
                  <Plus size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Tabla de piezas */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <p className="text-sm font-bold text-gray-700">Piezas a moldear</p>
                <p className="text-xs text-gray-400 mt-0.5">{piezas.length} ítems · Puedes ajustar cantidades y asignar moldeadores</p>
              </div>
              {tipo === 'maquinas' && (
                <button onClick={calcularPiezas} disabled={calculando}
                  className="text-xs font-semibold text-feisen-azul bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-60 transition-colors">
                  {calculando ? '…' : '↻ Recalcular'}
                </button>
              )}
            </div>

            {piezas.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">Sin piezas. Agrega al menos una.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase border-b border-gray-100">
                      <th className="text-left px-4 py-3">Pieza</th>
                      <th className="text-center px-3 py-3 w-28">Cantidad</th>
                      <th className="text-center px-3 py-3 w-20">Stock</th>
                      <th className="text-left px-3 py-3">Moldeador</th>
                      {tipo === 'libre' && <th className="w-8 px-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {piezas.map((p) => (
                      <tr key={p.item_id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800 leading-tight">{p.nombre}</td>
                        <td className="px-3 py-3 text-center">
                          <input type="number" min="0" step="1"
                            value={p.cantidad_planeada}
                            onChange={e => actualizarPieza(p.item_id, 'cantidad_planeada', e.target.value)}
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          {p.stock_actual != null
                            ? <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                Number(p.stock_actual) < Number(p.cantidad_planeada)
                                  ? 'bg-orange-100 text-orange-600'
                                  : 'bg-green-100 text-green-600'
                              }`}>
                                {p.stock_actual}
                              </span>
                            : <span className="text-gray-300 text-xs">—</span>
                          }
                        </td>
                        <td className="px-3 py-3">
                          <InputSug value={p.asignado_a}
                            onChange={v => actualizarPieza(p.item_id, 'asignado_a', v)}
                            placeholder="Moldeador" storageKey="feisen_moldeadores" />
                        </td>
                        {tipo === 'libre' && (
                          <td className="px-2 py-3">
                            <button onClick={() => quitarPieza(p.item_id)}
                              className="text-gray-300 hover:text-red-400 transition-colors p-1">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Balance por moldeador */}
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
                      {d.kg > 0 && <p className="text-xs text-gray-400">{d.kg.toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg</p>}
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
