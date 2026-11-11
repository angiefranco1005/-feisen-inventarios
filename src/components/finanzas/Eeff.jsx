import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { EncabezadoPagina, Segmentado, useAviso } from '../shared/ui'
import { ChevronDown, ChevronRight, RefreshCw } from '../shared/iconos'
import { useOdoo, Cargando, ErrorOdoo, normCentro, pesos, hoyCol } from './comun'

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
const GRID = 'grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)] gap-3'

// Lo que todavía falta definir con Angie (estructura del Excel)
const PENDIENTE = [
  { seccion: 'Costos directos', filas: ['Materia prima', 'Mano de obra'] },
  { seccion: 'Costos indirectos (CIF)', filas: ['Servicios públicos', 'Mantenimiento equipos planta', 'Transporte', 'Dotación', 'Insumos'], total: 'Utilidad bruta' },
  { seccion: 'Gastos operacionales', filas: ['Viáticos', 'Publicidad', 'Comisiones', 'Nómina asesores y director comercial', 'Sueldos marketing / community', 'Honorarios', 'Nómina administrativa', 'Otros gastos operacionales'], total: 'Utilidad operacional' },
  { seccion: 'Gastos no operacionales', filas: ['Intereses de impuestos', 'Gravámenes (4x1000)', 'Intereses bancarios', 'Comisiones financieras'], total: 'Utilidad neta' },
]

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
  const [abierto, setAbierto] = useState(null)
  const [vista, setVista] = useState(() => {
    try { const v = localStorage.getItem(CLAVE_VISTA); return VISTAS.some(o => o.valor === v) ? v : 'consolidado' } catch { return 'consolidado' }
  })
  const cambiarVista = v => { setVista(v); setAbierto(null); try { localStorage.setItem(CLAVE_VISTA, v) } catch { /* sin almacenamiento */ } }

  // Transferencia de Hierro desde el ERP y valores a mano del mes
  const [erp, setErp] = useState({ cargando: true, hierro: null, error: '' })
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
        .select('id, cantidad, bodega_origen_id, bodega_destino_id, items(nombre, peso_unitario, categorias(nombre)), bodegas_destino:bodega_destino_id(nombre)')
        .eq('tipo', 'salida').in('bodega_origen_id', ids).not('bodega_destino_id', 'is', null)
        .is('revertido_en', null).or('revertido.is.null,revertido.eq.false')
        .or(`and(fecha_movimiento.gte.${desde},fecha_movimiento.lte.${hasta}),and(fecha_movimiento.is.null,created_at.gte.${desde}T00:00:00,created_at.lte.${hasta}T23:59:59)`)
        .order('id').range(d, h))
      if (err) throw err
      const piezas = (data || []).filter(x => x.bodega_destino_id !== x.bodega_origen_id && x.items?.categorias?.nombre === 'MATERIAL FUNDIDO HIERRO')
      const kg = piezas.reduce((s, x) => s + Number(x.cantidad) * (Number(x.items?.peso_unitario) || 0), 0)
      const sinPeso = piezas.filter(x => !Number(x.items?.peso_unitario)).length
      const { data: man } = await supabase.from('eeff_manual').select('concepto, empresa, valor').eq('mes', mes)
      setManual(Object.fromEntries((man || []).map(x => [`${x.concepto}|${x.empresa}`, Number(x.valor)])))
      setErp({ cargando: false, error: '', hierro: { valor: kg * PRECIO_KG_HIERRO, kg, piezas: piezas.reduce((s, x) => s + Number(x.cantidad), 0), movs: piezas.length, sinPeso } })
    } catch (e) {
      setErp({ cargando: false, hierro: null, error: e.message || 'No se pudo leer el ERP.' })
    }
  }, [mes])
  useEffect(() => { cargarErp() }, [cargarErp])

  const ing = useMemo(() => datos && { feisen: ingresosDe(datos.feisen?.filas), fc: ingresosDe(datos.fc?.filas) }, [datos])
  const val = (emp, id) => ing?.[emp]?.[id]?.valor || 0
  const suma = (emp, ids) => ids.reduce((s, id) => s + val(emp, id), 0)
  const totalVentas = emp => VENTAS.reduce((s, v) => s + val(emp, v.id), 0)
  const neto = emp => totalVentas(emp) - val(emp, 'devoluciones')

  async function guardarManual(concepto, texto) {
    const valor = Number(String(texto).replace(/[^\d-]/g, '')) || 0
    const { error: err } = await supabase.from('eeff_manual').upsert({ mes, concepto, empresa: 'total', valor, updated_at: new Date().toISOString() })
    if (err) { avisar('No se pudo guardar: ' + err.message); return }
    setManual(m => ({ ...m, [`${concepto}|total`]: valor }))
    avisar('Guardado')
  }

  const [y, m] = mes.split('-').map(Number)
  const nombreMes = new Date(y, m - 1, 15).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  const Titulo = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)
  const transfAluminio = manual['transferencia_aluminio|total']
  const transfHierro = erp.hierro?.valor || 0
  const totalPendiente = PENDIENTE.reduce((s, b) => s + b.filas.length, 0)
  const centro = CENTROS.find(c => c.id === vista)
  const tituloVista = VISTAS.find(v => v.valor === vista)?.titulo || 'consolidado'

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
    : `${Math.round(erp.hierro.piezas).toLocaleString('es-CO')} piezas · ${Math.round(erp.hierro.kg).toLocaleString('es-CO')} kg × $${PRECIO_KG_HIERRO.toLocaleString('es-CO')}${erp.hierro.sinPeso ? ` · ${erp.hierro.sinPeso} sin peso` : ''}`
  const casillaAluminio = <CasillaPesos key={`${mes}-${transfAluminio}`} valor={transfAluminio} onGuardar={t => guardarManual('transferencia_aluminio', t)} />

  // Secciones que faltan por definir; en Construequipos, debajo de "Materia prima" van las transferencias recibidas
  const pendientes = PENDIENTE.map(b => (
    <div key={b.seccion}>
      <Seccion titulo={b.seccion} />
      <div className="divide-y divide-feisen-borde-suave">
        {b.filas.map(f => (
          <div key={f}>
            <div className={`${GRID} px-4 py-2 text-sm items-center`}>
              <span className="text-feisen-texto-2 pl-3">{f}</span>
              <span className="sm:hidden text-xs text-gray-400">por definir</span>
              {[0, 1, 2].map(i => <span key={i} className="hidden sm:block text-right text-gray-300">—</span>)}
            </div>
            {vista === 'construequipos' && f === 'Materia prima' && (<>
              <SoloTotal nombre="Transferencia recibida — Fundición Hierro" nota={`del ERP · ${notaHierro}`} valor={erp.hierro ? transfHierro : null} sangria />
              <SoloTotal nombre="Transferencia recibida — Aluminio"
                nota={transfAluminio == null ? 'Sin valor: escríbelo en la vista Aluminio o Consolidado' : 'a mano'} valor={transfAluminio} sangria />
            </>)}
          </div>
        ))}
      </div>
      {b.total && (
        <div className={`${GRID} px-4 py-2.5 bg-feisen-fondo border-y border-feisen-borde-suave text-sm font-semibold`}>
          <span className="text-feisen-texto-2">{b.total}</span>
          <span className="sm:hidden text-gray-300">—</span>
          {[0, 1, 2].map(i => <span key={i} className="hidden sm:block text-right text-gray-300">—</span>)}
        </div>
      )}
    </div>
  ))

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24 lg:pb-8">
      <EncabezadoPagina modulo="Finanzas" titulo="EEFF"
        subtitulo="Estado de resultados de Feisen y FC juntos, armado paso a paso con tu método.">
        <button type="button" onClick={() => { recargar(); cargarErp() }} disabled={cargando}
          className="flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-60">
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
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
          En construcción: listos los ingresos · faltan {totalPendiente} renglones de costos y gastos
        </span>
      </div>

      {cargando && !ing ? <Cargando /> : error ? <ErrorOdoo mensaje={error} onReintentar={recargar} /> : ing && (
        <div className={`bg-white border border-feisen-borde rounded-xl overflow-hidden ${cargando ? 'opacity-60' : ''}`}>
          <div className="px-4 py-3 border-b border-feisen-borde-suave">
            <span className="text-sm font-semibold text-feisen-texto">P&amp;G {tituloVista} · {Titulo}</span>
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
      )}

      <p className="text-xs text-feisen-texto-2 leading-relaxed">
        Ventas = cuenta 412000 de cada Odoo por centro; las demás cuentas de ingreso (no operacionales) van dentro de Construequipos.
        Devoluciones = descuentos comerciales (530508) y devoluciones en ventas; hoy todas son de Construequipos. Las notas crédito ya vienen restadas en las ventas.
        Toca un renglón para ver de qué cuentas sale.
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
    <div className="hidden sm:grid grid-cols-[1fr_repeat(3,8rem)] gap-3 px-4 py-2 border-b border-feisen-borde-suave text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">
      <span>Concepto</span><span className="text-right">Feisen</span><span className="text-right">FC</span><span className="text-right">Total</span>
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
    </div>
  )
}

