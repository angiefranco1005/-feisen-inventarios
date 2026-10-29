import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from './shared/Modal'
import Alerta from './shared/Alerta'
import { formatoOF, formatFecha, pendienteProducir } from './shared/formatters'

export default function ModalFabricacion({ orden, items, itemInicialId, onCerrar, onGuardado }) {
  const { perfil, esJefeArea, esAdmin } = useAuth()
  const [itemId, setItemId] = useState(itemInicialId)
  const [cantidad, setCantidad] = useState('')
  const [fecha, setFecha] = useState(new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' }))
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const itemRef = items.find(i => i.id === itemId)

  async function confirmar(e) {
    e.preventDefault()
    if (!itemRef) return
    const restante = pendienteProducir(itemRef)
    const cant = Number(cantidad)
    if (!cant || cant <= 0) { setMsg({ tipo: 'error', texto: 'Ingresa una cantidad válida.' }); return }
    if (restante <= 0) { setMsg({ tipo: 'error', texto: 'Este producto ya está fabricado en su totalidad.' }); return }
    // Antes se recortaba en silencio a lo pendiente (escribías 10 y se guardaban 5 sin avisar)
    if (cant > restante) { setMsg({ tipo: 'error', texto: `Solo faltan ${restante} unidades por fabricar de este producto.` }); return }
    setGuardando(true)
    const { error } = await supabase.from('of_producciones').insert({
      item_id: itemRef.id, fecha, cantidad: cant, registrado_por: perfil.id
    })
    setGuardando(false)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message }); return }
    onGuardado()
  }

  return (
    <Modal titulo="Registrar fabricación" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm font-semibold text-feisen-gris-oscuro">{formatoOF(orden.numero)}{!esJefeArea && ` — ${orden.cliente}`}</p>
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
        <form onSubmit={confirmar} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Producto</label>
            <select value={itemId} onChange={e => setItemId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
              {items.map(it => (
                <option key={it.id} value={it.id}>
                  {it.producto} ({it.color}) — pendiente por fabricar {pendienteProducir(it)}/{it.cantidad}
                </option>
              ))}
            </select>
          </div>
          {itemRef && (
            <>
              <p className="text-xs text-feisen-gris-medio">Pendiente por fabricar: {pendienteProducir(itemRef)} de {itemRef.cantidad} unidades.</p>
              {itemRef.producciones?.length > 0 && (
                <div className="text-xs text-feisen-gris-medio bg-feisen-gris rounded-xl p-3 space-y-0.5">
                  <p className="font-semibold text-feisen-gris-oscuro">Fabricación registrada de este producto:</p>
                  {itemRef.producciones.map(pr => (
                    <p key={pr.id} className={pr.tipo === 'reversion' ? 'text-feisen-rojo' : ''}>
                      {pr.tipo === 'reversion' ? `− ${pr.cantidad} uds (reversión)` : `+ ${pr.cantidad} uds`}
                      {' '}({formatFecha(pr.fecha)}){pr.motivo ? ' — ' + pr.motivo : ''}
                      {esAdmin && <span className="italic"> — registrado por: {pr.registrado_por_perfil?.nombre || '—'}</span>}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
          <div>
            <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Cantidad fabricada hoy *</label>
            <input type="number" min={1} value={cantidad} onChange={e => setCantidad(e.target.value)} required
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
          <div>
            <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Fecha de fabricación</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
          <button type="submit" disabled={guardando}
            className="w-full bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
            {guardando ? 'Guardando...' : 'Confirmar fabricación'}
          </button>
        </form>
      </div>
    </Modal>
  )
}
