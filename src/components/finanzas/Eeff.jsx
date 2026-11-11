import { useState } from 'react'
import { EncabezadoPagina } from '../shared/ui'
import { hoyCol } from './comun'

// EEFF consolidados de Feisen y FC, armados paso a paso con el método de Angie (empezó con octubre 2026).
// Estructura = hoja "P&G CONSOLIDADO" de su Excel EEFF 2026. Cada renglón se llena cuando Angie
// explica de dónde sale el dato (Odoo de cada empresa o lo que hoy saca a mano). Ver OBSERVACIONES.md.
// Feisen = contabilidad con IVA (facturas); FC = la que va sin IVA (remisiones / caja).

export const PYG = [
  { seccion: 'Ingresos', filas: [
    { id: 'ventas', nombre: 'Ventas' },
    { id: 'devoluciones', nombre: '(−) Devoluciones y descuentos' },
  ], total: 'Ingresos netos' },
  { seccion: 'Costos directos', filas: [
    { id: 'materia_prima', nombre: 'Materia prima' },
    { id: 'mano_obra', nombre: 'Mano de obra' },
  ] },
  { seccion: 'Costos indirectos (CIF)', filas: [
    { id: 'servicios_publicos', nombre: 'Servicios públicos' },
    { id: 'mantenimiento', nombre: 'Mantenimiento equipos planta' },
    { id: 'transporte', nombre: 'Transporte' },
    { id: 'dotacion', nombre: 'Dotación' },
    { id: 'insumos', nombre: 'Insumos' },
  ], total: 'Utilidad bruta' },
  { seccion: 'Gastos operacionales', filas: [
    { id: 'viaticos', nombre: 'Viáticos' },
    { id: 'publicidad', nombre: 'Publicidad' },
    { id: 'comisiones', nombre: 'Comisiones' },
    { id: 'nomina_comercial', nombre: 'Nómina asesores y director comercial' },
    { id: 'sueldos_marketing', nombre: 'Sueldos marketing / community' },
    { id: 'honorarios', nombre: 'Honorarios' },
    { id: 'nomina_admin', nombre: 'Nómina administrativa' },
    { id: 'otros_operacionales', nombre: 'Otros gastos operacionales' },
  ], total: 'Utilidad operacional' },
  { seccion: 'Gastos no operacionales', filas: [
    { id: 'intereses_impuestos', nombre: 'Intereses de impuestos' },
    { id: 'gravamenes', nombre: 'Gravámenes (4x1000)' },
    { id: 'intereses_bancarios', nombre: 'Intereses bancarios' },
    { id: 'comisiones_financieras', nombre: 'Comisiones financieras' },
  ], total: 'Utilidad neta' },
]

const COLUMNAS = ['Feisen', 'FC', 'Total']

export default function Eeff() {
  const [mes, setMes] = useState('2026-10')
  const [y, m] = mes.split('-').map(Number)
  const nombreMes = new Date(y, m - 1, 15).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  const definidas = 0
  const totalFilas = PYG.reduce((s, b) => s + b.filas.length, 0)

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24 lg:pb-8">
      <EncabezadoPagina modulo="Finanzas" titulo="EEFF"
        subtitulo="Estado de resultados de Feisen y FC juntos, armado paso a paso con tu método." />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-feisen-texto-2">
          Mes
          <input type="month" value={mes} max={hoyCol().slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)}
            className="min-h-[42px] border border-feisen-borde rounded-lg px-3 bg-white text-feisen-texto focus:outline-none focus:ring-2 focus:ring-feisen-azul-suave" />
        </label>
        <span className="text-xs bg-amber-50 text-amber-700 rounded-md px-2 py-0.5 font-medium">
          En construcción: {definidas} de {totalFilas} renglones con fuente definida
        </span>
      </div>

      <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-feisen-borde-suave">
          <span className="text-sm font-semibold text-feisen-texto">P&amp;G · {nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}</span>
          <span className="text-xs text-feisen-texto-2">Feisen = con IVA · FC = sin IVA</span>
        </div>
        <div className="hidden sm:grid grid-cols-[1fr_repeat(3,8rem)] gap-3 px-4 py-2 border-b border-feisen-borde-suave text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">
          <span>Concepto</span>
          {COLUMNAS.map(c => <span key={c} className="text-right">{c}</span>)}
        </div>
        {PYG.map(b => (
          <div key={b.seccion}>
            <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-feisen-azul">{b.seccion}</div>
            <div className="divide-y divide-feisen-borde-suave">
              {b.filas.map(f => (
                <div key={f.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)] gap-3 px-4 py-2 text-sm items-center">
                  <span className="text-feisen-texto pl-3">{f.nombre}</span>
                  <span className="sm:hidden text-xs text-feisen-texto-2">por definir</span>
                  {COLUMNAS.map(c => <span key={c} className="hidden sm:block text-right text-gray-300">—</span>)}
                </div>
              ))}
            </div>
            {b.total && (
              <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)] gap-3 px-4 py-2.5 bg-feisen-fondo border-y border-feisen-borde-suave text-sm font-semibold">
                <span className="text-feisen-texto">{b.total}</span>
                <span className="sm:hidden text-gray-300">—</span>
                {COLUMNAS.map(c => <span key={c} className="hidden sm:block text-right text-gray-300">—</span>)}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-feisen-texto-2 leading-relaxed">
        La estructura es la de la hoja "P&amp;G CONSOLIDADO" de tu Excel EEFF 2026. Cada renglón se llena cuando definamos de dónde sale el
        dato: de Odoo de cada empresa (con el plan de cuentas ya homologado) o de lo que hoy sacas a mano. Después vienen la repartición por
        centro (Construequipos, Fundición Hierro, Aluminio) y el balance.
      </p>
    </div>
  )
}
