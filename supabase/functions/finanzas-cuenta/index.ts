// Los movimientos de unas cuentas concretas, para poder mirar qué tienen adentro (solo lectura, solo ADMIN).
//
// Nació el 18/11/2026 mientras Angie y yo clasificábamos cuenta por cuenta para juntar las dos
// contabilidades: hay cuentas cuyo nombre no dice qué tienen ("Cartera Fiscal", "Deudores varios",
// "Movimientos transitorios") y la única forma de saberlo es abrir los apuntes.
//
// Se le pasan { empresa, codigos, hasta } y devuelve, por cada cuenta, el total y los apuntes
// más grandes con fecha, tercero, documento y concepto. **No escribe nada en Odoo.**
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const ODOO: Record<string, { url: string; db: string; secreto: string }> = {
  feisen: { url: 'https://construequiposfranco.odoo.com', db: 'snva-proyectos-master-construequipos-main-28681200', secreto: 'ODOO_FEISEN_APIKEY' },
  fc: { url: 'https://fc-sas.odoo.com', db: 'fc-sas', secreto: 'ODOO_FC_APIKEY' },
}
const responder = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

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

const nombreDe = (v: unknown) => (Array.isArray(v) ? v[1] : v) || ''

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return responder({ error: 'No autorizado' }, 401)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: puede } = await userClient.rpc('ventas_puede_ver')
    if (puede !== true) return responder({ error: 'No tienes permiso para ver Finanzas.' }, 403)

    const { empresa, codigos, hasta, limite } = await req.json()
    const cfg = ODOO[String(empresa)]
    if (!cfg) return responder({ error: 'Empresa inválida: usa feisen o fc.' }, 400)
    if (!Array.isArray(codigos) || !codigos.length) return responder({ error: 'Faltan los códigos de cuenta.' }, 400)
    const corte = typeof hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? hasta : null
    const tope = Math.min(Number(limite) || 40, 200)

    const clave = Deno.env.get(cfg.secreto)
    if (!clave) throw new Error(`Falta la clave API de Odoo de ${empresa}.`)

    const cuentas = await odoo(cfg, clave, 'account.account', 'search_read', {
      domain: [['code', 'in', codigos.map(String)]], fields: ['code', 'name'], context: { active_test: false },
    })
    if (!cuentas.length) return responder({ empresa, hasta: corte, cuentas: [] })

    const salida = []
    for (const cta of cuentas) {
      const dominio: unknown[] = [['parent_state', '=', 'posted'], ['account_id', '=', cta.id]]
      if (corte) dominio.push(['date', '<=', corte])
      const lineas = await odoo(cfg, clave, 'account.move.line', 'search_read', {
        domain: dominio,
        fields: ['date', 'move_name', 'partner_id', 'name', 'balance', 'journal_id'],
        order: 'date desc', limit: 500,
      })
      const total = lineas.reduce((a: number, l: any) => a + (Number(l.balance) || 0), 0)
      const porTercero: Record<string, number> = {}
      for (const l of lineas) {
        const t = nombreDe(l.partner_id) || '(sin tercero)'
        porTercero[t] = (porTercero[t] || 0) + (Number(l.balance) || 0)
      }
      salida.push({
        codigo: cta.code, nombre: cta.name,
        apuntes: lineas.length,
        total: Math.round(total * 100) / 100,
        desde: lineas.length ? lineas[lineas.length - 1].date : null,
        ultimo: lineas.length ? lineas[0].date : null,
        terceros: Object.entries(porTercero)
          .map(([tercero, valor]) => ({ tercero, valor: Math.round(valor) }))
          .filter(x => x.valor)
          .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, 15),
        mayores: lineas
          .map((l: any) => ({
            fecha: l.date, documento: l.move_name, diario: nombreDe(l.journal_id),
            tercero: nombreDe(l.partner_id), concepto: l.name, valor: Math.round(Number(l.balance) || 0),
          }))
          .filter((l: any) => l.valor)
          .sort((a: any, b: any) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, tope),
      })
    }
    return responder({ empresa, hasta: corte, cuentas: salida })
  } catch (e) {
    return responder({ error: (e as Error).message || 'No se pudo consultar Odoo.' }, 502)
  }
})
