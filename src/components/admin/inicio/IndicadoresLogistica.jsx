import { useRef, useState } from 'react'
import { BarChart2 as ChartBar } from '../../shared/iconos'

// Indicadores de pedidos (pestaña Logística del Inicio). Diseño elegido por Angie (2026-11-20,
// "opción D con gráfica"): primero "Ver por mes" o "Ver por bodega", luego los botones de ese
// eje; arriba una gráfica de tiempo de entrega y abajo una lista compacta con los 4 indicadores.
// Datos: indicadoresMensuales() / indicadoresPorBodega() en datosInicio.js — ahí están las reglas
// de qué cuenta como urgente, retraso y lead time.

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const pct = v => v == null ? '—' : `${Math.round(v * 100)}%`
const num = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: d })
const cap = s => (s || '').charAt(0) + (s || '').slice(1).toLowerCase()
const mesCorto = k => { const [y, m] = k.split('-').map(Number); return `${MESES_CORTO[m - 1]} ${String(y).slice(2)}` }
const mesLargo = k => { const [y, m] = k.split('-').map(Number); return `${MESES[m - 1]} ${y}` }
const leer = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def } catch { return def } }
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin almacenamiento */ } }

const pedidosTxt = n => `${n || 0} ${n === 1 ? 'pedido' : 'pedidos'}`
const FILA = 'grid grid-cols-[minmax(0,1.25fr),repeat(4,minmax(0,1fr))] gap-x-2 items-center text-right tabular-nums'

