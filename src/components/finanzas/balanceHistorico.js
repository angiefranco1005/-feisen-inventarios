// ─────────────────────────────────────────────────────────────────────────────
// EL BALANCE DE ENERO A SEPTIEMBRE, DEL EXCEL DE ANGIE
//
// Mismo criterio que el estado de resultados (ver eeffHistorico.js): hasta septiembre
// de 2026 mandan las cifras de su Excel `Desktop/EEFF/EEFF 2026.xlsx`, hoja `💰 BALANCE`;
// desde octubre manda Odoo. Angie lo pidió el 19/11/2026 al ver que el comparativo entre
// meses mezclaba sus cifras de octubre con las de Odoo de los meses anteriores: "lo de
// los meses anteriores tienes que coger prácticamente lo que yo tenía en el excel".
//
// ── UNA CORRECCIÓN SOBRE EL ARCHIVO ──────────────────────────────────────────
// El efectivo de su Excel está inflado de abril en adelante. La fila "TOTAL EFECTIVO Y
// EQUIVALENTES" usa `=SUM(E4:E11)`, que suma el subtotal "Bancos — SIIGO" **y además**
// sus dos componentes (Bancolombia y Davivienda), así que cuenta los bancos dos veces.
// Enero a marzo usan la fórmula correcta (`=B6+B9+B10+B11`); de abril en adelante, no.
//
//   Mes         Excel dice     De verdad suma    Inflado en
//   abril       288.699.257    176.573.973       112.125.284
//   mayo        167.891.869    121.195.369        46.696.500
//   junio        67.568.820     55.941.073        11.627.747
//   julio       144.026.579     89.610.576        54.416.003
//   agosto      205.024.125    142.145.022        62.879.103
//   septiembre  462.426.811    272.223.207       190.203.604
//
// Angie dijo "corrige el efectivo", así que aquí van los valores de verdad: la suma de
// bancos + efectivo + fiducias + tarjetas prepago. **Estas cifras no coinciden con las
// que muestra su Excel** de abril a septiembre, y esa es la razón.
//
// ── LO QUE NO SE TRAE DEL EXCEL ──────────────────────────────────────────────
// El patrimonio **no** sale de este archivo. Su hoja de balance tiene dos problemas que
// lo hacen inservible: la fila "Utilidad del ejercicio" trae la utilidad **del mes** y no
// la acumulada del año (en junio hasta sale negativa), y "Utilidades retenidas" está en
// cero todos los meses. Así que el patrimonio de estos meses sale de lo mismo que el de
// octubre: la utilidad acumulada de nuestro propio estado de resultados.
//
// Por eso la diferencia de la Comprobación en estos meses **no va a ser la misma** que la
// fila "VERIFICACIÓN (debe ser 0)" del Excel, que va de −$136.620.337 en marzo a
// +$282.265.443 en septiembre.
// ─────────────────────────────────────────────────────────────────────────────

export const PRIMER_MES = '2026-01'
export const ULTIMO_MES = '2026-09'

export const hayBalanceHistorico = mes => mes >= PRIMER_MES && mes <= ULTIMO_MES

const MESES = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']

// Un arreglo por renglón, en el orden de MESES. Las cifras vienen de la hoja `💰 BALANCE`
// tal cual, salvo `disponible`, que es la suma corregida de sus cuatro componentes.
const DATOS = {
  // ── Activo ──
  // bancos + efectivo + fiducias + tarjetas prepago (sin el doble conteo del archivo)
  disponible: [135667888, 72148379, 122147742, 176573973, 121195369, 55941073, 89610576, 142145022, 272223207],
  // TOTAL CUENTAS POR COBRAR (clientes SIIGO = Feisen, clientes ODOO = FC)
  deudores: [452431811, 530239920, 521013596, 475715813, 420846340, 326207262, 406891896, 398130088, 231139200],
  // Los tres tipos de inventario, que son justo los que Angie definió para el ERP
  invPrima: [145445169, 176264625, 134157555, 195889580, 253560689, 234516438, 233649216, 175257413, 247150173],
  invProceso: [78506581, 91996192, 80742633, 92382940, 100874944, 112287564, 126912284, 100184137, 142768199],
  invTerminado: [251008409, 208453868, 182580342, 221192240, 180387432, 208248023, 241063402, 227803265, 121171372],
  // Propiedad, planta y equipo. La depreciación acumulada del Excel está en cero todos
  // los meses, así que esto es el valor bruto: en el Excel no se deprecia nada.
  ppe: [800000000, 923000000, 960000000, 970100000, 975200000, 987200000, 987200000, 1052200000, 1052200000],

  // ── Pasivo ──
  // TOTAL CUENTAS POR PAGAR (proveedores SIIGO + ODOO)
  proveedores: [786751537, 863189691, 854983046, 854691208, 849192535, 768853357, 742533469, 730905267, 706618686],
  // TOTAL OBLIGACIONES LABORALES (seguridad social, primas, vacaciones, cesantías e intereses)
  laborales: [76390848, 95273166, 104248511, 77786035, 69181054, 50831775, 56142935, 70858831, 87384576],
  // TOTAL NÓMINA POR PAGAR (nómina de planta, fundición, aluminio y contratistas)
  nomina: [108329950, 106203542, 117607491, 109671686, 100180391, 84792958, 93580883, 95809191, 96767450],
  // TOTAL IMPUESTOS POR PAGAR (IVA, ICA, rete ICA, autorretención y retención en la fuente)
  impuestos: [278132032, 304667000, 273249000, 298570000, 265652100, 254652000, 260093000, 322965005, 288644000],
  // Obligaciones financieras, que el Excel sí parte por plazo
  finCorto: [157198448, 206811639, 211122179, 238815690, 210029075, 190808996, 172529704, 160247223, 140984181],
  finLargo: [230303730, 343028370, 343028370, 343028370, 343028370, 343028370, 343028370, 455753010, 455753010],
}

