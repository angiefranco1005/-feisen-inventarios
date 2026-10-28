import { sinTildes } from '../../../utils/busqueda'

// El operario de cada registro de mecanizado se guarda como texto libre en
// movimientos.motivo ("Mecanizado por: Wilmer y miguel", "Sanches", "Hernendes",
// "Hern  Sanc  Wilm"). Para contar piezas por persona se parte el texto en palabras
// y cada palabra se asocia al colaborador cuyo nombre o apellido más se le parece.
// Las piezas hechas en pareja cuentan para cada participante.
// Ver OBSERVACIONES.md (2026-10-28). Lo ideal es elegir al operario de una lista.

const IGNORAR = new Set(['y', 'por', 'de', 'del', 'la', 'el', 'mecanizado'])

function distancia(a, b) {
  const m = a.length, n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[m][n]
}

const capitalizar = t => t.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())

// ¿La palabra escrita a mano corresponde a esta palabra del nombre del colaborador?
function parecida(token, palabra) {
  if (token.length < 3 || palabra.length < 3) return false
  if (palabra.startsWith(token) && token.length >= 4) return true      // abreviatura: "hern"
  if (token.startsWith(palabra) && palabra.length >= 5) return true    // pegado: "miguelpin", "sanchestubo"
  const L = Math.min(token.length, palabra.length, 9)
  return (Math.abs(token.length - palabra.length) <= 3 || token.length > palabra.length) && distancia(token.slice(0, L), palabra.slice(0, L)) <= (L >= 7 ? 2 : 1)
}

// empleados: [{ id, nombres, apellidos }]
export function crearIdentificador(empleados) {
  const lista = (empleados || []).map(e => {
    const nombres = sinTildes(e.nombres).split(/\s+/).filter(Boolean)
    const apellidos = sinTildes(e.apellidos).split(/\s+/).filter(Boolean)
    const n0 = (e.nombres || '').split(/\s+/), a0 = (e.apellidos || '').split(/\s+/)
    return { id: e.id, nombres, apellidos, n0, a0 }
  })
  // Se muestra con el nombre por el que lo llaman: "Miguel Piraneque" (no "Jose Piraneque")
  const nombreVisible = (e, token) => {
    const i = e.nombres.findIndex(p => parecida(token, p))
    return capitalizar(`${e.n0[i >= 0 ? i : 0] || ''} ${e.a0[0] || ''}`.trim())
  }

  // Devuelve las personas (únicas) mencionadas en un motivo
  return function personasDe(motivo) {
    const texto = sinTildes(motivo).replace(/^.*?por\s*:?/, ' ')
    const tokens = texto.split(/[^a-z]+/).filter(t => t && !IGNORAR.has(t) && t.length >= 3)
    const encontradas = new Map()
    for (const t of tokens) {
      const emp = lista.find(e => [...e.nombres, ...e.apellidos].some(p => parecida(t, p)))
      const clave = emp ? emp.id : `txt:${t}`
      if (!encontradas.has(clave)) encontradas.set(clave, emp ? nombreVisible(emp, t) : capitalizar(t))
    }
    return [...encontradas.entries()].map(([clave, nombre]) => ({ clave, nombre }))
  }
}
