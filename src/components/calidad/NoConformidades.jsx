import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { ShieldAlert, Plus, RefreshCw, ChevronRight, Check, X, Search } from 'lucide-react'

const TIPOS_DEFECTO = [
  'Porosidad',
  'Fisura / grieta',
  'Dimensión incorrecta',
  'Acabado superficial deficiente',
  'Rotura durante pulida',
  'Rechupes',
  'Inclusiones',
  'Otro',
]

const DESTINOS = [
  { value: 'vaceadero', label: '🔥 Vaceadero (refundir)' },
  { value: 'reproceso', label: '🔧 Reproceso' },
  { value: 'aprobado',  label: '✅ Aprobado con observación' },
  { value: 'otro',      label: '📦 Otro' },
]

const ESTADO_CONFIG = {
  abierto:  { label: 'Abierto',  color: 'bg-red-100 text-red-700' },
  cerrado:  { label: 'Cerrado',  color: 'bg-gray-100 text-gray-600' },
}

const FORM_VACIO = {
  item_nombre: '',
  item_id: '',
  cantidad_afectada: '1',
  bodega_nombre: '',
  bodega_id: '',
  fecha_deteccion: new Date().toISOString().split('T')[0],
  tipo_defecto: '',
  descripcion: '',
  referencia_orden: '',
  moldeador: '',
}

const FORM_CIERRE_VACIO = {
  destino_final: '',
  accion_tomada: '',
  observaciones_cierre: '',
}

