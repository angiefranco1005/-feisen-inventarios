// Catálogos y utilidades compartidas del módulo de Recursos Humanos.
// Listas fijas en código por ahora (fase 1); si la coordinadora necesita
// editarlas, se pasan a tablas configurables.
import { supabase } from '../../lib/supabase'

export const BUCKET_RRHH = 'rrhh'

export const AREAS = [
  'Administración',
  'Comercial',
  'Fundición',
  'Mecanizados',
  'Soldadura y Armado',
  'Pintura',
  'Almacén y Logística',   // una sola área desde 2026-10-26 (decisión de Angie)
  'Innovación',
]

export const TIPOS_DOCUMENTO = [
  { value: 'CC',  label: 'Cédula de ciudadanía' },
  { value: 'CE',  label: 'Cédula de extranjería' },
  { value: 'PPT', label: 'Permiso por protección temporal' },
  { value: 'TI',  label: 'Tarjeta de identidad' },
  { value: 'PA',  label: 'Pasaporte' },
]

export const TIPOS_CONTRATO = ['Indefinido', 'Término fijo', 'Contratista', 'Aprendiz SENA · etapa lectiva', 'Aprendiz SENA · etapa práctica']

// Contrato de aprendizaje (Ley 789 de 2002): tiene fecha fin como el término fijo,
// pero no lleva preaviso y lo que se paga es apoyo de sostenimiento, no salario
export const esAprendiz = (tipo) => (tipo || '').startsWith('Aprendiz SENA')
export const tieneFechaFin = (tipo) => tipo === 'Término fijo' || esAprendiz(tipo)

// Agrupación amplia para filtrar: planta (indefinido y término fijo), contratistas y aprendices
export const GRUPOS_VINCULO = [
  { value: 'planta',      label: 'De planta' },
  { value: 'contratista', label: 'Contratistas' },
  { value: 'aprendiz',    label: 'Aprendices SENA' },
]
export function grupoVinculoDe(tipo) {
  if (tipo === 'Contratista') return 'contratista'
  if (esAprendiz(tipo)) return 'aprendiz'
  return ['Indefinido', 'Término fijo'].includes(tipo) ? 'planta' : null
}

// Solo para contratistas: cómo se les paga
export const TIPOS_VINCULACION = [
  { value: 'destajo', label: 'Al destajo (por piezas)' },
  { value: 'dia',     label: 'Al día (por días trabajados)' },
]

