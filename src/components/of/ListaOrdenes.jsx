import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Alerta from './shared/Alerta'
import Modal from './shared/Modal'
import ModalFabricacion from './ModalFabricacion'
import ModalReversarFabricacion from './ModalReversarFabricacion'
import ModalReversarEntrega from './ModalReversarEntrega'
import ModalEntrega from './ModalEntrega'
import ModalDetalleOF from './ModalDetalleOF'
import { Edit2, Ban, RotateCcw, RefreshCw, MapPin, Truck, CheckCircle2, LayoutGrid, Rows3 } from '../shared/iconos'
import {
  formatoOF, formatFecha, CENTRO_NOMBRE, estadoClase, estadoTexto, ESTADO_BADGE_CLASE,
  pendienteProducir, disponibleDespacho, ofTotalmenteDespachada, nombreTransporte, estadoOF, alertaPromesa
} from './shared/formatters'
import { useAutoRefrescar } from './shared/useAutoRefrescar'

const SELECT_ORDEN_COMPLETA = `
  *,
  creador:profiles ( nombre ),
  items_of ( *, producciones:of_producciones (*, registrado_por_perfil:profiles(nombre)), entregas:of_entregas (*, registrado_por_perfil:profiles(nombre)) )
`

export default function ListaOrdenes() {
  const { esComercial, esAdmin, esJefeArea, ofDespacho: esLogistica, centroCosto, puedeEditarOF } = useAuth()
  const navigate = useNavigate()
  const [ordenes, setOrdenes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState(null)

  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroNumero, setFiltroNumero] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  // Modo de vista de Comercial/Admin: 'tarjetas' (por defecto) o 'estado'. Se recuerda en este equipo.
  const [vista, setVista] = useState(() => {
    try { return localStorage.getItem('feisen-of-vista') === 'estado' ? 'estado' : 'tarjetas' } catch { return 'tarjetas' }
  })
  function cambiarVista(v) {
    setVista(v)
    try { localStorage.setItem('feisen-of-vista', v) } catch { /* sin almacenamiento: solo dura esta sesión */ }
  }

  const [modalFab, setModalFab] = useState(null) // { orden, items, itemInicialId }
  const [modalRev, setModalRev] = useState(null) // { orden, items, itemInicialId }
  const [modalRevEnt, setModalRevEnt] = useState(null) // { orden, items, itemInicialId }
  const [modalEnt, setModalEnt] = useState(null)
  const [modalDetalle, setModalDetalle] = useState(null)
  const [modalCancelar, setModalCancelar] = useState(null) // orden a cancelar
  const [motivoCancelar, setMotivoCancelar] = useState('')
  const [guardandoCancelar, setGuardandoCancelar] = useState(false)

  useEffect(() => { cargar().finally(() => setCargando(false)) }, [])
  useAutoRefrescar(async () => { setActualizando(true); await cargar(); setActualizando(false) })

  async function cargar() {
    const { data, error } = await supabase.from('ordenes_fabricacion')
      .select(SELECT_ORDEN_COMPLETA)
      .order('numero', { ascending: false })
    setError(error ? error.message : null)
    setOrdenes(data || [])
  }

  async function refrescarManual() {
    setActualizando(true)
    await cargar()
    setActualizando(false)
  }

  function pasaFiltro(o) {
    if (filtroCliente && !(o.cliente || '').toLowerCase().includes(filtroCliente.toLowerCase())) return false
    if (filtroNumero && !formatoOF(o.numero).toLowerCase().includes(filtroNumero.trim().toLowerCase()) && !String(o.numero).includes(filtroNumero.trim())) return false
    if (filtroFecha && o.fecha_promesa !== filtroFecha) return false
    return true
  }

  const ordenesFiltradas = ordenes.filter(pasaFiltro)

  function refrescar() {
    setModalFab(null); setModalEnt(null); setModalRev(null); setModalRevEnt(null)
    cargar()
  }

  async function confirmarCancelar(e) {
    e.preventDefault()
    setGuardandoCancelar(true)
    const { error } = await supabase.from('ordenes_fabricacion')
      .update({ cancelada: true, motivo_cancelacion: motivoCancelar.trim() || null, cancelada_en: new Date().toISOString() })
      .eq('id', modalCancelar.id)
    setGuardandoCancelar(false)
    if (error) { setError('Error al cancelar: ' + error.message); return }
    setModalCancelar(null); setMotivoCancelar('')
    cargar()
  }

  async function reactivar(orden) {
    const ok = window.confirm(`¿Reactivar ${orden.cliente ? 'la OF de ' + orden.cliente : 'esta OF'}? Volverá a aparecer como pendiente en producción y despacho.`)
    if (!ok) return
    const { error } = await supabase.from('ordenes_fabricacion')
      .update({ cancelada: false, motivo_cancelacion: null, cancelada_en: null })
      .eq('id', orden.id)
    if (error) { setError('Error al reactivar: ' + error.message); return }
    cargar()
  }

  if (cargando) return <Spinner texto="Cargando Órdenes de Fabricación..." />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold text-feisen-texto">
          {esComercial || esAdmin ? 'Todas las Órdenes de Fabricación'
            : esLogistica ? 'Pedidos en producción y despacho'
            : `Productos pendientes de fabricar — ${CENTRO_NOMBRE[centroCosto] || ''}`}
        </h1>
        <div className="flex items-center gap-3">
          {(esComercial || esAdmin) && (
            <div role="group" aria-label="Modo de vista" className="inline-flex bg-gray-100 rounded-lg p-0.5">
              {[{ id: 'tarjetas', label: 'Tarjetas', icon: LayoutGrid }, { id: 'estado', label: 'Por estado', icon: Rows3 }].map(op => (
                <button key={op.id} onClick={() => cambiarVista(op.id)} aria-pressed={vista === op.id}
                  className={`flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md transition-colors
                    ${vista === op.id ? 'bg-white text-feisen-azul font-semibold shadow-sm' : 'text-feisen-texto-2 font-medium hover:text-feisen-texto'}`}>
                  <op.icon size={14} strokeWidth={1.8} /> {op.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={refrescarManual} disabled={actualizando}
            className="flex items-center gap-1.5 text-[13px] text-feisen-azul font-medium px-3 py-1.5 rounded-lg hover:bg-white disabled:opacity-60">
            <RefreshCw size={14} className={actualizando ? 'animate-spin' : ''} />
            {actualizando ? 'Actualizando...' : 'Refrescar'}
          </button>
        </div>
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}

      {(esComercial || esAdmin) && (
        <Alerta tipo="info" mensaje='Ves cada OF completa con todos sus productos. Cuando un producto tiene unidades fabricadas sin despachar, registra aquí la entrega (orden de despacho + cantidad), así sea parcial.' />
      )}
      {esJefeArea && (
        <Alerta tipo="info" mensaje="Solo ves los productos de tu centro de costo: los pendientes por fabricar (puedes registrar fabricación parcial) y los ya fabricados sin despachar (puedes reversar si por error se usaron para otra OF)." />
      )}
      {esLogistica && (
        <Alerta tipo="info" mensaje="Vista informativa: ves el pedido completo (incluye lo que aún está en producción, como motores o kits de ensamble) para poder coordinar el despacho con tiempo. No se muestra el nombre del cliente. Quien registra la entrega en el sistema es el asesor comercial." />
      )}

      {/* FILTROS */}
      <div className="bg-white border border-feisen-borde rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium text-feisen-gris-oscuro block mb-1">Buscar por número de OF</label>
          <input value={filtroNumero} onChange={e => setFiltroNumero(e.target.value)} placeholder="Ej: OF-0025 o 25"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        {!esJefeArea && !esLogistica && (
          <div>
            <label className="text-xs font-medium text-feisen-gris-oscuro block mb-1">Buscar cliente</label>
            <input value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} placeholder="Ej: Distribuidora El Progreso"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-feisen-gris-oscuro block mb-1">Fecha de entrega (promesa)</label>
          <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <div>
          <label className="text-xs font-medium text-feisen-gris-oscuro block mb-1">Estado del producto</label>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
            <option value="">Todos</option>
            <option value="pendiente">Pendiente producción</option>
            <option value="parcial">Producción parcial</option>
            <option value="listo">Listo para despacho</option>
            {(esComercial || esAdmin) && <option value="entregado">Entregado</option>}
          </select>
        </div>
      </div>

      {(esComercial || esAdmin) && (
        <VistaComercial
          ordenes={ordenesFiltradas}
          vista={vista}
          esAdmin={esAdmin}
          esComercial={esComercial}
          puedeEditarOF={puedeEditarOF}
          filtroEstado={filtroEstado}
          onEditar={id => navigate(`/of/nueva?editar=${id}`)}
          onRegistrarEntrega={(orden, itemId) => setModalEnt({ orden, items: orden.items_of, itemInicialId: itemId })}
          onRegistrarFabricacion={(orden, itemId) => setModalFab({ orden, items: orden.items_of, itemInicialId: itemId })}
          onReversarFabricacion={(orden, itemId) => setModalRev({ orden, items: orden.items_of, itemInicialId: itemId })}
          onReversarEntrega={(orden, itemId) => setModalRevEnt({ orden, items: orden.items_of, itemInicialId: itemId })}
          onVerDetalle={orden => setModalDetalle(orden)}
          onCancelar={orden => { setModalCancelar(orden); setMotivoCancelar('') }}
          onReactivar={reactivar}
        />
      )}
      {esJefeArea && (
        <VistaJefeArea
          ordenes={ordenesFiltradas}
          centroCosto={centroCosto}
          filtroEstado={filtroEstado}
          onRegistrarFabricacion={(orden, itemId) => setModalFab({ orden, items: orden.items_of.filter(i => i.centro_costo === centroCosto), itemInicialId: itemId })}
          onReversarFabricacion={(orden, itemId) => setModalRev({ orden, items: orden.items_of.filter(i => i.centro_costo === centroCosto), itemInicialId: itemId })}
        />
      )}
      {esLogistica && <VistaLogistica ordenes={ordenesFiltradas} filtroEstado={filtroEstado} />}

      {modalFab && (
        <ModalFabricacion orden={modalFab.orden} items={modalFab.items} itemInicialId={modalFab.itemInicialId}
          onCerrar={() => setModalFab(null)} onGuardado={refrescar} />
      )}
      {modalRev && (
        <ModalReversarFabricacion orden={modalRev.orden} items={modalRev.items} itemInicialId={modalRev.itemInicialId}
          onCerrar={() => setModalRev(null)} onGuardado={refrescar} />
      )}
      {modalRevEnt && (
        <ModalReversarEntrega orden={modalRevEnt.orden} items={modalRevEnt.items} itemInicialId={modalRevEnt.itemInicialId}
          onCerrar={() => setModalRevEnt(null)} onGuardado={refrescar} />
      )}
      {modalEnt && (
        <ModalEntrega orden={modalEnt.orden} items={modalEnt.items} itemInicialId={modalEnt.itemInicialId}
          onCerrar={() => setModalEnt(null)} onGuardado={refrescar} />
      )}
      {modalDetalle && <ModalDetalleOF orden={modalDetalle} onCerrar={() => setModalDetalle(null)} />}

      {modalCancelar && (
        <Modal titulo="Cancelar Orden de Fabricación" onCerrar={() => setModalCancelar(null)}>
          <form onSubmit={confirmarCancelar} className="space-y-4">
            <Alerta tipo="alerta" mensaje={`Vas a cancelar ${formatoOF(modalCancelar.numero)} — ${modalCancelar.cliente}. Dejará de aparecer como pendiente para producción y despacho. Puedes reactivarla después si fue un error.`} />
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Motivo (opcional)</label>
              <textarea rows={3} value={motivoCancelar} onChange={e => setMotivoCancelar(e.target.value)} placeholder="Ej: El cliente canceló el pedido"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalCancelar(null)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-feisen-gris-oscuro">Volver</button>
              <button type="submit" disabled={guardandoCancelar}
                className="flex-1 bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {guardandoCancelar ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function BadgeCentro({ centro }) {
  return <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-gray-100 text-feisen-texto-2 whitespace-nowrap">{CENTRO_NOMBRE[centro]}</span>
}

function BarraProgreso({ label, valor, total, color }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0
  return (
    <div className="w-[120px]">
      <div className="flex justify-between text-[11px] text-feisen-gris-medio mb-1">
        <span>{label}</span><span className="tabular-nums">{valor}/{total}</span>
      </div>
      <div className="w-full h-1.5 bg-feisen-borde rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function EtiquetaAlerta({ orden }) {
  const alerta = !orden.cancelada && alertaPromesa(orden)
  if (!alerta) return null
  return <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-feisen-rojo-suave text-feisen-rojo whitespace-nowrap">{alerta}</span>
}

// ---------- VISTA COMERCIAL / ADMIN ----------
function coincideEstado(orden, filtroEstado) {
  if (!filtroEstado) return true
  return orden.items_of.some(it => estadoClase(it) === filtroEstado)
}

function VistaComercial({ ordenes, vista, esAdmin, esComercial, puedeEditarOF, filtroEstado, onEditar, onRegistrarEntrega, onRegistrarFabricacion, onReversarFabricacion, onReversarEntrega, onVerDetalle, onCancelar, onReactivar }) {
  // OF abierta desde la vista "Por estado" (se muestra la tarjeta completa con sus botones en un modal)
  const [abiertaId, setAbiertaId] = useState(null)
  const ordenadas = ordenes // ya vienen ordenadas por número descendente (más nuevas primero)
  const vigentes = ordenadas.filter(o => !o.cancelada && coincideEstado(o, filtroEstado))
  const activas = vigentes.filter(o => !ofTotalmenteDespachada(o.items_of))
  const despachadas = vigentes.filter(o => ofTotalmenteDespachada(o.items_of))
  const canceladas = ordenadas.filter(o => o.cancelada && coincideEstado(o, filtroEstado))
  const abierta = abiertaId ? ordenes.find(o => o.id === abiertaId) : null

  // Al usar un botón desde el modal, se cierra para que el modal de la acción quede al frente
  const cerrarY = fn => (...args) => { setAbiertaId(null); fn(...args) }
  const acciones = {
    esAdmin, esComercial, puedeEditarOF, filtroEstado,
    onEditar: cerrarY(onEditar), onRegistrarEntrega: cerrarY(onRegistrarEntrega), onRegistrarFabricacion: cerrarY(onRegistrarFabricacion),
    onReversarFabricacion: cerrarY(onReversarFabricacion), onReversarEntrega: cerrarY(onReversarEntrega), onVerDetalle: cerrarY(onVerDetalle),
    onCancelar: cerrarY(onCancelar), onReactivar: cerrarY(onReactivar),
  }

  return (
    <div className="space-y-8">
      {vista === 'estado' ? (
        <VistaPorEstado activas={activas} despachadas={despachadas} onAbrir={o => setAbiertaId(o.id)} />
      ) : (
        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-4">
            <TituloSeccion texto="OF activas" cantidad={activas.length} />
            {activas.length === 0 && <p className="text-sm text-feisen-gris-medio italic">No hay Órdenes de Fabricación activas.</p>}
            {activas.map(o => <TarjetaOF key={o.id} orden={o} {...acciones} />)}
          </div>
          <div className="space-y-3">
            <TituloSeccion texto="OF despachadas" cantidad={despachadas.length} />
            {despachadas.length === 0 && <p className="text-sm text-feisen-gris-medio italic">Todavía no hay Órdenes de Fabricación despachadas.</p>}
            {despachadas.map(o => <TarjetaDespachada key={o.id} orden={o} {...acciones} />)}
          </div>
        </div>
      )}

      {canceladas.length > 0 && (
        <div className="space-y-4">
          <TituloSeccion texto="OF canceladas" cantidad={canceladas.length} />
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            {canceladas.map(o => <TarjetaOF key={o.id} orden={o} {...acciones} />)}
          </div>
        </div>
      )}

      {abierta && (
        <Modal titulo={`${formatoOF(abierta.numero)} — ${abierta.cliente}`} onCerrar={() => setAbiertaId(null)} ancho="sm:max-w-3xl">
          <TarjetaOF orden={abierta} {...acciones} completada={ofTotalmenteDespachada(abierta.items_of)} sinMarco />
        </Modal>
      )}
    </div>
  )
}

function TituloSeccion({ texto, cantidad }) {
  return (
    <h3 className="text-sm font-semibold text-feisen-texto-2 flex items-center gap-2">
      {texto} <span className="text-feisen-gris-medio font-medium tabular-nums">{cantidad}</span>
    </h3>
  )
}

function TarjetaOF({ orden, esAdmin, puedeEditarOF, filtroEstado, onEditar, onRegistrarEntrega, onRegistrarFabricacion, onReversarFabricacion, onReversarEntrega, onVerDetalle, onCancelar, onReactivar, completada, sinMarco }) {
  const cancelada = orden.cancelada
  // Con nivel Registra solo se modifican las OF propias; las demás se ven sin botones
  const puedeEditar = puedeEditarOF(orden)
  const itemsAMostrar = filtroEstado ? orden.items_of.filter(it => estadoClase(it) === filtroEstado) : orden.items_of
  return (
    <div className={`bg-white overflow-hidden ${sinMarco ? '-mx-6 -my-5' : 'border border-feisen-borde rounded-xl'} ${cancelada ? 'opacity-70' : ''}`}>
      {/* Encabezado */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] text-feisen-texto">
            <span className="font-semibold text-feisen-azul tabular-nums">{formatoOF(orden.numero)}</span>
            <span className="font-semibold ml-2">{orden.cliente}</span>
          </p>
          <p className="text-xs text-feisen-gris-medio mt-1 tabular-nums">
            Orden {formatFecha(orden.fecha_orden)} · Promesa {formatFecha(orden.fecha_promesa)}
            {orden.numero_cotizacion && <> · Cot. {orden.numero_cotizacion}</>}
          </p>
          {cancelada && orden.motivo_cancelacion && (
            <p className="text-xs text-feisen-gris-medio mt-1 italic">Motivo: {orden.motivo_cancelacion}</p>
          )}
        </div>
        <div className="flex-shrink-0">
          {cancelada && <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-gray-100 text-feisen-texto-2">Cancelada</span>}
          {!cancelada && completada && <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-emerald-50 text-emerald-700">Despachado completo</span>}
          <EtiquetaAlerta orden={orden} />
        </div>
      </div>

      {/* Envío */}
      <div className="px-5 py-2 bg-feisen-fondo border-y border-feisen-borde-suave text-xs text-feisen-texto-2 flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1"><MapPin size={13} strokeWidth={1.8} /> {orden.ciudad}</span>
        <span className="flex items-center gap-1 min-w-0"><Truck size={13} strokeWidth={1.8} /> <span className="truncate">{nombreTransporte(orden)}</span></span>
      </div>

      {orden.notas && (
        <div className="px-5 pt-3 text-xs text-feisen-texto-2">
          <span className="font-semibold text-feisen-azul">Notas:</span> {orden.notas}
        </div>
      )}

      {/* Productos */}
      <div className="px-5 divide-y divide-feisen-borde-suave">
        {itemsAMostrar.map(item => (
          <div key={item.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-feisen-texto">
                <span className="font-medium">{item.producto}</span>
                <span className="text-feisen-texto-2"> · {item.color} · </span>
                <span className="font-semibold tabular-nums">{item.cantidad} uds</span>
              </p>
              {item.detalle && <p className="text-xs text-feisen-gris-medio mt-0.5">{item.detalle}</p>}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <BadgeCentro centro={item.centro_costo} />
                <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${ESTADO_BADGE_CLASE[estadoClase(item)]}`}>{estadoTexto(item)}</span>
              </div>
            </div>
            <div className="flex gap-4 sm:flex-col sm:gap-2">
              <BarraProgreso label="Fabricado" valor={item.producido} total={item.cantidad} color="#064794" />
              <BarraProgreso label="Despachado" valor={item.entregado} total={item.cantidad} color="#2E7D32" />
            </div>
            <div className="flex flex-col gap-1.5 w-full sm:w-40 sm:flex-shrink-0">
              {cancelada ? (
                <span className="text-xs text-feisen-gris-medio sm:text-right">-</span>
              ) : (
                <>
                  {esAdmin && pendienteProducir(item) > 0 && (
                    <button onClick={() => onRegistrarFabricacion(orden, item.id)}
                      className="text-xs bg-feisen-azul hover:bg-feisen-azul-claro text-white px-3 py-2 rounded-lg font-semibold transition-colors">
                      Registrar fabricación
                    </button>
                  )}
                  {puedeEditar && disponibleDespacho(item) > 0 && (
                    <button onClick={() => onRegistrarEntrega(orden, item.id)}
                      className="text-xs bg-white border border-feisen-rojo text-feisen-rojo hover:bg-feisen-rojo-suave px-3 py-2 rounded-lg font-semibold transition-colors">
                      Registrar entrega
                    </button>
                  )}
                  {esAdmin && disponibleDespacho(item) > 0 && (
                    <button onClick={() => onReversarFabricacion(orden, item.id)}
                      className="text-[11px] text-feisen-gris-medio hover:text-feisen-rojo sm:text-right">
                      ↩ Reversar fabricación
                    </button>
                  )}
                  {puedeEditar && item.entregado > 0 && (
                    <button onClick={() => onReversarEntrega(orden, item.id)}
                      className="text-[11px] text-feisen-gris-medio hover:text-feisen-rojo sm:text-right">
                      ↩ Reversar despacho
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pie */}
      <div className="px-5 py-2.5 border-t border-feisen-borde-suave flex items-center justify-between gap-3 flex-wrap text-xs">
        <span className="text-feisen-gris-medio">Creado por: {orden.creador?.nombre || '—'}</span>
        <span className="flex items-center gap-4">
          {!sinMarco && <button onClick={() => onVerDetalle(orden)} className="text-feisen-azul font-medium hover:underline">Ver detalle</button>}
          {puedeEditar && !cancelada && (
            <button onClick={() => onEditar(orden.id)} className="text-feisen-azul font-medium hover:underline flex items-center gap-1">
              <Edit2 size={12} /> Editar
            </button>
          )}
          {puedeEditar && cancelada && (
            <button onClick={() => onReactivar(orden)} className="text-emerald-700 font-medium hover:underline flex items-center gap-1">
              <RotateCcw size={12} /> Reactivar
            </button>
          )}
          {puedeEditar && !cancelada && !completada && (
            <button onClick={() => onCancelar(orden)} className="text-feisen-gris-medio hover:text-feisen-rojo flex items-center gap-1">
              <Ban size={12} /> Cancelar OF
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

// Tarjeta compacta para la columna de OF ya despachadas
function TarjetaDespachada({ orden, puedeEditarOF, onVerDetalle, onReversarEntrega, onEditar }) {
  let ultima = null
  orden.items_of.forEach(it => it.entregas?.forEach(e => { if (e.tipo !== 'reversion' && (!ultima || e.fecha > ultima)) ultima = e.fecha }))
  const aTiempo = ultima && ultima <= orden.fecha_promesa
  return (
    <div className="bg-white border border-feisen-borde rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-feisen-texto min-w-0">
          <span className="font-semibold text-feisen-azul tabular-nums">{formatoOF(orden.numero)}</span>
          <span className="font-medium ml-1.5">{orden.cliente}</span>
        </p>
        <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" aria-label="Despachada" />
      </div>
      {ultima && (
        <p className="text-xs text-feisen-gris-medio mt-1 tabular-nums">
          Entregada {formatFecha(ultima)} · {aTiempo ? 'a tiempo' : <span className="text-feisen-rojo">después de la promesa</span>}
        </p>
      )}
      <p className="text-xs text-feisen-texto-2 mt-1.5 truncate">
        {orden.items_of.map(it => `${it.producto} ×${it.cantidad}`).join(' · ')}
      </p>
      <div className="flex items-center gap-4 mt-2 text-xs">
        <button onClick={() => onVerDetalle(orden)} className="text-feisen-azul font-medium hover:underline">Ver detalle</button>
        {puedeEditarOF(orden) && (
          <button onClick={() => onEditar(orden.id)} className="text-feisen-azul font-medium hover:underline">Editar</button>
        )}
        {puedeEditarOF(orden) && (
          <button onClick={() => onReversarEntrega(orden, orden.items_of.find(it => it.entregado > 0)?.id)}
            className="text-feisen-gris-medio hover:text-feisen-rojo ml-auto">↩ Reversar despacho</button>
        )}
      </div>
    </div>
  )
}

// ---------- VISTA "POR ESTADO": OF agrupadas según en qué va su fabricación/despacho ----------
const GRUPOS_ESTADO = [
  { id: 'pendiente',  label: 'Pendiente producción', punto: 'bg-feisen-gris-medio' },
  { id: 'produccion', label: 'En producción',        punto: 'bg-feisen-azul' },
  { id: 'listo',      label: 'Listo para despacho',  punto: 'bg-feisen-rojo' },
]

function VistaPorEstado({ activas, despachadas, onAbrir }) {
  const [verDespachadas, setVerDespachadas] = useState(false)
  const grupos = GRUPOS_ESTADO.map(g => ({ ...g, ordenes: activas.filter(o => estadoOF(o.items_of) === g.id) }))
    .filter(g => g.ordenes.length > 0)

  return (
    <div className="space-y-5 max-w-5xl">
      {grupos.length === 0 && <p className="text-sm text-feisen-gris-medio italic">No hay Órdenes de Fabricación activas.</p>}
      {grupos.map(g => (
        <GrupoEstado key={g.id} label={g.label} punto={g.punto} ordenes={g.ordenes} onAbrir={onAbrir} />
      ))}
      {despachadas.length > 0 && (
        verDespachadas
          ? <GrupoEstado label="Despachadas" punto="bg-emerald-600" ordenes={despachadas} onAbrir={onAbrir} />
          : (
            <button onClick={() => setVerDespachadas(true)} className="text-sm text-feisen-azul font-medium hover:underline">
              Ver {despachadas.length} OF despachadas
            </button>
          )
      )}
    </div>
  )
}

function GrupoEstado({ label, punto, ordenes, onAbrir }) {
  return (
    <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
      <div className="px-5 pt-3.5 pb-2.5 flex items-center gap-2 text-sm font-semibold text-feisen-texto-2">
        <span className={`w-2 h-2 rounded-full ${punto}`} />
        {label}
        <span className="text-feisen-gris-medio font-medium tabular-nums">{ordenes.length}</span>
      </div>
      <div className="divide-y divide-feisen-borde-suave border-t border-feisen-borde-suave">
        {ordenes.map(o => <FilaEstado key={o.id} orden={o} onAbrir={onAbrir} />)}
      </div>
    </div>
  )
}

function FilaEstado({ orden, onAbrir }) {
  const items = orden.items_of
  const totalCant = items.reduce((s, it) => s + Number(it.cantidad), 0)
  const totalFab = items.reduce((s, it) => s + Number(it.producido), 0)
  const pct = totalCant > 0 ? Math.round((totalFab / totalCant) * 100) : 0
  const primero = items[0]
  return (
    <button onClick={() => onAbrir(orden)}
      className="w-full text-left px-5 py-3.5 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_130px_110px] gap-x-6 gap-y-2 items-center hover:bg-feisen-fondo transition-colors">
      <div className="min-w-0">
        <p className="text-sm text-feisen-texto truncate">
          <span className="font-semibold text-feisen-azul tabular-nums">{formatoOF(orden.numero)}</span>
          <span className="font-medium ml-2">{orden.cliente}</span>
        </p>
        <p className="text-xs text-feisen-texto-2 mt-0.5 truncate">
          {primero ? `${primero.producto} · ${primero.cantidad} uds` : 'Sin productos'}
          {items.length > 1 && <span className="text-feisen-gris-medio"> · +{items.length - 1} producto{items.length > 2 ? 's' : ''} más</span>}
        </p>
      </div>
      <div className="hidden sm:block">
        <div className="flex justify-between text-[11px] text-feisen-gris-medio mb-1">
          <span>Fabricado</span><span className="tabular-nums">{totalFab}/{totalCant}</span>
        </div>
        <div className="w-full h-1.5 bg-feisen-borde rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#2E7D32' : '#064794' }} />
        </div>
      </div>
      <div className="text-right">
        {alertaPromesa(orden)
          ? <EtiquetaAlerta orden={orden} />
          : <span className="text-xs text-feisen-gris-medio tabular-nums">{formatFecha(orden.fecha_promesa)}</span>}
      </div>
    </button>
  )
}

// ---------- VISTA JEFE DE ÁREA: una tarjeta por OF, con todos sus productos agrupados ----------
function VistaJefeArea({ ordenes, centroCosto, filtroEstado, onRegistrarFabricacion, onReversarFabricacion }) {
  const grupos = []
  ordenes.forEach(o => {
    if (o.cancelada) return
    const items = o.items_of.filter(item => {
      if (item.centro_costo !== centroCosto) return false
      // Los ya despachados nunca se muestran aquí, sin importar el filtro (eso solo lo ve Comercial/Admin)
      const noDespachado = pendienteProducir(item) > 0 || disponibleDespacho(item) > 0
      return noDespachado && (!filtroEstado || estadoClase(item) === filtroEstado)
    })
    if (items.length) grupos.push({ orden: o, items })
  })

  if (grupos.length === 0) return <p className="text-sm text-feisen-gris-medio italic bg-white rounded-2xl p-6 text-center">No hay productos pendientes en esta vista.</p>

  return (
    <>
      {/* TARJETAS: vista para celular */}
      <div className="sm:hidden space-y-3">
        {grupos.map(({ orden, items }) => (
          <div key={orden.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-feisen-azul">{formatoOF(orden.numero)}</p>
              <span className="text-xs text-feisen-gris-medio whitespace-nowrap">Promesa: {formatFecha(orden.fecha_promesa)}</span>
            </div>
            <p className="text-xs text-feisen-gris-medio -mt-2">Fecha del pedido: {formatFecha(orden.fecha_orden)}</p>
            {orden.notas && (
              <div className="bg-blue-50 border-l-4 border-feisen-azul rounded-lg px-3 py-1.5 text-xs text-feisen-gris-oscuro">
                <span className="font-semibold text-feisen-azul">Notas:</span> {orden.notas}
              </div>
            )}
            <div className="space-y-2.5">
              {items.map(item => (
                <div key={item.id} className="border border-gray-100 rounded-xl px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-feisen-gris-oscuro text-sm">{item.producto}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ESTADO_BADGE_CLASE[estadoClase(item)]}`}>{estadoTexto(item)}</span>
                  </div>
                  <p className="text-xs text-feisen-gris-medio">{item.color}{item.detalle ? ' · ' + item.detalle : ''}</p>
                  <p className="font-bold text-feisen-azul text-sm">Cant.: {item.cantidad}</p>
                  <BarraProgreso label="Fabricado" valor={item.producido} total={item.cantidad} color="#064794" />
                  <div className="flex flex-col gap-2 pt-1">
                    {pendienteProducir(item) > 0 && (
                      <button onClick={() => onRegistrarFabricacion(orden, item.id)}
                        className="w-full text-sm bg-feisen-azul text-white px-3 py-2.5 rounded-xl font-semibold">
                        Registrar fabricación →
                      </button>
                    )}
                    {disponibleDespacho(item) > 0 && (
                      <button onClick={() => onReversarFabricacion(orden, item.id)}
                        className="text-xs text-feisen-gris-medio hover:text-feisen-rojo text-center">
                        ↩ Reversar fabricación
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-feisen-gris-medio pt-1 border-t border-gray-100">Creado por: {orden.creador?.nombre || '—'}</p>
          </div>
        ))}
      </div>

      {/* TARJETAS: vista para tablet/escritorio, una por OF */}
      <div className="hidden sm:block space-y-4">
        {grupos.map(({ orden, items }) => (
          <div key={orden.id} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <p className="font-bold text-feisen-azul">{formatoOF(orden.numero)}</p>
              <p className="text-xs text-feisen-gris-medio whitespace-nowrap">
                Fecha del pedido: {formatFecha(orden.fecha_orden)} · Promesa: {formatFecha(orden.fecha_promesa)} · Por: {orden.creador?.nombre || '—'}
              </p>
            </div>
            {orden.notas && (
              <div className="bg-blue-50 border-l-4 border-feisen-azul rounded-xl px-4 py-2 text-xs text-feisen-gris-oscuro">
                <span className="font-semibold text-feisen-azul">Notas:</span> {orden.notas}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-feisen-gris-medio uppercase border-b border-gray-200">
                    <th className="py-2 pr-2">Producto</th><th className="px-2">Cant.</th><th className="px-2">Estado</th>
                    <th className="px-2">Progreso</th><th className="px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2 pr-2">
                        <p className="font-medium text-feisen-gris-oscuro">{item.producto}</p>
                        <p className="text-xs text-feisen-gris-medio">{item.color}{item.detalle ? ' · ' + item.detalle : ''}</p>
                      </td>
                      <td className="px-2 font-bold text-feisen-azul">{item.cantidad}</td>
                      <td className="px-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ESTADO_BADGE_CLASE[estadoClase(item)]}`}>{estadoTexto(item)}</span></td>
                      <td className="px-2"><BarraProgreso label="Fabricado" valor={item.producido} total={item.cantidad} color="#064794" /></td>
                      <td className="px-2">
                        <div className="flex flex-col gap-1 items-start">
                          {pendienteProducir(item) > 0 && (
                            <button onClick={() => onRegistrarFabricacion(orden, item.id)}
                              className="text-xs bg-feisen-azul text-white px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap">
                              Registrar fabricación →
                            </button>
                          )}
                          {disponibleDespacho(item) > 0 && (
                            <button onClick={() => onReversarFabricacion(orden, item.id)}
                              className="text-[10px] text-feisen-gris-medio hover:text-feisen-rojo whitespace-nowrap">
                              ↩ Reversar fabricación
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------- VISTA LOGÍSTICA: una tarjeta por OF, con todos sus productos agrupados ----------
function VistaLogistica({ ordenes, filtroEstado }) {
  const grupos = []
  ordenes.forEach(o => {
    if (o.cancelada) return
    // Logística ve la OF completa desde que se crea (no solo cuando algo ya está listo para
    // despachar), así puede anticipar temas de motores, kits de ensamble, etc. El filtro de
    // estado (si hay uno activo) solo decide qué productos de la OF se muestran.
    const items = o.items_of.filter(item => {
      if (item.entregado >= item.cantidad) return false
      if (filtroEstado && estadoClase(item) !== filtroEstado) return false
      return true
    })
    if (items.length) grupos.push({ orden: o, items })
  })

  if (grupos.length === 0) return <p className="text-sm text-feisen-gris-medio italic bg-white rounded-2xl p-6 text-center">No hay productos listos para despacho en este momento.</p>

  return (
    <>
      {/* TARJETAS: vista para celular */}
      <div className="sm:hidden space-y-3">
        {grupos.map(({ orden, items }) => (
          <div key={orden.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-feisen-azul">{formatoOF(orden.numero)}</p>
              <span className="text-xs text-feisen-gris-medio whitespace-nowrap">Promesa: {formatFecha(orden.fecha_promesa)}</span>
            </div>
            {orden.notas && (
              <div className="bg-blue-50 border-l-4 border-feisen-azul rounded-lg px-3 py-1.5 text-xs text-feisen-gris-oscuro">
                <span className="font-semibold text-feisen-azul">Notas:</span> {orden.notas}
              </div>
            )}
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="border border-gray-100 rounded-xl px-3 py-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-feisen-gris-oscuro text-sm">{item.producto}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ESTADO_BADGE_CLASE[estadoClase(item)]}`}>{estadoTexto(item)}</span>
                  </div>
                  <p className="text-xs text-feisen-gris-medio">{item.color}{item.detalle ? ' · ' + item.detalle : ''}</p>
                  <div className="flex items-center justify-between text-xs text-feisen-gris-medio">
                    <span>Fabricado: {item.producido}/{item.cantidad}</span>
                    <span className="font-semibold text-feisen-azul">Disponible: {disponibleDespacho(item)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-feisen-gris-medio pt-1">
              <span>{orden.ciudad} · {nombreTransporte(orden)}</span>
            </div>
            <p className="text-[11px] text-feisen-gris-medio pt-1 border-t border-gray-100">Creado por: {orden.creador?.nombre || '—'}</p>
          </div>
        ))}
      </div>

      {/* TARJETAS: vista para tablet/escritorio, una por OF */}
      <div className="hidden sm:block space-y-4">
        {grupos.map(({ orden, items }) => (
          <div key={orden.id} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <p className="font-bold text-feisen-azul">{formatoOF(orden.numero)}</p>
              <p className="text-xs text-feisen-gris-medio whitespace-nowrap">
                Promesa: {formatFecha(orden.fecha_promesa)} · {orden.ciudad} · {nombreTransporte(orden)} · Por: {orden.creador?.nombre || '—'}
              </p>
            </div>
            {orden.notas && (
              <div className="bg-blue-50 border-l-4 border-feisen-azul rounded-xl px-4 py-2 text-xs text-feisen-gris-oscuro">
                <span className="font-semibold text-feisen-azul">Notas:</span> {orden.notas}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-feisen-gris-medio uppercase border-b border-gray-200">
                    <th className="py-2 pr-2">Producto</th><th className="px-2">Estado</th>
                    <th className="px-2">Fabricado</th><th className="px-2">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2 pr-2">
                        <p className="font-medium text-feisen-gris-oscuro">{item.producto}</p>
                        <p className="text-xs text-feisen-gris-medio">{item.color}{item.detalle ? ' · ' + item.detalle : ''}</p>
                      </td>
                      <td className="px-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ESTADO_BADGE_CLASE[estadoClase(item)]}`}>{estadoTexto(item)}</span></td>
                      <td className="px-2 text-feisen-gris-medio">{item.producido}/{item.cantidad}</td>
                      <td className="px-2 font-semibold text-feisen-azul">{disponibleDespacho(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
