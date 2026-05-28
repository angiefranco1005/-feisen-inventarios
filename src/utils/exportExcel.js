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

export function exportarConsumoExcel(resumen, nombreArchivo = 'consumo_feisen') {
  const wb = XLSX.utils.book_new()
  resumen.forEach(({ centro, filas }) => {
    const ws = XLSX.utils.json_to_sheet(filas)
    XLSX.utils.book_append_sheet(wb, ws, centro.substring(0, 31))
  })
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
