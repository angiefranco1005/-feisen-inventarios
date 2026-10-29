import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { useNavigate } from 'react-router-dom'
import { Plus, ShoppingCart, Truck, CheckCircle, Search, Trash2, RefreshCw, Edit2, Clock, Upload, ImageIcon, X, PackageOpen, FileText, Download, Lock, ClipboardList, PackageCheck, MoreHorizontal } from '../shared/iconos'
import { useAviso, PanelLateral } from '../shared/ui'
import ModalGenerarOC from './ModalGenerarOC'
import { exportarOrdenCompraPDF, calcularTotalesOC } from '../../utils/exportOrdenCompraPDF'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { siguienteNumero } from '../../utils/siguienteNumero'
import { esBodegaMotores, ajustarSeriales, problemaSeriales, serialesYaEnBodega, registrarSerialesEntrada, CamposSerial } from '../shared/seriales'

const ESTADO_CONFIG = {
  pendiente:               { label: 'Pendiente',            color: 'bg-amber-100 text-amber-700',   icon: ShoppingCart },
  en_transito:             { label: 'En camino',            color: 'bg-blue-100 text-blue-700',     icon: Truck        },
  recibido:                { label: 'Recibido',             color: 'bg-green-100 text-green-700',   icon: CheckCircle  },
  parcialmente_recibido:   { label: 'Llegó una parte',      color: 'bg-orange-100 text-orange-700', icon: PackageOpen  },
  cerrado:                 { label: 'Cerrado',              color: 'bg-gray-100 text-gray-500',     icon: CheckCircle  },
}

const PRIORIDAD_CONFIG = {
  urgente:       { label: 'Urgente',       color: 'bg-red-100 text-red-700 border border-red-200'     },
  normal:        { label: 'Normal',         color: 'bg-blue-50 text-blue-700 border border-blue-200'   },
  puede_esperar: { label: 'Puede esperar',  color: 'bg-green-50 text-green-700 border border-green-200' },
}

const PRIORIDAD_ORDEN = { urgente: 0, normal: 1, puede_esperar: 2 }

const HISTORIAL_LABELS = {
  creado:                  'Pedido creado',
  editado:                 'Pedido editado',
  en_transito:             'Pasó a En camino',
  oc_generada:             'Orden de compra generada',
  recibido:                'Recibido',
  parcialmente_recibido:   'Recibido parcialmente',
  cerrado:                 'Pedido cerrado',
}

const UNIDADES = ['und', 'kg', 'g', 'lb', 'm', 'cm', 'L', 'ml', 'rollo', 'par', 'caja', 'bulto']

const MOTIVOS_CIERRE = [
  'Ya no se necesita',
  'El proveedor no lo tiene',
  'Se creó otra orden para cambiar de proveedor',
]

