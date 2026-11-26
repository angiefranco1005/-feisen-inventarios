import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cargarArbol, recorrerArbol } from '../utils/arbolCosteo'
import { formatCOP, formatNumber } from '../utils/format'
import { nombreCorto, tipoTitulo } from '../utils/nombres'
import EtapasMaquina from './EtapasMaquina'

// Diagrama de operaciones (cursograma sinóptico) de una máquina, 2026-11-26 (opción A de Angie).
// Se arma solo con el despiece (costeo_ficha_piezas) y la hoja de ruta de cada pieza (costeo_procesos):
// cada pieza baja en su columna con sus operaciones en orden; las columnas se juntan donde se ensambla
// el conjunto, siguen las operaciones del conjunto y al final llega la máquina terminada.
// Símbolos: círculo = operación (azul si ya tiene tiempo, ámbar si no), cuadrado = inspección.
// Numeración O-1, O-2… en el orden en que se hacen (primero las piezas, de izquierda a derecha).

const COL_W = 220
const GAP = 18
const ETQ_H = 46
const OP_H = 60
const R = 13
const AX = R + 4
const PAD = 20

const corto = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const esInspeccion = (nombre) => /inspec|control|verific|calidad/i.test(nombre || '')

function textoTiempo(h) {
  if (!(h > 0)) return 'sin tiempo'
  const min = h * 60
  return min < 60 ? `${formatNumber(min, min < 10 ? 1 : 0)} min c/u` : `${formatNumber(h, 2)} h c/u`
}

function armarDiagrama(arbol, ocultarVacias) {
  const raizNombre = arbol.fichas[arbol.raizId]?.nombre
  let n = 0
  const tieneRuta = {}
  function conRuta(id, pila = new Set()) {
    if (id in tieneRuta) return tieneRuta[id]
    if (pila.has(id)) return false
    pila.add(id)
    const v = (arbol.procesos[id] || []).length > 0 || (arbol.hijos[id] || []).some((e) => conRuta(e.pieza_id, pila))
    pila.delete(id)
    return (tieneRuta[id] = v)
  }

  const mover = (els, dx) =>
    els.map((e) => (e.t === 'linea' ? { ...e, x1: e.x1 + dx, x2: e.x2 + dx } : { ...e, x: e.x + dx }))

  function ops(id, x, y0, els) {
    let y = y0
    for (const p of arbol.procesos[id] || []) {
      const c = arbol.costos[p.id] || {}
      els.push({ t: esInspeccion(p.nombre) ? 'insp' : 'op', x, y: y + OP_H / 2, n: ++n, nombre: tipoTitulo(p.nombre), horas: +c.horas_hombre_unidad || 0, costo: +c.costo_total || 0 })
      y += OP_H
    }
    return y
  }

  function lay(id, cant, pila) {
    const nombre = id === arbol.raizId ? tipoTitulo(raizNombre) : nombreCorto(arbol.fichas[id]?.nombre, raizNombre)
    const hijos = (arbol.hijos[id] || []).filter((e) => !pila.has(e.pieza_id) && (!ocultarVacias || conRuta(e.pieza_id)))
    if (!hijos.length) {
      const els = [{ t: 'pieza', x: 0, y: 0, nombre, cant }]
      const linea = { t: 'linea', x1: AX, y1: ETQ_H - 8, x2: AX, y2: 0 }
      els.push(linea)
      let y = ETQ_H
      if (!(arbol.procesos[id] || []).length) {
        els.push({ t: 'vacio', x: AX, y: y + 4 })
        y += 36
      } else y = ops(id, AX, y, els)
      linea.y2 = y
      return { w: COL_W, h: y, ax: AX, els }
    }
    const subs = hijos.map((e) => lay(e.pieza_id, Number(e.cantidad || 0), new Set(pila).add(e.pieza_id)))
    const juntar = Math.max(...subs.map((s) => s.h)) + 18
    const els = []
    const anclas = []
    let x = 0
    subs.forEach((s) => {
      els.push(...mover(s.els, x))
      els.push({ t: 'linea', x1: x + s.ax, y1: s.h, x2: x + s.ax, y2: juntar })
      anclas.push(x + s.ax)
      x += s.w + GAP
    })
    const x1 = Math.min(...anclas)
    const x2 = Math.max(...anclas)
    const cx = subs.length === 1 ? anclas[0] : (x1 + x2) / 2
    if (subs.length > 1) els.push({ t: 'linea', x1, y1: juntar, x2, y2: juntar })
    const lineaBaja = { t: 'linea', x1: cx, y1: juntar, x2: cx, y2: juntar }
    els.push(lineaBaja)
    els.push({ t: 'ensamble', x: cx, y: juntar + 10, nombre, cant, raiz: id === arbol.raizId })
    let y = ops(id, cx, juntar + 44, els)
    lineaBaja.y2 = y
    return { w: Math.max(x - GAP, cx - AX + COL_W), h: y, ax: cx, els }
  }

  const r = lay(arbol.raizId, 1, new Set([arbol.raizId]))
  const els = [...r.els, { t: 'linea', x1: r.ax, y1: r.h, x2: r.ax, y2: r.h + 14 }, { t: 'fin', x: r.ax, y: r.h + 14, nombre: tipoTitulo(raizNombre) }]
  return { w: r.w, h: r.h + 54, els }
}

