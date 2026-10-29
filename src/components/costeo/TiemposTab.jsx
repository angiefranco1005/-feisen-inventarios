import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber, formatPct } from './utils/format'
import { ETAPAS } from './utils/etapas'
import { enlaceCelular, hoy, horasEntre, textoHorario, unirNotas } from './utils/tiempos'
import PlanillaTiempos from './PlanillaTiempos'
import RegistroRapidoTiempos from './RegistroRapidoTiempos'

const SIN_PARTE = '__sin_parte__'

// En pantallas angostas (celular) se abre directo el registro rápido.
function esCelular() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
}

function formVacio() {
  return {
    fecha: hoy(),
    orden: '',
    parte: '',
    etapa: '',
    responsable: '',
    num_operarios: '1',
    horas: '',
    hora_inicio: '',
    hora_fin: '',
    pausa: '',
    unidades: '1',
    notas: '',
  }
}

// Clave para emparejar un registro real con su estimado en Mano de Obra: parte + etapa.
function clave(parte, etapa) {
  return `${parte || SIN_PARTE}|${etapa}`
}

// Horas-hombre reales por unidad de la ficha en un registro.
function horasHombrePorUnidad(r) {
  const unidades = Number(r.unidades || 0)
  if (unidades <= 0) return 0
  return (Number(r.num_operarios || 0) * Number(r.horas || 0)) / unidades
}

// Líneas de Mano de Obra y operarios. Con soloRegistro salen de la función costeo_tiempos_contexto,
// que devuelve solo partes, etapas y nombres (sin horas estimadas ni tarifas).
async function cargarReferencias(fichaId, soloRegistro) {
  if (soloRegistro) {
    const { data } = await supabase.rpc('costeo_tiempos_contexto', { p_ficha: fichaId })
    return { estimados: data?.etapas || [], operarios: data?.operarios || [] }
  }
  const [{ data: mo }, { data: op }] = await Promise.all([
    supabase.from('costeo_mano_obra').select('*').eq('ficha_id', fichaId),
    supabase.from('costeo_operarios').select('nombre, tarea').order('nombre', { ascending: true }),
  ])
  return { estimados: mo || [], operarios: op || [] }
}

