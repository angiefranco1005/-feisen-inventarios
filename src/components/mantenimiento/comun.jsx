// Piezas comunes del módulo Mantenimiento (ver supabase/migraciones/2026-10-29_mantenimiento.sql).

export const IMPORTANCIA = {
  critico:    { texto: 'Crítico',    clase: 'bg-feisen-rojo-suave text-feisen-rojo' },
  importante: { texto: 'Importante', clase: 'bg-amber-50 text-amber-700' },
  secundario: { texto: 'Secundario', clase: 'bg-gray-100 text-feisen-texto-2' },
}

export const ESTADO_EQUIPO = {
  operando:      { texto: 'Operando',         clase: 'bg-emerald-50 text-emerald-700' },
  mantenimiento: { texto: 'En mantenimiento', clase: 'bg-amber-50 text-amber-700' },
  parado:        { texto: 'Parado',           clase: 'bg-feisen-rojo-suave text-feisen-rojo' },
}

export const ESTADO_ORDEN = {
  programada:    { texto: 'Programada',    clase: 'bg-feisen-azul-suave text-feisen-azul' },
  reportada:     { texto: 'Reportada',     clase: 'bg-feisen-rojo-suave text-feisen-rojo' },
  en_reparacion: { texto: 'En reparación', clase: 'bg-amber-50 text-amber-700' },
  cerrada:       { texto: 'Cerrada',       clase: 'bg-emerald-50 text-emerald-700' },
}

export function Etiqueta({ clase, children, punto = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${clase}`}>
      {punto && <span className="w-1.5 h-1.5 rounded-full bg-current" />}{children}
    </span>
  )
}

export const Titulo = ({ children }) => (
  <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">{children}</p>
)

// Fecha de hoy en Colombia, 'YYYY-MM-DD'
export const hoyCol = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
export const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
export const diasHasta = iso => Math.round((new Date(`${iso}T12:00:00`) - new Date(`${hoyCol()}T12:00:00`)) / 86400000)

// "vencido hace 6 días", "hoy", "en 3 días", "en 5 meses"
export function textoProxima(iso) {
  const d = diasHasta(iso)
  if (d === 0) return 'hoy'
  if (d < 0) return `vencido hace ${-d} ${d === -1 ? 'día' : 'días'}`
  if (d < 45) return `en ${d} ${d === 1 ? 'día' : 'días'}`
  const m = Math.round(d / 30)
  return `en ${m} ${m === 1 ? 'mes' : 'meses'}`
}

// "7 h 20 min", "2 días 3 h"
export function duracion(desde, hasta = new Date()) {
  if (!desde) return '—'
  const min = Math.max(0, Math.round((new Date(hasta) - new Date(desde)) / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`
  const dd = Math.floor(h / 24)
  return `${dd} ${dd === 1 ? 'día' : 'días'}${h % 24 ? ` ${h % 24} h` : ''}`
}
export const horasEntre = (a, b) => (a && b ? Math.max(0, (new Date(b) - new Date(a)) / 3600000) : 0)

export const fechaCorta = f => f
  ? new Date(f.length === 10 ? `${f}T12:00:00` : f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })
  : '—'

export const campo = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-sm focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'
export const etiquetaCampo = 'block text-sm font-medium text-feisen-texto mb-1.5'
