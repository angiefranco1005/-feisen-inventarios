import { useMemo, useState } from 'react'
import { EncabezadoPagina, PanelLateral } from '../shared/ui'
import { ChartPieSlice, TrendingUp, ShoppingCart, Scale, ChevronRight, RefreshCw } from '../shared/iconos'
import {
  SelectorEmpresa, useEmpresa, useOdoo, Kpi, Cargando, ErrorOdoo,
  SIN_CENTRO, normCentro, nombreCentro, pesos, millones, hoyCol, NOMBRE_EMPRESA,
} from './comun'

// Resultado del mes por centro (línea de negocio) = ventas − compras a proveedores.
// Decisiones de Angie (2026-10-30):
//  - El costo es lo comprado a proveedores en Odoo (facturas de proveedor menos notas crédito, sin IVA),
//    no las cuentas contables (nómina, depreciación y costo de ventas contable no entran).
//  - Lo que no trae centro en Odoo (ventas o compras) se reparte entre los centros según sus ventas del mes.
//  - "Ambas" suma Feisen y FC sin quitar lo que se compran entre ellas.

// Arma las filas de una empresa: ventas y compras por centro, con lo 'Sin centro' repartido
function porCentro(datos) {
  const ventasDir = {}, comprasDir = {}
  for (const [c, v] of Object.entries(datos.ventas || {})) ventasDir[normCentro(c)] = (ventasDir[normCentro(c)] || 0) + v
  for (const f of datos.compras || []) comprasDir[normCentro(f.centro)] = (comprasDir[normCentro(f.centro)] || 0) + f.valor

  const ventasSin = ventasDir[SIN_CENTRO] || 0
  const comprasSin = comprasDir[SIN_CENTRO] || 0
  const base = Object.entries(ventasDir).filter(([c, v]) => c !== SIN_CENTRO && v > 0)
  const totalBase = base.reduce((s, [, v]) => s + v, 0)
  const centros = new Set([...Object.keys(ventasDir), ...Object.keys(comprasDir)])
  if (totalBase > 0) centros.delete(SIN_CENTRO)

  const filas = {}
  for (const c of centros) {
    const peso = totalBase > 0 ? (ventasDir[c] > 0 ? ventasDir[c] / totalBase : 0) : (c === SIN_CENTRO ? 1 : 0)
    const repVentas = totalBase > 0 ? ventasSin * peso : 0
    const repCompras = totalBase > 0 ? comprasSin * peso : 0
    filas[c] = {
      centro: c,
      ventas: (ventasDir[c] || 0) + repVentas,
      compras: (comprasDir[c] || 0) + repCompras,
      comprasRepartidas: repCompras,
      peso,
    }
  }
  return { filas, comprasSin, ventasSin, repartido: totalBase > 0 }
}

