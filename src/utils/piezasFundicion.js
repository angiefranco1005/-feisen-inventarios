// Crear una pieza de fundición desde el moldeo (Nueva orden y Editar orden), sin ir a Productos.
// Queda en la bodega Fundición, categoría MATERIAL FUNDIDO HIERRO (la que usa la plantilla), sin
// precio de costo (lo pone Almacén/Gerencia) y con stock 0. El peso es opcional: si aún no se
// conoce, se pide en la Recogida.
// No duplica: si ya existe con ese nombre (sin importar mayúsculas/tildes, o creado por un intento
// anterior que falló a medias) devuelve el existente.
import { supabase } from '../lib/supabase'
import { CAT_FUNDIDO_HIERRO_ID } from './bodegasCatalogo'
import { sinTildes } from './busqueda'

export function normalizarNombrePieza(nombre) {
  return String(nombre || '').trim().replace(/\s+/g, ' ').toUpperCase()
}

// Devuelve { id, nombre, peso_unitario }. Lanza Error con un mensaje para el usuario.
export async function crearPiezaFundicion({ nombre, peso, bodegaId, conocidos = [] }) {
  const n = normalizarNombrePieza(nombre)
  const textoPeso = String(peso ?? '').trim()
  const p = Number(textoPeso.replace(',', '.'))
  if (!n) throw new Error('Escribe el nombre de la pieza.')
  if (textoPeso && !(p > 0)) throw new Error('El peso debe ser un número mayor que cero, o déjalo vacío.')
  if (!bodegaId) throw new Error('No se encontró la bodega Fundición. Recarga la página.')

  const { data: mismos, error: eBus } = await supabase.from('items')
    .select('id, nombre, peso_unitario, activo').eq('bodega_id', bodegaId).ilike('nombre', n)
  if (eBus) throw eBus
  const clave = sinTildes(n)
  let item = (mismos || []).find(i => sinTildes(i.nombre) === clave)
    || conocidos.find(i => sinTildes(i.nombre) === clave)
  if (item && item.activo === false) {
    throw new Error(`Ya existe "${item.nombre}" pero está inactivo. Pide en Inventario › Productos que lo activen.`)
  }
  if (!item) {
    const { data: creado, error: eIns } = await supabase.from('items').insert({
      nombre: n, bodega_id: bodegaId, categoria_id: CAT_FUNDIDO_HIERRO_ID, centro_costo: 'FUNDICIÓN',
      unidad_medida: 'unidad', peso_unitario: p > 0 ? p : null, stock_minimo: 0, stock_maximo: 0,
      updated_at: new Date().toISOString(),
    }).select('id, nombre, peso_unitario').single()
    if (eIns) throw eIns
    item = creado
    await supabase.from('stock').upsert(
      { item_id: item.id, bodega_id: bodegaId, cantidad_actual: 0 }, { onConflict: 'item_id,bodega_id' })
  }
  return { id: item.id, nombre: item.nombre, peso_unitario: Number(item.peso_unitario) || 0 }
}
