// ─────────────────────────────────────────────────────────────────────────────
// EL CÁLCULO DE LOS EEFF, EN UN SOLO SITIO
//
// Aquí está TODO lo que convierte los datos crudos (Odoo, el ERP y las casillas
// escritas a mano) en los números del estado de resultados de un mes.
// Las dos vistas de la pantalla —"Un mes" y "Todo el año"— llaman a la misma
// función `calcularMes`, así que no puede pasar que muestren cifras distintas
// del mismo mes. Si hay que cambiar una regla, se cambia aquí una sola vez
// (y en EEFF-CRITERIOS.md, que explica el porqué de cada una).
//
// Las reglas salieron de calibrar octubre de 2026 contra la contabilidad real:
// no se tocan sin volver a comprobarlas con Angie.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from '../../lib/supabase'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { normCentro, SIN_CENTRO } from './comun'
import { HISTORICO, hayHistorico } from './eeffHistorico'

export const PRECIO_KG_HIERRO = 5500
export const DESCUENTOS = c => c === '530508' || c.startsWith('4175')

// Meses que todavía no están en Odoo para Feisen (estaba en SIIGO). Lo que se vea
// de esos meses es solo FC y lo que esté escrito a mano: no son ceros reales.

// Renglones de ventas: centro de Odoo → renglón (el nombre es el que se ve dentro de su centro)
export const VENTAS = [
  { id: 'construequipos', nombre: 'Máquinas', centros: ['CONSTRUEQUIPOS', 'Sin centro'] },
  { id: 'no_operacionales', nombre: 'Ventas no operacionales', noOperacional: true },
  { id: 'repuestos', nombre: 'Repuestos', centros: ['REPUESTOS'] },
  { id: 'mantenimientos', nombre: 'Mantenimientos', centros: ['MANTENIMIENTOS'] },
  { id: 'hierro', nombre: 'Ventas', centros: ['HIERRO'] },
  { id: 'aluminio', nombre: 'Ventas', centros: ['ALUMINIO'] },
]

// Centros de costo del P&G y sus renglones de ventas. Las devoluciones y descuentos (530508) hoy son todas
// de Construequipos, por eso solo ese centro las resta.
export const CENTROS = [
  { id: 'construequipos', nombre: 'Construequipos', renglones: ['construequipos', 'no_operacionales', 'repuestos', 'mantenimientos'], devoluciones: true },
  { id: 'hierro', nombre: 'Fundición Hierro', renglones: ['hierro'] },
  { id: 'aluminio', nombre: 'Aluminio', renglones: ['aluminio'] },
]

export const EMPRESAS = [{ id: 'feisen', nombre: 'Feisen' }, { id: 'fc', nombre: 'FC' }]

// Costos y gastos: los renglones y sus subtotales, en el orden del Excel de Angie.
// Lo que no tiene fuente en el mapa AUTO todavía se escribe a mano (eeff_manual,
// concepto '<centro>:<fila>'). En Consolidado no se escribe: es la suma de los tres centros.
export const BLOQUES = [
  { id: 'costos_directos', seccion: 'Costos directos', subtotal: 'Total costos directos', filas: [
    { id: 'materia_prima', nombre: 'Materia prima' },
    { id: 'mano_obra', nombre: 'Mano de obra' },
  ] },
  { id: 'cif', seccion: 'Costos indirectos (CIF)', subtotal: 'Total CIF', utilidad: 'Utilidad bruta', filas: [
    { id: 'servicios_publicos', nombre: 'Servicios públicos' },
    { id: 'mantenimiento', nombre: 'Mantenimiento equipos planta' },
    { id: 'transporte', nombre: 'Transporte' },
    { id: 'dotacion', nombre: 'Dotación' },
    { id: 'insumos', nombre: 'Insumos' },
  ] },
  { id: 'gastos_op', seccion: 'Gastos operacionales', subtotal: 'Total gastos operacionales', utilidad: 'Utilidad operacional', filas: [
    { id: 'viaticos', nombre: 'Viáticos' },
    { id: 'publicidad', nombre: 'Publicidad' },
    { id: 'comisiones', nombre: 'Comisiones' },
    { id: 'nomina_comercial', nombre: 'Nómina asesores y director comercial' },
    { id: 'arrendamientos', nombre: 'Arrendamientos' },
    { id: 'honorarios', nombre: 'Honorarios' },
    { id: 'nomina_admin', nombre: 'Nómina administrativa' },
    { id: 'otros_operacionales', nombre: 'Otros gastos operacionales' },
  ] },
  { id: 'gastos_no_op', seccion: 'Gastos no operacionales', subtotal: 'Total gastos no operacionales', utilidad: 'Utilidad neta', filas: [
    { id: 'intereses_impuestos', nombre: 'Intereses de impuestos' },
    { id: 'gravamenes', nombre: 'Gravámenes (4x1000)' },
    { id: 'intereses_bancarios', nombre: 'Intereses bancarios' },
    { id: 'comisiones_financieras', nombre: 'Comisiones financieras' },
  ] },
]
export const FILAS_COSTO = BLOQUES.flatMap(b => b.filas)

