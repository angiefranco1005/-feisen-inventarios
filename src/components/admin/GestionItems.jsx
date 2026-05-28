import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatCOP, formatNumero, CENTROS_COSTO, UNIDADES_MEDIDA } from '../../utils/formatters'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Plus, Search, Edit2, ToggleLeft, ToggleRight, Upload, AlertTriangle, Package } from 'lucide-react'

export default function GestionItems() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'ADMIN'
  const [items, setItems] = useState([])
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [itemEditando, setItemEditando] = useState(null)
  const [mensaje, setMensaje] = useState(null)
  const [subiendo, setSubiendo] = useState(false)

  const FORM_INICIAL = {
    nombre: '', categoria_id: '', unidad_medida: 'unidad',
    centro_costo: 'Almacén', precio_costo: '', stock_minimo: '0', foto_url: ''
  }
  const [form, setForm] = useState(FORM_INICIAL)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: itemsData }, { data: cats }] = await Promise.all([
      supabase.from('items').select('*, categorias(nombre)').order('nombre'),
      supabase.from('categorias').select('*').order('nombre')
    ])
    setItems(itemsData || [])
    setCategorias(cats || [])
    setCargando(false)
  }

  function abrirNuevo() {
    setItemEditando(null)
    setForm(FORM_INICIAL)
    setModalAbierto(true)
  }

  function abrirEditar(item) {
    setItemEditando(item)
    setForm({
      nombre: item.nombre,
      categoria_id: item.categoria_id || '',
      unidad_medida: item.unidad_medida,
      centro_costo: item.centro_costo,
      precio_costo: item.precio_costo,
      stock_minimo: item.stock_minimo,
      foto_url: item.foto_url || ''
    })
    setModalAbierto(true)
  }

  async function subirFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    const ext = file.name.split('.').pop()
    const nombre = `${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('productos-fotos').upload(nombre, file)
    if (error) { setMensaje({ tipo: 'error', texto: 'Error al subir foto' }); setSubiendo(false); return }
    const { data: { publicUrl } } = supabase.storage.from('productos-fotos').getPublicUrl(nombre)
    setForm(f => ({ ...f, foto_url: publicUrl }))
    setSubiendo(false)
  }

  async function guardar(e) {
    e.preventDefault()
    setMensaje(null)
    const payload = {
      nombre: form.nombre.trim(),
      categoria_id: form.categoria_id || null,
      unidad_medida: form.unidad_medida,
      centro_costo: form.centro_costo,
      precio_costo: parseFloat(form.precio_costo) || 0,
      stock_minimo: parseFloat(form.stock_minimo) || 0,
      foto_url: form.foto_url || null,
      updated_at: new Date().toISOString()
    }
    let error
    if (itemEditando) {
      ({ error } = await supabase.from('items').update(payload).eq('id', itemEditando.id))
    } else {
      ({ error } = await supabase.from('items').insert(payload))
    }
    if (error) { setMensaje({ tipo: 'error', texto: 'Error al guardar: ' + error.message }); return }
    setMensaje({ tipo: 'exito', texto: itemEditando ? 'Producto actualizado.' : 'Producto creado.' })
    setModalAbierto(false)
    cargar()
  }

  async function toggleActivo(item) {
    await supabase.from('items').update({ activo: !item.activo }).eq('id', item.id)
    cargar()
  }

  const itemsFiltrados = items.filter(i =>
    i.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  if (cargando) return <Spinner texto="Cargando productos..." />

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-feisen-azul">Productos</h1>
        <button onClick={abrirNuevo}
          className="flex items-center gap-2 bg-feisen-azul text-white px-4 py-2 rounded-xl font-medium hover:bg-feisen-azul-claro transition-colors">
          <Plus size={18} /> Nuevo producto
        </button>
      </div>

      {mensaje && <Alerta tipo={mensaje.tipo} mensaje={mensaje.texto} />}

      {/* Buscador */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
      </div>

      {/* Tabla / tarjetas */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {itemsFiltrados.length === 0 ? (
          <div className="text-center py-16 text-feisen-gris-medio">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay productos{busqueda ? ' que coincidan' : ''}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-feisen-gris">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro">Producto</th>
                  <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro hidden sm:table-cell">Categoría</th>
                  <th className="text-left px-4 py-3 font-semibold text-feisen-gris-oscuro hidden md:table-cell">Centro Costo</th>
                  {esAdmin && <th className="text-right px-4 py-3 font-semibold text-feisen-gris-oscuro">Precio Costo</th>}
                  <th className="text-center px-4 py-3 font-semibold text-feisen-gris-oscuro">Estado</th>
                  <th className="text-center px-4 py-3 font-semibold text-feisen-gris-oscuro">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itemsFiltrados.map(item => (
                  <tr key={item.id} className={`hover:bg-feisen-gris/50 transition-colors ${!item.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.foto_url
                          ? <img src={item.foto_url} alt={item.nombre}
                              className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border" />
                          : <div className="w-10 h-10 rounded-lg bg-feisen-gris flex items-center justify-center flex-shrink-0">
                              <Package size={18} className="text-feisen-gris-medio" />
                            </div>
                        }
                        <div>
                          <p className="font-medium text-feisen-gris-oscuro">{item.nombre}</p>
                          <p className="text-xs text-feisen-gris-medio">{item.unidad_medida}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-feisen-gris-medio hidden sm:table-cell">
                      {item.categorias?.nombre || '—'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs bg-feisen-gris px-2 py-1 rounded-full text-feisen-gris-oscuro">
                        {item.centro_costo}
                      </span>
                    </td>
                    {esAdmin && (
                      <td className="px-4 py-3 text-right font-semibold text-feisen-azul">
                        {item.precio_costo > 0
                          ? formatCOP(item.precio_costo)
                          : <span className="flex items-center justify-end gap-1 text-amber-500 text-xs">
                              <AlertTriangle size={14} /> Sin precio
                            </span>
                        }
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium
                        ${item.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => abrirEditar(item)}
                          className="p-1.5 text-feisen-azul hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => toggleActivo(item)}
                          className={`p-1.5 rounded-lg transition-colors ${item.activo ? 'text-feisen-rojo hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                          {item.activo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL nuevo / editar */}
      {modalAbierto && (
        <Modal titulo={itemEditando ? 'Editar producto' : 'Nuevo producto'} onCerrar={() => setModalAbierto(false)}>
          <form onSubmit={guardar} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Nombre del producto *</label>
              <input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                placeholder="Ej: Acero en barra 1 pulgada" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Categoría</label>
                <select value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul">
                  <option value="">Sin categoría</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Unidad de medida</label>
                <select value={form.unidad_medida} onChange={e => setForm(f => ({ ...f, unidad_medida: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul">
                  {UNIDADES_MEDIDA.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Almacén *</label>
              <select required value={form.centro_costo} onChange={e => setForm(f => ({ ...f, centro_costo: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul">
                {CENTROS_COSTO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className={`grid gap-3 ${esAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {esAdmin && (
                <div>
                  <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Precio de costo (COP) *</label>
                  <input required type="number" min="0" step="1" value={form.precio_costo}
                    onChange={e => setForm(f => ({ ...f, precio_costo: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                    placeholder="0" />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Stock mínimo</label>
                <input type="number" min="0" step="0.001" value={form.stock_minimo}
                  onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="0" />
              </div>
            </div>

            {/* Foto del producto */}
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Foto del producto</label>
              {form.foto_url && (
                <img src={form.foto_url} alt="preview" className="w-24 h-24 rounded-xl object-cover mb-2 border" />
              )}
              <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-300 rounded-xl px-4 py-3 text-sm text-feisen-gris-medio hover:border-feisen-azul transition-colors">
                <Upload size={18} />
                {subiendo ? 'Subiendo...' : 'Subir foto (JPG, PNG)'}
                <input type="file" accept="image/*" className="hidden" onChange={subirFoto} disabled={subiendo} />
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalAbierto(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-feisen-gris-oscuro hover:bg-feisen-gris transition-colors">
                Cancelar
              </button>
              <button type="submit"
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-feisen-azul-claro transition-colors">
                {itemEditando ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
