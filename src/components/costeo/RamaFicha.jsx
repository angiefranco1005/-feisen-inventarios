import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Component, ExternalLink, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'
import { ETAPAS } from './utils/etapas'
import ProcesoNodo from './ProcesoNodo'

const campo = 'w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm outline-none focus:border-feisen-azul bg-white'

// Contenido de una ficha dentro del árbol: sus procesos, sus sub-piezas (cada una se abre y
// muestra su propia RamaFicha) y los botones para agregar proceso o sub-pieza a ESTA ficha.
// enCamino = fichas desde la raíz hasta aquí, para no permitir meter una pieza dentro de sí misma.
export default function RamaFicha({ arbol, fichaId, enCamino, abiertos, alternar, recargar, raiz }) {
  const procesos = arbol.procesos[fichaId] || []
  const hijos = arbol.hijos[fichaId] || []
  const nombreFicha = arbol.fichas[fichaId]?.nombre

  // Sube o baja un proceso intercambiando su orden con el vecino.
  async function mover(idx, delta) {
    const a = procesos[idx]
    const b = procesos[idx + delta]
    if (!a || !b) return
    const ordenA = a.orden === b.orden ? a.orden + delta : b.orden
    await Promise.all([
      supabase.from('costeo_procesos').update({ orden: ordenA }).eq('id', a.id),
      supabase.from('costeo_procesos').update({ orden: a.orden }).eq('id', b.id),
    ])
    recargar()
  }

  return (
    <div className="divide-y divide-feisen-borde-suave">
      {raiz && procesos.length === 0 && hijos.length === 0 && (
        <div className="p-6 text-sm text-feisen-texto-2">
          <p className="font-medium text-feisen-texto">Empieza por los procesos</p>
          <p className="mt-1">
            Agrega en orden los procesos de esta máquina (ensamble, soldadura, pintura…) y sus sub-piezas (ej. la Olla).
            Cada sub-pieza tiene sus propios procesos y puede tener piezas más pequeñas adentro (ej. Fondo, Aro).
          </p>
        </div>
      )}
      {procesos.map((p, idx) => (
        <ProcesoNodo
          key={p.id}
          proceso={p}
          costo={arbol.costos[p.id]}
          abierto={abiertos.has(p.id)}
          onAlternar={() => alternar(p.id)}
          onCambio={recargar}
          onSubir={idx > 0 ? () => mover(idx, -1) : null}
          onBajar={idx < procesos.length - 1 ? () => mover(idx, 1) : null}
          numero={idx + 1}
        />
      ))}
      {hijos.map((e) =>
        enCamino.has(e.pieza_id) ? null : (
          <PiezaNodo
            key={e.id}
            enlace={e}
            arbol={arbol}
            enCamino={enCamino}
            abiertos={abiertos}
            alternar={alternar}
            recargar={recargar}
          />
        )
      )}
      <AgregarEnRama
        fichaId={fichaId}
        nombreFicha={nombreFicha}
        procesos={procesos}
        enCamino={enCamino}
        raiz={raiz}
        onAgregado={(clave) => {
          if (clave) alternar(clave, true)
          recargar()
        }}
      />
    </div>
  )
}

