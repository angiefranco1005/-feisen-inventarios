import { useEffect, useState } from 'react'
import { Clock, Play, Plus, Square, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatNumber } from './utils/format'
import { hoy, horaActual, horasEntre, transcurrido } from './utils/tiempos'

// Toma de tiempos de un proceso. Cada medición: operarios × horas trabajadas para N unidades
// buenas. El costo usa el promedio ponderado: Σ(operarios × horas) ÷ Σ unidades = horas-hombre
// por unidad. El cronómetro vive en este navegador (localStorage) hasta que se guarda.
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

const vacio = () => ({
  fecha: hoy(),
  orden: '',
  responsable: '',
  num_operarios: '1',
  hora_inicio: '',
  hora_fin: '',
  pausa_min: '',
  horas: '',
  unidades: '1',
  notas: '',
})

export default function ProcesoTiempos({ proceso, onCambio }) {
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

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proceso.id])

  // Refresca el "lleva X min" del cronómetro cada 30 s.
  useEffect(() => {
    if (!crono) return
    const t = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [crono])

  function empezar() {
    const c = { desde: Date.now(), hora_inicio: horaActual(), fecha: hoy() }
    guardarCrono(proceso.id, c)
    setCrono(c)
  }

  function terminar() {
    setForm({ ...vacio(), fecha: crono.fecha, hora_inicio: crono.hora_inicio, hora_fin: horaActual() })
  }

  const horasCalculadas = form ? horasEntre(form.hora_inicio, form.hora_fin, form.pausa_min) : null

  async function guardar(e) {
    e.preventDefault()
    setError('')
    const horas = horasCalculadas ?? Number(form.horas)
    if (!(horas > 0)) {
      setError('Pon la hora de inicio y de fin, o las horas trabajadas.')
      return
    }
    if (!(Number(form.num_operarios) > 0) || !(Number(form.unidades) > 0)) {
      setError('Operarios y unidades deben ser mayores a 0.')
      return
    }
    const { error } = await supabase.from('costeo_tiempos_reales').insert({
      ficha_id: proceso.ficha_id,
      proceso_id: proceso.id,
      etapa: proceso.nombre,
      fecha: form.fecha,
      orden: form.orden.trim() || null,
      responsable: form.responsable.trim() || null,
      num_operarios: Number(form.num_operarios),
      hora_inicio: form.hora_inicio || null,
      hora_fin: form.hora_fin || null,
      pausa_min: form.pausa_min ? Number(form.pausa_min) : null,
      horas,
      unidades: Number(form.unidades),
      notas: form.notas.trim() || null,
    })
    if (error) {
      setError('No se pudo guardar: ' + error.message)
      return
    }
    guardarCrono(proceso.id, null)
    setCrono(null)
    setForm(null)
    cargar()
    onCambio()
  }

  async function borrar(id) {
    if (!window.confirm('¿Borrar esta medición?')) return
    await supabase.from('costeo_tiempos_reales').delete().eq('id', id)
    cargar()
    onCambio()
  }

  const totalHH = filas.reduce((s, f) => s + Number(f.num_operarios) * Number(f.horas), 0)
  const totalU = filas.reduce((s, f) => s + Number(f.unidades), 0)
  const campo = 'w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm outline-none focus:border-feisen-azul bg-white'
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <section>
      <h4 className="flex items-center gap-2 text-xs uppercase tracking-wide text-feisen-texto-2 mb-2">
        <Clock size={14} /> Toma de tiempos
        {totalU > 0 && (
          <span className="normal-case tracking-normal text-feisen-texto font-medium ml-auto tabular-nums">
            Promedio: {formatNumber(totalHH / totalU, 2)} h-h por unidad
          </span>
        )}
      </h4>

      {filas.length === 0 && !form && (
        <p className="text-sm text-feisen-texto-2">
          Todavía no hay mediciones. Toma el tiempo en planta con el cronómetro o pasa una medición de la planilla.
        </p>
      )}
      {filas.length > 0 && (
        <ul className="divide-y divide-feisen-borde-suave border border-feisen-borde rounded-lg bg-white">
          {filas.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="text-feisen-texto tabular-nums">
                  {f.fecha}
                  {f.orden ? ` · ${f.orden}` : ''}
                  {f.responsable ? ` · ${f.responsable}` : ''}
                </span>
                <span className="block text-xs text-feisen-texto-2 tabular-nums">
                  {formatNumber(f.num_operarios, 0)} op × {formatNumber(f.horas, 2)} h
                  {f.hora_inicio && f.hora_fin ? ` (${f.hora_inicio.slice(0, 5)}–${f.hora_fin.slice(0, 5)}${Number(f.pausa_min) > 0 ? `, pausa ${formatNumber(f.pausa_min, 0)} min` : ''})` : ''}
                  {' · '}
                  {formatNumber(f.unidades, 0)} und{f.notas ? ` · ${f.notas}` : ''}
                </span>
              </span>
              <span className="ml-auto tabular-nums whitespace-nowrap text-feisen-texto">
                {formatNumber((Number(f.num_operarios) * Number(f.horas)) / Number(f.unidades || 1), 2)} h-h/und
              </span>
              <button onClick={() => borrar(f.id)} title="Borrar" className="text-feisen-texto-2 hover:text-feisen-rojo">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {form ? (
        <form onSubmit={guardar} className="mt-2 border border-feisen-borde rounded-lg p-3 bg-white grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Campo label="Fecha"><input type="date" value={form.fecha} onChange={set('fecha')} className={campo} /></Campo>
          <Campo label="Orden / lote"><input value={form.orden} onChange={set('orden')} placeholder="OF-125" className={campo} /></Campo>
          <Campo label="Responsable"><input value={form.responsable} onChange={set('responsable')} className={campo} /></Campo>
          <Campo label="Hora inicio"><input type="time" value={form.hora_inicio} onChange={set('hora_inicio')} className={campo} /></Campo>
          <Campo label="Hora fin"><input type="time" value={form.hora_fin} onChange={set('hora_fin')} className={campo} /></Campo>
          <Campo label="Pausas (min)"><input type="number" min="0" value={form.pausa_min} onChange={set('pausa_min')} placeholder="0" className={campo} /></Campo>
          <Campo label="Horas trabajadas">
            {horasCalculadas != null ? (
              <p className="px-3 py-2 text-sm tabular-nums">{formatNumber(horasCalculadas, 2)} h</p>
            ) : (
              <input type="number" step="any" value={form.horas} onChange={set('horas')} placeholder="sin horario" className={campo} />
            )}
          </Campo>
          <Campo label="N° operarios"><input type="number" min="1" step="any" value={form.num_operarios} onChange={set('num_operarios')} className={campo} /></Campo>
          <Campo label="Unidades buenas"><input type="number" min="0" step="any" value={form.unidades} onChange={set('unidades')} className={campo} /></Campo>
          <div className="col-span-2 sm:col-span-3">
            <Campo label="Notas (opcional)"><input value={form.notas} onChange={set('notas')} className={campo} /></Campo>
          </div>
          {error && <p className="text-feisen-rojo text-xs col-span-2 sm:col-span-3">{error}</p>}
          <div className="col-span-2 sm:col-span-3 flex gap-3">
            <button type="submit" className="bg-feisen-azul text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-feisen-azul-claro">
              Guardar medición
            </button>
            <button type="button" onClick={() => { setForm(null); setError('') }} className="text-sm text-feisen-texto-2 hover:underline">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {crono ? (
            <>
              <span className="text-sm text-feisen-texto tabular-nums">
                Midiendo desde las {crono.hora_inicio} · lleva {transcurrido(crono.desde)}
              </span>
              <button onClick={terminar} className="flex items-center gap-1 bg-feisen-rojo text-white text-sm font-medium rounded-lg px-3 py-2 min-h-[44px]">
                <Square size={14} /> Terminar
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
              <button onClick={empezar} className="flex items-center gap-1 border border-feisen-azul text-feisen-azul text-sm font-medium rounded-lg px-3 py-2 min-h-[44px] hover:bg-feisen-azul-suave">
                <Play size={14} /> Empezar ahora
              </button>
              <button onClick={() => setForm(vacio())} className="flex items-center gap-1 text-sm text-feisen-azul hover:underline">
                <Plus size={14} /> Registrar tiempo
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
