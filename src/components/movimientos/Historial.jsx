import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Search, ArrowUpDown, RotateCcw, Trash2, RefreshCw, X, PenLine, Pencil } from 'lucide-react'

const TIPO_CONFIG = {
  entrada: { label: 'Entrada', color: 'bg-green-100 text-green-700' },
  salida:  { label: 'Salida',  color: 'bg-red-100 text-red-700'   },
}

export default function Historial() {
  const { perfil, esAdmin, esLogistica, bodegasOperacion } = useAuth()
  const [searchParams] = useSearchParams()
  const [movimientos,  setMovimientos]  = useState([])
  const [items,        setItems]        = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [busqueda,     setBusqueda]     = useState('')
  const [filtroTipo,   setFiltroTipo]   = useState('todos')
  const [filtroItem,   setFiltroItem]   = useState('')
  const [confirmRevert,      setConfirmRevert]      = useState(null)
  const [revirtiendo,        setRevirtiendo]        = useState(false)
  const [confirmDelete,      setConfirmDelete]      = useState(null)
  const [eliminando,         setEliminando]         = useState(false)
  const [msg,                setMsg]                = useState(null)
  const [busquedaProducto,   setBusquedaProducto]   = useState('')
  const [mostrarListaProd,   setMostrarListaProd]   = useState(false)
  const [filtroUsuario,      setFiltroUsuario]      = useState('')
  const [editModal,          setEditModal]          = useState(null)
  const [editForm,           setEditForm]           = useState({})
  const [editGuardando,      setEditGuardando]      = useState(false)
  const [editHistorial,      setEditHistorial]      = useState([])
  const [editados,           setEditados]           = useState(new Set())

  useEffect(() => { cargar() }, [])

  // Pre-filtrar por item si viene en la URL (?item=<id>)
  useEffect(() => {
    const itemId = searchParams.get('item')
    if (itemId && items.length > 0) {
      const found = items.find(i => i.id === itemId)
      if (found) {
        setFiltroItem(found.id)
        setBusquedaProducto(found.nombre)
      }
    }
  }, [items, searchParams])

  async function cargar() {
    setCargando(true)
    const verTodo = esAdmin || esLogistica
    let movsQ = supabase
      .from('movimientos')
      .select('*, items(nombre, unidad_medida), profiles(nombre), bodegas_origen:bodega_origen_id(nombre), bodegas_destino:bodega_destino_id(nombre), pedidos(numero)')
      .order('created_at', { ascending: false })
      .limit(400)

    if (!verTodo) {
      if (bodegasOperacion?.length) {
        // Jefes de área: solo movimientos que entran o salen de sus bodegas
        movsQ = movsQ.or(
          `bodega_origen_id.in.(${bodegasOperacion.join(',')}),bodega_destino_id.in.(${bodegasOperacion.join(',')})`
        )
      } else {
        movsQ = movsQ.eq('usuario_id', perfil.id)
      }
    }

    const [{ data: movs }, { data: its }] = await Promise.all([
      movsQ,
      supabase.from('items').select('id, nombre, bodega_id').order('nombre').limit(2000),
    ])
    setMovimientos(movs || [])
    setItems(its || [])

    setCargando(false)

    // Cargar indicadores de edición en segundo plano (no bloquea la carga principal)
    supabase.from('movimientos_ediciones').select('movimiento_id').limit(5000)
      .then(({ data: edData }) => setEditados(new Set((edData || []).map(e => e.movimiento_id))))
      .catch(() => {})
  }

  // ── editar movimiento (solo admin) ───────────────────────────────────────
  function abrirEdicion(m) {
    setEditForm({
      fecha_movimiento:      m.fecha_movimiento || new Date(m.created_at).toISOString().split('T')[0],
      cantidad:              String(m.cantidad ?? ''),
      precio_costo_snapshot: String(m.precio_costo_snapshot ?? ''),
      referencia:            m.referencia || '',
      proveedor:             m.proveedor  || '',
      cliente:               m.cliente    || '',
      numero_of:             m.numero_of  || '',
      serial_motor:          m.serial_motor || '',
    })
    setEditHistorial([])
    setEditModal(m)
    supabase.from('movimientos_ediciones')
      .select('*, profiles(nombre)')
      .eq('movimiento_id', m.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setEditHistorial(data || []))
  }

  async function guardarEdicion() {
    setEditGuardando(true)
    const m = editModal
    const LABEL = {
      fecha_movimiento: 'Fecha', cantidad: 'Cantidad', precio_costo_snapshot: 'Precio costo',
      referencia: 'Referencia', proveedor: 'Proveedor', cliente: 'Cliente',
      numero_of: 'N° OF', serial_motor: 'Serial motor',
    }
    const cambios = {}
    for (const campo of Object.keys(LABEL)) {
      const esNum  = campo === 'cantidad' || campo === 'precio_costo_snapshot'
      const viejoRaw = m[campo]
      const viejoStr = esNum ? String(viejoRaw ?? 0) : String(viejoRaw ?? '')
      const nuevoStr = editForm[campo]
      if (viejoStr !== nuevoStr) {
        cambios[campo] = { de: esNum ? parseFloat(viejoRaw ?? 0) : (viejoRaw ?? ''), a: esNum ? parseFloat(nuevoStr) : nuevoStr, label: LABEL[campo] }
      }
    }
    if (Object.keys(cambios).length === 0) { setEditGuardando(false); setEditModal(null); return }

    const updates = Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v.a]))

    // Ajustar stock si cambió la cantidad
    if (cambios.cantidad) {
      const diff = cambios.cantidad.a - cambios.cantidad.de
      if (diff !== 0) {
        const { data: bodegasData } = await supabase.from('bodegas').select('id').ilike('nombre', m.centro_costo || '').limit(1)
        const bid = bodegasData?.[0]?.id
        if (bid && m.item_id) {
          const { data: stockRow } = await supabase.from('stock').select('id, cantidad_actual')
            .eq('item_id', m.item_id).eq('bodega_id', bid).maybeSingle()
          if (stockRow) {
            const ajuste = m.tipo === 'entrada' ? diff : -diff
            await supabase.from('stock').update({ cantidad_actual: Math.max(0, stockRow.cantidad_actual + ajuste) }).eq('id', stockRow.id)
          }
        }
      }
    }

    const { error } = await supabase.from('movimientos').update(updates).eq('id', m.id)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message }); setEditGuardando(false); return }

    await supabase.from('movimientos_ediciones').insert({ movimiento_id: m.id, usuario_id: perfil.id, cambios })

    setEditados(prev => new Set([...prev, m.id]))
    setEditGuardando(false)
    setEditModal(null)
    cargar()
  }

  async function generarNumero() {
    const { count } = await supabase.from('movimientos').select('*', { count: 'exact', head: true })
    return `MOV-${String((count || 0) + 1).padStart(4, '0')}`
  }

  async function revertir(m) {
    setRevirtiendo(true)
    setMsg(null)

    const numero = await generarNumero()

    // Crear movimiento contrario
    const contramov = {
      tipo:                  m.tipo === 'entrada' ? 'salida' : 'entrada',
      item_id:               m.item_id,
      bodega_origen_id:      m.tipo === 'entrada' ? m.bodega_destino_id : null,
      bodega_destino_id:     m.tipo === 'salida'  ? m.bodega_origen_id  : null,
      cantidad:              m.cantidad,
      precio_costo_snapshot: m.precio_costo_snapshot || 0,
      centro_costo:          m.centro_costo || '',
      usuario_id:            perfil.id,
      referencia:            `REVERSIÓN ${m.numero || m.id}`,
      revertido:             false,
      revertido_en:          new Date().toISOString(),
      numero,
    }

    const { error: e1 } = await supabase.from('movimientos').insert(contramov)
    if (e1) { setMsg({ tipo: 'error', texto: 'Error al crear reversión: ' + e1.message }); setRevirtiendo(false); return }

    // Marcar original como revertido
    const { error: e2 } = await supabase.from('movimientos').update({ revertido: true }).eq('id', m.id)
    if (e2) { setMsg({ tipo: 'error', texto: 'Error al marcar revertido: ' + e2.message }); setRevirtiendo(false); return }

    // El trigger fn_actualizar_stock ajusta el stock automáticamente al insertar el contramovimiento

    // ── Si es transferencia interna, revertir también el movimiento par ──
    const parQuery = await supabase.from('movimientos')
      .select('id, tipo, item_id, cantidad, bodega_origen_id, bodega_destino_id, precio_costo_snapshot, centro_costo, numero')
      .eq('item_id', m.item_id)
      .eq('cantidad', m.cantidad)
      .eq('bodega_origen_id', m.bodega_origen_id || m.bodega_destino_id)
      .eq('bodega_destino_id', m.bodega_destino_id || m.bodega_origen_id)
      .neq('tipo', m.tipo)
      .eq('revertido', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const parMov = parQuery.data
    if (parMov && m.bodega_destino_id) {
      const numeroPar = await generarNumero()
      const contrapar = {
        tipo:                  parMov.tipo === 'entrada' ? 'salida' : 'entrada',
        item_id:               parMov.item_id,
        bodega_origen_id:      parMov.tipo === 'entrada' ? parMov.bodega_destino_id : null,
        bodega_destino_id:     parMov.tipo === 'salida'  ? parMov.bodega_origen_id  : null,
        cantidad:              parMov.cantidad,
        precio_costo_snapshot: parMov.precio_costo_snapshot || 0,
        centro_costo:          parMov.centro_costo || '',
        usuario_id:            perfil.id,
        referencia:            `REVERSIÓN PAR ${parMov.numero || parMov.id}`,
        numero:                numeroPar,
      }
      await supabase.from('movimientos').insert(contrapar)
      await supabase.from('movimientos').update({ revertido: true }).eq('id', parMov.id)
    }

    setRevirtiendo(false)
    setConfirmRevert(null)
    cargar()
  }

  async function eliminarMovimiento(m) {
    setEliminando(true)
    setMsg(null)

    // 1. Buscar bodega por centro_costo
    const { data: bodegasData } = await supabase
      .from('bodegas').select('id').ilike('nombre', m.centro_costo || '').limit(1)
    const bodegaId = bodegasData?.[0]?.id

    // 2. Revertir stock
    if (bodegaId && m.item_id) {
      const { data: stockRow } = await supabase
        .from('stock').select('id, cantidad_actual')
        .eq('item_id', m.item_id).eq('bodega_id', bodegaId).maybeSingle()
      if (stockRow) {
        const nueva = m.tipo === 'entrada'
          ? Math.max(0, stockRow.cantidad_actual - m.cantidad)
          : stockRow.cantidad_actual + m.cantidad
        await supabase.from('stock').update({ cantidad_actual: nueva }).eq('id', stockRow.id)
      }
    }

    // 3. Eliminar
    const { error } = await supabase.from('movimientos').delete().eq('id', m.id)
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error al eliminar: ' + error.message })
      setEliminando(false)
      return
    }

    // 4. Si es transferencia interna, también eliminar el movimiento par y revertir su stock
    if (m.bodega_destino_id && m.bodega_origen_id) {
      const { data: parMov } = await supabase.from('movimientos')
        .select('id, bodega_destino_id, bodega_origen_id')
        .eq('item_id', m.item_id)
        .eq('cantidad', m.cantidad)
        .eq('bodega_origen_id', m.bodega_origen_id)
        .eq('bodega_destino_id', m.bodega_destino_id)
        .neq('tipo', m.tipo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (parMov) {
        // Revertir stock del par: si era REC (entrada) hay que descontar del destino; si era SAL hay que sumar al origen
        const esPar_entrada = m.tipo === 'salida' // el par es entrada si el original era salida
        const bodegaParId   = esPar_entrada ? parMov.bodega_destino_id : parMov.bodega_origen_id
        if (bodegaParId && m.item_id) {
          const { data: stockPar } = await supabase.from('stock').select('id, cantidad_actual')
            .eq('item_id', m.item_id).eq('bodega_id', bodegaParId).maybeSingle()
          if (stockPar) {
            const nuevaCantPar = esPar_entrada
              ? Math.max(0, stockPar.cantidad_actual - m.cantidad)
              : stockPar.cantidad_actual + m.cantidad
            await supabase.from('stock').update({ cantidad_actual: nuevaCantPar }).eq('id', stockPar.id)
          }
        }
        await supabase.from('movimientos').delete().eq('id', parMov.id)
        setMovimientos(prev => prev.filter(mov => mov.id !== parMov.id))
      }
    }

    setMovimientos(prev => prev.filter(mov => mov.id !== m.id))
    setConfirmDelete(null)
    setEliminando(false)
  }

  // Lista de usuarios únicos para el filtro (solo para admin/logística)
  const usuariosUnicos = (esAdmin || esLogistica)
    ? Object.values(
        movimientos.reduce((acc, m) => {
          if (m.usuario_id && m.profiles?.nombre && !acc[m.usuario_id]) {
            acc[m.usuario_id] = { id: m.usuario_id, nombre: m.profiles.nombre }
          }
          return acc
        }, {})
      ).sort((a, b) => a.nombre.localeCompare(b.nombre))
    : []

  const filtrados = movimientos.filter(m => {
    const matchTipo    = filtroTipo === 'todos' || m.tipo === filtroTipo
    const matchItem    = !filtroItem || m.item_id === filtroItem
    const matchUsuario = !filtroUsuario || m.usuario_id === filtroUsuario
    const matchBusqueda = !busqueda ||
      m.items?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.referencia?.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.serial_motor?.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.numero_of?.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.numero?.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.proveedor?.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.cliente?.toLowerCase().includes(busqueda.toLowerCase())
    return matchTipo && matchItem && matchUsuario && matchBusqueda
  })

  // Agrupar por número de movimiento
  const grupos = Object.values(
    filtrados.reduce((acc, m) => {
      const key = m.numero || m.id
      if (!acc[key]) acc[key] = { numero: key, lineas: [], tipo: m.tipo, created_at: m.created_at, usuario: m.profiles?.nombre, revertido: m.revertido }
      acc[key].lineas.push(m)
      return acc
    }, {})
  )

  const [abierto,    setAbierto]    = useState(null)
  const [firmaModal, setFirmaModal] = useState(null) // base64 de la firma a visualizar
  const toggleGrupo = (key) => setAbierto(prev => prev === key ? null : key)

  if (cargando) return <Spinner texto="Cargando historial..." />

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-feisen-azul">Historial de movimientos</h1>
        <button onClick={cargar} title="Refrescar"
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
          <RefreshCw size={17} className={cargando ? 'animate-spin' : ''} />
        </button>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por N° mov, producto, proveedor, serial, OF..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white" />
        </div>
        {/* Selector de producto buscable */}
        <div className="relative w-64 shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busquedaProducto}
            onChange={e => { setBusquedaProducto(e.target.value); setMostrarListaProd(true); if (!e.target.value) { setFiltroItem(''); } }}
            onFocus={() => setMostrarListaProd(true)}
            onBlur={() => setTimeout(() => setMostrarListaProd(false), 150)}
            placeholder="Filtrar por producto..."
            className="w-full border border-gray-200 rounded-xl pl-8 pr-8 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul text-gray-700"
          />
          {busquedaProducto && (
            <button type="button" onClick={() => { setBusquedaProducto(''); setFiltroItem('') }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <X size={14} />
            </button>
          )}
          {mostrarListaProd && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
              <button type="button" onMouseDown={() => { setFiltroItem(''); setBusquedaProducto(''); setMostrarListaProd(false) }}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b">
                Todos los productos
              </button>
              {items
                .filter(i => !busquedaProducto.trim() || i.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()))
                .slice(0, 30)
                .map(i => (
                  <button key={i.id} type="button"
                    onMouseDown={() => { setFiltroItem(i.id); setBusquedaProducto(i.nombre + (i.bodegas?.nombre ? ` (${i.bodegas.nombre})` : '')); setMostrarListaProd(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0 ${filtroItem === i.id ? 'bg-blue-50 text-feisen-azul font-medium' : 'text-gray-700'}`}>
                    <span className="font-medium">{i.nombre}</span>
                    {i.bodegas?.nombre && <span className="ml-1 text-xs text-gray-400">· {i.bodegas.nombre}</span>}
                  </button>
                ))}
            </div>
          )}
        </div>
        {(esAdmin || esLogistica) && usuariosUnicos.length > 0 && (
          <select value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-feisen-azul shrink-0">
            <option value="">Todos los usuarios</option>
            {usuariosUnicos.map(u => (
              <option key={u.id} value={u.id}>{u.nombre.split(' ').slice(0,2).join(' ')}</option>
            ))}
          </select>
        )}
        <div className="flex gap-2">
          {['todos', 'entrada', 'salida'].map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors
                ${filtroTipo === t ? 'bg-feisen-azul text-white border-feisen-azul' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {t === 'todos' ? 'Todos' : TIPO_CONFIG[t].label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {grupos.length === 0 ? (
          <div className="bg-white rounded-2xl text-center py-16 text-gray-400 border border-gray-100">
            <ArrowUpDown size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay movimientos{busqueda ? ' que coincidan' : ''}.</p>
          </div>
        ) : grupos.map(g => {
          const tc = TIPO_CONFIG[g.tipo] || { label: g.tipo, color: 'bg-gray-100 text-gray-600' }
          const estaAbierto = abierto === g.numero
          const primera = g.lineas[0]
          const proveedor = primera.proveedor || primera.cliente || primera.referencia || null
          const valorTotal = esAdmin
            ? g.lineas.reduce((s, l) => s + (l.precio_costo_snapshot || 0) * (l.cantidad || 0), 0)
            : 0

          return (
            <div key={g.numero} className={`bg-white rounded-2xl border transition-all ${estaAbierto ? 'border-feisen-azul shadow-sm' : 'border-gray-100'} ${g.revertido ? 'opacity-50' : ''}`}>
              {/* FILA RESUMEN — click para abrir */}
              <button type="button" onClick={() => toggleGrupo(g.numero)}
                className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 rounded-2xl transition-colors">
                {/* Flecha */}
                <span className={`text-gray-400 transition-transform shrink-0 ${estaAbierto ? 'rotate-90' : ''}`}>▶</span>

                {/* Número */}
                <span className="font-mono text-xs text-gray-500 w-28 shrink-0">{g.numero}</span>

                {/* Fecha */}
                <span className="text-xs text-gray-400 w-20 shrink-0">
                  {primera.fecha_movimiento
                    ? new Date(primera.fecha_movimiento + 'T12:00:00').toLocaleDateString('es-CO')
                    : new Date(g.created_at).toLocaleDateString('es-CO')
                  }
                </span>

                {/* Tipo badge */}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${tc.color}`}>{tc.label}</span>

                {/* Quién */}
                {esAdmin && <span className="text-xs text-gray-500 hidden sm:block shrink-0 w-24">{primera.profiles?.nombre?.split(' ')[0]}</span>}

                {/* Resumen productos */}
                <span className="text-sm text-gray-700 font-medium flex-1 truncate">
                  {g.lineas.length === 1
                    ? g.lineas[0].items?.nombre
                    : `${g.lineas.length} productos`}
                </span>

                {/* Destino interno / proveedor / receptor */}
                {primera.destino
                  ? <span className="text-xs text-feisen-azul font-medium hidden md:block shrink-0 max-w-36 truncate">→ {primera.destino}</span>
                  : primera.proveedor === 'Producción interna'
                    ? <span className="text-xs text-orange-500 font-medium hidden md:block shrink-0">🔥 Prod. interna</span>
                    : proveedor && <span className="text-xs text-gray-400 hidden md:block shrink-0 max-w-32 truncate">{proveedor}</span>
                }

                {/* Valor total (admin) */}
                {esAdmin && valorTotal > 0 && (
                  <span className="text-xs font-semibold text-feisen-azul hidden lg:block shrink-0">
                    ${valorTotal.toLocaleString('es-CO')}
                  </span>
                )}

                {/* Indicador de firma en transferencias internas */}
                {g.lineas.some(l => l.foto_remision_url?.startsWith('data:image')) && (
                  <span title="Transferencia con firma" className="text-feisen-azul shrink-0">
                    <PenLine size={14} />
                  </span>
                )}
                {g.revertido && <span className="text-xs text-gray-400 shrink-0">REVERTIDO</span>}
              </button>

              {/* DETALLE — visible cuando está abierto */}
              {estaAbierto && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-2">
                  <div className="space-y-2">
                    {g.lineas.map(m => {
                      const esReversion = !!m.revertido_en
                      return (
                        <div key={m.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                              {m.items?.nombre}
                              {editados.has(m.id) && <span className="text-[10px] text-feisen-azul bg-blue-50 px-1.5 py-0.5 rounded-full font-semibold">✏️ editado</span>}
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              <span className="text-xs text-feisen-azul font-semibold">{m.cantidad} {m.items?.unidad_medida}</span>

                              {/* Destino interno */}
                              {m.destino && (
                                <span className="text-xs text-feisen-azul font-medium">→ {m.destino}</span>
                              )}

                              {/* Producción interna vs proveedor real */}
                              {m.proveedor === 'Producción interna'
                                ? <span className="text-xs text-orange-500 font-medium">🔥 Producción interna</span>
                                : m.proveedor && <span className="text-xs text-gray-400">Proveedor: {m.proveedor}</span>
                              }

                              {/* Colada (referencia en entradas de producción) */}
                              {m.referencia && m.proveedor === 'Producción interna' && (
                                <span className="text-xs text-orange-400">Colada: {m.referencia}</span>
                              )}

                              {/* Referencia genérica */}
                              {m.referencia && m.proveedor !== 'Producción interna' && (
                                <span className="text-xs text-gray-400">{m.referencia}</span>
                              )}

                              {/* N° OF */}
                              {m.numero_of && <span className="text-xs text-gray-500 font-medium">OF: {m.numero_of}</span>}

                              {m.serial_motor && <span className="text-xs text-gray-400">Serial: {m.serial_motor}</span>}
                              {m.pedidos?.numero && <span className="text-xs text-feisen-azul">📋 {m.pedidos.numero}</span>}

                              {/* Firma digital (base64) */}
                              {m.foto_remision_url?.startsWith('data:image') && (
                                <button type="button"
                                  onClick={() => setFirmaModal(m.foto_remision_url)}
                                  className="text-xs text-feisen-azul hover:underline">✍️ Ver firma</button>
                              )}

                              {/* Remisión (URL normal) */}
                              {m.foto_remision_url && !m.foto_remision_url.startsWith('data:image') && (
                                <a href={m.foto_remision_url} target="_blank" rel="noreferrer"
                                  className="text-xs text-feisen-azul hover:underline">🖼 Ver remisión</a>
                              )}

                              {esReversion && <span className="text-xs text-feisen-rojo font-semibold">REVERSIÓN</span>}
                              {esAdmin && m.precio_costo_snapshot > 0 && (
                                <span className="text-xs text-gray-400">${Number(m.precio_costo_snapshot * m.cantidad).toLocaleString('es-CO')}</span>
                              )}
                            </div>
                          </div>
                          {esAdmin && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => abrirEdicion(m)}
                                className="p-1.5 text-gray-300 hover:text-feisen-azul hover:bg-blue-50 rounded-lg transition-colors"
                                title="Editar">
                                <Pencil size={14} />
                              </button>
                              {!m.revertido && !esReversion && (
                                <button onClick={() => setConfirmRevert(m)}
                                  className="p-1.5 text-gray-300 hover:text-feisen-rojo hover:bg-red-50 rounded-lg transition-colors"
                                  title="Revertir">
                                  <RotateCcw size={14} />
                                </button>
                              )}
                              <button onClick={() => setConfirmDelete(m)}
                                className="p-1.5 text-gray-300 hover:text-feisen-rojo hover:bg-red-50 rounded-lg transition-colors"
                                title="Eliminar">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-400 text-right">Mostrando últimos 400 movimientos ({grupos.length} registros)</p>

      {/* Modal firma digital */}
      {firmaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setFirmaModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-feisen-azul text-lg">✍️ Firma del responsable</h3>
              <button onClick={() => setFirmaModal(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-gray-50">
              <img src={firmaModal} alt="Firma del responsable"
                className="w-full object-contain max-h-48" />
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">Firma registrada en el momento de la entrega</p>
          </div>
        </div>
      )}

      {/* Modal confirmación eliminación */}
      {confirmDelete && (
        <Modal titulo="Eliminar movimiento" onCerrar={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            <Alerta tipo="alerta" mensaje={
              `¿Eliminar ${confirmDelete.numero || 'este movimiento'}? El stock se ajustará automáticamente para reflejar la eliminación.`
            } />
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
              <p><span className="text-gray-500">Tipo:</span> <span className="font-medium capitalize">{confirmDelete.tipo}</span></p>
              <p><span className="text-gray-500">Producto:</span> <span className="font-medium">{confirmDelete.items?.nombre}</span></p>
              <p><span className="text-gray-500">Cantidad:</span> <span className="font-medium">{confirmDelete.cantidad} {confirmDelete.items?.unidad_medida}</span></p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">
                Cancelar
              </button>
              <button onClick={() => eliminarMovimiento(confirmDelete)} disabled={eliminando}
                className="flex-1 bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal editar movimiento */}
      {editModal && (
        <Modal titulo={`Editar ${editModal.numero || 'movimiento'}`} onCerrar={() => setEditModal(null)}>
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            <div className="bg-blue-50 rounded-xl px-4 py-2.5 text-sm text-feisen-azul font-medium">
              {editModal.items?.nombre} · {editModal.tipo === 'entrada' ? '↑ Entrada' : '↓ Salida'}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'fecha_movimiento', label: 'Fecha', type: 'date' },
                { key: 'cantidad',         label: 'Cantidad', type: 'number' },
                { key: 'precio_costo_snapshot', label: 'Precio costo ($)', type: 'number' },
                { key: 'numero_of',        label: 'N° OF', type: 'text' },
                { key: 'proveedor',        label: 'Proveedor', type: 'text' },
                { key: 'cliente',          label: 'Cliente', type: 'text' },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 font-medium block mb-1">{label}</label>
                  <input type={type} step={type === 'number' ? '0.001' : undefined}
                    value={editForm[key] ?? ''}
                    onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
                </div>
              ))}
            </div>
            {[
              { key: 'referencia', label: 'Referencia' },
              { key: 'serial_motor', label: 'Serial motor' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 font-medium block mb-1">{label}</label>
                <input type="text" value={editForm[key] ?? ''}
                  onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
              </div>
            ))}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditModal(null)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">
                Cancelar
              </button>
              <button onClick={guardarEdicion} disabled={editGuardando}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {editGuardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>

            {/* Historial de cambios */}
            {editHistorial.length > 0 && (
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Historial de cambios</p>
                {editHistorial.map(e => (
                  <div key={e.id} className="bg-gray-50 rounded-xl px-3 py-2.5 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">{e.profiles?.nombre || '—'}</span>
                      <span className="text-gray-400">{new Date(e.created_at).toLocaleString('es-CO')}</span>
                    </div>
                    {Object.entries(e.cambios).map(([campo, val]) => (
                      <p key={campo} className="text-gray-600">
                        <span className="font-medium">{val.label || campo}:</span>{' '}
                        <span className="text-feisen-rojo line-through">{String(val.de ?? '—')}</span>
                        {' → '}
                        <span className="text-green-600 font-medium">{String(val.a ?? '—')}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal confirmación reversión */}
      {confirmRevert && (
        <Modal titulo="Revertir movimiento" onCerrar={() => setConfirmRevert(null)}>
          <div className="space-y-4">
            <Alerta tipo="alerta" mensaje={
              `¿Revertir ${confirmRevert.numero || 'este movimiento'}? Se creará un movimiento contrario y se ajustará el stock de "${confirmRevert.items?.nombre}".`
            } />
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
              <p><span className="text-gray-500">Tipo:</span> <span className="font-medium capitalize">{confirmRevert.tipo}</span></p>
              <p><span className="text-gray-500">Producto:</span> <span className="font-medium">{confirmRevert.items?.nombre}</span></p>
              <p><span className="text-gray-500">Cantidad:</span> <span className="font-medium">{confirmRevert.cantidad} {confirmRevert.items?.unidad_medida}</span></p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRevert(null)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">
                Cancelar
              </button>
              <button onClick={() => revertir(confirmRevert)} disabled={revirtiendo}
                className="flex-1 bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {revirtiendo ? 'Revirtiendo...' : 'Sí, revertir'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