function Chip({ activo, onClick, children }) {
  return (
    <button onClick={onClick} aria-pressed={activo}
      className={`px-2.5 py-1 rounded-full border text-[12.5px] whitespace-nowrap ${activo ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-semibold' : 'border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
      {children}
    </button>
  )
}

// Una fila de la lista: nombre (bodega o mes) + urgentes, con retraso, días de retraso, entrega
function Fila({ r, nombre, detalle, fuerte, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`${FILA} w-full px-4 py-2 text-[13px] ${onClick ? 'hover:bg-feisen-fondo' : ''} ${fuerte ? 'bg-feisen-fondo/60' : ''}`}>
      <span className="text-left min-w-0">
        <span className={`block truncate text-feisen-texto ${fuerte ? 'font-semibold' : 'font-medium'}`}>{nombre}</span>
        <span className="block text-[11px] text-gray-400">{detalle}</span>
      </span>
      <span>
        <span className="font-semibold">{pct(r?.pctUrgentes)}</span>
        {r?.total > 0 && <span className="block text-[11px] text-gray-400">{r.urgentes} de {r.total}</span>}
      </span>
      <span title={r?.tardeAbiertos ? `${r.tardeAbiertos} todavía sin llegar` : undefined}>
        <span className={`font-semibold ${r?.pctTarde >= 0.5 ? 'text-feisen-rojo' : r?.pctTarde > 0 ? 'text-amber-700' : ''}`}>{pct(r?.pctTarde)}</span>
        <span className="block text-[11px] text-gray-400">{r?.evaluables ? `${r.tarde} de ${r.evaluables}` : 'sin datos'}</span>
      </span>
      <span>
        <span className="font-semibold">{r?.diasProm == null ? '—' : `${num(r.diasProm)} d`}</span>
        {r?.diasMax != null && <span className="block text-[11px] text-gray-400">máx. {r.diasMax}</span>}
      </span>
      <span>
        <span className="font-semibold">{r?.lead == null ? '—' : `${num(r.lead)} d`}</span>
        {r?.recibidos > 0 && <span className="block text-[11px] text-gray-400">{r.recibidos} recib.</span>}
      </span>
    </Tag>
  )
}

export default function IndicadoresLogistica({ mensual: mensualTotal, porBodega = [] }) {
  const [modo, setModoE] = useState(() => leer('inicio-pedidos-modo', 'mes'))
  const [bodegaG, setBodegaG] = useState(() => leer('inicio-pedidos-bodega', ''))
  const [mesSel, setMesSel] = useState(null)
  const tarjeta = useRef(null)
  if (!mensualTotal?.length) return null

  const setModo = m => { setModoE(m); guardar('inicio-pedidos-modo', m) }
  const setBodega = a => { setBodegaG(a); guardar('inicio-pedidos-bodega', a) }
  const mesActual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7)
  const meses = mensualTotal.map(r => r.mes)
  const mes = meses.includes(mesSel) ? mesSel : meses[meses.length - 1]
  const bod = porBodega.find(b => b.area === bodegaG) || null // null = Todas
  const deMes = (serie, k) => serie.find(r => r.mes === k)

  // Desde una fila de bodega (vista por mes) se pasa a ver esa bodega mes a mes
  const verBodega = a => { setBodega(a); setModo('bodega'); tarjeta.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  // ── Datos de la vista ──
  let grafica, titulo, filas
  if (modo === 'mes') {
    const total = deMes(mensualTotal, mes)
    const deBodegas = porBodega.map(b => ({ area: b.area, r: deMes(b.mensual, mes) })).filter(x => x.r && (x.r.total > 0 || x.r.recibidos > 0))
    titulo = `Entrega promedio por bodega · ${mesLargo(mes)}`
    grafica = { tipo: 'h', datos: deBodegas.filter(x => x.r.lead != null).sort((a, b) => b.r.lead - a.r.lead).map(x => ({ k: x.area, etiqueta: cap(x.area), v: x.r.lead, n: x.r.recibidos })) }
    filas = <>
      <Fila r={total} nombre="Todas" detalle={pedidosTxt(total?.total)} fuerte />
      {deBodegas.sort((a, b) => b.r.total - a.r.total).map(x => (
        <Fila key={x.area} r={x.r} nombre={cap(x.area)} detalle={pedidosTxt(x.r.total)} onClick={() => verBodega(x.area)} />
      ))}
    </>
  } else {
    const serie = bod ? bod.mensual : mensualTotal
    titulo = `Entrega promedio por mes · ${bod ? cap(bod.area) : 'todas las bodegas'}`
    grafica = { tipo: 'v', datos: serie.map(r => ({ k: r.mes, etiqueta: mesCorto(r.mes), v: r.lead, n: r.recibidos, actual: r.mes === mesActual })) }
    filas = [...serie].reverse().filter(r => r.total > 0 || r.recibidos > 0).map(r => (
      <Fila key={r.mes} r={r} nombre={<>{mesCorto(r.mes)}{r.mes === mesActual && <span className="hidden sm:inline ml-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">en curso</span>}</>}
        detalle={pedidosTxt(r.total)} />
    ))
  }
  const conDato = grafica.datos.filter(d => d.v != null)
  const max = Math.max(1, ...conDato.map(d => d.v))

  return (
    <article ref={tarjeta} className="lg:col-span-2 bg-white border border-feisen-borde rounded-xl min-w-0 scroll-mt-4">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-feisen-borde-suave">
        <ChartBar size={18} weight="duotone" className="text-feisen-azul" />
        <h3 className="text-sm font-semibold text-feisen-texto flex-1">Pedidos</h3>
      </div>

      {/* Primero: cómo mirar. Luego: los botones de ese eje */}
      <div className="px-4 pt-3.5 space-y-2.5">
        <div className="inline-flex border border-feisen-borde rounded-lg overflow-hidden" role="group" aria-label="Ver los pedidos">
          {[['mes', 'Ver por mes'], ['bodega', 'Ver por bodega']].map(([k, t]) => (
            <button key={k} onClick={() => setModo(k)} aria-pressed={modo === k}
              className={`px-3.5 py-1.5 text-[13px] ${modo === k ? 'bg-feisen-azul-suave text-feisen-azul font-semibold' : 'text-feisen-texto-2 hover:bg-feisen-fondo'}`}>{t}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={modo === 'mes' ? 'Mes' : 'Bodega'}>
          {modo === 'mes'
            ? [...meses].reverse().map(k => (
                <Chip key={k} activo={k === mes} onClick={() => setMesSel(k)}>{mesCorto(k)}{k === mesActual ? ' (en curso)' : ''}</Chip>
              ))
            : [{ area: '', total: porBodega.reduce((t, b) => t + b.total, 0) }, ...porBodega].map(b => (
                <Chip key={b.area || 'todas'} activo={(bod?.area || '') === b.area} onClick={() => setBodega(b.area)}>
                  {b.area ? cap(b.area) : 'Todas'} <span className="tabular-nums opacity-70">{b.total}</span>
                </Chip>
              ))}
        </div>
      </div>

      {/* Gráfica de tiempo de entrega */}
      <div className="px-4 py-3.5 border-b border-feisen-borde-suave min-w-0">
        <p className="text-[13px] font-semibold text-feisen-texto">{titulo}</p>
        <p className="text-xs text-gray-400">Días calendario de pedido a recibido, según el mes en que llegó</p>
        {conDato.length === 0 ? (
          <p className="text-sm text-feisen-texto-2 mt-3">Aún no hay pedidos recibidos para mostrar.</p>
        ) : grafica.tipo === 'h' ? (
          <div className="mt-3 space-y-1.5">
            {conDato.map(d => (
              <div key={d.k} className="grid grid-cols-[96px,minmax(0,1fr),56px] gap-2 items-center text-[13px]" title={`${d.n} pedidos recibidos`}>
                <span className="truncate text-feisen-texto-2">{d.etiqueta}</span>
                <span className="h-2.5 rounded bg-feisen-borde-suave overflow-hidden"><span className="block h-full rounded bg-feisen-azul" style={{ width: `${Math.max(3, (d.v / max) * 100)}%` }} /></span>
                <span className="text-right font-semibold tabular-nums">{num(d.v)} d</span>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Barras en HTML (no SVG escalado) para que el texto quede del mismo tamaño en celular y en PC */}
            <div className="flex items-end gap-2 sm:gap-4 h-36 mt-3 border-b border-feisen-borde">
              {grafica.datos.map(d => (
                <div key={d.k} className="flex-1 max-w-[64px] h-full flex flex-col justify-end items-center" title={d.v == null ? 'Sin pedidos recibidos' : `${d.n} pedidos recibidos`}>
                  {d.v != null && <>
                    <span className="text-xs font-semibold tabular-nums text-feisen-texto mb-1">{num(d.v)} d</span>
                    <div className={`w-full rounded-t ${d.actual ? 'bg-[#9DB5D6]' : 'bg-feisen-azul'}`} style={{ height: `${Math.max(3, (d.v / max) * 78)}%` }} />
                  </>}
                </div>
              ))}
            </div>
            <div className="flex gap-2 sm:gap-4 mt-1">
              {grafica.datos.map(d => <span key={d.k} className="flex-1 max-w-[64px] text-center text-[11px] text-gray-400">{d.etiqueta}</span>)}
            </div>
            {grafica.datos.some(d => d.actual && d.v != null) && <p className="text-[11.5px] text-gray-400 mt-1">La barra clara es el mes en curso.</p>}
          </>
        )}
      </div>

      {/* Lista compacta: los 4 indicadores */}
      <div className={`${FILA} px-4 pt-2.5 pb-1.5 text-[11px] uppercase tracking-wide text-gray-400`}>
        <span className="text-left">{modo === 'mes' ? 'Bodega' : 'Mes'}</span>
        <span>Urgentes</span><span>Con retraso</span><span>Días retraso</span><span>Entrega</span>
      </div>
      <div className="divide-y divide-feisen-borde-suave border-t border-feisen-borde-suave">{filas}</div>
      {modo === 'mes' && <p className="px-4 pt-2 text-[11.5px] text-gray-400">Toca una bodega para ver sus meses.</p>}

      <p className="px-4 py-2.5 text-[11.5px] text-gray-400 leading-relaxed">
        Bodega = área que hizo el pedido. Urgentes y retrasos según el mes en que se hizo el pedido; el retraso es en días hábiles contra la fecha estimada, en los que ya llegaron o ya pasaron esa fecha sin llegar (los cerrados sin recibir no cuentan). Días retraso: promedio y máximo de los atrasados.
      </p>
    </article>
  )
}
