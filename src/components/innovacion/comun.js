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

export const SEMAFOROS = {
  verde:    { texto: 'Verde',    clase: 'bg-emerald-50 text-emerald-700', ayuda: 'En tiempo y presupuesto' },
  amarillo: { texto: 'Amarillo', clase: 'bg-amber-50 text-amber-700',     ayuda: 'Desvío hasta 10 %' },
  rojo:     { texto: 'Rojo',     clase: 'bg-feisen-rojo-suave text-feisen-rojo', ayuda: 'Desvío mayor a 10 % o fase bloqueada' },
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
  { fase: 'Diseño',             entregable: 'Planos y lista de materiales aprobados', inicio: '', fin: '', responsable: '' },
  { fase: 'Prototipo',          entregable: 'Pieza o máquina prototipo', inicio: '', fin: '', responsable: '' },
  { fase: 'Pruebas',            entregable: 'Informe de pruebas con el indicador medido', inicio: '', fin: '', responsable: '' },
  { fase: 'Paso a producción',  entregable: 'Ficha de costo y orden de fabricación en el ERP', inicio: '', fin: '', responsable: '' },
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
export const fmtMeses = n => n == null ? '—' : `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} meses`
export const fmtPct = n => n == null ? '—' : `${Math.round(n * 100).toLocaleString('es-CO')} %`
