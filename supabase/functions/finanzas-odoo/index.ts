// Módulo Finanzas: lee Odoo (Feisen y FC) en vivo. Solo lectura, solo ADMIN (ventas_puede_ver).
//   'resultado'  (empresa, mes): ventas y compras a proveedores del mes por centro (cuenta analítica).
//                Decisión de Angie (2026-10-30): el costo es solo lo comprado a proveedores (facturas de
//                proveedor menos notas crédito, sin IVA), no las cuentas contables. Lo que no trae centro
//                queda en 'Sin centro' y la pantalla lo reparte según las ventas.
//   'pendientes' (empresa): facturas por cobrar y por pagar sin saldar y el saldo de bancos y caja.
// Usa la API JSON-2 de Odoo 19 con los mismos secretos que ventas-odoo.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ODOO: Record<string, { url: string; db: string; secreto: string }> = {
  feisen: { url: 'https://construequiposfranco.odoo.com', db: 'snva-proyectos-master-construequipos-main-28681200', secreto: 'ODOO_FEISEN_APIKEY' },
  fc: { url: 'https://fc-sas.odoo.com', db: 'fc-sas', secreto: 'ODOO_FC_APIKEY' },
}

const SIN_CENTRO = 'Sin centro'

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

type Cfg = { url: string; db: string }

