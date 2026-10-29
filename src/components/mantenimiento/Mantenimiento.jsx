import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { coincideBusqueda } from '../../utils/busqueda'
import { formatCOP } from '../../utils/formatters'
import { EncabezadoPagina, useAviso, useAtajoBuscar } from '../shared/ui'
import Spinner from '../shared/Spinner'
import { CalendarCheck, Clock, Coins, Plus, Search, WarningOctagon, Wrench, ChevronRight } from '../shared/iconos'
import { IMPORTANCIA, ESTADO_EQUIPO, Etiqueta, textoProxima, diasHasta, duracion, hoyCol } from './comun'
import ReportarFalla from './ReportarFalla'
import OrdenTrabajo from './OrdenTrabajo'
import FichaEquipo from './FichaEquipo'
import FormEquipo from './FormEquipo'

const ORDEN_IMPORTANCIA = { critico: 0, importante: 1, secundario: 2 }

// Mantenimiento de equipos de planta. ADMIN ve todo y los costos; los demás roles ven los
// equipos de sus bodegas (más los de área General) y reportan fallas. La RLS hace el filtro.
export default function Mantenimiento() {
  const { esAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const [aviso, avisar] = useAviso()
  const buscarRef = useRef(null)
  useAtajoBuscar(buscarRef)

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [equipos, setEquipos] = useState([])
  const [tareas, setTareas] = useState([])
  const [ordenes, setOrdenes] = useState([])
  const [costoOrden, setCostoOrden] = useState({})
  const [bodegas, setBodegas] = useState([])
  const [equiposCosteo, setEquiposCosteo] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos') // todos | parados | vencidos | proximos | bodega:<id>

  // Paneles: ?equipo=<id> · ?orden=<id> · ?reportar=1[&eq=<id>] · ?editar=<id>|nuevo
  const abrir = (clave, valor, extra = {}) => setParams(p => { const n = new URLSearchParams(); if (valor) n.set(clave, valor); Object.entries(extra).forEach(([k, v]) => n.set(k, v)); return n }, { replace: false })
  const cerrarPanel = () => setParams({}, { replace: false })

  const cargar = useCallback(async () => {
    setError('')
    await supabase.rpc('mant_generar_preventivas') // crea las preventivas que vencen en 7 días
    const [eq, ta, ot, bo] = await Promise.all([
      supabase.from('mant_equipos').select('*, bodegas(nombre)').eq('activo', true).order('codigo'),
      supabase.from('mant_tareas').select('*').eq('activo', true),
      fetchAllPages((d, h) => supabase.from('mant_ordenes')
        .select('*, reportado:profiles!mant_ordenes_reportado_por_fkey(nombre)').order('reportado_at', { ascending: false }).range(d, h)),
      supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    const err = eq.error || ta.error || ot.error
    if (err) { setError(err.message); setCargando(false); return }
    setEquipos(eq.data || []); setTareas(ta.data || []); setOrdenes(ot.data || []); setBodegas(bo.data || [])
    if (esAdmin) {
      const [co, ce] = await Promise.all([
        fetchAllPages((d, h) => supabase.from('mant_orden_costos').select('orden_id, costo_total').range(d, h)),
        supabase.from('costeo_equipos_planta').select('id, nombre, mantenimiento_anual').order('nombre'),
      ])
      const m = {}
      for (const c of co.data || []) m[c.orden_id] = (m[c.orden_id] || 0) + Number(c.costo_total)
      setCostoOrden(m); setEquiposCosteo(ce.data || [])
    }
    setCargando(false)
  }, [esAdmin])
  useEffect(() => { cargar() }, [cargar])

  const hoy = hoyCol()
  const mes = hoy.slice(0, 7)
  const anio = hoy.slice(0, 4)
  const porId = useMemo(() => Object.fromEntries(equipos.map(e => [e.id, e])), [equipos])
  const abiertas = ordenes.filter(o => o.estado !== 'cerrada' && porId[o.equipo_id])
  const tareasDe = id => tareas.filter(t => t.equipo_id === id).sort((a, b) => a.proxima_fecha.localeCompare(b.proxima_fecha))
  const proximaDe = id => tareasDe(id)[0]
  const vencidas = tareas.filter(t => porId[t.equipo_id] && t.proxima_fecha < hoy)
  const proximas = tareas.filter(t => porId[t.equipo_id] && t.proxima_fecha >= hoy && diasHasta(t.proxima_fecha) <= 7)
  const parados = equipos.filter(e => e.estado === 'parado')
  const costoMes = ordenes.filter(o => o.estado === 'cerrada' && (o.cerrada_at || '').slice(0, 7) === mes).reduce((s, o) => s + (costoOrden[o.id] || 0), 0)
  const presupuestoDe = e => Number(equiposCosteo.find(c => c.id === e.costeo_equipo_id)?.mantenimiento_anual) || 0
  const presupuestoMes = equipos.reduce((s, e) => s + presupuestoDe(e), 0) / 12
  const costoAnioDe = id => ordenes.filter(o => o.equipo_id === id && o.estado === 'cerrada' && (o.cerrada_at || '').slice(0, 4) === anio).reduce((s, o) => s + (costoOrden[o.id] || 0), 0)

  // Requiere atención: parados primero, luego preventivos vencidos, fallas reportadas y lo programado
  const atencion = useMemo(() => {
    const peso = o => {
      if (o.equipo_parado) return 0
      if (o.tipo === 'preventiva' && o.fecha_programada < hoy) return 1
      if (o.tipo === 'correctiva') return 2
      return 3
    }
    return [...abiertas].sort((a, b) => peso(a) - peso(b) || (ORDEN_IMPORTANCIA[porId[a.equipo_id].importancia] - ORDEN_IMPORTANCIA[porId[b.equipo_id].importancia]))
  }, [abiertas, porId, hoy])

  const bodegasConEquipos = bodegas.filter(b => equipos.some(e => e.bodega_id === b.id))
  const lista = equipos.filter(e => {
    if (!coincideBusqueda(`${e.codigo} ${e.nombre} ${e.marca || ''} ${e.modelo || ''}`, busqueda)) return false
    if (filtro === 'parados') return e.estado === 'parado'
    if (filtro === 'vencidos') return vencidas.some(t => t.equipo_id === e.id)
    if (filtro === 'proximos') return proximas.some(t => t.equipo_id === e.id)
    if (filtro.startsWith('bodega:')) return e.bodega_id === filtro.slice(7)
    return true
  }).sort((a, b) => (a.estado === 'parado' ? 0 : 1) - (b.estado === 'parado' ? 0 : 1) || ORDEN_IMPORTANCIA[a.importancia] - ORDEN_IMPORTANCIA[b.importancia] || a.codigo.localeCompare(b.codigo))

  const alGuardar = mensaje => { cerrarPanel(); avisar(mensaje); cargar() }

  if (cargando) return <div className="py-20 grid place-items-center"><Spinner /></div>

  const equipoPanel = porId[params.get('equipo')]
  const ordenPanel = ordenes.find(o => o.id === params.get('orden'))
  const editar = params.get('editar')

  const Kpi = ({ id, clase, Icono, titulo, valor, detalle }) => {
    const activo = filtro === id
    return (
      <button type="button" onClick={() => id && setFiltro(activo ? 'todos' : id)} disabled={!id}
        className={`text-left bg-white border rounded-xl p-4 flex flex-col gap-1 transition-shadow ${activo ? 'border-feisen-azul ring-2 ring-feisen-azul-suave' : 'border-feisen-borde'} ${id ? 'hover:border-gray-300' : 'cursor-default'}`}>
        <span className="flex items-center gap-2">
          <span className={`w-8 h-8 rounded-lg grid place-items-center ${clase}`}><Icono size={18} weight="duotone" /></span>
          <span className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">{titulo}</span>
        </span>
        <span className="text-2xl font-semibold tabular-nums text-feisen-texto">{valor}</span>
        <span className="text-xs text-feisen-texto-2 truncate">{detalle}</span>
      </button>
    )
  }

  const paradoMasViejo = parados.map(e => abiertas.find(o => o.equipo_id === e.id && o.inicio_paro)).filter(Boolean).sort((a, b) => a.inicio_paro.localeCompare(b.inicio_paro))[0]
  const vencidaMasVieja = [...vencidas].sort((a, b) => a.proxima_fecha.localeCompare(b.proxima_fecha))[0]

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-24 lg:pb-8">
      <EncabezadoPagina modulo="Mantenimiento" titulo="Equipos de planta" subtitulo="Estado de los equipos, preventivos y órdenes de trabajo.">
        {esAdmin && (
          <button type="button" onClick={() => abrir('editar', 'nuevo')}
            className="hidden sm:flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
            <Plus size={16} /> Nuevo equipo
          </button>
        )}
        <button type="button" onClick={() => abrir('reportar', '1')}
          className="flex items-center gap-1.5 min-h-[40px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold">
          <Wrench size={16} /> Reportar falla
        </button>
      </EncabezadoPagina>

      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">No se pudo cargar: {error}</p>}

      {equipos.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl px-6 py-12 text-center space-y-2">
          <p className="font-semibold text-feisen-texto">Todavía no hay equipos registrados</p>
          <p className="text-sm text-feisen-texto-2 max-w-md mx-auto">
            {esAdmin ? 'Crea la ficha de cada equipo (código, área e importancia). Después le agregas su plan preventivo y desde ese momento las órdenes se crean solas.'
              : 'Cuando administración registre los equipos de tu área, aquí podrás ver su estado y reportar fallas.'}
          </p>
          {esAdmin && <button type="button" onClick={() => abrir('editar', 'nuevo')} className="mt-3 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold"><Plus size={16} /> Crear el primer equipo</button>}
        </div>
      ) : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi id="parados" clase="bg-feisen-rojo-suave text-feisen-rojo" Icono={WarningOctagon} titulo="Parados ahora" valor={parados.length}
            detalle={paradoMasViejo ? `${porId[paradoMasViejo.equipo_id].nombre} · hace ${duracion(paradoMasViejo.inicio_paro)}` : 'Ningún equipo parado'} />
          <Kpi id="vencidos" clase="bg-amber-50 text-amber-700" Icono={CalendarCheck} titulo="Preventivos vencidos" valor={vencidas.length}
            detalle={vencidaMasVieja ? `el más viejo ${textoProxima(vencidaMasVieja.proxima_fecha).replace('vencido ', '')}` : 'Todo al día'} />
          <Kpi id="proximos" clase="bg-feisen-azul-suave text-feisen-azul" Icono={Clock} titulo="Próximos 7 días" valor={proximas.length}
            detalle={proximas.length ? `${new Set(proximas.map(t => t.equipo_id)).size} equipos` : 'Nada programado'} />
          {esAdmin
            ? <Kpi clase="bg-gray-100 text-feisen-texto-2" Icono={Coins} titulo="Costo del mes" valor={formatCOP(costoMes)}
                detalle={presupuestoMes ? `de ${formatCOP(presupuestoMes)} presupuestado` : 'sin presupuesto vinculado'} />
            : <Kpi clase="bg-gray-100 text-feisen-texto-2" Icono={Wrench} titulo="Órdenes abiertas" valor={abiertas.length}
                detalle={`${abiertas.filter(o => o.tipo === 'correctiva').length} por fallas`} />}
        </div>

        {atencion.length > 0 && (
          <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
            <div className="flex justify-between px-4 py-3 border-b border-feisen-borde-suave">
              <span className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Órdenes abiertas</span>
              <span className="text-xs text-feisen-texto-2">{atencion.length} {atencion.length === 1 ? 'pendiente' : 'pendientes'}</span>
            </div>
            <div className="divide-y divide-feisen-borde-suave">
              {atencion.slice(0, 8).map(o => {
                const e = porId[o.equipo_id]
                const vencida = o.tipo === 'preventiva' && o.fecha_programada < hoy
                const [etiqueta, color] = o.equipo_parado ? ['Parado', 'bg-feisen-rojo'] : vencida ? ['Vencido', 'bg-amber-500']
                  : o.tipo === 'correctiva' ? ['Falla', 'bg-feisen-rojo'] : ['Programado', 'bg-feisen-azul']
                const detalle = o.tipo === 'preventiva'
                  ? `Preventivo · ${vencida ? textoProxima(o.fecha_programada) : `para el ${textoProxima(o.fecha_programada)}`}`
                  : `${o.numero} · ${o.estado === 'en_reparacion' ? 'en reparación' : 'reportada'}${o.reportado?.nombre ? ` por ${o.reportado.nombre}` : ''}${o.inicio_paro ? ` · parado hace ${duracion(o.inicio_paro)}` : ''}`
                return (
                  <button key={o.id} type="button" onClick={() => abrir('orden', o.id)} className="relative w-full flex items-center gap-3 text-left px-4 py-3 hover:bg-feisen-fondo">
                    <span className={`absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r ${color}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-feisen-texto truncate">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mr-1.5">{etiqueta}</span>
                        <b className="font-semibold">{e.nombre}</b> · {o.descripcion || '—'}
                      </span>
                      <span className="block text-xs text-feisen-texto-2 truncate">{detalle}</span>
                    </span>
                    <ChevronRight size={16} className="text-gray-400 shrink-0" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative sm:w-72">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input ref={buscarRef} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar equipo, código o marca"
              className="w-full border border-feisen-borde rounded-lg pl-10 pr-3 py-2.5 bg-white text-sm focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[['todos', `Todos · ${equipos.length}`], ['parados', `Parados · ${parados.length}`], ['vencidos', `Preventivo vencido · ${new Set(vencidas.map(t => t.equipo_id)).size}`],
              ...(bodegasConEquipos.length > 1 ? bodegasConEquipos.map(b => [`bodega:${b.id}`, `${b.nombre} · ${equipos.filter(e => e.bodega_id === b.id).length}`]) : [])]
              .map(([id, texto]) => (
                <button key={id} type="button" onClick={() => setFiltro(id)} aria-pressed={filtro === id}
                  className={`min-h-[34px] px-3 rounded-full border text-[13px] whitespace-nowrap ${filtro === id ? 'bg-feisen-azul border-feisen-azul text-white' : 'bg-white border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
                  {texto}
                </button>
              ))}
          </div>
        </div>

        <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
          {lista.length === 0 && <p className="px-4 py-8 text-center text-sm text-feisen-texto-2">Ningún equipo cumple el filtro. <button type="button" onClick={() => { setFiltro('todos'); setBusqueda('') }} className="text-feisen-azul font-medium">Ver todos</button></p>}
          {lista.length > 0 && (
            <table className="w-full text-sm hidden md:table">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-feisen-texto-2 border-b border-feisen-borde">
                <th className="px-4 py-2.5 font-semibold">Código</th><th className="px-4 py-2.5 font-semibold">Equipo</th><th className="px-4 py-2.5 font-semibold">Área</th>
                <th className="px-4 py-2.5 font-semibold">Importancia</th><th className="px-4 py-2.5 font-semibold">Estado</th><th className="px-4 py-2.5 font-semibold">Próximo mantenimiento</th>
                {esAdmin && <th className="px-4 py-2.5 font-semibold text-right">Costo en {anio}</th>}
              </tr></thead>
              <tbody className="divide-y divide-feisen-borde-suave">
                {lista.map(e => {
                  const p = proximaDe(e.id)
                  return (
                    <tr key={e.id} onClick={() => abrir('equipo', e.id)} className="cursor-pointer hover:bg-feisen-fondo">
                      <td className="px-4 py-3 text-xs font-medium text-feisen-texto-2 tabular-nums whitespace-nowrap">{e.codigo}</td>
                      <td className="px-4 py-3"><p className="font-semibold text-feisen-texto">{e.nombre}</p><p className="text-xs text-feisen-texto-2">{[e.marca, e.modelo].filter(Boolean).join(' · ') || '—'}</p></td>
                      <td className="px-4 py-3 text-feisen-texto-2">{e.bodegas?.nombre || 'General'}</td>
                      <td className="px-4 py-3"><Etiqueta clase={IMPORTANCIA[e.importancia].clase}>{IMPORTANCIA[e.importancia].texto}</Etiqueta></td>
                      <td className="px-4 py-3"><Etiqueta clase={ESTADO_EQUIPO[e.estado].clase} punto>{ESTADO_EQUIPO[e.estado].texto}</Etiqueta></td>
                      <td className="px-4 py-3">{p ? <><p className="text-feisen-texto">{p.nombre}</p><p className={`text-xs ${p.proxima_fecha < hoy ? 'text-amber-700 font-medium' : 'text-feisen-texto-2'}`}>{textoProxima(p.proxima_fecha)}</p></> : <span className="text-xs text-feisen-texto-2">Sin plan preventivo</span>}</td>
                      {esAdmin && <td className="px-4 py-3 text-right tabular-nums">{formatCOP(costoAnioDe(e.id))}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <div className="md:hidden divide-y divide-feisen-borde-suave">
            {lista.map(e => {
              const p = proximaDe(e.id)
              return (
                <button key={e.id} type="button" onClick={() => abrir('equipo', e.id)} className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-feisen-fondo">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-feisen-texto">{e.nombre}</span>
                    <span className="block text-xs text-feisen-texto-2">{e.codigo} · {e.bodegas?.nombre || 'General'}</span>
                    {p && <span className={`block text-xs mt-0.5 ${p.proxima_fecha < hoy ? 'text-amber-700 font-medium' : 'text-feisen-texto-2'}`}>{p.nombre} · {textoProxima(p.proxima_fecha)}</span>}
                  </span>
                  <Etiqueta clase={ESTADO_EQUIPO[e.estado].clase} punto>{ESTADO_EQUIPO[e.estado].texto}</Etiqueta>
                </button>
              )
            })}
          </div>
        </div>
      </>}

      {params.get('reportar') && (
        <ReportarFalla equipos={equipos} equipoInicial={params.get('eq')} onCerrar={cerrarPanel}
          onGuardado={numero => alGuardar(`Falla reportada · ${numero}`)} />
      )}
      {equipoPanel && (
        <FichaEquipo equipo={equipoPanel} tareas={tareasDe(equipoPanel.id)} ordenes={ordenes.filter(o => o.equipo_id === equipoPanel.id)}
          costoOrden={costoOrden} presupuesto={presupuestoDe(equipoPanel)} onCerrar={cerrarPanel}
          onEditar={() => abrir('editar', equipoPanel.id)} onReportar={() => abrir('reportar', '1', { eq: equipoPanel.id })}
          onAbrirOrden={o => abrir('orden', o.id)} onCambio={m => { avisar(m); cargar() }} />
      )}
      {ordenPanel && (
        <OrdenTrabajo orden={ordenPanel} equipo={porId[ordenPanel.equipo_id]} bodegas={bodegas} onCerrar={cerrarPanel}
          onCambio={m => alGuardar(m)} onVerEquipo={() => abrir('equipo', ordenPanel.equipo_id)} />
      )}
      {esAdmin && editar && (
        <FormEquipo equipo={editar === 'nuevo' ? null : porId[editar]} bodegas={bodegas} equiposCosteo={equiposCosteo}
          codigosUsados={new Set(equipos.map(e => e.codigo))} onCerrar={cerrarPanel} onGuardado={alGuardar} />
      )}
      {aviso}
    </div>
  )
}
