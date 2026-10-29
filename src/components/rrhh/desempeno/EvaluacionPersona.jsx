import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import Spinner from '../../shared/Spinner'
import Alerta from '../../shared/Alerta'
import { ArrowLeft, ChevronLeft, ChevronRight, Target, Sparkles, Scale, MessageSquare, ListChecks, Plus, X, CheckCircle2, Trash2 } from '../../shared/iconos'
import * as E from '../estilos'
import { nombreCompleto, formatoFecha, hoyISO } from '../catalogosRRHH'
import { calcularResultado, resultadoFinal, porcentaje, etiquetaDe, nivelDesempeno, POTENCIALES, CUADRANTES, ESTADOS_EVAL } from './desempenoCalculo'

const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 }))

function Tarjeta({ titulo, icon: Icon, accion, children }) {
  return (
    <div className={E.tarjeta}>
      <div className={E.cabTarjeta}>
        <h2 className={E.tituloTarj}>{Icon && <Icon {...E.ICONO} className={E.iconoTitulo} />} {titulo}</h2>
        {accion}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// Botones de la escala (1 a 5) para calificar un ítem
function Calificacion({ valor, escala, onChange, disabled, tenue }) {
  return (
    <div className="flex gap-1">
      {escala.map(e => (
        <button key={e.valor} type="button" disabled={disabled} title={e.etiqueta}
          onClick={() => onChange(Number(valor) === e.valor ? null : e.valor)}
          className={`w-8 h-8 rounded-lg text-sm font-medium border transition-colors disabled:cursor-default
            ${Number(valor) === e.valor
              ? (tenue ? 'bg-feisen-fondo border-feisen-azul/40 text-feisen-azul' : 'bg-feisen-azul border-feisen-azul text-white')
              : 'border-feisen-borde text-feisen-texto-2 hover:border-feisen-azul/50 disabled:hover:border-feisen-borde'}`}>
          {e.valor}
        </button>
      ))}
    </div>
  )
}

// Evaluación de desempeño de una persona en un ciclo
export default function EvaluacionPersona() {
  const { cicloId, evalId } = useParams()
  const navigate = useNavigate()
  const [ciclo,     setCiclo]     = useState(null)
  const [ev,        setEv]        = useState(null)
  const [emp,       setEmp]       = useState(null)
  const [orden,     setOrden]     = useState([])
  const [cargando,  setCargando]  = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [cambios,   setCambios]   = useState(false)
  const [msg,       setMsg]       = useState(null)

  useEffect(() => { cargar() }, [evalId])

  async function cargar() {
    setCargando(true); setMsg(null); setCambios(false)
    const [{ data: e, error }, { data: c }, { data: todas }] = await Promise.all([
      supabase.from('desempeno_evaluaciones').select('*').eq('id', evalId).single(),
      supabase.from('desempeno_ciclos').select('*').eq('id', cicloId).single(),
      supabase.from('desempeno_evaluaciones').select('id, empleado_id').eq('ciclo_id', cicloId),
    ])
    if (error) { setMsg({ tipo: 'error', texto: error.message }); setCargando(false); return }
    const [{ data: em }, { data: nombres }] = await Promise.all([
      supabase.from('empleados').select('id, nombres, apellidos, tipo_documento, numero_documento, cargo, area, fecha_ingreso').eq('id', e.empleado_id).single(),
      supabase.from('empleados').select('id, nombres, apellidos').in('id', (todas || []).map(t => t.empleado_id)),
    ])
    const nom = new Map((nombres || []).map(n => [n.id, nombreCompleto(n)]))
    setOrden((todas || []).sort((a, b) => (nom.get(a.empleado_id) || '').localeCompare(nom.get(b.empleado_id) || '')).map(t => t.id))
    setEv({
      ...e, items: e.items || [], plan_accion: e.plan_accion || [],
      resultado_calibrado: e.resultado_calibrado ?? '', fecha_evaluacion: e.fecha_evaluacion || hoyISO(),
    })
    setCiclo(c); setEmp(em); setCargando(false)
  }

  const resultado = useMemo(() => (ev && ciclo ? calcularResultado(ev.items, ciclo) : null), [ev, ciclo])

  if (cargando) return <Spinner />
  if (!ev || !ciclo) return (
    <div className="max-w-6xl mx-auto space-y-4">
      <button onClick={() => navigate(`/rrhh/desempeno/${cicloId}`)} className={`${E.btnTexto} -ml-2.5`}><ArrowLeft {...E.ICONO} /> Ciclo</button>
      <Alerta tipo="error" mensaje={msg?.texto || 'No se encontró la evaluación.'} />
    </div>
  )

  const escala = ciclo.escala?.length ? ciclo.escala : []
  const bloqueada = ciclo.estado === 'cerrado'
  const set = (k, v) => { setEv(x => ({ ...x, [k]: v })); setCambios(true) }
  const setItem = (i, campo, v) => set('items', ev.items.map((it, j) => (j === i ? { ...it, [campo]: v } : it)))
  const objetivos = ev.items.map((it, i) => ({ ...it, i })).filter(it => it.tipo === 'objetivo')
  const competencias = ev.items.map((it, i) => ({ ...it, i })).filter(it => it.tipo === 'competencia')
  const calibrado = ev.resultado_calibrado === '' || ev.resultado_calibrado === null ? null : Number(ev.resultado_calibrado)
  const final = calibrado ?? resultado.resultado
  const nivel = nivelDesempeno(final, escala)
  const pos = orden.indexOf(evalId)
  const siguiente = pos >= 0 && pos < orden.length - 1 ? orden[pos + 1] : null
  const anterior = pos > 0 ? orden[pos - 1] : null
  const sinNota = ev.items.filter(it => it.nota === null || it.nota === undefined || it.nota === '').length

  async function guardar(completar, irA) {
    if (completar && sinNota) { setMsg({ tipo: 'error', texto: `Faltan ${sinNota} ${sinNota === 1 ? 'calificación' : 'calificaciones'} del evaluador para completar la evaluación.` }); return }
    setGuardando(true); setMsg(null)
    const campos = {
      items: ev.items, ...resultado,
      resultado_calibrado: calibrado, justificacion_calibracion: ev.justificacion_calibracion?.trim() || null,
      potencial: ev.potencial || null, evaluador: ev.evaluador?.trim() || null,
      fortalezas: ev.fortalezas?.trim() || null, oportunidades: ev.oportunidades?.trim() || null,
      comentario_colaborador: ev.comentario_colaborador?.trim() || null,
      plan_accion: ev.plan_accion.filter(p => (p.accion || '').trim()),
      fecha_evaluacion: ev.fecha_evaluacion || null,
      estado: completar ? 'completa' : (ev.estado === 'completa' ? 'completa' : (ev.items.some(it => it.nota) ? 'en_curso' : 'pendiente')),
      completada_en: completar ? new Date().toISOString() : ev.completada_en,
    }
    const { data, error } = await supabase.from('desempeno_evaluaciones').update(campos).eq('id', evalId).select('*').single()
    setGuardando(false)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setCambios(false)
    if (irA) { navigate(irA); return }
    setEv(x => ({ ...x, ...data, resultado_calibrado: data.resultado_calibrado ?? '' }))
    setMsg({ tipo: 'exito', texto: completar ? 'Evaluación completa.' : 'Cambios guardados.' })
  }

  async function reabrir() {
    const { error } = await supabase.from('desempeno_evaluaciones').update({ estado: 'en_curso', completada_en: null }).eq('id', evalId)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setEv(x => ({ ...x, estado: 'en_curso', completada_en: null }))
  }

  async function quitar() {
    if (!window.confirm(`¿Quitar a ${nombreCompleto(emp)} de este ciclo?`)) return
    const { error } = await supabase.from('desempeno_evaluaciones').delete().eq('id', evalId)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    navigate(`/rrhh/desempeno/${cicloId}`)
  }

  function ir(destino) {
    if (cambios && !bloqueada && window.confirm('Tienes cambios sin guardar. ¿Guardarlos antes de salir?')) { guardar(false, destino); return }
    navigate(destino)
  }

  // Función de render (no componente): así los campos no se re-montan y no pierden el foco al escribir
  const fila = (it) => (
    <div key={it.i} className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-feisen-texto">{it.nombre}</p>
          {it.tipo === 'objetivo' && <p className="text-[11px] text-feisen-gris-medio">Peso {it.peso || 0}%</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {ciclo.incluye_autoevaluacion && (
            <div>
              <p className="text-[10px] text-feisen-gris-medio mb-0.5">Autoevaluación</p>
              <Calificacion valor={it.nota_auto} escala={escala} disabled={bloqueada} tenue onChange={v => setItem(it.i, 'nota_auto', v)} />
            </div>
          )}
          <div>
            {ciclo.incluye_autoevaluacion && <p className="text-[10px] text-feisen-gris-medio mb-0.5">Evaluador</p>}
            <Calificacion valor={it.nota} escala={escala} disabled={bloqueada} onChange={v => setItem(it.i, 'nota', v)} />
          </div>
        </div>
      </div>
      <input value={it.comentario || ''} disabled={bloqueada} placeholder="Comentario (opcional)"
        onChange={e => setItem(it.i, 'comentario', e.target.value)} className={`${E.input} mt-2 py-1.5 text-xs disabled:bg-feisen-fondo`} />
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => ir(`/rrhh/desempeno/${cicloId}`)} className={`${E.btnTexto} -ml-2.5`}><ArrowLeft {...E.ICONO} /> {ciclo.nombre}</button>
        <div className="flex items-center gap-1">
          <button disabled={!anterior} onClick={() => ir(`/rrhh/desempeno/${cicloId}/${anterior}`)} className="p-1.5 rounded-lg text-feisen-texto-2 hover:bg-white disabled:opacity-30"><ChevronLeft size={16} strokeWidth={1.8} /></button>
          <span className="text-xs text-feisen-gris-medio">{pos + 1} de {orden.length}</span>
          <button disabled={!siguiente} onClick={() => ir(`/rrhh/desempeno/${cicloId}/${siguiente}`)} className="p-1.5 rounded-lg text-feisen-texto-2 hover:bg-white disabled:opacity-30"><ChevronRight size={16} strokeWidth={1.8} /></button>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>{nombreCompleto(emp)}</h1>
          <p className={E.subtituloPagina}>{ev.cargo_nombre || 'Sin cargo'}{ev.area && ` · ${ev.area}`} · {emp?.tipo_documento} {emp?.numero_documento}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-feisen-texto-2 border border-feisen-borde rounded-full px-2.5 py-1">
          <span className={`w-1.5 h-1.5 rounded-full ${ESTADOS_EVAL[ev.estado]?.punto}`} /> {ESTADOS_EVAL[ev.estado]?.label}
        </span>
      </div>

      {bloqueada && <Alerta tipo="info" mensaje="El ciclo está cerrado: solo lectura." />}
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 w-full space-y-4">
          <Tarjeta titulo="Datos de la evaluación">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={E.labelForm}>Evaluador (jefe inmediato)</label><input value={ev.evaluador || ''} disabled={bloqueada} onChange={e => set('evaluador', e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} /></div>
              <div><label className={E.labelForm}>Fecha de la evaluación</label><input type="date" value={ev.fecha_evaluacion || ''} disabled={bloqueada} onChange={e => set('fecha_evaluacion', e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} /></div>
            </div>
          </Tarjeta>

          <Tarjeta titulo={`Objetivos del cargo (${ciclo.peso_objetivos}%)`} icon={Target}>
            {objetivos.length === 0
              ? <p className="text-sm text-feisen-gris-medio">El cargo no tiene criterios de evaluación. Se definen en Organigrama → cargo → Evaluación de desempeño; mientras tanto, el resultado sale solo de las competencias.</p>
              : <div className="divide-y divide-feisen-borde-suave">{objetivos.map(fila)}</div>}
          </Tarjeta>

          <Tarjeta titulo={`Competencias (${ciclo.peso_competencias}%)`} icon={Sparkles}>
            {competencias.length === 0
              ? <p className="text-sm text-feisen-gris-medio">Sin competencias para evaluar.</p>
              : <div className="divide-y divide-feisen-borde-suave">{competencias.map(fila)}</div>}
          </Tarjeta>

          <Tarjeta titulo="Calibración y potencial" icon={Scale}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={E.labelForm}>Resultado calibrado (opcional)</label>
                <input type="number" step="0.1" min={escala[0]?.valor ?? 1} max={escala[escala.length - 1]?.valor ?? 5} value={ev.resultado_calibrado}
                  disabled={bloqueada} placeholder={resultado.resultado !== null ? `Calculado: ${fmt(resultado.resultado)}` : ''}
                  onChange={e => set('resultado_calibrado', e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} />
              </div>
              <div>
                <label className={E.labelForm}>Potencial</label>
                <div className="flex border border-feisen-borde rounded-lg p-0.5 bg-white">
                  {POTENCIALES.map(p => (
                    <button key={p.value} type="button" disabled={bloqueada} onClick={() => set('potencial', ev.potencial === p.value ? null : p.value)}
                      className={`flex-1 px-2.5 py-1.5 rounded-md text-sm transition-colors ${ev.potencial === p.value ? 'bg-feisen-azul-suave text-feisen-azul font-medium' : 'text-feisen-texto-2 hover:text-feisen-texto'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {calibrado !== null && (
                <div className="sm:col-span-2">
                  <label className={E.labelForm}>Justificación de la calibración</label>
                  <textarea rows={2} value={ev.justificacion_calibracion || ''} disabled={bloqueada} onChange={e => set('justificacion_calibracion', e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} />
                </div>
              )}
            </div>
          </Tarjeta>

          <Tarjeta titulo="Retroalimentación" icon={MessageSquare}>
            <div className="space-y-3">
              <div><label className={E.labelForm}>Fortalezas</label><textarea rows={2} value={ev.fortalezas || ''} disabled={bloqueada} onChange={e => set('fortalezas', e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} /></div>
              <div><label className={E.labelForm}>Oportunidades de mejora</label><textarea rows={2} value={ev.oportunidades || ''} disabled={bloqueada} onChange={e => set('oportunidades', e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} /></div>
              <div><label className={E.labelForm}>Comentario del colaborador</label><textarea rows={2} value={ev.comentario_colaborador || ''} disabled={bloqueada} onChange={e => set('comentario_colaborador', e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} /></div>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Plan de acción" icon={ListChecks}>
            <div className="space-y-2">
              {ev.plan_accion.length > 0 && (
                <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_10rem_9rem_7.5rem_2rem] gap-2 text-xs text-feisen-gris-medio">
                  <span>Compromiso</span><span>Responsable</span><span>Fecha</span><span>Estado</span><span />
                </div>
              )}
              {ev.plan_accion.map((p, i) => {
                const setP = (k, v) => set('plan_accion', ev.plan_accion.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
                return (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem_9rem_7.5rem_2rem] gap-2">
                    <input value={p.accion || ''} disabled={bloqueada} placeholder="Ej: Curso de lectura de planos" onChange={e => setP('accion', e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} />
                    <input value={p.responsable || ''} disabled={bloqueada} placeholder="Responsable" onChange={e => setP('responsable', e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} />
                    <input type="date" value={p.fecha || ''} disabled={bloqueada} onChange={e => setP('fecha', e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} />
                    <select value={p.estado || 'pendiente'} disabled={bloqueada} onChange={e => setP('estado', e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`}>
                      <option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="cumplido">Cumplido</option>
                    </select>
                    {!bloqueada && <button type="button" onClick={() => set('plan_accion', ev.plan_accion.filter((_, j) => j !== i))} className="p-2 text-feisen-gris-medio hover:text-feisen-rojo"><X size={15} strokeWidth={1.8} /></button>}
                  </div>
                )
              })}
              {!bloqueada && (
                <button type="button" onClick={() => set('plan_accion', [...ev.plan_accion, { accion: '', responsable: '', fecha: '', estado: 'pendiente' }])} className={`${E.btnTextoAzul} -ml-2.5`}>
                  <Plus size={14} strokeWidth={1.8} /> Agregar compromiso
                </button>
              )}
            </div>
          </Tarjeta>
        </div>

        {/* Resultado */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-4 lg:sticky lg:top-6">
          <div className={E.tarjeta}>
            <div className="px-5 py-4 space-y-2 text-sm">
              <div className="flex justify-between text-feisen-texto-2"><span>Objetivos</span><span>{fmt(resultado.resultado_objetivos)}</span></div>
              <div className="flex justify-between text-feisen-texto-2"><span>Competencias</span><span>{fmt(resultado.resultado_competencias)}</span></div>
              <div className="flex justify-between text-feisen-texto"><span>Resultado</span><span>{fmt(resultado.resultado)}</span></div>
              {calibrado !== null && <div className="flex justify-between text-feisen-texto"><span>Calibrado</span><span>{fmt(calibrado)}</span></div>}
              <div className="border-t border-feisen-borde-suave pt-2">
                <div className="flex justify-between items-baseline"><span className="text-feisen-texto font-semibold">Final</span><span className="text-xl font-semibold text-feisen-azul">{fmt(final)}</span></div>
                {final !== null && <p className="text-xs text-feisen-texto-2 text-right">{porcentaje(final, escala)} % · {etiquetaDe(final, escala)}</p>}
                {nivel && ev.potencial && <p className="text-xs text-feisen-gris-medio text-right mt-1">Matriz de talento: <span className="text-feisen-texto">{CUADRANTES[ev.potencial][nivel]}</span></p>}
              </div>
              {sinNota > 0 && <p className="text-xs text-amber-600">Faltan {sinNota} {sinNota === 1 ? 'calificación' : 'calificaciones'}.</p>}
            </div>
            {!bloqueada && (
              <div className="px-5 pb-4 space-y-2">
                <button onClick={() => guardar(false)} disabled={guardando || !cambios} className={`${E.btnSecundario} w-full`}>{guardando ? 'Guardando…' : cambios ? 'Guardar borrador' : 'Guardado'}</button>
                {ev.estado !== 'completa'
                  ? <button onClick={() => guardar(true)} disabled={guardando} className={`${E.btnPrimario} w-full`}><CheckCircle2 {...E.ICONO} /> Marcar como completa</button>
                  : <button onClick={reabrir} className={`${E.btnTexto} w-full justify-center`}>Reabrir evaluación</button>}
                {siguiente && <button onClick={() => (cambios ? guardar(false, `/rrhh/desempeno/${cicloId}/${siguiente}`) : navigate(`/rrhh/desempeno/${cicloId}/${siguiente}`))} className={`${E.btnTexto} w-full justify-center`}>Siguiente persona <ChevronRight size={14} strokeWidth={1.8} /></button>}
              </div>
            )}
            {ev.completada_en && <p className="px-5 pb-4 -mt-1 text-xs text-feisen-gris-medio">Completada el {formatoFecha(ev.completada_en.slice(0, 10))}</p>}
          </div>
          {!bloqueada && (
            <button onClick={quitar} className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-feisen-gris-medio hover:text-feisen-rojo py-1.5">
              <Trash2 size={14} strokeWidth={1.8} /> Quitar de este ciclo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
