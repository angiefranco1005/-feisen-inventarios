import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { CheckCircle, XCircle, Clock, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'

const MECANIZADOS_BODEGA_ID = '03a709ac-0bee-457a-80a1-0a1603218d34'
const FUNDICION_BODEGA_ID   = 'a0604489-2768-445b-8e68-e450ef8520ed'

const ESTADO_CONFIG = {
  pendiente: { label: 'Pendiente',  color: 'bg-amber-100 text-amber-700',  icon: Clock },
  aprobada:  { label: 'Aprobada',   color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  rechazada: { label: 'Rechazada',  color: 'bg-red-100 text-red-700',      icon: XCircle },
}

const MOTIVOS_RECHAZO = [
  'Las cantidades no coinciden',
  'Los ítems no corresponden a lo esperado',
  'No hay espacio disponible en Mecanizados',
  'Error en el registro — se enviará de nuevo',
]

export default function TransferenciasPendientes() {
  const { perfil, bodegasOperacion, rolEfectivo } = useAuth()

  const esMecanizados = rolEfectivo === 'JEFE_MECANIZADOS'
  const esFundicion   = rolEfectivo === 'JEFE_FUNDICION'

  const [transferencias, setTransferencias] = useState([])
  const [cargando,       setCargando]       = useState(true)
  const [error,          setError]          = useState('')
  const [procesando,     setProcesando]     = useState(null) // id en procesamiento
  const [expandida,      setExpandida]      = useState(null) // id expandida
  const [filtro,         setFiltro]         = useState('pendiente')

  // Modal rechazo
  const [modalRechazo,   setModalRechazo]   = useState(null) // transferencia a rechazar
  const [motivoRec,      setMotivoRec]      = useState('')
  const [motivoCustom,   setMotivoCustom]   = useState('')

  useEffect(() => { cargar() }, [filtro])

  async function cargar() {
    setCargando(true)
    setError('')
    try {
      let q = supabase
        .from('transferencias_pendientes')
        .select('*, creado_por_perfil:profiles!creado_por(nombre), aprobado_por_perfil:profiles!aprobado_rechazado_por(nombre)')
        .order('created_at', { ascending: false })

      if (filtro !== 'todas') q = q.eq('estado', filtro)

      if (esMecanizados) {
        q = q.eq('destino_bodega_id', MECANIZADOS_BODEGA_ID)
      } else if (esFundicion) {
        q = q.eq('origen_bodega_id', FUNDICION_BODEGA_ID)
      }

      const { data, error: err } = await q
      if (err) { setError('Error al cargar: ' + err.message); return }
      setTransferencias(data || [])
    } finally {
      setCargando(false)
    }
  }

  async function aprobar(trf) {
    setProcesando(trf.id)
    setError('')
    try {
      // 1. Validar stock en Fundición para cada ítem
      for (const item of trf.items) {
        const { data: stockRow } = await supabase
          .from('stock')
          .select('cantidad_actual')
          .eq('item_id', item.item_id)
          .eq('bodega_id', trf.origen_bodega_id)
          .maybeSingle()
        const stockActual = stockRow?.cantidad_actual ?? 0
        if (stockActual < item.cantidad) {
          setError(`Stock insuficiente en Fundición para "${item.item_nombre}". Disponible: ${stockActual.toLocaleString('es-CO')} — solicitado: ${item.cantidad.toLocaleString('es-CO')}`)
          setProcesando(null)
          return
        }
      }

      // 2. Generar número de movimiento
      const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
      const prefix = `SAL-${iniciales}-`
      const { data: lastMov } = await supabase
        .from('movimientos').select('numero').like('numero', `${prefix}%`)
        .order('numero', { ascending: false }).limit(1).maybeSingle()
      const nMov = lastMov?.numero ? parseInt(lastMov.numero.replace(prefix, ''), 10) || 0 : 0
      const numeroMov = `${prefix}${String(nMov + 1).padStart(4, '0')}`

      // 3. Crear movimientos (salida Fundición + stock se actualiza automáticamente en Mecanizados por bodega_destino_id)
      const payloads = trf.items.map(item => ({
        numero:                numeroMov,
        tipo:                  'salida',
        item_id:               item.item_id,
        bodega_origen_id:      trf.origen_bodega_id,
        bodega_destino_id:     trf.destino_bodega_id,
        cantidad:              item.cantidad,
        precio_costo_snapshot: item.precio_costo || 0,
        centro_costo:          'FUNDICIÓN',
        usuario_id:            perfil.id,
        referencia:            `Aprobación ${trf.numero}${trf.notas ? ' — ' + trf.notas : ''}`,
        destino:               'MECANIZADOS',
        fecha_movimiento:      trf.fecha_movimiento || new Date().toISOString().slice(0, 10),
        proveedor: null, pedido_id: null, serial_motor: null, motivo: null,
        foto_remision_url: null, firma_receptor_url: null, numero_of: null, cliente: null,
      }))

      const { error: errMov } = await supabase.from('movimientos').insert(payloads)
      if (errMov) { setError('Error al crear movimiento: ' + errMov.message); return }

      // 4. Marcar como aprobada
      const { error: errUpd } = await supabase
        .from('transferencias_pendientes')
        .update({
          estado: 'aprobada',
          aprobado_rechazado_por: perfil.id,
          numero_movimiento_origen: numeroMov,
          updated_at: new Date().toISOString(),
        })
        .eq('id', trf.id)
      if (errUpd) { setError('Movimiento creado pero error al actualizar estado: ' + errUpd.message); return }

      await cargar()
    } catch (err) {
      setError('Error inesperado: ' + err.message)
    } finally {
      setProcesando(null)
    }
  }

  async function rechazar(trf, motivo) {
    setProcesando(trf.id)
    setError('')
    try {
      const { error: errUpd } = await supabase
        .from('transferencias_pendientes')
        .update({
          estado:                 'rechazada',
          aprobado_rechazado_por: perfil.id,
          motivo_rechazo:         motivo,
          updated_at:             new Date().toISOString(),
        })
        .eq('id', trf.id)
      if (errUpd) { setError('Error al rechazar: ' + errUpd.message); return }
      setModalRechazo(null)
      setMotivoRec('')
      setMotivoCustom('')
      await cargar()
    } catch (err) {
      setError('Error inesperado: ' + err.message)
    } finally {
      setProcesando(null)
    }
  }

  function fmtFecha(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const pendientes  = transferencias.filter(t => t.estado === 'pendiente').length
  const titulo      = esMecanizados ? 'Transferencias de Fundición' : 'Mis transferencias a Mecanizados'

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-feisen-azul">{titulo}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {esMecanizados
            ? 'Aprueba o rechaza lo que envía Fundición. El stock se mueve al aprobar.'
            : 'Seguimiento de todo lo que has enviado a Mecanizados.'}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'pendiente', label: `Pendientes${pendientes > 0 ? ` (${pendientes})` : ''}` },
          { key: 'aprobada',  label: 'Aprobadas' },
          { key: 'rechazada', label: 'Rechazadas' },
          { key: 'todas',     label: 'Todas' },
        ].map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all border
              ${filtro === f.key
                ? 'bg-feisen-azul text-white border-feisen-azul'
                : 'bg-white text-gray-500 border-gray-200 hover:border-feisen-azul hover:text-feisen-azul'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}

      {/* Lista */}
      {cargando ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : transferencias.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <Clock size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-400 text-sm">No hay transferencias {filtro !== 'todas' ? `en estado "${ESTADO_CONFIG[filtro]?.label || filtro}"` : ''}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transferencias.map(trf => {
            const cfg      = ESTADO_CONFIG[trf.estado] || ESTADO_CONFIG.pendiente
            const Icon     = cfg.icon
            const abierta  = expandida === trf.id
            const enProceso = procesando === trf.id

            return (
              <div key={trf.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Cabecera */}
                <div
                  className="px-5 py-4 flex items-center gap-3 cursor-pointer select-none"
                  onClick={() => setExpandida(abierta ? null : trf.id)}>
                  <Icon size={18} className={cfg.color.replace('bg-', 'text-').split(' ')[0].replace('text-', 'text-')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800">{trf.numero}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {fmtFecha(trf.created_at)}
                      {trf.creado_por_perfil?.nombre && ` · ${trf.creado_por_perfil.nombre}`}
                      {' · '}{trf.items?.length} {trf.items?.length === 1 ? 'ítem' : 'ítems'}
                    </p>
                  </div>
                  {abierta ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                </div>

                {/* Detalle expandido */}
                {abierta && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                    {/* Ítem lista */}
                    <div className="rounded-xl overflow-hidden border border-gray-100">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Producto</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Cantidad</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {trf.items?.map((item, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 font-medium text-gray-800">{item.item_nombre}</td>
                              <td className="px-3 py-2 text-right text-gray-600">
                                {item.cantidad?.toLocaleString('es-CO')} {item.unidad}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {trf.notas && (
                      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                        <span className="font-medium">Notas:</span> {trf.notas}
                      </p>
                    )}

                    {trf.estado === 'rechazada' && trf.motivo_rechazo && (
                      <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                        <span className="font-medium">Motivo rechazo:</span> {trf.motivo_rechazo}
                      </p>
                    )}

                    {trf.estado === 'aprobada' && trf.numero_movimiento_origen && (
                      <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">
                        <span className="font-medium">Movimiento generado:</span> {trf.numero_movimiento_origen}
                        {trf.aprobado_por_perfil?.nombre && ` · Aprobó: ${trf.aprobado_por_perfil.nombre}`}
                      </p>
                    )}

                    {/* Acciones (solo Mecanizados, solo pendientes) */}
                    {esMecanizados && trf.estado === 'pendiente' && (
                      <div className="flex gap-2 pt-1">
                        <button
                          disabled={enProceso}
                          onClick={() => aprobar(trf)}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-feisen-azul text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                          {enProceso
                            ? <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                            : <CheckCircle size={16} />}
                          Aprobar
                        </button>
                        <button
                          disabled={enProceso}
                          onClick={() => { setModalRechazo(trf); setMotivoRec(''); setMotivoCustom('') }}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border-2 border-feisen-rojo text-feisen-rojo rounded-xl text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors">
                          <XCircle size={16} />
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal rechazo */}
      {modalRechazo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">¿Por qué rechazas esta transferencia?</h2>
            <p className="text-sm text-gray-500">
              Transferencia <strong>{modalRechazo.numero}</strong> — el equipo de Fundición verá el motivo.
            </p>

            <div className="space-y-2">
              {MOTIVOS_RECHAZO.map(m => (
                <button key={m} type="button"
                  onClick={() => { setMotivoRec(m); setMotivoCustom('') }}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm border-2 transition-all font-medium
                    ${motivoRec === m && !motivoCustom
                      ? 'border-feisen-rojo bg-red-50 text-feisen-rojo'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {m}
                </button>
              ))}
              <div>
                <input
                  type="text"
                  placeholder="Otro motivo…"
                  value={motivoCustom}
                  onChange={e => { setMotivoCustom(e.target.value); setMotivoRec('') }}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-feisen-rojo"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setModalRechazo(null); setMotivoRec(''); setMotivoCustom('') }}
                className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-gray-300">
                Cancelar
              </button>
              <button
                disabled={!motivoRec && !motivoCustom.trim()}
                onClick={() => rechazar(modalRechazo, motivoCustom.trim() || motivoRec)}
                className="flex-1 py-2.5 bg-feisen-rojo text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity">
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
