// Búsqueda tolerante para listas de productos: el usuario escribe palabras sueltas
// del nombre, en cualquier orden, con o sin tildes ("polea 8" encuentra "POLEA 8 X 2B").
// Así no necesita saber la categoría para encontrar un producto.
export const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function coincideBusqueda(texto, consulta) {
  const palabras = sinTildes(consulta).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const base = sinTildes(texto)
  // Números con o sin ceros a la izquierda: «MOV-EP-130» o «130» encuentran «MOV-EP-0130» (2026-11-27)
  const baseSinCeros = sinCeros(base)
  return palabras.every(p => base.includes(p) || baseSinCeros.includes(sinCeros(p)))
}

const sinCeros = t => t.replace(/(^|\D)0+(?=\d)/g, '$1')
