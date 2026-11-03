// Convierte el contenido de un documento en bloques ordenados (títulos numerados, párrafos,
// listas, tablas, diagrama). La vista en pantalla, el PDF y el Word recorren estos mismos
// bloques, así los tres salen iguales. Los formatos no pasan por aquí: salen como hoja en blanco.
import ESTRUCTURA from './estructura'
import { TIPOS } from './comun'

const lleno = v => Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim()

export function bloquesDocumento(tipo, contenido = {}) {
  const bloques = []
  let n = 0
  for (const parte of ESTRUCTURA[tipo].partes) {
    const v = contenido[parte.clave]
    if (!lleno(v)) continue
    n++
    bloques.push({ tipo: 'titulo', texto: `${n}. ${parte.titulo}` })
    if (parte.editor === 'texto' || parte.editor === 'numero') {
      String(v).split(/\n+/).filter(t => t.trim()).forEach(t => bloques.push({ tipo: 'parrafo', texto: t.trim() }))
    } else if (parte.editor === 'lista') {
      bloques.push({ tipo: 'lista', items: v.filter(t => String(t).trim()) })
    } else if (parte.editor === 'tabla' && parte.clave === 'capitulos') {
      v.forEach((c, i) => {
        bloques.push({ tipo: 'subtitulo', texto: `${n}.${i + 1} ${c.titulo || ''}` })
        String(c.texto || '').split(/\n+/).filter(t => t.trim()).forEach(t => bloques.push({ tipo: 'parrafo', texto: t.trim() }))
      })
    } else if (parte.editor === 'tabla') {
      bloques.push({
        tipo: 'tabla', columnas: parte.columnas.map(c => c.titulo), anchos: parte.columnas.map(c => c.ancho || 0),
        filas: v.map(f => parte.columnas.map(c => f[c.clave] || '')),
      })
    } else if (parte.editor === 'pasos') {
      const conRegistro = v.some(p => String(p.registro || '').trim())
      bloques.push({
        tipo: 'tabla',
        columnas: ['N.º', 'Actividad', 'Responsable', ...(conRegistro ? ['Registro'] : [])],
        anchos: conRegistro ? [7, 51, 20, 22] : [7, 66, 27],
        filas: v.map((p, i) => {
          const detalle = [p.detalle, p.decision && p.siNo ? `Si NO: ${p.siNo}` : ''].filter(t => String(t || '').trim()).join('\n')
          return [String(i + 1), { titulo: p.actividad || '', detalle }, p.responsable || '', ...(conRegistro ? [p.registro || ''] : [])]
        }),
      })
      bloques.push({ tipo: 'subtitulo', texto: `${n}.1 Diagrama de flujo` })
      bloques.push({ tipo: 'diagrama', pasos: v })
    }
  }
  return bloques
}

// Texto de una celda que puede ser { titulo, detalle }
export const textoCelda = c => typeof c === 'object' && c ? [c.titulo, c.detalle].filter(Boolean).join('\n') : String(c ?? '')

// Datos del encabezado y pie comunes a los tres formatos de salida
export function metaDocumento(manual, version) {
  return {
    codigo: manual.codigo,
    titulo: manual.titulo,
    tipo: TIPOS[manual.tipo]?.texto || '',
    area: manual.area,
    version: version?.version ?? '—',
    vigente: version?.estado === 'aprobada' ? version.vigente_desde : null,
    borrador: version?.estado !== 'aprobada',
    elaboro: version?.aprobado_externo ? 'Aprobado en papel' : version?.elaboro?.nombre || '',
    reviso: version?.aprobado_externo ? '' : version?.reviso?.nombre || '',
    aprobo: version?.aprobo?.nombre || '',
    fechaElaboro: version?.created_at?.slice(0, 10) || '',
    fechaReviso: version?.revisado_at?.slice(0, 10) || '',
    fechaAprobo: version?.aprobado_at?.slice(0, 10) || '',
  }
}

// Filas de control de cambios a partir de las versiones aprobadas (de la más vieja a la actual)
export const controlCambios = aprobadas => [...(aprobadas || [])]
  .sort((a, b) => a.version - b.version)
  .map(v => [String(v.version), v.vigente_desde || '', v.cambios || (v.version === 1 ? 'Versión inicial' : '')])

export const nombreArchivo = (manual, version, ext) =>
  `${manual.codigo}_v${version?.version ?? 0}_${manual.titulo}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(0, 90) + `.${ext}`
