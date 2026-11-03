import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import { ArrowLeft, ArrowRight, Check, CheckCircle, Circle, FileDown, Info, Send, Sparkles, X } from '../shared/iconos'
import ESTRUCTURA, { parteVacia, revisarDocumento, revisarParte, tieneCorchetes } from './estructura'
import { EDITOR, Ejemplo } from './editores'
import VistaDocumento from './VistaDocumento'
import { SELECT_VERSION, accionVersion, ponerNombres } from './comun'
import { exportarDocumentoPDF } from '../../utils/documentoManualPDF'
import { exportarDocumentoWord } from '../../utils/documentoManualWord'

const guardarPaso = (id, n) => { try { localStorage.setItem(`manual-asistente-${id}`, String(n)) } catch { /* sin almacenamiento */ } }
const leerPaso = id => { try { return parseInt(localStorage.getItem(`manual-asistente-${id}`), 10) || 0 } catch { return 0 } }

// Asistente guiado para escribir un documento en la app. Pantalla completa: una parte a la vez,
// con la pregunta, la ayuda, consejos, un ejemplo que se puede usar como punto de partida y
// revisiones automáticas. Se guarda solo. Al final: vista previa, descarga (PDF/Word) y envío
// a revisión. Solo edita quien elaboró el borrador (la RLS lo exige).
export default function Asistente({ manual, onCerrar, onCambio }) {
  const { perfil } = useAuth()
  const estructura = ESTRUCTURA[manual.tipo]
  const partes = estructura.partes
  const FINAL = partes.length + 1

  const [version, setVersion] = useState(null)
  const [aprobadas, setAprobadas] = useState([])
  const [contenido, setContenido] = useState(null)
  const [paso, setPaso] = useState(0)
  const [guardado, setGuardado] = useState('guardado') // guardado | pendiente | guardando | error
  const [error, setError] = useState('')
  const [ayudaAbierta, setAyudaAbierta] = useState(false)
  const [ocupado, setOcupado] = useState('')
  const [cambios, setCambios] = useState('')
  const pendiente = useRef(null)
  const cuerpoRef = useRef(null)

  useEffect(() => {
    let vivo = true
    supabase.from('manual_versiones').select(SELECT_VERSION).eq('manual_id', manual.id).order('version', { ascending: false })
      .then(async ({ data, error: err }) => {
        if (!vivo) return
        if (err) { setError(err.message); return }
        const vs = await ponerNombres(data || [])
        const borrador = vs.find(v => v.estado === 'borrador' && v.contenido)
        if (!borrador) { setError('Este documento no tiene un borrador escrito en la app para editar.'); return }
        setVersion(borrador); setContenido(borrador.contenido); setAprobadas(vs.filter(v => v.estado === 'aprobada')); setCambios(borrador.cambios || '')
        setPaso(Math.min(leerPaso(borrador.id), partes.length + 1))
      })
    return () => { vivo = false }
  }, [manual.id, partes.length])

  const editable = version && version.estado === 'borrador' && version.subido_por === perfil?.id

  // Guardado automático un segundo después del último cambio
  const guardar = useCallback(async (c) => {
    if (!version) return
    setGuardado('guardando')
    const { error: err } = await supabase.from('manual_versiones').update({ contenido: c }).eq('id', version.id)
    setGuardado(err ? 'error' : 'guardado')
    if (err) setError(`No se pudo guardar: ${err.message}`)
  }, [version])

  const cambiar = (clave, valor) => {
    const c = { ...contenido, [clave]: valor }
    setContenido(c); setGuardado('pendiente')
    clearTimeout(pendiente.current)
    pendiente.current = setTimeout(() => guardar(c), 1000)
  }

  const cerrar = async () => {
    if (guardado === 'pendiente') { clearTimeout(pendiente.current); await guardar(contenido) }
    onCerrar()
  }

  const irA = n => {
    setPaso(n); setAyudaAbierta(false)
    if (version) guardarPaso(version.id, n)
    cuerpoRef.current?.scrollTo({ top: 0 })
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error && !version) return (
    <Pantalla><div className="max-w-md mx-auto mt-20 bg-white border border-feisen-borde rounded-xl p-6 text-center space-y-3">
      <p className="text-sm text-feisen-rojo">{error}</p>
      <button type="button" onClick={onCerrar} className="min-h-[44px] px-4 rounded-lg border border-feisen-borde text-sm font-medium">Volver</button>
    </div></Pantalla>
  )
  if (!version) return <Pantalla><div className="py-24 grid place-items-center"><Spinner /></div></Pantalla>

  const resumen = revisarDocumento(manual.tipo, contenido)
  const faltan = resumen.filter(r => r.parte.obligatorio && r.vacia)
  const corchetes = resumen.filter(r => tieneCorchetes(contenido[r.parte.clave]))
  const avisos = resumen.filter(r => !r.vacia && r.checks.some(c => !c.ok))
  const pideCambios = aprobadas.length > 0
  const faltaCambio = pideCambios && !cambios.trim()
  const listo = faltan.length === 0 && corchetes.length === 0 && !faltaCambio
  const parte = paso >= 1 && paso <= partes.length ? partes[paso - 1] : null
  const Editor = parte && EDITOR[parte.editor]

  const estadoParte = r => r.lista && !r.vacia ? 'lista' : r.vacia ? (r.parte.obligatorio ? 'falta' : 'opcional') : 'revisar'

  const descargar = async formato => {
    setOcupado(formato); setError('')
    try {
      const datos = { manual, version: { ...version, contenido }, contenido, aprobadas }
      if (formato === 'pdf') await exportarDocumentoPDF(datos); else await exportarDocumentoWord(datos)
    } catch (e) { setError(`No se pudo generar el archivo: ${e.message}`) }
    setOcupado('')
  }

  const enviar = async () => {
    setOcupado('enviar'); setError('')
    try {
      clearTimeout(pendiente.current); await guardar(contenido)
      if (pideCambios) await guardarCambios()
      await accionVersion(version.id, 'enviar')
      onCambio(`${manual.codigo} v${version.version} enviada a revisión`)
    } catch (e) { setError(e.message); setOcupado('') }
  }

  const guardarCambios = async () => {
    if ((version.cambios || '') === cambios.trim()) return
    const { error: err } = await supabase.from('manual_versiones').update({ cambios: cambios.trim() || null }).eq('id', version.id)
    if (err) throw new Error(err.message)
    setVersion(v => ({ ...v, cambios: cambios.trim() }))
  }

  const textoGuardado = { guardado: 'Guardado', pendiente: 'Sin guardar…', guardando: 'Guardando…', error: 'Error al guardar' }[guardado]

  return (
    <Pantalla>
      {/* Barra superior */}
      <div className="flex items-center gap-3 px-4 sm:px-6 h-14 bg-white border-b border-feisen-borde shrink-0">
        <button type="button" onClick={cerrar} aria-label="Cerrar el asistente" className="p-2 -ml-2 rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo"><X size={20} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-feisen-texto-2 truncate">{estructura.nombre} · {manual.codigo} · versión {version.version}</p>
          <p className="text-sm font-semibold text-feisen-texto truncate">{manual.titulo}</p>
        </div>
        <span className={`text-xs whitespace-nowrap ${guardado === 'error' ? 'text-feisen-rojo' : 'text-feisen-texto-2'}`}>
          {guardado === 'guardado' && <Check size={12} className="inline -mt-0.5 mr-1 text-emerald-600" />}{textoGuardado}
        </span>
      </div>
      {/* Progreso (celular) */}
      <div className="lg:hidden h-1 bg-gray-200 shrink-0"><div className="h-full bg-feisen-azul transition-all" style={{ width: `${(paso / FINAL) * 100}%` }} /></div>

      <div className="flex-1 min-h-0 flex">
        {/* Pasos (escritorio) */}
        <nav aria-label="Partes del documento" className="hidden lg:block w-64 shrink-0 border-r border-feisen-borde bg-white overflow-y-auto py-3">
          <BotonPaso activo={paso === 0} onClick={() => irA(0)} estado="intro" texto="Antes de empezar" />
          {resumen.map((r, i) => <BotonPaso key={r.parte.clave} activo={paso === i + 1} onClick={() => irA(i + 1)} estado={estadoParte(r)} texto={r.parte.titulo} n={i + 1} />)}
          <BotonPaso activo={paso === FINAL} onClick={() => irA(FINAL)} estado={listo ? 'lista' : 'final'} texto="Revisar y terminar" />
        </nav>

        <div ref={cuerpoRef} className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 lg:pb-10">
            {!editable && <p className="mb-4 text-sm bg-amber-50 text-amber-800 rounded-lg px-3 py-2">Solo quien elaboró el borrador puede editarlo. Puedes leerlo y descargarlo.</p>}
            {error && <p className="mb-4 text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}

            {paso === 0 && <Intro estructura={estructura} manual={manual} conPlantilla={tieneCorchetes(contenido)} />}

            {parte && (
              <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
                <section className="space-y-4 min-w-0">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Parte {paso} de {partes.length} · {parte.titulo}{!parte.obligatorio && ' · opcional'}</p>
                    <h1 className="text-xl font-semibold text-feisen-texto mt-1">{parte.pregunta}</h1>
                    <p className="text-sm text-feisen-texto-2 mt-1">{parte.ayuda}</p>
                  </div>
                  <fieldset disabled={!editable} className="contents">
                    <Editor parte={parte} valor={contenido[parte.clave]} onCambiar={v => cambiar(parte.clave, v)} contenido={contenido} />
                  </fieldset>
                  <Revisiones checks={revisarParte(parte, contenido[parte.clave])} />
                  {/* Ayuda en celular */}
                  <div className="lg:hidden">
                    <button type="button" onClick={() => setAyudaAbierta(v => !v)} className="flex items-center gap-2 text-sm font-medium text-feisen-azul min-h-[44px]">
                      <Info size={16} /> {ayudaAbierta ? 'Ocultar ejemplo y consejos' : 'Ver ejemplo y consejos'}
                    </button>
                    {ayudaAbierta && <PanelAyuda parte={parte} vacia={parteVacia(parte, contenido[parte.clave])} editable={editable} onUsar={v => cambiar(parte.clave, v)} />}
                  </div>
                </section>
                <aside className="hidden lg:block"><div className="sticky top-0"><PanelAyuda parte={parte} vacia={parteVacia(parte, contenido[parte.clave])} editable={editable} onUsar={v => cambiar(parte.clave, v)} /></div></aside>
              </div>
            )}

            {paso === FINAL && (
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Último paso</p>
                  <h1 className="text-xl font-semibold text-feisen-texto mt-1">Revisa cómo quedó</h1>
                  <p className="text-sm text-feisen-texto-2 mt-1">Así se verá el documento. Cuando esté listo, envíalo a revisión: lo revisa otra persona y luego gerencia lo aprueba.</p>
                </div>
                <div className="bg-white border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
                  {resumen.map((r, i) => {
                    const est = estadoParte(r)
                    return (
                      <button key={r.parte.clave} type="button" onClick={() => irA(i + 1)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-feisen-fondo">
                        <Icono estado={est} />
                        <span className="flex-1 min-w-0 text-sm text-feisen-texto">{r.parte.titulo}</span>
                        <span className={`text-xs ${est === 'falta' ? 'text-feisen-rojo' : est === 'revisar' ? 'text-amber-700' : 'text-feisen-texto-2'}`}>
                          {est === 'lista' ? 'Lista' : est === 'falta' ? 'Falta' : est === 'opcional' ? 'Opcional, vacía' : tieneCorchetes(contenido[r.parte.clave]) ? 'Quedan [corchetes]' : 'Revisar sugerencias'}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {pideCambios && (
                  <div className="bg-white border border-feisen-borde rounded-xl p-4 space-y-1.5">
                    <label htmlFor="asist-cambios" className="block text-sm font-semibold text-feisen-texto">¿Qué cambió frente a la versión {aprobadas[0]?.version}?</label>
                    <p className="text-xs text-feisen-texto-2">Sale en el control de cambios del documento. Ej.: «Se agregó la inspección del molde antes de colar».</p>
                    <textarea id="asist-cambios" rows={2} value={cambios} disabled={!editable} onChange={e => setCambios(e.target.value)}
                      onBlur={() => guardarCambios().catch(e => setError(e.message))}
                      className="w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-sm focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
                  </div>
                )}
                {!listo && <p className="text-sm bg-feisen-rojo-suave text-feisen-rojo rounded-lg px-3 py-2">
                  Para enviarlo a revisión {[
                    faltan.length && `falta llenar: ${faltan.map(r => r.parte.titulo).join(', ')}`,
                    corchetes.length && `quedan partes [entre corchetes] en: ${corchetes.map(r => r.parte.titulo).join(', ')}`,
                    faltaCambio && 'falta escribir qué cambió frente a la versión anterior',
                  ].filter(Boolean).join('; ')}.
                </p>}
                {listo && avisos.length > 0 && <p className="text-sm bg-amber-50 text-amber-800 rounded-lg px-3 py-2">Hay sugerencias sin atender en {avisos.map(r => r.parte.titulo).join(', ')}. Puedes enviarlo igual; el revisor las verá.</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => descargar('pdf')} disabled={!!ocupado} className="flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-50">
                    <FileDown size={16} /> {ocupado === 'pdf' ? 'Generando…' : 'Descargar PDF'}
                  </button>
                  <button type="button" onClick={() => descargar('word')} disabled={!!ocupado} className="flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-50">
                    <FileDown size={16} /> {ocupado === 'word' ? 'Generando…' : 'Descargar Word'}
                  </button>
                </div>
                <VistaDocumento manual={manual} version={{ ...version, contenido }} contenido={contenido} aprobadas={aprobadas} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navegación inferior */}
      <div className="shrink-0 bg-white border-t border-feisen-borde px-4 sm:px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex items-center gap-2">
        {paso > 0 && <button type="button" onClick={() => irA(paso - 1)} className="flex items-center gap-1.5 min-h-[48px] px-4 rounded-lg border border-feisen-borde text-sm font-medium text-feisen-texto hover:bg-feisen-fondo"><ArrowLeft size={16} /> <span className="hidden sm:inline">Anterior</span></button>}
        <span className="flex-1 text-center text-xs text-feisen-texto-2 lg:hidden">{paso === 0 ? 'Introducción' : paso === FINAL ? 'Revisar y terminar' : `Parte ${paso} de ${partes.length}`}</span>
        <span className="flex-1 hidden lg:block" />
        {paso < FINAL && (
          <button type="button" onClick={() => irA(paso + 1)} className="flex items-center gap-1.5 min-h-[48px] px-5 rounded-lg bg-feisen-azul text-white text-sm font-semibold">
            {paso === 0 ? 'Empezar' : parte && !parte.obligatorio && parteVacia(parte, contenido[parte.clave]) ? 'Saltar' : 'Siguiente'} <ArrowRight size={16} />
          </button>
        )}
        {paso === FINAL && editable && (
          <button type="button" onClick={enviar} disabled={!listo || !!ocupado} className="flex items-center gap-1.5 min-h-[48px] px-5 rounded-lg bg-feisen-azul text-white text-sm font-semibold disabled:opacity-50">
            <Send size={16} /> {ocupado === 'enviar' ? 'Enviando…' : 'Enviar a revisión'}
          </button>
        )}
      </div>
    </Pantalla>
  )
}

function Pantalla({ children }) {
  return <div role="dialog" aria-modal="true" aria-label="Asistente de documentos" className="!mt-0 fixed inset-0 z-50 bg-feisen-fondo flex flex-col">{children}</div>
}

function Icono({ estado }) {
  if (estado === 'lista') return <CheckCircle size={18} weight="fill" className="text-emerald-600 shrink-0" />
  if (estado === 'revisar') return <Circle size={18} weight="fill" className="text-amber-400 shrink-0" />
  if (estado === 'falta') return <Circle size={18} className="text-feisen-rojo shrink-0" />
  if (estado === 'intro') return <Sparkles size={18} className="text-feisen-azul shrink-0" />
  return <Circle size={18} className="text-gray-300 shrink-0" />
}

function BotonPaso({ activo, onClick, estado, texto, n }) {
  return (
    <button type="button" onClick={onClick} aria-current={activo ? 'step' : undefined}
      className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm ${activo ? 'bg-feisen-azul-suave text-feisen-azul font-semibold' : 'text-feisen-texto hover:bg-feisen-fondo'}`}>
      <Icono estado={estado} />
      <span className="truncate">{n ? `${n}. ` : ''}{texto}</span>
    </button>
  )
}

function Revisiones({ checks }) {
  if (!checks.length) return null
  return (
    <ul className="bg-white border border-feisen-borde rounded-xl px-4 py-3 space-y-1.5">
      <li className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Revisión automática</li>
      {checks.map(c => (
        <li key={c.texto} className={`flex items-start gap-2 text-sm ${c.ok ? 'text-feisen-texto' : 'text-amber-800'}`}>
          {c.ok ? <CheckCircle size={17} weight="fill" className="text-emerald-600 shrink-0 mt-px" /> : <Circle size={17} className="text-amber-500 shrink-0 mt-px" />}
          {c.texto}
        </li>
      ))}
    </ul>
  )
}

function PanelAyuda({ parte, vacia, editable, onUsar }) {
  return (
    <div className="space-y-4 bg-white border border-feisen-borde rounded-xl p-4">
      {parte.consejos?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Consejos</p>
          <ul className="space-y-1.5 text-sm text-feisen-texto">{parte.consejos.map(t => <li key={t} className="flex gap-2"><span className="text-feisen-azul">•</span><span>{t}</span></li>)}</ul>
        </div>
      )}
      {parte.ejemplo && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Ejemplo</p>
          <Ejemplo parte={parte} />
          {editable && vacia && (
            <button type="button" onClick={() => onUsar(structuredClone(parte.ejemplo))}
              className="w-full min-h-[40px] rounded-lg border border-feisen-borde text-sm font-medium text-feisen-azul hover:bg-feisen-azul-suave">
              Usar el ejemplo como punto de partida
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Intro({ estructura, manual, conPlantilla }) {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Antes de empezar</p>
        <h1 className="text-2xl font-semibold text-feisen-texto mt-1">Vamos a escribir: {manual.titulo}</h1>
      </div>
      <div className="bg-white border border-feisen-borde rounded-xl p-5 space-y-2">
        <p className="text-sm font-semibold text-feisen-texto">¿Qué es un {estructura.nombre.toLowerCase()}?</p>
        <p className="text-sm text-feisen-texto leading-relaxed">{estructura.que}</p>
        <p className="text-xs text-feisen-texto-2">Tiempo aproximado: {estructura.tiempo}. Puedes dejarlo a medias: se guarda solo y sigues después donde quedaste.</p>
      </div>
      {conPlantilla && (
        <div className="bg-feisen-azul-suave rounded-xl p-5 space-y-1.5">
          <p className="text-sm font-semibold text-feisen-azul">Este documento ya viene adelantado</p>
          <p className="text-sm text-feisen-texto">Partimos de una plantilla pensada para Feisen. Lo que está <b>[entre corchetes]</b> es lo que debes cambiar por la realidad de la planta; el resto, léelo y ajústalo si no es así como se trabaja.</p>
        </div>
      )}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-feisen-texto">Cómo funciona</p>
        <ol className="space-y-3">
          {[
            ['Una pregunta a la vez', `El documento tiene ${estructura.partes.length} partes. Para cada una verás qué va ahí, consejos y un ejemplo.`],
            ['Revisión automática', 'Mientras escribes, la app te avisa si falta algo (por ejemplo, un paso sin responsable).'],
            ['Revisar, descargar y enviar', 'Al final ves el documento como quedará, lo puedes descargar en PDF o Word y lo envías a revisión.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="w-7 h-7 rounded-full bg-feisen-azul text-white text-sm font-semibold grid place-items-center shrink-0">{i + 1}</span>
              <span><b className="block text-sm font-semibold text-feisen-texto">{t}</b><span className="text-sm text-feisen-texto-2">{d}</span></span>
            </li>
          ))}
        </ol>
      </div>
      <div className="bg-white border border-feisen-borde rounded-xl p-5 space-y-1.5">
        <p className="text-sm font-semibold text-feisen-texto">Tres reglas de oro</p>
        <ul className="text-sm text-feisen-texto space-y-1">
          <li>• <b>Escríbelo con quien hace el trabajo</b>, no de memoria desde la oficina.</li>
          <li>• <b>Frases cortas que empiecen con un verbo:</b> «Pesar el material», no «Se procede a realizar el pesaje».</li>
          <li>• <b>Cargos, no nombres:</b> «Almacenista», no «Pedro».</li>
        </ul>
      </div>
    </div>
  )
}
