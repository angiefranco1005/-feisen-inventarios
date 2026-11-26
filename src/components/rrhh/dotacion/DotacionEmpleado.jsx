import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import Spinner from '../../shared/Spinner'
import { Shirt, Plus } from '../../shared/iconos'
import * as E from '../estilos'
import { formatoPesos, formatoFecha } from '../catalogosRRHH'

// Sección "Dotación" de la ficha: lo que se le ha entregado a la persona
export default function DotacionEmpleado({ empleadoId }) {
  const navigate = useNavigate()
  const [entregas, setEntregas] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    (async () => {
      setCargando(true)
      const { data } = await supabase.from('dotacion_entregas').select('*, dotacion_entrega_items(*)')
        .eq('empleado_id', empleadoId).order('fecha_entrega', { ascending: false })
      setEntregas(data || [])
      setCargando(false)
    })()
  }, [empleadoId])

  const asumido = entregas.filter(e => e.asume_costo).reduce((t, e) => t + (Number(e.total) || 0), 0)

  return (
    <div className={E.tarjeta}>
      <div className={E.cabTarjeta}>
        <h2 className={E.tituloTarj}><Shirt {...E.ICONO} className={E.iconoTitulo} /> Dotación entregada</h2>
        <button onClick={() => navigate('/rrhh/dotacion')} className={`${E.btnTextoAzul} -mr-2`}><Plus size={14} /> Entregar</button>
      </div>
      {cargando ? <Spinner /> : entregas.length === 0 ? (
        <p className="px-5 py-4 text-sm text-feisen-gris-medio">Aún no se le ha entregado dotación. Se registra en Bodega Administración → Entregar dotación.</p>
      ) : (
        <>
          {asumido > 0 && <p className="px-5 pt-3 text-xs text-amber-700">Ha asumido {formatoPesos(asumido)} en dotación (descontado en nómina).</p>}
          <div className="divide-y divide-feisen-borde-suave">
            {entregas.map(en => (
              <div key={en.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-feisen-texto">{formatoFecha(en.fecha_entrega)}
                    <span className="font-normal text-feisen-gris-medio"> · salida {en.numero_salida || '—'}</span></p>
                  <span className={`text-xs ${en.asume_costo ? 'text-amber-700' : 'text-feisen-gris-medio'}`}>
                    {formatoPesos(en.total)} · {en.asume_costo ? 'la asume el trabajador' : 'la asume Feisen'}
                  </span>
                </div>
                <ul className="mt-1 text-sm text-feisen-texto-2 space-y-0.5">
                  {(en.dotacion_entrega_items || []).map(l => (
                    <li key={l.id}>{Number(l.cantidad).toLocaleString('es-CO')} × {l.descripcion}</li>
                  ))}
                </ul>
                {en.observaciones && <p className="text-xs text-feisen-gris-medio mt-1">{en.observaciones}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
