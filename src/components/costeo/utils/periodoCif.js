const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function mesActual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function anioActual() {
  return new Date().getFullYear()
}

export function periodoPromedio(anio) {
  return `PROM-${anio}`
}

export function esPromedio(periodo) {
  return typeof periodo === 'string' && periodo.startsWith('PROM-')
}

export function anioDePromedio(periodo) {
  return esPromedio(periodo) ? periodo.split('-')[1] : ''
}

export function formatearPeriodo(p) {
  if (!p) return '—'
  if (esPromedio(p)) {
    return `Promedio anual ${anioDePromedio(p)}`
  }
  const [y, m] = p.split('-')
  const idx = Number(m) - 1
  return idx >= 0 && idx < 12 ? `${NOMBRES_MES[idx]} ${y}` : p
}
