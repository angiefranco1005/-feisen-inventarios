import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { siguienteNumero } from '../../utils/siguienteNumero'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { ChevronDown, ChevronUp, Plus, Factory, CheckCircle2, Lock, Ban } from 'lucide-react'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import {
  HOY_COL, fechaCorta, num, cargarCatalogo, cargarRecetas,
  stockComponentes, maquinasPosibles, registrarAvance,
} from './ensambleDatos'

const ESTADOS = {
  abierta: { label: 'En curso', clase: 'bg-blue-100 text-feisen-azul' },
  cerrada: { label: 'Cerrada',  clase: 'bg-green-100 text-green-700' },
  anulada: { label: 'Anulada',  clase: 'bg-gray-100 text-gray-500' },
}

// ── Modal: nueva orden ────────────────────────────────────────────────────────
function ModalNuevaOrden({ recetas, perfil, onCreada, onCerrar }) {
  const [recetaId, setRecetaId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [fecha,    setFecha]    = useState(HOY_COL())
  const [notas,    setNotas]    = useState('')
  const [error,    setError]    = useState('')
  const [guardando, setGuardando] = useState(false)

  const activas = recetas.filter(r => r.activo && r.item)

  async function crear(e) {
    e.preventDefault()
    const receta = activas.find(r => r.id === recetaId)
    if (!receta) { setError('Selecciona la máquina.'); return }
    if (!(Number(cantidad) > 0)) { setError('Ingresa cuántas máquinas se van a armar.'); return }
    setGuardando(true); setError('')
    try {
      const numero = await siguienteNumero('ordenes_ensamble', 'OE')
      const { data, error: err } = await supabase.from('ordenes_ensamble').insert({
        numero, receta_id: receta.id, item_id: receta.item_id,
        cantidad_planeada: Number(cantidad), fecha_inicio: fecha,
        notas: notas.trim() || null, creado_por: perfil.id,
      }).select('*').single()
      if (err) throw err
      onCreada(data)
    } catch (err) {
      setError('Error al crear la orden: ' + err.message)
      setGuardando(false)
    }
  }

  return (
    <Modal titulo="Nueva orden de ensamble" onCerrar={onCerrar}>
      <form onSubmit={crear} className="space-y-4">
        {activas.length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No hay recetas activas. Crea primero la receta de la máquina en <Link to="/ensamble/recetas" className="underline font-semibold">Recetas</Link>.
          </p>
        )}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Máquina</label>
          <select value={recetaId} onChange={e => setRecetaId(e.target.value)}
            className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm bg-white">
            <option value="">Selecciona…</option>
            {activas.map(r => <option key={r.id} value={r.id}>{r.item.nombre}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Cantidad a armar</label>
            <input type="number" min="1" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)}
              className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha de inicio</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Notas (opcional)</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
            placeholder="Ej: pedido del cliente, color, prioridad…"
            className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={guardando}
          className="w-full bg-feisen-azul text-white rounded-xl py-3 font-semibold disabled:opacity-50">
          {guardando ? 'Creando…' : 'Crear orden'}
        </button>
      </form>
    </Modal>
  )
}

