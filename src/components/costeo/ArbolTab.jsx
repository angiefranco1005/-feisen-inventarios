import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ChevronRight, Component, X } from 'lucide-react'
import { formatCOP, formatNumber } from './utils/format'
import { cargarArbol } from './utils/arbolCosteo'
import { nombreCorto } from './utils/nombres'
import { PanelPieza, PanelProceso } from './PanelCosteo'

// Árbol de costeo de una ficha (opción B elegida por Angie el 2026-11-06: árbol + panel lateral).
// A la izquierda, un árbol limpio con nombre, cantidad y total (punto ámbar donde faltan tiempos);
// al tocar un proceso o una pieza, su detalle se abre en el panel de la derecha. En pantallas
// angostas el panel ocupa toda la pantalla con "← Árbol".
// Costos: costeo_procesos_resumen / costeo_resumen (suma por niveles). La mano de obra por hora
// sale SOLO del tiempo medido; lo que falta se avisa arriba y lleva directo al proceso.
const cop = (n) => formatCOP(n).replace(/,00$/, '')
const RAIZ = { tipo: 'raiz' }

function useAncho(query) {
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const f = () => setOk(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [query])
  return ok
}

// Índice del árbol: cada proceso y cada enlace de sub-pieza con su ruta de nombres y su camino
// de enlaces (para abrir las ramas al ir a él). También los totales por rubro sumados por niveles.
function indexar(arbol) {
  const raizId = arbol.raizId
  const nombreRaiz = arbol.fichas[raizId]?.nombre
  const corto = (n) => nombreCorto(n, nombreRaiz)
  const procesos = {}
  const enlaces = {}
  const total = { mp: 0, mo: 0, cif: 0, eq: 0 }
  const sinTiempos = {} // fichaId → true si algo de su rama no tiene tiempos

  function ir(fichaId, ruta, camino, enCamino, cantidad) {
    const r = arbol.resumen[fichaId] || {}
    total.mp += Number(r.total_mp || 0) * cantidad
    total.mo += Number(r.total_mod || 0) * cantidad
    total.cif += Number(r.cif_asignado || 0) * cantidad
    total.eq += Number(r.total_equipos || 0) * cantidad
    const hermanos = arbol.procesos[fichaId] || []
    let falta = false
    for (const p of hermanos) {
      procesos[p.id] = { proceso: p, fichaId, ruta, camino, hermanos }
      if (Number(arbol.costos[p.id]?.lineas_sin_tiempo) > 0) falta = true
    }
    for (const e of arbol.hijos[fichaId] || []) {
      if (enCamino.has(e.pieza_id)) continue
      const nombre = corto(arbol.fichas[e.pieza_id]?.nombre)
      const dentro = new Set(enCamino).add(e.pieza_id)
      enlaces[e.id] = { enlace: e, fichaId: e.pieza_id, ruta: [...ruta, nombre], camino, enCamino: dentro }
      if (ir(e.pieza_id, [...ruta, nombre], [...camino, e.id], dentro, cantidad * Number(e.cantidad || 0))) falta = true
    }
    sinTiempos[fichaId] = falta
    return falta
  }
  ir(raizId, [corto(nombreRaiz)], [], new Set([raizId]), 1)
  return { procesos, enlaces, total, sinTiempos, corto }
}

