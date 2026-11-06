// Nombres de piezas y procesos en el árbol de costeo: vienen en MAYÚSCULAS desde el catálogo
// ("FONDO MEZCLADORA 1 1/2"). En pantalla se muestran en tipo título y, si la pieza termina con el
// nombre de la máquina, sin esa parte ("Fondo"): ya se sabe por contexto. El nombre completo se
// sigue mostrando en el panel y en el tooltip.
const ACENTOS = { lamina: 'lámina', electrostatica: 'electrostática', camara: 'cámara', basculante: 'basculante' }
const SIGLAS = new Set(['MIG', 'TIG', 'HP', 'CNC', 'CR', 'HR', 'OF'])
const MENORES = new Set(['de', 'del', 'y', 'x', 'con', 'en', 'la', 'el', 'a', 'para', 'por'])

export function tipoTitulo(s) {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      if (SIGLAS.has(w.toUpperCase())) return w.toUpperCase()
      if (/\d/.test(w)) return w // medidas y referencias (1/8, 120X600, 350L) se dejan como vienen
      let l = w.toLowerCase()
      l = ACENTOS[l] || l
      if (i > 0 && MENORES.has(l)) return l
      return l.charAt(0).toUpperCase() + l.slice(1)
    })
    .join(' ')
}

export function nombreCorto(nombre, nombreRaiz) {
  let n = String(nombre || '').trim()
  const raiz = String(nombreRaiz || '').trim().toUpperCase()
  if (raiz && n.toUpperCase() !== raiz && n.toUpperCase().endsWith(' ' + raiz)) n = n.slice(0, -(raiz.length + 1))
  return tipoTitulo(n)
}
