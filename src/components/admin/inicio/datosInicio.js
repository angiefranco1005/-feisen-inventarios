import { supabase } from '../../../lib/supabase'
import { fetchAllPages } from '../../../utils/fetchAllPages'
import { BODEGA_FUNDICION_ID } from '../../../utils/bodegasCatalogo'
import { crearIdentificador } from './operarios'
import { habilesEntre, hoyColombia } from '../../../utils/diasHabiles'

// Datos del Inicio de gerencia (solo ADMIN). Dos cargas:
//  · cargarFoto(): lo que es "a hoy" (stock, valor, pareto, rotación, pedidos, personas, calidad)
//  · cargarPeriodo(desde, hasta): lo que depende del periodo elegido
//    (mecanizado por persona, producido y no conforme de Fundición, ausencias)
// Todo se calcula en el navegador con consultas paginadas (ver fetchAllPages).

const DIA = 86400000
export const hoy0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const isoDia = d => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const diasDesde = (fecha, ref = hoy0()) => Math.floor((ref - new Date(fecha)) / DIA)

// ── Periodos ────────────────────────────────────────────────────────────
// Claves: '7d' | '15d' | '30d' | 'm:2026-10' | 'a:2026'
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function rangoPeriodo(clave) {
  const h = hoy0(), fin = new Date(h.getTime() + DIA - 1)
  const fmt = d => `${d.getDate()} de ${MESES[d.getMonth()]}`
  if (clave.endsWith('d')) {
    const n = parseInt(clave, 10), desde = new Date(h.getTime() - (n - 1) * DIA)
    return { desde, hasta: fin, texto: `Del ${fmt(desde)} al ${fmt(h)}` }
  }
  if (clave.startsWith('m:')) {
    const [y, m] = clave.slice(2).split('-').map(Number)
    const desde = new Date(y, m - 1, 1), hasta = new Date(new Date(y, m, 1).getTime() - 1)
    const enCurso = h >= desde && h <= hasta
    return { desde, hasta, texto: `${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} de ${y}${enCurso ? ' (en curso)' : ''}` }
  }
  const y = Number(clave.slice(2))
  return { desde: new Date(y, 0, 1), hasta: new Date(new Date(y + 1, 0, 1).getTime() - 1), texto: `Año ${y}` }
}
export function opcionesMeses(primerFecha) {
  const out = [], h = hoy0()
  let d = new Date(primerFecha || h); d = new Date(d.getFullYear(), d.getMonth(), 1)
  while (d <= h) { out.unshift({ clave: `m:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, texto: `${MESES[d.getMonth()][0].toUpperCase() + MESES[d.getMonth()].slice(1)} ${d.getFullYear()}` }); d = new Date(d.getFullYear(), d.getMonth() + 1, 1) }
  return out
}

// ── Foto de hoy ─────────────────────────────────────────────────────────
// soloOperacion (Inicio de Logística): solo inventarios y pedidos; no trae nómina, personal,
// calidad ni fundición (no los ve y no le corresponden).
// soloRRHH (Inicio de Recursos Humanos, 2026-11-20): al revés, solo personal, nómina y desempeño.
export async function cargarFoto({ soloOperacion = false, soloRRHH = false } = {}) {
  const hoyIsoQ = isoDia(hoy0())
  const vacio = Promise.resolve({ data: [], count: 0 })
  const si = q => soloOperacion ? vacio : q()
  const op = q => soloRRHH ? vacio : q()        // inventario, pedidos, calidad y fundición
  const [items, stock, movs, bods, pedidos, empleados, ncs, nomina, fundidas30, moldeoNc, fundSemanas, ausHoy, ciclos, evaluaciones] = await Promise.all([
    op(() => fetchAllPages((d, h) => supabase.from('items').select('id, nombre, activo, stock_minimo, bodega_id').order('id').range(d, h))),
    op(() => fetchAllPages((d, h) => supabase.from('stock').select('item_id, bodega_id, cantidad_actual, items(nombre, precio_costo, activo, unidad_medida, categorias(nombre))').order('item_id').order('bodega_id').range(d, h))),
    // Para rotación: último movimiento de cada producto en cada bodega
    op(() => fetchAllPages((d, h) => supabase.from('movimientos').select('item_id, bodega_origen_id, bodega_destino_id, created_at').eq('revertido', false).order('id').range(d, h))),
    op(() => supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre')),
    op(() => fetchAllPages((d, h) => supabase.from('pedidos').select('numero, estado, area, solicitante_id, prioridad, created_at, fecha_recibido, fecha_estimada_llegada').order('id').range(d, h))),
    si(() => supabase.from('empleados').select('id, nombres, apellidos, area, estado, fecha_ingreso, fecha_fin_contrato, fecha_retiro, motivo_retiro_tipo')),
    si(() => op(() => supabase.from('no_conformidades').select('estado, bodega_nombre, cantidad_afectada, tipo_defecto, fecha_deteccion'))),
    si(() => supabase.from('nomina_periodos').select('id, anio, mes, quincena, estado').order('anio', { ascending: false }).order('mes', { ascending: false }).order('quincena', { ascending: false }).limit(1)),
    si(() => op(() => supabase.from('fundidas').select('id', { count: 'exact', head: true }).gte('fecha', isoDia(new Date(Date.now() - 30 * DIA))))),
    si(() => op(() => supabase.from('ordenes_moldeo_piezas').select('cantidad_nc, ordenes_moldeo(numero, fecha)').gt('cantidad_nc', 0))),
    soloOperacion || soloRRHH ? Promise.resolve([]) : entradasFundicion(new Date(hoy0().getTime() - 55 * DIA), new Date()),
    si(() => supabase.from('novedades').select('empleado_id').lte('fecha_inicio', hoyIsoQ).or(`fecha_fin.gte.${hoyIsoQ},and(fecha_fin.is.null,fecha_inicio.eq.${hoyIsoQ})`)),
    // Evaluación de desempeño: el ciclo más reciente y sus evaluaciones
    si(() => supabase.from('desempeno_ciclos').select('id, nombre, estado, fecha_inicio, fecha_fin').order('fecha_inicio', { ascending: false }).limit(1)),
    si(() => supabase.from('desempeno_evaluaciones').select('ciclo_id, empleado_id, estado, evaluador, area')),
  ])

  const nombreBod = Object.fromEntries((bods.data || []).map(b => [b.id, b.nombre]))

  // Último movimiento por producto+bodega (cualquiera), y por separado la última
  // entrada (llegó a la bodega: destino) y la última salida (salió de ella: origen)
  const ultimo = {}, ultEntrada = {}, ultSalida = {}
  const marcar = (mapa, k, f) => { if (!mapa[k] || f > mapa[k]) mapa[k] = f }
  let primerMov = null
  for (const m of movs.data || []) {
    if (!primerMov || m.created_at < primerMov) primerMov = m.created_at
    if (m.bodega_destino_id) { const k = `${m.item_id}|${m.bodega_destino_id}`; marcar(ultimo, k, m.created_at); marcar(ultEntrada, k, m.created_at) }
    if (m.bodega_origen_id)  { const k = `${m.item_id}|${m.bodega_origen_id}`;  marcar(ultimo, k, m.created_at); marcar(ultSalida, k, m.created_at) }
  }

  // Existencias por producto (todas las bodegas) para agotados / bajo mínimo / sin mínimo
  const existencia = {}
  for (const s of stock.data || []) existencia[s.item_id] = (existencia[s.item_id] || 0) + (Number(s.cantidad_actual) || 0)
  const activos = (items.data || []).filter(i => i.activo)
  const inv = { activos: activos.length, agotados: 0, bajo: 0, sinMinimo: 0 }
  for (const i of activos) {
    const q = existencia[i.id] || 0
    if (q <= 0) inv.agotados++
    else if (i.stock_minimo > 0 && q <= i.stock_minimo) inv.bajo++
    if (!(i.stock_minimo > 0)) inv.sinMinimo++
  }

  // Valor, pareto y rotación por bodega (filas de stock con existencia de productos activos)
  const porBodega = {}
  for (const s of stock.data || []) {
    const q = Number(s.cantidad_actual) || 0
    if (!s.items?.activo || q <= 0) continue
    const b = porBodega[s.bodega_id] ||= { id: s.bodega_id, nombre: nombreBod[s.bodega_id] || '—', valor: 0, filas: [] }
    const valor = q * (Number(s.items.precio_costo) || 0)
    const k = `${s.item_id}|${s.bodega_id}`, ult = ultimo[k]
    const dias = ult ? diasDesde(ult) : null // null = nunca se ha movido
    b.valor += valor
    b.filas.push({
      item_id: s.item_id, nombre: s.items.nombre, unidad: s.items.unidad_medida, q, valor, dias,
      costo: Number(s.items.precio_costo) || 0, categoria: s.items.categorias?.nombre || 'Sin categoría',
      ultEntrada: ultEntrada[k] || null, ultSalida: ultSalida[k] || null,
    })
  }
  const bodegas = Object.values(porBodega).map(b => {
    const conValor = b.filas.filter(f => f.valor > 0).sort((x, y) => y.valor - x.valor)
    let acum = 0, n80 = 0
    const pareto = conValor.map(f => { const antes = acum; acum += f.valor; if (antes < b.valor * 0.8) n80++; return { ...f, acum: acum / b.valor, clase: antes < b.valor * 0.8 ? 'A' : (antes < b.valor * 0.95 ? 'B' : 'C') } })
    const rot = { r30: 0, r60: 0, r90: 0, nunca: 0 }
    const quietos = []
    for (const f of b.filas) {
      const k = f.dias === null ? 'nunca' : f.dias <= 30 ? 'r30' : f.dias <= 60 ? 'r60' : 'r90'
      rot[k] += f.valor
      if (k !== 'r30') quietos.push(f)
    }
    quietos.sort((x, y) => y.valor - x.valor || y.q - x.q)
    return { ...b, pareto, nConValor: conValor.length, n80, rot, quietos }
  }).filter(b => b.filas.length > 0).sort((x, y) => y.valor - x.valor)
  inv.valorTotal = bodegas.reduce((t, b) => t + b.valor, 0)
  inv.nuncaMovidos = bodegas.reduce((t, b) => t + b.quietos.filter(f => f.dias === null).length, 0)
  inv.valorNuncaMovidos = bodegas.reduce((t, b) => t + b.quietos.filter(f => f.dias === null).reduce((u, f) => u + f.valor, 0), 0)

  // Logística
  const h = hoy0(), hoyIso = isoDia(h)
  completarArea(pedidos.data || [])
  const enCurso = (pedidos.data || []).filter(p => ['pendiente', 'en_transito', 'parcialmente_recibido'].includes(p.estado))
  // Atraso en días hábiles (sin fines de semana ni festivos), igual que en Pedidos
  const atrasados = enCurso.filter(p => p.estado === 'en_transito' && p.fecha_estimada_llegada && habilesEntre(p.fecha_estimada_llegada, hoyColombia()) > 0)
    .sort((a, b) => a.fecha_estimada_llegada.localeCompare(b.fecha_estimada_llegada))
  // Lead time (2026-11-20, Angie): misma regla que la gráfica mensual — pedidos que LLEGARON en el
  // mes en curso y los 2 anteriores, de pedido a recibido. Antes eran los pedidos HECHOS en los últimos
  // 60 días que ya habían llegado, lo que dejaba fuera los lentos aún en camino y daba de menos.
  const ult3 = (() => { const d = new Date(hoyIso + 'T12:00:00'); return [0, 1, 2].map(i => isoDia(new Date(d.getFullYear(), d.getMonth() - i, 15))).map(f => f.slice(0, 7)) })()
  const recibidos3m = (pedidos.data || []).filter(p => p.fecha_recibido && ult3.includes(mesDe(p.fecha_recibido)))
  const porArea = {}
  enCurso.forEach(p => { const a = p.area || 'Sin área'; porArea[a] = (porArea[a] || 0) + 1 })
  const logistica = {
    enCurso: enCurso.length,
    pendientes: enCurso.filter(p => p.estado === 'pendiente').length,
    transito: enCurso.filter(p => p.estado === 'en_transito').length,
    parcial: enCurso.filter(p => p.estado === 'parcialmente_recibido').length,
    atrasados: atrasados.length,
    peorAtraso: atrasados[0] ? { numero: atrasados[0].numero, dias: habilesEntre(atrasados[0].fecha_estimada_llegada, hoyColombia()) } : null,
    leadTime: recibidos3m.length ? recibidos3m.reduce((t, p) => t + (new Date(p.fecha_recibido) - new Date(p.created_at)) / DIA, 0) / recibidos3m.length : null,
    leadTimeN: recibidos3m.length,
    porArea: Object.entries(porArea).sort((a, b) => b[1] - a[1]),
    mensual: indicadoresMensuales(pedidos.data || []),
    porBodega: indicadoresPorBodega(pedidos.data || []),
  }

  // Personas
  const emps = (empleados.data || []).filter(e => e.estado === 'activo')
  const en30 = isoDia(new Date(h.getTime() + 30 * DIA))
  const rrhh = {
    activos: emps.length,
    enPrueba: emps.filter(e => e.fecha_ingreso && diasDesde(e.fecha_ingreso + 'T00:00:00') < 60).length,
    contratosVencen: emps.filter(e => e.fecha_fin_contrato && e.fecha_fin_contrato >= hoyIso && e.fecha_fin_contrato <= en30).length,
    nomina: nomina.data?.[0] || null,
    ausentesHoy: new Set((ausHoy.data || []).map(n => n.empleado_id)).size,
    evaluaciones: avanceEvaluaciones(ciclos.data?.[0], evaluaciones.data || [], empleados.data || []),
  }

  // Calidad
  const abiertas = (ncs.data || []).filter(n => !['cerrado', 'cerrada'].includes(n.estado))
  const contar = (arr, f) => { const c = {}; arr.forEach(x => { const k = f(x); if (k) c[k] = (c[k] || 0) + 1 }); return Object.entries(c).sort((a, b) => b[1] - a[1]) }
  const calidad = {
    abiertas: abiertas.length,
    unidades: abiertas.reduce((t, n) => t + (Number(n.cantidad_afectada) || 0), 0),
    defecto: contar(ncs.data || [], n => n.tipo_defecto)[0]?.[0] || null,
    area: contar(abiertas, n => n.bodega_nombre)[0]?.[0] || null,
    primeraAbierta: abiertas[0] || null,
  }

  // Fundición (foto): fundidas recientes, NC de moldeo y kilos de las últimas 8 semanas
  const semanas = Array.from({ length: 8 }, (_, i) => ({ desde: new Date(h.getTime() - (55 - i * 7) * DIA), kg: 0 }))
  for (const e of fundSemanas) {
    const idx = Math.min(7, Math.floor((new Date(e.created_at) - semanas[0].desde) / (7 * DIA)))
    if (idx >= 0) semanas[idx].kg += e.kg
  }
  const fundicion = {
    fundidas30: fundidas30.count || 0,
    semanas: semanas.map(s => Math.round(s.kg)),
    moldeoNc: (moldeoNc.data || []).map(p => ({ und: Number(p.cantidad_nc) || 0, fecha: p.ordenes_moldeo?.fecha, numero: p.ordenes_moldeo?.numero })),
  }

  return {
    inv, bodegas, logistica, rrhh, calidad, fundicion,
    ncs: ncs.data || [],
    empleados: (empleados.data || []).sort((a, b) => (/mecaniz/i.test(b.area) ? 1 : 0) - (/mecaniz/i.test(a.area) ? 1 : 0)),
    // En el inicio de RRHH no se cargan movimientos: los meses del selector arrancan el año pasado
    primerMov: soloRRHH ? new Date(hoy0().getFullYear() - 1, 0, 1).toISOString() : primerMov,
  }
}

async function entradasFundicion(desde, hasta) {
  // Lo producido = entradas a Fundición que no vienen de otra bodega (kilos con el peso unitario)
  const { data } = await fetchAllPages((d, h) => supabase.from('movimientos')
    .select('cantidad, created_at, items(peso_unitario)')
    .eq('bodega_destino_id', BODEGA_FUNDICION_ID).eq('tipo', 'entrada').is('bodega_origen_id', null).eq('revertido', false)
    .gte('created_at', desde.toISOString()).lte('created_at', hasta.toISOString())
    .order('id').range(d, h))
  return (data || []).map(m => ({ created_at: m.created_at, und: Number(m.cantidad) || 0, kg: (Number(m.cantidad) || 0) * (Number(m.items?.peso_unitario) || 0) }))
}

// ── Lo que depende del periodo ──────────────────────────────────────────
export async function cargarPeriodo(desde, hasta, foto, { soloRRHH = false } = {}) {
  const [mec, fund, novedades] = await Promise.all([
    soloRRHH ? { data: [] } : fetchAllPages((d, h) => supabase.from('movimientos').select('cantidad, motivo')
      .like('numero', 'MEC%').eq('tipo', 'entrada').eq('revertido', false)
      .gte('created_at', desde.toISOString()).lte('created_at', hasta.toISOString())
      .order('id').range(d, h)),
    soloRRHH ? [] : entradasFundicion(desde, hasta),
    supabase.from('novedades').select('tipo, empleado_id, fecha_inicio, fecha_fin, dias')
      .lte('fecha_inicio', isoDia(hasta)).or(`fecha_fin.gte.${isoDia(desde)},and(fecha_fin.is.null,fecha_inicio.gte.${isoDia(desde)})`),
  ])

  // Mecanizado: piezas por persona (las de pareja cuentan para cada uno)
  const personasDe = crearIdentificador(foto.empleados)
  const porPersona = {}
  let piezas = 0
  for (const m of mec.data || []) {
    const q = Number(m.cantidad) || 0
    piezas += q
    const ps = personasDe(m.motivo || '')
    if (ps.length === 0) ps.push({ clave: 'sin', nombre: 'Sin operario' })
    ps.forEach(p => { (porPersona[p.clave] ||= { nombre: p.nombre, und: 0 }).und += q })
  }

  // Fundición: producido y no conforme en el periodo
  const enRango = f => f && new Date(f + 'T12:00:00') >= desde && new Date(f + 'T12:00:00') <= hasta
  const ncFund = foto.ncs.filter(n => /fundici/i.test(n.bodega_nombre || '') && enRango(n.fecha_deteccion))
    .reduce((t, n) => t + (Number(n.cantidad_afectada) || 0), 0)
  const ncMoldeo = foto.fundicion.moldeoNc.filter(p => enRango(p.fecha)).reduce((t, p) => t + p.und, 0)

  // Ausencias: días por tipo y por área (de la ficha) de las novedades que tocan el periodo
  const areaDe = Object.fromEntries((foto.empleados || []).map(e => [e.id, e.area || 'Sin área']))
  const nombreDe = Object.fromEntries((foto.empleados || []).map(e => [e.id, `${e.nombres} ${e.apellidos}`]))
  const porTipo = {}, porArea = {}, ausPersona = {}
  for (const n of novedades.data || []) {
    const d = Number(n.dias) || 0
    porTipo[n.tipo] = (porTipo[n.tipo] || 0) + d
    const a = areaDe[n.empleado_id] || 'Sin área'
    const g = (porArea[a] ||= { dias: 0, personas: new Set() })
    g.dias += d; g.personas.add(n.empleado_id)
    const p = (ausPersona[n.empleado_id] ||= { nombre: nombreDe[n.empleado_id] || '—', area: areaDe[n.empleado_id] || 'Sin área', novedades: 0, dias: 0 })
    p.novedades++; p.dias += d
  }

  return {
    mecanizado: { piezas, personas: Object.values(porPersona).sort((a, b) => b.und - a.und) },
    fundicion: {
      kg: fund.reduce((t, e) => t + e.kg, 0), und: fund.reduce((t, e) => t + e.und, 0),
      nc: ncFund + ncMoldeo, ncDetalle: { ncFund, ncMoldeo },
    },
    ausencias: {
      porTipo: Object.entries(porTipo).sort((a, b) => b[1] - a[1]),
      porArea: Object.entries(porArea).map(([a, g]) => [a, g.dias, g.personas.size]).sort((a, b) => b[1] - a[1]),
      // Top 3 de personas con más novedades (desempate: más días)
      top: Object.values(ausPersona).sort((a, b) => b.novedades - a.novedades || b.dias - a.dias).slice(0, 3),
      registros: (novedades.data || []).length,
    },
  }
}

// ── Logística por mes (pedido de Angie, 2026-11-20) ─────────────────────
// · Urgentes y retrasos: por el mes en que se HIZO el pedido (todos, incluso cerrados para % urgentes).
// · Retraso: se evalúan los pedidos con fecha estimada que ya llegaron o que ya pasaron su fecha
//   sin llegar (los cerrados sin recibir y los que aún están a tiempo no cuentan). Días hábiles,
//   igual que en Pedidos, contra la fecha estimada vigente.
// · Lead time: días calendario de pedido a recibido, por el mes en que se RECIBIÓ.
// Pedidos viejos (ago–sep 2026) quedaron sin área: se toma la del solicitante si todos sus
// demás pedidos son de una sola área. Si no (p. ej. la gerente), quedan "Sin área".
function completarArea(pedidos) {
  const areasDe = {}
  for (const p of pedidos) if (p.area && p.solicitante_id) (areasDe[p.solicitante_id] ||= new Set()).add(p.area)
  for (const p of pedidos) {
    if (p.area) continue
    const a = areasDe[p.solicitante_id]
    p.area = a && a.size === 1 ? [...a][0] : null
  }
}

function acumular(pedidos, claveHecho, claveRecibido) {
  const hoy = hoyColombia()
  const grupos = {}
  const g = k => (grupos[k] ||= { clave: k, total: 0, urgentes: 0, evaluables: 0, tarde: 0, tardeAbiertos: 0, diasTarde: [], recibidos: 0, sumaLead: 0 })
  for (const p of pedidos) {
    if (!p.created_at) continue
    const r = g(claveHecho(p))
    r.total++
    if (p.prioridad === 'urgente') r.urgentes++
    if (p.estado !== 'cerrado' && p.fecha_estimada_llegada) {
      const llego = p.fecha_recibido ? isoDia(new Date(p.fecha_recibido)) : null
      if (llego || p.fecha_estimada_llegada < hoy) {
        r.evaluables++
        const dias = habilesEntre(p.fecha_estimada_llegada, llego || hoy)
        if (dias > 0) { r.tarde++; r.diasTarde.push(dias); if (!llego) r.tardeAbiertos++ }
      }
    }
    if (p.fecha_recibido) {
      const rr = g(claveRecibido(p))
      rr.recibidos++
      rr.sumaLead += Math.max(0, (new Date(p.fecha_recibido) - new Date(p.created_at)) / DIA)
    }
  }
  return Object.values(grupos).map(r => ({
    clave: r.clave, total: r.total, urgentes: r.urgentes,
    pctUrgentes: r.total ? r.urgentes / r.total : null,
    evaluables: r.evaluables, tarde: r.tarde, tardeAbiertos: r.tardeAbiertos,
    pctTarde: r.evaluables ? r.tarde / r.evaluables : null,
    diasProm: r.diasTarde.length ? r.diasTarde.reduce((t, d) => t + d, 0) / r.diasTarde.length : null,
    diasMax: r.diasTarde.length ? Math.max(...r.diasTarde) : null,
    recibidos: r.recibidos, lead: r.recibidos ? r.sumaLead / r.recibidos : null,
  }))
}

const mesDe = f => isoDia(new Date(f)).slice(0, 7)
export function indicadoresMensuales(pedidos, maxMeses = 12) {
  return acumular(pedidos, p => mesDe(p.created_at), p => mesDe(p.fecha_recibido))
    .map(r => ({ ...r, mes: r.clave }))
    .sort((a, b) => a.mes.localeCompare(b.mes)).slice(-maxMeses)
}

// Por bodega (área que pidió): la serie mensual de cada una y su resumen de todo el historial
export function indicadoresPorBodega(pedidos) {
  const area = p => p.area || 'Sin área'
  const resumen = acumular(pedidos, area, area).sort((a, b) => b.total - a.total)
  return resumen.map(r => ({ ...r, area: r.clave, mensual: indicadoresMensuales(pedidos.filter(p => area(p) === r.clave)) }))
}

// ── RRHH: rotación, retiros y evaluaciones (pedido de Angie, 2026-11-20) ──
// Plantilla en una fecha = ingresó ese día o antes y no se ha retirado (o se retiró después).
const enPlantilla = (e, iso) => e.fecha_ingreso && e.fecha_ingreso <= iso && (!e.fecha_retiro || e.fecha_retiro > iso)

// Rotación del periodo = retiros ÷ plantilla promedio (inicio y fin del periodo) × 100
export function rotacionPeriodo(empleados, desde, hasta) {
  const ini = isoDia(desde), fin = isoDia(hasta) > isoDia(hoy0()) ? isoDia(hoy0()) : isoDia(hasta)
  const retiros = empleados.filter(e => e.fecha_retiro && e.fecha_retiro >= ini && e.fecha_retiro <= fin)
  const ingresos = empleados.filter(e => e.fecha_ingreso && e.fecha_ingreso >= ini && e.fecha_ingreso <= fin)
  const promedio = (empleados.filter(e => enPlantilla(e, ini)).length + empleados.filter(e => enPlantilla(e, fin)).length) / 2
  return { retiros: retiros.length, ingresos: ingresos.length, promedio, pct: promedio ? retiros.length / promedio : null }
}

// Por qué se va la gente: retiros de los últimos 12 meses por motivo
export function retirosPorMotivo(empleados) {
  const desde = isoDia(new Date(hoy0().getTime() - 365 * DIA))
  const lista = empleados.filter(e => e.fecha_retiro && e.fecha_retiro >= desde)
  const c = {}
  for (const e of lista) { const k = e.motivo_retiro_tipo || ''; c[k] = (c[k] || 0) + 1 }
  return { total: lista.length, porMotivo: Object.entries(c).sort((a, b) => b[1] - a[1]) }
}

// Avance del ciclo de evaluación más reciente: % realizadas, por evaluador y quién falta
function avanceEvaluaciones(ciclo, evaluaciones, empleados) {
  if (!ciclo) return null
  const evs = evaluaciones.filter(e => e.ciclo_id === ciclo.id)
  const nombre = id => { const e = empleados.find(x => x.id === id); return e ? `${e.nombres} ${e.apellidos}` : '—' }
  const porEval = {}
  for (const e of evs) {
    const k = e.evaluador || 'Sin evaluador'
    const g = (porEval[k] ||= { evaluador: k, total: 0, completas: 0 })
    g.total++; if (e.estado === 'completa') g.completas++
  }
  const completas = evs.filter(e => e.estado === 'completa').length
  return {
    ciclo, total: evs.length, completas, pct: evs.length ? completas / evs.length : null,
    porEvaluador: Object.values(porEval).sort((a, b) => (a.completas / a.total) - (b.completas / b.total) || b.total - a.total),
    pendientes: evs.filter(e => e.estado !== 'completa').map(e => nombre(e.empleado_id)).sort(),
  }
}
