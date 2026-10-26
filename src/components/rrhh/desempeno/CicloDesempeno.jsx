import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { exportarDesempeno } from '../../../utils/exportExcel'
import Spinner from '../../shared/Spinner'
import Alerta from '../../shared/Alerta'
import { ArrowLeft, Download, Lock, Unlock, ChevronRight, LayoutGrid, List, UserPlus, Trash2 } from 'lucide-react'
import * as E from '../estilos'
import { nombreCompleto, iniciales, formatoFecha, urlsFirmadas, AREAS } from '../catalogosRRHH'
import {
  ESTADOS_EVAL, POTENCIALES, CUADRANTES, COLOR_CUADRANTE, itemsParaEmpleado,
  resultadoFinal, porcentaje, etiquetaDe, nivelDesempeno,
} from './desempenoCalculo'

const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 }))

// Un ciclo de evaluación: avance, resultados y matriz de talento
export default function CicloDesempeno() {
  const { cicloId } = useParams()
  const navigate = useNavigate()
  const [ciclo,     setCiclo]     = useState(null)
  const [evals,     setEvals]     = useState([])
  const [empleados, setEmpleados] = useState([])
  const [fotos,     setFotos]     = useState({})
  const [cargando,  setCargando]  = useState(true)
  const [msg,       setMsg]       = useState(null)
  const [vista,     setVista]     = useState('lista')
  const [fEstado,   setFEstado]   = useState('')
  const [fArea,     setFArea]     = useState('')
  const [agregar,   setAgregar]   = useState('')

  useEffect(() => { cargar() }, [cicloId])

  async function cargar() {
    setCargando(true)
    const [{ data: c, error }, { data: evs }, { data: emps }] = await Promise.all([
      supabase.from('desempeno_ciclos').select('*').eq('id', cicloId).single(),
      supabase.from('desempeno_evaluaciones').select('*').eq('ciclo_id', cicloId),
      supabase.from('empleados').select('id, nombres, apellidos, tipo_documento, numero_documento, cargo, cargo_id, area, estado, jefe_id, foto_path').order('nombres'),
    ])
    if (error) { setMsg({ tipo: 'error', texto: error.message }); setCargando(false); return }
    setCiclo(c); setEvals(evs || []); setEmpleados(emps || [])
    setFotos(await urlsFirmadas((emps || []).map(e => e.foto_path)))
    setCargando(false)
  }

  const empPorId = useMemo(() => new Map(empleados.map(e => [e.id, e])), [empleados])
  const filas = useMemo(() => evals
    .map(ev => ({ ...ev, emp: empPorId.get(ev.empleado_id), final: resultadoFinal(ev) }))
    .filter(ev => (!fEstado || ev.estado === fEstado) && (!fArea || ev.area === fArea))
    .sort((a, b) => nombreCompleto(a.emp).localeCompare(nombreCompleto(b.emp))), [evals, empPorId, fEstado, fArea])

  if (cargando) return <Spinner />
  if (!ciclo) return (
    <div className="max-w-6xl mx-auto space-y-4">
      <button onClick={() => navigate('/rrhh/desempeno')} className={`${E.btnTexto} -ml-2.5`}><ArrowLeft {...E.ICONO} /> Desempeño</button>
      <Alerta tipo="error" mensaje={msg?.texto || 'No se encontró el ciclo.'} />
    </div>
  )

  const escala = ciclo.escala
  const cerrado = ciclo.estado === 'cerrado'
  const completas = evals.filter(e => e.estado === 'completa')
  const conResultado = completas.filter(e => resultadoFinal(e) !== null)
  const promedio = conResultado.length ? conResultado.reduce((t, e) => t + Number(resultadoFinal(e)), 0) / conResultado.length : null
  const distribucion = (escala || []).map(x => ({ ...x, n: conResultado.filter(e => Math.round(Number(resultadoFinal(e))) === x.valor).length }))
  const maxN = Math.max(1, ...distribucion.map(d => d.n))
  const porArea = AREAS.map(a => {
    const lista = conResultado.filter(e => e.area === a)
    return { area: a, n: lista.length, prom: lista.length ? lista.reduce((t, e) => t + Number(resultadoFinal(e)), 0) / lista.length : null }
  }).filter(x => x.n)
  const fuera = empleados.filter(e => e.estado !== 'retirado' && !evals.some(ev => ev.empleado_id === e.id))

  async function cambiarEstado() {
    const cerrar = !cerrado
    if (!window.confirm(cerrar ? '¿Cerrar el ciclo? Las evaluaciones quedan de solo lectura (se puede reabrir).' : '¿Reabrir el ciclo?')) return
    const { data, error } = await supabase.from('desempeno_ciclos').update({ estado: cerrar ? 'cerrado' : 'abierto' }).eq('id', cicloId).select('*').single()
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setCiclo(data)
  }

  async function agregarPersona() {
    const emp = empPorId.get(agregar)
    if (!emp) return
    const { data: cargo } = emp.cargo_id
      ? await supabase.from('cargos').select('id, nombre, competencias, evaluacion_criterios').eq('id', emp.cargo_id).maybeSingle()
      : { data: null }
    const jefe = empPorId.get(emp.jefe_id)
    const { data, error } = await supabase.from('desempeno_evaluaciones').insert({
      ciclo_id: cicloId, empleado_id: emp.id, cargo_id: emp.cargo_id || null, cargo_nombre: cargo?.nombre || emp.cargo || null,
      area: emp.area || null, evaluador: jefe ? nombreCompleto(jefe) : null, items: itemsParaEmpleado(cargo, ciclo),
    }).select('id').single()
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    navigate(`/rrhh/desempeno/${cicloId}/${data.id}`)
  }

  async function eliminarCiclo() {
    if (!window.confirm(`¿Eliminar el ciclo "${ciclo.nombre}" y sus ${evals.length} evaluaciones? No se puede deshacer.`)) return
    const { error } = await supabase.from('desempeno_ciclos').delete().eq('id', cicloId)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    navigate('/rrhh/desempeno')
  }

  function exportar() {
    const items = []
    const datos = filas.map(ev => {
      const nombre = nombreCompleto(ev.emp)
      for (const i of ev.items || []) items.push({ nombre, tipo: i.tipo, item: i.nombre, peso: i.peso, nota: i.nota, nota_auto: i.nota_auto, comentario: i.comentario })
      const nivel = nivelDesempeno(ev.final, escala)
      return {
        nombre, documento: ev.emp ? `${ev.emp.tipo_documento || ''} ${ev.emp.numero_documento || ''}`.trim() : '',
        cargo: ev.cargo_nombre, area: ev.area, evaluador: ev.evaluador, estado: ESTADOS_EVAL[ev.estado]?.label,
        objetivos: ev.resultado_objetivos, competencias: ev.resultado_competencias, resultado: ev.resultado,
        calibrado: ev.resultado_calibrado, final: ev.final, porcentaje: porcentaje(ev.final, escala), etiqueta: etiquetaDe(ev.final, escala),
        potencial: POTENCIALES.find(p => p.value === ev.potencial)?.label, cuadrante: nivel && ev.potencial ? CUADRANTES[ev.potencial][nivel] : '',
      }
    })
    exportarDesempeno(ciclo, datos, items)
  }

  const Avatar = ({ e, tam = 'w-8 h-8 text-xs' }) => e && fotos[e.foto_path]
    ? <img src={fotos[e.foto_path]} alt="" title={nombreCompleto(e)} className={`${tam} rounded-full object-cover flex-shrink-0`} />
    : <span title={nombreCompleto(e)} className={`${tam} rounded-full bg-feisen-fondo border border-feisen-borde-suave flex items-center justify-center font-semibold text-feisen-texto-2 flex-shrink-0`}>{e ? iniciales(e) : '?'}</span>

  const columnas = 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_6.5rem_7rem_6rem_1rem]'

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <button onClick={() => navigate('/rrhh/desempeno')} className={`${E.btnTexto} -ml-2.5`}><ArrowLeft {...E.ICONO} /> Desempeño</button>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>{ciclo.nombre}</h1>
          <p className={E.subtituloPagina}>
            Periodo {formatoFecha(ciclo.fecha_inicio)} – {formatoFecha(ciclo.fecha_fin)} · objetivos {ciclo.peso_objetivos}% / competencias {ciclo.peso_competencias}%
            {ciclo.incluye_autoevaluacion && ' · con autoevaluación'} · {cerrado ? <span className="inline-flex items-center gap-1"><Lock size={12} strokeWidth={1.8} /> Cerrado</span> : <span className="text-green-700">Abierto</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportar} disabled={!filas.length} className={E.btnSecundario}><Download {...E.ICONO} /> Excel</button>
          <button onClick={cambiarEstado} className={E.btnSecundario}>{cerrado ? <><Unlock {...E.ICONO} /> Reabrir</> : <><Lock {...E.ICONO} /> Cerrar ciclo</>}</button>
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Indicadores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${E.tarjeta} grid grid-cols-2 divide-x divide-feisen-borde-suave`}>
          <div className="px-5 py-4">
            <p className={E.etiqueta}>Avance</p>
            <p className="text-2xl font-semibold text-feisen-texto mt-0.5">{completas.length}<span className="text-sm font-normal text-feisen-gris-medio"> / {evals.length}</span></p>
            <div className="mt-2 h-1 rounded-full bg-feisen-borde-suave overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${evals.length ? (completas.length / evals.length) * 100 : 0}%` }} /></div>
          </div>
          <div className="px-5 py-4">
            <p className={E.etiqueta}>Promedio</p>
            <p className="text-2xl font-semibold text-feisen-texto mt-0.5">{fmt(promedio)}</p>
            <p className="text-[11px] text-feisen-gris-medio">{promedio !== null ? `${porcentaje(promedio, escala)} % · ${etiquetaDe(promedio, escala)}` : 'Sin evaluaciones completas'}</p>
          </div>
        </div>
        <div className={`${E.tarjeta} px-5 py-4`}>
          <p className={`${E.etiqueta} mb-2`}>Distribución de resultados</p>
          <div className="space-y-1">
            {distribucion.map(d => (
              <div key={d.valor} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate text-feisen-texto-2">{d.valor} · {d.etiqueta}</span>
                <div className="flex-1 h-2 rounded bg-feisen-fondo overflow-hidden"><div className="h-full bg-feisen-azul/70 rounded" style={{ width: `${(d.n / maxN) * 100}%` }} /></div>
                <span className="w-5 text-right text-feisen-texto">{d.n}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={`${E.tarjeta} px-5 py-4`}>
          <p className={`${E.etiqueta} mb-2`}>Promedio por área</p>
          {porArea.length === 0 ? <p className="text-xs text-feisen-gris-medio">Aparece cuando haya evaluaciones completas.</p> : (
            <div className="space-y-1">
              {porArea.map(a => (
                <div key={a.area} className="flex items-center justify-between text-xs">
                  <span className="text-feisen-texto-2 truncate">{a.area} <span className="text-feisen-gris-medio">({a.n})</span></span>
                  <span className="text-feisen-texto font-medium">{fmt(a.prom)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vista y filtros */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="flex border border-feisen-borde rounded-lg p-0.5 bg-white self-start">
          {[{ id: 'lista', icon: List, label: 'Evaluaciones' }, { id: 'matriz', icon: LayoutGrid, label: 'Matriz de talento' }].map(v => (
            <button key={v.id} onClick={() => setVista(v.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${vista === v.id ? 'bg-feisen-azul-suave text-feisen-azul font-medium' : 'text-feisen-texto-2 hover:text-feisen-texto'}`}>
              <v.icon size={15} strokeWidth={1.8} /> {v.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={fArea} onChange={e => setFArea(e.target.value)} className={`${E.input} w-44`}>
            <option value="">Todas las áreas</option>
            {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {vista === 'lista' && (
            <select value={fEstado} onChange={e => setFEstado(e.target.value)} className={`${E.input} w-40`}>
              <option value="">Todos los estados</option>
              {Object.entries(ESTADOS_EVAL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {vista === 'lista' ? (
        <div className={`${E.tarjeta} overflow-hidden`}>
          <div className={`hidden md:grid ${columnas} gap-4 px-5 py-2 border-b border-feisen-borde-suave text-xs font-medium text-feisen-gris-medio`}>
            <span>Colaborador</span><span>Evaluador</span><span>Estado</span><span className="text-right">Resultado</span><span>Potencial</span><span />
          </div>
          {filas.length === 0 ? <p className="px-5 py-6 text-sm text-center text-feisen-gris-medio">No hay evaluaciones en esta vista.</p> : (
            <div className="divide-y divide-feisen-borde-suave">
              {filas.map(ev => {
                const est = ESTADOS_EVAL[ev.estado]
                return (
                  <button key={ev.id} onClick={() => navigate(`/rrhh/desempeno/${cicloId}/${ev.id}`)}
                    className={`w-full grid grid-cols-[minmax(0,1fr)_auto] ${columnas} gap-x-4 items-center px-5 py-2.5 hover:bg-feisen-fondo text-left`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar e={ev.emp} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-feisen-texto truncate">{nombreCompleto(ev.emp)}</p>
                        <p className="text-xs text-feisen-gris-medio truncate">{ev.cargo_nombre || 'Sin cargo'}{ev.area && ` · ${ev.area}`}</p>
                      </div>
                    </div>
                    <span className="hidden md:block text-sm text-feisen-texto-2 truncate">{ev.evaluador || '—'}</span>
                    <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-feisen-texto-2"><span className={`w-1.5 h-1.5 rounded-full ${est?.punto}`} /> {est?.label}</span>
                    <span className="text-sm text-right">
                      {ev.final !== null ? <><span className="font-medium text-feisen-texto">{fmt(ev.final)}</span><span className="block text-[11px] text-feisen-gris-medio">{etiquetaDe(ev.final, escala)}</span></> : <span className="text-feisen-gris-medio">—</span>}
                    </span>
                    <span className="hidden md:block text-sm text-feisen-texto-2">{POTENCIALES.find(p => p.value === ev.potencial)?.label || '—'}</span>
                    <ChevronRight size={16} strokeWidth={1.8} className="hidden md:block text-feisen-gris-medio justify-self-end" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className={`${E.tarjeta} p-5`}>
          <p className="text-xs text-feisen-gris-medio mb-3">Desempeño (resultado final) contra potencial. Solo aparecen las evaluaciones con resultado y potencial.</p>
          <div className="flex gap-2">
            <div className="flex flex-col justify-around text-[11px] text-feisen-gris-medio w-14 text-right pr-1">
              <span>Potencial alto</span><span>Medio</span><span>Bajo</span>
            </div>
            <div className="flex-1 grid grid-cols-3 gap-1.5">
              {['alto', 'medio', 'bajo'].map(pot => ['bajo', 'medio', 'alto'].map(des => {
                const personas = filas.filter(ev => ev.potencial === pot && nivelDesempeno(ev.final, escala) === des)
                return (
                  <div key={pot + des} className={`${COLOR_CUADRANTE[pot][des]} rounded-lg p-2.5 min-h-[7rem]`}>
                    <p className="text-xs font-semibold text-feisen-texto">{CUADRANTES[pot][des]} <span className="font-normal text-feisen-gris-medio">({personas.length})</span></p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {personas.map(ev => (
                        <button key={ev.id} onClick={() => navigate(`/rrhh/desempeno/${cicloId}/${ev.id}`)} className="rounded-full ring-2 ring-white hover:ring-feisen-azul">
                          <Avatar e={ev.emp} tam="w-7 h-7 text-[10px]" />
                        </button>
                      ))}
                    </div>
                  </div>
                )
              }))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 ml-16 mt-1.5 text-[11px] text-feisen-gris-medio text-center">
            <span>Desempeño bajo</span><span>Medio</span><span>Alto</span>
          </div>
        </div>
      )}

      {!cerrado && (
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className={`${E.tarjeta} flex-1`}>
            <div className={E.cabTarjeta}><h2 className={E.tituloTarj}><UserPlus {...E.ICONO} className={E.iconoTitulo} /> Agregar persona al ciclo</h2></div>
            <div className="px-5 py-4 flex gap-2">
              <select value={agregar} onChange={e => setAgregar(e.target.value)} className={`${E.input} flex-1`}>
                <option value="">{fuera.length ? 'Seleccionar…' : 'Todos los activos ya están'}</option>
                {fuera.map(e => <option key={e.id} value={e.id}>{nombreCompleto(e)}</option>)}
              </select>
              <button onClick={agregarPersona} disabled={!agregar} className={E.btnPrimario}>Agregar</button>
            </div>
          </div>
          {completas.length === 0 && (
            <button onClick={eliminarCiclo} className="self-end inline-flex items-center gap-1.5 text-sm text-feisen-gris-medio hover:text-feisen-rojo px-2 py-1.5">
              <Trash2 size={14} strokeWidth={1.8} /> Eliminar ciclo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
