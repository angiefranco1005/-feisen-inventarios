import { supabase } from '../lib/supabase'
import { fetchAllPages } from './fetchAllPages'

// Consumo de los últimos N días: suma de salidas (no revertidas) por producto,
// opcionalmente solo las que salen de ciertas bodegas. Incluye traslados a otras
// bodegas, porque también vacían la bodega de origen.
export const DIAS_CONSUMO = 90
// Mínimo sugerido = consumo promedio de 15 días (medio mes de cobertura)
export const DIAS_COBERTURA = 15

export async function cargarConsumo({ itemIds = null, bodegas = null, dias = DIAS_CONSUMO } = {}) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString()
  const { data, error } = await fetchAllPages((d, h) => {
    let q = supabase.from('movimientos')
      .select('item_id, cantidad')
      .eq('tipo', 'salida')
      .eq('revertido', false)
      .gt('cantidad', 0)
      .gte('created_at', desde)
      .order('id')
      .range(d, h)
    if (itemIds) q = q.in('item_id', itemIds)
    if (bodegas) q = q.in('bodega_origen_id', bodegas)
    return q
  })
  const porItem = {}
  for (const m of data || []) porItem[m.item_id] = (porItem[m.item_id] || 0) + Number(m.cantidad || 0)
  return { porItem, error }
}

export function minimoSugerido(consumo, dias = DIAS_CONSUMO) {
  if (!consumo || consumo <= 0) return null
  return Math.max(1, Math.ceil(consumo / dias * DIAS_COBERTURA))
}
