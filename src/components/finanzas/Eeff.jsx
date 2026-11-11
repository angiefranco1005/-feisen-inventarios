import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { EncabezadoPagina, useAviso } from '../shared/ui'
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

// Renglones de ventas: centro de Odoo → renglón
const VENTAS = [
  { id: 'construequipos', nombre: 'Construequipos', centros: ['CONSTRUEQUIPOS', 'Sin centro'] },
  { id: 'no_operacionales', nombre: 'Ventas no operacionales (Construequipos)', noOperacional: true },
  { id: 'repuestos', nombre: 'Repuestos (Construequipos)', centros: ['REPUESTOS'] },
  { id: 'mantenimientos', nombre: 'Mantenimientos (Construequipos)', centros: ['MANTENIMIENTOS'] },
  { id: 'hierro', nombre: 'Fundición Hierro', centros: ['HIERRO'] },
  { id: 'aluminio', nombre: 'Aluminio', centros: ['ALUMINIO'] },
]

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
  const totalPendiente = PENDIENTE.reduce((s, b) => s + b.filas.length, 0)

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
        <span className="text-xs bg-amber-50 text-amber-700 rounded-md px-2 py-0.5 font-medium">
          En construcción: listos los ingresos · faltan {totalPendiente} renglones de costos y gastos
        </span>
      </div>

      {cargando && !ing ? <Cargando /> : error ? <ErrorOdoo mensaje={error} onReintentar={recargar} /> : ing && (
        <div className={`bg-white border border-feisen-borde rounded-xl overflow-hidden ${cargando ? 'opacity-60' : ''}`}>
          <div className="px-4 py-3 border-b border-feisen-borde-suave">
            <span className="text-sm font-semibold text-feisen-texto">P&amp;G · {Titulo}</span>
          </div>
          <Encabezado />

          <Seccion titulo="Ingresos" />
          {VENTAS.map(v => (
            <Fila key={v.id} nombre={v.nombre} feisen={val('feisen', v.id)} fc={val('fc', v.id)}
              abierto={abierto === v.id} onClick={() => setAbierto(abierto === v.id ? null : v.id)}
              detalle={[...ing.feisen[v.id].detalle.map(d => ({ ...d, emp: 'Feisen' })), ...ing.fc[v.id].detalle.map(d => ({ ...d, emp: 'FC' }))]} />
          ))}
          <Total nombre="Total ventas" feisen={totalVentas('feisen')} fc={totalVentas('fc')} />
          <Fila nombre="(−) Devoluciones y descuentos comerciales" feisen={val('feisen', 'devoluciones')} fc={val('fc', 'devoluciones')}
            abierto={abierto === 'dev'} onClick={() => setAbierto(abierto === 'dev' ? null : 'dev')}
            detalle={[...ing.feisen.devoluciones.detalle.map(d => ({ ...d, emp: 'Feisen' })), ...ing.fc.devoluciones.detalle.map(d => ({ ...d, emp: 'FC' }))]} />
          <Total nombre="Ingresos netos" feisen={neto('feisen')} fc={neto('fc')} fuerte />

          <Seccion titulo="Transferencias internas a Construequipos" nota="ingreso de Hierro y Aluminio; en el consolidado se anulan con la materia prima de Construequipos" />
          <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)] gap-3 px-4 py-2 text-sm items-center">
            <span className="pl-3 min-w-0">
              <span className="block text-feisen-texto">Fundición Hierro <span className="text-xs text-feisen-texto-2">· del ERP</span></span>
              <span className="block text-xs text-feisen-texto-2">
                {erp.cargando ? 'Leyendo salidas de Fundición…' : erp.error ? `Error: ${erp.error}`
                  : `${Math.round(erp.hierro.piezas).toLocaleString('es-CO')} piezas · ${Math.round(erp.hierro.kg).toLocaleString('es-CO')} kg × $${PRECIO_KG_HIERRO.toLocaleString('es-CO')}${erp.hierro.sinPeso ? ` · ${erp.hierro.sinPeso} sin peso` : ''}`}
              </span>
            </span>
            <span className="hidden sm:block" /><span className="hidden sm:block" />
            <span className="text-right tabular-nums text-feisen-texto">{erp.hierro ? pesos(erp.hierro.valor) : '—'}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)] gap-3 px-4 py-2 text-sm items-center border-t border-feisen-borde-suave">
            <span className="pl-3 min-w-0">
              <span className="block text-feisen-texto">Aluminio <span className="text-xs text-feisen-texto-2">· a mano</span></span>
              <span className="block text-xs text-feisen-texto-2">Total del mes de tu Excel de control (Aluminio aún no está en el ERP)</span>
            </span>
            <span className="hidden sm:block" /><span className="hidden sm:block" />
            <CasillaPesos key={`${mes}-${transfAluminio}`} valor={transfAluminio} onGuardar={t => guardarManual('transferencia_aluminio', t)} />
          </div>
          <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)] gap-3 px-4 py-2.5 bg-feisen-fondo border-y border-feisen-borde-suave text-sm font-semibold">
            <span className="text-feisen-texto">Total transferencias internas</span>
            <span className="hidden sm:block" /><span className="hidden sm:block" />
            <span className="text-right tabular-nums text-feisen-texto">{pesos((erp.hierro?.valor || 0) + (transfAluminio || 0))}</span>
          </div>

          {PENDIENTE.map(b => (
            <div key={b.seccion}>
              <Seccion titulo={b.seccion} />
              <div className="divide-y divide-feisen-borde-suave">
                {b.filas.map(f => (
                  <div key={f} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)] gap-3 px-4 py-2 text-sm items-center">
                    <span className="text-feisen-texto-2 pl-3">{f}</span>
                    <span className="sm:hidden text-xs text-gray-400">por definir</span>
                    {[0, 1, 2].map(i => <span key={i} className="hidden sm:block text-right text-gray-300">—</span>)}
                  </div>
                ))}
              </div>
              {b.total && (
                <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)] gap-3 px-4 py-2.5 bg-feisen-fondo border-y border-feisen-borde-suave text-sm font-semibold">
                  <span className="text-feisen-texto-2">{b.total}</span>
                  <span className="sm:hidden text-gray-300">—</span>
                  {[0, 1, 2].map(i => <span key={i} className="hidden sm:block text-right text-gray-300">—</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-feisen-texto-2 leading-relaxed">
        Ventas = cuenta 412000 de cada Odoo por centro; las demás cuentas de ingreso (no operacionales) van dentro de Construequipos.
        Devoluciones = descuentos comerciales (530508) y devoluciones en ventas. Las notas crédito ya vienen restadas en las ventas.
        Toca un renglón para ver de qué cuentas sale.
      </p>
      {aviso}
    </div>
  )
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

function Fila({ nombre, feisen, fc, detalle, abierto, onClick }) {
  const Icono = abierto ? ChevronDown : ChevronRight
  return (
    <div className="border-t border-feisen-borde-suave">
      <button type="button" onClick={onClick}
        className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)] gap-3 px-4 py-2 text-sm items-center text-left hover:bg-feisen-fondo">
        <span className="flex items-center gap-1 text-feisen-texto min-w-0">
          <Icono size={14} className="text-gray-400 shrink-0" /><span className="truncate">{nombre}</span>
        </span>
        <span className="hidden sm:contents"><Cifra v={feisen} /><Cifra v={fc} /></span>
        <Cifra v={feisen + fc} fuerte />
      </button>
      {abierto && (
        <div className="px-4 pb-2 pl-8 space-y-1">
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
    <div className={`grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)] gap-3 px-4 py-2.5 bg-feisen-fondo border-y border-feisen-borde-suave text-sm ${fuerte ? 'font-semibold' : 'font-medium'}`}>
      <span className="text-feisen-texto">{nombre}</span>
      <span className="hidden sm:contents"><Cifra v={feisen} fuerte={fuerte} /><Cifra v={fc} fuerte={fuerte} /></span>
      <Cifra v={feisen + fc} fuerte />
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
