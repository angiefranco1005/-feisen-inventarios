import { useNavigate } from 'react-router-dom'
import { ESTADOS, estadoFase, textoEstadoFase, ESTADOS_FASE, resumenCumplimiento, hoyISO, diasEntre } from './comun'

// ¿Cómo van los tiempos de los proyectos? Diagrama de barras (Gantt) con las fases de cada proyecto:
// barra = inicio–fin planeado; tramo rojo = días de atraso (hasta hoy si no ha terminado, hasta
// la fecha real si terminó tarde). La línea azul es hoy. Pedido de Angie, 2026-11-20.
const fechaCorta = f => f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }).replace('.', '') : '—'
const MES = d => d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }).replace('.', '')
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function CronogramaProyectos({ proyectos }) {
  const navigate = useNavigate()
  const hoy = hoyISO()

  const conFechas = proyectos.filter(p => (p.fases || []).some(f => f.inicio && f.fin))
  const sinFechas = proyectos.length - conFechas.length
  if (!conFechas.length) {
    return (
      <div className="bg-white border border-feisen-borde rounded-xl p-8 text-center">
        <p className="font-semibold text-feisen-texto">Ningún proyecto tiene fechas en el cronograma</p>
        <p className="text-sm text-feisen-texto-2 mt-1">Abra cada proyecto y llene el inicio y el fin de sus fases en la sección 5 «Cronograma». Aparecerán aquí.</p>
      </div>
    )
  }

  // Rango: del primer día del mes más antiguo al último día del mes más lejano (incluye hoy)
  const fechas = [hoy]
  for (const p of conFechas) for (const f of p.fases || []) for (const k of ['inicio', 'fin', 'terminada']) if (f[k]) fechas.push(f[k])
  fechas.sort()
  const d0 = new Date(`${fechas[0]}T12:00:00`), d1 = new Date(`${fechas[fechas.length - 1]}T12:00:00`)
  const desde = iso(new Date(d0.getFullYear(), d0.getMonth(), 1, 12))
  const hasta = iso(new Date(d1.getFullYear(), d1.getMonth() + 1, 0, 12))
  const total = diasEntre(desde, hasta) + 1
  const pos = f => (diasEntre(desde, f) / total) * 100
  const ancho = (a, b) => Math.max(0.6, ((diasEntre(a, b) + 1) / total) * 100)

  const meses = []
  for (let d = new Date(`${desde}T12:00:00`); iso(d) <= hasta; d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)) {
    const ini = iso(d), fin = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12))
    meses.push({ ini, etiqueta: MES(d), izq: pos(ini), ancho: ancho(ini, fin) })
  }

  return (
    <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {/* Meses */}
          <div className="grid grid-cols-[300px_1fr] border-b border-feisen-borde bg-feisen-fondo">
            <div className="px-4 py-2 text-xs uppercase tracking-wide text-gray-400">Proyecto y fase</div>
            <div className="relative h-8">
              {meses.map(m => (
                <span key={m.ini} className="absolute top-0 h-full border-l border-feisen-borde-suave px-1.5 pt-2 text-xs uppercase tracking-wide text-gray-400"
                  style={{ left: `${m.izq}%`, width: `${m.ancho}%` }}>{m.etiqueta}</span>
              ))}
              <LineaHoy izq={pos(hoy)} etiqueta />
            </div>
          </div>

          {conFechas.map(p => {
            const est = ESTADOS[p.estado] || ESTADOS.borrador
            const r = resumenCumplimiento(p.fases, hoy)
            const fases = (p.fases || []).filter(f => f.fase || (f.inicio && f.fin))
            return (
              <div key={p.id} className="border-b border-feisen-borde last:border-b-0">
                <div className="grid grid-cols-[300px_1fr]">
                  <button onClick={() => navigate(`/innovacion/${p.id}`)} className="text-left px-4 pt-3 pb-1 hover:text-feisen-azul min-w-0">
                    <p className="font-semibold text-feisen-texto line-clamp-2">
                      <span className="text-feisen-texto-2 font-normal tabular-nums mr-1.5">{p.numero}</span>{p.nombre}
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${est.clase}`}>{est.texto}</span>
                      {r.atrasadas > 0 && <span className="rounded-md px-2 py-0.5 text-xs font-medium bg-feisen-rojo-suave text-feisen-rojo">{r.atrasadas} atrasada{r.atrasadas === 1 ? '' : 's'}</span>}
                      {r.terminadas > 0 && <span className="text-xs text-feisen-texto-2 tabular-nums">{r.aTiempo}/{r.terminadas} a tiempo</span>}
                    </p>
                  </button>
                  <div className="relative"><Meses meses={meses} /><LineaHoy izq={pos(hoy)} /></div>
                </div>
                {fases.map((f, i) => {
                  const e = estadoFase(f, hoy)
                  const tieneFechas = f.inicio && f.fin
                  const finAtraso = e.clave === 'atrasada' ? hoy : e.clave === 'tarde' ? f.terminada : null
                  return (
                    <div key={i} className="grid grid-cols-[300px_1fr]">
                      <div className="pl-7 pr-3 py-1.5 min-w-0">
                        <p className="text-sm text-feisen-texto truncate">{f.fase || 'Sin nombre'}</p>
                        <p className={`text-xs ${e.clave === 'atrasada' || e.clave === 'tarde' ? 'text-feisen-rojo' : e.clave === 'por_vencer' ? 'text-amber-700' : 'text-feisen-texto-2'}`}>
                          {tieneFechas ? `${fechaCorta(f.inicio)} – ${fechaCorta(f.fin)} · ` : ''}{textoEstadoFase(e)}
                        </p>
                      </div>
                      <div className="relative">
                        <Meses meses={meses} />
                        <LineaHoy izq={pos(hoy)} />
                        {tieneFechas && (
                          <div className={`absolute top-1/2 -translate-y-1/2 h-3.5 rounded ${ESTADOS_FASE[e.clave].barra}`}
                            style={{ left: `${pos(f.inicio)}%`, width: `${ancho(f.inicio, f.fin)}%` }}
                            title={`${f.fase}: ${fechaCorta(f.inicio)} – ${fechaCorta(f.fin)} · ${textoEstadoFase(e)}`} />
                        )}
                        {tieneFechas && finAtraso && (
                          <div className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded-r bg-feisen-rojo"
                            style={{ left: `${pos(f.fin) + ancho(f.fin, f.fin)}%`, width: `${Math.max(0.4, (diasEntre(f.fin, finAtraso) / total) * 100)}%` }} />
                        )}
                        {f.terminada && (
                          <span className="absolute top-1/2 -translate-y-1/2 -ml-1 w-2 h-2 rounded-full bg-feisen-texto ring-2 ring-white"
                            style={{ left: `${pos(f.terminada) + ancho(f.terminada, f.terminada)}%` }} title={`Terminada el ${fechaCorta(f.terminada)}`} />
                        )}
                      </div>
                    </div>
                  )
                })}
                <div className="h-2" />
              </div>
            )
          })}
        </div>
      </div>

      {/* Convenciones */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-3 border-t border-feisen-borde bg-feisen-fondo text-xs text-feisen-texto-2">
        <Convencion clase="bg-feisen-azul">Terminada</Convencion>
        <Convencion clase="bg-feisen-azul/40">En curso</Convencion>
        <Convencion clase="bg-amber-400">Vence esta semana</Convencion>
        <Convencion clase="bg-gray-300">Por empezar</Convencion>
        <Convencion clase="bg-feisen-rojo">Días de atraso</Convencion>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-feisen-texto" /> Fecha en que se terminó</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3 bg-feisen-azul" /> Hoy</span>
        {sinFechas > 0 && <span className="basis-full">{sinFechas === 1 ? '1 proyecto no aparece porque' : `${sinFechas} proyectos no aparecen porque`} sus fases no tienen fechas.</span>}
      </div>
    </div>
  )
}

function Meses({ meses }) {
  return meses.map(m => <span key={m.ini} className="absolute inset-y-0 border-l border-feisen-borde-suave" style={{ left: `${m.izq}%` }} />)
}

function LineaHoy({ izq, etiqueta }) {
  return (
    <span className="absolute inset-y-0 w-0.5 bg-feisen-azul z-10" style={{ left: `${izq}%` }}>
      {etiqueta && <span className="absolute -top-0 left-1 text-[10px] font-semibold text-feisen-azul uppercase">Hoy</span>}
    </span>
  )
}

function Convencion({ clase, children }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`w-4 h-2.5 rounded ${clase}`} />{children}</span>
}
