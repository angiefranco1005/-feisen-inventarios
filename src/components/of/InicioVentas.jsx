import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Alerta from './shared/Alerta'
import { formatoOF, formatFecha, hoyISO, nombreTransporte } from './shared/formatters'
import { useAutoRefrescar } from './shared/useAutoRefrescar'
import { FilePlus, Truck, ChevronRight } from '../shared/iconos'

// Inicio de los asesores y la gerente de ventas (OF con Registra o Todo):
// crear una OF y ver qué pedidos tienen que salir hoy. Lo que todavía no está fabricado va primero.
export default function InicioVentas() {
  const { perfil } = useAuth()
  const [ordenes, setOrdenes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { cargar().finally(() => setCargando(false)) }, [])
  useAutoRefrescar(cargar)

  async function cargar() {
    const { data, error } = await supabase.from('ordenes_fabricacion')
      .select('id, numero, cliente, ciudad, fecha_promesa, transporte, nombre_transportadora, cancelada, items_of(*)')
      .eq('cancelada', false)
      .lte('fecha_promesa', hoyISO())
    if (error) setError(error.message)
    setOrdenes(data || [])
  }

  if (cargando) return <Spinner texto="Cargando pedidos de hoy..." />

  const hoy = hoyISO()
  // Pendiente de despachar por ítem; lo que ya está fabricado sale, lo demás falta fabricar
  const conPendiente = ordenes
    .map(o => ({ ...o, items: (o.items_of || []).filter(it => it.cantidad > it.entregado) }))
    .filter(o => o.items.length > 0)
  const faltaFabricar = o => o.items.some(it => it.producido < it.cantidad)
  const deHoy = conPendiente.filter(o => o.fecha_promesa === hoy)
    .sort((a, b) => Number(faltaFabricar(b)) - Number(faltaFabricar(a)) || a.numero - b.numero)
  const atrasadas = conPendiente.filter(o => o.fecha_promesa < hoy).length
  const nombre = (perfil?.nombre || '').trim().split(' ')[0]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-feisen-texto">{nombre ? `Hola, ${nombre}` : 'Inicio'}</h1>
          <p className="text-sm text-feisen-texto-2 mt-0.5">Pedidos que salen hoy, {formatFecha(hoy)}.</p>
        </div>
        <Link to="/of/nueva"
          className="flex items-center gap-2 bg-feisen-azul hover:bg-feisen-azul-claro text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
          <FilePlus size={18} /> Crear orden de fabricación
        </Link>
      </div>

      {error && <Alerta tipo="error" mensaje={`No se pudieron cargar los pedidos: ${error}`} />}

      {atrasadas > 0 && (
        <Link to="/of/ordenes"
          className="flex items-center justify-between gap-3 bg-feisen-rojo-suave text-feisen-rojo border border-feisen-rojo/20 rounded-xl px-4 py-3 text-sm font-medium">
          <span>{atrasadas === 1 ? '1 OF ya pasó su fecha de entrega y no ha salido completa.' : `${atrasadas} OF ya pasaron su fecha de entrega y no han salido completas.`}</span>
          <ChevronRight size={16} className="flex-shrink-0" />
        </Link>
      )}

      <section className="bg-white border border-feisen-borde rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-feisen-borde-suave">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Salen hoy</h2>
          <span className="text-xs text-feisen-texto-2 tabular-nums">{deHoy.length} {deHoy.length === 1 ? 'pedido' : 'pedidos'}</span>
        </div>
        {deHoy.length === 0 ? (
          <p className="px-4 py-8 text-sm text-feisen-texto-2 text-center">
            Hoy no hay pedidos por despachar. Las próximas entregas están en el{' '}
            <Link to="/of/calendario" className="text-feisen-azul font-medium hover:underline">Calendario</Link>.
          </p>
        ) : (
          <ul className="divide-y divide-feisen-borde-suave">
            {deHoy.map(o => {
              const falta = faltaFabricar(o)
              return (
                <li key={o.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-feisen-texto min-w-0">
                      <span className="font-semibold text-feisen-azul tabular-nums">{formatoOF(o.numero)}</span>
                      <span className="font-medium ml-1.5">{o.cliente}</span>
                    </p>
                    <span className={`flex-shrink-0 rounded-md px-2 py-0.5 text-xs font-medium
                      ${falta ? 'bg-amber-50 text-amber-700' : 'bg-feisen-azul-suave text-feisen-azul'}`}>
                      {falta ? 'Falta fabricar' : 'Listo para despachar'}
                    </span>
                  </div>
                  <p className="text-xs text-feisen-texto-2 mt-1 flex items-center gap-1.5">
                    <Truck size={14} /> {o.ciudad} · {nombreTransporte(o)}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {o.items.map(it => {
                      const porSalir = it.cantidad - it.entregado
                      const sinFabricar = it.cantidad - it.producido
                      return (
                        <li key={it.id} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-feisen-texto min-w-0">{it.producto}</span>
                          <span className="text-feisen-texto-2 tabular-nums text-right flex-shrink-0">
                            {porSalir} por despachar
                            {sinFabricar > 0 && <span className="text-amber-700"> · {sinFabricar} sin fabricar</span>}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
