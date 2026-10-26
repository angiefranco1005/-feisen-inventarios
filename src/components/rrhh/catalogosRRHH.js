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
  'Almacén',
  'Logística',
  'Calidad',
  'Innovación',
]

export const TIPOS_DOCUMENTO = [
  { value: 'CC',  label: 'Cédula de ciudadanía' },
  { value: 'CE',  label: 'Cédula de extranjería' },
  { value: 'PPT', label: 'Permiso por protección temporal' },
  { value: 'TI',  label: 'Tarjeta de identidad' },
  { value: 'PA',  label: 'Pasaporte' },
]

export const TIPOS_CONTRATO = [
  'Término indefinido',
  'Término fijo',
  'Obra o labor',
  'Aprendizaje (SENA)',
  'Prestación de servicios',
]

export const JORNADAS     = ['Tiempo completo', 'Medio tiempo', 'Por turnos', 'Por horas']
export const GENEROS      = ['Femenino', 'Masculino', 'Otro']
export const ESTADOS_CIVILES = ['Soltero(a)', 'Casado(a)', 'Unión libre', 'Separado(a)', 'Viudo(a)']
export const GRUPOS_SANGUINEOS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']
export const NIVELES_EDUCATIVOS = ['Primaria', 'Bachiller', 'Técnico', 'Tecnólogo', 'Profesional', 'Especialización', 'Maestría']
export const TIPOS_CUENTA = ['Ahorros', 'Corriente', 'Nequi / Daviplata']
export const PARENTESCOS  = ['Padre', 'Madre', 'Cónyuge / Pareja', 'Hijo(a)', 'Hermano(a)', 'Otro']

export const TIPOS_ARCHIVO = [
  'Contrato',
  'Otrosí',
  'Documento de identidad',
  'Hoja de vida',
  'Certificados de estudio',
  'Afiliaciones (EPS, AFP, ARL, Caja)',
  'Examen médico',
  'Certificación bancaria',
  'Antecedentes',
  'Otro',
]

export const ESTADOS_EMPLEADO = {
  activo:   { label: 'Activo',   color: 'bg-green-100 text-green-700' },
  licencia: { label: 'Licencia', color: 'bg-amber-100 text-amber-700' },
  retirado: { label: 'Retirado', color: 'bg-gray-100 text-gray-500' },
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
