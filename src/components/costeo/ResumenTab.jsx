import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatPct } from './utils/format'

export default function ResumenTab({ fichaId }) {
  const [resumen, setResumen] = useState(null)
  const [precioVenta, setPrecioVenta] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const debounceRef = useRef(null)
  const editadoPorUsuario = useRef(false)

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('costeo_resumen')
      .select('*')
      .eq('ficha_id', fichaId)
      .maybeSingle()
    if (!error && data) {
      setResumen(data)
      setPrecioVenta(data.precio_venta_actual ?? '')
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  async function guardarPrecio(valor) {
    setGuardando(true)
    await supabase
      .from('costeo_fichas')
      .update({ precio_venta_actual: Number(valor || 0), updated_at: new Date().toISOString() })
      .eq('id', fichaId)
    await cargar()
    setGuardando(false)
    setGuardadoOk(true)
    setTimeout(() => setGuardadoOk(false), 1500)
  }

  function onChangePrecio(valor) {
    editadoPorUsuario.current = true
    setPrecioVenta(valor)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      guardarPrecio(valor)
    }, 800)
  }

  function onBlurPrecio() {
    if (!editadoPorUsuario.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    editadoPorUsuario.current = false
    guardarPrecio(precioVenta)
  }

  if (loading || !resumen) {
    return <p className="text-sm text-feisen-texto-2">Cargando…</p>
  }

  const margenPositivo = Number(resumen.margen) >= 0

  return (
    <div className="max-w-xl">
      <div className="bg-white border border-feisen-borde rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium">Precio de venta actual (COP)</label>
          <span className="text-xs text-feisen-texto-2">
            {guardando ? 'Guardando…' : guardadoOk ? 'Guardado ✓' : ' '}
          </span>
        </div>
        <input
          type="number"
          step="any"
          value={precioVenta}
          onChange={(e) => onChangePrecio(e.target.value)}
          onBlur={onBlurPrecio}
          className="w-full border border-feisen-borde rounded-md px-3 py-2 text-lg font-semibold outline-none focus:border-feisen-azul"
        />
        <p className="text-xs text-feisen-texto-2 mt-1">
          Se guarda solo, sin necesidad de darle a ningún botón — cambia el número y listo.
        </p>
      </div>

      <div className="bg-white border border-feisen-borde rounded-lg divide-y divide-feisen-borde mb-6">
        <Fila label="Total Materiales (MP)" value={formatCOP(resumen.total_mp)} />
        <Fila label="Total Mano de Obra (MOD)" value={formatCOP(resumen.total_mod)} />
        <Fila label="Total CIF asignado" value={formatCOP(resumen.cif_asignado)} />
        {Number(resumen.total_equipos) > 0 && (
          <Fila label="Costo de equipos de planta" value={formatCOP(resumen.total_equipos)} />
        )}
        {Number(resumen.costo_piezas_incluidas) > 0 && (
          <>
            <Fila label="Subtotal (propio de esta ficha)" value={formatCOP(resumen.costo_propio)} />
            <Fila label="Costo de piezas incluidas" value={formatCOP(resumen.costo_piezas_incluidas)} />
          </>
        )}
        <div className="flex justify-between px-4 py-3 bg-feisen-azul text-white font-semibold rounded-b-lg">
          <span>COSTO TOTAL DE PRODUCCIÓN</span>
          <span>{formatCOP(resumen.costo_total)}</span>
        </div>
      </div>

      <div className="bg-white border border-feisen-borde rounded-lg divide-y divide-feisen-borde">
        <Fila
          label="Margen $"
          value={formatCOP(resumen.margen)}
          highlight={margenPositivo ? 'text-feisen-azul' : 'text-feisen-rojo'}
        />
        <Fila
          label="Margen %"
          value={formatPct(resumen.margen_pct)}
          highlight={margenPositivo ? 'text-feisen-azul' : 'text-feisen-rojo'}
        />
      </div>
    </div>
  )
}

function Fila({ label, value, highlight }) {
  return (
    <div className="flex justify-between px-4 py-3">
      <span className="text-sm">{label}</span>
      <span className={`text-sm font-semibold ${highlight ?? ''}`}>{value}</span>
    </div>
  )
}
