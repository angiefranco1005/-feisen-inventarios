import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  TrendingUp, Package, DollarSign, AlertTriangle, Clock,
  CheckCircle, XCircle, AlertCircle, MinusCircle, RotateCcw,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import Spinner from '../shared/Spinner'

// ── Colores ──────────────────────────────────────────────────────────────────
const AZ = '#064794'
const RJ = '#B4271D'
const VE = '#16a34a'
const AM = '#d97706'
const GR = '#6b7280'

// ── Formateadores ─────────────────────────────────────────────────────────────
const fmtCOP  = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const fmtPct  = (n) => `${(n || 0).toFixed(1)}%`
const fmtDias = (n) => `${Math.round(n || 0)} días`

// ── Procesamiento de datos ────────────────────────────────────────────────────
function procesarDatos(stocks, movimientos, allMovFechas, pedidos, filtros) {
  const hoy = new Date()

  // Filtro de categoría en JS
  let st = stocks.filter(s => s.items?.activo !== false)
  if (filtros.categoriaId) st = st.filter(s => s.items?.categoria_id === filtros.categoriaId)

  let mv = movimientos
  if (filtros.categoriaId) {
    const ids = new Set(st.map(s => s.item_id))
    mv = mv.filter(m => ids.has(m.item_id))
  }

  // ── Valor inventario ─────────────────────────────────────────────────────
  const valorPorCat = {}; let valorTotal = 0; let itemsConStock = 0
  for (const s of st) {
    const cat   = s.items?.categorias?.nombre || 'Sin categoría'
    const valor = Math.max(0, s.cantidad_actual || 0) * (s.items?.precio_costo || 0)
    valorPorCat[cat] = (valorPorCat[cat] || 0) + valor
    valorTotal += valor
    if (s.cantidad_actual > 0) itemsConStock++
  }
  const catChart = Object.entries(valorPorCat)
    .map(([categoria, valor]) => ({ categoria, valor: Math.round(valor) }))
    .sort((a, b) => b.valor - a.valor)

  // ── Movimientos por mes ──────────────────────────────────────────────────
  const byMonth = {}
  for (const m of mv) {
    const fecha = m.fecha_movimiento || m.created_at?.split('T')[0]
    const month = fecha?.substring(0, 7)
    if (!month) continue
    if (!byMonth[month]) byMonth[month] = { valorEnt: 0, valorSal: 0 }
    const val = (m.cantidad || 0) * (m.precio_costo_snapshot || 0)
    if (m.tipo === 'entrada' && !m.bodega_origen_id)   byMonth[month].valorEnt += val
    if (m.tipo === 'salida'  && !m.bodega_destino_id)  byMonth[month].valorSal += val
  }
  const mensual = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      mes: new Date(month + '-15').toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
      entradas: Math.round(d.valorEnt),
      salidas:  Math.round(d.valorSal),
      dio: d.valorSal > 0 ? Math.round(valorTotal / (d.valorSal / 30)) : 0,
    }))

  // ── Última fecha de movimiento por ítem ──────────────────────────────────
  const lastMov = {}
  for (const m of allMovFechas) {
    const f = m.fecha_movimiento || m.created_at?.split('T')[0]
    if (f && (!lastMov[m.item_id] || f > lastMov[m.item_id])) lastMov[m.item_id] = f
  }
  const cutoff90  = new Date(hoy - 90  * 86400000).toISOString().split('T')[0]
  const cutoff180 = new Date(hoy - 180 * 86400000).toISOString().split('T')[0]
  const activos   = st.filter(s => s.cantidad_actual > 0)
  const sinMov90  = activos.filter(s => !lastMov[s.item_id] || lastMov[s.item_id] < cutoff90)
  const sinMov180 = activos.filter(s => !lastMov[s.item_id] || lastMov[s.item_id] < cutoff180)

  // ── ABC Analysis ─────────────────────────────────────────────────────────
  const movValByItem = {}
  for (const m of mv) {
    if (m.tipo === 'salida' && !m.bodega_destino_id)
      movValByItem[m.item_id] = (movValByItem[m.item_id] || 0) + (m.cantidad || 0) * (m.precio_costo_snapshot || 0)
  }
  const itemMeta = {}
  for (const s of st) {
    if (!itemMeta[s.item_id]) itemMeta[s.item_id] = {
      nombre:    s.items?.nombre || '—',
      bodega:    s.bodegas?.nombre || '—',
      categoria: s.items?.categorias?.nombre || '—',
    }
  }
  const totalMovVal = Object.values(movValByItem).reduce((s, v) => s + v, 0)
  let cum = 0
  const abcItems = Object.entries(movValByItem)
    .sort(([, a], [, b]) => b - a)
    .map(([id, val]) => {
      cum += val
      const pctAcum = totalMovVal > 0 ? cum / totalMovVal : 0
      return { id, ...itemMeta[id], valor: Math.round(val), pctAcum, clase: pctAcum <= 0.8 ? 'A' : pctAcum <= 0.95 ? 'B' : 'C' }
    })
  const abcSummary = ['A', 'B', 'C'].map(clase => ({
    clase,
    items: abcItems.filter(i => i.clase === clase).length,
    valor: abcItems.filter(i => i.clase === clase).reduce((s, i) => s + i.valor, 0),
    pct:   totalMovVal > 0 ? abcItems.filter(i => i.clase === clase).reduce((s, i) => s + i.valor, 0) / totalMovVal * 100 : 0,
  }))

  // ── Rotación por categoría ────────────────────────────────────────────────
  const catSal = {}; const catStk = {}
  for (const m of mv)
    if (m.tipo === 'salida' && !m.bodega_destino_id) {
      const cat = itemMeta[m.item_id]?.categoria || 'Sin categoría'
      catSal[cat] = (catSal[cat] || 0) + (m.cantidad || 0) * (m.precio_costo_snapshot || 0)
    }
  for (const s of st) {
    const cat = s.items?.categorias?.nombre || 'Sin categoría'
    catStk[cat] = (catStk[cat] || 0) + Math.max(0, s.cantidad_actual || 0) * (s.items?.precio_costo || 0)
  }
  const rotacion = Object.entries(catSal).map(([cat, sal]) => ({
    categoria:    cat,
    rotacion:     catStk[cat] > 0 ? +(sal / catStk[cat]).toFixed(2) : 0,
    valorSalidas: Math.round(sal),
  })).sort((a, b) => b.rotacion - a.rotacion)

  // ── Lead Times ────────────────────────────────────────────────────────────
  const pedCompletos = (pedidos || []).filter(p => p.fecha_recibido && p.fecha_solicitud)
  const leadTimes    = pedCompletos.map(p => ({
    dias: Math.round((new Date(p.fecha_recibido) - new Date(p.fecha_solicitud)) / 86400000),
    area: p.area || '—',
  }))
  const leadTimeProm = leadTimes.length
    ? Math.round(leadTimes.reduce((s, l) => s + l.dias, 0) / leadTimes.length) : null

  const ltByArea = {}
  for (const l of leadTimes) {
    if (!ltByArea[l.area]) ltByArea[l.area] = []
    ltByArea[l.area].push(l.dias)
  }
  const leadTimeChart = Object.entries(ltByArea).map(([area, dias]) => ({
    area, promedio: Math.round(dias.reduce((s, d) => s + d, 0) / dias.length),
  })).sort((a, b) => b.promedio - a.promedio)

  const pedidosRetrasados = (pedidos || []).filter(p =>
    p.fecha_estimada_llegada &&
    !['recibido', 'anulado'].includes(p.estado) &&
    new Date(p.fecha_estimada_llegada) < hoy
  )
  const pedidosPendientes = (pedidos || []).filter(p => !['recibido', 'anulado'].includes(p.estado))

  // ── Alertas ───────────────────────────────────────────────────────────────
  const stockNegativo  = st.filter(s => (s.cantidad_actual || 0) < 0)
  const cutoff30       = new Date(hoy - 30 * 86400000).toISOString().split('T')[0]
  const stockCeroActivo = st.filter(s =>
    s.cantidad_actual === 0 && lastMov[s.item_id] && lastMov[s.item_id] >= cutoff30
  )
  const comprometidosSinStock = []
  for (const p of pedidosPendientes) {
    for (const pi of (p.pedido_items || [])) {
      if (!pi.item_id) continue
      const s = st.find(x => x.item_id === pi.item_id)
      const disp = s?.cantidad_actual || 0
      const pend = (pi.cantidad || 0) - (pi.cantidad_recibida || 0)
      if (pend > 0 && disp < pend)
        comprometidosSinStock.push({
          pedido: p.numero, area: p.area,
          item: itemMeta[pi.item_id]?.nombre || '—',
          disponible: disp, pendiente: pend,
        })
    }
  }

  // ── Semáforo semanal ──────────────────────────────────────────────────────
  const retrasadosByArea = {}
  for (const p of pedidosRetrasados) retrasadosByArea[p.area || '—'] = (retrasadosByArea[p.area || '—'] || 0) + 1

  function semaforoColor(areaLabel, bodegaSlug) {
    const r = retrasadosByArea[areaLabel] || 0
    const neg = bodegaSlug
      ? stockNegativo.filter(s => s.bodegas?.nombre?.toLowerCase().includes(bodegaSlug)).length : 0
    const cero = bodegaSlug
      ? stockCeroActivo.filter(s => s.bodegas?.nombre?.toLowerCase().includes(bodegaSlug)).length : 0
    if (neg > 0 || r >= 3) return 'rojo'
    if (r >= 1 || cero >= 3) return 'amarillo'
    return 'verde'
  }

  const semaforo = [
    { area: 'Logística',           jefe: 'Efraín Palma',     datos: true,
      color: (() => { const n = stockNegativo.length; const r = pedidosRetrasados.length; return n > 0 ? 'rojo' : r >= 3 ? 'rojo' : r >= 1 ? 'amarillo' : 'verde' })(),
      nota: `${pedidosRetrasados.length} pedido(s) retrasado(s) · ${stockNegativo.length} stock(s) negativo(s)` },
    { area: 'Mecanizados',         jefe: 'William Angulo',   datos: true,
      color: semaforoColor('Mecanizados', 'mecanizados'),
      nota: `${stockCeroActivo.filter(s => s.bodegas?.nombre?.toLowerCase().includes('mecanizados')).length} ítems en cero con mov. reciente` },
    { area: 'Fundición',           jefe: 'Julián Acuña',     datos: true,
      color: semaforoColor('Fundición', 'fund'),
      nota: `${stockCeroActivo.filter(s => s.bodegas?.nombre?.toLowerCase().includes('fund')).length} ítems en cero con mov. reciente` },
    { area: 'Ensamble/Soldadura',  jefe: 'Carlos Porras',    datos: false, color: 'gris', nota: 'Sin bodega asignada en el sistema' },
    { area: 'Comercial',           jefe: 'Leidy Franco',     datos: false, color: 'gris', nota: 'Fuera del alcance del sistema de inventario' },
    { area: 'RRHH',                jefe: 'Zaray Ariza',      datos: false, color: 'gris', nota: 'Fuera del alcance del sistema de inventario' },
    { area: 'Innovación y Diseño', jefe: 'Leonardo Cardozo', datos: false, color: 'gris', nota: 'Fuera del alcance del sistema de inventario' },
    { area: 'Contabilidad',        jefe: 'Lorena García',    datos: false, color: 'gris', nota: 'Fuera del alcance del sistema de inventario' },
  ]

  return {
    valorTotal, totalItems: st.length, itemsConStock,
    catChart, mensual,
    pctSinMov90:  activos.length ? sinMov90.length  / activos.length * 100 : 0,
    pctSinMov180: activos.length ? sinMov180.length / activos.length * 100 : 0,
    sinMov90, sinMov180,
    abcItems, abcSummary, rotacion,
    leadTimeProm, leadTimeChart, pedidosRetrasados, pedidosPendientes,
    stockNegativo, stockCeroActivo, comprometidosSinStock,
    semaforo,
  }
}

