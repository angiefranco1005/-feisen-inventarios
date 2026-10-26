import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { exportarNovedades } from '../../utils/exportExcel'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import { Plus, Download, Paperclip, ChevronRight, CalendarClock, List, Users } from 'lucide-react'
import * as E from './estilos'
import ModalNovedad from './ModalNovedad'
import {
  TIPOS_NOVEDAD, VINCULACIONES, vinculacionDe, nombreCompleto, iniciales, formatoFecha, hoyISO, urlsFirmadas,
} from './catalogosRRHH'

const anio = new Date().getFullYear()
const fmtNum = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })

// Registro de novedades: incapacidades, permisos, vacaciones y licencias,
// con filtros por persona, tipo, vinculación y periodo, y control de ausencias.
export default function Novedades() {
  const { perfil } = useAuth()
  const [empleados,   setEmpleados]   = useState([])
  const [novedades,   setNovedades]   = useState([])
  const [nSoportes,   setNSoportes]   = useState({})     // novedad_id → cantidad de soportes
  const [fotos,       setFotos]       = useState({})
  const [cargando,    setCargando]    = useState(true)
  const [msg,         setMsg]         = useState(null)
  const [modal,       setModal]       = useState(null)   // null | 'nueva' | novedad

  const [fPersona,    setFPersona]    = useState('')
  const [fTipo,       setFTipo]       = useState('')
  const [fVinc,       setFVinc]       = useState('')
  const [fDesde,      setFDesde]      = useState(`${anio}-01-01`)
  const [fHasta,      setFHasta]      = useState(`${anio}-12-31`)
  const [soloPend,    setSoloPend]    = useState(false)
  const [vista,       setVista]       = useState('detalle')   // detalle | persona

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: emps }, { data: novs, error }, { data: sops }] = await Promise.all([
      supabase.from('empleados')
        .select('id, nombres, apellidos, tipo_documento, numero_documento, cargo, area, estado, tipo_contrato, tipo_vinculacion, eps, arl, foto_path')
        .order('nombres'),
      fetchAllPages((d, h) => supabase.from('novedades').select('*').order('fecha_inicio', { ascending: false }).range(d, h)),
      fetchAllPages((d, h) => supabase.from('novedad_soportes').select('novedad_id').range(d, h)),
    ])
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setEmpleados(emps || [])
    setNovedades(novs || [])
    const cuenta = {}
    for (const s of sops || []) cuenta[s.novedad_id] = (cuenta[s.novedad_id] || 0) + 1
    setNSoportes(cuenta)
    setFotos(await urlsFirmadas((emps || []).map(e => e.foto_path)))
    setCargando(false)
  }

  const empPorId = useMemo(() => new Map(empleados.map(e => [e.id, e])), [empleados])
  const hoy = hoyISO()
  const pendienteSoporte = (n) => TIPOS_NOVEDAD[n.tipo]?.soporte && !nSoportes[n.id]

  // Filtros comunes (todo menos el tipo, para poder contar por tipo en los chips)
  const base = useMemo(() => novedades.filter(n => {
    const e = empPorId.get(n.empleado_id)
    return (!fPersona || n.empleado_id === fPersona)
      && (!fVinc || vinculacionDe(e) === fVinc)
      && (!fDesde || n.fecha_fin >= fDesde)
      && (!fHasta || n.fecha_inicio <= fHasta)
      && (!soloPend || pendienteSoporte(n))
  }), [novedades, empPorId, fPersona, fVinc, fDesde, fHasta, soloPend, nSoportes])
  const filtradas = fTipo ? base.filter(n => n.tipo === fTipo) : base

  const totales = useMemo(() => {
    const t = {}
    for (const k of Object.keys(TIPOS_NOVEDAD)) t[k] = { n: 0, dias: 0, horas: 0 }
    for (const n of filtradas) { t[n.tipo].n++; t[n.tipo].dias += Number(n.dias) || 0; t[n.tipo].horas += Number(n.horas) || 0 }
    return t
  }, [filtradas])

  const ausentesHoy = novedades.filter(n => n.fecha_inicio <= hoy && n.fecha_fin >= hoy)
  const pendientesTotal = novedades.filter(pendienteSoporte).length

  // Vista por persona: días por tipo de novedad
  const porPersona = useMemo(() => {
    const m = new Map()
    for (const n of filtradas) {
      if (!m.has(n.empleado_id)) m.set(n.empleado_id, { id: n.empleado_id, incapacidad: 0, permiso: 0, permisoHoras: 0, permisoN: 0, vacaciones: 0, licencia: 0, total: 0 })
      const r = m.get(n.empleado_id)
      const d = Number(n.dias) || 0
      if (n.tipo === 'permiso') { r.permisoN++; r.permiso += d; r.permisoHoras += Number(n.horas) || 0 }
      else r[n.tipo] += d
      r.total += d
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [filtradas])

  function exportar() {
    const filas = filtradas.map(n => {
      const e = empPorId.get(n.empleado_id)
      return {
        codigo: n.codigo, colaborador: e ? nombreCompleto(e) : '—', documento: e ? `${e.tipo_documento || ''} ${e.numero_documento || ''}`.trim() : '',
        area: e?.area, vinculacion: vinculacionDe(e), tipo: TIPOS_NOVEDAD[n.tipo]?.label, subtipo: n.subtipo,
        inicio: n.fecha_inicio, fin: n.fecha_fin, dias: n.dias === null ? '' : Number(n.dias), horas: n.horas === null ? '' : Number(n.horas),
        remunerado: n.remunerado === null || n.remunerado === undefined ? '' : n.remunerado ? 'Sí' : 'No',
        soportes: nSoportes[n.id] || 0, observaciones: n.observaciones,
      }
    })
    const partes = [`Del ${formatoFecha(fDesde)} al ${formatoFecha(fHasta)}`]
    if (fTipo) partes.push(TIPOS_NOVEDAD[fTipo].plural)
    if (fPersona) partes.push(nombreCompleto(empPorId.get(fPersona)))
    if (fVinc) partes.push(fVinc)
    exportarNovedades(filas, partes.join(' · '))
  }

  const Avatar = ({ e }) => e && fotos[e.foto_path]
    ? <img src={fotos[e.foto_path]} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
    : <span className="w-8 h-8 rounded-full bg-feisen-fondo border border-feisen-borde-suave flex items-center justify-center text-xs font-semibold text-feisen-texto-2 flex-shrink-0">{e ? iniciales(e) : '?'}</span>

  const columnas = 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_5.5rem_6.5rem_1rem]'

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>Novedades</h1>
          <p className={E.subtituloPagina}>Incapacidades, permisos, vacaciones y licencias</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportar} disabled={!filtradas.length} className={E.btnSecundario}>
            <Download {...E.ICONO} /> Excel
          </button>
          <button onClick={() => setModal('nueva')} className={E.btnPrimario}>
            <Plus {...E.ICONO} /> Registrar novedad
          </button>
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Indicadores del periodo filtrado */}
      <div className={`${E.tarjeta} grid grid-cols-2 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-feisen-borde-suave overflow-hidden`}>
        <div className="px-4 py-3.5">
          <p className={`${E.etiqueta} flex items-center gap-1.5`}><CalendarClock size={12} strokeWidth={1.8} /> Ausentes hoy</p>
          <p className="text-2xl font-semibold text-feisen-texto mt-0.5">{new Set(ausentesHoy.map(n => n.empleado_id)).size}</p>
        </div>
        {Object.entries(TIPOS_NOVEDAD).map(([k, t]) => (
          <button key={k} onClick={() => setFTipo(fTipo === k ? '' : k)}
            className={`px-4 py-3.5 text-left transition-colors ${fTipo === k ? 'bg-feisen-azul-suave' : 'hover:bg-feisen-fondo'}`}>
            <p className={`${E.etiqueta} flex items-center gap-1.5`}><span className={`w-1.5 h-1.5 rounded-full ${t.punto}`} /> {t.plural}</p>
            <p className="text-2xl font-semibold text-feisen-texto mt-0.5">
              {fmtNum(totales[k].dias)}<span className="text-xs font-normal text-feisen-gris-medio"> días</span>
            </p>
            <p className="text-[11px] text-feisen-gris-medio">
              {totales[k].n} registro{totales[k].n === 1 ? '' : 's'}{totales[k].horas > 0 && ` · ${fmtNum(totales[k].horas)} h`}
            </p>
          </button>
        ))}
        <button onClick={() => setSoloPend(v => !v)}
          className={`px-4 py-3.5 text-left transition-colors ${soloPend ? 'bg-feisen-azul-suave' : 'hover:bg-feisen-fondo'}`}>
          <p className={`${E.etiqueta} flex items-center gap-1.5`}><Paperclip size={12} strokeWidth={1.8} /> Sin soporte</p>
          <p className={`text-2xl font-semibold mt-0.5 ${pendientesTotal ? 'text-amber-600' : 'text-feisen-texto'}`}>{pendientesTotal}</p>
        </button>
      </div>

      {/* Ausentes hoy */}
      {ausentesHoy.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={E.etiqueta}>Hoy no están:</span>
          {ausentesHoy.map(n => {
            const e = empPorId.get(n.empleado_id)
            return (
              <button key={n.id} onClick={() => setModal(n)}
                className="inline-flex items-center gap-1.5 border border-feisen-borde bg-white rounded-full px-2.5 py-1 text-xs text-feisen-texto hover:bg-feisen-fondo">
                <span className={`w-1.5 h-1.5 rounded-full ${TIPOS_NOVEDAD[n.tipo]?.punto}`} />
                {e ? nombreCompleto(e) : '—'}
                <span className="text-feisen-gris-medio">· hasta {formatoFecha(n.fecha_fin)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_9.5rem_9.5rem] gap-2">
        <select value={fPersona} onChange={e => setFPersona(e.target.value)} className={`${E.input} col-span-2 lg:col-span-1`}>
          <option value="">Todas las personas</option>
          {empleados.map(e => <option key={e.id} value={e.id}>{nombreCompleto(e)}{e.estado === 'retirado' ? ' (retirado)' : ''}</option>)}
        </select>
        <select value={fTipo} onChange={e => setFTipo(e.target.value)} className={E.input}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_NOVEDAD).map(([k, t]) => <option key={k} value={k}>{t.plural}</option>)}
        </select>
        <select value={fVinc} onChange={e => setFVinc(e.target.value)} className={E.input}>
          <option value="">Toda vinculación</option>
          {VINCULACIONES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <input type="date" value={fDesde} onChange={e => setFDesde(e.target.value)} title="Desde" className={E.input} />
        <input type="date" value={fHasta} onChange={e => setFHasta(e.target.value)} title="Hasta" className={E.input} />
      </div>

      {/* Vista */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex border border-feisen-borde rounded-lg p-0.5 bg-white">
          {[{ id: 'detalle', icon: List, label: 'Detalle' }, { id: 'persona', icon: Users, label: 'Por persona' }].map(v => (
            <button key={v.id} onClick={() => setVista(v.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors
                ${vista === v.id ? 'bg-feisen-azul-suave text-feisen-azul font-medium' : 'text-feisen-texto-2 hover:text-feisen-texto'}`}>
              <v.icon size={15} strokeWidth={1.8} /> {v.label}
            </button>
          ))}
        </div>
        <span className={E.etiqueta}>{filtradas.length} novedad{filtradas.length === 1 ? '' : 'es'}</span>
      </div>

      {cargando ? <Spinner /> : filtradas.length === 0 ? (
        <div className={`${E.tarjeta} py-14 text-center`}>
          <CalendarClock size={28} strokeWidth={1.5} className="mx-auto text-feisen-gris-medio mb-2" />
          <p className="text-sm text-feisen-texto-2">
            {novedades.length === 0 ? 'Aún no hay novedades registradas.' : 'Ninguna novedad coincide con los filtros.'}
          </p>
        </div>
      ) : vista === 'detalle' ? (
        <div className={`${E.tarjeta} overflow-hidden`}>
          <div className={`hidden md:grid ${columnas} gap-4 px-5 py-2 border-b border-feisen-borde-suave text-xs font-medium text-feisen-gris-medio`}>
            <span>Colaborador</span><span>Novedad</span><span>Fechas</span><span>Duración</span><span>Soporte</span><span />
          </div>
          <div className="divide-y divide-feisen-borde-suave">
            {filtradas.map(n => {
              const e = empPorId.get(n.empleado_id)
              const t = TIPOS_NOVEDAD[n.tipo]
              const enCurso = n.fecha_inicio <= hoy && n.fecha_fin >= hoy
              const ns = nSoportes[n.id] || 0
              return (
                <button key={n.id} onClick={() => setModal(n)}
                  className={`w-full grid grid-cols-[minmax(0,1fr)_auto] ${columnas} gap-x-4 gap-y-1 items-center px-5 py-2.5 hover:bg-feisen-fondo text-left`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar e={e} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-feisen-texto truncate">{e ? nombreCompleto(e) : '—'}</p>
                      <p className="text-xs text-feisen-gris-medio truncate">{vinculacionDe(e)}</p>
                    </div>
                  </div>
                  <div className="min-w-0 hidden md:block">
                    <p className="text-sm text-feisen-texto truncate flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t?.punto}`} /> {t?.label}{n.subtipo && <span className="text-feisen-texto-2"> · {n.subtipo}</span>}
                    </p>
                    <p className="text-xs text-feisen-gris-medio">{n.codigo}{n.remunerado === false && ' · No remunerado'}{n.prorroga && ' · Prórroga'}</p>
                  </div>
                  <div className="hidden md:block text-sm text-feisen-texto-2 min-w-0">
                    {n.por_horas
                      ? <>{formatoFecha(n.fecha_inicio)}<span className="block text-xs text-feisen-gris-medio">{String(n.hora_inicio || '').slice(0, 5)} – {String(n.hora_fin || '').slice(0, 5)}</span></>
                      : <>{formatoFecha(n.fecha_inicio)}<span className="block text-xs text-feisen-gris-medio">al {formatoFecha(n.fecha_fin)}</span></>}
                  </div>
                  <div className="hidden md:block text-sm text-feisen-texto">
                    {n.por_horas ? `${fmtNum(n.horas)} h` : n.dias !== null ? `${fmtNum(n.dias)} d` : '—'}
                    {enCurso && <span className="block text-[11px] text-feisen-azul">En curso</span>}
                  </div>
                  <div className="hidden md:block text-xs">
                    {ns > 0
                      ? <span className="inline-flex items-center gap-1 text-feisen-texto-2"><Paperclip size={12} strokeWidth={1.8} /> {ns}</span>
                      : t?.soporte ? <span className="text-amber-600">Pendiente</span> : <span className="text-feisen-gris-medio">—</span>}
                  </div>
                  <ChevronRight size={16} strokeWidth={1.8} className="text-feisen-gris-medio justify-self-end" />
                  {/* Celular: resumen en una línea */}
                  <p className="md:hidden col-span-2 text-xs text-feisen-texto-2 flex items-center gap-1.5 flex-wrap pl-11">
                    <span className={`w-1.5 h-1.5 rounded-full ${t?.punto}`} /> {t?.label}{n.subtipo && ` · ${n.subtipo}`}
                    <span className="text-feisen-gris-medio">· {formatoFecha(n.fecha_inicio)}{!n.por_horas && n.fecha_fin !== n.fecha_inicio && ` – ${formatoFecha(n.fecha_fin)}`}</span>
                    <span>· {n.por_horas ? `${fmtNum(n.horas)} h` : `${fmtNum(n.dias)} d`}</span>
                    {pendienteSoporte(n) && <span className="text-amber-600">· Sin soporte</span>}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className={`${E.tarjeta} overflow-x-auto`}>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-feisen-gris-medio border-b border-feisen-borde-suave">
                <th className="font-medium px-5 py-2">Colaborador</th>
                {Object.entries(TIPOS_NOVEDAD).map(([k, t]) => (
                  <th key={k} className="font-medium px-3 py-2 text-right whitespace-nowrap">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${t.punto}`} />{t.plural}
                  </th>
                ))}
                <th className="font-medium px-5 py-2 text-right">Total días</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-feisen-borde-suave">
              {porPersona.map(r => {
                const e = empPorId.get(r.id)
                const celda = (v, extra) => <td className="px-3 py-2.5 text-right text-feisen-texto-2 whitespace-nowrap">{v ? fmtNum(v) : '—'}{extra}</td>
                return (
                  <tr key={r.id} onClick={() => { setFPersona(r.id); setVista('detalle') }} className="hover:bg-feisen-fondo cursor-pointer">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar e={e} />
                        <div className="min-w-0">
                          <p className="font-medium text-feisen-texto truncate">{e ? nombreCompleto(e) : '—'}</p>
                          <p className="text-xs text-feisen-gris-medio truncate">{vinculacionDe(e)}</p>
                        </div>
                      </div>
                    </td>
                    {celda(r.incapacidad)}
                    {celda(r.permiso, r.permisoHoras > 0 && <span className="text-xs text-feisen-gris-medio"> · {fmtNum(r.permisoHoras)} h</span>)}
                    {celda(r.vacaciones)}
                    {celda(r.licencia)}
                    <td className="px-5 py-2.5 text-right font-medium text-feisen-texto">{fmtNum(r.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-5 py-2 text-xs text-feisen-gris-medio border-t border-feisen-borde-suave">Días por tipo en el periodo filtrado. Toca una persona para ver su detalle.</p>
        </div>
      )}

      {modal && (
        <ModalNovedad
          novedad={modal === 'nueva' ? null : modal}
          empleados={empleados}
          existentes={novedades}
          perfilId={perfil?.id}
          onCerrar={() => setModal(null)}
          onGuardado={(r) => { setModal(null); setMsg(r?.aviso ? { tipo: 'alerta', texto: r.aviso } : null); cargar() }} />
      )}
    </div>
  )
}
