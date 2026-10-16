import XLSX from 'xlsx-js-style'
import { formatFechaHora, TIPOS_MOVIMIENTO } from './formatters'

// ─────────────────────────────────────────────────────────────
//  PALETA DE COLORES FEISEN
// ─────────────────────────────────────────────────────────────
const C = {
  azul:       '064794',
  azulOscuro: '1B3A5C',
  azulClaro:  'DBEAFE',
  azulPale:   'EFF6FF',
  rojo:       'B4271D',
  grisClaro:  'F1F5F9',
  grisLinea:  'E2E8F0',
  grisTexto:  '64748B',
  textoOsc:   '1E293B',
  blanco:     'FFFFFF',
}

// ─────────────────────────────────────────────────────────────
//  HELPERS DE ESTILO
// ─────────────────────────────────────────────────────────────
const fill   = rgb => ({ type: 'pattern', patternType: 'solid', fgColor: { rgb } })
const font   = (rgb, bold = false, sz = 10) => ({ color: { rgb }, bold, sz })
const alin   = (h = 'left', v = 'center', wrap = false) => ({ horizontal: h, vertical: v, wrapText: wrap })
const borde  = (color = C.grisLinea, style = 'thin') => ({
  top:    { style, color: { rgb: color } },
  bottom: { style, color: { rgb: color } },
  left:   { style, color: { rgb: color } },
  right:  { style, color: { rgb: color } },
})

// Estilos reutilizables por tipo de fila
const S = {
  titulo: {
    font: font(C.blanco, true, 12),
    fill: fill(C.azul),
    alignment: alin('left'),
    border: borde(C.azulOscuro, 'medium'),
  },
  encabezado: {
    font: font(C.blanco, true, 10),
    fill: fill(C.azulOscuro),
    alignment: alin('center', 'center', true),
    border: borde(C.azul),
  },
  encabezadoR: {  // encabezado con número alineado a la derecha
    font: font(C.blanco, true, 10),
    fill: fill(C.azulOscuro),
    alignment: alin('right', 'center'),
    border: borde(C.azul),
  },
  categoria: {
    font: font(C.azul, true, 10),
    fill: fill(C.azulClaro),
    alignment: alin('left'),
    border: borde(C.grisLinea),
  },
  itemPar: {
    font: font(C.textoOsc, false, 10),
    fill: fill(C.blanco),
    alignment: alin('left'),
    border: borde(C.grisLinea),
  },
  itemImpar: {
    font: font(C.textoOsc, false, 10),
    fill: fill(C.azulPale),
    alignment: alin('left'),
    border: borde(C.grisLinea),
  },
  itemNum: (par) => ({
    font: font(C.textoOsc, false, 10),
    fill: fill(par ? C.blanco : C.azulPale),
    alignment: alin('right'),
    border: borde(C.grisLinea),
  }),
  subtotal: {
    font: font(C.grisTexto, true, 10),
    fill: fill(C.grisClaro),
    alignment: alin('left'),
    border: borde(C.grisLinea),
  },
  subtotalNum: {
    font: font(C.azulOscuro, true, 10),
    fill: fill(C.grisClaro),
    alignment: alin('right'),
    border: borde(C.grisLinea),
    numFmt: '"$"#,##0',
  },
  total: {
    font: font(C.blanco, true, 11),
    fill: fill(C.azul),
    alignment: alin('left'),
    border: borde(C.azulOscuro, 'medium'),
  },
  totalNum: {
    font: font(C.blanco, true, 11),
    fill: fill(C.azul),
    alignment: alin('right'),
    border: borde(C.azulOscuro, 'medium'),
    numFmt: '"$"#,##0',
  },
  info: {
    font: font(C.grisTexto, false, 10),
    fill: fill(C.blanco),
    alignment: alin('left'),
    border: borde(C.grisLinea),
  },
}

// Aplica un estilo a todas las celdas de una fila
function estRow(ws, R, nCols, estilo) {
  for (let C = 0; C < nCols; C++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: C })
    if (!ws[addr]) ws[addr] = { v: '', t: 's' }
    ws[addr].s = estilo
  }
}

// Aplica estilo celda por celda con estilos por columna
function estRowCols(ws, R, estilos) {
  estilos.forEach((estilo, C) => {
    const addr = XLSX.utils.encode_cell({ r: R, c: C })
    if (!ws[addr]) ws[addr] = { v: '', t: 's' }
    ws[addr].s = estilo
  })
}

// Merge de columnas en una fila
function mergeFila(ws, R, c0, c1) {
  if (!ws['!merges']) ws['!merges'] = []
  ws['!merges'].push({ s: { r: R, c: c0 }, e: { r: R, c: c1 } })
}

