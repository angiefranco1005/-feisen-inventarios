// ─────────────────────────────────────────────────────────────────────────────
// EL INVENTARIO DEL BALANCE, POR TIPO Y RENGLÓN
//
// El grupo 14 del balance no se lee de Odoo (18/11/2026). Angie: "tengo 3 tipos de
// inventarios pero cada uno tiene categorías internas, y esas categorías ya se pueden
// sacar de los inventarios que tenemos en el erp".
//
// **Los renglones no son las categorías del ERP.** Ese fue el segundo ajuste del mismo
// día: la primera versión mostraba una fila por cada categoría y Angie la paró —"yo
// materia prima estoy viendo todo por separado, no me tienes que dejar todo por
// separado, mete almacén (sin sus categorías), lámina, materia prima de la bodega de
// fundición, ferretería, aceros - fundición - ferretería de mecanizados".
//
// Así que un renglón puede juntar varias categorías del ERP: "Almacén" son las doce
// categorías de esa bodega en una sola línea, y "Mecanizados" son tres. Lo que ella
// quiere ver son las líneas en las que piensa, no las que el ERP tiene por dentro.
//
// De dónde sale: la función `finanzas_inventario()` de Supabase, que devuelve el
// inventario valorizado de HOY por bodega y categoría, con cuántos artículos tienen
// existencias y cuántos de ellos no tienen precio de costo cargado.
//
// DOS ADVERTENCIAS QUE IMPORTAN MÁS QUE EL CÓDIGO:
//
//  1. **El valor del ERP viene cortado a fin de mes**, con la misma regla que la
//     pantalla Reportes › Corte de inventario: se parte del stock de hoy y se deshacen
//     los movimientos posteriores. Yo había dado por hecho que no se podía reconstruir
//     hacia atrás —la tabla `stock` solo guarda `cantidad_actual` y hay ~750 movimientos
//     sin fecha— y Angie me corrigió el 18/11/2026: "te vas a inventarios, corte de
//     inventarios, y debería sacarte la información a la fecha de lo que había". Los
//     movimientos sin fecha no estorban porque se usa `created_at` como respaldo. La
//     casilla de cada renglón sigue existiendo, para corregir a mano lo que haga falta.
//
//  2. **El valor del ERP está incompleto, y no por donde se espera.** Alrededor de un
//     tercio de los artículos con existencias no tienen precio de costo y entran
//     valiendo cero (al 18/11/2026 eran 304 de 867). No son categorías enteras en
//     blanco —esas se verían—: están repartidos dentro de categorías que sí muestran
//     cifra. Por eso cada renglón dice cuántos artículos le faltan por costear. La
//     cifra de la pantalla se cuenta en vivo; la de este comentario es de referencia.
// ─────────────────────────────────────────────────────────────────────────────

// Los tres tipos, en el orden en que se leen: de lo que entra a lo que sale.
// `fueraDelTotal` marca el bloque que no es inventario de venta.
export const TIPOS_INVENTARIO = [
  {
    id: 'prima', nombre: 'Materias primas e insumos',
    nota: 'lo que se consume para fabricar',
  },
  {
    id: 'proceso', nombre: 'Producto en proceso',
    nota: 'lo que ya se trabajó y todavía le falta una etapa',
  },
  {
    id: 'terminado', nombre: 'Producto terminado y mercancía',
    nota: 'lo que está listo para vender, propio o comprado para reventa',
  },
  {
    id: 'aparte', nombre: 'No es inventario de venta', fueraDelTotal: true,
    nota: 'consumibles de oficina y mantenimiento: son de la empresa pero no se venden, así que no suman al inventario',
  },
]

