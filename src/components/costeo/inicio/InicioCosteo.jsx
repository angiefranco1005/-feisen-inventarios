import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import Modal from '../../shared/Modal'
import { formatCOP } from '../utils/format'
import { nombreCorto, tipoTitulo } from '../utils/nombres'
import { cargarDatosCosteo, millones, pct, periodoTexto } from './datosInicio'
import { Anillo, BarraPrecio, ChipMargen, COLORES, Leyenda, RAYADO, nombreProducto } from './piezasTablero'

// Inicio de Costeo (2026-11-26): todas las máquinas como tarjetas, estilo Stripe. Arriba 4 resúmenes
// (ventas, cuántas tienen ficha, utilidad promedio, la que sigue por costear). Cada tarjeta abre el
// tablero de esa máquina (/costeo/maquina/:id). Las máquinas que se venden pero no tienen ficha salen
// con borde punteado y "Crear ficha".
const CLAVE_FILTRO = 'costeo-inicio-solo-ficha'

export default function InicioCosteo() {
  const navigate = useNavigate()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [soloFicha, setSoloFicha] = useState(() => {
    try { return window.localStorage.getItem(CLAVE_FILTRO) === '1' } catch { return false }
  })
  const [nueva, setNueva] = useState(false)
  const [creando, setCreando] = useState('')

  useEffect(() => {
    cargarDatosCosteo().then(setDatos).catch((e) => setError('No se pudieron leer los datos: ' + e.message))
  }, [])

  function cambiarFiltro(v) {
    setSoloFicha(v)
    try { window.localStorage.setItem(CLAVE_FILTRO, v ? '1' : '0') } catch { /* sin almacenamiento */ }
  }

  async function crearFicha(nombre, producto = null) {
    setCreando(producto || nombre)
    const { data, error: e } = await supabase.from('costeo_fichas').insert({ nombre, tipo: 'maquina', producto_odoo: producto }).select('id').single()
    setCreando('')
    if (e) return setError('No se pudo crear la ficha: ' + e.message)
    navigate(`/costeo/maquina/${data.id}`)
  }

  const resumen = useMemo(() => {
    if (!datos) return null
    const { maquinas, sinFicha } = datos
    const conPrecio = maquinas.filter((m) => m.completo && m.utilidad !== null)
    const pesoVentas = conPrecio.reduce((s, m) => s + m.precio * (m.unidades || 1), 0)
    const utilidadProm = pesoVentas ? conPrecio.reduce((s, m) => s + m.utilidad * (m.unidades || 1), 0) / pesoVentas : null
    const incompletas = maquinas.filter((m) => !m.completo).sort((a, b) => b.valorVentas - a.valorVentas)
    const sigue = sinFicha[0]
      ? { nombre: nombreProducto(sinFicha[0].producto), detalle: `Sin ficha · ${pct(sinFicha[0].participacion)} de las ventas` }
      : incompletas[0]
        ? { nombre: tipoTitulo(incompletas[0].nombre), detalle: `Va en ${Math.round((incompletas[0].avance || 0) * 100)} % del costeo` }
        : null
    return {
      total: maquinas.length + sinFicha.length,
      conFicha: maquinas.length,
      cubren: maquinas.reduce((s, m) => s + m.participacion, 0),
      utilidadProm,
      completas: conPrecio.length,
      sigue,
    }
  }, [datos])

  if (error) return <p className="text-sm text-feisen-rojo">{error}</p>
  if (!datos) return <Esqueleto />

  const maquinas = [...datos.maquinas].sort((a, b) => b.valorVentas - a.valorVentas || a.nombre.localeCompare(b.nombre))
  const periodo = periodoTexto(datos.meses)

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 tabular-nums">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs text-feisen-texto-2">Costeo · Fichas y precio</div>
          <h1 className="text-2xl font-semibold tracking-tight text-feisen-texto mt-1">Tus máquinas</h1>
          <p className="text-sm text-feisen-texto-2 mt-1">Precio = promedio facturado por Feisen en Odoo{periodo ? ` · ${periodo}` : ''} · se actualiza solo</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/costeo?catalogo=pieza" className="h-10 px-3 inline-flex items-center rounded-lg text-sm text-feisen-texto-2 hover:bg-feisen-fondo">Catálogo de piezas</Link>
          <button type="button" onClick={() => setNueva(true)} className="h-10 px-4 rounded-lg bg-feisen-rojo text-white text-sm font-medium hover:opacity-90">+ Nueva ficha</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi titulo="Ventas de mezcladoras" valor={millones(datos.totalVentas)} detalle={`${new Intl.NumberFormat('es-CO').format(datos.totalUnidades)} unidades`} />
        <Kpi titulo="Máquinas con ficha" valor={`${resumen.conFicha} de ${resumen.total}`} detalle={`Cubren el ${pct(resumen.cubren)} de lo vendido`} />
        <Kpi
          titulo="Utilidad promedio"
          valor={resumen.utilidadProm === null ? 'Aún no' : pct(resumen.utilidadProm)}
          apagado={resumen.utilidadProm === null}
          detalle={resumen.utilidadProm === null ? 'Ninguna ficha tiene el costo completo' : `De ${resumen.completas} ${resumen.completas === 1 ? 'máquina completa' : 'máquinas completas'}, según lo vendido`}
          aviso={resumen.utilidadProm === null}
        />
        <Kpi titulo="La que sigue por costear" valor={resumen.sigue?.nombre.replace(/^Mezcladora /, '') || 'Ninguna'} detalle={resumen.sigue?.detalle || 'Todas tienen el costo completo'} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[[false, 'Todas'], [true, 'Solo con ficha']].map(([v, label]) => (
          <button key={label} type="button" onClick={() => cambiarFiltro(v)} className={`text-xs rounded-md px-2.5 py-1.5 ${soloFicha === v ? 'bg-feisen-azul-suave text-feisen-azul' : 'text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <Leyenda items={[[COLORES.mp, 'Materia prima'], [COLORES.mo, 'Mano de obra'], [COLORES.cif, 'CIF'], [COLORES.utilidad, 'Utilidad'], [RAYADO, 'Sin costear']]} />
      </div>

      <div className="grid gap-4 sm:gap-5 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))]">
        {maquinas.map((m) => (
          <TarjetaMaquina key={m.fichaId} m={m} />
        ))}
        {!soloFicha &&
          datos.sinFicha.map((s) => (
            <div key={s.producto} className="bg-white border border-dashed border-[#D6DAE1] rounded-[14px] p-5 flex flex-col gap-3.5">
              <div>
                <div className="font-semibold text-[15px] text-feisen-texto">{nombreProducto(s.producto)}</div>
                <div className="text-sm text-feisen-texto-2 mt-0.5">{fmtU(s.unidades)} vendidas · {pct(s.participacion)} de las ventas</div>
              </div>
              <div>
                <div className="text-xs text-feisen-texto-2">Precio de venta</div>
                <div className="text-[26px] leading-tight font-semibold tracking-tight text-feisen-texto mt-0.5">{formatCOP(s.precio)}</div>
              </div>
              <div className="h-3 rounded-md bg-[#F1F3F7]" />
              <div className="flex items-center justify-between border-t border-[#F2F3F5] pt-3 text-sm">
                <span className="text-feisen-gris-medio">Sin ficha de costo</span>
                <button type="button" disabled={!!creando} onClick={() => crearFicha(nombreProducto(s.producto).toUpperCase(), s.producto)} className="text-feisen-azul font-medium hover:underline disabled:opacity-50">
                  {creando === s.producto ? 'Creando…' : 'Crear ficha →'}
                </button>
              </div>
            </div>
          ))}
      </div>

      {!maquinas.length && !datos.sinFicha.length && <p className="text-sm text-feisen-texto-2">Todavía no hay máquinas. Crea la primera ficha con «+ Nueva ficha».</p>}

      <p className="text-xs text-feisen-texto-2">
        Al tocar una tarjeta se abre esa máquina a fondo.{' '}
        <Link to="/costeo?vista=lista" className="text-feisen-azul hover:underline">Ver la lista para renombrar o eliminar fichas</Link>
      </p>

      {nueva && <NuevaFicha onCerrar={() => setNueva(false)} onCrear={(n) => crearFicha(n)} creando={!!creando} />}
    </div>
  )
}

const fmtU = (n) => new Intl.NumberFormat('es-CO').format(n || 0)

function Kpi({ titulo, valor, detalle, apagado, aviso }) {
  return (
    <section className="bg-white border border-[#ECEEF1] rounded-[14px] px-4 py-4 sm:px-5 min-w-0">
      <div className="text-xs text-feisen-texto-2">{titulo}</div>
      <div className={`text-xl sm:text-[22px] font-semibold mt-1 truncate ${apagado ? 'text-feisen-gris-medio' : 'text-feisen-texto'}`}>{valor}</div>
      <div className={`text-xs mt-0.5 ${aviso ? 'text-[#92400E]' : 'text-feisen-texto-2'}`}>{detalle}</div>
    </section>
  )
}

function TarjetaMaquina({ m }) {
  const faltan = m.conjuntos.filter((c) => !(c.costo > 0))
  return (
    <Link to={`/costeo/maquina/${m.fichaId}`} className="bg-white border border-[#ECEEF1] rounded-[14px] p-5 flex flex-col gap-3.5 hover:shadow-[0_0_0_1px_#C9D6EA,0_6px_18px_rgba(20,33,61,0.06)] transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-[15px] text-feisen-texto">{tipoTitulo(m.nombre)}</div>
          <div className="text-sm text-feisen-texto-2 mt-0.5">
            {m.ventas ? `${fmtU(m.unidades)} vendidas · ${pct(m.participacion)} de las ventas` : 'Sin ventas vinculadas en Odoo'}
          </div>
        </div>
        <Anillo valor={m.avance} />
      </div>
      <div>
        <div className="text-xs text-feisen-texto-2">{m.fuentePrecio === 'lista' ? 'Precio de lista' : 'Precio de venta'}</div>
        <div className={`text-[26px] leading-tight font-semibold tracking-tight mt-0.5 ${m.precio > 0 ? 'text-feisen-texto' : 'text-feisen-gris-medio'}`}>
          {m.precio > 0 ? formatCOP(m.precio) : 'Sin precio'}
        </div>
      </div>
      <BarraPrecio m={m} />
      <div className="grid grid-cols-3 gap-2 border-t border-[#F2F3F5] pt-3">
        <Dato titulo="Costo" valor={m.costo > 0 ? formatCOP(m.costo) : '—'} />
        <Dato titulo="Utilidad c/u" valor={m.utilidad !== null ? formatCOP(m.utilidad) : '—'} apagado={!m.completo} />
        <div className="min-w-0">
          <div className="text-[11px] text-feisen-texto-2">% utilidad</div>
          <div className="mt-0.5"><ChipMargen m={m} /></div>
        </div>
      </div>
      {m.conjuntos.length > 0 && !m.completo && (
        <div className="text-xs text-[#92400E] truncate">
          {m.costeados} de {m.conjuntos.length} conjuntos costeados · falta {faltan.slice(0, 3).map((c) => nombreCorto(c.nombre, m.nombre)).join(', ')}{faltan.length > 3 ? '…' : ''}
        </div>
      )}
      {m.conjuntos.length === 0 && m.costo === 0 && <div className="text-xs text-[#92400E]">Empieza por el despiece: qué conjuntos y piezas lleva.</div>}
    </Link>
  )
}

function Dato({ titulo, valor, apagado }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-feisen-texto-2">{titulo}</div>
      <div className={`font-semibold text-sm mt-0.5 truncate ${apagado ? 'text-feisen-gris-medio' : 'text-feisen-texto'}`}>{valor}</div>
    </div>
  )
}

function NuevaFicha({ onCerrar, onCrear, creando }) {
  const [nombre, setNombre] = useState('')
  return (
    <Modal titulo="Nueva ficha de máquina" onCerrar={onCerrar}>
      <form onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) onCrear(nombre.trim()) }} className="space-y-4 text-sm">
        <label className="block">
          <span className="block text-xs text-feisen-texto-2 mb-1">Nombre de la máquina</span>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Mezcladora 2 bultos" className="h-11 w-full rounded-lg border border-feisen-borde px-3 text-base outline-none focus:border-feisen-azul" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="h-10 px-3 rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo">Cancelar</button>
          <button type="submit" disabled={creando || !nombre.trim()} className="h-10 px-4 rounded-lg bg-feisen-azul text-white font-medium disabled:opacity-50">{creando ? 'Creando…' : 'Crear'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Esqueleto() {
  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 animate-pulse">
      <div className="h-14 w-64 rounded-lg bg-feisen-gris" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-[14px] bg-feisen-gris" />)}</div>
      <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))]">{[0, 1, 2].map((i) => <div key={i} className="h-64 rounded-[14px] bg-feisen-gris" />)}</div>
    </div>
  )
}
