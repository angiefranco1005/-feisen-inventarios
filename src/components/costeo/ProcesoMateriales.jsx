import { useEffect, useState } from 'react'
import { Box, Pencil, Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'

// Materia prima que consume un proceso, por unidad de la ficha. El precio sale en vivo del
// catálogo de inventario (items.precio_costo). "Rinde" es opcional: si 1 lámina da 4 piezas,
// la cantidad queda en 0,25 (se guarda ya dividida, como en la app de costeo original).
// El mismo formulario sirve para agregar (abajo) y para editar (en el lugar de la línea).
export default function ProcesoMateriales({ proceso, onCambio }) {
  const [filas, setFilas] = useState([])
  const [form, setForm] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [item, setItem] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [rinde, setRinde] = useState('')
  const [error, setError] = useState('')

  async function cargar() {
    const { data } = await supabase
      .from('costeo_materiales')
      .select('id, item_id, item_nombre_libre, cantidad, rendimiento, items(nombre, precio_costo, unidad_medida)')
      .eq('proceso_id', proceso.id)
      .order('created_at')
    setFilas(data || [])
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proceso.id])

  useEffect(() => {
    if (item || query.trim().length < 2) {
      setResultados([])
      return
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('items')
        .select('id, nombre, precio_costo, unidad_medida')
        .ilike('nombre', `%${query.trim()}%`)
        .eq('activo', true)
        .order('nombre')
        .limit(8)
      setResultados(data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [query, item])

  function limpiar() {
    setForm(false)
    setEditandoId(null)
    setQuery('')
    setItem(null)
    setCantidad('')
    setRinde('')
    setError('')
  }

  function editar(m) {
    limpiar()
    setEditandoId(m.id)
    setItem(m.item_id ? { id: m.item_id, ...m.items } : null)
    setQuery(m.item_id ? '' : m.item_nombre_libre || '')
    if (m.rendimiento) setRinde(String(m.rendimiento))
    else setCantidad(String(m.cantidad))
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!item && !query.trim()) {
      setError('Busca el insumo o escribe su nombre.')
      return
    }
    const cant = Number(rinde) > 0 ? 1 / Number(rinde) : Number(cantidad)
    if (!(cant > 0)) {
      setError('La cantidad debe ser mayor a 0.')
      return
    }
    const datos = {
      item_id: item?.id ?? null,
      item_nombre_libre: item ? null : query.trim(),
      cantidad: cant,
      rendimiento: Number(rinde) > 0 ? Number(rinde) : null,
    }
    const { error } = editandoId
      ? await supabase.from('costeo_materiales').update(datos).eq('id', editandoId)
      : await supabase
          .from('costeo_materiales')
          .insert({ ficha_id: proceso.ficha_id, proceso_id: proceso.id, etapa: proceso.nombre, ...datos })
    if (error) {
      setError('No se pudo guardar: ' + error.message)
      return
    }
    limpiar()
    cargar()
    onCambio()
  }

  async function quitar(m) {
    if (!window.confirm(`¿Quitar ${m.items?.nombre ?? m.item_nombre_libre} de este proceso?`)) return
    await supabase.from('costeo_materiales').delete().eq('id', m.id)
    cargar()
    onCambio()
  }

  const campo = 'w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm outline-none focus:border-feisen-azul bg-white'

  const formulario = (
    <form onSubmit={guardar} className="mt-2 border border-feisen-borde rounded-lg p-3 bg-white space-y-3">
      <div className="relative">
        <label className="block text-xs text-feisen-texto-2 mb-1">Insumo del catálogo de inventario</label>
        {item ? (
          <div className="flex items-center justify-between border border-feisen-borde rounded-lg px-3 py-2 text-sm">
            <span>
              {item.nombre} <span className="text-feisen-texto-2">· {formatCOP(item.precio_costo)} / {item.unidad_medida}</span>
            </span>
            <button type="button" onClick={() => setItem(null)} className="text-feisen-texto-2 hover:text-feisen-rojo">
              <X size={14} />
            </button>
          </div>
        ) : (
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Lámina HR 3/16" className={campo} />
        )}
        {resultados.length > 0 && (
          <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-feisen-borde rounded-lg shadow-sm max-h-60 overflow-auto">
            {resultados.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setItem(r)}
                  className="w-full flex justify-between gap-3 px-3 py-2 text-sm text-left hover:bg-feisen-fondo"
                >
                  <span>{r.nombre}</span>
                  <span className="text-feisen-texto-2 tabular-nums whitespace-nowrap">{formatCOP(r.precio_costo)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!item && query.trim().length >= 2 && (
          <p className="text-xs text-feisen-texto-2 mt-1">Si no aparece, se guarda con este nombre y sin precio hasta que lo crees en inventario.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-feisen-texto-2 mb-1">Cantidad por unidad {item ? `(${item.unidad_medida})` : ''}</label>
          <input
            type="number"
            step="any"
            value={cantidad}
            onChange={(e) => {
              setCantidad(e.target.value)
              setRinde('')
            }}
            className={campo}
          />
        </div>
        <div>
          <label className="block text-xs text-feisen-texto-2 mb-1">o: 1 unidad rinde para… (opcional)</label>
          <input
            type="number"
            step="any"
            value={rinde}
            onChange={(e) => {
              setRinde(e.target.value)
              setCantidad('')
            }}
            placeholder="4"
            className={campo}
          />
        </div>
      </div>
      {error && <p className="text-feisen-rojo text-xs">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" className="bg-feisen-azul text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-feisen-azul-claro">
          {editandoId ? 'Guardar' : 'Agregar'}
        </button>
        <button type="button" onClick={limpiar} className="text-sm text-feisen-texto-2 hover:underline">
          Cancelar
        </button>
      </div>
    </form>
  )

  return (
    <section>
      <h4 className="flex items-center gap-2 text-xs uppercase tracking-wide text-feisen-texto-2 mb-2">
        <Box size={14} /> Materia prima
      </h4>
      {filas.length === 0 && !form && (
        <p className="text-sm text-feisen-texto-2">Este proceso no consume materia prima todavía.</p>
      )}
      {filas.length > 0 && (
        <ul className="divide-y divide-feisen-borde-suave border border-feisen-borde rounded-lg bg-white">
          {filas.map((m) => {
            const precio = Number(m.items?.precio_costo ?? 0)
            if (m.id === editandoId) return <li key={m.id} className="p-2">{formulario}</li>
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-feisen-texto">{m.items?.nombre ?? m.item_nombre_libre}</span>
                  <span className="block text-xs text-feisen-texto-2 tabular-nums">
                    {formatNumber(m.cantidad, m.rendimiento ? 4 : 2)} {m.items?.unidad_medida ?? ''} × {formatCOP(precio)}
                    {m.rendimiento ? ` · rinde ${formatNumber(m.rendimiento, 0)}` : ''}
                    {!m.item_id && <span className="text-feisen-rojo"> · no está en el catálogo (sin precio)</span>}
                  </span>
                </span>
                <span className="ml-auto tabular-nums whitespace-nowrap">{formatCOP(Number(m.cantidad) * precio)}</span>
                <button onClick={() => editar(m)} className="flex items-center gap-1 text-xs font-medium text-feisen-azul hover:underline px-1 py-1">
                  <Pencil size={13} /> Editar
                </button>
                <button onClick={() => quitar(m)} title="Quitar" className="text-feisen-texto-2 hover:text-feisen-rojo">
                  <X size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {form && !editandoId ? (
        formulario
      ) : (
        <button onClick={() => { limpiar(); setForm(true) }} className="mt-2 flex items-center gap-1 text-sm text-feisen-azul hover:underline">
          <Plus size={14} /> Agregar materia prima
        </button>
      )}
    </section>
  )
}
