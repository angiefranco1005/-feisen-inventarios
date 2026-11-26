// Dotación (pedido de Angie, 2026-11-26): RRHH entrega la dotación desde la bodega de
// Administración. Cada entrega hace una salida normal de inventario (movimiento 'salida',
// el trigger descuenta el stock) y queda registrada en dotacion_entregas con la fecha,
// el trabajador y si él asume el costo (se descuenta en su nómina: "Dotación / herramienta").
import { supabase } from '../../../lib/supabase'

const sinTildes = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
export const esBodegaAdministracion = (b) => sinTildes(b?.nombre) === 'ADMINISTRACION'
export const esCategoriaDotacion = (nombre) => sinTildes(nombre) === 'DOTACION'

// Tallas rápidas para crear productos de dotación
export const TALLAS_RAPIDAS = [
  { label: 'Ropa (S a XXL)',      tallas: ['S', 'M', 'L', 'XL', 'XXL'] },
  { label: 'Pantalón (28 a 40)',  tallas: ['28', '30', '32', '34', '36', '38', '40'] },
  { label: 'Calzado (36 a 44)',   tallas: ['36', '37', '38', '39', '40', '41', '42', '43', '44'] },
]
export const nombreConTalla = (base, talla) => `${base.trim()} - Talla ${talla}`

// Número de salida igual que en Movimientos: SAL-<iniciales>-0001
export async function numeroSalida(perfil) {
  const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
  const prefix = `SAL-${iniciales}-`
  const { data: last } = await supabase
    .from('movimientos').select('numero').like('numero', `${prefix}%`)
    .order('numero', { ascending: false }).limit(1).maybeSingle()
  const n = last?.numero ? parseInt(last.numero.replace(prefix, ''), 10) || 0 : 0
  return `${prefix}${String(n + 1).padStart(4, '0')}`
}

