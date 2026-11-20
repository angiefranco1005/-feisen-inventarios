import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatCOP, formatFecha } from '../../utils/formatters'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import { useAviso } from '../shared/ui'
import { ArrowLeft, Plus, Trash2, Send, Paperclip, FileText, FileImage, Loader2 } from '../shared/iconos'
import {
  TIPOS, AREAS, RESPONSABLE, APROBADORA, ESTADOS, IMPREVISTOS,
  subtotalCostos, totalInversion, fmtPct,
  estadoFase, textoEstadoFase, hoyISO as hoyLocal, ESTADOS_FASE, resumenCumplimiento, BUCKET, fmtTamano,
} from './comun'

// Ficha de un proyecto de innovación: las 6 secciones del formato aprobado (2026-11-20).
// Se edita todo y se guarda con un solo botón; el seguimiento mensual se agrega fila por fila.
const CAMPOS = 'id, numero, nombre, tipo, area, responsable, fecha_presentacion, resumen, estado, problema, solucion, indicador_meta, costos, costo_actual, costo_unitario, fases, monto_aprobado, condiciones, proxima_revision, decidido_por, decidido_at'

// Fechas sin hora (columnas date): mediodía local para que no salga el día anterior por la zona horaria
const fechaDia = f => f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

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
  // Costo por unidad: «ahora» (costo_actual) vs. «después del cambio» (costo_unitario)
  const ahorroUnidad = Number(p.costo_actual) > 0 && Number(p.costo_unitario) > 0 ? Number(p.costo_actual) - Number(p.costo_unitario) : null
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
          <Campo etiqueta="¿Cuánto nos sale ahora? (COP)" ayuda="Costo por unidad hoy">
            <Pesos valor={p.costo_actual} onCambiar={v => set('costo_actual', v)} grande />
          </Campo>
          <Campo etiqueta="¿Cuánto nos sale después del cambio? (COP)" ayuda="Costo por unidad con el proyecto">
            <Pesos valor={p.costo_unitario} onCambiar={v => set('costo_unitario', v)} grande />
          </Campo>
          {ahorroUnidad != null && (
            <Cifra etiqueta={ahorroUnidad < 0 ? 'Sube por unidad' : 'Ahorro por unidad'} valor={formatCOP(Math.abs(ahorroUnidad))}
              contexto={`${fmtPct(Math.abs(ahorroUnidad) / Number(p.costo_actual))} ${ahorroUnidad < 0 ? 'más caro' : 'menos'} que ahora`} rojo={ahorroUnidad < 0} />
          )}
        </div>
      </Seccion>

      {/* 5 */}
      <Seccion n="5" titulo="Cronograma" obligatoria ayuda="Cada fase termina en un entregable. Cuando una fase se termine, anote la fecha en «Terminada el»: así se mide si se cumplen los tiempos.">
        <ResumenCronograma fases={p.fases} />
        <FasesCronograma fases={p.fases} setFila={setFila} quitar={quitarFila} />
        <BotonAgregar onClick={() => agregarFila('fases', { fase: '', entregable: '', inicio: '', fin: '', terminada: '', responsable: '' })}>Agregar fase</BotonAgregar>
      </Seccion>

      {/* 6 */}
      <Seccion n="6" titulo="Seguimiento" ayuda="Suba aquí los planos, fotos y documentos a medida que el proyecto avanza, con una nota de qué se hizo. Al cerrar, anote el indicador logrado frente a la meta de la sección 3.">
        <Bitacora proyectoId={id} avances={avances} fases={p.fases} onCambio={cargarRegistros} avisar={avisar} />
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

// ── Cumplimiento del cronograma ──────────────────────────────────────────────────
function ResumenCronograma({ fases }) {
  const r = resumenCumplimiento(fases)
  if (!r.terminadas && !r.atrasadas && !r.porVencer) return null
  const partes = []
  if (r.terminadas) partes.push(<span key="t"><b className="tabular-nums">{r.aTiempo} de {r.terminadas}</b> fases terminadas a tiempo</span>)
  if (r.atrasadas) partes.push(<span key="a" className="text-feisen-rojo font-semibold">{r.atrasadas} {r.atrasadas === 1 ? 'atrasada' : 'atrasadas'}</span>)
  if (r.porVencer) partes.push(<span key="v" className="text-amber-700 font-semibold">{r.porVencer} vence{r.porVencer === 1 ? '' : 'n'} esta semana</span>)
  return (
    <p className="text-sm text-feisen-texto-2 flex flex-wrap gap-x-2">
      {partes.map((x, i) => <span key={i}>{i > 0 && '· '}{x}</span>)}
    </p>
  )
}

// ── Seguimiento: bitácora con planos, fotos y documentos ─────────────────────────
// Cada entrada: fecha, fase, nota y archivos (bucket privado «innovacion», se abren con enlace firmado).
// Reemplazó la revisión mensual con avance %, gasto y semáforo (Angie, 2026-11-20).
const nombreSeguro = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
const esImagen = a => (a.tipo || '').startsWith('image/')

