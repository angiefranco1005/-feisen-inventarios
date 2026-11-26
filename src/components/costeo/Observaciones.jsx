import { useEffect, useState } from 'react'
import { Check, MessageSquare, RotateCcw, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatFecha } from '../../utils/formatters'

// Observaciones de una pieza / conjunto / máquina de costeo (Angie, 2026-11-26): notas "para tener
// en cuenta" (ej. «El cono a veces sale torcido del rolado, revisar antes de soldar").
// Tabla costeo_ficha_observaciones. Las resueltas no se borran: quedan bajo «Ver resueltas (n)».
// Los conteos de abiertas (arbol.observaciones) los carga cargarArbol; al cambiar algo se llama
// onCambio para que el ícono de la cuadrícula se actualice.

// Ícono pequeño con el número de observaciones abiertas; no pinta nada si no hay.
export function IndicadorObservaciones({ n }) {
  if (!(n > 0)) return null
  const texto = n === 1 ? '1 observación' : `${n} observaciones`
  return (
    <span title={texto} aria-label={texto} role="img" className="inline-flex items-center gap-0.5 shrink-0 align-middle text-xs font-normal tabular-nums text-feisen-azul">
      <MessageSquare size={13} aria-hidden="true" />
      {n}
    </span>
  )
}

export default function Observaciones({ fichaId, onCambio }) {
  const { perfil } = useAuth()
  const [lista, setLista] = useState(null)
  const [texto, setTexto] = useState('')
  const [verResueltas, setVerResueltas] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    const { data, error: e } = await supabase
      .from('costeo_ficha_observaciones')
      .select('*')
      .eq('ficha_id', fichaId)
      .order('created_at', { ascending: false })
    if (e) setError('No se pudieron cargar las observaciones: ' + e.message)
    setLista(data || [])
  }

  useEffect(() => {
    setLista(null)
    setTexto('')
    setVerResueltas(false)
    setError('')
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId])

  async function agregar() {
    const t = texto.trim()
    if (!t || guardando) return
    setGuardando(true)
    setError('')
    const { error: e } = await supabase
      .from('costeo_ficha_observaciones')
      .insert({ ficha_id: fichaId, texto: t, autor_nombre: perfil?.nombre || null })
    setGuardando(false)
    if (e) return setError('No se pudo guardar: ' + e.message)
    setTexto('')
    await cargar()
    onCambio?.()
  }

  async function marcar(o, resuelta) {
    setError('')
    const { error: e } = await supabase.from('costeo_ficha_observaciones').update({ resuelta }).eq('id', o.id)
    if (e) return setError('No se pudo actualizar: ' + e.message)
    await cargar()
    onCambio?.()
  }

  async function borrar(o) {
    if (!window.confirm('¿Borrar esta observación? No se puede deshacer.')) return
    setError('')
    const { error: e } = await supabase.from('costeo_ficha_observaciones').delete().eq('id', o.id)
    if (e) return setError('No se pudo borrar: ' + e.message)
    await cargar()
    if (!o.resuelta) onCambio?.()
  }

  const abiertas = (lista || []).filter((o) => !o.resuelta)
  const resueltas = (lista || []).filter((o) => o.resuelta)

  return (
    <div className="mt-7">
      <div className="flex items-center h-8">
        <h4 className="text-[11px] font-medium uppercase tracking-[0.06em] text-feisen-texto-2">Observaciones</h4>
        {abiertas.length > 0 && <span className="ml-auto text-xs text-feisen-texto-2">{abiertas.length} sin resolver</span>}
      </div>

      {lista === null ? (
        <p className="text-sm text-feisen-texto-2 py-2">Cargando…</p>
      ) : (
        <>
          {abiertas.length > 0 && (
            <ul className="divide-y divide-feisen-borde-suave">
              {abiertas.map((o) => (
                <Nota key={o.id} o={o} onMarcar={marcar} onBorrar={borrar} />
              ))}
            </ul>
          )}
          {!abiertas.length && !resueltas.length && (
            <p className="text-sm text-feisen-texto-2 py-1">Anota lo que hay que tener en cuenta con esta pieza.</p>
          )}
          {resueltas.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setVerResueltas((v) => !v)}
                aria-expanded={verResueltas}
                className="h-9 px-2 -ml-2 rounded-lg text-xs text-feisen-azul hover:bg-feisen-azul-suave"
              >
                {verResueltas ? 'Ocultar resueltas' : `Ver resueltas (${resueltas.length})`}
              </button>
              {verResueltas && (
                <ul className="divide-y divide-feisen-borde-suave">
                  {resueltas.map((o) => (
                    <Nota key={o.id} o={o} onMarcar={marcar} onBorrar={borrar} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-3">
        <label htmlFor={`obs-${fichaId}`} className="sr-only">Nueva observación</label>
        <textarea
          id={`obs-${fichaId}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && agregar()}
          rows={2}
          placeholder="Ej. El cono a veces sale torcido del rolado, revisar antes de soldar"
          className="w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm text-feisen-texto outline-none focus:border-feisen-azul bg-white resize-y"
        />
        <div className="flex justify-end mt-1.5">
          <button
            type="button"
            onClick={agregar}
            disabled={!texto.trim() || guardando}
            className="h-10 rounded-lg bg-feisen-azul px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-feisen-rojo mt-2">{error}</p>}
    </div>
  )
}

function Nota({ o, onMarcar, onBorrar }) {
  return (
    <li className="flex items-start gap-1 py-2">
      <div className="flex-1 min-w-0">
        <p className={`text-sm whitespace-pre-wrap break-words ${o.resuelta ? 'text-feisen-gris-medio line-through' : 'text-feisen-texto'}`}>{o.texto}</p>
        <p className="text-xs text-feisen-texto-2 mt-0.5">
          {formatFecha(o.created_at)}
          {o.autor_nombre ? ` · ${o.autor_nombre}` : ''}
          {o.resuelta ? ' · Resuelta' : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onMarcar(o, !o.resuelta)}
        title={o.resuelta ? 'Volver a abrir' : 'Marcar resuelta'}
        aria-label={o.resuelta ? 'Volver a abrir' : 'Marcar resuelta'}
        className="w-10 h-10 shrink-0 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo hover:text-feisen-azul"
      >
        {o.resuelta ? <RotateCcw size={15} /> : <Check size={16} />}
      </button>
      <button
        type="button"
        onClick={() => onBorrar(o)}
        title="Borrar"
        aria-label="Borrar observación"
        className="w-10 h-10 shrink-0 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-rojo-suave hover:text-feisen-rojo"
      >
        <Trash2 size={15} />
      </button>
    </li>
  )
}
