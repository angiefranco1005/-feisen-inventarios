import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Spinner from '../../shared/Spinner'
import Alerta from '../../shared/Alerta'
import Modal from '../../shared/Modal'
import { FileText, Upload, Download, Trash2, ChevronDown } from '../../shared/iconos'
import * as E from '../estilos'
import { BUCKET_RRHH, TIPOS_CONTRATO, nombreCompleto, abrirArchivoRRHH } from '../catalogosRRHH'
import { CAMPOS_CONTRATO, PLANTILLA_BASE_URL, valoresContrato, llenarPlantilla, limpiarNombreArchivo } from './contratos'

// Sección "Contratos" del cargo: sus plantillas (una o varias por tipo de contrato)
// y generar el contrato de quien ocupa el cargo.
export default function ContratosCargo({ cargo, personas }) {
  const { perfil } = useAuth()
  const input = useRef(null)
  const [plantillas, setPlantillas] = useState([])
  const [cargando,   setCargando]   = useState(true)
  const [msg,        setMsg]        = useState(null)
  const [tipoSubir,  setTipoSubir]  = useState(TIPOS_CONTRATO[0])
  const [subiendo,   setSubiendo]   = useState(false)
  const [verCampos,  setVerCampos]  = useState(false)
  const [generar,    setGenerar]    = useState(null)   // { empleado_id, plantilla_id, valores, guardar }
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => { cargar() }, [cargo.id])

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase.from('cargo_plantillas_contrato').select('*').eq('cargo_id', cargo.id).order('tipo_contrato').order('created_at')
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setPlantillas(data || [])
    setCargando(false)
  }

  async function subir(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    if (!/\.docx$/i.test(file.name)) { setMsg({ tipo: 'error', texto: 'La plantilla debe ser un archivo de Word (.docx).' }); return }
    setSubiendo(true); setMsg(null)
    try {
      const path = `plantillas-contrato/${cargo.id}/${Date.now()}-${limpiarNombreArchivo(file.name)}`
      const { error } = await supabase.storage.from(BUCKET_RRHH).upload(path, file)
      if (error) throw new Error(error.message)
      const { error: e2 } = await supabase.from('cargo_plantillas_contrato').insert({
        cargo_id: cargo.id, tipo_contrato: tipoSubir, path, archivo_nombre: file.name, creado_por: perfil?.id,
      })
      if (e2) { await supabase.storage.from(BUCKET_RRHH).remove([path]); throw new Error(e2.message) }
      setMsg({ tipo: 'exito', texto: `Plantilla de "${tipoSubir}" cargada.` })
      cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    }
    setSubiendo(false)
  }

  async function eliminar(p) {
    if (!window.confirm(`¿Eliminar la plantilla "${p.archivo_nombre}"? Los contratos ya generados no se borran.`)) return
    const { error } = await supabase.from('cargo_plantillas_contrato').delete().eq('id', p.id)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    await supabase.storage.from(BUCKET_RRHH).remove([p.path])
    setPlantillas(ps => ps.filter(x => x.id !== p.id))
  }

  // Al escoger la persona se sugiere la plantilla de su tipo de contrato
  async function abrirGenerar(empleadoId) {
    setMsg(null)
    const { data: emp, error } = await supabase.from('empleados').select('*').eq('id', empleadoId).single()
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    const plantilla = plantillas.find(p => p.tipo_contrato === emp.tipo_contrato) || plantillas[0]
    setGenerar({ emp, plantilla_id: plantilla?.id || '', valores: valoresContrato(emp, cargo, plantilla?.tipo_contrato), guardar: true })
  }
  function cambiarPlantilla(id) {
    const p = plantillas.find(x => x.id === id)
    setGenerar(g => ({ ...g, plantilla_id: id, valores: { ...g.valores, tipo_contrato: (p?.tipo_contrato || '').toUpperCase() } }))
  }

  async function descargarContrato(e) {
    e.preventDefault()
    const p = plantillas.find(x => x.id === generar.plantilla_id)
    if (!p) { setMsg({ tipo: 'error', texto: 'Escoge una plantilla.' }); return }
    setTrabajando(true); setMsg(null)
    try {
      const { data: archivo, error } = await supabase.storage.from(BUCKET_RRHH).download(p.path)
      if (error) throw new Error(`No se pudo leer la plantilla: ${error.message}`)
      const blob = await llenarPlantilla(await archivo.arrayBuffer(), generar.valores)
      const nombre = `Contrato_${limpiarNombreArchivo(nombreCompleto(generar.emp))}_${new Date().toLocaleDateString('en-CA')}.docx`
      // Descargar
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = nombre; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      // Guardarlo en los documentos de la persona ("Contrato" de la lista de documentos)
      if (generar.guardar) {
        const path = `${generar.emp.id}/docs/${Date.now()}-${nombre}`
        const { error: e1 } = await supabase.storage.from(BUCKET_RRHH).upload(path, blob)
        if (e1) throw new Error(`Se descargó, pero no se guardó en sus documentos: ${e1.message}`)
        const { error: e2 } = await supabase.from('empleado_documentos')
          .insert({ empleado_id: generar.emp.id, tipo: 'Contrato', nombre, path, subido_por: perfil?.id })
        if (e2) throw new Error(`Se descargó, pero no se guardó en sus documentos: ${e2.message}`)
      }
      setMsg({ tipo: 'exito', texto: `Contrato de ${nombreCompleto(generar.emp)} generado${generar.guardar ? ' y guardado en sus documentos' : ''}.` })
      setGenerar(null)
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    }
    setTrabajando(false)
  }

  const porTipo = TIPOS_CONTRATO.map(t => [t, plantillas.filter(p => p.tipo_contrato === t)]).filter(([, l]) => l.length)

  return (
    <div className="space-y-4">
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Plantillas del cargo */}
      <div className={E.tarjeta}>
        <div className={E.cabTarjeta}>
          <h2 className={E.tituloTarj}><FileText {...E.ICONO} className={E.iconoTitulo} /> Plantillas de contrato</h2>
          <a href={PLANTILLA_BASE_URL} download="Plantilla base contrato Feisen.docx" className={`${E.btnTextoAzul} -mr-2`}>
            <Download size={14} /> Plantilla base con membrete
          </a>
        </div>
        <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 border-b border-feisen-borde-suave">
          <span className="text-sm text-feisen-texto-2">Subir plantilla para</span>
          <select value={tipoSubir} onChange={e => setTipoSubir(e.target.value)} className={`${E.input} sm:w-64`}>
            {TIPOS_CONTRATO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => input.current?.click()} disabled={subiendo} className={E.btnSecundario}>
            <Upload {...E.ICONO} /> {subiendo ? 'Subiendo…' : 'Subir Word'}
          </button>
          <input ref={input} type="file" accept=".docx" className="hidden" onChange={subir} />
        </div>
        {cargando ? <Spinner /> : porTipo.length === 0 ? (
          <p className="px-5 py-4 text-sm text-feisen-gris-medio">
            Este cargo aún no tiene plantillas. Descarga la plantilla base con membrete, escribe el contrato con los campos entre llaves y súbela aquí por tipo de contrato.
          </p>
        ) : (
          <div className="divide-y divide-feisen-borde-suave">
            {porTipo.map(([tipo, lista]) => (
              <div key={tipo} className="px-5 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2 mb-1">{tipo}</p>
                {lista.map(p => (
                  <div key={p.id} className="flex items-center gap-2 py-1">
                    <button onClick={() => abrirArchivoRRHH(p.path).catch(err => setMsg({ tipo: 'error', texto: err.message }))}
                      className="flex-1 min-w-0 text-left text-sm text-feisen-texto hover:text-feisen-azul truncate">{p.archivo_nombre}</button>
                    <button onClick={() => eliminar(p)} title="Eliminar plantilla" className="p-1.5 text-feisen-gris-medio hover:text-feisen-rojo"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setVerCampos(v => !v)} className="w-full flex items-center justify-between px-5 py-2.5 border-t border-feisen-borde-suave text-sm text-feisen-texto-2 hover:bg-feisen-fondo">
          Campos que puedes usar en la plantilla
          <ChevronDown size={14} className={`transition-transform ${verCampos ? 'rotate-180' : ''}`} />
        </button>
        {verCampos && (
          <div className="px-5 pb-4 grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {CAMPOS_CONTRATO.map(c => (
              <p key={c.k} className="text-sm"><code className="text-feisen-azul">{`{${c.k}}`}</code> <span className="text-feisen-texto-2">{c.label}</span></p>
            ))}
            <p className="sm:col-span-2 text-xs text-feisen-gris-medio mt-1">Escribe el campo tal cual, con las llaves, sin cambiarle el formato a la mitad (que toda la palabra quede con la misma letra).</p>
          </div>
        )}
      </div>

      {/* Generar contrato de quien ocupa el cargo */}
      <div className={E.tarjeta}>
        <div className={E.cabTarjeta}>
          <h2 className={E.tituloTarj}><FileText {...E.ICONO} className={E.iconoTitulo} /> Generar contrato</h2>
        </div>
        {personas.length === 0
          ? <p className="px-5 py-4 text-sm text-feisen-gris-medio">Nadie ocupa este cargo todavía.</p>
          : <div className="divide-y divide-feisen-borde-suave">
              {personas.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-feisen-texto truncate">{nombreCompleto(p)}</p>
                    <p className="text-xs text-feisen-gris-medio">{p.tipo_contrato || 'Sin tipo de contrato'}</p>
                  </div>
                  <button onClick={() => abrirGenerar(p.id)} disabled={!plantillas.length} title={plantillas.length ? '' : 'Primero sube una plantilla'} className={E.btnSecundario}>
                    <FileText {...E.ICONO} /> Generar
                  </button>
                </div>
              ))}
            </div>}
      </div>

      {generar && (
        <Modal titulo={`Contrato de ${nombreCompleto(generar.emp)}`} onCerrar={() => !trabajando && setGenerar(null)}>
          <form onSubmit={descargarContrato} className="space-y-3">
            <div>
              <label className={E.labelForm}>Plantilla *</label>
              <select required value={generar.plantilla_id} onChange={e => cambiarPlantilla(e.target.value)} className={E.input}>
                {plantillas.map(p => <option key={p.id} value={p.id}>{p.tipo_contrato} · {p.archivo_nombre}</option>)}
              </select>
              {plantillas.find(p => p.id === generar.plantilla_id)?.tipo_contrato !== generar.emp.tipo_contrato && (
                <p className="text-xs text-amber-700 mt-1">Ojo: en la ficha su contrato es "{generar.emp.tipo_contrato || 'sin definir'}".</p>
              )}
            </div>
            <p className="text-xs text-feisen-gris-medio">Estos datos salen de la ficha y del cargo. Corrige o completa lo que haga falta; los cambios solo van en este contrato.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {CAMPOS_CONTRATO.map(c => (
                <div key={c.k} className={c.largo ? 'sm:col-span-2' : ''}>
                  <label className={E.labelForm}>{c.label}</label>
                  {c.largo
                    ? <textarea rows={4} value={generar.valores[c.k] || ''} onChange={e => setGenerar(g => ({ ...g, valores: { ...g.valores, [c.k]: e.target.value } }))} className={E.input} />
                    : <input value={generar.valores[c.k] || ''} onChange={e => setGenerar(g => ({ ...g, valores: { ...g.valores, [c.k]: e.target.value } }))}
                        className={`${E.input} ${generar.valores[c.k] ? '' : 'border-amber-300'}`} />}
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2.5 text-sm text-feisen-texto cursor-pointer">
              <input type="checkbox" checked={generar.guardar} onChange={e => setGenerar(g => ({ ...g, guardar: e.target.checked }))} className="w-4 h-4 accent-feisen-azul" />
              Guardarlo en sus documentos (Contrato)
            </label>
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={trabajando} onClick={() => setGenerar(null)} className={`${E.btnSecundario} flex-1`}>Cancelar</button>
              <button type="submit" disabled={trabajando} className={`${E.btnPrimario} flex-1`}><Download {...E.ICONO} /> {trabajando ? 'Generando…' : 'Descargar contrato'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
