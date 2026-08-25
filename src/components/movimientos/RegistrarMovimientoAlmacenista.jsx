import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Trash2, CheckCircle, Search, Flame, ShoppingCart, Wrench, Factory, PenLine } from 'lucide-react'
import Alerta from '../shared/Alerta'
import Spinner from '../shared/Spinner'

const PROD0 = { item_id: '', item_nombre: '', unidad: '', cantidad: '', peso_unitario: null }

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

// ── Input con sugerencias (recibe el array directamente) ─────────────────
function InputConSugerencias({ value, onChange, placeholder, sugerencias = [], colorRing = 'feisen-azul' }) {
  const [open, setOpen] = useState(false)
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

// ── Canvas de firma digital ───────────────────────────────────────────────
function FirmaCanvas({ onFirma, firmaDataUrl }) {
  const canvasRef = useRef(null)
  const dibujando = useRef(false)
  const tieneTrazos = useRef(false)

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches?.[0]
    const clientX = touch ? touch.clientX : e.clientX
    const clientY = touch ? touch.clientY : e.clientY
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function iniciar(e) {
    e.preventDefault()
    dibujando.current = true
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function dibujar(e) {
    e.preventDefault()
    if (!dibujando.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#064794'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    tieneTrazos.current = true
  }

  function terminar(e) {
    e.preventDefault()
    if (!dibujando.current) return
    dibujando.current = false
    if (tieneTrazos.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png')
      onFirma(dataUrl)
    }
  }

  function limpiar() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    tieneTrazos.current = false
    onFirma(null)
  }

  return (
    <div>
      <div className={`rounded-xl overflow-hidden border-2 transition-colors ${firmaDataUrl ? 'border-green-400' : 'border-dashed border-gray-300'}`}>
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          className="w-full touch-none bg-white block cursor-crosshair"
          onMouseDown={iniciar}
          onMouseMove={dibujar}
          onMouseUp={terminar}
          onMouseLeave={terminar}
          onTouchStart={iniciar}
          onTouchMove={dibujar}
          onTouchEnd={terminar}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        {firmaDataUrl
          ? <p className="text-xs text-green-600 font-medium">✓ Firma registrada</p>
          : <p className="text-xs text-gray-400">Firma con el dedo o el mouse</p>
        }
        <button type="button" onClick={limpiar}
          className="text-xs text-gray-400 hover:text-feisen-rojo transition-colors underline">
          Limpiar
        </button>
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────
export default function RegistrarMovimientoAlmacenista() {
  const { perfil, bodegasOperacion } = useAuth()

  const HOY_COL = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD en hora local

  const [tipo,        setTipo]        = useState('entrada')
  const [tipoEntrada, setTipoEntrada] = useState('compra')    // 'compra' | 'produccion'
  const [tipoSalida,  setTipoSalida]  = useState('externa')   // 'externa' | 'interna'
  const [fechaMov,    setFechaMov]    = useState(HOY_COL)
  const [items,       setItems]       = useState([])
  const [bodega,      setBodega]      = useState(null)
  const [cargando,    setCargando]    = useState(true)
  const [guardando,   setGuardando]   = useState(false)
  const [exito,       setExito]       = useState(false)
  const [error,       setError]       = useState('')

  // ── Estado ENTRADA ──
  const [proveedor,  setProveedor]  = useState('')
  const [colada,     setColada]     = useState('')
  const [productos,  setProductos]  = useState([{ ...PROD0 }])
  const [pedidos,    setPedidos]    = useState([])
  const [pedidoId,   setPedidoId]   = useState('')

  // ── Estado SALIDA ──
  const [sProductos,     setSProductos]     = useState([{ ...PROD0 }])
  const [receptor,       setReceptor]       = useState('')
  const [notas,          setNotas]          = useState('')
  const [destinoBodegaId,setDestinoBodegaId]= useState('') // ID de bodega destino (transferencia interna)
  const [numeroOF,       setNumeroOF]       = useState('')
  const [firmaDataUrl,   setFirmaDataUrl]   = useState(null)
  const [todasBodegas,   setTodasBodegas]   = useState([])
  // ── Estado salida MECANIZADOS ──
  const [tipoSalidaMec,  setTipoSalidaMec]  = useState('externa')   // 'externa' | 'produccion'
  const [numeroOrden,    setNumeroOrden]    = useState('')
  const [colaborador,    setColaborador]    = useState('')
  const [firmaReceptorUrl, setFirmaReceptorUrl] = useState(null)

  const esFundicion   = bodega?.nombre?.includes('FUNDICIÓN')
  const esMecanizados = bodega?.nombre?.includes('MECANIZADOS')

  // ── Sugerencias sincronizadas con Supabase ──
  const [sugsDB, setSugsDB] = useState({})

  useEffect(() => {
    if (!perfil?.id) return
    supabase.from('profiles').select('sugerencias').eq('id', perfil.id).single()
      .then(({ data }) => { if (data?.sugerencias) setSugsDB(data.sugerencias) })
  }, [perfil?.id])

  async function guardarSugerencia(key, valor) {
    const existentes = sugsDB[key] || []
    const nuevas = [valor, ...existentes.filter(s => s !== valor)].slice(0, 30)
    const nuevasSugs = { ...sugsDB, [key]: nuevas }
    setSugsDB(nuevasSugs)
    if (perfil?.id) {
      await supabase.from('profiles').update({ sugerencias: nuevasSugs }).eq('id', perfil.id)
    }
  }

  // Para modo vista de admin: selector de bodega manual
  const [bodegaPreviewId, setBodegaPreviewId] = useState('')
  const [bodegasDisponibles, setBodegasDisponibles] = useState([])
  const esAdminEnPreview = !bodegasOperacion && perfil

  useEffect(() => {
    if (!esAdminEnPreview) return
    supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre')
      .then(async ({ data }) => {
        const bods = data || []
        setBodegasDisponibles(bods)
        if (bods.length > 0) {
          const b = bods[0]
          setBodegaPreviewId(b.id)
          setBodega(b)
          const [{ data: its }, { data: peds }, { data: allBods }] = await Promise.all([
            supabase.from('items').select('id, nombre, unidad_medida, bodega_id, precio_costo, peso_unitario').eq('bodega_id', b.id).eq('activo', true).order('nombre'),
            supabase.from('pedidos').select('id, numero, estado').in('estado', ['pendiente', 'en_transito']).order('created_at', { ascending: false }).limit(50),
            supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
          ])
          setItems(its || [])
          setPedidos(peds || [])
          setTodasBodegas((allBods || []).filter(bd => bd.id !== b.id))
        }
        setCargando(false)
      })
  }, [esAdminEnPreview])

  async function cambiarBodegaPreview(bodegaId) {
    const b = bodegasDisponibles.find(b => b.id === bodegaId)
    if (!b) return
    setBodegaPreviewId(bodegaId)
    setBodega(b)
    const [{ data: its }, { data: peds }, { data: allBods }] = await Promise.all([
      supabase.from('items').select('id, nombre, unidad_medida, bodega_id, precio_costo, peso_unitario').eq('bodega_id', b.id).eq('activo', true).order('nombre'),
      supabase.from('pedidos').select('id, numero, estado').in('estado', ['pendiente', 'en_transito']).order('created_at', { ascending: false }).limit(50),
      supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setItems(its || [])
    setPedidos(peds || [])
    setTodasBodegas((allBods || []).filter(bd => bd.id !== b.id))
  }

  useEffect(() => {
    async function cargar() {
      if (!bodegasOperacion?.[0]) { setCargando(false); return }
      const [{ data: bod }, { data: ownItems }, { data: peds }, { data: bods }, { data: stockRows }] = await Promise.all([
        supabase.from('bodegas').select('id, nombre').eq('id', bodegasOperacion[0]).single(),
        supabase.from('items')
          .select('id, nombre, unidad_medida, bodega_id, precio_costo, peso_unitario')
          .eq('bodega_id', bodegasOperacion[0]).eq('activo', true).order('nombre'),
        supabase.from('pedidos').select('id, numero, estado')
          .in('estado', ['pendiente', 'en_transito']).order('created_at', { ascending: false }).limit(50),
        supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
        // Items de otras bodegas que tienen stock aquí (ej: FUNDICIÓN → MECANIZADOS)
        supabase.from('stock').select('item_id').eq('bodega_id', bodegasOperacion[0]).gt('cantidad_actual', 0),
      ])

      // Combinar items propios + items de otras bodegas con stock aquí
      const ownIds = new Set((ownItems || []).map(i => i.id))
      const extraIds = (stockRows || []).map(r => r.item_id).filter(id => !ownIds.has(id))
      let extraItems = []
      if (extraIds.length > 0) {
        const { data: ext } = await supabase.from('items')
          .select('id, nombre, unidad_medida, bodega_id, precio_costo, peso_unitario')
          .in('id', extraIds).eq('activo', true)
        extraItems = ext || []
      }
      const todosItems = [...(ownItems || []), ...extraItems].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

      setBodega(bod)
      setItems(todosItems)
      setPedidos(peds || [])
      setTodasBodegas((bods || []).filter(b => b.id !== bodegasOperacion[0]))
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
    if (!bodega) { setError('No tienes bodega asignada. Contacta al administrador.'); return }

    const esCompra = !esFundicion || tipoEntrada === 'compra'
    if (esCompra && !proveedor.trim()) { setError('Ingresa el nombre del proveedor.'); return }

    const agrupados = agruparProductos(productos)
    if (agrupados.length === 0) { setError('Agrega al menos un producto con cantidad.'); return }

    setGuardando(true)
    try {
      const numero = await generarNumero('REC')
      const proveedorFinal  = esCompra ? proveedor.trim() : 'Producción interna'
      const referenciaFinal = (!esCompra && colada.trim()) ? colada.trim() : null

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
        proveedor:             proveedorFinal,
        pedido_id:             esCompra ? (pedidoId || null) : null,
        referencia:            referenciaFinal,
        fecha_movimiento:      fechaMov || null,
        foto_remision_url: null, destino: null,
        numero_of: null, serial_motor: null, motivo: null, cliente: null,
      }))
      const { error: err } = await supabase.from('movimientos').insert(payloads)
      if (err) { setError('Error al guardar: ' + err.message); return }
      if (esCompra) guardarSugerencia('feisen_proveedores', proveedor.trim())
      setExito(true)
      setTimeout(() => {
        setExito(false)
        setProveedor('')
        setColada('')
        setProductos([{ ...PROD0 }])
        setPedidoId('')
        setFechaMov(HOY_COL)
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
    if (!bodega) { setError('No tienes bodega asignada.'); return }

    const esInterna        = esFundicion && tipoSalida === 'interna'
    const esExternaFundic  = esFundicion && tipoSalida === 'externa'

    if (!esFundicion && !esMecanizados && !receptor.trim())                           { setError('Ingresa el nombre de quien recibe.'); return }
    if (esExternaFundic && !numeroOF.trim())                                          { setError('Ingresa el N° OF.'); return }
    if (esInterna && !destinoBodegaId)                                                { setError('Selecciona el destino interno.'); return }
    if (!firmaDataUrl)                                                                { setError('Se requiere la firma del responsable.'); return }
    if (esMecanizados && tipoSalidaMec === 'externa' && !numeroOrden.trim())          { setError('Ingresa el N° de orden.'); return }
    if (esMecanizados && tipoSalidaMec === 'produccion' && !colaborador.trim())       { setError('Ingresa el colaborador que recibe.'); return }
    if (esMecanizados && tipoSalidaMec === 'produccion' && !firmaReceptorUrl)         { setError('Se requiere la firma del colaborador que recibe.'); return }

    const agrupados = agruparProductos(sProductos)
    if (agrupados.length === 0) { setError('Agrega al menos un producto con cantidad.'); return }

    const destNombre = esInterna ? (todasBodegas.find(b => b.id === destinoBodegaId)?.nombre || '') : null

    setGuardando(true)

    // Validar stock suficiente para cada producto antes de guardar
    for (const p of agrupados) {
      const { data: stockRow } = await supabase
        .from('stock')
        .select('cantidad_actual')
        .eq('item_id', p.item_id)
        .eq('bodega_id', bodega.id)
        .maybeSingle()
      const stockActual = stockRow?.cantidad_actual ?? 0
      if (stockActual < p.cantidad) {
        const itemNombre = items.find(i => i.id === p.item_id)?.nombre || p.item_id
        setError(`Stock insuficiente para "${itemNombre}". Disponible: ${stockActual.toLocaleString('es-CO')} — solicitado: ${p.cantidad.toLocaleString('es-CO')}`)
        setGuardando(false)
        return
      }
    }
    try {
      const numero = await generarNumero('SAL')
      const payloads = agrupados.map(p => ({
        numero,
        tipo:                  'salida',
        item_id:               p.item_id,
        bodega_origen_id:      bodega.id,
        bodega_destino_id:     esInterna ? destinoBodegaId : null,
        cantidad:              p.cantidad,
        precio_costo_snapshot: items.find(i => i.id === p.item_id)?.precio_costo || 0,
        centro_costo:          bodega.nombre,
        usuario_id:            perfil.id,
        cliente:               esMecanizados && tipoSalidaMec === 'produccion'
                                 ? colaborador.trim()
                                 : (!esFundicion && !esMecanizados ? receptor.trim() : null),
        referencia:            notas.trim() || null,
        destino:               esMecanizados && tipoSalidaMec === 'produccion' ? 'Producción interna' : destNombre,
        numero_of:             esExternaFundic ? numeroOF.trim()
                                 : (esMecanizados && tipoSalidaMec === 'externa' ? numeroOrden.trim() : null),
        foto_remision_url:     firmaDataUrl,
        firma_receptor_url:    (esMecanizados && tipoSalidaMec === 'produccion') ? firmaReceptorUrl : null,
        fecha_movimiento:      fechaMov || null,
        proveedor: null, pedido_id: null, serial_motor: null, motivo: null,
      }))
      const { error: err } = await supabase.from('movimientos').insert(payloads)
      if (err) { setError('Error al guardar: ' + err.message); return }

      // ── Transferencia interna: crear entrada automática en bodega destino ──
      if (esInterna && destinoBodegaId) {
        const numeroRec = await generarNumero('REC')
        const entradas = agrupados.map(p => ({
          numero:                numeroRec,
          tipo:                  'entrada',
          item_id:               p.item_id,
          bodega_destino_id:     destinoBodegaId,
          bodega_origen_id:      bodega.id,
          cantidad:              p.cantidad,
          precio_costo_snapshot: items.find(i => i.id === p.item_id)?.precio_costo || 0,
          centro_costo:          destNombre,
          usuario_id:            perfil.id,
          referencia:            `Transferencia desde ${bodega.nombre}`,
          fecha_movimiento:      fechaMov || null,
          proveedor: null, pedido_id: null, destino: null, numero_of: null,
          serial_motor: null, motivo: null, cliente: null, foto_remision_url: null,
        }))
        const { error: errEnt } = await supabase.from('movimientos').insert(entradas)
        if (errEnt) {
          setError(`Salida registrada (${numero}), pero error al crear la entrada automática en ${destNombre}: ` + errEnt.message)
          return
        }
      }

      if (!esInterna && !esMecanizados) guardarSugerencia('feisen_receptores', receptor.trim())
      setExito(true)
      setTimeout(() => {
        setExito(false)
        setSProductos([{ ...PROD0 }])
        setReceptor('')
        setNotas('')
        setDestinoBodegaId('')
        setNumeroOF('')
        setFirmaDataUrl(null)
        setFirmaReceptorUrl(null)
        setNumeroOrden('')
        setColaborador('')
        setTipoSalidaMec('externa')
        setFechaMov(HOY_COL)
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
    if (!item) {
      setProductos(prev => prev.map((p, i) => i === idx ? { ...PROD0 } : p))
      return
    }
    setProductos(prev => prev.map((p, i) => i === idx
      ? { ...p, item_id: item.id, item_nombre: item.nombre, unidad: item.unidad_medida, peso_unitario: item.peso_unitario ?? null }
      : p
    ))
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

      {/* Bodega badge / selector en modo vista */}
      {esAdminEnPreview ? (
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">Bodega (vista):</span>
          <select
            value={bodegaPreviewId}
            onChange={e => cambiarBodegaPreview(e.target.value)}
            className="border border-amber-300 rounded-xl px-3 py-1.5 text-sm bg-amber-50 text-amber-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            {bodegasDisponibles.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </div>
      ) : bodega && (
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

      {/* Fecha del movimiento — compartida entre entrada y salida */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <label className="text-sm font-semibold text-gray-700 block mb-1.5">
          Fecha del movimiento
        </label>
        <input
          type="date"
          value={fechaMov}
          max={new Date().toLocaleDateString('en-CA')}
          onChange={e => setFechaMov(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
        />
        <p className="text-xs text-gray-400 mt-1">
          Por defecto es hoy. Cambia si el movimiento ocurrió en otra fecha.
        </p>
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

          {/* Tipo de entrada — solo para FUNDICIÓN */}
          {esFundicion && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de entrada *</label>
              <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
                <button type="button"
                  onClick={() => { setTipoEntrada('compra'); setError('') }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors
                    ${tipoEntrada === 'compra' ? 'bg-white shadow text-feisen-azul' : 'text-gray-500 hover:text-gray-700'}`}>
                  <ShoppingCart size={15} /> Compra — Materia Prima
                </button>
                <button type="button"
                  onClick={() => { setTipoEntrada('produccion'); setError('') }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors
                    ${tipoEntrada === 'produccion' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Flame size={15} /> Producción — Fundida
                </button>
              </div>
            </div>
          )}

          {/* Proveedor — solo para compra */}
          {(!esFundicion || tipoEntrada === 'compra') && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Proveedor *</label>
              <InputConSugerencias
                value={proveedor}
                onChange={setProveedor}
                placeholder="Nombre del proveedor"
                sugerencias={sugsDB['feisen_proveedores'] || []}
                colorRing="feisen-azul"
              />
            </div>
          )}

          {/* Pedido asociado — solo para compra */}
          {(!esFundicion || tipoEntrada === 'compra') && (
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
          )}

          {/* N° de colada — solo para produccion */}
          {esFundicion && tipoEntrada === 'produccion' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                N° de colada <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={colada}
                onChange={e => setColada(e.target.value)}
                placeholder="Ej: C-2026-001"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          )}

          {/* Productos */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Productos *</label>
            <div className="space-y-3">
              {productos.map((prod, idx) => (
                <div key={idx}>
                  <div className="flex gap-2 items-center">
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
                  {/* Peso total — solo produccion con peso_unitario */}
                  {esFundicion && tipoEntrada === 'produccion' && prod.peso_unitario && prod.cantidad && parseFloat(prod.cantidad) > 0 && (
                    <p className="mt-1 ml-1 text-xs text-orange-500 font-medium">
                      ⚖️ Peso total: {(parseFloat(prod.cantidad) * parseFloat(prod.peso_unitario)).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                    </p>
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
            className={`w-full text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity
              ${esFundicion && tipoEntrada === 'produccion' ? 'bg-orange-600' : 'bg-feisen-azul'}`}>
            {guardando ? 'Registrando...' : (esFundicion && tipoEntrada === 'produccion' ? '🔥 Registrar producción' : '📥 Registrar entrada')}
          </button>
        </form>
      )}

      {/* ── FORMULARIO SALIDA ── */}
      {tipo === 'salida' && (
        <form onSubmit={handleSalida} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

          {/* Tipo de salida — solo para FUNDICIÓN */}
          {esFundicion && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de salida *</label>
              <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
                <button type="button"
                  onClick={() => { setTipoSalida('externa'); setError('') }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors
                    ${tipoSalida === 'externa' ? 'bg-white shadow text-feisen-rojo' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Factory size={15} /> Venta externa
                </button>
                <button type="button"
                  onClick={() => { setTipoSalida('interna'); setError('') }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors
                    ${tipoSalida === 'interna' ? 'bg-white shadow text-feisen-azul' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Wrench size={15} /> Transferencia interna
                </button>
              </div>
            </div>
          )}

          {/* ── SALIDA MECANIZADOS ── */}
          {esMecanizados && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de salida *</label>
                <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
                  <button type="button"
                    onClick={() => { setTipoSalidaMec('externa'); setError('') }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors
                      ${tipoSalidaMec === 'externa' ? 'bg-white shadow text-feisen-rojo' : 'text-gray-500 hover:text-gray-700'}`}>
                    🏭 Cliente externo
                  </button>
                  <button type="button"
                    onClick={() => { setTipoSalidaMec('produccion'); setError('') }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors
                      ${tipoSalidaMec === 'produccion' ? 'bg-white shadow text-feisen-azul' : 'text-gray-500 hover:text-gray-700'}`}>
                    ⚙️ Producción interna
                  </button>
                </div>
              </div>

              {tipoSalidaMec === 'externa' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">N° de orden *</label>
                  <input
                    type="text"
                    value={numeroOrden}
                    onChange={e => setNumeroOrden(e.target.value)}
                    placeholder="Ej: ORD-2026-001"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-rojo"
                  />
                </div>
              )}

              {tipoSalidaMec === 'produccion' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Colaborador que recibe *</label>
                    <InputConSugerencias
                      value={colaborador}
                      onChange={setColaborador}
                      placeholder="Nombre del colaborador"
                      sugerencias={sugsDB['feisen_colaboradores'] || []}
                      colorRing="feisen-azul"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <PenLine size={15} /> Firma del colaborador que recibe *
                    </label>
                    <FirmaCanvas onFirma={setFirmaReceptorUrl} firmaDataUrl={firmaReceptorUrl} />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Notas <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Observaciones adicionales…"
                  rows={2}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-rojo resize-none"
                />
              </div>
            </>
          )}

          {/* ── SALIDA ESTÁNDAR (no FUNDICIÓN, no MECANIZADOS) ── */}
          {!esFundicion && !esMecanizados && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Recibido por *</label>
                <InputConSugerencias
                  value={receptor}
                  onChange={setReceptor}
                  placeholder="Nombre de quien recibe"
                  sugerencias={sugsDB['feisen_receptores'] || []}
                  colorRing="feisen-rojo"
                />
              </div>
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
            </>
          )}

          {/* ── VENTA EXTERNA FUNDICIÓN ── */}
          {esFundicion && tipoSalida === 'externa' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">N° OF *</label>
                <input
                  type="text"
                  value={numeroOF}
                  onChange={e => setNumeroOF(e.target.value)}
                  placeholder="Ej: OF-2026-042"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-rojo"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Notas <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Observaciones adicionales…"
                  rows={2}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-rojo resize-none"
                />
              </div>
            </>
          )}

          {/* ── TRANSFERENCIA INTERNA ── */}
          {esFundicion && tipoSalida === 'interna' && (
            <>
              {/* Destino interno */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Destino *</label>
                <div className="flex flex-wrap gap-2">
                  {todasBodegas.map(b => (
                    <button key={b.id} type="button"
                      onClick={() => setDestinoBodegaId(b.id)}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border-2 transition-all
                        ${destinoBodegaId === b.id
                          ? 'border-feisen-azul bg-feisen-azul text-white'
                          : 'border-gray-200 text-gray-500 hover:border-feisen-azul hover:text-feisen-azul'}`}>
                      <Wrench size={15} />
                      {b.nombre}
                    </button>
                  ))}
                </div>
                {destinoBodegaId && (
                  <p className="mt-1.5 text-xs text-feisen-azul font-medium">
                    → Se creará una entrada automática en <strong>{todasBodegas.find(b => b.id === destinoBodegaId)?.nombre}</strong>
                  </p>
                )}
              </div>
            </>
          )}

          {/* Productos — siempre visible */}
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

          {/* Firma — obligatoria para TODAS las salidas */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <PenLine size={15} /> Firma del responsable *
            </label>
            <FirmaCanvas onFirma={setFirmaDataUrl} firmaDataUrl={firmaDataUrl} />
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
