import { useMemo, useRef, useState } from 'react'
import { useAtajoBuscar } from '../../shared/ui'
import { ArrowLeft, Search, X, ChevronUp, ChevronDown } from '../../shared/iconos'
import { coincideBusqueda } from '../../../utils/busqueda'

// Informe completo de productos sin rotación (2026-11-05). Se abre desde el bloque de
// Rotación del Inicio (pestaña Inventarios) y respeta su filtro de bodega.
// "Sin rotación" = con existencia y sin movimiento en esa bodega en más de 30 días (o nunca).
// Ver OBSERVACIONES.md (2026-11-05) y la skill ux-feisen.

const fmt = n => Number(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })
const cop = n => `$ ${Math.round(Number(n) || 0).toLocaleString('es-CO')}`
const millones = n => `$${(Number(n || 0) / 1e6).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`
const cap = s => (s || '').charAt(0) + (s || '').slice(1).toLowerCase()
const fecha = f => f ? new Date(f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }) : '—'

const RANGOS = [
  { id: 'todos', texto: 'Todos', ok: () => true },
  { id: 'r60',   texto: '31–60 días', ok: f => f.dias !== null && f.dias <= 60 },
  { id: 'r90',   texto: 'Más de 60 días', ok: f => f.dias !== null && f.dias > 60 },
  { id: 'nunca', texto: 'Nunca se ha movido', ok: f => f.dias === null },
]
// Columnas ordenables. Días: los que nunca se han movido van como "más quietos".
const COLUMNAS = [
  { id: 'nombre',     texto: 'Producto',       val: f => f.nombre },
  { id: 'bodega',     texto: 'Bodega',         val: f => f.bodega },
  { id: 'q',          texto: 'Cantidad',       val: f => f.q, num: true },
  { id: 'costo',      texto: 'Costo unit.',    val: f => f.costo, num: true },
  { id: 'valor',      texto: 'Valor',          val: f => f.valor, num: true },
  { id: 'ultEntrada', texto: 'Última entrada', val: f => f.ultEntrada || '' },
  { id: 'ultSalida',  texto: 'Última salida',  val: f => f.ultSalida || '' },
  { id: 'dias',       texto: 'Días quieto',    val: f => f.dias ?? Infinity, num: true },
]
const PASO = 100

