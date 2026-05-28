// Edge Function de Supabase para crear usuarios con rol
// Guardar en: supabase/functions/crear-usuario/index.ts
//
// Despliega con: supabase functions deploy crear-usuario
//
// Esta función usa la service_role key para crear usuarios como ADMIN

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verificar que el solicitante sea ADMIN
    const authHeader = req.headers.get('Authorization')
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })

    const { data: perfil } = await supabaseUser.from('profiles').select('rol').eq('id', user.id).single()
    if (perfil?.rol !== 'ADMIN') {
      return new Response(JSON.stringify({ error: 'Solo el ADMIN puede crear usuarios' }), { status: 403, headers: corsHeaders })
    }

    const { email, password, nombre, rol, almacen } = await req.json()
    if (!email || !password || !nombre || !rol) {
      return new Response(JSON.stringify({ error: 'Campos incompletos' }), { status: 400, headers: corsHeaders })
    }

    // Usar service_role para crear el usuario
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError) return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: corsHeaders })

    // Crear perfil
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: newUser.user.id,
      nombre,
      rol,
      almacen: almacen || null,
    })
    if (profileError) return new Response(JSON.stringify({ error: profileError.message }), { status: 400, headers: corsHeaders })

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
