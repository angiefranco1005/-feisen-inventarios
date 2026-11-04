import { useState } from 'react'
import { supabase } from '../../lib/supabase'

// Proveedor de una orden de compra: uno ya guardado o uno nuevo creado ahí mismo.
// Lo usan la OC de un pedido (ModalGenerarOC) y la de varios pedidos (ModalOCVariosPedidos).
export function useProveedorOC() {
  const [proveedorId, setProveedorId] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [np, setNp] = useState({ nombre: '', nit: '', contacto: '', telefono: '' })
  return { proveedorId, setProveedorId, nuevo, setNuevo, np, setNp }
}

// Mensaje de error si falta el proveedor, o null si está bien
export function faltaProveedor(estado) {
  if (!estado.nuevo && !estado.proveedorId) return 'Selecciona un proveedor o agrega uno nuevo.'
  if (estado.nuevo && !estado.np.nombre.trim()) return 'Escribe el nombre del proveedor nuevo.'
  return null
}

// Devuelve la fila del proveedor (creándolo si es nuevo). Lanza el error de la base si falla.
export async function resolverProveedor(estado, proveedores) {
  if (!estado.nuevo) return proveedores.find(p => p.id === estado.proveedorId) || null
  const { np } = estado
  const { data, error } = await supabase.from('proveedores').insert({
    nombre: np.nombre.trim(), nit: np.nit.trim() || null,
    contacto: np.contacto.trim() || null, telefono: np.telefono.trim() || null,
  }).select().single()
  if (error) throw error
  return data
}

export default function SelectorProveedorOC({ estado, proveedores }) {
  const { proveedorId, setProveedorId, nuevo, setNuevo, np, setNp } = estado
  const campo = k => e => setNp(prev => ({ ...prev, [k]: e.target.value }))
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-2">Proveedor</p>
      {!nuevo ? (
        <div className="space-y-2">
          <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}
            className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm bg-white">
            <option value="">Selecciona un proveedor...</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button type="button" onClick={() => setNuevo(true)}
            className="text-xs text-feisen-azul font-medium">+ Agregar proveedor nuevo</button>
        </div>
      ) : (
        <div className="space-y-2">
          <input placeholder="Nombre del proveedor *" value={np.nombre} onChange={campo('nombre')}
            className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm" />
          <div className="flex gap-2">
            <input placeholder="NIT" value={np.nit} onChange={campo('nit')}
              className="flex-1 min-w-0 border border-feisen-borde rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="Teléfono" value={np.telefono} onChange={campo('telefono')}
              className="flex-1 min-w-0 border border-feisen-borde rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <input placeholder="Contacto" value={np.contacto} onChange={campo('contacto')}
            className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm" />
          <button type="button" onClick={() => setNuevo(false)}
            className="text-xs text-gray-500 font-medium">Usar un proveedor ya guardado</button>
        </div>
      )}
    </div>
  )
}