// ── Componentes auxiliares ────────────────────────────────────────────────────
function MetricCard({ titulo, valor, sub, color = AZ, icon: Icon, warn }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 ${warn ? 'border-red-200' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs text-gray-400">{titulo}</p>
        {Icon && <Icon size={18} style={{ color }} className="opacity-40" />}
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{valor}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }) {
  return <h2 className="font-semibold text-gray-700 text-base mb-3">{children}</h2>
}

function Expandible({ titulo, count, color, children }) {
  const [open, setOpen] = useState(false)
  if (!count) return null
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <span className="font-semibold text-sm" style={{ color }}>{titulo} ({count})</span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && <div className="border-t border-gray-100 overflow-x-auto">{children}</div>}
    </div>
  )
}

const TooltipCOP = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-lg text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmtCOP(p.value)}</p>
      ))}
    </div>
  )
}

// ── Sección 1: Financiero ─────────────────────────────────────────────────────
function SeccionFinanciero({ d }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard titulo="Valor total inventario"     valor={fmtCOP(d.valorTotal)}   sub={`${d.itemsConStock} ítems con stock`}    color={AZ} icon={DollarSign} />
        <MetricCard titulo="Total ítems activos"        valor={d.totalItems}            sub="en todas las bodegas"                    color={GR} icon={Package} />
        <MetricCard titulo="Sin movimiento >90 días"    valor={fmtPct(d.pctSinMov90)}  sub={`${d.sinMov90.length} ítems candidatos`} color={AM} icon={AlertCircle} warn={d.pctSinMov90 > 20} />
        <MetricCard titulo="Sin movimiento >180 días"   valor={fmtPct(d.pctSinMov180)} sub="provisión NIIF potencial"                color={RJ} icon={AlertTriangle} warn={d.pctSinMov180 > 10} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Valor por categoría */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>Valor por categoría (COP)</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.catChart} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={n => '$' + (n / 1000000).toFixed(1) + 'M'} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="categoria" width={110} tick={{ fontSize: 11 }} />
              <Tooltip content={<TooltipCOP />} />
              <Bar dataKey="valor" name="Valor" fill={AZ} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* DIO mensual */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>Tendencia DIO mensual (días de inventario)</SectionTitle>
          {d.mensual.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-16">Sin movimientos en el período</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={d.mensual} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val, name) => name === 'DIO' ? [fmtDias(val), name] : [fmtCOP(val), name]} />
                <Legend />
                <Line type="monotone" dataKey="dio"     name="DIO"     stroke={AZ} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Entradas vs Salidas */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>Entradas vs. Salidas externas (COP/mes)</SectionTitle>
        {d.mensual.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin datos en el período</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.mensual} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={n => '$' + (n / 1000000).toFixed(1) + 'M'} tick={{ fontSize: 11 }} />
              <Tooltip content={<TooltipCOP />} />
              <Legend />
              <Bar dataKey="entradas" name="Entradas" fill={VE}  radius={[4, 4, 0, 0]} />
              <Bar dataKey="salidas"  name="Salidas"  fill={RJ}  radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Ítems sin movimiento */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-1">
          <Info size={16} /> Margen por línea de producto — dato pendiente
        </p>
        <p className="text-xs text-amber-700">
          El sistema registra <strong>precio de costo</strong> pero no <strong>precio de venta</strong>.
          Para activar este indicador, agrega el campo <code className="bg-amber-100 px-1 rounded">precio_venta</code> en la tabla <code className="bg-amber-100 px-1 rounded">items</code>
          y actualízalo en la pantalla de Productos. Con eso puedo calcular el margen por categoría automáticamente.
        </p>
      </div>
    </div>
  )
}

