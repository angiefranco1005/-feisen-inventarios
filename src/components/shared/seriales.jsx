// Seguimiento de motores por serial (tabla motor_seriales, ver
// supabase/migraciones/2026-10-29_motor_seriales.sql). Todo lo de la bodega
// MOTORES entra y sale de a una unidad por serial; la salida exige la OF.
import { supabase } from '../../lib/supabase'

export const MAX_SERIALES = 50

export const esBodegaMotores = nombre => (nombre || '').trim().toUpperCase() === 'MOTORES'

// Ajusta la lista de seriales al número de unidades, sin perder lo ya escrito
export function ajustarSeriales(lista, n) {
  const cant = Math.max(0, Math.min(MAX_SERIALES, Math.floor(n) || 0))
  return Array.from({ length: cant }, (_, i) => lista[i] ?? '')
}

// Devuelve el primer problema de la lista (vacíos o repetidos) o null si está bien
export function problemaSeriales(lista) {
  const limpios = lista.map(s => s.trim())
  const vacio = limpios.findIndex(s => !s)
  if (vacio >= 0) return lista.length === 1 ? 'Escribe el serial del motor.' : `Falta el serial de la unidad ${vacio + 1}.`
  const vistos = new Set()
  for (const s of limpios) {
    const k = s.toUpperCase()
    if (vistos.has(k)) return `El serial ${s} está repetido.`
    vistos.add(k)
  }
  return null
}

// ¿Alguno de estos seriales ya está en bodega para este producto?
export async function serialesYaEnBodega(itemId, lista) {
  const { data } = await supabase.from('motor_seriales').select('serial')
    .eq('item_id', itemId).eq('estado', 'disponible')
  const enBodega = new Set((data || []).map(r => r.serial.trim().toUpperCase()))
  return lista.map(s => s.trim()).filter(s => enBodega.has(s.toUpperCase()))
}

// ¿Alguno de estos seriales ya salió de la bodega, con cualquier producto? (2026-11-27)
// Evita registrar dos veces la salida del mismo motor: el 20/11 MOV-EP-0131 y 0133 sacaron el
// mismo serial a la OF 577 con 3 minutos de diferencia (escrito a mano, sin lista).
// Devuelve un texto para el aviso, o null si ninguno ha salido.
export async function avisoSerialesYaDespachados(lista) {
  const limpios = [...new Set(lista.map(s => s.trim()).filter(Boolean))]
  if (!limpios.length) return null
  const variantes = [...new Set(limpios.flatMap(s => [s, s.toUpperCase(), s.toLowerCase()]))]
  let { data } = await supabase.from('motor_seriales')
    .select('serial, numero_of, despachado_en, salida_mov_id, items(nombre)')
    .eq('estado', 'despachado').in('serial', variantes)
  // Un motor que salió y volvió a entrar (devolución) tiene otra fila 'disponible': ese sí puede salir
  const { data: dispon } = await supabase.from('motor_seriales').select('serial').eq('estado', 'disponible').in('serial', variantes)
  const enBodega = new Set((dispon || []).map(r => r.serial.trim().toUpperCase()))
  data = (data || []).filter(r => !enBodega.has(r.serial.trim().toUpperCase()))
  if (!data.length) return null
  const ids = data.map(d => d.salida_mov_id).filter(Boolean)
  const { data: movs } = ids.length ? await supabase.from('movimientos').select('id, numero').in('id', ids) : { data: [] }
  const numero = Object.fromEntries((movs || []).map(m => [m.id, m.numero]))
  const d = data[0]
  const fecha = d.despachado_en ? new Date(d.despachado_en).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' }) : null
  const detalle = [fecha && `el ${fecha}`, numero[d.salida_mov_id] && `con ${numero[d.salida_mov_id]}`, d.numero_of && `(OF ${d.numero_of})`, d.items?.nombre && `como ${d.items.nombre}`].filter(Boolean).join(' ')
  const otros = data.length > 1 ? ` y ${data.length - 1} serial(es) más también salieron` : ''
  return `El motor con serial ${d.serial} ya salió ${detalle}${otros}. No se registra otra vez: si fue un error, corrige primero esa salida en el Historial.`
}

// La lista de seriales (motor_seriales) la mantiene la base desde el 5/11/2026: el trigger
// trg_motor_seriales_insert registra cada entrada y salida de MOTORES con serial. La app solo valida.

// Un campo por unidad: "Serial unidad 1", "Serial unidad 2"…
export function CamposSerial({ valores, onCambiar, claseInput }) {
  if (valores.length === 0) return null
  const cambiar = (i, v) => onCambiar(valores.map((s, j) => (j === i ? v : s)))
  return (
    <div className="space-y-2">
      {valores.map((s, i) => (
        <label key={i} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs font-medium text-feisen-texto-2">
            {valores.length === 1 ? 'Serial' : `Unidad ${i + 1}`}
          </span>
          <input value={s} onChange={e => cambiar(i, e.target.value)} data-serial
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              const campos = [...document.querySelectorAll('input[data-serial]')]
              campos[campos.indexOf(e.currentTarget) + 1]?.focus()
            }}
            placeholder="Serial de la placa" autoComplete="off" autoCapitalize="characters"
            className={`${claseInput} font-mono`} />
        </label>
      ))}
    </div>
  )
}