// ─────────────────────────────────────────────────────────────────────────────
// DE DÓNDE SALE CADA RENGLÓN. El documento con los criterios, en palabras y con
// el porqué de cada decisión, es EEFF-CRITERIOS.md en la raíz del repo:
// si se cambia una regla aquí, hay que cambiarla allá en la misma entrega.
// Los renglones que no aparecen en el mapa AUTO todavía se escriben a mano.
// ─────────────────────────────────────────────────────────────────────────────
// Materia prima — en FC: lo que sale en su estado de resultados (cuenta 613500).
// En Feisen: las compras del mes a la cuenta de inventario (140500), porque contabilidad las lleva a
// inventario y nunca saca lo consumido; su cuenta de costo de ventas (613500) se registra a saltos y no sirve
// mes a mes (marzo $919 M, agosto $348 M). Las compras ya traen el centro de costo.
// Enero a marzo no están en Odoo (Feisen todavía estaba en SIIGO): esos meses se escriben a mano.
// Proveedores que contabilidad causa como insumos (737001 / 737002 / 730500) pero que para Angie son
// materia prima. Los marcó ella el 13/11/2026 mirando junio–octubre; el renglón de Insumos los descuenta.
const PROVEEDORES_MATERIA_PRIMA = [
  'IMPORTACIONES POWER SAS',
  'ALAPLUMEZ SAS',
  'HIDRAULICO A.L SAS',
  'EQUIPOS TOYAMA DE COLOMBIA S.A.S.',
  'FERRE CABLES Y CADENAS LOS CRISOLES SAS',
  'HIERROS BOGOTÁ FERRETERIAS & CIA S.A.S.',
  'IMPORTADORA DE RODAMIENTOS INDUSTRIALES SAS', // rodamientos: van en la máquina (Angie los marcó en octubre)
  'METAL BARCAS SAS', // insumo de Fundición Hierro, pero en Odoo le quedó el centro Construequipos
]
// Decisión de Angie (13/11, después de probar lo contrario): **todo lo que es insumo de las fundiciones
// cuenta como materia prima**, no como insumos. Ella tiene una razón de fondo que explicará más adelante.
// Por eso la regla va por centro y no por proveedor: así los proveedores nuevos de las fundiciones entran
// solos. METAL BARCAS queda arriba, en la lista por proveedor, porque en Odoo tiene el centro equivocado.
const CENTROS_TODO_MATERIA_PRIMA = ['HIERRO', 'ALUMINIO']
// Al revés: contabilidad los causa en inventario (140500) pero para Angie no son materia prima.
// Los revisó el 13/11/2026 sobre octubre: herramienta o insumos, no material.
const PROVEEDORES_NO_MATERIA_PRIMA = [
  'IMPORTADORA SUPERIOR',        // insumos
  'LA ROCA ABRASIVOS S.A.S',     // insumos
  'WURTH COLOMBIA SAS',          // herramienta
  'UYUSA COLOMBIA S A S',        // herramienta
  'FERRETERIA ANGEL Y DG SAS',   // herramienta
]
// Se comparan sin tildes, sin puntos y sin espacios, porque el mismo proveedor aparece escrito de varias formas
const sinAdornos = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const ES_MATERIA_PRIMA = new Set(PROVEEDORES_MATERIA_PRIMA.map(sinAdornos))
const NO_ES_MATERIA_PRIMA = new Set(PROVEEDORES_NO_MATERIA_PRIMA.map(sinAdornos))
const esInsumo = cod => cod.startsWith('7370') || cod === '730500'

export const AUTO = {
  feisen: { materia_prima: {
    fuente: 'compras', nota: 'compras a inventario (140500), todo lo de las fundiciones y los proveedores que marcaste',
    filtro: x => {
      const cod = String(x.cuenta).split(' ')[0]
      const prov = sinAdornos(x.proveedor)
      if (cod.startsWith('1405')) return !NO_ES_MATERIA_PRIMA.has(prov)
      if (!esInsumo(cod)) return false
      return CENTROS_TODO_MATERIA_PRIMA.includes(normCentro(x.centro)) || ES_MATERIA_PRIMA.has(prov)
    },
  } },
  fc: { materia_prima: { fuente: 'pyg', nota: 'estado de resultados (613500)', filtro: x => x.codigo === '613500' } },
}
// Mano de obra directa de Feisen: las cuentas 7205xx de su estado de resultados (sueldos más prestaciones),
// **sin la 720511**, que se fue al renglón de Dotación. Por eso ya no coincide exacto con su Excel de
// septiembre, que la tenía adentro.
// `sinCentro` dice a qué centro va lo que en Odoo no trae centro, en vez de repartirlo por ventas: la
// nómina de producción de Feisen es la planta de Construequipos, así que Hierro y Aluminio no llevan nada
// (sus operarios los paga FC).
AUTO.feisen.mano_obra = {
  fuente: 'pyg', nota: 'mano de obra directa con prestaciones (7205xx, sin la dotación)',
  filtro: x => x.codigo.startsWith('7205') && x.codigo !== '720511', sinCentro: 'construequipos',
}

