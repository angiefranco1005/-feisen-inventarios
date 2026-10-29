import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchAllPages } from '../../../utils/fetchAllPages'
import Spinner from '../../shared/Spinner'
import Alerta from '../shared/Alerta'
import plantilla from './plantilla.html?raw'
import { montarDashboardVentas } from './montarDashboardVentas'
import './ventas.css'

// Mes 'YYYY-MM' → número continuo que usa el tablero (2026-04 = 4, 2027-01 = 13)
function mesNum(ym) {
  const [y, m] = ym.split('-').map(Number)
  return (y - 2026) * 12 + m
}

async function traerFilas(origen) {
  const { data, error } = await fetchAllPages((desde, hasta) =>
    supabase.from('ventas_odoo')
      .select('empresa, mes, cliente, producto, valor, cantidad, archivo, created_at')
      .eq('origen', origen).order('id').range(desde, hasta)
  )
  if (error) throw error
  return data
}

// Filas 'base' → { C, P, R } como venía incrustado en el artefacto
function armarBase(filas) {
  const C = [], P = [], iC = {}, iP = {}
  const idx = (lista, mapa, v) => (mapa[v] ??= lista.push(v) - 1)
  const R = filas.map(f => [
    f.empresa === 'fc' ? 1 : 0, idx(C, iC, f.cliente), idx(P, iP, f.producto),
    mesNum(f.mes), Number(f.valor), Number(f.cantidad),
  ])
  return { C, P, R }
}

// Filas 'odoo' → documentos por empresa y mes, con la forma del db del artefacto
function armarSnapshot(filas) {
  const docs = {}
  filas.forEach(f => {
    const k = f.empresa + '|' + f.mes
    const d = docs[k] ??= { empresa: f.empresa, mes: f.mes, filas: [], archivo: f.archivo || '', subido: f.created_at }
    d.filas.push({ c: f.cliente, p: f.producto, v: Number(f.valor), q: Number(f.cantidad) })
  })
  return { docs: Object.values(docs).map(x => ({ data: () => x })) }
}

export default function DashboardVentas() {
  const { esAdmin } = useAuth()
  const root = useRef(null)
  const api = useRef(null)
  const [estado, setEstado] = useState({ cargando: true, error: null, base: null, snapshot: null })

  useEffect(() => {
    let vivo = true
    Promise.all([traerFilas('base'), traerFilas('odoo')])
      .then(([b, o]) => vivo && setEstado({ cargando: false, error: null, base: armarBase(b), snapshot: armarSnapshot(o) }))
      .catch(e => vivo && setEstado({ cargando: false, error: e.message || 'No se pudieron cargar las ventas.' }))
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (!estado.base || !root.current) return
    root.current.innerHTML = plantilla
    api.current = montarDashboardVentas(root.current, {
      base: estado.base,
      snapshot: estado.snapshot,
      puedeCargar: esAdmin,
      guardarMes: async body => {
        const { error } = await supabase.rpc('ventas_cargar_mes', {
          p_empresa: body.empresa, p_mes: body.mes, p_filas: body.filas, p_archivo: body.archivo,
        })
        if (error) throw error
      },
      traerDeOdoo: async (empresa, mes) => {
        const { data, error } = await supabase.functions.invoke('ventas-odoo', { body: { empresa, mes } })
        if (error) {
          const cuerpo = await error.context?.json?.().catch(() => null)
          throw new Error(cuerpo?.error || 'No se pudo consultar Odoo.')
        }
        return data
      },
      alGuardar: async () => {
        try { api.current?.actualizar(armarSnapshot(await traerFilas('odoo'))) } catch { /* el mensaje de guardado ya salió */ }
      },
    })
    return () => { api.current?.desmontar(); api.current = null }
  }, [estado.base, estado.snapshot, esAdmin])

  if (estado.cargando) return <Spinner texto="Cargando ventas..." />
  if (estado.error) return <Alerta tipo="error" mensaje={estado.error} />
  return <div className="dv" ref={root} />
}
