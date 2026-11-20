import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { siguienteNumero } from '../../utils/siguienteNumero'
import { formatCOP } from '../../utils/formatters'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { EncabezadoPagina, useAtajoBuscar } from '../shared/ui'
import { Plus, Search, X, Lightbulb, ChevronRight, List, CalendarRange } from '../shared/iconos'
import CronogramaProyectos from './CronogramaProyectos'
import PortafolioProyectos, { RequiereAtencion } from './PortafolioProyectos'
import { useAuth } from '../../contexts/AuthContext'
import {
  TIPOS, RESPONSABLE, APROBADORA, BUCKET, RUBROS_INICIALES, FASES_INICIALES,
  totalInversion, resumenCumplimiento,
} from './comun'

// ¿Qué proyectos de innovación esperan aprobación y cómo van sus tiempos?
// Dos vistas: lista y cronograma (Gantt de las fases con su cumplimiento).
const FILTROS = [
  { clave: 'por_decidir', texto: 'Por decidir', estados: ['presentado'] },
  { clave: 'en_marcha',   texto: 'En marcha',   estados: ['aprobado', 'aprobado_ajustes', 'en_curso'] },
  { clave: 'borradores',  texto: 'Borradores',  estados: ['borrador'] },
  { clave: 'cerrados',    texto: 'Cerrados y rechazados', estados: ['cerrado', 'rechazado', 'aplazado'] },
  { clave: 'todos',       texto: 'Todos',       estados: null },
]

