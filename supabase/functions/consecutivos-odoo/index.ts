// Ventas › Consecutivos de equipos: lee de Odoo Feisen y Odoo FC las notas de las facturas de cliente
// (y de las cotizaciones confirmadas que aún no tienen factura), saca los consecutivos con leerNota.js
// y los guarda en equipos_consecutivos (función consecutivos_cargar_odoo).
// Solo LEE Odoo. Claves: secretos ODOO_FEISEN_APIKEY y ODOO_FC_APIKEY (los mismos de ventas-odoo).
//
// Quién la llama:
//  · pg_cron cada hora (header x-cron-token = token de Vault ventas_odoo_cron): { accion: 'sincronizar' }
//    Con el token también se puede: { accion: 'sincronizar', dias: 700 } (carga inicial) o { accion: 'simular' } (no guarda).
//  · El botón «Actualizar desde Odoo» de la pantalla (JWT del usuario con consecutivos_puede_ver()): últimos 60 días.
//    ADMIN puede mandar { dias: 900 }: la pantalla lo hace al terminar de importar el Excel (relee todo Odoo).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { leerDocumento, textoPlano } from './leerNota.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ODOO: Record<string, { url: string; db: string; secreto: string }> = {
  feisen: { url: 'https://construequiposfranco.odoo.com', db: 'snva-proyectos-master-construequipos-main-28681200', secreto: 'ODOO_FEISEN_APIKEY' },
  fc: { url: 'https://fc-sas.odoo.com', db: 'fc-sas', secreto: 'ODOO_FC_APIKEY' },
}
const responder = (c: unknown, status = 200) =>
  new Response(JSON.stringify(c), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

async function odoo(cfg: { url: string; db: string }, clave: string, modelo: string, metodo: string, cuerpo: unknown) {
  const res = await fetch(`${cfg.url}/json/2/${modelo}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `bearer ${clave}`, 'X-Odoo-Database': cfg.db },
    body: JSON.stringify(cuerpo),
  })
  const txt = await res.text()
  let data: any = null
  try { data = JSON.parse(txt) } catch { /* HTML */ }
  if (!res.ok) {
    const msg = data?.message || txt.slice(0, 200) || res.statusText
    throw new Error(res.status === 401 ? 'Odoo rechazó la clave API (revisa que no haya vencido).' : `Odoo respondió ${res.status}: ${msg}`)
  }
  return data
}

async function todo(cfg: any, clave: string, modelo: string, domain: unknown[], fields: string[], order = 'id') {
  const out: any[] = []
  const LOTE = 1000
  for (let offset = 0; ; offset += LOTE) {
    const filas = await odoo(cfg, clave, modelo, 'search_read', { domain, fields, limit: LOTE, offset, order })
    out.push(...filas)
    if (filas.length < LOTE) break
  }
  return out
}

const nombre = (m2o: unknown) => (Array.isArray(m2o) ? String(m2o[1] || '') : '')
const fechaDe = (iso: string) => (iso || '').slice(0, 10) || null

// Lee una empresa: facturas publicadas (no reversadas) desde `desde` + cotizaciones confirmadas sin factura
async function leerEmpresa(empresa: string, desde: string, rangos: Record<string, [number, number]>, diagnostico?: Record<string, unknown>[]) {
  const hace60 = new Date(Date.now() - 5 * 3600 * 1000 - 60 * 86400000).toISOString().slice(0, 10)
  const cfg = ODOO[empresa]
  const clave = Deno.env.get(cfg.secreto)
  if (!clave) throw new Error(`falta el secreto ${cfg.secreto}`)

  const docs: { ref: string; documento: string; fecha: string | null; cliente: string; nota: string; lineas: { producto: string; cantidad: number }[] }[] = []

  const facturas = await todo(cfg, clave, 'account.move', [
    ['state', '=', 'posted'], ['move_type', '=', 'out_invoice'], ['invoice_date', '>=', desde], ['payment_state', '!=', 'reversed'],
  ], ['name', 'invoice_date', 'partner_id', 'narration'])
  const lineasF: Record<number, any[]> = {}
  for (let i = 0; i < facturas.length; i += 300) {
    const ids = facturas.slice(i, i + 300).map(f => f.id)
    const ls = await todo(cfg, clave, 'account.move.line', [['move_id', 'in', ids], ['display_type', '=', 'product']],
      ['move_id', 'product_id', 'name', 'quantity'], 'move_id, sequence, id')
    ls.forEach(l => (lineasF[l.move_id[0]] ??= []).push(l))
  }
  facturas.forEach(f => docs.push({
    ref: `${empresa}:move:${f.id}`, documento: f.name, fecha: fechaDe(f.invoice_date), cliente: nombre(f.partner_id), nota: f.narration || '',
    lineas: (lineasF[f.id] || []).map(l => ({ producto: nombre(l.product_id) || l.name || '', cantidad: l.quantity })),
  }))

  const pedidos = await todo(cfg, clave, 'sale.order', [
    ['state', '=', 'sale'], ['invoice_ids', '=', false], ['date_order', '>=', `${desde} 00:00:00`],
  ], ['name', 'date_order', 'partner_id', 'note'])
  const lineasP: Record<number, any[]> = {}
  for (let i = 0; i < pedidos.length; i += 300) {
    const ids = pedidos.slice(i, i + 300).map(p => p.id)
    const ls = await todo(cfg, clave, 'sale.order.line', [['order_id', 'in', ids], ['display_type', '=', false]],
      ['order_id', 'product_id', 'name', 'product_uom_qty'], 'order_id, sequence, id')
    ls.forEach(l => (lineasP[l.order_id[0]] ??= []).push(l))
  }
  pedidos.forEach(p => docs.push({
    ref: `${empresa}:so:${p.id}`, documento: p.name, fecha: fechaDe(p.date_order), cliente: nombre(p.partner_id), nota: p.note || '',
    lineas: (lineasP[p.id] || []).map(l => ({ producto: nombre(l.product_id) || l.name || '', cantidad: l.product_uom_qty })),
  }))

  const filas: Record<string, unknown>[] = []
  const avisos: Record<string, unknown>[] = []
  for (const d of docs) {
    const r = leerDocumento({ nota: d.nota, lineas: d.lineas, rangos })
    const vistos = new Set<string>()
    for (const f of r.filas) {
      const tipo = f.tipo || 'revisar'
      const k = `${tipo}|${f.consecutivo}`
      if (vistos.has(k)) continue
      vistos.add(k)
      filas.push({ t: tipo, c: f.consecutivo, f: d.fecha, of: r.numero_of, cl: d.cliente, cap: f.capacidad, d: d.documento, e: empresa, ref: d.ref, p: f.producto })
    }
    // Avisos solo de lo reciente (las facturas viejas migradas de SIIGO no traen notas: no hay nada que arreglar)
    if (r.problema && (d.fecha || '') >= hace60) avisos.push({ ref: d.ref, d: d.documento, e: empresa, f: d.fecha, cl: d.cliente, of: r.numero_of, pr: r.problema })
    if (r.problema && diagnostico) diagnostico.push({ d: d.documento, pr: r.problema, nota: textoPlano(d.nota).replace(/\s+/g, ' ').slice(0, 160), lin: d.lineas.map(l => `${l.cantidad}× ${l.producto.split('\n')[0]}`).join(' | ') })
  }
  return { refs: docs.map(d => d.ref), filas, avisos, facturas: facturas.length, pedidos: pedidos.length }
}

async function sincronizar(dias: number, guardar: boolean) {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const desde = new Date(Date.now() - 5 * 3600 * 1000 - dias * 86400000).toISOString().slice(0, 10)
  const resultado: Record<string, unknown>[] = []
  const { data: rs } = await admin.rpc('consecutivos_rangos')
  const rangos: Record<string, [number, number]> = Object.fromEntries((rs || []).map((r: any) => [r.tipo, [Number(r.desde), Number(r.hasta)]]))
  for (const empresa of Object.keys(ODOO)) {
    try {
      const diag: Record<string, unknown>[] | undefined = guardar ? undefined : []
      const r = await leerEmpresa(empresa, desde, rangos, diag)
      const resumen = { empresa, desde, facturas: r.facturas, pedidos_sin_factura: r.pedidos, consecutivos: r.filas.length, avisos: r.avisos.length }
      if (!guardar) { resultado.push({ ...resumen, muestra: r.filas.slice(0, 40), diagnostico: diag }); continue }
      const { error } = await admin.rpc('consecutivos_cargar_odoo', {
        p_refs: r.refs, p_prefijos: [`${empresa}:so:%`], p_filas: r.filas, p_avisos: r.avisos,
      })
      if (error) throw error
      resultado.push(resumen)
    } catch (e) {
      resultado.push({ empresa, error: (e as Error).message })
    }
  }
  console.log(JSON.stringify(resultado.map(({ muestra, diagnostico, ...x }: any) => x)))
  return resultado
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const cuerpo = await req.json().catch(() => ({}))
    const token = req.headers.get('x-cron-token')
    if (token) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const { data: ok } = await admin.rpc('ventas_cron_token_ok', { p_token: token })
      if (ok !== true) return responder({ error: 'No autorizado' }, 401)
      const dias = Math.min(Math.max(Number(cuerpo.dias) || 60, 1), 1500)
      return responder({ resultado: await sincronizar(dias, cuerpo.accion !== 'simular') })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return responder({ error: 'No autorizado' }, 401)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: puede } = await userClient.rpc('consecutivos_puede_ver')
    if (puede !== true) return responder({ error: 'No tienes permiso para ver los consecutivos.' }, 403)
    // Administración puede pedir más días (la pantalla lo hace sola después de importar el Excel)
    let dias = 60
    if (Number(cuerpo.dias) > 60) {
      const { data: rol } = await userClient.rpc('get_my_rol')
      if (rol === 'ADMIN') dias = Math.min(Number(cuerpo.dias), 1500)
    }
    return responder({ resultado: await sincronizar(dias, true) })
  } catch (e) {
    return responder({ error: (e as Error).message || 'No se pudo consultar Odoo.' }, 502)
  }
})