// Renglón que solo tiene valor en la columna Total (transferencias internas). `children` reemplaza la cifra (casilla a mano).
function SoloTotal({ nombre, nota, valor, sangria, total, children }) {
  return (
    <div className={`${GRID} px-4 text-sm items-center ${total ? 'py-2.5 bg-feisen-fondo border-y border-feisen-borde-suave font-semibold' : 'py-2 border-t border-feisen-borde-suave'}`}>
      <span className={`min-w-0 ${sangria ? 'pl-3' : ''}`}>
        <span className="block text-feisen-texto">{nombre}</span>
        {nota && <span className="block text-xs font-normal text-feisen-texto-2">{nota}</span>}
      </span>
      <span className="hidden sm:block" /><span className="hidden sm:block" />
      {children || <span className="text-right tabular-nums text-feisen-texto">{valor != null ? pesos(valor) : '—'}</span>}
    </div>
  )
}

// Casilla de pesos que guarda al salir del campo o con Enter
function CasillaPesos({ valor, onGuardar }) {
  const [texto, setTexto] = useState(valor != null ? Math.round(valor).toLocaleString('es-CO') : '')
  const guardar = () => {
    const limpio = texto.replace(/[^\d-]/g, '')
    if (limpio === String(Math.round(valor ?? NaN))) return
    if (limpio === '' && valor == null) return
    onGuardar(limpio)
  }
  return (
    <input inputMode="numeric" value={texto} placeholder="$ escribe el valor"
      onChange={e => setTexto(e.target.value)} onBlur={guardar} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      onFocus={e => e.target.select()}
      className="w-full sm:w-32 justify-self-end text-right tabular-nums min-h-[36px] border border-feisen-borde rounded-lg px-2 bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul-suave" />
  )
}
