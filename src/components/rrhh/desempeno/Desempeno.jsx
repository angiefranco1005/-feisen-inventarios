import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchAllPages } from '../../../utils/fetchAllPages'
import Spinner from '../../shared/Spinner'
import Modal from '../../shared/Modal'
import Alerta from '../../shared/Alerta'
import { Plus, ChevronRight, Target, Lock, X, Briefcase } from '../../shared/iconos'
import * as E from '../estilos'
import { AREAS, formatoFecha, nombreCompleto } from '../catalogosRRHH'
import { ESCALA_DEFECTO, COMPETENCIAS_DEFECTO, itemsParaEmpleado, TRIMESTRES } from './desempenoCalculo'
import { aniosPlan, cargarPlan, itemsJefeEnPlan } from './datosPlanJefes'

const hoy = new Date()
const FORM_VACIO = () => ({
  nombre: `Evaluación de desempeño ${hoy.getMonth() < 6 ? '1.er' : '2.º'} semestre ${hoy.getFullYear()}`,
  fecha_inicio: `${hoy.getFullYear()}-${hoy.getMonth() < 6 ? '01-01' : '07-01'}`,
  fecha_fin: `${hoy.getFullYear()}-${hoy.getMonth() < 6 ? '06-30' : '12-31'}`,
  peso_objetivos: 60,
  incluye_autoevaluacion: false,
  area: '',
  competencias: [...COMPETENCIAS_DEFECTO],
  escala: ESCALA_DEFECTO.map(e => ({ ...e })),
  tipo: 'general',
  plan_anio: null,
  trimestre: 1,
  con_encuesta: false,
})

// Ciclo de jefes: nombre, fechas y encuesta según el trimestre del plan
const datosTrimestre = (anio, t) => {
  const tr = TRIMESTRES.find(x => x.t === Number(t)) || TRIMESTRES[0]
  return { nombre: `Evaluación de jefes · T${tr.t} ${anio}`, fecha_inicio: `${anio}-${tr.desde}`, fecha_fin: `${anio}-${tr.hasta}`, con_encuesta: tr.conEncuesta }
}

