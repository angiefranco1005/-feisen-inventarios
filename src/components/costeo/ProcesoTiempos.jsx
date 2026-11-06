import { useEffect, useState } from 'react'
import { Clock, Pencil, Play, Plus, Square, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatNumber } from './utils/format'
import { tipoTitulo } from './utils/nombres'
import { aHoras, duracionTexto, hoy, partirHoras, porPiezaTexto, relojDesde } from './utils/tiempos'

// Toma de tiempos de un proceso, con cronómetro: cada medición es "este tiempo, estas piezas",
// más notas de cómo se tomó. El costo usa el promedio ponderado: Σ tiempo ÷ Σ piezas = horas por
// pieza (las mediciones viejas con varios operarios cuentan operarios × horas). El cronómetro de
// la app vive en este navegador (localStorage) hasta que se guarda.
const claveCrono = (id) => `costeo-crono-${id}`

function leerCrono(id) {
  try {
    return JSON.parse(localStorage.getItem(claveCrono(id)) || 'null')
  } catch {
    return null
  }
}

function guardarCrono(id, valor) {
  try {
    if (valor) localStorage.setItem(claveCrono(id), JSON.stringify(valor))
    else localStorage.removeItem(claveCrono(id))
  } catch {
    // sin almacenamiento: el cronómetro solo dura mientras la pantalla esté abierta
  }
}

// Si el proceso tiene una sola persona (o una sola por hora), la medición se le asigna sola.
function personaPorDefecto(lineas) {
  if (lineas.length === 1) return lineas[0].mano_obra_id
  const porHora = lineas.filter((l) => l.tipo_pago === 'hora')
  return porHora.length === 1 ? porHora[0].mano_obra_id : ''
}

const vacio = (lineas = []) => ({
  mano_obra_id: personaPorDefecto(lineas),
  fecha: hoy(),
  h: '',
  m: '',
  s: '',
  unidades: '',
  notas: '',
})

