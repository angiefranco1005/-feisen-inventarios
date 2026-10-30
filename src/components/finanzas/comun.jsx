// Piezas comunes del módulo Finanzas. Los datos se leen en vivo de Odoo con la función
// finanzas-odoo (solo ADMIN); no se guarda nada en Supabase. Ver OBSERVACIONES.md (2026-10-30).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Segmentado } from '../shared/ui'

export const EMPRESAS = [
  { valor: 'feisen', texto: 'Feisen' },
  { valor: 'fc', texto: 'FC' },
  { valor: 'ambas', texto: 'Ambas' },
]
export const NOMBRE_EMPRESA = { feisen: 'Feisen', fc: 'FC' }
export const SIN_CENTRO = 'Sin centro'

// Las dos empresas tienen los mismos centros; FC llama "CONSTRU" a Construequipos
const ALIAS_CENTRO = { CONSTRU: 'CONSTRUEQUIPOS' }
export const normCentro = c => ALIAS_CENTRO[c] || c
export const nombreCentro = c => c === SIN_CENTRO ? c : c.charAt(0) + c.slice(1).toLowerCase()

export const hoyCol = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
export const diasEntre = (desde, hasta) => Math.round((new Date(`${hasta}T12:00:00`) - new Date(`${desde}T12:00:00`)) / 86400000)
export const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// $ 37.698.551 en tablas; $37,7 M en tarjetas
export const pesos = n => `$ ${Math.round(n || 0).toLocaleString('es-CO')}`
export function millones(n) {
  const v = Math.abs(n || 0)
  const signo = n < 0 ? '−' : ''
  if (v >= 1e9) return `${signo}$${(v / 1e9).toLocaleString('es-CO', { maximumFractionDigits: 2 })} mil M`
  if (v >= 1e6) return `${signo}$${(v / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  return `${signo}$${Math.round(v).toLocaleString('es-CO')}`
}
// '2026-10-05' → '05/10/2026'
export const fechaCorta = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—'

const CLAVE_EMPRESA = 'feisen-finanzas-empresa'
export function useEmpresa() {
  const [empresa, setEmpresa] = useState(() => {
    try { return localStorage.getItem(CLAVE_EMPRESA) || 'ambas' } catch { return 'ambas' }
  })
  const cambiar = v => { setEmpresa(v); try { localStorage.setItem(CLAVE_EMPRESA, v) } catch { /* sin almacenamiento */ } }
  return [empresa, cambiar]
}

export function SelectorEmpresa({ empresa, onCambiar }) {
  return <div className="w-full sm:w-64"><Segmentado opciones={EMPRESAS} valor={empresa} onCambiar={onCambiar} /></div>
}

// Llama a finanzas-odoo para una empresa o para las dos (en paralelo).
// Devuelve { datos: { feisen?, fc? }, cargando, error, recargar }.
export function useOdoo(accion, empresa, extra = {}) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: '' })
  const llave = JSON.stringify(extra)
  const cargar = useCallback(async () => {
    setEstado(e => ({ ...e, cargando: true, error: '' }))
    const lista = empresa === 'ambas' ? ['feisen', 'fc'] : [empresa]
    try {
      const resultados = await Promise.all(lista.map(async emp => {
        const { data, error } = await supabase.functions.invoke('finanzas-odoo', { body: { accion, empresa: emp, ...JSON.parse(llave) } })
        if (error) {
          let msg = error.message
          try { msg = (await error.context.json()).error || msg } catch { /* sin cuerpo */ }
          throw new Error(`${NOMBRE_EMPRESA[emp]}: ${msg}`)
        }
        if (data?.error) throw new Error(`${NOMBRE_EMPRESA[emp]}: ${data.error}`)
        return [emp, data]
      }))
      setEstado({ datos: Object.fromEntries(resultados), cargando: false, error: '' })
    } catch (e) {
      setEstado({ datos: null, cargando: false, error: e.message || 'No se pudo consultar Odoo.' })
    }
  }, [accion, empresa, llave])
  useEffect(() => { cargar() }, [cargar])
  return { ...estado, recargar: cargar }
}

export function Kpi({ Icono, clase, titulo, valor, detalle, activo, onClick, valorClase = 'text-feisen-texto' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`text-left bg-white border rounded-xl p-4 flex flex-col gap-1 min-w-0 ${activo ? 'border-feisen-azul ring-2 ring-feisen-azul-suave' : 'border-feisen-borde'} ${onClick ? 'hover:border-gray-300' : ''}`}>
      <span className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${clase}`}><Icono size={18} weight="duotone" /></span>
        <span className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2 truncate">{titulo}</span>
      </span>
      <span className={`text-2xl font-semibold tabular-nums truncate ${valorClase}`}>{valor}</span>
      {detalle && <span className="text-xs text-feisen-texto-2 truncate">{detalle}</span>}
    </Tag>
  )
}

export function Cargando({ texto = 'Consultando Odoo…' }) {
  return (
    <div className="bg-white border border-feisen-borde rounded-xl py-16 flex flex-col items-center gap-3">
      <span className="animate-spin h-8 w-8 border-[3px] border-feisen-azul border-t-transparent rounded-full" />
      <p className="text-sm text-feisen-texto-2">{texto}</p>
    </div>
  )
}

export function ErrorOdoo({ mensaje, onReintentar }) {
  return (
    <div className="bg-white border border-feisen-borde rounded-xl px-6 py-10 text-center space-y-2">
      <p className="font-semibold text-feisen-texto">No se pudo leer Odoo</p>
      <p className="text-sm text-feisen-rojo max-w-lg mx-auto">{mensaje}</p>
      <p className="text-xs text-feisen-texto-2 max-w-lg mx-auto">Si dice que rechazó la clave API, hay que crear una clave nueva en Odoo (duración "Persistente") y guardarla en Supabase › Edge Functions › Secrets.</p>
      <button type="button" onClick={onReintentar} className="mt-2 inline-flex items-center min-h-[40px] px-4 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">Reintentar</button>
    </div>
  )
}
