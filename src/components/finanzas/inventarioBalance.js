// ─────────────────────────────────────────────────────────────────────────────
// EL INVENTARIO DEL BALANCE, POR TIPO Y CATEGORÍA
//
// El grupo 14 del balance dejó de leerse de Odoo (18/11/2026). Angie: "tengo 3 tipos
// de inventarios pero cada uno tiene categorías internas, y esas categorías ya se
// pueden sacar de los inventarios que tenemos en el erp. organicemos los inventarios
// así por ahora, lo que no tengamos valor déjalo en 0 que yo lo lleno".
//
// Los tres tipos los escogió ella: materias primas, producto en proceso y producto
// terminado. Es la división que pide un balance y la que deja ver cuánta plata está
// parada en cada etapa.
//
// De dónde sale: la función `finanzas_inventario()` de Supabase, que devuelve el
// inventario valorizado de HOY por bodega y categoría, con el número de artículos que
// tienen existencias y cuántos de ellos no tienen precio de costo cargado.
//
// DOS ADVERTENCIAS QUE IMPORTAN MÁS QUE EL CÓDIGO:
//
//  1. **El valor del ERP es de hoy, no de fin de mes.** La tabla `stock` solo guarda
//     `cantidad_actual`: no hay historia. Y no se puede reconstruir hacia atrás con
//     `movimientos` porque hay unos 750 sin fecha. Por eso cada categoría tiene una
//     casilla para escribir el valor del corte a mano, igual que los bancos: lo que se
//     escribe **reemplaza** lo del ERP.
//
//  2. **El valor del ERP está incompleto, y no por donde se espera.** De 869 artículos
//     con existencias, 304 no tienen precio de costo (35%). No son categorías enteras en
//     blanco —esas se verían—: están repartidos dentro de categorías que sí muestran
//     cifra. Poleas sale en $0 porque sus 12 artículos no tienen costo, pero Herramienta
//     muestra $1.788.000 con 34 de 42 sin costear. Un número a medias engaña más que un
//     cero, así que la pantalla muestra cuántos faltan en cada categoría.
// ─────────────────────────────────────────────────────────────────────────────

// Los tres tipos, en el orden en que se leen: de lo que entra a lo que sale.
// `fueraDelTotal` marca el bloque que no es inventario de venta.
export const TIPOS_INVENTARIO = [
  {
    id: 'prima', nombre: 'Materias primas e insumos',
    nota: 'lo que se consume para fabricar: lámina, acero, pintura, insumos, tornillería',
  },
  {
    id: 'proceso', nombre: 'Producto en proceso',
    nota: 'lo que ya se fundió o mecanizó y todavía le falta una etapa',
  },
  {
    id: 'terminado', nombre: 'Producto terminado y mercancía',
    nota: 'lo que está listo para vender, propio o comprado para reventa',
  },
  {
    id: 'aparte', nombre: 'No es inventario de venta', fueraDelTotal: true,
    nota: 'herramienta, dotación y consumibles de oficina: son de la empresa pero no se venden, así que no suman al inventario',
  },
]

// A qué tipo va cada categoría del ERP, por 'BODEGA|CATEGORÍA' tal como vienen escritas.
// Lo que no esté aquí NO se pierde: cae en "Sin clasificar", que sí suma al total pero
// sale marcado en ámbar. Es a propósito: si mañana alguien crea una categoría nueva,
// más vale que se vea fuera de sitio a que desaparezca en silencio.
export const MAPA_CATEGORIAS = {
  // ── Materias primas e insumos ──
  'CORTE Y DOBLEZ|LAMINA': 'prima',
  'FUNDICIÓN|MATERIA PRIMA': 'prima',
  'MECANIZADOS|ACEROS': 'prima',
  'ALMACEN|PINTURA': 'prima',
  'ALMACEN|INSUMOS': 'prima',
  'ALMACEN|TORNILLERÍA': 'prima',
  'FERRETERIA|FERRETERIA': 'prima',
  'MECANIZADOS|FERRETERIA - MECANIZADOS': 'prima',
  'FUNDICIÓN|ALUMINIO - FUNDICIÓN': 'prima',
  'MECANIZADOS|ALUMINIO - MECANIZADOS': 'prima',

  // ── Producto en proceso ──
  // Ojo: la misma categoría aparece en varias bodegas, porque lo que agrupa es **dónde
  // está la existencia**, no de qué bodega es el artículo. El material fundido que está
  // en Armado y soldadura ya va camino de ensamblarse, así que también es proceso.
  'FUNDICIÓN|MATERIAL FUNDIDO HIERRO': 'proceso',
  'ARMADO Y SOLDADURA|MATERIAL FUNDIDO HIERRO': 'proceso',
  'MECANIZADOS|FUNDICIÓN - MECANIZADOS': 'proceso',
  'ALMACEN|FUNDICIÓN - ALMACEN': 'proceso',
  'ALMACEN|MATERIAL FUNDIDO': 'proceso',

  // ── Producto terminado y mercancía ──
  'MECANIZADOS|PRODUCTO MECANIZADO': 'terminado',
  'MOTORES|MOTORES CONSTRU': 'terminado',
  'MOTORES|EQUIPMASTER STORE': 'terminado',
  'ALMACEN|PARA VENTA': 'terminado',
  'ALMACEN|ACCESORIOS': 'terminado',
  'ALMACEN|CORREAS': 'terminado',
  'ALMACEN|RODAMIENTOS Y RETENEDORES': 'terminado',
  'ALMACEN|POLEAS': 'terminado',

  // ── No es inventario de venta ──
  'ALMACEN|HERRAMIENTA': 'aparte',
  'ALMACEN|DOTACIÓN': 'aparte',
  'ALMACEN|OTROS': 'aparte',
  'ADMINISTRACIÓN|Aseo': 'aparte',
  'ADMINISTRACIÓN|Dotación': 'aparte',
  'ADMINISTRACIÓN|Papelería': 'aparte',
  'MANTENIMIENTO|Mantenimiento': 'aparte',
  'FUNDICIÓN|(sin categoría)': 'aparte',
}

