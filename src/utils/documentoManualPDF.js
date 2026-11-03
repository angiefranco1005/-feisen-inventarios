import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FEISEN_LOGO_PNG, LOGO_ASPECT } from './exportOrdenCompraPDF'
import { bloquesDocumento, controlCambios, metaDocumento, nombreArchivo, textoCelda } from '../components/manuales/documento'
import { svgAPng, svgDiagrama } from '../components/manuales/diagrama'

// PDF de un documento escrito en la app (módulo Manuales). Encabezado ISO en cada página
// (logo · tipo y título · código, versión, vigencia, página X de Y), contenido numerado,
// diagrama de flujo, firmas elaboró/revisó/aprobó y control de cambios. Si la versión no está
// aprobada sale con marca de agua BORRADOR. Los formatos salen como hoja en blanco para llenar.

const AZUL = [6, 71, 148]
const TEXTO = [31, 41, 55]
const GRIS = [91, 100, 114]
const BORDE = [210, 214, 220]
const M = 15            // margen
const TOPE = 42         // donde empieza el contenido (debajo del encabezado)

const fechaCO = iso => iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function encabezado(doc, meta, pagina, total) {
  const W = doc.internal.pageSize.getWidth()
  const ancho = W - 2 * M
  const y = 10, h = 26
  const wLogo = 46, wDer = 52, wCentro = ancho - wLogo - wDer
  doc.setDrawColor(...BORDE); doc.setLineWidth(0.3)
  doc.rect(M, y, ancho, h)
  doc.line(M + wLogo, y, M + wLogo, y + h)
  doc.line(M + wLogo + wCentro, y, M + wLogo + wCentro, y + h)
  const lw = 38
  doc.addImage(FEISEN_LOGO_PNG, 'PNG', M + (wLogo - lw) / 2, y + (h - lw / LOGO_ASPECT) / 2, lw, lw / LOGO_ASPECT)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS)
  doc.text(meta.tipo.toUpperCase(), M + wLogo + wCentro / 2, y + 8, { align: 'center' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...TEXTO)
  const tit = doc.splitTextToSize(meta.titulo, wCentro - 8).slice(0, 3)
  doc.text(tit, M + wLogo + wCentro / 2, y + 15 - (tit.length - 1) * 2.4, { align: 'center' })
  const x = M + wLogo + wCentro
  const filas = [['Código', meta.codigo], ['Versión', String(meta.version)], ['Vigente desde', meta.vigente ? fechaCO(meta.vigente) : 'Sin aprobar'], ['Página', `${pagina} de ${total}`]]
  filas.forEach(([k, v], i) => {
    const yy = y + (h / 4) * i
    if (i) doc.line(x, yy, x + wDer, yy)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS)
    doc.text(k, x + 2.5, yy + 4.4)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...TEXTO)
    doc.text(v, x + wDer - 2.5, yy + 4.4, { align: 'right' })
  })
}

function pie(doc) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...BORDE); doc.line(M, H - 12, W - M, H - 12)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS)
  doc.text('Documento controlado en Feisen ERP. Impreso o descargado es copia no controlada: verifica la versión vigente en la app.', M, H - 7.5)
  doc.text(`Generado el ${fechaCO(new Date().toISOString())}`, W - M, H - 7.5, { align: 'right' })
}

function marcaBorrador(doc) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  doc.saveGraphicsState()
  doc.setGState(new doc.GState({ opacity: 0.09 }))
  doc.setFont('helvetica', 'bold'); doc.setFontSize(80); doc.setTextColor(180, 39, 29)
  doc.text('BORRADOR', W / 2, H / 2 + 20, { align: 'center', angle: 35 })
  doc.restoreGraphicsState()
}

// Cursor de escritura con salto de página
function cursor(doc) {
  const H = doc.internal.pageSize.getHeight()
  const c = {
    y: TOPE,
    ancho: doc.internal.pageSize.getWidth() - 2 * M,
    espacio(h) { if (c.y + h > H - 18) { doc.addPage(); c.y = TOPE } },
  }
  return c
}

const tablaBase = (doc, c, head, body, columnStyles = {}, extra = {}) => {
  autoTable(doc, {
    startY: c.y, head: [head], body, margin: { top: TOPE, left: M, right: M, bottom: 18 },
    theme: 'grid', columnStyles,
    styles: { font: 'helvetica', fontSize: 9, textColor: TEXTO, lineColor: BORDE, lineWidth: 0.2, cellPadding: 2, valign: 'top' },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
    ...extra,
  })
  c.y = doc.lastAutoTable.finalY + 6
}

