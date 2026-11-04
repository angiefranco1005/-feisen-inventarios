import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from './shared/Modal'
import Alerta from './shared/Alerta'
import { formatoOF, formatFecha } from './shared/formatters'
import { serialesDeItemOF } from '../ensamble/planillasDatos'

export default function ModalReversarEntrega({ orden, items, itemInicialId, onCerrar, onGuardado }) {
  const { perfil } = useAuth()
  const disponibles = items.filter(it => it.entregado > 0)
  const [itemId, setItemId] = useState(itemInicialId && disponibles.some(i => i.id === itemInicialId) ? itemInicialId : disponibles[0]?.id)
  const [cantidad, setCantidad] = useState('')
  const [fecha, setFecha] = useState(new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' }))
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const itemRef = disponibles.find(i => i.id === itemId)
  // Máquinas numeradas despachadas en esta línea: las que vuelven quedan otra vez en planta
  const [maquinas, setMaquinas] = useState([])
  const [liberar, setLiberar] = useState([])
  useEffect(() => {
    setLiberar([])
    if (itemId) serialesDeItemOF(itemId).then(setMaquinas).catch(() => setMaquinas([]))
  }, [itemId])

  async function confirmar(e) {
    e.preventDefault()
    if (!itemRef) return
    const maxReversar = itemRef.entregado
    const cant = Number(cantidad)
    if (!cant || cant <= 0) { setMsg({ tipo: 'error', texto: 'Ingresa una cantidad válida.' }); return }
    if (cant > maxReversar) { setMsg({ tipo: 'error', texto: `Solo puedes reversar hasta ${maxReversar} unidades (lo que hay registrado como despachado).` }); return }
    if (!motivo.trim()) { setMsg({ tipo: 'error', texto: 'Escribe el motivo de la reversión.' }); return }
    if (liberar.length > cant) { setMsg({ tipo: 'error', texto: `Escogiste ${liberar.length} máquinas y reversas ${cant} unidades.` }); return }
    setGuardando(true)
    const { error } = await supabase.from('of_entregas').insert({
      item_id: itemRef.id, fecha, cantidad: cant, tipo: 'reversion', motivo: motivo.trim(), registrado_por: perfil.id
    })
    if (error) { setGuardando(false); setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message }); return }
    if (liberar.length) {
      const { error: errSer } = await supabase.rpc('liberar_seriales', { p_seriales: liberar })
      if (errSer) { setGuardando(false); setMsg({ tipo: 'error', texto: `La reversión quedó registrada, pero las máquinas siguen como despachadas: ${errSer.message}` }); return }
    }
    setGuardando(false)
    onGuardado()
  }

  return (
    <Modal titulo="Reversar despacho" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm font-semibold text-feisen-gris-oscuro">{formatoOF(orden.numero)} — {orden.cliente}</p>
        <Alerta tipo="alerta" mensaje="Usa esto cuando se registró por error que un producto ya fue despachado, sin que realmente haya salido. Baja el despachado registrado, sin borrar el histórico." />
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
        {disponibles.length === 0 ? (
          <Alerta tipo="alerta" mensaje="Ningún producto de esta OF tiene unidades despachadas registradas." />
        ) : (
          <form onSubmit={confirmar} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Producto</label>
              <select value={itemId} onChange={e => setItemId(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
                {disponibles.map(it => (
                  <option key={it.id} value={it.id}>
                    {it.producto} ({it.color}) — despachado {it.entregado}
                  </option>
                ))}
              </select>
            </div>
            {itemRef && (
              <>
                <p className="text-xs text-feisen-gris-medio">
                  Fabricado: {itemRef.producido}/{itemRef.cantidad} · Despachado: {itemRef.entregado} · Máximo reversable: {itemRef.entregado}
                </p>
                {itemRef.entregas?.length > 0 && (
                  <div className="text-xs text-feisen-gris-medio bg-feisen-gris rounded-xl p-3 space-y-0.5">
                    <p className="font-semibold text-feisen-gris-oscuro">Historial de despachos de este producto:</p>
                    {itemRef.entregas.map(e => (
                      <p key={e.id} className={e.tipo === 'reversion' ? 'text-feisen-rojo' : ''}>
                        {e.tipo === 'reversion' ? `− ${e.cantidad} uds (reversión)` : `+ ${e.cantidad} uds${e.orden_despacho ? ' — OD: ' + e.orden_despacho : ''}`}
                        {' '}({formatFecha(e.fecha)}){e.motivo ? ' — ' + e.motivo : ''}
                        <span className="italic"> — registrado por: {e.registrado_por_perfil?.nombre || '—'}</span>
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Cantidad a reversar *</label>
              <input type="number" min={1} value={cantidad} onChange={e => setCantidad(e.target.value)} required
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Motivo *</label>
              <textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} required
                placeholder="Ej: Se marcó despachado por error, el producto sigue en bodega"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            {maquinas.length > 0 && (
              <div>
                <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Máquinas que vuelven a planta</label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {maquinas.map(m => (
                    <label key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm min-h-[44px]">
                      <input type="checkbox" checked={liberar.includes(m.id)} className="w-4 h-4 accent-feisen-azul"
                        onChange={() => setLiberar(ls => (ls.includes(m.id) ? ls.filter(x => x !== m.id) : [...ls, m.id]))} />
                      <span className="font-mono font-semibold w-16 shrink-0">{m.serial}</span>
                      <span className="text-feisen-gris-medio truncate">{m.modelo}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button type="submit" disabled={guardando}
              className="w-full bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
              {guardando ? 'Guardando...' : 'Confirmar reversión'}
            </button>
          </form>
        )}
      </div>
    </Modal>
  )
}
