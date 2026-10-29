import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { cargarConsumo, minimoSugerido, DIAS_CONSUMO } from '../../utils/consumo'
import { X, ArrowUpDown, Edit2, ToggleLeft, ToggleRight, Trash2, Package } from '../shared/iconos'

const cop  = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const cant = n => Number(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })
const fechaCorta = f => f ? new Date(f.length === 10 ? f + 'T12:00:00' : f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const ESTADOS = {
  agotado: { texto: 'Agotado',        clase: 'bg-feisen-rojo-suave text-feisen-rojo' },
  bajo:    { texto: 'Bajo el mínimo', clase: 'bg-amber-50 text-amber-700' },
  sinmin:  { texto: 'Sin mínimo',     clase: 'bg-gray-100 text-feisen-texto-2' },
  ok:      { texto: 'Normal',         clase: 'bg-emerald-50 text-emerald-700' },
  inactivo:{ texto: 'Inactivo',       clase: 'bg-gray-100 text-gray-400' },
}

export function colorNivel(estado) {
  return estado === 'agotado' ? 'bg-feisen-rojo' : estado === 'bajo' ? 'bg-amber-500' : 'bg-feisen-azul'
}

// Panel lateral con el detalle del producto: existencia, niveles de reposición,
// últimos movimientos y acciones. En celular ocupa toda la pantalla.
export default function DetalleProducto({
  item, existencia, estado, bodegasVisibles, nombreBodega, verValor, verCosto,
  puedeEditar, puedeBorrar, onCerrar, onEditar, onToggleActivo, onEliminar, onNivelesGuardados,
}) {
  const navigate = useNavigate()
  const [movs, setMovs]         = useState(null)
  const [consumo, setConsumo]   = useState(null)
  const [minimo, setMinimo]     = useState(String(item.stock_minimo || ''))
  const [maximo, setMaximo]     = useState(String(item.stock_maximo || ''))
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso]       = useState(null)

  useEffect(() => {
    setMinimo(String(Number(item.stock_minimo) || ''))
    setMaximo(String(Number(item.stock_maximo) || ''))
    setAviso(null)
    setMovs(null); setConsumo(null)
    let q = supabase.from('movimientos')
      .select('id, numero, tipo, cantidad, created_at, fecha_movimiento, motivo, referencia, revertido, bodega_origen_id, bodega_destino_id')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(5)
    if (bodegasVisibles) {
      const ids = bodegasVisibles.join(',')
      q = q.or(`bodega_origen_id.in.(${ids}),bodega_destino_id.in.(${ids})`)
    }
    q.then(({ data }) => setMovs(data || []))
    cargarConsumo({ itemIds: [item.id], bodegas: bodegasVisibles })
      .then(({ porItem }) => setConsumo(porItem[item.id] || 0))
  }, [item.id])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const sugerido = minimoSugerido(consumo)
  const min = Number(item.stock_minimo) || 0
  const tope = Math.max(Number(item.stock_maximo) || 0, (min || sugerido || 0) * 3, existencia ?? 0, 1)
  const cambiaronNiveles = (Number(minimo) || 0) !== min || (Number(maximo) || 0) !== (Number(item.stock_maximo) || 0)

  async function guardarNiveles() {
    const nMin = Number(minimo) || 0, nMax = Number(maximo) || 0
    if (nMax > 0 && nMin > nMax) { setAviso({ tipo: 'error', texto: 'El mínimo no puede ser mayor que el máximo.' }); return }
    setGuardando(true)
    const { error } = await supabase.from('items')
      .update({ stock_minimo: nMin, stock_maximo: nMax, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    setGuardando(false)
    if (error) { setAviso({ tipo: 'error', texto: 'No se pudieron guardar los niveles: ' + error.message }); return }
    setAviso({ tipo: 'exito', texto: 'Niveles guardados.' })
    onNivelesGuardados?.(item.id, nMin, nMax)
  }

  const est = ESTADOS[estado]
  // Existencias por bodega (solo si el usuario ve más de una bodega)
  const filasBodega = (item.stock || []).filter(s => !bodegasVisibles || bodegasVisibles.includes(s.bodega_id))

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/25" onClick={onCerrar} />
      <aside role="dialog" aria-modal="true" aria-label={`Detalle de ${item.nombre}`}
        className="fixed z-50 inset-0 sm:inset-auto sm:top-0 sm:right-0 sm:bottom-0 sm:w-[440px] bg-white sm:border-l border-feisen-borde shadow-xl flex flex-col">
        {/* Encabezado */}
        <div className="px-5 pt-4 pb-3 border-b border-feisen-borde-suave space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {item.foto_url
                ? <img src={item.foto_url} alt="" className="w-11 h-11 rounded-lg object-cover border border-feisen-borde flex-shrink-0" />
                : <div className="w-11 h-11 rounded-lg bg-feisen-fondo flex items-center justify-center flex-shrink-0"><Package size={18} className="text-gray-400" /></div>}
              <h3 className="font-semibold text-feisen-texto text-base leading-snug break-words">{item.nombre}</h3>
            </div>
            <button onClick={onCerrar} aria-label="Cerrar" className="p-1.5 -mr-1 text-gray-400 hover:text-gray-600 hover:bg-feisen-fondo rounded-lg flex-shrink-0">
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${est.clase}`}>{est.texto}</span>
            {item.bodegas?.nombre && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 text-feisen-texto-2">{item.bodegas.nombre}</span>}
            {item.categorias?.nombre && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 text-feisen-texto-2">{item.categorias.nombre}</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Existencia */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Existencia</h4>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-feisen-texto tabular-nums">{existencia === null ? '—' : cant(existencia)}</span>
              <span className="text-sm text-feisen-texto-2">
                {item.unidad_medida}{verValor && item.precio_costo > 0 && existencia ? ` · ${cop(existencia * item.precio_costo)}` : ''}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-feisen-borde-suave mt-3">
              <div className={`absolute inset-y-0 left-0 rounded-full ${colorNivel(estado)}`} style={{ width: `${Math.min(100, ((existencia || 0) / tope) * 100)}%` }} />
              {min > 0 && <div className="absolute -top-1 -bottom-1 w-0.5 bg-amber-500" style={{ left: `${Math.min(100, (min / tope) * 100)}%` }} />}
            </div>
            <div className="flex justify-between text-[11px] text-gray-400 mt-1 tabular-nums">
              <span>0</span><span>{min > 0 ? `Mínimo ${cant(min)}` : 'Sin mínimo'}</span><span>{cant(tope)}</span>
            </div>
            {filasBodega.length > 1 && (
              <div className="mt-3 divide-y divide-feisen-borde-suave border border-feisen-borde-suave rounded-lg">
                {filasBodega.map(s => (
                  <div key={s.bodega_id} className="flex justify-between px-3 py-1.5 text-sm">
                    <span className="text-feisen-texto-2">{nombreBodega(s.bodega_id)}</span>
                    <span className="font-medium tabular-nums">{cant(s.cantidad_actual)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Niveles */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Niveles de reposición</h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-feisen-texto-2 space-y-1">
                <span>Mínimo</span>
                <input type="number" min="0" step="any" inputMode="decimal" value={minimo} disabled={!puedeEditar}
                  onChange={e => setMinimo(e.target.value)} placeholder="—"
                  className="w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm bg-feisen-fondo tabular-nums focus:outline-none focus:ring-2 focus:ring-feisen-azul disabled:opacity-60" />
              </label>
              <label className="text-xs text-feisen-texto-2 space-y-1">
                <span>Máximo</span>
                <input type="number" min="0" step="any" inputMode="decimal" value={maximo} disabled={!puedeEditar}
                  onChange={e => setMaximo(e.target.value)} placeholder="—"
                  className="w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm bg-feisen-fondo tabular-nums focus:outline-none focus:ring-2 focus:ring-feisen-azul disabled:opacity-60" />
              </label>
            </div>
            {consumo === null ? (
              <p className="text-xs text-gray-400 mt-2">Calculando consumo…</p>
            ) : sugerido ? (
              <div className="mt-2 flex items-center gap-3 bg-feisen-azul-suave rounded-lg px-3 py-2 text-xs text-feisen-texto">
                <p className="flex-1">Salidas de los últimos {DIAS_CONSUMO} días: <b className="tabular-nums">{cant(consumo)} {item.unidad_medida}</b>. Mínimo sugerido: <b className="tabular-nums">{cant(sugerido)}</b>.</p>
                {puedeEditar && Number(minimo) !== sugerido && (
                  <button onClick={() => setMinimo(String(sugerido))} className="text-feisen-azul font-semibold hover:underline">Usar</button>
                )}
              </div>
            ) : (
              <p className="mt-2 bg-feisen-fondo rounded-lg px-3 py-2 text-xs text-feisen-texto-2">
                Sin salidas en {DIAS_CONSUMO} días. Si este producto ya no se usa, considera desactivarlo.
              </p>
            )}
            {aviso && <p className={`text-xs mt-2 ${aviso.tipo === 'error' ? 'text-feisen-rojo' : 'text-emerald-700'}`}>{aviso.texto}</p>}
            {puedeEditar && cambiaronNiveles && (
              <button onClick={guardarNiveles} disabled={guardando}
                className="mt-2 w-full bg-feisen-azul text-white rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar niveles'}
              </button>
            )}
          </section>

          {/* Movimientos */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Últimos movimientos</h4>
            {movs === null ? (
              <p className="text-xs text-gray-400">Cargando…</p>
            ) : movs.length === 0 ? (
              <p className="text-sm text-feisen-texto-2">Este producto no ha tenido movimientos.</p>
            ) : (
              <div className="divide-y divide-feisen-borde-suave">
                {movs.map(m => {
                  const entrada = m.tipo === 'entrada'
                  const traslado = m.bodega_origen_id && m.bodega_destino_id
                  const detalle = traslado
                    ? `${nombreBodega(m.bodega_origen_id)} → ${nombreBodega(m.bodega_destino_id)}`
                    : (m.motivo || m.referencia || (entrada ? 'Entrada' : 'Salida'))
                  return (
                    <div key={m.id} className={`flex items-center gap-3 py-2 ${m.revertido ? 'opacity-40' : ''}`}>
                      <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0 ${entrada ? 'bg-emerald-50 text-emerald-700' : 'bg-feisen-rojo-suave text-feisen-rojo'}`}>
                        {entrada ? '+' : '−'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-feisen-texto truncate">{m.numero ? `${m.numero} · ` : ''}{detalle}</p>
                        <p className="text-[11px] text-gray-400">{fechaCorta(m.fecha_movimiento || m.created_at)}{m.revertido ? ' · revertido' : ''}</p>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${entrada ? 'text-emerald-700' : 'text-feisen-texto'}`}>
                        {entrada ? '+' : '−'}{cant(Math.abs(m.cantidad))}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={() => navigate(`/movimientos?item=${item.id}`)} className="mt-2 text-sm font-medium text-feisen-azul hover:underline">
              Ver historial completo →
            </button>
          </section>

          {/* Datos */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Datos del producto</h4>
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-gray-400">Unidad</dt><dd>{item.unidad_medida}</dd>
              <dt className="text-gray-400">Categoría</dt><dd>{item.categorias?.nombre || '—'}</dd>
              {verCosto && <><dt className="text-gray-400">Costo unitario</dt><dd className="tabular-nums">{item.precio_costo > 0 ? cop(item.precio_costo) : <span className="text-amber-600">Sin precio</span>}</dd></>}
              {item.peso_unitario && <><dt className="text-gray-400">Peso</dt><dd className="tabular-nums">{Number(item.peso_unitario)} kg/und</dd></>}
            </dl>
          </section>
        </div>

        {/* Acciones */}
        <div className="px-5 py-3 border-t border-feisen-borde-suave flex flex-wrap items-center gap-2"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          {puedeEditar && (
            <>
              <button onClick={onEditar} title="Editar" className="p-2 border border-feisen-borde rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo"><Edit2 size={16} /></button>
              <button onClick={onToggleActivo} title={item.activo ? 'Desactivar' : 'Activar'}
                className="p-2 border border-feisen-borde rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo">
                {item.activo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              </button>
              {puedeBorrar && (
                <button onClick={onEliminar} title="Eliminar" className="p-2 border border-feisen-borde rounded-lg text-gray-400 hover:text-feisen-rojo hover:bg-feisen-rojo-suave"><Trash2 size={16} /></button>
              )}
            </>
          )}
          <button onClick={() => navigate('/movimientos/nuevo')}
            className="ml-auto flex items-center gap-2 bg-feisen-azul text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
            <ArrowUpDown size={15} /> Registrar movimiento
          </button>
        </div>
      </aside>
    </>
  )
}