async function odoo(cfg: Cfg, clave: string, modelo: string, metodo: string, cuerpo: unknown) {
  const res = await fetch(`${cfg.url}/json/2/${modelo}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `bearer ${clave}`, 'X-Odoo-Database': cfg.db },
    body: JSON.stringify(cuerpo),
  })
  const txt = await res.text()
  let data: any = null
  try { data = JSON.parse(txt) } catch { /* Odoo devolvió HTML */ }
  if (!res.ok) {
    const msg = data?.message || txt.slice(0, 200) || res.statusText
    throw new Error(res.status === 401 ? 'Odoo rechazó la clave API (revisa que sea la correcta y no haya vencido).' : `Odoo respondió ${res.status}: ${msg}`)
  }
  return data
}

// search_read por lotes hasta traer todo
async function todos(cfg: Cfg, clave: string, modelo: string, domain: unknown[], fields: string[]) {
  const LOTE = 2000
  const out: any[] = []
  for (let offset = 0; ; offset += LOTE) {
    const lote = await odoo(cfg, clave, modelo, 'search_read', { domain, fields, limit: LOTE, offset, order: 'id' })
    out.push(...lote)
    if (lote.length < LOTE) break
  }
  return out
}

const nombre = (v: unknown) => (Array.isArray(v) ? v[1] : null)
const r2 = (n: number) => Math.round(n * 100) / 100
const sinCodigo = (t: string) => t.replace(/^\[[^\]]*\]\s*/, '').trim()

// Reparte el valor de una línea entre sus centros. Cada empresa tiene un solo plan analítico,
// así que las claves de analytic_distribution son ids sueltos con su porcentaje.
function repartir(l: any, valor: number, centros: Record<string, string>): [string, number][] {
  const dist = l.analytic_distribution
  if (!dist || !Object.keys(dist).length) return [[SIN_CENTRO, valor]]
  return Object.entries(dist).map(([k, pct]) => {
    const id = k.split(',')[0]
    return [centros[id] || `Centro ${id}`, valor * Number(pct) / 100]
  })
}

async function resultado(cfg: Cfg, clave: string, mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const hasta = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  const centros: Record<string, string> = {}
  for (const a of await odoo(cfg, clave, 'account.analytic.account', 'search_read', { domain: [], fields: ['name'], context: { active_test: false } })) {
    centros[String(a.id)] = a.name
  }
  const enMes = (tipos: string[]) => [
    ['parent_state', '=', 'posted'], ['move_id.move_type', 'in', tipos],
    ['display_type', '=', 'product'], ['invoice_date', '>=', `${mes}-01`], ['invoice_date', '<', hasta],
  ]
  const campos = ['partner_id', 'product_id', 'name', 'account_id', 'balance', 'analytic_distribution']

  // Ventas: facturas de cliente menos notas crédito (balance es negativo en ventas)
  const ventas: Record<string, number> = {}
  for (const l of await todos(cfg, clave, 'account.move.line', enMes(['out_invoice', 'out_refund']), ['balance', 'analytic_distribution'])) {
    for (const [c, v] of repartir(l, -(Number(l.balance) || 0), centros)) ventas[c] = (ventas[c] || 0) + v
  }

  // Compras: una fila por proveedor + concepto + cuenta + centro
  const grupos: Record<string, { proveedor: string; concepto: string; cuenta: string; centro: string; valor: number }> = {}
  for (const l of await todos(cfg, clave, 'account.move.line', enMes(['in_invoice', 'in_refund']), campos)) {
    const proveedor = nombre(l.partner_id) || 'Sin proveedor'
    const concepto = sinCodigo(nombre(l.product_id) || l.name || '') || 'Sin detalle'
    const cuenta = nombre(l.account_id) || 'Sin cuenta'
    for (const [centro, v] of repartir(l, Number(l.balance) || 0, centros)) {
      const g = grupos[[proveedor, concepto, cuenta, centro].join('\u0001')] ??= { proveedor, concepto, cuenta, centro, valor: 0 }
      g.valor += v
    }
  }

  return {
    mes,
    ventas: Object.fromEntries(Object.entries(ventas).map(([c, v]) => [c, r2(v)]).filter(([, v]) => v)),
    compras: Object.values(grupos).map(g => ({ ...g, valor: r2(g.valor) })).filter(g => g.valor),
  }
}

async function pendientes(cfg: Cfg, clave: string) {
  const lineas = await todos(cfg, clave, 'account.move.line', [
    ['parent_state', '=', 'posted'], ['account_type', 'in', ['asset_receivable', 'liability_payable']],
    ['reconciled', '=', false], ['amount_residual', '!=', 0],
  ], ['partner_id', 'move_name', 'date', 'date_maturity', 'amount_residual', 'account_type'])
  // Por pagar viene negativo en Odoo: se devuelve en positivo (lo que se debe); un anticipo queda negativo
  const docs = lineas.map(l => ({
    tipo: l.account_type === 'asset_receivable' ? 'cobrar' : 'pagar',
    tercero: nombre(l.partner_id) || 'Sin tercero',
    documento: l.move_name || '',
    fecha: l.date || null,
    vence: l.date_maturity || l.date || null,
    saldo: r2((l.account_type === 'asset_receivable' ? 1 : -1) * (Number(l.amount_residual) || 0)),
  }))

  // Saldo de bancos y caja: suma de la cuenta de cada diario (las tarjetas de crédito no son disponible)
  const diarios = await odoo(cfg, clave, 'account.journal', 'search_read', {
    domain: [['type', 'in', ['bank', 'cash']]], fields: ['name', 'type', 'default_account_id'],
  })
  const ids = diarios.map((d: any) => Array.isArray(d.default_account_id) ? d.default_account_id[0] : null).filter(Boolean)
  const saldoPorCuenta: Record<number, number> = {}
  if (ids.length) {
    for (const l of await todos(cfg, clave, 'account.move.line', [['parent_state', '=', 'posted'], ['account_id', 'in', ids]], ['account_id', 'balance'])) {
      const id = l.account_id[0]
      saldoPorCuenta[id] = (saldoPorCuenta[id] || 0) + (Number(l.balance) || 0)
    }
  }
  const bancos = diarios.map((d: any) => ({
    nombre: d.name, tipo: d.type,
    saldo: r2(saldoPorCuenta[Array.isArray(d.default_account_id) ? d.default_account_id[0] : -1] || 0),
  }))

  return { docs, bancos }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return responder({ error: 'No autorizado' }, 401)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: puede } = await userClient.rpc('ventas_puede_ver')
    if (puede !== true) return responder({ error: 'No tienes permiso para ver Finanzas.' }, 403)

    const { accion, empresa, mes } = await req.json()
    const cfg = ODOO[empresa]
    if (!cfg) return responder({ error: 'Esa empresa todavía no está conectada con Odoo.' }, 400)
    const clave = Deno.env.get(cfg.secreto)
    if (!clave) return responder({ error: `Falta guardar la clave API de Odoo en Supabase (secreto ${cfg.secreto}).` }, 500)

    if (accion === 'resultado') {
      if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return responder({ error: 'Mes inválido.' }, 400)
      return responder(await resultado(cfg, clave, mes))
    }
    if (accion === 'pendientes') return responder(await pendientes(cfg, clave))
    return responder({ error: 'Acción desconocida.' }, 400)
  } catch (e) {
    return responder({ error: (e as Error).message || 'No se pudo consultar Odoo.' }, 502)
  }
})
