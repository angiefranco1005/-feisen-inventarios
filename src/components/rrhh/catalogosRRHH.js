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

export const TIPOS_CONTRATO = ['Indefinido', 'Término fijo', 'Contratista']

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
export const OTROS_DOCUMENTOS = ['Otrosí', 'Hoja de vida', 'Certificación bancaria', 'Otro']

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
