import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Download, Search, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { cargarArbol } from '../utils/arbolCosteo'
import { formatCOP, formatNumber } from '../utils/format'
import { nombreCorto, tipoTitulo } from '../utils/nombres'
import EtapasMaquina from '../inicio/EtapasMaquina'
import { porPiezaTexto } from '../utils/tiempos'
import { indexar, Panel } from '../ArbolTab'
import TraerFundicion from './TraerFundicion'
import HojaRuta from './HojaRuta'
import HojaMateria from './HojaMateria'
import { IndicadorObservaciones } from '../Observaciones'
import { PASOS, conteos, falta, filasDespiece, filasProcesos } from './datosPasos'

// Costeo por pasos (opción B, estilo Airtable; Angie, 2026-11-25). Una pantalla por paso del costeo
// (despiece → hojas de ruta → materia prima → tiempos) con una cuadrícula de toda la máquina y lo
// que falta en cada paso. Al tocar una fila se abre el mismo panel de la ficha para editar.
// La máquina va en la URL (?maquina=<id>) y se recuerda en localStorage.
const cop = (n) => formatCOP(n).replace(/,00$/, '')
const CLAVE_MAQUINA = 'costeo-pasos-maquina'

function leerMaquinaGuardada() {
  try {
    return window.localStorage.getItem(CLAVE_MAQUINA)
  } catch {
    return null
  }
}

