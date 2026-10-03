// Pagina automáticamente una consulta de Supabase para traer TODAS las filas,
// sin depender del límite máximo de filas por request que impone el servidor
// (PostgREST "Max Rows", por defecto 1000 en un proyecto de Supabase). Un
// .limit() más grande desde el cliente NO puede superar ese tope del
// servidor — así que cualquier consulta que supere esa cantidad se recortaba
// en silencio, sin error, sin importar qué .limit() se pusiera en el código.
//
// Encontrado y corregido 2026-10-03 (ver OBSERVACIONES.md): afectaba
// Analítica (Dashboard ejecutivo), Reportes, el Kardex y Gestión de
// productos — cualquiera que consultara movimientos/stock en volumen.
//
// Uso: pasar una función que, dados (desde, hasta), devuelva la consulta ya
// armada con .range(desde, hasta) — porque cada pantalla arma su propio
// builder de Supabase con sus propios filtros.
//
//   const { data, error } = await fetchAllPages((desde, hasta) =>
//     supabase.from('movimientos').select('...').eq('x', y).range(desde, hasta)
//   )
export async function fetchAllPages(buildQuery, pageSize = 1000) {
  let todas = []
  let desde = 0
  while (true) {
    const { data, error } = await buildQuery(desde, desde + pageSize - 1)
    if (error) return { data: todas, error }
    todas = todas.concat(data || [])
    if (!data || data.length < pageSize) break
    desde += pageSize
    // Salvavidas: nunca más de 200 páginas (200.000 filas) para evitar un
    // loop infinito si algo devuelve siempre el mismo tamaño de página.
    if (desde > pageSize * 200) break
  }
  return { data: todas, error: null }
}
