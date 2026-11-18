// ─────────────────────────────────────────────────────────────────────────────
// EL BALANCE GENERAL, EN UN SOLO SITIO
//
// Esto NO comparte nada con el estado de resultados (calculoEeff.js): es una
// vista aparte, con su propio dato y su propia cuenta. Si tocas algo aquí no
// cambia ni un número del P&G.
//
// De dónde sale: función `finanzas-balance`, que se llama con { mes: '2026-10' }
// y devuelve { mes, hasta, feisen: [{ codigo, nombre, saldo }, …], fc: [...] }.
// El `saldo` es el acumulado **hasta el último día de ese mes**, no el de hoy.
//
// Por qué a fin de mes y no a hoy (decisión de Angie, 17/11/2026): el disponible
// lo llena ella a mano con los extractos del banco, y los extractos son mensuales.
// Mezclar un extracto de octubre con la cartera de hoy daría un balance falso, así
// que **todo el balance se corta a la misma fecha**.
//
// Dos cosas que se verificaron contra Odoo el 13/11/2026 y en las que se apoya
// todo lo de abajo:
//
//  1. Cada cuenta que se lee es una cuenta real donde se contabiliza.
//     **No hay cuentas padre que repitan a sus hijas**, así que sumar todo es
//     correcto y no hay que quitar nada por prefijo.
//  2. Si se suma el saldo de **todas** las cuentas de una empresa da **cero**,
//     en las dos. Esa suma en cero dice que la contabilidad de Odoo cuadra
//     consigo misma, y se usa para el aviso de arriba del balance.
//
// EL DISPONIBLE NO SALE DE ODOO. Palabras de Angie: "el banco yo lo lleno a mano,
// con lo de los extractos y eso, no con lo que hay en los odoo, porque casi nunca
// es verídico". Así que el grupo 11 se arma con las casillas que ella escribe
// (tabla `eeff_manual`, concepto 'banco:…', empresa 'total').
//
// Las cuentas 11xx de Odoo **se descartan del todo** (18/11/2026): "quita eso de lo
// que hay en odoo y deja solo lo que yo voy a ingresar en efectivo y bancos". No
// entran al activo y tampoco se muestran como referencia. Con ellas se fue la fila
// "Plata mal registrada en bancos", que era (disponible escrito) − (disponible de
// Odoo): sin el dato de Odoo no hay resta que hacer. Esa comparación, si algún día
// se quiere, hay que hacerla contra Odoo directamente.
//
// Ojo: la suma de TODAS las cuentas de Odoo (`cuadreOdoo`) sí las sigue contando,
// porque es lo que dice que cada contabilidad cuadra consigo misma.
//
// Signos: en Odoo los activos vienen positivos y los pasivos, el patrimonio y
// los ingresos vienen negativos. Para que se lean números positivos, aquí se les
// voltea el signo al pasivo, al patrimonio y al resultado. Las transitorias se
// dejan **tal como vienen**, porque unas veces se comportan como activo
// (saldo positivo) y otras como pasivo (saldo negativo).
// ─────────────────────────────────────────────────────────────────────────────

export const EMPRESAS_BAL = [{ id: 'feisen', nombre: 'Feisen' }, { id: 'fc', nombre: 'FC' }]

// Las casillas del disponible: los mismos renglones que Angie tiene en su Excel.
// Se guardan en `eeff_manual` con el mes del balance, concepto 'banco:<id>' y
// empresa 'total' (lo que escribe es el saldo de las dos empresas juntas).
export const CUENTAS_DISPONIBLE = [
  { id: 'bancolombia', nombre: 'Bancolombia' },
  { id: 'davivienda', nombre: 'Davivienda' },
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'fiducias', nombre: 'Fiducias' },
]
export const conceptoBanco = id => `banco:${id}`
export const esConceptoBanco = concepto => String(concepto || '').startsWith('banco:')