export default function ProcesoTiempos({ proceso, lineas = [], onCambio }) {
  const [filas, setFilas] = useState([])
  const [form, setForm] = useState(null) // null = cerrado
  const [crono, setCrono] = useState(() => leerCrono(proceso.id))
  const [, setTick] = useState(0)
  const [error, setError] = useState('')

  async function cargar() {
    const { data } = await supabase
      .from('costeo_tiempos_reales')
      .select('*')
      .eq('proceso_id', proceso.id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setFilas(data || [])
  }

  // Se recarga también cuando cambian las personas (al agregar una se le asignan las mediciones sueltas).
  const firmaLineas = lineas.map((l) => l.mano_obra_id).join(',')
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proceso.id, firmaLineas])

  // Mediciones sin persona: no cuentan en el costo de nadie. Se pueden pasar a una persona por hora.
  const porHora = lineas.filter((l) => l.tipo_pago === 'hora')
  const sueltas = lineas.length > 0 ? filas.filter((f) => !f.mano_obra_id) : []

  async function asignarSueltas(manoObraId) {
    await supabase.from('costeo_tiempos_reales').update({ mano_obra_id: manoObraId }).in('id', sueltas.map((f) => f.id))
    cargar()
    onCambio()
  }

  // El reloj del cronómetro avanza cada segundo.
  useEffect(() => {
    if (!crono) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [crono])

  function empezar() {
    const c = { desde: Date.now(), fecha: hoy() }
    guardarCrono(proceso.id, c)
    setCrono(c)
  }

  function terminar() {
    const { h, m, s } = partirHoras((Date.now() - crono.desde) / 3600000)
    setError('')
    setForm({ ...vacio(lineas), fecha: crono.fecha, h: h ? String(h) : '', m: String(m), s: String(s) })
  }

  const horasForm = form ? aHoras(form.h, form.m, form.s) : 0

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!(horasForm > 0)) {
      setError('Escribe el tiempo que marcó el cronómetro.')
      return
    }
    if (!(Number(form.unidades) > 0)) {
      setError('Escribe cuántas piezas salieron en ese tiempo.')
      return
    }
    if (lineas.length > 1 && !form.mano_obra_id) {
      setError('Escoge a quién se le tomó el tiempo.')
      return
    }
    const datos = {
      fecha: form.fecha,
      horas: horasForm,
      unidades: Number(form.unidades),
      notas: form.notas.trim() || null,
      mano_obra_id: form.mano_obra_id || null,
    }
    const { error } = form.id
      ? await supabase.from('costeo_tiempos_reales').update(datos).eq('id', form.id)
      : await supabase
          .from('costeo_tiempos_reales')
          .insert({ ficha_id: proceso.ficha_id, proceso_id: proceso.id, etapa: proceso.nombre, num_operarios: 1, ...datos })
    if (error) {
      setError('No se pudo guardar: ' + error.message)
      return
    }
    if (!form.id) {
      guardarCrono(proceso.id, null)
      setCrono(null)
    }
    setForm(null)
    cargar()
    onCambio()
  }

  function editar(f) {
    setError('')
    const { h, m, s } = partirHoras(f.horas)
    setForm({
      id: f.id,
      fecha: f.fecha,
      h: h ? String(h) : '',
      m: String(m),
      s: String(s),
      unidades: String(f.unidades),
      notas: f.notas || '',
      mano_obra_id: f.mano_obra_id || '',
    })
  }

  async function borrar(id) {
    if (!window.confirm('¿Borrar esta medición?')) return
    await supabase.from('costeo_tiempos_reales').delete().eq('id', id)
    cargar()
    onCambio()
  }

  const nombreLinea = Object.fromEntries(lineas.map((l) => [l.mano_obra_id, tipoTitulo(l.nombre)]))
  const totalHH = filas.reduce((s, f) => s + Number(f.num_operarios) * Number(f.horas), 0)
  const totalU = filas.reduce((s, f) => s + Number(f.unidades), 0)
  const campo = 'w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm outline-none focus:border-feisen-azul bg-white'
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const formulario = form && (
    <form onSubmit={guardar} className="mt-2 border border-feisen-borde rounded-lg p-3 bg-white grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="block text-xs text-feisen-texto-2 mb-1">Tiempo del cronómetro</label>
        <div className="flex items-center gap-2">
          <Unidad valor={form.h} onChange={set('h')} sufijo="h" campo={campo} />
          <Unidad valor={form.m} onChange={set('m')} sufijo="min" campo={campo} max={59} />
          <Unidad valor={form.s} onChange={set('s')} sufijo="s" campo={campo} max={59} />
        </div>
      </div>
      <Campo label="Piezas que salieron">
        <input type="number" min="0" step="any" inputMode="decimal" value={form.unidades} onChange={set('unidades')} placeholder="0" className={campo} />
      </Campo>
      <Campo label="Fecha"><input type="date" value={form.fecha} onChange={set('fecha')} className={campo} /></Campo>
      {lineas.length === 0 && (
        <p className="col-span-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Este proceso todavía no tiene persona en Mano de obra. Puedes guardar el tiempo; cuando agregues a la persona se le asigna solo.
        </p>
      )}
      {lineas.length > 0 && (
        <div className="col-span-2">
          <Campo label="¿A quién se le tomó?">
            <select value={form.mano_obra_id} onChange={set('mano_obra_id')} className={campo}>
              <option value="">{lineas.length > 1 ? 'Escoge…' : 'Sin asignar'}</option>
              {lineas.map((l) => (
                <option key={l.mano_obra_id} value={l.mano_obra_id}>
                  {tipoTitulo(l.nombre)} ({l.tipo_pago === 'destajo' ? 'valor fijo' : 'por hora'})
                </option>
              ))}
            </select>
          </Campo>
        </div>
      )}
      <div className="col-span-2">
        <Campo label="Notas: cómo se tomó y qué se tuvo en cuenta">
          <textarea
            rows={3}
            value={form.notas}
            onChange={set('notas')}
            placeholder="Ej.: desde que toma la lámina hasta que deja la pieza en la estiba; sin contar el alistamiento de la máquina"
            className={campo}
          />
        </Campo>
      </div>
      {horasForm > 0 && Number(form.unidades) > 0 && (
        <p className="col-span-2 text-sm text-feisen-texto tabular-nums">
          Sale a <span className="font-medium">{porPiezaTexto(horasForm, form.unidades)}</span> por pieza.
        </p>
      )}
      {error && <p className="text-feisen-rojo text-xs col-span-2">{error}</p>}
      <div className="col-span-2 flex gap-3">
        <button type="submit" className="bg-feisen-azul text-white text-sm font-medium rounded-lg px-4 py-2 min-h-[44px] hover:bg-feisen-azul-claro">
          {form.id ? 'Guardar cambios' : 'Guardar medición'}
        </button>
        <button type="button" onClick={() => { setForm(null); setError('') }} className="text-sm text-feisen-texto-2 hover:underline">
          Cancelar
        </button>
      </div>
    </form>
  )

  return (
    <section>
      <h4 className="flex items-center gap-2 text-xs uppercase tracking-wide text-feisen-texto-2 mb-2">
        <Clock size={14} /> Toma de tiempos
        {/* Con varias personas, cada una tiene su promedio en Mano de obra */}
        {totalU > 0 && lineas.length <= 1 && (
          <span className="normal-case tracking-normal text-feisen-texto font-medium ml-auto tabular-nums">
            Promedio: {porPiezaTexto(totalHH, totalU)} por pieza
          </span>
        )}
      </h4>

      {sueltas.length > 0 && (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {sueltas.length === 1 ? 'Hay 1 medición' : `Hay ${sueltas.length} mediciones`} sin persona: no {sueltas.length === 1 ? 'cuenta' : 'cuentan'} en la mano de obra.
          {porHora.length > 0 ? (
            <span className="flex flex-wrap gap-2 mt-1.5">
              {porHora.map((l) => (
                <button
                  key={l.mano_obra_id}
                  onClick={() => asignarSueltas(l.mano_obra_id)}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 min-h-[36px] text-sm font-medium text-feisen-azul hover:bg-feisen-azul-suave"
                >
                  Asignar a {tipoTitulo(l.nombre)}
                </button>
              ))}
            </span>
          ) : (
            <span className="block mt-1">Las personas de este proceso son de valor fijo, así que el tiempo no cambia su costo.</span>
          )}
        </div>
      )}
      {filas.length === 0 && !form && (
        <p className="text-sm text-feisen-texto-2">
          Todavía no hay mediciones. Toma el tiempo con el cronómetro y anota cuántas piezas salieron.
        </p>
      )}
      {filas.length > 0 && (
        <ul className="divide-y divide-feisen-borde-suave border border-feisen-borde rounded-lg bg-white">
          {filas.map((f) => form?.id === f.id ? (
            <li key={f.id} className="p-2">{formulario}</li>
          ) : (
            <li key={f.id} className="flex items-start gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="text-feisen-texto tabular-nums">
                  {duracionTexto(f.horas)} · {formatNumber(f.unidades, 0)} {Number(f.unidades) === 1 ? 'pieza' : 'piezas'}
                  {Number(f.num_operarios) > 1 ? ` · ${formatNumber(f.num_operarios, 0)} operarios` : ''}
                </span>
                <span className="block text-xs text-feisen-texto-2 tabular-nums">
                  {f.fecha}
                  {f.mano_obra_id && nombreLinea[f.mano_obra_id] ? ` · ${nombreLinea[f.mano_obra_id]}` : ''}
                  {!f.mano_obra_id && lineas.length > 0 && <span className="text-amber-700"> · sin persona</span>}
                  {f.orden ? ` · ${f.orden}` : ''}
                </span>
                {f.notas && <span className="block text-xs text-feisen-texto-2 whitespace-pre-line mt-0.5">{f.notas}</span>}
              </span>
              <span className="ml-auto tabular-nums whitespace-nowrap text-feisen-texto">
                {porPiezaTexto(Number(f.num_operarios) * Number(f.horas), f.unidades)}/pieza
              </span>
              <button onClick={() => editar(f)} className="flex items-center gap-1 text-xs font-medium text-feisen-azul hover:underline px-1 py-1">
                <Pencil size={13} /> Editar
              </button>
              <button onClick={() => borrar(f.id)} title="Borrar" aria-label="Borrar medición" className="text-feisen-texto-2 hover:text-feisen-rojo py-1">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {form && !form.id ? (
        formulario
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {crono ? (
            <>
              <span className="text-lg font-semibold text-feisen-texto tabular-nums">{relojDesde(crono.desde)}</span>
              <button onClick={terminar} className="flex items-center gap-1 bg-feisen-rojo text-white text-sm font-medium rounded-lg px-3 py-2 min-h-[44px]">
                <Square size={14} /> Parar
              </button>
              <button
                onClick={() => { if (window.confirm('¿Descartar esta medición? No se guarda nada.')) { guardarCrono(proceso.id, null); setCrono(null) } }}
                className="text-sm text-feisen-texto-2 hover:underline"
              >
                Descartar
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setError(''); setForm(vacio(lineas)) }} className="flex items-center gap-1 bg-feisen-azul text-white text-sm font-medium rounded-lg px-3 py-2 min-h-[44px] hover:bg-feisen-azul-claro">
                <Plus size={14} /> Registrar tiempo
              </button>
              <button onClick={empezar} className="flex items-center gap-1 border border-feisen-azul text-feisen-azul text-sm font-medium rounded-lg px-3 py-2 min-h-[44px] hover:bg-feisen-azul-suave">
                <Play size={14} /> Usar el cronómetro de la app
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function Campo({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-feisen-texto-2 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Unidad({ valor, onChange, sufijo, campo, max }) {
  return (
    <label className="flex items-center gap-1 flex-1 min-w-0">
      <input type="number" min="0" max={max} step="1" inputMode="numeric" value={valor} onChange={onChange} placeholder="0" className={`${campo} text-right tabular-nums`} />
      <span className="text-sm text-feisen-texto-2 shrink-0">{sufijo}</span>
    </label>
  )
}
