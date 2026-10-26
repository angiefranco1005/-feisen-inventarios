// Lógica de la evaluación de desempeño (sin JSX): valores por defecto, ítems
// de cada evaluación, cálculo del resultado y matriz de talento (9-box).

export const ESCALA_DEFECTO = [
  { valor: 1, etiqueta: 'No cumple' },
  { valor: 2, etiqueta: 'Cumple parcialmente' },
  { valor: 3, etiqueta: 'Cumple' },
  { valor: 4, etiqueta: 'Supera lo esperado' },
  { valor: 5, etiqueta: 'Excepcional' },
]

export const COMPETENCIAS_DEFECTO = ['Compromiso', 'Trabajo en equipo', 'Calidad del trabajo', 'Seguridad y orden en el puesto']

export const ESTADOS_EVAL = {
  pendiente: { label: 'Pendiente', punto: 'bg-gray-300' },
  en_curso:  { label: 'En curso',  punto: 'bg-amber-500' },
  completa:  { label: 'Completa',  punto: 'bg-green-500' },
}

export const POTENCIALES = [
  { value: 'bajo',  label: 'Bajo' },
  { value: 'medio', label: 'Medio' },
  { value: 'alto',  label: 'Alto' },
]

// "Foto" de lo que se evalúa a una persona: criterios de su cargo (objetivos,
// con peso) + competencias transversales del ciclo + competencias del cargo.
export function itemsParaEmpleado(cargo, ciclo) {
  const objetivos = (cargo?.evaluacion_criterios || [])
    .filter(c => (c?.criterio || '').trim())
    .map(c => ({ tipo: 'objetivo', nombre: c.criterio.trim(), peso: Number(c.peso) || 0, nota: null, nota_auto: null, comentario: '' }))
  const vistas = new Set()
  const competencias = [...(ciclo.competencias_transversales || []), ...(cargo?.competencias || [])]
    .map(c => String(c || '').trim()).filter(Boolean)
    .filter(c => { const k = c.toLowerCase(); if (vistas.has(k)) return false; vistas.add(k); return true })
    .map(c => ({ tipo: 'competencia', nombre: c, peso: null, nota: null, nota_auto: null, comentario: '' }))
  return [...objetivos, ...competencias]
}

const redondear = (n) => (n === null ? null : Math.round(n * 100) / 100)

// Promedio de las notas del jefe: objetivos ponderados por su peso; competencias promedio simple
function promedio(items, ponderado) {
  const conNota = items.filter(i => i.nota !== null && i.nota !== undefined && i.nota !== '')
  if (!conNota.length) return null
  if (ponderado) {
    const pesos = conNota.reduce((t, i) => t + (Number(i.peso) || 0), 0)
    if (pesos > 0) return conNota.reduce((t, i) => t + Number(i.nota) * (Number(i.peso) || 0), 0) / pesos
  }
  return conNota.reduce((t, i) => t + Number(i.nota), 0) / conNota.length
}

// Resultado de una evaluación en la escala (1 a 5). Si una de las dos partes no
// tiene ítems, el resultado es la otra parte completa.
export function calcularResultado(items, ciclo) {
  const obj = promedio(items.filter(i => i.tipo === 'objetivo'), true)
  const comp = promedio(items.filter(i => i.tipo === 'competencia'), false)
  let resultado = null
  if (obj !== null && comp !== null) resultado = (obj * ciclo.peso_objetivos + comp * ciclo.peso_competencias) / 100
  else resultado = obj ?? comp
  return { resultado_objetivos: redondear(obj), resultado_competencias: redondear(comp), resultado: redondear(resultado) }
}

export const resultadoFinal = (ev) => (ev?.resultado_calibrado ?? ev?.resultado ?? null)
export const maxEscala = (escala) => Math.max(...(escala?.length ? escala : ESCALA_DEFECTO).map(e => Number(e.valor)))
export const porcentaje = (valor, escala) => (valor === null || valor === undefined ? null : Math.round((Number(valor) / maxEscala(escala)) * 100))

// Etiqueta de la escala más cercana a un resultado (p. ej. 3,6 → "Supera lo esperado")
export function etiquetaDe(valor, escala) {
  if (valor === null || valor === undefined) return null
  const lista = escala?.length ? escala : ESCALA_DEFECTO
  return lista.reduce((mejor, e) => (Math.abs(e.valor - valor) < Math.abs(mejor.valor - valor) ? e : mejor), lista[0]).etiqueta
}

// Nivel de desempeño para la matriz: en una escala de 1 a 5, < 3 bajo, 3 a < 4 medio, ≥ 4 alto
export function nivelDesempeno(valor, escala) {
  if (valor === null || valor === undefined) return null
  const p = Number(valor) / maxEscala(escala)
  return p < 0.6 ? 'bajo' : p < 0.8 ? 'medio' : 'alto'
}

// Matriz de talento 9-box: [potencial][desempeño]
export const CUADRANTES = {
  alto:  { bajo: 'Diamante en bruto', medio: 'Futura estrella', alto: 'Estrella' },
  medio: { bajo: 'Inconsistente',     medio: 'Pilar del equipo', alto: 'Alto desempeño' },
  bajo:  { bajo: 'En riesgo',         medio: 'Efectivo',          alto: 'Experto confiable' },
}
export const COLOR_CUADRANTE = {
  alto:  { bajo: 'bg-amber-50',  medio: 'bg-emerald-50', alto: 'bg-emerald-100' },
  medio: { bajo: 'bg-orange-50', medio: 'bg-sky-50',     alto: 'bg-emerald-50' },
  bajo:  { bajo: 'bg-red-50',    medio: 'bg-orange-50',  alto: 'bg-sky-50' },
}
