import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatCOP, formatFecha } from '../../utils/formatters'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import { useAviso } from '../shared/ui'
import { ArrowLeft, Plus, Trash2, Send } from '../shared/iconos'
import {
  TIPOS, AREAS, RESPONSABLE, APROBADORA, ESTADOS, SEMAFOROS, IMPREVISTOS,
  subtotalCostos, totalInversion, mesesRecuperacion, fmtMeses, fmtPct,
} from './comun'

// Ficha de un proyecto de innovación: las 6 secciones del formato aprobado (2026-11-20).
// Se edita todo y se guarda con un solo botón; el seguimiento mensual se agrega fila por fila.
const CAMPOS = 'id, numero, nombre, tipo, area, responsable, fecha_presentacion, resumen, estado, problema, solucion, indicador_meta, costos, beneficio_mensual, costo_unitario, precio_venta, fases, monto_aprobado, condiciones, proxima_revision, decidido_por, decidido_at'

// Fechas sin hora (columnas date): mediodía local para que no salga el día anterior por la zona horaria
const fechaDia = f => f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const num = v => v === '' || v == null ? null : Number(String(v).replace(/\./g, '').replace(',', '.'))

export default function FichaProyecto() {
  const { id } = useParams()
  const { perfil } = useAuth()
  const [p, setP] = useState(undefined)         // undefined = cargando, null = no existe
  const [original, setOriginal] = useState('')
  const [avances, setAvances] = useState([])
  const [interrupciones, setInterrupciones] = useState([])
  const [equipos, setEquipos] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [faltan, setFaltan] = useState([])
  const [aviso, avisar] = useAviso()

  async function cargar() {
    const [{ data }, { data: eq }] = await Promise.all([
      supabase.from('innovacion_proyectos').select(CAMPOS).eq('id', id).maybeSingle(),
      supabase.from('mant_equipos').select('id, codigo, nombre').eq('activo', true).order('codigo'),
      cargarRegistros(),
    ])
    setP(data || null)
    setOriginal(JSON.stringify(data))
    setEquipos(eq || [])
  }
  // Seguimiento e interrupciones se recargan solos, sin pisar lo que se está editando en la ficha
  async function cargarRegistros() {
    const [{ data: av }, { data: it }] = await Promise.all([
      supabase.from('innovacion_avances').select('*').eq('proyecto_id', id).order('fecha', { ascending: false }),
      supabase.from('innovacion_interrupciones').select('*, mant_equipos(codigo, nombre)').eq('proyecto_id', id).order('fecha', { ascending: false }),
    ])
    setAvances(av || [])
    setInterrupciones(it || [])
  }
  useEffect(() => { cargar() }, [id])

  if (p === undefined) return <Spinner texto="Cargando proyecto..." />
  if (p === null) return (
    <div className="max-w-md mx-auto mt-16 bg-white border border-feisen-borde rounded-xl p-6 text-center">
      <p className="font-semibold text-feisen-texto">Este proyecto no existe o fue borrado</p>
      <Link to="/innovacion" className="text-sm text-feisen-azul mt-2 inline-block">Volver a proyectos</Link>
    </div>
  )

  const set = (campo, valor) => setP(x => ({ ...x, [campo]: valor }))
  const setFila = (lista, i, campo, valor) => setP(x => ({ ...x, [lista]: x[lista].map((f, j) => j === i ? { ...f, [campo]: valor } : f) }))
  const agregarFila = (lista, vacia) => setP(x => ({ ...x, [lista]: [...(x[lista] || []), vacia] }))
  const quitarFila = (lista, i) => setP(x => ({ ...x, [lista]: x[lista].filter((_, j) => j !== i) }))
  const cambiado = JSON.stringify(p) !== original

  // Secciones obligatorias del formato: 1, 2, 3, 5 y 6
  function revisarObligatorias() {
    const f = []
    if (!p.problema?.trim()) f.push('Problema u oportunidad (sección 2)')
    if (!p.solucion?.trim()) f.push('Solución propuesta (sección 3)')
    if (!p.indicador_meta?.trim()) f.push('Indicador y meta (sección 3)')
    if (!(subtotalCostos(p.costos) > 0)) f.push('Al menos un costo (sección 4)')
    if (!(Number(p.beneficio_mensual) > 0)) f.push('Beneficio mensual (sección 4)')
    if (!(p.fases || []).some(x => x.inicio && x.fin)) f.push('Fechas de las fases (sección 5)')
    return f
  }

  async function guardar(cambios = {}) {
    setGuardando(true); setError('')
    const fila = { ...p, ...cambios, responsable: RESPONSABLE, updated_at: new Date().toISOString() }
    delete fila.id; delete fila.numero
    const { error: e } = await supabase.from('innovacion_proyectos').update(fila).eq('id', id)
    setGuardando(false)
    if (e) { setError('No se pudo guardar: ' + e.message); return false }
    const nuevo = { ...p, ...cambios }
    setP(nuevo); setOriginal(JSON.stringify(nuevo))
    return true
  }

  async function presentar() {
    const f = revisarObligatorias()
    setFaltan(f)
    if (f.length) return
    if (await guardar({ estado: 'presentado' })) avisar('Proyecto presentado a gerencia')
  }

  // Firma de aprobación: solo Angie
  const puedeAprobar = perfil?.id === APROBADORA.id
  async function aprobar() {
    if (!puedeAprobar) return
    if (!confirm(`¿Aprobar «${p.nombre}» por ${formatCOP(totalInversion(p.costos))}? Queda firmado a nombre de ${APROBADORA.nombre}.`)) return
    const cambios = { estado: 'aprobado', decidido_por: perfil.id, decidido_at: new Date().toISOString(), monto_aprobado: totalInversion(p.costos) }
    if (await guardar(cambios)) avisar('Proyecto aprobado')
  }
  async function cerrar() {
    if (!confirm('¿Cerrar este proyecto? El seguimiento queda como está.')) return
    if (await guardar({ estado: 'cerrado' })) avisar('Proyecto cerrado')
  }

  const est = ESTADOS[p.estado] || ESTADOS.borrador
  const inv = totalInversion(p.costos)
  const enMarcha = ['aprobado', 'aprobado_ajustes', 'en_curso', 'cerrado'].includes(p.estado)

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-28">
      <Link to="/innovacion" className="inline-flex items-center gap-1 text-sm text-feisen-texto-2 hover:text-feisen-azul">
        <ArrowLeft size={14} /> Proyectos de innovación
      </Link>

      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 tabular-nums">{p.numero}</p>
          <input value={p.nombre} onChange={e => set('nombre', e.target.value)} aria-label="Nombre del proyecto"
            className="text-xl font-semibold text-feisen-texto bg-transparent border-b border-transparent hover:border-feisen-borde focus:border-feisen-azul focus:outline-none w-full max-w-xl" />
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${est.clase}`}>{est.texto}</span>
            <span className="text-sm text-feisen-texto-2">Inversión {formatCOP(inv)}</span>
          </div>
        </div>
        {p.estado === 'borrador' && (
          <button onClick={presentar} disabled={guardando}
            className="flex items-center gap-2 border border-feisen-azul text-feisen-azul rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:bg-feisen-azul-suave">
            <Send size={16} /> Presentar a gerencia
          </button>
        )}
        {p.estado === 'presentado' && (puedeAprobar ? (
          <button onClick={aprobar} disabled={guardando}
            className="bg-feisen-azul text-white rounded-lg px-5 min-h-[44px] text-sm font-semibold disabled:opacity-50">
            Aprobar proyecto
          </button>
        ) : (
          <span className="text-sm text-feisen-texto-2">Espera la aprobación de {APROBADORA.nombre}</span>
        ))}
        {enMarcha && p.estado !== 'cerrado' && (
          <button onClick={cerrar} disabled={guardando}
            className="px-4 min-h-[44px] rounded-lg text-sm border border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo">
            Cerrar proyecto
          </button>
        )}
      </div>

      {p.decidido_at && enMarcha && (
        <p className="text-sm text-feisen-texto-2">
          Aprobado por <span className="font-semibold text-feisen-texto">{APROBADORA.nombre}</span> el {formatFecha(p.decidido_at)}
          {p.monto_aprobado != null && <> por <span className="tabular-nums">{formatCOP(p.monto_aprobado)}</span></>}
        </p>
      )}

      {faltan.length > 0 && (
        <Alerta tipo="alerta" mensaje={`Para presentarlo faltan las secciones obligatorias: ${faltan.join(' · ')}.`} />
      )}
      <Alerta tipo="error" mensaje={error} />

      {/* 1 */}
      <Seccion n="1" titulo="Datos generales" obligatoria>
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo etiqueta="Tipo">
            <select value={p.tipo} onChange={e => set('tipo', e.target.value)} className={INPUT}>
              {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Área o línea">
            <select value={p.area || ''} onChange={e => set('area', e.target.value || null)} className={INPUT}>
              <option value="">Elegir…</option>
              {AREAS.map(a => <option key={a}>{a}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Responsable">
            <p className="min-h-[44px] flex items-center px-3 text-sm text-feisen-texto bg-feisen-fondo border border-feisen-borde-suave rounded-lg">{RESPONSABLE}</p>
          </Campo>
          <Campo etiqueta="Fecha de presentación">
            <input type="date" value={p.fecha_presentacion || ''} onChange={e => set('fecha_presentacion', e.target.value || null)} className={INPUT} />
          </Campo>
        </div>
        <Campo etiqueta="Resumen en 3 líneas" ayuda="Qué se hace, para quién y qué gana Feisen">
          <Texto valor={p.resumen} onCambiar={v => set('resumen', v)} filas={3} />
        </Campo>
      </Seccion>

      {/* 2 */}
      <Seccion n="2" titulo="Problema u oportunidad" obligatoria
        ayuda="¿Qué pasa hoy? ¿Cuánto nos cuesta o cuánto dejamos de vender (COP, unidades, horas, % de rechazo)? ¿De dónde sale el dato?">
        <Texto valor={p.problema} onCambiar={v => set('problema', v)} filas={5} />
      </Seccion>

      {/* 3 */}
      <Seccion n="3" titulo="Solución propuesta" obligatoria
        ayuda="¿Qué se va a diseñar o cambiar? ¿Qué alternativa se descartó y por qué? Anexos: planos, render o fotos.">
        <Texto valor={p.solucion} onCambiar={v => set('solucion', v)} filas={5} />
        <Campo etiqueta="¿Cómo sabremos que funcionó? Indicador y meta" ayuda="Ej.: rechazo de 8 % a 2 %; ciclo de 40 a 25 min">
          <input value={p.indicador_meta || ''} onChange={e => set('indicador_meta', e.target.value)} className={INPUT} />
        </Campo>
      </Seccion>

      {/* 4 */}
      <Seccion n="4" titulo="Costos estimados y retorno" obligatoria ayuda="Inversión para desarrollar el proyecto (no el costo unitario de producción). Valores en COP sin IVA.">
        <div className="border border-feisen-borde rounded-lg overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_1fr_160px_40px] gap-2 px-3 py-2 bg-feisen-fondo text-xs uppercase tracking-wide text-gray-400">
            <span>Rubro</span><span>Detalle</span><span className="text-right">Valor (COP)</span><span />
          </div>
          <div className="divide-y divide-feisen-borde-suave">
            {(p.costos || []).map((c, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_160px_40px] gap-2 px-3 py-2 items-center">
                <input value={c.rubro} onChange={e => setFila('costos', i, 'rubro', e.target.value)} className={`${INPUT_FILA} col-span-2 sm:col-span-1 font-medium`} aria-label="Rubro" />
                <input value={c.detalle || ''} onChange={e => setFila('costos', i, 'detalle', e.target.value)} className={INPUT_FILA} placeholder="Detalle" aria-label="Detalle" />
                <Pesos valor={c.valor} onCambiar={v => setFila('costos', i, 'valor', v)} />
                <BotonQuitar onClick={() => quitarFila('costos', i)} />
              </div>
            ))}
            <Fila etiqueta={`Imprevistos (${IMPREVISTOS * 100} %)`} valor={formatCOP(Math.round(subtotalCostos(p.costos) * IMPREVISTOS))} />
            <Fila etiqueta="Total inversión" valor={formatCOP(inv)} fuerte />
          </div>
        </div>
        <BotonAgregar onClick={() => agregarFila('costos', { rubro: '', detalle: '', valor: null })}>Agregar rubro</BotonAgregar>

        <div className="grid sm:grid-cols-3 gap-3 pt-2">
          <Campo etiqueta="Beneficio mensual (COP)" ayuda="Ventas nuevas × margen, o ahorro">
            <Pesos valor={p.beneficio_mensual} onCambiar={v => set('beneficio_mensual', v)} grande />
          </Campo>
          <Campo etiqueta="Costo unitario (COP)" ayuda="Si es producto">
            <Pesos valor={p.costo_unitario} onCambiar={v => set('costo_unitario', v)} grande />
          </Campo>
          <Campo etiqueta="Precio de venta (COP)" ayuda="Si es producto">
            <Pesos valor={p.precio_venta} onCambiar={v => set('precio_venta', v)} grande />
          </Campo>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Cifra etiqueta="Recuperación" valor={fmtMeses(mesesRecuperacion(p))} contexto="inversión ÷ beneficio mensual" />
          {p.costo_unitario && p.precio_venta ? (
            <Cifra etiqueta="Margen unitario" valor={fmtPct((num(p.precio_venta) - num(p.costo_unitario)) / num(p.precio_venta))}
              contexto={formatCOP(num(p.precio_venta) - num(p.costo_unitario)) + ' por unidad'} />
          ) : null}
        </div>
      </Seccion>

      {/* 5 */}
      <Seccion n="5" titulo="Cronograma" obligatoria ayuda="Cada fase termina en un entregable que gerencia puede revisar.">
        <TablaEditable lista="fases" filas={p.fases} setFila={setFila} quitar={quitarFila}
          columnas={[
            { campo: 'fase', texto: 'Fase', ancho: '1fr' },
            { campo: 'entregable', texto: 'Entregable', ancho: '1.4fr' },
            { campo: 'inicio', texto: 'Inicio', ancho: '140px', tipo: 'date' },
            { campo: 'fin', texto: 'Fin', ancho: '140px', tipo: 'date' },
            { campo: 'responsable', texto: 'Responsable', ancho: '1fr' },
          ]} />
        <BotonAgregar onClick={() => agregarFila('fases', { fase: '', entregable: '', inicio: '', fin: '', responsable: '' })}>Agregar fase</BotonAgregar>
      </Seccion>

      {/* 6 */}
      <Seccion n="6" titulo="Seguimiento de avance" ayuda="Una revisión al mes mientras el proyecto está en marcha, con las horas perdidas por mantenimiento. Al cerrar, registre el indicador logrado frente a la meta de la sección 3.">
        {enMarcha
          ? <Avances proyectoId={id} avances={avances} interrupciones={interrupciones} fases={p.fases} onCambio={cargarRegistros} avisar={avisar} />
          : <p className="text-sm text-feisen-texto-2">El seguimiento se habilita cuando {APROBADORA.nombre} aprueba el proyecto.</p>}
        <Interrupciones proyectoId={id} interrupciones={interrupciones} equipos={equipos} onCambio={cargarRegistros} avisar={avisar} />
      </Seccion>

      {/* Acción principal fija abajo */}
      <div className="fixed bottom-[calc(4.5rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-0 left-0 right-0 lg:left-60 z-30 bg-white/95 backdrop-blur border-t border-feisen-borde px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-end gap-3">
          <span className="text-sm text-feisen-texto-2">{cambiado ? 'Hay cambios sin guardar' : 'Todo guardado'}</span>
          <button onClick={async () => { if (await guardar()) avisar('Cambios guardados') }} disabled={!cambiado || guardando}
            className="bg-feisen-azul text-white rounded-lg px-5 min-h-[44px] text-sm font-semibold disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
      {aviso}
    </div>
  )
}

// ── Seguimiento mensual ──────────────────────────────────────────────────────────
function Avances({ proyectoId, avances, interrupciones, fases, onCambio, avisar }) {
  const VACIO = { fecha: new Date().toISOString().slice(0, 10), fase: '', avance_pct: '', gasto_real: null, presupuesto_fecha: null, semaforo: 'verde', bloqueos: '' }
  const [f, setF] = useState(VACIO)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')

  async function agregar() {
    setError('')
    const fila = { ...f, proyecto_id: proyectoId, avance_pct: f.avance_pct === '' ? null : Math.min(100, Math.max(0, Number(f.avance_pct))) }
    const { error: e } = await supabase.from('innovacion_avances').insert(fila)
    if (e) { setError('No se pudo guardar: ' + e.message); return }
    setF(VACIO); setAbierto(false); avisar('Seguimiento registrado'); onCambio()
  }
  async function borrar(id) {
    if (!confirm('¿Borrar esta revisión?')) return
    await supabase.from('innovacion_avances').delete().eq('id', id)
    onCambio()
  }

  return (
    <div className="space-y-3">
      {avances.length === 0 && !abierto && <p className="text-sm text-feisen-texto-2">Sin revisiones todavía. Registre la primera al cumplir el primer mes.</p>}
      {avances.length > 0 && (
        <div className="border border-feisen-borde rounded-lg divide-y divide-feisen-borde-suave">
          {avances.map(a => {
            const desvio = a.presupuesto_fecha > 0 && a.gasto_real != null ? (a.gasto_real - a.presupuesto_fecha) / a.presupuesto_fecha : null
            return (
              <div key={a.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-medium text-feisen-texto">{fechaDia(a.fecha)} · {a.fase || 'Sin fase'}</p>
                  {a.bloqueos && <p className="text-xs text-feisen-texto-2 mt-0.5">{a.bloqueos}</p>}
                  {(() => { const h = horasDelMes(interrupciones, a.fecha); return h > 0 && <p className="text-xs text-amber-700 mt-0.5">{fmtHoras(h)} perdidas por mantenimiento en el mes</p> })()}
                </div>
                <div className="text-right text-sm tabular-nums">
                  <p className="text-feisen-texto">{a.gasto_real != null ? formatCOP(a.gasto_real) : '—'} <span className="text-feisen-texto-2">de {a.presupuesto_fecha != null ? formatCOP(a.presupuesto_fecha) : '—'}</span></p>
                  {desvio != null && <p className={`text-xs ${desvio > 0.1 ? 'text-feisen-rojo' : 'text-feisen-texto-2'}`}>{desvio > 0 ? '+' : ''}{fmtPct(desvio)} vs. presupuesto</p>}
                </div>
                <span className="w-12 text-right text-sm font-semibold tabular-nums">{a.avance_pct != null ? `${Math.round(a.avance_pct)} %` : '—'}</span>
                {a.semaforo && <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${SEMAFOROS[a.semaforo].clase}`}>{SEMAFOROS[a.semaforo].texto}</span>}
                <BotonQuitar onClick={() => borrar(a.id)} />
              </div>
            )
          })}
        </div>
      )}
      {abierto ? (
        <div className="border border-feisen-borde rounded-lg p-3 space-y-3 bg-feisen-fondo">
          <div className="grid sm:grid-cols-3 gap-3">
            <Campo etiqueta="Fecha"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} className={INPUT} /></Campo>
            <Campo etiqueta="Fase actual">
              <select value={f.fase} onChange={e => setF({ ...f, fase: e.target.value })} className={INPUT}>
                <option value="">Elegir…</option>
                {(fases || []).filter(x => x.fase).map((x, i) => <option key={i}>{x.fase}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Avance (%)"><input inputMode="numeric" value={f.avance_pct} onChange={e => setF({ ...f, avance_pct: e.target.value.replace(/\D/g, '') })} className={`${INPUT} text-right tabular-nums`} /></Campo>
            <Campo etiqueta="Gasto real acumulado (COP)"><Pesos valor={f.gasto_real} onCambiar={v => setF({ ...f, gasto_real: v })} grande /></Campo>
            <Campo etiqueta="Presupuesto a la fecha (COP)"><Pesos valor={f.presupuesto_fecha} onCambiar={v => setF({ ...f, presupuesto_fecha: v })} grande /></Campo>
            <Campo etiqueta="Semáforo">
              <select value={f.semaforo} onChange={e => setF({ ...f, semaforo: e.target.value })} className={INPUT}>
                {Object.entries(SEMAFOROS).map(([v, s]) => <option key={v} value={v}>{s.texto} — {s.ayuda}</option>)}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Bloqueos o decisiones que necesita"><Texto valor={f.bloqueos} onCambiar={v => setF({ ...f, bloqueos: v })} filas={2} /></Campo>
          <Alerta tipo="error" mensaje={error} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setAbierto(false)} className="px-4 min-h-[44px] rounded-lg border border-feisen-borde text-sm bg-white">Cancelar</button>
            <button onClick={agregar} className="px-4 min-h-[44px] rounded-lg border border-feisen-azul text-feisen-azul text-sm font-semibold bg-white">Guardar revisión</button>
          </div>
        </div>
      ) : (
        <BotonAgregar onClick={() => setAbierto(true)}>Registrar revisión del mes</BotonAgregar>
      )}
    </div>
  )
}

