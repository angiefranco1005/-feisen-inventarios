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
// Categorías de Fundición que la lógica reconoce (sus nombres llevan " - FUNDICIÓN" desde el 24/11/2026)
export const CAT_MATERIA_PRIMA_FUNDICION_ID = '24537e0a-88b5-4714-a7b1-0e8814e1c43c' // hierro colado, carbón, arenas…
export const CAT_FUNDIDO_HIERRO_ID          = 'c643d650-cff3-49c6-bf39-663fc003535f' // MATERIAL FUNDIDO HIERRO
export const CAT_ALUMINIO_FUNDICION_ID      = 'e28e93da-652d-47c6-af6f-f7d8ce601022' // aluminio en bruto (lingote) para coquillar
export const CAT_POLEAS_ALUMINIO_ID         = 'd0e46316-a3a1-41dd-b7e9-39c252ae3ed1' // poleas de aluminio coquilladas (producto terminado)

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
