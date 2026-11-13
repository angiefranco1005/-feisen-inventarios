import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { EncabezadoPagina, Segmentado, useAviso } from '../shared/ui'
import { ChevronDown, ChevronRight, RefreshCw } from '../shared/iconos'
import { useOdoo, Cargando, ErrorOdoo, normCentro, pesos, millones, hoyCol, SIN_CENTRO } from './comun'

// EEFF consolidados de Feisen y FC, armados paso a paso con el método de Angie (empezó con octubre 2026).
// Estructura = hoja "P&G CONSOLIDADO" de su Excel EEFF 2026. Ver OBSERVACIONES.md (2026-11-11).
//
// Paso 1 — Ingresos (definido con Angie, 11/11/2026):
//  - Ventas por centro = cuenta 412000 de cada Odoo por cuenta analítica. Construequipos separa Repuestos y
//    Mantenimientos. Las demás cuentas de ingreso (no operacionales: 421000, 425502, 429500…) van DENTRO de las
//    ventas de Construequipos (decisión de Angie).
//  - Devoluciones y descuentos = descuentos comerciales (530508) + devoluciones en ventas (4175xx).
//    Ojo: la 530508 no se debe sumar otra vez en gastos financieros.
//  - Transferencias internas a Construequipos (ingreso de Hierro y Aluminio, materia prima de Construequipos;
//    en el consolidado se anulan): Hierro = piezas "MATERIAL FUNDIDO HIERRO" que salen de Fundición a otra
//    bodega en el ERP, kg × $5.500; Aluminio = valor a mano (todavía no registra salidas en el ERP).
//
// Paso 2 — Costos y gastos a mano con utilidad en vivo (13/11/2026): cada renglón de costo o gasto es una
// casilla en la vista de su centro; al escribirla se recalculan los subtotales y las tres utilidades.
// Mientras falten renglones la utilidad se marca como parcial. Después, cada renglón se irá conectando a
// su fuente (Odoo o el ERP) y dejará de escribirse a mano.

const PRECIO_KG_HIERRO = 5500
const DESCUENTOS = c => c === '530508' || c.startsWith('4175')

// Renglones de ventas: centro de Odoo → renglón (el nombre es el que se ve dentro de su centro)
const VENTAS = [
  { id: 'construequipos', nombre: 'Máquinas', centros: ['CONSTRUEQUIPOS', 'Sin centro'] },
  { id: 'no_operacionales', nombre: 'Ventas no operacionales', noOperacional: true },
  { id: 'repuestos', nombre: 'Repuestos', centros: ['REPUESTOS'] },
  { id: 'mantenimientos', nombre: 'Mantenimientos', centros: ['MANTENIMIENTOS'] },
  { id: 'hierro', nombre: 'Ventas', centros: ['HIERRO'] },
  { id: 'aluminio', nombre: 'Ventas', centros: ['ALUMINIO'] },
]

// Centros de costo del P&G y sus renglones de ventas. Las devoluciones y descuentos (530508) hoy son todas
// de Construequipos, por eso solo ese centro las resta.
const CENTROS = [
  { id: 'construequipos', nombre: 'Construequipos', renglones: ['construequipos', 'no_operacionales', 'repuestos', 'mantenimientos'], devoluciones: true },
  { id: 'hierro', nombre: 'Fundición Hierro', renglones: ['hierro'] },
  { id: 'aluminio', nombre: 'Aluminio', renglones: ['aluminio'] },
]

// Filtro de vista: consolidado o un centro de costo (se recuerda en este equipo)
const CLAVE_VISTA = 'feisen-eeff-vista'
const VISTAS = [
  { valor: 'consolidado', texto: <Corto largo="Consolidado" corto="Consolid." />, titulo: 'consolidado' },
  { valor: 'construequipos', texto: <Corto largo="Construequipos" corto="Constru" />, titulo: 'Construequipos' },
  { valor: 'hierro', texto: <Corto largo="Fundición Hierro" corto="Hierro" />, titulo: 'Fundición Hierro' },
  { valor: 'aluminio', texto: 'Aluminio', titulo: 'Aluminio' },
]

// Columnas de cada renglón: concepto + Feisen / FC / Total (en celular solo concepto + Total)
const GRID = 'grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)_4.5rem] gap-3'

// Análisis vertical: cada renglón como % de los ingresos netos de la vista (consolidado o centro),
// igual que la hoja "ANÁLISIS VERTICAL" del Excel de Angie.
const BaseVertical = createContext(0)