// CIF: son gastos compartidos y no se sabe cuánto gasta de luz o de transporte cada centro, así que
// **se reparten entre los centros en la misma proporción en que vendieron** (método de Angie, 13/11).
// Eso es `porVentas`: no importa el centro que traiga Odoo, todo el renglón se reparte por ventas.
const CIF_CUENTAS = {
  // Angie incluye aquí la luz, el internet y el plan de celular (octubre 2026). La 734001 "Aseo" es el
  // aseo que viene dentro de la factura de Enel, por eso va con la energía. El teléfono (513503) trae
  // Starlink y Colombia Móvil: cuando se conecte "otros gastos operacionales", no volver a sumarlo allá.
  servicios_publicos: { cuentas: ['734000', '734001', '513503'], nota: 'luz, internet y celular (734000, 734001, 513503)' },
  mantenimiento: { cuentas: ['734500', '734501'], nota: 'mantenimiento de equipos (734500, 734501)' },
  transporte: { cuentas: ['523500', '513504'], nota: 'transportes, fletes y acarreos (523500, 513504)' },
  dotacion: { cuentas: ['720511'], nota: 'dotación y suministro a trabajadores (720511)' },
  // Gastos operacionales: también se reparten por ventas, como en el Excel de Angie
  viaticos: { cuentas: ['525500', '515500', '519504'], nota: 'viajes, alojamiento, taxis y buses (525500, 515500, 519504)' },
  publicidad: { cuentas: ['523501'], nota: 'publicidad, propaganda y promoción (523501)' },
  comisiones: { cuentas: ['529500'], nota: 'comisiones (529500)' },
}
for (const [fila, { cuentas, nota }] of Object.entries(CIF_CUENTAS)) {
  for (const emp of ['feisen', 'fc']) {
    AUTO[emp][fila] = { fuente: 'pyg', nota, porVentas: true, filtro: x => cuentas.includes(x.codigo) }
  }
}

// Nómina de asesores y director comercial: las cuentas 5205xx de Feisen (sueldos de ventas más
// prestaciones: incapacidades, auxilio de transporte, cesantías e intereses, prima, vacaciones, ARL,
// pensión y caja de compensación). Angie las marcó el 13/11/2026 sobre octubre y dan exacto.
// **Solo Feisen**: FC no tiene nómina de ventas (su única cuenta de personal es la 510500).
// Como todo gasto, se reparte entre los centros por su participación en ventas.
// Ojo: si algún día se paga marketing o community por estas cuentas, cae aquí. Angie quitó el renglón
// aparte de marketing el 13/11/2026: en Odoo no hay una cuenta propia para eso.
AUTO.feisen.nomina_comercial = {
  fuente: 'pyg', nota: 'sueldos de ventas con prestaciones (5205xx)', porVentas: true,
  filtro: x => x.codigo.startsWith('5205'),
}

// Nómina administrativa de Feisen: las cuentas 5105xx (sueldos de administración más prestaciones).
// Angie las verificó el 13/11/2026 contra octubre. Se reparte entre los centros por ventas.
AUTO.feisen.nomina_admin = {
  fuente: 'pyg', nota: 'sueldos de administración con prestaciones (5105xx)', porVentas: true,
  filtro: x => x.codigo.startsWith('5105'),
}

// Honorarios: las cuentas 5110xx de Feisen (revisoría fiscal, auditoría externa, asesoría jurídica,
// asesoría técnica y otros) más la 519600 "Honorarios SGST", que es el honorario del asesor de
// seguridad y salud en el trabajo. No entra la 519601 (exámenes médicos): esa no es honorario.
// Va por las **dos empresas** (Angie, 13/11/2026): hoy FC no tiene honorarios causados y da $0, pero
// cuando contabilidad registre ahí los honorarios de FC entran solos, sin tocar nada.
// Como todo gasto, se reparte entre los centros por su participación en ventas.
for (const emp of ['feisen', 'fc']) {
  AUTO[emp].honorarios = {
    fuente: 'pyg', nota: 'honorarios (5110xx) y el asesor de seguridad y salud (519600)', porVentas: true,
    filtro: x => x.codigo.startsWith('5110') || x.codigo === '519600',
  }
}

