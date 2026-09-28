import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const AZUL = [6, 71, 148]   // #064794
const ROJO = [180, 39, 29]  // #B4271D
const GRIS = [90, 90, 90]

const NIT_FEISEN = '900.595.456-2'

function copFmt(n) {
  return '$' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fechaLarga(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Genera el PDF de una orden de compra y lo descarga.
 *
 * @param {object} orden - fila de `ordenes_compra` (numero, fecha, razon_social, ciudad, observaciones)
 * @param {object} proveedor - fila de `proveedores` (nombre, nit, contacto, telefono, email, direccion) o null
 * @param {Array}  items - filas de `orden_compra_items` (descripcion, unidad, cantidad, precio_unitario)
 * @param {object} pedido - { numero } del pedido de origen, o null
 * @param {string} generadoPor - nombre de quien generó la orden
 */
export function exportarOrdenCompraPDF(orden, proveedor, items, pedido, generadoPor) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15

  // ── Encabezado ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...AZUL)
  doc.text(orden.razon_social || 'Feisen S.A.S.', margin, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text(`NIT ${NIT_FEISEN} · ${orden.ciudad || 'Soacha'}, Cundinamarca`, margin, 26)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...ROJO)
  doc.text('ORDEN DE COMPRA', pageWidth - margin, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRIS)
  doc.text(`N.° ${orden.numero}`, pageWidth - margin, 26, { align: 'right' })
  doc.text(fechaLarga(orden.fecha), pageWidth - margin, 31, { align: 'right' })

  doc.setDrawColor(...AZUL)
  doc.setLineWidth(0.6)
  doc.line(margin, 35, pageWidth - margin, 35)

  // ── Proveedor ──
  let y = 43
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...AZUL)
  doc.text('Proveedor', margin, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(30, 30, 30)
  doc.text(proveedor?.nombre || 'Sin proveedor asignado', margin, y)
  y += 5
  const lineasProveedor = []
  if (proveedor?.nit) lineasProveedor.push(`NIT: ${proveedor.nit}`)
  if (proveedor?.contacto) lineasProveedor.push(`Contacto: ${proveedor.contacto}`)
  if (proveedor?.telefono) lineasProveedor.push(`Tel: ${proveedor.telefono}`)
  if (lineasProveedor.length) {
    doc.setTextColor(...GRIS)
    doc.text(lineasProveedor.join('   ·   '), margin, y)
    y += 5
  }
  if (proveedor?.direccion) {
    doc.text(proveedor.direccion, margin, y)
    y += 5
  }
  if (pedido?.numero) {
    doc.setTextColor(...GRIS)
    doc.text(`Pedido de origen: ${pedido.numero}`, margin, y)
    y += 5
  }

  // ── Tabla de productos ──
  const filas = items.map((it, idx) => [
    String(idx + 1),
    it.descripcion,
    Number(it.cantidad).toLocaleString('es-CO'),
    it.unidad || '',
    copFmt(it.precio_unitario),
    copFmt(it.cantidad * it.precio_unitario),
  ])

  autoTable(doc, {
    startY: y + 4,
    head: [['#', 'Descripción', 'Cantidad', 'Unidad', 'Precio unitario', 'Subtotal']],
    body: filas,
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 9, textColor: [30, 30, 30], lineColor: [225, 225, 225] },
    headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      2: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    alternateRowStyles: { fillColor: [247, 249, 252] },
  })

  const total = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0)
  let yFinal = doc.lastAutoTable.finalY + 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...AZUL)
  doc.text(`Total: ${copFmt(total)}`, pageWidth - margin, yFinal, { align: 'right' })
  yFinal += 10

  if (orden.observaciones) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...GRIS)
    doc.text('Observaciones', margin, yFinal)
    yFinal += 5
    doc.setFont('helvetica', 'normal')
    const obsLines = doc.splitTextToSize(orden.observaciones, pageWidth - margin * 2)
    doc.text(obsLines, margin, yFinal)
    yFinal += obsLines.length * 4.5 + 6
  }

  // ── Firma ──
  const yFirma = Math.max(yFinal + 15, doc.internal.pageSize.getHeight() - 40)
  doc.setDrawColor(180, 180, 180)
  doc.line(margin, yFirma, margin + 70, yFirma)
  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text('Autorizado por', margin, yFirma + 5)
  if (generadoPor) doc.text(generadoPor, margin, yFirma + 10)

  doc.setFontSize(7.5)
  doc.setTextColor(160, 160, 160)
  doc.text(
    `Generado desde el sistema de inventario de ${orden.razon_social || 'Feisen S.A.S.'}`,
    margin, doc.internal.pageSize.getHeight() - 10
  )

  doc.save(`${orden.numero}.pdf`)
}
