// Preparación de una quincena: carga de colaboradores, sugerencia de días y
// guardado de liquidaciones. Las piezas de destajo las ingresa RRHH a mano
// (decisión de Angie, 2026-10-26: ya no se sugieren desde producción).
import { supabase } from '../../../lib/supabase'
import { BUCKET_RRHH } from '../catalogosRRHH'
import { fetchAllPages } from '../../../utils/fetchAllPages'
import { modalidadDe, rangoQuincena, diasLaborales, diasAusente, calcularTotales, valoresHora, valorDiaBase } from './nominaCalculo'

export { nombreQuincena, rangoQuincena } from './nominaCalculo'

export const CAMPOS_PAGO_EMPLEADO = 'id, nombres, apellidos, tipo_documento, numero_documento, cargo, area, estado, tipo_contrato, tipo_vinculacion, salario_base, valor_dia, valor_quincena, valor_hora_extra, valor_hora_recargo, auxilio_quincenal, subsidio_ss, aporte_ss, foto_path, email_corporativo, email_personal'

const valorNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

// Todo lo que hace falta para sugerir liquidaciones de una quincena
export async function contextoQuincena(inicio, fin) {
  const [{ data: empleados, error: e1 }, { data: novedades }] = await Promise.all([
    supabase.from('empleados').select(CAMPOS_PAGO_EMPLEADO).order('nombres'),
    fetchAllPages((d, h) => supabase.from('novedades')
      .select('empleado_id, tipo, fecha_inicio, fecha_fin, por_horas, remunerado')
      .lte('fecha_inicio', fin).gte('fecha_fin', inicio).range(d, h)),
  ])
  if (e1) throw new Error(e1.message)
  return { empleados: empleados || [], novedades: novedades || [] }
}

// Liquidación sugerida para una persona (sin guardar)
export function liquidacionSugerida(emp, inicio, fin, ctx) {
  const modalidad = modalidadDe(emp)
  const novs = ctx.novedades.filter(n => n.empleado_id === emp.id)
  const laborales = diasLaborales(inicio, fin)
  const ausente = diasAusente(novs, inicio, fin)
  const valorFijo = modalidad === 'fijo' ? valorNum(emp.valor_quincena ?? (emp.salario_base ? Number(emp.salario_base) / 2 : null)) : null
  const horas = valoresHora(valorDiaBase(modalidad, emp.valor_dia, valorFijo))
  const liq = {
    empleado_id: emp.id,
    modalidad,
    dias: modalidad === 'dia' ? Math.max(0, laborales - ausente) : null,
    valor_dia: modalidad === 'dia' ? valorNum(emp.valor_dia) : null,
    horas_extra: null,
    horas_extra_recargo: null,
    valor_hora_extra: valorNum(emp.valor_hora_extra) ?? horas.extra,
    valor_hora_recargo: valorNum(emp.valor_hora_recargo) ?? horas.recargo,
    valor_fijo: valorFijo,
    auxilio: valorNum(emp.auxilio_quincenal),
    subsidio_ss: valorNum(emp.subsidio_ss),
    otros_devengos: [],
    descuento_tiempo_pieza: null,
    seguridad: valorNum(emp.aporte_ss),
    anticipo: null,
    dotacion_herramienta: null,
    otras_deducciones: [],
    observaciones: ausente > 0 ? `${ausente} día${ausente === 1 ? '' : 's'} laboral${ausente === 1 ? '' : 'es'} con novedad en la quincena.` : null,
  }
  return { liq, piezas: [] }
}

// Crea la quincena con una liquidación sugerida por cada colaborador activo
export async function crearQuincena({ anio, mes, quincena }, perfilId) {
  const { inicio, fin } = rangoQuincena(anio, mes, quincena)
  const ctx = await contextoQuincena(inicio, fin)
  const { data: periodo, error } = await supabase.from('nomina_periodos')
    .insert({ anio, mes, quincena, fecha_inicio: inicio, fecha_fin: fin, creado_por: perfilId })
    .select('id').single()
  if (error) throw new Error(error.message.includes('duplicate') ? 'Esa quincena ya existe.' : error.message)
  try {
    const activos = ctx.empleados.filter(e => e.estado !== 'retirado')
    const sugeridas = activos.map(e => liquidacionSugerida(e, inicio, fin, ctx))
    if (sugeridas.length) {
      const filas = sugeridas.map(({ liq, piezas }) => ({ ...liq, periodo_id: periodo.id, ...calcularTotales(liq, piezas) }))
      const { data: creadas, error: errLiq } = await supabase.from('nomina_liquidaciones').insert(filas).select('id, empleado_id')
      if (errLiq) throw errLiq
      const idPorEmpleado = new Map((creadas || []).map(c => [c.empleado_id, c.id]))
      const piezas = sugeridas.flatMap(({ liq, piezas }) => piezas.map(p => ({ ...p, liquidacion_id: idPorEmpleado.get(liq.empleado_id) })))
        .filter(p => p.liquidacion_id)
      if (piezas.length) {
        const { error: errP } = await supabase.from('nomina_piezas').insert(piezas)
        if (errP) throw errP
      }
    }
    return periodo.id
  } catch (err) {
    // No dejar una quincena a medias
    await supabase.from('nomina_periodos').delete().eq('id', periodo.id)
    throw new Error(err.message || String(err))
  }
}