export default function InformeSinRotacion({ bodegas, bodega, onBodega, onVolver }) {
  const [buscar, setBuscar]     = useState('')
  const [rango, setRango]       = useState('todos')
  const [categoria, setCategoria] = useState('')
  const [orden, setOrden]       = useState({ col: 'valor', asc: false })
  const [limite, setLimite]     = useState(PASO)
  const refBuscar = useRef(null)
  useAtajoBuscar(refBuscar)

  const enBodega = bodega ? bodegas.filter(b => b.id === bodega) : bodegas
  const bodObj = bodegas.find(b => b.id === bodega)
  const valorBodegas = enBodega.reduce((t, b) => t + b.valor, 0)
  const base = useMemo(() => enBodega.flatMap(b => b.quietos.map(f => ({ ...f, bodega: cap(b.nombre) }))), [bodegas, bodega]) // eslint-disable-line react-hooks/exhaustive-deps

  const categorias = useMemo(() => {
    const c = {}
    base.forEach(f => { c[f.categoria] = (c[f.categoria] || 0) + 1 })
    return Object.entries(c).sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [base])

  // Lo que filtra todo menos el rango (para los conteos de los chips)
  const previo = base.filter(f => (!categoria || f.categoria === categoria) && coincideBusqueda(`${f.nombre} ${f.categoria}`, buscar))
  const filtroRango = RANGOS.find(r => r.id === rango)
  const colOrden = COLUMNAS.find(c => c.id === orden.col)
  const filas = previo.filter(filtroRango.ok).sort((a, b) => {
    const x = colOrden.val(a), y = colOrden.val(b)
    const r = colOrden.num ? x - y : String(x).localeCompare(String(y), 'es')
    return (orden.asc ? r : -r) || b.valor - a.valor
  })

  const valorFiltro = filas.reduce((t, f) => t + f.valor, 0)
  const valorQuieto = base.reduce((t, f) => t + f.valor, 0)
  const nunca = base.filter(f => f.dias === null)
  const hayFiltros = buscar || categoria || rango !== 'todos'
  const limpiar = () => { setBuscar(''); setCategoria(''); setRango('todos'); setLimite(PASO) }
  const ordenarPor = id => { setOrden(o => o.col === id ? { col: id, asc: !o.asc } : { col: id, asc: id === 'nombre' || id === 'bodega' }); setLimite(PASO) }

  const Flecha = ({ id }) => orden.col !== id ? null : orden.asc ? <ChevronUp size={12} className="inline" /> : <ChevronDown size={12} className="inline" />
  const Dias = ({ f }) => f.dias === null
    ? <span className="text-[11.5px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap bg-feisen-rojo-suave text-feisen-rojo">Nunca se ha movido</span>
    : <span className={`text-[11.5px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${f.dias > 60 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-feisen-texto-2'}`}>{f.dias} días</span>

  return (
    <section className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onVolver} className="inline-flex items-center gap-1 text-[13px] font-medium text-feisen-azul hover:underline mb-1">
            <ArrowLeft size={14} /> Volver a Inventarios
          </button>
          <h2 className="text-lg font-semibold text-feisen-texto">Productos sin rotación{bodObj ? ` · ${cap(bodObj.nombre)}` : ''}</h2>
          <p className="text-sm text-feisen-texto-2">Con existencia y sin movimiento en esa bodega en más de 30 días. Valores a precio de costo, a hoy.</p>
        </div>
        <select value={bodega} onChange={e => { onBodega(e.target.value); setCategoria(''); setLimite(PASO) }} aria-label="Bodega"
          className={`border rounded-lg px-2.5 py-2 text-[13px] ${bodega ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-semibold' : 'border-feisen-borde bg-white text-feisen-texto-2'}`}>
          <option value="">Todas las bodegas</option>
          {bodegas.map(b => <option key={b.id} value={b.id}>{cap(b.nombre)}</option>)}
        </select>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { e: 'Sin rotación', v: `${fmt(base.length)} productos`, c: bodega ? `en ${cap(bodObj?.nombre)}` : `en ${enBodega.filter(b => b.quietos.length).length} bodegas` },
          { e: 'Valor quieto', v: millones(valorQuieto), c: valorBodegas ? `${fmt((valorQuieto / valorBodegas) * 100)}% del valor de ${bodega ? 'la bodega' : 'las bodegas'}` : '' },
          { e: 'Nunca movidos', v: `${fmt(nunca.length)} productos`, c: millones(nunca.reduce((t, f) => t + f.valor, 0)), tono: nunca.length ? 'rojo' : '', ir: 'nunca' },
          { e: 'Más de 60 días', v: `${fmt(base.filter(f => f.dias > 60).length)} productos`, c: millones(base.filter(f => f.dias > 60).reduce((t, f) => t + f.valor, 0)), tono: 'ambar', ir: 'r90' },
        ].map(k => {
          const contenido = <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{k.e}</p>
            <p className={`text-xl font-semibold tabular-nums mt-0.5 ${k.tono === 'rojo' ? 'text-feisen-rojo' : k.tono === 'ambar' ? 'text-amber-700' : 'text-feisen-texto'}`}>{k.v}</p>
            <p className="text-xs text-feisen-texto-2">{k.c}</p>
          </>
          return k.ir
            ? <button key={k.e} onClick={() => { setRango(k.ir); setLimite(PASO) }} aria-pressed={rango === k.ir}
                className={`text-left bg-white border rounded-xl px-3.5 py-3 transition-colors ${rango === k.ir ? 'border-feisen-azul bg-feisen-azul-suave/30' : 'border-feisen-borde hover:border-feisen-azul'}`}>{contenido}</button>
            : <div key={k.e} className="bg-white border border-feisen-borde rounded-xl px-3.5 py-3">{contenido}</div>
        })}
      </div>

      {/* Lista */}
      <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
        <div className="p-3 border-b border-feisen-borde-suave space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <label className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input ref={refBuscar} value={buscar} onChange={e => { setBuscar(e.target.value); setLimite(PASO) }} placeholder="Buscar producto o categoría  ( / )"
                className="w-full border border-feisen-borde rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-feisen-azul" />
              {buscar && <button onClick={() => setBuscar('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-feisen-texto"><X size={14} /></button>}
            </label>
            <select value={categoria} onChange={e => { setCategoria(e.target.value); setLimite(PASO) }} aria-label="Categoría"
              className={`border rounded-lg px-2.5 py-2 text-[13px] max-w-full ${categoria ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-semibold' : 'border-feisen-borde bg-white text-feisen-texto-2'}`}>
              <option value="">Todas las categorías</option>
              {categorias.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {RANGOS.map(r => (
              <button key={r.id} onClick={() => { setRango(r.id); setLimite(PASO) }} aria-pressed={rango === r.id}
                className={`px-2.5 py-1 rounded-full border text-[12.5px] ${rango === r.id ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-semibold' : 'border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
                {r.texto} · {fmt(previo.filter(r.ok).length)}
              </button>
            ))}
            {hayFiltros && <button onClick={limpiar} className="ml-auto text-[12.5px] font-medium text-feisen-azul hover:underline">Quitar filtros</button>}
          </div>
          <p className="text-xs text-gray-400">
            {filas.length === base.length ? `${fmt(filas.length)} productos` : `${fmt(filas.length)} de ${fmt(base.length)} productos`} · {cop(valorFiltro)}
          </p>
        </div>

        {filas.length === 0 ? (
          <p className="px-4 py-8 text-sm text-feisen-texto-2 text-center">
            {base.length === 0
              ? `Todo lo que tiene existencia en ${bodObj ? cap(bodObj.nombre) : 'las bodegas'} se movió en los últimos 30 días.`
              : 'Ningún producto coincide con estos filtros. Prueba con otra palabra o quita los filtros.'}
          </p>
        ) : <>
          {/* Escritorio: tabla */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-feisen-fondo">
                <tr>
                  {COLUMNAS.filter(c => !(bodega && c.id === 'bodega')).map(c => (
                    <th key={c.id} aria-sort={orden.col === c.id ? (orden.asc ? 'ascending' : 'descending') : 'none'}
                      className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap ${c.num ? 'text-right' : 'text-left'}`}>
                      <button onClick={() => ordenarPor(c.id)} className="hover:text-feisen-texto">{c.texto} <Flecha id={c.id} /></button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-feisen-borde-suave">
                {filas.slice(0, limite).map(f => (
                  <tr key={`${f.item_id}-${f.bodega}`} className="hover:bg-feisen-fondo/60">
                    <td className="px-3 py-2 min-w-[220px]">
                      <span className="block font-medium text-feisen-texto">{f.nombre}</span>
                      <span className="block text-[11.5px] text-gray-400">{f.categoria} · {f.unidad}</span>
                    </td>
                    {!bodega && <td className="px-3 py-2 text-feisen-texto-2 whitespace-nowrap">{f.bodega}</td>}
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(f.q)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-feisen-texto-2">{f.costo ? cop(f.costo) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">{f.valor ? cop(f.valor) : '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-feisen-texto-2">{fecha(f.ultEntrada)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-feisen-texto-2">{fecha(f.ultSalida)}</td>
                    <td className="px-3 py-2 text-right"><Dias f={f} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: tarjetas */}
          <div className="md:hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-feisen-borde-suave text-[12.5px] text-feisen-texto-2">
              <span>Ordenar por</span>
              <select value={orden.col} onChange={e => ordenarPor(e.target.value)} aria-label="Ordenar por" className="border border-feisen-borde rounded-md px-2 py-1 bg-white">
                {COLUMNAS.filter(c => !(bodega && c.id === 'bodega')).map(c => <option key={c.id} value={c.id}>{c.texto}</option>)}
              </select>
              <button onClick={() => setOrden(o => ({ ...o, asc: !o.asc }))} className="px-2 py-1 border border-feisen-borde rounded-md">{orden.asc ? 'Menor a mayor' : 'Mayor a menor'}</button>
            </div>
            <div className="divide-y divide-feisen-borde-suave">
              {filas.slice(0, limite).map(f => (
                <div key={`${f.item_id}-${f.bodega}`} className="px-3 py-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[13.5px] text-feisen-texto">{f.nombre}</p>
                      <p className="text-[11.5px] text-gray-400">{bodega ? '' : `${f.bodega} · `}{f.categoria}</p>
                    </div>
                    <span className="text-right font-semibold tabular-nums whitespace-nowrap">{f.valor ? cop(f.valor) : '—'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-feisen-texto-2">
                    <Dias f={f} />
                    <span className="tabular-nums">{fmt(f.q)} {f.unidad}{f.costo ? ` × ${cop(f.costo)}` : ''}</span>
                  </div>
                  <p className="text-[11.5px] text-gray-400">Última entrada: {fecha(f.ultEntrada)} · Última salida: {fecha(f.ultSalida)}</p>
                </div>
              ))}
            </div>
          </div>

          {filas.length > limite && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-feisen-borde-suave text-[12.5px] text-gray-400">
              <span>Mostrando {fmt(limite)} de {fmt(filas.length)}</span>
              <button onClick={() => setLimite(l => l + PASO)} className="px-3 py-1.5 rounded-lg border border-feisen-borde text-feisen-texto hover:bg-feisen-fondo">Mostrar {Math.min(PASO, filas.length - limite)} más</button>
            </div>
          )}
        </>}
      </div>
      <p className="text-xs text-gray-400">Entrada = el producto llegó a la bodega (compra, recepción, traslado, ajuste). Salida = salió de ella (consumo, traslado, ajuste). No cuenta movimientos revertidos.</p>
    </section>
  )
}
