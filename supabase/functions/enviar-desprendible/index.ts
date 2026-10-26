// Edge Function: envía por correo el desprendible de pago de una persona
// (nómina quincenal de RRHH) usando Resend.
//
// La llama la app cuando gerencia (ADMIN) aprueba la quincena. El PDF lo arma
// la app y llega en base64. Solo ADMIN puede enviar, y solo de quincenas
// aprobadas. Deja registrado en la liquidación a quién y cuándo se envió (o el
// error, para poder reenviar).
//
// Secretos que hay que configurar en Supabase (Edge Functions → Secrets):
//   RESEND_API_KEY      clave de la cuenta de Resend
//   NOMINA_REMITENTE    p. ej.  Feisen Nómina <nomina@feisen.com.co>
//                       (el dominio debe estar verificado en Resend)
//   NOMINA_RESPONDER_A  opcional: correo al que llegan las respuestas
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'No autorizado' }, 401)
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
    if (perfil?.rol !== 'ADMIN') return json({ error: 'Solo gerencia (ADMIN) puede enviar los desprendibles' }, 403)

    const { liquidacion_id, para, nombre, periodo, pdf_base64, nombre_archivo } = await req.json()
    if (!liquidacion_id || !para || !pdf_base64) return json({ error: 'Faltan datos para enviar el correo' }, 400)

    // Solo quincenas aprobadas
    const { data: liq, error: errLiq } = await supabase.from('nomina_liquidaciones')
      .select('id, nomina_periodos(estado)').eq('id', liquidacion_id).single()
    if (errLiq || !liq) return json({ error: 'No se encontró la liquidación' }, 404)
    // @ts-ignore relación embebida
    if (liq.nomina_periodos?.estado !== 'aprobada') return json({ error: 'La quincena no está aprobada' }, 400)

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const remitente = Deno.env.get('NOMINA_REMITENTE')
    if (!apiKey || !remitente) return json({ error: 'Falta configurar RESEND_API_KEY o NOMINA_REMITENTE en Supabase' }, 500)

    const saludo = nombre ? `Hola, ${escapar(String(nombre).split(' ')[0])}:` : 'Hola:'
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:14px;line-height:1.5">
        <p>${saludo}</p>
        <p>Adjuntamos tu desprendible de pago correspondiente al periodo <strong>${escapar(String(periodo || ''))}</strong>.</p>
        <p>Si tienes alguna duda sobre los valores, comunícate con Recursos Humanos.</p>
        <p style="color:#6b7280">Feisen S.A.S.</p>
      </div>`

    const envio: Record<string, unknown> = {
      from: remitente,
      to: [para],
      subject: `Desprendible de pago — ${periodo || ''}`,
      html,
      attachments: [{ filename: nombre_archivo || 'desprendible.pdf', content: pdf_base64 }],
    }
    const responderA = Deno.env.get('NOMINA_RESPONDER_A')
    if (responderA) envio.reply_to = responderA

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(envio),
    })
    const resultado = await resp.json().catch(() => ({}))

    if (!resp.ok) {
      const mensaje = resultado?.message || `Resend respondió ${resp.status}`
      await supabase.from('nomina_liquidaciones').update({ email_error: mensaje }).eq('id', liquidacion_id)
      return json({ error: mensaje }, 502)
    }

    await supabase.from('nomina_liquidaciones')
      .update({ email_enviado_a: para, email_enviado_en: new Date().toISOString(), email_error: null })
      .eq('id', liquidacion_id)
    return json({ ok: true, id: resultado?.id })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
