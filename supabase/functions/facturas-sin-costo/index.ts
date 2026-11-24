// Revisión puntual (24/11/2026, pedido de Angie): facturas de cliente publicadas de Feisen en Odoo
// sin línea de costo (los apuntes display_type 'cogs' que Odoo crea al facturar productos almacenables).
// { sin_centro: true }: líneas de venta sin centro de costo (plan analítico "Líneas de costo"), que era lo que Angie preguntaba.
// Solo lectura. Se llama con el token de cron (header x-cron-token, vault 'ventas_odoo_cron').
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cfg = { url: 'https://construequiposfranco.odoo.com', db: 'snva-proyectos-master-construequipos-main-28681200' }
const responder = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json' } })

async function odoo(clave: string, modelo: string, metodo: string, cuerpo: unknown) {
  const res = await fetch(`${cfg.url}/json/2/${modelo}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `bearer ${clave}`, 'X-Odoo-Database': cfg.db },
    body: JSON.stringify(cuerpo ?? {}),
  })
  const txt = await res.text()
  let data: any = null
  try { data = JSON.parse(txt) } catch { /* sin json */ }
  if (!res.ok) throw new Error(data?.message || txt.slice(0, 200) || res.statusText)
  return data
}

async function todo(clave: string, modelo: string, domain: unknown[], fields: string[]) {
  const out: any[] = []
  for (let offset = 0; ; offset += 2000) {
    const lote = await odoo(clave, modelo, 'search_read', { domain, fields, limit: 2000, offset, order: 'id' })
    out.push(...lote)
    if (lote.length < 2000) return out
  }
}

const nombre = (v: unknown) => (Array.isArray(v) ? v[1] : v) || ''
const idDe = (v: unknown) => (Array.isArray(v) ? v[0] : v) as number

Deno.serve(async (req) => {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: ok } = await admin.rpc('ventas_cron_token_ok', { p_token: req.headers.get('x-cron-token') || '' })
    if (ok !== true) return responder({ error: 'No autorizado' }, 401)
    const clave = Deno.env.get('ODOO_FEISEN_APIKEY')
    if (!clave) throw new Error('Falta ODOO_FEISEN_APIKEY')

    const compania = await odoo(clave, 'res.company', 'search_read', { domain: [], fields: ['name', 'anglo_saxon_accounting'] })
    const cuerpo = await req.json().catch(() => ({}))
    // Sin centro: líneas de venta (y de notas crédito) sin distribución analítica (plan "Líneas de costo")
    if (cuerpo.sin_centro) {
      const sin = await todo(clave, 'account.move.line',
        [['move_id.move_type', 'in', ['out_invoice', 'out_refund']], ['parent_state', '=', 'posted'], ['display_type', '=', 'product'], ['analytic_distribution', '=', false]],
        ['move_id', 'date', 'partner_id', 'product_id', 'name', 'quantity', 'balance', 'move_type'])
      const planes = await odoo(clave, 'account.analytic.plan', 'search_read', { domain: [], fields: ['name'] })
      return responder({ compania, planes, lineas: sin.map(l => ({ factura: nombre(l.move_id), fecha: l.date, cliente: nombre(l.partner_id),
        producto: nombre(l.product_id) || l.name, cantidad: l.quantity, valor: -l.balance, tipo: l.move_type })) })
    }
    if (cuerpo.categorias) {
      const categorias = await odoo(clave, 'product.category', 'search_read', {
        domain: [], fields: ['complete_name', 'property_valuation', 'property_cost_method', 'property_stock_valuation_account_id', 'property_account_expense_categ_id'],
      })
      return responder({ compania, categorias })
    }
    const facturas = await todo(clave, 'account.move', [['move_type', '=', 'out_invoice'], ['state', '=', 'posted']],
      ['name', 'invoice_date', 'partner_id', 'amount_untaxed', 'invoice_origin'])
    const lineas = await todo(clave, 'account.move.line',
      [['move_id.move_type', '=', 'out_invoice'], ['parent_state', '=', 'posted'], ['display_type', 'in', ['product', 'cogs']]],
      ['move_id', 'display_type', 'product_id', 'quantity', 'balance'])

    const prodIds = [...new Set(lineas.filter(l => l.product_id).map(l => idDe(l.product_id)))]
    const prods: Record<number, any> = {}
    for (let i = 0; i < prodIds.length; i += 500) {
      const lote = await odoo(clave, 'product.product', 'read', {
        ids: prodIds.slice(i, i + 500), fields: ['display_name', 'type', 'is_storable', 'standard_price'], context: { active_test: false },
      })
      lote.forEach((p: any) => { prods[p.id] = p })
    }

    const porFactura: Record<number, { prod: any[]; cogs: number; nCogs: number }> = {}
    for (const l of lineas) {
      const f = porFactura[idDe(l.move_id)] ??= { prod: [], cogs: 0, nCogs: 0 }
      if (l.display_type === 'cogs') { if (l.balance > 0) { f.cogs += l.balance; f.nCogs++ } }
      else f.prod.push(l)
    }

    const resultado = facturas.map(f => {
      const d = porFactura[f.id] ?? { prod: [], cogs: 0, nCogs: 0 }
      const productos = d.prod.map(l => {
        const p = prods[idDe(l.product_id)]
        return { producto: p?.display_name || nombre(l.product_id) || '(sin producto)', cantidad: l.quantity, venta: -l.balance,
          tipo: p ? (p.is_storable ? 'almacenable' : p.type) : 'sin producto', costo_estandar: p?.standard_price ?? null }
      })
      return { factura: f.name, fecha: f.invoice_date, cliente: nombre(f.partner_id), base: f.amount_untaxed, origen: f.invoice_origin || '',
        costo: Math.round(d.cogs * 100) / 100, lineas_costo: d.nCogs, productos }
    })
    const sinCosto = resultado.filter(r => r.lineas_costo === 0)
    return responder({ compania, facturas: facturas.length, sin_costo: sinCosto.length, detalle: sinCosto })
  } catch (e) {
    return responder({ error: (e as Error).message }, 502)
  }
})
