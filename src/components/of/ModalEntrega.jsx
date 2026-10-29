import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from './shared/Modal'
import Alerta from './shared/Alerta'
import { formatoOF, formatFecha, disponibleDespacho, estadoTexto } from './shared/formatters'

export default function ModalEntrega({ orden, items, itemInicialId, onCerrar, onGuardado }) {
  const { perfil } = useAuth()
  const [itemId, setItemId] = useState(itemInicialId)
  const [ordenDespacho, setOrdenDespacho] = useState('')
  const [referencia, setReferencia] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [fecha, setFecha] = useState(new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' }))
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const disponibles = items.filter(it => disponibleDespacho(it) > 0)
  const itemRef = disponibles.find(i => i.id === itemId)

  async function confirmar(e) {
    e.preventDefault()
    if (!itemRef) return
    if (!ordenDespacho.trim()) { setMsg({ tipo: 'error', texto: 'Ingresa el número de orden de despacho.' }); return }
    const restante = disponibleDespacho(itemRef)
    const cant = Number(cantidad)
    if (!cant || cant <= 0) { setMsg({ tipo: 'error', texto: 'Ingresa una cantidad válida.' }); return }
    if (restante <= 0) { setMsg({ tipo: 'error', texto: 'Este producto no tiene unidades fabricadas disponibles para despachar.' }); return }
    // Antes se recortaba en silencio a lo disponible (escribías 10 y se guardaban 5 sin avisar)
    if (cant > restante) { setMsg({ tipo: 'error', texto: `Solo hay ${restante} unidades fabricadas disponibles para despachar de este producto.` }); return }
    setGuardando(true)
    const { error } = await supabase.from('of_entregas').insert({
      item_id: itemRef.id, fecha, cantidad: cant, orden_despacho: ordenDespacho.trim(),
      referencia: referencia.trim() || null, registrado_por: perfil.id
    })
    setGuardando(false)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message }); return }
    onGuardado()
  }

  return (
    <Modal titulo="Registrar entrega" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm font-semibold text-feisen-gris-oscuro">{formatoOF(orden.numero)} — {orden.cliente}</p>
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
        {disponibles.length === 0 ? (
          <Alerta tipo="alerta" mensaje="Ningún producto de esta OF tiene unidades fabricadas disponibles para despachar todavía." />
        ) : (
          <form onSubmit={confirmar} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Producto</label>
              <select value={itemId} onChange={e => setItemId(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
                {disponibles.map(it => (
                  <option key={it.id} value={it.id}>
                    {it.producto} ({it.color}) — {estadoTexto(it)} — disponible {disponibleDespacho(it)} (fabricado {it.producido}/{it.cantidad})
                  </option>
                ))}
              </select>
            </div>
            {itemRef && (
              <>
                <p className="text-xs text-feisen-gris-medio">
                  Disponible para despachar: {disponibleDespacho(itemRef)} unidades (fabricadas {itemRef.producido}/{itemRef.cantidad}, ya despachadas {itemRef.entregado}).
                </p>
                {itemRef.entregas?.length > 0 && (
                  <div className="text-xs text-feisen-gris-medio bg-feisen-gris rounded-xl p-3 space-y-0.5">
                    <p className="font-semibold text-feisen-gris-oscuro">Entregas previas de este producto:</p>
                    {itemRef.entregas.map(e => (
                      <p key={e.id} className={e.tipo === 'reversion' ? 'text-feisen-rojo' : ''}>
                        {e.tipo === 'reversion' ? `− ${e.cantidad} uds (reversión)` : `${e.orden_despacho || 'sin OD'}: ${e.cantidad} uds`}
                        {' '}({formatFecha(e.fecha)}){e.referencia ? ' — Referencia: ' + e.referencia : ''}{e.motivo ? ' — ' + e.motivo : ''}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Orden de despacho *</label>
              <input value={ordenDespacho} onChange={e => setOrdenDespacho(e.target.value)} placeholder="Ej: OD-0456" required
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Referencia (opcional)</label>
              <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ej: seriales de las máquinas despachadas"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Cantidad entregada hoy *</label>
              <input type="number" min={1} value={cantidad} onChange={e => setCantidad(e.target.value)} required
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Fecha de entrega</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <button type="submit" disabled={guardando}
              className="w-full bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
              {guardando ? 'Guardando...' : 'Confirmar entrega'}
            </button>
          </form>
        )}
      </div>
    </Modal>
  )
}