// Fecha fin de un contrato a término fijo: ingreso + N meses − 1 día
// (ingreso 15-mar con 6 meses → 14-sep). Devuelve 'YYYY-MM-DD' o ''.
export function calcularFinContrato(fechaIngreso, meses) {
  const n = parseInt(meses, 10)
  if (!fechaIngreso || !Number.isFinite(n) || n <= 0) return ''
  const [a, m, d] = fechaIngreso.split('-').map(Number)
  // Si el mes destino es más corto (31-ene + 1 mes) se toma su último día
  const ultimoDia = new Date(a, m - 1 + n + 1, 0).getDate()
  const fin = new Date(a, m - 1 + n, Math.min(d, ultimoDia) - 1)
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}`
}

export const JORNADAS     = ['Tiempo completo', 'Medio tiempo', 'Por turnos', 'Por horas']
export const GENEROS      = ['Femenino', 'Masculino', 'Otro']
export const ESTADOS_CIVILES = ['Soltero(a)', 'Casado(a)', 'Unión libre', 'Separado(a)', 'Viudo(a)']
export const GRUPOS_SANGUINEOS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']
export const NIVELES_EDUCATIVOS = ['Primaria', 'Bachiller', 'Técnico', 'Tecnólogo', 'Profesional', 'Especialización', 'Maestría']
export const TIPOS_CUENTA = ['Ahorros', 'Corriente', 'Nequi / Daviplata']
export const PERIODICIDADES = ['Mensual', 'Trimestral', 'Semestral', 'Anual']
export const PARENTESCOS  = ['Padre', 'Madre', 'Cónyuge / Pareja', 'Hijo(a)', 'Hermano(a)', 'Otro']

// Checklist de documentos de ingreso que pide RRHH a cada colaborador
// (definido por Angie, 2026-10-26). El nombre es el `tipo` en empleado_documentos.
export const DOCUMENTOS_REQUERIDOS = [
  'Fotocopia de la cédula',
  'Antecedentes',
  'Contrato',
  'Certificado de estudio',
  'Certificado laboral',
  'Política de tratamiento de datos',
  'Certificados de afiliación',
  'Exámenes médicos',
  'Aceptación de política de SG-SST',
  'Perfil sociodemográfico',
]

// Documentos que no hacen parte del checklist pero se pueden adjuntar
export const TIPO_DOC_PREAVISO = 'Preaviso de no prórroga'
export const OTROS_DOCUMENTOS = ['Otrosí', 'Hoja de vida', 'Certificación bancaria', TIPO_DOC_PREAVISO, 'Otro']

export const ESTADOS_EMPLEADO = {
  activo:   { label: 'Activo',   punto: 'bg-green-500' },
  licencia: { label: 'Licencia', punto: 'bg-amber-500' },
  retirado: { label: 'Retirado', punto: 'bg-gray-300' },
}

export function nombreCompleto(e) {
  return `${e?.nombres || ''} ${e?.apellidos || ''}`.trim()
}

export function iniciales(e) {
  return `${e?.nombres?.charAt(0) || ''}${e?.apellidos?.charAt(0) || ''}`.toUpperCase() || '?'
}

// Fechas DATE de Postgres llegan 'YYYY-MM-DD'; se leen como fecha local
// (new Date('2026-10-26') las toma en UTC y en Colombia corre un día atrás).
function fechaLocal(iso) {
  if (!iso) return null
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function formatoFecha(iso) {
  const f = fechaLocal(iso)
  return f ? f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

// "3 años, 2 meses" desde una fecha hasta hoy (o hasta `hasta`)
export function tiempoDesde(iso, hasta = null) {
  const ini = fechaLocal(iso)
  if (!ini) return null
  const fin = hasta ? fechaLocal(hasta) : new Date()
  let meses = (fin.getFullYear() - ini.getFullYear()) * 12 + (fin.getMonth() - ini.getMonth())
  if (fin.getDate() < ini.getDate()) meses--
  if (meses < 0) return null
  const anios = Math.floor(meses / 12)
  const resto = meses % 12
  if (anios === 0 && resto === 0) return 'Menos de 1 mes'
  return [anios && `${anios} año${anios > 1 ? 's' : ''}`, resto && `${resto} mes${resto > 1 ? 'es' : ''}`]
    .filter(Boolean).join(', ')
}

export function edad(iso) {
  const n = fechaLocal(iso)
  if (!n) return null
  const hoy = new Date()
  let a = hoy.getFullYear() - n.getFullYear()
  if (hoy < new Date(hoy.getFullYear(), n.getMonth(), n.getDate())) a--
  return a
}

// Días que faltan para el vencimiento del contrato (negativo = ya venció)
export function diasParaVencer(iso) {
  const f = fechaLocal(iso)
  if (!f) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return Math.round((f - hoy) / 86400000)
}

export function formatoPesos(v) {
  if (v === null || v === undefined || v === '') return '—'
  return Number(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

// URLs firmadas (el bucket es privado). Devuelve { path: url }.
export async function urlsFirmadas(paths, segundos = 3600) {
  const validos = paths.filter(Boolean)
  if (validos.length === 0) return {}
  const { data } = await supabase.storage.from(BUCKET_RRHH).createSignedUrls(validos, segundos)
  const mapa = {}
  for (const r of data || []) if (r.signedUrl) mapa[r.path] = r.signedUrl
  return mapa
}

// Reduce la foto a máx. 800 px en JPEG antes de subirla: las fotos de celular
// pesan 3–8 MB y harían lento el listado. Si el navegador no puede leer la
// imagen (p. ej. HEIC en Chrome), se sube el archivo original.
async function comprimirFoto(file, max = 800) {
  try {
    const bmp = await createImageBitmap(file)
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * escala)
    canvas.height = Math.round(bmp.height * escala)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85))
    return blob ? { blob, ext: 'jpg', tipo: 'image/jpeg' } : null
  } catch {
    return null
  }
}

// Sube la foto del colaborador, actualiza empleados.foto_path y borra la anterior.
// Devuelve el nuevo path; lanza Error con mensaje legible si algo falla.
export async function subirFotoEmpleado(empleadoId, file, pathAnterior = null) {
  if (!file.type.startsWith('image/')) throw new Error('La foto debe ser una imagen (JPG o PNG).')
  const c = await comprimirFoto(file)
  const cuerpo = c?.blob || file
  const ext = c?.ext || (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${empleadoId}/foto-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET_RRHH)
    .upload(path, cuerpo, { contentType: c?.tipo || file.type, upsert: false })
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`)
  const { error: errUpd } = await supabase.from('empleados').update({ foto_path: path }).eq('id', empleadoId)
  if (errUpd) {
    await supabase.storage.from(BUCKET_RRHH).remove([path])
    throw new Error(`No se pudo guardar la foto: ${errUpd.message}`)
  }
  if (pathAnterior) await supabase.storage.from(BUCKET_RRHH).remove([pathAnterior])
  return path
}