// Costos y gastos: todavía se escriben a mano en cada centro (se guardan en eeff_manual, concepto
// '<centro>:<fila>'). Al escribirlos, los subtotales y la utilidad se recalculan al instante.
// En Consolidado no se escriben: es la suma de los tres centros, como la hoja consolidada del Excel de Angie.
const BLOQUES = [
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
const FILAS_COSTO = BLOQUES.flatMap(b => b.filas)

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

const AUTO = {
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
// **Solo Feisen**, como lo pidió Angie el 13/11/2026: en FC no hay honorarios causados.
// Como todo gasto, se reparte entre los centros por su participación en ventas.
AUTO.feisen.honorarios = {
  fuente: 'pyg', nota: 'honorarios (5110xx) y el asesor de seguridad y salud (519600)', porVentas: true,
  filtro: x => x.codigo.startsWith('5110') || x.codigo === '519600',
}

// Gastos no operacionales: salen **solo de Odoo Feisen**, como lo pidió Angie el 13/11/2026 ("los gastos
// no operacionales los saca de Feisen, porque eso sí o sí tiene que ver con Feisen"). La columna de FC
// queda como casilla a mano. Como todo gasto, se reparten entre los tres centros por participación en ventas.
// **Ojo:** las cuentas se nombran una por una, nunca por prefijo '5305'. La 530508 "Descuentos comerciales
// condicionados" también empieza por 5305 y ya está restada arriba, en "Devoluciones y descuentos
// comerciales": si entra por un filtro de prefijo, esa plata se resta dos veces. No cambiar a startsWith.
const NO_OPERACIONALES = {
  // Intereses que cobra la DIAN por impuestos pagados tarde (octubre 2026: $5.375.000)
  intereses_impuestos: { cuentas: ['530507'], nota: 'intereses de impuestos (530507)' },
  // El 4x1000 que descuenta el banco de cada movimiento (octubre 2026: $2.894.891)
  gravamenes: { cuentas: ['530501'], nota: 'gravamen a los movimientos financieros 4x1000 (530501)' },
  // Intereses de los créditos y sobregiros bancarios (octubre 2026: $8.342.532)
  intereses_bancarios: { cuentas: ['530504'], nota: 'intereses corrientes bancarios (530504)' },
  // Lo que cobra el banco por el servicio: cuota de manejo y comisiones (octubre 2026: $1.091.393)
  comisiones_financieras: { cuentas: ['530502', '530503'], nota: 'cuota de manejo y comisiones bancarias (530502, 530503)' },
}
for (const [fila, { cuentas, nota }] of Object.entries(NO_OPERACIONALES)) {
  AUTO.feisen[fila] = { fuente: 'pyg', nota, porVentas: true, filtro: x => cuentas.includes(x.codigo) }
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
const EMPRESAS = [{ id: 'feisen', nombre: 'Feisen' }, { id: 'fc', nombre: 'FC' }]

// Mano de obra de producción: nómina del ERP (RRHH › Nómina), por el centro de costo de cada colaborador.
// Se toma el total devengado, que es lo que cuesta el trabajo; las deducciones (seguridad, anticipos) no
// bajan el costo, se le descuentan al colaborador. La gente de 'administracion' no entra aquí: va en el
// renglón de nómina administrativa. Las quincenas que todavía no estén cargadas se escriben a mano.
const CENTRO_NOMINA = { construequipos: 'construequipos', fundicionHierro: 'hierro', aluminio: 'aluminio' }

// Clasifica las filas de 'pyg' de una empresa en los renglones de ingresos
function ingresosDe(filas = []) {
  const r = Object.fromEntries(VENTAS.map(v => [v.id, { valor: 0, detalle: [] }]))
  r.devoluciones = { valor: 0, detalle: [] }
  for (const f of filas) {
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

export default function Eeff() {
  const [mes, setMes] = useState('2026-10')
  const [aviso, avisar] = useAviso()
  const { datos, cargando, error, recargar } = useOdoo('pyg', 'ambas', { mes })
  const compras = useOdoo('resultado', 'feisen', { mes })
  const [abierto, setAbierto] = useState(null)
  const [vista, setVista] = useState(() => {
    try { const v = localStorage.getItem(CLAVE_VISTA); return VISTAS.some(o => o.valor === v) ? v : 'consolidado' } catch { return 'consolidado' }
  })
  const cambiarVista = v => { setVista(v); setAbierto(null); try { localStorage.setItem(CLAVE_VISTA, v) } catch { /* sin almacenamiento */ } }

  // Transferencia de Hierro desde el ERP y valores a mano del mes
  const [erp, setErp] = useState({ cargando: true, hierro: null, nomina: null, error: '' })
  const [manual, setManual] = useState({})
  const cargarErp = useCallback(async () => {
    setErp(e => ({ ...e, cargando: true, error: '' }))
    const [y, m] = mes.split('-').map(Number)
    const fin = new Date(y, m, 0).getDate()
    const desde = `${mes}-01`, hasta = `${mes}-${String(fin).padStart(2, '0')}`
    try {
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
      setManual(Object.fromEntries((man || []).map(x => [`${x.concepto}|${x.empresa}`, Number(x.valor)])))

      // Nómina del mes por centro (solo producción)
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

      setErp({ cargando: false, error: '', nomina, hierro: { valor: kg * PRECIO_KG_HIERRO, kg, piezas: piezas.reduce((s, x) => s + Number(x.cantidad), 0), movs: piezas.length, sinPeso, excluido } })
    } catch (e) {
      setErp({ cargando: false, hierro: null, nomina: null, error: e.message || 'No se pudo leer el ERP.' })
    }
  }, [mes])
  useEffect(() => { cargarErp() }, [cargarErp])

  const ing = useMemo(() => datos && { feisen: ingresosDe(datos.feisen?.filas), fc: ingresosDe(datos.fc?.filas) }, [datos])
  const val = (emp, id) => ing?.[emp]?.[id]?.valor || 0
  const suma = (emp, ids) => ids.reduce((s, id) => s + val(emp, id), 0)
  const totalVentas = emp => VENTAS.reduce((s, v) => s + val(emp, v.id), 0)
  const neto = emp => totalVentas(emp) - val(emp, 'devoluciones')

  // Borrar la casilla devuelve el renglón a lo que trae Odoo; escribir en ella reemplaza ese valor
  async function guardarManual(concepto, empresa, texto) {
    const limpio = String(texto).replace(/[^\d-]/g, '')
    if (limpio === '') {
      const { error: err } = await supabase.from('eeff_manual').delete().eq('mes', mes).eq('concepto', concepto).eq('empresa', empresa)
      if (err) { avisar('No se pudo borrar: ' + err.message); return }
      setManual(m => { const n = { ...m }; delete n[`${concepto}|${empresa}`]; return n })
      avisar('Casilla vacía')
      return
    }
    const valor = Number(limpio) || 0
    const { error: err } = await supabase.from('eeff_manual').upsert({ mes, concepto, empresa, valor, updated_at: new Date().toISOString() })
    if (err) { avisar('No se pudo guardar: ' + err.message); return }
    setManual(m => ({ ...m, [`${concepto}|${empresa}`]: valor }))
    avisar('Guardado')
  }

  const [y, m] = mes.split('-').map(Number)
  const nombreMes = new Date(y, m - 1, 15).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  const Titulo = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)
  const transfAluminio = manual['transferencia_aluminio|total']
  const transfHierro = erp.hierro?.valor || 0
  const centro = CENTROS.find(c => c.id === vista)
  const tituloVista = VISTAS.find(v => v.valor === vista)?.titulo || 'consolidado'

  // ── Costos y gastos a mano, y utilidad que va quedando ──
  // En un centro se escriben; en Consolidado se suman los tres (las transferencias internas se anulan:
  // son ingreso de Hierro/Aluminio y materia prima de Construequipos, y ninguna entra al consolidado).
  const transfRecibidas = transfHierro + (transfAluminio || 0)
  const escrito = (centroId, filaId, empresa) => manual[`${centroId}:${filaId}|${empresa}`]

  // Lo que cada renglón saca solo de Odoo, por centro. Lo que viene sin centro se reparte entre los
  // centros según lo que vendió cada uno en el mes (el mismo criterio de Resultado por centro).
  const centroDe = c => {
    const n = normCentro(c)
    if (n === 'HIERRO') return 'hierro'
    if (n === 'ALUMINIO') return 'aluminio'
    return n === SIN_CENTRO ? null : 'construequipos'
  }
  const ventasCentro = id => (CENTROS.find(c => c.id === id)?.renglones || []).reduce((s, r) => s + val('feisen', r) + val('fc', r), 0)
  const ventasCentros = CENTROS.reduce((s, c) => s + ventasCentro(c.id), 0)
  const peso = id => ventasCentros > 0 ? ventasCentro(id) / ventasCentros : 0

  // Lo único que por ahora sale solo de Odoo: la materia prima de FC. Lo que viene sin centro se reparte
  // entre los centros según lo que vendió cada uno en el mes (el mismo criterio de Resultado por centro).
  const auto = useMemo(() => {
    const auto = {}
    for (const [empresa, filas] of Object.entries(AUTO)) for (const [filaId, f] of Object.entries(filas)) {
      const a = auto[`${empresa}:${filaId}`] = { centros: { construequipos: 0, hierro: 0, aluminio: 0 }, sinCentro: 0 }
      const lineas = f.fuente === 'compras'
        ? (compras.datos?.[empresa]?.compras || []).filter(f.filtro)
        : (datos?.[empresa]?.filas || []).filter(f.filtro)
      for (const l of lineas) {
        const c = f.porVentas ? null : (centroDe(l.centro) || f.sinCentro)
        if (c) a.centros[c] += l.valor; else a.sinCentro += l.valor
      }
    }
    return auto
  }, [datos, compras.datos]) // eslint-disable-line react-hooks/exhaustive-deps

  // Nómina de producción cargada en el ERP (RRHH › Nómina), por centro. Es la que paga FC.
  const nominaCentro = id => erp.nomina?.porCentro?.[id] || 0
  const nominaDeLaVista = () => centro ? nominaCentro(centro.id) : CENTROS.reduce((s, c) => s + nominaCentro(c.id), 0)

  // Nómina administrativa de FC: la de administración cargada en el ERP más las quincenas que falten.
  // No tiene centro de costo, así que se guarda una sola vez ('todos:nomina_admin') y se reparte por ventas.
  const adminErp = () => erp.nomina?.administracion || 0
  const adminAMano = () => manual['todos:nomina_admin|fc'] || 0
  const adminDeLaVista = () => (adminErp() + adminAMano()) * (centro ? peso(centro.id) : 1)

  const automatico = (centroId, filaId, empresa) => {
    const a = auto[`${empresa}:${filaId}`]
    return a ? a.centros[centroId] + a.sinCentro * peso(centroId) : null
  }
  const baseCentro = (centroId, filaId, empresa) => {
    const esc = escrito(centroId, filaId, empresa)
    return esc != null ? esc : (automatico(centroId, filaId, empresa) || 0)
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
  const totalBloque = b => b.filas.reduce((s, f) => s + valorFila(f.id), 0)
  const porBloque = Object.fromEntries(BLOQUES.map(b => [b.id, totalBloque(b)]))
  const ingresoBase = !centro ? neto('feisen') + neto('fc')
    : centro.id === 'construequipos'
      ? suma('feisen', centro.renglones) + suma('fc', centro.renglones) - val('feisen', 'devoluciones') - val('fc', 'devoluciones')
      : val('feisen', centro.id) + val('fc', centro.id) + (centro.id === 'hierro' ? transfHierro : (transfAluminio || 0))
  const utilidadBruta = ingresoBase - porBloque.costos_directos - porBloque.cif
  const utilidadOperacional = utilidadBruta - porBloque.gastos_op
  const utilidadNeta = utilidadOperacional - porBloque.gastos_no_op
  const UTILIDAD = { 'Utilidad bruta': utilidadBruta, 'Utilidad operacional': utilidadOperacional, 'Utilidad neta': utilidadNeta }
  const llenas = FILAS_COSTO.filter(f => Math.round(valorFila(f.id)) !== 0).length
  const parcial = llenas < FILAS_COSTO.length

  const alternar = id => setAbierto(a => (a === id ? null : id))
  // Mientras Odoo carga, `ing` es null: los renglones se arman igual (filaDevoluciones es un elemento ya creado)
  const detalleDe = id => ing ? [...ing.feisen[id].detalle.map(d => ({ ...d, emp: 'Feisen' })), ...ing.fc[id].detalle.map(d => ({ ...d, emp: 'FC' }))] : []
  const filaVenta = (id, sangria) => (
    <Fila key={id} nombre={VENTAS.find(v => v.id === id).nombre} feisen={val('feisen', id)} fc={val('fc', id)} sangria={sangria}
      abierto={abierto === id} onClick={() => alternar(id)} detalle={detalleDe(id)} />
  )
  const filaDevoluciones = (
    <Fila nombre="(−) Devoluciones y descuentos comerciales" feisen={val('feisen', 'devoluciones')} fc={val('fc', 'devoluciones')}
      abierto={abierto === 'dev'} onClick={() => alternar('dev')} detalle={detalleDe('devoluciones')} />
  )
  const notaHierro = erp.cargando ? 'Leyendo salidas de Fundición…' : erp.error ? `Error: ${erp.error}`
    : `${Math.round(erp.hierro.piezas).toLocaleString('es-CO')} piezas · ${Math.round(erp.hierro.kg).toLocaleString('es-CO')} kg × $${PRECIO_KG_HIERRO.toLocaleString('es-CO')}${erp.hierro.sinPeso ? ` · ${erp.hierro.sinPeso} sin peso` : ''}${erp.hierro.excluido
      ? ` · Observación: se descontaron ${pesos(erp.hierro.excluido.valor)} de materia prima de Fundición registrada como salida a otra bodega (${erp.hierro.excluido.documentos.join(', ')}); no es transferencia interna`
      : ''}`
  const casillaAluminio = <CasillaPesos key={`${mes}-${transfAluminio}`} valor={transfAluminio} onGuardar={t => guardarManual('transferencia_aluminio', 'total', t)} />

  // De dónde sale cada renglón, para que se vea en la pantalla
  const notaFila = f => {
    const extra = centro?.id === 'construequipos' && f.id === 'materia_prima' ? 'abajo van las piezas recibidas de Hierro y Aluminio' : ''
    if (f.id === 'mano_obra') return 'Feisen: mano de obra directa con prestaciones (7205xx) · FC: la nómina del ERP más lo que escribas'
    // La columna de FC ya no muestra el desglose abajo, así que la nota explica de dónde sale
    if (f.id === 'nomina_admin') return `Feisen: ${AUTO.feisen.nomina_admin.nota} · FC: nómina de administración del ERP más las quincenas escritas a mano`
    const notas = EMPRESAS.filter(e => AUTO[e.id]?.[f.id]).map(e => [e.nombre, AUTO[e.id][f.id].nota])
    // Si las dos empresas sacan el renglón de lo mismo, no se repite el texto
    const iguales = notas.length === 2 && notas[0][1] === notas[1][1]
    const auto = iguales ? [notas[0][1]] : notas.map(([emp, n]) => `${emp}: ${n}`)
    return [auto.join(' · '), extra].filter(Boolean).join(' · ') || undefined
  }
  // Celda de una empresa: casilla para escribir en la vista de un centro, cifra en Consolidado o si sale de Odoo
  const celda = (f, empresa) => {
    // Mano de obra de FC: la columna muestra el total (nómina del ERP + lo escrito); se escribe abajo
    if (!centro || AUTO[empresa]?.[f.id] || (empresa === 'fc' && (f.id === 'mano_obra' || f.id === 'nomina_admin'))) return <Cifra v={valorEmpresa(f.id, empresa)} />
    return <CasillaPesos key={`${mes}-${centro.id}-${f.id}-${empresa}-${escrito(centro.id, f.id, empresa)}`}
      valor={escrito(centro.id, f.id, empresa)} onGuardar={t => guardarManual(`${centro.id}:${f.id}`, empresa, t)} />
  }

  // Costos y gastos: cada renglón con su valor de Feisen y el de FC, como en el Excel.
  // En Construequipos, debajo de "Materia prima" van las piezas recibidas de Hierro y Aluminio.
  const pendientes = BLOQUES.map((b, i) => (
    <div key={b.id}>
      <Seccion titulo={b.seccion} nota={i === 0
        ? (centro ? 'Escribe el valor del mes en cada empresa: la utilidad de abajo se actualiza sola.'
          : 'Suma de los tres centros. Para escribir o corregir un valor, elige un centro arriba.')
        : undefined} />
      {b.filas.map(f => (
        <div key={f.id}>
          <div className={`${GRID} px-4 py-2 text-sm items-center border-t border-feisen-borde-suave`}>
            <span className="min-w-0">
              <span className="block text-feisen-texto">{f.nombre}</span>
              {notaFila(f) && <span className="block text-xs text-feisen-texto-2">{notaFila(f)}</span>}
            </span>
            <span className="hidden sm:contents">{celda(f, 'feisen')}{celda(f, 'fc')}</span>
            <Cifra v={valorFila(f.id)} fuerte />
            <Pct v={valorFila(f.id)} />
          </div>
          {f.id === 'mano_obra' && (
            <SoloTotal nombre="De esa, la nómina ya cargada en el ERP (FC)" sangria valor={erp.nomina ? nominaDeLaVista() : null}
              nota={erp.cargando ? 'Leyendo la nómina…' : erp.error ? `Error: ${erp.error}`
                : erp.nomina?.quincenas?.length
                  ? `RRHH › Nómina · ${erp.nomina.quincenas.map(([q, e]) => `${q}.ª quincena${e !== 'cerrada' ? ` (${e})` : ''}`).join(' y ')} · total devengado de producción, sin administración`
                  : 'Todavía no hay nómina cargada de este mes: escribe el valor abajo'} />
          )}
          {f.id === 'mano_obra' && centro && (
            <SoloTotal nombre="Más las quincenas que falten (FC)" sangria
              nota="Lo que todavía no está en el ERP. Se suma a lo de arriba.">
              <CasillaPesos key={`${mes}-${centro.id}-mano_obra-fc-${escrito(centro.id, 'mano_obra', 'fc')}`}
                valor={escrito(centro.id, 'mano_obra', 'fc')} onGuardar={t => guardarManual(`${centro.id}:mano_obra`, 'fc', t)} />
            </SoloTotal>
          )}
          {/* Los dos sub-renglones de nómina administrativa (lo del ERP y la casilla de las quincenas
              que falten) se quitaron de la vista el 13/11/2026: Angie no los necesita en el informe.
              El valor escrito a mano sigue guardado y sigue sumando en la columna de FC; ahora solo
              se cambia desde la base de datos (eeff_manual, concepto 'todos:nomina_admin'). */}
          {centro?.id === 'construequipos' && f.id === 'materia_prima' && (<>
            <SoloTotal nombre="Transferencia recibida — Fundición Hierro" nota={`del ERP · ${notaHierro}`} valor={erp.hierro ? transfHierro : null} sangria />
            <SoloTotal nombre="Transferencia recibida — Aluminio"
              nota={transfAluminio == null ? 'Sin valor: escríbelo en la vista Aluminio o Consolidado' : 'a mano'} valor={transfAluminio} sangria />
          </>)}
        </div>
      ))}
      <SoloTotal nombre={b.subtotal} valor={porBloque[b.id] || null} total />
      {b.utilidad && <SoloTotal nombre={b.utilidad} nota={parcial ? `con lo que va cargado: ${llenas} de ${FILAS_COSTO.length} renglones` : undefined}
        valor={UTILIDAD[b.utilidad]} total destacado />}
    </div>
  ))

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24 lg:pb-8">
      <EncabezadoPagina modulo="Finanzas" titulo="EEFF"
        subtitulo="Estado de resultados de Feisen y FC juntos, armado paso a paso con tu método.">
        <button type="button" onClick={() => { recargar(); compras.recargar(); cargarErp() }} disabled={cargando || compras.cargando}
          className="flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-60">
          <RefreshCw size={16} className={cargando || compras.cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </EncabezadoPagina>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-feisen-texto-2">
          Mes
          <input type="month" value={mes} max={hoyCol().slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)}
            className="min-h-[42px] border border-feisen-borde rounded-lg px-3 bg-white text-feisen-texto focus:outline-none focus:ring-2 focus:ring-feisen-azul-suave" />
        </label>
        <div className="w-full sm:w-auto sm:min-w-[32rem]">
          <Segmentado opciones={VISTAS} valor={vista} onCambiar={cambiarVista} />
        </div>
        <span className="text-xs bg-amber-50 text-amber-700 rounded-md px-2 py-0.5 font-medium">
          Vamos por partes · {llenas} de {FILAS_COSTO.length} renglones de costos y gastos con valor
        </span>
      </div>

      {(cargando && !ing) || (compras.cargando && !compras.datos) ? <Cargando />
        : error || compras.error ? <ErrorOdoo mensaje={error || compras.error} onReintentar={() => { recargar(); compras.recargar() }} /> : ing && (
        <BaseVertical.Provider value={ingresoBase}>
        <div className={`bg-white border border-feisen-borde rounded-xl overflow-hidden ${cargando || compras.cargando ? 'opacity-60' : ''}`}>
          <div className="px-4 py-3 border-b border-feisen-borde-suave flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-feisen-texto">P&amp;G {tituloVista} · {Titulo}</span>
            <span className={`text-xs font-semibold rounded-md px-2 py-1 tabular-nums ${utilidadNeta < 0 ? 'bg-feisen-rojo-suave text-feisen-rojo'
              : parcial ? 'bg-amber-50 text-amber-700' : 'bg-feisen-azul-suave text-feisen-azul'}`}>
              Utilidad neta{parcial ? ' parcial' : ''}: {millones(utilidadNeta)}
            </span>
          </div>
          <Encabezado />

          {!centro ? (<>
            {/* Consolidado: ingresos agrupados por centro, con subtotal de cada uno */}
            <Seccion titulo="Ingresos" />
            {CENTROS.map(c => (
              <div key={c.id}>
                <Subtitulo titulo={c.nombre} />
                {c.renglones.map(id => filaVenta(id, true))}
                <Total nombre={`Subtotal ${c.nombre}`} feisen={suma('feisen', c.renglones)} fc={suma('fc', c.renglones)} />
              </div>
            ))}
            <div className="h-2" />
            <Total nombre="Total ventas" feisen={totalVentas('feisen')} fc={totalVentas('fc')} fuerte />
            {filaDevoluciones}
            <Total nombre="Ingresos netos" feisen={neto('feisen')} fc={neto('fc')} fuerte />

            <Seccion titulo="Transferencias internas a Construequipos" nota="Ingreso de Hierro y Aluminio y materia prima de Construequipos: en el consolidado se anulan, no suman a los ingresos netos" />
            <SoloTotal nombre={<>Fundición Hierro <span className="text-xs text-feisen-texto-2">· del ERP</span></>} nota={notaHierro} valor={erp.hierro ? transfHierro : null} sangria />
            <SoloTotal nombre={<>Aluminio <span className="text-xs text-feisen-texto-2">· a mano</span></>}
              nota="Total del mes de tu Excel de control (Aluminio aún no está en el ERP)" sangria>{casillaAluminio}</SoloTotal>
            <SoloTotal nombre="Total transferencias internas" valor={transfHierro + (transfAluminio || 0)} total />
          </>) : centro.id === 'construequipos' ? (<>
            {/* Construequipos: sus ventas, devoluciones e ingresos netos */}
            <Seccion titulo="Ingresos" />
            {centro.renglones.map(id => filaVenta(id))}
            <Total nombre="Total ventas" feisen={suma('feisen', centro.renglones)} fc={suma('fc', centro.renglones)} fuerte />
            {filaDevoluciones}
            <Total nombre="Ingresos netos" feisen={suma('feisen', centro.renglones) - val('feisen', 'devoluciones')}
              fc={suma('fc', centro.renglones) - val('fc', 'devoluciones')} fuerte />
          </>) : (<>
            {/* Fundición Hierro o Aluminio: ventas + transferencia interna (piezas a Construequipos) */}
            <Seccion titulo="Ingresos" />
            {filaVenta(centro.id)}
            <Total nombre="Ingresos netos" feisen={val('feisen', centro.id)} fc={val('fc', centro.id)} fuerte />
            {centro.id === 'hierro'
              ? <SoloTotal nombre="Transferencia interna — ingreso (piezas a Construequipos)" nota={`del ERP · ${notaHierro}`} valor={erp.hierro ? transfHierro : null} />
              : <SoloTotal nombre="Transferencia interna — ingreso (piezas a Construequipos)" nota="a mano · total del mes de tu Excel de control">{casillaAluminio}</SoloTotal>}
            <SoloTotal nombre="Ingresos totales" total
              valor={val('feisen', centro.id) + val('fc', centro.id) + (centro.id === 'hierro' ? transfHierro : (transfAluminio || 0))} />
          </>)}

          {pendientes}

        </div>
        </BaseVertical.Provider>
      )}

      <p className="text-xs text-feisen-texto-2 leading-relaxed">
        Ventas = cuenta 412000 de cada Odoo por centro; las demás cuentas de ingreso (no operacionales) van dentro de Construequipos.
        Devoluciones = descuentos comerciales (530508) y devoluciones en ventas; hoy todas son de Construequipos. Las notas crédito ya vienen restadas en las ventas.
        Toca un renglón de ingresos para ver de qué cuentas sale.
        La columna "% ventas" es el análisis vertical: cada renglón como porcentaje de los ingresos netos de la vista.
        Los costos y gastos se escriben por centro, en su columna de Feisen o de FC, y Consolidado suma los tres centros.
        Por ahora el único renglón que sale solo de Odoo es la materia prima: en FC, de su estado de resultados (cuenta 613500);
        en Feisen, de las compras del mes a inventario (cuenta 140500), que es donde contabilidad las deja.
        Lo que viene sin centro se reparte entre los centros según lo que vendió cada uno. Enero, febrero y marzo no están en Odoo.
      </p>
      {aviso}
    </div>
  )
}

// Texto del selector: corto en celular, completo desde tableta
function Corto({ largo, corto }) {
  return <><span className="sm:hidden">{corto}</span><span className="hidden sm:inline">{largo}</span></>
}

function Encabezado() {
  return (
    <div className="hidden sm:grid grid-cols-[1fr_repeat(3,8rem)_4.5rem] gap-3 px-4 py-2 border-b border-feisen-borde-suave text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">
      <span>Concepto</span><span className="text-right">Feisen</span><span className="text-right">FC</span><span className="text-right">Total</span><span className="text-right">% ventas</span>
    </div>
  )
}

function Seccion({ titulo, nota }) {
  return (
    <div className="px-4 pt-4 pb-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-feisen-azul">{titulo}</span>
      {nota && <span className="block text-xs text-feisen-texto-2">{nota}</span>}
    </div>
  )
}

// Celda del análisis vertical
function Pct({ v }) {
  const base = useContext(BaseVertical)
  const p = base && v ? (v / base) * 100 : null
  return <span className="hidden sm:block text-right tabular-nums text-xs text-feisen-texto-2">
    {p == null ? '' : `${p.toFixed(1).replace('.', ',')} %`}</span>
}

function Cifra({ v, fuerte }) {
  return <span className={`text-right tabular-nums ${fuerte ? 'font-semibold' : ''} ${v < 0 ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{v ? pesos(v) : '—'}</span>
}

// Nombre del centro dentro de la sección (vista consolidada)
function Subtitulo({ titulo }) {
  return <div className="px-4 pt-3 pb-1 border-t border-feisen-borde-suave text-sm font-semibold text-feisen-texto">{titulo}</div>
}

function Fila({ nombre, feisen, fc, detalle, abierto, onClick, sangria }) {
  const Icono = abierto ? ChevronDown : ChevronRight
  return (
    <div className="border-t border-feisen-borde-suave">
      <button type="button" onClick={onClick}
        className={`w-full ${GRID} px-4 py-2 text-sm items-center text-left hover:bg-feisen-fondo`}>
        <span className={`flex items-center gap-1 text-feisen-texto min-w-0 ${sangria ? 'pl-3' : ''}`}>
          <Icono size={14} className="text-gray-400 shrink-0" /><span className="truncate">{nombre}</span>
        </span>
        <span className="hidden sm:contents"><Cifra v={feisen} /><Cifra v={fc} /></span>
        <Cifra v={feisen + fc} fuerte />
        <Pct v={feisen + fc} />
      </button>
      {abierto && (
        <div className={`px-4 pb-2 space-y-1 ${sangria ? 'pl-11' : 'pl-8'}`}>
          {detalle.length === 0 ? <p className="text-xs text-feisen-texto-2">Sin movimiento en el mes.</p>
            : detalle.map((d, i) => (
              <div key={i} className="flex justify-between gap-3 text-xs text-feisen-texto-2">
                <span className="truncate">{d.emp} · {d.codigo} {d.cuenta} · {d.centro}</span>
                <span className="tabular-nums shrink-0">{pesos(d.valor)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function Total({ nombre, feisen, fc, fuerte }) {
  return (
    <div className={`${GRID} px-4 py-2.5 bg-feisen-fondo border-y border-feisen-borde-suave text-sm ${fuerte ? 'font-semibold' : 'font-medium'}`}>
      <span className="text-feisen-texto">{nombre}</span>
      <span className="hidden sm:contents"><Cifra v={feisen} fuerte={fuerte} /><Cifra v={fc} fuerte={fuerte} /></span>
      <Cifra v={feisen + fc} fuerte />
      <Pct v={feisen + fc} />
    </div>
  )
}

// Renglón que solo tiene valor en la columna Total (transferencias, costos y gastos).
// `children` reemplaza la cifra (casilla a mano); `destacado` es para las utilidades.
function SoloTotal({ nombre, nota, valor, sangria, total, destacado, children }) {
  return (
    <div className={`${GRID} px-4 text-sm items-center ${destacado ? 'py-3 bg-feisen-azul-suave border-y border-feisen-borde font-semibold'
      : total ? 'py-2.5 bg-feisen-fondo border-y border-feisen-borde-suave font-semibold' : 'py-2 border-t border-feisen-borde-suave'}`}>
      <span className={`min-w-0 ${sangria ? 'pl-3' : ''}`}>
        <span className={`block ${destacado ? 'text-feisen-azul' : 'text-feisen-texto'}`}>{nombre}</span>
        {nota && <span className="block text-xs font-normal text-feisen-texto-2">{nota}</span>}
      </span>
      <span className="hidden sm:block" /><span className="hidden sm:block" />
      {children || <span className={`text-right tabular-nums ${valor < 0 ? 'text-feisen-rojo' : destacado ? 'text-feisen-azul' : 'text-feisen-texto'}`}>
        {valor != null ? pesos(valor) : '—'}</span>}
      <Pct v={valor || 0} />
    </div>
  )
}

// Casilla de pesos que guarda al salir del campo o con Enter
function CasillaPesos({ valor, auto, onGuardar }) {
  const [texto, setTexto] = useState(valor != null ? Math.round(valor).toLocaleString('es-CO') : '')
  const guardar = () => {
    const limpio = texto.replace(/[^\d-]/g, '')
    if (limpio === String(Math.round(valor ?? NaN))) return
    if (limpio === '' && valor == null) return
    onGuardar(limpio)
  }
  return (
    <input inputMode="numeric" value={texto} placeholder={auto ? `$ ${Math.round(auto).toLocaleString('es-CO')}` : '$ escribe el valor'}
      onChange={e => setTexto(e.target.value)} onBlur={guardar} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      onFocus={e => e.target.select()}
      className="w-full sm:w-32 justify-self-end text-right tabular-nums min-h-[36px] border border-feisen-borde rounded-lg px-2 bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul-suave" />
  )
}