// ── Sección 2: Rotación ───────────────────────────────────────────────────────
const CLASE_COLOR = { A: VE, B: AM, C: RJ }
const CLASE_BG    = { A: 'bg-green-100 text-green-800', B: 'bg-amber-100 text-amber-800', C: 'bg-red-100 text-red-800' }

function SeccionRotacion({ d }) {
  const [mostrarABC, setMostrarABC] = useState(false)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Rotación por categoría */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>Rotación de inventario por categoría</SectionTitle>
          <p className="text-xs text-gray-400 mb-3">Ratio: valor salidas / valor stock (mayor = más rápido)</p>
          {d.rotacion.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Sin salidas en el período</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.rotacion} layout="vertical" margin={{ left: 8, right: 32 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="categoria" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val) => [val + 'x', 'Rotación']} />
                <Bar dataKey="rotacion" name="Rotación" fill={AZ} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ABC Summary */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>Análisis ABC — Pareto 80/20</SectionTitle>
          <p className="text-xs text-gray-400 mb-4">Clasificación por valor de salidas en el período</p>
          <div className="space-y-3">
            {d.abcSummary.map(({ clase, items, valor, pct }) => (
              <div key={clase} className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm ${CLASE_BG[clase]}`}>{clase}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700">{items} ítem{items !== 1 ? 's' : ''}</span>
                    <span className="text-gray-500">{fmtCOP(valor)} · {fmtPct(pct)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CLASE_COLOR[clase] }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setMostrarABC(o => !o)}
            className="mt-4 text-xs text-feisen-azul hover:underline flex items-center gap-1">
            {mostrarABC ? <><ChevronUp size={12} /> Ocultar detalle</> : <><ChevronDown size={12} /> Ver todos los ítems</>}
          </button>
        </div>
      </div>

      {/* Tabla ABC detalle */}
      {mostrarABC && d.abcItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Clase', 'Producto', 'Categoría', 'Bodega', 'Valor salidas', '% Acumulado'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {d.abcItems.map((item, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${CLASE_BG[item.clase]}`}>{item.clase}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-800 font-medium max-w-[200px] truncate">{item.nombre}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{item.categoria}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{item.bodega}</td>
                    <td className="px-4 py-2 text-feisen-azul font-semibold">{fmtCOP(item.valor)}</td>
                    <td className="px-4 py-2 text-gray-500">{fmtPct(item.pctAcum * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sección 3: Pedidos & Lead Time ────────────────────────────────────────────
function SeccionLeadTime({ d }) {
  const [verRetrasados, setVerRetrasados] = useState(false)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard titulo="Lead time promedio" valor={d.leadTimeProm != null ? fmtDias(d.leadTimeProm) : 'Sin datos'} sub="pedidos completados" color={AZ} icon={Clock} />
        <MetricCard titulo="Pedidos retrasados" valor={d.pedidosRetrasados.length} sub="fecha estimada vencida" color={d.pedidosRetrasados.length > 0 ? RJ : VE} icon={AlertTriangle} warn={d.pedidosRetrasados.length > 0} />
        <MetricCard titulo="Pedidos en curso" valor={d.pedidosPendientes.length} sub="pendiente / en tránsito" color={GR} icon={RotateCcw} />
      </div>

      {d.leadTimeChart.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>Lead time promedio por área (días)</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.leadTimeChart} layout="vertical" margin={{ left: 8, right: 32 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="area" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(val) => [fmtDias(val), 'Promedio']} />
              <Bar dataKey="promedio" name="Días" fill={AZ} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pedidos retrasados */}
      {d.pedidosRetrasados.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
          <button onClick={() => setVerRetrasados(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-50 transition-colors">
            <span className="font-semibold text-sm text-feisen-rojo flex items-center gap-2">
              <AlertTriangle size={16} /> Pedidos con fecha estimada vencida ({d.pedidosRetrasados.length})
            </span>
            {verRetrasados ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>
          {verRetrasados && (
            <div className="border-t border-red-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-red-50">
                  <tr>
                    {['Pedido', 'Área', 'Estado', 'F. Estimada', 'Días de retraso'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-red-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {d.pedidosRetrasados.map((p, i) => {
                    const dias = Math.round((new Date() - new Date(p.fecha_estimada_llegada)) / 86400000)
                    return (
                      <tr key={i} className="hover:bg-red-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{p.numero}</td>
                        <td className="px-4 py-2.5 text-gray-600">{p.area || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-medium">{p.estado}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {new Date(p.fecha_estimada_llegada + 'T12:00').toLocaleDateString('es-CO')}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-feisen-rojo">{dias} días</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Nota lead time */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-xs font-semibold text-feisen-azul mb-1 flex items-center gap-2"><Info size={14} /> Lead time calculado desde el sistema</p>
        <p className="text-xs text-blue-700">
          El lead time se calcula como <strong>fecha_recibido − fecha_solicitud</strong> en pedidos completados.
          El campo <code className="bg-blue-100 px-1 rounded">fecha_estimada_llegada</code> ya existe en la tabla — asegúrate de llenarlo al crear cada pedido para que las alertas de retraso funcionen correctamente.
        </p>
      </div>
    </div>
  )
}

// ── Sección 4: Vista semanal (semáforo) ───────────────────────────────────────
const SEMAFORO_CONFIG = {
  verde:    { bg: 'bg-green-50',  border: 'border-green-200', punto: 'bg-green-500',  texto: 'Verde',    icon: CheckCircle,  iconColor: VE },
  amarillo: { bg: 'bg-amber-50',  border: 'border-amber-200', punto: 'bg-amber-400',  texto: 'Atención', icon: AlertCircle,  iconColor: AM },
  rojo:     { bg: 'bg-red-50',    border: 'border-red-200',   punto: 'bg-red-500',    texto: 'Alerta',   icon: XCircle,      iconColor: RJ },
  gris:     { bg: 'bg-gray-50',   border: 'border-gray-200',  punto: 'bg-gray-300',   texto: 'N/D',      icon: MinusCircle,  iconColor: GR },
}

function SeccionSemanal({ d }) {
  const hoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Semana del {hoy} — Listo para reunión de jefes de área</p>
        <div className="flex items-center gap-3 text-xs">
          {Object.entries(SEMAFORO_CONFIG).map(([key, { punto, texto }]) => (
            <span key={key} className="flex items-center gap-1.5 text-gray-500">
              <span className={`w-2.5 h-2.5 rounded-full ${punto}`} /> {texto}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {d.semaforo.map(({ area, jefe, color, nota, datos }) => {
          const cfg = SEMAFORO_CONFIG[color] || SEMAFORO_CONFIG.gris
          const Icon = cfg.icon
          return (
            <div key={area} className={`rounded-2xl border p-4 ${cfg.bg} ${cfg.border}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{area}</p>
                  <p className="text-xs text-gray-500">{jefe}</p>
                </div>
                <Icon size={22} style={{ color: cfg.iconColor }} className="flex-shrink-0 mt-0.5" />
              </div>
              <p className="text-xs text-gray-500 leading-tight">{nota}</p>
              {!datos && (
                <p className="text-xs text-gray-400 mt-1 italic">Evaluar directamente con el área</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
        <p className="text-xs font-semibold text-gray-600 mb-1 flex items-center gap-2"><Info size={14} /> Áreas sin cobertura del sistema</p>
        <p className="text-xs text-gray-500">
          Comercial, RRHH, Innovación/Diseño y Contabilidad no tienen datos en el sistema de inventario.
          Para que el semáforo las cubra, necesitaría integrar fuentes externas (CRM, nómina, Siigo/Odoo) o
          un formulario de autoreporte semanal por área — propón a Logística y Contabilidad que lo piloten primero.
        </p>
      </div>
    </div>
  )
}

// ── Sección 5: Alertas ────────────────────────────────────────────────────────
function TablaAlerta({ cols, filas, colorFila }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>{cols.map(c => <th key={c} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {filas.map((fila, i) => (
            <tr key={i} className={colorFila ? colorFila(fila) : 'hover:bg-gray-50'}>
              {fila.map((celda, j) => (
                <td key={j} className="px-4 py-2.5">{celda}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SeccionAlertas({ d }) {
  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard titulo="Stock negativo"        valor={d.stockNegativo.length}        sub="error de registro" color={d.stockNegativo.length ? RJ : VE}        icon={AlertTriangle}  warn={!!d.stockNegativo.length} />
        <MetricCard titulo="Stock en cero (activos)" valor={d.stockCeroActivo.length}    sub="con mov. reciente" color={d.stockCeroActivo.length ? AM : VE}    icon={Package}        warn={!!d.stockCeroActivo.length} />
        <MetricCard titulo="Pedidos sin stock"    valor={d.comprometidosSinStock.length} sub="no se podrán cumplir" color={d.comprometidosSinStock.length ? RJ : VE} icon={AlertCircle} warn={!!d.comprometidosSinStock.length} />
      </div>

      {/* Stock negativo */}
      <Expandible titulo="🔴 Stock negativo (error de registro — salida antes que entrada)" count={d.stockNegativo.length} color={RJ}>
        <TablaAlerta
          cols={['Producto', 'Bodega', 'Cantidad', 'Acción']}
          filas={d.stockNegativo.map(s => [
            <span className="font-medium text-gray-800">{s.items?.nombre}</span>,
            s.bodegas?.nombre,
            <span className="font-bold text-feisen-rojo">{s.cantidad_actual}</span>,
            <span className="text-xs text-gray-500">Revisar movimientos y reversar salida incorrecta</span>,
          ])}
        />
      </Expandible>

      {/* Stock en cero con movimiento reciente */}
      <Expandible titulo="⚠️ Stock en cero con movimiento en últimos 30 días" count={d.stockCeroActivo.length} color={AM}>
        <TablaAlerta
          cols={['Producto', 'Bodega', 'Último movimiento']}
          filas={d.stockCeroActivo.map(s => [
            <span className="font-medium text-gray-800">{s.items?.nombre}</span>,
            s.bodegas?.nombre,
            <span className="text-xs text-gray-500">Reciente</span>,
          ])}
        />
      </Expandible>

      {/* Comprometidos sin stock */}
      <Expandible titulo="🚨 Pedidos comprometidos sin stock suficiente" count={d.comprometidosSinStock.length} color={RJ}>
        <TablaAlerta
          cols={['Pedido', 'Área', 'Producto', 'Disponible', 'Pendiente', 'Faltante']}
          filas={d.comprometidosSinStock.map(c => [
            <span className="font-medium text-gray-800">{c.pedido}</span>,
            c.area || '—',
            <span className="text-gray-700">{c.item}</span>,
            <span className={c.disponible < 0 ? 'text-feisen-rojo font-bold' : 'text-gray-600'}>{c.disponible}</span>,
            c.pendiente,
            <span className="font-bold text-feisen-rojo">{c.pendiente - Math.max(0, c.disponible)}</span>,
          ])}
        />
      </Expandible>

      {/* Nota merma/desperdicio */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-semibold text-feisen-azul flex items-center gap-2"><Info size={14} /> Indicador de desperdicio/merma — modelo preparado, datos pendientes</p>
        <p className="text-xs text-blue-700">
          Para medir merma por proceso (fundición, mecanizado, pintura), el equipo debe empezar a registrar
          por orden de fabricación: <strong>material de entrada</strong> (kg o unidades de materia prima)
          vs. <strong>piezas buenas de salida</strong>. Propongo agregar estos campos a la tabla <code className="bg-blue-100 px-1 rounded">ordenes_moldeo</code>:
          <code className="bg-blue-100 px-1 rounded ml-1">material_entrada_kg</code>,
          <code className="bg-blue-100 px-1 rounded ml-1">piezas_buenas</code>,
          <code className="bg-blue-100 px-1 rounded ml-1">piezas_defectuosas</code>.
          Con tres meses de datos, el dashboard puede calcular el % de merma por proceso automáticamente.
        </p>
      </div>
    </div>
  )
}

// ── Filtros globales ──────────────────────────────────────────────────────────
function FiltrosGlobales({ filtros, setFiltros, bodegas, categorias }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Filtros</span>
      <select value={filtros.bodegaId} onChange={e => setFiltros(f => ({ ...f, bodegaId: e.target.value }))}
        className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
        <option value="">Todas las bodegas</option>
        {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
      </select>
      <select value={filtros.categoriaId} onChange={e => setFiltros(f => ({ ...f, categoriaId: e.target.value }))}
        className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
        <option value="">Todas las categorías</option>
        {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <select value={filtros.meses} onChange={e => setFiltros(f => ({ ...f, meses: +e.target.value }))}
        className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
        <option value={1}>Último mes</option>
        <option value={3}>Últimos 3 meses</option>
        <option value={6}>Últimos 6 meses</option>
        <option value={12}>Últimos 12 meses</option>
      </select>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
const TABS = [
  { id: 0, label: '💰 Financiero' },
  { id: 1, label: '🔄 Rotación' },
  { id: 2, label: '⏱️ Pedidos & Lead Time' },
  { id: 3, label: '🚦 Vista semanal' },
  { id: 4, label: '🚨 Alertas' },
]

export default function DashboardEjecutivo() {
  const [tab,       setTab]       = useState(0)
  const [filtros,   setFiltros]   = useState({ bodegaId: '', categoriaId: '', meses: 6 })
  const [datos,     setDatos]     = useState(null)
  const [cargando,  setCargando]  = useState(true)
  const [bodegas,   setBodegas]   = useState([])
  const [categorias,setCategorias]= useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('categorias').select('id, nombre').order('nombre'),
    ]).then(([{ data: b }, { data: c }]) => { setBodegas(b || []); setCategorias(c || []) })
  }, [])

  useEffect(() => { cargarTodo() }, [filtros])

  async function cargarTodo() {
    setCargando(true)
    const desde = new Date()
    desde.setMonth(desde.getMonth() - filtros.meses)
    const desdeStr = desde.toISOString().split('T')[0]

    // 365 días hacia atrás para obsolescencia (fijo, independiente del filtro)
    const desde365 = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]

    let stockQ = supabase.from('stock')
      .select('item_id, bodega_id, cantidad_actual, items(id, nombre, unidad_medida, precio_costo, activo, categoria_id, categorias(nombre)), bodegas(id, nombre)')
    if (filtros.bodegaId) stockQ = stockQ.eq('bodega_id', filtros.bodegaId)

    let movsQ = supabase.from('movimientos')
      .select('tipo, item_id, bodega_origen_id, bodega_destino_id, cantidad, precio_costo_snapshot, fecha_movimiento, created_at')
      .gte('fecha_movimiento', desdeStr)
    if (filtros.bodegaId) movsQ = movsQ.or(`bodega_origen_id.eq.${filtros.bodegaId},bodega_destino_id.eq.${filtros.bodegaId}`)

    const allMovQ = supabase.from('movimientos')
      .select('item_id, fecha_movimiento, created_at')
      .gte('fecha_movimiento', desde365)

    const pedidosQ = supabase.from('pedidos')
      .select('id, numero, area, estado, fecha_solicitud, fecha_estimada_llegada, fecha_recibido, pedido_items(item_id, cantidad, cantidad_recibida)')
      .order('created_at', { ascending: false })
      .limit(500)

    const [
      { data: stocks },
      { data: movimientos },
      { data: allMovFechas },
      { data: pedidos },
    ] = await Promise.all([stockQ, movsQ, allMovQ, pedidosQ])

    setDatos(procesarDatos(stocks || [], movimientos || [], allMovFechas || [], pedidos || [], filtros))
    setCargando(false)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-feisen-azul flex items-center gap-2">
        <TrendingUp size={24} /> Dashboard ejecutivo
      </h1>

      <FiltrosGlobales filtros={filtros} setFiltros={setFiltros} bodegas={bodegas} categorias={categorias} />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap
              ${tab === t.id ? 'bg-white text-feisen-azul shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="flex items-center justify-center min-h-[40vh]"><Spinner /></div>
      ) : datos ? (
        <>
          {tab === 0 && <SeccionFinanciero d={datos} />}
          {tab === 1 && <SeccionRotacion  d={datos} />}
          {tab === 2 && <SeccionLeadTime  d={datos} />}
          {tab === 3 && <SeccionSemanal   d={datos} />}
          {tab === 4 && <SeccionAlertas   d={datos} />}
        </>
      ) : null}
    </div>
  )
}
