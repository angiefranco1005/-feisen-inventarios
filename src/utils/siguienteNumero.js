// Siguiente número correlativo (PED-0152, OC-0033, NC-0010…) tomando el MAYOR
// sufijo numérico que ya existe en la tabla + 1.
//
// Antes se usaba "cantidad de filas + 1", que se desfasa en cuanto se borra
// un registro: dos pedidos distintos terminaron con el mismo número PED-0151
// (2026-10-22, ver OBSERVACIONES.md). Con max+1 borrar filas no repite números.
//
// Uso: const numero = await siguienteNumero('pedidos', 'PED')
import { supabase } from '../lib/supabase'
import { fetchAllPages } from './fetchAllPages'

export async function siguienteNumero(tabla, prefijo, columna = 'numero') {
  const { data, error } = await fetchAllPages((d, h) =>
    supabase.from(tabla).select(columna).like(columna, `${prefijo}-%`)
      .order(columna).range(d, h)
  )
  if (error) throw error
  let max = 0
  for (const r of data || []) {
    const n = parseInt(String(r[columna] || '').slice(prefijo.length + 1), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefijo}-${String(max + 1).padStart(4, '0')}`
}