export default function ArbolTab({ fichaId }) {
  const [arbol, setArbol] = useState(null)
  const [error, setError] = useState('')
  const [abiertos, setAbiertos] = useState(null) // Set de enlaces abiertos (null = aún no se inicializa)
  const [sel, setSel] = useState(RAIZ)
  const [panelMovil, setPanelMovil] = useState(false)
  const lado = useAncho('(min-width: 1180px)')

  async function recargar() {
    try {
      const a = await cargarArbol(fichaId)
      setArbol(a)
      // La primera vez se abren las sub-piezas directas de la máquina.
      setAbiertos((s) => s || new Set((a.hijos[fichaId] || []).map((e) => e.id)))
    } catch (e) {
      setError('No se pudo cargar el árbol: ' + (e.message || e))
    }
  }

  useEffect(() => {
    setArbol(null)
    setAbiertos(null)
    setSel(RAIZ)
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId])

  const idx = useMemo(() => (arbol ? indexar(arbol) : null), [arbol])

  // Aviso de costo incompleto cerrado: se recuerda por ficha con la firma de los avisos que había.
  const claveAvisos = `costeo-avisos-cerrados-${fichaId}`
  const [firmaCerrada, setFirmaCerrada] = useState(null)
  useEffect(() => {
    let f = null
    try {
      f = window.localStorage.getItem(claveAvisos)
    } catch {
      // En modo privado puede fallar: simplemente no se recuerda.
    }
    setFirmaCerrada(f)
  }, [claveAvisos])

  function guardarCierre(firma) {
    setFirmaCerrada(firma)
    try {
      if (firma == null) window.localStorage.removeItem(claveAvisos)
      else window.localStorage.setItem(claveAvisos, firma)
    } catch {
      // Si no se puede guardar, solo queda cerrado mientras no se recargue.
    }
  }

  // Si lo seleccionado ya no existe (se quitó), vuelve a la máquina.
  useEffect(() => {
    if (!idx) return
    if (sel.tipo === 'proceso' && !idx.procesos[sel.id]) setSel(RAIZ)
    if (sel.tipo === 'pieza' && !idx.enlaces[sel.id]) setSel(RAIZ)
  }, [idx, sel])

  function seleccionar(s) {
    // Abre las ramas que llevan hasta lo seleccionado.
    const nodo = s.tipo === 'proceso' ? idx?.procesos[s.id] : s.tipo === 'pieza' ? idx?.enlaces[s.id] : null
    if (nodo?.camino?.length) setAbiertos((a) => new Set([...(a || []), ...nodo.camino]))
    setSel(s)
    if (!lado) setPanelMovil(true)
  }

  function alternar(id) {
    setAbiertos((s) => {
      const n = new Set(s || [])
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  if (error) return <p className="text-sm text-feisen-rojo">{error}</p>
  if (!arbol || !idx) return <p className="text-sm text-feisen-texto-2">Cargando…</p>

  const resumen = arbol.resumen[fichaId] || {}
  const nombreRaiz = arbol.fichas[fichaId]?.nombre

  // Avisos de todo el árbol: llevan directo al proceso o a la pieza.
  const sinTiempos = []
  const sinTarifa = []
  const sinCentro = []
  const vacias = []
  for (const [id, n] of Object.entries(idx.procesos)) {
    const c = arbol.costos[id] || {}
    const item = { texto: [...n.ruta.slice(1), n.proceso.nombre].join(' › '), sel: { tipo: 'proceso', id } }
    if (Number(c.lineas_sin_tiempo) > 0) sinTiempos.push(item)
    if (Number(c.lineas_sin_tarifa) > 0) sinTarifa.push(item)
    if (c.centro_costo_usado === 'Sin centro') sinCentro.push(item)
  }
  for (const [id, n] of Object.entries(idx.enlaces)) {
    if (!(arbol.procesos[n.fichaId] || []).length && !(arbol.hijos[n.fichaId] || []).length) {
      vacias.push({ texto: n.ruta.slice(1).join(' › '), sel: { tipo: 'pieza', id } })
    }
  }
  const totalAvisos = sinTiempos.length + sinTarifa.length + sinCentro.length + vacias.length
  // Firma: si aparecen avisos distintos, la banda vuelve a abrirse sola.
  const firmaAvisos = [
    ...sinTiempos.map((a) => `tiempo:${a.texto}`),
    ...sinTarifa.map((a) => `tarifa:${a.texto}`),
    ...sinCentro.map((a) => `centro:${a.texto}`),
    ...vacias.map((a) => `vacia:${a.texto}`),
  ]
    .sort()
    .join('\n')
  const avisosCerrados = totalAvisos > 0 && firmaCerrada === firmaAvisos

  const panel = (
    <Panel
      arbol={arbol}
      idx={idx}
      sel={sel}
      fichaId={fichaId}
      nombreRaiz={nombreRaiz}
      onCambio={recargar}
      onSeleccionar={seleccionar}
      onQuitado={() => {
        setSel(RAIZ)
        recargar()
      }}
      onAgregado={async (s) => {
        // Lo nuevo queda dentro de la pieza seleccionada: se abre esa rama y se selecciona lo nuevo.
        if (sel.tipo === 'pieza') setAbiertos((x) => new Set([...(x || []), sel.id]))
        await recargar()
        setSel(s)
      }}
    />
  )

  return (
    <div className="space-y-5">
      {/* Total */}
      <section className="bg-white border border-feisen-borde rounded-2xl px-5 sm:px-6 py-5 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="mr-auto">
          <p className="text-[11px] uppercase tracking-[0.06em] text-feisen-texto-2">Costo total por unidad</p>
          <p className="tabular-nums text-[28px] leading-tight font-semibold tracking-tight text-feisen-texto mt-1">{cop(resumen.costo_total)}</p>
          {resumen.cif_periodo_usado && <p className="text-xs text-feisen-texto-2 mt-1">CIF con las tasas del período {resumen.cif_periodo_usado}</p>}
        </div>
        <p className="tabular-nums text-sm text-feisen-texto-2 flex flex-wrap gap-x-4 gap-y-1">
          <span>MP <span className="text-feisen-texto">{cop(idx.total.mp)}</span></span>
          <span>MO <span className="text-feisen-texto">{cop(idx.total.mo)}</span></span>
          <span>CIF <span className="text-feisen-texto">{cop(idx.total.cif)}</span></span>
          {idx.total.eq > 0 && <span>Equipos <span className="text-feisen-texto">{cop(idx.total.eq)}</span></span>}
        </p>
      </section>

      {/* Avisos: lo que deja el costo incompleto va primero, con botones que llevan al sitio */}
      {totalAvisos > 0 && avisosCerrados && (
        <button
          type="button"
          onClick={() => guardarCierre(null)}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-1 text-xs text-amber-800 hover:underline"
        >
          <AlertTriangle size={14} className="text-amber-600 shrink-0" />
          {totalAvisos === 1 ? '1 aviso' : `${totalAvisos} avisos`} de costo incompleto · Ver
        </button>
      )}
      {totalAvisos > 0 && !avisosCerrados && (
        <section className="relative rounded-2xl border border-amber-200 bg-amber-50 px-4 sm:px-5 py-4 pr-12 sm:pr-14">
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => guardarCierre(firmaAvisos)}
            className="absolute top-1 right-1 w-11 h-11 flex items-center justify-center rounded-lg text-amber-700 hover:bg-amber-100"
          >
            <X size={18} />
          </button>
          <div className="flex gap-3">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1 space-y-3 text-sm text-amber-900">
              <p className="font-semibold">El costo está incompleto</p>
              <Grupo items={sinTiempos} onIr={seleccionar} texto={`${sinTiempos.length === 1 ? '1 proceso tiene' : `${sinTiempos.length} procesos tienen`} personas por hora sin tiempos medidos: no suman mano de obra ni CIF.`} />
              <Grupo items={sinTarifa} onIr={seleccionar} texto="Personas sin tarifa o sin valor por unidad:" />
              <Grupo items={sinCentro} onIr={seleccionar} texto='Sin centro de costo, no suman CIF (escógelo en "Editar proceso" o en Responsables por etapa):' />
              <Grupo items={vacias} onIr={seleccionar} texto="Piezas sin procesos todavía (hoy suman $ 0):" />
            </div>
          </div>
        </section>
      )}

      <div className={lado ? 'grid gap-6 items-start' : ''} style={lado ? { gridTemplateColumns: 'minmax(0,1fr) 440px' } : undefined}>
        {/* Árbol */}
        <section className="bg-white border border-feisen-borde rounded-2xl p-2">
          <Fila
            nivel={0}
            tipo="raiz"
            nombre={idx.corto(nombreRaiz)}
            completo={nombreRaiz}
            total={cop(resumen.costo_total)}
            seleccionado={sel.tipo === 'raiz'}
            onSel={() => seleccionar(RAIZ)}
          />
          <Rama arbol={arbol} idx={idx} fichaId={fichaId} nivel={1} enCamino={new Set([fichaId])} abiertos={abiertos} sel={sel} onSel={seleccionar} onAlternar={alternar} />
          <p className="px-3 pt-3 pb-2 text-xs text-feisen-texto-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" /> Sin tiempos medidos · toca un proceso o pieza para ver su detalle
          </p>
        </section>

        {/* Panel: al lado en pantallas anchas; en angostas, a pantalla completa al tocar algo */}
        {lado ? (
          <aside className="sticky top-4 bg-white border border-feisen-borde rounded-2xl shadow-sm max-h-[calc(100vh-2rem)] overflow-y-auto p-6">{panel}</aside>
        ) : (
          panelMovil && (
            <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
              <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-feisen-borde-suave px-2 h-14 flex items-center">
                <button onClick={() => setPanelMovil(false)} className="h-11 inline-flex items-center gap-2 px-3 rounded-lg text-sm text-feisen-azul hover:bg-feisen-azul-suave">
                  <ArrowLeft size={16} /> Árbol
                </button>
              </div>
              <div className="px-4 py-5 max-w-xl mx-auto">{panel}</div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

function Grupo({ items, texto, onIr }) {
  if (!items.length) return null
  return (
    <div>
      <p>{texto}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((x) => (
          <button
            key={x.sel.tipo + x.sel.id}
            onClick={() => onIr(x.sel)}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg bg-white/80 border border-amber-200 px-3 py-1.5 text-left text-[13px] text-amber-900 hover:bg-white"
          >
            {x.texto}
            <ChevronRight size={12} className="opacity-60" />
          </button>
        ))}
      </div>
    </div>
  )
}

function Rama({ arbol, idx, fichaId, nivel, enCamino, abiertos, sel, onSel, onAlternar }) {
  const procesos = arbol.procesos[fichaId] || []
  const hijos = (arbol.hijos[fichaId] || []).filter((e) => !enCamino.has(e.pieza_id))
  return (
    <>
      {procesos.map((p, i) => {
        const c = arbol.costos[p.id] || {}
        return (
          <Fila
            key={p.id}
            nivel={nivel}
            tipo="proceso"
            numero={i + 1}
            nombre={p.nombre}
            total={cop(c.costo_total)}
            aviso={Number(c.lineas_sin_tiempo) > 0}
            seleccionado={sel.tipo === 'proceso' && sel.id === p.id}
            onSel={() => onSel({ tipo: 'proceso', id: p.id })}
          />
        )
      })}
      {hijos.map((e) => {
        const ficha = arbol.fichas[e.pieza_id]
        const abierto = abiertos?.has(e.id)
        const vacia = !(arbol.procesos[e.pieza_id] || []).length && !(arbol.hijos[e.pieza_id] || []).length
        const cant = Number(e.cantidad || 0)
        return (
          <div key={e.id}>
            <Fila
              nivel={nivel}
              tipo="pieza"
              nombre={idx.corto(ficha?.nombre)}
              completo={ficha?.nombre}
              extra={`× ${formatNumber(cant, cant % 1 ? 2 : 0)}`}
              total={cop(Number(arbol.resumen[e.pieza_id]?.costo_total || 0) * cant)}
              abierto={abierto}
              aviso={!abierto && idx.sinTiempos[e.pieza_id]}
              vacia={vacia}
              seleccionado={sel.tipo === 'pieza' && sel.id === e.id}
              onSel={() => onSel({ tipo: 'pieza', id: e.id })}
              onAlternar={() => onAlternar(e.id)}
            />
            {abierto && (
              <Rama
                arbol={arbol}
                idx={idx}
                fichaId={e.pieza_id}
                nivel={nivel + 1}
                enCamino={new Set(enCamino).add(e.pieza_id)}
                abiertos={abiertos}
                sel={sel}
                onSel={onSel}
                onAlternar={onAlternar}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

// Una fila del árbol. Las líneas guía finas (opción A) marcan cada nivel de sangría.
function Fila({ nivel, tipo, numero, nombre, completo, extra, total, abierto, aviso, vacia, seleccionado, onSel, onAlternar }) {
  const guias = Array.from({ length: nivel }, (_, i) => (
    <span key={i} className="absolute top-0 bottom-0 border-l border-feisen-borde-suave" style={{ left: i * 18 + 21 }} />
  ))
  return (
    <div className={`relative flex items-center rounded-lg ${seleccionado ? 'bg-feisen-azul-suave' : 'hover:bg-feisen-fondo'}`} style={{ paddingLeft: nivel * 18 }}>
      {guias}
      {seleccionado && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-feisen-azul" />}
      {tipo === 'pieza' ? (
        <button
          onClick={onAlternar}
          aria-label={abierto ? 'Contraer' : 'Expandir'}
          aria-expanded={abierto}
          className="w-11 h-11 shrink-0 grid place-items-center rounded-lg text-feisen-gris-medio hover:text-feisen-texto relative"
        >
          <ChevronRight size={16} className={`transition-transform ${abierto ? 'rotate-90' : ''}`} />
        </button>
      ) : tipo === 'raiz' ? (
        <span className="w-11 h-11 shrink-0 grid place-items-center text-feisen-texto-2">
          <Component size={15} />
        </span>
      ) : (
        <span className="w-11 shrink-0 text-right pr-3.5 tabular-nums text-xs text-feisen-gris-medio relative">{numero}</span>
      )}
      <button onClick={onSel} title={completo || undefined} className="flex-1 min-w-0 flex items-center gap-3 min-h-[44px] pr-3 text-left">
        <span className={`min-w-0 flex-1 truncate text-sm ${tipo === 'proceso' ? 'text-feisen-texto' : 'font-semibold text-feisen-texto'}`}>
          {nombre}
          {extra && <span className="font-normal text-feisen-texto-2"> {extra}</span>}
        </span>
        {aviso && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0">
            <span className="sr-only">Sin tiempos</span>
          </span>
        )}
        {vacia && <span className="text-[11px] text-amber-700 shrink-0">vacía</span>}
        <span className={`tabular-nums text-sm whitespace-nowrap ${tipo === 'proceso' ? 'text-feisen-texto-2' : 'font-medium text-feisen-texto'}`}>{total}</span>
      </button>
    </div>
  )
}

function Panel({ arbol, idx, sel, fichaId, nombreRaiz, onCambio, onSeleccionar, onQuitado, onAgregado }) {
  if (sel.tipo === 'proceso' && idx.procesos[sel.id]) {
    const n = idx.procesos[sel.id]
    return <PanelProceso arbol={arbol} proceso={n.proceso} ruta={n.ruta} hermanos={n.hermanos} onCambio={onCambio} onQuitado={onQuitado} />
  }
  if (sel.tipo === 'pieza' && idx.enlaces[sel.id]) {
    const n = idx.enlaces[sel.id]
    return (
      <PanelPieza
        arbol={arbol}
        fichaId={n.fichaId}
        enlace={n.enlace}
        ruta={n.ruta.slice(0, -1)}
        nombreRaiz={nombreRaiz}
        enCamino={n.enCamino}
        onCambio={onCambio}
        onSeleccionar={onSeleccionar}
        onQuitado={onQuitado}
        onAgregado={onAgregado}
      />
    )
  }
  return (
    <PanelPieza
      arbol={arbol}
      fichaId={fichaId}
      enlace={null}
      ruta={[]}
      nombreRaiz={nombreRaiz}
      enCamino={new Set([fichaId])}
      onCambio={onCambio}
      onSeleccionar={onSeleccionar}
      onQuitado={onQuitado}
      onAgregado={onAgregado}
    />
  )
}