function resumir(arbol) {
  let ops = 0
  let sinTiempo = 0
  let horas = 0
  let sinRuta = 0
  recorrerArbol(arbol, (id, ruta, cant) => {
    const ps = arbol.procesos[id] || []
    if (!ps.length && !(arbol.hijos[id] || []).length) sinRuta++
    for (const p of ps) {
      ops++
      const h = +arbol.costos[p.id]?.horas_hombre_unidad || 0
      if (!(h > 0)) sinTiempo++
      horas += h * cant
    }
  })
  return { ops, sinTiempo, horas, sinRuta }
}

export default function DiagramaMaquina() {
  const { id } = useParams()
  const [arbol, setArbol] = useState(null)
  const [error, setError] = useState('')
  const [ocultar, setOcultar] = useState(false)
  const [escala, setEscala] = useState(1)

  useEffect(() => {
    setArbol(null)
    cargarArbol(id).then(setArbol).catch((e) => setError('No se pudo cargar la máquina: ' + e.message))
  }, [id])

  const dib = useMemo(() => (arbol ? armarDiagrama(arbol, ocultar) : null), [arbol, ocultar])
  const res = useMemo(() => (arbol ? resumir(arbol) : null), [arbol])

  if (error) return <p className="text-sm text-feisen-rojo">{error}</p>
  if (!arbol) return <p className="text-sm text-feisen-texto-2">Cargando…</p>
  const raiz = arbol.fichas[arbol.raizId]
  if (!raiz) return <p className="text-sm text-feisen-texto-2">No se encontró esta máquina. <Link to="/costeo" className="text-feisen-azul hover:underline">Volver</Link></p>

  return (
    <div className="max-w-7xl mx-auto tabular-nums">
      <Link to={`/costeo/maquina/${id}`} className="text-xs text-feisen-azul hover:underline">← Fichas de costeo</Link>
      <div className="flex flex-wrap items-end justify-between gap-3 mt-1 mb-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-feisen-texto tracking-tight">{tipoTitulo(raiz.nombre)}</h1>
          <p className="text-sm text-feisen-texto-2 mt-0.5">Diagrama de operaciones: cada pieza con sus procesos en orden, hasta la máquina terminada.</p>
        </div>
      </div>
      <div className="mb-4">
        <EtapasMaquina maquinaId={id} activa="diagrama" />
      </div>

      <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-feisen-borde">
          <Dato titulo="Operaciones" valor={res.ops} />
          <Dato titulo="Sin tiempo medido" valor={res.sinTiempo} aviso={res.sinTiempo > 0} />
          <Dato titulo="Horas-hombre por máquina" valor={res.horas > 0 ? formatNumber(res.horas, 2) : '—'} detalle="solo lo que ya tiene tiempo" />
          <Dato titulo="Piezas sin hoja de ruta" valor={res.sinRuta} aviso={res.sinRuta > 0} />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-feisen-borde text-xs">
          <button type="button" onClick={() => setOcultar((v) => !v)} aria-pressed={ocultar} className={`h-8 rounded-md px-2.5 ${ocultar ? 'bg-feisen-azul-suave text-feisen-azul' : 'text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
            Ocultar piezas sin hoja de ruta
          </button>
          <span className="flex-1" />
          <Leyenda />
          <div className="flex items-center gap-1 ml-2">
            <button type="button" aria-label="Alejar" onClick={() => setEscala((e) => Math.max(0.5, +(e - 0.2).toFixed(1)))} className="h-8 w-8 rounded-md border border-feisen-borde text-feisen-texto hover:bg-feisen-fondo">−</button>
            <span className="w-11 text-center text-feisen-texto-2">{Math.round(escala * 100)} %</span>
            <button type="button" aria-label="Acercar" onClick={() => setEscala((e) => Math.min(1.6, +(e + 0.2).toFixed(1)))} className="h-8 w-8 rounded-md border border-feisen-borde text-feisen-texto hover:bg-feisen-fondo">+</button>
          </div>
        </div>
        <div className="overflow-auto bg-[#FBFBFC]" style={{ maxHeight: '75vh' }}>
          <svg
            width={(dib.w + PAD * 2) * escala}
            height={(dib.h + PAD * 2) * escala}
            viewBox={`${-PAD} ${-PAD} ${dib.w + PAD * 2} ${dib.h + PAD * 2}`}
            role="img"
            aria-label={`Diagrama de operaciones de ${tipoTitulo(raiz.nombre)}`}
            className="block"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            {dib.els.filter((e) => e.t === 'linea').map((e, i) => (
              <line key={'l' + i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#9AA5B4" strokeWidth="1.5" />
            ))}
            {dib.els.filter((e) => e.t !== 'linea').map((e, i) => (
              <Elemento key={i} e={e} />
            ))}
          </svg>
        </div>
        <p className="px-4 py-3 text-xs text-feisen-texto-2 border-t border-feisen-borde">
          Se arma solo con el despiece y las hojas de ruta. Para cambiar el orden o agregar procesos, ve a{' '}
          <Link to={`/costeo/pasos/ruta?maquina=${id}`} className="text-feisen-azul hover:underline">2 · Hojas de ruta</Link>.
        </p>
      </div>
    </div>
  )
}

function Elemento({ e }) {
  if (e.t === 'pieza') {
    return (
      <g>
        <title>{e.nombre}</title>
        <text x={e.x} y={14} fontSize="13" fontWeight="600" fill="#1F2937">{corto(e.nombre, 26)}</text>
        <text x={e.x} y={30} fontSize="11" fill="#5B6472">{e.cant !== 1 ? `× ${formatNumber(e.cant, e.cant % 1 ? 2 : 0)} · ` : ''}pieza</text>
      </g>
    )
  }
  if (e.t === 'vacio') {
    return (
      <g>
        <rect x={e.x - 10} y={e.y} width={130} height={22} rx={11} fill="#FFF7E8" stroke="#E5B865" strokeDasharray="3 3" />
        <text x={e.x + 55} y={e.y + 15} fontSize="11" textAnchor="middle" fill="#8A5A0A">Sin hoja de ruta</text>
      </g>
    )
  }
  if (e.t === 'op' || e.t === 'insp') {
    const conTiempo = e.horas > 0
    const relleno = conTiempo ? '#064794' : '#FFFFFF'
    const borde = conTiempo ? '#064794' : '#D9A13B'
    return (
      <g>
        <title>{`O-${e.n} · ${e.nombre}`}</title>
        {e.t === 'insp' ? (
          <rect x={e.x - R} y={e.y - R} width={R * 2} height={R * 2} rx={3} fill={relleno} stroke={borde} strokeWidth="2" />
        ) : (
          <circle cx={e.x} cy={e.y} r={R} fill={relleno} stroke={borde} strokeWidth="2" />
        )}
        <text x={e.x} y={e.y + 4} fontSize="11" fontWeight="600" textAnchor="middle" fill={conTiempo ? '#FFFFFF' : '#8A5A0A'}>{e.n}</text>
        <text x={e.x + R + 8} y={e.y - 2} fontSize="12.5" fontWeight="500" fill="#1F2937">{corto(e.nombre, 24)}</text>
        <text x={e.x + R + 8} y={e.y + 13} fontSize="11" fill={conTiempo ? '#5B6472' : '#92400E'}>
          {textoTiempo(e.horas)}{e.costo > 0 ? ` · ${formatCOP(e.costo)}` : ''}
        </text>
      </g>
    )
  }
  if (e.t === 'ensamble') {
    const w = 168
    return (
      <g>
        <title>{e.nombre}</title>
        <rect x={e.x - w / 2} y={e.y} width={w} height={26} rx={6} fill="#E8EEF7" stroke="#064794" strokeWidth="1.2" />
        <text x={e.x} y={e.y + 17} fontSize="12" fontWeight="600" textAnchor="middle" fill="#064794">
          {corto(e.raiz ? 'Ensamble final' : `Ensamble · ${e.nombre}${e.cant !== 1 ? ` ×${formatNumber(e.cant, 0)}` : ''}`, 26)}
        </text>
      </g>
    )
  }
  if (e.t === 'fin') {
    const w = 200
    return (
      <g>
        <rect x={e.x - w / 2} y={e.y} width={w} height={30} rx={15} fill="#064794" />
        <text x={e.x} y={e.y + 19} fontSize="12.5" fontWeight="600" textAnchor="middle" fill="#FFFFFF">{corto(`${e.nombre} terminada`, 30)}</text>
      </g>
    )
  }
  return null
}

function Dato({ titulo, valor, detalle, aviso }) {
  return (
    <div className="px-4 py-3 border-r border-feisen-borde-suave last:border-r-0">
      <div className="text-xs text-feisen-texto-2">{titulo}</div>
      <div className={`text-lg font-semibold mt-0.5 ${aviso ? 'text-[#92400E]' : 'text-feisen-texto'}`}>{valor}</div>
      {detalle && <div className="text-[11px] text-feisen-texto-2">{detalle}</div>}
    </div>
  )
}

function Leyenda() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-feisen-texto-2">
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-feisen-azul" />Operación con tiempo</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-[#D9A13B]" />Sin tiempo</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border-2 border-feisen-azul" />Inspección</span>
      <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded-sm bg-feisen-azul-suave border border-feisen-azul" />Ensamble</span>
    </div>
  )
}
