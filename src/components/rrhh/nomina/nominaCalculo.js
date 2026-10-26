// Lógica de la nómina quincenal (sin JSX): modalidades, días laborales,
// cálculo de totales y lectura de la producción para sugerir el destajo.
import { supabase } from '../../../lib/supabase'
import { fetchAllPages } from '../../../utils/fetchAllPages'
import { festivosColombia } from '../catalogosRRHH'

export const MODALIDADES = {
  destajo: { label: 'Destajo',  detalle: 'Por pieza',          punto: 'bg-violet-500' },
  dia:     { label: 'Al día',   detalle: 'Por día trabajado',  punto: 'bg-sky-500' },
  fijo:    { label: 'Fijo',     detalle: 'Valor por quincena', punto: 'bg-emerald-500' },
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Modalidad de pago según el contrato de la ficha
export function modalidadDe(emp) {
  if (emp?.tipo_contrato === 'Contratista') return emp.tipo_vinculacion === 'destajo' ? 'destajo' : 'dia'
  return 'fijo'
}

const pad = (n) => String(n).padStart(2, '0')

export function rangoQuincena(anio, mes, quincena) {
  const ultimo = new Date(anio, mes, 0).getDate()
  return {
    inicio: `${anio}-${pad(mes)}-${quincena === 1 ? '01' : '16'}`,
    fin: `${anio}-${pad(mes)}-${quincena === 1 ? '15' : pad(ultimo)}`,
  }
}

export function nombreQuincena(p) {
  const { inicio, fin } = rangoQuincena(p.anio, p.mes, p.quincena)
  return `Del ${Number(inicio.slice(8))} al ${Number(fin.slice(8))} de ${MESES[p.mes - 1]} ${p.anio}`
}

// Días laborales de Feisen: lunes a viernes sin festivos. Verificado contra la
// planilla de Excel 2026 (p. ej. 1–15 oct = 10 días, 16–30 sep = 11).
export function esDiaLaboral(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  const dia = new Date(a, m - 1, d).getDay()
  return dia >= 1 && dia <= 5 && !festivosColombia(a).has(iso)
}

function* diasEntre(ini, fin) {
  const [a, m, d] = ini.split('-').map(Number)
  for (let x = new Date(a, m - 1, d); ; x.setDate(x.getDate() + 1)) {
    const iso = `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
    if (iso > fin) return
    yield iso
  }
}

export function diasLaborales(ini, fin) {
  let n = 0
  for (const iso of diasEntre(ini, fin)) if (esDiaLaboral(iso)) n++
  return n
}

// Días laborales de la quincena que la persona no trabajó por novedades no
// remuneradas (incapacidades, vacaciones, permisos/licencias no remunerados).
// Los permisos por horas no descuentan días.
export function diasAusente(novedades, ini, fin) {
  const dias = new Set()
  for (const n of novedades) {
    if (n.por_horas || n.remunerado === true) continue
    const desde = n.fecha_inicio > ini ? n.fecha_inicio : ini
    const hasta = n.fecha_fin < fin ? n.fecha_fin : fin
    if (desde > hasta) continue
    for (const iso of diasEntre(desde, hasta)) if (esDiaLaboral(iso)) dias.add(iso)
  }
  return dias.size
}

const num = (v) => Number(v) || 0
export const sumaLista = (lista) => (lista || []).reduce((t, x) => t + num(x?.valor), 0)

// Totales de una liquidación. Todos los conceptos suman si tienen valor
// (un destajo puede tener además horas extra u otros, como en el Excel).
export function calcularTotales(liq, piezas = []) {
  const total_piezas = piezas.reduce((t, p) => t + num(p.cantidad) * num(p.valor_unitario), 0)
  const total_devengado = total_piezas
    + num(liq.dias) * num(liq.valor_dia)
    + num(liq.horas_extra) * num(liq.valor_hora_extra)
    + num(liq.valor_fijo)
    + num(liq.auxilio)
    + num(liq.subsidio_ss)
    + sumaLista(liq.otros_devengos)
    - num(liq.descuento_tiempo_pieza)
  const total_deducciones = num(liq.seguridad) + num(liq.anticipo) + num(liq.dotacion_herramienta) + sumaLista(liq.otras_deducciones)
  const r = (n) => Math.round(n * 100) / 100
  return { total_piezas: r(total_piezas), total_devengado: r(total_devengado), total_deducciones: r(total_deducciones), neto: r(total_devengado - total_deducciones) }
}

// ─── Producción → destajo ────────────────────────────────────────────────────
// El operario se escribe a mano en producción; se compara normalizado.
export const normalizarAlias = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim()

// Busca el colaborador de un nombre de producción: primero en los alias
// guardados; si no, el único colaborador cuyo nombre completo contenga todas
// las palabras del alias (p. ej. "DAVID BARBOZA" → "Juan David Barboza Ruiz").
export function emparejarAlias(alias, empleados, mapaAlias) {
  if (mapaAlias.has(alias)) return mapaAlias.get(alias)
  const palabras = alias.split(' ').filter(Boolean)
  if (!palabras.length) return null
  const candidatos = empleados.filter(e => {
    const completo = new Set(normalizarAlias(`${e.nombres} ${e.apellidos}`).split(' '))
    return palabras.every(p => completo.has(p))
  })
  return candidatos.length === 1 ? candidatos[0].id : null
}

const diaSiguiente = (iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  const x = new Date(a, m - 1, d + 1)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

// Producción registrada en la quincena, agrupada por (nombre del operario, pieza, origen):
// [{ alias, nombre, item_id, item_nombre, origen: 'moldeo'|'mecanizado', cantidad, nc }]
export async function produccionDeQuincena(inicio, fin) {
  const [{ data: avances, error: e1 }, { data: ordenes, error: e2 }, { data: movs, error: e3 }] = await Promise.all([
    // Moldeo: lo que cada moldeador moldeó por día (avances)
    fetchAllPages((d, h) => supabase.from('ordenes_moldeo_avances')
      .select('fecha, cantidad_moldeada, ordenes_moldeo_piezas(asignado_a, item_id, items(nombre))')
      .gte('fecha', inicio).lte('fecha', fin).range(d, h)),
    // Moldeo: piezas no conformes de las órdenes del periodo (referencia para "pieza dañada")
    fetchAllPages((d, h) => supabase.from('ordenes_moldeo')
      .select('fecha, ordenes_moldeo_piezas(asignado_a, item_id, cantidad_nc, items(nombre))')
      .gte('fecha', inicio).lte('fecha', fin).range(d, h)),
    // Mecanizado: entradas "Mecanizado por: <operario>" (producto mecanizado)
    fetchAllPages((d, h) => supabase.from('movimientos')
      .select('fecha_movimiento, cantidad, item_id, motivo, numero, items(nombre)')
      .eq('tipo', 'entrada').like('motivo', 'Mecanizado por:%')
      .gte('fecha_movimiento', inicio).lt('fecha_movimiento', diaSiguiente(fin)).range(d, h)),
  ])
  const error = e1 || e2 || e3
  const grupos = new Map()
  const sumar = (nombre, item_id, item_nombre, origen, cantidad, nc = 0) => {
    const alias = normalizarAlias(nombre)
    if (!alias || !item_id) return
    const k = `${alias}|${item_id}|${origen}`
    if (!grupos.has(k)) grupos.set(k, { alias, nombre: nombre.trim(), item_id, item_nombre: item_nombre || 'Pieza', origen, cantidad: 0, nc: 0 })
    const g = grupos.get(k)
    g.cantidad += cantidad
    g.nc += nc
  }
  for (const a of avances || []) {
    const p = a.ordenes_moldeo_piezas
    if (p) sumar(p.asignado_a, p.item_id, p.items?.nombre, 'moldeo', num(a.cantidad_moldeada))
  }
  for (const o of ordenes || []) {
    for (const p of o.ordenes_moldeo_piezas || []) {
      if (num(p.cantidad_nc) > 0) sumar(p.asignado_a, p.item_id, p.items?.nombre, 'moldeo', 0, num(p.cantidad_nc))
    }
  }
  for (const m of movs || []) {
    const operario = (m.motivo || '').replace(/^Mecanizado por:\s*/i, '')
    sumar(operario, m.item_id, m.items?.nombre, 'mecanizado', num(m.cantidad))
  }
  return { error, grupos: [...grupos.values()].filter(g => g.cantidad > 0 || g.nc > 0) }
}