// ─── Organigrama ─────────────────────────────────────────────────────────────
// Agrupa los cargos por su cargo superior. Un cargo cuyo superior no existe se
// trata como raíz (no se pierde del árbol).
export function hijosPorPadre(cargos) {
  const ids = new Set(cargos.map(c => c.id))
  const mapa = new Map()
  for (const c of cargos) {
    const padre = c.cargo_padre_id && ids.has(c.cargo_padre_id) ? c.cargo_padre_id : null
    if (!mapa.has(padre)) mapa.set(padre, [])
    mapa.get(padre).push(c)
  }
  for (const lista of mapa.values()) lista.sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre))
  return mapa
}

// Ids de todos los cargos que dependen (directa o indirectamente) de `id`:
// no pueden elegirse como su cargo superior porque formarían un ciclo.
export function descendientes(cargos, id) {
  const hijos = hijosPorPadre(cargos)
  const fuera = new Set()
  const pila = [id]
  while (pila.length) {
    const actual = pila.pop()
    for (const h of hijos.get(actual) || []) if (!fuera.has(h.id)) { fuera.add(h.id); pila.push(h.id) }
  }
  return fuera
}

// Abre un archivo del bucket privado en otra pestaña con URL firmada (5 min).
// La pestaña se abre antes del await para que el navegador no la bloquee.
export async function abrirArchivoRRHH(path) {
  const ventana = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(BUCKET_RRHH).createSignedUrl(path, 300)
  if (error || !data?.signedUrl) { ventana?.close(); throw new Error(error?.message || 'No se pudo abrir el archivo.') }
  if (ventana) ventana.location.href = data.signedUrl
  else window.location.href = data.signedUrl
}

// ─── Novedades (ausencias) ───────────────────────────────────────────────────
// `conteo`: cómo se sugieren los días (vacaciones = días hábiles; el resto,
// días calendario). `soporte`: si normalmente lleva soporte (para marcar los
// que faltan). `remunerable`: si se pregunta si es remunerado.
export const TIPOS_NOVEDAD = {
  incapacidad: {
    label: 'Incapacidad', plural: 'Incapacidades', punto: 'bg-rose-500', texto: 'text-rose-600',
    conteo: 'calendario', soporte: true, remunerable: false,
    subtipos: ['Enfermedad general', 'Accidente de trabajo', 'Enfermedad laboral'],
  },
  permiso: {
    label: 'Permiso', plural: 'Permisos', punto: 'bg-sky-500', texto: 'text-sky-600',
    conteo: 'calendario', soporte: false, remunerable: true,
    subtipos: ['Cita médica', 'Calamidad doméstica', 'Diligencia personal', 'Estudio', 'Otro'],
  },
  vacaciones: {
    label: 'Vacaciones', plural: 'Vacaciones', punto: 'bg-emerald-500', texto: 'text-emerald-600',
    conteo: 'habiles', soporte: false, remunerable: false,
    subtipos: ['Disfrutadas', 'Anticipadas', 'Compensadas en dinero'],
  },
  licencia: {
    label: 'Licencia', plural: 'Licencias', punto: 'bg-violet-500', texto: 'text-violet-600',
    conteo: 'calendario', soporte: true, remunerable: true,
    // Licencia de luto: 5 días hábiles (Ley 1280 de 2009)
    conteoPorSubtipo: { Luto: 'habiles' },
    subtipos: ['Maternidad', 'Paternidad', 'Luto', 'Remunerada', 'No remunerada', 'Otra'],
  },
}

