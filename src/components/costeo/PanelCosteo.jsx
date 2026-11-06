import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Component, ExternalLink, Plus, SlidersHorizontal } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'
import { ETAPAS } from './utils/etapas'
import { CENTROS_COSTO } from './utils/centrosCosto'
import { nombreCorto } from './utils/nombres'
import ProcesoMateriales from './ProcesoMateriales'
import ProcesoManoObra from './ProcesoManoObra'
import ProcesoTiempos from './ProcesoTiempos'

// Panel de detalle del árbol de costeo (opción B elegida por Angie el 2026-11-06): a la derecha en
// escritorio, a pantalla completa en celular. Muestra un proceso (mano de obra, materia prima,
// tiempos, de dónde sale el costo) o una pieza / la máquina (cantidad, contenido, agregar).

const campo = 'w-full h-11 border border-feisen-borde rounded-lg px-3 text-sm outline-none focus:border-feisen-azul bg-white'
const cop = (n) => formatCOP(n).replace(/,00$/, '')

function Ruta({ partes }) {
  return <p className="text-xs text-feisen-texto-2 truncate">{partes.join(' › ')}</p>
}

function BadgeSinTiempos() {
  return (
    <span className="shrink-0 rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 text-[11px] font-medium">
      Sin tiempos
    </span>
  )
}

// ───────────────────────────── Proceso ─────────────────────────────
export function PanelProceso({ arbol, proceso, ruta, hermanos, onCambio, onQuitado }) {
  const [editando, setEditando] = useState(false)
  const c = arbol.costos[proceso.id] || {}
  const lineas = arbol.manoObra[proceso.id] || []
  const i = hermanos.findIndex((p) => p.id === proceso.id)
  const tipos = new Set(lineas.map((l) => l.tipo_pago))
  const pago = tipos.size > 1 ? 'Mano de obra mixta' : tipos.has('destajo') ? 'Valor fijo' : lineas.length ? 'Por hora' : 'Sin mano de obra'

  useEffect(() => setEditando(false), [proceso.id])

  // Sube o baja el proceso intercambiando su orden con el vecino.
  async function mover(delta) {
    const a = hermanos[i]
    const b = hermanos[i + delta]
    if (!a || !b) return
    const ordenA = a.orden === b.orden ? a.orden + delta : b.orden
    await Promise.all([
      supabase.from('costeo_procesos').update({ orden: ordenA }).eq('id', a.id),
      supabase.from('costeo_procesos').update({ orden: a.orden }).eq('id', b.id),
    ])
    onCambio()
  }

  const moDet = lineas.length > 1 ? `${lineas.length} personas` : pago
  const cifDet = Number(c.horas_hombre_unidad) > 0 ? `${formatNumber(c.horas_hombre_unidad, 2)} h-h × ${cop(c.tasa_cif_hora)}/h` : 'Sin tiempos'

  return (
    <div>
      <Ruta partes={ruta} />
      <h3 className="text-xl font-semibold tracking-tight text-feisen-texto mt-1.5">{proceso.nombre}</h3>
      <p className="text-xs text-feisen-texto-2 mt-1">
        Proceso {i + 1} de {hermanos.length} · {pago} · {c.centro_costo_usado || 'Sin centro'}
      </p>
      <div className="mt-4 flex items-center gap-3">
        <p className="tabular-nums text-[26px] leading-none font-semibold tracking-tight text-feisen-texto">{cop(c.costo_total)}</p>
        {Number(c.lineas_sin_tiempo) > 0 && <BadgeSinTiempos />}
      </div>
      <div className="mt-4 flex items-center gap-1">
        <button
          onClick={() => setEditando((v) => !v)}
          className="h-11 inline-flex items-center gap-2 px-4 rounded-lg border border-feisen-borde text-sm text-feisen-texto hover:bg-feisen-fondo"
        >
          <SlidersHorizontal size={14} /> Editar proceso
        </button>
        {i > 0 && (
          <button onClick={() => mover(-1)} aria-label="Subir" title="Subir" className="w-11 h-11 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo">
            <ArrowUp size={15} />
          </button>
        )}
        {i < hermanos.length - 1 && (
          <button onClick={() => mover(1)} aria-label="Bajar" title="Bajar" className="w-11 h-11 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo">
            <ArrowDown size={15} />
          </button>
        )}
      </div>
      {editando && (
        <EditarProceso
          proceso={proceso}
          onListo={(quitado) => {
            setEditando(false)
            if (quitado) onQuitado()
            else onCambio()
          }}
        />
      )}

      <div className="mt-7 space-y-7">
        <ProcesoManoObra proceso={proceso} lineas={lineas} onCambio={onCambio} />
        <ProcesoMateriales proceso={proceso} onCambio={onCambio} />
        <ProcesoTiempos proceso={proceso} lineas={lineas} onCambio={onCambio} />
        <div className="rounded-xl bg-feisen-fondo px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-[0.06em] text-feisen-texto-2 mb-2.5">De dónde sale el costo</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Celda label="Materia prima" valor={c.total_mp} />
            <Celda label="Mano de obra" valor={c.total_mod} det={moDet} />
            <Celda label="CIF" valor={c.cif} det={cifDet} />
            <Celda label="Total del proceso" valor={c.costo_total} fuerte />
          </dl>
        </div>
      </div>
    </div>
  )
}