// ── Interrupciones por mantenimiento ─────────────────────────────────────────────
// El jefe de Innovación hace trabajos de mantenimiento que solo él puede hacer. Cada vez que uno lo
// saca del proyecto se anota aquí; en la reunión de jefes se decide si se corre la fecha o la prioridad.
const mesDe = f => String(f || '').slice(0, 7)
function horasDelMes(interrupciones, fecha) {
  return (interrupciones || []).filter(i => mesDe(i.fecha) === mesDe(fecha)).reduce((s, i) => s + Number(i.horas || 0), 0)
}
const fmtHoras = h => `${Number(h).toLocaleString('es-CO', { maximumFractionDigits: 1 })} h`
const NOMBRE_MES = m => { const t = new Date(m + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1) }

function Interrupciones({ proyectoId, interrupciones, equipos, onCambio, avisar }) {
  const VACIO = { fecha: new Date().toISOString().slice(0, 10), horas: '', equipo_id: '', motivo: '' }
  const [f, setF] = useState(VACIO)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')

  const total = interrupciones.reduce((s, i) => s + Number(i.horas || 0), 0)
  const porMes = Object.entries(interrupciones.reduce((m, i) => { const k = mesDe(i.fecha); m[k] = (m[k] || 0) + Number(i.horas || 0); return m }, {}))
    .sort((a, b) => b[0].localeCompare(a[0]))

  async function agregar() {
    const horas = Number(String(f.horas).replace(',', '.'))
    if (!(horas > 0)) { setError('Escriba cuántas horas se perdieron.'); return }
    if (!f.motivo.trim()) { setError('Escriba el motivo (qué se hizo).'); return }
    setError('')
    const { error: e } = await supabase.from('innovacion_interrupciones').insert({
      proyecto_id: proyectoId, fecha: f.fecha, horas, equipo_id: f.equipo_id || null, motivo: f.motivo.trim(),
    })
    if (e) { setError('No se pudo guardar: ' + e.message); return }
    setF(VACIO); setAbierto(false); avisar('Interrupción registrada'); onCambio()
  }
  async function borrar(id) {
    if (!confirm('¿Borrar esta interrupción?')) return
    await supabase.from('innovacion_interrupciones').delete().eq('id', id)
    onCambio()
  }

  return (
    <div className="space-y-3 pt-3 border-t border-feisen-borde-suave">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-semibold text-feisen-texto">Interrupciones por mantenimiento</p>
          <p className="text-sm text-feisen-texto-2">Cada vez que un trabajo de mantenimiento saca al jefe de Innovación de este proyecto.</p>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="text-xl font-semibold tabular-nums text-amber-700">{fmtHoras(total)}</p>
            <p className="text-xs text-feisen-texto-2">perdidas en total</p>
          </div>
        )}
      </div>

      {porMes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {porMes.map(([m, h]) => (
            <span key={m} className="text-xs bg-feisen-fondo border border-feisen-borde-suave rounded-md px-2 py-1 tabular-nums">
              {NOMBRE_MES(m)}: <b>{fmtHoras(h)}</b>
            </span>
          ))}
        </div>
      )}

      {interrupciones.length === 0 && !abierto && (
        <p className="text-sm text-feisen-texto-2">Sin interrupciones anotadas. Cuando mantenimiento lo saque del proyecto, regístrelo aquí con las horas y el equipo.</p>
      )}
      {interrupciones.length > 0 && (
        <div className="border border-feisen-borde rounded-lg divide-y divide-feisen-borde-suave">
          {interrupciones.map(i => (
            <div key={i.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-feisen-texto">{i.motivo}</p>
                <p className="text-xs text-feisen-texto-2">
                  {fechaDia(i.fecha)}{i.mant_equipos ? ` · ${i.mant_equipos.codigo} ${i.mant_equipos.nombre}` : ''}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-feisen-texto shrink-0">{fmtHoras(i.horas)}</span>
              <BotonQuitar onClick={() => borrar(i.id)} />
            </div>
          ))}
        </div>
      )}

      {abierto ? (
        <div className="border border-feisen-borde rounded-lg p-3 space-y-3 bg-feisen-fondo">
          <div className="grid sm:grid-cols-3 gap-3">
            <Campo etiqueta="Fecha"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} className={INPUT} /></Campo>
            <Campo etiqueta="Horas perdidas">
              <input inputMode="decimal" value={f.horas} placeholder="Ej.: 3,5" onChange={e => setF({ ...f, horas: e.target.value.replace(/[^\d,.]/g, '') })} className={`${INPUT} text-right tabular-nums`} />
            </Campo>
            <Campo etiqueta="Equipo (opcional)">
              <select value={f.equipo_id} onChange={e => setF({ ...f, equipo_id: e.target.value })} className={INPUT}>
                <option value="">Sin equipo</option>
                {equipos.map(q => <option key={q.id} value={q.id}>{q.codigo} · {q.nombre}</option>)}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Motivo: qué se hizo"><Texto valor={f.motivo} onCambiar={v => setF({ ...f, motivo: v })} filas={2} /></Campo>
          <Alerta tipo="error" mensaje={error} />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAbierto(false); setError('') }} className="px-4 min-h-[44px] rounded-lg border border-feisen-borde text-sm bg-white">Cancelar</button>
            <button onClick={agregar} className="px-4 min-h-[44px] rounded-lg border border-feisen-azul text-feisen-azul text-sm font-semibold bg-white">Guardar interrupción</button>
          </div>
        </div>
      ) : (
        <BotonAgregar onClick={() => setAbierto(true)}>Registrar interrupción</BotonAgregar>
      )}
    </div>
  )
}

