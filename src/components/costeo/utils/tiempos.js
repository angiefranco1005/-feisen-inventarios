// Utilidades de la toma de tiempos de cada proceso.

const pad = (n) => String(n).padStart(2, '0')

export function hoy() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function horaActual() {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function aMinutos(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

// Horas trabajadas entre inicio y fin (HH:MM), descontando pausas en minutos.
// Si la hora de fin es menor que la de inicio se asume que pasó la medianoche.
export function horasEntre(inicio, fin, pausaMin = 0) {
  const a = aMinutos(inicio)
  const b = aMinutos(fin)
  if (a == null || b == null) return null
  let minutos = b - a
  if (minutos < 0) minutos += 24 * 60
  minutos -= Number(pausaMin || 0)
  if (minutos <= 0) return null
  return Math.round((minutos / 60) * 100) / 100
}

// Texto que se guarda en las notas para conservar el horario original del registro.
export function textoHorario(inicio, fin, pausaMin) {
  const pausa = Number(pausaMin || 0)
  return `${inicio}–${fin}${pausa > 0 ? ` (pausa ${pausa} min)` : ''}`
}

export function unirNotas(...partes) {
  return partes.map((p) => (p || '').trim()).filter(Boolean).join(' · ') || null
}

// Tiempo transcurrido desde un timestamp (ms), como "1 h 25 min".
export function transcurrido(desdeMs) {
  const min = Math.max(0, Math.floor((Date.now() - desdeMs) / 60000))
  const h = Math.floor(min / 60)
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`
}


// Lectura del cronómetro (horas, minutos, segundos) ↔ horas decimales que se guardan.
export function aHoras(h, m, s) {
  return (Number(h || 0) * 3600 + Number(m || 0) * 60 + Number(s || 0)) / 3600
}

export function partirHoras(horas) {
  const total = Math.round(Number(horas || 0) * 3600)
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 }
}

// "1 h 05 min", "12 min 30 s", "45 s".
export function duracionTexto(horas) {
  const { h, m, s } = partirHoras(horas)
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`
  return `${s} s`
}

// Segundos de un tiempo por pieza, en el texto más legible.
export function porPiezaTexto(horas, piezas) {
  if (!(Number(piezas) > 0)) return '-'
  return duracionTexto(Number(horas) / Number(piezas))
}

// Cronómetro en marcha como 00:12:30.
export function relojDesde(desdeMs) {
  const t = Math.max(0, Math.floor((Date.now() - desdeMs) / 1000))
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`
}
