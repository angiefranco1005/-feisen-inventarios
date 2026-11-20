// Catálogos y cálculos del módulo Proyectos de innovación (solo ADMIN por ahora).
// Sigue el «Formato de proyecto — Innovación y Diseño» aprobado por Angie el 2026-11-20.
// Tablas: innovacion_proyectos, innovacion_avances (supabase/migraciones/2026-11-20_innovacion_proyectos.sql).

export const TIPOS = {
  producto_nuevo: 'Producto nuevo',
  mejora_maquina: 'Mejora de máquina',
  rediseno:       'Rediseño',
  mejora_proceso: 'Mejora de proceso',
}

// El responsable de todo proyecto es siempre el jefe de Innovación y Diseño (Angie, 2026-11-20)
export const RESPONSABLE = 'Jefe de Innovación y Diseño'

// Solo Angie aprueba (firma) un proyecto (Angie, 2026-11-20). Se quitó la sección «Decisión de gerencia»:
// ya no hay monto aprobado editable, condiciones, próxima revisión, aplazar ni rechazar.
// Al aprobar se guarda decidido_por/decidido_at y el monto aprobado = inversión total de ese momento.
// La base también lo bloquea (trigger innovacion_solo_angie_aprueba): si cambia el id, cambiarlo en los dos lados.
export const APROBADORA = { id: 'ef361cdc-5333-4e22-a93e-89d50d2a2e1e', nombre: 'Angie Franco' }

export const AREAS = ['Fundición', 'Mecanizados', 'Ensamble', 'Motores', 'Otra']

// «Decisión que se pide» se quitó (Angie, 20/11): la prioridad se define en la reunión de jefes.
// La columna decision_pedida sigue en la base con su valor por defecto, sin uso.

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

// Sección 4: rubros de la inversión (los imprevistos se calculan, no se digitan)
export const RUBROS_INICIALES = [
  { rubro: 'Materiales y materia prima',      detalle: '', valor: null },
  { rubro: 'Mano de obra interna',            detalle: 'horas × tarifa', valor: null },
  { rubro: 'Horas máquina',                   detalle: '', valor: null },
  { rubro: 'Modelos, moldes y herramental',   detalle: '', valor: null },
  { rubro: 'Prototipos y pruebas',            detalle: '', valor: null },
  { rubro: 'Servicios externos',              detalle: 'diseño, laboratorio, certificación', valor: null },
]
export const IMPREVISTOS = 0.10

// Sección 5
export const FASES_INICIALES = [
  { fase: 'Diseño',             entregable: 'Planos y lista de materiales aprobados', inicio: '', fin: '', terminada: '', responsable: '' },
  { fase: 'Prototipo',          entregable: 'Pieza o máquina prototipo', inicio: '', fin: '', terminada: '', responsable: '' },
  { fase: 'Pruebas',            entregable: 'Informe de pruebas con el indicador medido', inicio: '', fin: '', terminada: '', responsable: '' },
  { fase: 'Paso a producción',  entregable: 'Ficha de costo y orden de fabricación en el ERP', inicio: '', fin: '', terminada: '', responsable: '' },
]

export function subtotalCostos(costos) {
  return (costos || []).reduce((s, c) => s + (Number(c.valor) || 0), 0)
}
export function totalInversion(costos) {
  const sub = subtotalCostos(costos)
  return Math.round(sub * (1 + IMPREVISTOS))
}
export const fmtPct = n => n == null ? '—' : `${Math.round(n * 100).toLocaleString('es-CO')} %`

// ── Cumplimiento del cronograma (pedido de Angie, 2026-11-20) ────────────────────────
// Cada fase tiene inicio y fin planeados y, cuando se termina, la fecha real «terminada».
// Fechas como 'AAAA-MM-DD' (texto): se comparan como texto y se convierten al mediodía.
export const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000)

// Badges: rojo = problema, ámbar = atención, azul = en marcha/cumplido, gris = neutro
export const ESTADOS_FASE = {
  a_tiempo:   { texto: 'Terminada a tiempo', clase: 'bg-feisen-azul-suave text-feisen-azul',  barra: 'bg-feisen-azul' },
  tarde:      { texto: 'Terminada tarde',    clase: 'bg-feisen-rojo-suave text-feisen-rojo',  barra: 'bg-feisen-azul' },
  atrasada:   { texto: 'Atrasada',           clase: 'bg-feisen-rojo-suave text-feisen-rojo',  barra: 'bg-feisen-rojo' },
  por_vencer: { texto: 'Vence esta semana',  clase: 'bg-amber-50 text-amber-700',             barra: 'bg-amber-400' },
  en_curso:   { texto: 'En curso',           clase: 'bg-feisen-azul-suave text-feisen-azul',  barra: 'bg-feisen-azul/40' },
  pendiente:  { texto: 'Por empezar',        clase: 'bg-gray-100 text-gray-600',              barra: 'bg-gray-300' },
  sin_fechas: { texto: 'Sin fechas',         clase: 'bg-gray-100 text-gray-600',              barra: 'bg-gray-200' },
}

// { clave, dias }: dias = días de atraso (tarde/atrasada) o días que faltan (por_vencer)
export function estadoFase(f, hoy = hoyISO()) {
  if (!f?.inicio || !f?.fin) return { clave: f?.terminada ? 'a_tiempo' : 'sin_fechas', dias: 0 }
  if (f.terminada) {
    const d = diasEntre(f.fin, f.terminada)
    return d > 0 ? { clave: 'tarde', dias: d } : { clave: 'a_tiempo', dias: 0 }
  }
  if (f.fin < hoy) return { clave: 'atrasada', dias: diasEntre(f.fin, hoy) }
  if (f.inicio > hoy) return { clave: 'pendiente', dias: 0 }
  const faltan = diasEntre(hoy, f.fin)
  return faltan <= 7 ? { clave: 'por_vencer', dias: faltan } : { clave: 'en_curso', dias: faltan }
}

export function textoEstadoFase({ clave, dias }) {
  const plural = n => `${n} ${n === 1 ? 'día' : 'días'}`
  if (clave === 'tarde') return `Terminada ${plural(dias)} tarde`
  if (clave === 'atrasada') return `Atrasada ${plural(dias)}`
  if (clave === 'por_vencer') return dias === 0 ? 'Vence hoy' : `Vence en ${plural(dias)}`
  return ESTADOS_FASE[clave].texto
}

// Resumen de varias fases (de uno o de todos los proyectos)
export function resumenCumplimiento(fases, hoy = hoyISO()) {
  const est = (fases || []).map(f => estadoFase(f, hoy).clave)
  const terminadas = est.filter(c => c === 'a_tiempo' || c === 'tarde').length
  const aTiempo = est.filter(c => c === 'a_tiempo').length
  return {
    terminadas, aTiempo,
    pctATiempo: terminadas ? aTiempo / terminadas : null,
    atrasadas: est.filter(c => c === 'atrasada').length,
    porVencer: est.filter(c => c === 'por_vencer').length,
  }
}

// Archivos de la bitácora (bucket privado «innovacion»)
export const BUCKET = 'innovacion'
export const fmtTamano = b => b >= 1048576 ? `${(b / 1048576).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
