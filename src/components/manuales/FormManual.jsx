import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PanelLateral } from '../shared/ui'
import { campo, etiquetaCampo, hoyCol, sumarDias } from '../mantenimiento/comun'
import { AREAS, TIPOS, codigoSugerido, subirVersion } from './comun'

// Crear o editar la ficha de un manual (nivel 'todo'). Al crearlo se puede adjuntar de una vez
// el archivo, que queda como versión 1. La próxima revisión se sugiere a un año.
export default function FormManual({ manual, codigosUsados, onCerrar, onGuardado }) {
  const { perfil } = useAuth()
  const nuevo = !manual?.id
  const [f, setF] = useState({
    tipo: manual?.tipo || 'procedimiento', area: manual?.area || '', codigo: manual?.codigo || '',
    titulo: manual?.titulo || '', descripcion: manual?.descripcion || '', responsable: manual?.responsable || '',
    proxima_revision: manual?.proxima_revision || (nuevo ? sumarDias(hoyCol(), 365) : ''),
  })
  const [codigoManual, setCodigoManual] = useState(!nuevo) // el usuario escribió el código: no sugerir
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cambiar = (k, v) => setF(prev => {
    const n = { ...prev, [k]: v }
    if (!codigoManual && (k === 'tipo' || k === 'area')) n.codigo = codigoSugerido(n.tipo, n.area, codigosUsados)
    return n
  })

  const guardar = async () => {
    const codigo = f.codigo.trim().toUpperCase()
    if (!f.area) { setError('Elige el área del documento.'); return }
    if (!codigo || !f.titulo.trim()) { setError('El código y el título son obligatorios.'); return }
    if (codigosUsados.has(codigo) && codigo !== manual?.codigo) { setError(`Ya hay un documento con el código ${codigo}.`); return }
    setGuardando(true); setError('')
    const fila = {
      tipo: f.tipo, area: f.area, codigo, titulo: f.titulo.trim(),
      descripcion: f.descripcion.trim() || null, responsable: f.responsable.trim() || null,
      proxima_revision: f.proxima_revision || null,
    }
    try {
      if (nuevo) {
        const { data, error: err } = await supabase.from('manuales').insert({ ...fila, creado_por: perfil?.id }).select().single()
        if (err) throw new Error(err.message)
        // Si el archivo falla, el documento ya quedó creado: se avisa y se sube desde su ficha
        let aviso = `${codigo} creado`
        if (archivo) {
          try { await subirVersion({ manual: data, version: 1, archivo, cambios: 'Versión inicial', vigenteDesde: hoyCol(), usuarioId: perfil?.id }) }
          catch (e) { aviso = `${codigo} creado, pero el archivo no subió (${e.message}). Súbelo desde la ficha.` }
        }
        onGuardado(aviso, data.id)
      } else {
        const { error: err } = await supabase.from('manuales').update(fila).eq('id', manual.id)
        if (err) throw new Error(err.message)
        onGuardado(`${codigo} actualizado`, manual.id)
      }
    } catch (e) {
      setError(e.message); setGuardando(false)
    }
  }

  return (
    <PanelLateral etiqueta={nuevo ? 'Nuevo documento' : 'Editar documento'} onCerrar={onCerrar}
      encabezado={<><p className="text-xs text-gray-400">Manuales</p><h2 className="text-lg font-semibold text-feisen-texto">{nuevo ? 'Nuevo documento' : `Editar ${manual.codigo}`}</h2></>}>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="ma-tipo" className={etiquetaCampo}>Tipo</label>
          <select id="ma-tipo" value={f.tipo} onChange={e => cambiar('tipo', e.target.value)} className={campo}>
            {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t.texto}</option>)}
          </select></div>
        <div><label htmlFor="ma-area" className={etiquetaCampo}>Área</label>
          <select id="ma-area" value={f.area} onChange={e => cambiar('area', e.target.value)} className={campo}>
            <option value="">Elegir…</option>
            {AREAS.map(a => <option key={a.valor} value={a.valor}>{a.valor}</option>)}
          </select></div>
      </div>
      <div><label htmlFor="ma-codigo" className={etiquetaCampo}>Código</label>
        <input id="ma-codigo" value={f.codigo} placeholder="PR-FUN-001" className={`${campo} uppercase`}
          onChange={e => { setCodigoManual(true); setF(prev => ({ ...prev, codigo: e.target.value })) }} />
        {nuevo && <p className="text-xs text-feisen-texto-2 mt-1">Se sugiere solo según el tipo y el área; puedes cambiarlo.</p>}
      </div>
      <div><label htmlFor="ma-titulo" className={etiquetaCampo}>Título</label>
        <input id="ma-titulo" value={f.titulo} onChange={e => cambiar('titulo', e.target.value)} placeholder="Recepción de materia prima" className={campo} /></div>
      <div><label htmlFor="ma-desc" className={etiquetaCampo}>De qué trata</label>
        <textarea id="ma-desc" rows={3} value={f.descripcion} onChange={e => cambiar('descripcion', e.target.value)}
          placeholder="Objetivo y alcance en una o dos frases" className={campo} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="ma-resp" className={etiquetaCampo}>Responsable</label>
          <input id="ma-resp" value={f.responsable} onChange={e => cambiar('responsable', e.target.value)} placeholder="Jefe de Fundición" className={campo} /></div>
        <div><label htmlFor="ma-rev" className={etiquetaCampo}>Próxima revisión</label>
          <input id="ma-rev" type="date" value={f.proxima_revision} onChange={e => cambiar('proxima_revision', e.target.value)} className={campo} /></div>
      </div>
      {nuevo && (
        <div><label htmlFor="ma-archivo" className={etiquetaCampo}>Archivo (versión 1)</label>
          <input id="ma-archivo" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" onChange={e => setArchivo(e.target.files?.[0] || null)}
            className="block w-full text-sm text-feisen-texto-2 file:mr-3 file:min-h-[40px] file:px-3 file:rounded-lg file:border file:border-feisen-borde file:bg-white file:text-sm file:font-medium file:text-feisen-texto" />
          <p className="text-xs text-feisen-texto-2 mt-1">PDF de preferencia, para que se abra en el celular. Puedes subirlo después.</p>
        </div>
      )}

      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}

      <div className="sticky bottom-0 -mx-5 -mb-4 px-5 py-3 bg-white border-t border-feisen-borde-suave">
        <button type="button" onClick={guardar} disabled={guardando}
          className="w-full min-h-[48px] rounded-lg bg-feisen-azul text-white font-semibold disabled:opacity-50">
          {guardando ? 'Guardando…' : nuevo ? 'Crear documento' : 'Guardar cambios'}
        </button>
      </div>
    </PanelLateral>
  )
}