// soloRegistro: usuario con permiso "solo registrar tiempos" (jefes de área). No puede leer Mano de
// Obra ni operarios directamente; recibe solo partes, etapas y nombres por costeo_tiempos_contexto.
export default function TiemposTab({ fichaId, fichaNombre, soloRegistro = false }) {
  const [registros, setRegistros] = useState([])
  const [estimados, setEstimados] = useState([])
  const [operarios, setOperarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(formVacio)
  const [editandoId, setEditandoId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [modo, setModo] = useState(() => (soloRegistro || esCelular() ? 'rapido' : 'completo'))
  const [imprimiendo, setImprimiendo] = useState(false)
  const [copiado, setCopiado] = useState(false)

  async function cargar() {
    setLoading(true)
    const [{ data, error }, referencias] = await Promise.all([
      supabase
        .from('costeo_tiempos_reales')
        .select('*')
        .eq('ficha_id', fichaId)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      cargarReferencias(fichaId, soloRegistro),
    ])
    if (error) {
      setError('No se pudieron cargar los tiempos: ' + error.message)
    } else {
      setRegistros(data || [])
    }
    setEstimados(referencias.estimados)
    setOperarios(referencias.operarios)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId])

  // La planilla se monta, se imprime y se desmonta al cerrar el diálogo de impresión.
  useEffect(() => {
    if (!imprimiendo) return
    const terminar = () => setImprimiendo(false)
    window.addEventListener('afterprint', terminar)
    const t = setTimeout(() => window.print(), 50)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', terminar)
    }
  }, [imprimiendo])

  async function copiarEnlace() {
    const url = enlaceCelular(fichaId)
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      window.prompt('Copia este enlace y envíalo por WhatsApp:', url)
    }
  }

  // Guardado usado por el registro rápido; devuelve el mensaje de error o null.
  async function insertar(payload) {
    const { error } = await supabase.from('costeo_tiempos_reales').insert({ ficha_id: fichaId, ...payload })
    if (error) return 'No se pudo guardar: ' + error.message
    await cargar()
    return null
  }

  function cambiarHorario(cambios) {
    const f = { ...form, ...cambios }
    const horas = horasEntre(f.hora_inicio, f.hora_fin, f.pausa)
    setForm(horas ? { ...f, horas: String(horas) } : f)
  }

  function limpiarForm() {
    setForm(formVacio())
    setEditandoId(null)
    setError('')
  }

  function iniciarEdicion(r) {
    setEditandoId(r.id)
    setForm({
      fecha: r.fecha ?? hoy(),
      orden: r.orden ?? '',
      parte: r.parte ?? '',
      etapa: r.etapa ?? '',
      responsable: r.responsable ?? '',
      num_operarios: String(r.num_operarios ?? ''),
      horas: String(r.horas ?? ''),
      hora_inicio: '',
      hora_fin: '',
      pausa: '',
      unidades: String(r.unidades ?? ''),
      notas: r.notas ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!form.etapa) {
      setError('Indica la etapa.')
      return
    }
    if (!form.horas || Number(form.horas) <= 0) {
      setError('Las horas trabajadas deben ser mayores a 0.')
      return
    }
    if (!form.num_operarios || Number(form.num_operarios) <= 0) {
      setError('El número de operarios debe ser mayor a 0.')
      return
    }
    if (!form.unidades || Number(form.unidades) <= 0) {
      setError('Las unidades terminadas deben ser mayores a 0.')
      return
    }
    setGuardando(true)
    const payload = {
      fecha: form.fecha || hoy(),
      orden: form.orden.trim() || null,
      parte: form.parte.trim() || null,
      etapa: form.etapa,
      responsable: form.responsable.trim() || null,
      num_operarios: Number(form.num_operarios),
      horas: Number(form.horas),
      unidades: Number(form.unidades),
      notas:
        form.hora_inicio && form.hora_fin
          ? unirNotas(textoHorario(form.hora_inicio, form.hora_fin, form.pausa), form.notas)
          : form.notas.trim() || null,
    }
    const { error } = editandoId
      ? await supabase.from('costeo_tiempos_reales').update(payload).eq('id', editandoId)
      : await supabase.from('costeo_tiempos_reales').insert({ ficha_id: fichaId, ...payload })
    if (error) {
      setError('No se pudo guardar: ' + error.message)
    } else {
      limpiarForm()
      await cargar()
    }
    setGuardando(false)
  }

  async function eliminar(id) {
    if (!window.confirm('¿Borrar este registro de tiempo?')) return
    await supabase.from('costeo_tiempos_reales').delete().eq('id', id)
    if (editandoId === id) limpiarForm()
    await cargar()
  }

  // Estimado por parte + etapa, tomado de Mano de Obra (solo líneas pagadas por hora).
  const estimadoPorClave = new Map()
  for (const f of estimados) {
    const k = clave(f.parte, f.etapa)
    const actual = estimadoPorClave.get(k) || { horasHombre: 0, costo: 0, destajo: false }
    if (f.tipo_pago === 'destajo') {
      actual.destajo = true
    } else {
      const hh = Number(f.num_operarios || 0) * Number(f.horas_por_unidad || 0)
      actual.horasHombre += hh
      actual.costo += hh * Number(f.tarifa_hora || 0)
    }
    estimadoPorClave.set(k, actual)
  }

  // Real por parte + etapa: total horas-hombre ÷ total unidades (promedio ponderado).
  const realPorClave = new Map()
  for (const r of registros) {
    const k = clave(r.parte, r.etapa)
    const actual = realPorClave.get(k) || {
      parte: r.parte,
      etapa: r.etapa,
      horasHombre: 0,
      unidades: 0,
      registros: 0,
    }
    actual.horasHombre += Number(r.num_operarios || 0) * Number(r.horas || 0)
    actual.unidades += Number(r.unidades || 0)
    actual.registros += 1
    realPorClave.set(k, actual)
  }

  const comparacion = [...realPorClave.entries()]
    .map(([k, real]) => {
      const est = estimadoPorClave.get(k)
      const realPorUnidad = real.unidades > 0 ? real.horasHombre / real.unidades : 0
      const tieneEstimado = est && est.horasHombre > 0
      const tarifa = tieneEstimado ? est.costo / est.horasHombre : 0
      const diferenciaHoras = tieneEstimado ? realPorUnidad - est.horasHombre : 0
      return {
        k,
        parte: real.parte,
        etapa: real.etapa,
        registros: real.registros,
        estimadoPorUnidad: tieneEstimado ? est.horasHombre : null,
        realPorUnidad,
        diferenciaHoras,
        diferenciaPct: tieneEstimado ? diferenciaHoras / est.horasHombre : null,
        diferenciaCosto: diferenciaHoras * tarifa,
        soloDestajo: est?.destajo && !tieneEstimado,
      }
    })
    .sort((a, b) => (a.parte || '').localeCompare(b.parte || '') || a.etapa.localeCompare(b.etapa))

  const totalDiferenciaCosto = comparacion.reduce((acc, c) => acc + c.diferenciaCosto, 0)

  const partesDisponibles = [
    ...new Set([...estimados, ...registros].map((x) => x.parte).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b))

  const vistaPreviaHH =
    Number(form.unidades) > 0
      ? (Number(form.num_operarios || 0) * Number(form.horas || 0)) / Number(form.unidades)
      : 0

  const barra = (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {!soloRegistro && (
      <div className="inline-flex rounded-full border border-feisen-borde bg-white p-0.5">
        {[
          ['rapido', 'Registro rápido'],
          ['completo', 'Vista completa'],
        ].map(([id, texto]) => (
          <button
            key={id}
            type="button"
            onClick={() => setModo(id)}
            className={`text-sm font-medium rounded-full px-3 py-1.5 ${
              modo === id ? 'bg-feisen-azul text-white' : 'text-feisen-texto-2'
            }`}
          >
            {texto}
          </button>
        ))}
      </div>
      )}
      <div className="flex gap-3 ml-auto text-sm">
        <button type="button" onClick={() => setImprimiendo(true)} className="text-feisen-azul hover:underline">
          Imprimir planilla
        </button>
        {!soloRegistro && (
          <button type="button" onClick={copiarEnlace} className="text-feisen-azul hover:underline">
            {copiado ? '¡Enlace copiado!' : 'Copiar enlace para celular'}
          </button>
        )}
      </div>
      {imprimiendo && <PlanillaTiempos fichaNombre={fichaNombre} estimados={estimados} />}
    </div>
  )

  if (modo === 'rapido' || soloRegistro) {
    return (
      <div>
        {barra}
        {loading ? (
          <p className="text-sm text-feisen-texto-2">Cargando…</p>
        ) : (
          <RegistroRapidoTiempos
            fichaId={fichaId}
            partes={partesDisponibles}
            operarios={[...new Set(operarios.map((o) => o.nombre))]}
            registros={registros}
            onGuardar={insertar}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      {barra}
      <p className="text-sm text-feisen-texto-2 mb-3">
        Anota acá cuánto se demoró <strong>de verdad</strong> cada etapa en producción. Por ejemplo:
        "Soldadura, 2 operarios, 6 horas, 3 unidades terminadas". La app lo convierte a horas-hombre
        por unidad y lo compara con el tiempo estimado que pusiste en <strong>Mano de Obra</strong>,
        para que veas dónde se va más (o menos) tiempo del que se costeó. Estos registros{' '}
        <strong>no cambian</strong> el costo de la ficha; son para controlar y ajustar el estimado.
      </p>

      <form onSubmit={guardar} className="bg-white border border-feisen-borde rounded-lg p-4 mb-6">
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">Fecha</label>
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Orden / lote <span className="font-normal text-feisen-texto-2">(opcional)</span>
            </label>
            <input
              value={form.orden}
              onChange={(e) => setForm({ ...form, orden: e.target.value })}
              placeholder="ej. OP-125"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Responsable <span className="font-normal text-feisen-texto-2">(opcional)</span>
            </label>
            <input
              list="operarios-tiempos"
              value={form.responsable}
              onChange={(e) => setForm({ ...form, responsable: e.target.value })}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
            <datalist id="operarios-tiempos">
              {[...new Set(operarios.map((o) => o.nombre))].map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Parte <span className="font-normal text-feisen-texto-2">(opcional)</span>
            </label>
            <input
              list="partes-tiempos"
              value={form.parte}
              onChange={(e) => setForm({ ...form, parte: e.target.value })}
              placeholder="ej. Cintura, Cono, Fondo"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
            <datalist id="partes-tiempos">
              {partesDisponibles.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <p className="text-xs text-feisen-texto-2 mt-1">
              Usa el mismo nombre de parte que en Mano de Obra para que se puedan comparar.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Etapa</label>
            <select
              value={form.etapa}
              onChange={(e) => setForm({ ...form, etapa: e.target.value })}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            >
              <option value="">-- Selecciona --</option>
              {ETAPAS.map((et) => (
                <option key={et} value={et}>
                  {et}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Hora inicio <span className="font-normal text-feisen-texto-2">(opcional)</span>
            </label>
            <input
              type="time"
              value={form.hora_inicio}
              onChange={(e) => cambiarHorario({ hora_inicio: e.target.value })}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Hora fin <span className="font-normal text-feisen-texto-2">(opcional)</span>
            </label>
            <input
              type="time"
              value={form.hora_fin}
              onChange={(e) => cambiarHorario({ hora_fin: e.target.value })}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Pausas (min) <span className="font-normal text-feisen-texto-2">(opcional)</span>
            </label>
            <input
              type="number"
              step="any"
              value={form.pausa}
              onChange={(e) => cambiarHorario({ pausa: e.target.value })}
              placeholder="0"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <p className="sm:col-span-3 text-xs text-feisen-texto-2 -mt-1">
            Para pasar la planilla impresa: con hora de inicio y fin, la app calcula las horas trabajadas
            descontando las pausas.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium mb-1">N° operarios</label>
            <input
              type="number"
              step="any"
              value={form.num_operarios}
              onChange={(e) => setForm({ ...form, num_operarios: e.target.value })}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Horas trabajadas</label>
            <input
              type="number"
              step="any"
              value={form.horas}
              onChange={(e) => setForm({ ...form, horas: e.target.value })}
              placeholder="ej. 6"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Unidades terminadas</label>
            <input
              type="number"
              step="any"
              value={form.unidades}
              onChange={(e) => setForm({ ...form, unidades: e.target.value })}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
        </div>
        {vistaPreviaHH > 0 && (
          <p className="text-xs text-feisen-texto-2 mt-2">
            = {formatNumber(vistaPreviaHH)} horas-hombre por unidad
          </p>
        )}

        <div className="mt-3">
          <label className="block text-xs font-medium mb-1">
            Notas <span className="font-normal text-feisen-texto-2">(opcional)</span>
          </label>
          <input
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            placeholder="ej. se repitió una soldadura por porosidad"
            className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
          />
        </div>

        <div className="flex items-center gap-3 mt-3">
          <button
            type="submit"
            disabled={guardando}
            className="bg-feisen-azul text-white font-medium rounded-md py-2 px-6 hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Registrar tiempo'}
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
      ) : registros.length === 0 ? (
        <p className="text-sm text-feisen-texto-2">Todavía no has registrado tiempos reales.</p>
      ) : (
        <>
          <h2 className="text-sm font-semibold mb-2">Real vs. estimado (por unidad)</h2>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm border border-feisen-borde rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-feisen-rojo text-white text-left">
                  <th className="px-3 py-2">Parte / etapa</th>
                  <th className="px-3 py-2 text-right">Estimado h-h</th>
                  <th className="px-3 py-2 text-right">Real h-h</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                  <th className="px-3 py-2 text-right">Efecto en costo</th>
                </tr>
              </thead>
              <tbody>
                {comparacion.map((c) => {
                  const color =
                    c.diferenciaHoras > 0
                      ? 'text-feisen-rojo'
                      : c.diferenciaHoras < 0
                      ? 'text-green-700'
                      : ''
                  return (
                    <tr key={c.k} className="border-t border-feisen-borde">
                      <td className="px-3 py-2">
                        {c.parte && <span className="text-feisen-texto-2">{c.parte} · </span>}
                        {c.etapa}
                        <span className="text-xs text-feisen-texto-2 ml-1">
                          ({c.registros} {c.registros === 1 ? 'registro' : 'registros'})
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {c.estimadoPorUnidad != null ? formatNumber(c.estimadoPorUnidad) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">{formatNumber(c.realPorUnidad)}</td>
                      {c.estimadoPorUnidad != null ? (
                        <>
                          <td className={`px-3 py-2 text-right ${color}`}>
                            {c.diferenciaHoras > 0 ? '+' : ''}
                            {formatNumber(c.diferenciaHoras)} h ({formatPct(c.diferenciaPct)})
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${color}`}>
                            {c.diferenciaCosto > 0 ? '+' : ''}
                            {formatCOP(c.diferenciaCosto)}
                          </td>
                        </>
                      ) : (
                        <td className="px-3 py-2 text-xs text-feisen-texto-2 text-right" colSpan={2}>
                          {c.soloDestajo
                            ? 'Se paga a destajo: el tiempo no cambia el costo'
                            : 'Sin estimado en Mano de Obra para esta parte/etapa'}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-feisen-borde bg-feisen-gris font-semibold">
                  <td className="px-3 py-2" colSpan={4}>
                    EFECTO TOTAL EN MOD POR UNIDAD
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${
                      totalDiferenciaCosto > 0 ? 'text-feisen-rojo' : totalDiferenciaCosto < 0 ? 'text-green-700' : ''
                    }`}
                  >
                    {totalDiferenciaCosto > 0 ? '+' : ''}
                    {formatCOP(totalDiferenciaCosto)}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="text-xs text-feisen-texto-2 mt-1">
              h-h = horas-hombre (operarios × horas). En rojo: se gastó más tiempo del estimado. En
              verde: menos. El efecto en costo usa la tarifa hora de esa etapa en Mano de Obra.
            </p>
          </div>

          <h2 className="text-sm font-semibold mb-2">Registros</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-feisen-borde rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-feisen-rojo text-white text-left">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Parte / etapa</th>
                  <th className="px-3 py-2 text-right">Oper.</th>
                  <th className="px-3 py-2 text-right">Horas</th>
                  <th className="px-3 py-2 text-right">Unid.</th>
                  <th className="px-3 py-2 text-right">h-h/unid.</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id} className="border-t border-feisen-borde align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.fecha}
                      {r.orden && <div className="text-xs text-feisen-texto-2">{r.orden}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {r.parte && <span className="text-feisen-texto-2">{r.parte} · </span>}
                      {r.etapa}
                      {r.responsable && <div className="text-xs text-feisen-texto-2">{r.responsable}</div>}
                      {r.notas && <div className="text-xs text-feisen-texto-2 italic">{r.notas}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(r.num_operarios, 0)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(r.horas)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(r.unidades, 0)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatNumber(horasHombrePorUnidad(r))}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => iniciarEdicion(r)}
                        className="text-feisen-azul text-xs hover:underline mr-2"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminar(r.id)}
                        className="text-feisen-rojo text-xs hover:underline"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
