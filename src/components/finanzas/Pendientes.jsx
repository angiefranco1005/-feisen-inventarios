import { useMemo, useRef, useState } from 'react'
import { EncabezadoPagina, PanelLateral, useAtajoBuscar } from '../shared/ui'
import { coincideBusqueda } from '../../utils/busqueda'
import { HandCoins, Receipt, WarningOctagon, Clock, Users, Search, ChevronRight, RefreshCw, X } from '../shared/iconos'
import {
  SelectorEmpresa, useEmpresa, useOdoo, Kpi, Cargando, ErrorOdoo,
  pesos, millones, hoyCol, diasEntre, fechaCorta, NOMBRE_EMPRESA,
} from './comun'

// Cartera (por cobrar) y cuentas por pagar: facturas sin saldar en Odoo, por tercero y por edad.
// Un saldo negativo es un anticipo o nota crédito a favor y resta del total del tercero.
const TEXTOS = {
  cobrar: {
    titulo: 'Cartera', subtitulo: '¿Quién nos debe y qué tan atrasado está? Facturas de cliente sin pagar en Odoo.',
    tercero: 'Cliente', terceros: 'clientes', Icono: HandCoins, vacio: 'Ningún cliente tiene facturas pendientes.',
  },
  pagar: {
    titulo: 'Cuentas por pagar', subtitulo: '¿A quién le debemos y qué ya se venció? Facturas de proveedor sin pagar en Odoo.',
    tercero: 'Proveedor', terceros: 'proveedores', Icono: Receipt, vacio: 'No hay facturas de proveedor pendientes.',
  },
}

export const EDADES = [
  { id: 'aldia', texto: 'Al día', prueba: d => d <= 0 },
  { id: '1-30', texto: '1–30 días', prueba: d => d >= 1 && d <= 30 },
  { id: '31-60', texto: '31–60', prueba: d => d >= 31 && d <= 60 },
  { id: '61-90', texto: '61–90', prueba: d => d >= 61 && d <= 90 },
  { id: '90+', texto: 'Más de 90', prueba: d => d > 90 },
]

