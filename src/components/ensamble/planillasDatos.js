// Planillas de producción (destajo) y seriales de máquina.
// Ver supabase/migraciones/2026-11-04_planillas_produccion.sql y OBSERVACIONES.md.
// William (JEFE_ENSAMBLE) pasa a la app la planilla de papel de cada contratista;
// RRHH carga esas piezas a la nómina y ventas asigna los seriales en la entrega de la OF.
import { supabase } from '../../lib/supabase'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { siguienteNumero } from '../../utils/siguienteNumero'

export const HOY_COL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

// 'YYYY-MM-DD' → 'DD/MM/YYYY' sin pasar por Date (formatFecha lo correría un día por zona horaria)
export function fechaCorta(iso) {
  if (!iso) return '—'
  const [a, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export const num = (v) => Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
export const claveSerial = (s) => String(s || '').trim().toUpperCase()

// Listas para el formulario (empleados y tarifas son de RRHH: van por funciones con permiso)
export async function cargarCatalogos() {
  const [{ data: personas, error: e1 }, { data: tareas, error: e2 }, { data: modelos, error: e3 }] = await Promise.all([
    supabase.rpc('ensamble_contratistas'),
    supabase.rpc('ensamble_tareas'),
    fetchAllPages((d, h) => supabase.from('of_productos').select('nombre').eq('activo', true).order('nombre').range(d, h)),
  ])
  if (e1 || e2 || e3) throw new Error((e1 || e2 || e3).message)
  return {
    // Los de destajo primero: son los que entregan planilla
    personas: (personas || []).sort((a, b) =>
      (b.tipo_vinculacion === 'destajo') - (a.tipo_vinculacion === 'destajo') || a.nombre.localeCompare(b.nombre, 'es')),
    tareas: tareas || [],
    modelos: [...new Set((modelos || []).map(m => m.nombre.trim()).filter(Boolean))],
  }
}

export async function cargarPlanillas() {
  const [{ data: planillas, error: e1 }, { data: lineas, error: e2 }, { data: seriales, error: e3 }] = await Promise.all([
    fetchAllPages((d, h) => supabase.from('planillas_produccion').select('*')
      .order('fecha', { ascending: false }).order('numero', { ascending: false }).range(d, h)),
    fetchAllPages((d, h) => supabase.from('planilla_lineas').select('*').order('created_at').order('id').range(d, h)),
    fetchAllPages((d, h) => supabase.from('seriales_maquina')
      .select('id, serial, modelo, planilla_linea_id, estado').not('planilla_linea_id', 'is', null).order('serial').range(d, h)),
  ])
  if (e1 || e2 || e3) throw new Error((e1 || e2 || e3).message)
  const serialesDe = {}
  for (const s of seriales || []) (serialesDe[s.planilla_linea_id] ||= []).push(s)
  const lineasDe = {}
  for (const l of lineas || []) (lineasDe[l.planilla_id] ||= []).push({ ...l, cantidad: Number(l.cantidad), seriales: serialesDe[l.id] || [] })
  return (planillas || []).map(p => {
    const ls = lineasDe[p.id] || []
    return {
      ...p,
      lineas: ls,
      enNomina: ls.filter(l => l.liquidacion_id).length,
      despachadas: ls.flatMap(l => l.seriales).filter(s => s.estado === 'despachada').length,
    }
  })
}

// Siguiente consecutivo de máquina: el mayor serial numérico + 1 (null si aún no hay ninguno)
export async function siguienteSerial() {
  const { data, error } = await fetchAllPages((d, h) =>
    supabase.from('seriales_maquina').select('serial').order('id').range(d, h))
  if (error) throw new Error(error.message)
  let max = null
  for (const r of data || []) {
    const t = String(r.serial).trim()
    if (/^\d+$/.test(t)) max = Math.max(max ?? 0, Number(t))
  }
  return max === null ? null : max + 1
}

// Revisa el formulario. Devuelve el primer problema o null.
export function problemaPlanilla(form) {
  if (!form.empleado_id) return 'Escoge el contratista.'
  if (!form.fecha) return 'Escribe la fecha de la planilla.'
  const lineas = form.lineas.filter(l => l.tarea_id || l.cantidad)
  if (lineas.length === 0) return 'Agrega al menos una tarea con su cantidad.'
  const vistos = new Set()
  for (const [i, l] of lineas.entries()) {
    const n = i + 1
    if (!l.tarea_id) return `Escoge la tarea del renglón ${n}.`
    const cant = Number(l.cantidad)
    if (!(cant > 0)) return `Escribe la cantidad del renglón ${n}.`
    if (!l.completa) continue
    if (!Number.isInteger(cant)) return `En máquinas completas la cantidad va sin decimales (renglón ${n}).`
    if (!l.modelo?.trim()) return `Escoge el modelo de la máquina del renglón ${n}.`
    if (l.seriales.length !== cant) return `El renglón ${n} tiene ${cant} máquinas: escribe un número para cada una.`
    for (const s of l.seriales) {
      const k = claveSerial(s)
      if (!k) return `Falta un número de máquina en el renglón ${n}.`
      if (vistos.has(k)) return `El número de máquina ${s} está repetido.`
      vistos.add(k)
    }
  }
  return null
}

// Seriales del formulario que ya existen en otra planilla
export async function serialesOcupados(seriales, idsPropios = []) {
  if (seriales.length === 0) return []
  const { data, error } = await fetchAllPages((d, h) =>
    supabase.from('seriales_maquina').select('id, serial').order('id').range(d, h))
  if (error) throw new Error(error.message)
  const propios = new Set(idsPropios)
  const ocupados = new Set((data || []).filter(r => !propios.has(r.id)).map(r => claveSerial(r.serial)))
  return seriales.filter(s => ocupados.has(claveSerial(s)))
}

// Crea o reemplaza una planilla. Al editar se borran sus líneas (y sus seriales, en
// cascada) y se vuelven a crear: solo se permite si nada se cargó a nómina ni se despachó.
export async function guardarPlanilla(form, { perfil, persona, tareas, existente }) {
  const lineas = form.lineas.filter(l => l.tarea_id || l.cantidad)
  const todos = lineas.flatMap(l => (l.completa ? l.seriales : []))
  const propios = existente ? existente.lineas.flatMap(l => l.seriales.map(s => s.id)) : []
  const ocupados = await serialesOcupados(todos, propios)
  if (ocupados.length) throw new Error(`Ya existe${ocupados.length > 1 ? 'n' : ''} la${ocupados.length > 1 ? 's' : ''} máquina${ocupados.length > 1 ? 's' : ''} ${ocupados.join(', ')}.`)

  let planilla = existente
  if (existente) {
    const { error } = await supabase.from('planillas_produccion')
      .update({ empleado_id: form.empleado_id, fecha: form.fecha, notas: form.notas.trim() || null }).eq('id', existente.id)
    if (error) throw new Error(error.message)
    const { error: eDel } = await supabase.from('planilla_lineas').delete().eq('planilla_id', existente.id)
    if (eDel) throw new Error(eDel.message)
  } else {
    const numero = await siguienteNumero('planillas_produccion', 'PP')
    const { data, error } = await supabase.from('planillas_produccion').insert({
      numero, empleado_id: form.empleado_id, fecha: form.fecha, notas: form.notas.trim() || null, registrado_por: perfil.id,
    }).select('*').single()
    if (error) throw new Error(error.message)
    planilla = data
  }

  const nombreTarea = Object.fromEntries(tareas.map(t => [t.id, t.descripcion]))
  const { data: creadas, error: eLin } = await supabase.from('planilla_lineas').insert(lineas.map(l => ({
    planilla_id: planilla.id, tarifa_id: l.tarea_id, descripcion: nombreTarea[l.tarea_id] || l.descripcion || '',
    cantidad: Number(l.cantidad), modelo: l.completa ? l.modelo.trim() : null,
  }))).select('id')
  if (eLin) throw new Error(`La planilla ${planilla.numero} quedó sin tareas: ${eLin.message}`)

  const filasSerial = lineas.flatMap((l, i) => (l.completa ? l.seriales.map(s => ({
    serial: s.trim(), modelo: l.modelo.trim(), planilla_linea_id: creadas[i].id,
    empleado_id: form.empleado_id, hecha_por: persona?.nombre || null, fecha_fabricacion: form.fecha,
  })) : []))
  if (filasSerial.length) {
    const { error: eSer } = await supabase.from('seriales_maquina').insert(filasSerial)
    if (eSer) throw new Error(eSer.code === '23505'
      ? `Las tareas de ${planilla.numero} se guardaron, pero algún número de máquina ya existe. Revísalos y guarda de nuevo.`
      : `Las tareas de ${planilla.numero} se guardaron, pero no los números de máquina: ${eSer.message}`)
  }
  return planilla.numero
}

export async function borrarPlanilla(p) {
  const { data, error } = await supabase.from('planillas_produccion').delete().eq('id', p.id).select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('No se pudo borrar: ya tiene piezas en nómina o máquinas despachadas.')
}

// ── Ventas: seriales disponibles para una entrega y los ya despachados de una línea de OF ──
export async function serialesDisponibles() {
  const { data, error } = await fetchAllPages((d, h) => supabase.from('seriales_maquina')
    .select('id, serial, modelo, hecha_por, fecha_fabricacion').eq('estado', 'disponible').order('serial').range(d, h))
  if (error) throw new Error(error.message)
  return data || []
}

export async function serialesDeItemOF(itemOfId) {
  const { data, error } = await supabase.from('seriales_maquina')
    .select('id, serial, modelo').eq('item_of_id', itemOfId).eq('estado', 'despachada').order('serial')
  if (error) throw new Error(error.message)
  return data || []
}
