// Balance general a fin de un mes, de las dos empresas (solo lectura, solo ADMIN).
// Es distinto de la acción 'cuentas' de finanzas-odoo, que trae el saldo de hoy: aquí el saldo se corta
// a fin del mes que se pida, porque Angie llena los bancos a mano con los extractos de cada mes y
// mezclar un extracto de octubre con la cartera de hoy daría un balance falso.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const ODOO: Record<string, { url: string; db: string; secreto: string }> = {
  feisen: { url: 'https://construequiposfranco.odoo.com', db: 'snva-proyectos-master-construequipos-main-28681200', secreto: 'ODOO_FEISEN_APIKEY' },
  fc: { url: 'https://fc-sas.odoo.com', db: 'fc-sas', secreto: 'ODOO_FC_APIKEY' },
}
const responder = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const r2 = (n: number) => Math.round(n * 100) / 100

async function odoo(cfg: { url: string; db: string }, clave: string, modelo: string, metodo: string, cuerpo: unknown) {
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

// Saldo de cada cuenta acumulado hasta el último día del mes
async function saldosA(quien: string, hasta: string) {
  const cfg = ODOO[quien]
  const clave = Deno.env.get(cfg.secreto)
  if (!clave) throw new Error(`Falta la clave API de Odoo de ${quien}.`)
  const plan = await odoo(cfg, clave, 'account.account', 'search_read', {
    domain: [], fields: ['code', 'name'], context: { active_test: false },
  })
  const porId: Record<number, { codigo: string; nombre: string }> = {}
  for (const c of plan) porId[c.id] = { codigo: String(c.code), nombre: c.name }

  const grupos = await odoo(cfg, clave, 'account.move.line', 'formatted_read_group', {
    domain: [['parent_state', '=', 'posted'], ['date', '<=', hasta]],
    groupby: ['account_id'], aggregates: ['balance:sum'],
  })
  const cuentas: Record<string, { nombre: string; saldo: number }> = {}
  for (const g of grupos) {
    const id = Array.isArray(g.account_id) ? g.account_id[0] : g.account_id
    const cta = porId[id]
    if (!cta) continue
    const v = g['balance:sum'] || 0
    if (!cuentas[cta.codigo]) cuentas[cta.codigo] = { nombre: cta.nombre, saldo: 0 }
    cuentas[cta.codigo].saldo = r2(cuentas[cta.codigo].saldo + v)
  }
  return Object.entries(cuentas)
    .filter(([, v]) => v.saldo)
    .map(([codigo, v]) => ({ codigo, nombre: v.nombre, saldo: v.saldo }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return responder({ error: 'No autorizado' }, 401)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: puede } = await userClient.rpc('ventas_puede_ver')
    if (puede !== true) return responder({ error: 'No tienes permiso para ver Finanzas.' }, 403)

    const { mes } = await req.json()
    if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return responder({ error: 'Mes inválido.' }, 400)
    const [y, m] = mes.split('-').map(Number)
    const hasta = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`

    const [feisen, fc] = await Promise.all([saldosA('feisen', hasta), saldosA('fc', hasta)])
    return responder({ mes, hasta, feisen, fc })
  } catch (e) {
    return responder({ error: (e as Error).message || 'No se pudo consultar Odoo.' }, 502)
  }
})
