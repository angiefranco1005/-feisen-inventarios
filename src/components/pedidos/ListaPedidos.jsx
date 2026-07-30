import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { useNavigate } from 'react-router-dom'
import { Plus, ShoppingCart, Truck, CheckCircle, Search, Trash2 } from 'lucide-react'

const ESTADO_CONFIG = {
  pendiente:    { label: 'Pendiente',    color: 'bg-amber-100 text-amber-700',  icon: ShoppingCart },
  en_transito:  { label: 'En tránsito',  color: 'bg-blue-100 text-blue-700',    icon: Truck        },
  recibido:     { label: 'Recibido',     color: 'bg-green-100 text-green-700',  icon: CheckCircle  },
}

const UNIDADES = ['und', 'kg', 'g', 'lb', 'm', 'cm', 'L', 'ml', 'rollo', 'par', 'caja', 'bulto']

function SelectorProducto({ value, onSelect, productos }) {
  const [busqueda, setBusqueda] = useState(value || '')
  const [abierto,  setAbierto]  = useState(false)

  const filtrados = busqueda.trim()
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : productos

  return (
    <div className="relative flex-1">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input required value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setAbierto(true); if (!e.target.value) onSelect('', '') }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          placeholder="Buscar producto..."
          className="w-full border border-gray-300 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
      </div>
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {filtrados.slice(0, 20).map(p => (
            <button key={p.id} type="button" onMouseDown={() => { setBusqueda(p.nombre); setAbierto(false); onSelect(p.nombre, p.unidad_medida) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0 flex justify-between">
              <span className="font-medium text-gray-800">{p.nombre}</span>
              <span className="text-xs text-gray-400">{p.unidad_medida}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ListaPedidos() {
  const { perfil, esAdmin } = useAuth()
  const navigate = useNavigate()
  const [pedidos,   setPedidos]   = useState([])
  const [productos, setProductos] = useState([])
  const [cargando,  setCargando]  = useState(true)
  const [filtro,    setFiltro]    = useState('todos')
  const [msg,       setMsg]       = useState(null)

  // Modales
  const [modalNuevo,    setModalNuevo]    = useState(false)
  const [modalTransito, setModalTransito] = useState(null)

  // Form nuevo pedido
  const ITEM0  = { descripcion: '', cantidad: '', unidad: 'und' }
  const [items, setItems]   = useState([{ ...ITEM0 }])
  const [obs,   setObs]     = useState('')

  // Form tránsito
  const [formTransito, setFormTransito] = useState({ numero_oc: '', fecha_estimada: '' })

useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: peds }, { data: prods }] = await Promise.all([
      supabase.from('pedidos')
        .select('*, pedido_items(*), profiles(nombre)')
        .order('created_at', { ascending: false }),
      supabase.from('items').select('id, nombre, unidad_medida').eq('activo', true).order('nombre'),
    ])
    setPedidos(peds || [])
    setProductos(prods || [])
    setCargando(false)
  }

  // Generar número correlativo
  async function generarNumero() {
    const { count } = await supabase.from('pedidos').select('*', { count: 'exact', head: true })
    return `PED-${String((count || 0) + 1).padStart(4, '0')}`
  }

  async function crearPedido(e) {
    e.preventDefault()
    setMsg(null)
    const itemsValidos = items.filter(i => i.descripcion && parseFloat(i.cantidad) > 0)
    if (itemsValidos.length === 0) { setMsg({ tipo: 'error', texto: 'Agrega al menos un producto con cantidad.' }); return }

    const numero = await generarNumero()
    const { data: pedido, error: err1 } = await supabase.from('pedidos').insert({
      numero, estado: 'pendiente', observaciones: obs || null, solicitante_id: perfil.id
    }).select().single()
    if (err1) { setMsg({ tipo: 'error', texto: 'Error: ' + err1.message }); return }

    const { error: err2 } = await supabase.from('pedido_items').insert(
      itemsValidos.map(i => ({
        pedido_id:   pedido.id,
        descripcion: i.descripcion,
        cantidad:    parseFloat(i.cantidad),
        unidad:      i.unidad,
      }))
    )
    if (err2) { setMsg({ tipo: 'error', texto: 'Error en items: ' + err2.message }); return }

    setModalNuevo(false)
    setItems([{ ...ITEM0 }])
    setObs('')
    cargar()
  }

  async function marcarTransito(e) {
    e.preventDefault()
    if (!formTransito.numero_oc) { return }
    await supabase.from('pedidos').update({
      estado: 'en_transito',
      numero_oc: formTransito.numero_oc,
      fecha_estimada_llegada: formTransito.fecha_estimada || null,
    }).eq('id', modalTransito.id)
    setModalTransito(null)
    setFormTransito({ numero_oc: '', fecha_estimada: '' })
    cargar()
  }

  async function marcarRecibido(pedido) {
    await supabase.from('pedidos').update({ estado: 'recibido', fecha_recibido: new Date().toISOString() }).eq('id', pedido.id)
    setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, estado: 'recibido' } : p))
    const ir = window.confirm(`✅ Pedido ${pedido.numero} marcado como recibido.\n\n¿Deseas registrar la entrada de almacén ahora?`)
    if (ir) navigate('/movimientos/nuevo', { state: { pedido_id: pedido.id, pedido_numero: pedido.numero } })
  }

  async function eliminarPedido(pedido) {
    await supabase.from('pedido_items').delete().eq('pedido_id', pedido.id)
    await supabase.from('pedidos').delete().eq('id', pedido.id)
    cargar()
  }

  const pedidosFiltrados = pedidos.filter(p => filtro === 'todos' || p.estado === filtro)

  if (cargando) return <Spinner texto="Cargando pedidos..." />

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-feisen-azul">Pedidos</h1>
        <button onClick={() => { setMsg(null); setItems([{ ...ITEM0 }]); setObs(''); setModalNuevo(true) }}
          className="flex items-center gap-2 bg-feisen-azul text-white px-4 py-2 rounded-xl font-medium hover:opacity-90">
          <Plus size={18} /> Nuevo pedido
        </button>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {['todos', 'pendiente', 'en_transito', 'recibido'].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors
              ${filtro === f ? 'bg-feisen-azul text-white border-feisen-azul' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {f === 'todos' ? 'Todos' : ESTADO_CONFIG[f].label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {pedidosFiltrados.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400 border border-gray-100">
            <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay pedidos{filtro !== 'todos' ? ' en este estado' : ''}.</p>
          </div>
        ) : pedidosFiltrados.map(p => {
          const ec  = ESTADO_CONFIG[p.estado]
          const Ico = ec.icon
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Ico size={20} className={p.estado === 'pendiente' ? 'text-amber-500' : p.estado === 'en_transito' ? 'text-blue-500' : 'text-green-500'} />
                  <div>
                    <p className="font-bold text-gray-800">{p.numero}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(p.created_at).toLocaleDateString('es-CO')} · {p.profiles?.nombre}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${ec.color}`}>{ec.label}</span>
                  {p.estado === 'pendiente' && esAdmin && (
                    <button onClick={() => { setFormTransito({ numero_oc: '', fecha_estimada: '' }); setModalTransito(p) }}
                      className="text-xs bg-feisen-azul text-white px-3 py-1.5 rounded-lg font-medium hover:opacity-90">
                      En tránsito
                    </button>
                  )}
                  {p.estado === 'en_transito' && esAdmin && (
                    <button onClick={() => marcarRecibido(p)}
                      className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:opacity-90">
                      Recibido
                    </button>
                  )}
                  {esAdmin && (
                    <button onClick={() => eliminarPedido(p)} className="p-1.5 text-gray-300 hover:text-feisen-rojo hover:bg-red-50 rounded-lg">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Items del pedido */}
              {p.pedido_items?.length > 0 && (
                <div className="border-t border-gray-50 px-5 py-3 space-y-1">
                  {p.pedido_items.map((it, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600">{it.descripcion}</span>
                      <span className="font-medium text-gray-800">{it.cantidad} {it.unidad}</span>
                    </div>
                  ))}
                  {p.observaciones && <p className="text-xs text-gray-400 mt-2 italic">"{p.observaciones}"</p>}
                  {p.numero_oc && <p className="text-xs text-blue-600 font-medium mt-1">OC: {p.numero_oc}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* MODAL NUEVO PEDIDO */}
      {modalNuevo && (
        <Modal titulo="Nuevo pedido" onCerrar={() => setModalNuevo(false)}>
          <form onSubmit={crearPedido} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <p className="text-sm text-gray-500">Agrega los productos que necesitas solicitar.</p>

            {items.map((it, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <SelectorProducto value={it.descripcion} productos={productos}
                  onSelect={(nombre, unidad) => {
                    const copia = [...items]
                    copia[idx] = { ...copia[idx], descripcion: nombre, unidad: unidad || copia[idx].unidad }
                    setItems(copia)
                  }} />
                <input type="number" min="0.001" step="0.001" placeholder="Cant." value={it.cantidad}
                  onChange={e => { const c = [...items]; c[idx].cantidad = e.target.value; setItems(c) }}
                  className="w-20 border border-gray-300 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
                <select value={it.unidad} onChange={e => { const c = [...items]; c[idx].unidad = e.target.value; setItems(c) }}
                  className="w-20 border border-gray-300 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                {items.length > 1 && (
                  <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    className="p-2 text-gray-400 hover:text-feisen-rojo">✕</button>
                )}
              </div>
            ))}

            <button type="button" onClick={() => setItems([...items, { ...ITEM0 }])}
              className="text-sm text-feisen-azul font-medium flex items-center gap-1 hover:underline">
              <Plus size={14} /> Agregar otro producto
            </button>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Observaciones (opcional)</label>
              <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul resize-none"
                placeholder="Urgencia, especificaciones, etc." />
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalNuevo(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit"
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90">Crear pedido</button>
            </div>
          </form>
        </Modal>
      )}

{/* MODAL EN TRÁNSITO */}
      {modalTransito && (
        <Modal titulo="Marcar en tránsito" onCerrar={() => setModalTransito(null)}>
          <form onSubmit={marcarTransito} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">N° Orden de Compra *</label>
              <input required value={formTransito.numero_oc} onChange={e => setFormTransito(f => ({ ...f, numero_oc: e.target.value }))}
                placeholder="Ej: OC-2026-001"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Fecha estimada de llegada</label>
              <input type="date" value={formTransito.fecha_estimada} onChange={e => setFormTransito(f => ({ ...f, fecha_estimada: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalTransito(null)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit"
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90">Confirmar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
