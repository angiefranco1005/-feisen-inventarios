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

// Sube el archivo como versión `version` del manual y deja esa versión como vigente.
export async function subirVersion({ manual, version, archivo, cambios, vigenteDesde, usuarioId }) {
  const limpio = sinTildes(archivo.name).replace(/[^\w.-]+/g, '_')
  const path = `${manual.id}/v${version}-${Date.now()}-${limpio}`
  const { error } = await supabase.storage.from(BUCKET_MANUALES).upload(path, archivo)
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`)
  const { error: errVer } = await supabase.from('manual_versiones').insert({
    manual_id: manual.id, version, archivo_path: path, archivo_nombre: archivo.name, archivo_tamano: archivo.size,
    cambios: cambios?.trim() || null, vigente_desde: vigenteDesde, subido_por: usuarioId,
  })
  if (errVer) { await supabase.storage.from(BUCKET_MANUALES).remove([path]); throw new Error(errVer.message) }
  const { error: errMan } = await supabase.from('manuales').update({ version_actual: version }).eq('id', manual.id)
  if (errMan) throw new Error(errMan.message)
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
