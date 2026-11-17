import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../shared/Modal'
import { Estrellas, PREGUNTAS, SIGNIFICADO } from '../compras/evaluacion'

// Evaluar al proveedor de cada orden de compra de un pedido ya recibido o cerrado.
// Un pedido puede tener varias OC (varios proveedores): se califica cada una por separado.
export default function ModalEvaluarProveedor({ pedido, ordenes, onCerrar, onGuardado }) {
  const { perfil } = useAuth()
  const [f, setF] = useState(() => Object.fromEntries(ordenes.map(o => [o.id, { calidad: 0, cumplimiento: 0, precio: 0, hubo_problema: null, problema: '' }])))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const cambiar = (oc, k, v) => setF(prev => ({ ...prev, [oc]: { ...prev[oc], [k]: v } }))

  const llegada = pedido.fecha_estimada_llegada
  const recibido = pedido.fecha_recibido?.slice(0, 10)
  const fechaCorta = d => d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : null

  const guardar = async () => {
    for (const o of ordenes) {
      const e = f[o.id]
      const quien = o.proveedores?.nombre || o.numero
      if (PREGUNTAS.some(q => !e[q.clave])) { setError(`Falta calificar las tres preguntas de ${quien}.`); return }
      if (e.hubo_problema === null) { setError(`Indica si hubo algún problema con ${quien}.`); return }
      if (e.hubo_problema && !e.problema.trim()) { setError(`Cuenta qué problema hubo con ${quien}.`); return }
    }
    setGuardando(true); setError('')
    const filas = ordenes.map(o => ({
      proveedor_id: o.proveedor_id, orden_compra_id: o.id, pedido_id: pedido.id,
      calidad: f[o.id].calidad, cumplimiento: f[o.id].cumplimiento, precio: f[o.id].precio,
      hubo_problema: f[o.id].hubo_problema, problema: f[o.id].hubo_problema ? f[o.id].problema.trim() : null, evaluado_por: perfil?.id,
    }))
    const { error: err } = await supabase.from('proveedor_evaluaciones').insert(filas)
    setGuardando(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Esta orden de compra ya se había evaluado. Recarga la página.' : err.message); return }
    onGuardado(ordenes.length === 1 ? `${ordenes[0].proveedores?.nombre || 'Proveedor'} evaluado` : `${ordenes.length} proveedores evaluados`)
  }

  return (
    <Modal titulo={`Evaluar proveedor — ${pedido.numero}`} onCerrar={onCerrar}>
      <div className="space-y-5">
        <p className="text-sm text-feisen-texto-2">Califica cómo le fue a este pedido. La evaluación queda en la ficha del proveedor y sirve para decidir a quién seguirle comprando.</p>
        {ordenes.map(o => {
          const e = f[o.id]
          return (
            <section key={o.id} className="space-y-4 border border-feisen-borde rounded-xl p-4">
              <div>
                <p className="font-semibold text-feisen-texto">{o.proveedores?.nombre || 'Proveedor'}</p>
                <p className="text-xs text-feisen-texto-2">{o.numero}{llegada ? ` · prometió llegar el ${fechaCorta(llegada)}` : ''}{recibido ? ` · se recibió el ${fechaCorta(recibido)}` : ''}</p>
              </div>
              {PREGUNTAS.map(q => (
                <div key={q.clave}>
                  <p className="text-sm font-medium text-feisen-texto">{q.titulo}</p>
                  <p className="text-xs text-feisen-texto-2">{q.ayuda}</p>
                  <div className="flex flex-wrap items-center gap-x-3 -ml-1.5">
                    <Estrellas valor={e[q.clave]} onCambiar={v => cambiar(o.id, q.clave, v)} etiqueta={`${q.titulo} de ${o.proveedores?.nombre || o.numero}`} />
                    <span className="text-sm text-feisen-texto-2 min-w-[5rem]">{SIGNIFICADO[e[q.clave]]}</span>
                  </div>
                </div>
              ))}
              <div>
                <p className="text-sm font-medium text-feisen-texto">¿Hubo algún problema con el pedido?</p>
                <div className="mt-1.5 grid grid-cols-2 gap-2 max-w-xs">
                  {[[false, 'No'], [true, 'Sí']].map(([v, t]) => (
                    <button key={t} type="button" aria-pressed={e.hubo_problema === v} onClick={() => cambiar(o.id, 'hubo_problema', v)}
                      className={`min-h-[44px] rounded-lg border text-sm font-medium ${e.hubo_problema === v ? (v ? 'bg-feisen-rojo-suave border-feisen-rojo text-feisen-rojo' : 'bg-feisen-azul-suave border-feisen-azul text-feisen-azul') : 'bg-white border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                {e.hubo_problema && (
                  <textarea rows={2} value={e.problema} onChange={ev => cambiar(o.id, 'problema', ev.target.value)} autoFocus
                    placeholder="Qué pasó: llegó incompleto, sin certificado, mal facturado, otro material…" aria-label="Qué problema hubo"
                    className="mt-2 w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-sm focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
                )}
              </div>
            </section>
          )
        })}
        {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="min-h-[44px] px-4 rounded-lg border border-feisen-borde text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="min-h-[44px] px-5 rounded-lg bg-feisen-azul text-white text-sm font-semibold disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar evaluación'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
