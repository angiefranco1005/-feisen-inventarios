import { fetchAllPages } from './fetchAllPages'
import { esBodegaMotores } from '../components/shared/seriales'

// Conteo cíclico: cada semana se sugiere, por bodega, un grupo de productos para contar,
// de forma que todo el inventario se cuente cada 3 meses (MOTORES cada mes, por su valor).
// - Primero salen los que no se han contado dentro del ciclo; entre ellos se sortea, con
//   más probabilidad para los que tuvieron más movimiento en los últimos 90 días.
// - El sorteo usa la semana como semilla y solo datos de ANTES del lunes, así la lista es
//   la misma toda la semana, para todos, aunque se vayan confirmando conteos.
// - El título del conteo ("Conteo cíclico · BODEGA · semana AAAA-MM-DD") lo amarra a la
//   selección: al retomar el borrador se vuelve a mostrar solo esa lista.

export const SEMANAS_CICLO = 13 // ≈ 3 meses
const SEMANAS_CICLO_MOTORES = 4

export const tituloCiclico = (bodegaNombre, semana) => `Conteo cíclico · ${bodegaNombre} · semana ${semana}`
export function leerTituloCiclico(titulo) {
  const m = /^Conteo cíclico · (.+) · semana (\d{4}-\d{2}-\d{2})$/.exec(titulo || '')
  return m ? { bodega: m[1], semana: m[2] } : null
}

// Lunes (AAAA-MM-DD) de la semana de una fecha AAAA-MM-DD
export function lunesDe(fecha) {
  const d = new Date(`${fecha}T12:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toLocaleDateString('en-CA')
}
const sumarDias = (fecha, n) => { const d = new Date(`${fecha}T12:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

// Número pseudoaleatorio estable en (0, 1) a partir de un texto (FNV-1a)
function azar(texto) {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return ((h >>> 0) + 0.5) / 4294967296
}

export async function cargarConteoCiclico(supabase, semana) {
  const desde90 = sumarDias(semana, -90)
  const [{ data: bodegas }, { data: items, error: e1 }, { data: contados, error: e2 }, { data: movs, error: e3 }] = await Promise.all([
    supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
    fetchAllPages((d, h) => supabase.from('items').select('id, nombre, unidad_medida, bodega_id, categorias(nombre)')
      .eq('activo', true).order('id').range(d, h)),
    fetchAllPages((d, h) => supabase.from('inventario_fisico_items')
      .select('item_id, bodega_id, cantidad_fisica, inventarios_fisicos!inner(fecha, estado)')
      .not('cantidad_fisica', 'is', null).gte('inventarios_fisicos.fecha', sumarDias(semana, -400))
      .order('id').range(d, h)),
    fetchAllPages((d, h) => supabase.from('movimientos').select('item_id')
      .gte('created_at', `${desde90}T00:00:00`).lt('created_at', `${semana}T00:00:00`)
      .order('id').range(d, h)),
  ])
  const error = e1 || e2 || e3
  if (error) return { error }
  return { datos: calcularConteoCiclico({ semana, bodegas: bodegas || [], items: items || [], contados: contados || [], movs: movs || [] }) }
}

export function calcularConteoCiclico({ semana, bodegas, items, contados, movs }) {
  const hoy = new Date().toLocaleDateString('en-CA')
  const movPorItem = {}
  for (const m of movs) movPorItem[m.item_id] = (movPorItem[m.item_id] || 0) + 1

  // Último conteo confirmado ANTES de la semana, y lo contado (en cualquier conteo) en la semana
  const ultimo = {}
  const enSemana = new Set()
  for (const c of contados) {
    const k = `${c.item_id}_${c.bodega_id}`
    const f = c.inventarios_fisicos?.fecha
    if (!f) continue
    if (f >= semana) enSemana.add(k)
    else if (c.inventarios_fisicos.estado === 'confirmado' && (!ultimo[k] || f > ultimo[k])) ultimo[k] = f
  }
  const hace90 = sumarDias(hoy, -90)
  const contados90 = new Set(contados
    .filter(c => c.inventarios_fisicos?.estado === 'confirmado' && c.inventarios_fisicos.fecha >= hace90)
    .map(c => `${c.item_id}_${c.bodega_id}`))

  const porBodega = []
  let totalItems = 0, totalCubiertos = 0
  for (const b of bodegas) {
    const lista = items.filter(i => i.bodega_id === b.id)
    if (!lista.length) continue
    const motores = esBodegaMotores(b.nombre)
    const semanas = motores ? SEMANAS_CICLO_MOTORES : SEMANAS_CICLO
    const limite = sumarDias(semana, -7 * semanas)
    const n = Math.min(lista.length, Math.ceil(lista.length / semanas))
    const conClave = lista.map(i => {
      const k = `${i.id}_${b.id}`
      const peso = 1 + Math.log(1 + (movPorItem[i.id] || 0))
      return {
        ...i, key: k,
        pendiente: !ultimo[k] || ultimo[k] < limite,
        ultimo: ultimo[k] || null,
        movs: movPorItem[i.id] || 0,
        orden: -Math.log(azar(`${semana}|${i.id}`)) / peso, // sorteo ponderado sin reemplazo
      }
    })
    conClave.sort((a, b) => (b.pendiente - a.pendiente) || (a.orden - b.orden))
    const elegidos = conClave.slice(0, n)
      .sort((a, b) => (a.categorias?.nombre || '~').trim().localeCompare((b.categorias?.nombre || '~').trim()) || a.nombre.localeCompare(b.nombre))
    porBodega.push({
      bodega_id: b.id, bodega: b.nombre, total: lista.length, cadaMes: motores, elegidos,
      hechos: elegidos.filter(e => enSemana.has(e.key)).length,
    })
    totalItems += lista.length
    totalCubiertos += lista.filter(i => contados90.has(`${i.id}_${b.id}`)).length
  }
  return { semana, porBodega, totalItems, totalCubiertos }
}

// Por qué salió un producto (solo para el administrador)
export function razonCiclico(e) {
  if (!e.ultimo) return 'nunca contado'
  const dias = Math.round((Date.now() - new Date(`${e.ultimo}T12:00:00`)) / 86400000)
  const t = dias >= 60 ? `hace ${Math.round(dias / 30)} meses` : `hace ${dias} días`
  return e.movs >= 10 ? `${t} · mucho movimiento` : t
}
