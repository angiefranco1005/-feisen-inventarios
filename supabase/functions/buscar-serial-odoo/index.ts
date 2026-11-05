// Búsqueda puntual del serial de motor 270325010207 en Odoo (5/11/2026, pedido de Angie).
// Buscó (solo lectura) en notas y referencias de facturas, pedidos, lotes y remisiones de Feisen y FC.
// Resultado: nota de la COT00111 / factura CF5794 (Montesur, 19/6/2026). Ya se usó; queda desactivada.
// Si hace falta buscar otro serial, ver la versión anterior en git (commit de esta fecha).
Deno.serve(() => new Response(JSON.stringify({ error: 'Función desactivada' }), { status: 410, headers: { 'Content-Type': 'application/json' } }))
