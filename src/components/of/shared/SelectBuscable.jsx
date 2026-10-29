import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search } from '../../shared/iconos'

// Combobox con filtro de texto: escribes y filtra la lista de opciones.
// opciones: array de strings. value/onChange: string seleccionado.
export default function SelectBuscable({ opciones, value, onChange, placeholder = 'Buscar...', disabled }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState(value || '')
  const ref = useRef(null)

  useEffect(() => { if (!abierto) setTexto(value || '') }, [value, abierto])

  useEffect(() => {
    function alHacerClicFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setAbierto(false)
        setTexto(value || '')
      }
    }
    document.addEventListener('mousedown', alHacerClicFuera)
    return () => document.removeEventListener('mousedown', alHacerClicFuera)
  }, [value])

  const filtradas = opciones.filter(o => o.toLowerCase().includes(texto.toLowerCase()))

  function seleccionar(op) {
    onChange(op)
    setTexto(op)
    setAbierto(false)
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio pointer-events-none" />
        <input
          disabled={disabled}
          value={texto}
          onChange={e => { setTexto(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          placeholder={placeholder}
          className="w-full border border-feisen-borde rounded-lg pl-9 pr-8 py-2 text-sm text-feisen-texto placeholder:text-feisen-gris-medio bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul/25 focus:border-feisen-azul disabled:opacity-60"
        />
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio pointer-events-none" />
      </div>
      {abierto && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-feisen-borde rounded-lg shadow-lg">
          {filtradas.length === 0 && (
            <p className="px-3 py-2 text-sm text-feisen-gris-medio">Sin resultados para "{texto}"</p>
          )}
          {filtradas.slice(0, 200).map(op => (
            <button
              key={op}
              type="button"
              onClick={() => seleccionar(op)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-feisen-gris transition-colors ${op === value ? 'bg-blue-50 text-feisen-azul font-medium' : 'text-feisen-gris-oscuro'}`}
            >
              {op}
            </button>
          ))}
          {filtradas.length > 200 && (
            <p className="px-3 py-2 text-xs text-feisen-gris-medio italic">Sigue escribiendo para acotar la búsqueda ({filtradas.length} resultados)...</p>
          )}
        </div>
      )}
    </div>
  )
}
