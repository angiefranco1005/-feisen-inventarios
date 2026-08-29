import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight, Package, AlertTriangle, Upload, RefreshCw, Download, History, Wrench } from 'lucide-react'
import { exportarInventarioActual } from '../../utils/exportExcel'

const UNIDADES = ['unidad', 'kg', 'g', 'lb', 'm', 'cm', 'm²', 'L', 'ml', 'galón', 'rollo', 'par', 'caja', 'bulto', 'juego']

const BODEGA_MECANIZADOS      = '03a709ac-0bee-457a-80a1-0a1603218d34'
const CAT_PRODUCTO_MECANIZADO = 'bff5d482-1647-426c-a88f-dedd72ff5b06'
const CATEGORIAS_MECANIZABLES = new Set([
  'cfa47941-3a0e-4fc8-a9c5-6a676bbb5c50', // FERRETERIA - MECANIZADOS
  '549c8036-364a-433b-b18f-d4a444c9f9a2', // ACEROS
  'a735b04a-9bd7-424b-b695-1ac8ce1a5bf4', // FUNDICIÓN - MECANIZADOS
])

export default function GestionProductos() {
  const navigate = useNavigate()
  const { perfil, esAdmin, esLogistica, bodegasPermitidas, bodegasOperacion } = useAuth()
  const puedeEditar = esAdmin || perfil?.rol === 'LOGISTICA' || perfil?.rol === 'ALMACENISTA' || perfil?.rol === 'OPERARIO' || perfil?.rol === 'JEFE_FUNDICION' || perfil?.rol === 'JEFE_MECANIZADOS'
  const puedeBorrar = (item) => esAdmin || (puedeEditar && (bodegasOperacion === null || bodegasOperacion.includes(item.bodega_id)))

  const [items,      setItems]      = useState([])
  const [categorias, setCategorias] = useState([])
  const [bodegas,    setBodegas]    = useState([])
  const [cargando,   setCargando]   = useState(true)
  const [busqueda,        setBusqueda]        = useState('')
  const [filtroBodega,    setFiltroBodega]    = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroStockBajo, setFiltroStockBajo] = useState(false)
  const [msg,             setMsg]             = useState(null)
  const [modal,      setModal]      = useState(false)
  const [editando,   setEditando]   = useState(null)
  const [confirm,    setConfirm]    = useState(null)
  const [subiendo,   setSubiendo]   = useState(false)
  const [pagina,     setPagina]     = useState(1)
  const POR_PAGINA = 20

  // ── Estado modal Mecanizar ──────────────────────────────────────────────────
  const [modalMecanizar,  setModalMecanizar]  = useState(false)
  const [itemMecanizar,   setItemMecanizar]   = useState(null)
  const [formMec,         setFormMec]         = useState({ cantidad: '1', operario: '' })
  const [guardandoMec,    setGuardandoMec]    = useState(false)

  const FORM0 = { nombre: '', categoria_id: '', bodega_id: '', unidad_medida: 'unidad', precio_costo: '', stock_minimo: '0', stock_maximo: '0', foto_url: '', peso_unitario: '', cantidad_inicial: '0' }
  const [form, setForm] = useState(FORM0)

  useEffect(() => { cargar() }, [])
  useEffect(() => { setPagina(1) }, [busqueda, filtroBodega, filtroCategoria, filtroStockBajo])

  async function cargar() {
    setCargando(true)

    // Si no es admin/logistica y no tiene bodegas asignadas → no ve nada
    if (!esAdmin && !esLogistica && bodegasPermitidas !== null && bodegasPermitidas.length === 0) {
      setItems([]); setCategorias([]); setBodegas([])
      setCargando(false); return
    }

    // Construir base de query de items — stock embebido para no depender de query separada
    const buildItemsQ = (from, to) => {
      let q = supabase.from('items')
        .select('*, categorias(nombre), bodegas!bodega_id(nombre), stock(item_id, bodega_id, cantidad_actual)')
        .order('nombre').range(from, to)
      if (!esAdmin && !esLogistica && bodegasPermitidas) q = q.in('bodega_id', bodegasPermitidas)
      return q
    }

    const [
      { data: it1, error: e1 },
      { data: it2 },
      { data: cats, error: e2 },
      { data: bods, error: e3 },
    ] = await Promise.all([
      buildItemsQ(0, 999),
      buildItemsQ(1000, 1999),
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('bodegas').select('*').eq('activo', true).order('nombre'),
    ])
    if (e1 || e2 || e3) {
      const errMsg = (e1 || e2 || e3)?.message || 'Error desconocido'
      setMsg({ tipo: 'error', texto: `Error cargando datos: ${errMsg}` })
    }
    const it = [...(it1 || []), ...(it2 || [])]

    // Índice de stock construido desde el stock embebido en cada item
    const stockIdx = {}
    for (const i of it) {
      for (const s of (i.stock || [])) {
        if (!stockIdx[i.id]) stockIdx[i.id] = []
        stockIdx[i.id].push({ bodega_id: s.bodega_id, cantidad_actual: s.cantidad_actual })
      }
    }

    // También traemos stock separado para la lógica de "extra items" (usuarios con bodegas limitadas)
    const { data: stockData } = await supabase
      .from('stock').select('item_id, bodega_id, cantidad_actual').range(0, 999)
    const { data: stockData2 } = await supabase
      .from('stock').select('item_id, bodega_id, cantidad_actual').range(1000, 1999)
    const allStock = [...(stockData || []), ...(stockData2 || [])]
    for (const s of allStock) {
      if (!stockIdx[s.item_id]) stockIdx[s.item_id] = []
      // Evitar duplicados si ya lo tenemos del join embebido
      if (!stockIdx[s.item_id].some(x => x.bodega_id === s.bodega_id)) {
        stockIdx[s.item_id].push({ bodega_id: s.bodega_id, cantidad_actual: s.cantidad_actual })
      }
    }

    let todosItems = (it || []).map(i => ({ ...i, stock: stockIdx[i.id] || [] }))

    // Para usuarios no-admin/no-logistica: mostrar también ítems de otras bodegas con stock aquí
    if (!esAdmin && !esLogistica && bodegasPermitidas && bodegasPermitidas.length > 0) {
      const ownIds = new Set(todosItems.map(i => i.id))
      const extraIds = (allStock || [])
        .filter(s => bodegasPermitidas.includes(s.bodega_id) && s.cantidad_actual > 0 && !ownIds.has(s.item_id))
        .map(s => s.item_id)
      if (extraIds.length > 0) {
        const { data: ext } = await supabase.from('items')
          .select('*, categorias(nombre), bodegas!bodega_id(nombre)')
          .in('id', extraIds).eq('activo', true)
        const marcadas = (ext || []).map(item => ({
          ...item,
          stock: stockIdx[item.id] || [],
          categorias: { nombre: 'Fundición' },
          categoria_id: '__fundicion__',
        }))
        todosItems = [...todosItems, ...marcadas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      }
    }

    setItems(todosItems)
    // Para no-admin: filtrar categorías y bodegas visibles
    if (!esAdmin && !esLogistica && bodegasPermitidas) {
      setCategorias((cats || []).filter(c => bodegasPermitidas.includes(c.bodega_id)))
      setBodegas((bods || []).filter(b => bodegasPermitidas.includes(b.id)))
    } else {
      setCategorias(cats || [])
      setBodegas(bods || [])
    }
    setCargando(false)
  }

  function abrirNuevo() {
    setEditando(null)
    setForm(FORM0)
    setMsg(null)
    setModal(true)
  }

  function abrirEditar(item) {
    setEditando(item)
    setForm({
      nombre:           item.nombre,
      categoria_id:     item.categoria_id  || '',
      bodega_id:        item.bodega_id     || '',
      unidad_medida:    item.unidad_medida,
      precio_costo:     item.precio_costo  || '',
      stock_minimo:     item.stock_minimo  || '0',
      stock_maximo:     item.stock_maximo  || '0',
      foto_url:         item.foto_url      || '',
      peso_unitario:    item.peso_unitario ?? '',
      cantidad_inicial: '0',
    })
    setMsg(null)
    setModal(true)
  }

  async function subirFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    const ext  = file.name.split('.').pop()
    const path = `${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('productos-fotos').upload(path, file)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al subir foto.' }); setSubiendo(false); return }
    const { data: { publicUrl } } = supabase.storage.from('productos-fotos').getPublicUrl(path)
    setForm(f => ({ ...f, foto_url: publicUrl }))
    setSubiendo(false)
  }

  async function guardar(e) {
    e.preventDefault()
    setMsg(null)
    const bodega = bodegas.find(b => b.id === form.bodega_id)
    const esFundicion = bodega?.nombre === 'FUNDICIÓN'
    const payload = {
      nombre:        form.nombre.trim(),
      categoria_id:  form.categoria_id  || null,
      bodega_id:     form.bodega_id     || null,
      centro_costo:  bodega?.nombre     || '',
      unidad_medida: form.unidad_medida,
      precio_costo:  (esAdmin || perfil?.rol === 'ALMACENISTA' || perfil?.rol === 'LOGISTICA') ? (parseFloat(form.precio_costo) || 0) : undefined,
      stock_minimo:  parseFloat(form.stock_minimo) || 0,
      stock_maximo:  parseFloat(form.stock_maximo) || 0,
      foto_url:      form.foto_url      || null,
      peso_unitario: esFundicion ? (parseFloat(form.peso_unitario) || null) : null,
      updated_at:    new Date().toISOString(),
    }
    if (!esAdmin && perfil?.rol !== 'ALMACENISTA' && perfil?.rol !== 'LOGISTICA') delete payload.precio_costo

    let error
    if (editando) {
      ({ error } = await supabase.from('items').update(payload).eq('id', editando.id))
      if (error) { setMsg({ tipo: 'error', texto: 'Error: ' + error.message }); return }
    } else {
      const { data: newItem, error: e1 } = await supabase.from('items').insert(payload).select('id').single()
      if (e1) { setMsg({ tipo: 'error', texto: 'Error: ' + e1.message }); return }

      // Stock inicial (solo si la bodega está definida)
      if (newItem?.id && form.bodega_id) {
        const cantInicial = parseFloat(form.cantidad_inicial) || 0
        const { error: e2 } = await supabase.from('stock').upsert(
          { item_id: newItem.id, bodega_id: form.bodega_id, cantidad_actual: cantInicial },
          { onConflict: 'item_id,bodega_id' }
        )
        if (e2) { setMsg({ tipo: 'error', texto: 'Producto creado pero error al guardar stock: ' + e2.message }); cargar(); return }
      }
    }
    setMsg({ tipo: 'exito', texto: editando ? 'Producto actualizado.' : 'Producto creado.' })
    setModal(false)
    cargar()
  }

  async function eliminar(item) {
    const [{ count: cs }, { count: cm }] = await Promise.all([
      supabase.from('stock').select('*', { count: 'exact', head: true }).eq('item_id', item.id),
      supabase.from('movimientos').select('*', { count: 'exact', head: true }).eq('item_id', item.id),
    ])
    if (cs > 0 || cm > 0) {
      setMsg({ tipo: 'error', texto: `"${item.nombre}" tiene stock o movimientos. Desactívalo en su lugar.` })
      setConfirm(null); return
    }
    await supabase.from('items').delete().eq('id', item.id)
    setConfirm(null)
    cargar()
  }

  // ── Mecanizado ─────────────────────────────────────────────────────────────
  function abrirMecanizar(item) {
    setItemMecanizar(item)
    setFormMec({ cantidad: '1', operario: '' })
    setMsg(null)
    setModalMecanizar(true)
  }

  async function ejecutarMecanizado(e) {
    e.preventDefault()
    setMsg(null)
    setGuardandoMec(true)

    const cantidad = parseFloat(formMec.cantidad)
    if (!cantidad || cantidad <= 0) {
      setMsg({ tipo: 'error', texto: 'Ingresa una cantidad válida.' })
      setGuardandoMec(false); return
    }

    const stockDisp = getStock(itemMecanizar)
    if (stockDisp !== null && cantidad > stockDisp) {
      setMsg({ tipo: 'error', texto: `Stock insuficiente. Disponible: ${stockDisp}` })
      setGuardandoMec(false); return
    }

    // Buscar el item destino "- MECANIZADO"
    const nombreTarget = itemMecanizar.nombre + ' - MECANIZADO'
    const itemTarget = items.find(i =>
      i.nombre.toUpperCase().trim() === nombreTarget.toUpperCase().trim() &&
      i.categoria_id === CAT_PRODUCTO_MECANIZADO &&
      i.bodega_id === BODEGA_MECANIZADOS
    )
    if (!itemTarget) {
      setMsg({ tipo: 'error', texto: `No se encontró "${nombreTarget}" en la base de datos.` })
      setGuardandoMec(false); return
    }

    const hoy    = new Date().toISOString().split('T')[0]
    const motivo = formMec.operario.trim()
      ? `Mecanizado por: ${formMec.operario.trim()}`
      : 'Proceso de mecanizado'

    // Salida de materia prima
    const { error: e1 } = await supabase.from('movimientos').insert({
      item_id:               itemMecanizar.id,
      bodega_origen_id:      BODEGA_MECANIZADOS,
      tipo:                  'salida',
      cantidad,
      precio_costo_snapshot: itemMecanizar.precio_costo || 0,
      motivo,
      fecha_movimiento:      hoy,
      centro_costo:          'MECANIZADOS',
      usuario_id:            perfil?.id,
    })
    if (e1) { setMsg({ tipo: 'error', texto: 'Error al registrar salida: ' + e1.message }); setGuardandoMec(false); return }

    // Entrada a producto mecanizado
    const { error: e2 } = await supabase.from('movimientos').insert({
      item_id:               itemTarget.id,
      bodega_origen_id:      BODEGA_MECANIZADOS,
      tipo:                  'entrada',
      cantidad,
      precio_costo_snapshot: itemTarget.precio_costo || 0,
      motivo,
      fecha_movimiento:      hoy,
      centro_costo:          'MECANIZADOS',
      usuario_id:            perfil?.id,
    })
    if (e2) { setMsg({ tipo: 'error', texto: 'Error al registrar entrada: ' + e2.message }); setGuardandoMec(false); return }

    setModalMecanizar(false)
    setGuardandoMec(false)
    setMsg({ tipo: 'exito', texto: `✅ ${cantidad} und mecanizadas correctamente.` })
    cargar()
  }

  async function toggleActivo(item) {
    await supabase.from('items').update({ activo: !item.activo }).eq('id', item.id)
    cargar()
  }

  function getStock(item) {
    if (!bodegasPermitidas || esLogistica) return item.stock?.reduce((s, r) => s + (r.cantidad_actual || 0), 0) ?? null
    const relevante = item.stock?.find(s => bodegasPermitidas.includes(s.bodega_id))
    return relevante?.cantidad_actual ?? null
  }

  function stockBajo(item) {
    const cant = getStock(item)
    return item.stock_minimo > 0 && cant !== null && cant <= item.stock_minimo
  }

  function sinStock(item) {
    const cant = getStock(item)
    return cant !== null && cant === 0
  }

  const filtrados = items.filter(i => {
    const matchNombre    = i.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchBodega    = !filtroBodega    || i.bodega_id    === filtroBodega
    const matchCategoria = !filtroCategoria || i.categoria_id === filtroCategoria
    const matchStockBajo = !filtroStockBajo || stockBajo(i)
    return matchNombre && matchBodega && matchCategoria && matchStockBajo
  })

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const paginados    = filtrados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA)

  const totalStockBajo  = items.filter(i => i.activo && stockBajo(i)).length
  const totalSinStock   = items.filter(i => i.activo && sinStock(i)).length
  const totalAlertas    = totalStockBajo + totalSinStock

  // Categorías filtradas por bodega seleccionada (para el select de filtro)
  const hayTransferidas = items.some(i => i.categoria_id === '__fundicion__')
  const categoriasFiltroBodega = [
    ...(filtroBodega ? categorias.filter(c => c.bodega_id === filtroBodega) : categorias),
    ...(hayTransferidas ? [{ id: '__fundicion__', nombre: 'Fundición' }] : []),
  ]

  if (cargando) return <Spinner texto="Cargando productos..." />

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-feisen-azul">Productos</h1>
        <div className="flex items-center gap-2">
          <button onClick={cargar} title="Refrescar"
            className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            <RefreshCw size={17} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => exportarInventarioActual(filtrados)}
            title="Descargar Excel"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors">
            <Download size={16} /> Excel
          </button>
          {puedeEditar && (
            <button onClick={abrirNuevo}
              className="flex items-center gap-2 bg-feisen-azul text-white px-4 py-2 rounded-xl font-medium hover:opacity-90 transition-opacity">
              <Plus size={18} /> Nuevo producto
            </button>
          )}
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {totalAlertas > 0 && (
        <div className={`rounded-xl border px-4 py-3 ${totalSinStock > 0 ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className={`flex-shrink-0 mt-0.5 ${totalSinStock > 0 ? 'text-feisen-rojo' : 'text-amber-500'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${totalSinStock > 0 ? 'text-red-800' : 'text-amber-800'}`}>
                ⚠️ {totalSinStock > 0 && `${totalSinStock} producto${totalSinStock > 1 ? 's' : ''} SIN STOCK`}
                {totalSinStock > 0 && totalStockBajo > totalSinStock && ' · '}
                {totalStockBajo > totalSinStock && `${totalStockBajo - totalSinStock} bajo mínimo`}
              </p>
              <p className={`text-xs mt-0.5 ${totalSinStock > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                Revisa el inventario y genera los pedidos necesarios.
              </p>
            </div>
            <button onClick={() => setFiltroStockBajo(v => !v)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors
                ${filtroStockBajo
                  ? 'bg-feisen-azul text-white border-feisen-azul'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              {filtroStockBajo ? 'Ver todos' : 'Filtrar alertas'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white" />
        </div>
        <select value={filtroBodega}
          onChange={e => { setFiltroBodega(e.target.value); setFiltroCategoria('') }}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul text-gray-600">
          <option value="">Todas las bodegas</option>
          {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul text-gray-600"
          disabled={categoriasFiltroBodega.length === 0}>
          <option value="">Todas las categorías</option>
          {categoriasFiltroBodega.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay productos{busqueda ? ' que coincidan' : ''}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">Producto</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden sm:table-cell">Categoría</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden md:table-cell">Bodega</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500">Stock</th>
                  {(esAdmin || perfil?.rol === 'ALMACENISTA' || perfil?.rol === 'LOGISTICA') && <th className="text-right px-4 py-3 font-semibold text-gray-500">Precio costo</th>}
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 hidden sm:table-cell">Estado</th>
                  {puedeEditar && <th className="text-center px-4 py-3 font-semibold text-gray-500">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginados.map(item => (
                  <tr key={item.id} className={`transition-colors ${!item.activo ? 'opacity-40' : sinStock(item) ? 'bg-red-50 hover:bg-red-100' : stockBajo(item) ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.foto_url
                          ? <img src={item.foto_url} alt={item.nombre} className="w-10 h-10 rounded-lg object-cover border flex-shrink-0" />
                          : <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <Package size={16} className="text-gray-400" />
                            </div>
                        }
                        <div>
                          <p className="font-medium text-gray-800">{item.nombre}</p>
                          <p className="text-xs text-gray-400">{item.unidad_medida}</p>
                          {item.peso_unitario && (
                            <p className="text-xs text-orange-500 font-medium">{Number(item.peso_unitario)} kg/und</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{item.categorias?.nombre || '—'}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs bg-blue-50 text-feisen-azul px-2 py-1 rounded-full">
                        {item.bodegas?.nombre || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStock(item) === null ? (
                        <span className="text-gray-300 text-sm">—</span>
                      ) : sinStock(item) ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 bg-feisen-rojo text-white font-bold text-sm px-3 py-1 rounded-xl">
                            <AlertTriangle size={12} /> 0
                          </span>
                          <p className="text-xs text-red-500 font-semibold">Sin stock</p>
                        </div>
                      ) : stockBajo(item) ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 bg-amber-500 text-white font-bold text-sm px-3 py-1 rounded-xl">
                            <AlertTriangle size={12} /> {getStock(item)}
                          </span>
                          <p className="text-xs text-amber-600 font-semibold">Bajo mínimo ({item.stock_minimo})</p>
                        </div>
                      ) : item.stock_maximo > 0 && getStock(item) > item.stock_maximo ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="inline-block bg-purple-100 text-purple-700 font-bold text-base px-3 py-1 rounded-xl">
                            {getStock(item)}
                          </span>
                          <p className="text-xs text-purple-500 font-semibold">Sobrestock (máx. {item.stock_maximo})</p>
                        </div>
                      ) : (
                        <div>
                          <span className="inline-block bg-green-100 text-green-700 font-bold text-base px-3 py-1 rounded-xl">
                            {getStock(item)}
                          </span>
                          {(item.stock_minimo > 0 || item.stock_maximo > 0) && (
                            <p className="text-xs text-gray-300 mt-0.5">
                              {item.stock_minimo > 0 && `mín. ${item.stock_minimo}`}
                              {item.stock_minimo > 0 && item.stock_maximo > 0 && ' · '}
                              {item.stock_maximo > 0 && `máx. ${item.stock_maximo}`}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    {(esAdmin || perfil?.rol === 'ALMACENISTA' || perfil?.rol === 'LOGISTICA') && (
                      <td className="px-4 py-3 text-right font-semibold text-feisen-azul">
                        {item.precio_costo > 0
                          ? `$${Number(item.precio_costo).toLocaleString('es-CO')}`
                          : <span className="text-amber-500 text-xs flex items-center justify-end gap-1"><AlertTriangle size={12} /> Sin precio</span>
                        }
                      </td>
                    )}
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${item.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {puedeEditar && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => navigate(`/movimientos?item=${item.id}`)} title="Ver historial de movimientos"
                            className="p-1.5 text-gray-400 hover:text-feisen-azul hover:bg-blue-50 rounded-lg">
                            <History size={15} />
                          </button>
                          <button onClick={() => abrirEditar(item)} className="p-1.5 text-feisen-azul hover:bg-blue-50 rounded-lg">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => toggleActivo(item)} className={`p-1.5 rounded-lg ${item.activo ? 'text-feisen-rojo hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                            {item.activo ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                          </button>
                          {puedeBorrar(item) && (
                            <button onClick={() => { setMsg(null); setConfirm(item) }} className="p-1.5 text-gray-300 hover:text-feisen-rojo hover:bg-red-50 rounded-lg">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PAGINACIÓN */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-gray-400">
            {(paginaActual - 1) * POR_PAGINA + 1}–{Math.min(paginaActual * POR_PAGINA, filtrados.length)} de {filtrados.length} productos
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
              ← Anterior
            </button>
            {Array.from({ length: totalPaginas }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPaginas || Math.abs(n - paginaActual) <= 1)
              .reduce((acc, n, idx, arr) => {
                if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…')
                acc.push(n)
                return acc
              }, [])
              .map((n, i) =>
                n === '…'
                  ? <span key={`e${i}`} className="px-2 text-gray-400 text-sm">…</span>
                  : <button key={n} onClick={() => setPagina(n)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                        ${paginaActual === n ? 'bg-feisen-azul text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {n}
                    </button>
              )
            }
            <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* MODAL MECANIZAR */}
      {modalMecanizar && itemMecanizar && (
        <Modal titulo="Registrar mecanizado" onCerrar={() => setModalMecanizar(false)}>
          <form onSubmit={ejecutarMecanizado} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs w-24">Materia prima</span>
                <span className="font-semibold text-gray-800">{itemMecanizar.nombre}</span>
              </div>
              <div className="flex items-center gap-2 text-orange-400 text-xs pl-1">↓ se transforma en</div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs w-24">Producto final</span>
                <span className="font-semibold text-orange-700">{itemMecanizar.nombre} - MECANIZADO</span>
              </div>
              <p className="text-xs text-gray-400 pt-1">Stock disponible: <strong>{getStock(itemMecanizar)}</strong> {itemMecanizar.unidad_medida}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Cantidad *</label>
              <input required type="number" min="0.001" step="0.001"
                value={formMec.cantidad}
                onChange={e => setFormMec(f => ({ ...f, cantidad: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="1" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Operario</label>
              <input type="text"
                value={formMec.operario}
                onChange={e => setFormMec(f => ({ ...f, operario: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Nombre del operario (opcional)" />
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalMecanizar(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit" disabled={guardandoMec}
                className="flex-1 bg-orange-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                <Wrench size={15} /> {guardandoMec ? 'Registrando...' : 'Confirmar mecanizado'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL ELIMINAR */}
      {confirm && (
        <Modal titulo="Eliminar producto" onCerrar={() => setConfirm(null)}>
          <div className="space-y-4">
            <Alerta tipo="alerta" mensaje={`¿Eliminar "${confirm.nombre}"? Si tiene stock o movimientos no se permitirá.`} />
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button onClick={() => eliminar(confirm)} className="flex-1 bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold">Eliminar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL NUEVO/EDITAR */}
      {modal && (
        <Modal titulo={editando ? 'Editar producto' : 'Nuevo producto'} onCerrar={() => setModal(false)}>
          <form onSubmit={guardar} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nombre *</label>
              <input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                placeholder="Ej: Motor Honda GX160" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Bodega *</label>
                <select required value={form.bodega_id}
                  onChange={e => setForm(f => ({ ...f, bodega_id: e.target.value, categoria_id: '' }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
                  <option value="">Selecciona</option>
                  {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Categoría</label>
                <select value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white"
                  disabled={!form.bodega_id}>
                  <option value="">Sin categoría</option>
                  {categorias.filter(c => c.bodega_id === form.bodega_id).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Unidad de medida</label>
                <select value={form.unidad_medida} onChange={e => setForm(f => ({ ...f, unidad_medida: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Stock mínimo</label>
                <input type="number" min="0" step="1" value={form.stock_minimo}
                  onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="0" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Stock máximo</label>
                <input type="number" min="0" step="1" value={form.stock_maximo}
                  onChange={e => setForm(f => ({ ...f, stock_maximo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="0" />
              </div>
            </div>

            {!editando && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Cantidad inicial en bodega</label>
                <input type="number" min="0" step="0.001" value={form.cantidad_inicial}
                  onChange={e => setForm(f => ({ ...f, cantidad_inicial: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="0" />
                <p className="text-xs text-gray-400 mt-1">Puedes dejarlo en 0 y registrar entradas después.</p>
              </div>
            )}

            {bodegas.find(b => b.id === form.bodega_id)?.nombre === 'FUNDICIÓN' && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Peso unitario (kg) *</label>
                <input required type="number" min="0.01" step="0.01" value={form.peso_unitario}
                  onChange={e => setForm(f => ({ ...f, peso_unitario: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="Ej: 13.8" />
              </div>
            )}

            {(esAdmin || perfil?.rol === 'ALMACENISTA' || perfil?.rol === 'LOGISTICA') && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Precio de costo (COP)</label>
                <input type="number" min="0" step="1" value={form.precio_costo}
                  onChange={e => setForm(f => ({ ...f, precio_costo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="0" />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Foto (opcional)</label>
              {form.foto_url && <img src={form.foto_url} alt="preview" className="w-20 h-20 rounded-xl object-cover mb-2 border" />}
              <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-400 hover:border-feisen-azul transition-colors">
                <Upload size={16} />
                {subiendo ? 'Subiendo...' : 'Subir foto'}
                <input type="file" accept="image/*" className="hidden" onChange={subirFoto} disabled={subiendo} />
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit"
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90">
                {editando ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
