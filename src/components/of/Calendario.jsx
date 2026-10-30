import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import ModalDetalleOF from './ModalDetalleOF'
import { formatoOF, formatFecha, nombreTransporte, ofTotalmenteDespachada, hoyISO } from './shared/formatters'
import { useAutoRefrescar } from './shared/useAutoRefrescar'
import { RefreshCw, Info, Truck } from '../shared/iconos'

const NOMBRES_MES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const NOMBRES_DIA_LARGO = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"]
const NOMBRES_DIA_CORTO = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"]

function isoDeFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function inicioSemana(fecha) {
  const d = new Date(fecha)
  let dow = d.getDay(); dow = dow === 0 ? 7 : dow
  d.setDate(d.getDate() - (dow - 1))
  return d
}
function tieneEntregaParcial(items) {
  return items.some(it => it.entregado > 0) && !ofTotalmenteDespachada(items)
}
function claseCal(orden) {
  if (ofTotalmenteDespachada(orden.items_of)) return 'bg-emerald-600'
  if (tieneEntregaParcial(orden.items_of)) return 'bg-orange-500'
  // Se compara como texto YYYY-MM-DD: new Date('2026-10-26') es medianoche UTC (7 p.m. del día
  // anterior en Colombia), y eso marcaba en rojo como "atrasadas" las OF que vencían HOY
  if (orden.fecha_promesa < hoyISO()) return 'bg-feisen-rojo'
  return 'bg-feisen-azul'
}

