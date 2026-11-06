import { supabase } from '../../../lib/supabase'

// Carga de una vez una ficha y todas sus sub-piezas a cualquier profundidad (costeo_ficha_piezas),
// con sus procesos y costos. Lo usan el árbol de la pantalla y el PDF.
// Una misma pieza puede aparecer en varias ramas (ej. el mismo "Aro" en dos lugares); se carga una
// vez y se pinta donde esté. Si alguien arma un ciclo (A dentro de B dentro de A), se corta.
export async function cargarArbol(raizId, { conDetalle = false } = {}) {
  const ids = new Set([raizId])
  const enlaces = []
  let frontera = [raizId]
  while (frontera.length) {
    const { data, error } = await supabase
      .from('costeo_ficha_piezas')
      .select('id, contenedor_id, pieza_id, cantidad, created_at')
      .in('contenedor_id', frontera)
    if (error) throw error
    frontera = []
    for (const e of data || []) {
      enlaces.push(e)
      if (!ids.has(e.pieza_id)) {
        ids.add(e.pieza_id)
        frontera.push(e.pieza_id)
      }
    }
  }
  const lista = [...ids]
  const consultas = [
    supabase.from('costeo_fichas').select('*').in('id', lista),
    supabase.from('costeo_resumen').select('*').in('ficha_id', lista),
    supabase.from('costeo_procesos').select('*').in('ficha_id', lista),
    supabase.from('costeo_procesos_resumen').select('*').in('ficha_id', lista),
  ]
  if (conDetalle) {
    consultas.push(
      supabase
        .from('costeo_materiales')
        .select('id, ficha_id, proceso_id, item_id, item_nombre_libre, cantidad, rendimiento, created_at, items(nombre, precio_costo, unidad_medida)')
        .in('ficha_id', lista),
      supabase.from('costeo_tiempos_reales').select('*').in('ficha_id', lista)
    )
  }
  const res = await Promise.all(consultas)
  for (const r of res) if (r.error) throw r.error
  const [fi, rs, pr, cr, mt, tr] = res

  const porId = (filas, k) => Object.fromEntries((filas || []).map((x) => [x[k], x]))
  const agrupar = (filas, k, orden) => {
    const g = {}
    for (const x of filas || []) if (x[k]) (g[x[k]] ||= []).push(x)
    if (orden) for (const v of Object.values(g)) v.sort(orden)
    return g
  }
  const porFecha = (a, b) => String(a.created_at).localeCompare(String(b.created_at))

  return {
    raizId,
    fichas: porId(fi.data, 'id'),
    resumen: porId(rs.data, 'ficha_id'),
    procesos: agrupar(pr.data, 'ficha_id', (a, b) => a.orden - b.orden || porFecha(a, b)),
    costos: porId(cr.data, 'proceso_id'),
    hijos: agrupar(enlaces, 'contenedor_id', porFecha),
    materiales: conDetalle ? agrupar(mt.data, 'proceso_id', porFecha) : {},
    tiempos: conDetalle
      ? agrupar(tr.data, 'proceso_id', (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || porFecha(a, b))
      : {},
  }
}

// Recorre el árbol en orden (procesos de cada ficha y luego sus sub-piezas) llamando a
// visitar(fichaId, ruta, cantidadAcumulada). ruta = nombres desde la raíz, sin incluirla.
export function recorrerArbol(arbol, visitar) {
  function ir(fichaId, ruta, cantidad, enCamino) {
    visitar(fichaId, ruta, cantidad)
    for (const e of arbol.hijos[fichaId] || []) {
      if (enCamino.has(e.pieza_id)) continue
      const nombre = arbol.fichas[e.pieza_id]?.nombre || 'Pieza'
      ir(e.pieza_id, [...ruta, nombre], cantidad * Number(e.cantidad || 0), new Set(enCamino).add(e.pieza_id))
    }
  }
  ir(arbol.raizId, [], 1, new Set([arbol.raizId]))
}
