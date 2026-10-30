import { useState } from 'react'
import { razonCiclico, INICIO_CICLICO, MESES_CICLO } from '../../utils/conteoCiclico'
import { RefreshCw, Printer, Check, ChevronDown } from '../shared/iconos'

// "2026-11" → "noviembre de 2026"
export const nombreMes = mes => new Date(`${mes}-15T12:00:00`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

// Tarjeta "Conteo cíclico" del mes en Inventario físico (ver utils/conteoCiclico.js)
export default function ConteoCiclico({ datos, borradorDe, onContar, onImprimir, ocupado }) {
  const [abierta, setAbierta] = useState(null) // bodega_id con la lista desplegada
  if (datos.antesDeIniciar) return (
    <section className="bg-white border border-feisen-borde rounded-xl p-4 flex items-start gap-2">
      <RefreshCw size={17} className="shrink-0 mt-0.5 text-feisen-azul" />
      <div className="min-w-0">
        <h2 className="font-semibold text-feisen-texto">El conteo cíclico arranca el 1 de {nombreMes(INICIO_CICLICO)}</h2>
        <p className="text-sm text-feisen-texto-2">
          Desde ese día, cada mes sale aquí una lista corta de productos al azar por bodega, para contar todo el inventario cada {MESES_CICLO} meses.
        </p>
      </div>
    </section>
  )
  const { mes, porBodega, totalItems, totalCubiertos } = datos
  const totalMes = porBodega.reduce((s, b) => s + b.elegidos.length, 0)
  const listas = porBodega.filter(b => b.hechos >= b.elegidos.length).length
  const pct = totalItems ? Math.round((totalCubiertos / totalItems) * 100) : 0

  return (
    <section className="bg-white border border-feisen-borde rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-feisen-texto flex items-center gap-1.5">
            <RefreshCw size={17} className="shrink-0 text-feisen-azul" />
            Conteo cíclico · {nombreMes(mes)}
          </h2>
          <p className="text-sm text-feisen-texto-2">
            {totalMes.toLocaleString('es-CO')} productos escogidos al azar. Cambian el 1 de cada mes.
          </p>
        </div>
        <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${listas === porBodega.length ? 'bg-emerald-50 text-emerald-700' : 'bg-feisen-fondo text-feisen-texto-2'}`}>
          {listas} de {porBodega.length} bodegas listas
        </span>
      </div>

      <div>
        <div className="flex justify-between gap-2 text-xs text-feisen-texto-2 mb-1">
          <span>Inventario contado en los últimos {MESES_CICLO} meses</span>
          <span className="tabular-nums">{totalCubiertos.toLocaleString('es-CO')} de {totalItems.toLocaleString('es-CO')} · {pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-feisen-borde-suave overflow-hidden">
          <div className="h-full rounded-full bg-feisen-azul" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="divide-y divide-feisen-borde-suave border-t border-feisen-borde-suave">
        {porBodega.map(b => {
          const lista = b.hechos >= b.elegidos.length
          const borrador = borradorDe(b)
          const abiertaEsta = abierta === b.bodega_id
          return (
            <div key={b.bodega_id} className="py-2.5">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setAbierta(abiertaEsta ? null : b.bodega_id)} aria-expanded={abiertaEsta}
                  className="flex-1 min-w-0 text-left flex items-center gap-1.5">
                  <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${abiertaEsta ? '' : '-rotate-90'}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-feisen-texto">
                      {b.bodega} <span className="font-normal text-feisen-texto-2">· {b.elegidos.length} este mes</span>
                    </span>
                    <span className="block text-xs text-gray-400">
                      {b.total.toLocaleString('es-CO')} productos · todo cada {b.mesesCiclo} meses
                    </span>
                  </span>
                </button>
                {lista ? (
                  <span className="text-xs font-medium text-emerald-700 inline-flex items-center gap-1 px-2"><Check size={14} /> Listo</span>
                ) : (
                  <>
                    {b.hechos > 0 && <span className="text-xs text-feisen-texto-2 tabular-nums whitespace-nowrap">{b.hechos} de {b.elegidos.length}</span>}
                    <button type="button" onClick={() => onImprimir(b)} aria-label={`Imprimir planilla de ${b.bodega}`} title="Imprimir planilla"
                      className="p-2 rounded-lg border border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo min-h-[40px]"><Printer size={16} /></button>
                    <button type="button" onClick={() => onContar(b, borrador)} disabled={ocupado}
                      className="border border-feisen-azul text-feisen-azul bg-white rounded-lg px-3 min-h-[40px] text-sm font-semibold hover:bg-feisen-azul-suave disabled:opacity-60">
                      {borrador ? 'Seguir' : 'Contar'}
                    </button>
                  </>
                )}
              </div>
              {abiertaEsta && (
                <ol className="mt-2 ml-6 text-sm divide-y divide-feisen-borde-suave">
                  {b.elegidos.map((e, i) => (
                    <li key={e.key} className="flex justify-between gap-3 py-1.5">
                      <span className="min-w-0 text-feisen-texto">{i + 1}. {e.nombre}</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{razonCiclico(e)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
