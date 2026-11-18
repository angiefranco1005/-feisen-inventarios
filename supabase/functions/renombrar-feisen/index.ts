// Renombra unas cuentas concretas del plan de Feisen. ESCRIBE EN ODOO.
//
// Por qué existe: el plan de Feisen trae nombres en inglés de la instalación de Odoo
// ("Customers", "Withheld at source"...). El 18/11/2026 Angie pidió pasarlos a español:
// "Cambia eso de 'customers' por clientes nacionales... la 135501, ponle el nombre en
// español. la 135517 también en español, la 18 también, la 20 también".
//
// Es de un solo uso y a propósito está limitada:
//  - Solo Feisen, solo las cuentas de la lista de abajo, solo el campo `name`.
//  - No toca códigos, ni saldos, ni apuntes, ni cuentas que no estén en la lista.
//  - Si una cuenta ya tiene el nombre nuevo, no hace nada con ella.
//
// Cuando termine su trabajo se deja como cascarón que responde 410, igual que se hizo
// con `homologar-fc` el 13/11/2026.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const CFG = { url: 'https://construequiposfranco.odoo.com', db: 'snva-proyectos-master-construequipos-main-28681200' }
const responder = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// La lista completa de lo que esta función puede tocar. Nada fuera de aquí se cambia.
const RENOMBRES: Record<string, string> = {
  '130500': 'Clientes nacionales',
  '135501': 'Anticipo de impuestos y contribuciones o saldos a favor',
  '135517': 'Impuesto a las ventas retenido',
  '135518': 'Impuesto de industria y comercio retenido',
  '135520': 'Retención en la fuente',
}

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return responder({ error: 'No autorizado' }, 401)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: puede } = await userClient.rpc('ventas_puede_ver')
    if (puede !== true) return responder({ error: 'No tienes permiso.' }, 403)

    const { simular } = await req.json().catch(() => ({ simular: true }))
    const clave = Deno.env.get('ODOO_FEISEN_APIKEY')
    if (!clave) throw new Error('Falta la clave API de Odoo de Feisen.')

    const codigos = Object.keys(RENOMBRES)
    const cuentas = await odoo(clave, 'account.account', 'search_read', {
      domain: [['code', 'in', codigos]], fields: ['code', 'name'], context: { active_test: false },
    })

    const plan = cuentas.map((c: any) => ({
      codigo: c.code, id: c.id, antes: c.name, despues: RENOMBRES[c.code],
      cambia: c.name !== RENOMBRES[c.code],
    }))
    const faltantes = codigos.filter(c => !cuentas.some((x: any) => x.code === c))

    if (simular !== false) return responder({ simulacion: true, plan, faltantes })

    const hechos = []
    for (const p of plan.filter((x: any) => x.cambia)) {
      await odoo(clave, 'account.account', 'write', { ids: [p.id], vals: { name: p.despues } })
      hechos.push({ codigo: p.codigo, antes: p.antes, despues: p.despues })
    }
    return responder({ simulacion: false, renombradas: hechos.length, hechos, faltantes })
  } catch (e) {
    return responder({ error: (e as Error).message || 'No se pudo escribir en Odoo.' }, 502)
  }
})
