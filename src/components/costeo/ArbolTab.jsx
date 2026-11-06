import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Component, Plus, Cog } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'
import { ETAPAS } from './utils/etapas'
import ProcesoNodo from './ProcesoNodo'

// Árbol de costeo de una ficha: máquina → procesos → (materia prima, toma de tiempos, CIF).
// Los costos vienen de las vistas costeo_procesos_resumen (por proceso) y costeo_resumen (ficha).
// La mano de obra sale SOLO del tiempo real medido: un proceso sin mediciones no tiene costo de
// mano de obra ni CIF, y se avisa arriba para no confiar en un costo incompleto.
export default function ArbolTab({ fichaId }) {
  const [procesos, setProcesos] = useState([])
  const [costos, setCostos] = useState({}) // proceso_id → fila de costeo_procesos_resumen
  const [resumen, setResumen] = useState(null)
  const [piezas, setPiezas] = useState([])
  const [maestro, setMaestro] = useState({}) // etapa → valores sugeridos
  const [loading, setLoading] = useState(true)
  const [abiertos, setAbiertos] = useState(() => new Set())
  const [nuevo, setNuevo] = useState('')
  const [error, setError] = useState('')

  async function cargarCostos() {
    const [pr, cr, rs, fp] = await Promise.all([
      supabase.from('costeo_procesos').select('*').eq('ficha_id', fichaId).order('orden').order('created_at'),
      supabase.from('costeo_procesos_resumen').select('*').eq('ficha_id', fichaId),
      supabase.from('costeo_resumen').select('*').eq('ficha_id', fichaId).maybeSingle(),
      supabase.from('costeo_ficha_piezas').select('id, pieza_id, cantidad').eq('contenedor_id', fichaId),
    ])
    setProcesos(pr.data || [])
    setCostos(Object.fromEntries((cr.data || []).map((c) => [c.proceso_id, c])))
    setResumen(rs.data || null)
    const filas = fp.data || []
    if (filas.length) {
      const { data } = await supabase
        .from('costeo_resumen')
        .select('ficha_id, nombre, costo_total')
        .in('ficha_id', filas.map((f) => f.pieza_id))
      const porId = Object.fromEntries((data || []).map((d) => [d.ficha_id, d]))
      setPiezas(filas.map((f) => ({ ...f, pieza: porId[f.pieza_id] })))
    } else {
      setPiezas([])
    }
    setLoading(false)
  }

  useEffect(() => {
    cargarCostos()
    supabase.from('costeo_etapas_maestro').select('*').then(({ data }) => {
      setMaestro(Object.fromEntries((data || []).map((m) => [m.etapa, m])))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId])

  async function agregarProceso(e) {
    e.preventDefault()
    setError('')
    const nombre = nuevo.trim()
    if (!nombre) {
      setError('Escoge o escribe el proceso.')
      return
    }
    const m = maestro[nombre]
    const { data, error } = await supabase
      .from('costeo_procesos')
      .insert({
        ficha_id: fichaId,
        nombre,
        orden: procesos.length ? Math.max(...procesos.map((p) => p.orden)) + 1 : 1,
        tipo_pago: m?.tipo_pago_sugerido || 'hora',
        tarifa_hora: Number(m?.tarifa_hora_sugerida || 0),
        precio_destajo: Number(m?.precio_destajo_sugerido || 0),
      })
      .select()
      .single()
    if (error) {
      setError('No se pudo agregar: ' + error.message)
      return
    }
    setNuevo('')
    setAbiertos((s) => new Set(s).add(data.id))
    cargarCostos()
  }

  // Sube o baja un proceso intercambiando su orden con el vecino.
  async function mover(idx, delta) {
    const a = procesos[idx]
    const b = procesos[idx + delta]
    if (!a || !b) return
    const ordenA = a.orden === b.orden ? a.orden + delta : b.orden
    await Promise.all([
      supabase.from('costeo_procesos').update({ orden: ordenA }).eq('id', a.id),
      supabase.from('costeo_procesos').update({ orden: a.orden }).eq('id', b.id),
    ])
    cargarCostos()
  }

  function alternar(id) {
    setAbiertos((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  if (loading) return <p className="text-sm text-feisen-texto-2">Cargando…</p>

  const sinTiempos = procesos.filter((p) => p.tipo_pago === 'hora' && !(costos[p.id]?.mediciones > 0))
  const sinTarifa = procesos.filter(
    (p) => (p.tipo_pago === 'hora' ? !(Number(p.tarifa_hora) > 0) : !(Number(p.precio_destajo) > 0))
  )
  const sinCentro = procesos.filter((p) => costos[p.id]?.centro_costo_usado === 'Sin centro')
  const opciones = [...new Set([...ETAPAS.filter((e) => e !== 'Otra'), ...Object.keys(maestro)])]

  return (
    <div className="space-y-4">
      {/* Total y desglose */}
      <div className="bg-white border border-feisen-borde rounded-xl p-4">
        <p className="text-xs uppercase tracking-wide text-feisen-texto-2">Costo total por unidad</p>
        <p className="text-3xl font-semibold text-feisen-texto tabular-nums mt-1">
          {formatCOP(resumen?.costo_total)}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-feisen-texto-2 tabular-nums">
          <span>Materia prima {formatCOP(resumen?.total_mp)}</span>
          <span>Mano de obra {formatCOP(resumen?.total_mod)}</span>
          <span>CIF {formatCOP(resumen?.cif_asignado)}</span>
          {Number(resumen?.total_equipos) > 0 && <span>Equipos {formatCOP(resumen.total_equipos)}</span>}
          {Number(resumen?.costo_piezas_incluidas) > 0 && (
            <span>Sub-piezas {formatCOP(resumen.costo_piezas_incluidas)}</span>
          )}
        </div>
        {resumen?.cif_periodo_usado && (
          <p className="text-xs text-feisen-texto-2 mt-2">CIF con las tasas del período {resumen.cif_periodo_usado}.</p>
        )}
      </div>

      {/* Avisos: lo que deja el costo incompleto va primero */}
      {(sinTiempos.length > 0 || sinTarifa.length > 0 || sinCentro.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 space-y-1">
          {sinTiempos.length > 0 && (
            <p className="flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                <b>Costo incompleto:</b> {sinTiempos.map((p) => p.nombre).join(', ')}{' '}
                {sinTiempos.length === 1 ? 'no tiene' : 'no tienen'} tiempos medidos, así que no suman mano de obra ni CIF.
              </span>
            </p>
          )}
          {sinTarifa.length > 0 && (
            <p className="flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                Sin tarifa: {sinTarifa.map((p) => p.nombre).join(', ')}. Ábrelo y ponle la tarifa en "Editar proceso".
              </span>
            </p>
          )}
          {sinCentro.length > 0 && (
            <p className="flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                Sin centro de costo, no suman CIF: {sinCentro.map((p) => p.nombre).join(', ')}. Escógelo en "Editar
                proceso" o en Costeo › Responsables por etapa.
              </span>
            </p>
          )}
        </div>
      )}

      {/* Árbol */}
      <div className="bg-white border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
        {procesos.length === 0 && piezas.length === 0 && (
          <div className="p-6 text-sm text-feisen-texto-2">
            <p className="font-medium text-feisen-texto">Empieza por los procesos</p>
            <p className="mt-1">
              Agrega en orden los procesos por los que pasa esta máquina (corte, rolado, soldadura, pintura…). Dentro
              de cada uno registras su materia prima y tomas sus tiempos.
            </p>
          </div>
        )}
        {procesos.map((p, idx) => (
          <ProcesoNodo
            key={p.id}
            proceso={p}
            costo={costos[p.id]}
            abierto={abiertos.has(p.id)}
            onAlternar={() => alternar(p.id)}
            onCambio={cargarCostos}
            onSubir={idx > 0 ? () => mover(idx, -1) : null}
            onBajar={idx < procesos.length - 1 ? () => mover(idx, 1) : null}
            numero={idx + 1}
          />
        ))}
        {piezas.map((f) => (
          <Link
            key={f.id}
            to={`/costeo/fichas/${f.pieza_id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-feisen-fondo"
          >
            <ChevronRight size={16} className="text-feisen-texto-2" />
            <Component size={16} className="text-feisen-texto-2" />
            <span className="min-w-0">
              <span className="font-medium text-feisen-texto">{f.pieza?.nombre || 'Pieza'}</span>
              <span className="block text-xs text-feisen-texto-2">
                Sub-pieza · {formatNumber(f.cantidad, 0)} und · tiene su propio árbol
              </span>
            </span>
            <span className="ml-auto font-semibold tabular-nums">
              {formatCOP(Number(f.pieza?.costo_total || 0) * Number(f.cantidad || 0))}
            </span>
          </Link>
        ))}
        {Number(resumen?.total_equipos) > 0 && (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-4" />
            <Cog size={16} className="text-feisen-texto-2" />
            <span className="text-feisen-texto">
              Equipos de planta
              <span className="block text-xs text-feisen-texto-2">Horas-máquina de la pestaña Equipos</span>
            </span>
            <span className="ml-auto font-semibold tabular-nums">{formatCOP(resumen.total_equipos)}</span>
          </div>
        )}
      </div>

      {/* Agregar proceso */}
      <form onSubmit={agregarProceso} className="flex flex-wrap gap-2 items-start">
        <div className="flex-1 min-w-[220px]">
          <input
            list="costeo-procesos-opciones"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Proceso (ej. Soldadura)"
            className="w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm outline-none focus:border-feisen-azul bg-white"
          />
          <datalist id="costeo-procesos-opciones">
            {opciones.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          {error && <p className="text-feisen-rojo text-xs mt-1">{error}</p>}
        </div>
        <button
          type="submit"
          className="flex items-center gap-1 bg-feisen-azul text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-feisen-azul-claro"
        >
          <Plus size={16} /> Agregar proceso
        </button>
      </form>
    </div>
  )
}
