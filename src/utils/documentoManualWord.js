import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber, PageOrientation,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx'
import { FEISEN_LOGO_PNG, LOGO_ASPECT } from './exportOrdenCompraPDF'
import { bloquesDocumento, controlCambios, metaDocumento, nombreArchivo } from '../components/manuales/documento'
import { svgAPng, svgDiagrama } from '../components/manuales/diagrama'

// Word (.docx) de un documento escrito en la app: mismo contenido que el PDF (encabezado ISO,
// secciones numeradas, diagrama, firmas y control de cambios). Lo que se edite en el Word NO
// vuelve a la app: el documento controlado es el de la app (lo dice el pie de página).

const AZUL = '064794'
const GRIS = '5B6472'
const BORDE = 'D2D6DC'
const FUENTE = 'Arial'

const bytes = dataUrl => Uint8Array.from(atob(dataUrl.split(',')[1]), ch => ch.charCodeAt(0))
const fechaCO = iso => iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const borde = { style: BorderStyle.SINGLE, size: 4, color: BORDE }
const bordes = { top: borde, bottom: borde, left: borde, right: borde }

const run = (text, o = {}) => new TextRun({ text, font: FUENTE, size: o.size || 20, bold: o.bold, color: o.color, italics: o.italics })
const parrafo = (text, o = {}) => new Paragraph({ children: [run(text, o)], spacing: { after: o.after ?? 120 }, alignment: o.align })

function celda(contenido, o = {}) {
  const lineas = typeof contenido === 'object' && contenido
    ? [run(contenido.titulo || '', { bold: true, size: 18 }), ...String(contenido.detalle || '').split('\n').filter(Boolean).map(t => run(t, { size: 18, color: GRIS }))]
    : String(contenido ?? '').split('\n').map(t => run(t, { size: o.size || 18, bold: o.bold, color: o.color }))
  return new TableCell({
    borders: bordes, verticalAlign: o.valign || VerticalAlign.TOP,
    width: o.ancho ? { size: o.ancho, type: WidthType.PERCENTAGE } : undefined,
    shading: o.fondo ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fondo } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: lineas.map(r => new Paragraph({ children: [r], alignment: o.align })),
  })
}

function tabla(columnas, filas, anchos = [], o = {}) {
  const total = anchos.reduce((s, a) => s + a, 0)
  const ancho = i => total ? (anchos[i] / total) * 100 : 100 / columnas.length
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: columnas.map((c, i) => celda(c, { bold: true, color: o.cabezaTexto || 'FFFFFF', fondo: o.cabezaFondo || AZUL, ancho: ancho(i) })) }),
      ...filas.map(f => new TableRow({ height: o.altoFila ? { value: o.altoFila, rule: 'atLeast' } : undefined, children: f.map((v, i) => celda(v, { ancho: ancho(i) })) })),
    ],
  })
}

function encabezado(meta) {
  const logoAncho = 150
  return new Header({
    children: [new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        children: [
          new TableCell({ borders: bordes, width: { size: 26, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: bytes(FEISEN_LOGO_PNG), transformation: { width: logoAncho, height: Math.round(logoAncho / LOGO_ASPECT) } })] })] }),
          new TableCell({ borders: bordes, width: { size: 46, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(meta.tipo.toUpperCase(), { size: 16, color: GRIS })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(meta.titulo, { size: 22, bold: true })] }),
            ] }),
          new TableCell({ borders: bordes, width: { size: 28, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, margins: { left: 90, right: 90 },
            children: [
              new Paragraph({ children: [run('Código: ', { size: 16, color: GRIS }), run(meta.codigo, { size: 16, bold: true })] }),
              new Paragraph({ children: [run('Versión: ', { size: 16, color: GRIS }), run(String(meta.version), { size: 16, bold: true })] }),
              new Paragraph({ children: [run('Vigente desde: ', { size: 16, color: GRIS }), run(meta.vigente ? fechaCO(meta.vigente) : 'Sin aprobar', { size: 16, bold: true })] }),
              new Paragraph({ children: [new TextRun({ font: FUENTE, size: 16, color: GRIS, children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES] })] }),
            ] }),
        ],
      })],
    }), new Paragraph({ text: '' })],
  })
}

const pie = () => new Footer({
  children: [new Paragraph({ children: [run('Documento controlado en Feisen ERP. Impreso, descargado o editado en Word es copia no controlada: verifica la versión vigente en la app.', { size: 14, color: GRIS })] })],
})

