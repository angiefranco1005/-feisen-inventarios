import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'
import { CENTROS_COSTO } from './utils/centrosCosto'
import { calcularCostosEquipo } from './utils/equipoCosto'

const FORM_VACIO = {
  nombre: '',
  centro_costo: CENTROS_COSTO[0],
  valor_activo: '',
  saldo_pendiente_depreciar: '',
  vida_util_anios: '',
  mantenimiento_anual: '',
  kw_instalados: '',
  tarifa_kwh: '',
  horas_disponibles_anio: '',
}

export default function EquiposMaestro() {
  const [equipos, setEquipos] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(FORM_VACIO)
  const [editandoId, setEditandoId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    setLoading(true)
    const { data } = await supabase
      .from('costeo_equipos_planta')
      .select('*')
      .order('centro_costo', { ascending: true })
      .order('nombre', { ascending: true })
    setEquipos(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  function editar(eq) {
    setEditandoId(eq.id)
    setForm({
      nombre: eq.nombre,
      centro_costo: eq.centro_costo,
      valor_activo: String(eq.valor_activo ?? ''),
      saldo_pendiente_depreciar: String(eq.saldo_pendiente_depreciar ?? ''),
      vida_util_anios: String(eq.vida_util_anios ?? ''),
      mantenimiento_anual: String(eq.mantenimiento_anual ?? ''),
      kw_instalados: String(eq.kw_instalados ?? ''),
      tarifa_kwh: String(eq.tarifa_kwh ?? ''),
      horas_disponibles_anio: String(eq.horas_disponibles_anio ?? ''),
    })
  }

  function cancelarEdicion() {
    setEditandoId(null)
    setForm(FORM_VACIO)
    setError('')
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!form.nombre.trim()) {
      setError('Ponle un nombre al equipo (ej. "Torno CNC 1").')
      return
    }
    if (!form.saldo_pendiente_depreciar) {
      setError('Ingresa el saldo que todavía falta por depreciar (para un equipo nuevo, es el costo total).')
      return
    }
    if (!form.vida_util_anios || Number(form.vida_util_anios) <= 0) {
      setError('La vida útil debe ser mayor a 0 años.')
      return
    }
    if (!form.horas_disponibles_anio || Number(form.horas_disponibles_anio) <= 0) {
      setError('Las horas disponibles al año deben ser mayores a 0.')
      return
    }
    setGuardando(true)
    const payload = {
      nombre: form.nombre.trim(),
      centro_costo: form.centro_costo,
      valor_activo: Number(form.valor_activo || 0),
      saldo_pendiente_depreciar: Number(form.saldo_pendiente_depreciar || 0),
      vida_util_anios: Number(form.vida_util_anios || 0),
      mantenimiento_anual: Number(form.mantenimiento_anual || 0),
      kw_instalados: Number(form.kw_instalados || 0),
      tarifa_kwh: Number(form.tarifa_kwh || 0),
      horas_disponibles_anio: Number(form.horas_disponibles_anio || 0),
      updated_at: new Date().toISOString(),
    }
    const { error } = editandoId
      ? await supabase.from('costeo_equipos_planta').update(payload).eq('id', editandoId)
      : await supabase.from('costeo_equipos_planta').insert(payload)
    setGuardando(false)
    if (error) {
      setError('No se pudo guardar: ' + error.message)
      return
    }
    cancelarEdicion()
    await cargar()
  }

  async function eliminar(id) {
    const confirmado = window.confirm(
      '¿Seguro que quieres eliminar este equipo? Si ya lo usaste en el costeo de alguna ficha, esa relación también se pierde.'
    )
    if (!confirmado) return
    await supabase.from('costeo_equipos_planta').delete().eq('id', id)
    await cargar()
  }

  const porCentro = {}
  for (const c of CENTROS_COSTO) porCentro[c] = []
  for (const eq of equipos) {
    if (!porCentro[eq.centro_costo]) porCentro[eq.centro_costo] = []
    porCentro[eq.centro_costo].push(eq)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-feisen-azul">Equipos de planta</h1>
      <main className="mt-6">
        <p className="text-sm text-feisen-texto-2 mb-4">
          Acá registras la maquinaria propia de planta (tornos, hornos de fundición, dobladoras,
          etc.) — no confundir con las "máquinas" que vendes, que están en el catálogo de fichas.
          Cada equipo calcula solo su valor por hora: (depreciación anual + mantenimiento anual +
          energía anual) ÷ horas disponibles al año. Ese valor por hora lo vas a poder usar dentro
          de cada ficha, en la pestaña "Equipos", para sumar cuántas horas de esa máquina consumió.
        </p>

        <form
          onSubmit={guardar}
          className="bg-white border border-feisen-borde rounded-lg p-4 mb-6 grid sm:grid-cols-2 md:grid-cols-4 gap-3 items-end"
        >
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium mb-1">Nombre del equipo</label>
            <input
              value={form.nombre}
              onChange={(e) => actualizarCampo('nombre', e.target.value)}
              placeholder="ej. Torno CNC 1"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Centro de costo</label>
            <select
              value={form.centro_costo}
              onChange={(e) => actualizarCampo('centro_costo', e.target.value)}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            >
              {CENTROS_COSTO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Costo original del activo (COP)</label>
            <input
              type="number"
              step="any"
              value={form.valor_activo}
              onChange={(e) => actualizarCampo('valor_activo', e.target.value)}
              placeholder="Solo de referencia, no afecta el cálculo"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Saldo pendiente por depreciar (COP)</label>
            <input
              type="number"
              step="any"
              value={form.saldo_pendiente_depreciar}
              onChange={(e) => actualizarCampo('saldo_pendiente_depreciar', e.target.value)}
              placeholder="Si es nuevo, igual al costo original"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Vida útil (años)</label>
            <input
              type="number"
              step="any"
              value={form.vida_util_anios}
              onChange={(e) => actualizarCampo('vida_util_anios', e.target.value)}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Mantenimiento anual (COP)</label>
            <input
              type="number"
              step="any"
              value={form.mantenimiento_anual}
              onChange={(e) => actualizarCampo('mantenimiento_anual', e.target.value)}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">kW instalados</label>
            <input
              type="number"
              step="any"
              value={form.kw_instalados}
              onChange={(e) => actualizarCampo('kw_instalados', e.target.value)}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tarifa energía (COP/kWh)</label>
            <input
              type="number"
              step="any"
              value={form.tarifa_kwh}
              onChange={(e) => actualizarCampo('tarifa_kwh', e.target.value)}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Horas disponibles al año</label>
            <input
              type="number"
              step="any"
              value={form.horas_disponibles_anio}
              onChange={(e) => actualizarCampo('horas_disponibles_anio', e.target.value)}
              placeholder="ej. 2000"
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          </div>

          <div className="sm:col-span-2 md:col-span-4 flex gap-2 items-center">
            <button
              type="submit"
              disabled={guardando}
              className="bg-feisen-azul text-white font-medium rounded-md px-4 py-2 hover:opacity-90 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Agregar equipo'}
            </button>
            {editandoId && (
              <button
                type="button"
                onClick={cancelarEdicion}
                className="text-sm text-feisen-texto-2 hover:underline px-2 py-2"
              >
                Cancelar
              </button>
            )}
          </div>
          {error && <p className="text-feisen-rojo text-sm sm:col-span-2 md:col-span-4">{error}</p>}
        </form>

        {loading ? (
          <p className="text-sm text-feisen-texto-2">Cargando…</p>
        ) : equipos.length === 0 ? (
          <p className="text-sm text-feisen-texto-2">Todavía no has registrado ningún equipo.</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {CENTROS_COSTO.map((centro) => {
              const lista = porCentro[centro] || []
              if (lista.length === 0) return null
              return (
                <div key={centro} className="bg-white border border-feisen-borde rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-feisen-rojo text-white font-semibold text-sm">{centro}</div>
                  <div className="p-3 flex flex-col gap-3">
                    {lista.map((eq) => {
                      const { depreciacionAnual, energiaAnual, costoAnualTotal, valorHora } = calcularCostosEquipo(eq)
                      return (
                        <div key={eq.id} className="border border-feisen-borde rounded-md p-3">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="font-semibold text-sm text-feisen-texto-2">{eq.nombre}</h3>
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => editar(eq)}
                                className="text-xs text-feisen-azul hover:underline"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => eliminar(eq.id)}
                                className="text-xs text-feisen-rojo hover:underline"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                          <table className="w-full text-xs">
                            <tbody>
                              <tr>
                                <td className="py-0.5 text-feisen-texto-2">Depreciación anual</td>
                                <td className="py-0.5 text-right">{formatCOP(depreciacionAnual)}</td>
                              </tr>
                              <tr>
                                <td className="py-0.5 text-feisen-texto-2">Mantenimiento anual</td>
                                <td className="py-0.5 text-right">{formatCOP(eq.mantenimiento_anual)}</td>
                              </tr>
                              <tr>
                                <td className="py-0.5 text-feisen-texto-2">Energía anual</td>
                                <td className="py-0.5 text-right">{formatCOP(energiaAnual)}</td>
                              </tr>
                              <tr className="border-t border-feisen-borde font-semibold">
                                <td className="py-1 text-feisen-texto-2">Costo anual total</td>
                                <td className="py-1 text-right">{formatCOP(costoAnualTotal)}</td>
                              </tr>
                              <tr>
                                <td className="py-0.5 text-feisen-texto-2">Horas disponibles/año</td>
                                <td className="py-0.5 text-right">{formatNumber(eq.horas_disponibles_anio, 0)}</td>
                              </tr>
                            </tbody>
                          </table>
                          <div className="mt-2 bg-feisen-azul text-white text-sm font-semibold rounded-md px-3 py-1.5 text-center">
                            {formatCOP(valorHora)} / hora
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
