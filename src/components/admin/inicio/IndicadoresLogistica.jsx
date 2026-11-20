import { BarChart2 as ChartBar } from '../../shared/iconos'

// Indicadores mensuales de pedidos (pestaña Logística del Inicio). Datos: indicadoresMensuales()
// en datosInicio.js — ahí están las reglas de qué cuenta como urgente, retraso y lead time.

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const pct = v => v == null ? '—' : `${Math.round(v * 100)}%`
const num = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: d })
const etiquetaMes = (k, corto) => {
  const [y, m] = k.split('-').map(Number)
  return corto ? `${MESES_CORTO[m - 1]} ${String(y).slice(2)}` : `${MESES[m - 1]} ${y}`
}

export default function IndicadoresLogistica({ mensual }) {
  if (!mensual?.length) return null
  const mesActual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7)
  const conLead = mensual.filter(r => r.lead != null)
  const maxLead = Math.max(1, ...conLead.map(r => r.lead))

  return (
    <article className="lg:col-span-2 bg-white border border-feisen-borde rounded-xl min-w-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-feisen-borde-suave">
        <ChartBar size={18} weight="duotone" className="text-feisen-azul" />
        <h3 className="text-sm font-semibold text-feisen-texto flex-1">Pedidos por mes</h3>
      </div>

      <div>
        {/* Lead time por mes */}
        <div className="px-4 py-3.5 border-b border-feisen-borde-suave min-w-0">
          <p className="text-[13px] font-semibold text-feisen-texto">Tiempo de entrega promedio</p>
          <p className="text-xs text-gray-400">Días calendario de pedido a recibido, por mes en que llegó</p>
          {/* Barras en HTML (no SVG escalado) para que el texto quede del mismo tamaño en celular y en PC */}
          <div className="flex items-end gap-2 sm:gap-4 h-40 mt-3 border-b border-feisen-borde" role="img" aria-label="Tiempo de entrega promedio por mes">
            {mensual.map(r => {
              const actual = r.mes === mesActual
              return (
                <div key={r.mes} className="flex-1 max-w-[64px] h-full flex flex-col justify-end items-center"
                  title={r.lead == null ? `${etiquetaMes(r.mes)}: sin pedidos recibidos` : `${etiquetaMes(r.mes)}: ${num(r.lead)} días · ${r.recibidos} pedidos recibidos`}>
                  {r.lead != null && <>
                    <span className="text-xs font-semibold tabular-nums text-feisen-texto mb-1">{num(r.lead)} d</span>
                    <div className={`w-full rounded-t ${actual ? 'bg-[#9DB5D6]' : 'bg-feisen-azul'}`} style={{ height: `${Math.max(3, (r.lead / maxLead) * 80)}%` }} />
                  </>}
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 sm:gap-4 mt-1">
            {mensual.map(r => <span key={r.mes} className="flex-1 max-w-[64px] text-center text-[11px] text-gray-400">{etiquetaMes(r.mes, true)}</span>)}
          </div>
          {mensual.some(r => r.mes === mesActual) && <p className="text-[11.5px] text-gray-400 mt-1">La barra clara es el mes en curso.</p>}
        </div>

        {/* Tabla mensual */}
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-right">
                  <th className="text-left font-semibold pl-4 pr-2 py-2.5">Mes</th>
                  <th className="font-semibold px-2 py-2.5">Pedidos</th>
                  <th className="font-semibold px-2 py-2.5">Urgentes</th>
                  <th className="font-semibold px-2 py-2.5">Con retraso</th>
                  <th className="font-semibold px-2 py-2.5 whitespace-nowrap">Días de retraso</th>
                  <th className="font-semibold px-4 py-2.5">Entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-feisen-borde-suave">
                {[...mensual].reverse().map(r => (
                  <tr key={r.mes} className="text-right tabular-nums">
                    <td className="text-left pl-4 pr-2 py-2 whitespace-nowrap text-feisen-texto">
                      <span className="sm:hidden">{etiquetaMes(r.mes, true)}</span><span className="hidden sm:inline">{etiquetaMes(r.mes)}</span>{r.mes === mesActual && <span className="hidden sm:inline ml-1.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-px rounded bg-feisen-borde-suave text-gray-400">en curso</span>}
                    </td>
                    <td className="px-2 py-2">{r.total}</td>
                    <td className="px-2 py-2">
                      <span className="font-semibold">{pct(r.pctUrgentes)}</span>
                      <span className="block text-[11px] text-gray-400">{r.urgentes} de {r.total}</span>
                    </td>
                    <td className="px-2 py-2">
                      <span className={`font-semibold ${r.pctTarde >= 0.3 ? 'text-feisen-rojo' : r.pctTarde > 0 ? 'text-amber-700' : ''}`}>{pct(r.pctTarde)}</span>
                      <span className="block text-[11px] text-gray-400">{r.evaluables ? `${r.tarde} de ${r.evaluables}` : 'sin datos'}{r.tardeAbiertos ? ` · ${r.tardeAbiertos} sin llegar` : ''}</span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 border-t border-feisen-borde-suave text-[11.5px] text-gray-400 leading-relaxed">
            Urgentes y retrasos según el mes en que se hizo el pedido. El retraso se mide en días hábiles contra la fecha estimada de llegada, en los pedidos que ya llegaron o que ya pasaron esa fecha sin llegar; los cerrados sin recibir no cuentan. Días de retraso: promedio de los que se atrasaron.
          </p>
        </div>
      </div>
    </article>
  )
}
