import { useState } from 'react'
import { supabase } from '../../lib/supabase'

// Proveedor de una orden de compra: uno ya guardado o uno nuevo creado ahí mismo.
// Lo usan la OC de un pedido (ModalGenerarOC) y la de varios pedidos (ModalOCVariosPedidos).
export function useProveedorOC() {
  const [proveedorId, setProveedorId] = useState('')
  const [texto, setTexto] = useState('')   // lo que se escribe en el buscador
  const [nuevo, setNuevo] = useState(false)
  const [np, setNp] = useState({ nombre: '', nit: '', contacto: '', telefono: '' })
  return { proveedorId, setProveedorId, texto, setTexto, nuevo, setNuevo, np, setNp }
}

// Mensaje de error si falta el proveedor, o null si está bien
export function faltaProveedor(estado) {
  if (!estado.nuevo && !estado.proveedorId) {
    return estado.texto.trim()
      ? `"${estado.texto.trim()}" no está guardado: elígelo de las opciones o agrégalo como proveedor nuevo.`
      : 'Escribe el nombre del proveedor.'
  }
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

const normalizar = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

// Se escribe el nombre (o el NIT) y salen los proveedores que coinciden, en vez de buscarlo
// en una lista desplegable con todos (pedido de Angie, 4/11/2026). Si no existe, se agrega ahí mismo.
export default function SelectorProveedorOC({ estado, proveedores }) {
  const { proveedorId, setProveedorId, texto, setTexto, nuevo, setNuevo, np, setNp } = estado
  const [abierto, setAbierto] = useState(false)
  const campo = k => e => setNp(prev => ({ ...prev, [k]: e.target.value }))

  const q = normalizar(texto)
  const coincidencias = q
    ? proveedores.filter(p => normalizar(p.nombre).includes(q) || normalizar(p.nit).includes(q))
        .sort((a, b) => normalizar(a.nombre).startsWith(q) === normalizar(b.nombre).startsWith(q) ? a.nombre.localeCompare(b.nombre) : normalizar(a.nombre).startsWith(q) ? -1 : 1)
        .slice(0, 8)
    : []
  const exacto = proveedores.find(p => normalizar(p.nombre) === q)
  const elegido = proveedores.find(p => p.id === proveedorId)

  function escribir(v) {
    setTexto(v)
    const igual = proveedores.find(p => normalizar(p.nombre) === normalizar(v))
    setProveedorId(igual ? igual.id : '')
    setAbierto(true)
  }
  function elegir(p) { setProveedorId(p.id); setTexto(p.nombre); setAbierto(false) }
  function agregarNuevo() { setNp(prev => ({ ...prev, nombre: texto.trim() })); setNuevo(true); setAbierto(false) }

  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-2">Proveedor</p>
      {!nuevo ? (
        <div className="relative">
          <input value={texto} onChange={e => escribir(e.target.value)}
            onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
            placeholder="Escribe el nombre o el NIT del proveedor…" autoComplete="off"
            className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul ${elegido ? 'border-feisen-azul bg-blue-50/40' : 'border-feisen-borde'}`} />
          {elegido && <p className="text-xs text-emerald-700 mt-1">✓ {elegido.nombre}{elegido.nit ? ` · NIT ${elegido.nit}` : ''}</p>}
          {abierto && q && !(elegido && normalizar(elegido.nombre) === q) && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-feisen-borde rounded-xl shadow-lg overflow-hidden">
              {coincidencias.map(p => (
                <button key={p.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => elegir(p)}
                  className="block w-full text-left px-3 py-2.5 text-sm hover:bg-feisen-fondo border-b border-feisen-borde-suave last:border-b-0">
                  <span className="text-feisen-texto">{p.nombre}</span>
                  {p.nit && <span className="text-xs text-gray-400"> · NIT {p.nit}</span>}
                </button>
              ))}
              {coincidencias.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Ningún proveedor guardado coincide.</p>}
              {!exacto && (
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={agregarNuevo}
                  className="block w-full text-left px-3 py-2.5 text-sm font-medium text-feisen-azul hover:bg-feisen-azul-suave border-t border-feisen-borde">
                  + Agregar «{texto.trim()}» como proveedor nuevo
                </button>
              )}
            </div>
          )}
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
            className="text-xs text-gray-500 font-medium">Buscar un proveedor ya guardado</button>
        </div>
      )}
    </div>
  )
}