// ── Piezas ───────────────────────────────────────────────────────────────────────
const INPUT = 'w-full border border-feisen-borde rounded-lg px-3 min-h-[44px] text-sm bg-white focus:outline-none focus:border-feisen-azul'
const INPUT_FILA = 'w-full border border-transparent hover:border-feisen-borde focus:border-feisen-azul rounded-md px-2 min-h-[40px] text-sm bg-transparent focus:bg-white focus:outline-none'

function Seccion({ n, titulo, obligatoria, ayuda, children }) {
  return (
    <section className="bg-white border border-feisen-borde rounded-xl p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="font-semibold text-feisen-texto">
          {n}. {titulo}
          {obligatoria && <span className="ml-2 align-middle text-[11px] font-medium uppercase tracking-wide text-feisen-texto-2 bg-feisen-fondo rounded px-1.5 py-0.5">Obligatoria</span>}
        </h2>
        {ayuda && <p className="text-sm text-feisen-texto-2 mt-0.5">{ayuda}</p>}
      </div>
      {children}
    </section>
  )
}

function Campo({ etiqueta, ayuda, children }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-gray-400">{etiqueta}</span>
      <div className="mt-1">{children}</div>
      {ayuda && <span className="block text-xs text-feisen-texto-2 mt-1">{ayuda}</span>}
    </label>
  )
}

