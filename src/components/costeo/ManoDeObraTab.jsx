import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'
import { ETAPAS } from './utils/etapas'

const SIN_PARTE = '__sin_parte__'
const SIN_ETAPA = '__sin_etapa__'

const FORM_VACIO = {
  parte: '',
  etapa: '',
  responsable: '',
  tipo_pago: 'hora',
  num_operarios: '',
  horas_por_unidad: '',
  tarifa_hora: '',
  cantidad_destajo: '',
  precio_destajo: '',
}

function etiquetaOperario(o) {
  return o.tarea ? `${o.nombre} — ${o.tarea}` : o.nombre
}

function subtotalFila(f) {
  return f.tipo_pago === 'destajo'
    ? Number(f.cantidad_destajo || 0) * Number(f.precio_destajo || 0)
    : Number(f.num_operarios || 0) * Number(f.horas_por_unidad || 0) * Number(f.tarifa_hora || 0)
}

export default function ManoDeObraTab({ fichaId }) {
  const [filas, setFilas] = useState([])
  const [partesDisponibles, setPartesDisponibles] = useState([])
  const [maestroEtapas, setMaestroEtapas] = useState({})
  const [operariosPorEtapa, setOperariosPorEtapa] = useState({})
  const [modoResponsable, setModoResponsable] = useState('otro') // 'lista' | 'otro'
  const [vista, setVista] = useState('parte') // 'parte' | 'etapa'
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [editandoId, setEditandoId] = useState(null)

  async function cargar() {
    setLoading(true)
    const [{ data, error }, { data: materialesData }, { data: maestroData }, { data: operariosData }] =
      await Promise.all([
        supabase
          .from('costeo_mano_obra')
          .select('*')
          .eq('ficha_id', fichaId)
          .order('created_at', { ascending: true }),
        supabase.from('costeo_materiales').select('parte').eq('ficha_id', fichaId).not('parte', 'is', null),
        supabase.from('costeo_etapas_maestro').select('*'),
        supabase.from('costeo_operarios').select('*').order('nombre', { ascending: true }),
      ])
    if (!error) setFilas(data || [])
    const partesUnicas = [...new Set((materialesData || []).map((m) => m.parte).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b)
    )
    setPartesDisponibles(partesUnicas)
    const mapaMaestro = {}
    for (const m of maestroData || []) {
      mapaMaestro[m.etapa] = m
    }
    setMaestroEtapas(mapaMaestro)
    const mapaOperarios = {}
    for (const o of operariosData || []) {
      if (!mapaOperarios[o.etapa]) mapaOperarios[o.etapa] = []
      mapaOperarios[o.etapa].push(o)
    }
    setOperariosPorEtapa(mapaOperarios)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId])

  function elegirEtapa(nuevaEtapa) {
    const sugerido = maestroEtapas[nuevaEtapa]
    const listaOperarios = operariosPorEtapa[nuevaEtapa] || []
    setModoResponsable(listaOperarios.length > 0 ? 'lista' : 'otro')
    setForm((prev) => ({
      ...prev,
      etapa: nuevaEtapa,
      responsable: listaOperarios.length > 0 ? '' : sugerido?.puesto || '',
      tipo_pago: sugerido?.tipo_pago_sugerido || prev.tipo_pago,
      tarifa_hora:
        sugerido?.tarifa_hora_sugerida != null ? String(sugerido.tarifa_hora_sugerida) : '',
      precio_destajo:
        sugerido?.precio_destajo_sugerido != null ? String(sugerido.precio_destajo_sugerido) : '',
    }))
  }

  function elegirOperario(etiqueta) {
    const listaOperarios = operariosPorEtapa[form.etapa] || []
    const op = listaOperarios.find((o) => etiquetaOperario(o) === etiqueta)
    if (!op) {
      setForm((prev) => ({ ...prev, responsable: etiqueta }))
      return
    }
    setForm((prev) => ({
      ...prev,
      responsable: etiquetaOperario(op),
      tipo_pago: op.tipo_pago || prev.tipo_pago,
      tarifa_hora: op.tarifa_hora != null ? String(op.tarifa_hora) : prev.tarifa_hora,
      precio_destajo: op.precio_destajo != null ? String(op.precio_destajo) : prev.precio_destajo,
    }))
  }

  function limpiarForm() {
    setForm(FORM_VACIO)
    setEditandoId(null)
    setModoResponsable('otro')
  }

  function iniciarEdicion(f) {
    setEditandoId(f.id)
    setForm({
      parte: f.parte ?? '',
      etapa: f.etapa ?? '',
      responsable: f.responsable ?? '',
      tipo_pago: f.tipo_pago ?? 'hora',
      num_operarios: String(f.num_operarios ?? ''),
      horas_por_unidad: String(f.horas_por_unidad ?? ''),
      tarifa_hora: String(f.tarifa_hora ?? ''),
      cantidad_destajo: f.cantidad_destajo != null ? String(f.cantidad_destajo) : '',
      precio_destajo: f.precio_destajo != null ? String(f.precio_destajo) : '',
    })
    const listaOperarios = operariosPorEtapa[f.etapa] || []
    const coincide = listaOperarios.some((o) => etiquetaOperario(o) === f.responsable)
    setModoResponsable(coincide || listaOperarios.length === 0 ? (listaOperarios.length === 0 ? 'otro' : 'lista') : 'otro')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function agregar(e) {
    e.preventDefault()
    setError('')
    if (!form.etapa.trim()) {
      setError('Indica la etapa.')
      return
    }
    setGuardando(true)
    const esDestajo = form.tipo_pago === 'destajo'
    const payload = {
      parte: form.parte.trim() ? form.parte.trim() : null,
      etapa: form.etapa,
      responsable: form.responsable || null,
      tipo_pago: form.tipo_pago,
      num_operarios: esDestajo ? 0 : Number(form.num_operarios || 0),
      horas_por_unidad: esDestajo ? 0 : Number(form.horas_por_unidad || 0),
      tarifa_hora: esDestajo ? 0 : Number(form.tarifa_hora || 0),
      cantidad_destajo: esDestajo ? Number(form.cantidad_destajo || 0) : null,
      precio_destajo: esDestajo ? Number(form.precio_destajo || 0) : null,
    }
    const { error } = editandoId
      ? await supabase.from('costeo_mano_obra').update(payload).eq('id', editandoId)
      : await supabase.from('costeo_mano_obra').insert({ ficha_id: fichaId, ...payload })
    if (error) {
      setError('No se pudo guardar: ' + error.message)
    } else {
      limpiarForm()
      await cargar()
    }
    setGuardando(false)
  }

  async function eliminar(id) {
    await supabase.from('costeo_mano_obra').delete().eq('id', id)
    if (editandoId === id) limpiarForm()
    await cargar()
  }

  const totalMOD = filas.reduce((acc, f) => acc + subtotalFila(f), 0)

  const hayPartes = filas.some((f) => f.parte)
  const agruparPorEtapa = vista === 'etapa'
  const mostrarAgrupado = agruparPorEtapa || hayPartes
  const grupos = new Map()
  if (mostrarAgrupado) {
    for (const f of filas) {
      const clave = agruparPorEtapa ? f.etapa || SIN_ETAPA : f.parte || SIN_PARTE
      if (!grupos.has(clave)) grupos.set(clave, [])
      grupos.get(clave).push(f)
    }
  }

  return (
    <div>
      <p className="text-sm text-feisen-texto-2 mb-3">
        Para cada etapa elige cómo se paga: <strong>por hora</strong> (operarios × horas × tarifa) o{' '}
        <strong>a destajo</strong> (un precio fijo por pieza, sin importar el tiempo — ej. $2.000 por
        cada cintura rolada). Si esta ficha tiene varias partes (ej. cintura, cono, fondo, tubo),
        ponle el nombre de la parte a cada línea para ver el costo de cada una por separado.
      </p>
      <form onSubmit={agregar} className="bg-white border border-feisen-borde rounded-lg p-4 mb-6">
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Nombre de la parte <span className="font-normal text-feisen-texto-2">(opcional)</span>
            </label>
            <input
              list="partes-mano-obra"
              value={form.parte}
              onChange={(e) => setForm({ ...form, parte: e.target.value })}
              placeholder="ej. Cintura, Cono, Fondo, Tubo"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
            <datalist id="partes-mano-obra">
              {partesDisponibles.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            {partesDisponibles.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {partesDisponibles.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm({ ...form, parte: p })}
                    className={`text-xs rounded-full px-2 py-0.5 border ${
                      form.parte === p
                        ? 'bg-feisen-azul text-white border-feisen-azul'
                        : 'border-feisen-borde text-feisen-texto-2 hover:border-feisen-azul'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Etapa</label>
            <select
              value={form.etapa}
              onChange={(e) => elegirEtapa(e.target.value)}
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
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium">Responsable</label>
              {form.etapa && (operariosPorEtapa[form.etapa] || []).length > 0 && (
                <button
                  type="button"
                  onClick={() => setModoResponsable(modoResponsable === 'lista' ? 'otro' : 'lista')}
                  className="text-xs text-feisen-azul hover:underline"
                >
                  {modoResponsable === 'lista' ? 'Escribir otro nombre' : 'Elegir de la lista'}
                </button>
              )}
            </div>
            {modoResponsable === 'lista' && form.etapa && (operariosPorEtapa[form.etapa] || []).length > 0 ? (
              <select
                value={form.responsable}
                onChange={(e) => elegirOperario(e.target.value)}
                className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
              >
                <option value="">-- Selecciona operario --</option>
                {(operariosPorEtapa[form.etapa] || []).map((o) => (
                  <option key={o.id} value={etiquetaOperario(o)}>
                    {etiquetaOperario(o)}
                    {o.tipo_pago === 'destajo'
                      ? o.precio_destajo != null
                        ? ` (${formatCOP(o.precio_destajo)}/pieza)`
                        : ''
                      : o.tarifa_hora != null
                      ? ` (${formatCOP(o.tarifa_hora)}/h)`
                      : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form.responsable}
                onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                placeholder={!form.etapa ? 'Elige primero la etapa' : ''}
                className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
              />
            )}
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs font-medium mb-1">Tipo de pago</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, tipo_pago: 'hora' })}
              className={`text-sm rounded-full px-4 py-1.5 border ${
                form.tipo_pago === 'hora'
                  ? 'bg-feisen-azul text-white border-feisen-azul'
                  : 'bg-white text-feisen-texto-2 border-feisen-borde hover:border-feisen-azul'
              }`}
            >
              Por hora
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, tipo_pago: 'destajo' })}
              className={`text-sm rounded-full px-4 py-1.5 border ${
                form.tipo_pago === 'destajo'
                  ? 'bg-feisen-azul text-white border-feisen-azul'
                  : 'bg-white text-feisen-texto-2 border-feisen-borde hover:border-feisen-azul'
              }`}
            >
              Destajo (precio fijo)
            </button>
          </div>
        </div>

        {form.tipo_pago === 'hora' ? (
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
              <label className="block text-xs font-medium mb-1">Horas por unidad</label>
              <input
                type="number"
                step="any"
                value={form.horas_por_unidad}
                onChange={(e) => setForm({ ...form, horas_por_unidad: e.target.value })}
                className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tarifa hora (COP)</label>
              <input
                type="number"
                step="any"
                value={form.tarifa_hora}
                onChange={(e) => setForm({ ...form, tarifa_hora: e.target.value })}
                className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
              />
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium mb-1">
                Cantidad de piezas por unidad de esta ficha
              </label>
              <input
                type="number"
                step="any"
                value={form.cantidad_destajo}
                onChange={(e) => setForm({ ...form, cantidad_destajo: e.target.value })}
                placeholder="ej. 1 (esta ficha lleva 1 cintura rolada)"
                className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Precio por pieza (COP)</label>
              <input
                type="number"
                step="any"
                value={form.precio_destajo}
                onChange={(e) => setForm({ ...form, precio_destajo: e.target.value })}
                placeholder="ej. 2000"
                className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mt-3">
          <button
            type="submit"
            disabled={guardando}
            className="bg-feisen-azul text-white font-medium rounded-md py-2 px-6 hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Agregar etapa'}
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
      ) : filas.length === 0 ? (
        <p className="text-sm text-feisen-texto-2">Todavía no has agregado etapas.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-feisen-texto-2">Ver agrupado por:</span>
            <button
              type="button"
              onClick={() => setVista('parte')}
              className={`text-xs rounded-full px-3 py-1 border ${
                vista === 'parte'
                  ? 'bg-feisen-azul text-white border-feisen-azul'
                  : 'bg-white text-feisen-texto-2 border-feisen-borde hover:border-feisen-azul'
              }`}
            >
              Parte / item
            </button>
            <button
              type="button"
              onClick={() => setVista('etapa')}
              className={`text-xs rounded-full px-3 py-1 border ${
                vista === 'etapa'
                  ? 'bg-feisen-azul text-white border-feisen-azul'
                  : 'bg-white text-feisen-texto-2 border-feisen-borde hover:border-feisen-azul'
              }`}
            >
              Etapa
            </button>
          </div>

          {mostrarAgrupado ? (
            <div className="space-y-4">
              {[...grupos.entries()]
                .sort(([a], [b]) => {
                  if (a === SIN_PARTE || a === SIN_ETAPA) return 1
                  if (b === SIN_PARTE || b === SIN_ETAPA) return -1
                  return a.localeCompare(b)
                })
                .map(([clave, filasGrupo]) => (
                  <TablaManoObra
                    key={clave}
                    titulo={
                      clave === SIN_PARTE
                        ? 'Sin parte específica'
                        : clave === SIN_ETAPA
                        ? 'Sin etapa'
                        : clave
                    }
                    ocultarEtapa={agruparPorEtapa}
                    filas={filasGrupo}
                    onEliminar={eliminar}
                    onEditar={iniciarEdicion}
                  />
                ))}
              <div className="flex justify-between px-4 py-3 bg-feisen-azul text-white font-semibold rounded-lg">
                <span>TOTAL MOD</span>
                <span>{formatCOP(totalMOD)}</span>
              </div>
            </div>
          ) : (
            <TablaManoObra filas={filas} onEliminar={eliminar} onEditar={iniciarEdicion} totalMOD={totalMOD} />
          )}
        </>
      )}
    </div>
  )
}

function TablaManoObra({ titulo, filas, onEliminar, onEditar, totalMOD, ocultarEtapa }) {
  const subtotal = filas.reduce((acc, f) => acc + subtotalFila(f), 0)
  const colsFijas = ocultarEtapa ? 2 : 3
  return (
    <div className="overflow-x-auto">
      {titulo && <h3 className="text-sm font-semibold text-feisen-texto-2 mb-1">{titulo}</h3>}
      <table className="w-full text-sm border border-feisen-borde rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-feisen-rojo text-white text-left">
            {!ocultarEtapa && <th className="px-3 py-2">Etapa</th>}
            <th className="px-3 py-2">Responsable</th>
            <th className="px-3 py-2">Detalle</th>
            <th className="px-3 py-2 text-right">Subtotal</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const fila = subtotalFila(f)
            return (
              <tr key={f.id} className="border-t border-feisen-borde">
                {!ocultarEtapa && <td className="px-3 py-2">{f.etapa}</td>}
                <td className="px-3 py-2">{f.responsable ?? '—'}</td>
                <td className="px-3 py-2 text-feisen-texto-2">
                  {f.tipo_pago === 'destajo' ? (
                    <>
                      {formatNumber(f.cantidad_destajo, 0)} × {formatCOP(f.precio_destajo)}{' '}
                      <span className="text-xs">(destajo)</span>
                    </>
                  ) : (
                    <>
                      {formatNumber(f.num_operarios, 0)} op. × {formatNumber(f.horas_por_unidad)} h ×{' '}
                      {formatCOP(f.tarifa_hora)}/h
                    </>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-medium">{formatCOP(fila)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => onEditar(f)} className="text-feisen-azul text-xs hover:underline mr-2">
                    Editar
                  </button>
                  <button onClick={() => onEliminar(f.id)} className="text-feisen-rojo text-xs hover:underline">
                    Quitar
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-feisen-borde bg-feisen-gris font-semibold">
            <td className="px-3 py-2" colSpan={colsFijas}>
              {titulo ? `Subtotal ${titulo}` : 'TOTAL MOD'}
            </td>
            <td className="px-3 py-2 text-right">{formatCOP(totalMOD ?? subtotal)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
