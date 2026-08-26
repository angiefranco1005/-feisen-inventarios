import * as XLSX from 'xlsx'
import { formatFechaHora, formatCOP, TIPOS_MOVIMIENTO } from './formatters'

export function exportarStockExcel(stock, nombreArchivo = 'stock_feisen') {
  const filas = stock.map(s => ({
    'Ítem': s.items?.nombre || '',
    'Categoría': s.items?.categorias?.nombre || '',
    'Bodega': s.bodegas?.nombre || '',
    'Almacén': s.items?.centro_costo || '',
    'Unidad': s.items?.unidad_medida || '',
    'Cantidad': s.cantidad_actual,
    'Precio Costo (COP)': s.items?.precio_costo || 0,
    'Valor Total (COP)': (s.cantidad_actual || 0) * (s.items?.precio_costo || 0)
  }))

  const ws = XLSX.utils.json_to_sheet(filas)
  ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 25 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Stock')
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function exportarMovimientosExcel(movimientos, nombreArchivo = 'movimientos_feisen') {
  const filas = movimientos.map(m => ({
    'Fecha': formatFechaHora(m.created_at),
    'Tipo': TIPOS_MOVIMIENTO[m.tipo] || m.tipo,
    'Ítem': m.items?.nombre || '',
    'Cantidad': m.cantidad,
    'Unidad': m.items?.unidad_medida || '',
    'Bodega Origen': m.bodega_origen?.nombre || '—',
    'Bodega Destino': m.bodega_destino?.nombre || '—',
    'Almacén': m.centro_costo,
    'Precio Costo Snapshot (COP)': m.precio_costo_snapshot,
    'Valor Movimiento (COP)': (m.cantidad || 0) * (m.precio_costo_snapshot || 0),
    'Usuario': m.profiles?.nombre || '',
    'Referencia / Orden': m.referencia || '',
    'Proveedor / Cliente': m.proveedor || m.cliente || '',
    'Motivo': m.motivo || ''
  }))

  const ws = XLSX.utils.json_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos')
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function exportarInventarioActual(items, nombreArchivo = 'inventario_feisen') {
  const filas = items.map(i => ({
    'Producto':          i.nombre,
    'Bodega':            i.bodegas?.nombre     || '—',
    'Categoría':         i.categorias?.nombre  || '—',
    'Unidad':            i.unidad_medida,
    'Stock actual':      i.stock?.[0]?.cantidad_actual ?? 0,
    'Stock mínimo':      i.stock_minimo || 0,
    'Precio costo (COP)': i.precio_costo || 0,
    'Valor total (COP)': Math.round((i.stock?.[0]?.cantidad_actual ?? 0) * (i.precio_costo || 0)),
    'Estado':            i.activo ? 'Activo' : 'Inactivo',
  }))

  const ws = XLSX.utils.json_to_sheet(filas)
  ws['!cols'] = [
    { wch: 35 }, { wch: 20 }, { wch: 20 }, { wch: 10 },
    { wch: 13 }, { wch: 13 }, { wch: 18 }, { wch: 18 }, { wch: 10 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function exportarCorteInventario(resultado) {
  const wb   = XLSX.utils.book_new()
  const fecha = resultado.fecha

  // ── Hoja resumen ──
  const resumen = resultado.bodegas.map(b => ({
    'Bodega':             b.nombre,
    'Productos':          b.items.length,
    'Valor total (COP)':  Math.round(b.total_valor),
  }))
  resumen.push({
    'Bodega':            'TOTAL GENERAL',
    'Productos':          resultado.total_productos,
    'Valor total (COP)':  Math.round(resultado.total_general),
  })
  const wsR = XLSX.utils.json_to_sheet(resumen)
  wsR['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumen')

  // ── Una hoja por bodega ──
  resultado.bodegas.forEach(b => {
    const filas = b.items.map(i => ({
      'Producto':              i.nombre,
      'Categoría':             i.categoria,
      'Unidad':                i.unidad,
      [`Stock al ${fecha}`]:   i.stock_en_fecha,
      'Stock actual':          i.stock_actual,
      'Precio costo (COP)':    i.precio || '',
      'Valor (COP)':           Math.round(i.valor),
    }))
    filas.push({
      'Producto': 'TOTAL', 'Categoría': '', 'Unidad': '',
      [`Stock al ${fecha}`]: '', 'Stock actual': '',
      'Precio costo (COP)': '',
      'Valor (COP)': Math.round(b.total_valor),
    })

    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [
      { wch: 35 }, { wch: 18 }, { wch: 10 },
      { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 18 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, b.nombre.substring(0, 31))
  })

  XLSX.writeFile(wb, `corte_inventario_${fecha}.xlsx`)
}

export function exportarKardex(filas, fechaInicio, fechaFin, bodegaNombre = 'todas las bodegas', categoriaNombre = null) {
  const wb = XLSX.utils.book_new()
  const periodo = `${fechaInicio}_${fechaFin}`
  const filtroLabel = [bodegaNombre, categoriaNombre].filter(Boolean).join(' · ')

  // ── Hoja principal: todas las filas ──────────────────────────────────────
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

  // Fila de totales
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
  XLSX.utils.book_append_sheet(wb, ws, 'Kardex')

  const sufijo = categoriaNombre ? `_${categoriaNombre.toLowerCase().replace(/\s+/g, '_')}` : ''
  XLSX.writeFile(wb, `kardex_${periodo}${sufijo}.xlsx`)
}

export function exportarConsumoExcel(resumen, nombreArchivo = 'consumo_feisen') {
  const wb = XLSX.utils.book_new()
  resumen.forEach(({ centro, filas }) => {
    const ws = XLSX.utils.json_to_sheet(filas)
    XLSX.utils.book_append_sheet(wb, ws, centro.substring(0, 31))
  })
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
