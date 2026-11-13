// Informe tributario de Feisen (solo Odoo Feisen, solo lectura, solo ADMIN).
// Responde lo que Angie necesita saber en vivo: cómo va el IVA del bimestre, cuánta retención le han
// practicado (los certificados) y cuánta autorretención lleva pagada, para estimar si al cierre del año
// le queda renta por pagar o un saldo a favor atrapado en la DIAN.
// Se inspira en el archivo del revisor fiscal (hojas "relacion impuestos" y "Anticipo Renta").
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const CFG = { url: 'https://construequiposfranco.odoo.com', db: 'snva-proyectos-master-construequipos-main-28681200', secreto: 'ODOO_FEISEN_APIKEY' }
const responder = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const r2 = (n: number) => Math.round(n * 100) / 100

async function odoo(clave: string, modelo: string, metodo: string, cuerpo: unknown) {
  const res = await fetch(`${CFG.url}/json/2/${modelo}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `bearer ${clave}`, 'X-Odoo-Database': CFG.db },
    body: JSON.stringify(cuerpo ?? {}),
  })
  const txt = await res.text()
  let data: any = null
  try { data = JSON.parse(txt) } catch { /* sin json */ }
  if (!res.ok) throw new Error(data?.message || txt.slice(0, 200) || res.statusText)
  return data
}

// Qué cuenta es qué. Los códigos son los del PUC que ya usa Feisen.
const GRUPOS: Record<string, (c: string) => boolean> = {
  iva_generado:      c => c === '240800' || c === '240801',
  iva_devoluciones:  c => c === '240802',
  iva_descontable:   c => c === '240804' || c === '240806' || c === '240810' || c === '240813',
  iva_por_pagar:     c => c === '240814',
  // Lo que le retuvieron a Feisen y lo que ella misma autorretuvo: se descuenta de la renta del año
  retenciones_certificados: c => c === '135501' || c === '135503' || c === '135504' || c === '135508',
  autorretenciones:  c => c === '135509' || c === '135510',
  // No son crédito de renta, pero Angie los ve en el informe del revisor
  anticipos_ica:     c => c === '135512' || c === '135513' || c === '135518',
  iva_retenido:      c => c === '135517',
  // Por pagar
  retefuente_pagar:  c => c.startsWith('2365') || c.startsWith('2367'),
  ica_pagar:         c => c.startsWith('2368') || c === '241200',
  // Para la pregunta de cuánto inventario se podría pasar al costo
  inventario:        c => c.startsWith('1405'),
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return responder({ error: 'No autorizado' }, 401)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: puede } = await userClient.rpc('ventas_puede_ver')
    if (puede !== true) return responder({ error: 'No tienes permiso para ver Finanzas.' }, 403)

    const clave = Deno.env.get(CFG.secreto)
    if (!clave) return responder({ error: `Falta la clave API de Odoo (secreto ${CFG.secreto}).` }, 500)
    const { anio } = await req.json()
    const y = /^\d{4}$/.test(String(anio || '')) ? String(anio) : String(new Date().getFullYear())

    const plan = await odoo(clave, 'account.account', 'search_read', { domain: [], fields: ['code', 'name', 'account_type'], context: { active_test: false } })
    const porId: Record<number, { codigo: string; nombre: string; tipo: string }> = {}
    for (const c of plan) porId[c.id] = { codigo: String(c.code), nombre: c.name, tipo: c.account_type }

    // Saldo acumulado de cada cuenta (todo el histórico) y movimiento mes a mes del año
    const agrupar = async (domain: unknown[], groupby: string[]) =>
      await odoo(clave, 'account.move.line', 'formatted_read_group', { domain, groupby, aggregates: ['balance:sum'] })

    const saldos: Record<string, number> = {}
    for (const g of await agrupar([['parent_state', '=', 'posted']], ['account_id'])) {
      const id = Array.isArray(g.account_id) ? g.account_id[0] : g.account_id
      const cta = porId[id]
      if (cta) saldos[cta.codigo] = r2((saldos[cta.codigo] || 0) + (g['balance:sum'] || 0))
    }

    // Movimiento por mes, solo de las cuentas de impuestos, para ver el IVA bimestre por bimestre
    const porMes: Record<string, Record<string, number>> = {}
    for (const g of await agrupar(
      [['parent_state', '=', 'posted'], ['date', '>=', `${y}-01-01`], ['date', '<=', `${y}-12-31`]],
      ['account_id', 'date:month'],
    )) {
      const id = Array.isArray(g.account_id) ? g.account_id[0] : g.account_id
      const cta = porId[id]
      if (!cta || !/^(2408|1355|2365|2367|2368|2412)/.test(cta.codigo)) continue
      const etiqueta = Array.isArray(g['date:month']) ? g['date:month'][0] : g['date:month']
      const mes = String(etiqueta).slice(0, 7)
      porMes[mes] = porMes[mes] || {}
      porMes[mes][cta.codigo] = r2((porMes[mes][cta.codigo] || 0) + (g['balance:sum'] || 0))
    }

    // Estado de resultados del año: ingresos, costos y gastos, para estimar la utilidad fiscal
    let ingresos = 0, costosGastos = 0
    for (const g of await agrupar(
      [['parent_state', '=', 'posted'], ['date', '>=', `${y}-01-01`], ['date', '<=', `${y}-12-31`]],
      ['account_id'],
    )) {
      const id = Array.isArray(g.account_id) ? g.account_id[0] : g.account_id
      const cta = porId[id]
      if (!cta) continue
      const v = g['balance:sum'] || 0
      if (cta.tipo === 'income' || cta.tipo === 'income_other') ingresos += -v
      else if (cta.tipo === 'expense' || cta.tipo === 'expense_direct_cost' || cta.tipo === 'expense_depreciation') costosGastos += v
    }

    const suma = (test: (c: string) => boolean) =>
      r2(Object.entries(saldos).filter(([c]) => test(c)).reduce((s, [, v]) => s + v, 0))
    const totales = Object.fromEntries(Object.entries(GRUPOS).map(([k, test]) => [k, suma(test)]))

    const detalle = Object.entries(saldos)
      .filter(([c]) => /^(2408|1355|2365|2367|2368|2412|1405)/.test(c))
      .map(([codigo, saldo]) => ({ codigo, nombre: Object.values(porId).find(x => x.codigo === codigo)?.nombre || '', saldo }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo))

    return responder({
      anio: y,
      resultado: { ingresos: r2(ingresos), costosGastos: r2(costosGastos), utilidad: r2(ingresos - costosGastos) },
      totales, detalle, porMes,
    })
  } catch (e) {
    return responder({ error: (e as Error).message || 'No se pudo consultar Odoo.' }, 502)
  }
})
