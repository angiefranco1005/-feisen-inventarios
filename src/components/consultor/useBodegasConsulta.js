import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// Bodegas que puede consultar el rol CONSULTOR (Ventas / Comercial).
// Normalmente son sus bodegas asignadas. Cuando el ADMIN usa "ver como Consultor"
// sus bodegas son null (ve todo), así que se toma MOTORES para que la vista
// previa muestre lo mismo que ve Ventas.
// Devuelve undefined mientras carga, [] si no tiene bodegas, o el array de ids.
export function useBodegasConsulta(activo = true) {
  const { bodegasPermitidas, cargando } = useAuth()
  const [motores, setMotores] = useState(undefined)

  useEffect(() => {
    if (!activo || cargando || Array.isArray(bodegasPermitidas)) return
    supabase.from('bodegas').select('id').ilike('nombre', 'MOTORES')
      .then(({ data }) => setMotores((data || []).map(b => b.id)))
  }, [activo, bodegasPermitidas, cargando])

  if (cargando) return undefined
  return Array.isArray(bodegasPermitidas) ? bodegasPermitidas : motores
}
