import { Link } from 'react-router-dom'
import { PASOS } from '../pasos/datosPasos'

// Etapas del costeo de UNA máquina (2026-11-26, Angie: "cuando entre a cada máquina ahí sí se muestren
// las etapas"). Va arriba del tablero de la máquina y de cada paso, siempre con la misma máquina.
// activa: 'resumen' | 'despiece' | 'ruta' | 'materia' | 'tiempos'. cuentas: { [paso]: cuántas faltan }.
export default function EtapasMaquina({ maquinaId, activa, cuentas }) {
  const etapas = [{ id: 'resumen', etiqueta: 'Precio y utilidad', to: `/costeo/maquina/${maquinaId}` }].concat(
    PASOS.map((p) => ({ id: p.id, etiqueta: `${p.n} · ${p.nombre}`, to: `/costeo/pasos/${p.id}?maquina=${maquinaId}` }))
  )
  return (
    <nav aria-label="Etapas del costeo de esta máquina" className="flex gap-1 overflow-x-auto border-b border-feisen-borde -mx-1 px-1">
      {etapas.map((e) => {
        const on = e.id === activa
        return (
          <Link
            key={e.id}
            to={e.to}
            aria-current={on ? 'page' : undefined}
            className={`shrink-0 inline-flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm border-b-2 -mb-px ${
              on ? 'border-feisen-azul text-feisen-azul font-semibold' : 'border-transparent text-feisen-texto-2 hover:text-feisen-texto'
            }`}
          >
            {e.etiqueta}
            {cuentas?.[e.id] > 0 && (
              <span className="min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums bg-amber-100 text-amber-800">{cuentas[e.id]}</span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