function Texto({ valor, onCambiar, filas = 3 }) {
  return <textarea value={valor || ''} onChange={e => onCambiar(e.target.value)} rows={filas}
    className="w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-feisen-azul" />
}

// Campo en pesos: muestra separador de miles mientras se escribe, guarda número
function Pesos({ valor, onCambiar, grande }) {
  const texto = valor == null || valor === '' ? '' : Number(valor).toLocaleString('es-CO')
  return (
    <input inputMode="numeric" value={texto} placeholder="$ 0"
      onChange={e => { const d = e.target.value.replace(/\D/g, ''); onCambiar(d === '' ? null : Number(d)) }}
      className={`${grande ? INPUT : INPUT_FILA} text-right tabular-nums`} />
  )
}

function Fila({ etiqueta, valor, fuerte }) {
  return (
    <div className={`flex justify-between px-3 py-2 text-sm ${fuerte ? 'bg-feisen-fondo font-semibold text-feisen-texto' : 'text-feisen-texto-2'}`}>
      <span>{etiqueta}</span><span className="tabular-nums sm:mr-12">{valor}</span>
    </div>
  )
}

function Cifra({ etiqueta, valor, contexto, rojo }) {
  return (
    <div className="border border-feisen-borde rounded-lg p-3">
      <p className="text-xs uppercase tracking-wide text-gray-400">{etiqueta}</p>
      <p className={`text-xl font-semibold tabular-nums mt-0.5 ${rojo ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{valor}</p>
      <p className="text-xs text-feisen-texto-2">{contexto}</p>
    </div>
  )
}

function TablaEditable({ lista, filas, columnas, setFila, quitar }) {
  if (!(filas || []).length) return null
  const plantilla = columnas.map(c => c.ancho).join(' ') + ' 40px'
  return (
    <div className="border border-feisen-borde rounded-lg overflow-hidden">
      <div className="hidden md:grid gap-2 px-3 py-2 bg-feisen-fondo text-xs uppercase tracking-wide text-gray-400" style={{ gridTemplateColumns: plantilla }}>
        {columnas.map(c => <span key={c.campo}>{c.texto}</span>)}<span />
      </div>
      <div className="divide-y divide-feisen-borde-suave">
        {filas.map((f, i) => (
          <div key={i} className="grid grid-cols-2 md:[grid-template-columns:var(--cols)] gap-2 px-3 py-2 items-center" style={{ '--cols': plantilla }}>
            {columnas.map(c => c.opciones ? (
              <select key={c.campo} value={f[c.campo] || ''} onChange={e => setFila(lista, i, c.campo, e.target.value)} className={INPUT_FILA} aria-label={c.texto}>
                <option value="">{c.texto}…</option>
                {c.opciones.map(o => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input key={c.campo} type={c.tipo || 'text'} value={f[c.campo] || ''} onChange={e => setFila(lista, i, c.campo, e.target.value)}
                placeholder={c.texto} aria-label={c.texto} className={INPUT_FILA} />
            ))}
            <BotonQuitar onClick={() => quitar(lista, i)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function BotonAgregar({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-sm font-medium text-feisen-azul min-h-[40px] px-1">
      <Plus size={16} /> {children}
    </button>
  )
}

function BotonQuitar({ onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label="Quitar" className="w-10 h-10 grid place-items-center text-gray-400 hover:text-feisen-rojo rounded-lg">
      <Trash2 size={16} />
    </button>
  )
}