export default function ResultadoCentros() {
  const [empresa, setEmpresa] = useEmpresa()
  const [mes, setMes] = useState(() => hoyCol().slice(0, 7))
  const { datos, cargando, error, recargar } = useOdoo('resultado', empresa, { mes })
  const [abierto, setAbierto] = useState(null)

  const calc = useMemo(() => {
    if (!datos) return null
    const filas = {}
    let comprasSin = 0, ventasSin = 0
    const porEmpresa = {}
    for (const [emp, d] of Object.entries(datos)) {
      const r = porCentro(d)
      porEmpresa[emp] = r
      comprasSin += r.comprasSin; ventasSin += r.ventasSin
      for (const f of Object.values(r.filas)) {
        const t = filas[f.centro] ??= { centro: f.centro, ventas: 0, compras: 0, comprasRepartidas: 0 }
        t.ventas += f.ventas; t.compras += f.compras; t.comprasRepartidas += f.comprasRepartidas
      }
    }
    const lista = Object.values(filas).map(f => ({ ...f, resultado: f.ventas - f.compras }))
      .sort((a, b) => (a.centro === SIN_CENTRO) - (b.centro === SIN_CENTRO) || b.ventas - a.ventas)
    const total = lista.reduce((t, f) => ({ ventas: t.ventas + f.ventas, compras: t.compras + f.compras }), { ventas: 0, compras: 0 })
    return { lista, total: { ...total, resultado: total.ventas - total.compras }, comprasSin, ventasSin, porEmpresa }
  }, [datos])

  const esMesActual = mes === hoyCol().slice(0, 7)
  const margen = (r, v) => v > 0 ? `${Math.round(r / v * 100)} %` : '—'
  const [y, m] = mes.split('-').map(Number)
  const nombreMes = new Date(y, m - 1, 15).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24 lg:pb-8">
      <EncabezadoPagina modulo="Finanzas" titulo="Resultado por centro"
        subtitulo="¿Cuánto deja cada línea de negocio? Ventas menos compras a proveedores, del mes, leídas de Odoo.">
        <button type="button" onClick={recargar} disabled={cargando}
          className="flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-60">
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </EncabezadoPagina>

      <div className="flex flex-wrap items-center gap-3">
        <SelectorEmpresa empresa={empresa} onCambiar={setEmpresa} />
        <label className="flex items-center gap-2 text-sm text-feisen-texto-2">
          Mes
          <input type="month" value={mes} max={hoyCol().slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)}
            className="min-h-[42px] border border-feisen-borde rounded-lg px-3 bg-white text-feisen-texto focus:outline-none focus:ring-2 focus:ring-feisen-azul-suave" />
        </label>
        {esMesActual && <span className="text-xs bg-amber-50 text-amber-700 rounded-md px-2 py-0.5 font-medium">Mes en curso: cifras parciales</span>}
      </div>

      {cargando && !calc ? <Cargando /> : error ? <ErrorOdoo mensaje={error} onReintentar={recargar} /> : calc && <>
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${cargando ? 'opacity-60' : ''}`}>
          <Kpi Icono={TrendingUp} clase="bg-feisen-azul-suave text-feisen-azul" titulo="Ventas" valor={millones(calc.total.ventas)} detalle={`sin IVA · ${nombreMes}`} />
          <Kpi Icono={ShoppingCart} clase="bg-gray-100 text-feisen-texto-2" titulo="Compras" valor={millones(calc.total.compras)}
            detalle={calc.total.ventas > 0 ? `${Math.round(calc.total.compras / calc.total.ventas * 100)} % de las ventas` : 'a proveedores'} />
          <Kpi Icono={Scale} clase={calc.total.resultado < 0 ? 'bg-feisen-rojo-suave text-feisen-rojo' : 'bg-feisen-azul-suave text-feisen-azul'} titulo="Resultado"
            valor={millones(calc.total.resultado)} valorClase={calc.total.resultado < 0 ? 'text-feisen-rojo' : 'text-feisen-texto'}
            detalle={`margen ${margen(calc.total.resultado, calc.total.ventas)}`} />
          <Kpi Icono={ChartPieSlice} clase="bg-amber-50 text-amber-700" titulo="Sin centro" valor={millones(calc.comprasSin)}
            detalle={calc.comprasSin ? 'repartidas según ventas' : 'todo tiene centro en Odoo'} />
        </div>

        {calc.lista.length === 0 ? (
          <div className="bg-white border border-feisen-borde rounded-xl px-6 py-12 text-center space-y-1">
            <p className="font-semibold text-feisen-texto">No hay facturas de venta ni de compra en {nombreMes}</p>
            <p className="text-sm text-feisen-texto-2">Si el mes apenas empieza, vuelve cuando haya facturas publicadas en Odoo, o elige otro mes.</p>
          </div>
        ) : (
          <div className={`bg-white border border-feisen-borde rounded-xl overflow-hidden ${cargando ? 'opacity-60' : ''}`}>
            <div className="hidden sm:grid grid-cols-[1fr_repeat(3,9rem)_4.5rem_1.25rem] gap-3 px-4 py-2.5 border-b border-feisen-borde-suave text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">
              <span>Centro</span><span className="text-right">Ventas</span><span className="text-right">Compras</span><span className="text-right">Resultado</span><span className="text-right">Margen</span><span />
            </div>
            <div className="divide-y divide-feisen-borde-suave">
              {calc.lista.map(f => (
                <button key={f.centro} type="button" onClick={() => setAbierto(f.centro)}
                  className="w-full text-left px-4 py-3 hover:bg-feisen-fondo grid grid-cols-1 sm:grid-cols-[1fr_repeat(3,9rem)_4.5rem_1.25rem] gap-x-3 gap-y-1 items-center">
                  <span className="sm:col-span-1 min-w-0">
                    <span className="block font-semibold text-sm text-feisen-texto truncate">{nombreCentro(f.centro)}</span>
                    {f.comprasRepartidas > 0 && <span className="block text-xs text-feisen-texto-2 truncate" title="Parte de las compras sin centro, repartida según ventas">+{millones(f.comprasRepartidas)} repartido</span>}
                  </span>
                  <Cifra etiqueta="Ventas" valor={f.ventas} />
                  <Cifra etiqueta="Compras" valor={f.compras} />
                  <Cifra etiqueta="Resultado" valor={f.resultado} fuerte rojo={f.resultado < 0} />
                  <span className="flex sm:block justify-between sm:text-right text-sm tabular-nums text-feisen-texto-2"><span className="sm:hidden text-xs">Margen</span>{margen(f.resultado, f.ventas)}</span>
                  <ChevronRight size={16} className="hidden sm:block text-gray-400" />
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_repeat(3,9rem)_4.5rem_1.25rem] gap-x-3 gap-y-1 px-4 py-3 border-t border-feisen-borde bg-feisen-fondo">
              <span className="sm:col-span-1 font-semibold text-sm text-feisen-texto">Total</span>
              <Cifra etiqueta="Ventas" valor={calc.total.ventas} fuerte />
              <Cifra etiqueta="Compras" valor={calc.total.compras} fuerte />
              <Cifra etiqueta="Resultado" valor={calc.total.resultado} fuerte rojo={calc.total.resultado < 0} />
              <span className="text-right text-sm tabular-nums font-semibold text-feisen-texto">{margen(calc.total.resultado, calc.total.ventas)}</span>
              <span />
            </div>
          </div>
        )}

        <p className="text-xs text-feisen-texto-2 leading-relaxed">
          Ventas = facturas de cliente menos notas crédito. Compras = facturas de proveedor menos notas crédito; no incluye nómina,
          depreciación ni otros asientos contables. Lo que en Odoo no tiene centro se reparte entre los centros según lo que vendió cada uno en el mes.
          {empresa === 'ambas' && ' "Ambas" suma Feisen y FC sin quitar lo que se compran entre ellas.'}
        </p>
      </>}

      {abierto && calc && (
        <DetalleCentro centro={abierto} datos={datos} calc={calc} nombreMes={nombreMes} onCerrar={() => setAbierto(null)} />
      )}
    </div>
  )
}

function Cifra({ etiqueta, valor, fuerte, rojo }) {
  return (
    <span className={`flex sm:block justify-between text-sm tabular-nums sm:text-right ${fuerte ? 'font-semibold' : ''} ${rojo ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>
      <span className="sm:hidden text-xs font-normal text-feisen-texto-2">{etiqueta}</span>{pesos(valor)}
    </span>
  )
}

