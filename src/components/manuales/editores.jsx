import { useState } from 'react'
import { Camera, ChevronDown, ChevronUp, Plus, X } from '../shared/iconos'
import { campo, etiquetaCampo } from '../mantenimiento/comun'
import { Diagrama } from './VistaDocumento'
import { MAX_VIDEO_MB, subirMedio, tamanoArchivo, useUrlsMedios } from './comun'

// Editores del asistente de Manuales, uno por tipo de parte (ver estructura.js).
// Todos reciben `valor` y `onCambiar(nuevoValor)`; la tabla y los pasos se muestran como
// tarjetas para que se puedan llenar cómodamente desde el celular.

const botonIcono = 'p-2 rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo hover:text-feisen-texto disabled:opacity-30'
const agregar = 'flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-dashed border-feisen-borde text-sm font-medium text-feisen-azul hover:bg-feisen-azul-suave w-full justify-center'

const mover = (arr, i, d) => { const n = [...arr]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n }

export function EditorTexto({ parte, valor, onCambiar }) {
  return (
    <textarea value={valor || ''} onChange={e => onCambiar(e.target.value)} rows={parte.clave === 'declaracion' ? 7 : 5}
      placeholder={typeof parte.ejemplo === 'string' ? `Ej.: ${parte.ejemplo}` : ''} aria-label={parte.titulo}
      className={`${campo} text-[15px] leading-relaxed min-h-[130px]`} />
  )
}

export function EditorNumero({ parte, valor, onCambiar }) {
  return <input type="number" inputMode="numeric" min={1} max={60} value={valor || ''} onChange={e => onCambiar(e.target.value)} aria-label={parte.titulo} className={`${campo} max-w-[8rem]`} />
}

export function EditorLista({ parte, valor, onCambiar }) {
  const lista = valor || []
  return (
    <div className="space-y-2">
      {lista.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 text-right text-xs text-feisen-texto-2 tabular-nums shrink-0">{i + 1}.</span>
          <input value={t} onChange={e => onCambiar(lista.map((x, j) => j === i ? e.target.value : x))} placeholder={parte.placeholder}
            aria-label={`${parte.titulo} ${i + 1}`} autoFocus={i === lista.length - 1 && !t}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCambiar([...lista, '']) } }} className={campo} />
          <button type="button" onClick={() => onCambiar(lista.filter((_, j) => j !== i))} aria-label="Quitar" className={botonIcono}><X size={16} /></button>
        </div>
      ))}
      <button type="button" onClick={() => onCambiar([...lista, ''])} className={agregar}><Plus size={16} /> Agregar</button>
    </div>
  )
}

function Campo({ col, valor, onCambiar, id, sugerencias }) {
  return (
    <div>
      <label htmlFor={id} className={etiquetaCampo}>{col.titulo}</label>
      {col.largo
        ? <textarea id={id} rows={2} value={valor || ''} onChange={e => onCambiar(e.target.value)} placeholder={col.placeholder} className={campo} />
        : <input id={id} value={valor || ''} onChange={e => onCambiar(e.target.value)} placeholder={col.placeholder} className={campo}
            list={sugerencias?.length ? `${id}-sug` : undefined} />}
      {sugerencias?.length > 0 && <datalist id={`${id}-sug`}>{sugerencias.map(s => <option key={s} value={s} />)}</datalist>}
    </div>
  )
}

