import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { coincideBusqueda } from '../../utils/busqueda'
import Spinner from '../shared/Spinner'
import { EncabezadoPagina, PanelLateral, useAtajoBuscar } from '../shared/ui'
import { Flame, Search, Plus, X, ChevronRight, Clock } from '../shared/iconos'

function numFun(n) {
  return `FUN-${String(n).padStart(4, '0')}`
}

function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

function fmtHora(h) {
  if (!h) return '—'
  return h.slice(0, 5)
}

function fmtNum(v, unit) {
  if (v == null || v === '') return '—'
  return `${parseFloat(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unit}`
}

const MATERIALES = [
  { key: 'peso_vaceadero',            label: 'Peso vaceadero',            unit: 'kg' },
  { key: 'hierro_colado',             label: 'Hierro colado',             unit: 'kg' },
  { key: 'hierro_colado_contaminado', label: 'Hierro colado contaminado', unit: 'kg' },
  { key: 'carbon',                    label: 'Carbón',                    unit: 'kg' },
  { key: 'caliza',                    label: 'Caliza',                    unit: 'kg' },
  { key: 'ferromolido',               label: 'Ferromolido',               unit: 'kg' },
  { key: 'exlac',                     label: 'Exlac',                     unit: 'kg' },
]

// ── Ayudas de presentación (solo visual) ────────────────────────────────────
const hoyCol = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

function fechaLegible(f) {
  if (!f) return 'Sin fecha'
  const d = new Date(f + 'T12:00:00')
  const mismoAnio = f.slice(0, 4) === hoyCol().slice(0, 4)
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', ...(mismoAnio ? {} : { year: 'numeric' }) })
}

