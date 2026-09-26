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

export function exportarConsumoExcel(resumen, nombreArchivo = 'consumo_feisen') {
  const wb = XLSX.utils.book_new()
  resumen.forEach(({ centro, filas }) => {
    const ws = XLSX.utils.json_to_sheet(filas)
    estRow(ws, 0, Object.keys(filas[0] || {}).length, S.encabezado)
    XLSX.utils.book_append_sheet(wb, ws, centro.substring(0, 31))
  })
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