export function EditorTabla({ parte, valor, onCambiar }) {
  const filas = valor || []
  const vacia = Object.fromEntries(parte.columnas.map(c => [c.clave, '']))
  const cambiar = (i, k, v) => onCambiar(filas.map((f, j) => j === i ? { ...f, [k]: v } : f))
  return (
    <div className="space-y-3">
      {filas.map((f, i) => (
        <div key={i} className="border border-feisen-borde rounded-xl p-3 bg-white space-y-2.5">
          <div className="flex items-center justify-between -mt-1 -mr-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">{parte.columnas[0].titulo} {i + 1}</span>
            <button type="button" onClick={() => onCambiar(filas.filter((_, j) => j !== i))} aria-label="Quitar" className={botonIcono}><X size={16} /></button>
          </div>
          <div className={parte.columnas.length > 2 ? 'grid sm:grid-cols-2 gap-2.5' : 'space-y-2.5'}>
            {parte.columnas.map(c => (
              <div key={c.clave} className={c.largo && parte.columnas.length > 2 ? 'sm:col-span-2' : ''}>
                <Campo col={c} id={`${parte.clave}-${i}-${c.clave}`} valor={f[c.clave]} onCambiar={v => cambiar(i, c.clave, v)} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onCambiar([...filas, { ...vacia }])} className={agregar}><Plus size={16} /> Agregar {parte.columnas[0].titulo.toLowerCase()}</button>
    </div>
  )
}

// Imagen de un paso: pantallazo de la app o foto de la planta. Se achica antes de subirla.
function ImagenPaso({ imagen, src, manualId, onCambiar, n }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const elegir = async file => {
    if (!file) return
    setSubiendo(true); setError('')
    try { onCambiar(await subirMedio(manualId, file, 'imagen')) } catch (e) { setError(e.message) }
    setSubiendo(false)
  }
  return (
    <div>
      {imagen ? (
        <div className="relative inline-block max-w-full">
          {src ? <img src={src} alt={`Imagen del paso ${n}`} className="max-h-48 max-w-full rounded-lg border border-feisen-borde" /> : <div className="w-40 h-24 rounded-lg bg-gray-100 animate-pulse" />}
          <button type="button" onClick={() => onCambiar(null)} aria-label="Quitar imagen" className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white border border-feisen-borde grid place-items-center text-feisen-texto-2 shadow-sm hover:text-feisen-rojo"><X size={14} /></button>
        </div>
      ) : (
        <label className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-dashed border-feisen-borde text-sm font-medium cursor-pointer ${subiendo ? 'text-feisen-texto-2' : 'text-feisen-azul hover:bg-feisen-azul-suave'}`}>
          <Camera size={16} /> {subiendo ? 'Subiendo…' : 'Agregar imagen (pantallazo o foto)'}
          <input type="file" accept="image/*" className="hidden" disabled={subiendo} onChange={e => elegir(e.target.files?.[0])} />
        </label>
      )}
      {error && <p className="text-xs text-feisen-rojo mt-1">{error}</p>}
    </div>
  )
}

// Paso a paso: actividad, cómo se hace, responsable, registro, si es una decisión (sí/no) e imagen.
// Responsables y registros se sugieren con lo ya escrito en esas partes del documento.
export function EditorPasos({ parte, valor, onCambiar, contenido, manualId }) {
  const pasos = valor || []
  const [verDiagrama, setVerDiagrama] = useState(false)
  const urlDe = useUrlsMedios(contenido)
  const sugerencias = {
    responsables: [...new Set([...(contenido.responsables || []).map(r => r.cargo), ...pasos.map(p => p.responsable)].filter(Boolean))],
    registros: [...new Set([...(contenido.registros || []).map(r => r.nombre), ...pasos.map(p => p.registro)].filter(Boolean))],
  }
  const cambiar = (i, k, v) => onCambiar(pasos.map((p, j) => j === i ? { ...p, [k]: v } : p))
  const conRegistro = parte.columnas.some(c => c.clave === 'registro')
  return (
    <div className="space-y-3">
      {pasos.map((p, i) => (
        <div key={i} className={`border rounded-xl p-3 bg-white space-y-2.5 ${p.decision ? 'border-amber-300' : 'border-feisen-borde'}`}>
          <div className="flex items-center gap-1 -mt-1 -mr-1">
            <span className={`text-xs font-semibold uppercase tracking-wide flex-1 ${p.decision ? 'text-amber-700' : 'text-feisen-texto-2'}`}>
              Paso {i + 1}{p.decision ? ' · decisión' : ''}
            </span>
            <button type="button" onClick={() => onCambiar(mover(pasos, i, -1))} disabled={i === 0} aria-label="Subir" className={botonIcono}><ChevronUp size={16} /></button>
            <button type="button" onClick={() => onCambiar(mover(pasos, i, 1))} disabled={i === pasos.length - 1} aria-label="Bajar" className={botonIcono}><ChevronDown size={16} /></button>
            <button type="button" onClick={() => onCambiar(pasos.filter((_, j) => j !== i))} aria-label="Quitar paso" className={botonIcono}><X size={16} /></button>
          </div>
          <Campo col={{ ...parte.columnas[0], titulo: p.decision ? 'Pregunta' : 'Actividad', placeholder: p.decision ? '¿El material cumple?' : parte.columnas[0].placeholder }}
            id={`paso-${i}-actividad`} valor={p.actividad} onCambiar={v => cambiar(i, 'actividad', v)} />
          <Campo col={parte.columnas[1]} id={`paso-${i}-detalle`} valor={p.detalle} onCambiar={v => cambiar(i, 'detalle', v)} />
          <div className={conRegistro ? 'grid sm:grid-cols-2 gap-2.5' : ''}>
            <Campo col={parte.columnas[2]} id={`paso-${i}-responsable`} valor={p.responsable} onCambiar={v => cambiar(i, 'responsable', v)} sugerencias={sugerencias.responsables} />
            {conRegistro && <Campo col={parte.columnas[3]} id={`paso-${i}-registro`} valor={p.registro} onCambiar={v => cambiar(i, 'registro', v)} sugerencias={sugerencias.registros} />}
          </div>
          <label className="flex items-start gap-2.5 text-sm text-feisen-texto cursor-pointer min-h-[32px]">
            <input type="checkbox" checked={!!p.decision} onChange={e => cambiar(i, 'decision', e.target.checked)} className="mt-0.5 w-4 h-4 accent-feisen-azul" />
            <span>Es una pregunta de sí o no<span className="block text-xs text-feisen-texto-2">Por ejemplo: «¿El material cumple?». En el diagrama sale como rombo.</span></span>
          </label>
          {p.decision && (
            <Campo col={{ titulo: '¿Qué se hace si la respuesta es NO?', placeholder: 'Separar el material y avisar a Logística', largo: true }}
              id={`paso-${i}-sino`} valor={p.siNo} onCambiar={v => cambiar(i, 'siNo', v)} />
          )}
          <ImagenPaso imagen={p.imagen} src={urlDe(p.imagen)} manualId={manualId} n={i + 1} onCambiar={img => cambiar(i, 'imagen', img || undefined)} />
        </div>
      ))}
      <button type="button" onClick={() => onCambiar([...pasos, { actividad: '', detalle: '', responsable: '', registro: '' }])} className={agregar}>
        <Plus size={16} /> Agregar paso
      </button>
      {pasos.some(p => p.actividad) && (
        <div className="border border-feisen-borde rounded-xl bg-white">
          <button type="button" onClick={() => setVerDiagrama(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-feisen-texto">
            Diagrama de flujo (se arma solo con los pasos) {verDiagrama ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {verDiagrama && <div className="px-3 pb-3"><Diagrama pasos={pasos} /></div>}
        </div>
      )}
    </div>
  )
}

// Video del documento (uno solo). Se sube tal cual: máximo MAX_VIDEO_MB.
export function EditorVideo({ valor, onCambiar, contenido, manualId }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const urlDe = useUrlsMedios(contenido)
  const elegir = async file => {
    if (!file) return
    setSubiendo(true); setError('')
    try { onCambiar(await subirMedio(manualId, file, 'video')) } catch (e) { setError(e.message) }
    setSubiendo(false)
  }
  return (
    <div className="space-y-2">
      {valor ? (
        <div className="space-y-2">
          {urlDe(valor) ? <video src={urlDe(valor)} controls preload="metadata" className="w-full max-h-80 rounded-xl bg-black" /> : <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />}
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-feisen-texto-2">{valor.nombre} · {tamanoArchivo(valor.tamano)}</span>
            <button type="button" onClick={() => onCambiar(null)} className="text-feisen-rojo hover:underline shrink-0">Quitar video</button>
          </div>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center gap-1 min-h-[120px] rounded-xl border-2 border-dashed border-feisen-borde text-sm cursor-pointer ${subiendo ? 'text-feisen-texto-2' : 'text-feisen-azul hover:bg-feisen-azul-suave'}`}>
          <Camera size={22} />
          <span className="font-medium">{subiendo ? 'Subiendo el video… no cierres esta pantalla' : 'Elegir o grabar un video'}</span>
          <span className="text-xs text-feisen-texto-2">MP4 o MOV, máximo {MAX_VIDEO_MB} MB</span>
          <input type="file" accept="video/*" className="hidden" disabled={subiendo} onChange={e => elegir(e.target.files?.[0])} />
        </label>
      )}
      {error && <p className="text-sm text-feisen-rojo">{error}</p>}
    </div>
  )
}

export const EDITOR = { texto: EditorTexto, numero: EditorNumero, lista: EditorLista, tabla: EditorTabla, pasos: EditorPasos, video: EditorVideo }

// Ejemplo de una parte, como se vería ya escrito
export function Ejemplo({ parte }) {
  const e = parte.ejemplo
  if (!e) return null
  if (typeof e === 'string') return <p className="text-sm text-feisen-texto italic leading-relaxed">«{e}»</p>
  if (parte.editor === 'lista') return <ul className="list-disc pl-5 text-sm text-feisen-texto space-y-0.5">{e.map(t => <li key={t}>{t}</li>)}</ul>
  if (parte.editor === 'pasos') return (
    <ol className="text-sm text-feisen-texto space-y-1.5">
      {e.map((p, i) => <li key={i}><b className="font-semibold">{i + 1}. {p.actividad}</b> <span className="text-feisen-texto-2">· {p.responsable}</span>{p.decision && <span className="block text-xs text-amber-700">Si NO: {p.siNo}</span>}</li>)}
    </ol>
  )
  return (
    <ul className="text-sm text-feisen-texto space-y-1.5">
      {e.map((f, i) => <li key={i}>{parte.columnas.map((c, j) => j === 0 ? <b key={c.clave} className="font-semibold">{f[c.clave]}</b> : f[c.clave] ? <span key={c.clave} className="text-feisen-texto-2"> · {f[c.clave]}</span> : null)}</li>)}
    </ul>
  )
}