// ─────────────────────────────────────────────────────────────
//  EXPORTAR STOCK ACTUAL
// ─────────────────────────────────────────────────────────────
export function exportarStockExcel(stock, nombreArchivo = 'stock_feisen') {
  const filas = stock.map(s => ({
    'Ítem':               s.items?.nombre || '',
    'Categoría':          s.items?.categorias?.nombre || '',
    'Bodega':             s.bodegas?.nombre || '',
    'Almacén':            s.items?.centro_costo || '',
    'Unidad':             s.items?.unidad_medida || '',
    'Cantidad':           s.cantidad_actual,
    'Precio Costo (COP)': s.items?.precio_costo || 0,
    'Valor Total (COP)':  (s.cantidad_actual || 0) * (s.items?.precio_costo || 0),
  }))

  const ws = XLSX.utils.json_to_sheet(filas)
  ws['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 25 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 }]

  // Encabezado
  estRow(ws, 0, 8, S.encabezado)
  // Datos con moneda en cols 6 y 7
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = 1; R <= range.e.r; R++) {
    const par = R % 2 === 0
    estRow(ws, R, 8, par ? S.itemImpar : S.itemPar)
    for (const col of [6, 7]) {
      const addr = XLSX.utils.encode_cell({ r: R, c: col })
      if (ws[addr]) ws[addr].s = { ...S.itemNum(par), numFmt: '"$"#,##0' }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Stock')
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ─────────────────────────────────────────────────────────────
//  EXPORTAR MOVIMIENTOS
// ─────────────────────────────────────────────────────────────
export function exportarMovimientosExcel(movimientos, nombreArchivo = 'movimientos_feisen') {
  const filas = movimientos.map(m => ({
    'Fecha':                       formatFechaHora(m.created_at),
    'Tipo':                        TIPOS_MOVIMIENTO[m.tipo] || m.tipo,
    'Ítem':                        m.items?.nombre || '',
    'Cantidad':                    m.cantidad,
    'Unidad':                      m.items?.unidad_medida || '',
    'Bodega Origen':               m.bodega_origen?.nombre || '—',
    'Bodega Destino':              m.bodega_destino?.nombre || '—',
    'Almacén':                     m.centro_costo,
    'Precio Costo Snapshot (COP)': m.precio_costo_snapshot,
    'Valor Movimiento (COP)':      (m.cantidad || 0) * (m.precio_costo_snapshot || 0),
    'Usuario':                     m.profiles?.nombre || '',
    'Referencia / Orden':          m.referencia || '',
    'Proveedor / Cliente':         m.proveedor || m.cliente || '',
    'Motivo':                      m.motivo || '',
  }))

  const ws = XLSX.utils.json_to_sheet(filas)
  estRow(ws, 0, 14, S.encabezado)
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = 1; R <= range.e.r; R++) {
    const par = R % 2 === 0
    estRow(ws, R, 14, par ? S.itemImpar : S.itemPar)
    for (const col of [8, 9]) {
      const addr = XLSX.utils.encode_cell({ r: R, c: col })
      if (ws[addr]) ws[addr].s = { ...S.itemNum(par), numFmt: '"$"#,##0' }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos')
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ─────────────────────────────────────────────────────────────
//  EXPORTAR INVENTARIO ACTUAL
// ─────────────────────────────────────────────────────────────
export function exportarInventarioActual(items, nombreArchivo = 'inventario_feisen') {
  const filas = items.map(i => ({
    'Producto':           i.nombre,
    'Bodega':             i.bodegas?.nombre    || '—',
    'Categoría':          i.categorias?.nombre || '—',
    'Unidad':             i.unidad_medida,
    'Stock actual':       i.stock?.[0]?.cantidad_actual ?? 0,
    'Stock mínimo':       i.stock_minimo || 0,
    'Precio costo (COP)': i.precio_costo || 0,
    'Valor total (COP)':  Math.round((i.stock?.[0]?.cantidad_actual ?? 0) * (i.precio_costo || 0)),
    'Estado':             i.activo ? 'Activo' : 'Inactivo',
  }))

  const ws = XLSX.utils.json_to_sheet(filas)
  ws['!cols'] = [
    { wch: 35 }, { wch: 20 }, { wch: 20 }, { wch: 10 },
    { wch: 13 }, { wch: 13 }, { wch: 18 }, { wch: 18 }, { wch: 10 },
  ]
  estRow(ws, 0, 9, S.encabezado)
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = 1; R <= range.e.r; R++) {
    const par = R % 2 === 0
    estRow(ws, R, 9, par ? S.itemImpar : S.itemPar)
    for (const col of [6, 7]) {
      const addr = XLSX.utils.encode_cell({ r: R, c: col })
      if (ws[addr]) ws[addr].s = { ...S.itemNum(par), numFmt: '"$"#,##0' }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ─────────────────────────────────────────────────────────────
//  EXPORTAR CORTE DE INVENTARIO  ← el que más se usa
// ─────────────────────────────────────────────────────────────
export function exportarCorteInventario(resultado, bodegaNombre = null) {
  const wb    = XLSX.utils.book_new()
  const fecha = resultado.fecha
  const N     = 6  // columnas en hojas de bodega

  // ── Hoja Resumen ──────────────────────────────────────────
  const resRows = []
  resRows.push([`INVENTARIO EN FECHA — RESUMEN GENERAL`, '', ''])
  resRows.push([`Fecha de corte: ${fecha}${bodegaNombre ? ' · Bodega: ' + bodegaNombre : ' · Todas las bodegas'}`, '', ''])
  resRows.push(['', '', ''])
  resRows.push(['Bodega', 'Productos con stock', 'Valor total (COP)'])
  resultado.bodegas.forEach(b => {
    resRows.push([b.nombre, b.items.filter(i => i.stock_en_fecha > 0).length, Math.round(b.total_valor)])
  })
  resRows.push(['', '', ''])
  resRows.push(['TOTAL GENERAL', resultado.total_productos, Math.round(resultado.total_general)])

  const wsR = XLSX.utils.aoa_to_sheet(resRows)
  wsR['!cols'] = [{ wch: 32 }, { wch: 22 }, { wch: 22 }]
  mergeFila(wsR, 0, 0, 2)
  mergeFila(wsR, 1, 0, 2)

  // Estilos hoja Resumen
  estRow(wsR, 0, 3, S.titulo)
  estRow(wsR, 1, 3, S.info)
  estRow(wsR, 3, 3, S.encabezado)
  for (let R = 4; R < 4 + resultado.bodegas.length; R++) {
    const par = (R - 4) % 2 === 0
    estRowCols(wsR, R, [
      par ? S.itemPar : S.itemImpar,
      { ...S.itemNum(par) },
      { ...S.itemNum(par), numFmt: '"$"#,##0' },
    ])
  }
  const totalRow = 4 + resultado.bodegas.length + 1
  estRowCols(wsR, totalRow, [S.total, S.total, S.totalNum])

  XLSX.utils.book_append_sheet(wb, wsR, 'Resumen')

  // ── Una hoja por bodega ───────────────────────────────────
  resultado.bodegas.forEach(b => {
    // Construir filas con metadatos de tipo
    const rowData  = []
    const rowMeta  = []   // 'titulo'|'info'|'blank'|'enc'|'cat'|'item'|'sub'|'total'

    // Título
    rowData.push([`INVENTARIO AL ${fecha}  —  ${b.nombre.toUpperCase()}`, '', '', '', '', ''])
    rowMeta.push('titulo')

    // Blank
    rowData.push(['', '', '', '', '', ''])
    rowMeta.push('blank')

    // Encabezados de columnas
    rowData.push(['Producto', 'Unidad', `Stock al ${fecha}`, 'Stock actual', 'Precio costo (COP)', 'Valor (COP)'])
    rowMeta.push('enc')

    // Agrupar por categoría
    const porCat = {}
    for (const item of b.items) {
      const cat = item.categoria || 'Sin categoría'
      if (!porCat[cat]) porCat[cat] = []
      porCat[cat].push(item)
    }

    let itemIdx = 0
    for (const cat of Object.keys(porCat).sort()) {
      const items = porCat[cat]

      rowData.push(['', '', '', '', '', ''])
      rowMeta.push('blank')

      rowData.push([`  ${cat}`, '', '', '', '', ''])
      rowMeta.push('cat')

      for (const i of items) {
        rowData.push([
          `    ${i.nombre}`,
          i.unidad,
          i.stock_en_fecha,
          i.stock_actual,
          i.precio > 0 ? i.precio : '',
          i.valor > 0  ? Math.round(i.valor) : 0,
        ])
        rowMeta.push(itemIdx % 2 === 0 ? 'itemPar' : 'itemImpar')
        itemIdx++
      }

      const sub = items.reduce((s, i) => s + i.valor, 0)
      const subUnids = items.reduce((s, i) => s + i.stock_en_fecha, 0)
      rowData.push([`  Subtotal ${cat}`, '', subUnids, '', '', Math.round(sub)])
      rowMeta.push('sub')
    }

    rowData.push(['', '', '', '', '', ''])
    rowMeta.push('blank')

    rowData.push([`TOTAL ${b.nombre.toUpperCase()}`, '', '', '', '', Math.round(b.total_valor)])
    rowMeta.push('total')

    const ws = XLSX.utils.aoa_to_sheet(rowData)
    ws['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 13 }, { wch: 20 }, { wch: 20 }]

    // Merge título
    mergeFila(ws, 0, 0, N - 1)

    // Aplicar estilos fila a fila
    rowMeta.forEach((tipo, R) => {
      if (tipo === 'blank') return

      if (tipo === 'titulo') {
        estRow(ws, R, N, S.titulo)
        return
      }
      if (tipo === 'enc') {
        // Columnas de texto centradas, numéricas a la derecha
        estRowCols(ws, R, [
          S.encabezado, S.encabezado,
          S.encabezadoR, S.encabezadoR,
          S.encabezadoR, S.encabezadoR,
        ])
        return
      }
      if (tipo === 'cat') {
        estRow(ws, R, N, S.categoria)
        mergeFila(ws, R, 0, N - 1)
        return
      }
      if (tipo === 'sub') {
        estRowCols(ws, R, [
          S.subtotal, S.subtotal,
          { ...S.subtotal, alignment: alin('right') },
          S.subtotal, S.subtotal,
          S.subtotalNum,
        ])
        return
      }
      if (tipo === 'total') {
        estRowCols(ws, R, [
          S.total, S.total, S.total, S.total, S.total, S.totalNum,
        ])
        return
      }

      // itemPar / itemImpar
      const par = tipo === 'itemPar'
      const sBase = par ? S.itemPar : S.itemImpar
      const sNum  = S.itemNum(par)
      estRowCols(ws, R, [
        sBase,
        { ...sBase, alignment: alin('center') },
        { ...sNum },
        { ...sNum },
        { ...sNum, numFmt: '"$"#,##0' },
        { ...sNum, numFmt: '"$"#,##0' },
      ])
    })

    XLSX.utils.book_append_sheet(wb, ws, b.nombre.substring(0, 31))
  })

  const sufijo = bodegaNombre ? `_${bodegaNombre.toLowerCase().replace(/\s+/g, '_')}` : ''
  XLSX.writeFile(wb, `corte_inventario_${fecha}${sufijo}.xlsx`)
}

// ─────────────────────────────────────────────────────────────
//  EXPORTAR KARDEX
// ─────────────────────────────────────────────────────────────
export function exportarKardex(filas, fechaInicio, fechaFin, bodegaNombre = 'todas las bodegas', categoriaNombre = null) {
  const wb = XLSX.utils.book_new()
  const periodo = `${fechaInicio}_${fechaFin}`
  const filtroLabel = [bodegaNombre, categoriaNombre].filter(Boolean).join(' · ')

  const rows = filas.map(f => ({
    'Producto':              f.nombreProducto,
    'Bodega':                f.nombreBodega,
    'Unidad':                f.unidad,
    'Stock inicio período':  f.stockInicio,
    'Entradas externas':     f.entradas,
    'Salidas externas':      f.salidasExt,
    'Transf. salidas':       f.transfSal,
    'Transf. entradas':      f.transfEnt,
    'Stock fin período':     f.stockFinal,
    'Variación neta':        f.stockFinal - f.stockInicio,
    'Precio costo (COP)':    f.precio || '',
    'Valor inicio (COP)':    f.valorInicioEst,
    'Valor entradas (COP)':  f.valorEntradas,
    'Valor salidas (COP)':   f.valorSalidas,
    'Valor fin (COP)':       f.valorFinalEst,
  }))

  rows.push({
    'Producto':             'TOTAL',
    'Bodega':               filtroLabel,
    'Unidad':               '',
    'Stock inicio período': filas.reduce((s, f) => s + f.stockInicio, 0),
    'Entradas externas':    filas.reduce((s, f) => s + f.entradas,    0),
    'Salidas externas':     filas.reduce((s, f) => s + f.salidasExt,  0),
    'Transf. salidas':      filas.reduce((s, f) => s + f.transfSal,   0),
    'Transf. entradas':     filas.reduce((s, f) => s + f.transfEnt,   0),
    'Stock fin período':    filas.reduce((s, f) => s + f.stockFinal,  0),
    'Variación neta':       filas.reduce((s, f) => s + (f.stockFinal - f.stockInicio), 0),
    'Precio costo (COP)':   '',
    'Valor inicio (COP)':   Math.round(filas.reduce((s, f) => s + f.valorInicioEst, 0)),
    'Valor entradas (COP)': Math.round(filas.reduce((s, f) => s + f.valorEntradas,  0)),
    'Valor salidas (COP)':  Math.round(filas.reduce((s, f) => s + f.valorSalidas,   0)),
    'Valor fin (COP)':      Math.round(filas.reduce((s, f) => s + f.valorFinalEst,  0)),
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 38 }, { wch: 22 }, { wch: 8 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
  ]

  // Encabezado
  estRow(ws, 0, 15, S.encabezado)

  // Datos
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = 1; R < range.e.r; R++) {
    const par = R % 2 === 0
    estRow(ws, R, 15, par ? S.itemImpar : S.itemPar)
    for (const col of [10, 11, 12, 13, 14]) {
      const addr = XLSX.utils.encode_cell({ r: R, c: col })
      if (ws[addr]) ws[addr].s = { ...S.itemNum(par), numFmt: '"$"#,##0' }
    }
  }

  // Fila TOTAL
  estRow(ws, range.e.r, 15, S.total)
  for (const col of [11, 12, 13, 14]) {
    const addr = XLSX.utils.encode_cell({ r: range.e.r, c: col })
    if (ws[addr]) ws[addr].s = S.totalNum
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Kardex')

  const sufijo = categoriaNombre ? `_${categoriaNombre.toLowerCase().replace(/\s+/g, '_')}` : ''
  XLSX.writeFile(wb, `kardex_${periodo}${sufijo}.xlsx`)
}

// ─────────────────────────────────────────────────────────────
//  EXPORTAR VENTAS INTERNAS DE FUNDICIÓN (salidas a otras bodegas)
//  Valor = cantidad × costo guardado en el movimiento. Se lleva como costo
//  al centro de costos Construequipos.
// ─────────────────────────────────────────────────────────────
export function exportarVentasInternasFundicion(res, fechaInicio, fechaFin, bodegaNombre = 'Fundición') {
  const wb = XLSX.utils.book_new()
  const fFecha = (iso) => { const [a, m, d] = (iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${a}` : '' }
  const periodo = `${fFecha(fechaInicio)} al ${fFecha(fechaFin)}`
  const COP = '"$"#,##0'
  const rojoPale = 'FDE8E6'

  // ── Hoja 1: Resumen por destino ──
  const aoa1 = [
    [`VENTAS INTERNAS DE FUNDICIÓN — ${bodegaNombre}`],
    [`Período: ${periodo}`],
    ['Valor al costo registrado en cada movimiento. Se lleva como COSTO al centro de costos Construequipos.'],
    [],
    ['Destino', 'Movimientos', 'Líneas', 'Líneas sin costo', 'Valor (COP)'],
    ...res.resumen.map(r => [r.destino, r.movimientos, r.lineas, r.sinCosto, Math.round(r.valor)]),
    ['TOTAL', res.totalMovimientos, res.totalLineas, res.sinCosto.length, Math.round(res.totalValor)],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)
  ws1['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 20 }]
  estRow(ws1, 0, 5, S.titulo); mergeFila(ws1, 0, 0, 4)
  estRow(ws1, 1, 5, S.info);   mergeFila(ws1, 1, 0, 4)
  estRow(ws1, 2, 5, S.info);   mergeFila(ws1, 2, 0, 4)
  estRow(ws1, 4, 5, S.encabezado)
  const ult1 = aoa1.length - 1
  for (let R = 5; R < ult1; R++) {
    const par = R % 2 === 0
    estRow(ws1, R, 5, par ? S.itemImpar : S.itemPar)
    for (const c of [1, 2, 3]) ws1[XLSX.utils.encode_cell({ r: R, c })].s = S.itemNum(par)
    ws1[XLSX.utils.encode_cell({ r: R, c: 4 })].s = { ...S.itemNum(par), numFmt: COP }
  }
  estRow(ws1, ult1, 5, S.total)
  for (const c of [1, 2, 3]) ws1[XLSX.utils.encode_cell({ r: ult1, c })].s = { ...S.totalNum, numFmt: '#,##0' }
  ws1[XLSX.utils.encode_cell({ r: ult1, c: 4 })].s = S.totalNum
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

  // ── Hoja 2: Detalle ──
  const enc = ['Fecha', 'N° movimiento', 'Producto', 'Categoría', 'Origen', 'Destino', 'Cantidad', 'Unidad',
               'Costo unitario (COP)', 'Valor (COP)', 'Registrado por', 'Referencia', 'Observación']
  const aoa2 = [
    enc,
    ...res.filas.map(f => [
      fFecha(f.fecha), f.numero, f.producto, f.categoria, f.origen, f.destino, f.cantidad, f.unidad,
      Math.round(f.costo), Math.round(f.valor), f.usuario, f.referencia,
      f.sinCosto ? `SIN COSTO en el movimiento${f.costoActual > 0 ? ` — costo actual del catálogo: $${Math.round(f.costoActual).toLocaleString('es-CO')}` : ''}` : '',
    ]),
    ['TOTAL', '', '', '', '', '', '', '', '', Math.round(res.totalValor), '', '', ''],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  ws2['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 46 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 11 }, { wch: 10 },
                  { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 34 }, { wch: 46 }]
  estRow(ws2, 0, 13, S.encabezado)
  const ult2 = aoa2.length - 1
  for (let R = 1; R < ult2; R++) {
    const f = res.filas[R - 1]
    const par = R % 2 === 0
    estRow(ws2, R, 13, par ? S.itemImpar : S.itemPar)
    ws2[XLSX.utils.encode_cell({ r: R, c: 6 })].s = { ...S.itemNum(par), numFmt: '#,##0.###' }
    for (const c of [8, 9]) ws2[XLSX.utils.encode_cell({ r: R, c })].s = { ...S.itemNum(par), numFmt: COP }
    if (f?.sinCosto) {
      for (let c = 0; c < 13; c++) {
        const cell = ws2[XLSX.utils.encode_cell({ r: R, c })]
        cell.s = { ...cell.s, fill: fill(rojoPale), font: font(C.rojo, c === 12, 10) }
      }
    }
  }
  estRow(ws2, ult2, 13, S.total)
  ws2[XLSX.utils.encode_cell({ r: ult2, c: 9 })].s = S.totalNum
  ws2['!freeze'] = { xSplit: 0, ySplit: 1 }
  ws2['!autofilter'] = { ref: `A1:M${aoa2.length - 1}` }
  XLSX.utils.book_append_sheet(wb, ws2, 'Detalle')

  XLSX.writeFile(wb, `ventas_internas_fundicion_${fechaInicio}_${fechaFin}.xlsx`)
}

// ─────────────────────────────────────────────────────────────
//  EXPORTAR BALANCE DE HIERRO DE FUNDICIÓN (Fase 1)
// ─────────────────────────────────────────────────────────────
function hojaTabla(wb, nombre, titulo, subtitulo, headers, filas, { anchos = [], fmt = {}, alerta = () => false, total = null } = {}) {
  const nCols = headers.length
  const aoa = [[titulo], [subtitulo || ''], headers, ...filas]
  if (total) aoa.push(total)
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = headers.map((_, i) => ({ wch: anchos[i] || 14 }))
  estRow(ws, 0, nCols, S.titulo); mergeFila(ws, 0, 0, Math.max(0, nCols - 1))
  estRow(ws, 1, nCols, S.info);   mergeFila(ws, 1, 0, Math.max(0, nCols - 1))
  estRow(ws, 2, nCols, S.encabezado)
  filas.forEach((fila, i) => {
    const R = 3 + i
    const par = R % 2 === 0
    const roja = alerta(fila, i)
    for (let c = 0; c < nCols; c++) {
      const addr = XLSX.utils.encode_cell({ r: R, c })
      if (!ws[addr]) ws[addr] = { v: '', t: 's' }
      const esNum = typeof fila[c] === 'number'
      const base = esNum ? S.itemNum(par) : (par ? S.itemImpar : S.itemPar)
      ws[addr].s = { ...base, ...(esNum && fmt[c] ? { numFmt: fmt[c] } : {}),
                     ...(roja ? { fill: fill('FDE8E6'), font: font(C.rojo, false, 10) } : {}) }
    }
  })
  if (total) {
    const R = 3 + filas.length
    for (let c = 0; c < nCols; c++) {
      const addr = XLSX.utils.encode_cell({ r: R, c })
      if (!ws[addr]) ws[addr] = { v: '', t: 's' }
      ws[addr].s = typeof total[c] === 'number' ? { ...S.totalNum, numFmt: fmt[c] || '#,##0.0' } : S.total
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, nombre)
  return ws
}

export function exportarBalanceHierro(res, { mesDesde, mesHasta, conteo = {}, labelMes }) {
  const wb = XLSX.utils.book_new()
  const KG = '#,##0.0'
  const periodo = `${labelMes(mesDesde)} a ${labelMes(mesHasta)}`
  const config = `Merma esperada: ${res.mermaEsperada.toFixed(1)}% · tolerancia ±${res.tolerancia} pts · histórico del rango: ${res.historico.toFixed(1)}%`
  const fF = (iso) => { const [a, m, d] = (iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${a}` : '' }
  const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10

  // 1) Balance mensual
  const m = res.meses
  hojaTabla(wb, 'Balance mensual', `BALANCE DE HIERRO — FUNDICIÓN · ${periodo}`, config,
    ['Mes', 'Stock inicial (kg)', '+ Compras', '+ Otras entradas', '− Consumo horno', '− Otras salidas', 'Ajustes', 'Sin explicar', '= Stock final (kg)',
     'Hierro cargado (fundidas)', 'Hierro descontado (órdenes)', 'Fundidas sin descontar', 'Piezas buenas', 'NC (kg)', 'Vaceadero', 'Merma real', '% merma real', 'Merma esperada', 'Desviación (kg)'],
    m.map(b => [labelMes(b.mes), r1(b.stockIni), r1(b.compras), r1(b.otrasEntradas), r1(b.consumoHorno), r1(b.otrasSalidas), r1(b.ajustes), r1(b.residuo), r1(b.stockFin),
      r1(b.hierroCargado), r1(b.hierroOrdenes), r1(b.fundidasSinDescontar), r1(b.buenas), r1(b.nc), r1(b.vaceadero), r1(b.merma), r1(b.mermaPct), r1(b.mermaEsperadaKg), r1(b.desviacionKg)]),
    { anchos: [12, 14, 12, 14, 14, 14, 10, 12, 16, 16, 18, 16, 14, 10, 12, 12, 12, 14, 14],
      fmt: Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i, KG])),
      alerta: (_, i) => m[i].alerta,
      total: ['TOTAL', r1(m[0]?.stockIni), ...['compras', 'otrasEntradas', 'consumoHorno', 'otrasSalidas', 'ajustes', 'residuo'].map(k => r1(m.reduce((s, b) => s + b[k], 0))), r1(m[m.length - 1]?.stockFin),
        ...['hierroCargado', 'hierroOrdenes', 'fundidasSinDescontar', 'buenas', 'nc', 'vaceadero', 'merma'].map(k => r1(m.reduce((s, b) => s + b[k], 0))),
        r1(m.reduce((s, b) => s + b.hierroOrdenes, 0) > 0 ? (m.reduce((s, b) => s + b.merma, 0) / m.reduce((s, b) => s + b.hierroOrdenes, 0)) * 100 : 0),
        r1(m.reduce((s, b) => s + b.mermaEsperadaKg, 0)), r1(m.reduce((s, b) => s + b.desviacionKg, 0))] })

  // 2) Órdenes
  hojaTabla(wb, 'Órdenes de moldeo', `DETALLE POR ORDEN DE MOLDEO · ${periodo}`, 'Merma = hierro descontado − piezas buenas − vaceadero. En rojo: merma por encima de la esperada + tolerancia, o negativa.',
    ['Orden', 'Fecha', 'Mes', 'Hierro descontado (kg)', 'Piezas buenas (kg)', 'NC (kg)', 'Vaceadero (kg)', 'Merma (kg)', '% merma', 'Planeadas', 'Conformes', 'NC (uds.)', 'Faltantes (uds.)', 'Observación'],
    res.detalleOrdenes.map(o => [o.orden, fF(o.fecha), labelMes(o.mes), r1(o.hierro), r1(o.buenas), r1(o.ncKg), r1(o.vaceadero), o.pct === null ? '' : r1(o.merma), o.pct === null ? '' : r1(o.pct),
      o.plan, o.conf, o.ncUds, o.faltante, o.pct === null ? 'SIN HIERRO DESCONTADO (falta vincular fundida)' : o.negativa ? 'MERMA NEGATIVA: revisar pesos o hierro' : o.alerta ? 'MERMA ALTA' : '']),
    { anchos: [14, 12, 12, 16, 16, 10, 14, 12, 10, 11, 11, 10, 14, 44], fmt: { 3: KG, 4: KG, 5: KG, 6: KG, 7: KG, 8: KG },
      alerta: (f) => /ALTA|NEGATIVA|SIN HIERRO/.test(String(f[13])) })

  // 3) No conformes
  hojaTabla(wb, 'No conformes', `PIEZAS NO CONFORMES Y FALTANTES · ${periodo}`, 'Faltante = planeadas − conformes − no conformes (piezas que se planearon y no aparecen reportadas).',
    ['Mes', 'Orden', 'Fecha', 'Pieza', 'Moldeador', 'Planeadas', 'Conformes', 'No conformes', 'Faltantes', '% NC', 'NC (kg)', 'Motivo / aclaración'],
    res.noConformes.filter(n => n.nc > 0 || n.faltante > 0).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden.localeCompare(b.orden))
      .map(n => [labelMes(n.mes), n.orden, fF(n.fecha), n.pieza, n.moldeador, n.plan, n.conf, n.nc, n.faltante, (n.conf + n.nc) > 0 ? r1((n.nc / (n.conf + n.nc)) * 100) : 0, r1(n.kgNC), n.motivo]),
    { anchos: [12, 14, 12, 44, 20, 11, 11, 13, 11, 8, 10, 50], fmt: { 9: KG, 10: KG } })

  // 4) Moldeadores (base para cruzar con el pago por kilo en la Fase 2)
  hojaTabla(wb, 'Moldeadores', `PRODUCCIÓN POR MOLDEADOR · ${periodo}`, 'Kg de piezas buenas = base para el pago por kilo (Fase 2).',
    ['Mes', 'Moldeador', 'Planeadas', 'Conformes', 'No conformes', '% NC', 'Faltantes', 'Kg piezas buenas', 'Kg NC'],
    res.moldeadores.map(p => [labelMes(p.mes), p.moldeador, p.plan, p.conf, p.nc, (p.conf + p.nc) > 0 ? r1((p.nc / (p.conf + p.nc)) * 100) : 0, p.faltante, r1(p.kgBuenas), r1(p.kgNC)]),
    { anchos: [12, 24, 11, 11, 13, 8, 11, 16, 10], fmt: { 5: KG, 7: KG, 8: KG } })

  // 5) Controles
  const ctrl = []
  res.fundidasSinDescontar.forEach(f => ctrl.push(['Fundida con hierro NO descontado', f.numero, fF(f.fecha), r1(f.kg), 'Falta cerrar la orden de moldeo con esta fundida vinculada']))
  res.ordenesSinHierro.forEach(o => ctrl.push(['Orden cerrada sin hierro descontado', o.orden, fF(o.fecha), '', 'No se puede calcular merma']))
  res.ordenesSinPeso.forEach(o => ctrl.push(['Orden con piezas sin peso unitario', o.orden, fF(o.fecha), '', 'Cargar peso en el catálogo']))
  res.salidasNoHorno.forEach(s => ctrl.push(['Salida de hierro que NO es consumo de horno', `${s.numero} · ${s.item}`, fF(s.fecha), r1(s.kg), `${s.destino} ${s.referencia} — ${s.usuario}`.trim()]))
  res.comprasSinProveedor.forEach(c => ctrl.push(['Entrada de hierro sin proveedor', `${c.numero} · ${c.item}`, fF(c.fecha), r1(c.kg), c.usuario || '']))
  const ws5 = hojaTabla(wb, 'Controles', `CONTROLES DE INTEGRIDAD · ${periodo}`, ctrl.length ? 'Cada fila es algo para revisar.' : 'Sin hallazgos en el período.',
    ['Control', 'Referencia', 'Fecha', 'Kg', 'Detalle'], ctrl, { anchos: [44, 40, 12, 12, 60], fmt: { 3: KG } })
  // Conteo físico debajo de los controles
  const filaIni = 3 + ctrl.length + 2
  const conteoRows = res.stockPorItem.map(r => {
    const v = conteo[r.id]
    const tiene = v !== undefined && v !== ''
    return [r.nombre, r1(r.sistema), tiene ? r1(parseFloat(v)) : '', tiene ? r1(parseFloat(v) - r.sistema) : '']
  })
  XLSX.utils.sheet_add_aoa(ws5, [[`CONTEO FÍSICO vs SISTEMA al cierre de ${labelMes(mesHasta)}`], ['Producto', 'Sistema (kg)', 'Conteo físico (kg)', 'Diferencia (kg)'], ...conteoRows], { origin: { r: filaIni, c: 0 } })
  ws5['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filaIni + 2 + conteoRows.length, c: 4 } })
  estRow(ws5, filaIni, 5, S.categoria)
  estRow(ws5, filaIni + 1, 4, S.encabezado)
  conteoRows.forEach((_, i) => {
    estRow(ws5, filaIni + 2 + i, 4, i % 2 ? S.itemImpar : S.itemPar)
    for (const c of [1, 2, 3]) { const a = ws5[XLSX.utils.encode_cell({ r: filaIni + 2 + i, c })]; if (a) a.s = { ...S.itemNum(i % 2 === 0), numFmt: KG } }
  })

  XLSX.writeFile(wb, `balance_hierro_fundicion_${mesDesde}_${mesHasta}.xlsx`)
}

export function exportarConsumoExcel(resumen, nombreArchivo = 'consumo_feisen') {
  const wb = XLSX.utils.book_new()
  resumen.forEach(({ centro, filas }) => {
    const ws = XLSX.utils.json_to_sheet(filas)
    estRow(ws, 0, Object.keys(filas[0] || {}).length, S.encabezado)
    XLSX.utils.book_append_sheet(wb, ws, centro.substring(0, 31))
  })
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