// Para filtrar por tipo de vinculación (contrato + modalidad del contratista)
export function vinculacionDe(emp) {
  if (!emp?.tipo_contrato) return 'Sin contrato registrado'
  if (emp.tipo_contrato === 'Contratista') {
    const v = TIPOS_VINCULACION.find(t => t.value === emp.tipo_vinculacion)
    return v ? `Contratista · ${v.value === 'destajo' ? 'Al destajo' : 'Al día'}` : 'Contratista'
  }
  return emp.tipo_contrato
}
export const VINCULACIONES = ['Indefinido', 'Término fijo', 'Contratista · Al destajo', 'Contratista · Al día', 'Contratista', 'Aprendiz SENA · etapa lectiva', 'Aprendiz SENA · etapa práctica']

const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const hoyISO = () => isoLocal(new Date())

// Festivos de Colombia de un año (Ley 51 de 1983 / "Ley Emiliani"): fijos,
// trasladables al lunes siguiente y los que dependen de la Pascua.
// Devuelve un Map 'YYYY-MM-DD' → nombre del festivo.
const cacheFestivos = new Map()
export function festivosColombia(anio) {
  if (cacheFestivos.has(anio)) return cacheFestivos.get(anio)
  const lunes = (d) => { const x = new Date(d); const dia = x.getDay(); if (dia !== 1) x.setDate(x.getDate() + ((8 - dia) % 7)); return x }
  // Domingo de Pascua (algoritmo de Butcher / Meeus)
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  const pascua = new Date(anio, mes - 1, dia)
  const masDias = (n) => { const x = new Date(pascua); x.setDate(x.getDate() + n); return x }
  const lista = [
    [new Date(anio, 0, 1),   'Año Nuevo'],
    [lunes(new Date(anio, 0, 6)),   'Día de los Reyes Magos'],
    [lunes(new Date(anio, 2, 19)),  'Día de San José'],
    [masDias(-3),            'Jueves Santo'],
    [masDias(-2),            'Viernes Santo'],
    [new Date(anio, 4, 1),   'Día del Trabajo'],
    [lunes(masDias(39)),     'Ascensión del Señor'],
    [lunes(masDias(60)),     'Corpus Christi'],
    [lunes(masDias(68)),     'Sagrado Corazón'],
    [lunes(new Date(anio, 5, 29)),  'San Pedro y San Pablo'],
    [new Date(anio, 6, 20),  'Día de la Independencia'],
    [new Date(anio, 7, 7),   'Batalla de Boyacá'],
    [lunes(new Date(anio, 7, 15)),  'Asunción de la Virgen'],
    [lunes(new Date(anio, 9, 12)),  'Día de la Raza'],
    [lunes(new Date(anio, 10, 1)),  'Todos los Santos'],
    [lunes(new Date(anio, 10, 11)), 'Independencia de Cartagena'],
    [new Date(anio, 11, 8),  'Inmaculada Concepción'],
    [new Date(anio, 11, 25), 'Navidad'],
  ]
  const mapa = new Map(lista.map(([fecha, nombre]) => [isoLocal(fecha), nombre]))
  cacheFestivos.set(anio, mapa)
  return mapa
}

// Festivos que caen entre dos fechas: [{ fecha, nombre }]
export function festivosEntre(ini, fin) {
  if (!ini || !fin || fin < ini) return []
  const out = []
  for (let an = Number(ini.slice(0, 4)); an <= Number(fin.slice(0, 4)); an++) {
    for (const [fecha, nombre] of festivosColombia(an)) if (fecha >= ini && fecha <= fin) out.push({ fecha, nombre })
  }
  return out.sort((x, y) => x.fecha.localeCompare(y.fecha))
}

function fechaDe(iso) { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d) }

export function diasCalendario(ini, fin) {
  if (!ini || !fin || fin < ini) return 0
  return Math.round((fechaDe(fin) - fechaDe(ini)) / 86400000) + 1
}

// Días hábiles entre dos fechas: lunes a viernes sin festivos (en Feisen no se
// trabaja el sábado; confirmado por Angie el 2026-10-26, igual que la nómina)
export function diasHabiles(ini, fin) {
  if (!ini || !fin || fin < ini) return 0
  let n = 0
  for (let d = fechaDe(ini); d <= fechaDe(fin); d.setDate(d.getDate() + 1)) {
    const dia = d.getDay()
    if (dia >= 1 && dia <= 5 && !festivosColombia(d.getFullYear()).has(isoLocal(d))) n++
  }
  return n
}

