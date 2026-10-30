import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PanelLateral } from '../shared/ui'
import { Download, FileText, Pencil, Upload } from '../shared/iconos'
import { Etiqueta, Titulo, campo, etiquetaCampo, fechaCorta, hoyCol, textoProxima } from '../mantenimiento/comun'
import { TIPOS, abrirArchivo, subirVersion, tamanoArchivo } from './comun'

const fechaLarga = f => f ? `${fechaCorta(f)} ${f.slice(0, 4)}` : '—'

// Ficha de un manual: datos, botón para abrir la versión vigente e historial de versiones.
// Con nivel 'todo': subir una nueva versión, editar la ficha y marcarlo obsoleto o reactivarlo.
export default function FichaManual({ manual, onCerrar, onEditar, onCambio }) {
  const { perfil, nivel } = useAuth()
  const gestiona = nivel('manuales') === 'todo'
  const [versiones, setVersiones] = useState(null)
  const [error, setError] = useState('')
  const [abriendo, setAbriendo] = useState(null)
  const [formVersion, setFormVersion] = useState(null) // null | { archivo, cambios, vigente_desde }
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    supabase.from('manual_versiones').select('*, subido:profiles!manual_versiones_subido_por_fkey(nombre)')
      .eq('manual_id', manual.id).order('version', { ascending: false })
      .then(({ data, error: err }) => { if (!vivo) return; if (err) setError(err.message); setVersiones(data || []) })
    return () => { vivo = false }
  }, [manual.id, manual.version_actual])

  const vigente = versiones?.find(v => v.version === manual.version_actual)
  const tipo = TIPOS[manual.tipo]
  const hoy = hoyCol()
  const revisionVencida = manual.activo && manual.proxima_revision && manual.proxima_revision < hoy

  const abrir = async v => {
    setAbriendo(v.id); setError('')
    try { await abrirArchivo(v.archivo_path) } catch (e) { setError(`No se pudo abrir: ${e.message}`) }
    setAbriendo(null)
  }

  const guardarVersion = async () => {
    if (!formVersion.archivo) { setError('Elige el archivo de la nueva versión.'); return }
    if (manual.version_actual > 0 && !formVersion.cambios.trim()) { setError('Escribe qué cambió frente a la versión anterior.'); return }
    setGuardando(true); setError('')
    try {
      const version = Math.max(manual.version_actual, ...(versiones || []).map(v => v.version)) + 1
      await subirVersion({ manual, version, archivo: formVersion.archivo, cambios: formVersion.cambios, vigenteDesde: formVersion.vigente_desde, usuarioId: perfil?.id })
      setFormVersion(null)
      onCambio(`${manual.codigo} · versión ${version} vigente`)
    } catch (e) { setError(e.message) }
    setGuardando(false)
  }

  const cambiarEstado = async () => {
    setGuardando(true)
    const { error: err } = await supabase.from('manuales').update({ activo: !manual.activo }).eq('id', manual.id)
    setGuardando(false)
    if (err) { setError(err.message); return }
    onCambio(manual.activo ? `${manual.codigo} marcado obsoleto` : `${manual.codigo} reactivado`)
  }

  const dato = (t, v) => <div><p className="text-[11.5px] text-feisen-texto-2">{t}</p><p className="text-sm text-feisen-texto">{v || '—'}</p></div>
  const boton = 'flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-feisen-borde text-sm font-medium text-feisen-texto hover:bg-feisen-fondo'

  return (
    <PanelLateral etiqueta={`Documento ${manual.titulo}`} onCerrar={onCerrar}
      encabezado={<>
        <p className="text-xs text-gray-400 tabular-nums">{manual.codigo} · {manual.area}</p>
        <h2 className="text-lg font-semibold text-feisen-texto leading-snug">{manual.titulo}</h2>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <Etiqueta clase={tipo.clase}>{tipo.texto}</Etiqueta>
          {manual.version_actual > 0 && <Etiqueta clase="bg-gray-100 text-feisen-texto-2">Versión {manual.version_actual}</Etiqueta>}
          {!manual.activo && <Etiqueta clase="bg-gray-100 text-feisen-texto-2">Obsoleto</Etiqueta>}
          {revisionVencida && <Etiqueta clase="bg-amber-50 text-amber-700">Revisión vencida</Etiqueta>}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {vigente && (
            <button type="button" onClick={() => abrir(vigente)} disabled={abriendo === vigente.id}
              className="flex items-center gap-1.5 min-h-[40px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold disabled:opacity-60">
              <FileText size={16} /> {abriendo === vigente.id ? 'Abriendo…' : 'Abrir documento'}
            </button>
          )}
          {gestiona && <button type="button" onClick={() => setFormVersion({ archivo: null, cambios: '', vigente_desde: hoy })} className={boton}><Upload size={15} /> {manual.version_actual ? 'Nueva versión' : 'Subir archivo'}</button>}
          {gestiona && <button type="button" onClick={onEditar} className={boton}><Pencil size={15} /> Editar</button>}
        </div>
      </>}>

      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}

      {formVersion && (
        <section className="space-y-3 bg-feisen-fondo border border-feisen-borde rounded-xl p-4">
          <Titulo>{manual.version_actual ? `Versión ${manual.version_actual + 1}` : 'Primer archivo'}</Titulo>
          <div><label htmlFor="mv-archivo" className={etiquetaCampo}>Archivo</label>
            <input id="mv-archivo" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*"
              onChange={e => setFormVersion(p => ({ ...p, archivo: e.target.files?.[0] || null }))}
              className="block w-full text-sm text-feisen-texto-2 file:mr-3 file:min-h-[40px] file:px-3 file:rounded-lg file:border file:border-feisen-borde file:bg-white file:text-sm file:font-medium file:text-feisen-texto" /></div>
          {manual.version_actual > 0 && (
            <div><label htmlFor="mv-cambios" className={etiquetaCampo}>Qué cambió</label>
              <textarea id="mv-cambios" rows={2} value={formVersion.cambios} onChange={e => setFormVersion(p => ({ ...p, cambios: e.target.value }))}
                placeholder="Se agregó el paso de inspección del molde" className={campo} /></div>
          )}
          <div><label htmlFor="mv-fecha" className={etiquetaCampo}>Vigente desde</label>
            <input id="mv-fecha" type="date" value={formVersion.vigente_desde} onChange={e => setFormVersion(p => ({ ...p, vigente_desde: e.target.value }))} className={campo} /></div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setFormVersion(null); setError('') }} className={boton}>Cancelar</button>
            <button type="button" onClick={guardarVersion} disabled={guardando}
              className="min-h-[40px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold disabled:opacity-50">
              {guardando ? 'Subiendo…' : 'Publicar versión'}
            </button>
          </div>
        </section>
      )}

      {manual.descripcion && <p className="text-sm text-feisen-texto whitespace-pre-line">{manual.descripcion}</p>}

      <section className="space-y-2.5">
        <Titulo>Datos</Titulo>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {dato('Responsable', manual.responsable)}
          {dato('Vigente desde', vigente && fechaLarga(vigente.vigente_desde))}
          {dato('Próxima revisión', manual.proxima_revision && `${fechaLarga(manual.proxima_revision)}${manual.activo ? ` · ${textoProxima(manual.proxima_revision)}` : ''}`)}
          {dato('Archivo', vigente && `${vigente.archivo_nombre.split('.').pop().toUpperCase()} · ${tamanoArchivo(vigente.archivo_tamano)}`)}
        </div>
      </section>

      <section className="space-y-2">
        <Titulo>Historial de versiones</Titulo>
        {versiones === null && <p className="text-sm text-feisen-texto-2">Cargando…</p>}
        {versiones?.length === 0 && (
          <p className="text-sm text-feisen-texto-2">
            {gestiona ? 'Todavía no tiene archivo. Usa «Subir archivo» para publicar la versión 1.' : 'Este documento todavía no tiene archivo publicado.'}
          </p>
        )}
        {versiones?.length > 0 && (
          <div className="border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
            {versiones.map(v => (
              <div key={v.id} className="flex items-start gap-3 px-3 py-2.5">
                <span className={`mt-0.5 shrink-0 w-9 text-center rounded-md text-xs font-semibold py-0.5 ${v.version === manual.version_actual ? 'bg-feisen-azul-suave text-feisen-azul' : 'bg-gray-100 text-feisen-texto-2'}`}>v{v.version}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-feisen-texto">{v.cambios || 'Sin descripción de cambios'}</span>
                  <span className="block text-xs text-feisen-texto-2 truncate">
                    Desde el {fechaLarga(v.vigente_desde)}{v.subido?.nombre ? ` · ${v.subido.nombre}` : ''}
                  </span>
                </span>
                <button type="button" onClick={() => abrir(v)} disabled={abriendo === v.id} aria-label={`Abrir versión ${v.version}`}
                  className="shrink-0 p-2 -m-1 rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo hover:text-feisen-azul disabled:opacity-50">
                  <Download size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {gestiona && (
        <button type="button" onClick={cambiarEstado} disabled={guardando} className={`text-sm hover:underline ${manual.activo ? 'text-feisen-rojo' : 'text-feisen-azul'}`}>
          {manual.activo ? 'Marcar obsoleto (deja de verse para los demás; su historial se conserva)' : 'Reactivar el documento'}
        </button>
      )}
    </PanelLateral>
  )
}
