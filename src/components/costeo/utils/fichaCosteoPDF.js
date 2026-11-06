import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FEISEN_LOGO_PNG, LOGO_ASPECT, NIT_FEISEN } from '../../../utils/exportOrdenCompraPDF'

// PDF de la ficha de costeo como documento controlado (ISO 9001 y certificación de producto):
// encabezado con código / versión / fecha / página en cada hoja, identificación del producto,
// costo por unidad, desglose por proceso con la evidencia de cada medición de tiempo, método de
// cálculo, control de cambios y firmas de elaboró / revisó / aprobó.

const AZUL = [6, 71, 148]
const ROJO = [180, 39, 29]
const GRIS = [100, 100, 100]
const TEXTO = [30, 30, 30]
const FONDO = [244, 246, 249]
const MARGEN = 15
const TOP = 36 // espacio que ocupa el encabezado repetido

const cop = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const num = (n, d = 2) =>
  Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (n) => num(Number(n || 0) * 100, 1) + ' %'

function fechaLarga(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

const tablaBase = {
  theme: 'grid',
  margin: { left: MARGEN, right: MARGEN, top: TOP + 4 },
  styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, textColor: TEXTO, lineColor: [215, 219, 226], lineWidth: 0.1 },
  headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [250, 251, 253] },
}

/**
 * @param {object} d
 *   ficha, resumen (costeo_resumen), procesos (costeo_procesos + su fila de costeo_procesos_resumen en .costo),
 *   materiales {proceso_id: [...]}, tiempos {proceso_id: [...]}, piezas [{nombre, cantidad, costo_unitario}],
 *   equipos [{nombre, horas, valor_hora}], versiones (costeo_fichas_versiones, incluida la que se emite),
 *   doc {codigo, version, fecha, elaboro, reviso, aprobo}
 */
