// Piezas comunes del módulo Manuales (ver supabase/migraciones/2026-10-30_manuales.sql).
import { supabase } from '../../lib/supabase'
import { sinTildes } from '../../utils/busqueda'

export const BUCKET_MANUALES = 'manuales'

// Áreas de la empresa. `sigla` arma el código sugerido (PR-FUN-001).
export const AREAS = [
  { valor: 'General',          sigla: 'GEN' },
  { valor: 'Gerencia',         sigla: 'GER' },
  { valor: 'Inventarios',      sigla: 'INV' },
  { valor: 'Logística y compras', sigla: 'LOG' },
  { valor: 'Fundición',        sigla: 'FUN' },
  { valor: 'Mecanizados',      sigla: 'MEC' },
  { valor: 'Ensamble',         sigla: 'ENS' },
  { valor: 'Ventas',           sigla: 'VEN' },
  { valor: 'Calidad',          sigla: 'CAL' },
  { valor: 'Mantenimiento',    sigla: 'MAN' },
  { valor: 'Recursos Humanos', sigla: 'RH' },
  { valor: 'Finanzas',         sigla: 'FIN' },
]

export const TIPOS = {
  manual:        { texto: 'Manual',        sigla: 'MA', clase: 'bg-feisen-azul-suave text-feisen-azul' },
  procedimiento: { texto: 'Procedimiento', sigla: 'PR', clase: 'bg-gray-100 text-feisen-texto' },
  instructivo:   { texto: 'Instructivo',   sigla: 'IN', clase: 'bg-gray-100 text-feisen-texto' },
  formato:       { texto: 'Formato',       sigla: 'FO', clase: 'bg-gray-100 text-feisen-texto-2' },
  politica:      { texto: 'Política',      sigla: 'PO', clase: 'bg-gray-100 text-feisen-texto-2' },
}

// Siguiente código libre para un tipo y área: PR-FUN-001, PR-FUN-002…
export function codigoSugerido(tipo, area, codigosUsados) {
  const sigla = AREAS.find(a => a.valor === area)?.sigla
  if (!sigla || !TIPOS[tipo]) return ''
  const prefijo = `${TIPOS[tipo].sigla}-${sigla}-`
  let n = 1
  while (codigosUsados.has(`${prefijo}${String(n).padStart(3, '0')}`)) n++
  return `${prefijo}${String(n).padStart(3, '0')}`
}

export const tamanoArchivo = b => !b ? '' : b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`

// Estados de una versión (flujo en supabase/migraciones/2026-10-30_manuales_aprobacion.sql)
export const ESTADOS_VERSION = {
  borrador:    { texto: 'Borrador',          clase: 'bg-gray-100 text-feisen-texto-2' },
  en_revision: { texto: 'En revisión',       clase: 'bg-amber-50 text-amber-700' },
  revisada:    { texto: 'Revisada · por aprobar', clase: 'bg-feisen-azul-suave text-feisen-azul' },
  aprobada:    { texto: 'Aprobada',          clase: 'bg-emerald-50 text-emerald-700' },
}

// Campos de versión que usan la lista y la ficha (con los nombres de elaboró / revisó / aprobó)
export const SELECT_VERSION = 'id, manual_id, version, estado, archivo_path, archivo_nombre, archivo_tamano, cambios, vigente_desde, created_at, ' +
  'enviado_at, revisado_at, aprobado_at, aprobado_externo, comentario_revision, subido_por, ' +
  'elaboro:profiles!manual_versiones_subido_por_fkey(nombre), reviso:profiles!manual_versiones_revisado_por_fkey(nombre), ' +
  'aprobo:profiles!manual_versiones_aprobado_por_fkey(nombre)'

const subirArchivo = async (manualId, version, archivo) => {
  const limpio = sinTildes(archivo.name).replace(/[^\w.-]+/g, '_')
  const path = `${manualId}/v${version}-${Date.now()}-${limpio}`
  const { error } = await supabase.storage.from(BUCKET_MANUALES).upload(path, archivo)
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`)
  return path
}

// Crea el borrador de la versión `version` con su archivo. Queda vigente solo al aprobarse.
export async function crearBorrador({ manual, version, archivo, cambios, vigenteDesde, usuarioId }) {
  const path = await subirArchivo(manual.id, version, archivo)
  const { data, error } = await supabase.from('manual_versiones').insert({
    manual_id: manual.id, version, archivo_path: path, archivo_nombre: archivo.name, archivo_tamano: archivo.size,
    cambios: cambios?.trim() || null, vigente_desde: vigenteDesde || null, subido_por: usuarioId,
  }).select('id').single()
  if (error) { await supabase.storage.from(BUCKET_MANUALES).remove([path]); throw new Error(error.message) }
  return data.id
}

// Cambia el archivo de un borrador (p. ej. después de que lo devuelven con correcciones)
export async function reemplazarArchivo(version, archivo) {
  const path = await subirArchivo(version.manual_id, version.version, archivo)
  const { error } = await supabase.from('manual_versiones')
    .update({ archivo_path: path, archivo_nombre: archivo.name, archivo_tamano: archivo.size }).eq('id', version.id)
  if (error) { await supabase.storage.from(BUCKET_MANUALES).remove([path]); throw new Error(error.message) }
  await supabase.storage.from(BUCKET_MANUALES).remove([version.archivo_path])
}

export async function descartarBorrador(version) {
  const { error } = await supabase.from('manual_versiones').delete().eq('id', version.id)
  if (error) throw new Error(error.message)
  await supabase.storage.from(BUCKET_MANUALES).remove([version.archivo_path])
}

// enviar | revisar | aprobar | devolver | cargar_aprobado (las reglas viven en la base)
export async function accionVersion(versionId, accion, comentario = null) {
  const { error } = await supabase.rpc('manual_version_accion', { p_version: versionId, p_accion: accion, p_comentario: comentario })
  if (error) throw new Error(error.message)
}

// Abre el archivo en otra pestaña con un enlace temporal (5 min). La pestaña se abre antes
// del await para que el navegador del celular no la bloquee como ventana emergente.
export async function abrirArchivo(path) {
  const ventana = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(BUCKET_MANUALES).createSignedUrl(path, 300)
  if (error) { ventana?.close(); throw new Error(error.message) }
  if (ventana) ventana.location.href = data.signedUrl
  else window.location.href = data.signedUrl
}