const val = (campo, i) => DATOS[campo][i] || 0

// Arma un mes con la misma forma que devuelve `calcularBalance`, para que la pantalla y
// el comparativo no tengan que saber de dónde salió cada mes.
//
// `resultadoEjercicio` es la utilidad acumulada de nuestro P&G hasta ese mes: entra por
// parámetro igual que en el balance de Odoo, porque no se saca de este archivo.
export function calcularBalanceHistorico(mes, resultadoEjercicio) {
  const i = MESES.indexOf(mes)
  if (i < 0) return null

  const inventarioTotal = val('invPrima', i) + val('invProceso', i) + val('invTerminado', i)
  const financieras = val('finCorto', i) + val('finLargo', i)

  const grupo = (id, nombre, total, extra = {}) => ({
    id, nombre, total, feisen: 0, fc: 0, detalle: [], vacio: !total, ...extra,
  })

  const activo = {
    id: 'activo', titulo: 'Activo', tituloTotal: 'Total activo', feisen: 0, fc: 0,
    grupos: [
      grupo('11', 'Disponible', val('disponible', i), { manual: true }),
      grupo('13', 'Deudores', val('deudores', i)),
      grupo('14', 'Inventarios', inventarioTotal, { manual: true }),
      grupo('15', 'Propiedad, planta y equipo', val('ppe', i)),
    ],
  }
  activo.total = activo.grupos.reduce((s, g) => s + g.total, 0)

  const pasivo = {
    id: 'pasivo', titulo: 'Pasivo', tituloTotal: 'Total pasivo', feisen: 0, fc: 0,
    grupos: [
      grupo('21', 'Obligaciones financieras', financieras),
      grupo('22', 'Proveedores', val('proveedores', i)),
      // En el Excel la nómina y los contratistas por pagar van aparte de las prestaciones;
      // aquí la nómina cae en cuentas por pagar y las prestaciones en obligaciones laborales
      grupo('23', 'Cuentas por pagar', val('nomina', i)),
      grupo('24', 'Impuestos, gravámenes y tasas', val('impuestos', i)),
      grupo('25', 'Obligaciones laborales', val('laborales', i)),
    ],
  }
  pasivo.total = pasivo.grupos.reduce((s, g) => s + g.total, 0)

  const patrimonioTotal = resultadoEjercicio == null ? null : Math.round(resultadoEjercicio)
  const patrimonio = {
    id: 'patrimonio', titulo: 'Patrimonio', tituloTotal: 'Total patrimonio',
    feisen: 0, fc: 0, grupos: [], total: patrimonioTotal, sinResultado: patrimonioTotal == null,
  }

  const ladoDerecho = pasivo.total + (patrimonioTotal || 0)
  const ecuacion = {
    activo: activo.total,
    pasivoMasPatrimonio: ladoDerecho,
    diferencia: patrimonioTotal == null ? null : activo.total - ladoDerecho,
    incompleta: patrimonioTotal == null,
  }

  // El Excel ya trae la deuda financiera partida por plazo, así que estos meses no
  // necesitan la casilla que Angie llena para los meses de Odoo.
  const activoCorriente = val('disponible', i) + val('deudores', i) + inventarioTotal
  const pasivoCorriente = val('finCorto', i) + val('proveedores', i) + val('nomina', i)
    + val('impuestos', i) + val('laborales', i)
  const corriente = {
    activoCorriente,
    activoNoCorriente: val('ppe', i),
    pasivoCorriente,
    pasivoNoCorriente: val('finLargo', i),
    deudaEscrita: val('finCorto', i),
    sinDeuda: false,
    capitalTrabajo: activoCorriente - pasivoCorriente,
    razon: pasivoCorriente ? activoCorriente / pasivoCorriente : null,
  }

  return {
    historico: true,
    secciones: [activo, pasivo, patrimonio],
    activo,
    ecuacion,
    corriente,
    disponible: { total: val('disponible', i), hay: true, casillas: [], escritas: 4 },
    inventario: {
      total: inventarioTotal,
      tipos: [
        { id: 'prima', nombre: 'Materias primas e insumos', total: val('invPrima', i), renglones: [] },
        { id: 'proceso', nombre: 'Producto en proceso', total: val('invProceso', i), renglones: [] },
        { id: 'terminado', nombre: 'Producto terminado y mercancía', total: val('invTerminado', i), renglones: [] },
      ],
      sinClasificar: [], totalSinClasificar: 0, items: 0, sinCosto: 0, escritas: 0, renglones: 3,
    },
    // Estos meses no vienen de Odoo, así que no hay nada de esto
    transitorias: { id: 'transitorias', nombre: 'Partidas por aclarar', feisen: 0, fc: 0, total: 0, detalle: [], vacio: true },
    socios: { id: 'socios', nombre: 'Cuentas de socios', feisen: 0, fc: 0, total: 0, detalle: [], vacio: true },
    patrimonioOdoo: [],
    resultadoOdoo: { total: 0, detalle: [] },
    inventarioOdoo: 0,
    cuadreOdoo: { feisen: 0, fc: 0, total: 0, cuadra: false },
    cuentas: 0,
  }
}
