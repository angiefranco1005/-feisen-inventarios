import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { coincideBusqueda } from '../../utils/busqueda'
import { Check, Plus, Search, X } from '../shared/iconos'

// Elegir quién mecanizó, de los colaboradores activos del área Mecanizados (se pueden
// marcar varios: trabajo en pareja). Si la persona no está en la lista (contratista,
// alguien nuevo), se puede agregar escrita a mano.
// La lista viene de la función `operarios_mecanizado()` (solo nombre, apellidos y área, y solo del área Mecanizados;
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
        className="w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
    )
  }
  if (empleados === null) return <p className="text-sm text-feisen-texto-2 py-3">Cargando colaboradores…</p>

  const delArea = empleados.filter(e => e.deMecanizados)
  const otros = busqueda.trim()
    ? empleados.filter(e => !e.deMecanizados && coincideBusqueda(`${e.nombres} ${e.apellidos}`, busqueda)).slice(0, 6)
    : []
  const extra = value.filter(o => !delArea.some(e => e.id === o.clave))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {delArea.map(e => {
          const on = elegido(e.id)
          return (
            <button key={e.id} type="button" onClick={() => alternar(e)} aria-pressed={on}
              className={`flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-lg border text-sm font-medium transition-colors active:scale-[.98] ${on ? 'bg-feisen-azul border-feisen-azul text-white' : 'bg-white border-feisen-borde text-feisen-texto hover:bg-feisen-fondo'}`}>
              {on && <Check size={16} />}{e.nombre}
            </button>
          )
        })}
      </div>

      {extra.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {extra.map(o => (
            <span key={o.clave} className="flex items-center gap-1.5 min-h-[44px] pl-3.5 pr-1.5 rounded-lg bg-feisen-azul text-white text-sm font-medium">
              {o.nombre}{o.clave.startsWith('txt:') && <span className="text-xs opacity-75">(no está en la lista)</span>}
              <button type="button" onClick={() => quitar(o.clave)} aria-label={`Quitar a ${o.nombre}`} className="p-1 rounded-lg hover:bg-white/15"><X size={16} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="¿Alguien que no está en la lista? Escribe su nombre"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); otros.length === 1 ? (alternar(otros[0]), setBusqueda('')) : agregarTexto() } }}
          className="w-full border border-feisen-borde rounded-lg pl-10 pr-3 py-2.5 bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
      </div>
      {busqueda.trim() && (
        <div className="border border-feisen-borde rounded-lg divide-y divide-feisen-borde-suave overflow-hidden">
          {otros.map(e => (
            <button key={e.id} type="button" onClick={() => { alternar(e); setBusqueda('') }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 min-h-[44px] text-left bg-white hover:bg-feisen-fondo">
              <span className="text-sm text-feisen-texto">{e.nombre}</span>
              <span className="text-xs text-gray-400">{e.area}</span>
            </button>
          ))}
          <button type="button" onClick={agregarTexto} className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-left text-sm text-feisen-azul font-medium bg-white hover:bg-feisen-fondo">
            <Plus size={16} /> Agregar «{capitalizar(busqueda.trim())}» (no está en la lista)
          </button>
        </div>
      )}
    </div>
  )
}
