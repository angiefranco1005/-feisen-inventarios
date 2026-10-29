import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'
import { ETAPAS } from './utils/etapas'

const SIN_PARTE = '__sin_parte__'

export default function MaterialesTab({ fichaId }) {
  const [materiales, setMateriales] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [itemSeleccionado, setItemSeleccionado] = useState(null)
  const [nombreLibre, setNombreLibre] = useState('')
  const [parte, setParte] = useState('')
  const [etapa, setEtapa] = useState(ETAPAS[0])
  const [cantidad, setCantidad] = useState('')
  const [rendimiento, setRendimiento] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [editandoId, setEditandoId] = useState(null)

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('costeo_materiales')
      .select('id, item_id, item_nombre_libre, etapa, cantidad, parte, rendimiento, items(nombre, precio_costo, unidad_medida)')
      .eq('ficha_id', fichaId)
      .order('created_at', { ascending: true })
    if (!error) setMateriales(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResultados([])
      return
    }
    setBuscando(true)
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('items')
        .select('id, nombre, precio_costo, unidad_medida')
        .ilike('nombre', `%${query.trim()}%`)
        .eq('activo', true)
        .order('nombre')
        .limit(10)
      setResultados(data || [])
      setBuscando(false)
    }, 350)
    return () => clearTimeout(timeout)
  }, [query])

  function limpiarForm() {
    setQuery('')
    setResultados([])
    setItemSeleccionado(null)
    setNombreLibre('')
    setParte('')
    setEtapa(ETAPAS[0])
    setCantidad('')
    setRendimiento('')
    setEditandoId(null)
  }

  function iniciarEdicion(m) {
    setEditandoId(m.id)
    if (m.item_id) {
      setItemSeleccionado({
        id: m.item_id,
        nombre: m.items?.nombre ?? '',
        precio_costo: m.items?.precio_costo ?? 0,
        unidad_medida: m.items?.unidad_medida ?? '',
      })
      setNombreLibre('')
    } else {
      setItemSeleccionado(null)
      setNombreLibre(m.item_nombre_libre ?? '')
    }
    setQuery('')
    setResultados([])
    setParte(m.parte ?? '')
    setEtapa(m.etapa ?? ETAPAS[0])
    setCantidad(String(m.cantidad ?? ''))
    setRendimiento(m.rendimiento ? String(m.rendimiento) : '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function agregar(e) {
    e.preventDefault()
    setError('')
    if (!itemSeleccionado && !nombreLibre.trim()) {
      setError('Busca y selecciona un insumo del catálogo, o escribe uno nuevo.')
      return
    }
    if (!cantidad || Number(cantidad) <= 0) {
      setError('La cantidad debe ser mayor a 0.')
      return
    }
    setGuardando(true)
    const payload = {
      item_id: itemSeleccionado ? itemSeleccionado.id : null,
      item_nombre_libre: itemSeleccionado ? null : nombreLibre.trim(),
      etapa,
      cantidad: Number(cantidad),
      parte: parte.trim() ? parte.trim() : null,
      rendimiento: rendimiento.trim() ? Number(rendimiento) : null,
    }
    const { error } = editandoId
      ? await supabase.from('costeo_materiales').update(payload).eq('id', editandoId)
      : await supabase.from('costeo_materiales').insert({ ficha_id: fichaId, ...payload })
    if (error) {
      setError('No se pudo guardar: ' + error.message)
    } else {
      limpiarForm()
      await cargar()
    }
    setGuardando(false)
  }

  async function eliminar(id) {
    await supabase.from('costeo_materiales').delete().eq('id', id)
    if (editandoId === id) limpiarForm()
    await cargar()
  }

  const totalMP = materiales.reduce(
    (acc, m) => acc + Number(m.cantidad) * Number(m.items?.precio_costo ?? 0),
    0
  )

  // Agrupar por "parte" solo si al menos una línea la tiene; si no, se muestra todo plano.
  const hayPartes = materiales.some((m) => m.parte)
  const grupos = new Map()
  if (hayPartes) {
    for (const m of materiales) {
      const clave = m.parte || SIN_PARTE
      if (!grupos.has(clave)) grupos.set(clave, [])
      grupos.get(clave).push(m)
    }
  }

  return (
    <div>
      <p className="text-sm text-feisen-texto-2 mb-4">
        Busca el insumo en el catálogo de inventarios — el precio se toma en vivo de ahí. Si no
        lo encuentras, escribe el nombre y luego lo puedes reemplazar por el del catálogo. Si esta
        ficha se arma con varias partes (ej. cintura, cono), ponle el nombre de la parte a cada
        línea para verlas agrupadas.
      </p>

      <form onSubmit={agregar} className="bg-white border border-feisen-borde rounded-lg p-4 mb-6">
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div className="relative">
            <label className="block text-xs font-medium mb-1">Buscar insumo en catálogo</label>
            <input
              value={itemSeleccionado ? itemSeleccionado.nombre : query}
              onChange={(e) => {
                setItemSeleccionado(null)
                setQuery(e.target.value)
              }}
              placeholder="ej. lámina de acero"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
            {buscando && <p className="text-xs text-feisen-texto-2 mt-1">Buscando…</p>}
            {!itemSeleccionado && resultados.length > 0 && (
              <ul className="absolute z-10 bg-white border border-feisen-borde rounded-md mt-1 w-full max-h-48 overflow-auto shadow-md">
                {resultados.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => {
                      setItemSeleccionado(r)
                      setResultados([])
                    }}
                    className="px-3 py-2 text-sm hover:bg-feisen-gris cursor-pointer flex justify-between"
                  >
                    <span>{r.nombre}</span>
                    <span className="text-feisen-azul">{formatCOP(r.precio_costo)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              O insumo nuevo (aún no está en el catálogo)
            </label>
            <input
              value={nombreLibre}
              onChange={(e) => {
                setItemSeleccionado(null)
                setNombreLibre(e.target.value)
              }}
              placeholder="nombre del insumo"
              disabled={!!itemSeleccionado}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul disabled:bg-feisen-gris"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Nombre de la parte <span className="font-normal text-feisen-texto-2">(opcional)</span>
            </label>
            <input
              value={parte}
              onChange={(e) => setParte(e.target.value)}
              placeholder="ej. Cintura, Cono"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              ¿De cuántas partes rinde 1 unidad?{' '}
              <span className="font-normal text-feisen-texto-2">(opcional)</span>
            </label>
            <input
              type="number"
              step="any"
              min="1"
              value={rendimiento}
              onChange={(e) => {
                const val = e.target.value
                setRendimiento(val)
                const n = Number(val)
                if (val.trim() && n > 0) {
                  setCantidad(String(Number((1 / n).toFixed(6))))
                }
              }}
              placeholder="ej. 4 (salen 4 cinturas de 1 lámina)"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Etapa</label>
            <select
              value={etapa}
              onChange={(e) => setEtapa(e.target.value)}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            >
              {ETAPAS.map((et) => (
                <option key={et} value={et}>
                  {et}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Cantidad {itemSeleccionado ? `(${itemSeleccionado.unidad_medida})` : ''}
            </label>
            <input
              type="number"
              step="any"
              value={cantidad}
              onChange={(e) => {
                setCantidad(e.target.value)
                setRendimiento('')
              }}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
            {rendimiento.trim() && Number(rendimiento) > 0 && (
              <p className="text-xs text-feisen-texto-2 mt-1">
                = {formatNumber(1 / Number(rendimiento), 4)} unidad por parte
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={guardando}
            className="bg-feisen-azul text-white font-medium rounded-md px-6 py-2 hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Agregar insumo'}
          </button>
          {editandoId && (
            <button type="button" onClick={limpiarForm} className="text-sm text-feisen-texto-2 hover:underline">
              Cancelar edición
            </button>
          )}
        </div>
        {error && <p className="text-feisen-rojo text-sm mt-2">{error}</p>}
      </form>

      {loading ? (
        <p className="text-sm text-feisen-texto-2">Cargando…</p>
      ) : materiales.length === 0 ? (
        <p className="text-sm text-feisen-texto-2">Todavía no has agregado insumos.</p>
      ) : hayPartes ? (
        <div className="space-y-4">
          {[...grupos.entries()]
            .sort(([a], [b]) => {
              if (a === SIN_PARTE) return 1
              if (b === SIN_PARTE) return -1
              return a.localeCompare(b)
            })
            .map(([clave, filas]) => (
              <TablaMateriales
                key={clave}
                titulo={clave === SIN_PARTE ? 'Sin parte específica' : clave}
                filas={filas}
                onEliminar={eliminar}
                onEditar={iniciarEdicion}
              />
            ))}
          <div className="flex justify-between px-4 py-3 bg-feisen-azul text-white font-semibold rounded-lg">
            <span>TOTAL MP</span>
            <span>{formatCOP(totalMP)}</span>
          </div>
        </div>
      ) : (
        <TablaMateriales filas={materiales} onEliminar={eliminar} onEditar={iniciarEdicion} totalMP={totalMP} />
      )}
    </div>
  )
}

function TablaMateriales({ titulo, filas, onEliminar, onEditar, totalMP }) {
  const subtotal = filas.reduce(
    (acc, m) => acc + Number(m.cantidad) * Number(m.items?.precio_costo ?? 0),
    0
  )
  return (
    <div className="overflow-x-auto">
      {titulo && <h3 className="text-sm font-semibold text-feisen-texto-2 mb-1">{titulo}</h3>}
      <table className="w-full text-sm border border-feisen-borde rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-feisen-rojo text-white text-left">
            <th className="px-3 py-2">Insumo</th>
            <th className="px-3 py-2">Etapa</th>
            <th className="px-3 py-2 text-right">Cantidad</th>
            <th className="px-3 py-2 text-right">Precio unitario</th>
            <th className="px-3 py-2 text-right">Subtotal</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {filas.map((m) => {
            const precio = Number(m.items?.precio_costo ?? 0)
            const fila = Number(m.cantidad) * precio
            return (
              <tr key={m.id} className="border-t border-feisen-borde">
                <td className="px-3 py-2">
                  {m.items?.nombre ?? m.item_nombre_libre}
                  {!m.item_id && (
                    <span className="text-xs text-feisen-rojo ml-1">(no está en catálogo)</span>
                  )}
                </td>
                <td className="px-3 py-2">{m.etapa}</td>
                <td className="px-3 py-2 text-right">
                  {formatNumber(m.cantidad)} {m.items?.unidad_medida ?? ''}
                  {m.rendimiento && (
                    <span className="block text-xs text-feisen-texto-2">
                      (rinde {formatNumber(m.rendimiento, 0)} por unidad)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{formatCOP(precio)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCOP(fila)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => onEditar(m)} className="text-feisen-azul text-xs hover:underline mr-2">
                    Editar
                  </button>
                  <button onClick={() => onEliminar(m.id)} className="text-feisen-rojo text-xs hover:underline">
                    Quitar
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-feisen-borde bg-feisen-gris font-semibold">
            <td className="px-3 py-2" colSpan={4}>
              {titulo ? `Subtotal ${titulo}` : 'TOTAL MP'}
            </td>
            <td className="px-3 py-2 text-right">{formatCOP(totalMP ?? subtotal)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
