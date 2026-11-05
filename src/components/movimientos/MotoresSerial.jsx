import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Search, Engine } from '../shared/iconos'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import { EncabezadoPagina, useAtajoBuscar } from '../shared/ui'
import { coincideBusqueda } from '../../utils/busqueda'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { formatoOF } from '../of/shared/formatters'

const input = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul'

// Rastreo de motores por serial (pedido de Angie, 5/11/2026): de cada motor de la bodega MOTORES,
// cuándo entró, cuándo salió, en qué OF y a qué cliente. Lee motor_seriales (la base la mantiene
// sola, ver supabase/migraciones/2026-11-05_motores_rastreo_serial.sql) y saca el cliente de la OF.

const fecha = m => {
  const iso = m?.fecha_movimiento || m?.created_at
  if (!iso) return '—'
  const [a, me, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${me}/${a}`
}

// "253", "OF 253", "OF-0253", "OC 202" (mal escrito por OF), "055" → 253 / 202 / 55
const numeroDeOF = t => {
  const m = String(t || '').match(/^\s*(?:O\s*[FC])?\s*[-#.]?\s*0*(\d{1,4})\s*$/i)
  return m ? Number(m[1]) : null
}

async function porLotes(ids, consulta) {
  const out = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await consulta(ids.slice(i, i + 100))
    if (error) throw error
    out.push(...(data || []))
  }
  return out
}

export default function MotoresSerial() {
  const [motores, setMotores] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const buscador = useRef(null)
  useAtajoBuscar(buscador)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    try {
      const { data: filas, error: e1 } = await fetchAllPages((d, h) =>
        supabase.from('motor_seriales').select('*, items(nombre)').order('created_at', { ascending: false }).order('id').range(d, h))
      if (e1) throw e1
      const ids = [...new Set((filas || []).flatMap(f => [f.entrada_mov_id, f.salida_mov_id]).filter(Boolean))]
      const [movs, { data: ofs }] = await Promise.all([
        porLotes(ids, lote => supabase.from('movimientos')
          .select('id, numero, fecha_movimiento, created_at, proveedor, destino, pedidos(numero)').in('id', lote)),
        // Sin permiso de ver OF, esto vuelve vacío y la pantalla muestra solo el número
        fetchAllPages((d, h) => supabase.from('ordenes_fabricacion').select('numero, cliente, ciudad').order('numero').range(d, h)),
      ])
      const movPor = Object.fromEntries(movs.map(m => [m.id, m]))
      const ofPor = Object.fromEntries((ofs || []).map(o => [o.numero, o]))
      setMotores((filas || []).map(f => {
        const n = numeroDeOF(f.numero_of)
        const entrada = movPor[f.entrada_mov_id] || null
        const salida = movPor[f.salida_mov_id] || null
        return {
          ...f, entrada, salida,
          of: n != null ? (ofPor[n] || { numero: n }) : null,
          orden: (salida?.fecha_movimiento || f.despachado_en || entrada?.fecha_movimiento || f.created_at || ''),
        }
      }).sort((a, b) => String(b.orden).localeCompare(String(a.orden))))
      setError('')
    } catch (e) {
      setError('No se pudieron cargar los motores: ' + (e.message || e))
    }
    setCargando(false)
  }

  const enBodega = motores.filter(m => m.estado === 'disponible').length
  const visibles = useMemo(() => motores.filter(m => {
    if (filtro !== 'todos' && m.estado !== filtro) return false
    if (!busqueda.trim()) return true
    return coincideBusqueda([
      m.serial, m.items?.nombre, m.numero_of, m.of && formatoOF(m.of.numero), m.of?.cliente, m.of?.ciudad,
      m.entrada?.numero, m.entrada?.proveedor, m.entrada?.pedidos?.numero, m.salida?.numero,
    ].join(' '), busqueda)
  }), [motores, filtro, busqueda])

  if (cargando) return <Spinner />

  const sinResultadoSerial = busqueda.trim() && visibles.length === 0 && /\d{5,}/.test(busqueda)

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-24">
      <EncabezadoPagina modulo="Inventarios" titulo="Motores por serial"
        subtitulo="Cuándo entró cada motor, cuándo salió, en qué OF y a qué cliente" />

      {error && <Alerta tipo="error" mensaje={error} />}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-texto-2" />
          <input ref={buscador} value={busqueda} onChange={e => setBusqueda(e.target.value)} autoFocus
            placeholder="Serial, modelo, OF, cliente o N° de movimiento" className={`${input} pl-9`} />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {[['todos', 'Todos', motores.length], ['disponible', 'En bodega', enBodega], ['despachado', 'Despachados', motores.length - enBodega]].map(([k, t, n]) => (
            <button key={k} onClick={() => setFiltro(k)} aria-pressed={filtro === k}
              className={`px-3 min-h-[40px] rounded-lg text-sm font-medium whitespace-nowrap border ${filtro === k ? 'bg-feisen-azul-suave text-feisen-azul border-transparent' : 'bg-white border-feisen-borde text-feisen-texto-2'}`}>
              {t} · {n}
            </button>
          ))}
        </div>
      </div>

      {busqueda.trim() && visibles.length > 0 && (
        <p className="text-sm text-feisen-texto-2">{visibles.length} {visibles.length === 1 ? 'motor' : 'motores'}</p>
      )}

      {visibles.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl p-8 text-center">
          <Engine size={28} className="mx-auto text-feisen-texto-2" />
          <p className="font-semibold text-feisen-texto mt-2">{motores.length === 0 ? 'Todavía no hay motores con serial' : 'Ningún motor coincide'}</p>
          <p className="text-sm text-feisen-texto-2 mt-1 max-w-md mx-auto">
            {sinResultadoSerial
              ? 'Ese serial no está registrado en el ERP. Los motores que salieron antes de agosto de 2026 tienen el serial en la nota de la factura de Odoo («REF MOTOR»).'
              : motores.length === 0
                ? 'Aparecen al registrar una entrada o salida de la bodega MOTORES con serial.'
                : 'Prueba con otra palabra o quita el filtro.'}
          </p>
        </div>
      ) : (
        <ul className="bg-white border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
          {visibles.slice(0, 300).map(m => (
            <li key={m.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-semibold text-feisen-texto text-base break-all">{m.serial}</p>
                  <p className="text-sm text-feisen-texto">{m.items?.nombre || 'Producto'}</p>
                </div>
                <span className={`text-xs font-medium rounded-md px-2 py-0.5 shrink-0 ${m.estado === 'despachado' ? 'bg-feisen-fondo text-feisen-texto-2' : 'bg-feisen-azul-suave text-feisen-azul'}`}>
                  {m.estado === 'despachado' ? 'Despachado' : 'En bodega'}
                </span>
              </div>
              <dl className="mt-1.5 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-sm">
                <dt className="text-feisen-texto-2">Entró</dt>
                <dd className="text-feisen-texto min-w-0">
                  {m.entrada
                    ? <>{fecha(m.entrada)} · {m.entrada.numero}
                        {m.entrada.pedidos?.numero && ` · ${m.entrada.pedidos.numero}`}
                        {m.entrada.proveedor && ` · ${m.entrada.proveedor}`}</>
                    : <span className="text-feisen-texto-2">Sin serial en la entrada</span>}
                </dd>
                {m.estado === 'despachado' && <>
                  <dt className="text-feisen-texto-2">Salió</dt>
                  <dd className="text-feisen-texto min-w-0">
                    {m.salida ? `${fecha(m.salida)} · ${m.salida.numero}` : '—'}
                    {m.of
                      ? <> · <b className="font-semibold">{formatoOF(m.of.numero)}</b></>
                      : m.numero_of && <span className="text-feisen-texto-2"> · {m.numero_of}</span>}
                  </dd>
                  {m.of?.cliente && <>
                    <dt className="text-feisen-texto-2">Cliente</dt>
                    <dd className="text-feisen-texto min-w-0">{m.of.cliente}{m.of.ciudad && <span className="text-feisen-texto-2"> · {m.of.ciudad}</span>}</dd>
                  </>}
                </>}
              </dl>
            </li>
          ))}
        </ul>
      )}
      {visibles.length > 300 && <p className="text-sm text-feisen-texto-2 text-center">Se muestran 300 de {visibles.length}. Escribe en el buscador para ver los demás.</p>}
    </div>
  )
}
