// Lógica compartida del módulo Producción y Ensamble (ver OBSERVACIONES.md).
// Un avance diario de N máquinas genera, como el resto de la app, movimientos
// genéricos que el trigger fn_actualizar_stock ya entiende:
//   - 'salida'  de cada componente (N × cantidad de la receta) desde SU bodega
//   - 'entrada' de las N máquinas en la bodega del renglón de la máquina
import { supabase } from '../../lib/supabase'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { siguienteNumero } from '../../utils/siguienteNumero'
import { BODEGA_ENSAMBLE_ID, nombreBodega } from '../../utils/bodegasCatalogo'

export const HOY_COL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

// 'YYYY-MM-DD' → 'DD/MM/YYYY' sin pasar por Date (formatFecha lo correría un día por zona horaria)
export function fechaCorta(iso) {
  if (!iso) return '—'
  const [a, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export const num = (v) => Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })

// Todos los productos activos con su bodega (para elegir máquina y componentes)
export async function cargarCatalogo() {
  const [{ data: items, error }, { data: bodegas }] = await Promise.all([
    fetchAllPages((d, h) =>
      supabase.from('items')
        .select('id, nombre, bodega_id, unidad_medida, precio_costo')
        .eq('activo', true).order('nombre').order('id').range(d, h)
    ),
    supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
  ])
  if (error) throw error
  const nomBodega = Object.fromEntries((bodegas || []).map(b => [b.id, b.nombre]))
  return {
    items: (items || []).map(i => ({ ...i, bodega_nombre: nomBodega[i.bodega_id] || '' })),
    bodegas: bodegas || [],
  }
}

// Recetas con sus componentes, resueltos contra el catálogo ya cargado
// (no se depende de embeds anidados de PostgREST — ver gotcha de paquetes).
export async function cargarRecetas(itemsPorId) {
  const [{ data: recetas, error: e1 }, { data: filas, error: e2 }] = await Promise.all([
    supabase.from('recetas_ensamble').select('id, item_id, notas, activo').order('created_at'),
    fetchAllPages((d, h) =>
      supabase.from('receta_ensamble_items').select('id, receta_id, item_id, cantidad').order('id').range(d, h)
    ),
  ])
  if (e1 || e2) throw (e1 || e2)
  const porReceta = {}
  for (const f of filas || []) {
    (porReceta[f.receta_id] ||= []).push({ ...f, cantidad: Number(f.cantidad), item: itemsPorId[f.item_id] || null })
  }
  return (recetas || [])
    .map(r => ({
      ...r,
      item: itemsPorId[r.item_id] || null,
      componentes: (porReceta[r.id] || []).sort((a, b) => (a.item?.nombre || '').localeCompare(b.item?.nombre || '', 'es')),
    }))
    .sort((a, b) => (a.item?.nombre || '').localeCompare(b.item?.nombre || '', 'es'))
}

// Stock actual de cada componente en su bodega → { item_id: cantidad }
export async function stockComponentes(componentes) {
  const ids = componentes.map(c => c.item_id)
  if (ids.length === 0) return {}
  const { data, error } = await supabase.from('stock')
    .select('item_id, bodega_id, cantidad_actual').in('item_id', ids)
  if (error) throw error
  const bodegaDe = Object.fromEntries(componentes.map(c => [c.item_id, c.item?.bodega_id]))
  const res = {}
  for (const s of data || []) {
    if (s.bodega_id === bodegaDe[s.item_id]) res[s.item_id] = Number(s.cantidad_actual)
  }
  return res
}

// Cuántas máquinas alcanzan con el stock actual
export function maquinasPosibles(componentes, stock) {
  if (componentes.length === 0) return 0
  return Math.min(...componentes.map(c => Math.floor((stock[c.item_id] || 0) / c.cantidad)))
}

// Costo de materiales de 1 máquina según la receta
export function costoUnitario(componentes) {
  return componentes.reduce((s, c) => s + c.cantidad * Number(c.item?.precio_costo || 0), 0)
}