// Evaluación de desempeño: ciclos de evaluación y creación de uno nuevo
export default function Desempeno() {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const [ciclos,    setCiclos]    = useState([])
  const [avance,    setAvance]    = useState({})   // ciclo_id → { total, completas }
  const [cargando,  setCargando]  = useState(true)
  const [modal,     setModal]     = useState(false)
  const [form,      setForm]      = useState(FORM_VACIO)
  const [creando,   setCreando]   = useState(false)
  const [msg,       setMsg]       = useState(null)
  const [anios,     setAnios]     = useState([])

  useEffect(() => { cargar(); aniosPlan().then(setAnios).catch(() => {}) }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: cs, error }, { data: evs }] = await Promise.all([
      supabase.from('desempeno_ciclos').select('*').order('fecha_inicio', { ascending: false }),
      fetchAllPages((d, h) => supabase.from('desempeno_evaluaciones').select('ciclo_id, estado').range(d, h)),
    ])
    if (error) setMsg({ tipo: 'error', texto: error.message })
    const a = {}
    for (const e of evs || []) {
      if (!a[e.ciclo_id]) a[e.ciclo_id] = { total: 0, completas: 0 }
      a[e.ciclo_id].total++
      if (e.estado === 'completa') a[e.ciclo_id].completas++
    }
    setCiclos(cs || []); setAvance(a); setCargando(false)
  }

  async function crear(e) {
    e.preventDefault(); setMsg(null); setCreando(true)
    const esJefes = form.tipo === 'jefes'
    try {
      // Jefes: el plan del año define quiénes entran y qué se les evalúa
      const plan = esJefes ? await cargarPlan(Number(form.plan_anio)) : null
      if (esJefes && !plan.some(a => !a.es_comun && a.empleado_id)) throw new Error(`El plan ${form.plan_anio} no tiene jefes asignados.`)
      const ciclo = {
        nombre: form.nombre.trim(), fecha_inicio: form.fecha_inicio, fecha_fin: form.fecha_fin,
        peso_objetivos: Number(form.peso_objetivos), peso_competencias: 100 - Number(form.peso_objetivos),
        incluye_autoevaluacion: form.incluye_autoevaluacion,
        competencias_transversales: esJefes ? [] : form.competencias.map(c => c.trim()).filter(Boolean),
        tipo: form.tipo, plan_anio: esJefes ? Number(form.plan_anio) : null, con_encuesta: esJefes ? form.con_encuesta : false,
        escala: form.escala.map(x => ({ valor: x.valor, etiqueta: x.etiqueta.trim() || String(x.valor) })),
        creado_por: perfil?.id,
      }
      const { data: c, error } = await supabase.from('desempeno_ciclos').insert(ciclo).select('id').single()
      if (error) throw error
      // Participantes: colaboradores activos (o en licencia), opcionalmente de un área
      const [{ data: emps }, { data: cargos }] = await Promise.all([
        supabase.from('empleados').select('id, nombres, apellidos, cargo, cargo_id, area, estado, jefe_id').neq('estado', 'retirado'),
        supabase.from('cargos').select('id, nombre, competencias, evaluacion_criterios'),
      ])
      const cargoPorId = new Map((cargos || []).map(x => [x.id, x]))
      const todos = new Map((emps || []).map(x => [x.id, x]))
      const participantes = esJefes
        ? (emps || []).filter(x => itemsJefeEnPlan(plan, x.id, ciclo.con_encuesta))
        : (emps || []).filter(x => !form.area || x.area === form.area)
      if (participantes.length) {
        const filas = participantes.map(emp => {
          const cargo = cargoPorId.get(emp.cargo_id)
          const jefe = todos.get(emp.jefe_id)
          const dePlan = esJefes ? itemsJefeEnPlan(plan, emp.id, ciclo.con_encuesta) : null
          return {
            ciclo_id: c.id, empleado_id: emp.id, cargo_id: emp.cargo_id || null,
            cargo_nombre: cargo?.nombre || emp.cargo || null, area: dePlan ? dePlan.area.nombre : (emp.area || null),
            evaluador: dePlan ? 'Gerencia general' : (jefe ? nombreCompleto(jefe) : null),
            items: dePlan ? dePlan.items : itemsParaEmpleado(cargo, ciclo),
          }
        })
        const { error: e2 } = await supabase.from('desempeno_evaluaciones').insert(filas)
        if (e2) { await supabase.from('desempeno_ciclos').delete().eq('id', c.id); throw e2 }
      }
      navigate(`/rrhh/desempeno/${c.id}`)
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message }); setCreando(false)
    }
  }

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>Desempeño</h1>
          <p className={E.subtituloPagina}>Ciclos de evaluación por objetivos del cargo y competencias</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/rrhh/desempeno/plan-jefes')} className={E.btnSecundario}>
            <Briefcase {...E.ICONO} /> Plan de jefes
          </button>
          <button onClick={() => { setForm(FORM_VACIO()); setMsg(null); setModal(true) }} className={E.btnPrimario}>
            <Plus {...E.ICONO} /> Nuevo ciclo
          </button>
        </div>
      </div>

      {!modal && msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {cargando ? <Spinner /> : ciclos.length === 0 ? (
        <div className={`${E.tarjeta} py-14 text-center`}>
          <Target size={28} strokeWidth={1.5} className="mx-auto text-feisen-gris-medio mb-2" />
          <p className="text-sm text-feisen-texto-2 max-w-md mx-auto">
            Aún no hay ciclos. Cada evaluación toma los criterios de evaluación del cargo (Organigrama → cargo →
            Evaluación de desempeño) y las competencias del cargo y de la empresa.
          </p>
        </div>
      ) : (
        <div className={`${E.tarjeta} divide-y divide-feisen-borde-suave overflow-hidden`}>
          {ciclos.map(c => {
            const a = avance[c.id] || { total: 0, completas: 0 }
            const pct = a.total ? Math.round((a.completas / a.total) * 100) : 0
            return (
              <button key={c.id} onClick={() => navigate(`/rrhh/desempeno/${c.id}`)}
                className="w-full flex items-center gap-4 px-5 py-3 hover:bg-feisen-fondo text-left">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-feisen-texto truncate">{c.nombre}
                    {c.tipo === 'jefes' && <span className="ml-2 text-[11px] font-normal px-2 py-0.5 rounded-full bg-feisen-azul-suave text-feisen-azul">Jefes</span>}</p>
                  <p className="text-xs text-feisen-gris-medio">{formatoFecha(c.fecha_inicio)} – {formatoFecha(c.fecha_fin)} · {a.total} persona{a.total === 1 ? '' : 's'}</p>
                </div>
                <div className="w-32 hidden sm:block">
                  <div className="h-1 rounded-full bg-feisen-borde-suave overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>
                  <p className="text-[11px] text-feisen-gris-medio mt-1">{a.completas} de {a.total} completas</p>
                </div>
                <span className={`inline-flex items-center gap-1 text-xs ${c.estado === 'cerrado' ? 'text-feisen-texto-2' : 'text-green-700'}`}>
                  {c.estado === 'cerrado' ? <><Lock size={12} strokeWidth={1.8} /> Cerrado</> : 'Abierto'}
                </span>
                <ChevronRight size={16} strokeWidth={1.8} className="text-feisen-gris-medio" />
              </button>
            )
          })}
        </div>
      )}

      {modal && (
        <Modal titulo="Nuevo ciclo de evaluación" onCerrar={() => !creando && setModal(false)}>
          <form onSubmit={crear} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <div className="flex border border-feisen-borde rounded-lg p-0.5 bg-white">
              {[{ v: 'general', l: 'Colaboradores' }, { v: 'jefes', l: 'Jefes de área' }].map(o => (
                <button key={o.v} type="button" disabled={o.v === 'jefes' && !anios.length}
                  onClick={() => setForm(f => o.v === 'jefes'
                    ? { ...f, tipo: 'jefes', plan_anio: anios[0], trimestre: 1, peso_objetivos: 60, ...datosTrimestre(anios[0], 1) }
                    : { ...FORM_VACIO() })}
                  className={`flex-1 px-2.5 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 ${form.tipo === o.v ? 'bg-feisen-azul-suave text-feisen-azul font-medium' : 'text-feisen-texto-2 hover:text-feisen-texto'}`}>
                  {o.l}
                </button>
              ))}
            </div>
            {form.tipo === 'jefes' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={E.labelForm}>Plan</label>
                    <select value={form.plan_anio || ''} onChange={e => setForm(f => ({ ...f, plan_anio: Number(e.target.value), ...datosTrimestre(e.target.value, f.trimestre) }))} className={E.input}>
                      {anios.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={E.labelForm}>Trimestre</label>
                    <select value={form.trimestre} onChange={e => setForm(f => ({ ...f, trimestre: Number(e.target.value), ...datosTrimestre(f.plan_anio, e.target.value) }))} className={E.input}>
                      {TRIMESTRES.map(t => <option key={t.t} value={t.t}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2.5 text-sm text-feisen-texto cursor-pointer">
                  <input type="checkbox" checked={form.con_encuesta} onChange={e => set('con_encuesta')(e.target.checked)} className="w-4 h-4 accent-feisen-azul" />
                  Trimestre con encuesta (liderazgo y trabajo en equipo)
                </label>
                <p className="text-[11px] text-feisen-gris-medio -mt-2">Entran los jefes asignados en el plan, con los KPIs de su área y las competencias comunes con el peso de este tipo de trimestre. Lo evalúa gerencia.</p>
              </>
            )}
            <div>
              <label className={E.labelForm}>Nombre *</label>
              <input required value={form.nombre} onChange={e => set('nombre')(e.target.value)} className={E.input} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={E.labelForm}>Periodo evaluado: desde *</label><input required type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio')(e.target.value)} className={E.input} /></div>
              <div><label className={E.labelForm}>Hasta *</label><input required type="date" min={form.fecha_inicio} value={form.fecha_fin} onChange={e => set('fecha_fin')(e.target.value)} className={E.input} /></div>
            </div>
            <div>
              <label className={E.labelForm}>Peso: {form.tipo === 'jefes' ? 'KPIs' : 'objetivos del cargo'} {form.peso_objetivos}% · competencias {100 - form.peso_objetivos}%</label>
              <input type="range" min="0" max="100" step="5" value={form.peso_objetivos} onChange={e => set('peso_objetivos')(Number(e.target.value))} className="w-full accent-feisen-azul" />
            </div>
            {form.tipo === 'general' && <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={E.labelForm}>Participantes</label>
                <select value={form.area} onChange={e => set('area')(e.target.value)} className={E.input}>
                  <option value="">Todos los colaboradores activos</option>
                  {AREAS.map(a => <option key={a} value={a}>Solo {a}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2.5 text-sm text-feisen-texto cursor-pointer self-end pb-2">
                <input type="checkbox" checked={form.incluye_autoevaluacion} onChange={e => set('incluye_autoevaluacion')(e.target.checked)} className="w-4 h-4 accent-feisen-azul" />
                Incluir autoevaluación
              </label>
            </div>}
            {form.tipo === 'general' && <div>
              <label className={E.labelForm}>Competencias de toda la empresa</label>
              <div className="space-y-1.5">
                {form.competencias.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={c} onChange={e => set('competencias')(form.competencias.map((x, j) => (j === i ? e.target.value : x)))} className={`${E.input} flex-1`} />
                    <button type="button" onClick={() => set('competencias')(form.competencias.filter((_, j) => j !== i))} className="p-2 text-feisen-gris-medio hover:text-feisen-rojo"><X size={15} strokeWidth={1.8} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => set('competencias')([...form.competencias, ''])} className={`${E.btnTextoAzul} -ml-2.5`}><Plus size={14} strokeWidth={1.8} /> Agregar competencia</button>
              </div>
              <p className="text-[11px] text-feisen-gris-medio mt-1">Se suman las competencias propias de cada cargo (Organigrama).</p>
            </div>}
            <div>
              <label className={E.labelForm}>Escala de calificación</label>
              <div className="grid grid-cols-5 gap-1.5">
                {form.escala.map((x, i) => (
                  <div key={x.valor}>
                    <p className="text-xs text-center font-semibold text-feisen-texto mb-0.5">{x.valor}</p>
                    <input value={x.etiqueta} onChange={e => set('escala')(form.escala.map((y, j) => (j === i ? { ...y, etiqueta: e.target.value } : y)))}
                      className={`${E.input} px-1.5 text-xs text-center`} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={creando} onClick={() => setModal(false)} className={`${E.btnSecundario} flex-1`}>Cancelar</button>
              <button type="submit" disabled={creando} className={`${E.btnPrimario} flex-1`}>{creando ? 'Creando…' : 'Crear ciclo'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
