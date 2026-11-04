import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Search, Tag } from '../shared/iconos'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import { EncabezadoPagina, useAtajoBuscar } from '../shared/ui'
import { coincideBusqueda } from '../../utils/busqueda'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { formatoOF } from '../of/shared/formatters'
import { fechaCorta } from './planillasDatos'

const input = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul'

// Trazabilidad de máquinas: número → quién la armó y cuándo → a qué OF / cliente se despachó.
// La ven Ensamble (/ensamble/seriales) y Ventas (/of/seriales).
export default function SerialesMaquina() {
  const [seriales, setSeriales] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const buscador = useRef(null)
  useAtajoBuscar(buscador)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data: sers, error: e1 } = await fetchAllPages((d, h) =>
      supabase.from('seriales_maquina').select('*').order('created_at', { ascending: false }).order('id').range(d, h))
    if (e1) { setError('No se pudieron cargar las máquinas: ' + e1.message); setCargando(false); return }
    // Entrega y OF solo de las máquinas despachadas
    const despachadas = (sers || []).filter(s => s.estado === 'despachada')
    const entregaIds = [...new Set(despachadas.map(s => s.of_entrega_id).filter(Boolean))]
    const itemIds = [...new Set(despachadas.map(s => s.item_of_id).filter(Boolean))]
    const [{ data: entregas }, { data: items }] = await Promise.all([
      entregaIds.length ? supabase.from('of_entregas').select('id, orden_despacho, fecha').in('id', entregaIds) : { data: [] },
      itemIds.length ? supabase.from('items_of').select('id, producto, ordenes_fabricacion(numero, cliente)').in('id', itemIds) : { data: [] },
    ])
    const entregaPor = Object.fromEntries((entregas || []).map(e => [e.id, e]))
    const itemPor = Object.fromEntries((items || []).map(i => [i.id, i]))
    setSeriales((sers || []).map(s => ({ ...s, entrega: entregaPor[s.of_entrega_id], itemOF: itemPor[s.item_of_id] })))
    setError('')
    setCargando(false)
  }

  const disponibles = seriales.filter(s => s.estado === 'disponible').length
  const visibles = seriales.filter(s => {
    if (filtro !== 'todas' && s.estado !== filtro) return false
    if (!busqueda.trim()) return true
    const of = s.itemOF?.ordenes_fabricacion
    return coincideBusqueda([s.serial, s.modelo, s.hecha_por, of && formatoOF(of.numero), of?.cliente, s.entrega?.orden_despacho].join(' '), busqueda)
  })

  if (cargando) return <Spinner />

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-24">
      <EncabezadoPagina modulo="Máquinas" titulo="Números de máquina"
        subtitulo="Quién armó cada máquina y a qué cliente se despachó" />

      {error && <Alerta tipo="error" mensaje={error} />}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-texto-2" />
          <input ref={buscador} value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Número, modelo, contratista, OF o cliente" className={`${input} pl-9`} />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {[['todas', 'Todas', seriales.length], ['disponible', 'Sin despachar', disponibles], ['despachada', 'Despachadas', seriales.length - disponibles]].map(([k, t, n]) => (
            <button key={k} onClick={() => setFiltro(k)}
              className={`px-3 min-h-[40px] rounded-lg text-sm font-medium whitespace-nowrap border ${filtro === k ? 'bg-feisen-azul-suave text-feisen-azul border-transparent' : 'bg-white border-feisen-borde text-feisen-texto-2'}`}>
              {t} · {n}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl p-8 text-center">
          <Tag size={28} className="mx-auto text-feisen-texto-2" />
          <p className="font-semibold text-feisen-texto mt-2">{seriales.length === 0 ? 'Todavía no hay máquinas numeradas' : 'Ninguna máquina coincide'}</p>
          <p className="text-sm text-feisen-texto-2 mt-1">
            {seriales.length === 0
              ? 'Los números aparecen cuando Ensamble pasa una planilla con máquinas completas.'
              : 'Prueba con otra palabra o quita el filtro.'}
          </p>
        </div>
      ) : (
        <ul className="bg-white border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
          {visibles.map(s => {
            const of = s.itemOF?.ordenes_fabricacion
            return (
              <li key={s.id} className="px-4 py-3 flex items-start gap-3">
                <span className="font-mono font-semibold text-feisen-texto text-base w-14 sm:w-20 shrink-0 tabular-nums">{s.serial}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-feisen-texto">{s.modelo}</p>
                  <p className="text-sm text-feisen-texto-2">Armó {s.hecha_por || '—'} · {fechaCorta(s.fecha_fabricacion)}</p>
                  {s.estado === 'despachada' && (
                    <p className="text-sm text-feisen-texto-2">
                      {of ? `${formatoOF(of.numero)}${of.cliente ? ` · ${of.cliente}` : ''}` : 'OF'}
                      {s.entrega?.orden_despacho && ` · ${s.entrega.orden_despacho}`}
                      {s.entrega?.fecha && ` · ${fechaCorta(s.entrega.fecha)}`}
                    </p>
                  )}
                </div>
                <span className={`text-xs font-medium rounded-md px-2 py-0.5 shrink-0 ${s.estado === 'despachada' ? 'bg-feisen-fondo text-feisen-texto-2' : 'bg-feisen-azul-suave text-feisen-azul'}`}>
                  {s.estado === 'despachada' ? 'Despachada' : 'En planta'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
