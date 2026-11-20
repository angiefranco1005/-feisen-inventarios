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

// Una columna `date` llega como 'AAAA-MM-DD' y new Date() la toma como medianoche UTC,
// que en Bogotá es el día anterior. Esas se anclan al mediodía; los timestamps no cambian.
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const aFecha = fecha => SOLO_FECHA.test(fecha) ? new Date(`${fecha}T12:00:00`) : new Date(fecha)

export function formatFecha(fecha) {
  if (!fecha) return '—'
  return aFecha(fecha).toLocaleDateString('es-CO', {
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
