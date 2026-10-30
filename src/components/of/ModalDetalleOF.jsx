import Modal from './shared/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { formatoOF, formatFecha, estadoTexto, estadoClase, ESTADO_BADGE_CLASE, TRANSPORTE_NOMBRE, nombreTransporte } from './shared/formatters'
import { Paperclip } from '../shared/iconos'

export default function ModalDetalleOF({ orden, onCerrar }) {
  const { esAdmin, esJefeArea, ofDespacho: esLogistica, centroCosto } = useAuth()
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
                    <p className="text-xs text-feisen-gris-medio">{item.color}{item.detalle ? ' · ' + item.detalle : ''}</p>
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
                    {item.entregas?.length ? item.entregas.map(e => (
                      <div key={e.id} className={e.tipo === 'reversion' ? 'text-feisen-rojo' : ''}>
                        {e.tipo === 'reversion'
                          ? `− ${e.cantidad} uds (reversión)`
                          : `${e.orden_despacho || 'sin OD'}: ${e.cantidad} uds`}
                        {' '}({formatFecha(e.fecha)}){e.referencia ? ' — Ref: ' + e.referencia : ''}{e.motivo ? ' — Motivo: ' + e.motivo : ''}
                        {esAdmin && <><br />Registrado por: {e.registrado_por_perfil?.nombre || '—'}</>}
                      </div>
                    )) : '-'}
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