// La clave de una categoría. Los nombres vienen de Odoo y del ERP con espacios de más
// ('ALUMINIO - FUNDICIÓN ', 'MOTORES CONSTRU '), así que se recortan antes de comparar.
export const claveCategoria = (bodega, categoria) =>
  `${String(bodega || '').trim()}|${String(categoria || '').trim()}`

// El concepto con el que se guarda en `eeff_manual`. Se normaliza para que no lleve
// tildes ni espacios: es una clave, no un texto que alguien vaya a leer.
export const conceptoInventario = clave => 'inv:' + String(clave)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9|]+/g, '_')

export const esConceptoInventario = concepto => String(concepto || '').startsWith('inv:')

const redondear = n => Math.round(Number(n) || 0)

// Arma el inventario por tipo y categoría.
//   `filas`  = lo que devuelve finanzas_inventario(): [{ bodega, categoria, items, sin_costo, valor }]
//   `manual` = lo que escribió Angie, por concepto: { 'inv:almacen|pintura': 24000000, … }
export function calcularInventario(filas, manual) {
  const porTipo = new Map(TIPOS_INVENTARIO.map(t => [t.id, []]))
  porTipo.set('sin_clasificar', [])

  for (const f of filas || []) {
    const clave = claveCategoria(f.bodega, f.categoria)
    const tipo = MAPA_CATEGORIAS[clave] || 'sin_clasificar'
    const concepto = conceptoInventario(clave)
    const escrito = manual?.[concepto]
    const delErp = redondear(f.valor)
    porTipo.get(tipo).push({
      clave, concepto,
      bodega: String(f.bodega || '').trim(),
      categoria: String(f.categoria || '').trim(),
      items: Number(f.items) || 0,
      sinCosto: Number(f.sin_costo) || 0,
      erp: delErp,
      // Lo escrito reemplaza lo del ERP, igual que en el resto de la pantalla
      escrito: escrito == null ? null : redondear(escrito),
      valor: escrito == null ? delErp : redondear(escrito),
    })
  }

  const armar = (def, lista) => {
    const cats = lista.sort((a, b) => b.valor - a.valor || a.categoria.localeCompare(b.categoria))
    return {
      ...def,
      categorias: cats,
      total: cats.reduce((s, c) => s + c.valor, 0),
      sinCosto: cats.reduce((s, c) => s + c.sinCosto, 0),
      items: cats.reduce((s, c) => s + c.items, 0),
      vacio: !cats.length,
    }
  }

  const tipos = TIPOS_INVENTARIO.map(t => armar(t, porTipo.get(t.id))).filter(t => !t.vacio)
  const sinClasificar = armar(
    {
      id: 'sin_clasificar', nombre: 'Sin clasificar', alerta: true,
      nota: 'categorías del ERP que todavía no tienen tipo asignado. Suman al inventario para que no se pierda la plata, pero hay que decidir a cuál de los tres tipos van',
    },
    porTipo.get('sin_clasificar'),
  )

  // El total del inventario: los tipos que sí son inventario de venta, más lo que falta
  // por clasificar. Lo de `fueraDelTotal` se muestra pero no suma.
  const deVenta = tipos.filter(t => !t.fueraDelTotal)
  const total = deVenta.reduce((s, t) => s + t.total, 0) + sinClasificar.total

  const todas = [...tipos, ...(sinClasificar.vacio ? [] : [sinClasificar])]
  return {
    tipos, sinClasificar, total,
    aparte: tipos.find(t => t.fueraDelTotal) || null,
    // Cuántos artículos con existencias no tienen costo: el aviso de arriba
    sinCosto: todas.reduce((s, t) => s + t.sinCosto, 0),
    items: todas.reduce((s, t) => s + t.items, 0),
    // Cuántas categorías tienen un valor escrito a mano
    escritas: todas.reduce((s, t) => s + t.categorias.filter(c => c.escrito != null).length, 0),
    categorias: todas.reduce((s, t) => s + t.categorias.length, 0),
  }
}
