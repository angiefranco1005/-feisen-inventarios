import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatFechaHora } from '../../utils/formatters'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Plus, CheckCircle, Clock, Trash2, Package } from 'lucide-react'

const UNIDADES = ['und', 'kg', 'g', 'lb', 'm', 'cm', 'm²', 'm³', 'L', 'ml', 'galón', 'rollo', 'par', 'caja', 'bulto']

function ItemRow({ item, onChange, onRemove, index }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1">
        <input required value={item.descripcion} onChange={e => onChange(index, 'descripcion', e.target.value)}
          placeholder="Descripción del material"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
      </div>
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
      <button type="button" onClick={() => onRemove(index)}
        className="p-2 text-gray-400 hover:text-feisen-rojo rounded-lg mt-0.5">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

function NuevoPedidoModal({ onCerrar, onCreado, perfil }) {
  const [items, setItems] = useState([{ descripcion: '', cantidad: '', unidad: 'und' }])
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)

  function actualizarItem(idx, campo, valor) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it))
  }

  function agregarItem() {
    setItems(prev => [...prev, { descripcion: '', cantidad: '', unidad: 'und' }])
  }

  function eliminarItem(idx) {
    if (items.length === 1) return
    setItems(prev => prev.filter((_, i) => i !== idx))
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

    const { error: errItems } = await supabase.from('pedido_items').insert(
      items.map(it => ({ pedido_id: pedido.id, descripcion: it.descripcion, cantidad: parseFloat(it.cantidad), unidad: it.unidad }))
    )

    setGuardando(false)
    if (errItems) { setMsg({ tipo: 'error', texto: errItems.message }); return }
    onCreado()
  }

  return (
    <Modal titulo="Nuevo pedido de materia prima" onCerrar={onCerrar}>
      <form onSubmit={crear} className="space-y-4">
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

        <div>
          <label className="text-sm font-semibold text-feisen-gris-oscuro block mb-2">
            Materiales solicitados *
          </label>
          <div className="space-y-2">
            <div className="flex gap-2 text-xs text-feisen-gris-medio font-medium px-0.5">
              <span className="flex-1">Descripción</span>
              <span className="w-24">Cantidad</span>
              <span className="w-24">Unidad</span>
              <span className="w-8"></span>
            </div>
            {items.map((it, i) => (
              <ItemRow key={i} item={it} index={i} onChange={actualizarItem} onRemove={eliminarItem} />
            ))}
          </div>
          <button type="button" onClick={agregarItem}
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

export default function ListaPedidos() {
  const { perfil } = useAuth()
  const [pedidos, setPedidos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState('pendiente')
  const [modalNuevo, setModalNuevo] = useState(false)
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

  async function marcarRecibido(pedido) {
    const { error } = await supabase.from('pedidos').update({
      estado: 'recibido',
      fecha_recibido: new Date().toISOString(),
      recibido_por: perfil.nombre,
    }).eq('id', pedido.id)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setMsg({ tipo: 'exito', texto: `Pedido PED-${String(pedido.numero).padStart(4, '0')} marcado como recibido.` })
    cargar()
    setTimeout(() => setMsg(null), 3000)
  }

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

      {/* Filtros */}
      <div className="flex gap-2">
        {[['pendiente', 'Pendientes'], ['recibido', 'Recibidos'], ['todos', 'Todos']].map(([val, label]) => (
          <button key={val} onClick={() => setFiltro(val)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors border
              ${filtro === val ? 'bg-feisen-azul text-white border-feisen-azul' : 'bg-white text-feisen-gris-oscuro border-gray-200 hover:border-feisen-azul'}`}>
            {label}
            <span className="ml-1.5 text-xs opacity-70">
              ({val === 'todos' ? pedidos.length : pedidos.filter(p => p.estado === val).length})
            </span>
          </button>
        ))}
      </div>

      {cargando ? <Spinner texto="Cargando pedidos..." /> : (
        <div className="space-y-4">
          {pedidosFiltrados.length === 0 ? (
            <div className="text-center py-16 text-feisen-gris-medio bg-white rounded-2xl shadow-sm">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p>No hay pedidos {filtro === 'pendiente' ? 'pendientes' : filtro === 'recibido' ? 'recibidos' : ''}.</p>
            </div>
          ) : pedidosFiltrados.map(p => (
            <div key={p.id} className={`bg-white rounded-2xl shadow-sm p-5 space-y-3 border-l-4 ${p.estado === 'recibido' ? 'border-emerald-500' : 'border-amber-400'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-feisen-gris-oscuro">
                      PED-{String(p.numero).padStart(4, '0')}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.estado === 'recibido' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {p.estado === 'recibido' ? '✓ Recibido' : '⏳ Pendiente'}
                    </span>
                  </div>
                  <p className="text-sm text-feisen-gris-medio mt-0.5">
                    {p.solicitante_nombre} · {formatFechaHora(p.fecha_solicitud)}
                  </p>
                </div>
                {p.estado === 'pendiente' && (
                  <button onClick={() => marcarRecibido(p)}
                    className="flex items-center gap-1.5 text-sm bg-emerald-600 text-white px-3 py-1.5 rounded-xl hover:bg-emerald-700 transition-colors font-medium flex-shrink-0">
                    <CheckCircle size={15} /> Marcar recibido
                  </button>
                )}
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

              {p.estado === 'recibido' && p.recibido_por && (
                <p className="text-xs text-emerald-600">Recibido por {p.recibido_por} · {formatFechaHora(p.fecha_recibido)}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {modalNuevo && (
        <NuevoPedidoModal
          perfil={perfil}
          onCerrar={() => setModalNuevo(false)}
          onCreado={() => { setModalNuevo(false); cargar(); setMsg({ tipo: 'exito', texto: 'Pedido enviado a compras.' }); setTimeout(() => setMsg(null), 3000) }}
        />
      )}
    </div>
  )
}