function iniciales(nombre) {
  return (nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
}

// Registra el avance: valida stock, crea salida + entrada y guarda el avance.
// Devuelve { numeroSalida, numeroEntrada }. Lanza Error con mensaje para mostrar.
export async function registrarAvance({ orden, receta, cantidad, fecha, notas, perfil }) {
  const n = Number(cantidad)
  if (!n || n <= 0) throw new Error('Ingresa cuántas máquinas se terminaron.')
  if (!receta?.item) throw new Error('La máquina de esta orden ya no está en el catálogo.')
  if (receta.componentes.length === 0) throw new Error('La receta no tiene componentes. Agrégalos en Recetas.')
  const sinItem = receta.componentes.filter(c => !c.item)
  if (sinItem.length) throw new Error('La receta tiene componentes que ya no existen en el catálogo. Revísala en Recetas.')

  const stock = await stockComponentes(receta.componentes)
  const faltan = receta.componentes
    .filter(c => (stock[c.item_id] || 0) < c.cantidad * n)
    .map(c => `${c.item.nombre} (hay ${num(stock[c.item_id] || 0)}, se necesitan ${num(c.cantidad * n)})`)
  if (faltan.length) throw new Error('Stock insuficiente en: ' + faltan.join('; '))

  const ref = `${orden.numero} · ${num(n)} × ${receta.item.nombre}`
  const destinoMaq = await nombreBodega(receta.item.bodega_id, receta.item.bodega_nombre)
  const base = {
    usuario_id: perfil.id, referencia: ref, fecha_movimiento: fecha || null,
    proveedor: null, pedido_id: null, serial_motor: null, motivo: null, cliente: null,
    foto_remision_url: null, firma_receptor_url: null, numero_of: null,
  }

  const ini = iniciales(perfil.nombre)
  const numeroSalida = await siguienteNumero('movimientos', `SAL-${ini}`)
  const { error: errSal } = await supabase.from('movimientos').insert(receta.componentes.map(c => ({
    ...base,
    numero:                numeroSalida,
    tipo:                  'salida',
    item_id:               c.item_id,
    bodega_origen_id:      c.item.bodega_id,
    bodega_destino_id:     null,
    cantidad:              c.cantidad * n,
    precio_costo_snapshot: Number(c.item.precio_costo || 0),
    centro_costo:          c.item.bodega_nombre,
    destino:               `Ensamble ${orden.numero}`,
  })))
  if (errSal) throw new Error('No se pudo registrar la salida de componentes: ' + errSal.message)

  const numeroEntrada = await siguienteNumero('movimientos', `REC-${ini}`)
  const { error: errEnt } = await supabase.from('movimientos').insert({
    ...base,
    numero:                numeroEntrada,
    tipo:                  'entrada',
    item_id:               receta.item_id,
    bodega_origen_id:      BODEGA_ENSAMBLE_ID,
    bodega_destino_id:     receta.item.bodega_id,
    cantidad:              n,
    precio_costo_snapshot: costoUnitario(receta.componentes),
    centro_costo:          destinoMaq,
    destino:               null,
  })
  if (errEnt) throw new Error(`Salida de componentes creada (${numeroSalida}), pero falló la entrada de las máquinas: ${errEnt.message}. Avisa al administrador.`)

  const { error: errAv } = await supabase.from('ordenes_ensamble_avances').insert({
    orden_id: orden.id, fecha, cantidad: n, notas: notas?.trim() || null,
    numero_salida: numeroSalida, numero_entrada: numeroEntrada,
    usuario_id: perfil.id, usuario_nombre: perfil.nombre,
  })
  if (errAv) throw new Error(`Inventario actualizado (${numeroSalida} / ${numeroEntrada}), pero no se guardó el avance en la orden: ${errAv.message}`)

  return { numeroSalida, numeroEntrada }
}