function Bitacora({ proyectoId, avances, fases, onCambio, avisar }) {
  const VACIO = { fecha: hoyLocal(), fase: '', nota: '' }
  const [f, setF] = useState(VACIO)
  const [archivos, setArchivos] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setError('')
    if (!f.nota.trim() && !archivos.length) { setError('Escriba qué se hizo o adjunte al menos un archivo.'); return }
    const grandes = archivos.filter(a => a.size > 50 * 1048576)
    if (grandes.length) { setError(`Pesa más de 50 MB: ${grandes.map(a => a.name).join(', ')}. Comprímalo o súbalo en partes.`); return }
    setSubiendo(true)
    const subidos = []
    for (const a of archivos) {
      const path = `${proyectoId}/${Date.now()}-${nombreSeguro(a.name)}`
      const { error: e } = await supabase.storage.from(BUCKET).upload(path, a, { contentType: a.type || undefined })
      if (e) {
        if (subidos.length) await supabase.storage.from(BUCKET).remove(subidos.map(x => x.path))
        setSubiendo(false); setError(`No se pudo subir «${a.name}»: ${e.message}`); return
      }
      subidos.push({ path, nombre: a.name, tipo: a.type || '', tamano: a.size })
    }
    const { error: e } = await supabase.from('innovacion_avances').insert({
      proyecto_id: proyectoId, fecha: f.fecha, fase: f.fase || null, nota: f.nota.trim() || null, archivos: subidos,
    })
    setSubiendo(false)
    if (e) {
      if (subidos.length) await supabase.storage.from(BUCKET).remove(subidos.map(x => x.path))
      setError('No se pudo guardar: ' + e.message); return
    }
    setF(VACIO); setArchivos([]); setAbierto(false); avisar('Avance registrado'); onCambio()
  }

  async function borrar(a) {
    if (!confirm(`¿Borrar este avance${(a.archivos || []).length ? ' y sus archivos' : ''}? No se puede deshacer.`)) return
    const { error: e } = await supabase.from('innovacion_avances').delete().eq('id', a.id)
    if (e) { avisar('No se pudo borrar: ' + e.message); return }
    if ((a.archivos || []).length) await supabase.storage.from(BUCKET).remove(a.archivos.map(x => x.path))
    onCambio()
  }

  return (
    <div className="space-y-3">
      {abierto ? (
        <div className="border border-feisen-borde rounded-lg p-3 space-y-3 bg-feisen-fondo">
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo etiqueta="Fecha"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} className={INPUT} /></Campo>
            <Campo etiqueta="Fase">
              <select value={f.fase} onChange={e => setF({ ...f, fase: e.target.value })} className={INPUT}>
                <option value="">Sin fase</option>
                {(fases || []).filter(x => x.fase).map((x, i) => <option key={i}>{x.fase}</option>)}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="¿Qué se hizo?"><Texto valor={f.nota} onCambiar={v => setF({ ...f, nota: v })} filas={3} /></Campo>
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto cursor-pointer hover:bg-feisen-fondo">
              <Paperclip size={16} /> Adjuntar planos, fotos o documentos
              <input type="file" multiple className="sr-only"
                onChange={e => { const nuevos = Array.from(e.target.files || []); setArchivos(x => [...x, ...nuevos]); e.target.value = '' }} />
            </label>
            {archivos.length > 0 && (
              <ul className="space-y-1">
                {archivos.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm bg-white border border-feisen-borde-suave rounded-lg pl-3">
                    <span className="flex-1 truncate text-feisen-texto">{a.name}</span>
                    <span className="text-xs text-feisen-texto-2 tabular-nums">{fmtTamano(a.size)}</span>
                    <BotonQuitar onClick={() => setArchivos(x => x.filter((_, j) => j !== i))} />
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-feisen-texto-2">Cualquier tipo de archivo (PDF, DWG, imágenes, Excel), hasta 50 MB cada uno.</p>
          </div>
          <Alerta tipo="error" mensaje={error} />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAbierto(false); setArchivos([]); setError('') }} disabled={subiendo} className="px-4 min-h-[44px] rounded-lg border border-feisen-borde text-sm bg-white">Cancelar</button>
            <button onClick={guardar} disabled={subiendo}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg border border-feisen-azul text-feisen-azul text-sm font-semibold bg-white disabled:opacity-60">
              {subiendo ? <><Loader2 size={16} className="animate-spin" /> Subiendo…</> : 'Guardar avance'}
            </button>
          </div>
        </div>
      ) : (
        <BotonAgregar onClick={() => setAbierto(true)}>Agregar avance</BotonAgregar>
      )}

      {avances.length === 0 && !abierto && (
        <p className="text-sm text-feisen-texto-2">Todavía no hay avances. Use «Agregar avance» cada vez que haya algo para mostrar: un plano, una foto del modelo, el informe de una prueba.</p>
      )}
      {avances.length > 0 && (
        <div className="border border-feisen-borde rounded-lg divide-y divide-feisen-borde-suave">
          {avances.map(a => (
            <div key={a.id} className="flex items-start gap-3 px-3 py-3">
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-sm font-medium text-feisen-texto">{fechaDia(a.fecha)}{a.fase ? ` · ${a.fase}` : ''}</p>
                {a.nota && <p className="text-sm text-feisen-texto whitespace-pre-line">{a.nota}</p>}
                {(a.archivos || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {a.archivos.map(x => <ArchivoAdjunto key={x.path} archivo={x} />)}
                  </div>
                )}
              </div>
              <BotonQuitar onClick={() => borrar(a)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ArchivoAdjunto({ archivo }) {
  const [abriendo, setAbriendo] = useState(false)
  async function abrir() {
    setAbriendo(true)
    // Se abre la pestaña antes de pedir el enlace para que el navegador no la bloquee
    const ventana = window.open('', '_blank')
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(archivo.path, 600)
    setAbriendo(false)
    if (error || !data?.signedUrl) { ventana?.close(); alert('No se pudo abrir el archivo: ' + (error?.message || 'sin enlace')); return }
    if (ventana) ventana.location.href = data.signedUrl
    else window.location.href = data.signedUrl
  }
  const Icono = esImagen(archivo) ? FileImage : FileText
  return (
    <button type="button" onClick={abrir} disabled={abriendo}
      className="inline-flex items-center gap-2 max-w-full px-3 min-h-[40px] rounded-lg border border-feisen-borde bg-white text-sm text-feisen-azul hover:bg-feisen-fondo">
      {abriendo ? <Loader2 size={16} className="animate-spin shrink-0" /> : <Icono size={16} className="shrink-0" />}
      <span className="truncate">{archivo.nombre}</span>
      {archivo.tamano ? <span className="text-xs text-feisen-texto-2 tabular-nums shrink-0">{fmtTamano(archivo.tamano)}</span> : null}
    </button>
  )
}

// ── Interrupciones por mantenimiento ─────────────────────────────────────────────
// El jefe de Innovación hace trabajos de mantenimiento que solo él puede hacer. Cada vez que uno lo
// saca del proyecto se anota aquí; en la reunión de jefes se decide si se corre la fecha o la prioridad.
const mesDe = f => String(f || '').slice(0, 7)
const fmtHoras = h => `${Number(h).toLocaleString('es-CO', { maximumFractionDigits: 1 })} h`
const NOMBRE_MES = m => { const t = new Date(m + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1) }

function Interrupciones({ proyectoId, interrupciones, equipos, onCambio, avisar }) {
  const VACIO = { fecha: hoyLocal(), horas: '', equipo_id: '', motivo: '' }
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

// Cronograma editable: cada fase en dos líneas (qué se entrega / fechas y cumplimiento) para que
// quepa sin cortar textos, también en celular.
function FasesCronograma({ fases, setFila, quitar }) {
  if (!(fases || []).length) return null
  const cambiar = (i, campo) => e => setFila('fases', i, campo, e.target.value)
  return (
    <div className="border border-feisen-borde rounded-lg divide-y divide-feisen-borde-suave">
      {fases.map((f, i) => {
        const e = estadoFase(f)
        return (
          <div key={i} className="px-3 py-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_1fr_40px] gap-2 items-center">
              <input value={f.fase || ''} onChange={cambiar(i, 'fase')} placeholder="Fase" aria-label="Fase" className={`${INPUT_FILA} font-medium`} />
              <input value={f.entregable || ''} onChange={cambiar(i, 'entregable')} placeholder="Entregable" aria-label="Entregable" className={INPUT_FILA} />
              <input value={f.responsable || ''} onChange={cambiar(i, 'responsable')} placeholder="Responsable" aria-label="Responsable" className={INPUT_FILA} />
              <span className="hidden sm:block"><BotonQuitar onClick={() => quitar('fases', i)} /></span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] gap-2 items-end">
              {[['inicio', 'Inicio'], ['fin', 'Fin'], ['terminada', 'Terminada el']].map(([c, t]) => (
                <label key={c} className="block">
                  <span className="text-[11px] uppercase tracking-wide text-gray-400">{t}</span>
                  <input type="date" value={f[c] || ''} onChange={cambiar(i, c)} className={INPUT_FILA} />
                </label>
              ))}
              <span className={`justify-self-start sm:justify-self-end self-center rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap ${ESTADOS_FASE[e.clave].clase}`}>{textoEstadoFase(e)}</span>
            </div>
            <div className="sm:hidden flex justify-end"><BotonQuitar onClick={() => quitar('fases', i)} /></div>
          </div>
        )
      })}
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
