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

// Después de insertar las entradas (una por motor), registra cada serial como disponible
export async function registrarSerialesEntrada(movs) {
  const filas = movs.filter(m => m.serial_motor?.trim()).map(m => ({
    item_id: m.item_id, bodega_id: m.bodega_destino_id, serial: m.serial_motor.trim(), entrada_mov_id: m.id,
  }))
  if (filas.length === 0) return null
  const { error } = await supabase.from('motor_seriales').insert(filas)
  return error
}

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
