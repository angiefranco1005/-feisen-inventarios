import { supabase } from '../lib/supabase'

// Firmas como archivo (4/11/2026). Antes cada firma se guardaba como imagen dentro del
// movimiento (data:image/png;base64…, ~20 KB por firma) y la tabla de movimientos pesaba
// ~31 MB, casi todo firmas. Ahora se sube a Storage (bucket público 'remisiones', carpeta
// firmas/AAAA-MM/) y en el movimiento queda solo el enlace.
// Si la subida falla (sin señal, etc.) se guarda la imagen como antes: el movimiento
// nunca se pierde por culpa de la firma.

const CARPETA = 'firmas/'

export async function subirFirma(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl || null
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const mes  = new Date().toISOString().slice(0, 7)
    const path = `${CARPETA}${mes}/${crypto.randomUUID()}.png`
    const { error } = await supabase.storage.from('remisiones').upload(path, blob, { contentType: 'image/png' })
    if (error) throw error
    const url = supabase.storage.from('remisiones').getPublicUrl(path)?.data?.publicUrl
    if (!url) throw new Error('Sin enlace público')
    return url
  } catch (e) {
    console.warn('No se pudo subir la firma, se guarda dentro del movimiento:', e)
    return dataUrl
  }
}

// ¿Este valor de foto_remision_url es una firma (imagen vieja o archivo en firmas/) y no
// la foto de una remisión?
export const esFirma = url => !!url && (url.startsWith('data:image') || url.includes(`/remisiones/${CARPETA}`))
