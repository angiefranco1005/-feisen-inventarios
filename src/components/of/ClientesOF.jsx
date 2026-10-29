import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from './shared/Modal'
import Alerta from './shared/Alerta'
import { Plus, Edit2, Trash2, Users, Search } from '../shared/iconos'

export default function GestionClientes() {
  const { perfil, esAdmin } = useAuth()
  const [clientes, setClientes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)
  const [modalEditar, setModalEditar] = useState(false)
  const [clienteEditando, setClienteEditando] = useState(null)
  const [nombre, setNombre] = useState('')
  const [nombreEditar, setNombreEditar] = useState('')
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('of_clientes').select('*').order('nombre')
    setClientes(data || [])
    setCargando(false)
  }

  async function crearCliente(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    setGuardando(true); setMsg(null)
    const { error } = await supabase.from('of_clientes').insert({ nombre: nombre.trim(), creado_por: perfil.id })
    setGuardando(false)
    if (error) {
      setMsg({ tipo: 'error', texto: error.code === '23505' ? 'Ya existe un cliente con ese nombre.' : 'Error al crear: ' + error.message })
      return
    }
    setModal(false); setNombre(''); cargar()
  }

  function abrirEditar(c) {
    setClienteEditando(c)
    setNombreEditar(c.nombre)
    setMsg(null)
    setModalEditar(true)
  }

  async function guardarEdicion(e) {
    e.preventDefault()
    if (!nombreEditar.trim()) return
    setGuardando(true); setMsg(null)
    const { error } = await supabase.from('of_clientes').update({ nombre: nombreEditar.trim() }).eq('id', clienteEditando.id)
    setGuardando(false)
    if (error) {
      setMsg({ tipo: 'error', texto: error.code === '23505' ? 'Ya existe un cliente con ese nombre.' : 'Error al guardar: ' + error.message })
      return
    }
    setModalEditar(false); cargar()
  }

  async function eliminarCliente(c) {
    const ok = window.confirm(
      `¿Eliminar "${c.nombre}" definitivamente?\n\nEsta acción no se puede deshacer. Las Órdenes de Fabricación que ya se crearon con este cliente no se ven afectadas (el histórico queda intacto), pero dejará de aparecer sugerido al crear una OF nueva.`
    )
    if (!ok) return
    setMsg(null)
    const { error } = await supabase.from('of_clientes').delete().eq('id', c.id)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al eliminar: ' + error.message }); return }
    cargar()
  }

  const clientesFiltrados = busqueda.trim()
    ? clientes.filter(c => c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : clientes

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-feisen-azul">Clientes</h1>

      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-feisen-gris-oscuro flex items-center gap-2">
            <Users size={18} className="text-feisen-azul" /> Catálogo de clientes
          </h2>
          <button onClick={() => { setNombre(''); setMsg(null); setModal(true) }}
            className="flex items-center gap-1 text-sm bg-feisen-azul text-white px-3 py-1.5 rounded-lg hover:bg-feisen-azul-claro transition-colors">
            <Plus size={15} /> Nuevo cliente
          </button>
        </div>
        <p className="text-sm text-feisen-gris-medio -mt-2">
          Estos son los clientes que se sugieren al escribir en el campo "Cliente" de Nueva OF. Se guardan solos la primera vez que se usan, pero aquí puedes corregir el nombre o eliminarlos.
        </p>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar cliente por nombre..."
            className="w-full border border-gray-300 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
          />
        </div>
        {busqueda.trim() && (
          <p className="text-xs text-feisen-gris-medio -mt-2">{clientesFiltrados.length} resultado(s) de {clientes.length} clientes</p>
        )}

        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

        {cargando ? <Spinner /> : (
          <div className="space-y-2">
            {clientesFiltrados.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border bg-feisen-gris">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-feisen-azul flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{c.nombre?.charAt(0)?.toUpperCase()}</span>
                  </div>
                  <p className="font-medium text-feisen-gris-oscuro text-sm">{c.nombre}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => abrirEditar(c)} className="p-1 text-feisen-azul hover:bg-blue-50 rounded-lg" title="Editar nombre">
                    <Edit2 size={15} />
                  </button>
                  {esAdmin && (
                    <button onClick={() => eliminarCliente(c)} className="p-1 text-feisen-gris-medio hover:text-feisen-rojo hover:bg-red-50 rounded-lg" title="Eliminar definitivamente (solo administrador)">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {clientes.length === 0 && <p className="text-center text-feisen-gris-medio py-8 text-sm">Todavía no hay clientes registrados.</p>}
            {clientes.length > 0 && clientesFiltrados.length === 0 && (
              <p className="text-center text-feisen-gris-medio py-8 text-sm">Sin resultados para "{busqueda}".</p>
            )}
          </div>
        )}
      </div>

      {/* MODAL EDITAR */}
      {modalEditar && clienteEditando && (
        <Modal titulo="Editar cliente" onCerrar={() => setModalEditar(false)}>
          <form onSubmit={guardarEdicion} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Nombre del cliente *</label>
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
        <Modal titulo="Nuevo cliente" onCerrar={() => setModal(false)}>
          <form onSubmit={crearCliente} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Nombre del cliente *</label>
              <input required autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Distribuidora El Progreso"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-feisen-gris-oscuro">Cancelar</button>
              <button type="submit" disabled={guardando}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {guardando ? 'Creando...' : 'Crear cliente'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
