import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { siguienteNumero } from '../../utils/siguienteNumero'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Paperclip, FileText, ExternalLink, Trash2, X, AlertTriangle } from 'lucide-react'
import * as E from './estilos'
import {
  BUCKET_RRHH, TIPOS_NOVEDAD, nombreCompleto, formatoFecha, hoyISO,
  diasCalendario, diasHabiles, horasEntre, abrirArchivoRRHH,
} from './catalogosRRHH'

const limpiarNombre = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')

function formDesde(n, empleadoFijo) {
  if (!n) {
    const f = {
      empleado_id: empleadoFijo || '', tipo: 'incapacidad', subtipo: '', fecha_inicio: hoyISO(), fecha_fin: hoyISO(),
      por_horas: false, hora_inicio: '', hora_fin: '', dias: '', remunerado: true,
      entidad: '', numero_incapacidad: '', diagnostico: '', prorroga: false, observaciones: '',
    }
    return { ...f, dias: diasSugeridos(f) }
  }
  const s = (v) => (v === null || v === undefined ? '' : String(v))
  return {
    empleado_id: n.empleado_id, tipo: n.tipo, subtipo: s(n.subtipo), fecha_inicio: n.fecha_inicio, fecha_fin: n.fecha_fin,
    por_horas: !!n.por_horas, hora_inicio: s(n.hora_inicio).slice(0, 5), hora_fin: s(n.hora_fin).slice(0, 5),
    dias: s(n.dias), remunerado: n.remunerado ?? true,
    entidad: s(n.entidad), numero_incapacidad: s(n.numero_incapacidad), diagnostico: s(n.diagnostico),
    prorroga: !!n.prorroga, observaciones: s(n.observaciones),
  }
}

// Días sugeridos según el tipo (vacaciones en días hábiles; lo demás, calendario)
function diasSugeridos(f) {
  if (f.por_horas) return ''
  const t = TIPOS_NOVEDAD[f.tipo]
  const n = t?.conteo === 'habiles' ? diasHabiles(f.fecha_inicio, f.fecha_fin) : diasCalendario(f.fecha_inicio, f.fecha_fin)
  return n ? String(n) : ''
}

