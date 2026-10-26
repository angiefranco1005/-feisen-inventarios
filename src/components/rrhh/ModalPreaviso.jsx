import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Paperclip, FileText, ExternalLink, X, AlertTriangle } from 'lucide-react'
import * as E from './estilos'
import {
  BUCKET_RRHH, TIPO_DOC_PREAVISO, nombreCompleto, formatoFecha, hoyISO, preavisoDe, abrirArchivoRRHH,
} from './catalogosRRHH'

const limpiarNombre = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')

// Registrar (o corregir) el preaviso de no prórroga entregado a un colaborador
// con contrato a término fijo: fecha de entrega y carta firmada como soporte.
// La carta queda también en la pestaña Documentos de la ficha.
export default function ModalPreaviso({ empleado, perfilId, onCerrar, onGuardado }) {
  const input = useRef(null)
  const p = preavisoDe(empleado)
  const [fecha,     setFecha]     = useState(p?.entregado?.fecha || hoyISO())
  const [archivo,   setArchivo]   = useState(null)
  const [carta,     setCarta]     = useState(null)   // documento ya guardado
  const [guardando, setGuardando] = useState(false)
  const [msg,       setMsg]       = useState(null)

  useEffect(() => {
    if (!p?.entregado || !empleado.preaviso_documento_id) return
    supabase.from('empleado_documentos').select('id, nombre, path').eq('id', empleado.preaviso_documento_id).maybeSingle()
      .then(({ data }) => setCarta(data || null))
  }, [empleado.id])

  if (!p) return null
  const tarde = fecha > p.limite

  async function guardar(e) {
    e.preventDefault(); setMsg(null); setGuardando(true)
    try {
      let documentoId = p.entregado ? empleado.preaviso_documento_id || null : null
      if (archivo) {
        const path = `${empleado.id}/docs/${Date.now()}-${limpiarNombre(archivo.name)}`
        const { error } = await supabase.storage.from(BUCKET_RRHH).upload(path, archivo)
        if (error) throw new Error(`No se pudo subir la carta: ${error.message}`)
        const { data, error: errIns } = await supabase.from('empleado_documentos')
          .insert({ empleado_id: empleado.id, tipo: TIPO_DOC_PREAVISO, nombre: archivo.name, path, subido_por: perfilId })
          .select('id').single()
        if (errIns) { await supabase.storage.from(BUCKET_RRHH).remove([path]); throw new Error(errIns.message) }
        documentoId = data.id
      }
      const cambios = { preaviso_fecha_entrega: fecha, preaviso_para_fin: p.fin, preaviso_documento_id: documentoId }
      const { error } = await supabase.from('empleados').update(cambios).eq('id', empleado.id)
      if (error) throw new Error(error.message)
      onGuardado({ ...empleado, ...cambios })
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
      setGuardando(false)
    }
  }

  async function deshacer() {
    if (!window.confirm('¿Quitar el registro del preaviso? La carta, si se subió, se conserva en Documentos.')) return
    setGuardando(true)
    const cambios = { preaviso_fecha_entrega: null, preaviso_para_fin: null, preaviso_documento_id: null }
    const { error } = await supabase.from('empleados').update(cambios).eq('id', empleado.id)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); setGuardando(false); return }
    onGuardado({ ...empleado, ...cambios })
  }

  return (
    <Modal titulo="Preaviso de no prórroga" onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

        <div className="text-sm text-feisen-texto-2 space-y-0.5">
          <p className="text-feisen-texto font-medium">{nombreCompleto(empleado)}</p>
          <p>Contrato a término fijo · vence el {formatoFecha(p.fin)}</p>
          <p>Plazo legal para el preaviso: hasta el {formatoFecha(p.limite)} (30 días antes)</p>
        </div>

        <div>
          <label className={E.labelForm}>Fecha de entrega *</label>
          <input required type="date" max={hoyISO()} value={fecha} onChange={e => setFecha(e.target.value)} className={E.input} />
        </div>

        {tarde && (
          <div className="flex items-start gap-2 border border-red-200 bg-feisen-rojo-suave text-feisen-rojo rounded-lg px-3 py-2 text-xs">
            <AlertTriangle size={14} strokeWidth={1.8} className="flex-shrink-0 mt-0.5" />
            <span>Esta fecha es posterior al plazo legal ({formatoFecha(p.limite)}). Sin preaviso con 30 días de anticipación, el contrato se entiende prorrogado por un periodo igual. Revísalo con el área jurídica.</span>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={`${E.labelForm} mb-0`}>Carta firmada</span>
            <button type="button" onClick={() => input.current?.click()} className={`${E.btnTextoAzul} -mr-2.5`}>
              <Paperclip size={14} strokeWidth={1.8} /> {carta || archivo ? 'Cambiar' : 'Adjuntar'}
            </button>
            <input ref={input} type="file" accept=".pdf,image/*,.doc,.docx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setArchivo(f) }} />
          </div>
          {archivo ? (
            <div className="flex items-center gap-2 text-sm">
              <Paperclip size={14} strokeWidth={1.8} className="text-feisen-gris-medio" />
              <span className="flex-1 truncate text-feisen-texto-2">{archivo.name}</span>
              <span className="text-xs text-feisen-gris-medio">se sube al guardar</span>
              <button type="button" onClick={() => setArchivo(null)} className="p-1 text-feisen-gris-medio hover:text-feisen-rojo"><X size={14} strokeWidth={1.8} /></button>
            </div>
          ) : carta ? (
            <button type="button" onClick={() => abrirArchivoRRHH(carta.path).catch(err => setMsg({ tipo: 'error', texto: err.message }))}
              className="flex items-center gap-2 text-sm text-feisen-texto hover:text-feisen-azul">
              <FileText size={14} strokeWidth={1.8} className="text-feisen-gris-medio" /> {carta.nombre}
              <ExternalLink size={13} strokeWidth={1.8} className="text-feisen-gris-medio" />
            </button>
          ) : (
            <p className="text-xs text-amber-600">Sin carta. Puedes registrarlo ahora y subirla después.</p>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          {p.entregado && (
            <button type="button" onClick={deshacer} disabled={guardando}
              className="text-sm text-feisen-gris-medio hover:text-feisen-rojo px-2 py-2 rounded-lg mr-auto">Quitar registro</button>
          )}
          <button type="button" onClick={onCerrar} className={`${E.btnSecundario} ${p.entregado ? '' : 'flex-1'}`}>Cancelar</button>
          <button type="submit" disabled={guardando} className={`${E.btnPrimario} ${p.entregado ? '' : 'flex-1'}`}>
            {guardando ? 'Guardando...' : p.entregado ? 'Guardar cambios' : 'Registrar preaviso'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
