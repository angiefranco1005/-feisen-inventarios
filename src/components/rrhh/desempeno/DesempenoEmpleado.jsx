import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import Spinner from '../../shared/Spinner'
import { Target, ChevronRight } from 'lucide-react'
import * as E from '../estilos'
import { formatoFecha } from '../catalogosRRHH'
import { resultadoFinal, porcentaje, etiquetaDe, nivelDesempeno, ESTADOS_EVAL, POTENCIALES, CUADRANTES } from './desempenoCalculo'

const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 }))

// Sección "Desempeño" de la ficha: historial de evaluaciones de la persona
export default function DesempenoEmpleado({ empleadoId }) {
  const navigate = useNavigate()
  const [evals,    setEvals]    = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    (async () => {
      setCargando(true)
      const { data } = await supabase.from('desempeno_evaluaciones')
        .select('*, desempeno_ciclos(id, nombre, fecha_inicio, fecha_fin, escala)')
        .eq('empleado_id', empleadoId)
      setEvals((data || []).sort((a, b) => (b.desempeno_ciclos?.fecha_inicio || '').localeCompare(a.desempeno_ciclos?.fecha_inicio || '')))
      setCargando(false)
    })()
  }, [empleadoId])

  const completas = evals.filter(e => e.estado === 'completa' && resultadoFinal(e) !== null)

  return (
    <div className={E.tarjeta}>
      <div className={E.cabTarjeta}>
        <h2 className={E.tituloTarj}><Target {...E.ICONO} className={E.iconoTitulo} /> Evaluaciones de desempeño</h2>
        <span className={E.etiqueta}>{evals.length}</span>
      </div>
      {cargando ? <Spinner /> : evals.length === 0 ? (
        <p className="px-5 py-4 text-sm text-feisen-gris-medio">Aún no tiene evaluaciones. Se crean desde Desempeño → Nuevo ciclo.</p>
      ) : (
        <>
          {completas.length > 1 && (
            // Evolución: una barra por evaluación completa, de la más antigua a la más reciente
            <div className="px-5 pt-4 flex items-end gap-2 h-24">
              {[...completas].reverse().map(e => {
                const pct = porcentaje(resultadoFinal(e), e.desempeno_ciclos?.escala) || 0
                return (
                  <div key={e.id} className="flex-1 flex flex-col items-center justify-end h-full" title={`${e.desempeno_ciclos?.nombre}: ${fmt(resultadoFinal(e))}`}>
                    <span className="text-[10px] text-feisen-texto-2">{fmt(resultadoFinal(e))}</span>
                    <div className="w-full max-w-10 rounded-t bg-feisen-azul/70" style={{ height: `${Math.max(6, pct * 0.6)}%` }} />
                  </div>
                )
              })}
            </div>
          )}
          <div className="divide-y divide-feisen-borde-suave mt-2">
            {evals.map(e => {
              const c = e.desempeno_ciclos
              const final = resultadoFinal(e)
              const nivel = nivelDesempeno(final, c?.escala)
              return (
                <button key={e.id} onClick={() => navigate(`/rrhh/desempeno/${c?.id}/${e.id}`)}
                  className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-feisen-fondo text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-feisen-texto truncate">{c?.nombre}</p>
                    <p className="text-xs text-feisen-gris-medio truncate">
                      {formatoFecha(c?.fecha_inicio)} – {formatoFecha(c?.fecha_fin)} · {ESTADOS_EVAL[e.estado]?.label}
                      {e.potencial && ` · potencial ${POTENCIALES.find(p => p.value === e.potencial)?.label.toLowerCase()}`}
                      {nivel && e.potencial && ` · ${CUADRANTES[e.potencial][nivel]}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-feisen-texto">{fmt(final)}</p>
                    {final !== null && <p className="text-[11px] text-feisen-gris-medio">{etiquetaDe(final, c?.escala)}</p>}
                  </div>
                  <ChevronRight size={16} strokeWidth={1.8} className="text-feisen-gris-medio" />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
