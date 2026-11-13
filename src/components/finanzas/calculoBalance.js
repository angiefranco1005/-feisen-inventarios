// ─────────────────────────────────────────────────────────────────────────────
// EL BALANCE GENERAL, EN UN SOLO SITIO
//
// Esto NO comparte nada con el estado de resultados (calculoEeff.js): es una
// vista aparte, con su propio dato y su propia cuenta. Si tocas algo aquí no
// cambia ni un número del P&G.
//
// De dónde sale: función `finanzas-odoo`, acción `cuentas`, una llamada por
// empresa. De cada cuenta se usa **solo el `saldo`**, que es el acumulado de
// toda la historia — que es justo lo que un balance necesita.
//
// Dos cosas que se verificaron contra Odoo el 13/11/2026 y en las que se apoya
// todo lo de abajo:
//
//  1. Cada cuenta que devuelve `cuentas` es una cuenta real donde se contabiliza.
//     **No hay cuentas padre que repitan a sus hijas**, así que sumar todo es
//     correcto y no hay que quitar nada por prefijo.
//  2. Si se suma el `saldo` de **todas** las cuentas de una empresa da **cero**,
//     en las dos. Esa suma en cero es la comprobación de que el balance está
//     bien armado, y es la fila de comprobación que se ve en pantalla.
//
// Signos: en Odoo los activos vienen positivos y los pasivos, el patrimonio y
// los ingresos vienen negativos. Para que se lean números positivos, aquí se les
// voltea el signo al pasivo, al patrimonio y al resultado. Las transitorias se
// dejan **tal como vienen**, porque unas veces se comportan como activo
// (saldo positivo) y otras como pasivo (saldo negativo).
// ─────────────────────────────────────────────────────────────────────────────

export const EMPRESAS_BAL = [{ id: 'feisen', nombre: 'Feisen' }, { id: 'fc', nombre: 'FC' }]

// Los grupos del PUC, por los dos primeros dígitos del código de cuenta.
// El último grupo de cada sección lleva `resto: true`: recoge cualquier cuenta de
// esa clase que no caiga en los grupos de arriba, para que no se pierda nada.
export const SECCIONES = [
  {
    id: 'activo', titulo: 'Activo', tituloTotal: 'Total activo', clase: '1', signo: 1,
    grupos: [
      { id: '11', nombre: 'Disponible', prefijos: ['11'] },
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

// El banco de FC no es plata real: es donde caen los movimientos sin conciliar.
// Misma decisión que ya tomó Angie en Flujo de caja (30/10/2026), donde el banco y
// la caja de FC están excluidos. Aquí no se excluye —el balance tiene que cuadrar—
// pero el renglón se marca en ámbar para que no se lea como disponible.
export const esDisponibleFc = (empresa, codigo) => empresa === 'fc' && codigo.startsWith('11')

// Hasta qué diferencia se considera que la comprobación da cero (los saldos vienen
// con dos decimales y aquí todo se redondea a pesos)
export const TOLERANCIA = 2

// A qué sección y grupo va cada cuenta, por su código
function ubicar(codigo) {
  const clase = String(codigo).charAt(0)
  if (clase >= '4' && clase <= '7') return { seccion: 'resultado', grupo: 'resultado' }
  const sec = SECCIONES.find(s => s.clase === clase)
  if (!sec) return { seccion: 'transitorias', grupo: 'transitorias' }   // clase 9 y cualquier otra
  const dos = String(codigo).slice(0, 2)
  const grupo = sec.grupos.find(g => g.prefijos.includes(dos)) || sec.grupos.find(g => g.resto)
  return { seccion: sec.id, grupo: grupo.id }
}

const redondear = n => Math.round(n || 0)

// Arma el balance de las dos empresas a partir de lo que devolvió la acción `cuentas`.
// `datos` = { feisen: { cuentas: [...] }, fc: { cuentas: [...] } }
export function calcularBalance(datos) {
  // Un acumulador por grupo, con el detalle cuenta por cuenta de las dos empresas
  const bolsas = new Map()      // 'seccion|grupo' → { feisen, fc, cuentas: Map(codigo → fila) }
  const bolsa = llave => {
    if (!bolsas.has(llave)) bolsas.set(llave, { feisen: 0, fc: 0, cuentas: new Map() })
    return bolsas.get(llave)
  }
  const sumaCruda = { feisen: 0, fc: 0 }        // la suma de TODAS las cuentas: tiene que dar 0
  let disponibleFc = 0

  for (const { id: emp } of EMPRESAS_BAL) {
    for (const c of datos?.[emp]?.cuentas || []) {
      const codigo = String(c.codigo || '')
      if (!codigo) continue
      const saldo = Number(c.saldo) || 0
      sumaCruda[emp] += saldo
      if (esDisponibleFc(emp, codigo)) disponibleFc += saldo
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

  const secciones = SECCIONES.map(sec => {
    const grupos = sec.grupos.map(g => armarGrupo(g, `${sec.id}|${g.id}`, sec.signo)).filter(g => !g.vacio)
    const feisen = grupos.reduce((s, g) => s + g.feisen, 0)
    const fc = grupos.reduce((s, g) => s + g.fc, 0)
    return { ...sec, grupos, feisen, fc, total: feisen + fc }
  })

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

  // La comprobación: Activo + transitorias − pasivo − patrimonio.
  // Es exactamente lo mismo que sumar el saldo de todas las cuentas de la empresa,
  // así que tiene que dar $0.
  const comprobacion = {}
  for (const e of ['feisen', 'fc']) comprobacion[e] = redondear(sumaCruda[e])
  comprobacion.total = comprobacion.feisen + comprobacion.fc
  comprobacion.cuadra = EMPRESAS_BAL.every(({ id }) => Math.abs(comprobacion[id]) <= TOLERANCIA)

  return {
    secciones, transitorias, resultado, comprobacion,
    patrimonioRegistrado,
    disponibleFc: redondear(disponibleFc),
    activo: secciones.find(s => s.id === 'activo'),
    cuentas: EMPRESAS_BAL.reduce((n, { id }) => n + (datos?.[id]?.cuentas?.length || 0), 0),
  }
}
