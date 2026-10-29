// Trae de Odoo las ventas netas de un mes (facturas de cliente publicadas menos notas crédito, sin IVA),
// agrupadas por cliente + producto, con la misma forma que deja el lector del Excel.
// Botón "Traer de Odoo": no guarda nada, el tablero muestra el resumen y guarda con ventas_cargar_mes.
// Automático (pg_cron cada 15 min, header x-cron-token): trae y guarda el mes en curso de cada empresa
// (y el anterior los primeros 5 días, por facturas con fecha atrasada). Ver migración 2026-10-29_ventas_odoo_auto.sql.
// Usa la API JSON-2 de Odoo 19 (clave API del usuario de Odoo en el secreto ODOO_<EMPRESA>_APIKEY).
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

const SD = 'Sin detalle'
const normProd = (t: string) => t.replace(/^\[[^\]]*\]\s*/, '').trim() || SD

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function odoo(cfg: { url: string; db: string }, clave: string, modelo: string, metodo: string, cuerpo: unknown) {
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

async function traerMes(cfg: { url: string; db: string }, clave: string, mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const hasta = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  // Publicadas, facturas y notas crédito de cliente, fecha de factura en el mes.
  // En el informe las notas crédito ya vienen con valor y cantidad negativos: así cuadra con Ingresos del estado de resultados.
  const domain = [
    ['state', '=', 'posted'], ['move_type', 'in', ['out_invoice', 'out_refund']],
    ['invoice_date', '>=', `${mes}-01`], ['invoice_date', '<', hasta],
  ]

  const grupos: Record<string, { c: string; p: string; v: number; q: number }> = {}
  let notas = 0
  const LOTE = 2000
  for (let offset = 0; ; offset += LOTE) {
    const lineas = await odoo(cfg, clave, 'account.invoice.report', 'search_read', {
      domain, fields: ['partner_id', 'product_id', 'quantity', 'price_subtotal', 'move_type'], limit: LOTE, offset, order: 'id',
    })
    for (const l of lineas) {
      const c = (Array.isArray(l.partner_id) ? l.partner_id[1] : '') || 'Sin nombre'
      const p = Array.isArray(l.product_id) ? normProd(l.product_id[1] || '') : SD
      const g = grupos[c + '\u0001' + p] ??= { c, p, v: 0, q: 0 }
      g.v += Number(l.price_subtotal) || 0
      g.q += Number(l.quantity) || 0
      if (l.move_type === 'out_refund') notas += Number(l.price_subtotal) || 0
    }
    if (lineas.length < LOTE) break
  }

  const filas = Object.values(grupos)
    .map(g => ({ c: g.c, p: g.p, v: Math.round(g.v * 100) / 100, q: Math.round(g.q * 100) / 100 }))
    .filter(f => f.v || f.q)
  return { filas, notas: Math.round(notas * 100) / 100 }
}

// Mes 'YYYY-MM' en hora de Colombia (UTC-5) con n meses de diferencia
function mesColombia(n = 0) {
  const d = new Date(Date.now() - 5 * 3600 * 1000)
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 7)
}

async function automatico() {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const dia = new Date(Date.now() - 5 * 3600 * 1000).getUTCDate()
  const meses = dia <= 5 ? [mesColombia(-1), mesColombia()] : [mesColombia()]
  const resultado: Record<string, unknown>[] = []
  for (const [empresa, cfg] of Object.entries(ODOO)) {
    const clave = Deno.env.get(cfg.secreto)
    if (!clave) { resultado.push({ empresa, error: `falta ${cfg.secreto}` }); continue }
    for (const mes of meses) {
      try {
        const { filas } = await traerMes(cfg, clave, mes)
        // Sin filas no se borra lo que haya (p. ej. el día 1 antes de la primera factura)
        if (!filas.length) { resultado.push({ empresa, mes, filas: 0 }); continue }
        const { error } = await admin.rpc('ventas_cargar_mes', { p_empresa: empresa, p_mes: mes, p_filas: filas, p_archivo: 'Automático · Odoo' })
        if (error) throw error
        resultado.push({ empresa, mes, filas: filas.length })
      } catch (e) {
        resultado.push({ empresa, mes, error: (e as Error).message })
      }
    }
  }
  console.log(JSON.stringify(resultado))
  return resultado
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = req.headers.get('x-cron-token')
    if (token) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const { data: ok } = await admin.rpc('ventas_cron_token_ok', { p_token: token })
      if (ok !== true) return responder({ error: 'No autorizado' }, 401)
      return responder({ resultado: await automatico() })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return responder({ error: 'No autorizado' }, 401)

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: puede } = await userClient.rpc('ventas_puede_ver')
    if (puede !== true) return responder({ error: 'No tienes permiso para cargar informes de ventas.' }, 403)

    const { empresa, mes } = await req.json()
    const cfg = ODOO[empresa]
    if (!cfg) return responder({ error: 'Esa empresa todavía no está conectada con Odoo.' }, 400)
    if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return responder({ error: 'Mes inválido.' }, 400)
    const clave = Deno.env.get(cfg.secreto)
    if (!clave) return responder({ error: `Falta guardar la clave API de Odoo en Supabase (secreto ${cfg.secreto}).` }, 500)

    return responder({ empresa, mes, ...(await traerMes(cfg, clave, mes)) })
  } catch (e) {
    return responder({ error: (e as Error).message || 'No se pudo consultar Odoo.' }, 502)
  }
})