// Duración entre hora de inicio y fin ("4 h 45 min"); si pasa de medianoche suma 24 h
function duracion(ini, fin) {
  if (!ini || !fin) return null
  const min = t => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
  let d = min(fin) - min(ini)
  if (d < 0) d += 24 * 60
  const h = Math.floor(d / 60), m = d % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

const personas = arr => (arr || []).filter(Boolean)

// Texto donde busca el buscador: N°, fecha, personal y observaciones
const textoBusqueda = f => [
  numFun(f.numero), String(f.numero), fmtFecha(f.fecha),
  ...personas(f.horneros), ...personas(f.vaceadores), ...personas(f.auxiliares),
  f.observaciones || '',
].join(' ')

const POR_PAGINA = 60

export default function ListaFundidas() {
  const navigate = useNavigate()
  const buscarRef = useRef(null)
  useAtajoBuscar(buscarRef)

  const [fundidas,  setFundidas]  = useState([])
  const [cargando,  setCargando]  = useState(true)
  const [detalleId, setDetalleId] = useState(null)
  const [busqueda,  setBusqueda]  = useState('')
  const [filtro,    setFiltro]    = useState('todas')
  const [visibles,  setVisibles]  = useState(POR_PAGINA)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase
      .from('fundidas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000)
    setFundidas(data || [])
    setCargando(false)
  }

  // Al cambiar búsqueda o filtro se vuelve a la primera página
  useEffect(() => { setVisibles(POR_PAGINA) }, [busqueda, filtro])

  const mesActual = hoyCol().slice(0, 7)
  const pasaFiltro = {
    todas:   () => true,
    mes:     f => (f.fecha || '').startsWith(mesActual),
    novedad: f => !!f.observaciones,
  }
  const coincidentes = fundidas.filter(f => coincideBusqueda(textoBusqueda(f), busqueda))
  const conteos = Object.fromEntries(Object.entries(pasaFiltro).map(([k, fn]) => [k, coincidentes.filter(fn).length]))
  const filtradas = coincidentes.filter(pasaFiltro[filtro])
  const enPantalla = filtradas.slice(0, visibles)
  const detalle = detalleId ? fundidas.find(f => f.id === detalleId) : null

  const CHIPS = [['todas', 'Todas'], ['mes', 'Este mes'], ['novedad', 'Con novedad']]

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <EncabezadoPagina modulo="Fundición" titulo="Fundidas"
        subtitulo="Cada colada del horno: quién trabajó, qué materiales se usaron y las novedades.">
        <button type="button" onClick={() => navigate('/fundidas/nueva')}
          className="inline-flex items-center gap-1.5 bg-feisen-azul text-white rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:opacity-90 active:scale-[.98] transition">
          <Plus size={16} /> Nueva fundida
        </button>
      </EncabezadoPagina>

      {/* Búsqueda y filtros */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input ref={buscarRef} type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por N°, fecha, hornero, vaceador o novedad…"
            aria-label="Buscar fundidas"
            className="w-full border border-feisen-borde rounded-lg pl-10 pr-10 min-h-[44px] bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
          <kbd className="hidden lg:block absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 border border-feisen-borde rounded px-1.5">/</kbd>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
          {CHIPS.map(([k, t]) => (
            <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}
              className={`shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors
                ${filtro === k ? 'bg-feisen-texto text-white border-feisen-texto' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
              {t} <span className={`tabular-nums ${filtro === k ? 'text-white/70' : 'text-gray-400'}`}>{conteos[k].toLocaleString('es-CO')}</span>
            </button>
          ))}
          {busqueda.trim() && (
            <button type="button" onClick={() => setBusqueda('')}
              className="shrink-0 inline-flex items-center gap-1 min-h-[36px] bg-feisen-azul-suave text-feisen-azul rounded-full pl-3 pr-2 text-sm font-medium max-w-[16rem]">
              <span className="truncate">“{busqueda.trim()}”</span> <X size={14} className="shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* Lista */}
      {cargando ? (
        <Spinner texto="Cargando fundidas..." />
      ) : fundidas.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl px-6 py-12 text-center">
          <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-feisen-fondo grid place-items-center text-feisen-texto-2">
            <Flame size={20} />
          </div>
          <p className="font-semibold text-feisen-texto">Aún no hay fundidas registradas</p>
          <p className="text-sm text-feisen-texto-2 mt-1 max-w-sm mx-auto">
            Al terminar cada colada, registra el personal y los materiales. Carbón, caliza, ferromolido y exlac se descuentan solos de la bodega de Fundición.
          </p>
          <button type="button" onClick={() => navigate('/fundidas/nueva')}
            className="mt-4 inline-flex items-center gap-1.5 text-feisen-azul font-semibold text-sm min-h-[44px] px-3">
            <Plus size={16} /> Registrar la primera fundida
          </button>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl px-6 py-10 text-center">
          <p className="font-semibold text-feisen-texto">Ninguna fundida coincide</p>
          <p className="text-sm text-feisen-texto-2 mt-1">
            {filtro === 'mes' ? 'No hay fundidas este mes con esa búsqueda. ' : filtro === 'novedad' ? 'Ninguna fundida con novedad coincide. ' : ''}
            Prueba con otras palabras o quita los filtros.
          </p>
          <button type="button" onClick={() => { setBusqueda(''); setFiltro('todas') }}
            className="mt-3 text-feisen-azul font-semibold text-sm min-h-[44px] px-3">
            Ver todas las fundidas
          </button>
        </div>
      ) : (
        <>
          <ul className="bg-white border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave overflow-hidden">
            {enPantalla.map(f => {
              const hn = personas(f.horneros)
              return (
                <li key={f.id}>
                  <button type="button" onClick={() => setDetalleId(f.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 min-h-[64px] text-left hover:bg-feisen-fondo active:bg-feisen-fondo transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-feisen-texto">{numFun(f.numero)}</span>
                        {f.observaciones && (
                          <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-amber-50 text-amber-700">Novedad</span>
                        )}
                      </div>
                      <p className="text-sm text-feisen-texto-2 mt-0.5 tabular-nums">
                        <span className="capitalize">{fechaLegible(f.fecha)}</span>
                        <span className="text-gray-300"> · </span>
                        {fmtHora(f.hora_inicio)}{f.hora_fin ? ` – ${fmtHora(f.hora_fin)}` : ''}
                      </p>
                      {hn.length > 0 && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">Hornero{hn.length > 1 ? 's' : ''}: {hn.join(', ')}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-feisen-texto tabular-nums">{fmtNum(f.hierro_colado, 'kg')}</p>
                      <p className="text-[11px] text-gray-400">hierro colado</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0" />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-col items-center gap-2 text-sm text-feisen-texto-2">
            <p className="tabular-nums">Mostrando {enPantalla.length.toLocaleString('es-CO')} de {filtradas.length.toLocaleString('es-CO')}</p>
            {enPantalla.length < filtradas.length && (
              <button type="button" onClick={() => setVisibles(v => v + POR_PAGINA)}
                className="min-h-[44px] px-4 rounded-lg border border-feisen-borde bg-white text-feisen-texto font-medium hover:bg-feisen-fondo transition-colors">
                Cargar más
              </button>
            )}
          </div>
        </>
      )}

      {detalle && <DetalleFundida f={detalle} onCerrar={() => setDetalleId(null)} />}
    </div>
  )
}

// ── Panel de detalle ─────────────────────────────────────────────────────────
function DetalleFundida({ f, onCerrar }) {
  const dur = duracion(f.hora_inicio, f.hora_fin)
  return (
    <PanelLateral etiqueta={`Detalle de ${numFun(f.numero)}`} onCerrar={onCerrar} encabezado={
      <div className="space-y-1">
        <h3 className="font-mono text-base font-semibold text-feisen-texto">{numFun(f.numero)}</h3>
        <p className="text-sm text-feisen-texto-2 capitalize">{fechaLegible(f.fecha)}</p>
        {f.observaciones && (
          <span className="inline-block text-[11px] font-medium px-1.5 py-px rounded-md bg-amber-50 text-amber-700">Novedad</span>
        )}
      </div>
    }>
      {/* Novedad primero: es lo que requiere atención */}
      {f.observaciones && (
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2 mb-1.5">Observaciones</h4>
          <p className="text-sm text-feisen-texto bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 leading-relaxed whitespace-pre-line">
            {f.observaciones}
          </p>
        </section>
      )}

      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2 mb-1.5">Horario</h4>
        <div className="flex items-center gap-2 text-sm text-feisen-texto tabular-nums">
          <Clock size={16} className="text-feisen-texto-2 shrink-0" />
          <span>{fmtHora(f.hora_inicio)} – {f.hora_fin ? fmtHora(f.hora_fin) : 'sin hora de fin'}</span>
          {dur && <span className="text-feisen-texto-2">· {dur}</span>}
        </div>
      </section>

      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2 mb-1.5">Personal</h4>
        <dl className="divide-y divide-feisen-borde-suave border border-feisen-borde-suave rounded-lg">
          {[['Horneros', f.horneros], ['Vaceadores', f.vaceadores], ['Auxiliares', f.auxiliares]].map(([label, vals]) => {
            const v = personas(vals)
            return (
              <div key={label} className="flex gap-3 px-3 py-2 text-sm">
                <dt className="w-24 shrink-0 text-feisen-texto-2">{label}</dt>
                <dd className="flex-1 min-w-0 text-feisen-texto">{v.length ? v.join(', ') : <span className="text-gray-400">—</span>}</dd>
              </div>
            )
          })}
        </dl>
      </section>

      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2 mb-1.5">Materiales</h4>
        <dl className="divide-y divide-feisen-borde-suave border border-feisen-borde-suave rounded-lg">
          {MATERIALES.map(({ key, label, unit }) => (
            <div key={key} className="flex justify-between gap-3 px-3 py-2 text-sm">
              <dt className="text-feisen-texto-2">{label}</dt>
              <dd className={`tabular-nums text-right ${f[key] == null || f[key] === '' ? 'text-gray-400' : 'font-semibold text-feisen-texto'}`}>{fmtNum(f[key], unit)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 px-3 py-2 text-sm">
            <dt className="text-feisen-texto-2">Temperatura aprox.</dt>
            <dd className={`tabular-nums text-right ${f.temperatura == null || f.temperatura === '' ? 'text-gray-400' : 'font-semibold text-feisen-texto'}`}>{fmtNum(f.temperatura, '°C')}</dd>
          </div>
        </dl>
      </section>
    </PanelLateral>
  )
}
