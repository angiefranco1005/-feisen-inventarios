import { useEffect, useState } from 'react'
import { Pencil, Plus, Users, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'
import { tipoTitulo } from './utils/nombres'
import { duracionTexto } from './utils/tiempos'

// Líneas de mano de obra de un proceso (costeo_proceso_mano_obra, costos en costeo_mano_obra_resumen).
// Cada persona o puesto con su forma de pago:
//   por hora → h-h por unidad de SUS mediciones × tarifa (sin mediciones, no suma: costo incompleto)
//   valor fijo por unidad (destajo) → el valor que se escribe, ej. $ 17.000 por embombar
// La persona se escoge de los puestos de trabajo del organigrama (tabla cargos de RRHH, agrupados
// por Área › Sub-área) o se escribe a mano.
// Al escoger un cargo que ya se usó en otro proceso, se proponen su forma de pago y su tarifa.
export default function ProcesoManoObra({ proceso, lineas, onCambio }) {
  const [form, setForm] = useState(null) // null = cerrado; { id?, cargo_id ('' | id | 'otro'), nombre, tipo_pago, tarifa_hora, precio_destajo }
  const [error, setError] = useState('')
  const [cargos, setCargos] = useState(null)

  useEffect(() => {
    if (!form || cargos) return
    supabase
      .from('cargos')
      .select('id, nombre, area, subarea')
      .order('area')
      .order('subarea', { nullsFirst: true })
      .order('nombre')
      .then(({ data }) => setCargos(data || []))
  }, [form, cargos])

  function nueva() {
    setError('')
    setForm({ cargo_id: '', nombre: '', tipo_pago: 'hora', tarifa_hora: '', precio_destajo: '' })
  }

  async function escogerCargo(valor) {
    if (valor === 'otro' || valor === '') {
      setForm((f) => ({ ...f, cargo_id: valor, nombre: valor === 'otro' ? '' : f.nombre }))
      return
    }
    const cargo = (cargos || []).find((c) => c.id === valor)
    setForm((f) => ({ ...f, cargo_id: valor, nombre: cargo?.nombre || '' }))
    // Última forma de pago y tarifa usadas para ese cargo en cualquier proceso.
    const { data } = await supabase
      .from('costeo_proceso_mano_obra')
      .select('tipo_pago, tarifa_hora, precio_destajo')
      .eq('cargo_id', valor)
      .order('created_at', { ascending: false })
      .limit(1)
    const ult = data?.[0]
    if (ult)
      setForm((f) => ({
        ...f,
        tipo_pago: ult.tipo_pago,
        tarifa_hora: Number(ult.tarifa_hora) > 0 ? String(ult.tarifa_hora) : f.tarifa_hora,
        precio_destajo: Number(ult.precio_destajo) > 0 ? String(ult.precio_destajo) : f.precio_destajo,
      }))
  }

  function editar(l) {
    setError('')
    setForm({
      id: l.mano_obra_id,
      cargo_id: l.cargo_id || 'otro',
      nombre: l.nombre,
      tipo_pago: l.tipo_pago,
      tarifa_hora: String(l.tarifa_hora ?? ''),
      precio_destajo: String(l.precio_destajo ?? ''),
    })
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!form.cargo_id) return setError('Escoge el puesto de trabajo del organigrama (u "Otro" para escribirlo).')
    if (!form.nombre.trim()) return setError('Ponle un nombre (ej. Operario 1, Ayudante).')
    const valor = Number(form.tipo_pago === 'hora' ? form.tarifa_hora : form.precio_destajo)
    if (!(valor > 0)) return setError(form.tipo_pago === 'hora' ? 'Pon la tarifa por hora.' : 'Pon el valor por unidad.')
    const datos = {
      cargo_id: form.cargo_id && form.cargo_id !== 'otro' ? form.cargo_id : null,
      nombre: form.nombre.trim(),
      tipo_pago: form.tipo_pago,
      tarifa_hora: Number(form.tarifa_hora || 0),
      precio_destajo: Number(form.precio_destajo || 0),
    }
    const { data: guardada, error } = form.id
      ? await supabase.from('costeo_proceso_mano_obra').update(datos).eq('id', form.id).select('id').single()
      : await supabase
          .from('costeo_proceso_mano_obra')
          .insert({ ...datos, proceso_id: proceso.id, orden: lineas.length ? Math.max(...lineas.map((l) => l.orden)) + 1 : 1 })
          .select('id')
          .single()
    if (error) return setError('No se pudo guardar: ' + error.message)
    // Si el tiempo se tomó antes de agregar a la persona, las mediciones quedaron sin dueño. Cuando
    // el proceso queda con una sola persona por hora, esas mediciones son de ella: se le asignan.
    const otrasPorHora = lineas.filter((l) => l.tipo_pago === 'hora' && l.mano_obra_id !== form.id)
    if (!form.id && guardada?.id && datos.tipo_pago === 'hora' && otrasPorHora.length === 0) {
      await supabase.from('costeo_tiempos_reales').update({ mano_obra_id: guardada.id }).eq('proceso_id', proceso.id).is('mano_obra_id', null)
    }
    setForm(null)
    onCambio()
  }

  async function quitar(l) {
    if (!window.confirm(`¿Quitar a "${l.nombre}" de este proceso? Sus mediciones de tiempo quedan sin persona asignada.`)) return
    await supabase.from('costeo_proceso_mano_obra').delete().eq('id', l.mano_obra_id)
    onCambio()
  }

  const campo = 'w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm outline-none focus:border-feisen-azul bg-white'
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const formulario = form && (
    <form onSubmit={guardar} className="mt-2 border border-feisen-borde rounded-lg p-3 bg-white grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="block text-xs text-feisen-texto-2 mb-1">Puesto de trabajo (del organigrama)</label>
        <select autoFocus value={form.cargo_id} onChange={(e) => escogerCargo(e.target.value)} className={campo}>
          <option value="">{cargos ? 'Escoge un puesto…' : 'Cargando puestos…'}</option>
          {Object.entries(
            (cargos || []).reduce((g, c) => {
              ;(g[(c.area || 'Sin área') + (c.subarea ? ` › ${c.subarea}` : '')] ||= []).push(c)
              return g
            }, {})
          ).map(([area, lista]) => (
            <optgroup key={area} label={area}>
              {lista.map((c) => (
                <option key={c.id} value={c.id}>{tipoTitulo(c.nombre)}</option>
              ))}
            </optgroup>
          ))}
          <option value="otro">Otro (escribir el nombre)</option>
        </select>
      </div>
      {form.cargo_id === 'otro' && (
        <div className="col-span-2">
          <label className="block text-xs text-feisen-texto-2 mb-1">Nombre</label>
          <input autoFocus value={form.nombre} onChange={set('nombre')} placeholder="Operario 1" className={campo} />
        </div>
      )}
      <div>
        <label className="block text-xs text-feisen-texto-2 mb-1">Se paga</label>
        <select value={form.tipo_pago} onChange={set('tipo_pago')} className={campo}>
          <option value="hora">Por hora</option>
          <option value="destajo">Valor fijo</option>
        </select>
      </div>
      {form.tipo_pago === 'hora' ? (
        <div>
          <label className="block text-xs text-feisen-texto-2 mb-1">Tarifa por hora (COP)</label>
          <input type="number" step="any" value={form.tarifa_hora} onChange={set('tarifa_hora')} placeholder="14285" className={campo} />
        </div>
      ) : (
        <div>
          <label className="block text-xs text-feisen-texto-2 mb-1">Valor por unidad (COP)</label>
          <input type="number" step="any" value={form.precio_destajo} onChange={set('precio_destajo')} placeholder="17000" className={campo} />
        </div>
      )}
      {error && <p className="text-feisen-rojo text-xs col-span-2">{error}</p>}
      <div className="col-span-2 flex gap-3">
        <button type="submit" className="bg-feisen-azul text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-feisen-azul-claro">
          {form.id ? 'Guardar' : 'Agregar'}
        </button>
        <button type="button" onClick={() => setForm(null)} className="text-sm text-feisen-texto-2 hover:underline">
          Cancelar
        </button>
      </div>
    </form>
  )

  return (
    <section>
      <h4 className="flex items-center gap-2 text-xs uppercase tracking-wide text-feisen-texto-2 mb-2">
        <Users size={14} /> Mano de obra
      </h4>
      {lineas.length === 0 && !form && (
        <p className="text-sm text-feisen-texto-2">Nadie asignado. Agrega quién hace este proceso y cómo se le paga.</p>
      )}
      {lineas.length > 0 && (
        <ul className="divide-y divide-feisen-borde-suave border border-feisen-borde rounded-lg bg-white">
          {lineas.map((l) =>
            form?.id === l.mano_obra_id ? (
              <li key={l.mano_obra_id} className="p-2">{formulario}</li>
            ) : (
              <li key={l.mano_obra_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-feisen-texto">{tipoTitulo(l.nombre)}</span>
                  <span className="block text-xs text-feisen-texto-2 tabular-nums">
                    {l.tipo_pago === 'destajo' ? (
                      <>Valor fijo · {formatCOP(l.precio_destajo)} por unidad</>
                    ) : Number(l.mediciones) > 0 ? (
                      <>
                        Por hora · {duracionTexto(l.horas_hombre_unidad)} por pieza × {formatCOP(l.tarifa_hora)}/h ·{' '}
                        {formatNumber(l.mediciones, 0)} {Number(l.mediciones) === 1 ? 'medición' : 'mediciones'}
                      </>
                    ) : (
                      <>
                        Por hora · {formatCOP(l.tarifa_hora)}/h ·{' '}
                        <span className="text-amber-700 font-medium">sin tiempo medido</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="ml-auto tabular-nums whitespace-nowrap">{formatCOP(l.costo)}</span>
                <button onClick={() => editar(l)} className="flex items-center gap-1 text-xs font-medium text-feisen-azul hover:underline px-1 py-1">
                  <Pencil size={13} /> Editar
                </button>
                <button onClick={() => quitar(l)} title="Quitar" className="text-feisen-texto-2 hover:text-feisen-rojo">
                  <X size={14} />
                </button>
              </li>
            )
          )}
        </ul>
      )}
      {form && !form.id ? (
        formulario
      ) : (
        <button onClick={nueva} className="mt-2 flex items-center gap-1 text-sm text-feisen-azul hover:underline">
          <Plus size={14} /> Agregar persona
        </button>
      )}
    </section>
  )
}
