import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PanelLateral } from '../shared/ui'
import { Check, Download, Eye, FileText, Pencil, Send, Upload, X } from '../shared/iconos'
import { Etiqueta, Titulo, campo, etiquetaCampo, fechaCorta, hoyCol, textoProxima } from '../mantenimiento/comun'
import {
  ESTADOS_VERSION, SELECT_VERSION, TIPOS, abrirArchivo, accionVersion, crearBorrador, descartarBorrador, dirigidoA,
  ponerNombres, reemplazarArchivo, tamanoArchivo,
} from './comun'

const fechaLarga = f => f ? `${fechaCorta(f)} ${f.slice(0, 4)}` : '—'
const inputArchivo = 'block w-full text-sm text-feisen-texto-2 file:mr-3 file:min-h-[40px] file:px-3 file:rounded-lg file:border file:border-feisen-borde file:bg-white file:text-sm file:font-medium file:text-feisen-texto'
const ACEPTA = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*'

// Ficha de un documento: versión vigente, la versión en trámite (elaboró → revisó → aprobó) con
// las acciones que le tocan a cada quien, «leído y entendido» de la versión vigente (y para
// nivel 'todo', quién falta por leerla) e historial de versiones aprobadas.
// Elabora: nivel 'registra' o 'todo' · Revisa / devuelve: 'todo' (no quien elaboró) · Aprueba: ADMIN.
export default function FichaManual({ manual, onCerrar, onEditar, onCambio }) {
  const { perfil, nivel, esAdmin, rolEfectivo } = useAuth()
  const niv = nivel('manuales')
  const gestiona = niv === 'todo'
  const elabora = niv === 'registra' || niv === 'todo'
  const [versiones, setVersiones] = useState(null)
  const [error, setError] = useState('')
  const [abriendo, setAbriendo] = useState(null)
  const [formVersion, setFormVersion] = useState(null) // null | { archivo, cambios, vigente_desde }
  const [devolviendo, setDevolviendo] = useState(null) // null | comentario
  const [guardando, setGuardando] = useState(false)
  const [miLectura, setMiLectura] = useState(undefined) // undefined = cargando · null = no la he leído
  const [lectores, setLectores] = useState(null)        // nivel 'todo': [{ nombre, rol, leido_at }]
  const [verLectores, setVerLectores] = useState(false)

  useEffect(() => {
    let vivo = true
    supabase.from('manual_versiones').select(SELECT_VERSION)
      .eq('manual_id', manual.id).order('version', { ascending: false })
      .then(async ({ data, error: err }) => {
        const conNombres = await ponerNombres(data || [])
        if (!vivo) return
        if (err) setError(err.message)
        setVersiones(conNombres)
      })
    return () => { vivo = false }
  }, [manual.id, manual.version_actual, manual.tramite])

  const vigente = versiones?.find(v => v.version === manual.version_actual && v.estado === 'aprobada')
  const meToca = dirigidoA(manual, rolEfectivo) && manual.activo

  useEffect(() => {
    if (!vigente) return
    let vivo = true
    supabase.from('manual_lecturas').select('leido_at').eq('version_id', vigente.id).eq('usuario_id', perfil?.id).maybeSingle()
      .then(({ data }) => { if (vivo) setMiLectura(data || null) })
    if (gestiona) supabase.rpc('manual_lecturas_estado', { p_manual: manual.id }).then(({ data }) => { if (vivo) setLectores(data || []) })
    return () => { vivo = false }
  }, [vigente?.id, perfil?.id, gestiona, manual.id])

  const confirmarLectura = () => hacer(async () => {
    const { error: err } = await supabase.from('manual_lecturas').insert({ version_id: vigente.id, usuario_id: perfil?.id })
    if (err) throw new Error(err.message)
    setMiLectura({ leido_at: new Date().toISOString() })
  }, `Lectura de ${manual.codigo} v${manual.version_actual} confirmada`)
  const tramite = versiones?.find(v => v.estado !== 'aprobada')
  const aprobadas = (versiones || []).filter(v => v.estado === 'aprobada')
  const tipo = TIPOS[manual.tipo]
  const hoy = hoyCol()
  const revisionVencida = manual.activo && manual.proxima_revision && manual.proxima_revision < hoy

  const hacer = async (fn, mensaje) => {
    setGuardando(true); setError('')
    try { await fn(); onCambio(mensaje) } catch (e) { setError(e.message) }
    setGuardando(false)
  }

  const abrir = async v => {
    setAbriendo(v.id); setError('')
    try { await abrirArchivo(v.archivo_path) } catch (e) { setError(`No se pudo abrir: ${e.message}`) }
    setAbriendo(null)
  }

  const guardarBorrador = () => {
    if (!formVersion.archivo) { setError('Elige el archivo de la nueva versión.'); return }
    if (aprobadas.length > 0 && !formVersion.cambios.trim()) { setError('Escribe qué cambió frente a la versión vigente.'); return }
    const version = Math.max(0, ...(versiones || []).map(v => v.version)) + 1
    hacer(async () => {
      await crearBorrador({ manual, version, archivo: formVersion.archivo, cambios: formVersion.cambios || (version === 1 ? 'Versión inicial' : ''), vigenteDesde: formVersion.vigente_desde || null, usuarioId: perfil?.id })
      setFormVersion(null)
    }, `${manual.codigo} · borrador v${version} creado`)
  }

  const cambiarEstado = () => hacer(async () => {
    const { error: err } = await supabase.from('manuales').update({ activo: !manual.activo }).eq('id', manual.id)
    if (err) throw new Error(err.message)
  }, manual.activo ? `${manual.codigo} marcado obsoleto` : `${manual.codigo} reactivado`)

  const dato = (t, v) => <div><p className="text-[11.5px] text-feisen-texto-2">{t}</p><p className="text-sm text-feisen-texto">{v || '—'}</p></div>
  const boton = 'flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-50'
  const principal = 'flex items-center gap-1.5 min-h-[40px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold disabled:opacity-50'

  // Pasos elaboró → revisó → aprobó de una versión
  const Firmas = ({ v }) => {
    const paso = (titulo, quien, cuando, hecho) => (
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 w-4 h-4 rounded-full grid place-items-center shrink-0 ${hecho ? 'bg-emerald-600 text-white' : 'border border-feisen-borde bg-white'}`}>
          {hecho && <Check size={10} strokeWidth={3} />}
        </span>
        <span className="min-w-0">
          <span className="block text-[11.5px] text-feisen-texto-2">{titulo}</span>
          <span className="block text-sm text-feisen-texto truncate">{hecho ? quien || '—' : 'Pendiente'}</span>
          {hecho && cuando && <span className="block text-xs text-feisen-texto-2">{fechaLarga(cuando.slice(0, 10))}</span>}
        </span>
      </div>
    )
    if (v.aprobado_externo) return <p className="text-xs text-feisen-texto-2">Aprobado fuera del sistema (en papel) · cargado por {v.aprobo?.nombre || '—'} el {fechaLarga(v.aprobado_at?.slice(0, 10))}</p>
    return (
      <div className="grid grid-cols-3 gap-3">
        {paso('Elaboró', v.elaboro?.nombre, v.created_at, true)}
        {paso('Revisó', v.reviso?.nombre, v.revisado_at, !!v.revisado_at)}
        {paso('Aprobó', v.aprobo?.nombre, v.aprobado_at, v.estado === 'aprobada')}
      </div>
    )
  }

  // Acciones sobre la versión en trámite según el rol y el estado
  const accionesTramite = v => {
    const mio = v.subido_por === perfil?.id
    const a = []
    if (v.estado === 'borrador' && (mio || gestiona)) {
      a.push(<button key="enviar" type="button" disabled={guardando} className={principal}
        onClick={() => hacer(() => accionVersion(v.id, 'enviar'), `v${v.version} enviada a revisión`)}><Send size={15} /> Enviar a revisión</button>)
      a.push(<label key="archivo" className={`${boton} cursor-pointer`}><Upload size={15} /> Cambiar archivo
        <input type="file" accept={ACEPTA} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) hacer(() => reemplazarArchivo(v, f), 'Archivo del borrador cambiado') }} /></label>)
      if (esAdmin) a.push(<button key="cargar" type="button" disabled={guardando} className={boton}
        onClick={() => hacer(() => accionVersion(v.id, 'cargar_aprobado'), `v${v.version} cargada como aprobada`)}>Ya está aprobado en papel</button>)
      a.push(<button key="descartar" type="button" disabled={guardando} className="text-sm text-feisen-rojo hover:underline px-1"
        onClick={() => hacer(() => descartarBorrador(v), `Borrador v${v.version} descartado`)}>Descartar borrador</button>)
    }
    if (v.estado === 'en_revision' && !mio && esAdmin) {
      a.push(<button key="aprobar" type="button" disabled={guardando} className={principal}
        onClick={() => hacer(() => accionVersion(v.id, 'aprobar'), `${manual.codigo} v${v.version} aprobada y vigente`)}><Check size={15} /> Revisar y aprobar</button>)
    } else if (v.estado === 'en_revision' && !mio && gestiona) {
      a.push(<button key="revisar" type="button" disabled={guardando} className={principal}
        onClick={() => hacer(() => accionVersion(v.id, 'revisar'), `v${v.version} revisada · pasa a aprobación`)}><Check size={15} /> Marcar revisada</button>)
    }
    if (v.estado === 'revisada' && esAdmin) {
      a.push(<button key="aprobar" type="button" disabled={guardando} className={principal}
        onClick={() => hacer(() => accionVersion(v.id, 'aprobar'), `${manual.codigo} v${v.version} aprobada y vigente`)}><Check size={15} /> Aprobar</button>)
    }
    if ((v.estado === 'en_revision' || v.estado === 'revisada') && gestiona && !(v.estado === 'en_revision' && mio)) {
      a.push(<button key="devolver" type="button" disabled={guardando} className={boton} onClick={() => setDevolviendo('')}><X size={15} /> Devolver</button>)
    }
    return a
  }

  const enEspera = v => {
    if (v.estado === 'borrador') return v.subido_por === perfil?.id ? 'Cuando esté listo, envíalo a revisión.' : `Borrador de ${v.elaboro?.nombre || 'otra persona'}; todavía no lo envía a revisión.`
    if (v.estado === 'en_revision') return v.subido_por === perfil?.id ? 'Esperando que otra persona lo revise.' : 'Esperando revisión.'
    if (v.estado === 'revisada') return 'Revisado; falta la aprobación de gerencia.'
    return ''
  }

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
            <button type="button" onClick={() => abrir(vigente)} disabled={abriendo === vigente.id} className={principal}>
              <FileText size={16} /> {abriendo === vigente.id ? 'Abriendo…' : 'Abrir documento'}
            </button>
          )}
          {elabora && manual.activo && versiones && !tramite && !formVersion && (
            <button type="button" onClick={() => setFormVersion({ archivo: null, cambios: '', vigente_desde: '' })} className={boton}>
              <Upload size={15} /> {aprobadas.length ? 'Nueva versión' : 'Subir borrador'}
            </button>
          )}
          {gestiona && <button type="button" onClick={onEditar} className={boton}><Pencil size={15} /> Editar</button>}
        </div>
      </>}>

      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}

      {vigente && meToca && miLectura !== undefined && (miLectura ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <Check size={15} /> Leíste y entendiste la versión {manual.version_actual} el {fechaLarga(miLectura.leido_at.slice(0, 10))}
        </p>
      ) : (
        <section className="flex flex-col sm:flex-row sm:items-center gap-3 bg-feisen-azul-suave rounded-xl p-4">
          <p className="flex-1 text-sm text-feisen-texto">
            <b className="font-semibold">Este documento va dirigido a tu cargo.</b> Ábrelo, léelo y confirma que lo entendiste.
          </p>
          <button type="button" onClick={confirmarLectura} disabled={guardando} className={principal}>
            <Eye size={15} /> Leído y entendido
          </button>
        </section>
      ))}

      {formVersion && (
        <section className="space-y-3 bg-feisen-fondo border border-feisen-borde rounded-xl p-4">
          <Titulo>Borrador de la versión {Math.max(0, ...(versiones || []).map(v => v.version)) + 1}</Titulo>
          <div><label htmlFor="mv-archivo" className={etiquetaCampo}>Archivo</label>
            <input id="mv-archivo" type="file" accept={ACEPTA} onChange={e => setFormVersion(p => ({ ...p, archivo: e.target.files?.[0] || null }))} className={inputArchivo} /></div>
          {aprobadas.length > 0 && (
            <div><label htmlFor="mv-cambios" className={etiquetaCampo}>Qué cambió</label>
              <textarea id="mv-cambios" rows={2} value={formVersion.cambios} onChange={e => setFormVersion(p => ({ ...p, cambios: e.target.value }))}
                placeholder="Se agregó el paso de inspección del molde" className={campo} /></div>
          )}
          <div><label htmlFor="mv-fecha" className={etiquetaCampo}>Vigente desde <span className="font-normal text-feisen-texto-2">(opcional)</span></label>
            <input id="mv-fecha" type="date" value={formVersion.vigente_desde} onChange={e => setFormVersion(p => ({ ...p, vigente_desde: e.target.value }))} className={campo} />
            <p className="text-xs text-feisen-texto-2 mt-1">Si lo dejas vacío, rige desde el día en que se apruebe.</p></div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setFormVersion(null); setError('') }} className={boton}>Cancelar</button>
            <button type="button" onClick={guardarBorrador} disabled={guardando} className={principal}>{guardando ? 'Subiendo…' : 'Guardar borrador'}</button>
          </div>
        </section>
      )}

      {tramite && (
        <section className="space-y-3 border border-feisen-borde rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <Titulo>Versión {tramite.version} en trámite</Titulo>
            <Etiqueta clase={ESTADOS_VERSION[tramite.estado].clase} punto>{ESTADOS_VERSION[tramite.estado].texto}</Etiqueta>
          </div>
          {tramite.comentario_revision && tramite.estado === 'borrador' && (
            <div className="text-sm bg-amber-50 text-amber-800 rounded-lg px-3 py-2">
              <p className="font-semibold">Devuelto para corregir</p>
              <p className="whitespace-pre-line">{tramite.comentario_revision}</p>
            </div>
          )}
          <button type="button" onClick={() => abrir(tramite)} disabled={abriendo === tramite.id}
            className="w-full flex items-center gap-2 text-left text-sm text-feisen-azul hover:underline disabled:opacity-50">
            <FileText size={16} /> <span className="truncate">{tramite.archivo_nombre}</span>
            <span className="text-xs text-feisen-texto-2 shrink-0">{tamanoArchivo(tramite.archivo_tamano)}</span>
          </button>
          {tramite.cambios && <p className="text-sm text-feisen-texto">{tramite.cambios}</p>}
          <Firmas v={tramite} />
          <p className="text-xs text-feisen-texto-2">{enEspera(tramite)}</p>
          {devolviendo !== null ? (
            <div className="space-y-2">
              <label htmlFor="mv-devolver" className={etiquetaCampo}>Qué hay que corregir</label>
              <textarea id="mv-devolver" rows={3} value={devolviendo} onChange={e => setDevolviendo(e.target.value)} className={campo} autoFocus />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setDevolviendo(null)} className={boton}>Cancelar</button>
                <button type="button" disabled={guardando || !devolviendo.trim()} className={principal}
                  onClick={() => hacer(async () => { await accionVersion(tramite.id, 'devolver', devolviendo); setDevolviendo(null) }, `v${tramite.version} devuelta a ${tramite.elaboro?.nombre || 'quien la elaboró'}`)}>
                  Devolver
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">{accionesTramite(tramite)}</div>
          )}
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
        {vigente && <Firmas v={vigente} />}
      </section>

      {gestiona && vigente && lectores && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <Titulo>Lectura de la versión {manual.version_actual}</Titulo>
            <span className="text-xs text-feisen-texto-2">{manual.dirigido_a?.length ? `Para: ${manual.dirigido_a.length} ${manual.dirigido_a.length === 1 ? 'cargo' : 'cargos'}` : 'Para: todos'}</span>
          </div>
          {lectores.length === 0 ? <p className="text-sm text-feisen-texto-2">No hay personas activas en los cargos a los que va dirigido.</p> : <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-emerald-600" style={{ width: `${(lectores.filter(l => l.leido_at).length / lectores.length) * 100}%` }} />
              </div>
              <span className="text-sm tabular-nums text-feisen-texto">{lectores.filter(l => l.leido_at).length} de {lectores.length}</span>
            </div>
            <button type="button" onClick={() => setVerLectores(v => !v)} className="text-sm text-feisen-azul font-medium">
              {verLectores ? 'Ocultar personas' : lectores.some(l => !l.leido_at) ? `Ver quién falta (${lectores.filter(l => !l.leido_at).length})` : 'Ver quién leyó'}
            </button>
            {verLectores && (
              <div className="border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
                {lectores.map(l => (
                  <div key={l.usuario_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-feisen-texto">{l.nombre}</span>
                    <span className={`shrink-0 text-xs ${l.leido_at ? 'text-emerald-700' : 'text-feisen-texto-2'}`}>{l.leido_at ? `Leído el ${fechaLarga(l.leido_at.slice(0, 10))}` : 'Pendiente'}</span>
                  </div>
                ))}
              </div>
            )}
          </>}
        </section>
      )}

      <section className="space-y-2">
        <Titulo>Historial de versiones aprobadas</Titulo>
        {versiones === null && <p className="text-sm text-feisen-texto-2">Cargando…</p>}
        {versiones && aprobadas.length === 0 && (
          <p className="text-sm text-feisen-texto-2">
            {tramite ? 'Ninguna versión aprobada todavía; la de arriba está en trámite.'
              : elabora ? 'Todavía no tiene archivo. Usa «Subir borrador» para empezar la versión 1.' : 'Este documento todavía no tiene una versión aprobada.'}
          </p>
        )}
        {aprobadas.length > 0 && (
          <div className="border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
            {aprobadas.map(v => (
              <div key={v.id} className="flex items-start gap-3 px-3 py-2.5">
                <span className={`mt-0.5 shrink-0 w-9 text-center rounded-md text-xs font-semibold py-0.5 ${v.version === manual.version_actual ? 'bg-feisen-azul-suave text-feisen-azul' : 'bg-gray-100 text-feisen-texto-2'}`}>v{v.version}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-feisen-texto">{v.cambios || 'Sin descripción de cambios'}</span>
                  <span className="block text-xs text-feisen-texto-2 truncate">
                    Desde el {fechaLarga(v.vigente_desde)}{v.version !== manual.version_actual ? ' · obsoleta' : ''}
                    {v.aprobado_externo ? ' · aprobada en papel' : v.aprobo?.nombre ? ` · aprobó ${v.aprobo.nombre}` : ''}
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