async function cuerpo(bloques) {
  const out = []
  for (const b of bloques) {
    if (b.tipo === 'titulo') out.push(new Paragraph({ spacing: { before: 240, after: 120 }, children: [run(b.texto, { size: 23, bold: true, color: AZUL })] }))
    else if (b.tipo === 'subtitulo') out.push(new Paragraph({ spacing: { before: 160, after: 100 }, children: [run(b.texto, { size: 20, bold: true })] }))
    else if (b.tipo === 'parrafo') out.push(parrafo(b.texto))
    else if (b.tipo === 'lista') b.items.forEach(t => out.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [run(t)] })))
    else if (b.tipo === 'tabla') { out.push(tabla(b.columnas, b.filas, b.anchos)); out.push(parrafo('')) }
    else if (b.tipo === 'diagrama') {
      const png = await svgAPng(svgDiagrama(b.pasos))
      const w = 460, h = Math.round((png.alto / png.ancho) * w)
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: bytes(png.dataUrl), transformation: { width: w, height: h } })] }))
    }
  }
  return out
}

function formato(contenido) {
  const out = []
  const campos = (contenido.encabezado || []).filter(Boolean)
  campos.forEach(c => out.push(parrafo(`${c}: ________________________________`, { after: 80 })))
  out.push(parrafo(''))
  const columnas = (contenido.columnas || []).map(x => x.nombre).filter(Boolean)
  const filas = Math.max(1, Math.min(60, parseInt(contenido.filas, 10) || 15))
  if (columnas.length) out.push(tabla(columnas, Array.from({ length: filas }, () => columnas.map(() => '')), [], { altoFila: 420 }))
  out.push(parrafo(''))
  out.push(tabla(['Observaciones'], [['']], [], { altoFila: 900, cabezaFondo: 'F1F3F6', cabezaTexto: GRIS }))
  const firmas = (contenido.firmas || []).filter(Boolean)
  if (firmas.length) {
    out.push(parrafo(''))
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ height: { value: 900, rule: 'atLeast' }, children: firmas.map(f => new TableCell({
        borders: { top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, bottom: borde },
        verticalAlign: VerticalAlign.BOTTOM, children: [new Paragraph('')],
      })) }), new TableRow({ children: firmas.map(f => new TableCell({ borders: { top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE } },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(f, { size: 17 })] })] })) })],
    }))
  }
  const instrucciones = (contenido.instrucciones || []).filter(Boolean)
  if (instrucciones.length) {
    out.push(new Paragraph({ spacing: { before: 200, after: 60 }, children: [run('Cómo se llena', { size: 17, bold: true, color: GRIS })] }))
    instrucciones.forEach(t => out.push(new Paragraph({ bullet: { level: 0 }, children: [run(t, { size: 17, color: GRIS })] })))
  }
  return out
}

function firmasYCambios(meta, cambios) {
  const out = [new Paragraph({ spacing: { before: 280, after: 120 }, children: [run('Aprobación', { size: 23, bold: true, color: AZUL })] })]
  out.push(tabla(['Elaboró', 'Revisó', 'Aprobó'], [
    [meta.elaboro || '—', meta.reviso || '—', meta.aprobo || (meta.borrador ? 'Pendiente' : '—')],
    [fechaCO(meta.fechaElaboro), meta.fechaReviso ? fechaCO(meta.fechaReviso) : '—', meta.fechaAprobo ? fechaCO(meta.fechaAprobo) : '—'],
  ], [], { cabezaFondo: 'EEF4FB', cabezaTexto: AZUL }))
  if (cambios.length) {
    out.push(new Paragraph({ spacing: { before: 280, after: 120 }, children: [run('Control de cambios', { size: 23, bold: true, color: AZUL })] }))
    out.push(tabla(['Versión', 'Vigente desde', 'Descripción del cambio'], cambios.map(([v, f, t]) => [v, f ? fechaCO(f) : '—', t]), [12, 20, 68], { cabezaFondo: 'EEF4FB', cabezaTexto: AZUL }))
  }
  return out
}

export async function exportarDocumentoWord({ manual, version, contenido, aprobadas }) {
  const meta = metaDocumento(manual, version)
  const esFormato = manual.tipo === 'formato'
  const horizontal = esFormato && (contenido.columnas || []).length > 6
  const children = [
    ...(meta.borrador ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run('BORRADOR — no es válido hasta que se apruebe en la app', { bold: true, color: 'B4271D' })] })] : []),
    ...(esFormato ? formato(contenido) : [...await cuerpo(bloquesDocumento(manual.tipo, contenido)), ...firmasYCambios(meta, controlCambios(aprobadas))]),
  ]
  const doc = new Document({
    creator: 'Feisen ERP', title: `${meta.codigo} ${meta.titulo}`,
    styles: { default: { document: { run: { font: FUENTE, size: 20 } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 900, left: 1000, right: 1000, header: 400, footer: 400 }, size: horizontal ? { orientation: PageOrientation.LANDSCAPE } : undefined } },
      headers: { default: encabezado(meta) }, footers: { default: pie() }, children,
    }],
  })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombreArchivo(manual, version, 'docx')
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
