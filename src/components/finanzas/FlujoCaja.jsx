import { useMemo, useState } from 'react'
import { EncabezadoPagina } from '../shared/ui'
import { Bank, HandCoins, Receipt, TrendingUp, RefreshCw } from '../shared/iconos'
import {
  SelectorEmpresa, useEmpresa, useOdoo, Kpi, Cargando, ErrorOdoo,
  pesos, millones, hoyCol, diasEntre, sumarDias, fechaCorta, NOMBRE_EMPRESA,
} from './comun'

// Flujo de caja proyectado: saldo de bancos y caja hoy (Odoo) + lo que se espera cobrar − lo que
// hay que pagar, por semana según la fecha de vencimiento de cada factura pendiente.
// Supuesto: cada factura se cobra o se paga el día que vence. Lo ya vencido va en su propia fila
// y se puede sacar de la proyección (no se sabe cuándo se cobra/paga de verdad).
const SEMANAS = 8
// Bancos que no se suman al saldo de hoy. Decisión de Angie (30/10): el banco de FC en Odoo no es real
// ($1.476 M) mientras contabilidad lo organiza; solo cuenta el de Feisen. Quitar 'fc' cuando esté corregido.
const BANCOS_OMITIDOS = ['fc']

export default function FlujoCaja() {
  const [empresa, setEmpresa] = useEmpresa()
  const { datos, cargando, error, recargar } = useOdoo('pendientes', empresa)
  const [conVencidos, setConVencidos] = useState(true)
  const hoy = hoyCol()

  const calc = useMemo(() => {
    if (!datos) return null
    const bancos = Object.entries(datos).flatMap(([emp, d]) => (d.bancos || []).map(b => ({ ...b, emp, omitido: BANCOS_OMITIDOS.includes(emp) })))
    const saldoBancos = bancos.filter(b => !b.omitido).reduce((s, b) => s + b.saldo, 0)
    const filas = [
      { id: 'vencido', texto: 'Ya vencido', detalle: 'antes de hoy', cobros: 0, pagos: 0 },
      ...Array.from({ length: SEMANAS }, (_, i) => {
        const desde = sumarDias(hoy, i * 7)
        return { id: `s${i}`, texto: i === 0 ? 'Esta semana' : `Semana ${i + 1}`, detalle: `${fechaCorta(desde).slice(0, 5)} – ${fechaCorta(sumarDias(desde, 6)).slice(0, 5)}`, cobros: 0, pagos: 0 }
      }),
      { id: 'despues', texto: 'Después', detalle: `desde el ${fechaCorta(sumarDias(hoy, SEMANAS * 7))}`, cobros: 0, pagos: 0 },
    ]
    for (const d of Object.values(datos).flatMap(x => x.docs || [])) {
      const dias = d.vence ? diasEntre(hoy, d.vence) : 0
      const fila = dias < 0 ? filas[0] : dias >= SEMANAS * 7 ? filas[filas.length - 1] : filas[1 + Math.floor(dias / 7)]
      if (d.tipo === 'cobrar') fila.cobros += d.saldo
      else fila.pagos += d.saldo
    }
    return { bancos, saldoBancos, filas, vencCobrar: filas[0].cobros, vencPagar: filas[0].pagos }
  }, [datos, hoy])

  const proyeccion = useMemo(() => {
    if (!calc) return []
    let saldo = calc.saldoBancos
    return calc.filas.map(f => {
      const cuenta = f.id !== 'vencido' || conVencidos
      const neto = f.cobros - f.pagos
      if (cuenta) saldo += neto
      return { ...f, neto, saldo, cuenta }
    })
  }, [calc, conVencidos])

  const finSemanas = proyeccion[SEMANAS]
  const minimo = proyeccion.slice(0, SEMANAS + 1).filter(f => f.cuenta).reduce((m, f) => (!m || f.saldo < m.saldo ? f : m), null)
  const ambas = empresa === 'ambas'

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24 lg:pb-8">
      <EncabezadoPagina modulo="Finanzas" titulo="Flujo de caja"
        subtitulo="¿Nos alcanza la plata las próximas semanas? Bancos de hoy más cobros y pagos según el vencimiento de las facturas.">
        <button type="button" onClick={recargar} disabled={cargando}
          className="flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-60">
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </EncabezadoPagina>

      <SelectorEmpresa empresa={empresa} onCambiar={setEmpresa} />

      {cargando && !calc ? <Cargando /> : error ? <ErrorOdoo mensaje={error} onReintentar={recargar} /> : calc && <>
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${cargando ? 'opacity-60' : ''}`}>
          <Kpi Icono={Bank} clase="bg-feisen-azul-suave text-feisen-azul" titulo="Bancos hoy" valor={millones(calc.saldoBancos)}
            valorClase={calc.saldoBancos < 0 ? 'text-feisen-rojo' : 'text-feisen-texto'} detalle={calc.bancos.some(b => b.omitido) ? (empresa === 'fc' ? 'banco de FC sin contar' : 'solo Feisen, sin FC') : `${calc.bancos.length} cuentas y caja`} />
          <Kpi Icono={HandCoins} clase="bg-amber-50 text-amber-700" titulo="Cobrar vencido" valor={millones(calc.vencCobrar)} detalle="los clientes ya debían pagarlo" />
          <Kpi Icono={Receipt} clase="bg-feisen-rojo-suave text-feisen-rojo" titulo="Pagar vencido" valor={millones(calc.vencPagar)}
            valorClase={calc.vencPagar > 0 ? 'text-feisen-rojo' : 'text-feisen-texto'} detalle="ya debimos pagarlo" />
          <Kpi Icono={TrendingUp} clase={finSemanas.saldo < 0 ? 'bg-feisen-rojo-suave text-feisen-rojo' : 'bg-feisen-azul-suave text-feisen-azul'}
            titulo={`En ${SEMANAS} semanas`} valor={millones(finSemanas.saldo)} valorClase={finSemanas.saldo < 0 ? 'text-feisen-rojo' : 'text-feisen-texto'}
            detalle={minimo && minimo.saldo < 0 ? `queda en rojo: ${minimo.texto.toLowerCase()}` : 'saldo proyectado'} />
        </div>

        <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-feisen-borde-suave">
            <span className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Proyección por semana</span>
            <label className="flex items-center gap-2 text-sm text-feisen-texto-2 min-h-[36px] cursor-pointer">
              <input type="checkbox" checked={conVencidos} onChange={e => setConVencidos(e.target.checked)} className="w-4 h-4 accent-feisen-azul" />
              Contar lo vencido como si se cobrara y pagara ya
            </label>
          </div>
          <div className="hidden sm:grid grid-cols-[1fr_repeat(4,8.5rem)] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-feisen-texto-2 border-b border-feisen-borde-suave">
            <span>Periodo</span><span className="text-right">Cobros</span><span className="text-right">Pagos</span><span className="text-right">Neto</span><span className="text-right">Saldo</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_repeat(4,8.5rem)] gap-x-3 px-4 py-2.5 bg-feisen-fondo text-sm">
            <span className="col-span-1 sm:col-span-4 font-medium text-feisen-texto">Saldo en bancos hoy</span>
            <span className="text-right font-semibold tabular-nums text-feisen-texto">{pesos(calc.saldoBancos)}</span>
          </div>
          <div className="divide-y divide-feisen-borde-suave">
            {proyeccion.map(f => (
              <div key={f.id} className={`grid grid-cols-1 sm:grid-cols-[1fr_repeat(4,8.5rem)] gap-x-3 gap-y-1 px-4 py-2.5 text-sm ${f.cuenta ? '' : 'opacity-50'}`}>
                <span className="sm:col-span-1 min-w-0">
                  <span className="block font-medium text-feisen-texto">{f.texto}</span>
                  <span className="block text-xs text-feisen-texto-2">{f.cuenta ? f.detalle : 'no se cuenta'}</span>
                </span>
                <Celda etiqueta="Cobros" valor={f.cobros} />
                <Celda etiqueta="Pagos" valor={-f.pagos} />
                <Celda etiqueta="Neto" valor={f.neto} rojo={f.neto < 0} />
                <Celda etiqueta="Saldo" valor={f.saldo} rojo={f.saldo < 0} fuerte />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-feisen-borde-suave text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Bancos y caja en Odoo</div>
          <div className="divide-y divide-feisen-borde-suave">
            {calc.bancos.map(b => (
              <div key={b.emp + b.nombre} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${b.omitido ? 'opacity-50' : ''}`}>
                <span className="flex-1 min-w-0 truncate text-feisen-texto">
                  {b.nombre}{ambas && <span className="text-feisen-texto-2"> · {NOMBRE_EMPRESA[b.emp]}</span>}
                  {b.omitido && <span className="block text-xs text-feisen-texto-2">no se cuenta: el saldo en Odoo no es real</span>}
                </span>
                <span className={`tabular-nums ${b.omitido ? 'line-through text-feisen-texto-2' : b.saldo < 0 ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{pesos(b.saldo)}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-feisen-texto-2 leading-relaxed">
          Supone que cada factura se cobra o se paga el día que vence. No incluye nómina, impuestos, créditos ni compras que todavía
          no están facturadas en Odoo. El saldo de bancos es el contable de Odoo: si la conciliación bancaria está atrasada, puede no
          coincidir con el extracto. Las tarjetas de crédito no se cuentan como disponible. Por ahora el banco y la caja de FC tampoco
          (su saldo en Odoo no es real); los cobros y pagos de FC sí entran en la proyección.
        </p>
      </>}
    </div>
  )
}

function Celda({ etiqueta, valor, rojo, fuerte }) {
  return (
    <span className={`flex sm:block justify-between tabular-nums sm:text-right ${fuerte ? 'font-semibold' : ''} ${rojo ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>
      <span className="sm:hidden text-xs font-normal text-feisen-texto-2">{etiqueta}</span>{valor ? pesos(valor) : '—'}
    </span>
  )
}
