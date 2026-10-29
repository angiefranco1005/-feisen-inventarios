// Utilidades de la toma de tiempos (planilla impresa y registro desde el celular).

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

export function enlaceCelular(fichaId) {
  return `${window.location.origin}/costeo/fichas/${fichaId}?tab=tiempos`
}
