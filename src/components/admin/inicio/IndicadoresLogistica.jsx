import { useRef, useState } from 'react'
import { BarChart2 as ChartBar } from '../../shared/iconos'

// Indicadores mensuales de pedidos (pestaña Logística del Inicio), en total o por bodega (área
// que pidió). Datos: indicadoresMensuales() / indicadoresPorBodega() en datosInicio.js — ahí
// están las reglas de qué cuenta como urgente, retraso y lead time.

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const pct = v => v == null ? '—' : `${Math.round(v * 100)}%`
const num = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: d })
const cap = s => (s || '').charAt(0) + (s || '').slice(1).toLowerCase()
const etiquetaMes = (k, corto) => {
  const [y, m] = k.split('-').map(Number)
  return corto ? `${MESES_CORTO[m - 1]} ${String(y).slice(2)}` : `${MESES[m - 1]} ${y}`
}
const leer = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def } catch { return def } }
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin almacenamiento */ } }

// Encabezados y celdas de indicadores: iguales en la tabla por mes y en la de bodegas
const EncabezadoCifras = () => <>
  <th className="font-semibold px-2 py-2.5">Pedidos</th>
  <th className="font-semibold px-2 py-2.5">Urgentes</th>
  <th className="font-semibold px-2 py-2.5">Con retraso</th>
  <th className="font-semibold px-2 py-2.5 whitespace-nowrap">Días de retraso</th>
  <th className="font-semibold px-4 py-2.5">Entrega</th>
</>
const CeldasCifras = ({ r }) => <>
  <td className="px-2 py-2">{r.total}</td>
  <td className="px-2 py-2">
    <span className="font-semibold">{pct(r.pctUrgentes)}</span>
    <span className="block text-[11px] text-gray-400">{r.urgentes} de {r.total}</span>
  </td>
  <td className="px-2 py-2">
    <span className={`font-semibold ${r.pctTarde >= 0.3 ? 'text-feisen-rojo' : r.pctTarde > 0 ? 'text-amber-700' : ''}`}>{pct(r.pctTarde)}</span>
    <span className="block text-[11px] text-gray-400 whitespace-nowrap">{r.evaluables ? `${r.tarde} de ${r.evaluables}` : 'sin datos'}{r.tardeAbiertos ? ` · ${r.tardeAbiertos} sin llegar` : ''}</span>
  </td>
  <td className="px-2 py-2">
    {r.diasProm == null ? '—' : <>
      <span className="font-semibold">{num(r.diasProm)} d</span>
      <span className="block text-[11px] text-gray-400">máx. {r.diasMax} d</span>
    </>}
  </td>
  <td className="px-4 py-2">
    <span className="font-semibold">{r.lead == null ? '—' : `${num(r.lead)} d`}</span>
    {r.recibidos > 0 && <span className="block text-[11px] text-gray-400">{r.recibidos} recibidos</span>}
  </td>
</>

