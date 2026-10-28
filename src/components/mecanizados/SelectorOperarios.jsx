import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { coincideBusqueda } from '../../utils/busqueda'
import { Check, Plus, Search, X } from 'lucide-react'

// Elegir quién mecanizó, de la lista de colaboradores activos (se pueden marcar varios:
// trabajo en pareja). Los del área Mecanizados salen primero como botones; el resto se
// busca por nombre. Si la persona no está en la lista (contratista, alguien nuevo),
// se puede agregar escrita a mano.
// La lista viene de la función `operarios_mecanizado()` (solo nombre, apellidos y área;
// ver supabase/migraciones/2026-10-28_operarios_mecanizado.sql). Si la función no responde,
// queda el campo de texto de antes para no bloquear el registro.

const capitalizar = t => (t || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())
export const nombreOperario = e => capitalizar(`${e.nombres} ${(e.apellidos || '').split(/\s+/)[0]}`)
// "A", "A y B", "A, B y C"
export const unirOperarios = lista => {
  const n = lista.map(o => o.nombre)
  return n.length <= 1 ? (n[0] || '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`
}

export default function SelectorOperarios({ value, onChange }) {
  const [empleados, setEmpleados] = useState(null) // null = cargando
  const [sinLista, setSinLista]   = useState(false)
  const [busqueda, setBusqueda]   = useState('')
  const [texto, setTexto]         = useState('')

  useEffect(() => {
    supabase.rpc('operarios_mecanizado').then(({ data, error }) => {
      if (error || !data?.length) { setSinLista(true); setEmpleados([]); return }
      setEmpleados(data.map(e => ({ ...e, nombre: nombreOperario(e), deMecanizados: /mecaniz/i.test(e.area || '') })))
    })
  }, [])

  // Al guardar, el registro limpia la selección: limpiar también el texto libre
  useEffect(() => { if (!value.length) setTexto('') }, [value])

  const elegido = clave => value.some(o => o.clave === clave)
  const alternar = e => onChange(elegido(e.id) ? value.filter(o => o.clave !== e.id) : [...value, { clave: e.id, nombre: e.nombre }])
  const quitar = clave => onChange(value.filter(o => o.clave !== clave))
  const agregarTexto = () => {
    const t = capitalizar(busqueda.trim())
    if (!t || value.some(o => o.nombre.toLowerCase() === t.toLowerCase())) return
    onChange([...value, { clave: `txt:${t}`, nombre: t }])
    setBusqueda('')
  }

  // Sin acceso a la lista: campo de texto libre, como antes
  if (sinLista) {
    return (
      <input type="text" value={texto} placeholder="Nombre del operario"
        onChange={e => { setTexto(e.target.value); onChange(e.target.value.trim() ? [{ clave: 'txt', nombre: e.target.value.trim() }] : []) }}
        className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500" />
    )
  }
  if (empleados === null) return <p className="text-sm text-gray-400 py-3">Cargando colaboradores…</p>

  const delArea = empleados.filter(e => e.deMecanizados)
  const otros = busqueda.trim()
    ? empleados.filter(e => !e.deMecanizados && coincideBusqueda(`${e.nombres} ${e.apellidos}`, busqueda)).slice(0, 6)
    : []
  const extra = value.filter(o => !delArea.some(e => e.id === o.clave))

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">Toca a quien mecanizó. Si trabajaron en pareja, marca a los dos.</p>
      <div className="flex flex-wrap gap-2">
        {delArea.map(e => {
          const on = elegido(e.id)
          return (
            <button key={e.id} type="button" onClick={() => alternar(e)} aria-pressed={on}
              className={`flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border-2 text-base font-medium transition-colors ${on ? 'bg-feisen-azul border-feisen-azul text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}>
              {on && <Check size={16} />}{e.nombre}
            </button>
          )
        })}
      </div>

      {extra.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {extra.map(o => (
            <span key={o.clave} className="flex items-center gap-1.5 min-h-[40px] pl-4 pr-2 rounded-xl bg-feisen-azul text-white text-base font-medium">
              {o.nombre}{o.clave.startsWith('txt:') && <span className="text-xs opacity-75">(no está en la lista)</span>}
              <button type="button" onClick={() => quitar(o.clave)} aria-label={`Quitar a ${o.nombre}`} className="p-1 rounded-lg hover:bg-white/15"><X size={16} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="¿Otra persona? Escribe su nombre"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); otros.length === 1 ? (alternar(otros[0]), setBusqueda('')) : agregarTexto() } }}
          className="w-full border-2 border-gray-200 rounded-xl pl-12 pr-4 py-3 text-base focus:outline-none focus:border-blue-500" />
      </div>
      {busqueda.trim() && (
        <div className="border-2 border-gray-100 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {otros.map(e => (
            <button key={e.id} type="button" onClick={() => { alternar(e); setBusqueda('') }}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
              <span className="text-base text-gray-800">{e.nombre}</span>
              <span className="text-xs text-gray-400">{e.area}</span>
            </button>
          ))}
          <button type="button" onClick={agregarTexto} className="w-full flex items-center gap-2 px-4 py-3 text-left text-feisen-azul font-medium hover:bg-gray-50">
            <Plus size={16} /> Agregar «{capitalizar(busqueda.trim())}» (no está en la lista)
          </button>
        </div>
      )}
    </div>
  )
}