// Cómo se cuentan los días de una novedad: 'habiles' o 'calendario'
export function conteoNovedad(tipo, subtipo) {
  const t = TIPOS_NOVEDAD[tipo]
  return t?.conteoPorSubtipo?.[subtipo] || t?.conteo || 'calendario'
}

export function horasEntre(hIni, hFin) {
  if (!hIni || !hFin) return 0
  const [a, b] = hIni.split(':').map(Number), [c, d] = hFin.split(':').map(Number)
  const min = (c * 60 + d) - (a * 60 + b)
  return min > 0 ? Math.round((min / 60) * 100) / 100 : 0
}

// ─── Cumpleaños ──────────────────────────────────────────────────────────────
// Fecha del cumpleaños de una persona en un año dado ('YYYY-MM-DD'). Quien nació
// un 29 de febrero lo celebra el 28 en años no bisiestos.
export function cumpleEnAnio(fechaNacimiento, anio) {
  if (!fechaNacimiento) return null
  const [, m, d] = fechaNacimiento.split('-').map(Number)
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0
  const dia = m === 2 && d === 29 && !bisiesto ? 28 : d
  return `${anio}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// Próximos cumpleaños desde hoy (incluido) dentro de `dias` días, ordenados.
// Devuelve [{ empleado, fecha, cumple (años que cumple), enDias }]
export function proximosCumpleanos(empleados, dias = 30) {
  const hoy = hoyISO()
  const anio = Number(hoy.slice(0, 4))
  const out = []
  for (const e of empleados) {
    if (!e.fecha_nacimiento || e.estado === 'retirado') continue
    let f = cumpleEnAnio(e.fecha_nacimiento, anio)
    if (f < hoy) f = cumpleEnAnio(e.fecha_nacimiento, anio + 1)
    const enDias = diasCalendario(hoy, f) - 1
    if (enDias <= dias) out.push({ empleado: e, fecha: f, cumple: Number(f.slice(0, 4)) - Number(e.fecha_nacimiento.slice(0, 4)), enDias })
  }
  return out.sort((a, b) => a.enDias - b.enDias)
}

// ─── Preaviso de contratos a término fijo ────────────────────────────────────
// Para no prorrogar un contrato a término fijo hay que avisar por escrito con
// mínimo 30 días de anticipación (CST art. 46). Feisen quiere el recordatorio
// 35 días antes del vencimiento para tener margen.
export const DIAS_RECORDATORIO_PREAVISO = 35
export const DIAS_PREAVISO_LEGAL = 30

export function sumarDias(iso, n) {
  const d = fechaDe(iso); d.setDate(d.getDate() + n)
  return isoLocal(d)
}

// { aviso, limite, fin, entregado } del contrato vigente, o null si no aplica.
// `entregado` = { fecha, aTiempo, conCarta } si ya se registró el preaviso para ESTA fecha fin.
export function preavisoDe(emp) {
  if (!emp || emp.estado === 'retirado' || emp.tipo_contrato !== 'Término fijo' || !emp.fecha_fin_contrato) return null
  const fin = emp.fecha_fin_contrato
  const limite = sumarDias(fin, -DIAS_PREAVISO_LEGAL)
  const entregado = emp.preaviso_fecha_entrega && emp.preaviso_para_fin === fin
    ? { fecha: emp.preaviso_fecha_entrega, aTiempo: emp.preaviso_fecha_entrega <= limite, conCarta: !!emp.preaviso_documento_id }
    : null
  return { fin, aviso: sumarDias(fin, -DIAS_RECORDATORIO_PREAVISO), limite, entregado }
}

// Preavisos que ya toca dar (desde 35 días antes y hasta el vencimiento), ordenados por fecha límite.
export function preavisosPendientes(empleados) {
  const hoy = hoyISO()
  return empleados
    .map(e => ({ empleado: e, ...preavisoDe(e) }))
    .filter(p => p.fin && p.aviso <= hoy && p.fin >= hoy && !p.entregado)
    .map(p => ({ ...p, diasAlLimite: diasCalendario(hoy, p.limite) - 1 }))
    .sort((a, b) => a.limite.localeCompare(b.limite))
}