export default function NoConformidades() {
  const { perfil, esAdmin } = useAuth()
  const [ncs,           setNcs]           = useState([])
  const [items,         setItems]         = useState([])
  const [bodegas,       setBodegas]       = useState([])
  const [cargando,      setCargando]      = useState(true)
  const [filtroEstado,  setFiltroEstado]  = useState('abierto')
  const [busqueda,      setBusqueda]      = useState('')
  const [expandido,     setExpandido]     = useState(null)
  const [modalCrear,    setModalCrear]    = useState(false)
  const [ncACerrar,     setNcACerrar]     = useState(null)
  const [form,          setForm]          = useState(FORM_VACIO)
  const [formCierre,    setFormCierre]    = useState(FORM_CIERRE_VACIO)
  const [guardando,     setGuardando]     = useState(false)
  const [msg,           setMsg]           = useState(null)

  // Selector de item
  const [busqItem,        setBusqItem]        = useState('')
  const [mostrarItems,    setMostrarItems]    = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: ncsData }, { data: itsData }, { data: bodData }] = await Promise.all([
      supabase.from('no_conformidades')
        .select('*, items(nombre), bodegas(nombre), detectado_por:profiles!no_conformidades_detectado_por_fkey(nombre), cerrado_por:profiles!no_conformidades_cerrado_por_fkey(nombre)')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('items').select('id, nombre, bodega_id').eq('activo', true).order('nombre').limit(2000),
      supabase.from('bodegas').select('id, nombre').order('nombre'),
    ])
    setNcs(ncsData || [])
    setItems(itsData || [])
    setBodegas(bodData || [])
    setCargando(false)
  }

  // ── Crear NC ──────────────────────────────────────────────────────────────────
  async function crearNC() {
    if (!form.cantidad_afectada || Number(form.cantidad_afectada) <= 0) {
      setMsg({ tipo: 'error', texto: 'La cantidad debe ser mayor a 0.' }); return
    }
    setGuardando(true)
    setMsg(null)

    // Generar número
    const { count } = await supabase.from('no_conformidades').select('*', { count: 'exact', head: true })
    const numero = `NC-${String((count || 0) + 1).padStart(4, '0')}`

    const payload = {
      numero,
      estado: 'abierto',
      item_id: form.item_id || null,
      item_nombre: form.item_nombre || null,
      cantidad_afectada: Number(form.cantidad_afectada),
      bodega_id: form.bodega_id || null,
      bodega_nombre: form.bodega_nombre || null,
      detectado_por: perfil.id,
      fecha_deteccion: form.fecha_deteccion,
      tipo_defecto: form.tipo_defecto || null,
      descripcion: form.descripcion || null,
      referencia_orden: form.referencia_orden || null,
      moldeador: form.moldeador || null,
      creado_por: perfil.id,
    }

    const { error } = await supabase.from('no_conformidades').insert(payload)
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error al registrar: ' + error.message })
      setGuardando(false)
      return
    }

    setGuardando(false)
    setModalCrear(false)
    setForm(FORM_VACIO)
    setBusqItem('')
    setMsg({ tipo: 'exito', texto: `${numero} registrada correctamente.` })
    cargar()
  }

  // ── Cerrar NC ─────────────────────────────────────────────────────────────────
  async function cerrarNC() {
    if (!formCierre.destino_final) {
      setMsg({ tipo: 'error', texto: 'Selecciona el destino final.' }); return
    }
    setGuardando(true)
    setMsg(null)

    const { error } = await supabase.from('no_conformidades').update({
      estado: 'cerrado',
      destino_final: formCierre.destino_final,
      accion_tomada: formCierre.accion_tomada || null,
      observaciones_cierre: formCierre.observaciones_cierre || null,
      cerrado_por: perfil.id,
      cerrado_at: new Date().toISOString(),
    }).eq('id', ncACerrar.id)

    if (error) {
      setMsg({ tipo: 'error', texto: 'Error: ' + error.message })
      setGuardando(false)
      return
    }

    setGuardando(false)
    setNcACerrar(null)
    setFormCierre(FORM_CIERRE_VACIO)
    setMsg({ tipo: 'exito', texto: `${ncACerrar.numero} cerrada.` })
    cargar()
  }

  function setF(campo, val) { setForm(p => ({ ...p, [campo]: val })) }
  function setFC(campo, val) { setFormCierre(p => ({ ...p, [campo]: val })) }

  const filtradas = ncs.filter(nc => {
    const matchEstado = nc.estado === filtroEstado
    const matchBusq = !busqueda ||
      nc.numero?.toLowerCase().includes(busqueda.toLowerCase()) ||
      nc.item_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      nc.moldeador?.toLowerCase().includes(busqueda.toLowerCase()) ||
      nc.referencia_orden?.toLowerCase().includes(busqueda.toLowerCase()) ||
      nc.tipo_defecto?.toLowerCase().includes(busqueda.toLowerCase())
    return matchEstado && matchBusq
  })

  if (cargando) return <Spinner texto="Cargando no conformidades..." />

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-red-50 p-2.5 rounded-xl">
            <ShieldAlert size={22} className="text-feisen-rojo" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">No Conformidades</h1>
            <p className="text-xs text-gray-500">Registro de defectos de calidad</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={cargar} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => { setModalCrear(true); setMsg(null) }}
            className="flex items-center gap-2 bg-feisen-rojo text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90">
            <Plus size={16} /> Nueva NC
          </button>
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por N° NC, pieza, moldeador, orden..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white" />
        </div>
        <div className="flex gap-2">
          {['abierto', 'cerrado'].map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors
                ${filtroEstado === e ? 'bg-feisen-azul text-white border-feisen-azul' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {ESTADO_CONFIG[e].label}
              <span className="ml-1.5 text-xs opacity-70">
                ({ncs.filter(n => n.estado === e).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {filtradas.length === 0 ? (
          <div className="bg-white rounded-2xl text-center py-16 text-gray-400 border border-gray-100">
            <ShieldAlert size={36} className="mx-auto mb-3 opacity-20" />
            <p>No hay no conformidades {filtroEstado === 'abierto' ? 'abiertas' : 'cerradas'}.</p>
          </div>
        ) : filtradas.map(nc => {
          const abierto = expandido === nc.id
          const est = ESTADO_CONFIG[nc.estado] || ESTADO_CONFIG.abierto
          const fecha = nc.fecha_deteccion
            ? new Date(nc.fecha_deteccion + 'T12:00:00').toLocaleDateString('es-CO')
            : '—'

          return (
            <div key={nc.id} className={`bg-white rounded-2xl border transition-all ${abierto ? 'border-feisen-rojo/40 shadow-sm' : 'border-gray-100'}`}>
              {/* Fila resumen */}
              <button type="button" onClick={() => setExpandido(abierto ? null : nc.id)}
                className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 rounded-2xl transition-colors">
                <span className={`text-gray-400 transition-transform shrink-0 ${abierto ? 'rotate-90' : ''}`}>▶</span>
                <span className="font-mono text-xs text-gray-500 w-24 shrink-0">{nc.numero}</span>
                <span className="text-xs text-gray-400 w-20 shrink-0">{fecha}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${est.color}`}>{est.label}</span>
                <span className="text-sm font-semibold text-gray-800 flex-1 truncate">
                  {nc.item_nombre || nc.items?.nombre || 'Sin pieza'}
                  {nc.cantidad_afectada && <span className="ml-1.5 text-xs text-feisen-rojo font-bold">× {nc.cantidad_afectada}</span>}
                </span>
                {nc.tipo_defecto && (
                  <span className="text-xs text-gray-400 hidden sm:block shrink-0 max-w-36 truncate">{nc.tipo_defecto}</span>
                )}
                {nc.moldeador && (
                  <span className="text-xs text-orange-500 font-medium hidden md:block shrink-0">👤 {nc.moldeador}</span>
                )}
                {nc.estado === 'abierto' && (
                  <button type="button"
                    onClick={e => { e.stopPropagation(); setNcACerrar(nc); setFormCierre(FORM_CIERRE_VACIO); setMsg(null) }}
                    className="shrink-0 flex items-center gap-1.5 bg-gray-100 hover:bg-green-100 hover:text-green-700 text-gray-500 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors">
                    <Check size={12} /> Cerrar
                  </button>
                )}
              </button>

              {/* Detalle */}
              {abierto && (
                <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-0.5">Pieza</p>
                      <p className="font-semibold text-gray-800">{nc.item_nombre || nc.items?.nombre || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-0.5">Cantidad afectada</p>
                      <p className="font-semibold text-feisen-rojo">{nc.cantidad_afectada}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-0.5">Bodega / Área</p>
                      <p className="font-semibold text-gray-800">{nc.bodega_nombre || nc.bodegas?.nombre || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-0.5">Tipo de defecto</p>
                      <p className="font-semibold text-gray-800">{nc.tipo_defecto || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-0.5">Orden / Referencia</p>
                      <p className="font-semibold text-gray-800">{nc.referencia_orden || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-0.5">Moldeador</p>
                      <p className="font-semibold text-orange-600">{nc.moldeador || '—'}</p>
                    </div>
                  </div>
                  {nc.descripcion && (
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-0.5">Descripción</p>
                      <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2">{nc.descripcion}</p>
                    </div>
                  )}
                  {nc.detectado_por && (
                    <p className="text-xs text-gray-400">
                      Reportado por <span className="font-semibold text-gray-600">{nc['detectado_por']?.nombre || '—'}</span>
                    </p>
                  )}
                  {/* Resolución (si está cerrada) */}
                  {nc.estado === 'cerrado' && (
                    <div className="border-t border-gray-100 pt-3 space-y-2">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Resolución</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-400 font-medium mb-0.5">Destino final</p>
                          <p className="font-semibold text-gray-800 capitalize">{nc.destino_final || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 font-medium mb-0.5">Cerrado por</p>
                          <p className="font-semibold text-gray-800">{nc['cerrado_por']?.nombre || '—'}</p>
                        </div>
                      </div>
                      {nc.accion_tomada && (
                        <div>
                          <p className="text-xs text-gray-400 font-medium mb-0.5">Acción tomada</p>
                          <p className="text-sm text-gray-700 bg-green-50 rounded-xl px-3 py-2">{nc.accion_tomada}</p>
                        </div>
                      )}
                      {nc.observaciones_cierre && (
                        <div>
                          <p className="text-xs text-gray-400 font-medium mb-0.5">Observaciones</p>
                          <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2">{nc.observaciones_cierre}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Modal crear NC ───────────────────────────────────────────────────────── */}
      {modalCrear && (
        <Modal titulo="Registrar No Conformidad" onCerrar={() => { setModalCrear(false); setMsg(null) }}>
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

            {/* Pieza */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Pieza afectada</label>
              <div className="relative">
                <input
                  value={busqItem}
                  onChange={e => { setBusqItem(e.target.value); setMostrarItems(true); if (!e.target.value) { setF('item_id', ''); setF('item_nombre', '') } }}
                  onFocus={() => setMostrarItems(true)}
                  onBlur={() => setTimeout(() => setMostrarItems(false), 150)}
                  placeholder="Buscar pieza en inventario..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                />
                {form.item_nombre && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs bg-blue-100 text-feisen-azul px-2 py-0.5 rounded-lg font-medium max-w-40 truncate">
                    {form.item_nombre}
                  </span>
                )}
                {mostrarItems && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {items
                      .filter(i => !busqItem.trim() || i.nombre.toLowerCase().includes(busqItem.toLowerCase()))
                      .slice(0, 30)
                      .map(i => (
                        <button key={i.id} type="button"
                          onMouseDown={() => { setF('item_id', i.id); setF('item_nombre', i.nombre); setBusqItem(i.nombre); setMostrarItems(false) }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 text-gray-800">
                          {i.nombre}
                        </button>
                      ))}
                    <button type="button"
                      onMouseDown={() => { setF('item_id', ''); setMostrarItems(false) }}
                      className="w-full text-left px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-50 italic">
                      Ingresar nombre manual ↓
                    </button>
                  </div>
                )}
              </div>
              {/* Nombre manual si no está en inventario */}
              {!form.item_id && (
                <input value={form.item_nombre}
                  onChange={e => setF('item_nombre', e.target.value)}
                  placeholder="O escribe el nombre manualmente"
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Cantidad */}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Cantidad afectada *</label>
                <input type="number" min="1" step="1" value={form.cantidad_afectada}
                  onChange={e => setF('cantidad_afectada', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
              </div>
              {/* Fecha */}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Fecha detección</label>
                <input type="date" value={form.fecha_deteccion}
                  onChange={e => setF('fecha_deteccion', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
              </div>
            </div>

            {/* Bodega */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Área / Bodega donde se encontró</label>
              <select value={form.bodega_id}
                onChange={e => {
                  const bod = bodegas.find(b => b.id === e.target.value)
                  setF('bodega_id', e.target.value)
                  setF('bodega_nombre', bod?.nombre || '')
                }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
                <option value="">Seleccionar área...</option>
                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>

            {/* Tipo de defecto */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Tipo de defecto</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {TIPOS_DEFECTO.map(t => (
                  <button key={t} type="button"
                    onClick={() => setF('tipo_defecto', form.tipo_defecto === t ? '' : t)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors
                      ${form.tipo_defecto === t ? 'bg-feisen-rojo text-white border-feisen-rojo' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    {t}
                  </button>
                ))}
              </div>
              {form.tipo_defecto === 'Otro' && (
                <input value={form.tipo_defecto_otro || ''}
                  onChange={e => setF('tipo_defecto', e.target.value)}
                  placeholder="Describir tipo de defecto..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
              )}
            </div>

            {/* Descripción */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Descripción del problema</label>
              <textarea value={form.descripcion} onChange={e => setF('descripcion', e.target.value)}
                rows={2} placeholder="¿Qué se encontró exactamente?"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Orden de referencia */}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Orden de moldeo / fundida</label>
                <input value={form.referencia_orden} onChange={e => setF('referencia_orden', e.target.value)}
                  placeholder="ORD-MOL-0001 o FUN-0001"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
              </div>
              {/* Moldeador */}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Moldeador responsable</label>
                <input value={form.moldeador} onChange={e => setF('moldeador', e.target.value)}
                  placeholder="Nombre del moldeador"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
              </div>
            </div>

            <p className="text-xs text-amber-600 font-medium bg-amber-50 px-3 py-2 rounded-xl">
              ⚠️ Los movimientos de inventario y el ajuste de nómina se hacen manualmente desde sus respectivos módulos.
            </p>

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setModalCrear(false); setMsg(null) }}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">
                Cancelar
              </button>
              <button onClick={crearNC} disabled={guardando}
                className="flex-1 bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {guardando ? 'Guardando...' : 'Registrar NC'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal cerrar NC ──────────────────────────────────────────────────────── */}
      {ncACerrar && (
        <Modal titulo={`Cerrar ${ncACerrar.numero}`} onCerrar={() => { setNcACerrar(null); setMsg(null) }}>
          <div className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm space-y-1">
              <p><span className="text-gray-500">Pieza:</span> <span className="font-semibold">{ncACerrar.item_nombre || ncACerrar.items?.nombre || '—'}</span></p>
              <p><span className="text-gray-500">Cantidad:</span> <span className="font-semibold text-feisen-rojo">{ncACerrar.cantidad_afectada}</span></p>
              {ncACerrar.moldeador && <p><span className="text-gray-500">Moldeador:</span> <span className="font-semibold text-orange-600">{ncACerrar.moldeador}</span></p>}
            </div>

            {/* Destino final */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-2">Destino final *</label>
              <div className="grid grid-cols-2 gap-2">
                {DESTINOS.map(d => (
                  <button key={d.value} type="button"
                    onClick={() => setFC('destino_final', d.value)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors text-left
                      ${formCierre.destino_final === d.value ? 'bg-feisen-azul text-white border-feisen-azul' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Acción tomada */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Acción tomada</label>
              <textarea value={formCierre.accion_tomada} onChange={e => setFC('accion_tomada', e.target.value)}
                rows={2} placeholder="¿Qué se hizo con la pieza?"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul resize-none" />
            </div>

            {/* Observaciones */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Observaciones</label>
              <textarea value={formCierre.observaciones_cierre} onChange={e => setFC('observaciones_cierre', e.target.value)}
                rows={2} placeholder="Notas adicionales para el registro..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul resize-none" />
            </div>

            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-xl font-medium">
              ⚠️ Recuerda hacer manualmente: el movimiento de inventario y el ajuste de nómina del moldeador si aplica.
            </p>

            <div className="flex gap-3">
              <button onClick={() => { setNcACerrar(null); setMsg(null) }}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">
                Cancelar
              </button>
              <button onClick={cerrarNC} disabled={guardando}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {guardando ? 'Cerrando...' : 'Cerrar NC'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
