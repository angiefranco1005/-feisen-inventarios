// Función de un solo uso (4/11/2026): pasa las firmas viejas que están guardadas como imagen
// dentro de `movimientos` (data:image/png;base64…) a archivos en Storage y deja el enlace.
// - Archivo por contenido: remisiones/firmas/migradas/<md5>.png → la misma firma repetida en
//   varias líneas de un movimiento se sube una sola vez (2.496 firmas → 688 archivos).
// - Re-ejecutable: sube con upsert y solo actualiza la fila si la columna todavía es una imagen
//   (filtro id + like 'data:image%'; filtrar por la imagen completa no sirve: va en la URL y
//   da 400). Cada llamada procesa un lote y dice cuántas quedan; se llama hasta que queden 0.
// - Solo toca foto_remision_url y firma_receptor_url (ningún trigger de movimientos mira esas
//   columnas). Se borra la función al terminar.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { crypto } from 'jsr:@std/crypto@1'
import { encodeHex } from 'jsr:@std/encoding@1/hex'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const COLUMNAS = ['foto_remision_url', 'firma_receptor_url'] as const
const LOTE = 100

async function aArchivo(dataUrl: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const hash = encodeHex(await crypto.subtle.digest('MD5', new TextEncoder().encode(dataUrl)))
  const path = `firmas/migradas/${hash}.png`
  const { error } = await db.storage.from('remisiones').upload(path, bytes, { contentType: 'image/png', upsert: true })
  if (error) throw new Error(`${path}: ${error.message}`)
  return db.storage.from('remisiones').getPublicUrl(path).data.publicUrl
}

Deno.serve(async () => {
  const resumen: Record<string, unknown> = {}
  for (const col of COLUMNAS) {
    const { data: filas, error } = await db.from('movimientos').select(`id, ${col}`).like(col, 'data:image%').limit(LOTE)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const subidas = new Map<string, string>()
    let actualizadas = 0
    for (const f of filas as Record<string, string>[]) {
      const img = f[col]
      if (!subidas.has(img)) subidas.set(img, await aArchivo(img))
      const { error: e, count } = await db.from('movimientos').update({ [col]: subidas.get(img) }, { count: 'exact' })
        .eq('id', f.id).like(col, 'data:image%')
      if (e) return Response.json({ error: e.message, resumen }, { status: 500 })
      actualizadas += count ?? 0
    }
    const { count: quedan } = await db.from('movimientos').select('id', { count: 'exact', head: true }).like(col, 'data:image%')
    resumen[col] = { actualizadas, quedan }
  }
  return Response.json(resumen)
})
