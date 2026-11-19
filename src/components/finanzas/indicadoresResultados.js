// ─────────────────────────────────────────────────────────────────────────────
// LOS INDICADORES DEL ESTADO DE RESULTADOS
//
// Los mismos que Angie llevaba en la hoja `📊 INDICADORES` de su Excel `EEFF 2026.xlsx`,
// con las mismas fórmulas, pero calculados sobre nuestro propio P&G en vez de sobre el de
// la hoja. Los pidió el 19/11/2026: "necesito mirar indicadores del estado de resultados,
// y no solo del balance, así como en el excel, necesito el comparativo de dichos
// indicadores mes a mes a ver si han mejorado y el promedio del año".
//
// Ningún indicador de aquí vuelve a sumar cuentas: todos salen del objeto que devuelve
// `calcularMes` (o `calcularMesHistorico` para los meses que vienen del Excel), así que no
// hay forma de que la tabla de indicadores y el P&G digan cosas distintas.
//
// ── LA COLUMNA DEL AÑO NO ES UN PROMEDIO ─────────────────────────────────────
// Es el indicador calculado sobre los totales del año, que es como lo hace su Excel
// (la columna "AÑO 2026" apunta a la columna de totales del P&G, no a un promedio de las
// otras columnas). Y es lo correcto: si en un mes se vendieron $200 millones y en otro
// $700, promediar los dos márgenes le daría al mes flojo el mismo peso que al bueno. Al
// dividir utilidad del año sobre ventas del año, cada mes pesa lo que vendió.
//
// ── UNA DIFERENCIA A PROPÓSITO CON EL EXCEL ──────────────────────────────────
// En el Excel el margen neto es un estimado: toma la utilidad operacional y la multiplica
// por 0,67, como si lo único que faltara fuera el 33% de renta. Lo hace porque esa hoja no
// baja de la utilidad operacional. Nuestro P&G sí tiene los gastos no operacionales reales
// (intereses bancarios, gravámenes, intereses de impuestos), así que aquí el margen neto es
// el de verdad: utilidad neta sobre ingresos, antes del impuesto de renta. Por eso no va a
// coincidir con el del Excel, y el de aquí es el bueno.
// ─────────────────────────────────────────────────────────────────────────────

const div = (a, b) => (b ? a / b : null)

// Lo único que un indicador necesita saber de un mes. Sale del cálculo del P&G, sin
// recalcular nada: si cambia una regla de costos allá, estos indicadores cambian solos.
export function resumenDe(calc) {
  if (!calc) return null
  return {
    ingresos: calc.ingresoBase || 0,
    costosDirectos: calc.porBloque.costos_directos || 0,
    cif: calc.porBloque.cif || 0,
    gastosOp: calc.porBloque.gastos_op || 0,
    gastosNoOp: calc.porBloque.gastos_no_op || 0,
    utilidadBruta: calc.utilidadBruta || 0,
    utilidadOperacional: calc.utilidadOperacional || 0,
    utilidadNeta: calc.utilidadNeta || 0,
  }
}

const CAMPOS = ['ingresos', 'costosDirectos', 'cif', 'gastosOp', 'gastosNoOp',
  'utilidadBruta', 'utilidadOperacional', 'utilidadNeta']

// La columna del año: los totales de los meses que ya están, para calcular el indicador
// sobre ellos. Ver la nota de arriba sobre por qué no se promedian los indicadores.
export function sumarResumenes(lista) {
  const vivos = lista.filter(Boolean)
  if (!vivos.length) return null
  return Object.fromEntries(CAMPOS.map(c => [c, vivos.reduce((s, r) => s + r[c], 0)]))
}

const margenBruto = k => div(k.utilidadBruta, k.ingresos)

