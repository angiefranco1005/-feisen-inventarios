import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { exportarOrdenCompraPDF } from '../../utils/exportOrdenCompraPDF'
import { FileDown, Loader2 } from 'lucide-react'

export default function ModalGenerarOC({ pedido, coberturaPorItem, onCerrar, onGuardado }) {
  const { perfil } = useAuth()

  const [proveedores,   setProveedores]   = useState([])
  const [proveedorId,   setProveedorId]   = useState('')
  const [nuevoProveedor, setNuevoProveedor] = useState(false)
  const [npNombre, setNpNombre] = useState('')
  const [npNit,    setNpNit]    = useState('')
  const [npContacto, setNpContacto] = useState('')
  const [npTelefono, setNpTelefono] = useState('')

  const [observaciones, setObservaciones] = useState('')

  const [precios,   setPrecios]   = useState({})   // item_id -> precio_costo
  const [seleccion, setSeleccion] = useState({})   // pedido_item_id -> { incluir, cantidad, precio }
  const [cargando,  setCargando]  = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [msg,       setMsg]       = useState(null)

  useEffect(() => {
    async function cargar() {
      const itemIds = (pedido.pedido_items || []).map(it => it.item_id).filter(Boolean)
      const [{ data: provs }, { data: itemsData }] = await Promise.all([
        supabase.from('proveedores').select('id, nombre, nit, contacto, telefono, direccion').eq('activo', true).order('nombre'),
        itemIds.length
          ? supabase.from('items').select('id, precio_costo').in('id', itemIds)
          : Promise.resolve({ data: [] }),
      ])
      setProveedores(provs || [])
      const pMap = {}
      ;(itemsData || []).forEach(i => { pMap[i.id] = i.precio_costo || 0 })
      setPrecios(pMap)

      const sel = {}
      ;(pedido.pedido_items || []).forEach(it => {
        const cubierto  = coberturaPorItem[it.id] || 0
        const pendiente = Math.max(0, it.cantidad - cubierto)
        sel[it.id] = {
          incluir:  false,
          cantidad: pendiente > 0 ? pendiente : it.cantidad,
          precio:   pMap[it.item_id] || 0,
        }
      })
      setSeleccion(sel)
      setCargando(false)
    }
    cargar()
  }, [pedido])

  function actualizarLinea(itemId, campo, valor) {
    setSeleccion(prev => ({ ...prev, [itemId]: { ...prev[itemId], [campo]: valor } }))
  }

  const lineasIncluidas = useMemo(
    () => (pedido.pedido_items || []).filter(it => seleccion[it.id]?.incluir),
    [pedido.pedido_items, seleccion]
  )

  const total = useMemo(
    () => lineasIncluidas.reduce((s, it) => s + (parseFloat(seleccion[it.id]?.cantidad) || 0) * (parseFloat(seleccion[it.id]?.precio) || 0), 0),
    [lineasIncluidas, seleccion]
  )

  async function guardar() {
    setMsg(null)
    if (lineasIncluidas.length === 0) { setMsg({ tipo: 'error', texto: 'Selecciona al menos un producto para la orden.' }); return }
    if (!nuevoProveedor && !proveedorId) { setMsg({ tipo: 'error', texto: 'Selecciona un proveedor o agrega uno nuevo.' }); return }
    if (nuevoProveedor && !npNombre.trim()) { setMsg({ tipo: 'error', texto: 'Escribe el nombre del proveedor nuevo.' }); return }
    for (const it of lineasIncluidas) {
      const cant = parseFloat(seleccion[it.id]?.cantidad)
      if (!cant || cant <= 0) { setMsg({ tipo: 'error', texto: `Cantidad inválida para "${it.descripcion}".` }); return }
      const cubierto  = coberturaPorItem[it.id] || 0
      const pendiente = it.cantidad - cubierto
      if (cant > pendiente + 0.001) {
        setMsg({ tipo: 'error', texto: `"${it.descripcion}": solo quedan ${pendiente} ${it.unidad} sin cubrir por otra orden.` })
        return
      }
    }

    setGuardando(true)
    try {
      let provId = proveedorId
      let provInfo = proveedores.find(p => p.id === proveedorId) || null

      if (nuevoProveedor) {
        const { data: nuevo, error: eProv } = await supabase.from('proveedores').insert({
          nombre: npNombre.trim(), nit: npNit.trim() || null,
          contacto: npContacto.trim() || null, telefono: npTelefono.trim() || null,
        }).select().single()
        if (eProv) throw eProv
        provId = nuevo.id
        provInfo = nuevo
      }

      const { count } = await supabase.from('ordenes_compra').select('*', { count: 'exact', head: true })
      const numero = `OC-${String((count || 0) + 1).padStart(4, '0')}`

      const { data: orden, error: eOrden } = await supabase.from('ordenes_compra').insert({
        numero, pedido_id: pedido.id, proveedor_id: provId,
        fecha: new Date().toISOString().slice(0, 10),
        razon_social: 'Feisen S.A.S.', ciudad: 'Soacha', observaciones: observaciones.trim() || null,
        usuario_id: perfil.id,
      }).select().single()
      if (eOrden) throw eOrden

      const itemsPayload = lineasIncluidas.map(it => ({
        orden_compra_id: orden.id,
        pedido_item_id:  it.id,
        descripcion:     it.descripcion,
        unidad:          it.unidad,
        cantidad:        parseFloat(seleccion[it.id].cantidad),
        precio_unitario: parseFloat(seleccion[it.id].precio) || 0,
      }))
      const { error: eItems } = await supabase.from('orden_compra_items').insert(itemsPayload)
      if (eItems) throw eItems

      exportarOrdenCompraPDF(
        orden,
        provInfo,
        itemsPayload,
        { numero: pedido.numero },
        perfil?.nombre || ''
      )

      onGuardado()
    } catch (e) {
      setMsg({ tipo: 'error', texto: 'Error al generar la orden: ' + e.message })
      setGuardando(false)
    }
  }

  return (
    <Modal titulo={`Generar orden de compra — ${pedido.numero}`} onCerrar={onCerrar}>
      {cargando ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-feisen-azul" size={28} /></div>
      ) : (
        <div className="space-y-5">
          {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

          {/* Productos */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Productos a incluir en esta orden</p>
            <div className="space-y-2.5">
              {(pedido.pedido_items || []).map(it => {
                const cubierto  = coberturaPorItem[it.id] || 0
                const pendiente = Math.max(0, it.cantidad - cubierto)
                const sel = seleccion[it.id] || {}
                return (
                  <div key={it.id} className={`border rounded-xl p-3 ${sel.incluir ? 'border-feisen-azul bg-blue-50/40' : 'border-gray-200'}`}>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" className="mt-1 w-4 h-4 accent-feisen-azul"
                        checked={!!sel.incluir}
                        onChange={e => actualizarLinea(it.id, 'incluir', e.target.checked)} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{it.descripcion}</p>
                        <p className="text-xs text-gray-400">
                          Pedido: {it.cantidad} {it.unidad}
                          {cubierto > 0 && ` · Ya en otra OC: ${cubierto} ${it.unidad}`}
                          {' · '}Pendiente: {pendiente} {it.unidad}
                        </p>
                      </div>
                    </label>
                    {sel.incluir && (
                      <div className="flex gap-2 mt-2 pl-6">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 block mb-0.5">Cantidad en esta orden</label>
                          <input type="number" step="0.001" min="0" value={sel.cantidad}
                            onChange={e => actualizarLinea(it.id, 'cantidad', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 block mb-0.5">Precio unitario</label>
                          <input type="number" step="0.01" min="0" value={sel.precio}
                            onChange={e => actualizarLinea(it.id, 'precio', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm" />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Proveedor */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Proveedor</p>
            {!nuevoProveedor ? (
              <div className="space-y-2">
                <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white">
                  <option value="">Selecciona un proveedor...</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <button type="button" onClick={() => setNuevoProveedor(true)}
                  className="text-xs text-feisen-azul font-medium">+ Agregar proveedor nuevo</button>
              </div>
            ) : (
              <div className="space-y-2">
                <input placeholder="Nombre del proveedor *" value={npNombre} onChange={e => setNpNombre(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
                <div className="flex gap-2">
                  <input placeholder="NIT" value={npNit} onChange={e => setNpNit(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
                  <input placeholder="Teléfono" value={npTelefono} onChange={e => setNpTelefono(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <input placeholder="Contacto" value={npContacto} onChange={e => setNpContacto(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
                <button type="button" onClick={() => setNuevoProveedor(false)}
                  className="text-xs text-gray-500 font-medium">Usar un proveedor ya guardado</button>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-0.5">Observaciones (opcional)</label>
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-sm text-gray-500">
              {lineasIncluidas.length} producto{lineasIncluidas.length !== 1 ? 's' : ''} · Total: <strong className="text-feisen-azul">${total.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </p>
            <button type="button" onClick={guardar} disabled={guardando}
              className="flex items-center gap-2 bg-feisen-azul text-white px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-60">
              {guardando ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
              {guardando ? 'Generando...' : 'Generar y descargar PDF'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
