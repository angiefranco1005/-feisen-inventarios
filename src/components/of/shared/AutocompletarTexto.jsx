import { useEffect, useRef, useState } from 'react'
import { Search } from '../../shared/iconos'

// Input de texto libre con sugerencias filtradas (autocompletar).
// A diferencia de SelectBuscable, aquí SÍ se puede escribir un valor nuevo
// que no esté en la lista de sugerencias (ej: un cliente nuevo).
export default function AutocompletarTexto({ opciones, value, onChange, placeholder = 'Buscar o escribir nuevo...' }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function alHacerClicFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', alHacerClicFuera)
    return () => document.removeEventListener('mousedown', alHacerClicFuera)
  }, [])

  const texto = value || ''
  const filtradas = texto
    ? opciones.filter(o => o.toLowerCase().includes(texto.toLowerCase()) && o.toLowerCase() !== texto.toLowerCase())
    : opciones

  function seleccionar(op) {
    onChange(op)
    setAbierto(false)
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio pointer-events-none" />
        <input
          value={texto}
          onChange={e => { onChange(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          placeholder={placeholder}
          className="w-full border border-feisen-borde rounded-lg pl-9 pr-4 py-2 text-sm text-feisen-texto placeholder:text-feisen-gris-medio focus:outline-none focus:ring-2 focus:ring-feisen-azul/25 focus:border-feisen-azul"
        />
      </div>
      {abierto && filtradas.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-feisen-borde rounded-lg shadow-lg">
          {filtradas.slice(0, 100).map(op => (
            <button
              key={op}
              type="button"
              onClick={() => seleccionar(op)}
              className="w-full text-left px-3 py-2 text-sm text-feisen-gris-oscuro hover:bg-feisen-gris transition-colors"
            >
              {op}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