// Los grupos del PUC, por los dos primeros dígitos del código de cuenta.
// El último grupo de cada sección lleva `resto: true`: recoge cualquier cuenta de
// esa clase que no caiga en los grupos de arriba, para que no se pierda nada.
// El 11 lleva `manual: true`: no se arma con las cuentas de Odoo (que se descartan)
// sino con las casillas que escribe Angie.
export const SECCIONES = [
  {
    id: 'activo', titulo: 'Activo', tituloTotal: 'Total activo', clase: '1', signo: 1,
    grupos: [
      { id: '11', nombre: 'Disponible', prefijos: ['11'], manual: true },
      { id: '12', nombre: 'Inversiones', prefijos: ['12'] },
      { id: '13', nombre: 'Deudores', prefijos: ['13'] },
      { id: '14', nombre: 'Inventarios', prefijos: ['14'] },
      {
        id: '15', nombre: 'Propiedad, planta y equipo', prefijos: ['15'],
        nota: 'el grupo muestra el valor neto: el costo menos la depreciación acumulada',
        // El detalle se parte en dos para que se vea la resta, no solo el neto
        partes: [
          { id: 'costo', nombre: 'Costo', test: c => !c.startsWith('159') },
          { id: 'depreciacion', nombre: '(−) Depreciación acumulada', test: c => c.startsWith('159') },
        ],
      },
      { id: '16', nombre: 'Intangibles', prefijos: ['16'] },
      { id: '17', nombre: 'Diferidos', prefijos: ['17'] },
      { id: '18', nombre: 'Otros activos', prefijos: ['18', '19'], resto: true },
    ],
  },
  {
    id: 'pasivo', titulo: 'Pasivo', tituloTotal: 'Total pasivo', clase: '2', signo: -1,
    grupos: [
      { id: '21', nombre: 'Obligaciones financieras', prefijos: ['21'] },
      { id: '22', nombre: 'Proveedores', prefijos: ['22'] },
      { id: '23', nombre: 'Cuentas por pagar', prefijos: ['23'] },
      { id: '24', nombre: 'Impuestos, gravámenes y tasas', prefijos: ['24'] },
      { id: '25', nombre: 'Obligaciones laborales', prefijos: ['25'] },
      { id: '26', nombre: 'Pasivos estimados', prefijos: ['26'] },
      { id: '27', nombre: 'Otros pasivos', prefijos: ['27', '28'], resto: true },
    ],
  },
  {
    id: 'patrimonio', titulo: 'Patrimonio', tituloTotal: 'Total patrimonio', clase: '3', signo: -1,
    grupos: [
      { id: '31', nombre: 'Capital social', prefijos: ['31'] },
      { id: '32', nombre: 'Superávit de capital', prefijos: ['32'] },
      { id: '33', nombre: 'Reservas', prefijos: ['33'] },
      { id: '34', nombre: 'Revalorización del patrimonio', prefijos: ['34'] },
      { id: '36', nombre: 'Resultados del ejercicio', prefijos: ['36'] },
      { id: '37', nombre: 'Resultados de ejercicios anteriores', prefijos: ['37'] },
      { id: '38', nombre: 'Superávit por valorizaciones', prefijos: ['38'] },
      { id: '35', nombre: 'Otras cuentas de patrimonio', prefijos: [], resto: true },
    ],
  },
]

// Hasta qué diferencia se considera que la suma de Odoo da cero (los saldos vienen
// con dos decimales y aquí todo se redondea a pesos)
export const TOLERANCIA = 2

// A qué sección y grupo va cada cuenta, por su código
function ubicar(codigo) {
  const clase = String(codigo).charAt(0)
  if (clase >= '4' && clase <= '7') return { seccion: 'resultado', grupo: 'resultado' }
  const dos = String(codigo).slice(0, 2)
  // El disponible de Odoo se descarta: el grupo 11 son las casillas que escribe Angie
  if (dos === '11') return { seccion: 'descartado', grupo: 'descartado' }
  const sec = SECCIONES.find(s => s.clase === clase)
  if (!sec) return { seccion: 'transitorias', grupo: 'transitorias' }   // clase 9 y cualquier otra
  const grupo = sec.grupos.find(g => !g.manual && g.prefijos.includes(dos)) || sec.grupos.find(g => g.resto)
  return { seccion: sec.id, grupo: grupo.id }
}

const redondear = n => Math.round(n || 0)

