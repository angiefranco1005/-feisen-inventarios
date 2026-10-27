// Búsqueda tolerante para listas de productos: el usuario escribe palabras sueltas
// del nombre, en cualquier orden, con o sin tildes ("polea 8" encuentra "POLEA 8 X 2B").
// Así no necesita saber la categoría para encontrar un producto.
export const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function coincideBusqueda(texto, consulta) {
  const palabras = sinTildes(consulta).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const base = sinTildes(texto)
  return palabras.every(p => base.includes(p))
}
