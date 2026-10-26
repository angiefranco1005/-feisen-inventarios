// Desprendible de pago de la nómina quincenal (RRHH). Un PDF con una página
// por persona: devengos, deducciones, total a pagar y firma de recibido.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FEISEN_LOGO_PNG, LOGO_ASPECT, NIT_FEISEN } from './exportOrdenCompraPDF'
import { esContratista, etiquetasPago, valorHoraRecargo } from '../components/rrhh/nomina/nominaCalculo'

const AZUL = [6, 71, 148]
const GRIS = [110, 110, 110]
const GRIS_CLARO = [246, 248, 251]
const n = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v))
const pesos = (v) => n(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const cant = (v) => n(v).toLocaleString('es-CO', { maximumFractionDigits: 2 })
const FORMA = { destajo: 'Destajo (por pieza)', dia: 'Al día', fijo: 'Valor fijo' }

// Filas de devengos y deducciones de una liquidación: [concepto, cantidad, valor unitario, total]
export function conceptosLiquidacion(l) {
  const T = etiquetasPago(l.tipo_contrato ? l.tipo_contrato === 'Contratista' : esContratista(null, l.modalidad))
  const dev = []
  for (const p of l.piezas || []) dev.push([p.descripcion, cant(p.cantidad), pesos(p.valor_unitario), n(p.cantidad) * n(p.valor_unitario)])
  if (n(l.dias)) dev.push(['Días trabajados', cant(l.dias), pesos(l.valor_dia), n(l.dias) * n(l.valor_dia)])
  if (n(l.valor_fijo)) dev.push(['Valor fijo de la quincena', '', '', n(l.valor_fijo)])
  if (n(l.horas_extra)) dev.push([T.horas, cant(l.horas_extra), pesos(l.valor_hora_extra), n(l.horas_extra) * n(l.valor_hora_extra)])
  if (n(l.horas_extra_recargo)) dev.push([T.recargo, cant(l.horas_extra_recargo), pesos(valorHoraRecargo(l)), n(l.horas_extra_recargo) * valorHoraRecargo(l)])
  if (n(l.auxilio)) dev.push(['Auxilio', '', '', n(l.auxilio)])
  if (n(l.subsidio_ss)) dev.push(['Subsidio a seguridad social', '', '', n(l.subsidio_ss)])
  for (const o of l.otros_devengos || []) if (n(o.valor)) dev.push([o.concepto || 'Otro', '', '', n(o.valor)])
  if (n(l.descuento_tiempo_pieza)) dev.push(['Descuento por tiempo o pieza dañada', '', '', -n(l.descuento_tiempo_pieza)])
  const ded = []
  if (n(l.seguridad)) ded.push(['Seguridad social (planilla)', n(l.seguridad)])
  if (n(l.anticipo)) ded.push(['Anticipo', n(l.anticipo)])
  if (n(l.dotacion_herramienta)) ded.push(['Dotación / herramienta', n(l.dotacion_herramienta)])
  for (const o of l.otras_deducciones || []) if (n(o.valor)) ded.push([o.concepto || 'Otra deducción', n(o.valor)])
  return { dev, ded }
}

// Encabezado y totales de las columnas numéricas alineados a la derecha, como los valores
const alinearNumeros = (d) => { if (d.column.index > 0 && d.section !== 'body') d.cell.styles.halign = 'right' }

function pagina(doc, l, periodo) {
  const ancho = doc.internal.pageSize.getWidth()
  const m = 15
  // alias 'logo': la imagen se guarda una sola vez aunque haya muchas páginas (PDF más liviano para el correo)
  try { doc.addImage(FEISEN_LOGO_PNG, 'PNG', m, 12, 48, 48 / LOGO_ASPECT, 'logo', 'FAST') } catch { /* sin logo no se bloquea */ }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...AZUL)
  doc.text('Desprendible de pago', ancho - m, 17, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRIS)
  doc.text(periodo, ancho - m, 22, { align: 'right' })
  doc.text(`Feisen S.A.S. · NIT ${NIT_FEISEN}`, ancho - m, 26.5, { align: 'right' })

  // Datos de la persona
  let y = 38
  doc.setDrawColor(225, 225, 225); doc.line(m, y - 4, ancho - m, y - 4)
  const dato = (etq, val, x, yy) => {
    doc.setFontSize(8); doc.setTextColor(...GRIS); doc.text(etq, x, yy)
    doc.setFontSize(10); doc.setTextColor(30, 30, 30); doc.text(String(val || '—'), x, yy + 4.5)
  }
  dato('Nombre', l.nombre, m, y)
  dato('Documento', l.documento, m + 95, y)
  dato('Cargo', [l.cargo, l.area].filter(Boolean).join(' · '), m, y + 11)
  dato('Forma de pago', FORMA[l.modalidad] || l.modalidad, m + 95, y + 11)
  y += 24

  const { dev, ded } = conceptosLiquidacion(l)
  autoTable(doc, {
    startY: y,
    head: [['Devengos', 'Cantidad', 'Valor unitario', 'Total']],
    body: dev.length ? dev.map(([c, q, v, t]) => [c, q, v, pesos(t)]) : [['Sin devengos', '', '', pesos(0)]],
    foot: [['Total devengado', '', '', pesos(l.total_devengado)]],
    margin: { left: m, right: m },
    styles: { font: 'helvetica', fontSize: 9, textColor: [30, 30, 30], lineColor: [225, 225, 225] },
    headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: [235, 240, 248], textColor: [30, 30, 30], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 34 } },
    alternateRowStyles: { fillColor: GRIS_CLARO },
    didParseCell: alinearNumeros,
  })
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 5,
    head: [['Deducciones', 'Total']],
    body: ded.length ? ded.map(([c, t]) => [c, pesos(t)]) : [['Sin deducciones', pesos(0)]],
    foot: [['Total deducciones', pesos(l.total_deducciones)]],
    margin: { left: m, right: m },
    styles: { font: 'helvetica', fontSize: 9, textColor: [30, 30, 30], lineColor: [225, 225, 225] },
    headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: [235, 240, 248], textColor: [30, 30, 30], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 34 } },
    alternateRowStyles: { fillColor: GRIS_CLARO },
    didParseCell: alinearNumeros,
  })

  // Total a pagar
  y = doc.lastAutoTable.finalY + 8
  doc.setFillColor(...AZUL); doc.roundedRect(m, y, ancho - 2 * m, 12, 2, 2, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255)
  doc.text('TOTAL A PAGAR', m + 5, y + 8)
  doc.text(pesos(l.neto), ancho - m - 5, y + 8, { align: 'right' })

  if (l.observaciones) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRIS)
    doc.text(doc.splitTextToSize(`Observaciones: ${l.observaciones}`, ancho - 2 * m), m, y + 19)
  }

  // Firma
  const yf = Math.max(y + 40, doc.internal.pageSize.getHeight() - 45)
  doc.setDrawColor(150, 150, 150); doc.line(m, yf, m + 75, yf)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30)
  doc.text('Recibí conforme', m, yf + 5)
  doc.setTextColor(...GRIS); doc.text(`${l.nombre} · ${l.documento || ''}`, m, yf + 9.5)
}

// lista: liquidaciones con { nombre, documento, cargo, area, modalidad, piezas, ...campos y totales }
export function crearDesprendibles(lista, periodo) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true })
  lista.forEach((l, i) => { if (i > 0) doc.addPage(); pagina(doc, l, periodo) })
  return doc
}

// Un solo desprendible en base64 (para adjuntarlo al correo)
export function desprendibleBase64(l, periodo) {
  return crearDesprendibles([l], periodo).output('datauristring').split(',')[1]
}

export const nombreArchivoDesprendible = (l, p) =>
  `desprendible_${(l.nombre || 'colaborador').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_')}_${p.anio}_${String(p.mes).padStart(2, '0')}_q${p.quincena}.pdf`

export function generarDesprendibles(lista, periodo, nombreArchivo) {
  crearDesprendibles(lista, periodo).save(`${nombreArchivo}.pdf`)
}
