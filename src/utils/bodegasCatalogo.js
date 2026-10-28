// Identidad estable de las bodegas y categorías que la lógica del sistema necesita
// reconocer. SIEMPRE se comparan por ID, nunca por nombre: así se puede renombrar una
// bodega o una categoría desde Configuración sin que la app deje de reconocerla
// (antes varias pantallas buscaban 'FUNDICIÓN' / 'MECANIZADOS' por texto y se rompían
// al cambiar el nombre). Ver OBSERVACIONES.md (25/10/2026).
import { supabase } from '../lib/supabase'

export const BODEGA_FUNDICION_ID   = 'a0604489-2768-445b-8e68-e450ef8520ed'
export const BODEGA_MECANIZADOS_ID = '03a709ac-0bee-457a-80a1-0a1603218d34'
export const BODEGA_ENSAMBLE_ID    = '7f0e4d7e-8c85-40d3-84c5-7857e26f624a' // "Producción y Ensamble"
export const BODEGA_ALMACEN_ID     = '176a39af-2ca6-482e-83ec-8ba53e30f142'
export const CAT_PRODUCTO_MECANIZADO_ID = 'bff5d482-1647-426c-a88f-dedd72ff5b06'

// Acepta un objeto bodega ({id}) o un id suelto.
export const esBodegaFundicion   = (b) => !!b && (b.id ?? b) === BODEGA_FUNDICION_ID
export const esBodegaMecanizados = (b) => !!b && (b.id ?? b) === BODEGA_MECANIZADOS_ID

// Nombre ACTUAL de una bodega (para guardar en `centro_costo` / `destino`, que son texto
// informativo). No se cachea: si renombran la bodega, el siguiente registro ya sale con el
// nombre nuevo. `fallback` solo se usa si la consulta falla.
export async function nombreBodega(id, fallback = '') {
  try {
    const { data } = await supabase.from('bodegas').select('nombre').eq('id', id).maybeSingle()
    return data?.nombre || fallback
  } catch {
    return fallback
  }
}
