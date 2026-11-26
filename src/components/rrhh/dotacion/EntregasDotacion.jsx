import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchAllPages } from '../../../utils/fetchAllPages'
import Spinner from '../../shared/Spinner'
import Alerta from '../../shared/Alerta'
import { Plus, X, Search, Shirt, ChevronRight } from '../../shared/iconos'
import * as E from '../estilos'
import { nombreCompleto, formatoPesos, formatoFecha, hoyISO } from '../catalogosRRHH'
import { esBodegaAdministracion, esCategoriaDotacion, numeroSalida } from './dotacion'

const LINEA_VACIA = () => ({ item_id: '', cantidad: '1', valor_unitario: '' })
const FORM_VACIO = () => ({ empleado_id: '', fecha_entrega: hoyISO(), asume_costo: false, observaciones: '', lineas: [LINEA_VACIA()] })
const num = (v) => Number(v) || 0

// Entregas de dotación: lista y registro de una entrega nueva (salida de la bodega de Administración)
export default function EntregasDotacion() {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const [entregas,  setEntregas]  = useState([])
  const [empleados, setEmpleados] = useState([])
  const [bodega,    setBodega]    = useState(null)
  const [items,     setItems]     = useState([])     // productos de la bodega con su stock
  const [cargando,  setCargando]  = useState(true)
  const [nueva,     setNueva]     = useState(false)
  const [form,      setForm]      = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [msg,       setMsg]       = useState(null)
  const [busqueda,  setBusqueda]  = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: ents, error }, { data: emps }, { data: bods }] = await Promise.all([
      supabase.from('dotacion_entregas').select('*, dotacion_entrega_items(*)').order('fecha_entrega', { ascending: false }).order('created_at', { ascending: false }).limit(300),
      supabase.from('empleados').select('id, nombres, apellidos, area, cargo, estado').order('nombres'),
      supabase.from('bodegas').select('id, nombre').eq('activo', true),
    ])
    if (error) setMsg({ tipo: 'error', texto: error.message })
    const b = (bods || []).find(esBodegaAdministracion) || null
    let its = []
    if (b) {
      const [{ data: prods }, { data: stock }] = await Promise.all([
        fetchAllPages((d, h) => supabase.from('items').select('id, nombre, talla, producto_base, precio_costo, unidad_medida, activo, categorias(nombre)')
          .eq('bodega_id', b.id).eq('activo', true).order('nombre').range(d, h)),
        fetchAllPages((d, h) => supabase.from('stock').select('item_id, cantidad_actual').eq('bodega_id', b.id).range(d, h)),
      ])
      const hay = new Map((stock || []).map(s => [s.item_id, num(s.cantidad_actual)]))
      // Dotación primero; después lo demás de la bodega
      its = (prods || []).map(p => ({ ...p, stock: hay.get(p.id) || 0, categoria: p.categorias?.nombre || 'Sin categoría' }))
        .sort((x, y) => (esCategoriaDotacion(y.categoria) - esCategoriaDotacion(x.categoria)) || x.categoria.localeCompare(y.categoria) || x.nombre.localeCompare(y.nombre))
    }
    setEntregas(ents || []); setEmpleados(emps || []); setBodega(b); setItems(its)
    setCargando(false)
  }

  const empPorId = useMemo(() => new Map(empleados.map(e => [e.id, e])), [empleados])
  const itemPorId = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const porCategoria = useMemo(() => {
    const g = new Map()
    for (const i of items) { if (!g.has(i.categoria)) g.set(i.categoria, []); g.get(i.categoria).push(i) }
    return [...g.entries()]
  }, [items])

  const filtradas = entregas.filter(e => {
    const q = busqueda.trim().toLowerCase()
    return !q || nombreCompleto(empPorId.get(e.empleado_id)).toLowerCase().includes(q)
      || (e.dotacion_entrega_items || []).some(l => l.descripcion.toLowerCase().includes(q))
  })

  const setLinea = (i, cambios) => setForm(f => ({ ...f, lineas: f.lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)) }))
  function elegirItem(i, itemId) {
    const it = itemPorId.get(itemId)
    setLinea(i, { item_id: itemId, valor_unitario: it?.precio_costo ? String(Math.round(num(it.precio_costo))) : '' })
  }
  const lineasValidas = form.lineas.filter(l => l.item_id && num(l.cantidad) > 0)
  const total = lineasValidas.reduce((t, l) => t + num(l.cantidad) * num(l.valor_unitario), 0)

  async function guardar(e) {
    e.preventDefault(); setMsg(null)
    const emp = empPorId.get(form.empleado_id)
    if (!emp) { setMsg({ tipo: 'error', texto: 'Escoge el trabajador.' }); return }
    if (!lineasValidas.length) { setMsg({ tipo: 'error', texto: 'Agrega al menos un producto con cantidad.' }); return }
    // Misma referencia en dos líneas: se suma para revisar el stock
    const porItem = new Map()
    for (const l of lineasValidas) porItem.set(l.item_id, (porItem.get(l.item_id) || 0) + num(l.cantidad))
    for (const [id, cant] of porItem) {
      const it = itemPorId.get(id)
      if (cant > it.stock) { setMsg({ tipo: 'error', texto: `No hay suficiente "${it.nombre}": hay ${it.stock} y se van a entregar ${cant}.` }); return }
    }
    if (form.asume_costo && lineasValidas.some(l => !num(l.valor_unitario))) {
      setMsg({ tipo: 'error', texto: 'El trabajador asume el costo: escribe el valor de cada producto.' }); return
    }
    setGuardando(true)
    try {
      const numero = await numeroSalida(perfil)
      const nombre = nombreCompleto(emp)
      // 1. Salida de inventario (el trigger descuenta el stock de la bodega)
      const { error: errMov } = await supabase.from('movimientos').insert(lineasValidas.map(l => ({
        numero, tipo: 'salida', item_id: l.item_id,
        bodega_origen_id: bodega.id, bodega_destino_id: null,
        cantidad: num(l.cantidad),
        precio_costo_snapshot: num(itemPorId.get(l.item_id)?.precio_costo),
        centro_costo: bodega.nombre, usuario_id: perfil.id,
        cliente: nombre, destino: 'Dotación',
        referencia: `Entrega de dotación${form.asume_costo ? ' (la asume el trabajador)' : ''}`,
        fecha_movimiento: form.fecha_entrega || null,
      })))
      if (errMov) throw new Error(`No se pudo hacer la salida de inventario: ${errMov.message}`)
      // 2. Registro de la entrega
      const { data: ent, error: errEnt } = await supabase.from('dotacion_entregas').insert({
        empleado_id: emp.id, fecha_entrega: form.fecha_entrega, asume_costo: form.asume_costo,
        numero_salida: numero, total: Math.round(total * 100) / 100,
        observaciones: form.observaciones.trim() || null, creado_por: perfil.id,
      }).select('id').single()
      if (errEnt) throw new Error(`La salida ${numero} quedó hecha, pero no se guardó el registro de la entrega: ${errEnt.message}`)
      const { error: errIt } = await supabase.from('dotacion_entrega_items').insert(lineasValidas.map(l => {
        const it = itemPorId.get(l.item_id)
        return { entrega_id: ent.id, item_id: l.item_id, descripcion: it.nombre, talla: it.talla || null, cantidad: num(l.cantidad), valor_unitario: num(l.valor_unitario) }
      }))
      if (errIt) throw new Error(`La entrega quedó registrada, pero no el detalle de productos: ${errIt.message}`)
      setMsg({ tipo: 'exito', texto: `Dotación entregada a ${nombre} (salida ${numero}).${form.asume_costo ? ` Se descuenta ${formatoPesos(total)} en su nómina de esa quincena.` : ''}` })
      setNueva(false); setForm(FORM_VACIO())
      cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    }
    setGuardando(false)
  }

  if (cargando) return <Spinner />

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>Entregas de dotación</h1>
          <p className={E.subtituloPagina}>Salen de la bodega de {bodega?.nombre || 'Administración'} y quedan en el historial de cada trabajador</p>
        </div>
        {!nueva && bodega && (
          <button onClick={() => { setForm(FORM_VACIO()); setMsg(null); setNueva(true) }} className={E.btnPrimario}>
            <Plus {...E.ICONO} /> Entregar dotación
          </button>
        )}
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
      {!bodega && <Alerta tipo="error" mensaje="No encuentro la bodega de Administración entre tus bodegas. Pide que te la asignen en Configuración → Usuarios." />}

      {nueva && (
        <form onSubmit={guardar} className={E.tarjeta}>
          <div className={E.cabTarjeta}>
            <h2 className={E.tituloTarj}><Shirt {...E.ICONO} className={E.iconoTitulo} /> Nueva entrega</h2>
            <button type="button" onClick={() => setNueva(false)} className="p-1 text-feisen-gris-medio hover:text-feisen-texto"><X size={18} /></button>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="grid sm:grid-cols-[1fr_11rem] gap-3">
              <div>
                <label className={E.labelForm}>Trabajador *</label>
                <select required value={form.empleado_id} onChange={e => setForm(f => ({ ...f, empleado_id: e.target.value }))} className={E.input}>
                  <option value="">Seleccionar…</option>
                  {empleados.filter(x => x.estado !== 'retirado').map(x => <option key={x.id} value={x.id}>{nombreCompleto(x)}{x.area ? ` · ${x.area}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className={E.labelForm}>Fecha de entrega *</label>
                <input required type="date" max={hoyISO()} value={form.fecha_entrega} onChange={e => setForm(f => ({ ...f, fecha_entrega: e.target.value }))} className={E.input} />
              </div>
            </div>

            <div>
              <label className={E.labelForm}>¿El trabajador asume el costo?</label>
              <div className="inline-flex border border-feisen-borde rounded-lg p-0.5 bg-white">
                {[[false, 'No, la asume Feisen'], [true, 'Sí, se le descuenta']].map(([v, t]) => (
                  <button key={String(v)} type="button" onClick={() => setForm(f => ({ ...f, asume_costo: v }))}
                    className={`px-3 py-1.5 rounded-md text-sm ${form.asume_costo === v ? 'bg-feisen-azul-suave text-feisen-azul font-medium' : 'text-feisen-texto-2 hover:text-feisen-texto'}`}>{t}</button>
                ))}
              </div>
              {form.asume_costo && <p className="text-xs text-feisen-gris-medio mt-1">El total se sugiere en su nómina de la quincena de la entrega, en "Dotación / herramienta".</p>}
            </div>

            <div>
              <label className={E.labelForm}>Productos *</label>
              <div className="space-y-2">
                {form.lineas.map((l, i) => {
                  const it = itemPorId.get(l.item_id)
                  return (
                    <div key={i} className="grid grid-cols-[1fr_5rem_8rem_auto] gap-2 items-start">
                      <div>
                        <select value={l.item_id} onChange={e => elegirItem(i, e.target.value)} className={E.input}>
                          <option value="">Producto…</option>
                          {porCategoria.map(([cat, lista]) => (
                            <optgroup key={cat} label={cat}>
                              {lista.map(p => <option key={p.id} value={p.id} disabled={p.stock <= 0}>{p.nombre} {p.stock > 0 ? `(hay ${p.stock})` : '(sin stock)'}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <input type="number" min="1" step="1" value={l.cantidad} onChange={e => setLinea(i, { cantidad: e.target.value })}
                        className={E.input} title="Cantidad" placeholder="Cant." />
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-feisen-gris-medio">$</span>
                        <input inputMode="numeric" value={l.valor_unitario ? Number(l.valor_unitario).toLocaleString('es-CO') : ''}
                          onChange={e => setLinea(i, { valor_unitario: e.target.value.replace(/[^\d]/g, '') })}
                          className={`${E.input} pl-7`} placeholder="Valor und." title="Valor por unidad" />
                      </div>
                      <button type="button" onClick={() => setForm(f => ({ ...f, lineas: f.lineas.length > 1 ? f.lineas.filter((_, j) => j !== i) : [LINEA_VACIA()] }))}
                        className="p-2 text-feisen-gris-medio hover:text-feisen-rojo"><X size={15} /></button>
                      {it && num(l.cantidad) > it.stock && <p className="col-span-4 -mt-1 text-xs text-feisen-rojo">Solo hay {it.stock} en la bodega.</p>}
                    </div>
                  )
                })}
                <button type="button" onClick={() => setForm(f => ({ ...f, lineas: [...f.lineas, LINEA_VACIA()] }))} className={`${E.btnTextoAzul} -ml-2.5`}>
                  <Plus size={14} /> Agregar producto
                </button>
              </div>
              {items.length === 0 && <p className="text-xs text-feisen-gris-medio mt-1">La bodega no tiene productos todavía. Créalos en Productos (los de dotación pueden llevar tallas).</p>}
            </div>

            <div>
              <label className={E.labelForm}>Observaciones</label>
              <textarea rows={2} value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} className={E.input} placeholder="Opcional. Ej: dotación del segundo semestre" />
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <p className="text-sm text-feisen-texto-2">Total: <strong className="text-feisen-texto">{formatoPesos(total)}</strong>{form.asume_costo && ' · lo asume el trabajador'}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setNueva(false)} disabled={guardando} className={E.btnSecundario}>Cancelar</button>
                <button type="submit" disabled={guardando} className={E.btnPrimario}>{guardando ? 'Guardando…' : 'Registrar entrega y salida'}</button>
              </div>
            </div>
          </div>
        </form>
      )}

      <div className={E.tarjeta}>
        <div className={E.cabTarjeta}>
          <h2 className={E.tituloTarj}><Shirt {...E.ICONO} className={E.iconoTitulo} /> Entregas</h2>
          <span className={E.etiqueta}>{entregas.length}</span>
        </div>
        {entregas.length > 5 && (
          <div className="px-5 pt-3">
            <div className="relative">
              <Search {...E.ICONO} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar trabajador o producto" className={`${E.input} pl-9`} />
            </div>
          </div>
        )}
        {filtradas.length === 0
          ? <p className="px-5 py-4 text-sm text-feisen-gris-medio">{entregas.length ? 'Ninguna entrega coincide con la búsqueda.' : 'Aún no hay entregas de dotación.'}</p>
          : <div className="divide-y divide-feisen-borde-suave">
              {filtradas.map(en => {
                const emp = empPorId.get(en.empleado_id)
                return (
                  <button key={en.id} onClick={() => navigate(`/rrhh/empleados/${en.empleado_id}?seccion=dotacion`)}
                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-feisen-fondo text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-feisen-texto truncate">
                        <span className="font-medium">{nombreCompleto(emp) || '—'}</span>
                        <span className="text-feisen-texto-2"> · {formatoFecha(en.fecha_entrega)}</span>
                      </p>
                      <p className="text-xs text-feisen-gris-medio truncate">
                        {(en.dotacion_entrega_items || []).map(l => `${Number(l.cantidad).toLocaleString('es-CO')} × ${l.descripcion}`).join(', ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-feisen-texto">{formatoPesos(en.total)}</p>
                      <p className={`text-[11px] ${en.asume_costo ? 'text-amber-700' : 'text-feisen-gris-medio'}`}>{en.asume_costo ? 'La asume el trabajador' : 'La asume Feisen'}</p>
                    </div>
                    <ChevronRight size={16} className="text-feisen-gris-medio flex-shrink-0" />
                  </button>
                )
              })}
            </div>}
      </div>
    </div>
  )
}
