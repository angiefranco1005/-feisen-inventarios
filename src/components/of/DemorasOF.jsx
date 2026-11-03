import { useState } from 'react'
import { CENTRO_NOMBRE, formatoOF, formatFecha, hoyISO, ofTotalmenteDespachada } from './shared/formatters'

// ¿Qué tanto nos estamos demorando con las OF? (Dashboard › Pedidos)
// Lo atrasado hoy va primero; después el atraso de las que ya salieron, la tendencia por mes
// y qué área tarda más en fabricar. Recibe las OF no canceladas con items, producciones y entregas.

const dias = (desde, hasta) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const nombreMes = ym => { const [y, m] = ym.split('-'); return `${MESES[Number(m) - 1]} ${y}` }
const promedio = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null
const fmtDias = v => v === null ? '—' : `${v.toFixed(1).replace('.', ',')} días`

// Última fecha de entrega real de una OF (sin contar reversiones)
function ultimaEntrega(o) {
  let ultima = null
  o.items_of.forEach(it => (it.entregas || []).forEach(e => {
    if (e.tipo !== 'reversion' && (!ultima || e.fecha > ultima)) ultima = e.fecha
  }))
  return ultima
}

// Fecha en que el ítem quedó fabricado completo (última producción real), o null
function fechaFabricado(it) {
  if (it.producido < it.cantidad) return null
  const reales = (it.producciones || []).filter(pr => pr.tipo !== 'reversion')
  return reales.reduce((max, pr) => (!max || pr.fecha > max) ? pr.fecha : max, null)
}

export function calcularDemoras(ordenes) {
  const hoy = hoyISO()

  // 1. Atrasadas hoy: promesa vencida y todavía sin salir completas
  const atrasadas = ordenes
    .filter(o => o.fecha_promesa < hoy && !ofTotalmenteDespachada(o.items_of))
    .map(o => {
      const sinFabricar = o.items_of.filter(it => it.producido < it.cantidad)
      return { orden: o, diasAtraso: dias(o.fecha_promesa, hoy), faltaFabricar: sinFabricar.length > 0, areas: [...new Set(sinFabricar.map(it => it.centro_costo))] }
    })
    .sort((a, b) => b.diasAtraso - a.diasAtraso)

  // 2. De las que ya salieron completas: cuántas tarde y con cuánto atraso
  const salieron = ordenes.filter(o => ofTotalmenteDespachada(o.items_of))
    .map(o => ({ orden: o, ultima: ultimaEntrega(o) }))
    .filter(x => x.ultima)
  const tarde = salieron.filter(x => x.ultima > x.orden.fecha_promesa)
  const atrasoPromedio = promedio(tarde.map(x => dias(x.orden.fecha_promesa, x.ultima)))

  // 3. Tendencia por mes de la entrega final: % a tiempo y días de orden → entrega
  const porMes = {}
  salieron.forEach(x => {
    const ym = x.ultima.slice(0, 7)
    const g = porMes[ym] ??= { n: 0, aTiempo: 0, dias: [] }
    g.n++
    if (x.ultima <= x.orden.fecha_promesa) g.aTiempo++
    g.dias.push(dias(x.orden.fecha_orden, x.ultima))
  })
  const meses = Object.keys(porMes).sort().slice(-6)
    .map(ym => ({ ym, n: porMes[ym].n, pctATiempo: Math.round(porMes[ym].aTiempo / porMes[ym].n * 100), diasPromedio: promedio(porMes[ym].dias) }))

  // 4. Por área: días de la orden a tener el ítem fabricado, e ítems atrasados hoy sin fabricar
  const areas = Object.keys(CENTRO_NOMBRE).map(c => {
    const tiempos = []
    let atrasadosHoy = 0
    ordenes.forEach(o => o.items_of.forEach(it => {
      if (it.centro_costo !== c) return
      const listo = fechaFabricado(it)
      if (listo) tiempos.push(dias(o.fecha_orden, listo))
      else if (o.fecha_promesa < hoy) atrasadosHoy++
    }))
    return { centro: c, diasFabricar: promedio(tiempos), muestra: tiempos.length, atrasadosHoy }
  }).sort((a, b) => (b.diasFabricar ?? -1) - (a.diasFabricar ?? -1))

  return { atrasadas, salieron: salieron.length, tarde: tarde.length, atrasoPromedio, meses, areas }
}