// Los renglones que se ven en pantalla, en orden. Cada uno junta una o varias
// categorías del ERP:
//   `bodegas` → se lleva **todas** las categorías de esas bodegas
//   `claves`  → se lleva solo esas combinaciones 'BODEGA|CATEGORÍA'
// Lo que no caiga en ningún renglón no se pierde: se muestra en "Sin clasificar", que
// sí suma al total pero sale marcado. Si alguien crea una categoría nueva, más vale que
// se vea fuera de sitio a que desaparezca en silencio.
export const RENGLONES = [
  // ── Materias primas e insumos ──
  // Angie, 18/11/2026: "mete almacén (sin sus categorías), lámina, materia prima de la
  // bodega de fundición, ferretería, aceros - fundición - ferretería de mecanizados".
  {
    id: 'almacen', tipo: 'prima', nombre: 'Almacén', bodegas: ['ALMACEN'],
    nota: 'toda la bodega en una sola línea, incluido el fundido guardado ahí',
  },
  { id: 'lamina', tipo: 'prima', nombre: 'Lámina', claves: ['CORTE Y DOBLEZ|LAMINA'] },
  {
    id: 'mp_fundicion', tipo: 'prima', nombre: 'Materia prima de Fundición',
    claves: ['FUNDICIÓN|MATERIA PRIMA', 'FUNDICIÓN|ALUMINIO - FUNDICIÓN'],
  },
  {
    id: 'ferreteria', tipo: 'prima', nombre: 'Ferretería', bodegas: ['FERRETERIA'],
    aMano: true,
    nota: 'esta bodega casi no está cargada en el ERP, así que la cifra la escribes tú',
  },
  {
    id: 'mecanizados', tipo: 'prima', nombre: 'Mecanizados',
    nota: 'aceros, fundición y ferretería de esa bodega, juntos',
    claves: [
      'MECANIZADOS|ACEROS',
      'MECANIZADOS|FUNDICIÓN - MECANIZADOS',
      'MECANIZADOS|FERRETERIA - MECANIZADOS',
      'MECANIZADOS|ALUMINIO - MECANIZADOS',
    ],
  },

  // ── Producto en proceso ──
  // Angie, 18/11/2026: "Piezas y partes de máquina · Piezas cortadas en plasma ·
  // Material mecanizado (este sí está en el erp), los otros 2 es lo que yo tengo que
  // sacar". Los dos primeros no existen en el ERP: son conteos suyos.
  //
  // El material fundido de hierro no estaba en esa lista y quedó un rato en "Sin
  // clasificar", hasta que ella lo confirmó: "el material fundido de hierro también es
  // material en proceso". Va antes del mecanizado porque ese es el orden de la
  // producción: primero se funde, después se mecaniza.
  {
    id: 'piezas_maquina', tipo: 'proceso', nombre: 'Piezas y partes de máquina',
    aMano: true, nota: 'no está en el ERP: lo sacas tú',
  },
  {
    id: 'piezas_plasma', tipo: 'proceso', nombre: 'Piezas cortadas en plasma',
    aMano: true, nota: 'no está en el ERP: lo sacas tú',
  },
  {
    id: 'fundido', tipo: 'proceso', nombre: 'Material fundido de hierro',
    nota: 'el que está en Fundición y el que ya pasó a Armado y soldadura',
    claves: ['FUNDICIÓN|MATERIAL FUNDIDO HIERRO', 'ARMADO Y SOLDADURA|MATERIAL FUNDIDO HIERRO'],
  },
  {
    id: 'material_mecanizado', tipo: 'proceso', nombre: 'Material mecanizado',
    claves: ['MECANIZADOS|PRODUCTO MECANIZADO'],
  },

  // ── Producto terminado y mercancía ──
  // Angie, 18/11/2026: "en productos terminados va: Poleas de aluminio, Máquinas
  // terminadas y motores constru". Los dos primeros no están en el ERP —no hay ninguna
  // categoría de aluminio con existencias, y las máquinas armadas no se registran—, así
  // que los escribe ella. El tercero sí está.
  {
    id: 'poleas_aluminio', tipo: 'terminado', nombre: 'Poleas de aluminio',
    aMano: true, nota: 'no está en el ERP: lo sacas tú',
  },
  {
    id: 'maquinas', tipo: 'terminado', nombre: 'Máquinas terminadas',
    aMano: true, nota: 'no está en el ERP: lo sacas tú',
  },
  {
    id: 'motores', tipo: 'terminado', nombre: 'Motores Constru',
    claves: ['MOTORES|MOTORES CONSTRU'],
  },

  // ── No es inventario de venta ──
  {
    id: 'consumibles', tipo: 'aparte', nombre: 'Consumibles de oficina y mantenimiento',
    bodegas: ['ADMINISTRACIÓN', 'MANTENIMIENTO'],
    claves: ['FUNDICIÓN|(sin categoría)'],
  },
]

