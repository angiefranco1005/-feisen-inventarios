import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { fetchAllPages } from '../../../utils/fetchAllPages'
import Spinner from '../../shared/Spinner'
import Alerta from '../../shared/Alerta'
import { ArrowLeft, Search, Plus, Trash2, Tags, Fingerprint } from 'lucide-react'
import * as E from '../estilos'
import { nombreCompleto } from '../catalogosRRHH'
import { BODEGA_FUNDICION_ID, BODEGA_MECANIZADOS_ID } from '../../../utils/bodegasCatalogo'

const BODEGA_LABEL = { [BODEGA_FUNDICION_ID]: 'Fundición', [BODEGA_MECANIZADOS_ID]: 'Mecanizados' }

function ValorEditable({ valor, onGuardar }) {
  const [txt, setTxt] = useState(String(Math.round(Number(valor) || 0)))
  const [edit, setEdit] = useState(false)
  useEffect(() => { setTxt(String(Math.round(Number(valor) || 0))) }, [valor])
  const fmt = (t) => (t === '' ? '' : Number(t).toLocaleString('es-CO'))
  return (
    <div className="relative w-36">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-feisen-gris-medio">$</span>
      <input inputMode="numeric" value={fmt(txt)} onFocus={() => setEdit(true)}
        onChange={e => setTxt(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => { setEdit(false); if (Number(txt) !== Number(valor)) onGuardar(Number(txt) || 0) }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className={`${E.input} pl-7 text-right ${edit ? '' : 'border-transparent bg-transparent hover:border-feisen-borde'}`} />
    </div>
  )
}

// Nombre de una tarifa sin ítem: se edita en el sitio, como el valor
function NombreEditable({ valor, onGuardar }) {
  const [txt, setTxt] = useState(valor || '')
  const [edit, setEdit] = useState(false)
  useEffect(() => { setTxt(valor || '') }, [valor])
  return (
    <input value={txt} onFocus={() => setEdit(true)} onChange={e => setTxt(e.target.value)}
      onBlur={() => { setEdit(false); const v = txt.trim(); if (!v) setTxt(valor || ''); else if (v !== valor) onGuardar(v) }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTxt(valor || ''); e.currentTarget.blur() } }}
      title="Clic para cambiar el nombre"
      className={`${E.input} -ml-3 py-1 text-sm text-feisen-texto ${edit ? '' : 'border-transparent bg-transparent hover:border-feisen-borde'}`} />
  )
}

