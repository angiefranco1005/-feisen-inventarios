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
  // Entra el 18/11/2026, en el puesto que dejó libre la caja menor: "añade una cuenta
  // en el efectivo donde estaba caja menor x tarjeta prepago"
  { id: 'tarjeta_prepago', nombre: 'Tarjeta prepago' },
]
export const conceptoBanco = id => `banco:${id}`
export const esConceptoBanco = concepto => String(concepto || '').startsWith('banco:')

// Los grupos del PUC, por los dos primeros dígitos del código de cuenta.
// El último grupo de cada sección lleva `resto: true`: recoge cualquier cuenta de
// esa clase que no caiga en los grupos de arriba, para que no se pierda nada.
// El 11 y el 14 llevan `manual: true`: no se arman con las cuentas de Odoo sino con
// otra fuente. El 11 son las casillas que escribe Angie con los extractos; el 14 es el
// inventario del ERP por tipo y categoría (ver inventarioBalance.js), que también se
// puede corregir a mano. En los dos casos las cuentas de Odoo se descartan.
export const SECCIONES = [
  {
    id: 'activo', titulo: 'Activo', tituloTotal: 'Total activo', clase: '1', signo: 1,
    grupos: [
      { id: '11', nombre: 'Disponible', prefijos: ['11'], manual: true },
      { id: '12', nombre: 'Inversiones', prefijos: ['12'] },
      { id: '13', nombre: 'Deudores', prefijos: ['13'] },
      { id: '14', nombre: 'Inventarios', prefijos: ['14'], manual: true },
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
      // Estos tres salen **solo de Feisen** (decisión de Angie, 18/11/2026: "en las
      // cuentas por pagar 23, usa las cuentas de odoo feisen solamente. lo mismo que la
      // 24 y la 25"). Lo que FC tenga en esas clases no entra al pasivo; si algún día
      // tiene algo, se avisa en el grupo en vez de desaparecer sin más.
      { id: '23', nombre: 'Cuentas por pagar', prefijos: ['23'], soloFeisen: true },
      { id: '24', nombre: 'Impuestos, gravámenes y tasas', prefijos: ['24'], soloFeisen: true },
      { id: '25', nombre: 'Obligaciones laborales', prefijos: ['25'], soloFeisen: true },
      { id: '26', nombre: 'Pasivos estimados', prefijos: ['26'] },
      { id: '27', nombre: 'Otros pasivos', prefijos: ['27', '28'], resto: true },
    ],
  },
  {
    // EL PATRIMONIO NO SALE DE ODOO (18/11/2026). Angie: "el capital social sé que es
    // más, mis papás han reinvertido pero eso nunca quedó registrado contablemente; lo
    // de las reservas nunca hemos tenido reservas reales; solo deberíamos contar el
    // resultado del ejercicio, del PYG del erp".
    //
    // Así que las cuentas de clase 3 de Odoo se descartan enteras y el patrimonio es un
    // solo renglón: la utilidad acumulada de nuestro P&G hasta el mes del balance. Los
    // saldos que Odoo sí tiene registrados se guardan en `patrimonioOdoo` para poder
    // decir en pantalla qué se está dejando fuera.
    id: 'patrimonio', titulo: 'Patrimonio', tituloTotal: 'Total patrimonio', clase: '3', signo: -1,
    grupos: [
      { id: 'resultado', nombre: 'Resultado del ejercicio', manual: true },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// CUENTAS DE SOCIOS: fuera de todos los totales (18/11/2026)
//
// Angie: "AFC AVF son las cuentas de socios, eso no lo debemos tener en cuenta
// para el balance". Son plata que salió del negocio hacia los socios, así que no
// es cartera ni deuda con un tercero y no puede contar para el activo ni para los
// indicadores de endeudamiento.
//
// **Van por empresa, no por código**, y eso es a propósito: el mismo código
// significa cosas distintas en los dos libros. La 233506 de FC es "Cuentas por
// pagar a socios Angie", pero la 233506 de Feisen es "Otras Cuentas Por Pagar",
// que sí es deuda con terceros y tiene que quedarse en el pasivo. Clasificar por
// código solo sacaría la cuenta equivocada.
//
// No se borran: se muestran en su propio bloque al final, como las transitorias,
// con el signo tal como viene de Odoo (positivo = se lo deben al negocio,
// negativo = el negocio se lo debe al socio).
export const CUENTAS_SOCIOS = {
  feisen: ['133002', '133003'],   // Otras cuentas por cobrar AVF y AFC
  fc: ['233506'],                 // Cuentas por pagar a socios Angie
}

// Hasta qué diferencia se considera que la suma de Odoo da cero (los saldos vienen
// con dos decimales y aquí todo se redondea a pesos)
export const TOLERANCIA = 2

// A qué sección y grupo va cada cuenta, por su código y por el libro del que sale
function ubicar(codigo, empresa) {
  // Las de socios salen de todos los totales, sea cual sea su clase
  if (CUENTAS_SOCIOS[empresa]?.includes(String(codigo))) return { seccion: 'socios', grupo: 'socios' }
  const clase = String(codigo).charAt(0)
  if (clase >= '4' && clase <= '7') return { seccion: 'resultado', grupo: 'resultado' }
  const dos = String(codigo).slice(0, 2)
  // El disponible de Odoo se descarta: el grupo 11 son las casillas que escribe Angie
  if (dos === '11') return { seccion: 'descartado', grupo: 'descartado' }
  // El inventario de Odoo tampoco entra: el grupo 14 sale del ERP. Se aparta en su
  // propia bolsa para poder decir, en la nota del grupo, cuánto dice la contabilidad.
  if (dos === '14') return { seccion: 'inventarioOdoo', grupo: 'inventarioOdoo' }
  // Y el patrimonio entero: el resultado del ejercicio sale del P&G, no de estas cuentas
  if (clase === '3') return { seccion: 'patrimonioOdoo', grupo: dos }
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
// `inventario` = lo que devuelve calcularInventario() de inventarioBalance.js, o null
//            mientras se está leyendo del ERP
// `resultadoEjercicio` = la utilidad acumulada de nuestro P&G hasta el mes del balance,
//            o null mientras se está calculando. Es TODO el patrimonio.
export function calcularBalance(datos, bancos, inventario, resultadoEjercicio) {
  // Un acumulador por grupo, con el detalle cuenta por cuenta de las dos empresas
  const bolsas = new Map()      // 'seccion|grupo' → { feisen, fc, cuentas: Map(codigo → fila) }
  const bolsa = llave => {
    if (!bolsas.has(llave)) bolsas.set(llave, { feisen: 0, fc: 0, cuentas: new Map() })
    return bolsas.get(llave)
  }
  const sumaCruda = { feisen: 0, fc: 0 }        // la suma de TODAS las cuentas de Odoo: tiene que dar 0
  // Lo que FC tiene en los grupos que son solo de Feisen. Hoy está vacío (FC no tiene
  // ninguna cuenta de las clases 23, 24 ni 25), pero si algún día aparece algo tiene que
  // verse: una cuenta que se cae del balance en silencio es justo lo que no queremos.
  const fcFuera = new Map()

  for (const { id: emp } of EMPRESAS_BAL) {
    for (const c of datos?.[emp] || []) {
      const codigo = String(c.codigo || '')
      if (!codigo) continue
      const saldo = Number(c.saldo) || 0
      sumaCruda[emp] += saldo
      const { seccion, grupo } = ubicar(codigo, emp)
      const def = SECCIONES.find(x => x.id === seccion)?.grupos.find(g => g.id === grupo)
      if (emp === 'fc' && def?.soloFeisen) {
        const v = fcFuera.get(grupo) || { total: 0, cuentas: [] }
        v.total += saldo
        v.cuentas.push({ codigo, nombre: c.nombre || '' })
        fcFuera.set(grupo, v)
        continue
      }
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

  // Los grupos que no salen de Odoo se quedan en su sitio de la lista (marcados con
  // `manual`) para que el 14 siga apareciendo entre el 13 y el 15. La pantalla los pinta
  // con su propio componente; aquí solo se les guarda el puesto.
  const secciones = SECCIONES.map(sec => {
    const grupos = sec.grupos
      .map(g => (g.manual ? { ...g, feisen: 0, fc: 0, total: 0, detalle: [], vacio: false } : armarGrupo(g, `${sec.id}|${g.id}`, sec.signo)))
      .map(g => {
        const f = fcFuera.get(g.id)
        return f ? { ...g, vacio: false, fcFuera: { total: redondear(f.total * sec.signo), cuentas: f.cuentas } } : g
      })
      .filter(g => !g.vacio)
    // Los totales de la sección solo suman lo que sí viene de Odoo: el disponible y el
    // inventario se suman aparte, más abajo, porque no tienen columna por empresa.
    const deOdoo = grupos.filter(g => !g.manual)
    const feisen = deOdoo.reduce((s, g) => s + g.feisen, 0)
    const fc = deOdoo.reduce((s, g) => s + g.fc, 0)
    return { ...sec, grupos, feisen, fc, total: feisen + fc }
  })

  // Lo que dice Odoo de inventarios: no entra al activo (el grupo 14 sale del ERP),
  // pero se guarda para poder compararlo en la nota del grupo.
  const bolsaInv = bolsas.get('inventarioOdoo|inventarioOdoo') || { feisen: 0, fc: 0 }
  const inventarioOdoo = redondear(bolsaInv.feisen + bolsaInv.fc)

  // El activo suma el disponible escrito y el inventario del ERP. Ninguno de los dos
  // tiene columna por empresa: el disponible es el total de las dos juntas y el
  // inventario del ERP no distingue de qué contabilidad es cada artículo.
  const activo = secciones.find(s => s.id === 'activo')
  activo.sinDisponible = !disponible.hay
  activo.total = activo.feisen + activo.fc + (disponible.total || 0) + (inventario?.total || 0)

  // El resultado del periodo: menos la suma de las clases 4, 5, 6 y 7
  // (ingresos menos costos y gastos). Va dentro del patrimonio.
  // El resultado según Odoo (clases 4 a 7). Ya no es el patrimonio: se guarda solo para
  // poder compararlo en pantalla con el de nuestro P&G, que es el que manda.
  const resultadoOdoo = armarGrupo(
    { id: 'resultado', nombre: 'Resultado del periodo según Odoo', nota: 'ingresos menos costos y gastos (cuentas 4, 5, 6 y 7)' },
    'resultado|resultado', -1,
  )

  // Lo que Odoo tiene registrado como patrimonio y queda fuera: capital, reservas y
  // resultados acumulados. Se guarda por grupo para poder decir en pantalla qué se deja
  // fuera y por qué, en vez de que simplemente desaparezca.
  const patrimonioOdoo = ['31', '32', '33', '34', '36', '37', '38'].map(g => {
    const b = bolsas.get(`patrimonioOdoo|${g}`)
    if (!b) return null
    const feisen = redondear(b.feisen * -1)
    const fc = redondear(b.fc * -1)
    return { grupo: g, feisen, fc, total: feisen + fc }
  }).filter(x => x && x.total)

  // El patrimonio: un solo renglón con la utilidad de nuestro P&G. No tiene columna por
  // empresa, porque el P&G es consolidado.
  const patrimonio = secciones.find(s => s.id === 'patrimonio')
  patrimonio.grupos = []
  patrimonio.feisen = 0
  patrimonio.fc = 0
  patrimonio.total = resultadoEjercicio == null ? null : redondear(resultadoEjercicio)
  patrimonio.sinResultado = resultadoEjercicio == null

  // Partidas por aclarar: las cuentas transitorias de Odoo (clase 9), con el saldo tal
  // como viene. Se llamaban "Movimientos transitorios" hasta el 18/11/2026; Angie pidió
  // el nombre nuevo —"quita lo de cuentas transitorias y reemplázalo por partidas por
  // aclarar"— porque dice mejor lo que son: plata contabilizada que todavía no tiene
  // cuenta definitiva. No es ni activo ni pasivo y no entra en ningún total.
  const transitorias = armarGrupo(
    { id: 'transitorias', nombre: 'Partidas por aclarar' }, 'transitorias|transitorias', 1,
  )

  // Cuentas de socios: igual que las transitorias, con el signo tal como viene
  const socios = armarGrupo(
    { id: 'socios', nombre: 'Cuentas de socios' }, 'socios|socios', 1,
  )

  // LA ECUACIÓN DEL BALANCE: pasivo + patrimonio contra activo.
  //
  // Angie, 18/11/2026: "solo deja la información de la ecuación de pasivo+patrimonio=
  // activo y si hay diferencia mencionar de cuánto es la diferencia, el resto no lo
  // tengas en cuenta". Por eso aquí no se explica la diferencia ni se reparte entre
  // causas: se dice cuánto es y ya.
  //
  // Hoy no da cero, y eso es lo esperable: hay bloques que quedan fuera de los totales a
  // propósito (las partidas por aclarar y las cuentas de socios) y FC tiene su banco sin
  // conciliar. La diferencia es la medida de lo que todavía no está explicado.
  const pasivoSec = secciones.find(x => x.id === 'pasivo')
  const patrimonioSec = secciones.find(x => x.id === 'patrimonio')
  const ladoDerecho = (pasivoSec?.total || 0) + (patrimonioSec?.total || 0)
  const ecuacion = {
    activo: activo.total,
    pasivoMasPatrimonio: redondear(ladoDerecho),
    diferencia: activo.total == null ? null : redondear(activo.total - ladoDerecho),
    // Mientras falte el disponible o el resultado, la comparación no significa nada
    incompleta: activo.sinDisponible || patrimonioSec?.sinResultado || false,
  }

  // Que la suma de todas las cuentas de Odoo dé cero sigue siendo cierto y sigue
  // sirviendo: dice que la contabilidad cuadra consigo misma.
  const cuadreOdoo = {}
  for (const e of ['feisen', 'fc']) cuadreOdoo[e] = redondear(sumaCruda[e])
  cuadreOdoo.total = cuadreOdoo.feisen + cuadreOdoo.fc
  cuadreOdoo.cuadra = EMPRESAS_BAL.every(({ id }) => Math.abs(cuadreOdoo[id]) <= TOLERANCIA)

  // Cuántas cuentas de Odoo se leyeron de verdad. Las 11xx y las 14xx no se cuentan,
  // porque el disponible y el inventario no salen de Odoo y sus cuentas no se ven en
  // ninguna parte del balance; si se contaran, el pie diría que se leyeron más cuentas
  // de las que hay a la vista. Se cuenta renglón por renglón, no por código: la misma
  // cuenta puede estar en los dos libros.
  const fuera = c => /^(11|14)/.test(String(c.codigo || ''))
  const cuentas = EMPRESAS_BAL.reduce((n, { id }) => n + (datos?.[id] || []).filter(c => !fuera(c)).length, 0)

  return {
    secciones, transitorias, socios, ecuacion,
    resultadoOdoo, patrimonioOdoo,
    disponible, inventario: inventario || null, inventarioOdoo,
    cuadreOdoo, activo, cuentas,
  }
}
