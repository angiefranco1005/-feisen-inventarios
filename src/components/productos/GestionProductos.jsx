import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight, Package, AlertTriangle, Upload } from 'lucide-react'

const UNIDADES = ['unidad', 'kg', 'g', 'lb', 'm', 'cm', 'm²', 'L', 'ml', 'galón', 'rollo', 'par', 'caja', 'bulto', 'juego']

export default function GestionProductos() {
  const { perfil, esAdmin, bodegasPermitidas } = useAuth()
  const puedeEditar = esAdmin || perfil?.rol === 'LOGISTICA' || perfil?.rol === 'ALMACENISTA'

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

  const FORM0 = { nombre: '', categoria_id: '', bodega_id: '', unidad_medida: 'unidad', precio_costo: '', stock_minimo: '0', foto_url: '' }
  const [form, setForm] = useState(FORM0)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)

    // Si no es admin y no tiene bodegas asignadas → no ve nada
    if (!esAdmin && bodegasPermitidas !== null && bodegasPermitidas.length === 0) {
      setItems([]); setCategorias([]); setBodegas([])
      setCargando(false); return
    }

    let itemsQ = supabase.from('items').select('*, categorias(nombre), bodegas!bodega_id(nombre), stock(cantidad_actual)').order('nombre')
    if (!esAdmin && bodegasPermitidas) itemsQ = itemsQ.in('bodega_id', bodegasPermitidas)

    const [{ data: it, error: e1 }, { data: cats, error: e2 }, { data: bods, error: e3 }] = await Promise.all([
      itemsQ,
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('bodegas').select('*').eq('activo', true).order('nombre'),
    ])
    if (e1 || e2 || e3) {
      const errMsg = (e1 || e2 || e3)?.message || 'Error desconocido'
      setMsg({ tipo: 'error', texto: `Error cargando datos: ${errMsg}` })
    }
    setItems(it || [])
    // Para no-admin: filtrar categorías y bodegas visibles
    if (!esAdmin && bodegasPermitidas) {
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
      nombre:        item.nombre,
      categoria_id:  item.categoria_id  || '',
      bodega_id:     item.bodega_id     || '',
      unidad_medida: item.unidad_medida,
      precio_costo:  item.precio_costo  || '',
      stock_minimo:  item.stock_minimo  || '0',
      foto_url:      item.foto_url      || '',
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
    const payload = {
      nombre:        form.nombre.trim(),
      categoria_id:  form.categoria_id  || null,
      bodega_id:     form.bodega_id     || null,
      centro_costo:  bodega?.nombre     || '',
      unidad_medida: form.unidad_medida,
      precio_costo:  esAdmin ? (parseFloat(form.precio_costo) || 0) : undefined,
      stock_minimo:  parseFloat(form.stock_minimo) || 0,
      foto_url:      form.foto_url      || null,
      updated_at:    new Date().toISOString(),
    }
    if (!esAdmin) delete payload.precio_costo

    let error
    if (editando) {
      ({ error } = await supabase.from('items').update(payload).eq('id', editando.id))
    } else {
      ({ error } = await supabase.from('items').insert(payload))
    }
    if (error) { setMsg({ tipo: 'error', texto: 'Error: ' + error.message }); return }
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

  async function toggleActivo(item) {
    await supabase.from('items').update({ activo: !item.activo }).eq('id', item.id)
    cargar()
  }

  function getStock(item) {
    return item.stock?.[0]?.cantidad_actual ?? null
  }

  function stockBajo(item) {
    const cant = getStock(item)
    return item.stock_minimo > 0 && cant !== null && cant <= item.stock_minimo
  }

  const filtrados = items.filter(i => {
    const matchNombre    = i.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchBodega    = !filtroBodega    || i.bodega_id    === filtroBodega
    const matchCategoria = !filtroCategoria || i.categoria_id === filtroCategoria
    const matchStockBajo = !filtroStockBajo || stockBajo(i)
    return matchNombre && matchBodega && matchCategoria && matchStockBajo
  })

  const totalStockBajo = items.filter(stockBajo).length

  // Categorías filtradas por bodega seleccionada (para el select de filtro)
  const categoriasFiltroBodega = filtroBodega
    ? categorias.filter(c => c.bodega_id === filtroBodega)
    : categorias

  if (cargando) return <Spinner texto="Cargando productos..." />

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-feisen-azul">Productos</h1>
        {puedeEditar && (
          <button onClick={abrirNuevo}
            className="flex items-center gap-2 bg-feisen-azul text-white px-4 py-2 rounded-xl font-medium hover:opacity-90 transition-opacity">
            <Plus size={18} /> Nuevo producto
          </button>
        )}
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {totalStockBajo > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            {totalStockBajo} producto{totalStockBajo > 1 ? 's' : ''} por debajo del stock mínimo
          </p>
          <button onClick={() => setFiltroStockBajo(v => !v)}
            className={`ml-auto text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors
              ${filtroStockBajo ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'}`}>
            {filtroStockBajo ? 'Ver todos' : 'Ver alertas'}
          </button>
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
                  {esAdmin && <th className="text-right px-4 py-3 font-semibold text-gray-500">Precio costo</th>}
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 hidden sm:table-cell">Estado</th>
                  {puedeEditar && <th className="text-center px-4 py-3 font-semibold text-gray-500">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map(item => (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${!item.activo ? 'opacity-40' : ''}`}>
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
                      ) : getStock(item) === 0 ? (
                        <div>
                          <span className="inline-block bg-red-100 text-red-600 font-bold text-base px-3 py-1 rounded-xl">0</span>
                          <p className="text-xs text-red-400 mt-0.5">Sin stock</p>
                        </div>
                      ) : stockBajo(item) ? (
                        <div>
                          <span className="inline-block bg-amber-100 text-amber-700 font-bold text-base px-3 py-1 rounded-xl">
                            {getStock(item)}
                          </span>
                          <p className="text-xs text-amber-500 mt-0.5 flex items-center justify-center gap-0.5">
                            <AlertTriangle size={10} /> mín. {item.stock_minimo}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <span className="inline-block bg-green-100 text-green-700 font-bold text-base px-3 py-1 rounded-xl">
                            {getStock(item)}
                          </span>
                          {item.stock_minimo > 0 && (
                            <p className="text-xs text-gray-300 mt-0.5">mín. {item.stock_minimo}</p>
                          )}
                        </div>
                      )}
                    </td>
                    {esAdmin && (
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
                          <button onClick={() => abrirEditar(item)} className="p-1.5 text-feisen-azul hover:bg-blue-50 rounded-lg">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => toggleActivo(item)} className={`p-1.5 rounded-lg ${item.activo ? 'text-feisen-rojo hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                            {item.activo ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                          </button>
                          {esAdmin && (
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
            </div>

            {esAdmin && (
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
