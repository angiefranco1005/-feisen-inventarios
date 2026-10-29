import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from './shared/Modal'
import Alerta from './shared/Alerta'
import { Plus, Edit2, ToggleLeft, ToggleRight, Package, Trash2, Search, ChevronLeft, ChevronRight } from '../shared/iconos'

const POR_PAGINA = 20

export default function GestionProductos() {
  const { perfil, esAdmin } = useAuth()
  const [productos, setProductos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)
  const [modalEditar, setModalEditar] = useState(false)
  const [productoEditando, setProductoEditando] = useState(null)
  const [nombre, setNombre] = useState('')
  const [nombreEditar, setNombreEditar] = useState('')
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [pagina, setPagina] = useState(1)

  useEffect(() => { cargar() }, [])
  useEffect(() => { setPagina(1) }, [busqueda])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('of_productos').select('*').order('nombre')
    setProductos(data || [])
    setCargando(false)
  }

  async function crearProducto(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    setGuardando(true); setMsg(null)
    const { error } = await supabase.from('of_productos').insert({ nombre: nombre.trim(), creado_por: perfil.id })
    setGuardando(false)
    if (error) {
      setMsg({ tipo: 'error', texto: error.code === '23505' ? 'Ya existe un producto con ese nombre.' : 'Error al crear: ' + error.message })
      return
    }
    setModal(false); setNombre(''); cargar()
  }

  function abrirEditar(p) {
    setProductoEditando(p)
    setNombreEditar(p.nombre)
    setMsg(null)
    setModalEditar(true)
  }

  async function guardarEdicion(e) {
    e.preventDefault()
    if (!nombreEditar.trim()) return
    setGuardando(true); setMsg(null)
    const { error } = await supabase.from('of_productos').update({ nombre: nombreEditar.trim() }).eq('id', productoEditando.id)
    setGuardando(false)
    if (error) {
      setMsg({ tipo: 'error', texto: error.code === '23505' ? 'Ya existe un producto con ese nombre.' : 'Error al guardar: ' + error.message })
      return
    }
    setModalEditar(false); cargar()
  }

  async function toggleProducto(p) {
    await supabase.from('of_productos').update({ activo: !p.activo }).eq('id', p.id)
    cargar()
  }

  async function eliminarProducto(p) {
    const ok = window.confirm(
      `¿Eliminar "${p.nombre}" definitivamente?\n\nEsta acción no se puede deshacer. Las Órdenes de Fabricación que ya usaron este producto no se ven afectadas (el histórico queda intacto), pero dejará de existir en el catálogo.`
    )
    if (!ok) return
    setMsg(null)
    const { error } = await supabase.from('of_productos').delete().eq('id', p.id)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al eliminar: ' + error.message }); return }
    cargar()
  }

  const productosFiltrados = busqueda.trim()
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : productos

  const totalPaginas = Math.max(1, Math.ceil(productosFiltrados.length / POR_PAGINA))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const productosPagina = productosFiltrados.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-feisen-azul">Productos</h1>

      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-feisen-gris-oscuro flex items-center gap-2">
            <Package size={18} className="text-feisen-azul" /> Catálogo de productos
          </h2>
          <button onClick={() => { setNombre(''); setMsg(null); setModal(true) }}
            className="flex items-center gap-1 text-sm bg-feisen-azul text-white px-3 py-1.5 rounded-lg hover:bg-feisen-azul-claro transition-colors">
            <Plus size={15} /> Nuevo producto
          </button>
        </div>
        <p className="text-sm text-feisen-gris-medio -mt-2">
          Estos son los productos que aparecen para elegir al crear una nueva Orden de Fabricación. Solo los productos activos se muestran en el formulario.
        </p>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto por nombre..."
            className="w-full border border-gray-300 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
          />
        </div>
        {busqueda.trim() && (
          <p className="text-xs text-feisen-gris-medio -mt-2">{productosFiltrados.length} resultado(s) de {productos.length} productos</p>
        )}

        {cargando ? <Spinner /> : (
          <div className="space-y-2">
            {productosPagina.map(p => (
              <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border ${!p.activo ? 'opacity-50 bg-gray-50' : 'bg-feisen-gris'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-feisen-azul flex items-center justify-center">
                    <Package size={14} className="text-white" />
                  </div>
                  <p className="font-medium text-feisen-gris-oscuro text-sm">{p.nombre}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => abrirEditar(p)} className="p-1 text-feisen-azul hover:bg-blue-50 rounded-lg" title="Editar nombre">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => toggleProducto(p)}
                    className={`p-1 rounded-lg ${p.activo ? 'text-feisen-rojo hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                    title={p.activo ? 'Desactivar (dejará de aparecer al crear OF)' : 'Activar'}>
                    {p.activo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>
                  {esAdmin && (
                    <button onClick={() => eliminarProducto(p)} className="p-1 text-feisen-gris-medio hover:text-feisen-rojo hover:bg-red-50 rounded-lg" title="Eliminar definitivamente (solo administrador)">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {productos.length === 0 && <p className="text-center text-feisen-gris-medio py-8 text-sm">Todavía no hay productos registrados.</p>}
            {productos.length > 0 && productosFiltrados.length === 0 && (
              <p className="text-center text-feisen-gris-medio py-8 text-sm">Sin resultados para "{busqueda}".</p>
            )}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between pt-3">
                <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaSegura <= 1}
                  className="flex items-center gap-1 text-sm text-feisen-azul font-medium px-3 py-1.5 rounded-lg hover:bg-feisen-gris disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft size={16} /> Anterior
                </button>
                <p className="text-xs text-feisen-gris-medio">Página {paginaSegura} de {totalPaginas}</p>
                <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaSegura >= totalPaginas}
                  className="flex items-center gap-1 text-sm text-feisen-azul font-medium px-3 py-1.5 rounded-lg hover:bg-feisen-gris disabled:opacity-40 disabled:cursor-not-allowed">
                  Siguiente <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL EDITAR */}
      {modalEditar && productoEditando && (
        <Modal titulo={`Editar producto`} onCerrar={() => setModalEditar(false)}>
          <form onSubmit={guardarEdicion} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Nombre del producto *</label>
              <input required value={nombreEditar} onChange={e => setNombreEditar(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalEditar(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-feisen-gris-oscuro">Cancelar</button>
              <button type="submit" disabled={guardando}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL CREAR */}
      {modal && (
        <Modal titulo="Nuevo producto" onCerrar={() => setModal(false)}>
          <form onSubmit={crearProducto} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Nombre del producto *</label>
              <input required autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Mezcladora de concreto 3 bultos"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-feisen-gris-oscuro">Cancelar</button>
              <button type="submit" disabled={guardando}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {guardando ? 'Creando...' : 'Crear producto'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