// Una sub-pieza dentro del árbol. Cerrada: nombre, cantidad y costo (unitario × cantidad).
// Abierta: cantidad editable, renombrar, quitar de aquí, y adentro su propia rama.
function PiezaNodo({ enlace, arbol, enCamino, abiertos, alternar, recargar }) {
  const pieza = arbol.fichas[enlace.pieza_id]
  const r = arbol.resumen[enlace.pieza_id]
  const abierto = abiertos.has(enlace.id)
  const [cantidad, setCantidad] = useState(String(enlace.cantidad))
  const unitario = Number(r?.costo_total || 0)
  const nProcesos = (arbol.procesos[enlace.pieza_id] || []).length
  const nPiezas = (arbol.hijos[enlace.pieza_id] || []).length

  useEffect(() => setCantidad(String(enlace.cantidad)), [enlace.cantidad])

  async function guardarCantidad() {
    const n = Number(cantidad)
    if (!(n > 0) || n === Number(enlace.cantidad)) {
      setCantidad(String(enlace.cantidad))
      return
    }
    await supabase.from('costeo_ficha_piezas').update({ cantidad: n }).eq('id', enlace.id)
    recargar()
  }

  async function renombrar() {
    const nuevo = window.prompt('Nuevo nombre de la pieza (cambia en todas las máquinas donde se use):', pieza?.nombre)
    if (!nuevo?.trim()) return
    await supabase.from('costeo_fichas').update({ nombre: nuevo.trim(), updated_at: new Date().toISOString() }).eq('id', enlace.pieza_id)
    recargar()
  }

  async function quitar() {
    if (!window.confirm(`¿Quitar "${pieza?.nombre}" de aquí? La pieza sigue en el catálogo de piezas con sus procesos.`)) return
    await supabase.from('costeo_ficha_piezas').delete().eq('id', enlace.id)
    recargar()
  }

  return (
    <div>
      <button onClick={() => alternar(enlace.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-feisen-fondo">
        {abierto ? (
          <ChevronDown size={16} className="text-feisen-texto-2 shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-feisen-texto-2 shrink-0" />
        )}
        <Component size={16} className="text-feisen-azul shrink-0" />
        <span className="min-w-0">
          <span className="font-medium text-feisen-texto">
            {pieza?.nombre || 'Pieza'} <span className="text-feisen-texto-2 font-normal">× {formatNumber(enlace.cantidad, 0)}</span>
          </span>
          <span className="block text-xs text-feisen-texto-2">
            Sub-pieza · {nProcesos} {nProcesos === 1 ? 'proceso' : 'procesos'}
            {nPiezas > 0 ? ` · ${nPiezas} ${nPiezas === 1 ? 'pieza' : 'piezas'} adentro` : ''} · {formatCOP(unitario)} c/u
          </span>
        </span>
        <span className="ml-auto font-semibold tabular-nums text-feisen-texto">{formatCOP(unitario * Number(enlace.cantidad || 0))}</span>
      </button>

      {abierto && (
        <div className="ml-6 border-l-2 border-feisen-azul-suave">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-xs text-feisen-texto-2 bg-feisen-fondo">
            <label className="flex items-center gap-2">
              Cantidad por unidad
              <input
                type="number"
                min="0"
                step="any"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                onBlur={guardarCantidad}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-20 border border-feisen-borde rounded-md px-2 py-1 text-sm bg-white outline-none focus:border-feisen-azul"
              />
            </label>
            <button onClick={renombrar} className="text-feisen-azul hover:underline">Renombrar</button>
            <Link to={`/costeo/fichas/${enlace.pieza_id}`} className="flex items-center gap-1 text-feisen-azul hover:underline">
              <ExternalLink size={12} /> Abrir su ficha
            </Link>
            <button onClick={quitar} className="ml-auto text-feisen-rojo hover:underline">Quitar de aquí</button>
          </div>
          <RamaFicha
            arbol={arbol}
            fichaId={enlace.pieza_id}
            enCamino={new Set(enCamino).add(enlace.pieza_id)}
            abiertos={abiertos}
            alternar={alternar}
            recargar={recargar}
          />
        </div>
      )}
    </div>
  )
}

// Botones al pie de cada rama: "+ Proceso" y "+ Sub-pieza" (nueva con nombre, o una que ya
// exista en el catálogo de piezas).
function AgregarEnRama({ fichaId, nombreFicha, procesos, enCamino, raiz, onAgregado }) {
  const [modo, setModo] = useState(null) // null | 'proceso' | 'pieza'
  const [nombre, setNombre] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [maestro, setMaestro] = useState({})
  const [catalogo, setCatalogo] = useState([])
  const [error, setError] = useState('')

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

  function cerrar() {
    setModo(null)
    setNombre('')
    setCantidad('1')
    setError('')
  }

  async function agregarProceso(e) {
    e.preventDefault()
    const n = nombre.trim()
    if (!n) return setError('Escoge o escribe el proceso.')
    const m = maestro[n]
    const { data, error } = await supabase
      .from('costeo_procesos')
      .insert({
        ficha_id: fichaId,
        nombre: n,
        orden: procesos.length ? Math.max(...procesos.map((p) => p.orden)) + 1 : 1,
        tipo_pago: m?.tipo_pago_sugerido || 'hora',
        tarifa_hora: Number(m?.tarifa_hora_sugerida || 0),
        precio_destajo: Number(m?.precio_destajo_sugerido || 0),
      })
      .select()
      .single()
    if (error) return setError('No se pudo agregar: ' + error.message)
    cerrar()
    onAgregado(data.id)
  }

  async function agregarPieza(e) {
    e.preventDefault()
    const n = nombre.trim()
    const cant = Number(cantidad)
    if (!n) return setError('Ponle nombre a la pieza (ej. Fondo).')
    if (!(cant > 0)) return setError('La cantidad debe ser mayor a 0.')
    // Se busca en la base (no en la lista del datalist, que puede no haber cargado aún) para no
    // crear dos piezas con el mismo nombre.
    const { data: existentes, error: e0 } = await supabase.from('costeo_fichas').select('id, nombre').eq('tipo', 'pieza').ilike('nombre', n)
    if (e0) return setError('No se pudo revisar el catálogo: ' + e0.message)
    let pieza = (existentes || []).find((c) => c.nombre.trim().toLowerCase() === n.toLowerCase())
    if (pieza && enCamino.has(pieza.id)) return setError(`"${pieza.nombre}" ya contiene a esta pieza; no puede ir dentro de sí misma.`)
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
    onAgregado(enlace.id)
  }

  if (!modo) {
    return (
      <div className={`flex flex-wrap gap-4 px-4 py-3 text-sm ${raiz ? '' : 'bg-white'}`}>
        <button onClick={() => setModo('proceso')} className="flex items-center gap-1 text-feisen-azul hover:underline">
          <Plus size={14} /> Proceso{raiz ? '' : ` de ${nombreFicha}`}
        </button>
        <button onClick={() => setModo('pieza')} className="flex items-center gap-1 text-feisen-azul hover:underline">
          <Plus size={14} /> Sub-pieza{raiz ? '' : ` dentro de ${nombreFicha}`}
        </button>
      </div>
    )
  }

  const opcionesProceso = [...new Set([...ETAPAS.filter((x) => x !== 'Otra'), ...Object.keys(maestro)])]
  const listaId = `costeo-opciones-${modo}-${fichaId}`

  return (
    <form onSubmit={modo === 'proceso' ? agregarProceso : agregarPieza} className="px-4 py-3 space-y-2 bg-white">
      <p className="text-xs text-feisen-texto-2">
        {modo === 'proceso' ? `Nuevo proceso de ${nombreFicha}` : `Nueva sub-pieza dentro de ${nombreFicha}`}
      </p>
      <div className="flex flex-wrap gap-2 items-start">
        <div className="flex-1 min-w-[200px]">
          <input
            autoFocus
            list={listaId}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={modo === 'proceso' ? 'Proceso (ej. Soldadura)' : 'Nombre de la pieza (ej. Fondo)'}
            className={campo}
          />
          <datalist id={listaId}>
            {(modo === 'proceso' ? opcionesProceso : catalogo.filter((c) => !enCamino.has(c.id)).map((c) => c.nombre)).map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          {modo === 'pieza' && (
            <p className="text-xs text-feisen-texto-2 mt-1">Si ya existe en el catálogo de piezas se reutiliza con sus procesos; si no, se crea.</p>
          )}
        </div>
        {modo === 'pieza' && (
          <input
            type="number"
            min="0"
            step="any"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            title="Cantidad por unidad"
            className="w-24 border border-feisen-borde rounded-lg px-3 py-2 text-sm outline-none focus:border-feisen-azul bg-white"
          />
        )}
        <button type="submit" className="bg-feisen-azul text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-feisen-azul-claro">
          Agregar
        </button>
        <button type="button" onClick={cerrar} className="text-sm text-feisen-texto-2 hover:underline px-1 py-2">
          Cancelar
        </button>
      </div>
      {error && <p className="text-feisen-rojo text-xs">{error}</p>}
    </form>
  )
}