const sinTildes = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function ProyectosInnovacion() {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const esAprobadora = perfil?.id === APROBADORA.id
  const [proyectos, setProyectos] = useState([])
  const [ultimoAvance, setUltimoAvance] = useState({})
  const [miniaturas, setMiniaturas] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [creando, setCreando] = useState(false)
  const [vista, setVista] = useState(() => { try { return localStorage.getItem('innovacion_vista') || 'lista' } catch { return 'lista' } })
  const cambiarVista = v => { setVista(v); try { localStorage.setItem('innovacion_vista', v) } catch { /* sin almacenamiento */ } }
  const buscarRef = useRef(null)
  useAtajoBuscar(buscarRef)

  async function cargar() {
    setCargando(true)
    const [{ data, error: e1 }, { data: av }] = await Promise.all([
      supabase.from('innovacion_proyectos')
        .select('id, numero, nombre, tipo, area, responsable, estado, costos, fases, monto_aprobado, fecha_presentacion, updated_at')
        .order('created_at', { ascending: false }),
      supabase.from('innovacion_avances').select('proyecto_id, fecha, nota, archivos, created_at')
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    ])
    if (e1) setError('No se pudieron cargar los proyectos: ' + e1.message)
    setProyectos(data || [])
    // Último avance de cada proyecto y la imagen más reciente para la miniatura de la tarjeta
    const ult = {}, foto = {}
    for (const a of av || []) {
      if (!ult[a.proyecto_id]) ult[a.proyecto_id] = a
      const img = (a.archivos || []).find(x => (x.tipo || '').startsWith('image/'))
      if (img && !foto[a.proyecto_id]) foto[a.proyecto_id] = img.path
    }
    setUltimoAvance(ult)
    const rutas = Object.values(foto)
    if (rutas.length) {
      const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(rutas, 3600)
      const porRuta = Object.fromEntries((urls || []).filter(u => u.signedUrl).map(u => [u.path, u.signedUrl]))
      setMiniaturas(Object.fromEntries(Object.entries(foto).map(([id, r]) => [id, porRuta[r]]).filter(([, u]) => u)))
    }
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const conteo = useMemo(() => Object.fromEntries(FILTROS.map(f =>
    [f.clave, f.estados ? proyectos.filter(p => f.estados.includes(p.estado)).length : proyectos.length])), [proyectos])

  // Cumplimiento de tiempos: fases de los proyectos que no están cerrados ni rechazados
  const activos = proyectos.filter(p => !['cerrado', 'rechazado', 'aplazado'].includes(p.estado))
  const cumpl = resumenCumplimiento(activos.flatMap(p => p.fases || []))
  const invAprobada = proyectos
    .filter(p => ['aprobado', 'aprobado_ajustes', 'en_curso', 'cerrado'].includes(p.estado))
    .reduce((s, p) => s + (Number(p.monto_aprobado) || 0), 0)
  const invPorDecidir = proyectos.filter(p => p.estado === 'presentado').reduce((s, p) => s + totalInversion(p.costos), 0)

  const lista = useMemo(() => {
    const f = FILTROS.find(x => x.clave === filtro)
    const palabras = sinTildes(busqueda).split(/\s+/).filter(Boolean)
    return proyectos
      .filter(p => !f.estados || f.estados.includes(p.estado))
      .filter(p => {
        const txt = sinTildes(`${p.numero} ${p.nombre} ${p.area} ${TIPOS[p.tipo]}`)
        return palabras.every(w => txt.includes(w))
      })
  }, [proyectos, filtro, busqueda])

  if (cargando) return <Spinner texto="Cargando proyectos..." />

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <EncabezadoPagina modulo="Innovación" titulo="Proyectos de innovación"
        subtitulo={`Productos nuevos, mejoras de máquina y rediseños que presenta el ${RESPONSABLE.toLowerCase()}`}>
        <button onClick={() => setCreando(true)}
          className="flex items-center gap-2 bg-feisen-azul text-white rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:opacity-90">
          <Plus size={16} /> Nuevo proyecto
        </button>
      </EncabezadoPagina>

      <Alerta tipo="error" mensaje={error} />

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta etiqueta="Por decidir" cifra={conteo.por_decidir} contexto={invPorDecidir ? `${formatCOP(invPorDecidir)} solicitados` : 'nada pendiente'}
          alerta={conteo.por_decidir > 0} onClick={() => setFiltro('por_decidir')} />
        <Tarjeta etiqueta="En marcha" cifra={conteo.en_marcha} contexto="aprobados o en curso" onClick={() => setFiltro('en_marcha')} />
        <Tarjeta etiqueta="Fases atrasadas" cifra={cumpl.atrasadas} rojo={cumpl.atrasadas > 0}
          contexto={cumpl.terminadas ? `${cumpl.aTiempo} de ${cumpl.terminadas} terminadas a tiempo` : 'ninguna fase terminada aún'}
          onClick={() => { setFiltro('todos'); cambiarVista('cronograma') }} />
        <Tarjeta etiqueta="Inversión aprobada" cifra={formatCOP(invAprobada)} contexto="suma de montos aprobados" />
      </div>

      <RequiereAtencion proyectos={proyectos} esAprobadora={esAprobadora} />

      {/* Búsqueda y filtros */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input ref={buscarRef} value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, número, área o tipo  ( / )"
            className="w-full bg-white border border-feisen-borde rounded-lg pl-9 pr-9 min-h-[44px] text-sm focus:outline-none focus:border-feisen-azul" />
          {busqueda && (
            <button onClick={() => setBusqueda('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-feisen-borde bg-white p-0.5 mr-1" role="group" aria-label="Vista">
            {[['lista', 'Proyectos', List], ['cronograma', 'Cronograma', CalendarRange]].map(([v, t, Icono]) => (
              <button key={v} onClick={() => cambiarVista(v)} aria-pressed={vista === v}
                className={`inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-md text-sm ${vista === v ? 'bg-feisen-azul-suave text-feisen-azul font-semibold' : 'text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
                <Icono size={16} /> {t}
              </button>
            ))}
          </div>
          {FILTROS.map(f => (
            <button key={f.clave} onClick={() => setFiltro(f.clave)}
              className={`px-3 min-h-[36px] rounded-lg text-sm border transition-colors
                ${filtro === f.clave ? 'bg-feisen-azul-suave text-feisen-azul border-transparent font-semibold' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
              {f.texto} · {conteo[f.clave]}
            </button>
          ))}
        </div>
      </div>

      {/* Lista o cronograma */}
      {vista === 'cronograma' && lista.length > 0 ? (
        <CronogramaProyectos proyectos={lista} />
      ) : lista.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl p-8 text-center">
          <Lightbulb size={28} className="mx-auto text-gray-400" />
          {proyectos.length === 0 ? (
            <>
              <p className="font-semibold text-feisen-texto mt-2">Todavía no hay proyectos</p>
              <p className="text-sm text-feisen-texto-2 mt-1">Crea el primero con «Nuevo proyecto». La ficha sigue el formato aprobado: problema, solución, costos, cronograma y seguimiento con planos. Solo Angie aprueba.</p>
            </>
          ) : (
            <p className="text-sm text-feisen-texto-2 mt-2">Ningún proyecto coincide con la búsqueda o el filtro. Prueba con «Todos».</p>
          )}
        </div>
      ) : (
        <PortafolioProyectos proyectos={lista} ultimoAvance={ultimoAvance} miniaturas={miniaturas} esAprobadora={esAprobadora} />
      )}

      {creando && <NuevoProyecto onCerrar={() => setCreando(false)} onCreado={id => navigate(`/innovacion/${id}`)} />}
    </div>
  )
}

function Tarjeta({ etiqueta, cifra, contexto, alerta, rojo, onClick }) {
  const color = rojo ? 'text-feisen-rojo' : alerta ? 'text-amber-700' : 'text-feisen-texto'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`text-left bg-white border border-feisen-borde rounded-xl p-4 ${onClick ? 'hover:bg-feisen-fondo' : ''}`}>
      <p className="text-xs uppercase tracking-wide text-gray-400">{etiqueta}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-1 ${color}`}>{cifra}</p>
      <p className="text-xs text-feisen-texto-2 mt-0.5">{contexto}</p>
    </Tag>
  )
}

function NuevoProyecto({ onCerrar, onCreado }) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('producto_nuevo')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function crear(e) {
    e.preventDefault()
    if (!nombre.trim()) { setError('Ponle un nombre al proyecto.'); return }
    setGuardando(true); setError('')
    try {
      const numero = await siguienteNumero('innovacion_proyectos', 'PI')
      const { data, error: e2 } = await supabase.from('innovacion_proyectos').insert({
        numero, nombre: nombre.trim(), tipo, responsable: RESPONSABLE,
        costos: RUBROS_INICIALES, fases: FASES_INICIALES,
        fecha_presentacion: new Date().toISOString().slice(0, 10),
      }).select('id').single()
      if (e2) throw e2
      onCreado(data.id)
    } catch (err) {
      setError('No se pudo crear: ' + (err.message || err))
      setGuardando(false)
    }
  }

  return (
    <Modal titulo="Nuevo proyecto de innovación" onCerrar={onCerrar}>
      <form onSubmit={crear} className="space-y-4">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-400">Nombre del proyecto</span>
          <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej.: Molino de martillos 20 HP"
            className="mt-1 w-full border border-feisen-borde rounded-lg px-3 min-h-[44px] text-sm focus:outline-none focus:border-feisen-azul" />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-400">Tipo</span>
          <select value={tipo} onChange={e => setTipo(e.target.value)}
            className="mt-1 w-full border border-feisen-borde rounded-lg px-3 min-h-[44px] text-sm bg-white">
            {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <Alerta tipo="error" mensaje={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="px-4 min-h-[44px] rounded-lg border border-feisen-borde text-sm">Cancelar</button>
          <button disabled={guardando} className="px-4 min-h-[44px] rounded-lg bg-feisen-azul text-white text-sm font-semibold disabled:opacity-60">
            {guardando ? 'Creando…' : 'Crear y llenar la ficha'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