async function escribirBloques(doc, c, bloques) {
  for (const b of bloques) {
    if (b.tipo === 'titulo' || b.tipo === 'subtitulo') {
      c.espacio(14)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(b.tipo === 'titulo' ? 11.5 : 10); doc.setTextColor(...(b.tipo === 'titulo' ? AZUL : TEXTO))
      doc.text(b.texto, M, c.y + 4); c.y += b.tipo === 'titulo' ? 8 : 7
    } else if (b.tipo === 'parrafo') {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TEXTO)
      for (const l of doc.splitTextToSize(b.texto, c.ancho)) { c.espacio(5); doc.text(l, M, c.y + 3.5); c.y += 4.8 }
      c.y += 2
    } else if (b.tipo === 'lista') {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TEXTO)
      for (const item of b.items) {
        doc.splitTextToSize(item, c.ancho - 6).forEach((l, i) => { c.espacio(5); if (!i) doc.text('•', M + 1, c.y + 3.5); doc.text(l, M + 6, c.y + 3.5); c.y += 4.8 })
      }
      c.y += 2
    } else if (b.tipo === 'tabla') {
      const total = b.anchos.reduce((s, a) => s + a, 0)
      const columnStyles = total ? Object.fromEntries(b.anchos.map((a, i) => [i, { cellWidth: (a / total) * c.ancho }])) : {}
      tablaBase(doc, c, b.columnas, b.filas.map(f => f.map(textoCelda)), columnStyles)
    } else if (b.tipo === 'diagrama') {
      const png = await svgAPng(svgDiagrama(b.pasos))
      const H = doc.internal.pageSize.getHeight()
      let w = Math.min(150, c.ancho), h = (png.alto / png.ancho) * w
      const maxH = H - TOPE - 22
      if (h > maxH) { w = w * (maxH / h); h = maxH }
      c.espacio(h + 4)
      doc.addImage(png.dataUrl, 'PNG', M + (c.ancho - w) / 2, c.y, w, h)
      c.y += h + 6
    }
  }
}

function firmasYCambios(doc, c, meta, cambios) {
  c.espacio(40)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...AZUL)
  doc.text('Aprobación', M, c.y + 4); c.y += 8
  tablaBase(doc, c, ['Elaboró', 'Revisó', 'Aprobó'], [
    [meta.elaboro || '—', meta.reviso || '—', meta.aprobo || (meta.borrador ? 'Pendiente' : '—')],
    [fechaCO(meta.fechaElaboro), meta.fechaReviso ? fechaCO(meta.fechaReviso) : '—', meta.fechaAprobo ? fechaCO(meta.fechaAprobo) : '—'],
  ], {}, { headStyles: { fillColor: [238, 244, 251], textColor: AZUL, fontStyle: 'bold' } })
  if (cambios.length) {
    c.espacio(24)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...AZUL)
    doc.text('Control de cambios', M, c.y + 4); c.y += 8
    tablaBase(doc, c, ['Versión', 'Vigente desde', 'Descripción del cambio'], cambios.map(([v, f, t]) => [v, f ? fechaCO(f) : '—', t]),
      { 0: { cellWidth: 18 }, 1: { cellWidth: 32 } }, { headStyles: { fillColor: [238, 244, 251], textColor: AZUL, fontStyle: 'bold' } })
  }
}

// Formato: hoja en blanco con datos generales, tabla con filas vacías, observaciones y firmas
function escribirFormato(doc, c, contenido) {
  const campos = (contenido.encabezado || []).filter(Boolean)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...TEXTO)
  const col = c.ancho / 2
  campos.forEach((campo, i) => {
    const x = M + (i % 2) * col, yy = c.y + Math.floor(i / 2) * 9
    doc.text(`${campo}:`, x, yy + 5)
    doc.setDrawColor(...GRIS); doc.line(x + doc.getTextWidth(`${campo}: `) + 1, yy + 5.5, x + col - 6, yy + 5.5)
  })
  c.y += Math.ceil(campos.length / 2) * 9 + 4
  const columnas = (contenido.columnas || []).map(x => x.nombre).filter(Boolean)
  const filas = Math.max(1, Math.min(60, parseInt(contenido.filas, 10) || 15))
  if (columnas.length) tablaBase(doc, c, columnas, Array.from({ length: filas }, () => columnas.map(() => '')), {}, { bodyStyles: { minCellHeight: 8 } })
  c.espacio(24)
  doc.setDrawColor(...BORDE); doc.rect(M, c.y, c.ancho, 18)
  doc.setFontSize(8.5); doc.setTextColor(...GRIS); doc.text('Observaciones:', M + 2, c.y + 4.5)
  c.y += 24
  const firmas = (contenido.firmas || []).filter(Boolean)
  if (firmas.length) {
    c.espacio(22)
    const w = c.ancho / firmas.length
    firmas.forEach((f, i) => {
      const x = M + i * w
      doc.setDrawColor(...GRIS); doc.line(x + 6, c.y + 12, x + w - 6, c.y + 12)
      doc.setFontSize(8.5); doc.setTextColor(...TEXTO); doc.text(f, x + w / 2, c.y + 16.5, { align: 'center' })
    })
    c.y += 22
  }
  const instrucciones = (contenido.instrucciones || []).filter(Boolean)
  if (instrucciones.length) {
    c.espacio(8 + instrucciones.length * 4.5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...GRIS); doc.text('Cómo se llena', M, c.y + 3.5); c.y += 5.5
    doc.setFont('helvetica', 'normal')
    instrucciones.forEach(t => doc.splitTextToSize(`• ${t}`, c.ancho).forEach(l => { doc.text(l, M, c.y + 3.5); c.y += 4.2 }))
  }
}

export async function exportarDocumentoPDF({ manual, version, contenido, aprobadas }) {
  const esFormato = manual.tipo === 'formato'
  const horizontal = esFormato && (contenido.columnas || []).length > 6
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: horizontal ? 'landscape' : 'portrait' })
  const meta = metaDocumento(manual, version)
  const c = cursor(doc)
  if (esFormato) escribirFormato(doc, c, contenido)
  else {
    await escribirBloques(doc, c, bloquesDocumento(manual.tipo, contenido))
    firmasYCambios(doc, c, meta, controlCambios(aprobadas))
  }
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    encabezado(doc, meta, i, total)
    pie(doc)
    if (meta.borrador) marcaBorrador(doc)
  }
  doc.save(nombreArchivo(manual, version, 'pdf'))
}
