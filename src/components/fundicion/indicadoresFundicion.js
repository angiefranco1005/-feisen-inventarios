// Indicadores de Fundición compartidos por Analítica de Fundición y el Inicio del jefe de
// Fundición (KPIs 2027 de Julián Acuña, 2026-11-20). Un solo cálculo para que las dos
// pantallas nunca den cifras distintas.
//
// Merma de hierro = (hierro colado − kg de piezas buenas − vaceadero) ÷ hierro colado, por orden
// de moldeo completada. El hierro colado y el vaceadero salen de los movimientos que la recogida
// genera con la referencia ORD-MOL-xxxx; los kg buenos = conformes × peso unitario.
// Piezas no conformes (decisión de Angie 2026-11-20): las que se marcan malas en la recogida
// (ordenes_moldeo_piezas.cantidad_nc, motivo en motivo_nc). Las no conformidades del módulo
// Calidad (bodega Fundición) se muestran aparte y NO se suman, para no contarlas dos veces.
import { supabase } from '../../lib/supabase'
import { fetchAllPages } from '../../utils/fetchAllPages'

export const HIERRO_COLADO_ITEM_ID = '52546e1a-dd2b-46c6-8857-9895497f228a'
export const VACEADERO_ITEM_ID     = 'afc4f062-48c1-47cc-92c2-c9e4536bfff5'
export const FUNDICION_BODEGA_ID   = 'a0604489-2768-445b-8e68-e450ef8520ed'

// Motivos de pieza no conforme en la recogida (misma lista que Calidad para Fundición)
export const MOTIVOS_NC_FUNDICION = [
  'Porosidad', 'Rechupes', 'Fisura / grieta', 'Inclusiones', 'Pieza incompleta / mal llenado',
  'Molde roto / desplazado', 'Dimensión incorrecta', 'Acabado superficial deficiente', 'Rotura durante pulida', 'Otro',
]

export const numOrden = n => `ORD-MOL-${String(n).padStart(4, '0')}`

// motivo_nc puede traer además "Faltante x de y: ..." separado por " | " (RecogidaFundida.jsx)
export function motivoDe(motivoNc) {
  const m = String(motivoNc || '').split(' | ').find(t => t && !/^Faltante \d/.test(t))
  return m ? m.trim() : 'Sin motivo'
}

// Merma por orden. ordenes: con ordenes_moldeo_piezas(cantidad_conforme, items(peso_unitario))
export function mermaDeOrdenes(ordenes, movsHierro, movsVaceadero) {
  const hierroMap = {}
  movsHierro.forEach(m => {
    const ref = (m.referencia || '').split('·')[0].trim()
    hierroMap[ref] = (hierroMap[ref] || 0) + Number(m.cantidad)
  })
  const vaceaderoMap = {}
  movsVaceadero.forEach(m => {
    const ref = (m.referencia || '').trim()
    vaceaderoMap[ref] = (vaceaderoMap[ref] || 0) + Number(m.cantidad)
  })
  let totalHierro = 0, totalVaceadero = 0, totalMerma = 0, totalPiezasKg = 0
  const porOrden = ordenes.map(o => {
    const ref      = numOrden(o.numero)
    const kgHierro = hierroMap[ref] || 0
    const kgVac    = vaceaderoMap[ref] || 0
    const kgPiezas = o.ordenes_moldeo_piezas?.reduce((s, p) =>
      s + Number(p.cantidad_conforme || 0) * Number(p.items?.peso_unitario || 0), 0) || 0
    const kgMerma  = Math.max(0, kgHierro - kgPiezas - kgVac)
    const pctMerma = kgHierro > 0 ? (kgMerma / kgHierro) * 100 : 0
    if (kgHierro > 0) { totalHierro += kgHierro; totalVaceadero += kgVac; totalMerma += kgMerma; totalPiezasKg += kgPiezas }
    return { ref, fecha: o.fecha, kgHierro, kgPiezas, kgVaceadero: kgVac, kgMerma, pctMerma }
  }).filter(m => m.kgHierro > 0).sort((a, b) => b.pctMerma - a.pctMerma)
  return {
    porOrden, totalHierro, totalVaceadero, totalMerma, totalPiezasKg,
    pctMerma: totalHierro > 0 ? (totalMerma / totalHierro) * 100 : 0,
  }
}

// Resumen de un conjunto de órdenes + no conformidades de Calidad (para un periodo)
export function resumenFundicion(ordenes, movsHierro, movsVaceadero, ncsCalidad) {
  const merma = mermaDeOrdenes(ordenes, movsHierro, movsVaceadero)
  let conformes = 0, nc = 0
  const motivos = {}
  ordenes.forEach(o => o.ordenes_moldeo_piezas?.forEach(p => {
    conformes += Number(p.cantidad_conforme || 0)
    const n = Number(p.cantidad_nc || 0)
    nc += n
    if (n > 0) { const k = motivoDe(p.motivo_nc); motivos[k] = (motivos[k] || 0) + n }
  }))
  const calidad = {}
  let ncCalidad = 0
  ncsCalidad.forEach(r => {
    const n = Number(r.cantidad_afectada || 0)
    ncCalidad += n
    const k = r.tipo_defecto || 'Sin tipo'
    calidad[k] = (calidad[k] || 0) + n
  })
  const ordenar = obj => Object.entries(obj).map(([motivo, piezas]) => ({ motivo, piezas })).sort((a, b) => b.piezas - a.piezas)
  return {
    merma, ordenes: ordenes.length, conformes, nc,
    pctNC: conformes + nc > 0 ? (nc / (conformes + nc)) * 100 : 0,
    motivos: ordenar(motivos),
    ncCalidad, registrosCalidad: ncsCalidad.length, calidad: ordenar(calidad),
  }
}

// Carga lo necesario desde una fecha (YYYY-MM-DD) hasta hoy
export async function cargarDatosFundicion(desde) {
  const [ords, movs, ncs] = await Promise.all([
    fetchAllPages((d, h) => supabase.from('ordenes_moldeo')
      .select('id, numero, fecha, ordenes_moldeo_piezas(cantidad_conforme, cantidad_nc, motivo_nc, items(peso_unitario))')
      .in('estado', ['completado', 'completada']).gte('fecha', desde)
      .order('fecha').order('id').range(d, h)),
    fetchAllPages((d, h) => supabase.from('movimientos')
      .select('referencia, item_id, tipo, cantidad')
      .in('item_id', [HIERRO_COLADO_ITEM_ID, VACEADERO_ITEM_ID]).eq('revertido', false)
      .like('referencia', 'ORD-MOL-%')
      .order('id').range(d, h)),
    fetchAllPages((d, h) => supabase.from('no_conformidades')
      .select('fecha_deteccion, cantidad_afectada, tipo_defecto')
      .eq('bodega_id', FUNDICION_BODEGA_ID).gte('fecha_deteccion', desde)
      .order('id').range(d, h)),
  ])
  const error = ords.error || movs.error || ncs.error
  if (error) throw error
  const m = movs.data || []
  return {
    ordenes: ords.data || [],
    movsHierro: m.filter(x => x.item_id === HIERRO_COLADO_ITEM_ID && x.tipo === 'salida'),
    movsVaceadero: m.filter(x => x.item_id === VACEADERO_ITEM_ID && x.tipo === 'entrada'),
    ncsCalidad: ncs.data || [],
  }
}