export default function CosteoPasos() {
  const { paso: pasoUrl } = useParams()
  const paso = PASOS.find((p) => p.id === pasoUrl) || PASOS[0]
  const [params] = useSearchParams()
  const [maquinas, setMaquinas] = useState(null)
  const [arbol, setArbol] = useState(null)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')
  const [soloFalta, setSoloFalta] = useState(false)
  const [sel, setSel] = useState(null) // null = panel cerrado
  const [traer, setTraer] = useState(false)

  useEffect(() => {
    supabase
      .from('costeo_fichas')
      .select('id, nombre')
      .eq('tipo', 'maquina')
      .order('nombre')
      .then(({ data, error: e }) => {
        if (e) setError('No se pudieron cargar las máquinas: ' + e.message)
        setMaquinas(data || [])
      })
  }, [])

  const maquinaId = useMemo(() => {
    if (!maquinas?.length) return null
    const pedida = params.get('maquina') || leerMaquinaGuardada()
    return maquinas.some((m) => m.id === pedida) ? pedida : maquinas[0].id
  }, [maquinas, params])
  const maquinaActual = (maquinas || []).find((m) => m.id === maquinaId)

  useEffect(() => {
    if (!maquinaId) return
    try {
      window.localStorage.setItem(CLAVE_MAQUINA, maquinaId)
    } catch {
      // Sin localStorage solo no se recuerda.
    }
  }, [maquinaId])

  async function recargar() {
    if (!maquinaId) return
    try {
      setArbol(await cargarArbol(maquinaId, { conDetalle: true }))
      setError('')
    } catch (e) {
      setError('No se pudo cargar la máquina: ' + (e.message || e))
    }
  }

  useEffect(() => {
    setArbol(null)
    setSel(null)
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maquinaId])

  // Al cambiar de paso se limpian los filtros y se cierra el panel.
  useEffect(() => {
    setBuscar('')
    setSoloFalta(false)
    setSel(null)
  }, [paso.id])

  useEffect(() => {
    if (!sel) return
    const f = (e) => e.key === 'Escape' && setSel(null)
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [sel])

  const datos = useMemo(() => {
    if (!arbol) return null
    const filas = filasDespiece(arbol)
    const procesos = filasProcesos(arbol, filas)
    return { filas, procesos, idx: indexar(arbol), cuenta: conteos(arbol, filas, procesos) }
  }, [arbol])


  if (maquinas && !maquinas.length) {
    return (
      <div className="max-w-3xl mx-auto bg-white border border-feisen-borde rounded-xl p-6 text-sm text-feisen-texto-2">
        Todavía no hay máquinas en costeo.{' '}
        <Link to="/costeo" className="text-feisen-azul hover:underline">Crea la primera en Fichas</Link>.
      </div>
    )
  }

  const nombreRaiz = arbol?.fichas[arbol.raizId]?.nombre
  const corto = (n) => nombreCorto(n, nombreRaiz)

  return (
    <div className="max-w-7xl mx-auto -mt-1">
      {/* Encabezado: la máquina y sus etapas (2026-11-26: las etapas ya no van en el menú) */}
      <Link to={maquinaId ? `/costeo/maquina/${maquinaId}` : '/costeo'} className="text-xs text-feisen-azul hover:underline">← Fichas de costeo</Link>
      <div className="flex flex-wrap items-end justify-between gap-3 mt-1 mb-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-feisen-texto tracking-tight">{maquinaActual ? tipoTitulo(maquinaActual.nombre) : 'Costeo'}</h1>
          <p className="text-sm text-feisen-texto-2 mt-0.5">
            Paso {paso.n} · {paso.nombre}: {paso.ayuda}
          </p>
        </div>
        {maquinaId && (
          <Link to={`/costeo/fichas/${maquinaId}`} className="h-10 inline-flex items-center gap-1.5 rounded-lg px-3 text-sm text-feisen-azul hover:bg-feisen-azul-suave">
            Abrir ficha <ArrowRight size={14} />
          </Link>
        )}
      </div>
      {maquinaId && (
        <div className="mb-4">
          <EtapasMaquina maquinaId={maquinaId} activa={paso.id} cuentas={datos?.cuenta} />
        </div>
      )}

      <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">

        {/* Barra de herramientas */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-feisen-borde">
          <label className="relative">
            <span className="sr-only">Buscar pieza</span>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar pieza"
              className="h-9 w-52 rounded-md border border-feisen-borde pl-8 pr-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => setSoloFalta((v) => !v)}
            aria-pressed={soloFalta}
            className={`h-9 rounded-md px-3 text-sm ${soloFalta ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'text-feisen-texto-2 hover:bg-feisen-fondo'}`}
          >
            Solo lo que falta{datos ? ` (${datos.cuenta[paso.id]})` : ''}
          </button>
          <span className="flex-1" />
          {paso.id === 'despiece' && arbol && (
            <button type="button" onClick={() => setTraer(true)} className="h-9 inline-flex items-center gap-1.5 rounded-md border border-feisen-borde px-3 text-sm text-feisen-azul hover:bg-feisen-azul-suave">
              <Download size={14} /> Traer piezas de fundición
            </button>
          )}
          {arbol && (
            <button type="button" onClick={() => setSel({ tipo: 'raiz' })} className="h-9 rounded-md bg-feisen-rojo px-3 text-sm font-medium text-white hover:opacity-90">
              + Agregar pieza
            </button>
          )}
        </div>

        {error && <p className="px-4 py-3 text-sm text-feisen-rojo">{error}</p>}
        {!error && !datos && <p className="px-4 py-6 text-sm text-feisen-texto-2">Cargando…</p>}
        {datos && (
          <Cuadricula
            paso={paso.id}
            arbol={arbol}
            datos={datos}
            corto={corto}
            buscar={buscar}
            soloFalta={soloFalta}
            onAbrir={setSel}
            onAgregar={() => setSel({ tipo: 'raiz' })}
            onCambio={recargar}
          />
        )}
      </div>

      {/* Panel lateral para editar (el mismo de la ficha) */}
      {sel && datos && (
        <>
          <div className="fixed inset-0 z-40 bg-feisen-texto/20" onClick={() => setSel(null)} aria-hidden="true" />
          <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-white shadow-2xl overflow-y-auto" aria-label="Detalle">
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-feisen-borde-suave h-12 flex items-center justify-end px-2">
              <button type="button" onClick={() => setSel(null)} aria-label="Cerrar" className="w-10 h-10 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 pb-8 pt-2">
              <Panel
                arbol={arbol}
                idx={datos.idx}
                sel={sel}
                fichaId={arbol.raizId}
                nombreRaiz={nombreRaiz}
                onCambio={recargar}
                onSeleccionar={setSel}
                onQuitado={() => {
                  setSel(null)
                  recargar()
                }}
                onAgregado={async (s) => {
                  await recargar()
                  setSel(s)
                }}
              />
            </div>
          </aside>
        </>
      )}

      {traer && arbol && (
        <TraerFundicion
          arbol={arbol}
          filas={datos?.filas || []}
          onCerrar={() => setTraer(false)}
          onListo={async () => {
            setTraer(false)
            await recargar()
          }}
        />
      )}
    </div>
  )
}


// Etiqueta de color (chip) estilo Airtable.
const TONOS = {
  ok: 'bg-emerald-50 text-emerald-800',
  falta: 'bg-amber-50 text-amber-800',
  conjunto: 'bg-feisen-azul-suave text-feisen-azul',
  pieza: 'bg-violet-50 text-violet-800',
  neutro: 'bg-feisen-gris text-feisen-texto-2',
}
function Chip({ tono, children }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONOS[tono]}`}>{children}</span>
}

const TH = 'px-3 py-2 text-left text-xs font-medium text-feisen-texto-2 border-r border-feisen-borde-suave last:border-r-0 whitespace-nowrap'
const TD = 'px-3 py-2 border-r border-feisen-borde-suave last:border-r-0 align-middle'

function Cuadricula({ paso, arbol, datos, corto, buscar, soloFalta, onAbrir, onAgregar, onCambio }) {
  const q = buscar.trim().toLowerCase()
  const coincide = (f) => !q || (f?.ficha?.nombre || '').toLowerCase().includes(q)

  if (!datos.filas.length) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="font-medium text-feisen-texto">Esta máquina todavía no tiene piezas</p>
        <p className="text-sm text-feisen-texto-2 mt-1">Empieza por los conjuntos grandes (chasis, olla, transmisión…) y luego sus piezas.</p>
        <button type="button" onClick={onAgregar} className="mt-4 h-10 rounded-lg bg-feisen-rojo px-4 text-sm font-medium text-white">
          + Agregar pieza
        </button>
      </div>
    )
  }

  if (paso === 'tiempos') {
    const filas = datos.procesos.filter((p) => coincide(p.fila || { ficha: arbol.fichas[arbol.raizId] }) && (!soloFalta || falta.tiempos(p.proceso, p.costo)))
    const sinTiempo = datos.procesos.filter((p) => falta.tiempos(p.proceso, p.costo)).length
    return (
      <Tabla
        cabeza={['Pieza', 'Proceso', 'Personas', 'Mediciones', 'Tiempo por pieza', 'Mano de obra', 'Estado']}
        alinear={{ 3: 'right', 5: 'right' }}
        vacio={soloFalta ? 'Todos los procesos tienen su tiempo medido.' : 'Todavía no hay procesos. Agrégalos en Hojas de ruta.'}
        pie={[`${datos.procesos.length} procesos`, '', '', '', '', '', `${sinTiempo} por medir`]}
      >
        {filas.map((p, i) => {
          const personas = arbol.manoObra[p.proceso.id] || []
          const med = arbol.tiempos[p.proceso.id] || []
          const horas = med.reduce((s, t) => s + Number(t.horas || 0) * Number(t.num_operarios || 1), 0)
          const piezas = med.reduce((s, t) => s + Number(t.unidades || 0), 0)
          const sinPersona = Number(p.costo.lineas_mano_obra || 0) === 0
          return (
            <Fila key={p.key} n={i + 1} onClick={() => onAbrir({ tipo: 'proceso', id: p.proceso.id })}>
              <td className={`${TD} text-feisen-texto-2`}>{p.fila ? corto(p.fila.ficha?.nombre) : 'Máquina (ensamble)'}</td>
              <td className={`${TD} font-medium text-feisen-texto`}>{p.proceso.nombre}</td>
              <td className={`${TD} text-feisen-texto-2`}>{personas.map((x) => x.nombre).join(', ') || '—'}</td>
              <td className={`${TD} text-right tabular-nums`}>{med.length || '—'}</td>
              <td className={`${TD} tabular-nums`}>{piezas > 0 ? porPiezaTexto(horas, piezas) : '—'}</td>
              <td className={`${TD} text-right tabular-nums`}>{Number(p.costo.total_mod) > 0 ? cop(p.costo.total_mod) : '—'}</td>
              <td className={TD}>{sinPersona ? <Chip tono="falta">Sin persona</Chip> : falta.tiempos(p.proceso, p.costo) ? <Chip tono="falta">Falta medir</Chip> : <Chip tono="ok">Medido</Chip>}</td>
            </Fila>
          )
        })}
      </Tabla>
    )
  }

  const filas = datos.filas.filter((f) => coincide(f) && (!soloFalta || falta[paso](f, arbol)))
  const abrir = (f) => () => onAbrir({ tipo: 'pieza', id: f.enlace.id })
  const nombre = (f) => (
    <span className={f.esConjunto ? 'font-semibold text-feisen-texto' : 'text-feisen-texto'} style={{ paddingLeft: f.nivel * 18 }} title={f.ficha?.nombre}>
      {corto(f.ficha?.nombre)}
      {arbol.observaciones?.[f.fichaId] > 0 && <> <IndicadorObservaciones n={arbol.observaciones[f.fichaId]} /></>}
    </span>
  )
  const cant = (f) => formatNumber(f.cant, f.cant % 1 ? 2 : 0)
  const hojas = datos.filas.filter((f) => !f.esConjunto)

  if (paso === 'despiece') {
    const conjuntos = datos.filas.filter((f) => f.esConjunto).length
    return (
      <Tabla
        cabeza={['Pieza', 'Cant.', 'Tipo', 'Contenido', 'Costo hoy']}
        alinear={{ 1: 'right', 4: 'right' }}
        vacio="No hay piezas vacías: todas tienen piezas adentro o procesos."
        pie={[`${conjuntos} ${conjuntos === 1 ? 'conjunto' : 'conjuntos'} · ${hojas.length} ${hojas.length === 1 ? 'pieza' : 'piezas'}`, '', '', `${datos.cuenta.despiece} vacías`, cop(arbol.resumen[arbol.raizId]?.costo_total)]}
      >
        {filas.map((f, i) => (
          <Fila key={f.key} n={i + 1} conjunto={f.esConjunto} onClick={abrir(f)}>
            <td className={TD}>{nombre(f)}</td>
            <td className={`${TD} text-right tabular-nums`}>{cant(f)}</td>
            <td className={TD}><Chip tono={f.esConjunto ? 'conjunto' : 'pieza'}>{f.esConjunto ? 'Conjunto' : 'Pieza'}</Chip></td>
            <td className={TD}>
              {f.esConjunto ? (
                <span className="text-feisen-texto-2">{f.hijos.length} {f.hijos.length === 1 ? 'pieza' : 'piezas'}{f.procesos.length ? ` · ${f.procesos.length} procesos` : ''}</span>
              ) : f.procesos.length ? (
                <span className="text-feisen-texto-2">{f.procesos.length} {f.procesos.length === 1 ? 'proceso' : 'procesos'}</span>
              ) : (
                <Chip tono="falta">Vacía</Chip>
              )}
            </td>
            <td className={`${TD} text-right tabular-nums ${Number(f.resumen.costo_total) ? 'text-feisen-texto' : 'text-feisen-gris-medio'}`}>{cop(Number(f.resumen.costo_total || 0) * f.cant)}</td>
          </Fila>
        ))}
      </Tabla>
    )
  }

  // Paso 2: secuencia de fichas por pieza (2026-11-26). Ver HojaRuta.jsx.
  if (paso === 'ruta') {
    return <HojaRuta arbol={arbol} filas={datos.filas} corto={corto} buscar={buscar} soloFalta={soloFalta} onCambio={onCambio} />
  }

  // Paso 3: "¿cuántas salen de una unidad?" por pieza (2026-11-26). Ver HojaMateria.jsx.
  return <HojaMateria arbol={arbol} filas={datos.filas} corto={corto} buscar={buscar} soloFalta={soloFalta} onCambio={onCambio} />
}

function Tabla({ cabeza, alinear = {}, vacio, pie, children }) {
  const filas = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : []
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="bg-feisen-gris border-b border-feisen-borde">
            <th className={`${TH} w-11`}><span className="sr-only">Número</span></th>
            {cabeza.map((c, k) => (
              <th key={c} className={TH} style={alinear[k] ? { textAlign: alinear[k] } : undefined}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length ? (
            filas
          ) : (
            <tr>
              <td colSpan={cabeza.length + 1} className="px-4 py-8 text-center text-sm text-feisen-texto-2">{vacio}</td>
            </tr>
          )}
        </tbody>
        {pie && (
          <tfoot>
            <tr className="bg-feisen-gris border-t border-feisen-borde text-xs text-feisen-texto-2">
              <td className={TD} />
              {pie.map((p, k) => (
                <td key={k} className={TD} style={alinear[k] ? { textAlign: alinear[k] } : undefined}>{p}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function Fila({ n, conjunto, onClick, children }) {
  return (
    <tr
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      tabIndex={0}
      className={`border-b border-feisen-borde-suave cursor-pointer hover:bg-feisen-azul-suave/60 focus:outline-none focus-visible:bg-feisen-azul-suave ${conjunto ? 'bg-feisen-fondo' : 'bg-white'}`}
    >
      <td className={`${TD} w-11 text-right text-[11px] tabular-nums text-feisen-gris-medio`}>{n}</td>
      {children}
    </tr>
  )
}
