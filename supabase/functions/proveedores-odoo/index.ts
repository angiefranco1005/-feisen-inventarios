// Proveedores de los dos Odoo (Feisen y FC) → tabla `proveedores_odoo`, para unificarlos con los
// de la app. SOLO LECTURA en Odoo. Trae los contactos con supplier_rank > 0 o con facturas de
// proveedor publicadas, con número de facturas, última factura y total comprado (sin IVA).
// Se llama con el token de cron (header x-cron-token, vault 'ventas_odoo_cron') o como ADMIN.
// Usa la API JSON-2 de Odoo 19 con los mismos secretos que finanzas-odoo.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token' }
const ODOO: Record<string, { url: string; db: string; secreto: string }> = {
  feisen: { url: 'https://construequiposfranco.odoo.com', db: 'snva-proyectos-master-construequipos-main-28681200', secreto: 'ODOO_FEISEN_APIKEY' },
  fc: { url: 'https://fc-sas.odoo.com', db: 'fc-sas', secreto: 'ODOO_FC_APIKEY' },
}
const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function odoo(cfg: { url: string; db: string }, clave: string, modelo: string, metodo: string, cuerpo: unknown) {
  const res = await fetch(`${cfg.url}/json/2/${modelo}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `bearer ${clave}`, 'X-Odoo-Database': cfg.db },
    body: JSON.stringify(cuerpo),
  })
  const txt = await res.text()
  let data: any = null
  try { data = JSON.parse(txt) } catch { /* HTML */ }
  if (!res.ok) throw new Error(`Odoo respondió ${res.status}: ${data?.message || txt.slice(0, 200)}`)
  return data
}
async function todos(cfg: { url: string; db: string }, clave: string, modelo: string, domain: unknown[], fields: string[]) {
  const out: any[] = []
  for (let offset = 0; ; offset += 2000) {
    const lote = await odoo(cfg, clave, modelo, 'search_read', { domain, fields, limit: 2000, offset, order: 'id', context: { active_test: false } })
    out.push(...lote)
    if (lote.length < 2000) break
  }
  return out
}
const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

async function leerEmpresa(empresa: string) {
  const cfg = ODOO[empresa]
  const clave = Deno.env.get(cfg.secreto)
  if (!clave) throw new Error(`Falta el secreto ${cfg.secreto}`)
  // Facturas de proveedor publicadas: cuántas, última y total por contacto (empresa comercial)
  const facturas = await todos(cfg, clave, 'account.move', [['move_type', 'in', ['in_invoice', 'in_refund']], ['state', '=', 'posted']],
    ['commercial_partner_id', 'invoice_date', 'amount_untaxed_signed', 'move_type'])
  const porSocio: Record<number, { n: number; ultima: string | null; total: number }> = {}
  for (const f of facturas) {
    const id = Array.isArray(f.commercial_partner_id) ? f.commercial_partner_id[0] : null
    if (!id) continue
    const s = porSocio[id] ??= { n: 0, ultima: null, total: 0 }
    if (f.move_type === 'in_invoice') s.n++
    s.total += -Number(f.amount_untaxed_signed || 0) // en compras el signo viene negativo
    if (f.invoice_date && (!s.ultima || f.invoice_date > s.ultima)) s.ultima = f.invoice_date
  }
  const conFacturas = Object.keys(porSocio).map(Number)
  const socios = await todos(cfg, clave, 'res.partner', ['|', ['supplier_rank', '>', 0], ['id', 'in', conFacturas]],
    ['name', 'vat', 'email', 'phone', 'street', 'city', 'is_company', 'active', 'parent_id'])
  return socios
    .filter(p => !p.parent_id) // los contactos hijos (personas de una empresa) no son proveedores aparte
    .map(p => ({
      empresa, odoo_id: p.id, nombre: txt(p.name) || `Contacto ${p.id}`, nit: txt(p.vat), email: txt(p.email),
      telefono: txt(p.phone), direccion: txt(p.street), ciudad: txt(p.city),
      es_empresa: !!p.is_company, activo: p.active !== false,
      facturas: porSocio[p.id]?.n || 0, ultima_factura: porSocio[p.id]?.ultima || null,
      total_compras: Math.round((porSocio[p.id]?.total || 0) * 100) / 100,
    }))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token = req.headers.get('x-cron-token')
    if (token) {
      const { data: ok } = await admin.rpc('ventas_cron_token_ok', { p_token: token })
      if (ok !== true) return responder({ error: 'Token inválido' }, 401)
    } else {
      const auth = req.headers.get('Authorization')
      if (!auth) return responder({ error: 'No autorizado' }, 401)
      const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
      const { data: rol } = await user.rpc('get_my_rol')
      if (rol !== 'ADMIN') return responder({ error: 'Solo ADMIN' }, 403)
    }
    const resumen: Record<string, number> = {}
    for (const empresa of Object.keys(ODOO)) {
      const filas = await leerEmpresa(empresa)
      await admin.from('proveedores_odoo').delete().eq('empresa', empresa)
      for (let i = 0; i < filas.length; i += 500) {
        const { error } = await admin.from('proveedores_odoo').insert(filas.slice(i, i + 500))
        if (error) throw new Error(error.message)
      }
      resumen[empresa] = filas.length
    }
    return responder({ ok: true, resumen })
  } catch (e) {
    return responder({ error: (e as Error).message }, 502)
  }
})
