// Formatos colombianos para la app Feisen

export function formatCOP(valor) {
  if (valor == null || isNaN(valor)) return '$0'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(valor)
}

export function formatNumero(valor, decimales = 3) {
  if (valor == null || isNaN(valor)) return '0'
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales
  }).format(valor)
}

export function formatFecha(fecha) {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Bogota'
  })
}

export function formatFechaHora(fecha) {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota'
  })
}

export const TIPOS_MOVIMIENTO = {
  entrada: 'Entrada',
  salida:  'Salida'
}

export const CENTROS_COSTO = ['Lámina', 'Ferretería', 'Mecanizado', 'Almacén', 'Motores', 'Fundición Hierro', 'Fundición de Aluminio']

export const UNIDADES_MEDIDA = ['unidad', 'kg', 'metro', 'litro', 'tonelada', 'par', 'juego', 'rollo', 'caja', 'bolsa']