// Crear o editar una novedad (incapacidad, permiso, vacaciones o licencia) con sus soportes.
// `existentes`: otras novedades conocidas, para avisar si se cruzan las fechas.
export default function ModalNovedad({ novedad, empleados, empleadoFijo, existentes = [], perfilId, onCerrar, onGuardado }) {
  const inputArchivos = useRef(null)
  const [form,        setForm]        = useState(() => formDesde(novedad, empleadoFijo))
  const [diasManual,  setDiasManual]  = useState(!!novedad)
  const [soportes,    setSoportes]    = useState([])
  const [pendientes,  setPendientes]  = useState([])   // archivos elegidos aún sin subir
  const [guardando,   setGuardando]   = useState(false)
  const [msg,         setMsg]         = useState(null)

  useEffect(() => {
    if (!novedad) return
    supabase.from('novedad_soportes').select('*').eq('novedad_id', novedad.id).order('created_at')
      .then(({ data }) => setSoportes(data || []))
  }, [novedad?.id])

  const tipo = TIPOS_NOVEDAD[form.tipo]
  const emp = empleados.find(e => e.id === form.empleado_id)

  function set(k, v) {
    setForm(f => {
      let nf = { ...f, [k]: v }
      if (k === 'tipo') { nf.subtipo = ''; if (v !== 'permiso') nf.por_horas = false }
      if (k === 'fecha_inicio' && (nf.por_horas || !nf.fecha_fin || nf.fecha_fin < v)) nf.fecha_fin = v
      if (k === 'por_horas' && v) nf.fecha_fin = nf.fecha_inicio
      // Incapacidad: proponer la entidad según el origen (EPS o ARL de la ficha)
      if ((k === 'subtipo' || k === 'empleado_id') && nf.tipo === 'incapacidad' && !f.entidad) {
        const e = empleados.find(x => x.id === nf.empleado_id)
        const laboral = ['Accidente de trabajo', 'Enfermedad laboral'].includes(nf.subtipo)
        nf.entidad = (laboral ? e?.arl : e?.eps) || ''
      }
      if (k === 'subtipo' && nf.tipo === 'licencia') nf.remunerado = nf.subtipo !== 'No remunerada'
      if (!diasManual || ['tipo', 'por_horas'].includes(k)) nf.dias = diasSugeridos(nf)
      return nf
    })
    if (['tipo', 'por_horas'].includes(k)) setDiasManual(false)
  }

  const horas = form.por_horas ? horasEntre(form.hora_inicio, form.hora_fin) : null
  const cruces = existentes.filter(n => n.id !== novedad?.id && n.empleado_id === form.empleado_id
    && n.fecha_inicio <= form.fecha_fin && n.fecha_fin >= form.fecha_inicio)

  async function subirPendientes(novedadId) {
    for (const file of pendientes) {
      const path = `novedades/${novedadId}/${Date.now()}-${limpiarNombre(file.name)}`
      const { error } = await supabase.storage.from(BUCKET_RRHH).upload(path, file)
      if (error) throw new Error(`No se pudo subir "${file.name}": ${error.message}`)
      const { error: errIns } = await supabase.from('novedad_soportes')
        .insert({ novedad_id: novedadId, nombre: file.name, path, subido_por: perfilId })
      if (errIns) { await supabase.storage.from(BUCKET_RRHH).remove([path]); throw new Error(errIns.message) }
    }
  }

  async function guardar(e) {
    e.preventDefault(); setMsg(null)
    if (form.fecha_fin < form.fecha_inicio) { setMsg({ tipo: 'error', texto: 'La fecha final no puede ser antes de la inicial.' }); return }
    if (form.por_horas && !horas) { setMsg({ tipo: 'error', texto: 'Revisa las horas: la hora final debe ser después de la inicial.' }); return }
    setGuardando(true)
    const fila = {
      empleado_id: form.empleado_id,
      tipo: form.tipo,
      subtipo: form.subtipo || null,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.por_horas ? form.fecha_inicio : form.fecha_fin,
      por_horas: form.por_horas,
      hora_inicio: form.por_horas ? form.hora_inicio : null,
      hora_fin: form.por_horas ? form.hora_fin : null,
      dias: form.por_horas || form.dias === '' ? null : Number(form.dias),
      horas: form.por_horas ? horas : null,
      remunerado: tipo.remunerable ? !!form.remunerado : null,
      entidad: form.tipo === 'incapacidad' ? form.entidad.trim() || null : null,
      numero_incapacidad: form.tipo === 'incapacidad' ? form.numero_incapacidad.trim() || null : null,
      diagnostico: form.tipo === 'incapacidad' ? form.diagnostico.trim() || null : null,
      prorroga: form.tipo === 'incapacidad' ? !!form.prorroga : false,
      observaciones: form.observaciones.trim() || null,
    }
    try {
      let id = novedad?.id
      if (id) {
        const { error } = await supabase.from('novedades').update(fila).eq('id', id)
        if (error) throw error
      } else {
        const codigo = await siguienteNumero('novedades', 'NOV', 'codigo')
        const { data, error } = await supabase.from('novedades').insert({ ...fila, codigo, creado_por: perfilId }).select('id').single()
        if (error) throw error
        id = data.id
      }
      try {
        await subirPendientes(id)
      } catch (errArch) {
        // La novedad quedó guardada; solo falló algún soporte
        setGuardando(false); setPendientes([])
        onGuardado({ aviso: `La novedad se guardó, pero ${errArch.message}. Ábrela de nuevo para adjuntar el soporte.` })
        return
      }
      setGuardando(false)
      onGuardado()
    } catch (err) {
      setGuardando(false)
      setMsg({ tipo: 'error', texto: err.message })
    }
  }

  async function quitarSoporte(s) {
    if (!window.confirm(`¿Eliminar el soporte "${s.nombre}"?`)) return
    const { error } = await supabase.from('novedad_soportes').delete().eq('id', s.id)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    await supabase.storage.from(BUCKET_RRHH).remove([s.path])
    setSoportes(ss => ss.filter(x => x.id !== s.id))
  }

  async function eliminarNovedad() {
    if (!window.confirm('¿Eliminar esta novedad y sus soportes? Esta acción no se puede deshacer.')) return
    setGuardando(true)
    const { error } = await supabase.from('novedades').delete().eq('id', novedad.id)
    if (error) { setGuardando(false); setMsg({ tipo: 'error', texto: error.message }); return }
    if (soportes.length) await supabase.storage.from(BUCKET_RRHH).remove(soportes.map(s => s.path))
    setGuardando(false)
    onGuardado()
  }

  const titulo = novedad ? `${tipo.label}${novedad.codigo ? ` · ${novedad.codigo}` : ''}` : 'Registrar novedad'
  const L = ({ children, req }) => <label className={E.labelForm}>{children}{req && ' *'}</label>

  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

        {/* Tipo de novedad */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {Object.entries(TIPOS_NOVEDAD).map(([k, t]) => (
            <button key={k} type="button" onClick={() => set('tipo', k)}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm transition-colors
                ${form.tipo === k ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-medium' : 'border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${t.punto}`} /> {t.label}
            </button>
          ))}
        </div>

        <div>
          <L req>Colaborador</L>
          {empleadoFijo
            ? <p className="text-sm text-feisen-texto py-2">{emp ? nombreCompleto(emp) : '—'}</p>
            : <select required value={form.empleado_id} onChange={e => set('empleado_id', e.target.value)} className={E.input}>
                <option value="">Seleccionar…</option>
                {empleados.filter(e => e.estado !== 'retirado' || e.id === form.empleado_id).map(e =>
                  <option key={e.id} value={e.id}>{nombreCompleto(e)}{e.cargo ? ` · ${e.cargo}` : ''}</option>)}
              </select>}
        </div>

        <div>
          <L req={form.tipo !== 'vacaciones'}>{form.tipo === 'incapacidad' ? 'Origen' : form.tipo === 'vacaciones' ? 'Modalidad' : 'Motivo'}</L>
          <select required={form.tipo !== 'vacaciones'} value={form.subtipo} onChange={e => set('subtipo', e.target.value)} className={E.input}>
            <option value="">Seleccionar…</option>
            {tipo.subtipos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {form.tipo === 'permiso' && (
          <label className="flex items-center gap-2.5 text-sm text-feisen-texto cursor-pointer">
            <input type="checkbox" checked={form.por_horas} onChange={e => set('por_horas', e.target.checked)} className="w-4 h-4 accent-feisen-azul" />
            Es por horas (dentro de un mismo día)
          </label>
        )}

        {form.por_horas ? (
          <div className="grid grid-cols-3 gap-3">
            <div><L req>Fecha</L><input required type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} className={E.input} /></div>
            <div><L req>Desde</L><input required type="time" value={form.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} className={E.input} /></div>
            <div><L req>Hasta</L><input required type="time" value={form.hora_fin} onChange={e => set('hora_fin', e.target.value)} className={E.input} /></div>
            {horas > 0 && <p className="col-span-3 text-xs text-feisen-gris-medio -mt-1">{horas} hora{horas === 1 ? '' : 's'}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div><L req>Desde</L><input required type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} className={E.input} /></div>
            <div><L req>Hasta</L><input required type="date" min={form.fecha_inicio} value={form.fecha_fin} onChange={e => set('fecha_fin', e.target.value)} className={E.input} /></div>
            <div>
              <L>{tipo.conteo === 'habiles' ? 'Días hábiles' : 'Días'}</L>
              <input type="number" min="0" step="0.5" value={form.dias}
                onChange={e => { setDiasManual(true); setForm(f => ({ ...f, dias: e.target.value })) }} className={E.input} />
            </div>
            <p className="col-span-3 text-xs text-feisen-gris-medio -mt-1">
              {tipo.conteo === 'habiles'
                ? 'Se calculan de lunes a sábado sin domingos ni festivos. Ajústalos si en Feisen el sábado no es hábil.'
                : 'Días calendario. Puedes ajustarlos si hace falta.'}
            </p>
          </div>
        )}

        {cruces.length > 0 && (
          <div className="flex items-start gap-2 border border-amber-200 bg-amber-50 text-amber-800 rounded-lg px-3 py-2 text-xs">
            <AlertTriangle size={14} strokeWidth={1.8} className="flex-shrink-0 mt-0.5 text-amber-500" />
            <span>Se cruza con: {cruces.map(n => `${TIPOS_NOVEDAD[n.tipo]?.label} del ${formatoFecha(n.fecha_inicio)} al ${formatoFecha(n.fecha_fin)}`).join('; ')}.</span>
          </div>
        )}

        {tipo.remunerable && (
          <label className="flex items-center gap-2.5 text-sm text-feisen-texto cursor-pointer">
            <input type="checkbox" checked={!!form.remunerado} onChange={e => set('remunerado', e.target.checked)} className="w-4 h-4 accent-feisen-azul" />
            Remunerado
          </label>
        )}

        {form.tipo === 'incapacidad' && (
          <div className="grid grid-cols-2 gap-3">
            <div><L>Entidad (EPS / ARL)</L><input value={form.entidad} onChange={e => set('entidad', e.target.value)} className={E.input} /></div>
            <div><L>N.º de incapacidad</L><input value={form.numero_incapacidad} onChange={e => set('numero_incapacidad', e.target.value)} className={E.input} /></div>
            <div className="col-span-2"><L>Diagnóstico</L><input value={form.diagnostico} onChange={e => set('diagnostico', e.target.value)} placeholder="Opcional" className={E.input} /></div>
            <label className="col-span-2 flex items-center gap-2.5 text-sm text-feisen-texto cursor-pointer">
              <input type="checkbox" checked={form.prorroga} onChange={e => set('prorroga', e.target.checked)} className="w-4 h-4 accent-feisen-azul" />
              Es prórroga de una incapacidad anterior
            </label>
          </div>
        )}

        <div>
          <L>Observaciones</L>
          <textarea rows={2} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} className={E.input} />
        </div>

        {/* Soportes */}
        <div className="border-t border-feisen-borde-suave pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className={E.labelForm + ' mb-0'}>
              Soportes{tipo.soporte && <span className="text-feisen-gris-medio font-normal"> · {form.tipo === 'incapacidad' ? 'certificado de incapacidad' : 'documento que la respalde'}</span>}
            </span>
            <button type="button" onClick={() => inputArchivos.current?.click()} className={`${E.btnTextoAzul} -mr-2.5`}>
              <Paperclip size={14} strokeWidth={1.8} /> Adjuntar
            </button>
            <input ref={inputArchivos} type="file" multiple accept=".pdf,image/*,.doc,.docx" className="hidden"
              onChange={e => { const fs = [...(e.target.files || [])]; e.target.value = ''; setPendientes(p => [...p, ...fs]) }} />
          </div>
          {soportes.length === 0 && pendientes.length === 0 && (
            <p className={`text-xs ${tipo.soporte ? 'text-amber-600' : 'text-feisen-gris-medio'}`}>
              {tipo.soporte ? 'Pendiente de soporte.' : 'Sin soportes (opcional).'}
            </p>
          )}
          <div className="space-y-1">
            {soportes.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <FileText size={14} strokeWidth={1.8} className="text-feisen-gris-medio flex-shrink-0" />
                <button type="button" onClick={() => abrirArchivoRRHH(s.path).catch(err => setMsg({ tipo: 'error', texto: err.message }))}
                  className="flex-1 min-w-0 text-left truncate text-feisen-texto hover:text-feisen-azul hover:underline">{s.nombre}</button>
                <ExternalLink size={13} strokeWidth={1.8} className="text-feisen-gris-medio" />
                <button type="button" onClick={() => quitarSoporte(s)} title="Eliminar" className="p-1 text-feisen-gris-medio hover:text-feisen-rojo">
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              </div>
            ))}
            {pendientes.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Paperclip size={14} strokeWidth={1.8} className="text-feisen-gris-medio flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate text-feisen-texto-2">{f.name}</span>
                <span className="text-xs text-feisen-gris-medio">se sube al guardar</span>
                <button type="button" onClick={() => setPendientes(p => p.filter((_, j) => j !== i))} className="p-1 text-feisen-gris-medio hover:text-feisen-rojo">
                  <X size={14} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {novedad && (
            <button type="button" onClick={eliminarNovedad} disabled={guardando}
              className="inline-flex items-center gap-1.5 text-sm text-feisen-gris-medio hover:text-feisen-rojo px-2 py-2 rounded-lg mr-auto">
              <Trash2 size={14} strokeWidth={1.8} /> Eliminar
            </button>
          )}
          <button type="button" onClick={onCerrar} className={`${E.btnSecundario} ${novedad ? '' : 'flex-1'}`}>Cancelar</button>
          <button type="submit" disabled={guardando} className={`${E.btnPrimario} ${novedad ? '' : 'flex-1'}`}>
            {guardando ? 'Guardando...' : novedad ? 'Guardar cambios' : 'Registrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
