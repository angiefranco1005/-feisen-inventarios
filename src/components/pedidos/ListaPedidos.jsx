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

function TarjetaPedido({ p, esAdmin, puedeTransito, puedeRecibir, onTransito, onEliminar, onRecibido }) {
  const ec  = ESTADO_CONFIG[p.estado] || { label: p.estado, color: 'bg-gray-100 text-gray-600', icon: ShoppingCart }
  const Ico = ec.icon

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Ico size={20} className={p.estado === 'pendiente' ? 'text-amber-500' : p.estado === 'en_transito' ? 'text-blue-500' : 'text-green-500'} />
          <div>
            <p className="font-bold text-gray-800">{p.numero}</p>
            <p className="text-xs text-gray-400">
              {new Date(p.created_at).toLocaleDateString('es-CO')} · {p.profiles?.nombre}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${ec.color}`}>{ec.label}</span>
          {p.estado === 'pendiente' && puedeTransito && (
            <button onClick={() => onTransito(p)}
              className="text-xs bg-feisen-azul text-white px-3 py-1.5 rounded-lg font-medium">
              En tránsito
            </button>
          )}
          {p.estado === 'en_transito' && puedeRecibir && (
            <>
              <button onClick={() => onRecibido(p, true)}
                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium">
                ✅ Recibido + Entrada
              </button>
              <button onClick={() => onRecibido(p, false)}
                className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg font-medium">
                Solo recibir
              </button>
            </>
          )}
          {esAdmin && (
            <button onClick={() => onEliminar(p)} className="p-1.5 text-gray-300 hover:text-feisen-rojo hover:bg-red-50 rounded-lg">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
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
}

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
          onChange={e => { setBusqueda(e.target.value); setAbierto(true); if (!e.target.value) onSelect('', '', null) }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => {
            setAbierto(false)
            const coincide = productos.some(p => p.nombre === busqueda)
            if (busqueda && !coincide) { setBusqueda(''); onSelect('', '', null) }
          }, 150)}
          placeholder="Buscar producto..."
          className="w-full border border-gray-300 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
      </div>
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {filtrados.slice(0, 20).map(p => (
            <button key={p.id} type="button" onMouseDown={() => { setBusqueda(p.nombre); setAbierto(false); onSelect(p.nombre, p.unidad_medida, p.id) }}
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
  const { perfil, esAdmin, esLogistica, esAlmacenista, bodegasOperacion } = useAuth()
  const navigate = useNavigate()
  const [pedidos,   setPedidos]   = useState([])
  const [productos, setProductos] = useState([])
  const [cargando,  setCargando]  = useState(true)
  const [filtro,    setFiltro]    = useState('todos')
  const [msg,       setMsg]       = useState(null)

  // Modales
  const [modalNuevo,    setModalNuevo]    = useState(false)
  const [modalTransito, setModalTransito] = useState(null)
  const [modalRecibido, setModalRecibido] = useState(null) // { pedido, conEntrada }
  const [cantRec,       setCantRec]       = useState({})
  const [confirmElim,   setConfirmElim]   = useState(null) // pedido a eliminar

  // Form nuevo pedido
  const ITEM0  = { descripcion: '', cantidad: '', unidad: 'und', item_id: null }
  const [items, setItems]   = useState([{ ...ITEM0 }])
  const [obs,   setObs]     = useState('')

  // Form tránsito
  const [formTransito, setFormTransito] = useState({ numero_oc: '', fecha_estimada: '' })

useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    let prodsQ = supabase.from('items').select('id, nombre, unidad_medida').eq('activo', true).order('nombre')
    if (bodegasOperacion) prodsQ = prodsQ.in('bodega_id', bodegasOperacion)

    const [{ data: peds }, { data: prods }] = await Promise.all([
      supabase.from('pedidos')
        .select('*, pedido_items(*), profiles(nombre)')
        .order('created_at', { ascending: false }),
      prodsQ,
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
    if (itemsValidos.some(i => !i.item_id)) { setMsg({ tipo: 'error', texto: 'Todos los productos deben seleccionarse del catálogo.' }); return }

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
        item_id:     i.item_id || null,
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

  function iniciarRecibido(pedido, conEntrada) {
    const inicial = {}
    pedido.pedido_items?.forEach(it => { inicial[it.id] = String(it.cantidad) })
    setCantRec(inicial)
    setModalRecibido({ pedido, conEntrada })
  }

  async function confirmarRecibido() {
    const { pedido, conEntrada } = modalRecibido

    // 1. Guardar cantidad_recibida por ítem
    await Promise.all(
      (pedido.pedido_items || []).map(it =>
        supabase.from('pedido_items')
          .update({ cantidad_recibida: parseFloat(cantRec[it.id]) || 0 })
          .eq('id', it.id)
      )
    )

    // 2. Marcar pedido como recibido
    await supabase.from('pedidos')
      .update({ estado: 'recibido', fecha_recibido: new Date().toISOString() })
      .eq('id', pedido.id)
    setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, estado: 'recibido' } : p))
    setModalRecibido(null)

    // 3. Si "Recibido + Entrada", crear movimientos automáticamente
    if (conEntrada) {
      const itemsConId = (pedido.pedido_items || []).filter(it => it.item_id && parseFloat(cantRec[it.id]) > 0)
      if (itemsConId.length > 0) {
        const { data: itemsData } = await supabase
          .from('items')
          .select('id, bodega_id, precio_costo, bodegas(nombre)')
          .in('id', itemsConId.map(it => it.item_id))
        const itemMap = {}
        itemsData?.forEach(i => { itemMap[i.id] = i })

        const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
        const prefix = `MOV-${iniciales}-`
        const { data: lastMov } = await supabase
          .from('movimientos').select('numero').like('numero', `${prefix}%`)
          .order('numero', { ascending: false }).limit(1).maybeSingle()
        let lastNum = lastMov?.numero ? parseInt(lastMov.numero.replace(prefix, ''), 10) || 0 : 0

        const payloads = []
        for (const it of itemsConId) {
          const info = itemMap[it.item_id]
          if (!info) continue
          lastNum++
          payloads.push({
            numero:                `${prefix}${String(lastNum).padStart(4, '0')}`,
            tipo:                  'entrada',
            item_id:               it.item_id,
            bodega_destino_id:     info.bodega_id,
            bodega_origen_id:      null,
            cantidad:              parseFloat(cantRec[it.id]),
            precio_costo_snapshot: info.precio_costo || 0,
            centro_costo:          info.bodegas?.nombre || '',
            usuario_id:            perfil.id,
            pedido_id:             pedido.id,
            proveedor: null, foto_remision_url: null, destino: null,
            numero_of: null, serial_motor: null, referencia: null, motivo: null, cliente: null,
          })
        }
        if (payloads.length > 0) {
          const { error } = await supabase.from('movimientos').insert(payloads)
          if (error) setMsg({ tipo: 'error', texto: 'Pedido recibido, pero error al registrar entradas: ' + error.message })
          else setMsg({ tipo: 'exito', texto: `✅ Recibido + ${payloads.length} entrada(s) registrada(s) automáticamente.` })
        }
      }
    }
  }

  async function eliminarPedido(pedido) {
    setMsg(null)
    // Desvincular movimientos que apunten a este pedido (FK constraint)
    await supabase.from('movimientos').update({ pedido_id: null }).eq('pedido_id', pedido.id)
    await supabase.from('pedido_items').delete().eq('pedido_id', pedido.id)
    const { error } = await supabase.from('pedidos').delete().eq('id', pedido.id)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al eliminar: ' + error.message }); setConfirmElim(null); return }
    setConfirmElim(null)
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
        ) : pedidosFiltrados.map(p => (
          <TarjetaPedido
            key={p.id}
            p={p}
            esAdmin={esAdmin}
            puedeTransito={esAdmin || esLogistica}
            puedeRecibir={esAdmin || esAlmacenista || (esLogistica && p.usuario_id === perfil?.id)}
            onTransito={ped => { setFormTransito({ numero_oc: '', fecha_estimada: '' }); setModalTransito(ped) }}
            onEliminar={ped => setConfirmElim(ped)}
            onRecibido={iniciarRecibido}
          />
        ))}
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
                  onSelect={(nombre, unidad, itemId) => {
                    const copia = [...items]
                    copia[idx] = { ...copia[idx], descripcion: nombre, unidad: unidad || copia[idx].unidad, item_id: itemId || null }
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

{/* MODAL CONFIRMAR RECEPCIÓN */}
      {modalRecibido && (
        <Modal
          titulo={`Recepción — ${modalRecibido.pedido.numero}`}
          onCerrar={() => setModalRecibido(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Ingresa la cantidad que llegó realmente de cada ítem.</p>
            {modalRecibido.pedido.pedido_items?.map(it => (
              <div key={it.id} className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{it.descripcion}</p>
                  <p className="text-xs text-gray-400">Pedido: {it.cantidad} {it.unidad}</p>
                </div>
                <div className="w-28 flex-shrink-0">
                  <label className="text-xs text-gray-500 block mb-1">Recibido</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0" step="0.001"
                      value={cantRec[it.id] ?? ''}
                      onChange={e => setCantRec(r => ({ ...r, [it.id]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                    />
                    <span className="text-xs text-gray-400">{it.unidad}</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalRecibido(null)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">
                Cancelar
              </button>
              <button type="button" onClick={confirmarRecibido}
                className="flex-1 bg-green-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90">
                {modalRecibido.conEntrada ? '✅ Recibido + Entrada' : '✅ Confirmar recibido'}
              </button>
            </div>
          </div>
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

      {/* MODAL CONFIRMAR ELIMINACIÓN */}
      {confirmElim && (
        <Modal titulo="Eliminar pedido" onCerrar={() => setConfirmElim(null)}>
          <div className="space-y-4">
            <Alerta tipo="alerta" mensaje={`¿Eliminar ${confirmElim.numero}? Esta acción no se puede deshacer. Los movimientos vinculados quedarán sin pedido asociado.`} />
            <div className="flex gap-3">
              <button onClick={() => setConfirmElim(null)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button onClick={() => eliminarPedido(confirmElim)}
                className="flex-1 bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold">Sí, eliminar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
