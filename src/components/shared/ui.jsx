// Piezas visuales comunes del rediseño (skill ux-feisen): encabezado de página,
// selector segmentado, contador − / +, panel lateral de detalle y aviso que se
// cierra solo. Usan solo los colores feisen-* para que todas las pantallas se vean igual.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, X } from './iconos'

export function EncabezadoPagina({ modulo, titulo, subtitulo, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {modulo && <p className="text-xs text-gray-400">{modulo}</p>}
        <h1 className="text-xl font-semibold text-feisen-texto">{titulo}</h1>
        {subtitulo && <div className="text-sm text-feisen-texto-2 mt-0.5">{subtitulo}</div>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

export function ChipBodega({ children }) {
  return <span className="inline-block bg-feisen-azul-suave text-feisen-azul font-semibold text-xs px-2 py-0.5 rounded-md">{children}</span>
}

// Botones grandes de opción única (Salida / Entrada, tipo de salida…)
export function Segmentado({ opciones, valor, onCambiar, grande = false }) {
  return (
    <div role="group" className="grid gap-1 bg-white border border-feisen-borde rounded-xl p-1"
      style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}>
      {opciones.map(o => {
        const activo = valor === o.valor
        const Icono = o.icono
        return (
          <button key={o.valor} type="button" aria-pressed={activo} onClick={() => onCambiar(o.valor)}
            className={`flex items-center justify-center gap-2 rounded-lg px-2 font-semibold transition-colors active:scale-[.98]
              ${grande ? 'min-h-[48px] text-[15px]' : 'min-h-[42px] text-sm'}
              ${activo ? 'bg-feisen-azul-suave text-feisen-azul' : 'text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
            {Icono && <Icono size={grande ? 18 : 16} />}
            <span className="truncate">{o.texto}</span>
          </button>
        )
      })}
    </div>
  )
}

// Cantidad con − / + y campo editable. `valor` es texto (como los inputs del formulario).
export function Contador({ valor, onCambiar, min = 0, paso = 1, etiqueta = 'Cantidad', ancho = 'w-16' }) {
  const n = parseFloat(String(valor).replace(',', '.')) || 0
  const fijar = v => onCambiar(String(Math.round(Math.max(min, v) * 1000) / 1000))
  return (
    <div className="inline-flex items-center border border-feisen-borde rounded-lg bg-white overflow-hidden shrink-0">
      <button type="button" aria-label={`Menos ${etiqueta.toLowerCase()}`} onClick={() => fijar(n - paso)}
        className="w-11 h-11 grid place-items-center text-xl text-feisen-texto-2 active:bg-feisen-fondo">−</button>
      <input inputMode="decimal" aria-label={etiqueta} value={valor}
        onChange={e => onCambiar(e.target.value)}
        onFocus={e => e.target.select()}
        className={`${ancho} h-11 text-center font-semibold tabular-nums border-x border-feisen-borde-suave focus:outline-none focus:bg-feisen-azul-suave`} />
      <button type="button" aria-label={`Más ${etiqueta.toLowerCase()}`} onClick={() => fijar(n + paso)}
        className="w-11 h-11 grid place-items-center text-xl text-feisen-texto-2 active:bg-feisen-fondo">+</button>
    </div>
  )
}

// Panel lateral (drawer): a la derecha en escritorio, pantalla completa en celular.
// Se cierra con Esc, con la X o tocando fuera. Entra deslizando.
export function PanelLateral({ etiqueta, encabezado, onCerrar, children }) {
  const [visible, setVisible] = useState(false)
  const cerrarRef = useRef(null)
  const onCerrarRef = useRef(onCerrar)
  onCerrarRef.current = onCerrar
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    cerrarRef.current?.focus()
    // Con un modal abierto encima (z-50), Esc lo maneja el modal, no el panel
    const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.z-50.fixed.inset-0')) onCerrarRef.current() }
    window.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(t); window.removeEventListener('keydown', onKey) }
  }, [])

  return (
    <>
      <div onClick={onCerrar}
        className={`!mt-0 fixed inset-0 z-40 bg-slate-900/25 transition-opacity duration-200 motion-reduce:transition-none ${visible ? 'opacity-100' : 'opacity-0'}`} />
      <aside role="dialog" aria-modal="true" aria-label={etiqueta}
        className={`!mt-0 fixed z-40 inset-0 sm:inset-auto sm:top-0 sm:right-0 sm:bottom-0 sm:w-[460px] bg-white sm:border-l border-feisen-borde shadow-xl flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none ${visible ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-start gap-2 px-5 pt-4 pb-3 border-b border-feisen-borde-suave">
          <div className="flex-1 min-w-0">{encabezado}</div>
          <button ref={cerrarRef} type="button" onClick={onCerrar} aria-label="Cerrar"
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-feisen-fondo rounded-lg">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">{children}</div>
      </aside>
    </>
  )
}

// Aviso corto abajo que se cierra solo (para confirmar algo que el usuario hizo).
// Uso: const [aviso, avisar] = useAviso(); avisar('Salida registrada', { texto: 'Ver', alHacer: fn }); {aviso}
export function useAviso() {
  const [datos, setDatos] = useState(null)
  const [visible, setVisible] = useState(false)
  const timer = useRef(null)

  const avisar = useCallback((texto, accion = null, ms = 4500) => {
    clearTimeout(timer.current)
    setDatos({ texto, accion, id: Date.now() })
    requestAnimationFrame(() => setVisible(true))
    timer.current = setTimeout(() => setVisible(false), ms)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  const el = datos && (
    <div role="status" aria-live="polite"
      className={`!mt-0 fixed left-1/2 -translate-x-1/2 bottom-[calc(10rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-24 z-50 max-w-[calc(100%-2rem)] w-max
        flex items-center gap-3 bg-feisen-texto text-white rounded-xl shadow-lg pl-4 pr-3 py-3 text-sm
        transition-all duration-200 motion-reduce:transition-none ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}>
      <span className="w-5 h-5 rounded-full bg-emerald-600 grid place-items-center shrink-0"><Check size={12} strokeWidth={3} /></span>
      <span>{datos.texto}</span>
      {datos.accion && (
        <button type="button" onClick={() => { setVisible(false); datos.accion.alHacer() }}
          className="font-semibold underline underline-offset-2 opacity-90 hover:opacity-100 px-1">
          {datos.accion.texto}
        </button>
      )}
    </div>
  )
  return [el, avisar]
}

// Enfoca un buscador con la tecla "/" (cuando no se está escribiendo en otro campo).
export function useAtajoBuscar(ref) {
  useEffect(() => {
    const onKey = e => {
      if (e.key !== '/' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return
      e.preventDefault(); ref.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ref])
}