// ── Formulario de avance diario dentro de la orden ────────────────────────────
function FormAvance({ orden, receta, perfil, onRegistrado }) {
  const [cantidad, setCantidad] = useState('')
  const [fecha,    setFecha]    = useState(HOY_COL())
  const [notas,    setNotas]    = useState('')
  const [stock,    setStock]    = useState(null)
  const [error,    setError]    = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (receta) stockComponentes(receta.componentes).then(setStock).catch(() => setStock({}))
  }, [receta])

  if (!receta) return <p className="text-sm text-red-600 px-5 py-4">La receta de esta orden ya no existe.</p>

  const n = Number(cantidad) || 0
  const posibles = stock ? maquinasPosibles(receta.componentes, stock) : null
  const pendiente = orden.cantidad_planeada - orden.terminadas

  async function guardar(e) {
    e.preventDefault()
    if (n > pendiente && !window.confirm(`La orden pide ${num(orden.cantidad_planeada)} y ya van ${num(orden.terminadas)}. ¿Registrar ${num(n)} de todas formas?`)) return
    setGuardando(true); setError('')
    try {
      const res = await registrarAvance({ orden, receta, cantidad: n, fecha, notas, perfil })
      setCantidad(''); setNotas('')
      setStock(await stockComponentes(receta.componentes))
      onRegistrado(res)
    } catch (err) {
      setError(err.message)
    }
    setGuardando(false)
  }

  return (
    <form onSubmit={guardar} className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-gray-500 uppercase">Registrar máquinas terminadas</p>
        {posibles !== null && (
          <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${posibles > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            Alcanza para {num(posibles)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input type="number" min="1" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)}
          placeholder="Cantidad" className="border border-feisen-borde rounded-xl px-3 py-2.5 text-sm" />
        <input type="date" value={fecha} max={HOY_COL()} onChange={e => setFecha(e.target.value)}
          className="border border-feisen-borde rounded-xl px-3 py-2.5 text-sm" />
      </div>
      <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas (opcional)"
        className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm" />

      {n > 0 && stock && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="text-xs text-gray-500 px-3 py-2 border-b border-gray-100">Se descontará del inventario:</p>
          <ul className="divide-y divide-gray-50 text-sm max-h-56 overflow-y-auto">
            {receta.componentes.map(c => {
              const req = c.cantidad * n
              const hay = stock[c.item_id] || 0
              return (
                <li key={c.id} className={`flex justify-between gap-3 px-3 py-2 ${hay < req ? 'bg-red-50' : ''}`}>
                  <span className="text-gray-700 min-w-0 truncate">{c.item?.nombre}</span>
                  <span className={`shrink-0 font-semibold ${hay < req ? 'text-red-600' : 'text-gray-800'}`}>
                    {num(req)} <span className="text-xs font-normal text-gray-400">/ hay {num(hay)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={guardando || n <= 0}
        className="w-full bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40">
        {guardando ? 'Registrando…' : `Registrar ${n > 0 ? num(n) : ''} terminada${n === 1 ? '' : 's'}`}
      </button>
    </form>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function OrdenesEnsamble() {
  const { perfil } = useAuth()
  const [recetas,  setRecetas]  = useState([])
  const [ordenes,  setOrdenes]  = useState([])
  const [avances,  setAvances]  = useState([])
  const [filtro,   setFiltro]   = useState('abierta')
  const [expandido, setExpandido] = useState(null)
  const [modal,    setModal]    = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error,    setError]    = useState('')
  const [aviso,    setAviso]    = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    try {
      const cat = await cargarCatalogo()
      const porId = Object.fromEntries(cat.items.map(i => [i.id, i]))
      const [rec, { data: ords, error: e1 }, { data: avs, error: e2 }] = await Promise.all([
        cargarRecetas(porId),
        supabase.from('ordenes_ensamble').select('*').order('created_at', { ascending: false }),
        fetchAllPages((d, h) =>
          supabase.from('ordenes_ensamble_avances').select('*').order('fecha', { ascending: false }).order('id').range(d, h)
        ),
      ])
      if (e1 || e2) throw (e1 || e2)
      setRecetas(rec)
      setOrdenes(ords || [])
      setAvances(avs || [])
    } catch (err) {
      setError('Error al cargar: ' + err.message)
    }
    setCargando(false)
  }

  const recetaPorId = useMemo(() => Object.fromEntries(recetas.map(r => [r.id, r])), [recetas])

  const ordenesVista = useMemo(() => {
    const terminadas = {}
    for (const a of avances) terminadas[a.orden_id] = (terminadas[a.orden_id] || 0) + Number(a.cantidad)
    return ordenes.map(o => ({
      ...o,
      cantidad_planeada: Number(o.cantidad_planeada),
      terminadas: terminadas[o.id] || 0,
      receta: recetaPorId[o.receta_id] || null,
    }))
  }, [ordenes, avances, recetaPorId])

  const visibles = ordenesVista.filter(o => filtro === 'todas' || o.estado === filtro)

  async function cambiarEstado(o, estado) {
    const textos = {
      cerrada: `¿Cerrar la orden ${o.numero}? Van ${num(o.terminadas)} de ${num(o.cantidad_planeada)}. Ya no se podrán registrar más avances.`,
      anulada: `¿Anular la orden ${o.numero}? Los avances ya registrados NO se reversan del inventario.`,
    }
    if (!window.confirm(textos[estado])) return
    const cambios = { estado, fecha_cierre: HOY_COL(), cerrado_por: perfil.id }
    const { data, error: err } = await supabase.from('ordenes_ensamble').update(cambios).eq('id', o.id).select('id')
    if (err || !data?.length) { setError('No se pudo actualizar la orden' + (err ? ': ' + err.message : ' (sin permiso).')); return }
    setOrdenes(prev => prev.map(x => x.id === o.id ? { ...x, ...cambios } : x))
  }

  if (cargando) return <Spinner />

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20">

      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="bg-teal-100 p-2.5 rounded-xl">
            <Factory size={22} className="text-teal-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Órdenes de ensamble</h1>
            <p className="text-xs text-gray-500">Máquinas en armado y avance diario</p>
          </div>
        </div>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-feisen-rojo text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">Nueva orden</span><span className="sm:hidden">Nueva</span>
        </button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[['abierta', 'En curso'], ['cerrada', 'Cerradas'], ['anulada', 'Anuladas'], ['todas', 'Todas']].map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${filtro === k ? 'bg-feisen-azul text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {l} <span className="opacity-70">({ordenesVista.filter(o => k === 'todas' || o.estado === k).length})</span>
          </button>
        ))}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {aviso && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm flex gap-2"><CheckCircle2 size={18} className="shrink-0" />{aviso}</div>}

      {visibles.length === 0 && (
        <p className="text-center text-gray-400 py-16 text-sm">
          {filtro === 'abierta' ? 'No hay órdenes en curso.' : 'Sin órdenes en este filtro.'}
        </p>
      )}

      <div className="space-y-3">
        {visibles.map(o => {
          const abierto = expandido === o.id
          const pct = Math.min(100, Math.round((o.terminadas / o.cantidad_planeada) * 100))
          const avs = avances.filter(a => a.orden_id === o.id)
          const est = ESTADOS[o.estado]
          return (
            <div key={o.id} className={`bg-white rounded-2xl border ${abierto ? 'border-feisen-azul/40 shadow-md' : 'border-gray-200'}`}>
              <button onClick={() => setExpandido(abierto ? null : o.id)} className="w-full text-left px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-500">{o.numero}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${est.clase}`}>{est.label}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-800 mt-1 truncate">{o.receta?.item?.nombre || '(máquina no encontrada)'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Inicio {fechaCorta(o.fecha_inicio)}{o.fecha_cierre ? ` · cierre ${fechaCorta(o.fecha_cierre)}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-feisen-azul leading-none">{num(o.terminadas)}<span className="text-sm text-gray-400 font-semibold"> / {num(o.cantidad_planeada)}</span></p>
                    <p className="text-xs text-gray-400 mt-1">terminadas</p>
                  </div>
                  {abierto ? <ChevronUp size={18} className="text-gray-400 mt-1" /> : <ChevronDown size={18} className="text-gray-400 mt-1" />}
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-feisen-azul'}`} style={{ width: `${pct}%` }} />
                </div>
              </button>

              {abierto && (
                <div className="border-t border-gray-100">
                  {o.notas && <p className="px-5 pt-3 text-sm text-gray-600">{o.notas}</p>}

                  <div className="px-5 py-3">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Avance diario</p>
                    {avs.length === 0 ? (
                      <p className="text-sm text-gray-400">Aún no se ha registrado ninguna máquina terminada.</p>
                    ) : (
                      <ul className="divide-y divide-gray-100 text-sm">
                        {avs.map(a => (
                          <li key={a.id} className="py-2 flex justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-gray-800"><span className="font-semibold">{fechaCorta(a.fecha)}</span> · {a.usuario_nombre || '—'}</p>
                              <p className="text-xs text-gray-400 truncate">{a.numero_salida} / {a.numero_entrada}{a.notas ? ` · ${a.notas}` : ''}</p>
                            </div>
                            <span className="font-bold text-gray-800 shrink-0">+{num(a.cantidad)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {o.estado === 'abierta' && (
                    <>
                      <FormAvance orden={o} receta={o.receta} perfil={perfil}
                        onRegistrado={async ({ numeroSalida, numeroEntrada }) => {
                          setAviso(`Avance registrado en ${o.numero}. Salida ${numeroSalida} · Entrada ${numeroEntrada}.`)
                          setTimeout(() => setAviso(''), 6000)
                          const { data } = await supabase.from('ordenes_ensamble_avances').select('*').eq('orden_id', o.id)
                          setAvances(prev => [...prev.filter(a => a.orden_id !== o.id), ...(data || [])]
                            .sort((a, b) => b.fecha.localeCompare(a.fecha)))
                        }} />
                      <div className="flex justify-end gap-4 px-5 py-3 border-t border-gray-100 rounded-b-2xl">
                        <button onClick={() => cambiarEstado(o, 'anulada')} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                          <Ban size={13} /> Anular
                        </button>
                        <button onClick={() => cambiarEstado(o, 'cerrada')} className="text-xs font-semibold text-green-700 hover:text-green-800 flex items-center gap-1">
                          <Lock size={13} /> Cerrar orden
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {modal && (
        <ModalNuevaOrden recetas={recetas} perfil={perfil} onCerrar={() => setModal(false)}
          onCreada={o => { setOrdenes(prev => [o, ...prev]); setModal(false); setFiltro('abierta'); setExpandido(o.id) }} />
      )}
    </div>
  )
}
