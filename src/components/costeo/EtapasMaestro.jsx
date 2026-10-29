import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ETAPAS } from './utils/etapas'
import { CENTROS_COSTO } from './utils/centrosCosto'
import { formatCOP } from './utils/format'

const FORM_OPERARIO_VACIO = {
  nombre: '',
  tarea: '',
  tipo_pago: 'hora',
  tarifa_hora: '',
  precio_destajo: '',
}

export default function EtapasMaestro() {
  const [datos, setDatos] = useState({})
  const [operarios, setOperarios] = useState({}) // etapa -> [operario, ...]
  const [loading, setLoading] = useState(true)
  const [guardandoEtapa, setGuardandoEtapa] = useState(null)
  const [etapaAbierta, setEtapaAbierta] = useState(null)
  const [formOperario, setFormOperario] = useState(FORM_OPERARIO_VACIO)
  const [editandoOperarioId, setEditandoOperarioId] = useState(null)
  const [guardandoOperario, setGuardandoOperario] = useState(false)

  async function cargar() {
    setLoading(true)
    const [{ data }, { data: dataOperarios }] = await Promise.all([
      supabase.from('costeo_etapas_maestro').select('*'),
      supabase.from('costeo_operarios').select('*').order('nombre', { ascending: true }),
    ])
    const mapa = {}
    for (const et of ETAPAS) {
      mapa[et] = {
        puesto: '',
        centro_costo: '',
        tipo_pago_sugerido: 'hora',
        tarifa_hora_sugerida: '',
        precio_destajo_sugerido: '',
      }
    }
    for (const d of data || []) {
      mapa[d.etapa] = {
        puesto: d.puesto ?? '',
        centro_costo: d.centro_costo ?? '',
        tipo_pago_sugerido: d.tipo_pago_sugerido ?? 'hora',
        tarifa_hora_sugerida: d.tarifa_hora_sugerida != null ? String(d.tarifa_hora_sugerida) : '',
        precio_destajo_sugerido: d.precio_destajo_sugerido != null ? String(d.precio_destajo_sugerido) : '',
      }
    }
    setDatos(mapa)
    const mapaOperarios = {}
    for (const et of ETAPAS) mapaOperarios[et] = []
    for (const o of dataOperarios || []) {
      if (!mapaOperarios[o.etapa]) mapaOperarios[o.etapa] = []
      mapaOperarios[o.etapa].push(o)
    }
    setOperarios(mapaOperarios)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  function actualizarCampo(etapa, campo, valor) {
    setDatos((prev) => ({ ...prev, [etapa]: { ...prev[etapa], [campo]: valor } }))
  }

  async function guardar(etapa) {
    setGuardandoEtapa(etapa)
    const { puesto, centro_costo, tipo_pago_sugerido, tarifa_hora_sugerida, precio_destajo_sugerido } =
      datos[etapa]
    await supabase.from('costeo_etapas_maestro').upsert({
      etapa,
      puesto: puesto.trim() ? puesto.trim() : null,
      centro_costo: centro_costo || null,
      tipo_pago_sugerido: tipo_pago_sugerido || 'hora',
      tarifa_hora_sugerida: tarifa_hora_sugerida.toString().trim()
        ? Number(tarifa_hora_sugerida)
        : null,
      precio_destajo_sugerido: precio_destajo_sugerido.toString().trim()
        ? Number(precio_destajo_sugerido)
        : null,
      updated_at: new Date().toISOString(),
    })
    setGuardandoEtapa(null)
  }

  function abrirEtapa(etapa) {
    if (etapaAbierta === etapa) {
      setEtapaAbierta(null)
      return
    }
    setEtapaAbierta(etapa)
    setFormOperario(FORM_OPERARIO_VACIO)
    setEditandoOperarioId(null)
  }

  function iniciarEdicionOperario(o) {
    setEditandoOperarioId(o.id)
    setFormOperario({
      nombre: o.nombre ?? '',
      tarea: o.tarea ?? '',
      tipo_pago: o.tipo_pago ?? 'hora',
      tarifa_hora: o.tarifa_hora != null ? String(o.tarifa_hora) : '',
      precio_destajo: o.precio_destajo != null ? String(o.precio_destajo) : '',
    })
  }

  function limpiarFormOperario() {
    setFormOperario(FORM_OPERARIO_VACIO)
    setEditandoOperarioId(null)
  }

  async function guardarOperario(etapa) {
    if (!formOperario.nombre.trim()) return
    setGuardandoOperario(true)
    const esDestajo = formOperario.tipo_pago === 'destajo'
    const payload = {
      etapa,
      nombre: formOperario.nombre.trim(),
      tarea: formOperario.tarea.trim() ? formOperario.tarea.trim() : null,
      tipo_pago: formOperario.tipo_pago,
      tarifa_hora: !esDestajo && formOperario.tarifa_hora.toString().trim()
        ? Number(formOperario.tarifa_hora)
        : null,
      precio_destajo: esDestajo && formOperario.precio_destajo.toString().trim()
        ? Number(formOperario.precio_destajo)
        : null,
    }
    const { error } = editandoOperarioId
      ? await supabase.from('costeo_operarios').update(payload).eq('id', editandoOperarioId)
      : await supabase.from('costeo_operarios').insert(payload)
    setGuardandoOperario(false)
    if (error) {
      window.alert('No se pudo guardar: ' + error.message)
      return
    }
    limpiarFormOperario()
    await cargar()
    setEtapaAbierta(etapa)
  }

  async function eliminarOperario(id, etapa, nombre) {
    const confirmado = window.confirm(`¿Eliminar a "${nombre}" de esta etapa?`)
    if (!confirmado) return
    await supabase.from('costeo_operarios').delete().eq('id', id)
    await cargar()
    setEtapaAbierta(etapa)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-feisen-azul">Responsables por etapa</h1>
      <main className="mt-6">
        <p className="text-sm text-feisen-texto-2 mb-4">
          Por cada etapa: el <strong>puesto</strong> (estructural, ej. "Soldador"), el{' '}
          <strong>centro de costo</strong> al que pertenece (Aluminio, Fundición o Feisen — así el CIF
          de cada centro se prorratea solo con las horas que le corresponden) y su tarifa/precio
          general por defecto. Debajo, la <strong>lista de operarios</strong> que hacen esa etapa —
          puede haber varios (ej. 8 soldadores), cada uno con su propia tarifa si es distinta, y un
          mismo operario a destajo puede aparecer varias veces con distinta <strong>tarea</strong> y
          precio (ej. rolar cinturas a un precio, embombar a otro). En Mano de Obra vas a poder
          escoger cuál hizo el trabajo.
        </p>

        {loading ? (
          <p className="text-sm text-feisen-texto-2">Cargando…</p>
        ) : (
          <div className="space-y-3">
            {ETAPAS.map((et) => {
              const esDestajo = (datos[et]?.tipo_pago_sugerido ?? 'hora') === 'destajo'
              const listaOperarios = operarios[et] || []
              const abierta = etapaAbierta === et
              return (
                <div key={et} className="bg-white border border-feisen-borde rounded-lg overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-feisen-texto-2">{et}</h3>
                      <button
                        onClick={() => abrirEtapa(et)}
                        className="text-xs text-feisen-azul hover:underline"
                      >
                        {abierta ? 'Ocultar operarios' : `Operarios (${listaOperarios.length})`}
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-5 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-medium mb-1">Puesto</label>
                        <input
                          value={datos[et]?.puesto ?? ''}
                          onChange={(e) => actualizarCampo(et, 'puesto', e.target.value)}
                          placeholder="ej. Soldador"
                          className="w-full border border-feisen-borde rounded-md px-2 py-1 outline-none focus:border-feisen-azul"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Centro de costo</label>
                        <select
                          value={datos[et]?.centro_costo ?? ''}
                          onChange={(e) => actualizarCampo(et, 'centro_costo', e.target.value)}
                          className="w-full border border-feisen-borde rounded-md px-2 py-1 outline-none focus:border-feisen-azul"
                        >
                          <option value="">-- Sin asignar --</option>
                          {CENTROS_COSTO.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Tipo de pago (general)</label>
                        <select
                          value={datos[et]?.tipo_pago_sugerido ?? 'hora'}
                          onChange={(e) => actualizarCampo(et, 'tipo_pago_sugerido', e.target.value)}
                          className="w-full border border-feisen-borde rounded-md px-2 py-1 outline-none focus:border-feisen-azul"
                        >
                          <option value="hora">Por hora</option>
                          <option value="destajo">Destajo</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Tarifa/precio general (COP)</label>
                        <input
                          type="number"
                          step="any"
                          value={
                            esDestajo
                              ? datos[et]?.precio_destajo_sugerido ?? ''
                              : datos[et]?.tarifa_hora_sugerida ?? ''
                          }
                          onChange={(e) =>
                            actualizarCampo(
                              et,
                              esDestajo ? 'precio_destajo_sugerido' : 'tarifa_hora_sugerida',
                              e.target.value
                            )
                          }
                          placeholder={esDestajo ? 'ej. 2000 por pieza' : 'ej. valor hora'}
                          className="w-full border border-feisen-borde rounded-md px-2 py-1 outline-none focus:border-feisen-azul"
                        />
                      </div>
                      <div>
                        <button
                          onClick={() => guardar(et)}
                          disabled={guardandoEtapa === et}
                          className="text-xs bg-feisen-azul text-white rounded-md px-3 py-1.5 hover:opacity-90 disabled:opacity-60"
                        >
                          {guardandoEtapa === et ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {abierta && (
                    <div className="border-t border-feisen-borde bg-feisen-gris/40 p-4">
                      {listaOperarios.length === 0 ? (
                        <p className="text-sm text-feisen-texto-2 mb-3">
                          Todavía no hay operarios registrados para esta etapa.
                        </p>
                      ) : (
                        <table className="w-full text-sm mb-3">
                          <thead>
                            <tr className="text-left text-feisen-texto-2">
                              <th className="py-1 pr-3">Nombre</th>
                              <th className="py-1 pr-3">Tarea</th>
                              <th className="py-1 pr-3">Tipo de pago</th>
                              <th className="py-1 pr-3">Tarifa/precio</th>
                              <th className="py-1"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {listaOperarios.map((o) => (
                              <tr key={o.id} className="border-t border-feisen-borde">
                                <td className="py-1.5 pr-3 font-medium">{o.nombre}</td>
                                <td className="py-1.5 pr-3 text-feisen-texto-2">{o.tarea || '—'}</td>
                                <td className="py-1.5 pr-3">
                                  {o.tipo_pago === 'destajo' ? 'Destajo' : 'Por hora'}
                                </td>
                                <td className="py-1.5 pr-3">
                                  {o.tipo_pago === 'destajo'
                                    ? o.precio_destajo != null
                                      ? `${formatCOP(o.precio_destajo)} / pieza`
                                      : '—'
                                    : o.tarifa_hora != null
                                    ? `${formatCOP(o.tarifa_hora)} / h`
                                    : '—'}
                                </td>
                                <td className="py-1.5 text-right whitespace-nowrap">
                                  <button
                                    onClick={() => iniciarEdicionOperario(o)}
                                    className="text-feisen-azul text-xs hover:underline mr-2"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    onClick={() => eliminarOperario(o.id, et, o.nombre)}
                                    className="text-feisen-rojo text-xs hover:underline"
                                  >
                                    Eliminar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      <p className="text-xs text-feisen-texto-2 mb-2">
                        Si un operario a destajo hace varias tareas a precios distintos (ej. rola
                        cinturas a $2.000 pero embomba a otro precio, o arma cabinas a otro), agrégalo
                        varias veces aquí con la misma etapa o distinta, cambiando la <strong>tarea</strong> y
                        el precio de cada una.
                      </p>
                      <div className="grid sm:grid-cols-5 gap-3 items-end bg-white border border-feisen-borde rounded-md p-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">Nombre</label>
                          <input
                            value={formOperario.nombre}
                            onChange={(e) => setFormOperario({ ...formOperario, nombre: e.target.value })}
                            placeholder="ej. Carlos Porras"
                            className="w-full border border-feisen-borde rounded-md px-2 py-1 outline-none focus:border-feisen-azul"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Tarea <span className="font-normal text-feisen-texto-2">(opcional)</span>
                          </label>
                          <input
                            value={formOperario.tarea}
                            onChange={(e) => setFormOperario({ ...formOperario, tarea: e.target.value })}
                            placeholder="ej. Armado de cabina"
                            className="w-full border border-feisen-borde rounded-md px-2 py-1 outline-none focus:border-feisen-azul"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Tipo de pago</label>
                          <select
                            value={formOperario.tipo_pago}
                            onChange={(e) => setFormOperario({ ...formOperario, tipo_pago: e.target.value })}
                            className="w-full border border-feisen-borde rounded-md px-2 py-1 outline-none focus:border-feisen-azul"
                          >
                            <option value="hora">Por hora</option>
                            <option value="destajo">Destajo</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            {formOperario.tipo_pago === 'destajo' ? 'Precio por pieza (COP)' : 'Tarifa hora (COP)'}
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={
                              formOperario.tipo_pago === 'destajo'
                                ? formOperario.precio_destajo
                                : formOperario.tarifa_hora
                            }
                            onChange={(e) =>
                              setFormOperario({
                                ...formOperario,
                                [formOperario.tipo_pago === 'destajo' ? 'precio_destajo' : 'tarifa_hora']:
                                  e.target.value,
                              })
                            }
                            className="w-full border border-feisen-borde rounded-md px-2 py-1 outline-none focus:border-feisen-azul"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => guardarOperario(et)}
                            disabled={guardandoOperario}
                            className="text-xs bg-feisen-azul text-white rounded-md px-3 py-1.5 hover:opacity-90 disabled:opacity-60"
                          >
                            {guardandoOperario
                              ? 'Guardando…'
                              : editandoOperarioId
                              ? 'Guardar cambios'
                              : '+ Agregar operario'}
                          </button>
                          {editandoOperarioId && (
                            <button
                              onClick={limpiarFormOperario}
                              className="text-xs text-feisen-texto-2 hover:underline"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
