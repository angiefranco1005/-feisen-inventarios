// Catálogos y cálculos del módulo Proyectos de innovación (solo ADMIN por ahora).
// Sigue el «Formato de proyecto — Innovación y Diseño» aprobado por Angie el 2026-11-20.
// Tablas: innovacion_proyectos, innovacion_avances (supabase/migraciones/2026-11-20_innovacion_proyectos.sql).

export const TIPOS = {
  producto_nuevo: 'Producto nuevo',
  mejora_maquina: 'Mejora de máquina',
  rediseno:       'Rediseño',
  mejora_proceso: 'Mejora de proceso',
}

export const AREAS = ['Fundición', 'Mecanizados', 'Ensamble', 'Motores', 'Otra']

export const DECISIONES_PEDIDAS = {
  aprobar:   'Aprobar inversión',
  priorizar: 'Priorizar',
  avance:    'Informe de avance',
}

// Badges: rojo = problema, ámbar = espera decisión, azul = en marcha, gris = neutro/cerrado
export const ESTADOS = {
  borrador:         { texto: 'Borrador',             clase: 'bg-gray-100 text-gray-600' },
  presentado:       { texto: 'Por decidir',          clase: 'bg-amber-50 text-amber-700' },
  aprobado:         { texto: 'Aprobado',             clase: 'bg-feisen-azul-suave text-feisen-azul' },
  aprobado_ajustes: { texto: 'Aprobado con ajustes', clase: 'bg-feisen-azul-suave text-feisen-azul' },
  aplazado:         { texto: 'Aplazado',             clase: 'bg-gray-100 text-gray-600' },
  rechazado:        { texto: 'Rechazado',            clase: 'bg-feisen-rojo-suave text-feisen-rojo' },
  en_curso:         { texto: 'En curso',             clase: 'bg-feisen-azul-suave text-feisen-azul' },
  cerrado:          { texto: 'Cerrado',              clase: 'bg-gray-100 text-gray-600' },
}

export const SEMAFOROS = {
  verde:    { texto: 'Verde',    clase: 'bg-emerald-50 text-emerald-700', ayuda: 'En tiempo y presupuesto' },
  amarillo: { texto: 'Amarillo', clase: 'bg-amber-50 text-amber-700',     ayuda: 'Desvío hasta 10 %' },
  rojo:     { texto: 'Rojo',     clase: 'bg-feisen-rojo-suave text-feisen-rojo', ayuda: 'Desvío mayor a 10 % o fase bloqueada' },
}

// Sección 5: rubros de la inversión (los imprevistos se calculan, no se digitan)
export const RUBROS_INICIALES = [
  { rubro: 'Materiales y materia prima',      detalle: '', valor: null },
  { rubro: 'Mano de obra interna',            detalle: 'horas × tarifa', valor: null },
  { rubro: 'Horas máquina',                   detalle: '', valor: null },
  { rubro: 'Modelos, moldes y herramental',   detalle: '', valor: null },
  { rubro: 'Prototipos y pruebas',            detalle: '', valor: null },
  { rubro: 'Servicios externos',              detalle: 'diseño, laboratorio, certificación', valor: null },
]
export const IMPREVISTOS = 0.10

// Sección 6
export const FASES_INICIALES = [
  { fase: 'Diseño',             entregable: 'Planos y lista de materiales aprobados', inicio: '', fin: '', responsable: '' },
  { fase: 'Prototipo',          entregable: 'Pieza o máquina prototipo', inicio: '', fin: '', responsable: '' },
  { fase: 'Pruebas',            entregable: 'Informe de pruebas con el indicador medido', inicio: '', fin: '', responsable: '' },
  { fase: 'Paso a producción',  entregable: 'Ficha de costo y orden de fabricación en el ERP', inicio: '', fin: '', responsable: '' },
]
export const RECURSOS_INICIALES = [
  { recurso: 'Personas', cantidad: '', area: '', disponible: '' },
  { recurso: 'Máquinas', cantidad: '', area: '', disponible: '' },
  { recurso: 'Proveedores o servicios externos', cantidad: '', area: '', disponible: '' },
]

// Sección 8: calificación 1–5 × peso; máximo 5,0
export const CRITERIOS = [
  { clave: 'retorno',    texto: 'Retorno (recuperación y ROI)',               peso: 0.30 },
  { clave: 'estrategia', texto: 'Encaje con la estrategia de Feisen',         peso: 0.20 },
  { clave: 'urgencia',   texto: 'Urgencia (cliente esperando, falla actual)', peso: 0.20 },
  { clave: 'riesgo',     texto: 'Riesgo bajo (5 = muy poco riesgo)',          peso: 0.15 },
  { clave: 'capacidad',  texto: 'Capacidad disponible (personas y máquinas)', peso: 0.15 },
]

export function subtotalCostos(costos) {
  return (costos || []).reduce((s, c) => s + (Number(c.valor) || 0), 0)
}
export function totalInversion(costos) {
  const sub = subtotalCostos(costos)
  return Math.round(sub * (1 + IMPREVISTOS))
}
// Meses para recuperar la inversión
export function mesesRecuperacion(p) {
  const inv = totalInversion(p.costos), b = Number(p.beneficio_mensual)
  return inv > 0 && b > 0 ? inv / b : null
}
// ROI a 12 meses = (beneficio 12 meses − inversión) ÷ inversión
export function roi12(p) {
  const inv = totalInversion(p.costos), b = Number(p.beneficio_mensual)
  return inv > 0 && b > 0 ? (b * 12 - inv) / inv : null
}
// Puntaje de priorización (null si falta alguna calificación)
export function puntaje(calificaciones) {
  const c = calificaciones || {}
  if (CRITERIOS.some(k => !c[k.clave])) return null
  return CRITERIOS.reduce((s, k) => s + Number(c[k.clave]) * k.peso, 0)
}

export const fmtPuntaje = n => n == null ? '—' : n.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const fmtMeses = n => n == null ? '—' : `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} meses`
export const fmtPct = n => n == null ? '—' : `${Math.round(n * 100).toLocaleString('es-CO')} %`
