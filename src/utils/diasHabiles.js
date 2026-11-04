// Días hábiles de Feisen: lunes a viernes sin festivos de Colombia (los mismos de Nómina,
// `festivosColombia`). Se usan para el atraso de los pedidos y para calcular la fecha de
// llegada "en N días hábiles" (pedido de Angie, 4/11/2026: un pedido del viernes a 3 días
// llega el miércoles, no el lunes, y si hay festivo uno más).
import { festivosColombia } from '../components/rrhh/catalogosRRHH'

const fecha = iso => { const [a, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d) }
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const hoyColombia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

// Fecha (YYYY-MM-DD) de algo guardado como timestamp, en hora de Colombia
export const diaColombia = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

export function esHabil(dia) {
  const d = fecha(dia), dow = d.getDay()
  return dow >= 1 && dow <= 5 && !festivosColombia(d.getFullYear()).has(iso(d))
}

// Por qué un día no es hábil: 'sábado', 'domingo', el nombre del festivo, o null si es hábil
export function motivoNoHabil(dia) {
  const d = fecha(dia), dow = d.getDay()
  if (dow === 6) return 'sábado'
  if (dow === 0) return 'domingo'
  return festivosColombia(d.getFullYear()).get(iso(d)) || null
}

// Días hábiles después de `desde` hasta `hasta` inclusive (0 si hasta <= desde).
// Ej.: desde viernes hasta el lunes siguiente = 1.
export function habilesEntre(desde, hasta) {
  if (!desde || !hasta || hasta.slice(0, 10) <= desde.slice(0, 10)) return 0
  const d = fecha(desde), fin = fecha(hasta)
  let n = 0
  while (d < fin) { d.setDate(d.getDate() + 1); if (esHabil(iso(d))) n++ }
  return n
}

// La fecha que queda `n` días hábiles después de `desde` (por defecto hoy)
export function sumarHabiles(n, desde = hoyColombia()) {
  const d = fecha(desde)
  let faltan = n
  while (faltan > 0) { d.setDate(d.getDate() + 1); if (esHabil(iso(d))) faltan-- }
  return iso(d)
}
