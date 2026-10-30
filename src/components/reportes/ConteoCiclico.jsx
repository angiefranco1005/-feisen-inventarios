import { useState } from 'react'
import { razonCiclico } from '../../utils/conteoCiclico'
import { RefreshCw, Printer, Check, ChevronDown } from '../shared/iconos'

const fechaCorta = f => new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

// Tarjeta "Conteo cíclico de esta semana" de Inventario físico (ver utils/conteoCiclico.js)
export default function ConteoCiclico({ datos, borradorDe, onContar, onImprimir, ocupado }) {
  const [abierta, setAbierta] = useState(null) // bodega_id con la lista desplegada
  const { semana, porBodega, totalItems, totalCubiertos } = datos
  const fin = new Date(`${semana}T12:00:00`); fin.setDate(fin.getDate() + 6)
  const totalSemana = porBodega.reduce((s, b) => s + b.elegidos.length, 0)
  const listas = porBodega.filter(b => b.hechos >= b.elegidos.length).length
  const pct = totalItems ? Math.round((totalCubiertos / totalItems) * 100) : 0

  return (
    <section className="bg-white border border-feisen-borde rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-feisen-texto flex items-center gap-1.5">
            <RefreshCw size={17} className="shrink-0 text-feisen-azul" />
            Conteo cíclico · semana del {fechaCorta(semana)} al {fechaCorta(fin.toLocaleDateString('en-CA'))}
          </h2>
          <p className="text-sm text-feisen-texto-2">
            {totalSemana.toLocaleString('es-CO')} productos escogidos al azar. Cambian el lunes.
          </p>
        </div>
        <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${listas === porBodega.length ? 'bg-emerald-50 text-emerald-700' : 'bg-feisen-fondo text-feisen-texto-2'}`}>
          {listas} de {porBodega.length} bodegas listas
        </span>
      </div>

      <div>
        <div className="flex justify-between gap-2 text-xs text-feisen-texto-2 mb-1">
          <span>Inventario contado en los últimos 90 días</span>
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
                      {b.bodega} <span className="font-normal text-feisen-texto-2">· {b.elegidos.length} esta semana</span>
                    </span>
                    <span className="block text-xs text-gray-400">
                      {b.total.toLocaleString('es-CO')} productos{b.cadaMes ? ' · se cuenta cada mes' : ''}
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
