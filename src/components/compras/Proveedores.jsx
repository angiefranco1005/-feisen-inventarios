import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { coincideBusqueda } from '../../utils/busqueda'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { formatCOP } from '../../utils/formatters'
import { EncabezadoPagina, PanelLateral, useAviso, useAtajoBuscar } from '../shared/ui'
import Spinner from '../shared/Spinner'
import { ChevronRight, Pencil, Plus, Search, Star, Storefront, WarningOctagon } from '../shared/iconos'
import { Estrellas, PREGUNTAS, claseNota, formatoNota, notaDe, resumenEvaluaciones } from './evaluacion'

const fechaCorta = f => f ? new Date(f.length === 10 ? `${f}T12:00:00` : f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const campo = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-sm focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'

// Proveedores: la base de proveedores (unificada con los dos Odoo) con su calificación. Cada
// evaluación sale de un pedido recibido (botón «Evaluar proveedor» en Pedidos). Para Logística
// y ADMIN (módulo ordenes_compra, nivel 'todo'). Responde: ¿a quién le seguimos comprando?
export default function Proveedores() {
  const [params, setParams] = useSearchParams()
  const [aviso, avisar] = useAviso()
  const buscarRef = useRef(null)
  useAtajoBuscar(buscarRef)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [proveedores, setProveedores] = useState([])
  const [evaluaciones, setEvaluaciones] = useState([])
  const [ordenes, setOrdenes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos') // todos | baja | sinevaluar | inactivos

  const cargar = useCallback(async () => {
    setError('')
    const [pr, ev, oc] = await Promise.all([
      supabase.from('proveedores').select('*').order('nombre'),
      fetchAllPages((d, h) => supabase.from('proveedor_evaluaciones').select('*, ordenes_compra(numero), pedidos(numero)').order('created_at', { ascending: false }).range(d, h)),
      fetchAllPages((d, h) => supabase.from('ordenes_compra').select('id, proveedor_id, created_at, anulada, orden_compra_items(cantidad, precio_unitario)').eq('anulada', false).range(d, h)),
    ])
    const err = pr.error || ev.error || oc.error
    if (err) setError(err.message)
    setProveedores(pr.data || []); setEvaluaciones(ev.data || []); setOrdenes(oc.data || [])
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // Por proveedor: evaluaciones, resumen, número de OC, total comprado y última compra
  const datos = useMemo(() => {
    const m = {}
    for (const p of proveedores) m[p.id] = { evals: [], ocs: 0, total: 0, ultima: null }
    for (const e of evaluaciones) m[e.proveedor_id]?.evals.push(e)
    for (const o of ordenes) {
      const d = m[o.proveedor_id]; if (!d) continue
      d.ocs++
      d.total += (o.orden_compra_items || []).reduce((s, it) => s + Number(it.cantidad) * Number(it.precio_unitario || 0), 0)
      if (!d.ultima || o.created_at > d.ultima) d.ultima = o.created_at
    }
    for (const id in m) m[id].resumen = resumenEvaluaciones(m[id].evals)
    return m
  }, [proveedores, evaluaciones, ordenes])

  const activos = proveedores.filter(p => p.activo !== false)
  const evaluados = activos.filter(p => datos[p.id]?.resumen.n > 0)
  const notaBaja = activos.filter(p => datos[p.id]?.resumen.nota != null && datos[p.id].resumen.nota < 3)
  const sinEvaluar = activos.filter(p => datos[p.id]?.ocs > 0 && !datos[p.id]?.resumen.n)
  const inactivos = proveedores.filter(p => p.activo === false)

  const base = filtro === 'baja' ? notaBaja : filtro === 'sinevaluar' ? sinEvaluar : filtro === 'inactivos' ? inactivos : activos
  const lista = base.filter(p => coincideBusqueda(`${p.nombre} ${p.nit || ''} ${p.ciudad || ''} ${p.contacto || ''}`, busqueda))
    .sort((a, b) => (datos[b.id]?.ocs || 0) - (datos[a.id]?.ocs || 0) || a.nombre.localeCompare(b.nombre))

  const abrir = (k, v) => setParams(v ? { [k]: v } : {}, { replace: false })
  const cerrar = () => setParams({}, { replace: false })
  const ficha = proveedores.find(p => p.id === params.get('proveedor'))
  const editar = params.get('editar')

  if (cargando) return <div className="py-20 grid place-items-center"><Spinner /></div>

  const Kpi = ({ id, clase, Icono, titulo, valor, detalle }) => {
    const activo = filtro === id
    return (
      <button type="button" onClick={() => id && setFiltro(activo ? 'todos' : id)} disabled={!id}
        className={`text-left bg-white border rounded-xl p-4 flex flex-col gap-1 ${activo ? 'border-feisen-azul ring-2 ring-feisen-azul-suave' : 'border-feisen-borde'} ${id ? 'hover:border-gray-300' : 'cursor-default'}`}>
        <span className="flex items-center gap-2">
          <span className={`w-8 h-8 rounded-lg grid place-items-center ${clase}`}><Icono size={18} weight="duotone" /></span>
          <span className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">{titulo}</span>
        </span>
        <span className="text-2xl font-semibold tabular-nums text-feisen-texto">{valor}</span>
        <span className="text-xs text-feisen-texto-2 truncate">{detalle}</span>
      </button>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-24 lg:pb-8">
      <EncabezadoPagina modulo="Logística" titulo="Proveedores" subtitulo="A quién le compramos y cómo nos ha ido con cada uno.">
        <button type="button" onClick={() => abrir('editar', 'nuevo')} className="flex items-center gap-1.5 min-h-[40px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold">
          <Plus size={16} /> Nuevo proveedor
        </button>
      </EncabezadoPagina>

      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">No se pudo cargar: {error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi clase="bg-feisen-azul-suave text-feisen-azul" Icono={Storefront} titulo="Activos" valor={activos.length} detalle={`${activos.filter(p => datos[p.id]?.ocs).length} con órdenes de compra`} />
        <Kpi clase="bg-gray-100 text-feisen-texto-2" Icono={Star} titulo="Evaluados" valor={evaluados.length} detalle={`${evaluaciones.length} evaluaciones en total`} />
        <Kpi id="baja" clase="bg-feisen-rojo-suave text-feisen-rojo" Icono={WarningOctagon} titulo="Nota baja" valor={notaBaja.length} detalle={notaBaja.length ? 'menos de 3 estrellas' : 'Ninguno por debajo de 3'} />
        <Kpi id="sinevaluar" clase="bg-amber-50 text-amber-700" Icono={Star} titulo="Sin evaluar" valor={sinEvaluar.length} detalle="tienen compras y ninguna evaluación" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative sm:w-80">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input ref={buscarRef} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, NIT o ciudad"
            className="w-full border border-feisen-borde rounded-lg pl-10 pr-3 py-2.5 bg-white text-sm focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[['todos', `Activos · ${activos.length}`], ['baja', `Nota baja · ${notaBaja.length}`], ['sinevaluar', `Sin evaluar · ${sinEvaluar.length}`], ...(inactivos.length ? [['inactivos', `Inactivos · ${inactivos.length}`]] : [])].map(([id, t]) => (
            <button key={id} type="button" onClick={() => setFiltro(id)} aria-pressed={filtro === id}
              className={`min-h-[34px] px-3 rounded-full border text-[13px] ${filtro === id ? 'bg-feisen-azul border-feisen-azul text-white' : 'bg-white border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo'}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
        {lista.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-feisen-texto-2">
            {proveedores.length === 0 ? 'Todavía no hay proveedores. Créalos aquí o al generar una orden de compra.' : <>Ningún proveedor cumple el filtro. <button type="button" onClick={() => { setFiltro('todos'); setBusqueda('') }} className="text-feisen-azul font-medium">Ver todos</button></>}
          </p>
        )}
        <div className="divide-y divide-feisen-borde-suave">
          {lista.map(p => {
            const d = datos[p.id]
            return (
              <button key={p.id} type="button" onClick={() => abrir('proveedor', p.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-feisen-fondo">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-feisen-texto truncate">{p.nombre}</span>
                  <span className="block text-xs text-feisen-texto-2 truncate">{[p.nit ? `NIT ${p.nit}` : 'Sin NIT', p.ciudad].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="hidden sm:block text-right text-xs text-feisen-texto-2 w-36 shrink-0">
                  <span className="block tabular-nums text-feisen-texto">{d.ocs} {d.ocs === 1 ? 'orden' : 'órdenes'}</span>
                  <span className="block">{d.ultima ? `última ${fechaCorta(d.ultima)}` : 'sin compras en la app'}</span>
                </span>
                <span className="text-right w-24 shrink-0">
                  {d.resumen.n ? <>
                    <span className={`block text-sm font-semibold tabular-nums ${claseNota(d.resumen.nota)}`}>★ {formatoNota(d.resumen.nota)}</span>
                    <span className="block text-xs text-feisen-texto-2">{d.resumen.n} {d.resumen.n === 1 ? 'evaluación' : 'evaluaciones'}</span>
                  </> : <span className="text-xs text-feisen-texto-2">Sin evaluar</span>}
                </span>
                <ChevronRight size={16} className="text-gray-400 shrink-0" />
              </button>
            )
          })}
        </div>
      </div>

      {ficha && !editar && <FichaProveedor p={ficha} d={datos[ficha.id]} onCerrar={cerrar} onEditar={() => abrir('editar', ficha.id)} />}
      {editar && (editar === 'nuevo' || proveedores.some(p => p.id === editar)) && (
        <FormProveedor proveedor={editar === 'nuevo' ? null : proveedores.find(p => p.id === editar)} nits={proveedores}
          onCerrar={cerrar} onGuardado={(m, id) => { avisar(m); cargar(); abrir('proveedor', id) }} />
      )}
      {aviso}
    </div>
  )
}

function FichaProveedor({ p, d, onCerrar, onEditar }) {
  const r = d.resumen
  const dato = (t, v) => <div><p className="text-[11.5px] text-feisen-texto-2">{t}</p><p className="text-sm text-feisen-texto break-words">{v || '—'}</p></div>
  return (
    <PanelLateral etiqueta={`Proveedor ${p.nombre}`} onCerrar={onCerrar}
      encabezado={<>
        <p className="text-xs text-gray-400">{p.nit ? `NIT ${p.nit}` : 'Sin NIT'}{p.activo === false ? ' · inactivo' : ''}</p>
        <h2 className="text-lg font-semibold text-feisen-texto leading-snug">{p.nombre}</h2>
        <button type="button" onClick={onEditar} className="mt-3 flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-feisen-borde text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
          <Pencil size={15} /> Editar datos
        </button>
      </>}>
      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Calificación</p>
        {r.n ? <>
          <div className="flex items-end gap-3">
            <span className={`text-3xl font-semibold tabular-nums ${claseNota(r.nota)}`}>{formatoNota(r.nota)}</span>
            <span className="pb-1"><Estrellas valor={r.nota} tam={18} etiqueta="Promedio" /></span>
            <span className="pb-1 text-xs text-feisen-texto-2">{r.n} {r.n === 1 ? 'evaluación' : 'evaluaciones'}{r.problemas ? ` · ${r.problemas} con problema` : ''}</span>
          </div>
          <div className="space-y-2">
            {PREGUNTAS.map(q => (
              <div key={q.clave} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                <span className="text-feisen-texto">{q.titulo}</span>
                <span className="h-2 rounded-full bg-gray-100 overflow-hidden"><span className={`block h-full rounded-full ${r[q.clave] < 3 ? 'bg-feisen-rojo' : r[q.clave] < 4 ? 'bg-amber-400' : 'bg-emerald-600'}`} style={{ width: `${(r[q.clave] / 5) * 100}%` }} /></span>
                <span className={`text-right tabular-nums font-medium ${claseNota(r[q.clave])}`}>{formatoNota(r[q.clave])}</span>
              </div>
            ))}
          </div>
        </> : <p className="text-sm text-feisen-texto-2">{d.ocs ? 'Tiene órdenes de compra pero ninguna evaluación. Se evalúa desde Pedidos cuando un pedido queda recibido.' : 'Todavía no tiene compras en la app.'}</p>}
      </section>

      <section className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Compras en la app</p>
        <div className="grid grid-cols-3 gap-3">
          {dato('Órdenes', d.ocs)}
          {dato('Total (sin IVA)', d.total ? formatCOP(d.total) : '—')}
          {dato('Última', d.ultima ? fechaCorta(d.ultima) : '—')}
        </div>
      </section>

      <section className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Contacto</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {dato('Contacto', p.contacto)}{dato('Teléfono', p.telefono)}{dato('Correo', p.email)}{dato('Ciudad', p.ciudad)}
        </div>
        {dato('Dirección', p.direccion)}
        {(p.odoo_feisen_id || p.odoo_fc_id) && (
          <p className="text-xs text-feisen-texto-2">En Odoo: {[p.odoo_feisen_id && 'Feisen', p.odoo_fc_id && 'FC'].filter(Boolean).join(' y ')}</p>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Historial de evaluaciones</p>
        {d.evals.length === 0 ? <p className="text-sm text-feisen-texto-2">Sin evaluaciones todavía.</p> : (
          <div className="border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
            {d.evals.map(e => (
              <div key={e.id} className="px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-feisen-texto">{e.ordenes_compra?.numero || 'OC'}{e.pedidos?.numero ? ` · ${e.pedidos.numero}` : ''}</span>
                  <span className={`text-sm font-semibold tabular-nums ${claseNota(notaDe(e))}`}>★ {formatoNota(notaDe(e))}</span>
                </div>
                <p className="text-xs text-feisen-texto-2">{fechaCorta(e.created_at)} · Calidad {e.calidad} · Cumplimiento {e.cumplimiento} · Precio {e.precio}</p>
                {e.hubo_problema && <p className="text-xs text-feisen-rojo bg-feisen-rojo-suave rounded-md px-2 py-1">Problema: {e.problema}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </PanelLateral>
  )
}

const soloDigitos = t => String(t || '').replace(/\D/g, '')

function FormProveedor({ proveedor, nits, onCerrar, onGuardado }) {
  const nuevo = !proveedor
  const [f, setF] = useState({
    nombre: proveedor?.nombre || '', nit: proveedor?.nit || '', contacto: proveedor?.contacto || '', telefono: proveedor?.telefono || '',
    email: proveedor?.email || '', direccion: proveedor?.direccion || '', ciudad: proveedor?.ciudad || '', activo: proveedor?.activo !== false,
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const cambiar = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  const guardar = async () => {
    if (!f.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    const base = soloDigitos(f.nit).slice(0, 9)
    const repetido = base.length >= 6 && nits.find(n => n.id !== proveedor?.id && soloDigitos(n.nit).slice(0, 9) === base)
    if (repetido) { setError(`Ya existe un proveedor con ese NIT: ${repetido.nombre}.`); return }
    setGuardando(true); setError('')
    const fila = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]))
    const res = nuevo
      ? await supabase.from('proveedores').insert(fila).select('id').single()
      : await supabase.from('proveedores').update(fila).eq('id', proveedor.id).select('id').single()
    setGuardando(false)
    if (res.error) { setError(res.error.message); return }
    onGuardado(nuevo ? `${fila.nombre} creado` : `${fila.nombre} actualizado`, res.data.id)
  }

  const input = (k, label, extra = {}) => (
    <div><label htmlFor={`pv-${k}`} className="block text-sm font-medium text-feisen-texto mb-1.5">{label}</label>
      <input id={`pv-${k}`} value={f[k]} onChange={e => cambiar(k, e.target.value)} className={campo} {...extra} /></div>
  )
  return (
    <PanelLateral etiqueta={nuevo ? 'Nuevo proveedor' : 'Editar proveedor'} onCerrar={onCerrar}
      encabezado={<><p className="text-xs text-gray-400">Proveedores</p><h2 className="text-lg font-semibold text-feisen-texto">{nuevo ? 'Nuevo proveedor' : `Editar ${proveedor.nombre}`}</h2></>}>
      {input('nombre', 'Razón social', { placeholder: 'Aluminios del Centro S.A.S.' })}
      {input('nit', 'NIT', { placeholder: '900123456-7', inputMode: 'numeric' })}
      <div className="grid grid-cols-2 gap-3">{input('contacto', 'Contacto')}{input('telefono', 'Teléfono', { inputMode: 'tel' })}</div>
      {input('email', 'Correo', { type: 'email' })}
      {input('direccion', 'Dirección')}
      {input('ciudad', 'Ciudad')}
      {!nuevo && (
        <label className="flex items-center gap-2.5 text-sm text-feisen-texto">
          <input type="checkbox" checked={f.activo} onChange={e => cambiar('activo', e.target.checked)} className="w-4 h-4 accent-feisen-azul" />
          Activo (si lo desmarcas, ya no aparece para nuevas órdenes de compra)
        </label>
      )}
      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}
      <div className="sticky bottom-0 -mx-5 -mb-4 px-5 py-3 bg-white border-t border-feisen-borde-suave">
        <button type="button" onClick={guardar} disabled={guardando} className="w-full min-h-[48px] rounded-lg bg-feisen-azul text-white font-semibold disabled:opacity-50">
          {guardando ? 'Guardando…' : nuevo ? 'Crear proveedor' : 'Guardar cambios'}
        </button>
      </div>
    </PanelLateral>
  )
}
