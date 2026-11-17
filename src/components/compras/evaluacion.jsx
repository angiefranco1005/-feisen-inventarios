// Evaluación de proveedores (ver supabase/migraciones/2026-11-17_proveedor_evaluaciones.sql).
// Una evaluación por orden de compra: tres preguntas de 1 a 5 estrellas y si hubo algún problema.
import { Star } from '../shared/iconos'

export const PREGUNTAS = [
  { clave: 'calidad',      titulo: 'Calidad del material', ayuda: '¿Llegó lo que se pidió, en buen estado y con sus documentos?' },
  { clave: 'cumplimiento', titulo: 'Cumplimiento',          ayuda: '¿Entregó en la fecha que prometió y completo?' },
  { clave: 'precio',       titulo: 'Precio',                ayuda: '¿Respetó el precio cotizado y es competitivo?' },
]
export const SIGNIFICADO = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente']

// Promedio de las tres preguntas de una evaluación
export const notaDe = e => (e.calidad + e.cumplimiento + e.precio) / 3

// Resumen de varias evaluaciones: promedio general y por pregunta, cuántas y cuántas con problema
export function resumenEvaluaciones(evals) {
  const n = evals.length
  if (!n) return { n: 0, nota: null, calidad: null, cumplimiento: null, precio: null, problemas: 0 }
  const prom = k => evals.reduce((s, e) => s + e[k], 0) / n
  return { n, nota: evals.reduce((s, e) => s + notaDe(e), 0) / n, calidad: prom('calidad'), cumplimiento: prom('cumplimiento'), precio: prom('precio'), problemas: evals.filter(e => e.hubo_problema).length }
}

export const formatoNota = v => v == null ? '—' : v.toFixed(1).replace('.', ',')

// Color de una nota: un color = un significado (rojo problema, ámbar atención, verde bien)
export const claseNota = v => v == null ? 'text-feisen-texto-2' : v < 3 ? 'text-feisen-rojo' : v < 4 ? 'text-amber-700' : 'text-emerald-700'

// Estrellas para elegir (botones grandes, tocables en el celular) o solo para mostrar
export function Estrellas({ valor = 0, onCambiar, tam = 28, etiqueta = 'Calificación' }) {
  if (!onCambiar) {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`${etiqueta}: ${formatoNota(valor)} de 5`}>
        {[1, 2, 3, 4, 5].map(i => <Star key={i} size={tam} weight={valor >= i - 0.25 ? 'fill' : 'regular'} className={valor >= i - 0.25 ? 'text-amber-400' : 'text-gray-300'} />)}
      </span>
    )
  }
  return (
    <span role="radiogroup" aria-label={etiqueta} className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" role="radio" aria-checked={valor === i} aria-label={`${i} ${i === 1 ? 'estrella' : 'estrellas'} · ${SIGNIFICADO[i]}`}
          onClick={() => onCambiar(i)} className="w-11 h-11 grid place-items-center rounded-lg hover:bg-amber-50 active:scale-95 transition">
          <Star size={tam} weight={valor >= i ? 'fill' : 'regular'} className={valor >= i ? 'text-amber-400' : 'text-gray-300'} />
        </button>
      ))}
    </span>
  )
}
