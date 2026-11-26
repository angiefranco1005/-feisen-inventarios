// Datos de las pantallas "Costeo por pasos" (opción B elegida por Angie el 2026-11-25, estilo Airtable).
// Todo sale del mismo árbol que usa la ficha (cargarArbol con detalle): aquí solo se aplana y se
// decide qué está listo y qué falta en cada paso, con UNA sola regla por paso para que el número de
// la pestaña y la cuadrícula siempre coincidan.

export const PASOS = [
  { id: 'despiece', n: 1, nombre: 'Despiece', ayuda: 'Qué piezas lleva la máquina y cuántas. Es la base de los demás pasos.' },
  { id: 'ruta', n: 2, nombre: 'Hojas de ruta', ayuda: 'Por qué operaciones pasa cada pieza, en orden: en qué máquina, quién la hace y si es interna o externa.' },
  { id: 'materia', n: 3, nombre: 'Materia prima', ayuda: 'Cuánto material consume cada pieza, contando el desperdicio (rendimiento).' },
  { id: 'tiempos', n: 4, nombre: 'Tiempos', ayuda: 'Cuánto tarda cada proceso, medido con cronómetro, y a quién se le tomó.' },
]

// Filas del despiece en orden de árbol: cada enlace (pieza dentro de su contenedor) con su nivel.
// Corta ciclos igual que el árbol (una pieza dentro de sí misma).
export function filasDespiece(arbol) {
  const filas = []
  function ir(fichaId, nivel, enCamino, cantAcum) {
    for (const e of arbol.hijos[fichaId] || []) {
      if (enCamino.has(e.pieza_id)) continue
      const dentro = new Set(enCamino).add(e.pieza_id)
      const hijos = (arbol.hijos[e.pieza_id] || []).filter((h) => !dentro.has(h.pieza_id))
      const procesos = arbol.procesos[e.pieza_id] || []
      const cant = Number(e.cantidad || 0)
      filas.push({
        key: e.id,
        enlace: e,
        fichaId: e.pieza_id,
        ficha: arbol.fichas[e.pieza_id],
        nivel,
        cant,
        cantTotal: cantAcum * cant,
        hijos,
        procesos,
        esConjunto: hijos.length > 0,
        resumen: arbol.resumen[e.pieza_id] || {},
      })
      ir(e.pieza_id, nivel + 1, dentro, cantAcum * cant)
    }
  }
  ir(arbol.raizId, 0, new Set([arbol.raizId]), 1)
  return filas
}

// Materia prima propia de una ficha (de todos sus procesos).
export function materialesDe(arbol, fichaId) {
  return (arbol.procesos[fichaId] || []).flatMap((p) => arbol.materiales[p.id] || [])
}

// Reglas de "falta" por paso. Un conjunto (pieza con piezas adentro) no se exige en materia prima;
// en ruta solo se le pide si no tiene piezas ni procesos (está vacío).
export const falta = {
  despiece: (f) => !f.esConjunto && f.procesos.length === 0,
  ruta: (f) => !f.esConjunto && f.procesos.length === 0,
  materia: (f, arbol) => !f.esConjunto && materialesDe(arbol, f.fichaId).length === 0,
  // Tiempos va por proceso: falta si tiene personas por hora sin medir o si no tiene persona.
  tiempos: (p, costo) => Number(costo?.lineas_sin_tiempo) > 0 || Number(costo?.lineas_mano_obra || 0) === 0,
}

// Procesos de toda la máquina en orden de árbol, con la fila (pieza) a la que pertenecen.
// Incluye los de la máquina misma (ensamble final), con fila null.
export function filasProcesos(arbol, filas) {
  const out = []
  const de = (fila, fichaId) => {
    for (const p of arbol.procesos[fichaId] || []) out.push({ key: p.id, proceso: p, fila, costo: arbol.costos[p.id] || {} })
  }
  de(null, arbol.raizId)
  for (const f of filas) de(f, f.fichaId)
  return out
}

// Cuántos faltan en cada paso, para las pestañas.
export function conteos(arbol, filas, procesos) {
  return {
    despiece: filas.filter((f) => falta.despiece(f)).length,
    ruta: filas.filter((f) => falta.ruta(f)).length,
    materia: filas.filter((f) => falta.materia(f, arbol)).length,
    tiempos: procesos.filter((p) => falta.tiempos(p.proceso, p.costo)).length,
  }
}

// Para comparar nombres de piezas sin importar mayúsculas, tildes ni espacios de más.
export function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