export default function Pendientes({ tipo }) {
  const t = TEXTOS[tipo]
  const [empresa, setEmpresa] = useEmpresa()
  const { datos, cargando, error, recargar } = useOdoo('pendientes', empresa)
  const [busqueda, setBusqueda] = useState('')
  const [edad, setEdad] = useState('')
  const [abierto, setAbierto] = useState(null)
  const buscarRef = useRef(null)
  useAtajoBuscar(buscarRef)
  const hoy = hoyCol()

  const calc = useMemo(() => {
    if (!datos) return null
    const docs = Object.entries(datos).flatMap(([emp, d]) => (d.docs || [])
      .filter(x => x.tipo === tipo)
      .map(x => ({ ...x, emp, atraso: x.vence ? diasEntre(x.vence, hoy) : 0 })))
    const porEdad = Object.fromEntries(EDADES.map(e => [e.id, 0]))
    for (const x of docs) porEdad[EDADES.find(e => e.prueba(x.atraso)).id] += x.saldo
    const terceros = {}
    for (const x of docs) {
      const g = terceros[x.tercero] ??= { tercero: x.tercero, total: 0, vencido: 0, docs: [], mayorAtraso: 0, empresas: new Set() }
      g.total += x.saldo
      if (x.atraso > 0) { g.vencido += x.saldo; g.mayorAtraso = Math.max(g.mayorAtraso, x.atraso) }
      g.docs.push(x); g.empresas.add(x.emp)
    }
    const total = docs.reduce((s, x) => s + x.saldo, 0)
    const vencido = docs.filter(x => x.atraso > 0).reduce((s, x) => s + x.saldo, 0)
    const proximos = docs.filter(x => x.atraso <= 0 && x.atraso >= -30).reduce((s, x) => s + x.saldo, 0)
    return { docs, porEdad, terceros: Object.values(terceros), total, vencido, proximos }
  }, [datos, tipo, hoy])

  const filtroEdad = EDADES.find(e => e.id === edad)
  const lista = useMemo(() => {
    if (!calc) return []
    return calc.terceros
      .filter(g => coincideBusqueda(g.tercero, busqueda))
      .map(g => {
        if (!filtroEdad) return g
        const docs = g.docs.filter(x => filtroEdad.prueba(x.atraso))
        return { ...g, docsFiltrados: docs, enEdad: docs.reduce((s, x) => s + x.saldo, 0) }
      })
      .filter(g => !filtroEdad || g.docsFiltrados.length)
      .sort((a, b) => filtroEdad ? b.enEdad - a.enEdad : (b.vencido - a.vencido || b.total - a.total))
  }, [calc, busqueda, filtroEdad])

  const ambas = empresa === 'ambas'
  const g = abierto && calc?.terceros.find(x => x.tercero === abierto)

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24 lg:pb-8">
      <EncabezadoPagina modulo="Finanzas" titulo={t.titulo} subtitulo={t.subtitulo}>
        <button type="button" onClick={recargar} disabled={cargando}
          className="flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-60">
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </EncabezadoPagina>

      <SelectorEmpresa empresa={empresa} onCambiar={setEmpresa} />

      {cargando && !calc ? <Cargando /> : error ? <ErrorOdoo mensaje={error} onReintentar={recargar} /> : calc && <>
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${cargando ? 'opacity-60' : ''}`}>
          <Kpi Icono={WarningOctagon} clase="bg-feisen-rojo-suave text-feisen-rojo" titulo="Vencido" valor={millones(calc.vencido)}
            valorClase={calc.vencido > 0 ? 'text-feisen-rojo' : 'text-feisen-texto'}
            detalle={calc.total > 0 ? `${Math.round(calc.vencido / calc.total * 100)} % del total` : 'nada vencido'} />
          <Kpi Icono={Clock} clase="bg-amber-50 text-amber-700" titulo="Próx. 30 días" valor={millones(calc.proximos)} detalle="vence pronto, aún al día" />
          <Kpi Icono={t.Icono} clase="bg-feisen-azul-suave text-feisen-azul" titulo="Total" valor={millones(calc.total)}
            detalle={`${calc.docs.length} documentos`} />
          <Kpi Icono={Users} clase="bg-gray-100 text-feisen-texto-2" titulo={t.terceros} valor={calc.terceros.length}
            detalle={`${calc.terceros.filter(x => x.vencido > 0).length} con saldo vencido`} />
        </div>

        {/* Edades: cada barra filtra la lista */}
        <div className="bg-white border border-feisen-borde rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Por días de vencida</span>
            {edad && <button type="button" onClick={() => setEdad('')} className="text-xs text-feisen-azul flex items-center gap-1"><X size={12} /> Quitar filtro</button>}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {EDADES.map((e, i) => {
              const v = calc.porEdad[e.id]
              const max = Math.max(...Object.values(calc.porEdad), 1)
              const color = ['bg-feisen-azul', 'bg-amber-500', 'bg-feisen-rojo opacity-60', 'bg-feisen-rojo opacity-80', 'bg-feisen-rojo'][i]
              return (
                <button key={e.id} type="button" onClick={() => setEdad(edad === e.id ? '' : e.id)} aria-pressed={edad === e.id}
                  className={`text-left rounded-lg p-2 min-w-0 border ${edad === e.id ? 'border-feisen-azul bg-feisen-azul-suave' : 'border-transparent hover:bg-feisen-fondo'}`}>
                  <span className="block h-16 flex items-end">
                    <span className={`block w-full rounded-t ${color}`}
                      style={{ height: `${Math.max(v > 0 ? 4 : 0, v / max * 100)}%` }} />
                  </span>
                  <span className="block text-[11px] text-feisen-texto-2 mt-1.5 truncate">{e.texto}</span>
                  <span className="block text-sm font-semibold tabular-nums text-feisen-texto truncate">{millones(v)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-feisen-borde-suave">
            <Search size={16} className="text-feisen-texto-2" />
            <input ref={buscarRef} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder={`Buscar ${t.tercero.toLowerCase()}…  ( / )`}
              className="flex-1 min-h-[36px] text-sm focus:outline-none bg-transparent" />
            <span className="text-xs text-feisen-texto-2 shrink-0">{lista.length} de {calc.terceros.length}</span>
          </div>
          {lista.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-feisen-texto-2">
              {calc.terceros.length === 0 ? t.vacio : `Ningún ${t.tercero.toLowerCase()} coincide${busqueda ? ` con "${busqueda}"` : ''}${filtroEdad ? ` en ${filtroEdad.texto.toLowerCase()}` : ''}.`}
            </p>
          ) : (
            <div className="divide-y divide-feisen-borde-suave">
              {lista.map(x => (
                <button key={x.tercero} type="button" onClick={() => setAbierto(x.tercero)}
                  className="relative w-full flex items-center gap-3 text-left px-4 py-3 hover:bg-feisen-fondo">
                  {x.vencido > 0 && <span className={`absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r ${x.mayorAtraso > 30 ? 'bg-feisen-rojo' : 'bg-amber-500'}`} />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-feisen-texto truncate">{x.tercero}</span>
                    <span className="block text-xs text-feisen-texto-2 truncate">
                      {ambas && `${[...x.empresas].map(e => NOMBRE_EMPRESA[e]).join(' y ')} · `}
                      {x.docs.length} {x.docs.length === 1 ? 'documento' : 'documentos'}
                      {x.mayorAtraso > 0 && ` · el más atrasado: ${x.mayorAtraso} días`}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-sm font-semibold tabular-nums text-feisen-texto">{pesos(filtroEdad ? x.enEdad : x.total)}</span>
                    {!filtroEdad && x.vencido > 0 && <span className="block text-xs tabular-nums text-feisen-rojo">{pesos(x.vencido)} vencido</span>}
                    {!filtroEdad && x.total < 0 && <span className="block text-xs text-feisen-texto-2">a favor</span>}
                  </span>
                  <ChevronRight size={16} className="text-gray-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </>}

      {g && (
        <PanelLateral etiqueta={g.tercero} onCerrar={() => setAbierto(null)}
          encabezado={<>
            <p className="text-xs text-feisen-texto-2">{t.tercero}</p>
            <h2 className="text-lg font-semibold text-feisen-texto">{g.tercero}</h2>
            <p className="text-sm text-feisen-texto-2 tabular-nums">Total {pesos(g.total)}{g.vencido > 0 && <> · <span className="text-feisen-rojo">vencido {pesos(g.vencido)}</span></>}</p>
          </>}>
          <div className="divide-y divide-feisen-borde-suave -mx-1">
            {[...g.docs].sort((a, b) => b.atraso - a.atraso).map((x, i) => (
              <div key={x.documento + i} className="flex items-start gap-3 px-1 py-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-feisen-texto">{x.documento || 'Sin número'}{ambas && <span className="text-feisen-texto-2"> · {NOMBRE_EMPRESA[x.emp]}</span>}</span>
                  <span className="block text-xs text-feisen-texto-2">Fecha {fechaCorta(x.fecha)} · vence {fechaCorta(x.vence)}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-sm tabular-nums text-feisen-texto">{pesos(x.saldo)}</span>
                  {x.atraso > 0
                    ? <span className={`inline-block mt-0.5 rounded-md px-2 py-0.5 text-xs font-medium ${x.atraso > 30 ? 'bg-feisen-rojo-suave text-feisen-rojo' : 'bg-amber-50 text-amber-700'}`}>{x.atraso} días vencida</span>
                    : <span className="block text-xs text-feisen-texto-2">{x.atraso === 0 ? 'vence hoy' : `en ${-x.atraso} días`}</span>}
                </span>
              </div>
            ))}
          </div>
        </PanelLateral>
      )}
    </div>
  )
}