export default function Calendario() {
  const { esJefeArea, esLogistica, esComercial, esAdmin, centroCosto, puedeEditarOF, nivel } = useAuth()
  // Se puede arrastrar a otra fecha solo la OF que uno puede editar (con Registra, las propias)
  const permitirMover = esComercial || esAdmin
  const puedeMover = o => permitirMover && puedeEditarOF(o)
  const [ordenes, setOrdenes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [vista, setVista] = useState('mes') // 'dia' | 'semana' | 'mes'
  const [fechaActual, setFechaActual] = useState(new Date())
  const [detalle, setDetalle] = useState(null)

  useEffect(() => { cargar().finally(() => setCargando(false)) }, [])
  useAutoRefrescar(async () => { setActualizando(true); await cargar(); setActualizando(false) })

  async function cargar() {
    const { data } = await supabase.from('ordenes_fabricacion').select(`
      *,
      creador:profiles ( nombre ),
      items_of ( *, producciones:of_producciones (*, registrado_por_perfil:profiles(nombre)), entregas:of_entregas (*, registrado_por_perfil:profiles(nombre)) )
    `)
    setOrdenes(data || [])
  }

  async function refrescarManual() {
    setActualizando(true)
    await cargar()
    setActualizando(false)
  }

  async function moverFecha(orden, nuevaFechaISO) {
    if (!puedeMover(orden) || orden.fecha_promesa === nuevaFechaISO) return
    const ok = window.confirm(
      `¿Mover ${formatoOF(orden.numero)} — ${orden.cliente} del ${formatFecha(orden.fecha_promesa)} al ${formatFecha(nuevaFechaISO)}?`
    )
    if (!ok) return
    const { error } = await supabase.from('ordenes_fabricacion').update({ fecha_promesa: nuevaFechaISO }).eq('id', orden.id)
    if (error) window.alert('No se pudo cambiar la fecha: ' + error.message)
    cargar()
  }

  function soltarEnFecha(e, fecha) {
    if (!permitirMover) return
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    const orden = ordenes.find(o => o.id === id)
    if (orden) moverFecha(orden, isoDeFecha(fecha))
  }

  function cambiarPeriodo(delta) {
    const f = new Date(fechaActual)
    if (vista === 'dia') f.setDate(f.getDate() + delta)
    else if (vista === 'semana') f.setDate(f.getDate() + delta * 7)
    else f.setMonth(f.getMonth() + delta)
    setFechaActual(f)
  }

  function ordenesDe(fecha) {
    const iso = isoDeFecha(fecha)
    return ordenes.filter(o => o.fecha_promesa === iso && !o.cancelada
      && !ofTotalmenteDespachada(o.items_of)
      && (!esJefeArea || o.items_of.some(it => it.centro_costo === centroCosto)))
  }

  if (cargando) return <Spinner texto="Cargando calendario..." />

  let titulo = ''
  if (vista === 'dia') {
    const nombre = NOMBRES_DIA_LARGO[fechaActual.getDay()]
    titulo = `${nombre.charAt(0).toUpperCase() + nombre.slice(1)} ${fechaActual.getDate()} de ${NOMBRES_MES[fechaActual.getMonth()]} de ${fechaActual.getFullYear()}`
  } else if (vista === 'semana') {
    const lunes = inicioSemana(fechaActual)
    const domingo = new Date(lunes); domingo.setDate(domingo.getDate() + 6)
    const mesLunes = lunes.getMonth() !== domingo.getMonth() ? ` de ${NOMBRES_MES[lunes.getMonth()]}` : ''
    titulo = `Semana del ${lunes.getDate()}${mesLunes} al ${domingo.getDate()} de ${NOMBRES_MES[domingo.getMonth()]} de ${domingo.getFullYear()}`
  } else {
    titulo = `${NOMBRES_MES[fechaActual.getMonth()]} ${fechaActual.getFullYear()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-feisen-azul">Calendario de Órdenes de Fabricación</h1>
        <button onClick={refrescarManual} disabled={actualizando}
          className="flex items-center gap-1.5 text-sm text-feisen-azul font-medium px-3 py-1.5 rounded-lg hover:bg-feisen-gris disabled:opacity-60">
          <RefreshCw size={14} className={actualizando ? 'animate-spin' : ''} />
          {actualizando ? 'Actualizando...' : 'Refrescar'}
        </button>
      </div>

      <div className="flex gap-2">
        {['dia', 'semana', 'mes'].map(v => (
          <button key={v} onClick={() => setVista(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize ${vista === v ? 'bg-feisen-azul text-white' : 'bg-white text-feisen-gris-medio border border-gray-200'}`}>
            {v === 'dia' ? 'Día' : v}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm p-4">
        <button onClick={() => cambiarPeriodo(-1)} className="text-sm font-semibold text-feisen-azul">‹ Anterior</button>
        <h2 className="font-semibold text-feisen-gris-oscuro">{titulo}</h2>
        <button onClick={() => cambiarPeriodo(1)} className="text-sm font-semibold text-feisen-azul">Siguiente ›</button>
      </div>

      <div className="flex items-center gap-4 flex-wrap text-xs text-feisen-gris-medio">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-feisen-azul inline-block" /> A tiempo</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> Con entregas parciales</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-feisen-rojo inline-block" /> Atrasada, sin entregar</span>
      </div>

      {permitirMover && (
        <p className="text-xs text-feisen-gris-medio -mt-3 flex items-center gap-1.5"><Info size={14} className="shrink-0" /> Puedes arrastrar una OF a otro día en las vistas de semana o mes para cambiar su fecha de entrega{nivel('of') === 'registra' ? ' (solo las que tú creaste)' : ''}.</p>
      )}

      {vista === 'dia' && (
        <div className="space-y-3">
          {ordenesDe(fechaActual).length === 0 && <p className="text-sm text-feisen-gris-medio italic bg-white rounded-2xl p-6 text-center">No hay Órdenes de Fabricación programadas para este día.</p>}
          {ordenesDe(fechaActual).map(o => <TarjetaCalendario key={o.id} orden={o} onClick={() => setDetalle(o)} ocultarCliente={esJefeArea || esLogistica} mostrarTransporte={!esJefeArea} centroFiltro={esJefeArea ? centroCosto : null} permitirMover={puedeMover(o)} />)}
        </div>
      )}

      {vista === 'semana' && (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => {
            const dia = new Date(inicioSemana(fechaActual)); dia.setDate(dia.getDate() + i)
            const ords = ordenesDe(dia)
            return (
              <div key={i} className="bg-white rounded-2xl p-3 min-h-[140px]"
                onDragOver={e => permitirMover && e.preventDefault()}
                onDrop={e => soltarEnFecha(e, dia)}>
                <p className="text-xs font-semibold text-feisen-gris-medio mb-2">{NOMBRES_DIA_CORTO[i]} {dia.getDate()}</p>
                <div className="space-y-2">
                  {ords.map(o => <TarjetaCalendario key={o.id} orden={o} mini onClick={() => setDetalle(o)} ocultarCliente={esJefeArea || esLogistica} mostrarTransporte={!esJefeArea} centroFiltro={esJefeArea ? centroCosto : null} permitirMover={puedeMover(o)} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {vista === 'mes' && (
        <VistaMes fechaActual={fechaActual} ordenesDe={ordenesDe} onClick={setDetalle} ocultarCliente={esJefeArea || esLogistica} mostrarTransporte={!esJefeArea} centroFiltro={esJefeArea ? centroCosto : null} permitirMover={permitirMover} puedeMover={puedeMover} onSoltar={soltarEnFecha} />
      )}

      {detalle && <ModalDetalleOF orden={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  )
}

function TarjetaCalendario({ orden, onClick, mini, ocultarCliente, mostrarTransporte, centroFiltro, permitirMover }) {
  const items = centroFiltro ? orden.items_of.filter(it => it.centro_costo === centroFiltro) : orden.items_of
  return (
    <button onClick={onClick}
      draggable={!!permitirMover}
      onDragStart={e => { if (permitirMover) { e.dataTransfer.setData('text/plain', orden.id); e.dataTransfer.effectAllowed = 'move' } }}
      className={`w-full text-left rounded-xl text-white px-3 py-2 ${mini ? 'text-[10px]' : 'text-xs'} ${claseCal(orden)} ${permitirMover ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <p className="font-bold truncate">{formatoOF(orden.numero)}{!ocultarCliente && ` · ${orden.cliente}`}</p>
      {items.map(it => (
        <p key={it.id} className="opacity-90 truncate">{it.producto} × {it.cantidad}</p>
      ))}
      {mostrarTransporte && <p className="opacity-85 italic truncate flex items-center gap-1"><Truck size={12} className="shrink-0" />{nombreTransporte(orden)}</p>}
    </button>
  )
}

function VistaMes({ fechaActual, ordenesDe, onClick, ocultarCliente, mostrarTransporte, centroFiltro, permitirMover, puedeMover, onSoltar }) {
  const year = fechaActual.getFullYear()
  const month = fechaActual.getMonth()
  const primerDia = new Date(year, month, 1)
  let diaSemanaInicio = primerDia.getDay(); diaSemanaInicio = diaSemanaInicio === 0 ? 6 : diaSemanaInicio - 1
  const diasEnMes = new Date(year, month + 1, 0).getDate()

  const celdas = []
  for (let i = 0; i < diaSemanaInicio; i++) celdas.push(null)
  for (let d = 1; d <= diasEnMes; d++) celdas.push(new Date(year, month, d))

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="grid grid-cols-7 gap-2 mb-2">
        {NOMBRES_DIA_CORTO.map(n => <div key={n} className="text-center text-xs font-semibold text-feisen-gris-medio">{n}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {celdas.map((dia, i) => (
          <div key={i} className="min-h-[110px] bg-feisen-gris rounded-xl p-1.5"
            onDragOver={e => dia && permitirMover && e.preventDefault()}
            onDrop={e => dia && onSoltar(e, dia)}>
            {dia && (
              <>
                <p className="text-xs font-bold text-feisen-gris-oscuro mb-1">{dia.getDate()}</p>
                <div className="space-y-1">
                  {ordenesDe(dia).map(o => <TarjetaCalendario key={o.id} orden={o} mini onClick={() => onClick(o)} ocultarCliente={ocultarCliente} mostrarTransporte={mostrarTransporte} centroFiltro={centroFiltro} permitirMover={puedeMover(o)} />)}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
