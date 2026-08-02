import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Trash2, CheckCircle, Search } from 'lucide-react'
import Alerta from '../shared/Alerta'
import Spinner from '../shared/Spinner'

const DESTINOS = ['Producción y ensamble', 'Venta externa', 'Otro']
const PROD0    = { item_id: '', item_nombre: '', unidad: '', cantidad: '' }

// ── Selector de producto con búsqueda ──────────────────────────────────────
function SelectorItem({ value, items, onSelect }) {
  const [busqueda,     setBusqueda]     = useState(value || '')
  const [mostrarLista, setMostrarLista] = useState(false)

  const filtrados = busqueda.trim()
    ? items.filter(i => i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : items

  function elegir(item) {
    setBusqueda(item.nombre)
    setMostrarLista(false)
    onSelect(item)
  }

  return (
    <div className="relative flex-1 min-w-0">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setMostrarLista(true); if (!e.target.value) onSelect(null) }}
          onFocus={() => setMostrarLista(true)}
          onBlur={() => setTimeout(() => {
            setMostrarLista(false)
            const coincide = items.some(i => i.nombre === busqueda)
            if (busqueda && !coincide) { setBusqueda(''); onSelect(null) }
          }, 150)}
          placeholder="Buscar producto..."
          className="w-full border border-gray-300 rounded-xl pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
        />
      </div>
      {mostrarLista && filtrados.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
          {filtrados.slice(0, 25).map(i => (
            <button key={i.id} type="button"
              onMouseDown={() => elegir(i)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0 flex justify-between items-center">
              <span className="font-medium text-gray-800">{i.nombre}</span>
              <span className="text-xs text-gray-400 ml-2">{i.unidad_medida}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Input con sugerencias guardadas en localStorage ───────────────────────
function InputConSugerencias({ value, onChange, placeholder, storageKey, colorRing = 'feisen-azul' }) {
  const [open, setOpen] = useState(false)
  const sugerencias = JSON.parse(localStorage.getItem(storageKey) || '[]')
  const filtradas = value.trim()
    ? sugerencias.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase())
    : sugerencias

  return (
    <div className="relative">
      <input
        type="text" required
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-${colorRing}`}
      />
      {open && filtradas.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
          {filtradas.map((s, i) => (
            <button key={i} type="button"
              onMouseDown={() => { onChange(s); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b last:border-0 flex items-center gap-2">
              <span className="text-gray-300 text-xs">↩</span>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function guardarSugerencia(key, valor) {
  const existentes = JSON.parse(localStorage.getItem(key) || '[]')
  const nuevas = [valor, ...existentes.filter(s => s !== valor)].slice(0, 30)
  localStorage.setItem(key, JSON.stringify(nuevas))
}

// ── Agrupar productos duplicados sumando sus cantidades ───────────────────
function agruparProductos(lista) {
  const mapa = {}
  for (const p of lista) {
    if (!p.item_id || parseFloat(p.cantidad) <= 0) continue
    if (mapa[p.item_id]) {
      mapa[p.item_id].cantidad += parseFloat(p.cantidad)
    } else {
      mapa[p.item_id] = { ...p, cantidad: parseFloat(p.cantidad) }
    }
  }
  return Object.values(mapa)
}

// ── Componente principal ───────────────────────────────────────────────────
export default function RegistrarMovimientoAlmacenista() {
  const { perfil, bodegasOperacion } = useAuth()

  const [tipo,     setTipo]     = useState('entrada')
  const [items,    setItems]    = useState([])
  const [bodega,   setBodega]   = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando,setGuardando]= useState(false)
  const [exito,    setExito]    = useState(false)
  const [error,    setError]    = useState('')

  // ── Estado ENTRADA ──
  const [proveedor,  setProveedor]  = useState('')
  const [productos,  setProductos]  = useState([{ ...PROD0 }])
  const [pedidos,    setPedidos]    = useState([])
  const [pedidoId,   setPedidoId]   = useState('')

  // ── Estado SALIDA ──
  const [sProductos, setSProductos] = useState([{ ...PROD0 }])
  const [receptor,   setReceptor]   = useState('')
  const [notas,      setNotas]      = useState('')

  useEffect(() => {
    async function cargar() {
      if (!bodegasOperacion?.[0]) { setCargando(false); return }
      const [{ data: bod }, { data: its }, { data: peds }] = await Promise.all([
        supabase.from('bodegas').select('id, nombre').eq('id', bodegasOperacion[0]).single(),
        supabase.from('items')
          .select('id, nombre, unidad_medida, bodega_id, precio_costo')
          .eq('bodega_id', bodegasOperacion[0]).eq('activo', true).order('nombre'),
        supabase.from('pedidos').select('id, numero, estado')
          .in('estado', ['pendiente', 'en_transito']).order('created_at', { ascending: false }).limit(50),
      ])
      setBodega(bod)
      setItems(its || [])
      setPedidos(peds || [])
      setCargando(false)
    }
    cargar()
  }, [])

  // ── Generador de número ──
  async function generarNumero(prefixBase) {
    const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
    const prefix = `${prefixBase}-${iniciales}-`
    const { data: last } = await supabase
      .from('movimientos').select('numero').like('numero', `${prefix}%`)
      .order('numero', { ascending: false }).limit(1).maybeSingle()
    const n = last?.numero ? parseInt(last.numero.replace(prefix, ''), 10) || 0 : 0
    return `${prefix}${String(n + 1).padStart(4, '0')}`
  }

  // ── SUBMIT ENTRADA ──
  async function handleEntrada(e) {
    e.preventDefault()
    setError('')
    if (!proveedor.trim())    { setError('Ingresa el nombre del proveedor.'); return }
    if (!bodega)              { setError('No tienes bodega asignada. Contacta al administrador.'); return }
    const agrupados = agruparProductos(productos)
    if (agrupados.length === 0) { setError('Agrega al menos un producto con cantidad.'); return }

    setGuardando(true)
    try {
      const numero = await generarNumero('REC')
      const payloads = agrupados.map(p => ({
        numero,
        tipo:                  'entrada',
        item_id:               p.item_id,
        bodega_destino_id:     bodega.id,
        bodega_origen_id:      null,
        cantidad:              p.cantidad,
        precio_costo_snapshot: items.find(i => i.id === p.item_id)?.precio_costo || 0,
        centro_costo:          bodega.nombre,
        usuario_id:            perfil.id,
        proveedor:             proveedor.trim(),
        pedido_id:             pedidoId || null,
        foto_remision_url: null, destino: null,
        numero_of: null, serial_motor: null, referencia: null, motivo: null, cliente: null,
      }))
      const { error: err } = await supabase.from('movimientos').insert(payloads)
      if (err) { setError('Error al guardar: ' + err.message); return }
      guardarSugerencia('feisen_proveedores', proveedor.trim())
      setExito(true)
      setTimeout(() => {
        setExito(false)
        setProveedor('')
        setProductos([{ ...PROD0 }])
        setPedidoId('')
      }, 2000)
    } catch (err) {
      setError('Error inesperado: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  // ── SUBMIT SALIDA ──
  async function handleSalida(e) {
    e.preventDefault()
    setError('')
    if (!receptor.trim())     { setError('Ingresa el nombre de quien recibe.'); return }
    if (!bodega)              { setError('No tienes bodega asignada.'); return }
    const agrupados = agruparProductos(sProductos)
    if (agrupados.length === 0) { setError('Agrega al menos un producto con cantidad.'); return }

    setGuardando(true)
    try {
      const numero = await generarNumero('SAL')
      const payloads = agrupados.map(p => ({
        numero,
        tipo:                  'salida',
        item_id:               p.item_id,
        bodega_origen_id:      bodega.id,
        bodega_destino_id:     null,
        cantidad:              p.cantidad,
        precio_costo_snapshot: items.find(i => i.id === p.item_id)?.precio_costo || 0,
        centro_costo:          bodega.nombre,
        usuario_id:            perfil.id,
        cliente:               receptor.trim(),
        referencia:            notas.trim() || null,
        destino:               null, proveedor: null, pedido_id: null, foto_remision_url: null,
        numero_of:             null, serial_motor: null, motivo: null,
      }))
      const { error: err } = await supabase.from('movimientos').insert(payloads)
      if (err) { setError('Error al guardar: ' + err.message); return }
      guardarSugerencia('feisen_receptores', receptor.trim())
      setExito(true)
      setTimeout(() => {
        setExito(false)
        setSProductos([{ ...PROD0 }])
        setReceptor('')
        setNotas('')
      }, 2000)
    } catch (err) {
      setError('Error inesperado: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  // ── Helpers líneas producto (entrada) ──
  function actualizarProducto(idx, campo, valor) {
    setProductos(prev => prev.map((p, i) => i === idx ? { ...p, [campo]: valor } : p))
  }
  function seleccionarProducto(idx, item) {
    if (!item) { actualizarProducto(idx, 'item_id', ''); actualizarProducto(idx, 'item_nombre', ''); actualizarProducto(idx, 'unidad', ''); return }
    setProductos(prev => prev.map((p, i) => i === idx ? { ...p, item_id: item.id, item_nombre: item.nombre, unidad: item.unidad_medida } : p))
  }

  // ── Helpers líneas producto (salida) ──
  function actualizarSProducto(idx, campo, valor) {
    setSProductos(prev => prev.map((p, i) => i === idx ? { ...p, [campo]: valor } : p))
  }
  function seleccionarSProducto(idx, item) {
    if (!item) { actualizarSProducto(idx, 'item_id', ''); actualizarSProducto(idx, 'item_nombre', ''); actualizarSProducto(idx, 'unidad', ''); return }
    setSProductos(prev => prev.map((p, i) => i === idx ? { ...p, item_id: item.id, item_nombre: item.nombre, unidad: item.unidad_medida } : p))
  }

  if (cargando) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-feisen-azul mb-6">Registrar movimiento</h1>

      {/* Bodega badge */}
      {bodega && (
        <div className="mb-5 flex items-center gap-2">
          <span className="text-sm text-gray-500">Bodega:</span>
          <span className="bg-feisen-azul text-white text-xs font-semibold px-3 py-1 rounded-full">{bodega.nombre}</span>
        </div>
      )}

      {/* Tabs Entrada / Salida */}
      <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {['entrada', 'salida'].map(t => (
          <button key={t} type="button"
            onClick={() => { setTipo(t); setError(''); setExito(false) }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold capitalize transition-colors
              ${tipo === t ? 'bg-white shadow text-feisen-azul' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'entrada' ? '📥 Entrada' : '📤 Salida'}
          </button>
        ))}
      </div>

      {exito && (
        <div className="mb-4 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle size={20} className="text-green-500 shrink-0" />
          <p className="text-green-700 font-medium text-sm">
            {tipo === 'entrada' ? '¡Entrada registrada exitosamente!' : '¡Salida registrada exitosamente!'}
          </p>
        </div>
      )}
      {error && <Alerta tipo="error" mensaje={error} />}

      {/* ── FORMULARIO ENTRADA ── */}
      {tipo === 'entrada' && (
        <form onSubmit={handleEntrada} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

          {/* Proveedor */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Proveedor *</label>
            <InputConSugerencias
              value={proveedor}
              onChange={setProveedor}
              placeholder="Nombre del proveedor"
              storageKey="feisen_proveedores"
              colorRing="feisen-azul"
            />
          </div>

          {/* Pedido (opcional) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Pedido asociado <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <select
              value={pedidoId}
              onChange={e => setPedidoId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
              <option value="">Sin pedido asociado</option>
              {pedidos.map(p => (
                <option key={p.id} value={p.id}>
                  {p.numero} — {p.estado === 'en_transito' ? 'En tránsito' : 'Pendiente'}
                </option>
              ))}
            </select>
          </div>

          {/* Productos */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Productos *</label>
            <div className="space-y-3">
              {productos.map((prod, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <SelectorItem
                    value={prod.item_nombre}
                    items={items}
                    onSelect={item => seleccionarProducto(idx, item)}
                  />
                  <input
                    type="number" min="0.001" step="0.001" placeholder="Cant."
                    value={prod.cantidad}
                    onChange={e => actualizarProducto(idx, 'cantidad', e.target.value)}
                    className="w-24 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  />
                  {prod.unidad && (
                    <span className="text-xs text-gray-400 w-8 shrink-0">{prod.unidad}</span>
                  )}
                  {productos.length > 1 && (
                    <button type="button"
                      onClick={() => setProductos(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-gray-300 hover:text-feisen-rojo transition-colors shrink-0">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button type="button"
              onClick={() => setProductos(prev => [...prev, { ...PROD0 }])}
              className="mt-3 flex items-center gap-1.5 text-sm text-feisen-azul font-medium hover:underline">
              <Plus size={15} /> Agregar otro producto
            </button>
          </div>

          <button type="submit" disabled={guardando}
            className="w-full bg-feisen-azul text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity">
            {guardando ? 'Registrando...' : '📥 Registrar entrada'}
          </button>
        </form>
      )}

      {/* ── FORMULARIO SALIDA ── */}
      {tipo === 'salida' && (
        <form onSubmit={handleSalida} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

          {/* Recibido por */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Recibido por *</label>
            <InputConSugerencias
              value={receptor}
              onChange={setReceptor}
              placeholder="Nombre de quien recibe"
              storageKey="feisen_receptores"
              colorRing="feisen-rojo"
            />
          </div>

          {/* Productos */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Productos *</label>
            <div className="space-y-3">
              {sProductos.map((prod, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <SelectorItem
                    value={prod.item_nombre}
                    items={items}
                    onSelect={item => seleccionarSProducto(idx, item)}
                  />
                  <input
                    type="number" min="0.001" step="0.001" placeholder="Cant."
                    value={prod.cantidad}
                    onChange={e => actualizarSProducto(idx, 'cantidad', e.target.value)}
                    className="w-24 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-rojo"
                  />
                  {prod.unidad && (
                    <span className="text-xs text-gray-400 w-8 shrink-0">{prod.unidad}</span>
                  )}
                  {sProductos.length > 1 && (
                    <button type="button"
                      onClick={() => setSProductos(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-gray-300 hover:text-feisen-rojo transition-colors shrink-0">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button"
              onClick={() => setSProductos(prev => [...prev, { ...PROD0 }])}
              className="mt-3 flex items-center gap-1.5 text-sm text-feisen-rojo font-medium hover:underline">
              <Plus size={15} /> Agregar otro producto
            </button>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Notas <span className="font-normal text-gray-400">(referencias de máquina, observaciones…)</span>
            </label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Ej: Para mezcladora #7, motor serie 1234, pedido urgente…"
              rows={3}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-rojo resize-none"
            />
          </div>

          <button type="submit" disabled={guardando}
            className="w-full bg-feisen-rojo text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity">
            {guardando ? 'Registrando...' : '📤 Registrar salida'}
          </button>
        </form>
      )}
    </div>
  )
}
