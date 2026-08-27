import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  BarChart2, Users, Package, Flame, AlertTriangle,
  RefreshCw, TrendingDown, Scale, Recycle,
} from 'lucide-react'

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

function colorConf(pct) {
  if (pct >= 85) return 'text-green-600'
  if (pct >= 70) return 'text-yellow-600'
  return 'text-feisen-rojo'
}

function colorMerma(pct) {
  if (pct < 10) return 'text-green-600'
  if (pct < 20) return 'text-yellow-600'
  return 'text-feisen-rojo'
}

function MiniBar({ value, max, color = 'bg-feisen-azul' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

const PERIODOS = [
  { label: '7 días',  dias: 7 },
  { label: '30 días', dias: 30 },
  { label: '90 días', dias: 90 },
  { label: 'Todo',    dias: null },
]

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

    let qOrd = supabase
      .from('ordenes_moldeo')
      .select(`
        id, numero, fecha, estado, created_at,
        ordenes_moldeo_piezas(
          id, item_id, asignado_a, cantidad_planeada,
          cantidad_conforme, cantidad_nc,
          items(id, nombre, peso_unitario)
        )
      `)
      .eq('estado', 'completada')
      .order('fecha', { ascending: false })
      .range(0, 999)
    if (desde) qOrd = qOrd.gte('fecha', desde)

    let qFun = supabase
      .from('fundidas')
      .select('id, numero, fecha, hierro_colado, carbon, caliza, ferromolido, exlac, temperatura')
      .order('fecha', { ascending: false })
      .range(0, 499)
    if (desde) qFun = qFun.gte('fecha', desde)

    let qMov = supabase
      .from('movimientos')
      .select('referencia, item_id, tipo, cantidad, fecha_movimiento')
      .in('item_id', [HIERRO_COLADO_ITEM_ID, VACEADERO_ITEM_ID])
      .eq('revertido', false)
      .range(0, 999)
    if (desde) qMov = qMov.gte('fecha_movimiento', desde)

    const [{ data: ords }, { data: funs }, { data: movs }] = await Promise.all([qOrd, qFun, qMov])

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

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-5 pb-20">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="text-feisen-azul" size={22} />
            Analítica Fundición
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Métricas de producción · órdenes completadas</p>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition"
        >
          <RefreshCw size={16} className={`text-gray-500 ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filtro período */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {PERIODOS.map(p => (
          <button
            key={String(p.dias)}
            onClick={() => setPeriodo(p.dias)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
              periodo === p.dias
                ? 'bg-feisen-azul text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="text-center py-20 text-gray-400">
          <RefreshCw size={28} className="animate-spin mx-auto mb-3" />
          <p className="text-sm">Calculando analítica…</p>
        </div>
      ) : stats.totalOrdenes === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <BarChart2 size={36} className="mx-auto mb-3 opacity-25" />
          <p className="text-sm font-bold">Sin datos para este período</p>
          <p className="text-xs mt-1">Completa algunas órdenes de moldeo primero</p>
        </div>
      ) : (
        <>
          {/* ── KPI cards 2×2 ── */}
          <div className="grid grid-cols-2 gap-3">

            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-xs text-gray-500">Órdenes completadas</p>
              <p className="text-2xl font-bold text-feisen-azul mt-1">{stats.totalOrdenes}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stats.totalFundidas} fundidas</p>
            </div>

            <div className="bg-green-50 rounded-2xl p-4">
              <p className="text-xs text-gray-500">% Conformidad</p>
              <p className={`text-2xl font-bold mt-1 ${colorConf(stats.pctConformidad)}`}>
                {fmtPct(stats.pctConformidad)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {stats.totalConformes.toLocaleString('es-CO')} buenas / {stats.totalNC} NC
              </p>
            </div>

            <div className="bg-orange-50 rounded-2xl p-4">
              <p className="text-xs text-gray-500">Kg producidos</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{fmtKg(stats.totalKgConformes)}</p>
              <p className="text-xs text-gray-400 mt-0.5">piezas conformes</p>
            </div>

            <div className={`rounded-2xl p-4 ${stats.pctMermaPromedio > 20 ? 'bg-red-50' : 'bg-yellow-50'}`}>
              <p className="text-xs text-gray-500">Merma promedio</p>
              <p className={`text-2xl font-bold mt-1 ${colorMerma(stats.pctMermaPromedio)}`}>
                {stats.mermasPorOrden.length > 0 ? fmtPct(stats.pctMermaPromedio) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">de hierro colado</p>
            </div>
          </div>

          {/* ── Balance de hierro ── */}
          {stats.totalHierro > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                🔥 Balance de hierro · período
              </p>
              {[
                { label: 'Hierro fundido total', kg: stats.totalHierro,      color: 'bg-orange-400', ref: stats.totalHierro },
                { label: 'Piezas buenas',        kg: stats.totalKgConformes,  color: 'bg-green-500',  ref: stats.totalHierro },
                { label: 'Vaceadero recuperado', kg: stats.totalVaceadero,    color: 'bg-yellow-400', ref: stats.totalHierro },
                { label: 'Merma neta',           kg: stats.totalMerma,        color: 'bg-red-400',    ref: stats.totalHierro },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-36 shrink-0">{row.label}</span>
                  <div className="flex-1">
                    <MiniBar value={row.kg} max={row.ref} color={row.color} />
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-20 text-right shrink-0">
                    {fmtKg(row.kg)}
                  </span>
                </div>
              ))}
              <p className="text-xs text-gray-400 pt-1 border-t border-gray-50">
                Vaceadero recuperado: <span className="font-bold text-yellow-600">
                  {stats.totalHierro > 0 ? fmtPct((stats.totalVaceadero / stats.totalHierro) * 100) : '—'}
                </span> del hierro total
              </p>
            </div>
          )}

          {/* ── Producción por moldeador ── */}
          {stats.moldeadores.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <Users size={12} /> Producción por moldeador
              </p>
              {stats.moldeadores.map(m => {
                const maxKg = stats.moldeadores[0]?.kgConformes || 1
                return (
                  <div key={m.nombre}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-gray-800">{m.nombre}</span>
                      <span className="text-xs text-gray-500 font-bold">{fmtKg(m.kgConformes)}</span>
                    </div>
                    <MiniBar value={m.kgConformes} max={maxKg} color="bg-feisen-azul" />
                    <div className="flex gap-3 mt-1.5 flex-wrap">
                      <span className="text-xs text-gray-400">
                        {m.conformes.toLocaleString('es-CO')} conformes
                      </span>
                      {m.nc > 0 && (
                        <span className="text-xs text-feisen-rojo font-bold">
                          {m.nc} NC · {fmtPct(m.pctNC)}
                        </span>
                      )}
                      <span className="text-xs text-gray-300">{m.ordenes} órdenes</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Top piezas producidas ── */}
          {stats.topPiezas.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <Package size={12} /> Top piezas · kg producidos
              </p>
              {stats.topPiezas.map(p => {
                const maxKg  = stats.topPiezas[0]?.kgConformes || 1
                return (
                  <div key={p.nombre}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-bold text-gray-800 leading-tight flex-1">{p.nombre}</span>
                      <span className={`text-xs font-bold shrink-0 ${colorConf(p.pctConformidad)}`}>
                        {fmtPct(p.pctConformidad)} conf.
                      </span>
                    </div>
                    <MiniBar value={p.kgConformes} max={maxKg} color="bg-feisen-rojo" />
                    <div className="flex gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-gray-400">{fmtKg(p.kgConformes)}</span>
                      <span className="text-xs text-gray-400">{p.conformes.toLocaleString('es-CO')} uds</span>
                      {p.nc > 0 && <span className="text-xs text-feisen-rojo">{p.nc} NC</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Merma por orden (top peores) ── */}
          {stats.mermasPorOrden.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <AlertTriangle size={12} /> Merma por orden · top {Math.min(8, stats.mermasPorOrden.length)} peores
              </p>
              {stats.mermasPorOrden.slice(0, 8).map(m => (
                <div key={m.ref} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400 w-28 shrink-0">{m.ref}</span>
                  <div className="flex-1">
                    <MiniBar
                      value={m.pctMerma}
                      max={40}
                      color={m.pctMerma > 20 ? 'bg-feisen-rojo' : m.pctMerma > 10 ? 'bg-yellow-400' : 'bg-green-400'}
                    />
                  </div>
                  <span className={`text-xs font-bold w-12 text-right shrink-0 ${colorMerma(m.pctMerma)}`}>
                    {fmtPct(m.pctMerma)}
                  </span>
                  <span className="text-xs text-gray-400 w-16 text-right shrink-0">
                    {fmtKg(m.kgMerma)}
                  </span>
                </div>
              ))}
              {stats.mermasPorOrden.length > 8 && (
                <p className="text-xs text-gray-400 text-center pt-1">
                  + {stats.mermasPorOrden.length - 8} órdenes más
                </p>
              )}
            </div>
          )}

          {/* ── Consumo de materiales ── */}
          {stats.consumos.some(c => c.kg > 0) && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Flame size={12} /> Consumo de materiales
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Ratio por kg de hierro fundido</p>
              </div>
              {stats.consumos.map(c => (
                <div key={c.label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-24 shrink-0">{c.label}</span>
                  <div className="flex-1">
                    <MiniBar value={c.ratio} max={stats.maxRatio} color={c.color} />
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-16 text-right shrink-0">
                    {c.ratio.toFixed(3)} kg/kg
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-50 grid grid-cols-2 gap-1">
                {stats.consumos.map(c => (
                  <p key={c.label} className="text-xs text-gray-400">
                    <span className="font-bold text-gray-600">{fmtKg(c.kg)}</span> {c.label.toLowerCase()}
                  </p>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