// Arrendamientos: las cuentas 5120xx de las dos empresas. Angie lo pidió como renglón aparte el
// 13/11/2026 porque el arriendo de FC pesa más que publicidad y comisiones juntas.
// Ojo con octubre de 2026: el arriendo de FC ($3.344.000) todavía está causado en "Otros gastos"
// (519506), así que aquí no aparece hasta que contabilidad lo pase a la cuenta de arrendamientos.
for (const emp of ['feisen', 'fc']) {
  AUTO[emp].arrendamientos = {
    fuente: 'pyg', nota: 'arrendamientos (5120xx)', porVentas: true,
    filtro: x => x.codigo.startsWith('5120'),
  }
}

// Gastos no operacionales: salen **solo de Odoo Feisen**, como lo pidió Angie el 13/11/2026 ("los gastos
// no operacionales los saca de Feisen, porque eso sí o sí tiene que ver con Feisen"). La columna de FC
// queda como casilla a mano. Como todo gasto, se reparten entre los tres centros por participación en ventas.
// **Ojo:** las cuentas se nombran una por una, nunca por prefijo '5305'. La 530508 "Descuentos comerciales
// condicionados" también empieza por 5305 y ya está restada arriba, en "Devoluciones y descuentos
// comerciales": si entra por un filtro de prefijo, esa plata se resta dos veces. No cambiar a startsWith.
const NO_OPERACIONALES = {
  // Intereses que cobra la DIAN por impuestos pagados tarde (octubre 2026: $5.375.000)
  // Intereses que cobra la DIAN por impuestos pagados tarde, más la mora y el ajuste al peso, que en
  // Odoo viven en el grupo 5395 "Diversos" del mismo bloque de no operacionales (octubre 2026: $5.375.000)
  intereses_impuestos: { cuentas: ['530507'], prefijos: ['5395'], nota: 'intereses de impuestos y mora (530507, 5395xx)' },
  // El 4x1000 que descuenta el banco de cada movimiento (octubre 2026: $2.894.891)
  gravamenes: { cuentas: ['530501'], nota: 'gravamen a los movimientos financieros 4x1000 (530501)' },
  // Intereses de los créditos y sobregiros bancarios (octubre 2026: $8.342.532)
  intereses_bancarios: { cuentas: ['530504'], nota: 'intereses corrientes bancarios (530504)' },
  // Lo que cobra el banco por el servicio: cuota de manejo y comisiones (octubre 2026: $1.091.393)
  comisiones_financieras: { cuentas: ['530502', '530503'], nota: 'cuota de manejo y comisiones bancarias (530502, 530503)' },
}
for (const [fila, { cuentas, prefijos = [], nota }] of Object.entries(NO_OPERACIONALES)) {
  AUTO.feisen[fila] = {
    fuente: 'pyg', nota, porVentas: true,
    filtro: x => cuentas.includes(x.codigo) || prefijos.some(p => x.codigo.startsWith(p)),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Otros gastos operacionales: el renglón de cierre. No es una lista de cuentas, es **todo lo que
// quedó sin renglón propio** dentro de los grupos 51 y 52 (gastos de administración y de ventas).
// Se hizo así a propósito: con una lista fija, cada cuenta nueva que abra contabilidad se perdería
// sin que nadie se diera cuenta —ya pasó con una compra a Würth que no caía en ningún renglón—.
// Así, lo que no tiene casa cae aquí y siempre se ve.
// Si algún día uno de estos gastos se vuelve grande y merece su propio renglón, se saca de aquí
// agregándolo arriba: este filtro lo suelta solo.
// Se reparte por ventas, como todos los gastos.
const YA_TIENEN_RENGLON = new Set([
  '513503', '513504',             // teléfono → servicios públicos; fletes → transporte
  '515500', '519504', '525500',   // viáticos
  '523500',                       // transporte
  '523501',                       // publicidad
  '529500',                       // comisiones
  '519600',                       // honorarios del asesor de seguridad y salud
])
const TIENEN_RENGLON_PREFIJO = ['5105', '5110', '5120', '5205']  // nómina admin, honorarios, arrendamientos, nómina comercial
const esOtroGasto = cod => /^5[12]/.test(cod)
  && !YA_TIENEN_RENGLON.has(cod)
  && !TIENEN_RENGLON_PREFIJO.some(p => cod.startsWith(p))
for (const emp of ['feisen', 'fc']) {
  AUTO[emp].otros_operacionales = {
    fuente: 'pyg', porVentas: true,
    nota: 'todo lo demás de administración y ventas que no tiene renglón propio (51xx y 52xx)',
    filtro: x => esOtroGasto(x.codigo),
  }
}

// Insumos: los de las fundiciones ya están contados en materia prima, así que aquí van solo los demás
// (decisión de Angie, 13/11, para no contarlos dos veces). En Feisen se lee de las compras, la misma
// fuente de su materia prima, para que la exclusión calce exacta; FC no tiene insumos de fundición.
AUTO.feisen.insumos = {
  fuente: 'compras', nota: 'insumos de producción que no son de las fundiciones (737001, 737002, 730500)',
  porVentas: true,
  filtro: x => {
    const cod = String(x.cuenta).split(' ')[0]
    const prov = sinAdornos(x.proveedor)
    // Lo que contabilidad causó a inventario pero es herramienta o insumo cae aquí, no en materia prima
    if (cod.startsWith('1405')) return NO_ES_MATERIA_PRIMA.has(prov)
    if (!esInsumo(cod)) return false
    return !CENTROS_TODO_MATERIA_PRIMA.includes(normCentro(x.centro)) && !ES_MATERIA_PRIMA.has(prov)
  },
}
AUTO.fc.insumos = {
  fuente: 'pyg', nota: 'insumos de producción (737001, 737002, 730500)', porVentas: true,
  filtro: x => esInsumo(x.codigo),
}

// Mano de obra de producción: nómina del ERP (RRHH › Nómina), por el centro de costo de cada colaborador.
// Se toma el total devengado, que es lo que cuesta el trabajo; las deducciones (seguridad, anticipos) no
// bajan el costo, se le descuentan al colaborador. La gente de 'administracion' no entra aquí: va en el
// renglón de nómina administrativa. Las quincenas que todavía no estén cargadas se escriben a mano.
export const CENTRO_NOMINA = { construequipos: 'construequipos', fundicionHierro: 'hierro', aluminio: 'aluminio' }

// Clasifica las filas de 'pyg' de una empresa en los renglones de ingresos
export function ingresosDe(filas = []) {
  const r = Object.fromEntries(VENTAS.map(v => [v.id, { valor: 0, detalle: [] }]))
  r.devoluciones = { valor: 0, detalle: [] }
  for (const f of filas || []) {
    const centro = normCentro(f.centro)
    let id = null, valor = -f.valor
    if (DESCUENTOS(f.codigo)) { id = 'devoluciones'; valor = f.valor > 0 ? f.valor : -f.valor }
    else if (f.codigo.startsWith('412')) id = VENTAS.find(v => v.centros?.includes(centro))?.id || 'construequipos'
    else if (f.codigo.startsWith('4')) id = 'no_operacionales'
    if (!id) continue
    r[id].valor += valor
    r[id].detalle.push({ ...f, valor })
  }
  return r
}

// A qué centro del P&G pertenece el centro analítico de Odoo (null = no trae centro)
const centroDe = c => {
  const n = normCentro(c)
  if (n === 'HIERRO') return 'hierro'
  if (n === 'ALUMINIO') return 'aluminio'
  return n === SIN_CENTRO ? null : 'construequipos'
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SE LE PIDE AL ERP PARA UN MES: la transferencia de Fundición Hierro,
// la nómina cargada en RRHH y las casillas escritas a mano. Lo usan las dos
// vistas, para que ninguna se quede con una versión vieja de estas reglas.
// ─────────────────────────────────────────────────────────────────────────────
export async function leerErpMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  const fin = new Date(y, m, 0).getDate()
  const desde = `${mes}-01`, hasta = `${mes}-${String(fin).padStart(2, '0')}`

  const { data: bods } = await supabase.from('bodegas').select('id, nombre').ilike('nombre', '%fundic%')
  const ids = (bods || []).map(b => b.id)
  const { data, error: err } = await fetchAllPages((d, h) => supabase.from('movimientos')
    .select('id, numero, cantidad, precio_costo_snapshot, bodega_origen_id, bodega_destino_id, items(nombre, peso_unitario, categorias(nombre)), bodegas_destino:bodega_destino_id(nombre)')
    .eq('tipo', 'salida').in('bodega_origen_id', ids).not('bodega_destino_id', 'is', null)
    .is('revertido_en', null).or('revertido.is.null,revertido.eq.false')
    .or(`and(fecha_movimiento.gte.${desde},fecha_movimiento.lte.${hasta}),and(fecha_movimiento.is.null,created_at.gte.${desde}T00:00:00,created_at.lte.${hasta}T23:59:59)`)
    .order('id').range(d, h))
  if (err) throw err
  const piezas = (data || []).filter(x => x.bodega_destino_id !== x.bodega_origen_id && x.items?.categorias?.nombre === 'MATERIAL FUNDIDO HIERRO')
  const kg = piezas.reduce((s, x) => s + Number(x.cantidad) * (Number(x.items?.peso_unitario) || 0), 0)
  const sinPeso = piezas.filter(x => !Number(x.items?.peso_unitario)).length
  // Materia prima de Fundición registrada como salida a otra bodega (errores de registro de oct 2026):
  // no es transferencia interna, se descuenta aquí y se deja la observación (decisión de Angie, 11/11)
  const mp = (data || []).filter(x => x.bodega_destino_id !== x.bodega_origen_id && x.items?.categorias?.nombre === 'MATERIA PRIMA')
  const excluido = mp.length ? {
    valor: mp.reduce((s, x) => s + Number(x.cantidad) * (Number(x.precio_costo_snapshot) || 0), 0),
    documentos: [...new Set(mp.map(x => x.numero))].sort(),
  } : null

  const { data: man } = await supabase.from('eeff_manual').select('concepto, empresa, valor').eq('mes', mes)
  const manual = Object.fromEntries((man || []).map(x => [`${x.concepto}|${x.empresa}`, Number(x.valor)]))

  // Nómina del mes por centro (producción) y de administración
  const { data: liq } = await fetchAllPages((d, h) => supabase.from('nomina_liquidaciones')
    .select('total_devengado, periodo:nomina_periodos!inner(anio, mes, quincena, estado), empleado:empleados!inner(centro_costo)')
    .eq('periodo.anio', y).eq('periodo.mes', m).order('id').range(d, h))
  const porCentro = { construequipos: 0, hierro: 0, aluminio: 0 }
  let administracion = 0   // la gente de administración no tiene centro: va al renglón de nómina administrativa
  const quincenas = new Map()
  for (const x of liq || []) {
    quincenas.set(x.periodo.quincena, x.periodo.estado)
    const c = CENTRO_NOMINA[x.empleado?.centro_costo]
    if (c) porCentro[c] += Number(x.total_devengado) || 0
    else if (x.empleado?.centro_costo === 'administracion') administracion += Number(x.total_devengado) || 0
  }
  const nomina = { porCentro, administracion, personas: (liq || []).length, quincenas: [...quincenas.entries()].sort((a, b) => a[0] - b[0]) }

  return {
    manual, nomina,
    hierro: { valor: kg * PRECIO_KG_HIERRO, kg, piezas: piezas.reduce((s, x) => s + Number(x.cantidad), 0), movs: piezas.length, sinPeso, excluido },
  }
}

// Lo que se le pide a Odoo para un mes: el estado de resultados de las dos empresas y las
// facturas de compra de Feisen. Es una llamada por empresa y por acción, siempre de un solo mes.
export async function leerOdooMes(mes) {
  const pedir = async (accion, empresa) => {
    const { data, error } = await supabase.functions.invoke('finanzas-odoo', { body: { accion, empresa, mes } })
    if (error) {
      let msg = error.message
      try { msg = (await error.context.json()).error || msg } catch { /* sin cuerpo */ }
      throw new Error(`${empresa === 'feisen' ? 'Feisen' : 'FC'}: ${msg}`)
    }
    if (data?.error) throw new Error(`${empresa === 'feisen' ? 'Feisen' : 'FC'}: ${data.error}`)
    return data
  }
  const [feisen, fc, comprasFeisen] = await Promise.all([
    pedir('pyg', 'feisen'), pedir('pyg', 'fc'), pedir('resultado', 'feisen'),
  ])
  return { pyg: { feisen, fc }, compras: { feisen: comprasFeisen } }
}

// ─────────────────────────────────────────────────────────────────────────────
// EL CÁLCULO DE UN MES. Lo usan las dos vistas de la pantalla.
//
//   pyg     { feisen: {filas}, fc: {filas} }  estado de resultados de cada Odoo
//   compras { feisen: {compras} }             facturas de compra de Feisen
//   hierro  número o null                     transferencia de Hierro, del ERP
//   nomina  { porCentro, administracion }     nómina del ERP, o null
//   manual  { 'concepto|empresa': valor }     casillas escritas a mano del mes
//   centroId  null = consolidado, o el centro de costo que se está mirando
//
// Devuelve las cifras y las funciones con las que se pinta el informe. Ninguna
// de estas reglas se copia en otra parte: si falta algo, se agrega aquí.
// ─────────────────────────────────────────────────────────────────────────────
export function calcularMes({ pyg = null, compras = null, hierro = null, nomina = null, manual = {}, centroId = null }) {
  const centro = CENTROS.find(c => c.id === centroId) || null
  const ing = { feisen: ingresosDe(pyg?.feisen?.filas), fc: ingresosDe(pyg?.fc?.filas) }

  const val = (emp, id) => ing?.[emp]?.[id]?.valor || 0
  const suma = (emp, ids) => ids.reduce((s, id) => s + val(emp, id), 0)
  const totalVentas = emp => VENTAS.reduce((s, v) => s + val(emp, v.id), 0)
  const neto = emp => totalVentas(emp) - val(emp, 'devoluciones')

  const transfHierro = hierro || 0
  const transfAluminio = manual['transferencia_aluminio|total']
  const transfRecibidas = transfHierro + (transfAluminio || 0)
  const escrito = (cId, filaId, empresa) => manual[`${cId}:${filaId}|${empresa}`]

  // Reparto por ventas: lo que Odoo no trae con centro (y todos los gastos) se reparte entre los
  // centros en la misma proporción en que vendieron ese mes.
  const ventasCentro = id => (CENTROS.find(c => c.id === id)?.renglones || []).reduce((s, r) => s + val('feisen', r) + val('fc', r), 0)
  const ventasCentros = CENTROS.reduce((s, c) => s + ventasCentro(c.id), 0)
  const peso = id => ventasCentros > 0 ? ventasCentro(id) / ventasCentros : 0

  // Lo que cada renglón saca de Odoo, ya repartido entre los tres centros
  const auto = {}
  for (const [empresa, filas] of Object.entries(AUTO)) for (const [filaId, f] of Object.entries(filas)) {
    const a = auto[`${empresa}:${filaId}`] = { centros: { construequipos: 0, hierro: 0, aluminio: 0 }, sinCentro: 0 }
    const lineas = f.fuente === 'compras'
      ? (compras?.[empresa]?.compras || []).filter(f.filtro)
      : (pyg?.[empresa]?.filas || []).filter(f.filtro)
    for (const l of lineas) {
      const c = f.porVentas ? null : (centroDe(l.centro) || f.sinCentro)
      if (c) a.centros[c] += l.valor; else a.sinCentro += l.valor
    }
  }

  // Nómina de producción cargada en el ERP (RRHH › Nómina), por centro. Es la que paga FC.
  const nominaCentro = id => nomina?.porCentro?.[id] || 0
  const nominaDeLaVista = () => centro ? nominaCentro(centro.id) : CENTROS.reduce((s, c) => s + nominaCentro(c.id), 0)

  // Nómina administrativa de FC: la de administración cargada en el ERP más las quincenas que falten.
  // No tiene centro de costo, así que se guarda una sola vez ('todos:nomina_admin') y se reparte por ventas.
  const adminErp = () => nomina?.administracion || 0
  const adminAMano = () => manual['todos:nomina_admin|fc'] || 0
  const adminDeLaVista = () => (adminErp() + adminAMano()) * (centro ? peso(centro.id) : 1)

  const automatico = (cId, filaId, empresa) => {
    const a = auto[`${empresa}:${filaId}`]
    return a ? a.centros[cId] + a.sinCentro * peso(cId) : null
  }
  const baseCentro = (cId, filaId, empresa) => {
    const esc = escrito(cId, filaId, empresa)
    return esc != null ? esc : (automatico(cId, filaId, empresa) || 0)
  }
  const valorEmpresa = (filaId, empresa) => {
    const base = centro ? baseCentro(centro.id, filaId, empresa)
      : CENTROS.reduce((s, c) => s + baseCentro(c.id, filaId, empresa), 0)
    // La nómina del ERP es la que paga FC; se suma a lo que Angie escriba de las quincenas que falten
    if (filaId === 'mano_obra' && empresa === 'fc') return base + nominaDeLaVista()
    if (filaId === 'nomina_admin' && empresa === 'fc') return base + adminDeLaVista()
    return base
  }
  const valorFila = filaId => {
    const v = EMPRESAS.reduce((s, e) => s + valorEmpresa(filaId, e.id), 0)
    return centro?.id === 'construequipos' && filaId === 'materia_prima' ? v + transfRecibidas : v
  }

  const porBloque = Object.fromEntries(BLOQUES.map(b => [b.id, b.filas.reduce((s, f) => s + valorFila(f.id), 0)]))
  const ingresoBase = !centro ? neto('feisen') + neto('fc')
    : centro.id === 'construequipos'
      ? suma('feisen', centro.renglones) + suma('fc', centro.renglones) - val('feisen', 'devoluciones') - val('fc', 'devoluciones')
      : val('feisen', centro.id) + val('fc', centro.id) + (centro.id === 'hierro' ? transfHierro : (transfAluminio || 0))
  const utilidadBruta = ingresoBase - porBloque.costos_directos - porBloque.cif
  const utilidadOperacional = utilidadBruta - porBloque.gastos_op
  const utilidadNeta = utilidadOperacional - porBloque.gastos_no_op
  const UTILIDAD = { 'Utilidad bruta': utilidadBruta, 'Utilidad operacional': utilidadOperacional, 'Utilidad neta': utilidadNeta }
  const llenas = FILAS_COSTO.filter(f => Math.round(valorFila(f.id)) !== 0).length

  return {
    centro, ing, val, suma, totalVentas, neto,
    transfHierro, transfAluminio, transfRecibidas,
    peso, escrito, automatico, valorEmpresa, valorFila,
    nominaDeLaVista, adminErp, adminAMano, adminDeLaVista,
    porBloque, ingresoBase, utilidadBruta, utilidadOperacional, utilidadNeta, UTILIDAD,
    llenas, parcial: llenas < FILAS_COSTO.length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Los meses anteriores a octubre de 2026 no salen de Odoo: salen del Excel que Angie llevaba a mano
// (ver eeffHistorico.js). Esta función arma con esos números el mismo objeto que `calcularMes`,
// para que la tabla del año no tenga que saber de dónde viene cada mes.
// ─────────────────────────────────────────────────────────────────────────────
export { hayHistorico }

export function calcularMesHistorico(mes, centroId = null) {
  const porCentro = HISTORICO[mes]
  if (!porCentro) return null
  const centro = CENTROS.find(c => c.id === centroId) || null
  const losCentros = centro ? [centro] : CENTROS
  const iEmp = emp => (emp === 'feisen' ? 0 : 1)

  // Un renglón del Excel, sumando los centros de la vista
  const dato = (fila, emp) => losCentros.reduce((s, c) => s + ((porCentro[c.id]?.[fila] || [0, 0])[iEmp(emp)] || 0), 0)

  // Ventas: Construequipos tiene sus cuatro renglones; las fundiciones tienen uno solo
  const val = (emp, id) => {
    if (id === 'devoluciones') return dato('devoluciones', emp)
    if (id === 'hierro' || id === 'aluminio') {
      if (centro && centro.id !== id) return 0
      return (porCentro[id]?.v_centro || [0, 0])[iEmp(emp)] || 0
    }
    if (centro && centro.id !== 'construequipos') return 0
    const m = { construequipos: 'v_construequipos', repuestos: 'v_repuestos', mantenimientos: 'v_mantenimientos', no_operacionales: 'v_no_operacionales' }
    return m[id] ? (porCentro.construequipos?.[m[id]] || [0, 0])[iEmp(emp)] || 0 : 0
  }
  const suma = (emp, ids) => ids.reduce((s, id) => s + val(emp, id), 0)
  const totalVentas = emp => VENTAS.reduce((s, v) => s + val(emp, v.id), 0)
  const neto = emp => totalVentas(emp) - val(emp, 'devoluciones')

  const transfHierro = porCentro.construequipos?.transf_hierro || 0
  const transfAluminio = porCentro.construequipos?.transf_aluminio || 0
  // En Construequipos las piezas recibidas se suman a su materia prima, igual que en la vista del mes
  const transfRecibidas = centro?.id === 'construequipos' ? transfHierro + transfAluminio : 0

  const valorEmpresa = (filaId, emp) => dato(filaId, emp)
  const valorFila = filaId => {
    const v = valorEmpresa(filaId, 'feisen') + valorEmpresa(filaId, 'fc')
    return centro?.id === 'construequipos' && filaId === 'materia_prima' ? v + transfRecibidas : v
  }
  const porBloque = Object.fromEntries(BLOQUES.map(b => [b.id, b.filas.reduce((s, f) => s + valorFila(f.id), 0)]))
  const ingresoBase = !centro ? neto('feisen') + neto('fc')
    : centro.id === 'construequipos'
      ? suma('feisen', centro.renglones) + suma('fc', centro.renglones) - val('feisen', 'devoluciones') - val('fc', 'devoluciones')
      : val('feisen', centro.id) + val('fc', centro.id) + (centro.id === 'hierro' ? transfHierro : transfAluminio)
  const utilidadBruta = ingresoBase - porBloque.costos_directos - porBloque.cif
  const utilidadOperacional = utilidadBruta - porBloque.gastos_op
  const utilidadNeta = utilidadOperacional - porBloque.gastos_no_op

  // Mismo molde que `ingresosDe`, para que la pantalla pueda pedir el detalle de un renglón de ventas
  // sin saber de dónde viene el mes. Del Excel no hay detalle por factura: solo el total.
  const ing = Object.fromEntries(['feisen', 'fc'].map(emp => [
    emp,
    Object.fromEntries([...VENTAS.map(v => v.id), 'devoluciones'].map(id => [id, { valor: val(emp, id), detalle: [] }])),
  ]))

  return {
    historico: true, centro, ing, val, suma, totalVentas, neto,
    transfHierro, transfAluminio, transfRecibidas,
    peso: () => 0, escrito: () => undefined, automatico: () => null,
    valorEmpresa, valorFila, nominaDeLaVista: () => 0,
    adminErp: () => 0, adminAMano: () => 0, adminDeLaVista: () => 0,
    porBloque, ingresoBase, utilidadBruta, utilidadOperacional, utilidadNeta,
    UTILIDAD: { 'Utilidad bruta': utilidadBruta, 'Utilidad operacional': utilidadOperacional, 'Utilidad neta': utilidadNeta },
    llenas: FILAS_COSTO.filter(f => Math.round(valorFila(f.id)) !== 0).length,
    parcial: false,
  }
}
