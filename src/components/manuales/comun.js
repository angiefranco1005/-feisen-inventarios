// Piezas comunes del módulo Manuales (ver supabase/migraciones/2026-10-30_manuales.sql).
import { useEffect, useState } from 'react'
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

// Campos de versión que usan la lista y la ficha
export const SELECT_VERSION = 'id, manual_id, version, estado, archivo_path, archivo_nombre, archivo_tamano, cambios, vigente_desde, created_at, ' +
  'enviado_at, revisado_at, aprobado_at, aprobado_externo, comentario_revision, subido_por, revisado_por, aprobado_por, contenido'

// Agrega { elaboro, reviso, aprobo: { nombre } } a cada versión. Los nombres salen por la función
// manual_nombres porque las reglas de profiles no dejan ver a los demás (salvo a ADMIN).
export async function ponerNombres(versiones) {
  const ids = [...new Set(versiones.flatMap(v => [v.subido_por, v.revisado_por, v.aprobado_por]).filter(Boolean))]
  const { data } = ids.length ? await supabase.rpc('manual_nombres', { p_ids: ids }) : { data: [] }
  const nombre = Object.fromEntries((data || []).map(p => [p.id, { nombre: p.nombre }]))
  return versiones.map(v => ({ ...v, elaboro: nombre[v.subido_por] || null, reviso: nombre[v.revisado_por] || null, aprobo: nombre[v.aprobado_por] || null }))
}

// ¿El documento va dirigido a este rol? (igual que manual_dirigido en la base; ADMIN nunca)
export const dirigidoA = (manual, rol) => !!rol && rol !== 'ADMIN' && (!manual.dirigido_a?.length || manual.dirigido_a.includes(rol))

// Avisa al menú que cambiaron los pendientes de Manuales (para refrescar el contador)
export const avisarCambioManuales = () => window.dispatchEvent(new Event('manuales-cambio'))

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
  if (version.archivo_path) await supabase.storage.from(BUCKET_MANUALES).remove([version.archivo_path])
}

export async function descartarBorrador(version) {
  const { error } = await supabase.from('manual_versiones').delete().eq('id', version.id)
  if (error) throw new Error(error.message)
  if (version.archivo_path) await supabase.storage.from(BUCKET_MANUALES).remove([version.archivo_path])
}

// Borrador escrito en la app (asistente): sin archivo, con el contenido estructurado del tipo
export async function crearBorradorEscrito({ manual, version, contenido, cambios, usuarioId }) {
  const { data, error } = await supabase.from('manual_versiones').insert({
    manual_id: manual.id, version, contenido, cambios: cambios?.trim() || null, subido_por: usuarioId,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id
}

// Crea un documento nuevo a partir de una plantilla de la guía ISO, con su borrador v1 escrito
export async function crearDesdeGuia({ item, contenidoInicial, codigo, usuarioId }) {
  const { data: manual, error } = await supabase.from('manuales').insert({
    codigo, titulo: item.titulo, tipo: item.tipo, area: item.area, responsable: item.responsable,
    dirigido_a: item.dirigido || [], plantilla: item.clave, creado_por: usuarioId,
  }).select().single()
  if (error) throw new Error(error.message)
  await crearBorradorEscrito({ manual, version: 1, contenido: contenidoInicial, cambios: 'Versión inicial', usuarioId })
  return manual
}

// ---------- Imágenes y video de los documentos escritos en la app ----------
// Se guardan en `<manual_id>/media/` del bucket. Un medio es { path } (subido por un usuario) o
// { url } (imagen fija de la app, p. ej. los pantallazos de las plantillas en public/manuales/).
export const MAX_VIDEO_MB = 50

// Achica la foto (máx. 1600 px) y la pasa a JPEG: las del celular pesan 4–8 MB
function reducirImagen(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(img.src)
      c.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo procesar la imagen')), 'image/jpeg', 0.85)
    }
    img.onerror = () => reject(new Error('El archivo no es una imagen que el navegador pueda abrir (usa JPG o PNG).'))
    img.src = URL.createObjectURL(file)
  })
}

export async function subirMedio(manualId, file, tipo) {
  if (tipo === 'video' && file.size > MAX_VIDEO_MB * 1048576) throw new Error(`El video pesa ${tamanoArchivo(file.size)}; el máximo es ${MAX_VIDEO_MB} MB. Grábalo más corto o en menor calidad.`)
  const cuerpo = tipo === 'imagen' ? await reducirImagen(file) : file
  const nombre = tipo === 'imagen' ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name
  const path = `${manualId}/media/${Date.now()}-${sinTildes(nombre).replace(/[^\w.-]+/g, '_')}`
  const { error } = await supabase.storage.from(BUCKET_MANUALES).upload(path, cuerpo, { contentType: tipo === 'imagen' ? 'image/jpeg' : file.type || undefined })
  if (error) throw new Error(`No se pudo subir: ${error.message}`)
  return { path, nombre, tamano: cuerpo.size }
}

// Todos los medios de un contenido (imágenes de los pasos y el video)
export const mediosDe = contenido => [
  ...(contenido?.pasos || []).map(p => p.imagen).filter(Boolean),
  ...(contenido?.video ? [contenido.video] : []),
]

// URLs para mostrar los medios: las fijas tal cual; las subidas, con enlace firmado de 1 hora
export function useUrlsMedios(contenido) {
  const paths = mediosDe(contenido).map(m => m.path).filter(Boolean)
  const clave = paths.join('|')
  const [firmadas, setFirmadas] = useState({})
  useEffect(() => {
    const faltan = clave ? clave.split('|').filter(p => !firmadas[p]) : []
    if (!faltan.length) return
    let vivo = true
    supabase.storage.from(BUCKET_MANUALES).createSignedUrls(faltan, 3600).then(({ data }) => {
      if (vivo && data) setFirmadas(f => ({ ...f, ...Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])) }))
    })
    return () => { vivo = false }
  }, [clave]) // eslint-disable-line react-hooks/exhaustive-deps
  return m => !m ? null : m.url || firmadas[m.path] || null
}

// Imagen lista para el PDF y el Word: { dataUrl (JPEG), ancho, alto }
export async function imagenComoDatos(medio) {
  let src = medio.url
  if (!src) {
    const { data, error } = await supabase.storage.from(BUCKET_MANUALES).createSignedUrl(medio.path, 300)
    if (error) throw new Error(error.message)
    src = data.signedUrl
  }
  const blob = await (await fetch(src)).blob()
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('No se pudo leer una imagen')); i.src = url })
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0)
    return { dataUrl: c.toDataURL('image/jpeg', 0.88), ancho: c.width, alto: c.height }
  } finally { URL.revokeObjectURL(url) }
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