// `mejorEs` dice para qué lado es bueno que se mueva, y es lo que pinta la flechita de
// cada celda: en un margen subir es bueno, en un costo sobre ventas subir es malo.
export const INDICADORES_PYG = [
  { tipo: 'grupo', nombre: 'Rentabilidad' },
  {
    tipo: 'dato', id: 'margen_bruto', nombre: 'Margen bruto', formato: 'pct', mejorEs: 'alto',
    explica: 'De cada $100 que se vende, lo que queda después de pagar la materia prima, la mano de obra y los costos indirectos de planta.',
    valor: margenBruto,
  },
  {
    tipo: 'dato', id: 'margen_operativo', nombre: 'Margen operativo', formato: 'pct', mejorEs: 'alto',
    explica: 'Lo mismo, pero ya descontando los gastos de administración y de ventas. Es lo que deja el negocio operando.',
    valor: k => div(k.utilidadOperacional, k.ingresos),
  },
  {
    tipo: 'dato', id: 'margen_neto', nombre: 'Margen neto', formato: 'pct', mejorEs: 'alto',
    explica: 'Lo que queda al final, después de los intereses y el 4x1000, y antes del impuesto de renta.',
    valor: k => div(k.utilidadNeta, k.ingresos),
  },

  { tipo: 'grupo', nombre: 'Estructura de costos' },
  {
    tipo: 'dato', id: 'costos_ventas', nombre: 'Costos directos / ventas', formato: 'pct', mejorEs: 'bajo',
    explica: 'Qué parte de cada venta se va en materia prima y mano de obra. Es el costo que sube y baja con la producción.',
    valor: k => div(k.costosDirectos, k.ingresos),
  },
  {
    tipo: 'dato', id: 'cif_ventas', nombre: 'CIF / ventas', formato: 'pct', mejorEs: 'bajo',
    explica: 'Qué parte de cada venta se va en costos indirectos de planta: servicios, mantenimiento, transporte, dotación e insumos.',
    valor: k => div(k.cif, k.ingresos),
  },
  {
    tipo: 'dato', id: 'gastos_ventas', nombre: 'Gastos operacionales / ventas', formato: 'pct', mejorEs: 'bajo',
    explica: 'Qué parte de cada venta se va en administración y ventas. Casi no se mueve con la producción, así que en un mes flojo pesa más.',
    valor: k => div(k.gastosOp, k.ingresos),
  },

  { tipo: 'grupo', nombre: 'Eficiencia operativa' },
  {
    tipo: 'dato', id: 'equilibrio', nombre: 'Punto de equilibrio', formato: 'pesos', mejorEs: 'bajo',
    explica: 'Cuánto hay que vender en el mes para no perder ni ganar. Si las ventas quedan por debajo, el mes dio pérdida.',
    valor: k => {
      const contribucion = 1 - (div(k.costosDirectos, k.ingresos) ?? 1)
      return contribucion > 0 ? (k.cif + k.gastosOp) / contribucion : null
    },
  },
  {
    tipo: 'dato', id: 'apalancamiento', nombre: 'Apalancamiento operativo', formato: 'veces', mejorEs: null,
    explica: 'Cuántas veces cabe el margen operativo dentro del bruto. Mientras más alto, más se le mueve la utilidad al negocio cuando cambian las ventas: vender un poco más dispara la ganancia, y vender un poco menos la hunde.',
    valor: k => {
      const op = div(k.utilidadOperacional, k.ingresos)
      return op && op > 0 ? div(margenBruto(k), op) : null
    },
  },

  { tipo: 'grupo', nombre: 'Comparativo con el mes anterior' },
  {
    tipo: 'dato', id: 'crecimiento', nombre: 'Crecimiento de las ventas', formato: 'variacion', mejorEs: 'alto',
    sinAno: true, sinFlecha: true,
    explica: 'Cuánto subieron o bajaron las ventas frente al mes anterior.',
    valor: (k, prev) => (prev ? div(k.ingresos - prev.ingresos, prev.ingresos) : null),
  },
  {
    tipo: 'dato', id: 'variacion_margen', nombre: 'Variación del margen bruto', formato: 'puntos', mejorEs: 'alto',
    sinAno: true, sinFlecha: true,
    explica: 'Cuántos puntos ganó o perdió el margen bruto frente al mes anterior. Tres puntos sobre $500 millones de venta son $15 millones de utilidad.',
    valor: (k, prev) => {
      const hoy = margenBruto(k)
      const antes = prev ? margenBruto(prev) : null
      return hoy == null || antes == null ? null : (hoy - antes) * 100
    },
  },
]

export const DATOS_PYG = INDICADORES_PYG.filter(i => i.tipo === 'dato')

// ── CÓMO SE ESCRIBE CADA CIFRA ───────────────────────────────────────────────
const coma = (n, dec) => n.toFixed(dec).replace('.', ',')

export function formatearIndicador(v, formato) {
  if (v == null || !Number.isFinite(v)) return '—'
  if (formato === 'pct') return `${coma(v * 100, 1)} %`
  if (formato === 'variacion') return `${v > 0 ? '+' : ''}${coma(v * 100, 1)} %`
  if (formato === 'puntos') return `${v > 0 ? '+' : ''}${coma(v, 1)} pts`
  if (formato === 'veces') return coma(v, 2)
  return `$${Math.round(v).toLocaleString('es-CO')}`
}

// ¿Este mes está mejor o peor que el anterior? Devuelve 1 si mejoró, −1 si empeoró, 0 si
// quedó igual, y null cuando no hay con qué comparar o el indicador no tiene lado bueno.
export function mejoraFrenteA(indicador, valor, valorPrevio) {
  if (!indicador.mejorEs || indicador.sinFlecha) return null
  if (valor == null || valorPrevio == null) return null
  if (!Number.isFinite(valor) || !Number.isFinite(valorPrevio)) return null
  const dif = valor - valorPrevio
  // Un movimiento de menos de la décima que se muestra no es un movimiento: es redondeo
  const umbral = indicador.formato === 'pct' ? 0.0005 : Math.abs(valorPrevio) * 0.0005
  if (Math.abs(dif) <= umbral) return 0
  return (dif > 0) === (indicador.mejorEs === 'alto') ? 1 : -1
}

// La tabla completa, lista para pintar: por cada indicador, su valor en cada mes y la
// columna del año. Si mejoró o empeoró lo decide la pantalla con `mejoraFrenteA`, porque
// la flecha necesita además saber para dónde se movió la cifra.
export function calcularIndicadoresPyg(porMes) {
  const resumenes = porMes.map(x => (x.listo ? resumenDe(x.calc) : null))
  const ano = sumarResumenes(resumenes)

  return DATOS_PYG.map(ind => {
    const valores = resumenes.map((r, i) => {
      if (!r) return null
      // El mes anterior solo sirve de referencia si de verdad se pudo calcular
      const prev = i > 0 ? resumenes[i - 1] : null
      return ind.valor(r, prev)
    })
    return {
      indicador: ind,
      valores,
      ano: ind.sinAno || !ano ? null : ind.valor(ano, null),
    }
  })
}