function Celda({ label, valor, det, fuerte }) {
  return (
    <div className="min-w-0">
      <dt className={`text-xs ${fuerte ? 'text-feisen-texto font-medium' : 'text-feisen-texto-2'}`}>{label}</dt>
      <dd className={`tabular-nums mt-0.5 ${fuerte ? 'text-base font-semibold text-feisen-texto' : 'text-sm text-feisen-texto'}`}>{cop(valor)}</dd>
      {det && <dd className="tabular-nums text-[11px] text-feisen-texto-2 mt-0.5">{det}</dd>}
    </div>
  )
}

function EditarProceso({ proceso, onListo }) {
  const [f, setF] = useState({ nombre: proceso.nombre, centro_costo: proceso.centro_costo || '' })
  const [error, setError] = useState('')

  async function guardar(e) {
    e.preventDefault()
    if (!f.nombre.trim()) return setError('El proceso necesita un nombre.')
    const { error } = await supabase
      .from('costeo_procesos')
      .update({ nombre: f.nombre.trim(), centro_costo: f.centro_costo || null })
      .eq('id', proceso.id)
    if (error) return setError('No se pudo guardar: ' + error.message)
    onListo(false)
  }

  async function eliminar() {
    if (!window.confirm(`¿Quitar "${proceso.nombre}"? Se borran también su materia prima, su mano de obra y sus tiempos medidos.`)) return
    const { error } = await supabase.from('costeo_procesos').delete().eq('id', proceso.id)
    if (error) return setError('No se pudo quitar: ' + error.message)
    onListo(true)
  }

  return (
    <form onSubmit={guardar} className="mt-4 border border-feisen-borde rounded-xl p-4 space-y-3">
      <div>
        <label className="block text-xs text-feisen-texto-2 mb-1">Proceso</label>
        <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={campo} />
      </div>
      <div>
        <label className="block text-xs text-feisen-texto-2 mb-1">Centro de costo (para el CIF)</label>
        <select value={f.centro_costo} onChange={(e) => setF({ ...f, centro_costo: e.target.value })} className={campo}>
          <option value="">El de "Responsables por etapa"</option>
          {CENTROS_COSTO.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-feisen-rojo text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" className="h-11 px-4 rounded-lg bg-feisen-azul text-white text-sm font-medium hover:bg-feisen-azul-claro">
          Guardar
        </button>
        <button type="button" onClick={() => onListo(false)} className="h-11 px-3 rounded-lg text-sm text-feisen-texto-2 hover:bg-feisen-fondo">
          Cancelar
        </button>
        <button type="button" onClick={eliminar} className="ml-auto h-11 px-3 rounded-lg text-sm text-feisen-rojo hover:bg-feisen-rojo-suave">
          Quitar proceso
        </button>
      </div>
    </form>
  )
}

// ───────────────────────────── Pieza o máquina ─────────────────────────────
export function PanelPieza({ arbol, fichaId, enlace, ruta, nombreRaiz, enCamino, onCambio, onSeleccionar, onQuitado, onAgregado }) {
  const ficha = arbol.fichas[fichaId]
  const r = arbol.resumen[fichaId] || {}
  const procesos = arbol.procesos[fichaId] || []
  const hijos = (arbol.hijos[fichaId] || []).filter((e) => !enCamino.has(e.pieza_id))
  const cant = enlace ? Number(enlace.cantidad) : 1
  const [cantidad, setCantidad] = useState(String(cant))

  useEffect(() => setCantidad(String(enlace ? enlace.cantidad : 1)), [enlace?.id, enlace?.cantidad])

  async function guardarCantidad() {
    const n = Number(cantidad)
    if (!enlace || !(n > 0) || n === Number(enlace.cantidad)) {
      setCantidad(String(enlace?.cantidad ?? 1))
      return
    }
    await supabase.from('costeo_ficha_piezas').update({ cantidad: n }).eq('id', enlace.id)
    onCambio()
  }

  async function renombrar() {
    const nuevo = window.prompt('Nuevo nombre de la pieza (cambia en todas las máquinas donde se use):', ficha?.nombre)
    if (!nuevo?.trim()) return
    await supabase.from('costeo_fichas').update({ nombre: nuevo.trim(), updated_at: new Date().toISOString() }).eq('id', fichaId)
    onCambio()
  }

  async function quitar() {
    if (!window.confirm(`¿Quitar "${ficha?.nombre}" de aquí? La pieza sigue en el catálogo de piezas con sus procesos.`)) return
    await supabase.from('costeo_ficha_piezas').delete().eq('id', enlace.id)
    onQuitado()
  }

  const n = (x) => nombreCorto(x, nombreRaiz)

  return (
    <div>
      <Ruta partes={ruta.length ? ruta : [enlace ? 'Pieza' : 'Máquina']} />
      <h3 className="text-xl font-semibold tracking-tight text-feisen-texto mt-1.5">{n(ficha?.nombre)}</h3>
      <p className="text-xs text-feisen-texto-2 mt-1">
        {enlace ? 'Sub-pieza' : 'Máquina'} · nombre en catálogo: {ficha?.nombre}
      </p>
      <div className="mt-4">
        <p className="tabular-nums text-[26px] leading-none font-semibold tracking-tight text-feisen-texto">{cop(Number(r.costo_total || 0) * cant)}</p>
        {enlace && cant !== 1 && (
          <p className="tabular-nums text-xs text-feisen-texto-2 mt-1.5">
            {cop(r.costo_total)} c/u × {formatNumber(cant, cant % 1 ? 2 : 0)}
          </p>
        )}
      </div>
      {enlace && (
        <label className="mt-5 flex items-center justify-between gap-3 text-sm text-feisen-texto-2">
          Cantidad por unidad
          <input
            type="number"
            min="0"
            step="any"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            onBlur={guardarCantidad}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-24 h-11 border border-feisen-borde rounded-lg px-3 text-sm tabular-nums text-feisen-texto text-right outline-none focus:border-feisen-azul bg-white"
          />
        </label>
      )}

      <div className="mt-7">
        <div className="flex items-center h-8">
          <h4 className="text-[11px] font-medium uppercase tracking-[0.06em] text-feisen-texto-2">Contenido</h4>
          <span className="ml-auto text-xs text-feisen-texto-2">
            {procesos.length} {procesos.length === 1 ? 'proceso' : 'procesos'} · {hijos.length} {hijos.length === 1 ? 'pieza' : 'piezas'}
          </span>
        </div>
        {procesos.length || hijos.length ? (
          <ul className="divide-y divide-feisen-borde-suave">
            {procesos.map((p, i) => {
              const c = arbol.costos[p.id] || {}
              return (
                <li key={p.id}>
                  <button onClick={() => onSeleccionar({ tipo: 'proceso', id: p.id })} className="w-full flex items-center gap-3 min-h-[48px] text-left hover:bg-feisen-fondo rounded-lg px-2 -mx-2">
                    <span className="tabular-nums text-xs text-feisen-gris-medio w-4 text-right">{i + 1}</span>
                    <span className="flex-1 min-w-0 text-sm text-feisen-texto truncate">{p.nombre}</span>
                    {Number(c.lineas_sin_tiempo) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    <span className="tabular-nums text-sm text-feisen-texto-2">{cop(c.costo_total)}</span>
                  </button>
                </li>
              )
            })}
            {hijos.map((e) => (
              <li key={e.id}>
                <button onClick={() => onSeleccionar({ tipo: 'pieza', id: e.id })} className="w-full flex items-center gap-3 min-h-[48px] text-left hover:bg-feisen-fondo rounded-lg px-2 -mx-2">
                  <Component size={14} className="w-4 text-feisen-azul" />
                  <span className="flex-1 min-w-0 text-sm font-medium text-feisen-texto truncate">
                    {n(arbol.fichas[e.pieza_id]?.nombre)}{' '}
                    <span className="font-normal text-feisen-texto-2">× {formatNumber(e.cantidad, Number(e.cantidad) % 1 ? 2 : 0)}</span>
                  </span>
                  <span className="tabular-nums text-sm text-feisen-texto">{cop(Number(arbol.resumen[e.pieza_id]?.costo_total || 0) * Number(e.cantidad))}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-feisen-texto-2 py-2">
            Todavía no tiene procesos. Agrega el primero (ej. Corte, Doblez, Soldadura) para que sume al costo.
          </p>
        )}
        <AgregarAqui fichaId={fichaId} nombreFicha={n(ficha?.nombre)} procesos={procesos} enCamino={enCamino} onAgregado={onAgregado} />
      </div>

      {enlace && (
        <div className="mt-8 pt-4 border-t border-feisen-borde-suave flex flex-wrap items-center gap-x-2">
          <button onClick={renombrar} className="h-11 px-3 -ml-3 rounded-lg text-sm text-feisen-azul hover:bg-feisen-azul-suave">
            Renombrar
          </button>
          <Link to={`/costeo/fichas/${fichaId}`} className="h-11 inline-flex items-center gap-1.5 px-3 rounded-lg text-sm text-feisen-azul hover:bg-feisen-azul-suave">
            <ExternalLink size={13} /> Abrir su ficha
          </Link>
          <button onClick={quitar} className="ml-auto h-11 px-3 rounded-lg text-sm text-feisen-rojo hover:bg-feisen-rojo-suave">
            Quitar de aquí
          </button>
        </div>
      )}
    </div>
  )
}

// "+ Proceso" y "+ Sub-pieza" de una pieza (nueva con nombre, o una que ya exista en el catálogo).
function AgregarAqui({ fichaId, nombreFicha, procesos, enCamino, onAgregado }) {
  const [modo, setModo] = useState(null) // null | 'proceso' | 'pieza'
  const [nombre, setNombre] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [maestro, setMaestro] = useState({})
  const [catalogo, setCatalogo] = useState([])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (modo === 'proceso') {
      supabase.from('costeo_etapas_maestro').select('*').then(({ data }) => {
        setMaestro(Object.fromEntries((data || []).map((m) => [m.etapa, m])))
      })
    }
    if (modo === 'pieza') {
      supabase.from('costeo_fichas').select('id, nombre').eq('tipo', 'pieza').order('nombre').then(({ data }) => setCatalogo(data || []))
    }
  }, [modo])

  useEffect(() => cerrar(), [fichaId])

  function cerrar() {
    setModo(null)
    setNombre('')
    setCantidad('1')
    setError('')
  }

  async function agregarProceso() {
    const n = nombre.trim()
    if (!n) return setError('Escoge o escribe el proceso.')
    const m = maestro[n]
    const { data, error } = await supabase
      .from('costeo_procesos')
      .insert({ ficha_id: fichaId, nombre: n, orden: procesos.length ? Math.max(...procesos.map((p) => p.orden)) + 1 : 1 })
      .select()
      .single()
    if (error) return setError('No se pudo agregar: ' + error.message)
    // La primera persona del proceso sale de "Responsables por etapa" (puesto, forma de pago y tarifa).
    await supabase.from('costeo_proceso_mano_obra').insert({
      proceso_id: data.id,
      nombre: m?.puesto || 'Operario 1',
      tipo_pago: m?.tipo_pago_sugerido || 'hora',
      tarifa_hora: Number(m?.tarifa_hora_sugerida || 0),
      precio_destajo: Number(m?.precio_destajo_sugerido || 0),
      orden: 1,
    })
    cerrar()
    onAgregado({ tipo: 'proceso', id: data.id })
  }

  async function agregarPieza() {
    const n = nombre.trim()
    const cant = Number(cantidad)
    if (!n) return setError('Ponle nombre a la pieza (ej. Fondo).')
    if (!(cant > 0)) return setError('La cantidad debe ser mayor a 0.')
    // Se busca en la base (no en la lista del datalist, que puede no haber cargado aún) para no
    // crear dos piezas con el mismo nombre.
    const { data: existentes, error: e0 } = await supabase.from('costeo_fichas').select('id, nombre').eq('tipo', 'pieza').ilike('nombre', n)
    if (e0) return setError('No se pudo revisar el catálogo: ' + e0.message)
    let pieza = (existentes || []).find((c) => c.nombre.trim().toLowerCase() === n.toLowerCase())
    if (pieza && (enCamino.has(pieza.id) || pieza.id === fichaId)) return setError(`"${pieza.nombre}" ya contiene a esta pieza; no puede ir dentro de sí misma.`)
    if (!pieza) {
      const { data, error } = await supabase.from('costeo_fichas').insert({ nombre: n, tipo: 'pieza' }).select('id, nombre').single()
      if (error) return setError('No se pudo crear la pieza: ' + error.message)
      pieza = data
    }
    const { data: enlace, error } = await supabase
      .from('costeo_ficha_piezas')
      .insert({ contenedor_id: fichaId, pieza_id: pieza.id, cantidad: cant })
      .select('id')
      .single()
    if (error) return setError('No se pudo agregar: ' + error.message)
    cerrar()
    onAgregado({ tipo: 'pieza', id: enlace.id })
  }

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setGuardando(true)
    try {
      await (modo === 'proceso' ? agregarProceso() : agregarPieza())
    } finally {
      setGuardando(false)
    }
  }

  if (!modo) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setModo('proceso')} className="h-11 inline-flex items-center gap-1.5 px-4 rounded-lg border border-feisen-borde text-sm text-feisen-azul hover:bg-feisen-azul-suave">
          <Plus size={15} /> Proceso
        </button>
        <button onClick={() => setModo('pieza')} className="h-11 inline-flex items-center gap-1.5 px-4 rounded-lg border border-feisen-borde text-sm text-feisen-azul hover:bg-feisen-azul-suave">
          <Plus size={15} /> Sub-pieza
        </button>
      </div>
    )
  }

  const opcionesProceso = [...new Set([...ETAPAS.filter((x) => x !== 'Otra'), ...Object.keys(maestro)])]
  const listaId = `costeo-opciones-${modo}-${fichaId}`

  return (
    <form onSubmit={enviar} className="py-3">
      <p className="text-xs text-feisen-texto-2 mb-2">
        {modo === 'proceso' ? 'Nuevo proceso' : 'Nueva sub-pieza'} en <span className="text-feisen-texto">{nombreFicha}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          autoFocus
          list={listaId}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoComplete="off"
          placeholder={modo === 'proceso' ? 'Proceso (ej. Doblez)' : 'Nombre de la pieza (ej. Tapa)'}
          className="flex-1 min-w-[150px] h-11 border border-feisen-borde rounded-lg px-3 text-sm outline-none focus:border-feisen-azul bg-white"
        />
        <datalist id={listaId}>
          {(modo === 'proceso' ? opcionesProceso : catalogo.filter((c) => !enCamino.has(c.id) && c.id !== fichaId).map((c) => c.nombre)).map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        {modo === 'pieza' && (
          <input
            type="number"
            min="0"
            step="any"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            aria-label="Cantidad por unidad"
            title="Cantidad por unidad"
            className="w-20 h-11 border border-feisen-borde rounded-lg px-3 text-sm tabular-nums outline-none focus:border-feisen-azul bg-white"
          />
        )}
        <button type="submit" disabled={guardando} className="h-11 px-4 rounded-lg bg-feisen-azul text-white text-sm font-medium hover:bg-feisen-azul-claro disabled:opacity-60">
          Agregar
        </button>
        <button type="button" onClick={cerrar} className="h-11 px-3 rounded-lg text-sm text-feisen-texto-2 hover:bg-feisen-fondo">
          Cancelar
        </button>
      </div>
      {modo === 'pieza' && <p className="text-xs text-feisen-texto-2 mt-2">Si ya existe en el catálogo de piezas se reutiliza con sus procesos.</p>}
      {error && <p className="text-feisen-rojo text-xs mt-2">{error}</p>}
    </form>
  )
}