// La clave de una categoría del ERP. Los nombres vienen con espacios de más
// ('ALUMINIO - FUNDICIÓN ', 'MOTORES CONSTRU '), así que se recortan antes de comparar.
export const claveCategoria = (bodega, categoria) =>
  `${String(bodega || '').trim()}|${String(categoria || '').trim()}`

// El concepto con el que se guarda en `eeff_manual`. Es el id del renglón, no la
// categoría: lo que Angie escribe es la línea que ve.
export const conceptoInventario = idRenglon => `inv:${idRenglon}`
export const esConceptoInventario = concepto => String(concepto || '').startsWith('inv:')

const redondear = n => Math.round(Number(n) || 0)

// A qué renglón va una fila del ERP. null si no cae en ninguno.
function renglonDe(bodega, clave) {
  return RENGLONES.find(r =>
    (r.bodegas || []).includes(bodega) || (r.claves || []).includes(clave),
  ) || null
}

// Arma el inventario por tipo y renglón.
//   `filas`  = lo que devuelve finanzas_inventario(): [{ bodega, categoria, items, sin_costo, valor }]
//   `manual` = lo que escribió Angie, por concepto: { 'inv:almacen': 94000000, … }
export function calcularInventario(filas, manual) {
  // Un acumulador por renglón, más uno por cada categoría que no cayó en ninguno
  const acum = new Map()
  const sueltas = new Map()

  for (const f of filas || []) {
    const bodega = String(f.bodega || '').trim()
    const categoria = String(f.categoria || '').trim()
    const clave = claveCategoria(bodega, categoria)
    const dato = {
      clave, bodega, categoria,
      erp: redondear(f.valor),
      items: Number(f.items) || 0,
      sinCosto: Number(f.sin_costo) || 0,
    }
    const r = renglonDe(bodega, clave)
    const destino = r ? acum : sueltas
    const id = r ? r.id : clave
    if (!destino.has(id)) destino.set(id, [])
    destino.get(id).push(dato)
  }

  const armar = (def, cats) => {
    const erp = cats.reduce((s, c) => s + c.erp, 0)
    const concepto = conceptoInventario(def.id)
    const escrito = manual?.[concepto]
    return {
      ...def, concepto,
      categorias: [...cats].sort((a, b) => b.erp - a.erp),
      erp,
      items: cats.reduce((s, c) => s + c.items, 0),
      sinCosto: cats.reduce((s, c) => s + c.sinCosto, 0),
      // Lo escrito reemplaza lo del ERP
      escrito: escrito == null ? null : redondear(escrito),
      valor: escrito == null ? erp : redondear(escrito),
    }
  }

  const renglones = RENGLONES
    .map(r => armar(r, acum.get(r.id) || []))
    // Un renglón sin nada en el ERP se sigue mostrando si Angie lo llena a mano
    // (Ferretería es justo ese caso) o si ya tiene algo escrito
    .filter(r => r.categorias.length || r.aMano || r.escrito != null)

  const porTipo = TIPOS_INVENTARIO.map(t => {
    const suyos = renglones.filter(r => r.tipo === t.id)
    return {
      ...t, renglones: suyos,
      total: suyos.reduce((s, r) => s + r.valor, 0),
      items: suyos.reduce((s, r) => s + r.items, 0),
      sinCosto: suyos.reduce((s, r) => s + r.sinCosto, 0),
      vacio: !suyos.length,
    }
  }).filter(t => !t.vacio)

  // Lo que no cayó en ningún renglón, una línea por categoría, a la vista
  const sinClasificar = [...sueltas.entries()].map(([clave, cats]) => armar({
    id: `suelta:${clave}`, nombre: cats[0].categoria, bodegaTexto: cats[0].bodega, alerta: true,
  }, cats))
  const totalSinClasificar = sinClasificar.reduce((s, r) => s + r.valor, 0)

  const deVenta = porTipo.filter(t => !t.fueraDelTotal)
  const total = deVenta.reduce((s, t) => s + t.total, 0) + totalSinClasificar

  const todos = [...porTipo.flatMap(t => t.renglones), ...sinClasificar]
  return {
    tipos: porTipo,
    sinClasificar, totalSinClasificar,
    total,
    items: todos.reduce((s, r) => s + r.items, 0),
    sinCosto: todos.reduce((s, r) => s + r.sinCosto, 0),
    escritas: todos.filter(r => r.escrito != null).length,
    renglones: todos.length,
  }
}