// Días de atraso de un pedido en camino: la fecha estimada de llegada ya pasó y no ha llegado todo
const HOY_ISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
function diasDeAtraso(p) {
  if (!(p.estado === 'en_transito' || p.estado === 'parcialmente_recibido') || !p.fecha_estimada_llegada) return 0
  const eta = p.fecha_estimada_llegada.slice(0, 10), hoy = HOY_ISO()
  if (eta >= hoy) return 0
  return Math.round((new Date(hoy + 'T12:00:00') - new Date(eta + 'T12:00:00')) / 86400000)
}
function etiquetaLlegada(f) {
  const eta = f.slice(0, 10), hoy = HOY_ISO()
  const dias = Math.round((new Date(eta + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 86400000)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  if (dias < 7) return 'el ' + new Date(eta + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long' })
  return 'el ' + new Date(eta + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

// Ignora mayúsculas/tildes para que "compresor" encuentre "Compresor" o "compresór"
function normalizar(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const NOMBRE_FILTRO = { curso: 'Pedidos en curso', todos: 'Todos los pedidos', atrasados: 'Atrasados', cerrado: 'Recibidos y cerrados' }

// Etapas arriba de la lista (seguimiento tipo compra en línea): barra con el reparto de los
// pedidos y una tarjeta por etapa que sirve de filtro. Los atrasados (ya pasó la fecha
// estimada de llegada) se cuentan aparte en rojo dentro de "En camino".
const ETAPAS = [
  { clave: 'pendiente',             titulo: 'Por comprar',      icono: ClipboardList, caja: 'bg-gray-100 text-feisen-texto-2',        barra: 'bg-gray-300' },
  { clave: 'en_transito',           titulo: 'En camino',        icono: Truck,         caja: 'bg-feisen-azul-suave text-feisen-azul', barra: 'bg-feisen-azul' },
  { clave: 'parcialmente_recibido', titulo: 'Llegó una parte',  icono: PackageOpen,   caja: 'bg-amber-50 text-amber-700',            barra: 'bg-amber-400' },
  { clave: 'cerrado',               titulo: 'Recibidos',        icono: PackageCheck,  caja: 'bg-emerald-50 text-emerald-700',        barra: 'bg-emerald-500' },
]

function EtapasPedidos({ pedidos, filtro, onFiltro }) {
  const deEtapa = clave => pedidos.filter(p => clave === 'cerrado' ? (p.estado === 'cerrado' || p.estado === 'recibido') : p.estado === clave)
  const atrasados = pedidos.filter(p => diasDeAtraso(p) > 0)
  const enCaminoAtrasados = deEtapa('en_transito').filter(p => diasDeAtraso(p) > 0).length
  const diasDesde = p => Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000)
  const porComprar = deEtapa('pendiente')
  const masViejo = porComprar.length ? Math.max(...porComprar.map(diasDesde)) : 0
  // Reparto: a tiempo y atrasados por separado para que el rojo se vea en la barra
  const tramos = [
    { n: porComprar.length, color: 'bg-gray-300', t: 'Por comprar' },
    { n: deEtapa('en_transito').length - enCaminoAtrasados, color: 'bg-feisen-azul', t: 'En camino a tiempo' },
    { n: atrasados.length, color: 'bg-feisen-rojo', t: 'Atrasados' },
    { n: deEtapa('parcialmente_recibido').filter(p => !diasDeAtraso(p)).length, color: 'bg-amber-400', t: 'Llegó una parte' },
    { n: deEtapa('cerrado').length, color: 'bg-emerald-500', t: 'Recibidos y cerrados' },
  ].filter(x => x.n > 0)
  const detalle = clave => {
    if (clave === 'pendiente') return porComprar.length ? `el más viejo: hace ${masViejo} ${masViejo === 1 ? 'día' : 'días'}` : 'nada por comprar'
    if (clave === 'en_transito') return enCaminoAtrasados ? null : 'todos a tiempo'
    if (clave === 'parcialmente_recibido') return 'falta que llegue algo'
    return 'incluye los cerrados'
  }

  return (
    <div className="space-y-2.5">
      <div className="bg-white border border-feisen-borde rounded-xl px-4 py-3">
        <div className="flex justify-between gap-2 text-xs text-feisen-texto-2 mb-2">
          <span>Cómo van los {pedidos.length.toLocaleString('es-CO')} pedidos</span>
          {atrasados.length > 0 && (
            <button type="button" onClick={() => onFiltro(filtro === 'atrasados' ? 'curso' : 'atrasados')}
              className={`font-semibold rounded-md px-2 -my-0.5 py-0.5 ${filtro === 'atrasados' ? 'bg-feisen-rojo text-white' : 'text-feisen-rojo hover:bg-feisen-rojo-suave'}`}>
              {atrasados.length} atrasados
            </button>
          )}
        </div>
        <div className="flex h-3 rounded-md overflow-hidden gap-0.5" role="img"
          aria-label={tramos.map(x => `${x.t}: ${x.n}`).join(', ')}>
          {tramos.map(x => <span key={x.t} className={`${x.color} h-full`} style={{ flex: x.n }} title={`${x.t}: ${x.n}`} />)}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11.5px] text-feisen-texto-2">
          {tramos.map(x => (
            <span key={x.t} className="inline-flex items-center gap-1.5 tabular-nums">
              <span className={`w-2 h-2 rounded-sm ${x.color}`} />{x.t} {x.n.toLocaleString('es-CO')}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5" role="group" aria-label="Filtrar por etapa">
        {ETAPAS.map(e => {
          const n = deEtapa(e.clave).length
          const activa = filtro === e.clave
          const Ico = e.icono
          const det = detalle(e.clave)
          return (
            <button key={e.clave} type="button" aria-pressed={activa} onClick={() => onFiltro(activa ? 'curso' : e.clave)}
              className={`text-left bg-white rounded-xl border p-3 flex flex-col gap-1.5 transition-colors active:scale-[.98]
                ${activa ? 'border-feisen-azul ring-1 ring-feisen-azul' : 'border-feisen-borde hover:border-gray-300'}`}>
              <span className="flex items-start justify-between">
                <span className={`w-9 h-9 rounded-lg grid place-items-center ${e.caja}`}><Ico size={19} /></span>
                <span className="text-2xl font-semibold text-feisen-texto tabular-nums leading-none">{n.toLocaleString('es-CO')}</span>
              </span>
              <span className="text-sm font-semibold text-feisen-texto">{e.titulo}</span>
              {det
                ? <span className="text-xs text-feisen-texto-2">{det}</span>
                : <span className="text-xs font-semibold text-feisen-rojo">{enCaminoAtrasados} atrasados</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Ficha de pedido ─────────────────────────────────────────────────────────
// Responde 3 cosas de un vistazo: qué se pidió, quién lo pidió y en qué va. Un solo botón
// con el paso que sigue (Generar OC / Recibir); el resto de acciones en el menú ⋯ y todo el
// detalle (productos, observación, foto, OC, entradas, historial) en el panel lateral.
const ICONO_ETAPA = { pendiente: ClipboardList, en_transito: Truck, parcialmente_recibido: PackageOpen, recibido: PackageCheck, cerrado: Lock }
const CAJA_ETAPA  = {
  pendiente: 'bg-gray-100 text-feisen-texto-2', en_transito: 'bg-feisen-azul-suave text-feisen-azul',
  parcialmente_recibido: 'bg-amber-50 text-amber-700', recibido: 'bg-emerald-50 text-emerald-700', cerrado: 'bg-gray-100 text-gray-400',
}
const fechaCorta = f => new Date(f.length === 10 ? f + 'T12:00:00' : f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '')
const dias = n => `${n} ${n === 1 ? 'día' : 'días'}`

// Cómo va el pedido, en palabras (lo que se lee a la derecha de la ficha y arriba del panel)
function estadoPedido(p) {
  const atraso = diasDeAtraso(p)
  const its = p.pedido_items || []
  const completos = its.filter(it => (it.cantidad_recibida || 0) >= it.cantidad).length
  if (p.estado === 'recibido') return { tono: 'verde', titulo: 'Recibido', detalle: p.fecha_recibido ? fechaCorta(p.fecha_recibido) : 'completo' }
  if (p.estado === 'cerrado') return { tono: '', titulo: 'Cerrado', detalle: p.motivo_cierre || 'sin motivo' }
  if (atraso) return { tono: 'rojo', titulo: `Atrasado ${dias(atraso)}`, detalle: p.estado === 'parcialmente_recibido' ? `llegó ${completos} de ${its.length}` : `debía llegar el ${fechaCorta(p.fecha_estimada_llegada)}` }
  if (p.estado === 'parcialmente_recibido') return { tono: '', titulo: `Llegó ${completos} de ${its.length}`, detalle: p.fecha_estimada_llegada ? `el resto llega ${etiquetaLlegada(p.fecha_estimada_llegada)}` : 'falta que llegue algo' }
  if (p.estado === 'en_transito') return { tono: '', titulo: 'En camino', detalle: p.fecha_estimada_llegada ? `llega ${etiquetaLlegada(p.fecha_estimada_llegada)}` : 'sin fecha de llegada' }
  const d = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000)
  return { tono: d >= 6 ? 'rojo' : '', titulo: 'Por comprar', detalle: d === 0 ? 'pedido hoy' : `hace ${dias(d)}` }
}
const TONO_TEXTO = { rojo: 'text-feisen-rojo', verde: 'text-emerald-700', '': 'text-feisen-texto' }

// Cómo se compró: OC de la app, compra directa o el texto libre de antes ("NO HAY OC COMPRA EFRAIN")
function textoCompra(p, ordenes) {
  if (ordenes?.length) return ordenes.map(o => o.numero).join(', ')
  const t = (p.numero_oc || '').trim()
  if (!t) return null
  if (/^compra directa/i.test(t)) return t.replace(/^compra directa · /i, 'compra ')
  // Texto libre de antes: "NO HAY OC COMPRA EFRAIN" → "compra efrain"; "OC 46 CYRGO" queda igual
  if (/^no hay oc/i.test(t)) return t.replace(/^no hay oc\s*(compra\s*)?/i, 'compra ').toLowerCase()
  return t
}
const AREA_NOMBRE = { FUNDICION: 'Fundición', PRODUCCION: 'Producción', ALMACEN: 'Almacén', MECANIZADOS: 'Mecanizados', LOGISTICA: 'Logística', INNOVACION: 'Innovación', ADMINISTRACION: 'Administración' }
const nombreArea = a => a ? (AREA_NOMBRE[a] || a.charAt(0) + a.slice(1).toLowerCase()) : ''

function TarjetaPedido({ p, permisos, ordenesDelPedido, onAbrir, onAccion }) {
  const Ico = ICONO_ETAPA[p.estado] || ShoppingCart
  const est = estadoPedido(p)
  const its = p.pedido_items || []
  const que = its.length === 0 ? 'Pedido sin productos' : its.length === 1 ? its[0].descripcion : `${its[0].descripcion} y ${its.length - 1} más`
  const compra = textoCompra(p, ordenesDelPedido)
  const principal = accionPrincipal(p, permisos)
  return (
    <div className="bg-white rounded-xl border border-feisen-borde hover:border-gray-300 transition-colors grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2.5 items-center p-3 pl-3.5">
      <button type="button" onClick={onAbrir} aria-label={`Ver ${p.numero}`}
        className={`w-10 h-10 rounded-lg grid place-items-center ${est.tono === 'rojo' && p.estado !== 'pendiente' ? 'bg-feisen-rojo-suave text-feisen-rojo' : CAJA_ETAPA[p.estado]}`}>
        <Ico size={19} />
      </button>
      <button type="button" onClick={onAbrir} className="min-w-0 text-left">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-[15px] text-feisen-texto truncate">{que}</span>
          {p.prioridad === 'urgente' && <span className="shrink-0 text-[11px] font-semibold px-1.5 py-px rounded bg-feisen-rojo-suave text-feisen-rojo">Urgente</span>}
        </span>
        <span className="block text-[12.5px] text-feisen-texto-2 truncate">
          <span className="font-mono text-feisen-texto">{p.numero}</span>
          {' · '}{p.profiles?.nombre || p.solicitante_nombre || '—'}{p.area ? ` · ${nombreArea(p.area)}` : ''}
          {compra ? ` · ${compra}` : ''}
        </span>
      </button>
      <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-end gap-3 border-t sm:border-0 border-feisen-borde-suave pt-2.5 sm:pt-0">
        <button type="button" onClick={onAbrir} className="text-left sm:text-right min-w-0">
          <span className={`block text-[13.5px] font-semibold whitespace-nowrap ${TONO_TEXTO[est.tono]}`}>{est.titulo}</span>
          <span className="block text-xs text-feisen-texto-2 truncate max-w-[14rem]">{est.detalle}</span>
        </button>
        <span className="flex items-center gap-1 shrink-0">
          {principal && (
            <button type="button" onClick={() => onAccion(principal.clave, p)}
              className="bg-feisen-azul text-white rounded-lg px-3.5 min-h-[38px] text-sm font-semibold hover:opacity-90 active:scale-[.98] transition">
              {principal.texto}
            </button>
          )}
          <MenuAcciones opciones={opcionesMenu(p, permisos)} onElegir={clave => clave === 'ver' ? onAbrir() : onAccion(clave, p)} etiqueta={`Más acciones de ${p.numero}`} />
        </span>
      </div>
    </div>
  )
}

// El paso que sigue para este pedido, según el rol
function accionPrincipal(p, permisos) {
  if (p.estado === 'pendiente' && permisos.generarOC && (p.pedido_items?.length > 0)) return { clave: 'oc', texto: 'Generar OC' }
  if ((p.estado === 'en_transito' || p.estado === 'parcialmente_recibido') && permisos.recibir) return { clave: 'recibir', texto: 'Recibir' }
  return null
}
function opcionesMenu(p, permisos) {
  const abierto = p.estado !== 'cerrado' && p.estado !== 'recibido'
  return [
    { clave: 'ver', texto: 'Ver detalle e historial' },
    permisos.editar && p.estado === 'pendiente' && { clave: 'editar', texto: 'Editar pedido' },
    permisos.transito && p.estado === 'pendiente' && { clave: 'directa', texto: 'Compra directa (sin OC)' },
    permisos.generarOC && p.estado !== 'pendiente' && abierto && (p.pedido_items?.length > 0) && { clave: 'oc', texto: 'Generar otra orden de compra' },
    permisos.cerrar && p.estado !== 'cerrado' && { clave: 'cerrar', texto: 'Cerrar pedido…', separado: true },
    permisos.eliminar && { clave: 'eliminar', texto: 'Eliminar…', peligro: true, separado: !(permisos.cerrar && p.estado !== 'cerrado') },
  ].filter(Boolean)
}

function MenuAcciones({ opciones, onElegir, etiqueta }) {
  const [abierto, setAbierto] = useState(false)
  const [arriba, setArriba] = useState(false) // si no cabe abajo (barra del celular), se abre hacia arriba
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = e => { if (!ref.current?.contains(e.target)) setAbierto(false) }
    const esc = e => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  return (
    <span ref={ref} className="relative">
      <button type="button" aria-label={etiqueta} aria-expanded={abierto}
        onClick={e => { setArriba(e.currentTarget.getBoundingClientRect().bottom + 300 > window.innerHeight); setAbierto(a => !a) }}
        className={`w-9 h-[38px] grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo ${abierto ? 'bg-feisen-fondo' : ''}`}>
        <MoreHorizontal size={18} />
      </button>
      {abierto && (
        <span role="menu" className={`absolute right-0 ${arriba ? 'bottom-full mb-1' : 'top-full mt-1'} z-30 w-60 bg-white border border-feisen-borde rounded-lg shadow-lg p-1 flex flex-col`}>
          {opciones.map(o => (
            <span key={o.clave} className="contents">
              {o.separado && <span className="my-1 border-t border-feisen-borde-suave" />}
              <button type="button" role="menuitem" onClick={() => { setAbierto(false); onElegir(o.clave) }}
                className={`text-left px-3 py-2.5 rounded-md text-sm hover:bg-feisen-fondo ${o.peligro ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>
                {o.texto}
              </button>
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

// ── Panel de detalle del pedido ─────────────────────────────────────────────
function DetallePedido({ p, permisos, ordenesDelPedido, coberturaPorItem, entradasDelPedido, historial, onCerrar, onAccion }) {
  const est = estadoPedido(p)
  const principal = accionPrincipal(p, permisos)
  const compra = textoCompra(p, ordenesDelPedido)
  const fondo = est.tono === 'rojo' ? 'bg-feisen-rojo-suave' : est.tono === 'verde' ? 'bg-emerald-50' : 'bg-feisen-fondo'
  const titulo = h => <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{h}</h4>
  return (
    <PanelLateral etiqueta={`Detalle de ${p.numero}`} onCerrar={onCerrar} encabezado={
      <div>
        <h3 className="font-mono text-base font-semibold text-feisen-texto">{p.numero}</h3>
        <p className="text-sm text-feisen-texto-2">
          {p.profiles?.nombre || p.solicitante_nombre || '—'}{p.area ? ` · ${nombreArea(p.area)}` : ''} · pedido el {fechaCorta(p.created_at)}
          {p.prioridad === 'urgente' && <span className="ml-1.5 text-[11px] font-semibold px-1.5 py-px rounded bg-feisen-rojo-suave text-feisen-rojo">Urgente</span>}
        </p>
      </div>
    }>
      <div className={`rounded-xl px-4 py-3 ${fondo}`}>
        <p className={`text-base font-semibold ${TONO_TEXTO[est.tono]}`}>{est.titulo}</p>
        <p className="text-sm text-feisen-texto-2">{est.detalle}{compra ? ` · ${compra}` : ''}</p>
      </div>

      {(principal || (permisos.transito && p.estado === 'pendiente')) && (
        <div className="flex flex-wrap gap-2">
          {principal && (
            <button type="button" onClick={() => onAccion(principal.clave, p)}
              className="bg-feisen-azul text-white rounded-lg px-4 min-h-[42px] text-sm font-semibold hover:opacity-90 active:scale-[.98] transition">
              {principal.texto}
            </button>
          )}
          {permisos.transito && p.estado === 'pendiente' && (
            <button type="button" onClick={() => onAccion('directa', p)}
              className="border border-feisen-borde rounded-lg px-4 min-h-[42px] text-sm font-semibold text-feisen-texto hover:bg-feisen-fondo">
              Compra directa
            </button>
          )}
        </div>
      )}

      <section>
        {titulo('Productos')}
        <ul className="border border-feisen-borde rounded-lg divide-y divide-feisen-borde-suave">
          {(p.pedido_items || []).map(it => {
            const rec = it.cantidad_recibida || 0
            const falta = it.cantidad - rec
            const cubiertoOC = coberturaPorItem?.[it.id] || 0
            const llego = p.estado === 'parcialmente_recibido' || p.estado === 'recibido' || p.estado === 'cerrado'
            return (
              <li key={it.id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block text-feisen-texto break-words">{it.descripcion}</span>
                  {cubiertoOC > 0 && p.estado === 'pendiente' && (
                    <span className="block text-xs text-feisen-texto-2">En OC: {cubiertoOC}{cubiertoOC < it.cantidad ? ` · falta pedir ${it.cantidad - cubiertoOC}` : ''}</span>
                  )}
                </span>
                <span className="text-right whitespace-nowrap tabular-nums">
                  <span className="block text-feisen-texto">{it.cantidad} {it.unidad}</span>
                  {llego && rec > 0 && (
                    <span className={`block text-xs ${falta > 0 ? 'text-amber-700' : rec > it.cantidad ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {rec > it.cantidad ? `llegaron ${rec} · sobran ${rec - it.cantidad}` : falta > 0 ? `llegaron ${rec} · ${p.estado === 'cerrado' ? 'no llegaron' : 'faltan'} ${falta}` : 'completo'}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {p.observaciones && <section>{titulo('Observación')}<p className="text-sm text-feisen-texto bg-feisen-fondo rounded-lg px-3 py-2.5 break-words">{p.observaciones}</p></section>}
      {p.motivo_cierre && <section>{titulo('Motivo de cierre')}<p className="text-sm text-feisen-texto">{p.motivo_cierre}</p></section>}

      {p.foto_muestra_url && (
        <section>
          {titulo('Foto de muestra')}
          <a href={p.foto_muestra_url} target="_blank" rel="noopener noreferrer">
            <img src={p.foto_muestra_url} alt="Muestra" className="max-h-48 rounded-lg border border-feisen-borde object-contain bg-feisen-fondo hover:opacity-90 cursor-zoom-in" />
          </a>
        </section>
      )}

      {ordenesDelPedido?.length > 0 && (
        <section>
          {titulo('Órdenes de compra')}
          <div className="space-y-1.5">
            {ordenesDelPedido.map(oc => {
              if (!permisos.verDetalleOC) {
                return <div key={oc.id} className="text-sm border border-feisen-borde rounded-lg px-3 py-2 font-mono">{oc.numero}</div>
              }
              const totalOC = calcularTotalesOC((oc.orden_compra_items || []).reduce((s, it) => s + it.cantidad * it.precio_unitario, 0)).total
              return (
                <div key={oc.id} className="flex items-center justify-between gap-2 text-sm border border-feisen-borde rounded-lg pl-3 pr-1.5 py-1.5">
                  <span className="min-w-0">
                    <span className="font-mono font-semibold text-feisen-texto">{oc.numero}</span>
                    <span className="text-feisen-texto-2"> · {oc.proveedores?.nombre || 'Sin proveedor'} · ${Math.round(totalOC).toLocaleString('es-CO')} IVA incl.</span>
                  </span>
                  <button type="button" title="Descargar PDF"
                    onClick={() => exportarOrdenCompraPDF(oc, oc.proveedores, oc.orden_compra_items, { numero: p.numero }, oc.profiles?.nombre || '')}
                    className="shrink-0 inline-flex items-center gap-1 text-feisen-azul font-semibold text-xs px-2.5 py-2 rounded-md hover:bg-feisen-azul-suave">
                    <Download size={14} /> PDF
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {entradasDelPedido?.length > 0 && (
        <section>
          {titulo('Entradas al inventario')}
          <div className="space-y-1.5">
            {entradasDelPedido.map(en => (
              <div key={en.numero} className="flex justify-between gap-2 text-sm border border-feisen-borde rounded-lg px-3 py-2">
                <span className="font-mono text-feisen-texto">{en.numero}</span>
                <span className="text-feisen-texto-2">{en.lineas} {en.lineas === 1 ? 'producto' : 'productos'} · {en.fecha ? fechaCorta(en.fecha) : '—'}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">Búscalas en Historial por este número si hay que corregir algo.</p>
        </section>
      )}

      <section>
        {titulo('Historial')}
        {!historial ? <p className="text-sm text-gray-400">Cargando…</p>
          : historial.length === 0 ? <p className="text-sm text-gray-400">Sin registros.</p>
          : (
            <ol className="space-y-3">
              {historial.map(h => (
                <li key={h.id} className="relative pl-5 text-sm before:absolute before:left-1 before:top-1.5 before:w-2 before:h-2 before:rounded-full before:bg-feisen-azul">
                  <p className="text-feisen-texto">{(HISTORIAL_LABELS[h.accion] || h.accion).replace(/^[^\p{L}]+/u, '')}</p>
                  {h.detalle && <p className="text-xs text-feisen-texto-2 break-words">{h.detalle}</p>}
                  <p className="text-xs text-gray-400">
                    {new Date(h.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    {h.profiles?.nombre ? ` · ${h.profiles.nombre}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          )}
      </section>

      {opcionesMenu(p, permisos).some(o => ['editar', 'cerrar', 'eliminar'].includes(o.clave)) && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-feisen-borde-suave">
          {opcionesMenu(p, permisos).filter(o => ['editar', 'cerrar', 'eliminar'].includes(o.clave)).map(o => (
            <button key={o.clave} type="button" onClick={() => onAccion(o.clave, p)}
              className={`border border-feisen-borde rounded-lg px-3 min-h-[38px] text-sm font-medium hover:bg-feisen-fondo ${o.peligro ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>
              {o.texto.replace('…', '')}
            </button>
          ))}
        </div>
      )}
    </PanelLateral>
  )
}

function SelectorProducto({ value, onSelect, productos }) {
  const [busqueda, setBusqueda] = useState(value || '')
  const [abierto,  setAbierto]  = useState(false)

  const filtrados = busqueda.trim()
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : productos

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input required value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setAbierto(true); if (!e.target.value) onSelect('', '', null) }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => {
            setAbierto(false)
            const coincide = productos.some(p => p.nombre === busqueda)
            if (busqueda && !coincide) { setBusqueda(''); onSelect('', '', null) }
          }, 150)}
          placeholder="Buscar producto..."
          className="w-full border border-feisen-borde rounded-xl pl-10 pr-3 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
      </div>
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {filtrados.slice(0, 200).map(p => (
            <button key={p.id} type="button" onMouseDown={() => { setBusqueda(p.nombre); setAbierto(false); onSelect(p.nombre, p.unidad_medida, p.id) }}
              className="w-full text-left px-4 py-3.5 text-base hover:bg-blue-50 active:bg-blue-100 border-b last:border-0 flex justify-between items-center">
              <span className="font-medium text-gray-800">{p.nombre}</span>
              <span className="text-sm text-gray-400 ml-2 flex-shrink-0">{p.unidad_medida}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ListaPedidos() {
  const { perfil, esAdmin, esAlmacenista, esConsultor, bodegasOperacion, rolEfectivo, nivel } = useAuth()
  // Pedidos «Todo» (Configuración › Permisos; hoy Logística): ve y gestiona los pedidos de todas las áreas
  const esLogistica = !esAdmin && nivel('pedidos') === 'todo'

  const AREA_POR_ROL = { JEFE_MECANIZADOS: 'MECANIZADOS', JEFE_FUNDICION: 'FUNDICION', LOGISTICA: 'LOGISTICA', ALMACENISTA: 'ALMACEN', OPERARIO: 'PRODUCCION', JEFE_ENSAMBLE: 'PRODUCCION', CONSULTOR: 'INNOVACION', RRHH: 'ADMINISTRACION' }
  const miArea = AREA_POR_ROL[rolEfectivo] || null
  const navigate = useNavigate()
  const [pedidos,   setPedidos]   = useState([])
  const [productos, setProductos] = useState([])
  const [ordenesCompra, setOrdenesCompra] = useState([])
  const [entradas,       setEntradas]       = useState([]) // movimientos tipo entrada ligados a pedidos
  const [modalGenerarOC, setModalGenerarOC] = useState(null)
  const [cargando,  setCargando]  = useState(true)
  const [filtro,    setFiltro]    = useState('curso') // 'curso' | etapa | 'atrasados' | 'todos'
  const [aviso, avisar] = useAviso()
  const [detalleId, setDetalleId] = useState(null) // pedido abierto en el panel lateral
  const [busqueda,   setBusqueda]   = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [msg,       setMsg]       = useState(null)

  // Modales
  const [modalNuevo,    setModalNuevo]    = useState(false)
  const [modalTransito, setModalTransito] = useState(null)
  const [modalRecibido, setModalRecibido] = useState(null)
  const [guardandoRecibido, setGuardandoRecibido] = useState(false)
  const recibidoEnCurso = useRef(false) // guarda síncrona contra doble clic (el state no alcanza a re-renderizar)
  const [cantRec,       setCantRec]       = useState({})
  const hoyCol = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const [fechaRecepcion, setFechaRecepcion] = useState(hoyCol())
  // Motores del pedido (bodega MOTORES): al recibir con entrada, un serial por unidad
  const [motoresRec,    setMotoresRec]    = useState(new Set()) // item_id de motores
  const [serialesRec,   setSerialesRec]   = useState({})        // pedido_item.id → [serial…]
  const [errorRec,      setErrorRec]      = useState('')
  const [confirmElim,   setConfirmElim]   = useState(null)
  const [confirmCerrar, setConfirmCerrar] = useState(null) // pedido a cerrar
  const [motivoCierre,  setMotivoCierre]  = useState('')
  const [modalEditar,   setModalEditar]   = useState(null) // pedido que se edita

  // Form edición
  const [itemsEdit,     setItemsEdit]     = useState([])
  const [obsEdit,       setObsEdit]       = useState('')
  const [prioridadEdit, setPrioridadEdit] = useState('normal')
  const [guardandoEdit, setGuardandoEdit] = useState(false)

  // Historial
  const [historialOpen, setHistorialOpen] = useState({}) // { pedidoId: bool }
  const [historialData, setHistorialData] = useState({}) // { pedidoId: [] }

  // Form nuevo pedido
  const ITEM0  = { descripcion: '', cantidad: '', unidad: 'und', item_id: null }
  const [items,        setItems]        = useState([{ ...ITEM0 }])
  const [obs,          setObs]          = useState('')
  const [prioridad,    setPrioridad]    = useState('normal')
  const [fotoMuestra,  setFotoMuestra]  = useState('')
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  // Foto en edición
  const [fotoMuestraEdit,  setFotoMuestraEdit]  = useState('')
  const [subiendoFotoEdit, setSubiendoFotoEdit] = useState(false)

  // Form tránsito
  const [formTransito, setFormTransito] = useState({ numero_oc: '', fecha_estimada: '' })

  const [searchParams] = useSearchParams()

  useEffect(() => { cargar() }, [])

  // Abrir modal nuevo si llega con ?nuevo=1 (desde botón "Crear pedido" en alertas de stock)
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') {
      setItems([{ ...ITEM0 }]); setObs(''); setPrioridad('normal'); setFotoMuestra('')
      setModalNuevo(true)
    }
  }, [searchParams])

  async function cargar() {
    setCargando(true)
    const verTodo = esAdmin || esLogistica || esConsultor
    const CAT_PRODUCTO_MECANIZADO = 'bff5d482-1647-426c-a88f-dedd72ff5b06'
    // Catálogo paginado: el servidor corta a 1.000 filas y el catálogo ya tiene más de 1.500 productos
    const prodsQ = fetchAllPages((d, h) => {
      let q = supabase.from('items').select('id, nombre, unidad_medida').eq('activo', true)
        .order('nombre').order('id').range(d, h)
      if (bodegasOperacion) q = q.in('bodega_id', bodegasOperacion)
      if (rolEfectivo === 'JEFE_MECANIZADOS') q = q.neq('categoria_id', CAT_PRODUCTO_MECANIZADO)
      return q
    })

    let pedsQ = supabase.from('pedidos')
      .select('*, pedido_items(*), profiles(nombre)')
      .order('created_at', { ascending: false })
    if (!verTodo) pedsQ = pedsQ.eq('solicitante_id', perfil.id)

    // Confidencialidad: el proveedor y los precios de las órdenes de compra solo los traen
    // ADMIN y LOGÍSTICA. El resto de áreas recibe únicamente número de OC y las cantidades
    // por línea (para saber qué está cubierto), sin proveedor ni precio.
    const puedeVerDetalleOC = esAdmin || esLogistica
    const ocQ = supabase.from('ordenes_compra')
      .select(puedeVerDetalleOC
        ? '*, proveedores(nombre, nit, contacto, telefono, direccion), profiles(nombre), orden_compra_items(*)'
        : 'id, numero, pedido_id, orden_compra_items(pedido_item_id, cantidad)')
      .eq('anulada', false)
      .order('created_at', { ascending: false })

    const [{ data: peds }, { data: prods }, { data: ocs }] = await Promise.all([
      pedsQ,
      prodsQ,
      ocQ,
    ])
    setPedidos(peds || [])
    setProductos(prods || [])
    setOrdenesCompra(ocs || [])
    setCargando(false)

    // Entradas de inventario ligadas a pedidos (para mostrar el N° de movimiento en cada pedido).
    // Solo columnas no sensibles (sin precios). Si el rol no puede leerlas, simplemente no se muestran.
    const { data: ents } = await fetchAllPages((d, h) =>
      supabase.from('movimientos')
        .select('numero, pedido_id, fecha_movimiento, created_at')
        .eq('tipo', 'entrada')
        .eq('revertido', false) // una entrada revertida ya no cuenta como recibida
        .not('pedido_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(d, h)
    )
    setEntradas(ents || [])
  }

  // Generar número correlativo
  async function generarNumero() {
    return siguienteNumero('pedidos', 'PED')
  }

  async function subirFoto(file, setUrl, setSubiendo) {
    if (!file) return
    setSubiendo(true)
    const ext  = file.name.split('.').pop()
    const path = `muestras/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('remisiones').upload(path, file)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al subir foto: ' + error.message }); setSubiendo(false); return }
    const { data: { publicUrl } } = supabase.storage.from('remisiones').getPublicUrl(path)
    setUrl(publicUrl)
    setSubiendo(false)
  }

  async function crearPedido(e) {
    e.preventDefault()
    setMsg(null)
    const itemsValidos = items.filter(i => i.descripcion && parseFloat(i.cantidad) > 0)
    if (itemsValidos.length === 0) { setMsg({ tipo: 'error', texto: 'Agrega al menos un producto con cantidad.' }); return }
    if (itemsValidos.some(i => !i.item_id)) { setMsg({ tipo: 'error', texto: 'Todos los productos deben seleccionarse del catálogo.' }); return }

    let numero
    try { numero = await generarNumero() }
    catch (eNum) { setMsg({ tipo: 'error', texto: 'No se pudo generar el número del pedido: ' + (eNum.message || eNum) }); return }
    const { data: pedido, error: err1 } = await supabase.from('pedidos').insert({
      numero, estado: 'pendiente', observaciones: obs || null, solicitante_id: perfil.id,
      solicitante_nombre: perfil?.nombre || null,
      prioridad, foto_muestra_url: fotoMuestra || null,
      area: miArea,
    }).select().single()
    if (err1) { setMsg({ tipo: 'error', texto: 'Error: ' + err1.message }); return }

    const { error: err2 } = await supabase.from('pedido_items').insert(
      itemsValidos.map(i => ({
        pedido_id:   pedido.id,
        descripcion: i.descripcion,
        cantidad:    parseFloat(i.cantidad),
        unidad:      i.unidad,
        item_id:     i.item_id || null,
      }))
    )
    if (err2) { setMsg({ tipo: 'error', texto: 'Error en items: ' + err2.message }); return }

    await registrarHistorial(pedido.id, 'creado',
      itemsValidos.map(i => `${i.descripcion} (${i.cantidad} ${i.unidad})`).join(', '))
    setModalNuevo(false)
    setItems([{ ...ITEM0 }])
    setObs('')
    setFotoMuestra('')
    cargar()
  }

  async function marcarTransito(e) {
    e.preventDefault()
    if (!formTransito.numero_oc) { return }
    // Compra directa (sin OC de la app): quién compra queda en numero_oc, como se venía escribiendo
    const quien = formTransito.numero_oc.trim()
    const { error } = await supabase.from('pedidos').update({
      estado: 'en_transito',
      numero_oc: /^oc/i.test(quien) ? quien : `Compra directa · ${quien}`,
      fecha_estimada_llegada: formTransito.fecha_estimada || null,
    }).eq('id', modalTransito.id)
    if (error) { setMsg({ tipo: 'error', texto: 'No se pudo pasar a En camino: ' + error.message }); return }
    await registrarHistorial(modalTransito.id, 'en_transito', `Compra directa: ${quien}`)
    avisar(`${modalTransito.numero} va en camino`)
    setModalTransito(null)
    setFormTransito({ numero_oc: '', fecha_estimada: '' })
    cargar()
  }

  function iniciarRecibido(pedido, conEntrada) {
    const inicial = {}
    pedido.pedido_items?.forEach(it => {
      const pendiente = it.cantidad - (it.cantidad_recibida || 0)
      inicial[it.id] = String(Math.max(0, pendiente))
    })
    setCantRec(inicial)
    setFechaRecepcion(hoyCol())
    setSerialesRec({}); setMotoresRec(new Set()); setErrorRec('')
    setModalRecibido({ pedido, conEntrada })
    const ids = (pedido.pedido_items || []).map(it => it.item_id).filter(Boolean)
    if (ids.length) {
      supabase.from('items').select('id, bodegas(nombre)').in('id', ids).then(({ data }) =>
        setMotoresRec(new Set((data || []).filter(i => esBodegaMotores(i.bodegas?.nombre)).map(i => i.id))))
    }
  }

  // Seriales de una línea de motor, del tamaño de lo que llegó
  const serialesDeLinea = it => ajustarSeriales(serialesRec[it.id] || [], parseFloat(cantRec[it.id]))

  async function confirmarRecibido() {
    if (guardandoRecibido || recibidoEnCurso.current) return
    recibidoEnCurso.current = true
    setGuardandoRecibido(true)
    try {
    const { pedido, conEntrada } = modalRecibido
    const items = pedido.pedido_items || []

    // Motores: cada unidad que llega necesita su serial (se valida antes de tocar nada)
    setErrorRec('')
    if (conEntrada) {
      for (const it of items.filter(i => motoresRec.has(i.item_id) && parseFloat(cantRec[i.id]) > 0)) {
        const cant = parseFloat(cantRec[it.id])
        const lista = serialesDeLinea(it)
        let problema = !Number.isInteger(cant) ? 'los motores se reciben por unidades enteras.'
          : cant !== lista.length ? 'son demasiadas unidades para recibir de una vez (máximo 50).'
          : problemaSeriales(lista)
        if (!problema) {
          const repetidos = await serialesYaEnBodega(it.item_id, lista)
          if (repetidos.length) problema = `ya hay en bodega un motor con el serial ${repetidos.join(', ')}.`
        }
        if (problema) {
          setErrorRec(`${it.descripcion}: ${problema.charAt(0).toLowerCase() + problema.slice(1)}`)
          return // el finally libera el botón
        }
      }
    }
    // El historial se escribe al final (en el finally) para poder incluir el N° de movimiento de la entrada
    let pedidoActualizado = false
    let historialPendiente = null
    let numeroEntrada = null

    // 1. Sumar a la cantidad_recibida existente (para re-recepciones)
    const nuevasCantidades = {}
    items.forEach(it => {
      const yaRecibido = it.cantidad_recibida || 0
      const ahoraLlego = parseFloat(cantRec[it.id]) || 0
      nuevasCantidades[it.id] = yaRecibido + ahoraLlego
    })

    // 2. ¿Llegó completo o parcial?
    const esCompleto = items.every(it => nuevasCantidades[it.id] >= it.cantidad)
    const nuevoEstado = esCompleto ? 'recibido' : 'parcialmente_recibido'

    const detalleItems = items.map(it => {
      const recibido = nuevasCantidades[it.id]
      const pendiente = it.cantidad - recibido
      return pendiente > 0 ? `${it.descripcion}: falta ${pendiente} ${it.unidad}` : null
    }).filter(Boolean).join(', ')

    // Primero se actualiza el pedido y se VERIFICA que la base lo aceptó. Con las políticas RLS,
    // un UPDATE no permitido no da error: simplemente no toca ninguna fila. Antes no se revisaba
    // y la pantalla mostraba "recibido" (y se creaba la entrada) aunque el pedido seguía En tránsito.
    const { data: pedUpd, error: errPedUpd } = await supabase.from('pedidos')
      .update({ estado: nuevoEstado, ...(esCompleto ? { fecha_recibido: new Date().toISOString() } : {}) })
      .eq('id', pedido.id)
      .select('id')
    if (errPedUpd || !pedUpd?.length) {
      setModalRecibido(null)
      setMsg({ tipo: 'error', texto: 'No se pudo marcar el pedido como recibido' + (errPedUpd ? ': ' + errPedUpd.message : ': la base de datos no permitió el cambio (permisos). No se registró ninguna entrada. Avisa a administración.') })
      return
    }

    const resItems = await Promise.all(items.map(it =>
      supabase.from('pedido_items')
        .update({ cantidad_recibida: nuevasCantidades[it.id] })
        .eq('id', it.id)
        .select('id')
    ))
    if (resItems.some(r => r.error || !r.data?.length)) {
      setMsg({ tipo: 'error', texto: 'El pedido quedó marcado, pero no se pudieron guardar las cantidades recibidas de alguna línea. Avisa a administración.' })
    }

    pedidoActualizado = true
    historialPendiente = async () => {
      await registrarHistorial(pedido.id, nuevoEstado,
      (esCompleto
        ? (conEntrada ? 'Recibido completo con entrada de inventario' : 'Recibido completo sin entrada de inventario')
        : `Llegó incompleto. ${detalleItems}`) + (numeroEntrada ? ` · Movimiento ${numeroEntrada}` : ''))
      // El historial cacheado queda desactualizado: se recarga al abrirlo
      setHistorialData(h => { const n = { ...h }; delete n[pedido.id]; return n })
    }

    setPedidos(prev => prev.map(p =>
      p.id === pedido.id
        ? { ...p, estado: nuevoEstado, pedido_items: p.pedido_items?.map(it => ({ ...it, cantidad_recibida: nuevasCantidades[it.id] })) }
        : p
    ))
    setModalRecibido(null)

    // 3. Si "Recibido + Entrada", crear movimientos automáticamente
    if (conEntrada) {
      const itemsConId = (pedido.pedido_items || []).filter(it => it.item_id && parseFloat(cantRec[it.id]) > 0)
      if (itemsConId.length > 0) {
        // Fetch items sin join frágil de bodegas
        const { data: itemsData, error: itemsErr } = await supabase
          .from('items')
          .select('id, bodega_id, precio_costo')
          .in('id', itemsConId.map(it => it.item_id))

        if (itemsErr || !itemsData?.length) {
          setMsg({ tipo: 'error', texto: 'Pedido recibido, pero error al cargar productos para la entrada automática. Registra la entrada manualmente.' })
          return
        }

        // Fetch nombres de bodegas por ID (evita inestabilidad del join PostgREST)
        const uniqueBodegaIds = [...new Set(itemsData.map(i => i.bodega_id).filter(Boolean))]
        const { data: bodegasData } = await supabase
          .from('bodegas').select('id, nombre').in('id', uniqueBodegaIds)
        const bodegaMap = {}
        bodegasData?.forEach(b => { bodegaMap[b.id] = b.nombre })

        const itemMap = {}
        itemsData.forEach(i => { itemMap[i.id] = i })

        const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
        const prefix = `MOV-${iniciales}-`
        const { data: lastMov } = await supabase
          .from('movimientos').select('numero').like('numero', `${prefix}%`)
          .order('numero', { ascending: false }).limit(1).maybeSingle()
        const lastNum = lastMov?.numero ? parseInt(lastMov.numero.replace(prefix, ''), 10) || 0 : 0
        // Un solo N° de movimiento por recepción (todas las líneas lo comparten), para poder rastrearla completa
        const numeroMov = `${prefix}${String(lastNum + 1).padStart(4, '0')}`

        const payloads = []
        for (const it of itemsConId) {
          const info = itemMap[it.item_id]
          if (!info) continue
          const base = {
            numero:                numeroMov,
            tipo:                  'entrada',
            item_id:               it.item_id,
            bodega_destino_id:     info.bodega_id,
            bodega_origen_id:      null,
            cantidad:              parseFloat(cantRec[it.id]),
            precio_costo_snapshot: info.precio_costo || 0,
            centro_costo:          bodegaMap[info.bodega_id] || '',
            usuario_id:            perfil.id,
            pedido_id:             pedido.id,
            fecha_movimiento:      fechaRecepcion || hoyCol(),
            proveedor: null, foto_remision_url: null, destino: null,
            numero_of: null, serial_motor: null, referencia: null, motivo: null, cliente: null,
          }
          // Motores: una línea de 1 unidad por serial, para seguir cada motor
          if (motoresRec.has(it.item_id)) serialesDeLinea(it).forEach(sr => payloads.push({ ...base, cantidad: 1, serial_motor: sr.trim() }))
          else payloads.push(base)
        }
        if (payloads.length > 0) {
          const { data: movs, error } = await supabase.from('movimientos').insert(payloads)
            .select('id, item_id, serial_motor, bodega_destino_id')
          const errSeriales = error ? null : await registrarSerialesEntrada(movs || [])
          if (error) setMsg({ tipo: 'error', texto: 'Pedido recibido, pero error al registrar entradas: ' + error.message })
          else if (errSeriales) setMsg({ tipo: 'error', texto: `Entrada ${numeroMov} registrada, pero no se pudo guardar la lista de seriales (${errSeriales.message}). Avisa a administración.` })
          else {
            numeroEntrada = numeroMov
            const filas = payloads.map(() => ({ numero: numeroMov, pedido_id: pedido.id, fecha_movimiento: fechaRecepcion || hoyCol(), created_at: new Date().toISOString() }))
            setEntradas(prev => [...filas, ...prev])
            setMsg({ tipo: 'exito', texto: `Recibido + entrada ${numeroMov} (${payloads.length} ${payloads.length === 1 ? 'ítem' : 'ítems'}) registrada automáticamente.` })
          }
        } else {
          setMsg({ tipo: 'error', texto: 'Pedido recibido, pero los ítems no tienen producto vinculado al catálogo. Registra la entrada manualmente.' })
        }
      }
    }
    } finally {
      if (pedidoActualizado && historialPendiente) {
        try { await historialPendiente() } catch { /* el historial es informativo; no bloquea la recepción */ }
      }
      setGuardandoRecibido(false)
      recibidoEnCurso.current = false
    }
  }

  // ── Historial ──────────────────────────────────────────────
  async function registrarHistorial(pedidoId, accion, detalle) {
    await supabase.from('pedido_historial').insert({
      pedido_id: pedidoId, usuario_id: perfil.id, accion, detalle: detalle || null,
    })
  }

  async function abrirDetalle(pedidoId) {
    setDetalleId(pedidoId)
    // Siempre fresco: el historial cambia al generar OC, recibir, etc.
    setHistorialData(h => ({ ...h, [pedidoId]: null }))
    const { data } = await supabase
      .from('pedido_historial')
      .select('*, profiles(nombre)')
      .eq('pedido_id', pedidoId)
      .order('created_at', { ascending: false })
    setHistorialData(h => ({ ...h, [pedidoId]: data || [] }))
  }

  // Permisos por pedido (algunos dependen de si el usuario es quien lo pidió)
  function permisosDe(p) {
    const esSuyo = p.solicitante_id === perfil?.id
    return {
      transito:     esAdmin || esLogistica,
      recibir:      esAdmin || esAlmacenista || esSuyo,
      editar:       esAdmin || esSuyo,
      eliminar:     esAdmin || (esSuyo && p.estado === 'pendiente'),
      cerrar:       esAdmin || esLogistica || esAlmacenista || esSuyo,
      generarOC:    esAdmin || esLogistica,
      verDetalleOC: esAdmin || esLogistica,
    }
  }

  // Acciones de la ficha, del menú ⋯ y del panel
  function ejecutarAccion(clave, p) {
    if (clave === 'oc')       return setModalGenerarOC(p)
    if (clave === 'recibir')  return iniciarRecibido(p, true)
    if (clave === 'directa')  { setFormTransito({ numero_oc: '', fecha_estimada: '' }); return setModalTransito(p) }
    if (clave === 'editar')   return abrirEditar(p)
    if (clave === 'cerrar')   { setMotivoCierre(''); return setConfirmCerrar(p) }
    if (clave === 'eliminar') return setConfirmElim(p)
  }

  async function toggleHistorial(pedidoId) {
    const abierto = historialOpen[pedidoId]
    setHistorialOpen(h => ({ ...h, [pedidoId]: !abierto }))
    if (!abierto && !historialData[pedidoId]) {
      setHistorialData(h => ({ ...h, [pedidoId]: null })) // null = cargando
      const { data } = await supabase
        .from('pedido_historial')
        .select('*, profiles(nombre)')
        .eq('pedido_id', pedidoId)
        .order('created_at', { ascending: false })
      setHistorialData(h => ({ ...h, [pedidoId]: data || [] }))
    }
  }

  // ── Edición ────────────────────────────────────────────────
  function abrirEditar(pedido) {
    setItemsEdit((pedido.pedido_items || []).map(it => ({
      descripcion: it.descripcion,
      cantidad:    String(it.cantidad),
      unidad:      it.unidad,
      item_id:     it.item_id || null,
    })))
    setObsEdit(pedido.observaciones || '')
    setPrioridadEdit(pedido.prioridad || 'normal')
    setFotoMuestraEdit(pedido.foto_muestra_url || '')
    setModalEditar(pedido)
  }

  async function guardarEdicion(e) {
    e.preventDefault()
    const validos = itemsEdit.filter(i => i.descripcion && parseFloat(i.cantidad) > 0)
    if (validos.length === 0) { setMsg({ tipo: 'error', texto: 'Agrega al menos un producto.' }); return }
    if (validos.some(i => !i.item_id)) { setMsg({ tipo: 'error', texto: 'Todos los productos deben seleccionarse del catálogo.' }); return }
    setGuardandoEdit(true)
    setMsg(null)
    try {
      // Actualizar campos del pedido
      const { data: updPed, error: errPed } = await supabase.from('pedidos').update({
        observaciones:    obsEdit || null,
        prioridad:        prioridadEdit,
        foto_muestra_url: fotoMuestraEdit || null,
      }).eq('id', modalEditar.id).select('id')
      if (errPed) { setMsg({ tipo: 'error', texto: 'Error al actualizar pedido: ' + errPed.message }); return }
      // Un UPDATE que la política RLS no permite no da error: solo no modifica filas
      if (!updPed?.length) { setMsg({ tipo: 'error', texto: 'No se pudo actualizar el pedido: la base de datos no permitió el cambio (permisos). No se modificó nada.' }); return }

      // Reemplazar items
      const { error: errDel } = await supabase.from('pedido_items').delete().eq('pedido_id', modalEditar.id)
      if (errDel) { setMsg({ tipo: 'error', texto: 'Error al actualizar productos: ' + errDel.message }); return }

      const { error: errIns } = await supabase.from('pedido_items').insert(
        validos.map(i => ({
          pedido_id:   modalEditar.id,
          descripcion: i.descripcion,
          cantidad:    parseFloat(i.cantidad),
          unidad:      i.unidad,
          item_id:     i.item_id || null,
        }))
      )
      if (errIns) { setMsg({ tipo: 'error', texto: 'Error al insertar productos: ' + errIns.message }); return }

      // Armar detalle del cambio
      const itemsAntes = (modalEditar.pedido_items || []).map(i => `${i.descripcion} (${i.cantidad})`).join(', ')
      const itemsDespues = validos.map(i => `${i.descripcion} (${i.cantidad})`).join(', ')
      const detalle = itemsAntes !== itemsDespues
        ? `Productos: ${itemsDespues}`
        : `Prioridad/observaciones actualizadas`

      await registrarHistorial(modalEditar.id, 'editado', detalle)

      // Invalidar historial cacheado para que recargue
      setHistorialData(h => ({ ...h, [modalEditar.id]: undefined }))
      setModalEditar(null)
      cargar()
    } finally {
      setGuardandoEdit(false)
    }
  }

  async function eliminarPedido(pedido) {
    setMsg(null)

    // 1. Guardar log en pedidos_eliminados ANTES de borrar
    const itemsLog = (pedido.pedido_items || []).map(it => ({
      descripcion: it.descripcion,
      cantidad:    it.cantidad,
      unidad:      it.unidad,
      item_id:     it.item_id || null,
    }))
    await supabase.from('pedidos_eliminados').insert({
      pedido_numero:       pedido.numero,
      pedido_id_original:  pedido.id,
      solicitante_nombre:  pedido.profiles?.nombre || '',
      estado_al_eliminar:  pedido.estado,
      items:               itemsLog,
      obs:                 pedido.obs || null,
      eliminado_por_id:    perfil.id,
      eliminado_por_nombre: perfil.nombre,
    })

    // 2. Desvincular movimientos que apunten a este pedido
    await supabase.from('movimientos').update({ pedido_id: null }).eq('pedido_id', pedido.id)
    // 3. Desvincular órdenes de compra generadas desde este pedido (se conservan, solo
    //    pierden la referencia — igual que los movimientos, no se borran).
    await supabase.from('ordenes_compra').update({ pedido_id: null }).eq('pedido_id', pedido.id)
    // 4. Borrar items (el historial del pedido se borra en cascade)
    await supabase.from('pedido_items').delete().eq('pedido_id', pedido.id)
    // 5. Borrar pedido
    const { error } = await supabase.from('pedidos').delete().eq('id', pedido.id)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al eliminar: ' + error.message }); setConfirmElim(null); return }
    setConfirmElim(null)
    cargar()
  }

  async function cerrarPedido(pedido, motivo) {
    setMsg(null)
    const { data: cerrado, error } = await supabase.from('pedidos')
      .update({ estado: 'cerrado', motivo_cierre: motivo })
      .eq('id', pedido.id)
      .select('id')
    if (error) { setMsg({ tipo: 'error', texto: 'Error al cerrar: ' + error.message }); return }
    if (!cerrado?.length) { setMsg({ tipo: 'error', texto: 'No se pudo cerrar el pedido: la base de datos no permitió el cambio (permisos).' }); setConfirmCerrar(null); return }
    await registrarHistorial(pedido.id, 'cerrado', motivo)
    setConfirmCerrar(null)
    setMotivoCierre('')
    cargar()
  }

  // El filtro "Cerrado" es el único destino final del embudo: agrupa tanto los que
  // llegaron completos ('recibido') como los cerrados manualmente por algún motivo
  // ('cerrado') — ya no hay una pestaña "Recibido" aparte. Dentro de "Completado" cada
  // tarjeta se distingue sola: pastilla verde "Recibido" vs. gris "Cerrado: <motivo>",
  // más el aviso naranja "Llegó incompleto" cuando se cerró sin que llegara todo.
  // Agrupar órdenes de compra por pedido, y sumar cuánta cantidad de cada línea del
  // pedido ya quedó cubierta por alguna orden (puede repartirse entre varias)
  const ocPorPedido = {}
  const coberturaPorItem = {}
  for (const oc of ordenesCompra) {
    if (!ocPorPedido[oc.pedido_id]) ocPorPedido[oc.pedido_id] = []
    ocPorPedido[oc.pedido_id].push(oc)
    for (const it of (oc.orden_compra_items || [])) {
      if (!it.pedido_item_id) continue
      coberturaPorItem[it.pedido_item_id] = (coberturaPorItem[it.pedido_item_id] || 0) + it.cantidad
    }
  }

  // Entradas agrupadas por pedido y N° de movimiento
  const entradasPorPedido = {}
  for (const m of entradas) {
    if (!m.numero) continue
    const lista = (entradasPorPedido[m.pedido_id] ||= [])
    let g = lista.find(x => x.numero === m.numero)
    if (!g) { g = { numero: m.numero, lineas: 0, fecha: m.fecha_movimiento || (m.created_at || '').slice(0, 10) }; lista.push(g) }
    g.lineas += 1
  }

  const hayBusqueda = busqueda.trim() || fechaDesde || fechaHasta

  const pedidosFiltrados = pedidos
    .filter(p => {
      if (filtro === 'curso') { if (p.estado === 'cerrado' || p.estado === 'recibido') return false }
      else if (filtro === 'atrasados') { if (!diasDeAtraso(p)) return false }
      else if (filtro === 'cerrado') { if (!(p.estado === 'cerrado' || p.estado === 'recibido')) return false }
      else if (filtro !== 'todos') { if (p.estado !== filtro) return false }

      if (busqueda.trim()) {
        const q = normalizar(busqueda)
        const enNumero      = normalizar(p.numero).includes(q)
        const enSolicitante = normalizar(p.profiles?.nombre).includes(q)
        const enProducto    = (p.pedido_items || []).some(it => normalizar(it.descripcion).includes(q))
        if (!enNumero && !enSolicitante && !enProducto) return false
      }

      if (fechaDesde && new Date(p.created_at) < new Date(fechaDesde + 'T00:00:00')) return false
      if (fechaHasta && new Date(p.created_at) > new Date(fechaHasta + 'T23:59:59')) return false

      return true
    })
    // Atrasados primero (el más atrasado arriba), luego por prioridad
    .sort((a, b) => (diasDeAtraso(b) - diasDeAtraso(a)) || ((PRIORIDAD_ORDEN[a.prioridad] ?? 1) - (PRIORIDAD_ORDEN[b.prioridad] ?? 1)))

  if (cargando) return <Spinner texto="Cargando pedidos..." />

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {aviso}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-feisen-azul">Pedidos</h1>
        <div className="flex items-center gap-2">
          <button onClick={cargar} title="Refrescar"
            className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            <RefreshCw size={17} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { setMsg(null); setItems([{ ...ITEM0 }]); setObs(''); setPrioridad('normal'); setFotoMuestra(''); setModalNuevo(true) }}
            className="flex items-center gap-2 bg-feisen-azul text-white px-4 py-2 rounded-xl font-medium hover:opacity-90">
            <Plus size={18} /> Nuevo pedido
          </button>
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      <EtapasPedidos pedidos={pedidos} filtro={filtro} onFiltro={setFiltro} />

      {/* Búsqueda: número de pedido, producto o quién lo hizo, y rango de fechas */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por número de pedido, producto o quién lo hizo…"
            className="w-full border-2 border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Desde
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Hasta
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </label>
          {hayBusqueda && (
            <button onClick={() => { setBusqueda(''); setFechaDesde(''); setFechaHasta('') }}
              className="text-xs text-gray-400 hover:text-feisen-rojo underline">
              Limpiar búsqueda
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-feisen-texto-2 px-0.5">
        <span><b className="text-feisen-texto">{NOMBRE_FILTRO[filtro] || ESTADO_CONFIG[filtro]?.label}</b> · {pedidosFiltrados.length} {pedidosFiltrados.length === 1 ? 'pedido' : 'pedidos'}</span>
        {filtro === 'curso'
          ? <button onClick={() => setFiltro('todos')} className="text-feisen-azul font-semibold">Ver todos</button>
          : <button onClick={() => setFiltro('curso')} className="text-feisen-azul font-semibold">Ver los que están en curso</button>}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {pedidosFiltrados.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400 border border-gray-100">
            <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
            <p>
              {hayBusqueda
                ? 'No hay pedidos que coincidan con la búsqueda.'
                : `No hay pedidos${filtro !== 'todos' ? ' en este estado' : ''}.`}
            </p>
          </div>
        ) : pedidosFiltrados.map(p => (
          <TarjetaPedido
            key={p.id}
            p={p}
            permisos={permisosDe(p)}
            ordenesDelPedido={ocPorPedido[p.id] || []}
            onAbrir={() => abrirDetalle(p.id)}
            onAccion={ejecutarAccion}
          />
        ))}
      </div>

      {detalleId && pedidos.some(x => x.id === detalleId) && (() => {
        const p = pedidos.find(x => x.id === detalleId)
        return (
          <DetallePedido p={p} permisos={permisosDe(p)}
            ordenesDelPedido={ocPorPedido[p.id] || []} coberturaPorItem={coberturaPorItem}
            entradasDelPedido={entradasPorPedido[p.id] || []} historial={historialData[p.id]}
            onCerrar={() => setDetalleId(null)} onAccion={ejecutarAccion} />
        )
      })()}

      {modalGenerarOC && (
        <ModalGenerarOC
          pedido={modalGenerarOC}
          coberturaPorItem={coberturaPorItem}
          onCerrar={() => setModalGenerarOC(null)}
          onGuardado={r => {
            setModalGenerarOC(null)
            if (r?.tipo === 'exito') avisar(r.texto); else if (r) setMsg(r)
            cargar()
          }}
        />
      )}

      {/* MODAL NUEVO PEDIDO */}
      {modalNuevo && (
        <Modal titulo="Nuevo pedido" onCerrar={() => { setModalNuevo(false); setPrioridad('normal') }}>
          <form onSubmit={crearPedido} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <p className="text-sm text-gray-500">Agrega los productos que necesitas solicitar.</p>

            {items.map((it, idx) => (
              <div key={idx} className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2.5 relative">
                {/* Producto */}
                <SelectorProducto value={it.descripcion} productos={productos}
                  onSelect={(nombre, unidad, itemId) => {
                    const copia = [...items]
                    copia[idx] = { ...copia[idx], descripcion: nombre, unidad: unidad || copia[idx].unidad, item_id: itemId || null }
                    setItems(copia)
                  }} />

                {/* Cantidad + Unidad */}
                <div className="flex gap-2 items-center">
                  {/* Botones +/− */}
                  <div className="flex items-center flex-1 border border-feisen-borde rounded-xl overflow-hidden bg-white">
                    <button type="button"
                      onClick={() => { const c = [...items]; c[idx].cantidad = String(Math.max(1, Math.round((parseFloat(c[idx].cantidad) || 1) - 1))); setItems(c) }}
                      className="px-4 py-3 text-xl font-bold text-gray-600 hover:bg-gray-100 active:bg-gray-200 select-none">−</button>
                    <input type="number" min="0.001" step="0.001" value={it.cantidad}
                      onChange={e => { const c = [...items]; c[idx].cantidad = e.target.value; setItems(c) }}
                      className="flex-1 text-center py-3 text-lg font-semibold border-x border-gray-200 focus:outline-none bg-white min-w-0" />
                    <button type="button"
                      onClick={() => { const c = [...items]; c[idx].cantidad = String((parseFloat(c[idx].cantidad) || 0) + 1); setItems(c) }}
                      className="px-4 py-3 text-xl font-bold text-gray-600 hover:bg-gray-100 active:bg-gray-200 select-none">+</button>
                  </div>
                  {/* Unidad */}
                  <select value={it.unidad} onChange={e => { const c = [...items]; c[idx].unidad = e.target.value; setItems(c) }}
                    className="w-24 border border-feisen-borde rounded-xl px-2 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul flex-shrink-0">
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>

                {/* Quitar ítem */}
                {items.length > 1 && (
                  <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    className="w-full text-sm text-feisen-rojo font-medium py-1 hover:bg-red-50 rounded-lg">
                    ✕ Quitar este producto
                  </button>
                )}
              </div>
            ))}

            <button type="button" onClick={() => setItems([...items, { ...ITEM0 }])}
              className="w-full py-3 border-2 border-dashed border-feisen-azul text-feisen-azul rounded-xl text-base font-semibold flex items-center justify-center gap-2 hover:bg-blue-50 active:bg-blue-100">
              <Plus size={18} /> Agregar otro producto
            </button>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Prioridad</label>
              <div className="flex gap-2">
                {Object.entries(PRIORIDAD_CONFIG).map(([val, cfg]) => (
                  <button key={val} type="button" onClick={() => setPrioridad(val)}
                    className={`flex-1 py-3 px-2 rounded-xl text-sm font-semibold border-2 transition-colors
                      ${prioridad === val ? cfg.color : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Observaciones (opcional)</label>
              <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
                className="w-full border border-feisen-borde rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul resize-none"
                placeholder="Especificaciones, referencias, etc." />
            </div>

            {/* Foto de muestra */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Foto de muestra (opcional)</label>
              {fotoMuestra ? (
                <div className="space-y-2">
                  <img src={fotoMuestra} alt="Muestra" className="w-full max-h-48 object-contain rounded-xl border bg-gray-50" />
                  <button type="button" onClick={() => setFotoMuestra('')}
                    className="flex items-center gap-1 text-xs text-feisen-rojo hover:underline">
                    <X size={12} /> Quitar foto
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center gap-2 cursor-pointer border-2 border-dashed rounded-xl px-4 py-7 text-base text-gray-400 transition-colors
                  ${subiendoFoto ? 'border-gray-200 bg-gray-50' : 'border-feisen-borde hover:border-feisen-azul hover:text-feisen-azul'}`}>
                  {subiendoFoto
                    ? <><Upload size={28} className="animate-pulse" /><span>Subiendo...</span></>
                    : <><Upload size={28} /><span>Adjuntar foto de la muestra o referencia</span></>
                  }
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => subirFoto(e.target.files?.[0], setFotoMuestra, setSubiendoFoto)} disabled={subiendoFoto} />
                </label>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalNuevo(false)}
                className="flex-1 border border-feisen-borde rounded-xl py-4 text-base font-medium text-gray-600">Cancelar</button>
              <button type="submit" disabled={subiendoFoto}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-4 text-base font-bold hover:opacity-90 disabled:opacity-60">Crear pedido</button>
            </div>
          </form>
        </Modal>
      )}

{/* MODAL CONFIRMAR RECEPCIÓN */}
      {modalRecibido && (
        <Modal
          titulo={`Recibir ${modalRecibido.pedido.numero}`}
          onCerrar={() => setModalRecibido(null)}
        >
          <div className="space-y-4">
            {modalRecibido.pedido.estado === 'parcialmente_recibido' && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-700">
                Pedido incompleto. Ingresa lo que llegó <strong>en esta entrega</strong>.
              </div>
            )}
            <p className="text-sm text-gray-500">Ingresa la cantidad que llegó realmente de cada ítem.</p>
            <label className="flex items-start gap-3 bg-feisen-fondo rounded-xl px-3 py-3 cursor-pointer">
              <input type="checkbox" checked={modalRecibido.conEntrada}
                onChange={e => setModalRecibido(m => ({ ...m, conEntrada: e.target.checked }))}
                className="mt-0.5 w-5 h-5 accent-feisen-azul shrink-0" />
              <span className="text-sm">
                <span className="block font-semibold text-feisen-texto">Crear entrada al inventario</span>
                <span className="block text-xs text-feisen-texto-2">Suma lo que llegó al stock. Desmárcala solo si no se maneja en inventario o ya registraste la entrada a mano.</span>
              </span>
            </label>
            {modalRecibido.conEntrada && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fecha de la entrada</label>
                <input type="date" value={fechaRecepcion} max={hoyCol()}
                  onChange={e => setFechaRecepcion(e.target.value)}
                  className="w-full border border-feisen-borde rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
                <p className="text-xs text-gray-400 mt-1">Por defecto hoy. Cámbiala si el material llegó otro día.</p>
              </div>
            )}
            {errorRec && <Alerta tipo="error" mensaje={errorRec} />}
            {modalRecibido.pedido.pedido_items?.map(it => {
              const yaRecibido = it.cantidad_recibida || 0
              const pendiente = it.cantidad - yaRecibido
              const conSerial = modalRecibido.conEntrada && motoresRec.has(it.item_id) && parseFloat(cantRec[it.id]) > 0
              return (
              <div key={it.id} className="space-y-2">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{it.descripcion}</p>
                  <p className="text-xs text-gray-400">Pedido: {it.cantidad} {it.unidad}</p>
                  {yaRecibido > 0 && <p className="text-xs text-green-600">Ya recibido: {yaRecibido} · Pendiente: {pendiente} {it.unidad}</p>}
                </div>
                <div className="w-28 flex-shrink-0">
                  <label className="text-xs text-gray-500 block mb-1">Llegó ahora</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0" step="0.001"
                      value={cantRec[it.id] ?? ''}
                      onChange={e => setCantRec(r => ({ ...r, [it.id]: e.target.value }))}
                      className="w-full border border-feisen-borde rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                    />
                    <span className="text-xs text-gray-400">{it.unidad}</span>
                  </div>
                </div>
              </div>
              {conSerial && (
                <div className="bg-feisen-fondo rounded-xl px-3 py-3 space-y-2">
                  <p className="text-xs font-semibold text-feisen-texto">Serial de cada motor (de la placa)</p>
                  <CamposSerial valores={serialesDeLinea(it)} onCambiar={v => setSerialesRec(r => ({ ...r, [it.id]: v }))}
                    claseInput="w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
                </div>
              )}
              </div>
              )
            }
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalRecibido(null)}
                className="flex-1 border border-feisen-borde rounded-xl py-2.5 text-sm font-medium text-gray-600">
                Cancelar
              </button>
              <button type="button" onClick={confirmarRecibido} disabled={guardandoRecibido}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60">
                {guardandoRecibido ? 'Guardando…' : (modalRecibido.conEntrada ? 'Recibir y crear entrada' : 'Recibir sin entrada')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL EN TRÁNSITO */}
      {modalTransito && (
        <Modal titulo={`Compra directa · ${modalTransito.numero}`} onCerrar={() => setModalTransito(null)}>
          <form onSubmit={marcarTransito} className="space-y-4">
            <p className="text-sm text-feisen-texto-2">
              Para lo que se compra <b>sin orden de compra</b>. Si hay OC, genérala con el ícono <FileText size={13} className="inline -mt-0.5" /> del pedido y pasa sola a En camino.
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">¿Quién compra? *</label>
              <input required value={formTransito.numero_oc} onChange={e => setFormTransito(f => ({ ...f, numero_oc: e.target.value }))}
                placeholder="Ej: Efraín, Samir, don Alfonso"
                className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Fecha estimada de llegada</label>
              <input type="date" value={formTransito.fecha_estimada} onChange={e => setFormTransito(f => ({ ...f, fecha_estimada: e.target.value }))}
                className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalTransito(null)}
                className="flex-1 border border-feisen-borde rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit"
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90">Pasar a En camino</button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL EDITAR PEDIDO */}
      {modalEditar && (
        <Modal titulo={`Editar ${modalEditar.numero}`} onCerrar={() => setModalEditar(null)}>
          <form onSubmit={guardarEdicion} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

            {itemsEdit.map((it, idx) => (
              <div key={idx} className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2.5 relative">
                <SelectorProducto value={it.descripcion} productos={productos}
                  onSelect={(nombre, unidad, itemId) => {
                    const c = [...itemsEdit]
                    c[idx] = { ...c[idx], descripcion: nombre, unidad: unidad || c[idx].unidad, item_id: itemId || null }
                    setItemsEdit(c)
                  }} />
                <div className="flex gap-2 items-center">
                  <div className="flex items-center flex-1 border border-feisen-borde rounded-xl overflow-hidden bg-white">
                    <button type="button"
                      onClick={() => { const c = [...itemsEdit]; c[idx].cantidad = String(Math.max(1, Math.round((parseFloat(c[idx].cantidad) || 1) - 1))); setItemsEdit(c) }}
                      className="px-4 py-3 text-xl font-bold text-gray-600 hover:bg-gray-100 active:bg-gray-200 select-none">−</button>
                    <input type="number" min="0.001" step="0.001" value={it.cantidad}
                      onChange={e => { const c = [...itemsEdit]; c[idx].cantidad = e.target.value; setItemsEdit(c) }}
                      className="flex-1 text-center py-3 text-lg font-semibold border-x border-gray-200 focus:outline-none bg-white min-w-0" />
                    <button type="button"
                      onClick={() => { const c = [...itemsEdit]; c[idx].cantidad = String((parseFloat(c[idx].cantidad) || 0) + 1); setItemsEdit(c) }}
                      className="px-4 py-3 text-xl font-bold text-gray-600 hover:bg-gray-100 active:bg-gray-200 select-none">+</button>
                  </div>
                  <select value={it.unidad} onChange={e => { const c = [...itemsEdit]; c[idx].unidad = e.target.value; setItemsEdit(c) }}
                    className="w-24 border border-feisen-borde rounded-xl px-2 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul flex-shrink-0">
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                {itemsEdit.length > 1 && (
                  <button type="button" onClick={() => setItemsEdit(itemsEdit.filter((_, i) => i !== idx))}
                    className="w-full text-sm text-feisen-rojo font-medium py-1 hover:bg-red-50 rounded-lg">
                    ✕ Quitar este producto
                  </button>
                )}
              </div>
            ))}

            <button type="button" onClick={() => setItemsEdit([...itemsEdit, { ...ITEM0 }])}
              className="w-full py-3 border-2 border-dashed border-feisen-azul text-feisen-azul rounded-xl text-base font-semibold flex items-center justify-center gap-2 hover:bg-blue-50 active:bg-blue-100">
              <Plus size={18} /> Agregar otro producto
            </button>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Prioridad</label>
              <div className="flex gap-2">
                {Object.entries(PRIORIDAD_CONFIG).map(([val, cfg]) => (
                  <button key={val} type="button" onClick={() => setPrioridadEdit(val)}
                    className={`flex-1 py-3 px-2 rounded-xl text-sm font-semibold border-2 transition-colors
                      ${prioridadEdit === val ? cfg.color : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Observaciones (opcional)</label>
              <textarea value={obsEdit} onChange={e => setObsEdit(e.target.value)} rows={3}
                className="w-full border border-feisen-borde rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul resize-none"
                placeholder="Especificaciones, referencias, etc." />
            </div>

            {/* Foto de muestra edición */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Foto de muestra (opcional)</label>
              {fotoMuestraEdit ? (
                <div className="space-y-2">
                  <img src={fotoMuestraEdit} alt="Muestra" className="w-full max-h-48 object-contain rounded-xl border bg-gray-50" />
                  <button type="button" onClick={() => setFotoMuestraEdit('')}
                    className="flex items-center gap-1 text-xs text-feisen-rojo hover:underline">
                    <X size={12} /> Quitar foto
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center gap-2 cursor-pointer border-2 border-dashed rounded-xl px-4 py-7 text-base text-gray-400 transition-colors
                  ${subiendoFotoEdit ? 'border-gray-200 bg-gray-50' : 'border-feisen-borde hover:border-feisen-azul hover:text-feisen-azul'}`}>
                  {subiendoFotoEdit
                    ? <><Upload size={28} className="animate-pulse" /><span>Subiendo...</span></>
                    : <><Upload size={28} /><span>Adjuntar foto de muestra o referencia</span></>
                  }
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => subirFoto(e.target.files?.[0], setFotoMuestraEdit, setSubiendoFotoEdit)} disabled={subiendoFotoEdit} />
                </label>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalEditar(null)}
                className="flex-1 border border-feisen-borde rounded-xl py-4 text-base font-medium text-gray-600">Cancelar</button>
              <button type="submit" disabled={guardandoEdit || subiendoFotoEdit}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-4 text-base font-bold hover:opacity-90 disabled:opacity-60">
                {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL CERRAR PEDIDO */}
      {confirmCerrar && (
        <Modal titulo={`Cerrar pedido ${confirmCerrar.numero}`} onCerrar={() => setConfirmCerrar(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">¿Por qué se cierra este pedido sin que haya llegado todo? Cerrar no es recibir: no registra entrada de inventario. Esta razón quedará registrada en el historial.</p>
            <div className="space-y-2">
              {MOTIVOS_CIERRE.map(m => (
                <button key={m} type="button" onClick={() => setMotivoCierre(m)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors
                    ${motivoCierre === m
                      ? 'border-feisen-azul bg-blue-50 text-feisen-azul'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-feisen-borde hover:bg-gray-50'}`}>
                  {motivoCierre === m ? '✓ ' : ''}{m}
                </button>
              ))}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmCerrar(null)}
                className="flex-1 border border-feisen-borde rounded-xl py-2.5 text-sm font-medium text-gray-600">
                Cancelar
              </button>
              <button onClick={() => cerrarPedido(confirmCerrar, motivoCierre)}
                disabled={!motivoCierre}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40">
                Cerrar pedido
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL CONFIRMAR ELIMINACIÓN */}
      {confirmElim && (
        <Modal titulo="Eliminar pedido" onCerrar={() => setConfirmElim(null)}>
          <div className="space-y-4">
            <Alerta tipo="alerta" mensaje={`¿Eliminar ${confirmElim.numero}? Esta acción no se puede deshacer. Los movimientos vinculados quedarán sin pedido asociado.`} />
            <div className="flex gap-3">
              <button onClick={() => setConfirmElim(null)}
                className="flex-1 border border-feisen-borde rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button onClick={() => eliminarPedido(confirmElim)}
                className="flex-1 bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold">Sí, eliminar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
