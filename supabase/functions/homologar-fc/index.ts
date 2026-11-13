// YA SE EJECUTÓ — 13/11/2026. En Supabase esta función está desplegada DESACTIVADA (devuelve 410 y no
// escribe nada); este archivo queda como referencia de lo que se hizo, por si algún día hay que repetirlo.
// Resultado: Odoo FC pasó de 390 a 663 cuentas (273 creadas, 47 renombradas), sin mover una sola línea
// contable (39.897 antes y después) y sin tocar Feisen.
//
// Lo que hacía: Deja el plan de cuentas de Odoo FC igual al de Odoo Feisen.
// Angie lo pidió así: "coloca lo mismo que en feisen con los mismos números de cuenta y el mismo
// nombre, y si toca crear una cuenta adicional, hazlo".
// ESCRIBE EN ODOO FC. Nunca escribe en Feisen: Feisen es el molde.
// Esta función se borra apenas termine la homologación; la de Finanzas sigue siendo solo lectura.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const ODOO: Record<string, { url: string; db: string; secreto: string }> = {
  feisen: { url: 'https://construequiposfranco.odoo.com', db: 'snva-proyectos-master-construequipos-main-28681200', secreto: 'ODOO_FEISEN_APIKEY' },
  fc: { url: 'https://fc-sas.odoo.com', db: 'fc-sas', secreto: 'ODOO_FC_APIKEY' },
}
// En estas FC tiene el nombre bueno en español y Feisen quedó con el de Odoo en inglés
// ("Customers", "National", "Cost of sales") o con un nombre menos claro. Renombrarlas sería dañar
// cuentas con miles de movimientos, y las de socios Angie pidió dejarlas quietas.
const NO_RENOMBRAR = new Set(['130500', '133000', '133003', '220500', '233506', '613500'])
// Cuentas de Feisen que NO se copian a FC porque son suyas y de nadie más: su caja y sus bancos
// (Angie: "el banco en FC déjalo quieto"), sus créditos con el número de obligación, y las cuentas
// duplicadas que quedaron en Feisen con "(copia)" en el nombre.
const noCopiar = (codigo: string, nombre: string) =>
  /^11(05|10)/.test(codigo) || /\(copia\)/i.test(nombre) || /\b\d{7,}\b/.test(nombre)
// No existe en Feisen y FC sí la necesita: el arriendo de la bodega.
const EXTRA_FC = [{ code: '512005', name: 'Construcciones y edificaciones', account_type: 'expense' }]

const responder = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function odoo(cfg: { url: string; db: string }, clave: string, modelo: string, metodo: string, cuerpo: unknown) {
  const res = await fetch(`${cfg.url}/json/2/${modelo}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `bearer ${clave}`, 'X-Odoo-Database': cfg.db },
    body: JSON.stringify(cuerpo ?? {}),
  })
  const txt = await res.text()
  let data: any = null
  try { data = JSON.parse(txt) } catch { /* respuesta sin json */ }
  if (!res.ok) throw new Error(data?.message || txt.slice(0, 200) || res.statusText)
  return data
}

const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return responder({ error: 'No autorizado' }, 401)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: puede } = await userClient.rpc('ventas_puede_ver')
    if (puede !== true) return responder({ error: 'No tienes permiso.' }, 403)

    const { simular, soloCodigos } = await req.json()
    const leer = async (quien: 'feisen' | 'fc') => {
      const cfg = ODOO[quien]
      const clave = Deno.env.get(cfg.secreto)
      if (!clave) throw new Error(`Falta la clave API de ${quien}.`)
      const plan = await odoo(cfg, clave, 'account.account', 'search_read', { domain: [], fields: ['code', 'name', 'account_type', 'reconcile'], context: { active_test: false } })
      return { cfg, clave, plan }
    }
    const F = await leer('feisen'), C = await leer('fc')
    const enFc = new Map(C.plan.map((c: any) => [String(c.code), c]))
    const filtro = Array.isArray(soloCodigos) && soloCodigos.length ? new Set(soloCodigos.map(String)) : null

    const crear: any[] = [], renombrar: any[] = []
    for (const c of F.plan) {
      const cod = String(c.code)
      if (filtro && !filtro.has(cod)) continue
      const actual: any = enFc.get(cod)
      if (!actual) {
        if (!noCopiar(cod, c.name)) crear.push({ code: cod, name: c.name, account_type: c.account_type, reconcile: !!c.reconcile })
        continue
      }
      if (!NO_RENOMBRAR.has(cod) && norm(actual.name) !== norm(c.name)) renombrar.push({ id: actual.id, code: cod, de: actual.name, a: c.name })
    }
    if (!filtro) for (const e of EXTRA_FC) if (!enFc.has(e.code)) crear.push({ ...e, reconcile: false })

    if (simular) return responder({ simulacion: true, crear: crear.length, renombrar: renombrar.length, muestraCrear: crear.slice(0, 6), muestraRenombrar: renombrar.slice(0, 6) })

    const fallos: any[] = []
    let creadas = 0, renombradas = 0
    for (const c of crear) {
      try { await odoo(C.cfg, C.clave, 'account.account', 'create', { vals_list: [{ code: c.code, name: c.name, account_type: c.account_type, reconcile: c.reconcile }] }); creadas++ }
      catch (e) { fallos.push({ accion: 'crear', codigo: c.code, nombre: c.name, error: (e as Error).message }) }
    }
    for (const r of renombrar) {
      try { await odoo(C.cfg, C.clave, 'account.account', 'write', { ids: [r.id], vals: { name: r.a } }); renombradas++ }
      catch (e) { fallos.push({ accion: 'renombrar', codigo: r.code, error: (e as Error).message }) }
    }
    return responder({ creadas, renombradas, intentadasCrear: crear.length, intentadasRenombrar: renombrar.length, totalFallos: fallos.length, fallos: fallos.slice(0, 30) })
  } catch (e) {
    return responder({ error: (e as Error).message || 'Falló la homologación.' }, 502)
  }
})
