import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAllPages } from '../../utils/fetchAllPages'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import { ChevronLeft, ChevronRight, Cake, Plus, FileText } from 'lucide-react'
import * as E from './estilos'
import ModalNovedad from './ModalNovedad'
import {
  TIPOS_NOVEDAD, nombreCompleto, formatoFecha, hoyISO, festivosColombia, cumpleEnAnio, proximosCumpleanos,
} from './catalogosRRHH'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const iso = (a, m, d) => `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const corto = (e) => e ? `${e.nombres.split(' ')[0]} ${e.apellidos.charAt(0)}.` : '—'

// Capas que se pueden prender/apagar en el calendario
const CAPAS = [
  { id: 'novedades',  label: 'Novedades',       punto: 'bg-feisen-azul' },
  { id: 'cumpleanos', label: 'Cumpleaños',      punto: 'bg-pink-500' },
  { id: 'contratos',  label: 'Fin de contrato', punto: 'bg-amber-500' },
]

// Calendario de RRHH: novedades (ausencias), cumpleaños y vencimientos de contrato.
export default function Calendario() {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const hoy = hoyISO()
  const [mes,       setMes]       = useState(() => ({ a: Number(hoy.slice(0, 4)), m: Number(hoy.slice(5, 7)) - 1 }))
  const [empleados, setEmpleados] = useState([])
  const [novedades, setNovedades] = useState([])
  const [cargando,  setCargando]  = useState(true)
  const [msg,       setMsg]       = useState(null)
  const [capas,     setCapas]     = useState(() => new Set(CAPAS.map(c => c.id)))
  const [diaSel,    setDiaSel]    = useState(hoy)
  const [modal,     setModal]     = useState(null)   // novedad a editar | { nueva: fecha }

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: emps, error }, { data: novs }] = await Promise.all([
      supabase.from('empleados')
        .select('id, nombres, apellidos, cargo, estado, fecha_nacimiento, fecha_fin_contrato, tipo_contrato, eps, arl, foto_path')
        .order('nombres'),
      fetchAllPages((d, h) => supabase.from('novedades').select('*').order('fecha_inicio').range(d, h)),
    ])
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setEmpleados(emps || [])
    setNovedades(novs || [])
    setCargando(false)
  }

  const empPorId = useMemo(() => new Map(empleados.map(e => [e.id, e])), [empleados])

  // Celdas del mes (semanas de lunes a domingo, con días del mes anterior/siguiente)
  const celdas = useMemo(() => {
    const primero = new Date(mes.a, mes.m, 1)
    const offset = (primero.getDay() + 6) % 7
    const inicio = new Date(mes.a, mes.m, 1 - offset)
    const total = Math.ceil((offset + new Date(mes.a, mes.m + 1, 0).getDate()) / 7) * 7
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(inicio); d.setDate(inicio.getDate() + i)
      return { fecha: iso(d.getFullYear(), d.getMonth(), d.getDate()), dia: d.getDate(), delMes: d.getMonth() === mes.m, finde: d.getDay() === 0 }
    })
  }, [mes])

  // Eventos por día
  const eventos = useMemo(() => {
    const m = new Map()
    const add = (f, ev) => { if (!m.has(f)) m.set(f, []); m.get(f).push(ev) }
    const desde = celdas[0]?.fecha, hasta = celdas[celdas.length - 1]?.fecha
    if (!desde) return m
    if (capas.has('cumpleanos')) {
      const anios = [...new Set(celdas.map(c => Number(c.fecha.slice(0, 4))))]
      for (const e of empleados) {
        if (!e.fecha_nacimiento || e.estado === 'retirado') continue
        for (const a of anios) {
          const f = cumpleEnAnio(e.fecha_nacimiento, a)
          if (f >= desde && f <= hasta) add(f, { tipo: 'cumple', e, cumple: a - Number(e.fecha_nacimiento.slice(0, 4)) })
        }
      }
    }
    if (capas.has('contratos')) {
      for (const e of empleados) {
        if (e.estado !== 'retirado' && e.fecha_fin_contrato && e.fecha_fin_contrato >= desde && e.fecha_fin_contrato <= hasta)
          add(e.fecha_fin_contrato, { tipo: 'contrato', e })
      }
    }
    if (capas.has('novedades')) {
      for (const n of novedades) {
        if (n.fecha_fin < desde || n.fecha_inicio > hasta) continue
        for (const c of celdas) if (c.fecha >= n.fecha_inicio && c.fecha <= n.fecha_fin) add(c.fecha, { tipo: 'novedad', n, e: empPorId.get(n.empleado_id) })
      }
    }
    // Orden dentro del día: cumpleaños, contratos y luego novedades
    const peso = { cumple: 0, contrato: 1, novedad: 2 }
    for (const lista of m.values()) lista.sort((a, b) => peso[a.tipo] - peso[b.tipo])
    return m
  }, [celdas, empleados, novedades, capas, empPorId])

  // Festivos de Colombia visibles en el mes: fecha → nombre
  const festivos = useMemo(() => {
    const m = new Map()
    for (const a of new Set(celdas.map(c => Number(c.fecha.slice(0, 4))))) for (const [f, n] of festivosColombia(a)) m.set(f, n)
    return m
  }, [celdas])

  const proximos = useMemo(() => proximosCumpleanos(empleados, 30), [empleados])
  const festivosMes = [...festivos].filter(([f]) => f.slice(0, 7) === `${mes.a}-${String(mes.m + 1).padStart(2, '0')}`)

  function moverMes(delta) {
    setMes(({ a, m }) => { const d = new Date(a, m + delta, 1); return { a: d.getFullYear(), m: d.getMonth() } })
  }
  function irAHoy() { setMes({ a: Number(hoy.slice(0, 4)), m: Number(hoy.slice(5, 7)) - 1 }); setDiaSel(hoy) }
  function toggleCapa(id) { setCapas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  function Chip({ ev, compacto }) {
    if (ev.tipo === 'cumple') return (
      <span className="flex items-center gap-1 text-[11px] leading-4 text-pink-700 bg-pink-50 rounded px-1 truncate">
        <Cake size={10} strokeWidth={2} className="flex-shrink-0" /> {corto(ev.e)}
      </span>
    )
    if (ev.tipo === 'contrato') return (
      <span className="flex items-center gap-1 text-[11px] leading-4 text-amber-700 bg-amber-50 rounded px-1 truncate">
        <FileText size={10} strokeWidth={2} className="flex-shrink-0" /> {compacto ? corto(ev.e) : `Fin contrato · ${corto(ev.e)}`}
      </span>
    )
    const t = TIPOS_NOVEDAD[ev.n.tipo]
    return (
      <span className="flex items-center gap-1 text-[11px] leading-4 text-feisen-texto bg-feisen-fondo rounded px-1 truncate">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t?.punto}`} /> {corto(ev.e)}
      </span>
    )
  }

  const evSel = eventos.get(diaSel) || []
  const MAX = 3

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>Calendario</h1>
          <p className={E.subtituloPagina}>Novedades, cumpleaños y vencimientos de contrato</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CAPAS.map(c => (
            <button key={c.id} onClick={() => toggleCapa(c.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors
                ${capas.has(c.id) ? 'border-feisen-borde bg-white text-feisen-texto' : 'border-dashed border-feisen-borde text-feisen-gris-medio'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${capas.has(c.id) ? c.punto : 'bg-feisen-borde'}`} /> {c.label}
            </button>
          ))}
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Mes */}
        <div className={`${E.tarjeta} flex-1 min-w-0 w-full overflow-hidden`}>
          <div className={E.cabTarjeta}>
            <h2 className="text-sm font-semibold text-feisen-texto">{MESES[mes.m]} {mes.a}</h2>
            <div className="flex items-center gap-1">
              <button onClick={irAHoy} className={E.btnTexto}>Hoy</button>
              <button onClick={() => moverMes(-1)} title="Mes anterior" className="p-1.5 rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo"><ChevronLeft size={16} strokeWidth={1.8} /></button>
              <button onClick={() => moverMes(1)} title="Mes siguiente" className="p-1.5 rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo"><ChevronRight size={16} strokeWidth={1.8} /></button>
            </div>
          </div>
          {cargando ? <Spinner /> : (
            <>
              <div className="grid grid-cols-7 border-b border-feisen-borde-suave">
                {DIAS.map(d => <span key={d} className="px-2 py-1.5 text-[11px] font-medium text-feisen-gris-medio">{d}</span>)}
              </div>
              <div className="grid grid-cols-7">
                {celdas.map((c, i) => {
                  const evs = eventos.get(c.fecha) || []
                  const esHoy = c.fecha === hoy
                  const sel = c.fecha === diaSel
                  const festivo = festivos.get(c.fecha)
                  return (
                    <button key={c.fecha} onClick={() => setDiaSel(c.fecha)}
                      className={`relative text-left min-h-[3.5rem] sm:min-h-[6.5rem] p-1 sm:p-1.5 border-feisen-borde-suave transition-colors
                        ${i % 7 !== 6 ? 'border-r' : ''} ${i < celdas.length - 7 ? 'border-b' : ''}
                        ${sel ? 'bg-feisen-azul-suave/60' : c.delMes ? 'bg-white hover:bg-feisen-fondo' : 'bg-feisen-fondo/60 hover:bg-feisen-fondo'}`}>
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full
                          ${esHoy ? 'bg-feisen-azul text-white font-semibold' : !c.delMes ? 'text-feisen-gris-medio/60' : festivo || c.finde ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>
                          {c.dia}
                        </span>
                      </div>
                      {festivo && c.delMes && <p className="hidden sm:block text-[10px] leading-3 text-feisen-rojo/80 truncate px-0.5" title={festivo}>{festivo}</p>}
                      {/* Celular: solo puntos */}
                      {evs.length > 0 && (
                        <div className="sm:hidden flex flex-wrap gap-0.5 mt-0.5 px-0.5">
                          {evs.slice(0, 4).map((ev, j) => (
                            <span key={j} className={`w-1.5 h-1.5 rounded-full ${ev.tipo === 'cumple' ? 'bg-pink-500' : ev.tipo === 'contrato' ? 'bg-amber-500' : TIPOS_NOVEDAD[ev.n.tipo]?.punto}`} />
                          ))}
                        </div>
                      )}
                      {/* Escritorio: nombres */}
                      <div className="hidden sm:flex flex-col gap-0.5 mt-0.5">
                        {evs.slice(0, MAX).map((ev, j) => <Chip key={j} ev={ev} compacto />)}
                        {evs.length > MAX && <span className="text-[10px] text-feisen-gris-medio px-1">+{evs.length - MAX} más</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 border-t border-feisen-borde-suave text-[11px] text-feisen-texto-2">
                {Object.values(TIPOS_NOVEDAD).map(t => (
                  <span key={t.label} className="inline-flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${t.punto}`} /> {t.label}</span>
                ))}
                <span className="inline-flex items-center gap-1.5"><Cake size={11} strokeWidth={2} className="text-pink-500" /> Cumpleaños</span>
                <span className="inline-flex items-center gap-1.5"><FileText size={11} strokeWidth={2} className="text-amber-500" /> Fin de contrato</span>
              </div>
            </>
          )}
        </div>

        {/* Panel lateral: día seleccionado y próximos cumpleaños */}
        <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
          <div className={E.tarjeta}>
            <div className={E.cabTarjeta}>
              <h2 className={E.tituloTarj}>
                {diaSel === hoy ? 'Hoy' : formatoFecha(diaSel)}
                {festivos.has(diaSel) && <span className="text-xs font-normal text-feisen-rojo truncate">· {festivos.get(diaSel)}</span>}
              </h2>
              <button onClick={() => setModal({ nueva: diaSel })} className={`${E.btnTextoAzul} -mr-2`} title="Registrar novedad este día">
                <Plus size={14} strokeWidth={1.8} /> Novedad
              </button>
            </div>
            {evSel.length === 0
              ? <p className="px-5 py-4 text-sm text-feisen-gris-medio">Nada para este día.</p>
              : <div className="divide-y divide-feisen-borde-suave">
                  {evSel.map((ev, j) => {
                    if (ev.tipo === 'cumple') return (
                      <button key={j} onClick={() => navigate(`/rrhh/empleados/${ev.e.id}`)} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-feisen-fondo text-left">
                        <Cake size={16} strokeWidth={1.8} className="text-pink-500 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-feisen-texto truncate">{nombreCompleto(ev.e)}</p>
                          <p className="text-xs text-feisen-gris-medio">Cumple {ev.cumple} años</p>
                        </div>
                      </button>
                    )
                    if (ev.tipo === 'contrato') return (
                      <button key={j} onClick={() => navigate(`/rrhh/empleados/${ev.e.id}`)} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-feisen-fondo text-left">
                        <FileText size={16} strokeWidth={1.8} className="text-amber-500 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-feisen-texto truncate">{nombreCompleto(ev.e)}</p>
                          <p className="text-xs text-feisen-gris-medio">Vence su contrato ({ev.e.tipo_contrato || '—'})</p>
                        </div>
                      </button>
                    )
                    const t = TIPOS_NOVEDAD[ev.n.tipo]
                    return (
                      <button key={j} onClick={() => setModal(ev.n)} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-feisen-fondo text-left">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t?.punto}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-feisen-texto truncate">{ev.e ? nombreCompleto(ev.e) : '—'}</p>
                          <p className="text-xs text-feisen-gris-medio truncate">
                            {t?.label}{ev.n.subtipo && ` · ${ev.n.subtipo}`} · {ev.n.por_horas
                              ? `${String(ev.n.hora_inicio || '').slice(0, 5)}–${String(ev.n.hora_fin || '').slice(0, 5)}`
                              : `${formatoFecha(ev.n.fecha_inicio)} al ${formatoFecha(ev.n.fecha_fin)}`}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>}
          </div>

          {festivosMes.length > 0 && (
            <div className={E.tarjeta}>
              <div className={E.cabTarjeta}>
                <h2 className={E.tituloTarj}>Festivos de {MESES[mes.m].toLowerCase()}</h2>
              </div>
              <div className="px-5 py-2.5 space-y-1.5">
                {festivosMes.map(([f, n]) => (
                  <button key={f} onClick={() => setDiaSel(f)} className="w-full flex items-center gap-3 text-left text-sm hover:text-feisen-azul">
                    <span className="w-8 text-feisen-rojo font-medium">{Number(f.slice(8, 10))}</span>
                    <span className="text-feisen-texto-2 truncate">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={E.tarjeta}>
            <div className={E.cabTarjeta}>
              <h2 className={E.tituloTarj}><Cake {...E.ICONO} className="text-pink-500" /> Próximos cumpleaños</h2>
              <span className={E.etiqueta}>30 días</span>
            </div>
            {proximos.length === 0
              ? <p className="px-5 py-4 text-sm text-feisen-gris-medio">
                  Ninguno en los próximos 30 días.
                  {empleados.some(e => e.estado !== 'retirado' && !e.fecha_nacimiento) && ' Algunas fichas no tienen fecha de nacimiento.'}
                </p>
              : <div className="divide-y divide-feisen-borde-suave">
                  {proximos.map(p => (
                    <button key={p.empleado.id} onClick={() => navigate(`/rrhh/empleados/${p.empleado.id}`)}
                      className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-feisen-fondo text-left">
                      <div className="w-10 text-center flex-shrink-0">
                        <p className="text-sm font-semibold text-feisen-texto leading-4">{Number(p.fecha.slice(8, 10))}</p>
                        <p className="text-[10px] uppercase text-feisen-gris-medio">{MESES[Number(p.fecha.slice(5, 7)) - 1].slice(0, 3)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-feisen-texto truncate">{nombreCompleto(p.empleado)}</p>
                        <p className="text-xs text-feisen-gris-medio">Cumple {p.cumple} años</p>
                      </div>
                      <span className={`text-xs whitespace-nowrap ${p.enDias === 0 ? 'text-pink-600 font-medium' : 'text-feisen-texto-2'}`}>
                        {p.enDias === 0 ? '¡Hoy!' : p.enDias === 1 ? 'Mañana' : `En ${p.enDias} días`}
                      </span>
                    </button>
                  ))}
                </div>}
          </div>
        </div>
      </div>

      {modal && (
        <ModalNovedad
          novedad={modal.nueva ? null : modal}
          fechaInicial={modal.nueva}
          empleados={empleados}
          existentes={novedades}
          perfilId={perfil?.id}
          onCerrar={() => setModal(null)}
          onGuardado={(r) => { setModal(null); setMsg(r?.aviso ? { tipo: 'alerta', texto: r.aviso } : null); cargar() }} />
      )}
    </div>
  )
}
