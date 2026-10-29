import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { EncabezadoPagina, Segmentado } from '../shared/ui'
import {
  BarChart2, Users, Package, Flame, AlertTriangle,
  RefreshCw, Scale, ChevronRight,
} from '../shared/iconos'

const HIERRO_COLADO_ITEM_ID = '52546e1a-dd2b-46c6-8857-9895497f228a'
const VACEADERO_ITEM_ID     = 'afc4f062-48c1-47cc-92c2-c9e4536bfff5'

function numOrden(n) { return `ORD-MOL-${String(n).padStart(4, '0')}` }

function fechaHace(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

function fmtKg(n) {
  const v = Number(n)
  if (isNaN(v)) return '0 kg'
  return `${v.toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg`
}

function fmtPct(n) {
  return `${Number(n).toFixed(1)}%`
}

// Un color = un significado: rojo problema, ámbar atención, lo normal en neutro.
function colorConf(pct) {
  if (pct >= 85) return 'text-feisen-texto'
  if (pct >= 70) return 'text-amber-700'
  return 'text-feisen-rojo'
}

function colorMerma(pct) {
  if (pct < 10) return 'text-feisen-texto'
  if (pct < 20) return 'text-amber-700'
  return 'text-feisen-rojo'
}

function barraMerma(pct) {
  if (pct > 20) return 'bg-feisen-rojo'
  if (pct > 10) return 'bg-amber-500'
  return 'bg-feisen-gris-medio'
}

function MiniBar({ value, max, color = 'bg-feisen-azul' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full bg-feisen-borde-suave rounded h-2 overflow-hidden">
      <div className={`h-2 rounded transition-all motion-reduce:transition-none ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function Indicador({ etiqueta, valor, contexto, tono, onClick }) {
  const color = tono === 'rojo' ? 'text-feisen-rojo' : tono === 'ambar' ? 'text-amber-700' : 'text-feisen-texto'
  const cuerpo = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 leading-tight flex items-center gap-1">
        {tono && <AlertTriangle size={12} className={color} />}{etiqueta}
      </p>
      <p className={`text-2xl font-semibold tabular-nums mt-1 ${color}`}>{valor}</p>
      <p className="text-xs text-feisen-texto-2 mt-0.5">{contexto}</p>
    </>
  )
  const borde = tono === 'rojo' ? 'border-feisen-rojo/40' : tono === 'ambar' ? 'border-amber-300' : 'border-feisen-borde'
  const base = `bg-white border ${borde} rounded-xl p-3.5 sm:p-4 text-left min-w-0`
  if (!onClick) return <div className={base}>{cuerpo}</div>
  return <button type="button" onClick={onClick} className={`${base} hover:bg-feisen-fondo transition-colors`}>{cuerpo}</button>
}

function Seccion({ icono: Icono, titulo, nota, refSec, children }) {
  return (
    <section ref={refSec} className="bg-white border border-feisen-borde rounded-xl scroll-mt-4">
      <div className="px-4 pt-3.5 pb-3 border-b border-feisen-borde-suave">
        <h2 className="text-sm font-semibold text-feisen-texto flex items-center gap-2">
          <Icono size={18} weight="duotone" className="text-feisen-texto-2" /> {titulo}
        </h2>
        {nota && <p className="text-xs text-feisen-texto-2 mt-0.5">{nota}</p>}
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  )
}

const PERIODOS = [
  { label: '7 días',  dias: 7 },
  { label: '30 días', dias: 30 },
  { label: '90 días', dias: 90 },
  { label: 'Todo',    dias: null },
]
const OPCIONES_PERIODO = PERIODOS.map(p => ({ valor: p.dias, texto: p.label }))

export default function AnaliticaFundicion() {
  const [periodo,      setPeriodo]      = useState(30)
  const [cargando,     setCargando]     = useState(true)
  const [ordenes,      setOrdenes]      = useState([])
  const [fundidas,     setFundidas]     = useState([])
  const [movsHierro,   setMovsHierro]   = useState([])
  const [movsVaceadero,setMovsVaceadero]= useState([])

  useEffect(() => { cargar() }, [periodo])

  async function cargar() {
    setCargando(true)
    const desde = periodo ? fechaHace(periodo) : null

    // Un .limit() más alto desde el cliente NO puede superar el tope de filas
    // por request que impone el servidor de Supabase/PostgREST (por defecto
    // 1000) — con "Todo el tiempo" (desde = null) esto se recortaba en
    // silencio. Se pagina con fetchAllPages() (ver OBSERVACIONES.md).
    const qOrd = (desde_, hasta_) => {
      let q = supabase
        .from('ordenes_moldeo')
        .select(`
          id, numero, fecha, estado, created_at,
          ordenes_moldeo_piezas(
            id, item_id, asignado_a, cantidad_planeada,
            cantidad_conforme, cantidad_nc,
            items(id, nombre, peso_unitario)
          )
        `)
        .in('estado', ['completado', 'completada'])
        .order('fecha', { ascending: false })
        .range(desde_, hasta_)
      if (desde) q = q.gte('fecha', desde)
      return q
    }

    const qFun = (desde_, hasta_) => {
      let q = supabase
        .from('fundidas')
        .select('id, numero, fecha, hierro_colado, carbon, caliza, ferromolido, exlac, temperatura')
        .order('fecha', { ascending: false })
        .range(desde_, hasta_)
      if (desde) q = q.gte('fecha', desde)
      return q
    }

    const qMov = (desde_, hasta_) => {
      let q = supabase
        .from('movimientos')
        .select('referencia, item_id, tipo, cantidad, fecha_movimiento')
        .in('item_id', [HIERRO_COLADO_ITEM_ID, VACEADERO_ITEM_ID])
        .eq('revertido', false)
        .range(desde_, hasta_)
      if (desde) q = q.gte('fecha_movimiento', desde)
      return q
    }

    const [{ data: ords }, { data: funs }, { data: movs }] = await Promise.all([
      fetchAllPages(qOrd), fetchAllPages(qFun), fetchAllPages(qMov),
    ])

    const movsList = movs || []
    setOrdenes(ords || [])
    setFundidas(funs || [])
    setMovsHierro(movsList.filter(m => m.item_id === HIERRO_COLADO_ITEM_ID && m.tipo === 'salida'))
    setMovsVaceadero(movsList.filter(m => m.item_id === VACEADERO_ITEM_ID && m.tipo === 'entrada'))
    setCargando(false)
  }

  const stats = useMemo(() => {
    // ── KPIs globales ──
    let totalPlaneadas = 0, totalConformes = 0, totalNC = 0
    let totalKgConformes = 0

    ordenes.forEach(o => {
      o.ordenes_moldeo_piezas?.forEach(p => {
        const peso = Number(p.items?.peso_unitario || 0)
        totalPlaneadas   += Number(p.cantidad_planeada  || 0)
        totalConformes   += Number(p.cantidad_conforme  || 0)
        totalNC          += Number(p.cantidad_nc        || 0)
        totalKgConformes += Number(p.cantidad_conforme  || 0) * peso
      })
    })
    const pctConformidad = totalPlaneadas > 0 ? (totalConformes / totalPlaneadas) * 100 : 0

    // ── Merma por orden ──
    const hierroMap = {}
    movsHierro.forEach(m => {
      const ref = (m.referencia || '').split('·')[0].trim()
      hierroMap[ref] = (hierroMap[ref] || 0) + Number(m.cantidad)
    })
    const vaceaderoMap = {}
    movsVaceadero.forEach(m => {
      const ref = (m.referencia || '').trim()
      vaceaderoMap[ref] = (vaceaderoMap[ref] || 0) + Number(m.cantidad)
    })

    let totalHierro = 0, totalVaceadero = 0, totalMerma = 0

    const mermasPorOrden = ordenes.map(o => {
      const ref      = numOrden(o.numero)
      const kgHierro = hierroMap[ref] || 0
      const kgVac    = vaceaderoMap[ref] || 0
      const kgPiezas = o.ordenes_moldeo_piezas?.reduce((s, p) =>
        s + Number(p.cantidad_conforme || 0) * Number(p.items?.peso_unitario || 0), 0) || 0
      const kgMerma  = Math.max(0, kgHierro - kgPiezas - kgVac)
      const pctMerma = kgHierro > 0 ? (kgMerma / kgHierro) * 100 : 0
      totalHierro    += kgHierro
      totalVaceadero += kgVac
      totalMerma     += kgMerma
      return { ref, fecha: o.fecha, kgHierro, kgPiezas, kgVaceadero: kgVac, kgMerma, pctMerma }
    }).filter(m => m.kgHierro > 0).sort((a, b) => b.pctMerma - a.pctMerma)

    const pctMermaPromedio = totalHierro > 0 ? (totalMerma / totalHierro) * 100 : 0

    // ── Producción por moldeador ──
    const moldeadorMap = {}
    ordenes.forEach(o => {
      o.ordenes_moldeo_piezas?.forEach(p => {
        const nombre = (p.asignado_a || 'Sin asignar').trim()
        const peso   = Number(p.items?.peso_unitario || 0)
        if (!moldeadorMap[nombre]) moldeadorMap[nombre] = { nombre, kgConformes: 0, conformes: 0, nc: 0, planeadas: 0, ordenesSet: new Set() }
        moldeadorMap[nombre].kgConformes += Number(p.cantidad_conforme || 0) * peso
        moldeadorMap[nombre].conformes   += Number(p.cantidad_conforme || 0)
        moldeadorMap[nombre].nc          += Number(p.cantidad_nc       || 0)
        moldeadorMap[nombre].planeadas   += Number(p.cantidad_planeada || 0)
        moldeadorMap[nombre].ordenesSet.add(o.id)
      })
    })
    const moldeadores = Object.values(moldeadorMap)
      .map(m => ({
        ...m,
        ordenes: m.ordenesSet.size,
        pctNC: (m.conformes + m.nc) > 0 ? (m.nc / (m.conformes + m.nc)) * 100 : 0,
      }))
      .sort((a, b) => b.kgConformes - a.kgConformes)

    // ── Top piezas ──
    const piezaMap = {}
    ordenes.forEach(o => {
      o.ordenes_moldeo_piezas?.forEach(p => {
        const nombre = p.items?.nombre || 'Desconocida'
        const peso   = Number(p.items?.peso_unitario || 0)
        if (!piezaMap[nombre]) piezaMap[nombre] = { nombre, kgConformes: 0, conformes: 0, nc: 0, planeadas: 0 }
        piezaMap[nombre].kgConformes += Number(p.cantidad_conforme || 0) * peso
        piezaMap[nombre].conformes   += Number(p.cantidad_conforme || 0)
        piezaMap[nombre].nc          += Number(p.cantidad_nc       || 0)
        piezaMap[nombre].planeadas   += Number(p.cantidad_planeada || 0)
      })
    })
    const topPiezas = Object.values(piezaMap)
      .map(p => ({ ...p, pctConformidad: p.planeadas > 0 ? (p.conformes / p.planeadas) * 100 : 0 }))
      .sort((a, b) => b.kgConformes - a.kgConformes)
      .slice(0, 10)

    // ── Consumo de materiales ──
    let sumCarbon = 0, sumCaliza = 0, sumFerro = 0, sumExlac = 0, sumHierroFun = 0
    fundidas.forEach(f => {
      sumCarbon    += Number(f.carbon      || 0)
      sumCaliza    += Number(f.caliza      || 0)
      sumFerro     += Number(f.ferromolido || 0)
      sumExlac     += Number(f.exlac       || 0)
      sumHierroFun += Number(f.hierro_colado || 0)
    })
    const kgRef = sumHierroFun || 1
    const consumos = [
      { label: 'Carbón',      kg: sumCarbon, ratio: sumCarbon / kgRef, color: 'bg-gray-600' },
      { label: 'Caliza',      kg: sumCaliza, ratio: sumCaliza / kgRef, color: 'bg-amber-500' },
      { label: 'Ferromolido', kg: sumFerro,  ratio: sumFerro  / kgRef, color: 'bg-orange-500' },
      { label: 'Exlac',       kg: sumExlac,  ratio: sumExlac  / kgRef, color: 'bg-blue-500'  },
    ]
    const maxRatio = Math.max(...consumos.map(c => c.ratio), 0.001)

    return {
      totalOrdenes: ordenes.length,
      totalFundidas: fundidas.length,
      totalConformes,
      totalNC,
      totalPlaneadas,
      totalKgConformes,
      pctConformidad,
      pctMermaPromedio,
      totalHierro,
      totalVaceadero,
      totalMerma,
      mermasPorOrden,
      moldeadores,
      topPiezas,
      consumos,
      maxRatio,
    }
  }, [ordenes, fundidas, movsHierro, movsVaceadero])

  // Solo visual: las tarjetas de excepción llevan a su sección
  const refMerma  = useRef(null)
  const refPiezas = useRef(null)
  const irA = ref => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const etiquetaPeriodo = periodo ? `los últimos ${periodo} días` : 'todo el historial'
  const tonoMerma = stats.mermasPorOrden.length === 0 ? undefined
    : stats.pctMermaPromedio >= 20 ? 'rojo' : stats.pctMermaPromedio >= 10 ? 'ambar' : undefined
  const tonoConf = stats.totalPlaneadas === 0 ? undefined
    : stats.pctConformidad < 70 ? 'rojo' : stats.pctConformidad < 85 ? 'ambar' : undefined
  const ordenesAltas = stats.mermasPorOrden.filter(m => m.pctMerma > 20).length

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-5 pb-20">

      <EncabezadoPagina modulo="Fundición" titulo="Analítica de fundición"
        subtitulo="Merma, producción por moldeador, piezas y materiales de las órdenes de moldeo completadas">
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          aria-label="Actualizar datos"
          className="inline-flex items-center gap-2 border border-feisen-borde bg-white rounded-lg px-3 min-h-[44px] text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-60 transition-colors"
        >
          <RefreshCw size={17} className={`text-feisen-texto-2 ${cargando ? 'animate-spin motion-reduce:animate-none' : ''}`} />
          <span className="hidden sm:inline">{cargando ? 'Actualizando…' : 'Actualizar'}</span>
        </button>
      </EncabezadoPagina>

      {/* Filtro período */}
      <div className="max-w-md">
        <Segmentado opciones={OPCIONES_PERIODO} valor={periodo} onCambiar={setPeriodo} />
      </div>

      {cargando ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-[104px] rounded-xl bg-feisen-borde-suave animate-pulse" />)}
          </div>
          {[0, 1].map(i => <div key={i} className="h-48 rounded-xl bg-feisen-borde-suave animate-pulse" />)}
          <p className="sr-only">Calculando analítica…</p>
        </div>
      ) : stats.totalOrdenes === 0 ? (
        <div className="bg-white border border-dashed border-feisen-borde rounded-xl px-6 py-14 text-center">
          <BarChart2 size={32} className="mx-auto text-gray-300" />
          <p className="mt-3 font-semibold text-feisen-texto">No hay órdenes de moldeo completadas en {etiquetaPeriodo}</p>
          <p className="mt-1 text-sm text-feisen-texto-2 max-w-md mx-auto">
            La analítica se calcula solo con órdenes de moldeo completadas.
            {periodo ? ' Prueba con un período más largo, o completa' : ' Completa'} las órdenes en curso para ver aquí la merma, los kilos y la conformidad.
          </p>
          {periodo !== null && (
            <button type="button" onClick={() => setPeriodo(null)}
              className="mt-4 border border-feisen-borde rounded-lg px-4 min-h-[44px] text-sm font-medium text-feisen-azul hover:bg-feisen-azul-suave">
              Ver todo el historial
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Indicadores: excepciones primero ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Indicador
              etiqueta="Merma promedio"
              valor={stats.mermasPorOrden.length > 0 ? fmtPct(stats.pctMermaPromedio) : '—'}
              tono={tonoMerma}
              contexto={stats.mermasPorOrden.length > 0
                ? (ordenesAltas > 0 ? `${ordenesAltas} ${ordenesAltas === 1 ? 'orden' : 'órdenes'} sobre 20%` : 'del hierro colado')
                : 'sin salidas de hierro registradas'}
              onClick={stats.mermasPorOrden.length > 0 ? () => irA(refMerma) : undefined}
            />
            <Indicador
              etiqueta="Conformidad"
              valor={fmtPct(stats.pctConformidad)}
              tono={tonoConf}
              contexto={`${stats.totalConformes.toLocaleString('es-CO')} buenas · ${stats.totalNC.toLocaleString('es-CO')} NC`}
              onClick={stats.topPiezas.length > 0 ? () => irA(refPiezas) : undefined}
            />
            <Indicador
              etiqueta="Kg producidos"
              valor={fmtKg(stats.totalKgConformes)}
              contexto="en piezas conformes"
            />
            <Indicador
              etiqueta="Órdenes completadas"
              valor={stats.totalOrdenes.toLocaleString('es-CO')}
              contexto={`${stats.totalFundidas.toLocaleString('es-CO')} fundidas`}
            />
          </div>

          {/* ── Merma por orden (top peores) ── */}
          {stats.mermasPorOrden.length > 0 && (
            <Seccion refSec={refMerma} icono={AlertTriangle}
              titulo={`Merma por orden · ${Math.min(8, stats.mermasPorOrden.length)} más altas`}
              nota="Merma = hierro colado − kg de piezas buenas − vaceadero recuperado. Sobre 20% en rojo, sobre 10% en ámbar.">
              <div className="space-y-2.5">
                {stats.mermasPorOrden.slice(0, 8).map(m => (
                  <div key={m.ref} className="grid grid-cols-[88px,1fr,52px] sm:grid-cols-[112px,1fr,56px,76px] gap-2 sm:gap-3 items-center">
                    <span className="text-xs font-mono text-feisen-texto-2 truncate">{m.ref.replace('ORD-MOL-', 'MOL-')}</span>
                    <MiniBar value={m.pctMerma} max={40} color={barraMerma(m.pctMerma)} />
                    <span className={`text-sm font-semibold text-right tabular-nums ${colorMerma(m.pctMerma)}`}>
                      {fmtPct(m.pctMerma)}
                    </span>
                    <span className="hidden sm:block text-xs text-feisen-texto-2 text-right tabular-nums">
                      {fmtKg(m.kgMerma)}
                    </span>
                  </div>
                ))}
              </div>
              {stats.mermasPorOrden.length > 8 && (
                <p className="text-xs text-gray-400 pt-3 mt-3 border-t border-feisen-borde-suave">
                  + {(stats.mermasPorOrden.length - 8).toLocaleString('es-CO')} órdenes más con merma menor
                </p>
              )}
            </Seccion>
          )}

          {/* ── Balance de hierro ── */}
          {stats.totalHierro > 0 && (
            <Seccion icono={Scale} titulo="Balance de hierro" nota={`A dónde fue el hierro colado en ${etiquetaPeriodo}`}>
              <div className="space-y-2.5">
                {[
                  { label: 'Hierro colado total',  kg: stats.totalHierro,      color: 'bg-feisen-gris-oscuro' },
                  { label: 'Piezas buenas',        kg: stats.totalKgConformes,  color: 'bg-feisen-azul' },
                  { label: 'Vaceadero recuperado', kg: stats.totalVaceadero,    color: 'bg-feisen-gris-medio' },
                  { label: 'Merma neta',           kg: stats.totalMerma,        color: tonoMerma === 'rojo' ? 'bg-feisen-rojo' : tonoMerma === 'ambar' ? 'bg-amber-500' : 'bg-feisen-gris-medio' },
                ].map(row => (
                  <div key={row.label} className="grid grid-cols-[1fr,auto] sm:grid-cols-[160px,1fr,96px] gap-x-3 gap-y-1 items-center">
                    <span className="text-sm text-feisen-texto-2">{row.label}</span>
                    <span className="text-sm font-semibold text-feisen-texto text-right tabular-nums sm:order-last">
                      {fmtKg(row.kg)}
                    </span>
                    <div className="col-span-2 sm:col-span-1">
                      <MiniBar value={row.kg} max={stats.totalHierro} color={row.color} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-feisen-texto-2 pt-3 mt-3 border-t border-feisen-borde-suave">
                Se recuperó como vaceadero el <span className="font-semibold text-feisen-texto tabular-nums">
                  {stats.totalHierro > 0 ? fmtPct((stats.totalVaceadero / stats.totalHierro) * 100) : '—'}
                </span> del hierro colado.
              </p>
            </Seccion>
          )}

          {/* ── Producción por moldeador ── */}
          {stats.moldeadores.length > 0 && (
            <Seccion icono={Users} titulo="Producción por moldeador" nota="Kg de piezas buenas; en rojo las no conformes (NC)">
              <ul className="divide-y divide-feisen-borde-suave -my-1">
                {stats.moldeadores.map(m => {
                  const maxKg = stats.moldeadores[0]?.kgConformes || 1
                  return (
                    <li key={m.nombre} className="py-2.5">
                      <div className="flex items-baseline justify-between gap-3 mb-1.5">
                        <span className="text-sm font-medium text-feisen-texto truncate">{m.nombre}</span>
                        <span className="text-sm font-semibold text-feisen-texto tabular-nums shrink-0">{fmtKg(m.kgConformes)}</span>
                      </div>
                      <MiniBar value={m.kgConformes} max={maxKg} color="bg-feisen-azul" />
                      <div className="flex gap-x-3 gap-y-0.5 mt-1.5 flex-wrap text-xs tabular-nums">
                        <span className="text-feisen-texto-2">{m.conformes.toLocaleString('es-CO')} conformes</span>
                        {m.nc > 0 && (
                          <span className="text-feisen-rojo font-medium">
                            {m.nc.toLocaleString('es-CO')} NC · {fmtPct(m.pctNC)}
                          </span>
                        )}
                        <span className="text-gray-400">{m.ordenes.toLocaleString('es-CO')} {m.ordenes === 1 ? 'orden' : 'órdenes'}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Seccion>
          )}

          {/* ── Top piezas producidas ── */}
          {stats.topPiezas.length > 0 && (
            <Seccion refSec={refPiezas} icono={Package} titulo="Piezas más producidas"
              nota="Las 10 con más kg buenos. Conformidad bajo 85% en ámbar, bajo 70% en rojo.">
              <ul className="divide-y divide-feisen-borde-suave -my-1">
                {stats.topPiezas.map(p => {
                  const maxKg = stats.topPiezas[0]?.kgConformes || 1
                  return (
                    <li key={p.nombre} className="py-2.5">
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <span className="text-sm font-medium text-feisen-texto leading-snug flex-1 min-w-0 break-words">{p.nombre}</span>
                        <span className="text-sm font-semibold text-feisen-texto tabular-nums shrink-0">{fmtKg(p.kgConformes)}</span>
                      </div>
                      <MiniBar value={p.kgConformes} max={maxKg} color="bg-feisen-azul" />
                      <div className="flex gap-x-3 gap-y-0.5 mt-1.5 flex-wrap text-xs tabular-nums">
                        <span className={`font-medium ${colorConf(p.pctConformidad) === 'text-feisen-texto' ? 'text-feisen-texto-2' : colorConf(p.pctConformidad)}`}>
                          {fmtPct(p.pctConformidad)} conformidad
                        </span>
                        <span className="text-feisen-texto-2">{p.conformes.toLocaleString('es-CO')} uds</span>
                        {p.nc > 0 && <span className="text-feisen-rojo font-medium">{p.nc.toLocaleString('es-CO')} NC</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Seccion>
          )}

          {/* ── Consumo de materiales ── */}
          {stats.consumos.some(c => c.kg > 0) && (
            <Seccion icono={Flame} titulo="Consumo de materiales" nota="Kg de cada material por kg de hierro colado en las fundidas del período">
              <div className="space-y-2.5">
                {stats.consumos.map(c => (
                  <div key={c.label} className="grid grid-cols-[96px,1fr,auto] sm:grid-cols-[120px,1fr,96px,96px] gap-x-3 items-center">
                    <span className="text-sm text-feisen-texto-2">{c.label}</span>
                    <MiniBar value={c.ratio} max={stats.maxRatio} color="bg-feisen-azul" />
                    <span className="text-sm font-semibold text-feisen-texto text-right tabular-nums">
                      {c.ratio.toFixed(3)} <span className="font-normal text-gray-400 text-xs">kg/kg</span>
                    </span>
                    <span className="hidden sm:block text-xs text-feisen-texto-2 text-right tabular-nums">{fmtKg(c.kg)}</span>
                  </div>
                ))}
              </div>
              <div className="sm:hidden pt-3 mt-3 border-t border-feisen-borde-suave grid grid-cols-2 gap-x-3 gap-y-1">
                {stats.consumos.map(c => (
                  <p key={c.label} className="text-xs text-feisen-texto-2 tabular-nums">
                    <span className="font-semibold text-feisen-texto">{fmtKg(c.kg)}</span> {c.label.toLowerCase()}
                  </p>
                ))}
              </div>
            </Seccion>
          )}
        </>
      )}
    </div>
  )
}
