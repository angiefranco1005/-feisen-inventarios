import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatFechaHora } from '../../utils/formatters'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Plus, CheckCircle, Truck, Package, Trash2, Search } from 'lucide-react'

const UNIDADES = ['und', 'kg', 'g', 'lb', 'm', 'cm', 'm²', 'm³', 'L', 'ml', 'galón', 'rollo', 'par', 'caja', 'bulto']

function ProductoSelector({ value, unidad, onSelect, productos }) {
  const [busqueda, setBusqueda] = useState(value || '')
  const [abierto, setAbierto] = useState(false)

  const filtrados = busqueda.trim().length > 0
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : productos

  function seleccionar(p) {
    setBusqueda(p.nombre)
    setAbierto(false)
    onSelect(p.nombre, p.unidad_medida)
  }

  return (
    <div className="relative flex-1">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
        <input
          required
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setAbierto(true); if (!e.target.value) onSelect('', unidad) }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          placeholder="Buscar producto..."
          className="w-full border border-gray-300 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
        />
      </div>
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
          {filtrados.slice(0, 20).map(p => (
            <button key={p.id} type="button" onMouseDown={() => seleccionar(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-feisen-gris border-b last:border-0 flex items-center justify-between">
              <span className="text-feisen-gris-oscuro font-medium">{p.nombre}</span>
              <span className="text-xs text-feisen-gris-medio ml-2">{p.unidad_medida}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, onChange, onRemove, index, total, productos }) {
  return (
    <div className="flex gap-2 items-start">
      <ProductoSelector
        value={item.descripcion}
        unidad={item.unidad}
        productos={productos}
        onSelect={(nombre, unidad) => {
          onChange(index, 'descripcion', nombre)
          if (unidad) onChange(index, 'unidad', unidad)
        }}
      />
      <div className="w-24">
        <input required type="number" min="0.001" step="any" value={item.cantidad}
          onChange={e => onChange(index, 'cantidad', e.target.value)}
          placeholder="Cant."
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
      </div>
      <div className="w-24">
        <select value={item.unidad} onChange={e => onChange(index, 'unidad', e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
          {UNIDADES.map(u => <option key={u}>{u}</option>)}
        </select>
      </div>
      {total > 1 && (
        <button type="button" onClick={() => onRemove(index)}
          className="p-2 text-gray-400 hover:text-feisen-rojo rounded-lg mt-0.5">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}

function NuevoPedidoModal({ onCerrar, onCreado, perfil }) {
  const [items, setItems] = useState([{ descripcion: '', cantidad: '', unidad: 'und' }])
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [productos, setProductos] = useState([])

  useEffect(() => {
    supabase.from('items').select('id, nombre, unidad_medida').eq('activo', true).order('nombre')
      .then(({ data }) => setProductos(data || []))
  }, [])

  function actualizarItem(idx, campo, valor) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it))
  }

  async function crear(e) {
    e.preventDefault()
    setGuardando(true); setMsg(null)
    const { data: pedido, error } = await supabase.from('pedidos').insert({
      solicitante_id: perfil.id,
      solicitante_nombre: perfil.nombre,
      area: perfil.almacen || perfil.rol,
      observaciones: observaciones || null,
    }).select().single()
    if (error) { setMsg({ tipo: 'error', texto: error.message }); setGuardando(false); return }
    await supabase.from('pedido_items').insert(
      items.map(it => ({ pedido_id: pedido.id, descripcion: it.descripcion, cantidad: parseFloat(it.cantidad), unidad: it.unidad }))
    )
    setGuardando(false)
    onCreado()
  }

  return (
    <Modal titulo="Nuevo pedido de materia prima" onCerrar={onCerrar}>
      <form onSubmit={crear} className="space-y-4">
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
        <div>
          <label className="text-sm font-semibold text-feisen-gris-oscuro block mb-2">Materiales solicitados *</label>
          <div className="space-y-2">
            <div className="flex gap-2 text-xs text-feisen-gris-medio font-medium px-0.5">
              <span className="flex-1">Descripción</span>
              <span className="w-24">Cantidad</span>
              <span className="w-24">Unidad</span>
            </div>
            {items.map((it, i) => (
              <ItemRow key={i} item={it} index={i} total={items.length}
                productos={productos}
                onChange={actualizarItem}
                onRemove={idx => setItems(prev => prev.filter((_, j) => j !== idx))} />
            ))}
          </div>
          <button type="button" onClick={() => setItems(prev => [...prev, { descripcion: '', cantidad: '', unidad: 'und' }])}
            className="mt-2 flex items-center gap-1 text-feisen-azul text-sm font-medium hover:underline">
            <Plus size={15} /> Agregar otro material
          </button>
        </div>
        <div>
          <label className="text-sm font-semibold text-feisen-gris-oscuro block mb-1">Observaciones</label>
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
            placeholder="Urgencia, especificaciones, para qué proyecto..."
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCerrar}
            className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-feisen-gris-oscuro">Cancelar</button>
          <button type="submit" disabled={guardando}
            className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
            {guardando ? 'Enviando...' : 'Enviar pedido'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ModalTransito({ pedido, onCerrar, onGuardado, perfil }) {
  const [numeroOc, setNumeroOc] = useState('')
  const [fechaEstimada, setFechaEstimada] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)

  async function guardar(e) {
    e.preventDefault()
    if (!fechaEstimada) { setMsg({ tipo: 'error', texto: 'La fecha estimada de llegada es obligatoria.' }); return }
    setGuardando(true)
    const { error } = await supabase.from('pedidos').update({
      estado: 'en_transito',
      numero_oc: numeroOc || null,
      fecha_estimada_llegada: fechaEstimada,
      registrado_transito_por: perfil.nombre,
      fecha_transito: new Date().toISOString(),
    }).eq('id', pedido.id)
    setGuardando(false)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    onGuardado()
  }

  return (
    <Modal titulo={`Registrar en tránsito — PED-${String(pedido.numero).padStart(4, '0')}`} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
        <Alerta tipo="info" mensaje="Completa la información de la orden de compra enviada al proveedor." />
        <div>
          <label className="text-sm font-semibold text-feisen-gris-oscuro block mb-1">N° Orden de compra</label>
          <input value={numeroOc} onChange={e => setNumeroOc(e.target.value)}
            placeholder="Ej: OC-2026-0042 (opcional)"
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <div>
          <label className="text-sm font-semibold text-feisen-gris-oscuro block mb-1">Fecha estimada de llegada *</label>
          <input required type="date" value={fechaEstimada} onChange={e => setFechaEstimada(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCerrar}
            className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-feisen-gris-oscuro">Cancelar</button>
          <button type="submit" disabled={guardando}
            className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
            {guardando ? 'Guardando...' : '🚚 Registrar en tránsito'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const ESTADO_CONFIG = {
  pendiente:   { label: '⏳ Pendiente',   badge: 'bg-amber-100 text-amber-700',   border: 'border-amber-400' },
  en_transito: { label: '🚚 En tránsito', badge: 'bg-blue-100 text-feisen-azul',  border: 'border-feisen-azul' },
  recibido:    { label: '✓ Recibido',     badge: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-500' },
}

function formatFecha(fecha) {
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}

export default function ListaPedidos() {
  const { perfil } = useAuth()
  const [pedidos, setPedidos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState('pendiente')
  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalTransito, setModalTransito] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase
      .from('pedidos')
      .select('*, pedido_items(*)')
      .order('created_at', { ascending: false })
    setPedidos(data || [])
    setCargando(false)
  }

  function notificar(texto) {
    setMsg({ tipo: 'exito', texto })
    setTimeout(() => setMsg(null), 3000)
  }

  async function marcarRecibido(pedido) {
    const { error } = await supabase.from('pedidos').update({
      estado: 'recibido',
      fecha_recibido: new Date().toISOString(),
      recibido_por: perfil.nombre,
    }).eq('id', pedido.id)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    notificar(`PED-${String(pedido.numero).padStart(4, '0')} marcado como recibido ✓`)
    cargar()
  }

  const TABS = [
    { val: 'pendiente',   label: 'Pendientes' },
    { val: 'en_transito', label: 'En tránsito' },
    { val: 'recibido',    label: 'Recibidos' },
    { val: 'todos',       label: 'Todos' },
  ]

  const pedidosFiltrados = filtro === 'todos' ? pedidos : pedidos.filter(p => p.estado === filtro)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-feisen-azul">Pedidos de materia prima</h1>
        <button onClick={() => setModalNuevo(true)}
          className="flex items-center gap-1 text-sm bg-feisen-azul text-white px-3 py-2 rounded-xl hover:bg-feisen-azul-claro transition-colors font-medium">
          <Plus size={16} /> Nuevo pedido
        </button>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ val, label }) => {
          const count = val === 'todos' ? pedidos.length : pedidos.filter(p => p.estado === val).length
          return (
            <button key={val} onClick={() => setFiltro(val)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors border
                ${filtro === val ? 'bg-feisen-azul text-white border-feisen-azul' : 'bg-white text-feisen-gris-oscuro border-gray-200 hover:border-feisen-azul'}`}>
              {label} <span className="ml-1 opacity-70 text-xs">({count})</span>
            </button>
          )
        })}
      </div>

      {cargando ? <Spinner texto="Cargando pedidos..." /> : (
        <div className="space-y-4">
          {pedidosFiltrados.length === 0 ? (
            <div className="text-center py-16 text-feisen-gris-medio bg-white rounded-2xl shadow-sm">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p>No hay pedidos en esta categoría.</p>
            </div>
          ) : pedidosFiltrados.map(p => {
            const cfg = ESTADO_CONFIG[p.estado] || ESTADO_CONFIG.pendiente
            return (
              <div key={p.id} className={`bg-white rounded-2xl shadow-sm p-5 space-y-3 border-l-4 ${cfg.border}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-feisen-gris-oscuro">
                        PED-{String(p.numero).padStart(4, '0')}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-feisen-gris-medio mt-0.5">
                      {p.solicitante_nombre} · {formatFechaHora(p.fecha_solicitud)}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    {p.estado === 'pendiente' && (
                      <button onClick={() => setModalTransito(p)}
                        className="flex items-center gap-1.5 text-sm bg-feisen-azul text-white px-3 py-1.5 rounded-xl hover:opacity-90 transition-opacity font-medium">
                        <Truck size={15} /> Registrar en tránsito
                      </button>
                    )}
                    {p.estado === 'en_transito' && (
                      <button onClick={() => marcarRecibido(p)}
                        className="flex items-center gap-1.5 text-sm bg-emerald-600 text-white px-3 py-1.5 rounded-xl hover:bg-emerald-700 transition-colors font-medium">
                        <CheckCircle size={15} /> Marcar recibido
                      </button>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div className="bg-feisen-gris rounded-xl p-3 space-y-1.5">
                  {p.pedido_items?.map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-feisen-gris-oscuro">{it.descripcion}</span>
                      <span className="font-semibold text-feisen-azul ml-4 flex-shrink-0">{it.cantidad} {it.unidad}</span>
                    </div>
                  ))}
                </div>

                {p.observaciones && (
                  <p className="text-sm text-feisen-gris-medio italic">💬 {p.observaciones}</p>
                )}

                {/* Info tránsito */}
                {(p.estado === 'en_transito' || p.estado === 'recibido') && (
                  <div className="text-xs text-feisen-gris-medio space-y-0.5 border-t pt-2">
                    {p.numero_oc && <p>🧾 OC: <span className="font-semibold text-feisen-gris-oscuro">{p.numero_oc}</span></p>}
                    {p.fecha_estimada_llegada && <p>📅 Llegada estimada: <span className="font-semibold text-feisen-gris-oscuro">{formatFecha(p.fecha_estimada_llegada)}</span></p>}
                    {p.registrado_transito_por && <p>Registrado por {p.registrado_transito_por} · {formatFechaHora(p.fecha_transito)}</p>}
                  </div>
                )}

                {p.estado === 'recibido' && p.recibido_por && (
                  <p className="text-xs text-emerald-600 border-t pt-2">
                    ✓ Recibido por {p.recibido_por} · {formatFechaHora(p.fecha_recibido)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modalNuevo && (
        <NuevoPedidoModal perfil={perfil} onCerrar={() => setModalNuevo(false)}
          onCreado={() => { setModalNuevo(false); cargar(); notificar('Pedido enviado a compras.') }} />
      )}

      {modalTransito && (
        <ModalTransito pedido={modalTransito} perfil={perfil}
          onCerrar={() => setModalTransito(null)}
          onGuardado={() => { setModalTransito(null); cargar(); notificar(`PED-${String(modalTransito.numero).padStart(4, '0')} registrado en tránsito 🚚`) }} />
      )}
    </div>
  )
}
