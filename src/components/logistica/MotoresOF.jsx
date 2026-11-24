import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Spinner from '../shared/Spinner'
import { cargarMotoresFeisen } from '../of/shared/motoresOF'
import { formatoOF, formatFecha, hoyISO } from '../of/shared/formatters'

// Motores para OF (2026-11-24, pedido de Angie): cuántos motores de Feisen piden las OF
// pendientes, cuántos hay en la bodega MOTORES, cuántos vienen en pedidos abiertos y
// cuántos faltan. Sale de items_of.motor = 'feisen' + motor_item_id (los elige ventas en la OF).
// Pendiente de una OF y un motor = cantidad − máx(entregado, motores ya sacados con esa OF),
// porque las máquinas despachadas ya llevaban su motor y los sacados con serial ya salieron
// del almacén (motor_seriales.numero_of, texto libre: se compara por los dígitos).
// No muestra el cliente: Logística no lo ve en las OF.

const PEDIDO_ABIERTO = ['pendiente', 'en_transito', 'parcialmente_recibido']

export default function MotoresOF({ enInicio = false }) {
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [datos, setDatos] = useState(null)
  const [abierto, setAbierto] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true); setError(null)
    try {
      const motores = await cargarMotoresFeisen()
      const ids = motores.map(m => m.id)
      const [lin, ser, ped] = await Promise.all([
        supabase.from('items_of')
          .select('id, producto, cantidad, entregado, motor, motor_item_id, orden:ordenes_fabricacion!inner(numero, fecha_promesa, cancelada)')
          .eq('motor', 'feisen').eq('orden.cancelada', false),
        ids.length ? supabase.from('motor_seriales').select('item_id, numero_of')
          .eq('estado', 'despachado').not('numero_of', 'is', null).in('item_id', ids) : { data: [] },
        ids.length ? supabase.from('pedido_items')
          .select('item_id, cantidad, cantidad_recibida, pedido:pedidos!inner(numero, estado, fecha_estimada_llegada)')
          .in('item_id', ids).in('pedido.estado', PEDIDO_ABIERTO) : { data: [] },
      ])
      const err = lin.error || ser.error || ped.error
      if (err) throw err
      setDatos({ motores, lineas: lin.data || [], seriales: ser.data || [], pedidos: ped.data || [] })
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  const vista = useMemo(() => datos && calcular(datos), [datos])

  function pedirFaltantes() {
    const faltan = vista.filas.filter(f => f.falta > 0)
    navigate('/pedidos?nuevo=1', { state: {
      pedirItems: faltan.map(f => ({ descripcion: f.nombre, cantidad: String(f.falta), unidad: 'und', item_id: f.id })),
      obs: 'Motores para OF: ' + [...new Set(faltan.flatMap(f => f.ofs.map(o => formatoOF(o.numero))))].join(', '),
    } })
  }

  if (cargando) return <Spinner texto="Contando motores..." />

  return (
    <div className={enInicio ? 'space-y-3.5' : 'max-w-4xl mx-auto space-y-5'}>
      <div>
        {enInicio
          ? <h2 className="text-base font-semibold text-feisen-texto">Motores para OF</h2>
          : <h1 className="text-xl font-semibold text-feisen-texto">Motores para OF</h1>}
        <p className="text-sm text-feisen-texto-2 mt-0.5">Los motores de Feisen que piden las OF pendientes, contra lo que hay en la bodega MOTORES y lo que viene en pedidos.</p>
      </div>
      {error && <p className="text-sm text-feisen-rojo">No se pudo cargar: {error}</p>}
      {vista && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Cifra etiqueta="Piden las OF" valor={`${vista.totalPiden} ${vista.totalPiden === 1 ? 'motor' : 'motores'}`} />
            <Cifra etiqueta="Faltan" valor={vista.totalFalta} tono={vista.totalFalta > 0 ? 'rojo' : 'verde'} />
            <Cifra etiqueta="Motor sin elegir" valor={`${vista.sinElegir.length} ${vista.sinElegir.length === 1 ? 'línea' : 'líneas'}`} tono={vista.sinElegir.length ? 'ambar' : null} />
          </div>

          <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-feisen-borde-suave">
              <p className="font-semibold text-feisen-texto">Por motor</p>
              {vista.totalFalta > 0 && (
                <button onClick={pedirFaltantes} className="text-sm bg-feisen-rojo hover:bg-feisen-rojo-claro text-white rounded-lg px-3.5 py-1.5 font-semibold">
                  Pedir faltantes
                </button>
              )}
            </div>
            {vista.filas.length === 0 && <p className="px-4 py-6 text-sm text-feisen-gris-medio">Ninguna OF pendiente pide motores de Feisen.</p>}
            {vista.filas.length > 0 && (
              <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,3.6rem)] sm:grid-cols-[minmax(0,1fr)_repeat(4,5.5rem)] gap-2 px-4 py-2 text-xs text-feisen-gris-medio bg-feisen-fondo">
                <span>Motor</span><span className="text-right">Piden</span><span className="text-right">Hay</span>
                <span className="text-right"><span className="sm:hidden">Vienen</span><span className="hidden sm:inline">En camino</span></span><span className="text-right">Falta</span>
              </div>
            )}
            <div className="divide-y divide-feisen-borde-suave">
              {vista.filas.map(f => (
                <div key={f.id} className={f.falta > 0 ? 'bg-red-50/60' : ''}>
                  <button onClick={() => setAbierto(abierto === f.id ? null : f.id)} aria-expanded={abierto === f.id}
                    className="w-full grid grid-cols-[minmax(0,1fr)_repeat(4,3.6rem)] sm:grid-cols-[minmax(0,1fr)_repeat(4,5.5rem)] gap-2 px-4 py-2.5 text-sm text-left tabular-nums hover:bg-feisen-fondo/60">
                    <span className={`truncate ${f.falta > 0 ? 'font-semibold text-feisen-texto' : 'text-feisen-texto'}`}>{f.nombre}</span>
                    <span className="text-right">{f.piden}</span>
                    <span className="text-right">{f.hay}</span>
                    <span className="text-right">{f.camino}</span>
                    <span className={`text-right font-semibold ${f.falta > 0 ? 'text-feisen-rojo' : 'text-emerald-700'}`}>{f.falta}</span>
                  </button>
                  {abierto === f.id && (
                    <div className="px-4 pb-3 text-xs text-feisen-texto-2 space-y-1">
                      {f.ofs.map(o => (
                        <p key={o.numero}>
                          <span className="font-medium text-feisen-texto">{formatoOF(o.numero)}</span> · {o.productos.join(', ')} · {o.pendiente} {o.pendiente === 1 ? 'motor' : 'motores'} ·{' '}
                          <span className={o.promesa < hoyISO() ? 'text-feisen-rojo font-medium' : ''}>promesa {formatFecha(o.promesa)}</span>
                          {o.sacados > 0 && <span className="text-feisen-gris-medio"> · ya sacados {o.sacados}</span>}
                        </p>
                      ))}
                      {f.pedidos.map(p => (
                        <p key={p.numero} className="text-feisen-azul">{p.numero} · vienen {p.cantidad}{p.llega ? ` · llega ${formatFecha(p.llega)}` : ''}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {vista.sinElegir.length > 0 && (
            <div className="bg-white border border-amber-300 rounded-xl px-4 py-3">
              <p className="font-semibold text-amber-800">Motor Feisen sin elegir</p>
              <p className="text-xs text-feisen-texto-2 mt-0.5 mb-2">Ventas dijo que llevan motor de Feisen pero no cuál. No entran en la cuenta hasta que lo elijan en la OF.</p>
              <div className="space-y-1 text-sm">
                {vista.sinElegir.map(l => (
                  <p key={l.id}><span className="font-medium">{formatoOF(l.orden.numero)}</span> · {l.producto} ×{l.pendiente} · promesa {formatFecha(l.orden.fecha_promesa)}</p>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function calcular({ motores, lineas, seriales, pedidos }) {
  const porId = Object.fromEntries(motores.map(m => [m.id, m]))
  const numOF = t => { const d = String(t || '').replace(/\D/g, ''); return d ? parseInt(d, 10) : null }

  // Motores ya sacados con serial, por OF y motor
  const sacados = {}
  seriales.forEach(s => {
    const n = numOF(s.numero_of); if (n == null) return
    const k = `${n}|${s.item_id}`; sacados[k] = (sacados[k] || 0) + 1
  })

  // Líneas pendientes agrupadas por OF y motor
  const grupos = {}
  const sinElegir = []
  lineas.forEach(l => {
    if (l.motor !== 'feisen' || !l.orden || l.orden.cancelada) return
    const pend = Number(l.cantidad) - Number(l.entregado)
    if (pend <= 0) return
    if (!l.motor_item_id || !porId[l.motor_item_id]) { sinElegir.push({ ...l, pendiente: pend }); return }
    const k = `${l.orden.numero}|${l.motor_item_id}`
    const g = grupos[k] ||= { numero: l.orden.numero, promesa: l.orden.fecha_promesa, itemId: l.motor_item_id, cantidad: 0, entregado: 0, productos: [] }
    g.cantidad += Number(l.cantidad); g.entregado += Number(l.entregado)
    g.productos.push(`${l.producto} ×${Number(l.cantidad)}`)
  })

  const filasPorId = {}
  Object.entries(grupos).forEach(([k, g]) => {
    const sac = sacados[k] || 0
    const pendiente = Math.max(0, g.cantidad - Math.max(g.entregado, sac))
    if (!pendiente) return
    const m = porId[g.itemId]
    const f = filasPorId[g.itemId] ||= { id: m.id, nombre: m.nombre, hay: Math.max(0, m.stock), piden: 0, ofs: [], pedidos: [] }
    f.piden += pendiente
    f.ofs.push({ numero: g.numero, promesa: g.promesa, productos: g.productos, pendiente, sacados: sac })
  })

  pedidos.forEach(p => {
    const f = filasPorId[p.item_id]; if (!f || !PEDIDO_ABIERTO.includes(p.pedido?.estado)) return
    const viene = Math.max(0, Number(p.cantidad) - Number(p.cantidad_recibida || 0))
    if (viene > 0) f.pedidos.push({ numero: p.pedido.numero, cantidad: viene, llega: p.pedido.fecha_estimada_llegada })
  })

  const filas = Object.values(filasPorId).map(f => {
    const camino = f.pedidos.reduce((s, p) => s + p.cantidad, 0)
    f.ofs.sort((a, b) => (a.promesa || '').localeCompare(b.promesa || ''))
    return { ...f, camino, falta: Math.max(0, f.piden - f.hay - camino), primera: f.ofs[0]?.promesa || '' }
  }).sort((a, b) => (b.falta > 0) - (a.falta > 0) || a.primera.localeCompare(b.primera) || a.nombre.localeCompare(b.nombre))

  sinElegir.sort((a, b) => (a.orden.fecha_promesa || '').localeCompare(b.orden.fecha_promesa || ''))
  return {
    filas, sinElegir,
    totalPiden: filas.reduce((s, f) => s + f.piden, 0),
    totalFalta: filas.reduce((s, f) => s + f.falta, 0),
  }
}

function Cifra({ etiqueta, valor, tono }) {
  const c = { rojo: 'bg-red-50 text-feisen-rojo', verde: 'bg-emerald-50 text-emerald-700', ambar: 'bg-amber-50 text-amber-800' }[tono] || 'bg-white text-feisen-texto'
  return (
    <div className={`rounded-xl border border-feisen-borde px-3 py-3 ${c}`}>
      <p className="text-xs opacity-80">{etiqueta}</p>
      <p className="text-lg sm:text-2xl font-semibold tabular-nums mt-0.5">{valor}</p>
    </div>
  )
}
