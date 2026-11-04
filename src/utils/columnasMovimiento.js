// Columnas de `movimientos` SIN la firma ni la foto de la remisión. Esas dos se guardan como
// imagen (data:image/…, ~10 KB cada una) dentro de la fila y son ~30 de los 31 MB de la tabla:
// un select('*') del Historial bajaba ~20 MB y tardaba mucho (4/11/2026). Las listas usan
// estas columnas; la firma/foto se pide solo al abrir el detalle de un movimiento.
export const COLUMNAS_MOVIMIENTO =
  'id, tipo, item_id, bodega_origen_id, bodega_destino_id, cantidad, precio_costo_snapshot, centro_costo, ' +
  'usuario_id, referencia, motivo, proveedor, cliente, created_at, destino, revertido, revertido_en, numero, ' +
  'numero_of, serial_motor, pedido_id, fecha_movimiento'