export default function IndicadoresLogistica({ mensual: mensualTotal, porBodega = [] }) {
  const [bodegaGuardada, setBodegaGuardada] = useState(() => leer('inicio-pedidos-bodega', ''))
  const elegir = a => { setBodegaGuardada(a); guardar('inicio-pedidos-bodega', a) }
  const tarjeta = useRef(null)
  if (!mensualTotal?.length) return null

  // Si la bodega guardada ya no aparece, se ven todas
  const sel = porBodega.find(b => b.area === bodegaGuardada) || null
  const mensual = sel ? sel.mensual : mensualTotal
  const nombreSel = sel ? cap(sel.area) : 'todas las bodegas'
  const mesActual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7)
  const maxLead = Math.max(1, ...mensual.filter(r => r.lead != null).map(r => r.lead))

  return (
    <article ref={tarjeta} className="lg:col-span-2 bg-white border border-feisen-borde rounded-xl min-w-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-feisen-borde-suave">
        <ChartBar size={18} weight="duotone" className="text-feisen-azul" />
        <h3 className="text-sm font-semibold text-feisen-texto flex-1">Pedidos por mes</h3>
      </div>

      {/* Bodega (área que hizo el pedido) */}
      {porBodega.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3.5" role="group" aria-label="Bodega">
          {[{ area: '', total: porBodega.reduce((t, b) => t + b.total, 0) }, ...porBodega].map(b => {
            const activo = (sel?.area || '') === b.area
            return (
              <button key={b.area || 'todas'} onClick={() => elegir(b.area)} aria-pressed={activo}
                className={`px-2.5 py-1 rounded-full border text-[12.5px] whitespace-nowrap ${activo ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-semibold' : 'border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
                {b.area ? cap(b.area) : 'Todas'} <span className="tabular-nums opacity-70">{b.total}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Lead time por mes */}
      <div className="px-4 py-3.5 border-b border-feisen-borde-suave min-w-0">
        <p className="text-[13px] font-semibold text-feisen-texto">Tiempo de entrega promedio · {nombreSel}</p>
        <p className="text-xs text-gray-400">Días calendario de pedido a recibido, por mes en que llegó</p>
        {!mensual.some(r => r.lead != null) && <p className="text-sm text-feisen-texto-2 mt-3">Aún no hay pedidos recibidos de {nombreSel}.</p>}
        {/* Barras en HTML (no SVG escalado) para que el texto quede del mismo tamaño en celular y en PC */}
        {mensual.some(r => r.lead != null) && <>
        <div className="flex items-end gap-2 sm:gap-4 h-40 mt-3 border-b border-feisen-borde" role="img" aria-label={`Tiempo de entrega promedio por mes, ${nombreSel}`}>
          {mensual.map(r => (
            <div key={r.mes} className="flex-1 max-w-[64px] h-full flex flex-col justify-end items-center"
              title={r.lead == null ? `${etiquetaMes(r.mes)}: sin pedidos recibidos` : `${etiquetaMes(r.mes)}: ${num(r.lead)} días · ${r.recibidos} pedidos recibidos`}>
              {r.lead != null && <>
                <span className="text-xs font-semibold tabular-nums text-feisen-texto mb-1">{num(r.lead)} d</span>
                <div className={`w-full rounded-t ${r.mes === mesActual ? 'bg-[#9DB5D6]' : 'bg-feisen-azul'}`} style={{ height: `${Math.max(3, (r.lead / maxLead) * 80)}%` }} />
              </>}
            </div>
          ))}
        </div>
        <div className="flex gap-2 sm:gap-4 mt-1">
          {mensual.map(r => <span key={r.mes} className="flex-1 max-w-[64px] text-center text-[11px] text-gray-400">{etiquetaMes(r.mes, true)}</span>)}
        </div>
        </>}
        {mensual.some(r => r.mes === mesActual) && <p className="text-[11.5px] text-gray-400 mt-1">La barra clara es el mes en curso.</p>}
      </div>

      {/* Tabla mensual */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-right">
              <th className="text-left font-semibold pl-4 pr-2 py-2.5">Mes</th>
              <EncabezadoCifras />
            </tr>
          </thead>
          <tbody className="divide-y divide-feisen-borde-suave">
            {[...mensual].reverse().map(r => (
              <tr key={r.mes} className="text-right tabular-nums">
                <td className="text-left pl-4 pr-2 py-2 whitespace-nowrap text-feisen-texto">
                  <span className="sm:hidden">{etiquetaMes(r.mes, true)}</span><span className="hidden sm:inline">{etiquetaMes(r.mes)}</span>{r.mes === mesActual && <span className="hidden sm:inline ml-1.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-px rounded bg-feisen-borde-suave text-gray-400">en curso</span>}
                </td>
                <CeldasCifras r={r} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Comparación entre bodegas (todo el historial) */}
      {porBodega.length > 1 && (
        <div className="border-t border-feisen-borde-suave">
          <div className="px-4 pt-3.5">
            <p className="text-[13px] font-semibold text-feisen-texto">Comparación por bodega</p>
            <p className="text-xs text-gray-400">Todo el historial · toca una bodega para ver sus meses</p>
          </div>
          <div className="overflow-x-auto mt-1">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-right">
                  <th className="text-left font-semibold pl-4 pr-2 py-2.5">Bodega</th>
                  <EncabezadoCifras />
                </tr>
              </thead>
              <tbody className="divide-y divide-feisen-borde-suave">
                {porBodega.map(b => (
                  <tr key={b.area} onClick={() => { elegir(sel?.area === b.area ? '' : b.area); tarjeta.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
                    className={`text-right tabular-nums cursor-pointer ${sel?.area === b.area ? 'bg-feisen-azul-suave/60' : 'hover:bg-feisen-fondo'}`}>
                    <td className="text-left pl-4 pr-2 py-2 whitespace-nowrap font-medium text-feisen-texto">{cap(b.area)}</td>
                    <CeldasCifras r={b} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="px-4 py-2.5 border-t border-feisen-borde-suave text-[11.5px] text-gray-400 leading-relaxed">
        Bodega = área que hizo el pedido (los pedidos viejos sin área toman la de quien los pidió). Urgentes y retrasos según el mes en que se hizo el pedido. El retraso se mide en días hábiles contra la fecha estimada de llegada, en los pedidos que ya llegaron o que ya pasaron esa fecha sin llegar; los cerrados sin recibir no cuentan. Días de retraso: promedio de los que se atrasaron.
      </p>
    </article>
  )
}