// Quincena (año, mes, 1|2) a la que pertenece una fecha 'YYYY-MM-DD'
export function quincenaDeFecha(iso) {
  const [anio, mes, dia] = iso.split('-').map(Number)
  return { anio, mes, quincena: dia <= 15 ? 1 : 2 }
}

// Mueve una quincena en borrador a otras fechas. Recalcula los días sugeridos
// de los de "al día" (días laborales − novedades) y borra la sugerencia del
// huellero, que corresponde a las fechas anteriores. Lo demás no se toca.
export async function cambiarQuincena(periodo, { anio, mes, quincena }) {
  if (periodo.estado !== 'borrador') throw new Error('La quincena está cerrada o aprobada. Reábrela para cambiar sus fechas.')
  const { inicio, fin } = rangoQuincena(anio, mes, quincena)
  const { data: otra } = await supabase.from('nomina_periodos').select('id')
    .eq('anio', anio).eq('mes', mes).eq('quincena', quincena).neq('id', periodo.id).maybeSingle()
  if (otra) throw new Error('Ya existe otra nómina para esa quincena.')

  const { error } = await supabase.from('nomina_periodos').update({
    anio, mes, quincena, fecha_inicio: inicio, fecha_fin: fin,
    huellero_path: null, huellero_nombre: null, huellero_cargado_en: null,
  }).eq('id', periodo.id)
  if (error) throw new Error(error.message)
  if (periodo.huellero_path) await supabase.storage.from(BUCKET_RRHH).remove([periodo.huellero_path])

  const [{ data: liqs }, ctx] = await Promise.all([
    supabase.from('nomina_liquidaciones').select('*').eq('periodo_id', periodo.id),
    contextoQuincena(inicio, fin),
  ])
  const ids = (liqs || []).map(l => l.id)
  const { data: piezas } = ids.length
    ? await supabase.from('nomina_piezas').select('liquidacion_id, cantidad, valor_unitario').in('liquidacion_id', ids)
    : { data: [] }
  const laborales = diasLaborales(inicio, fin)
  for (const l of liqs || []) {
    const cambios = { huellero: null }
    if (l.modalidad === 'dia') {
      const novs = ctx.novedades.filter(n => n.empleado_id === l.empleado_id)
      cambios.dias = Math.max(0, laborales - diasAusente(novs, inicio, fin))
    }
    const totales = calcularTotales({ ...l, ...cambios }, (piezas || []).filter(p => p.liquidacion_id === l.id))
    const { error: e2 } = await supabase.from('nomina_liquidaciones').update({ ...cambios, ...totales }).eq('id', l.id)
    if (e2) throw new Error(e2.message)
  }
  return { inicio, fin }
}

// Guarda una liquidación y reemplaza sus piezas
export async function guardarLiquidacion(liqId, liq, piezas) {
  const campos = {
    modalidad: liq.modalidad,
    dias: valorNum(liq.dias), valor_dia: valorNum(liq.valor_dia),
    horas_extra: valorNum(liq.horas_extra), valor_hora_extra: valorNum(liq.valor_hora_extra),
    horas_extra_recargo: valorNum(liq.horas_extra_recargo), valor_hora_recargo: valorNum(liq.valor_hora_recargo),
    valor_fijo: valorNum(liq.valor_fijo), auxilio: valorNum(liq.auxilio), subsidio_ss: valorNum(liq.subsidio_ss),
    otros_devengos: (liq.otros_devengos || []).filter(o => o.concepto?.trim() || Number(o.valor)).map(o => ({ concepto: (o.concepto || '').trim(), valor: Number(o.valor) || 0 })),
    descuento_tiempo_pieza: valorNum(liq.descuento_tiempo_pieza),
    seguridad: valorNum(liq.seguridad), anticipo: valorNum(liq.anticipo), dotacion_herramienta: valorNum(liq.dotacion_herramienta),
    otras_deducciones: (liq.otras_deducciones || []).filter(o => o.concepto?.trim() || Number(o.valor)).map(o => ({ concepto: (o.concepto || '').trim(), valor: Number(o.valor) || 0 })),
    observaciones: liq.observaciones?.trim() || null,
  }
  const limpias = piezas.filter(p => (p.descripcion || '').trim() && Number(p.cantidad))
    .map(p => ({ liquidacion_id: liqId, item_id: p.item_id || null, descripcion: p.descripcion.trim(), cantidad: Number(p.cantidad), valor_unitario: Number(p.valor_unitario) || 0, origen: p.origen || 'manual' }))
  const totales = calcularTotales(campos, limpias)
  const { error } = await supabase.from('nomina_liquidaciones').update({ ...campos, ...totales }).eq('id', liqId)
  if (error) throw new Error(error.message)
  const { error: errDel } = await supabase.from('nomina_piezas').delete().eq('liquidacion_id', liqId)
  if (errDel) throw new Error(errDel.message)
  if (limpias.length) {
    const { error: errIns } = await supabase.from('nomina_piezas').insert(limpias)
    if (errIns) throw new Error(errIns.message)
  }
  return totales
}
