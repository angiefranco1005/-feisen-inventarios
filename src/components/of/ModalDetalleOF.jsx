import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from './shared/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { formatoOF, formatFecha, estadoTexto, estadoClase, ESTADO_BADGE_CLASE, TRANSPORTE_NOMBRE, nombreTransporte } from './shared/formatters'
import { Paperclip } from '../shared/iconos'
import { MotorLinea } from './shared/motoresOF'
import { formatCOP } from '../../utils/formatters'

// Errores de despacho (KPI 2027 de Logística, 2026-11-20). Se marcan sobre la entrega ya
// registrada, normalmente cuando el cliente avisa; van por la función of_marcar_error_entrega.
export const ERRORES_DESPACHO = {
  equipo_equivocado: 'Equipo o referencia equivocada',
  faltante:          'Faltante',
  dano:              'Daño en el envío',
  documento:         'Documento errado',
  direccion:         'Dirección errada',
  otro:              'Otro',
}

function ErrorEntrega({ entrega, puedeMarcar, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState(entrega.error_tipo || '')
  const [detalle, setDetalle] = useState(entrega.error_detalle || '')
  const [guardando, setGuardando] = useState(false)
  const [falla, setFalla] = useState('')
  async function guardar(nuevoTipo) {
    setGuardando(true); setFalla('')
    const { error } = await supabase.rpc('of_marcar_error_entrega', { p_entrega: entrega.id, p_tipo: nuevoTipo || null, p_detalle: detalle })
    setGuardando(false)
    if (error) { setFalla(error.message); return }
    onCambio({ error_tipo: nuevoTipo || null, error_detalle: nuevoTipo ? (detalle.trim() || null) : null })
    if (!nuevoTipo) { setTipo(''); setDetalle('') }
    setAbierto(false)
  }
  return (
    <div className="mt-0.5">
      {entrega.error_tipo && (
        <span className="inline-block text-[11px] font-medium px-1.5 py-px rounded bg-feisen-rojo-suave text-feisen-rojo">
          Error: {ERRORES_DESPACHO[entrega.error_tipo] || entrega.error_tipo}{entrega.error_detalle ? ` — ${entrega.error_detalle}` : ''}
        </span>
      )}
      {puedeMarcar && !abierto && (
        <button type="button" onClick={() => setAbierto(true)} className="ml-1 text-[11px] text-feisen-azul hover:underline">
          {entrega.error_tipo ? 'Cambiar' : 'Marcar error'}
        </button>
      )}
      {abierto && (
        <div className="mt-1 p-2 rounded-lg border border-feisen-borde bg-white space-y-1.5 text-feisen-texto">
          <select value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo de error"
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white">
            <option value="">¿Qué error hubo?</option>
            {Object.entries(ERRORES_DESPACHO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <input value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Detalle (opcional)"
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
          {falla && <p className="text-[11px] text-feisen-rojo">{falla}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!tipo || guardando} onClick={() => guardar(tipo)}
              className="px-2.5 py-1 rounded-lg bg-feisen-rojo text-white text-xs font-semibold disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar error'}</button>
            {entrega.error_tipo && <button type="button" disabled={guardando} onClick={() => guardar(null)}
              className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs">Quitar error</button>}
            <button type="button" onClick={() => setAbierto(false)} className="px-2.5 py-1 text-xs text-feisen-gris-medio">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ModalDetalleOF({ orden, onCerrar }) {
  const { esAdmin, esJefeArea, ofDespacho: esLogistica, centroCosto, puedeDespacharOF } = useAuth()
  // Cambios de error hechos en este modal (la OF que llega por props no se recarga)
  const [cambiosError, setCambiosError] = useState({})
  const itemsAMostrar = esJefeArea
    ? (orden.items_of || []).filter(it => it.centro_costo === centroCosto)
    : (orden.items_of || [])
  return (
    <Modal titulo={(esJefeArea || esLogistica) ? formatoOF(orden.numero) : `${formatoOF(orden.numero)} — ${orden.cliente}`} onCerrar={onCerrar} ancho="sm:max-w-2xl">
      <div className="space-y-4">
        {orden.cancelada && (
          <div className="bg-gray-100 border-l-4 border-feisen-gris-oscuro rounded-xl px-4 py-3 text-sm">
            <p className="font-semibold text-feisen-gris-oscuro">✕ Esta Orden de Fabricación está cancelada.</p>
            {orden.motivo_cancelacion && <p className="text-feisen-gris-medio mt-1">Motivo: {orden.motivo_cancelacion}</p>}
          </div>
        )}
        <p className="text-sm text-feisen-gris-medio">
          Orden: {formatFecha(orden.fecha_orden)} · Promesa de entrega: {formatFecha(orden.fecha_promesa)}
          {!esJefeArea && <> · Transportador: {nombreTransporte(orden)}</>}
          {orden.numero_cotizacion && <> · Cotización: {orden.numero_cotizacion}</>}
        </p>
        <p className="text-xs text-feisen-gris-medio">Creado por: {orden.creador?.nombre || '—'}</p>

        {!esJefeArea && (
          <div className="bg-feisen-gris rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold text-feisen-gris-oscuro">{orden.ciudad}</p>
            <p className="text-feisen-gris-medio">{orden.direccion || '-'}</p>
            <p className="text-feisen-gris-medio">{orden.contacto || '-'}</p>
            <p className="text-feisen-gris-medio">{TRANSPORTE_NOMBRE[orden.transporte] || orden.transporte}{orden.nombre_transportadora ? ' — ' + orden.nombre_transportadora : ''}</p>
            {orden.valor_flete != null && <p className="text-feisen-gris-medio tabular-nums">Flete a facturar: <span className="font-semibold text-feisen-gris-oscuro">{formatCOP(orden.valor_flete)}</span></p>}
            {orden.archivo_oc_url && (
              <a href={orden.archivo_oc_url} target="_blank" rel="noreferrer" className="text-feisen-azul inline-block mt-1">
                <Paperclip size={14} className="inline -mt-0.5 mr-1" />{orden.archivo_oc_nombre || 'Orden de compra adjunta'}
              </a>
            )}
          </div>
        )}

        {orden.notas && (
          <div className="bg-blue-50 border-l-4 border-feisen-azul rounded-xl p-4 text-sm">
            <p className="font-semibold text-feisen-azul mb-1">Notas</p>
            <p className="text-feisen-gris-oscuro whitespace-pre-wrap">{orden.notas}</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-feisen-gris-medio uppercase border-b border-gray-200">
                <th className="py-2 pr-2">Producto</th>
                <th className="py-2 pr-2">Cant.</th>
                <th className="py-2 pr-2">Estado</th>
                {esAdmin && <th className="py-2 pr-2">Fabricación</th>}
                <th className="py-2 pr-2">Entregas (OD)</th>
              </tr>
            </thead>
            <tbody>
              {itemsAMostrar.map(item => (
                <tr key={item.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-2">
                    <p className="font-medium text-feisen-gris-oscuro">{item.producto}</p>
                    <p className="text-xs text-feisen-gris-medio">{item.color}{item.detalle ? ' · ' + item.detalle : ''}<MotorLinea item={item} /></p>
                  </td>
                  <td className="py-2 pr-2 font-bold text-feisen-azul">{item.cantidad}</td>
                  <td className="py-2 pr-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ESTADO_BADGE_CLASE[estadoClase(item)]}`}>
                      {estadoTexto(item)}
                    </span>
                  </td>
                  {esAdmin && (
                    <td className="py-2 pr-2 text-xs text-feisen-gris-medio">
                      {item.producciones?.length ? item.producciones.map(pr => (
                        <div key={pr.id} className={pr.tipo === 'reversion' ? 'text-feisen-rojo' : ''}>
                          {pr.tipo === 'reversion' ? `− ${pr.cantidad} uds (reversión)` : `+ ${pr.cantidad} uds`}
                          {' '}({formatFecha(pr.fecha)}) — {pr.registrado_por_perfil?.nombre || '—'}
                          {pr.motivo ? <><br />Motivo: {pr.motivo}</> : null}
                        </div>
                      )) : '-'}
                    </td>
                  )}
                  <td className="py-2 pr-2 text-xs text-feisen-gris-medio">
                    {item.entregas?.length ? item.entregas.map(e0 => { const e = { ...e0, ...cambiosError[e0.id] }; return (
                      <div key={e.id} className={`${e.tipo === 'reversion' ? 'text-feisen-rojo' : ''} mb-1`}>
                        {e.tipo === 'reversion'
                          ? `− ${e.cantidad} uds (reversión)`
                          : `${e.orden_despacho || 'sin OD'}: ${e.cantidad} uds`}
                        {' '}({formatFecha(e.fecha)}){e.referencia ? ' — Ref: ' + e.referencia : ''}{e.motivo ? ' — Motivo: ' + e.motivo : ''}
                        {esAdmin && <><br />Registrado por: {e.registrado_por_perfil?.nombre || '—'}</>}
                        {e.tipo === 'entrega' && (e.error_tipo || puedeDespacharOF) &&
                          <ErrorEntrega entrega={e} puedeMarcar={puedeDespacharOF}
                            onCambio={c => setCambiosError(prev => ({ ...prev, [e.id]: c }))} />}
                      </div>
                    )}) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
