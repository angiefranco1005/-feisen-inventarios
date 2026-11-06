export function formatCOP(value) {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    // Pesos sin decimales, como en el resto del ERP (guía ux-feisen)
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatNumber(value, decimals = 2) {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

export function formatPct(value) {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat('es-CO', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n)
}