export function exportarFichaCosteoPDF(d) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  let y = TOP + 6

  function titulo(texto) {
    if (y > H - 40) {
      doc.addPage()
      y = TOP + 6
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...AZUL)
    doc.text(texto, MARGEN, y)
    y += 3
  }
  const despues = () => {
    y = doc.lastAutoTable.finalY + 7
  }

  // ── 1. Identificación del producto ──
  titulo('1. Identificación del producto')
  autoTable(doc, {
    ...tablaBase,
    startY: y,
    theme: 'plain',
    styles: { ...tablaBase.styles, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48, textColor: GRIS }, 2: { fontStyle: 'bold', cellWidth: 40, textColor: GRIS } },
    body: [
      ['Producto', d.ficha.nombre, 'Tipo', d.ficha.tipo === 'pieza' ? 'Pieza / componente' : 'Máquina'],
      ['Referencia / modelo', d.ficha.referencia || '-', 'Unidad de costeo', '1 unidad'],
      ['Fecha de corte de precios', fechaLarga(d.doc.fecha), 'Período de CIF', d.resumen?.cif_periodo_usado || '-'],
    ],
  })
  despues()

  // ── 2. Costo por unidad ──
  const r = d.resumen || {}
  titulo('2. Costo de producción por unidad')
  const filasCosto = [
    ['Materia prima', cop(r.total_mp)],
    ['Mano de obra directa (tiempos reales)', cop(r.total_mod)],
    ['Costos indirectos de fabricación (CIF)', cop(r.cif_asignado)],
  ]
  if (Number(r.total_equipos) > 0) filasCosto.push(['Equipos de planta (hora-máquina)', cop(r.total_equipos)])
  if (Number(r.costo_piezas_incluidas) > 0) filasCosto.push(['Sub-piezas incluidas', cop(r.costo_piezas_incluidas)])
  filasCosto.push(['COSTO TOTAL POR UNIDAD', cop(r.costo_total)])
  if (Number(r.precio_venta_actual) > 0) {
    filasCosto.push(['Precio de venta', cop(r.precio_venta_actual)])
    filasCosto.push(['Margen', `${cop(r.margen)}  (${pct(r.margen_pct)})`])
  }
  const iTotal = filasCosto.findIndex((f) => f[0] === 'COSTO TOTAL POR UNIDAD')
  autoTable(doc, {
    ...tablaBase,
    startY: y,
    head: [['Concepto', 'Valor']],
    body: filasCosto,
    columnStyles: { 1: { halign: 'right', cellWidth: 55 } },
    didParseCell: (c) => {
      if (c.section === 'body' && c.row.index === iTotal) {
        c.cell.styles.fontStyle = 'bold'
        c.cell.styles.fillColor = FONDO
        c.cell.styles.textColor = ROJO
      }
    },
    tableWidth: 130,
  })
  despues()

  // ── 3. Resumen por proceso ──
  titulo('3. Costo por proceso')
  const pendientes = d.procesos.filter((p) => p.tipo_pago === 'hora' && !(Number(p.costo?.mediciones) > 0))
  autoTable(doc, {
    ...tablaBase,
    startY: y,
    head: [['#', 'Proceso', 'Pago', 'h-h / und', 'Materia prima', 'Mano de obra', 'CIF', 'Total']],
    body: d.procesos.map((p, i) => [
      String(i + 1),
      p.nombre,
      p.tipo_pago === 'destajo' ? 'Destajo' : 'Por hora',
      num(p.costo?.horas_hombre_unidad),
      cop(p.costo?.total_mp),
      cop(p.costo?.total_mod),
      cop(p.costo?.cif),
      cop(p.costo?.costo_total),
    ]),
    columnStyles: { 0: { cellWidth: 7 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right', fontStyle: 'bold' } },
  })
  despues()
  if (pendientes.length) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...ROJO)
    const t = doc.splitTextToSize(
      `Costo incompleto: ${pendientes.map((p) => p.nombre).join(', ')} ${pendientes.length === 1 ? 'no tiene' : 'no tienen'} tiempos medidos; su mano de obra y CIF figuran en $ 0.`,
      W - MARGEN * 2
    )
    doc.text(t, MARGEN, y - 3)
    y += 4 * t.length
  }

  // ── 4. Detalle y evidencia por proceso ──
  titulo('4. Detalle y evidencia por proceso')
  y += 2
  d.procesos.forEach((p, i) => {
    if (y > H - 50) {
      doc.addPage()
      y = TOP + 6
    }
    const c = p.costo || {}
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...TEXTO)
    doc.text(`4.${i + 1}  ${p.nombre}`, MARGEN, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    doc.text(
      `${p.tipo_pago === 'destajo' ? `A destajo: ${cop(p.precio_destajo)} por unidad` : `Por hora: ${cop(p.tarifa_hora)}/h`}  ·  Centro de costo: ${c.centro_costo_usado || '-'}  ·  Total del proceso: ${cop(c.costo_total)}`,
      MARGEN,
      y + 4.5
    )
    y += 7

    const mats = d.materiales[p.id] || []
    autoTable(doc, {
      ...tablaBase,
      startY: y,
      head: [['Materia prima', 'Cantidad / und', 'Unidad', 'Precio unitario', 'Subtotal']],
      body: mats.length
        ? mats.map((m) => [
            (m.items?.nombre ?? m.item_nombre_libre) + (m.item_id ? '' : ' (fuera de catálogo)'),
            num(m.cantidad, m.rendimiento ? 4 : 2) + (m.rendimiento ? ` (rinde ${num(m.rendimiento, 0)})` : ''),
            m.items?.unidad_medida || '',
            cop(m.items?.precio_costo),
            cop(Number(m.cantidad) * Number(m.items?.precio_costo || 0)),
          ])
        : [[{ content: 'Este proceso no consume materia prima.', colSpan: 5, styles: { textColor: GRIS } }]],
      columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      headStyles: { ...tablaBase.headStyles, fillColor: [90, 110, 140] },
    })
    y = doc.lastAutoTable.finalY + 2

    const ts = d.tiempos[p.id] || []
    autoTable(doc, {
      ...tablaBase,
      startY: y,
      head: [['Fecha', 'Orden', 'Responsable', 'Horario', 'Operarios', 'Horas', 'Unidades', 'h-h / und']],
      body: ts.length
        ? ts.map((t) => [
            t.fecha,
            t.orden || '',
            t.responsable || '',
            t.hora_inicio && t.hora_fin
              ? `${t.hora_inicio.slice(0, 5)} a ${t.hora_fin.slice(0, 5)}${Number(t.pausa_min) > 0 ? ` (pausa ${num(t.pausa_min, 0)} min)` : ''}`
              : '',
            num(t.num_operarios, 0),
            num(t.horas),
            num(t.unidades, 0),
            num((Number(t.num_operarios) * Number(t.horas)) / Number(t.unidades || 1)),
          ])
        : [[{ content: 'Sin mediciones de tiempo registradas.', colSpan: 8, styles: { textColor: ROJO } }]],
      foot: ts.length
        ? [[{ content: `Promedio ponderado (${ts.length} ${ts.length === 1 ? 'medición' : 'mediciones'}, ${num(c.unidades_medidas, 0)} ${Number(c.unidades_medidas) === 1 ? 'unidad' : 'unidades'})`, colSpan: 7 }, num(c.horas_hombre_unidad)]]
        : undefined,
      footStyles: { fillColor: FONDO, textColor: TEXTO, fontStyle: 'bold', halign: 'right' },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
      headStyles: { ...tablaBase.headStyles, fillColor: [90, 110, 140] },
    })
    y = doc.lastAutoTable.finalY + 3.5
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    const mo =
      p.tipo_pago === 'destajo'
        ? `Mano de obra = precio a destajo ${cop(p.precio_destajo)}`
        : `Mano de obra = ${num(c.horas_hombre_unidad)} h-h × ${cop(p.tarifa_hora)} = ${cop(c.total_mod)}`
    doc.text(`${mo}   ·   CIF = ${num(c.horas_hombre_unidad)} h-h × ${cop(c.tasa_cif_hora)}/h = ${cop(c.cif)}`, MARGEN, y)
    y += 8
  })

  // ── 5. Sub-piezas y equipos ──
  if (d.piezas.length || d.equipos.length) {
    titulo('5. Sub-piezas y equipos de planta')
    if (d.piezas.length) {
      autoTable(doc, {
        ...tablaBase,
        startY: y,
        head: [['Sub-pieza (tiene su propia ficha de costeo)', 'Cantidad', 'Costo unitario', 'Subtotal']],
        body: d.piezas.map((p) => [p.nombre, num(p.cantidad, 0), cop(p.costo_unitario), cop(p.costo_unitario * p.cantidad)]),
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      })
      despues()
    }
    if (d.equipos.length) {
      autoTable(doc, {
        ...tablaBase,
        startY: y,
        head: [['Equipo de planta', 'Horas / und', 'Valor hora-máquina', 'Subtotal']],
        body: d.equipos.map((e) => [e.nombre, num(e.horas), cop(e.valor_hora), cop(e.horas * e.valor_hora)]),
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      })
      despues()
    }
  }

  // ── Método de cálculo ──
  titulo(`${d.piezas.length || d.equipos.length ? '6' : '5'}. Método de cálculo`)
  y += 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...TEXTO)
  const metodo = [
    '• Materia prima: cantidad por unidad × precio de costo vigente en el inventario de Feisen a la fecha de corte.',
    '• Mano de obra por hora: promedio ponderado de los tiempos reales medidos en planta, (suma de operarios × horas) ÷ (suma de unidades buenas), multiplicado por la tarifa por hora del proceso. A destajo: precio pactado por unidad.',
    '• CIF: horas-hombre por unidad del proceso × tasa del centro de costo (CIF del período ÷ horas de mano de obra del centro en el período).',
    '• Sub-piezas: costo total de su propia ficha × cantidad usada. Equipos de planta: horas × valor hora-máquina (depreciación + mantenimiento + energía ÷ horas disponibles al año).',
  ]
  metodo.forEach((linea) => {
    const t = doc.splitTextToSize(linea, W - MARGEN * 2)
    doc.text(t, MARGEN, y)
    y += 4.2 * t.length
  })
  y += 4

  // ── Control de cambios ──
  titulo(`${d.piezas.length || d.equipos.length ? '7' : '6'}. Control de cambios`)
  autoTable(doc, {
    ...tablaBase,
    startY: y,
    head: [['Versión', 'Fecha', 'Descripción del cambio', 'Costo total', 'Elaboró']],
    body: d.versiones.map((v) => [String(v.version), v.fecha, v.descripcion, cop(v.costo_total), v.elaboro || '']),
    columnStyles: { 0: { cellWidth: 16, halign: 'center' }, 1: { cellWidth: 22 }, 3: { halign: 'right', cellWidth: 30 } },
  })
  despues()

  // ── Firmas ──
  if (y > H - 45) {
    doc.addPage()
    y = TOP + 6
  }
  y += 14
  const ancho = (W - MARGEN * 2 - 20) / 3
  ;[
    ['Elaboró', d.doc.elaboro],
    ['Revisó', d.doc.reviso],
    ['Aprobó', d.doc.aprobo],
  ].forEach(([rol, nombre], i) => {
    const x = MARGEN + i * (ancho + 10)
    doc.setDrawColor(...GRIS)
    doc.setLineWidth(0.3)
    doc.line(x, y, x + ancho, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...TEXTO)
    doc.text(nombre || '', x, y + 4.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRIS)
    doc.text(rol, x, y + 8.5)
  })

  // ── Encabezado y pie en todas las páginas ──
  const total = doc.getNumberOfPages()
  const generado = new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    const logoW = 44
    try {
      doc.addImage(FEISEN_LOGO_PNG, 'PNG', MARGEN, 9, logoW, logoW / LOGO_ASPECT)
    } catch {
      // sin logo el documento sigue siendo válido
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRIS)
    doc.text(`Feisen S.A.S. · NIT ${NIT_FEISEN}`, MARGEN, 9 + logoW / LOGO_ASPECT + 4)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...AZUL)
    doc.text('FICHA DE COSTEO DE PRODUCTO', W / 2 + 2, 15, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...TEXTO)
    doc.text(doc.splitTextToSize(d.ficha.nombre, 70)[0], W / 2 + 2, 21, { align: 'center' })

    // Recuadro de control del documento
    const bw = 52
    const bx = W - MARGEN - bw
    autoTable(doc, {
      startY: 8,
      margin: { left: bx },
      tableWidth: bw,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 0.9, textColor: TEXTO, lineColor: [200, 205, 215], lineWidth: 0.1 },
      columnStyles: { 0: { fontStyle: 'bold', textColor: GRIS, cellWidth: 18 } },
      body: [
        ['Código', d.doc.codigo],
        ['Versión', String(d.doc.version)],
        ['Fecha', d.doc.fecha],
        ['Página', `${i} de ${total}`],
      ],
    })
    doc.setDrawColor(...AZUL)
    doc.setLineWidth(0.6)
    doc.line(MARGEN, TOP - 4, W - MARGEN, TOP - 4)

    doc.setFontSize(7)
    doc.setTextColor(...GRIS)
    doc.text(
      `Generado desde el ERP Feisen el ${generado} · Documento controlado: la versión vigente es la registrada en el ERP; toda copia impresa es copia no controlada.`,
      W / 2,
      H - 8,
      { align: 'center', maxWidth: W - MARGEN * 2 }
    )
  }

  const nombreArchivo = `${d.doc.codigo} v${d.doc.version} - ${d.ficha.nombre}`.replace(/[\\/:*?"<>|]/g, '-')
  doc.save(`${nombreArchivo}.pdf`)
}
