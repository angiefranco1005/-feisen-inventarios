import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import Spinner from '../../shared/Spinner'
import Modal from '../../shared/Modal'
import Alerta from '../../shared/Alerta'
import { ArrowLeft, Plus, Target, Sparkles, Pencil, AlertTriangle, Trash2 } from '../../shared/iconos'
import * as E from '../estilos'
import { nombreCompleto } from '../catalogosRRHH'
import { ESTADOS_KPI, HAY_DATO } from './desempenoCalculo'
import { aniosPlan, cargarPlan } from './datosPlanJefes'

const KPI_VACIO = { nombre: '', formula: '', peso: '', frecuencia: 'Mensual (calificación trimestral)', linea_base: '', meta: '', minimo: '',
  hay_dato: 'no', fuente_dato: '', que_falta: '', estado: 'borrador', notas: '', peso_sin_encuesta: '', quien_califica: '' }
const AREA_VACIA = { nombre: '', codigo: '', empleado_id: '', aporte: '', reglas: '', pendientes: '' }
const sumaPesos = (items, campo = 'peso') => items.reduce((t, i) => t + (Number(i[campo]) || 0), 0)
const area_ = 'disabled:bg-feisen-fondo'

// Plan de evaluación de jefes de área: KPIs por área y competencias comunes, editables
export default function PlanJefes() {
  const navigate = useNavigate()
  const [anios,    setAnios]    = useState([])
  const [anio,     setAnio]     = useState(null)
  const [plan,     setPlan]     = useState([])
  const [emps,     setEmps]     = useState([])
  const [cargando, setCargando] = useState(true)
  const [msg,      setMsg]      = useState(null)
  const [editItem, setEditItem] = useState(null)   // { area, item }
  const [editArea, setEditArea] = useState(null)   // área (o nueva)
  const [guardando, setGuardando] = useState(false)
  const [errModal, setErrModal] = useState(null)

  useEffect(() => {
    (async () => {
      const [as, { data: es }] = await Promise.all([
        aniosPlan(),
        supabase.from('empleados').select('id, nombres, apellidos, cargo').neq('estado', 'retirado').order('nombres'),
      ])
      setEmps(es || [])
      const lista = as.length ? as : [new Date().getFullYear() + 1]
      setAnios(lista); setAnio(lista[0])
    })()
  }, [])
  useEffect(() => { if (anio) recargar() }, [anio])

  async function recargar() {
    setCargando(true)
    try { setPlan(await cargarPlan(anio)) } catch (e) { setMsg({ tipo: 'error', texto: e.message }) }
    setCargando(false)
  }

  const empPorId = new Map(emps.map(e => [e.id, e]))
  const comun = plan.find(a => a.es_comun)
  const areas = plan.filter(a => !a.es_comun)

  // ── Guardar un KPI o competencia ──
  async function guardarItem(e) {
    e.preventDefault(); setErrModal(null); setGuardando(true)
    const { area, item } = editItem
    const esComp = area.es_comun
    const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
    const fila = {
      nombre: item.nombre.trim(), formula: item.formula?.trim() || null, peso: num(item.peso) ?? 0,
      frecuencia: item.frecuencia?.trim() || null, linea_base: item.linea_base?.trim() || null,
      meta: item.meta?.trim() || null, minimo: item.minimo?.trim() || null, hay_dato: item.hay_dato || null,
      fuente_dato: item.fuente_dato?.trim() || null, que_falta: item.que_falta?.trim() || null,
      estado: item.estado || 'borrador', notas: item.notas?.trim() || null,
      tipo: esComp ? 'competencia' : 'kpi',
      peso_sin_encuesta: esComp ? num(item.peso_sin_encuesta) ?? 0 : null,
      quien_califica: esComp ? item.quien_califica?.trim() || null : null,
    }
    const { error } = item.id
      ? await supabase.from('desempeno_jefes_items').update(fila).eq('id', item.id)
      : await supabase.from('desempeno_jefes_items').insert({ ...fila, area_id: area.id, orden: area.items.length + 1 })
    setGuardando(false)
    if (error) { setErrModal(error.message); return }
    setEditItem(null); recargar()
  }

  async function borrarItem() {
    const { item } = editItem
    if (!window.confirm(`¿Eliminar "${item.nombre}" del plan? Los ciclos ya creados no cambian.`)) return
    const { error } = await supabase.from('desempeno_jefes_items').delete().eq('id', item.id)
    if (error) { setErrModal(error.message); return }
    setEditItem(null); recargar()
  }

  // ── Guardar la ficha de un área ──
  async function guardarArea(e) {
    e.preventDefault(); setErrModal(null); setGuardando(true)
    const a = editArea
    const fila = {
      nombre: a.nombre.trim(), codigo: a.codigo.trim().toUpperCase(), empleado_id: a.empleado_id || null,
      aporte: a.aporte?.trim() || null, reglas: a.reglas?.trim() || null, pendientes: a.pendientes?.trim() || null,
    }
    const { error } = a.id
      ? await supabase.from('desempeno_jefes_areas').update(fila).eq('id', a.id)
      : await supabase.from('desempeno_jefes_areas').insert({ ...fila, anio, es_comun: false, orden: plan.length + 1 })
    setGuardando(false)
    if (error) { setErrModal(error.message.includes('duplicate') ? 'Ya hay un área con ese código en este año.' : error.message); return }
    setEditArea(null); recargar()
  }

  async function borrarArea() {
    if (!window.confirm(`¿Eliminar el área "${editArea.nombre}" y sus ${editArea.items?.length || 0} KPIs del plan ${anio}?`)) return
    const { error } = await supabase.from('desempeno_jefes_areas').delete().eq('id', editArea.id)
    if (error) { setErrModal(error.message); return }
    setEditArea(null); recargar()
  }

  // Copiar el plan a otro año (para arrancar el siguiente con lo del anterior)
  async function copiarAnio() {
    const destino = anio + 1
    if (anios.includes(destino)) { setAnio(destino); return }
    if (!window.confirm(`¿Crear el plan ${destino} copiando el de ${anio}? Los KPIs quedan en borrador.`)) return
    setCargando(true)
    try {
      for (const a of plan) {
        const { items, desempeno_jefes_items, id, created_at, updated_at, ...resto } = a
        const { data: nueva, error } = await supabase.from('desempeno_jefes_areas').insert({ ...resto, anio: destino }).select('id').single()
        if (error) throw error
        if (items.length) {
          const { error: e2 } = await supabase.from('desempeno_jefes_items').insert(items.map(({ id: _i, area_id, created_at: _c, updated_at: _u, ...it }) => ({ ...it, area_id: nueva.id, estado: 'borrador' })))
          if (e2) throw e2
        }
      }
      setAnios(x => [destino, ...x]); setAnio(destino)
    } catch (e) { setMsg({ tipo: 'error', texto: e.message }); setCargando(false) }
  }

  const abrirItem = (area, item) => { setErrModal(null); setEditItem({ area, item: item ? { ...KPI_VACIO, ...Object.fromEntries(Object.entries(item).map(([k, v]) => [k, v ?? ''])) } : { ...KPI_VACIO } }) }
  const abrirArea = (area) => { setErrModal(null); setEditArea(area ? { ...AREA_VACIA, ...Object.fromEntries(Object.entries(area).map(([k, v]) => [k, v ?? ''])) } : { ...AREA_VACIA }) }
  const setI = (k) => (e) => setEditItem(x => ({ ...x, item: { ...x.item, [k]: e.target.value } }))
  const setA = (k) => (e) => setEditArea(x => ({ ...x, [k]: e.target.value }))

  const Chip = ({ estado }) => <span className={`text-[11px] px-2 py-0.5 rounded-full ${ESTADOS_KPI[estado]?.clase || ''}`}>{ESTADOS_KPI[estado]?.label || estado}</span>

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <button onClick={() => navigate('/rrhh/desempeno')} className={`${E.btnTexto} -ml-2.5`}><ArrowLeft {...E.ICONO} /> Desempeño</button>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>Plan de evaluación de jefes</h1>
          <p className={E.subtituloPagina}>Nota de cada jefe = KPIs de su área × 60 % + competencias comunes × 40 %. Se evalúa por trimestre.</p>
        </div>
        <div className="flex gap-2">
          <select value={anio || ''} onChange={e => setAnio(Number(e.target.value))} className={`${E.input} w-28`}>
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={copiarAnio} disabled={cargando || !plan.length} className={E.btnSecundario} title="Crea el plan del año siguiente copiando este">Copiar a {anio ? anio + 1 : ''}</button>
          <button onClick={() => abrirArea(null)} className={E.btnPrimario}><Plus {...E.ICONO} /> Área</button>
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {cargando ? <Spinner /> : (
        <>
          {/* Competencias comunes */}
          {comun && (() => {
            const comps = comun.items
            const sCon = sumaPesos(comps), sSin = sumaPesos(comps, 'peso_sin_encuesta')
            return (
              <div className={E.tarjeta}>
                <div className={E.cabTarjeta}>
                  <h2 className={E.tituloTarj}><Sparkles {...E.ICONO} className={E.iconoTitulo} /> {comun.nombre}</h2>
                  <div className="flex gap-1">
                    <button onClick={() => abrirArea(comun)} className={E.btnTexto}><Pencil size={14} /> Reglas</button>
                    <button onClick={() => abrirItem(comun, null)} className={E.btnTextoAzul}><Plus size={14} /> Competencia</button>
                  </div>
                </div>
                <div className="hidden md:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_6.5rem_6.5rem_minmax(0,1fr)_5.5rem] gap-3 px-5 py-2 text-xs text-feisen-gris-medio border-b border-feisen-borde-suave">
                  <span>Competencia</span><span>Quién califica</span><span className="text-right">Jun. y dic.</span><span className="text-right">Mar. y sep.</span><span>Frecuencia</span><span>Estado</span>
                </div>
                <div className="divide-y divide-feisen-borde-suave">
                  {comps.map(c => (
                    <button key={c.id} onClick={() => abrirItem(comun, c)} className="w-full grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_6.5rem_6.5rem_minmax(0,1fr)_5.5rem] gap-x-3 gap-y-0.5 items-center px-5 py-2.5 text-left hover:bg-feisen-fondo">
                      <span className="text-sm font-medium text-feisen-texto">{c.nombre}</span>
                      <span className="text-xs text-feisen-texto-2">{c.quien_califica || '—'}</span>
                      <span className="text-sm text-feisen-texto md:text-right">{Number(c.peso)}%<span className="md:hidden text-xs text-feisen-gris-medio"> con encuesta</span></span>
                      <span className="text-sm text-feisen-texto md:text-right">{Number(c.peso_sin_encuesta || 0)}%<span className="md:hidden text-xs text-feisen-gris-medio"> sin encuesta</span></span>
                      <span className="text-xs text-feisen-texto-2 truncate" title={c.frecuencia}>{c.frecuencia || '—'}</span>
                      <span><Chip estado={c.estado} /></span>
                    </button>
                  ))}
                </div>
                <p className={`px-5 py-2.5 text-xs border-t border-feisen-borde-suave ${sCon === 100 && sSin === 100 ? 'text-feisen-gris-medio' : 'text-amber-700'}`}>
                  Pesos dentro del 40 %: trimestres con encuesta suman {sCon}% · sin encuesta suman {sSin}%{sCon === 100 && sSin === 100 ? '.' : ' (deben sumar 100 %).'}
                </p>
              </div>
            )
          })()}

          {/* Áreas */}
          {areas.length === 0 && <div className={`${E.tarjeta} py-10 text-center text-sm text-feisen-gris-medio`}>No hay áreas en el plan {anio}.</div>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {areas.map(a => {
              const kpis = a.items.filter(i => i.tipo === 'kpi')
              const suma = sumaPesos(kpis)
              const jefe = empPorId.get(a.empleado_id)
              return (
                <div key={a.id} className={`${E.tarjeta} flex flex-col`}>
                  <div className={E.cabTarjeta}>
                    <div className="min-w-0">
                      <h2 className={E.tituloTarj}><Target {...E.ICONO} className={E.iconoTitulo} /> {a.nombre} <span className="text-xs font-normal text-feisen-gris-medio">{a.codigo}</span></h2>
                      <p className={`text-xs mt-0.5 ${jefe ? 'text-feisen-texto-2' : 'text-amber-700'}`}>{jefe ? `${nombreCompleto(jefe)} · ${jefe.cargo || ''}` : 'Sin jefe asignado: no entra a los ciclos'}</p>
                    </div>
                    <button onClick={() => abrirArea(a)} className={E.btnTexto}><Pencil size={14} /> Ficha</button>
                  </div>
                  {a.aporte && <p className="px-5 pt-3 text-xs text-feisen-texto-2">{a.aporte}</p>}
                  <div className="divide-y divide-feisen-borde-suave flex-1">
                    {kpis.map(k => (
                      <button key={k.id} onClick={() => abrirItem(a, k)} className="w-full px-5 py-2.5 text-left hover:bg-feisen-fondo">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-feisen-texto">{k.nombre}</p>
                          <span className="text-sm text-feisen-texto whitespace-nowrap">{Number(k.peso)}%</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-feisen-texto-2">
                          <span>Meta: <span className="text-feisen-texto">{k.meta || 'por definir'}</span></span>
                          {k.minimo && <span>Mínimo: {k.minimo}</span>}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px]">
                          <Chip estado={k.estado} />
                          {k.hay_dato && <span className={HAY_DATO[k.hay_dato]?.clase}>Dato: {HAY_DATO[k.hay_dato]?.corto}</span>}
                          {k.frecuencia && <span className="text-feisen-gris-medio truncate">{k.frecuencia}</span>}
                        </div>
                      </button>
                    ))}
                    {kpis.length === 0 && <p className="px-5 py-3 text-sm text-feisen-gris-medio">Sin KPIs todavía.</p>}
                  </div>
                  <div className="px-5 py-2.5 border-t border-feisen-borde-suave flex items-center justify-between gap-2">
                    <span className={`text-xs inline-flex items-center gap-1 ${suma === 100 && kpis.length <= 3 ? 'text-feisen-gris-medio' : 'text-amber-700'}`}>
                      {(suma !== 100 || kpis.length > 3) && <AlertTriangle size={13} />}
                      {kpis.length} de 3 KPIs · pesos suman {suma}%
                    </span>
                    <button onClick={() => abrirItem(a, null)} className={`${E.btnTextoAzul} -mr-2`}><Plus size={14} /> KPI</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Modal KPI / competencia */}
      {editItem && (() => {
        const esComp = editItem.area.es_comun
        const it = editItem.item
        return (
          <Modal titulo={`${it.id ? 'Editar' : 'Nuevo'} ${esComp ? 'competencia' : 'KPI'} · ${editItem.area.nombre}`} onCerrar={() => !guardando && setEditItem(null)}>
            <form onSubmit={guardarItem} className="space-y-3">
              {errModal && <Alerta tipo="error" mensaje={errModal} />}
              <div><label className={E.labelForm}>Nombre *</label><input required value={it.nombre} onChange={setI('nombre')} className={E.input} /></div>
              <div><label className={E.labelForm}>{esComp ? 'Cómo se mide (preguntas y escala)' : 'Fórmula'}</label><textarea rows={3} value={it.formula} onChange={setI('formula')} className={E.input} /></div>
              {esComp ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={E.labelForm}>Peso en jun. y dic. (%)</label><input type="number" min="0" max="100" step="any" value={it.peso} onChange={setI('peso')} className={E.input} /></div>
                    <div><label className={E.labelForm}>Peso en mar. y sep. (%)</label><input type="number" min="0" max="100" step="any" value={it.peso_sin_encuesta} onChange={setI('peso_sin_encuesta')} className={E.input} /></div>
                  </div>
                  <p className="text-[11px] text-feisen-gris-medio -mt-1">% dentro del 40 % de competencias. Con 0 no se evalúa en esos trimestres.</p>
                  <div><label className={E.labelForm}>Quién califica</label><input value={it.quien_califica} onChange={setI('quien_califica')} className={E.input} /></div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={E.labelForm}>Peso (%) *</label><input required type="number" min="0" max="100" step="any" value={it.peso} onChange={setI('peso')} className={E.input} /></div>
                  <div><label className={E.labelForm}>Frecuencia</label><input value={it.frecuencia} onChange={setI('frecuencia')} className={E.input} /></div>
                </div>
              )}
              {esComp && <div><label className={E.labelForm}>Frecuencia</label><input value={it.frecuencia} onChange={setI('frecuencia')} className={E.input} /></div>}
              <div><label className={E.labelForm}>Línea base</label><textarea rows={2} value={it.linea_base} onChange={setI('linea_base')} className={E.input} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={E.labelForm}>Meta</label><textarea rows={2} value={it.meta} onChange={setI('meta')} className={E.input} /></div>
                <div><label className={E.labelForm}>Mínimo aceptable</label><textarea rows={2} value={it.minimo} onChange={setI('minimo')} className={E.input} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={E.labelForm}>¿Hay dato para medirlo?</label>
                  <select value={it.hay_dato} onChange={setI('hay_dato')} className={E.input}>
                    {Object.entries(HAY_DATO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={E.labelForm}>Estado</label>
                  <select value={it.estado} onChange={setI('estado')} className={E.input}>
                    {Object.entries(ESTADOS_KPI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div><label className={E.labelForm}>Fuente del dato</label><input value={it.fuente_dato} onChange={setI('fuente_dato')} className={E.input} /></div>
              <div><label className={E.labelForm}>Qué falta para medirlo</label><textarea rows={2} value={it.que_falta} onChange={setI('que_falta')} className={E.input} /></div>
              <div><label className={E.labelForm}>Notas</label><textarea rows={2} value={it.notas} onChange={setI('notas')} className={E.input} /></div>
              <p className="text-[11px] text-feisen-gris-medio">Los cambios aplican a los ciclos que se creen después; los ciclos ya creados conservan lo que tenían.</p>
              <div className="flex gap-2 pt-1">
                {it.id && <button type="button" onClick={borrarItem} disabled={guardando} className="p-2 text-feisen-gris-medio hover:text-feisen-rojo" title="Eliminar"><Trash2 size={16} /></button>}
                <button type="button" disabled={guardando} onClick={() => setEditItem(null)} className={`${E.btnSecundario} flex-1`}>Cancelar</button>
                <button type="submit" disabled={guardando} className={`${E.btnPrimario} flex-1`}>{guardando ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          </Modal>
        )
      })()}

      {/* Modal ficha del área */}
      {editArea && (
        <Modal titulo={editArea.id ? `Ficha · ${editArea.nombre}` : `Nueva área · plan ${anio}`} onCerrar={() => !guardando && setEditArea(null)}>
          <form onSubmit={guardarArea} className="space-y-3">
            {errModal && <Alerta tipo="error" mensaje={errModal} />}
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <div><label className={E.labelForm}>Área *</label><input required value={editArea.nombre} onChange={setA('nombre')} className={E.input} /></div>
              <div><label className={E.labelForm}>Código *</label><input required value={editArea.codigo} disabled={editArea.es_comun === true} onChange={setA('codigo')} className={`${E.input} uppercase ${area_}`} /></div>
            </div>
            {!editArea.es_comun && (
              <div>
                <label className={E.labelForm}>Jefe de área (evaluado)</label>
                <select value={editArea.empleado_id} onChange={setA('empleado_id')} className={E.input}>
                  <option value="">Sin asignar</option>
                  {emps.map(e => <option key={e.id} value={e.id}>{nombreCompleto(e)} · {e.cargo || 'sin cargo'}</option>)}
                </select>
              </div>
            )}
            <div><label className={E.labelForm}>{editArea.es_comun ? 'Cómo se calcula' : 'Aporte del área al objetivo del año'}</label><textarea rows={3} value={editArea.aporte} onChange={setA('aporte')} className={E.input} /></div>
            <div><label className={E.labelForm}>Reglas de juego (no son KPI, pero se exigen)</label><textarea rows={3} value={editArea.reglas} onChange={setA('reglas')} className={E.input} /></div>
            <div><label className={E.labelForm}>Datos o formatos pendientes</label><textarea rows={2} value={editArea.pendientes} onChange={setA('pendientes')} className={E.input} /></div>
            <div className="flex gap-2 pt-1">
              {editArea.id && !editArea.es_comun && <button type="button" onClick={borrarArea} disabled={guardando} className="p-2 text-feisen-gris-medio hover:text-feisen-rojo" title="Eliminar área"><Trash2 size={16} /></button>}
              <button type="button" disabled={guardando} onClick={() => setEditArea(null)} className={`${E.btnSecundario} flex-1`}>Cancelar</button>
              <button type="submit" disabled={guardando} className={`${E.btnPrimario} flex-1`}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
