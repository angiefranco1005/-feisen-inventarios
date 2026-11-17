import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Search, Tag } from '../shared/iconos'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import { EncabezadoPagina, useAtajoBuscar } from '../shared/ui'
import { coincideBusqueda } from '../../utils/busqueda'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { fechaCorta } from './planillasDatos'

const input = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul'

// Números de máquina de las planillas de Ensamble: quién armó cada máquina y cuándo.
// Por ahora no se enlaza con las entregas de las OF (decisión de Angie, 17/11/2026).
export default function SerialesMaquina() {
  const [seriales, setSeriales] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const buscador = useRef(null)
  useAtajoBuscar(buscador)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data, error: e1 } = await fetchAllPages((d, h) =>
      supabase.from('seriales_maquina').select('*').order('created_at', { ascending: false }).order('id').range(d, h))
    setError(e1 ? 'No se pudieron cargar las máquinas: ' + e1.message : '')
    setSeriales(data || [])
    setCargando(false)
  }

  const visibles = seriales.filter(s => coincideBusqueda([s.serial, s.modelo, s.hecha_por].join(' '), busqueda))

  if (cargando) return <Spinner />

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-24">
      <EncabezadoPagina modulo="Ensamble" titulo="Números de máquina"
        subtitulo={`Quién armó cada máquina y cuándo · ${seriales.length} numerada${seriales.length === 1 ? '' : 's'}`} />

      {error && <Alerta tipo="error" mensaje={error} />}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-texto-2" />
        <input ref={buscador} value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Número, modelo o contratista" className={`${input} pl-9`} />
      </div>

      {visibles.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl p-8 text-center">
          <Tag size={28} className="mx-auto text-feisen-texto-2" />
          <p className="font-semibold text-feisen-texto mt-2">{seriales.length === 0 ? 'Todavía no hay máquinas numeradas' : 'Ninguna máquina coincide'}</p>
          <p className="text-sm text-feisen-texto-2 mt-1">
            {seriales.length === 0
              ? 'Los números aparecen cuando se pasa una planilla con máquinas completas.'
              : 'Prueba con otra palabra.'}
          </p>
        </div>
      ) : (
        <ul className="bg-white border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
          {visibles.map(s => (
            <li key={s.id} className="px-4 py-3 flex items-start gap-3">
              <span className="font-mono font-semibold text-feisen-texto text-base w-14 sm:w-20 shrink-0 tabular-nums">{s.serial}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-feisen-texto">{s.modelo}</p>
                <p className="text-sm text-feisen-texto-2">Armó {s.hecha_por || '—'} · {fechaCorta(s.fecha_fabricacion)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
