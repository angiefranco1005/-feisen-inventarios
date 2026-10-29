import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'
import { calcularCostosEquipo } from './utils/equipoCosto'

export default function EquiposTab({ fichaId }) {
  const [usados, setUsados] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [equipoSeleccionado, setEquipoSeleccionado] = useState(null)
  const [horas, setHoras] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    setLoading(true)
    const { data: rels, error: errRels } = await supabase
      .from('costeo_ficha_equipos')
      .select('id, equipo_id, horas, created_at')
      .eq('ficha_id', fichaId)
      .order('created_at', { ascending: true })
    if (errRels || !rels || rels.length === 0) {
      setUsados([])
      setLoading(false)
      return
    }
    const equipoIds = rels.map((r) => r.equipo_id)
    const { data: equipos } = await supabase
      .from('costeo_equipos_planta')
      .select('*')
      .in('id', equipoIds)
    const mapa = new Map((equipos || []).map((e) => [e.id, e]))
    setUsados(
      rels.map((r) => {
        const equipo = mapa.get(r.equipo_id)
        const { valorHora } = calcularCostosEquipo(equipo || {})
        return {
          ...r,
          nombre: equipo?.nombre ?? '(equipo eliminado)',
          valor_hora: valorHora,
        }
      })
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
        .from('costeo_equipos_planta')
        .select('id, nombre, centro_costo')
        .ilike('nombre', '%' + query.trim() + '%')
        .order('nombre')
        .limit(10)
      setResultados(data || [])
      setBuscando(false)
    }, 350)
    return () => clearTimeout(timeout)
  }, [query])

  async function agregar(e) {
    e.preventDefault()
    setError('')
    if (!equipoSeleccionado) {
      setError('Busca y selecciona un equipo del catálogo de planta.')
      return
    }
    if (!horas || Number(horas) <= 0) {
      setError('Las horas deben ser mayores a 0.')
      return
    }
    setGuardando(true)
    const { error } = await supabase.from('costeo_ficha_equipos').insert({
      ficha_id: fichaId,
      equipo_id: equipoSeleccionado.id,
      horas: Number(horas),
    })
    if (error) {
      setError('No se pudo guardar: ' + error.message)
    } else {
      setQuery('')
      setResultados([])
      setEquipoSeleccionado(null)
      setHoras('')
      await cargar()
    }
    setGuardando(false)
  }

  async function eliminar(id) {
    await supabase.from('costeo_ficha_equipos').delete().eq('id', id)
    await cargar()
  }

  const totalEquipos = usados.reduce((acc, u) => acc + Number(u.horas) * u.valor_hora, 0)

  return (
    <div>
      <p className="text-sm text-feisen-texto-2 mb-1">
        Registra acá cuántas horas de cada equipo de planta (torno, horno, dobladora, etc.) usó
        esta ficha. El valor por hora de cada equipo se calcula en "Equipos de planta" y se trae
        solo. Si el equipo que necesitas no existe todavía, créalo primero ahí.
      </p>

      <form onSubmit={agregar} className="bg-white border border-feisen-borde rounded-lg p-4 mb-6">
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div className="relative sm:col-span-2">
            <label className="block text-xs font-medium mb-1">Buscar equipo de planta</label>
            <input
              value={equipoSeleccionado ? equipoSeleccionado.nombre : query}
              onChange={(e) => {
                setEquipoSeleccionado(null)
                setQuery(e.target.value)
              }}
              placeholder="ej. Torno CNC 1"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
            {buscando && <p className="text-xs text-feisen-texto-2 mt-1">Buscando…</p>}
            {!equipoSeleccionado && resultados.length > 0 && (
              <ul className="absolute z-10 bg-white border border-feisen-borde rounded-md mt-1 w-full max-h-48 overflow-auto shadow-md">
                {resultados.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => {
                      setEquipoSeleccionado(r)
                      setResultados([])
                    }}
                    className="px-3 py-2 text-sm hover:bg-feisen-gris cursor-pointer"
                  >
                    {r.nombre} <span className="text-xs text-feisen-texto-2">({r.centro_costo})</span>
                  </li>
                ))}
              </ul>
            )}
            {!equipoSeleccionado && query.trim().length >= 2 && !buscando && resultados.length === 0 && (
              <p className="text-xs text-feisen-texto-2 mt-1">
                No hay ningún equipo con ese nombre. Créalo en "Equipos de planta".
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Horas usadas</label>
            <input
              type="number"
              step="any"
              value={horas}
              onChange={(e) => setHoras(e.target.value)}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={guardando}
          className="bg-feisen-azul text-white font-medium rounded-md px-4 py-2 mt-3 hover:opacity-90 disabled:opacity-60"
        >
          {guardando ? 'Agregando…' : 'Agregar horas'}
        </button>
        {error && <p className="text-feisen-rojo text-sm mt-2">{error}</p>}
      </form>

      {loading ? (
        <p className="text-sm text-feisen-texto-2">Cargando…</p>
      ) : usados.length === 0 ? (
        <p className="text-sm text-feisen-texto-2">Todavía no has registrado horas de equipo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-feisen-borde rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-feisen-rojo text-white text-left">
                <th className="px-3 py-2">Equipo</th>
                <th className="px-3 py-2 text-right">Horas</th>
                <th className="px-3 py-2 text-right">Valor/hora</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {usados.map((u) => (
                <tr key={u.id} className="border-t border-feisen-borde">
                  <td className="px-3 py-2">{u.nombre}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(u.horas)}</td>
                  <td className="px-3 py-2 text-right">{formatCOP(u.valor_hora)}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCOP(Number(u.horas) * u.valor_hora)}
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
                  TOTAL EQUIPOS
                </td>
                <td className="px-3 py-2 text-right">{formatCOP(totalEquipos)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
