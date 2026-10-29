// Formatos y constantes de negocio para Feisen Órdenes de Fabricación

export function formatFecha(fecha) {
  if (!fecha) return '—'
  // fecha puede venir como 'YYYY-MM-DD' (columna DATE de Postgres) — evitar el corrimiento de huso horario
  const [y, m, d] = String(fecha).split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

export function formatFechaHora(fecha) {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota'
  })
}

export function formatoOF(numero) {
  return 'OF-' + String(numero).padStart(4, '0')
}

export function hoyISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' }) // formato YYYY-MM-DD
}

export const CENTRO_NOMBRE = {
  construequipos: 'Construequipos',
  aluminio: 'Poleas',
  fundicionHierro: 'Fundición Hierro',
  repuestos: 'Repuestos',
}

export const TRANSPORTE_NOMBRE = {
  directo: 'Transporte FEISEN – Vehículo propio',
  contratado: 'Transporte tercerizado FEISEN – Transportador contratado por FEISEN',
  propio_cliente: 'Recogida en planta – Cliente recoge en FEISEN',
  transportadora: 'Transportadora comercial – TCC / ENVÍA',
}

export const ROLES_LABEL = {
  ADMIN: 'Administrador',
  COMERCIAL: 'Comercial',
  JEFE_AREA: 'Jefe de Área',
  LOGISTICA: 'Logística',
  ALMACENISTA: 'Almacenista',
}

// ---------- Estado derivado de cada producto (igual criterio que el bosquejo) ----------
export function pendienteProducir(item) { return item.cantidad - item.producido }
export function disponibleDespacho(item) { return item.producido - item.entregado }
export function estadoClase(item) {
  if (item.entregado >= item.cantidad) return 'entregado'
  if (disponibleDespacho(item) > 0) return 'listo'
  if (item.producido > 0) return 'parcial'
  return 'pendiente'
}
export function estadoTexto(item) {
  if (item.entregado >= item.cantidad) return 'Entregado'
  if (disponibleDespacho(item) > 0) return 'Listo para despacho'
  if (item.producido > 0) return 'Producción parcial'
  return 'Pendiente producción'
}
export const ESTADO_BADGE_CLASE = {
  pendiente: 'bg-gray-100 text-feisen-texto-2',
  parcial:   'bg-feisen-azul-suave text-feisen-azul',
  listo:     'bg-feisen-rojo-suave text-feisen-rojo',
  entregado: 'bg-emerald-50 text-emerald-700',
}
export function ofTotalmenteDespachada(items) {
  return items.length > 0 && items.every(it => it.entregado >= it.cantidad)
}
export function nombreTransporte(orden) {
  return orden.nombre_transportadora ? orden.nombre_transportadora : (TRANSPORTE_NOMBRE[orden.transporte] || orden.transporte)
}

// ---------- Estado de la OF completa (para la vista "Por estado") ----------
// pendiente: nada fabricado · produccion: algo fabricado pero aún falta fabricar
// listo: todo fabricado, falta despachar · despachada: todo entregado
export function estadoOF(items) {
  if (ofTotalmenteDespachada(items)) return 'despachada'
  const faltaFabricar = items.some(it => pendienteProducir(it) > 0)
  if (!faltaFabricar) return 'listo'
  if (items.some(it => it.producido > 0)) return 'produccion'
  return 'pendiente'
}

// Alerta de la fecha de promesa (solo para OF no despachadas). Compara texto YYYY-MM-DD (ver hoyISO).
export function alertaPromesa(orden) {
  if (!orden.fecha_promesa || ofTotalmenteDespachada(orden.items_of || [])) return null
  const hoy = hoyISO()
  if (orden.fecha_promesa === hoy) return 'Vence hoy'
  if (orden.fecha_promesa < hoy) {
    const dias = Math.round((new Date(hoy) - new Date(orden.fecha_promesa)) / 86400000)
    return `Atrasada ${dias} d`
  }
  return null
}
