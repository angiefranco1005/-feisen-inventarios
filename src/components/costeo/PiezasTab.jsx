import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'

export default function PiezasTab({ fichaId }) {
  const [usadas, setUsadas] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [piezaSeleccionada, setPiezaSeleccionada] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    setLoading(true)
    const { data: rels, error: errRels } = await supabase
      .from('costeo_ficha_piezas')
      .select('id, pieza_id, cantidad, created_at')
      .eq('contenedor_id', fichaId)
      .order('created_at', { ascending: true })
    if (errRels || !rels || rels.length === 0) {
      setUsadas([])
      setLoading(false)
      return
    }
    const piezaIds = rels.map((r) => r.pieza_id)
    const { data: costos } = await supabase
      .from('costeo_resumen')
      .select('ficha_id, nombre, costo_total')
      .in('ficha_id', piezaIds)
    const mapa = new Map((costos || []).map((c) => [c.ficha_id, c]))
    setUsadas(
      rels.map((r) => ({
        ...r,
        nombre: mapa.get(r.pieza_id)?.nombre ?? '(pieza eliminada)',
        costo_unitario: Number(mapa.get(r.pieza_id)?.costo_total ?? 0),
      }))
    )
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
        .from('costeo_fichas')
        .select('id, nombre')
        .eq('tipo', 'pieza')
        .neq('id', fichaId)
        .ilike('nombre', `%${query.trim()}%`)
        .order('nombre')
        .limit(10)
      setResultados(data || [])
      setBuscando(false)
    }, 350)
    return () => clearTimeout(timeout)
  }, [query, fichaId])

  async function agregar(e) {
    e.preventDefault()
    setError('')
    if (!piezaSeleccionada) {
      setError('Busca y selecciona una pieza del catálogo.')
      return
    }
    if (!cantidad || Number(cantidad) <= 0) {
      setError('La cantidad debe ser mayor a 0.')
      return
    }
    setGuardando(true)
    const { error } = await supabase.from('costeo_ficha_piezas').insert({
      contenedor_id: fichaId,
      pieza_id: piezaSeleccionada.id,
      cantidad: Number(cantidad),
    })
    if (error) {
      setError('No se pudo guardar: ' + error.message)
    } else {
      setQuery('')
      setResultados([])
      setPiezaSeleccionada(null)
      setCantidad('')
      await cargar()
    }
    setGuardando(false)
  }

  async function eliminar(id) {
    await supabase.from('costeo_ficha_piezas').delete().eq('id', id)
    await cargar()
  }

  const totalPiezas = usadas.reduce((acc, u) => acc + Number(u.cantidad) * u.costo_unitario, 0)

  return (
    <div>
      <p className="text-sm text-feisen-texto-2 mb-4">
        Agrega acá las piezas ya armadas (ej. "La olla", "Chasis") que se usan para construir esta
        ficha. El costo de cada pieza se calcula solo, sumando sus propios materiales, mano de obra
        y CIF — y se hereda automáticamente acá. Si necesitas una pieza que no existe todavía,
        créala primero desde "Catálogo de piezas".
      </p>

      <form onSubmit={agregar} className="bg-white border border-feisen-borde rounded-lg p-4 mb-6">
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div className="relative sm:col-span-2">
            <label className="block text-xs font-medium mb-1">Buscar pieza en el catálogo</label>
            <input
              value={piezaSeleccionada ? piezaSeleccionada.nombre : query}
              onChange={(e) => {
                setPiezaSeleccionada(null)
                setQuery(e.target.value)
              }}
              placeholder="ej. La olla"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
            {buscando && <p className="text-xs text-feisen-texto-2 mt-1">Buscando…</p>}
            {!piezaSeleccionada && resultados.length > 0 && (
              <ul className="absolute z-10 bg-white border border-feisen-borde rounded-md mt-1 w-full max-h-48 overflow-auto shadow-md">
                {resultados.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => {
                      setPiezaSeleccionada(r)
                      setResultados([])
                    }}
                    className="px-3 py-2 text-sm hover:bg-feisen-gris cursor-pointer"
                  >
                    {r.nombre}
                  </li>
                ))}
              </ul>
            )}
            {!piezaSeleccionada && query.trim().length >= 2 && !buscando && resultados.length === 0 && (
              <p className="text-xs text-feisen-texto-2 mt-1">
                No hay ninguna pieza con ese nombre en el catálogo.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Cantidad</label>
            <input
              type="number"
              step="any"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={guardando}
          className="bg-feisen-azul text-white font-medium rounded-md px-4 py-2 mt-3 hover:opacity-90 disabled:opacity-60"
        >
          {guardando ? 'Agregando…' : 'Agregar pieza'}
        </button>
        {error && <p className="text-feisen-rojo text-sm mt-2">{error}</p>}
      </form>

      {loading ? (
        <p className="text-sm text-feisen-texto-2">Cargando…</p>
      ) : usadas.length === 0 ? (
        <p className="text-sm text-feisen-texto-2">Todavía no has agregado piezas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-feisen-borde rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-feisen-rojo text-white text-left">
                <th className="px-3 py-2">Pieza</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Costo unitario</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {usadas.map((u) => (
                <tr key={u.id} className="border-t border-feisen-borde">
                  <td className="px-3 py-2">{u.nombre}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(u.cantidad)}</td>
                  <td className="px-3 py-2 text-right">{formatCOP(u.costo_unitario)}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCOP(Number(u.cantidad) * u.costo_unitario)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => eliminar(u.id)}
                      className="text-feisen-rojo text-xs hover:underline"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-feisen-borde bg-feisen-gris font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  TOTAL PIEZAS
                </td>
                <td className="px-3 py-2 text-right">{formatCOP(totalPiezas)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
