import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { exportarOrdenCompraPDF, calcularTotalesOC, IVA_TARIFA } from '../../utils/exportOrdenCompraPDF'
import { FileDown, Loader2, Search } from '../shared/iconos'
import { siguienteNumero } from '../../utils/siguienteNumero'
import FechaLlegada from './FechaLlegada'
import SelectorProveedorOC, { useProveedorOC, faltaProveedor, resolverProveedor } from './SelectorProveedorOC'

const fmtCOP = n => '$' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ESTADO = { pendiente: 'Por comprar', en_transito: 'En camino', parcialmente_recibido: 'Llegó una parte' }
const normalizar = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Una sola OC para un proveedor con productos de varios pedidos (pedido de Angie, 4/11/2026).
// Cada línea de la OC apunta a su línea de pedido (orden_compra_items.pedido_item_id), así que
// la cobertura y el "falta comprar" de cada pedido siguen funcionando igual. Si la OC queda
// con un solo pedido se guarda como una OC normal (ordenes_compra.pedido_id); si junta
// varios, pedido_id queda vacío y los pedidos se sacan de sus líneas.
//
// `pedidos`: los que tienen algo por comprar (ListaPedidos ya los filtró).
export default function ModalOCVariosPedidos({ pedidos, coberturaPorItem, onCerrar, onGuardado }) {
  const { perfil } = useAuth()
  const prov = useProveedorOC()

  const [proveedores,   setProveedores]   = useState([])
  const [lineas,        setLineas]        = useState([])   // { it, pedido, falta }
  const [seleccion,     setSeleccion]     = useState({})   // pedido_item_id -> { incluir, cantidad, precio }
  const [busqueda,      setBusqueda]      = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [fechaLlegada,  setFechaLlegada]  = useState('')
  const [cargando,      setCargando]      = useState(true)
  const [guardando,     setGuardando]     = useState(false)
  const [msg,           setMsg]           = useState(null)

  useEffect(() => {
    async function cargar() {
      // pedido_items frescos de la base (no los de la lista en memoria): si un pedido se
      // editó, sus líneas tienen ids nuevos y el INSERT de la OC fallaría (ver ModalGenerarOC).
      const ids = pedidos.map(p => p.id)
      const { data: itemsFrescos } = ids.length
        ? await supabase.from('pedido_items').select('*').in('pedido_id', ids)
        : { data: [] }
      const porId = Object.fromEntries(pedidos.map(p => [p.id, p]))
      const ls = (itemsFrescos || [])
        .map(it => ({
          it, pedido: porId[it.pedido_id],
          falta: Number((it.cantidad - Math.max((coberturaPorItem[it.id] || 0) + (it.cantidad_compra_directa || 0), it.cantidad_recibida || 0)).toFixed(3)),
        }))
        .filter(l => l.pedido && l.falta > 0)
        .sort((a, b) => a.pedido.numero.localeCompare(b.pedido.numero) || a.it.descripcion.localeCompare(b.it.descripcion))
      setLineas(ls)

      const itemIds = [...new Set(ls.map(l => l.it.item_id).filter(Boolean))]
      const [{ data: provs }, { data: itemsData }] = await Promise.all([
        supabase.from('proveedores').select('id, nombre, nit, contacto, telefono, direccion').eq('activo', true).order('nombre'),
        itemIds.length ? supabase.from('items').select('id, precio_costo').in('id', itemIds) : Promise.resolve({ data: [] }),
      ])
      setProveedores(provs || [])
      const precio = Object.fromEntries((itemsData || []).map(i => [i.id, i.precio_costo || 0]))
      setSeleccion(Object.fromEntries(ls.map(l => [l.it.id, { incluir: false, cantidad: l.falta, precio: precio[l.it.item_id] || 0 }])))
      setCargando(false)
    }
    cargar()
    // Solo al abrir: la lista recalcula `coberturaPorItem` en cada render y volver a cargar
    // aquí borraría lo que ya se marcó.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const actualizar = (id, campo, valor) => setSeleccion(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }))

  const incluidas = useMemo(() => lineas.filter(l => seleccion[l.it.id]?.incluir), [lineas, seleccion])
  const pedidosIncluidos = useMemo(() => {
    const m = new Map()
    incluidas.forEach(l => m.set(l.pedido.id, l.pedido))
    return [...m.values()].sort((a, b) => a.numero.localeCompare(b.numero))
  }, [incluidas])
  const totales = useMemo(() => calcularTotalesOC(
    incluidas.reduce((s, l) => s + (parseFloat(seleccion[l.it.id]?.cantidad) || 0) * (parseFloat(seleccion[l.it.id]?.precio) || 0), 0)
  ), [incluidas, seleccion])

  // Agrupadas por pedido; la búsqueda filtra por producto, N° de pedido o quién lo pidió.
  // Lo ya marcado se sigue mostrando aunque no coincida, para no perderlo de vista.
  const grupos = useMemo(() => {
    const q = normalizar(busqueda.trim())
    const g = new Map()
    for (const l of lineas) {
      const coincide = !q || seleccion[l.it.id]?.incluir
        || normalizar(l.it.descripcion).includes(q) || normalizar(l.pedido.numero).includes(q)
        || normalizar(l.pedido.profiles?.nombre || l.pedido.solicitante_nombre).includes(q)
      if (!coincide) continue
      if (!g.has(l.pedido.id)) g.set(l.pedido.id, { pedido: l.pedido, lineas: [] })
      g.get(l.pedido.id).lineas.push(l)
    }
    return [...g.values()]
  }, [lineas, busqueda, seleccion])

  async function guardar() {
    setMsg(null)
    if (incluidas.length === 0) { setMsg({ tipo: 'error', texto: 'Marca al menos un producto para la orden.' }); return }
    const errProv = faltaProveedor(prov)
    if (errProv) { setMsg({ tipo: 'error', texto: errProv }); return }
    for (const l of incluidas) {
      const cant = parseFloat(seleccion[l.it.id]?.cantidad)
      if (!cant || cant <= 0) { setMsg({ tipo: 'error', texto: `Cantidad inválida para "${l.it.descripcion}" (${l.pedido.numero}).` }); return }
      if (cant > l.falta + 0.001) { setMsg({ tipo: 'error', texto: `"${l.it.descripcion}" (${l.pedido.numero}): solo faltan ${l.falta} ${l.it.unidad} por comprar.` }); return }
    }

    setGuardando(true)
    try {
      const provInfo = await resolverProveedor(prov, proveedores)
      const numero = await siguienteNumero('ordenes_compra', 'OC')
      const { data: orden, error: eOrden } = await supabase.from('ordenes_compra').insert({
        numero, pedido_id: pedidosIncluidos.length === 1 ? pedidosIncluidos[0].id : null,
        proveedor_id: provInfo?.id,
        fecha: new Date().toISOString().slice(0, 10),
        razon_social: 'Feisen S.A.S.', ciudad: 'Soacha', observaciones: observaciones.trim() || null,
        usuario_id: perfil.id,
      }).select().single()
      if (eOrden) throw eOrden

      const itemsPayload = incluidas.map(l => ({
        orden_compra_id: orden.id,
        pedido_item_id:  l.it.id,
        descripcion:     l.it.descripcion,
        unidad:          l.it.unidad,
        cantidad:        parseFloat(seleccion[l.it.id].cantidad),
        precio_unitario: parseFloat(seleccion[l.it.id].precio) || 0,
      }))
      const { error: eItems } = await supabase.from('orden_compra_items').insert(itemsPayload)
      if (eItems) throw eItems

      const numPed = Object.fromEntries(incluidas.map(l => [l.it.id, l.pedido.numero]))
      const textoPedidos = pedidosIncluidos.map(p => p.numero).join(', ')
      exportarOrdenCompraPDF(orden, provInfo, itemsPayload.map(x => ({ ...x, pedido_numero: numPed[x.pedido_item_id] })),
        { numero: textoPedidos }, perfil?.nombre || '')

      // Cada pedido queda como con una OC normal: suma el número, pasa a "En camino" si
      // estaba por comprar y deja su línea de historial diciendo con qué pedidos se juntó.
      const fallidos = []
      for (const p of pedidosIncluidos) {
        const previas = (p.numero_oc || '').trim()
        const { error } = await supabase.from('pedidos').update({
          numero_oc: previas && !previas.includes(numero) ? `${previas}, ${numero}` : (previas || numero),
          ...(fechaLlegada ? { fecha_estimada_llegada: fechaLlegada } : {}),
          ...(p.estado === 'pendiente' ? { estado: 'en_transito' } : {}),
        }).eq('id', p.id)
        if (error) { fallidos.push(p.numero); continue }
        const otros = pedidosIncluidos.filter(x => x.id !== p.id).map(x => x.numero)
        await supabase.from('pedido_historial').insert({
          pedido_id: p.id, usuario_id: perfil.id,
          accion: p.estado === 'pendiente' ? 'en_transito' : 'oc_generada',
          detalle: `${numero} generada${otros.length ? ` (junto con ${otros.join(', ')})` : ''}${fechaLlegada ? ` · llega ~${fechaLlegada}` : ''}`,
        })
      }
      onGuardado(fallidos.length
        ? { tipo: 'alerta', texto: `${numero} generada, pero ${fallidos.join(', ')} no se actualizó. Márcalo a mano como En camino.` }
        : { tipo: 'exito', texto: `${numero} generada para ${textoPedidos}` })
    } catch (e) {
      setMsg({ tipo: 'error', texto: 'Error al generar la orden: ' + e.message })
      setGuardando(false)
    }
  }

  return (
    <Modal titulo="Orden de compra de varios pedidos" onCerrar={onCerrar}>
      {cargando ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-feisen-azul" size={28} /></div>
      ) : lineas.length === 0 ? (
        <p className="text-sm text-feisen-texto-2 py-6 text-center">No hay pedidos con productos por comprar.</p>
      ) : (
        <div className="space-y-5">
          {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

          <div>
            <p className="text-sm font-semibold text-gray-700">Productos por comprar</p>
            <p className="text-xs text-feisen-texto-2 mb-2">Marca lo que le vas a pedir a este proveedor, de uno o de varios pedidos.</p>
            <div className="relative mb-2.5">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar producto, pedido o quién lo pidió…"
                className="w-full border border-feisen-borde rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            {grupos.length === 0 && <p className="text-sm text-feisen-texto-2 py-3 text-center">Nada coincide con la búsqueda.</p>}
            <div className="space-y-3">
              {grupos.map(({ pedido: p, lineas: ls }) => (
                <div key={p.id} className="border border-feisen-borde rounded-xl overflow-hidden">
                  <div className="bg-feisen-fondo px-3 py-2 text-xs text-feisen-texto-2 flex flex-wrap gap-x-1.5">
                    <span className="font-mono font-semibold text-feisen-texto">{p.numero}</span>
                    <span>· {p.profiles?.nombre || p.solicitante_nombre || '—'}</span>
                    <span>· {ESTADO[p.estado] || p.estado}</span>
                    {p.prioridad === 'urgente' && <span className="text-feisen-rojo font-semibold">· Urgente</span>}
                  </div>
                  <div className="divide-y divide-feisen-borde-suave">
                    {ls.map(({ it, falta }) => {
                      const sel = seleccion[it.id] || {}
                      return (
                        <div key={it.id} className={`p-3 ${sel.incluir ? 'bg-blue-50/40' : ''}`}>
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" className="mt-1 w-4 h-4 accent-feisen-azul"
                              checked={!!sel.incluir} onChange={e => actualizar(it.id, 'incluir', e.target.checked)} />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-medium text-gray-800 break-words">{it.descripcion}</span>
                              <span className="block text-xs text-gray-400">
                                Falta comprar {falta} {it.unidad}{falta !== it.cantidad ? ` de ${it.cantidad}` : ''}
                              </span>
                            </span>
                          </label>
                          {sel.incluir && (
                            <div className="flex gap-2 mt-2 pl-6">
                              <div className="flex-1">
                                <label className="text-xs text-gray-500 block mb-0.5">Cantidad</label>
                                <input type="number" step="0.001" min="0" value={sel.cantidad}
                                  onChange={e => actualizar(it.id, 'cantidad', e.target.value)}
                                  className="w-full border border-feisen-borde rounded-lg px-2.5 py-1.5 text-sm" />
                              </div>
                              <div className="flex-1">
                                <label className="text-xs text-gray-500 block mb-0.5">Precio unitario</label>
                                <input type="number" step="0.01" min="0" value={sel.precio}
                                  onChange={e => actualizar(it.id, 'precio', e.target.value)}
                                  className="w-full border border-feisen-borde rounded-lg px-2.5 py-1.5 text-sm" />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SelectorProveedorOC estado={prov} proveedores={proveedores} />

          <div>
            <FechaLlegada valor={fechaLlegada} onCambiar={setFechaLlegada} />
            <p className="text-xs text-feisen-azul bg-feisen-azul-suave rounded-lg px-3 py-2 mt-2">
              {pedidosIncluidos.length
                ? <>La orden queda en <b>{pedidosIncluidos.map(p => p.numero).join(', ')}</b>. Los que estaban por comprar pasan solos a <b>En camino</b>.</>
                : <>Cada pedido que entre en la orden la verá en su ficha; los que estaban por comprar pasan solos a <b>En camino</b>.</>}
            </p>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-0.5">Observaciones (opcional)</label>
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
              className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm" />
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-4 pb-5 -mb-5 -mx-6 px-6 sticky -bottom-5 bg-white">
            <div className="text-sm text-gray-500 space-y-0.5">
              <p>{incluidas.length} producto{incluidas.length !== 1 ? 's' : ''} · {pedidosIncluidos.length} pedido{pedidosIncluidos.length !== 1 ? 's' : ''}</p>
              <p>IVA ({Math.round(IVA_TARIFA * 100)}%): <span className="text-gray-700">{fmtCOP(totales.iva)}</span></p>
              <p>Total: <strong className="text-feisen-azul text-base">{fmtCOP(totales.total)}</strong></p>
            </div>
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