// Tarifas de destajo (valor por pieza) y nombres del huellero vinculados a su ficha
export default function TarifasDestajo() {
  const navigate = useNavigate()
  const [tarifas,   setTarifas]   = useState([])
  const [items,     setItems]     = useState([])
  const [alias,     setAlias]     = useState([])
  const [empleados, setEmpleados] = useState([])
  const [cargando,  setCargando]  = useState(true)
  const [msg,       setMsg]       = useState(null)
  const [busqueda,  setBusqueda]  = useState('')
  const [nueva,     setNueva]     = useState({ texto: '', item_id: null, valor: '' })

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: ts, error }, { data: its }, { data: al }, { data: emps }] = await Promise.all([
      supabase.from('nomina_tarifas').select('*, items(nombre, bodega_id)').order('created_at'),
      fetchAllPages((d, h) => supabase.from('items').select('id, nombre, bodega_id, activo')
        .in('bodega_id', [BODEGA_FUNDICION_ID, BODEGA_MECANIZADOS_ID]).eq('activo', true).order('nombre').range(d, h)),
      supabase.from('nomina_alias').select('*'),
      supabase.from('empleados').select('id, nombres, apellidos'),
    ])
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setTarifas(ts || [])
    setItems(its || [])
    setAlias(al || [])
    setEmpleados(emps || [])
    setCargando(false)
  }

  const nombreT = (t) => t.items?.nombre || t.descripcion
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return tarifas.filter(t => !q || nombreT(t).toLowerCase().includes(q)).sort((a, b) => nombreT(a).localeCompare(nombreT(b)))
  }, [tarifas, busqueda])

  async function guardarValor(t, valor) {
    const { error } = await supabase.from('nomina_tarifas').update({ valor }).eq('id', t.id)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setTarifas(ts => ts.map(x => (x.id === t.id ? { ...x, valor } : x)))
  }

  // Solo se renombran las tarifas sin ítem; las del catálogo toman el nombre del producto.
  // Las quincenas ya liquidadas guardan su propia copia del nombre, así que no cambian.
  async function guardarNombre(t, descripcion) {
    const { error } = await supabase.from('nomina_tarifas').update({ descripcion }).eq('id', t.id)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setTarifas(ts => ts.map(x => (x.id === t.id ? { ...x, descripcion } : x)))
  }

  async function crear(itemId, descripcion, valor) {
    setMsg(null)
    const { error } = await supabase.from('nomina_tarifas').insert({ item_id: itemId || null, descripcion: itemId ? null : descripcion, valor: Number(valor) || 0 })
    if (error) { setMsg({ tipo: 'error', texto: error.message.includes('duplicate') ? 'Esa pieza ya tiene tarifa.' : error.message }); return false }
    await cargar()
    return true
  }

  async function agregar(e) {
    e.preventDefault()
    const item = items.find(i => `${i.nombre} · ${BODEGA_LABEL[i.bodega_id]}` === nueva.texto)
    if (!nueva.texto.trim()) return
    if (await crear(item?.id, nueva.texto.trim(), nueva.valor)) setNueva({ texto: '', item_id: null, valor: '' })
  }

  async function eliminar(t) {
    if (!window.confirm(`¿Eliminar la tarifa de "${nombreT(t)}"?`)) return
    const { error } = await supabase.from('nomina_tarifas').delete().eq('id', t.id)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setTarifas(ts => ts.filter(x => x.id !== t.id))
  }

  async function quitarAlias(a) {
    const { error } = await supabase.from('nomina_alias').delete().eq('alias', a.alias)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setAlias(as => as.filter(x => x.alias !== a.alias))
  }

  const empPorId = new Map(empleados.map(e => [e.id, e]))

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <button onClick={() => navigate('/rrhh/nomina')} className={`${E.btnTexto} -ml-2.5`}><ArrowLeft {...E.ICONO} /> Nómina</button>
      <div>
        <h1 className={E.tituloPagina}>Tarifas de destajo</h1>
        <p className={E.subtituloPagina}>Valor que se paga por cada pieza. La pieza moldeada (Fundición) y la mecanizada (Mecanizados) tienen tarifas distintas.</p>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {cargando ? <Spinner /> : (
        <>
          <div className={E.tarjeta}>
            <div className={E.cabTarjeta}>
              <h2 className={E.tituloTarj}><Tags {...E.ICONO} className={E.iconoTitulo} /> Tarifas</h2>
              <span className={E.etiqueta}>{tarifas.length}</span>
            </div>
            <form onSubmit={agregar} className="px-5 py-3 flex flex-col sm:flex-row gap-2 border-b border-feisen-borde-suave">
              <datalist id="items-destajo">
                {items.map(i => <option key={i.id} value={`${i.nombre} · ${BODEGA_LABEL[i.bodega_id]}`} />)}
              </datalist>
              <input list="items-destajo" value={nueva.texto} onChange={e => setNueva(n => ({ ...n, texto: e.target.value }))}
                placeholder="Pieza del catálogo o trabajo (p. ej. Rueda 5 · Fundición)" className={`${E.input} flex-1`} />
              <div className="relative sm:w-40">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-feisen-gris-medio">$</span>
                <input inputMode="numeric" value={nueva.valor ? Number(nueva.valor).toLocaleString('es-CO') : ''} placeholder="Valor pieza"
                  onChange={e => setNueva(n => ({ ...n, valor: e.target.value.replace(/[^\d]/g, '') }))} className={`${E.input} pl-7`} />
              </div>
              <button type="submit" className={E.btnPrimario}><Plus {...E.ICONO} /> Agregar</button>
            </form>
            {tarifas.length > 8 && (
              <div className="px-5 pt-3">
                <div className="relative">
                  <Search {...E.ICONO} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
                  <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar pieza" className={`${E.input} pl-9`} />
                </div>
              </div>
            )}
            {filtradas.length === 0
              ? <p className="px-5 py-4 text-sm text-feisen-gris-medio">Aún no hay tarifas.</p>
              : <div className="divide-y divide-feisen-borde-suave">
                  {filtradas.map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-1.5">
                      <div className="flex-1 min-w-0">
                        {t.items
                          ? <p className="text-sm text-feisen-texto truncate" title="El nombre sale del catálogo de productos">{nombreT(t)}</p>
                          : <NombreEditable valor={t.descripcion} onGuardar={(v) => guardarNombre(t, v)} />}
                        <p className="text-xs text-feisen-gris-medio">{t.items ? BODEGA_LABEL[t.items.bodega_id] || 'Ítem' : 'Trabajo sin ítem'}</p>
                      </div>
                      <ValorEditable valor={t.valor} onGuardar={(v) => guardarValor(t, v)} />
                      <button onClick={() => eliminar(t)} title="Eliminar" className="p-2 text-feisen-gris-medio hover:text-feisen-rojo"><Trash2 size={14} strokeWidth={1.8} /></button>
                    </div>
                  ))}
                </div>}
          </div>

          <div className={E.tarjeta}>
            <div className={E.cabTarjeta}>
              <h2 className={E.tituloTarj}><Fingerprint {...E.ICONO} className={E.iconoTitulo} /> Nombres del huellero vinculados</h2>
            </div>
            <p className="px-5 pt-3 text-xs text-feisen-gris-medio">El huellero trae el nombre (a veces recortado). Si no coincide solo con una ficha, se vincula una vez desde la tarjeta "Huellero" de la quincena y queda guardado aquí.</p>
            {alias.length === 0
              ? <p className="px-5 py-3 text-sm text-feisen-gris-medio">Ninguno todavía.</p>
              : <div className="divide-y divide-feisen-borde-suave mt-2">
                  {alias.map(a => (
                    <div key={a.alias} className="flex items-center gap-3 px-5 py-2">
                      <span className="flex-1 text-sm text-feisen-texto">"{a.alias}" → {nombreCompleto(empPorId.get(a.empleado_id)) || '—'}</span>
                      <button onClick={() => quitarAlias(a)} title="Quitar" className="p-1.5 text-feisen-gris-medio hover:text-feisen-rojo"><Trash2 size={14} strokeWidth={1.8} /></button>
                    </div>
                  ))}
                </div>}
          </div>
        </>
      )}
    </div>
  )
}