export default function DemorasOF({ ordenes }) {
  const [verTodas, setVerTodas] = useState(false)
  const d = calcularDemoras(ordenes)
  const lista = verTodas ? d.atrasadas : d.atrasadas.slice(0, 8)
  const maxDiasArea = Math.max(1, ...d.areas.map(a => a.diasFabricar || 0))

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-feisen-texto">¿Qué tanto nos estamos demorando?</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Indicador alerta={d.atrasadas.length > 0} valor={d.atrasadas.length}
          label="OF atrasadas hoy" contexto="ya pasaron su fecha y no han salido completas" />
        <Indicador valor={d.salieron ? `${d.tarde} de ${d.salieron}` : '—'}
          label="Salieron tarde" contexto="de las OF ya entregadas completas" />
        <Indicador valor={fmtDias(d.atrasoPromedio)}
          label="Atraso promedio" contexto="de las que salieron tarde, después de la fecha prometida" />
      </div>

      <section className="bg-white border border-feisen-borde rounded-xl">
        <div className="px-4 py-3 border-b border-feisen-borde-suave flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Atrasadas hoy</h3>
          <span className="text-xs text-feisen-texto-2 tabular-nums">{d.atrasadas.length}</span>
        </div>
        {d.atrasadas.length === 0 ? (
          <p className="px-4 py-6 text-sm text-feisen-texto-2 text-center">No hay OF atrasadas: todo lo que tenía fecha vencida ya salió.</p>
        ) : (
          <>
            <ul className="divide-y divide-feisen-borde-suave">
              {lista.map(({ orden, diasAtraso, faltaFabricar, areas }) => (
                <li key={orden.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">
                      <span className="font-semibold text-feisen-azul tabular-nums">{formatoOF(orden.numero)}</span>
                      <span className="ml-1.5 text-feisen-texto">{orden.cliente}</span>
                    </p>
                    <p className="text-xs text-feisen-texto-2">
                      Prometida {formatFecha(orden.fecha_promesa)} · {faltaFabricar ? `falta fabricar (${areas.map(a => CENTRO_NOMBRE[a]).join(', ')})` : 'fabricada, falta despachar'}
                    </p>
                  </div>
                  <span className="flex-shrink-0 rounded-md px-2 py-0.5 text-xs font-medium bg-feisen-rojo-suave text-feisen-rojo tabular-nums">
                    {diasAtraso} {diasAtraso === 1 ? 'día' : 'días'}
                  </span>
                </li>
              ))}
            </ul>
            {d.atrasadas.length > 8 && (
              <button onClick={() => setVerTodas(v => !v)} className="w-full px-4 py-2.5 text-sm text-feisen-azul font-medium border-t border-feisen-borde-suave hover:bg-feisen-fondo">
                {verTodas ? 'Ver menos' : `Ver las ${d.atrasadas.length}`}
              </button>
            )}
          </>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-white border border-feisen-borde rounded-xl">
          <h3 className="px-4 py-3 border-b border-feisen-borde-suave text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Mes a mes (OF entregadas)</h3>
          {d.meses.length === 0 ? (
            <p className="px-4 py-6 text-sm text-feisen-texto-2 text-center">Todavía no hay OF entregadas completas.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-feisen-texto-2">
                  <th className="text-left font-medium px-4 py-2">Mes</th>
                  <th className="text-right font-medium px-2 py-2">OF</th>
                  <th className="text-right font-medium px-2 py-2">A tiempo</th>
                  <th className="text-right font-medium px-4 py-2">Días promedio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-feisen-borde-suave">
                {d.meses.map(mes => (
                  <tr key={mes.ym}>
                    <td className="px-4 py-2 capitalize">{nombreMes(mes.ym)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{mes.n}</td>
                    <td className={`px-2 py-2 text-right tabular-nums font-medium ${mes.pctATiempo < 70 ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{mes.pctATiempo}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtDias(mes.diasPromedio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="px-4 py-2 text-xs text-feisen-texto-2 border-t border-feisen-borde-suave">Días promedio: de la fecha de la orden a la última entrega.</p>
        </section>

        <section className="bg-white border border-feisen-borde rounded-xl">
          <h3 className="px-4 py-3 border-b border-feisen-borde-suave text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Por área: días para fabricar</h3>
          <ul className="divide-y divide-feisen-borde-suave">
            {d.areas.map(a => (
              <li key={a.centro} className="px-4 py-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-feisen-texto">{CENTRO_NOMBRE[a.centro]}</span>
                  <span className="tabular-nums font-medium">{fmtDias(a.diasFabricar)}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-feisen-borde-suave overflow-hidden">
                  <div className="h-full rounded-full bg-feisen-azul" style={{ width: `${((a.diasFabricar || 0) / maxDiasArea) * 100}%` }} />
                </div>
                <p className="text-xs text-feisen-texto-2 mt-1">
                  {a.muestra} {a.muestra === 1 ? 'producto fabricado' : 'productos fabricados'}
                  {a.atrasadosHoy > 0 && <span className="text-feisen-rojo"> · {a.atrasadosHoy} atrasados sin fabricar</span>}
                </p>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 text-xs text-feisen-texto-2 border-t border-feisen-borde-suave">De la fecha de la orden a cuando el producto quedó fabricado completo.</p>
        </section>
      </div>
    </div>
  )
}

function Indicador({ valor, label, contexto, alerta }) {
  return (
    <div className={`rounded-xl border p-4 ${alerta ? 'bg-feisen-rojo-suave border-feisen-rojo/20' : 'bg-white border-feisen-borde'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${alerta ? 'text-feisen-rojo' : 'text-feisen-texto-2'}`}>{label}</p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${alerta ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{valor}</p>
      <p className="text-xs text-feisen-texto-2 mt-0.5">{contexto}</p>
    </div>
  )
}