// Arma el balance de las dos empresas a fin del mes escogido.
// `datos`  = lo que devuelve finanzas-balance: { mes, hasta, feisen: [...], fc: [...] }
// `bancos` = lo que escribió Angie: { bancolombia: 12345, efectivo: 500, … }
//            (solo vienen las casillas con valor; una casilla vacía no está en el objeto)
export function calcularBalance(datos, bancos) {
  // Un acumulador por grupo, con el detalle cuenta por cuenta de las dos empresas
  const bolsas = new Map()      // 'seccion|grupo' → { feisen, fc, cuentas: Map(codigo → fila) }
  const bolsa = llave => {
    if (!bolsas.has(llave)) bolsas.set(llave, { feisen: 0, fc: 0, cuentas: new Map() })
    return bolsas.get(llave)
  }
  const sumaCruda = { feisen: 0, fc: 0 }        // la suma de TODAS las cuentas de Odoo: tiene que dar 0

  for (const { id: emp } of EMPRESAS_BAL) {
    for (const c of datos?.[emp] || []) {
      const codigo = String(c.codigo || '')
      if (!codigo) continue
      const saldo = Number(c.saldo) || 0
      sumaCruda[emp] += saldo
      const { seccion, grupo } = ubicar(codigo)
      const b = bolsa(`${seccion}|${grupo}`)
      b[emp] += saldo
      if (!b.cuentas.has(codigo)) b.cuentas.set(codigo, { codigo, nombre: c.nombre || '', feisen: 0, fc: 0 })
      b.cuentas.get(codigo)[emp] += saldo
      if (!b.cuentas.get(codigo).nombre && c.nombre) b.cuentas.get(codigo).nombre = c.nombre
    }
  }

  // Un grupo listo para pintar: cifras ya con el signo que se muestra y detalle ordenado por código
  const armarGrupo = (def, llave, signo) => {
    const b = bolsas.get(llave) || { feisen: 0, fc: 0, cuentas: new Map() }
    const detalle = [...b.cuentas.values()]
      .map(c => ({ ...c, feisen: redondear(c.feisen * signo), fc: redondear(c.fc * signo) }))
      .map(c => ({ ...c, total: c.feisen + c.fc }))
      .filter(c => c.feisen || c.fc)
      .sort((x, y) => x.codigo.localeCompare(y.codigo))
    const feisen = redondear(b.feisen * signo)
    const fc = redondear(b.fc * signo)
    return { ...def, feisen, fc, total: feisen + fc, detalle, vacio: !feisen && !fc && !detalle.length }
  }

  // ── El disponible que escribió Angie (grupo 11 del activo) ──
  // Una casilla vacía queda en null: no es un saldo de cero, es un dato que falta.
  const casillas = CUENTAS_DISPONIBLE.map(c => {
    const v = bancos?.[c.id]
    return { ...c, valor: v == null ? null : redondear(v) }
  })
  const escritas = casillas.filter(c => c.valor != null)
  const disponible = {
    id: '11', nombre: 'Disponible', prefijos: ['11'],
    casillas,
    escritas: escritas.length,
    hay: escritas.length > 0,
    // Mientras no haya nada escrito el total es null, para no pintar un $0 que parezca saldo real
    total: escritas.length ? escritas.reduce((s, c) => s + c.valor, 0) : null,
  }

  const secciones = SECCIONES.map(sec => {
    const grupos = sec.grupos.filter(g => !g.manual).map(g => armarGrupo(g, `${sec.id}|${g.id}`, sec.signo)).filter(g => !g.vacio)
    const feisen = grupos.reduce((s, g) => s + g.feisen, 0)
    const fc = grupos.reduce((s, g) => s + g.fc, 0)
    return { ...sec, grupos, feisen, fc, total: feisen + fc }
  })

  // El activo suma el disponible escrito, que no tiene columna por empresa: lo que
  // Angie escribe es el total de las dos juntas.
  const activo = secciones.find(s => s.id === 'activo')
  activo.sinDisponible = !disponible.hay
  activo.total = activo.feisen + activo.fc + (disponible.total || 0)

  // El resultado del periodo: menos la suma de las clases 4, 5, 6 y 7
  // (ingresos menos costos y gastos). Va dentro del patrimonio.
  const resultado = armarGrupo(
    { id: 'resultado', nombre: 'Resultado del periodo', nota: 'ingresos menos costos y gastos (cuentas 4, 5, 6 y 7)' },
    'resultado|resultado', -1,
  )
  const patrimonio = secciones.find(s => s.id === 'patrimonio')
  const patrimonioRegistrado = { feisen: patrimonio.feisen, fc: patrimonio.fc }
  patrimonio.grupos.push(resultado)
  patrimonio.feisen += resultado.feisen
  patrimonio.fc += resultado.fc
  patrimonio.total = patrimonio.feisen + patrimonio.fc

  // Transitorias: se dejan con el saldo tal como viene de Odoo
  const transitorias = armarGrupo(
    { id: 'transitorias', nombre: 'Movimientos transitorios' }, 'transitorias|transitorias', 1,
  )

  // Que la suma de todas las cuentas de Odoo dé cero sigue siendo cierto y sigue
  // sirviendo: dice que la contabilidad cuadra consigo misma.
  const cuadreOdoo = {}
  for (const e of ['feisen', 'fc']) cuadreOdoo[e] = redondear(sumaCruda[e])
  cuadreOdoo.total = cuadreOdoo.feisen + cuadreOdoo.fc
  cuadreOdoo.cuadra = EMPRESAS_BAL.every(({ id }) => Math.abs(cuadreOdoo[id]) <= TOLERANCIA)

  // Cuántas cuentas de Odoo se leyeron de verdad: las 11xx se descartaron, así que
  // no se cuentan (si no, el pie diría que se leyeron más cuentas de las que se ven).
  // Se cuenta renglón por renglón, no por código: la misma cuenta puede estar en las dos.
  const cuentas = EMPRESAS_BAL.reduce((n, { id }) => n
    + (datos?.[id] || []).filter(c => !String(c.codigo || '').startsWith('11')).length, 0)

  return {
    secciones, transitorias, resultado, patrimonioRegistrado,
    disponible, cuadreOdoo, activo, cuentas,
  }
}