// Panel: de dónde salen las compras del centro (por proveedor y por cuenta), más su parte de lo sin centro
function DetalleCentro({ centro, datos, calc, nombreMes, onCerrar }) {
  const fila = calc.lista.find(f => f.centro === centro)
  const [vista, setVista] = useState('proveedor')

  const lineas = []
  for (const [emp, d] of Object.entries(datos)) {
    const r = calc.porEmpresa[emp]
    const peso = r.repartido ? (r.filas[centro]?.peso || 0) : 1
    for (const f of d.compras || []) {
      const c = normCentro(f.centro)
      if (c === centro) lineas.push({ ...f, emp, valor: f.valor, repartida: false })
      else if (c === SIN_CENTRO && r.repartido && peso > 0) lineas.push({ ...f, emp, valor: f.valor * peso, repartida: true })
    }
  }
  const clave = vista === 'proveedor' ? 'proveedor' : vista === 'cuenta' ? 'cuenta' : 'concepto'
  const grupos = {}
  for (const l of lineas) {
    const g = grupos[l[clave]] ??= { nombre: l[clave], valor: 0, repartida: 0, empresas: new Set() }
    g.valor += l.valor
    if (l.repartida) g.repartida += l.valor
    g.empresas.add(l.emp)
  }
  const lista = Object.values(grupos).sort((a, b) => b.valor - a.valor)
  const ambas = Object.keys(datos).length > 1

  return (
    <PanelLateral etiqueta={`Compras de ${nombreCentro(centro)}`} onCerrar={onCerrar}
      encabezado={<>
        <p className="text-xs text-feisen-texto-2">{nombreMes}</p>
        <h2 className="text-lg font-semibold text-feisen-texto">{nombreCentro(centro)}</h2>
        <p className="text-sm text-feisen-texto-2 tabular-nums">Ventas {pesos(fila.ventas)} · Compras {pesos(fila.compras)}</p>
      </>}>
      <div className="grid grid-cols-3 gap-1 bg-feisen-fondo rounded-lg p-1 text-sm">
        {[['proveedor', 'Proveedor'], ['cuenta', 'Cuenta'], ['concepto', 'Producto']].map(([v, t]) => (
          <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v}
            className={`min-h-[36px] rounded-md font-medium ${vista === v ? 'bg-white text-feisen-azul shadow-sm' : 'text-feisen-texto-2'}`}>{t}</button>
        ))}
      </div>
      {lista.length === 0 ? (
        <p className="text-sm text-feisen-texto-2">Este centro no tiene compras a proveedores en el mes.</p>
      ) : (
        <div className="divide-y divide-feisen-borde-suave -mx-1">
          {lista.map(g => (
            <div key={g.nombre} className="flex items-start gap-3 px-1 py-2.5">
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-feisen-texto">{g.nombre}</span>
                <span className="block text-xs text-feisen-texto-2">
                  {ambas && [...g.empresas].map(e => NOMBRE_EMPRESA[e]).join(' y ')}
                  {ambas && g.repartida > 0 && ' · '}
                  {g.repartida > 0 && (g.repartida === g.valor ? 'repartido (sin centro en Odoo)' : `${pesos(g.repartida)} repartido`)}
                </span>
              </span>
              <span className="text-sm tabular-nums text-feisen-texto shrink-0">{pesos(g.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </PanelLateral>
  )
}
