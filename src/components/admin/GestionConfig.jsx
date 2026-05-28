import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Plus, Edit2, ToggleLeft, ToggleRight, Warehouse, Tag, Users } from 'lucide-react'
import { CENTROS_COSTO } from '../../utils/formatters'

function SeccionBodegas() {
  const [bodegas, setBodegas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState({ nombre: '', descripcion: '' })
  const [msg, setMsg] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('bodegas').select('*').order('nombre')
    setBodegas(data || [])
    setCargando(false)
  }

  function abrir(bodega = null) {
    setEditando(bodega)
    setForm(bodega ? { nombre: bodega.nombre, descripcion: bodega.descripcion || '' } : { nombre: '', descripcion: '' })
    setModal(true)
  }

  async function guardar(e) {
    e.preventDefault()
    let error
    if (editando) {
      ({ error } = await supabase.from('bodegas').update(form).eq('id', editando.id))
    } else {
      ({ error } = await supabase.from('bodegas').insert(form))
    }
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setMsg({ tipo: 'exito', texto: editando ? 'Bodega actualizada.' : 'Bodega creada.' })
    setModal(false); cargar()
  }

  async function toggle(b) {
    await supabase.from('bodegas').update({ activo: !b.activo }).eq('id', b.id)
    cargar()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-feisen-gris-oscuro flex items-center gap-2">
          <Warehouse size={18} className="text-feisen-azul" /> Bodegas / Zonas
        </h2>
        <button onClick={() => abrir()}
          className="flex items-center gap-1 text-sm bg-feisen-azul text-white px-3 py-1.5 rounded-lg hover:bg-feisen-azul-claro transition-colors">
          <Plus size={15} /> Nueva
        </button>
      </div>
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
      {cargando ? <Spinner /> : (
        <div className="space-y-2">
          {bodegas.map(b => (
            <div key={b.id} className={`flex items-center justify-between p-3 rounded-xl border ${!b.activo ? 'opacity-50 bg-gray-50' : 'bg-feisen-gris'}`}>
              <div>
                <p className="font-medium text-feisen-gris-oscuro text-sm">{b.nombre}</p>
                {b.descripcion && <p className="text-xs text-feisen-gris-medio">{b.descripcion}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => abrir(b)} className="p-1 text-feisen-azul hover:bg-blue-50 rounded-lg"><Edit2 size={15} /></button>
                <button onClick={() => toggle(b)} className={`p-1 rounded-lg ${b.activo ? 'text-feisen-rojo hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                  {b.activo ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal && (
        <Modal titulo={editando ? 'Editar bodega' : 'Nueva bodega'} onCerrar={() => setModal(false)}>
          <form onSubmit={guardar} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Nombre *</label>
              <input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Descripción</label>
              <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                rows={2} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-feisen-gris-oscuro">Cancelar</button>
              <button type="submit"
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold">Guardar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function SeccionUsuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', nombre: '', rol: 'OPERARIO', almacen: '' })
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const ROLES = ['ADMIN', 'JEFE_AREA', 'OPERARIO']
  const ROLES_LABEL = { ADMIN: 'Administrador', JEFE_AREA: 'Jefe de Área', OPERARIO: 'Operario' }

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('profiles').select('*').order('nombre')
    setUsuarios(data || [])
    setCargando(false)
  }

  async function crearUsuario(e) {
    e.preventDefault()
    setGuardando(true); setMsg(null)
    // Crear usuario en Supabase Auth (requiere función Edge o Admin API)
    // Para un entorno de producción, usa una Edge Function con service_role key
    // Aquí mostramos cómo hacerlo via la API de admin
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crear-usuario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify({ email: form.email, password: form.password, nombre: form.nombre, rol: form.rol, almacen: form.almacen || null })
    })
    const data = await res.json()
    setGuardando(false)
    if (!res.ok) { setMsg({ tipo: 'error', texto: data.error || 'Error al crear usuario' }); return }
    setMsg({ tipo: 'exito', texto: 'Usuario creado exitosamente.' })
    setModal(false); cargar()
  }

  async function toggleUsuario(u) {
    await supabase.from('profiles').update({ activo: !u.activo }).eq('id', u.id)
    cargar()
  }

  const BADGE = {
    ADMIN: 'bg-feisen-rojo text-white',
    BODEGUERO: 'bg-feisen-azul text-white',
    JEFE_AREA: 'bg-amber-500 text-white',
    OPERARIO: 'bg-emerald-600 text-white'
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-feisen-gris-oscuro flex items-center gap-2">
          <Users size={18} className="text-feisen-azul" /> Usuarios del sistema
        </h2>
        <button onClick={() => { setForm({ email: '', password: '', nombre: '', rol: 'OPERARIO', almacen: '' }); setModal(true) }}
          className="flex items-center gap-1 text-sm bg-feisen-azul text-white px-3 py-1.5 rounded-lg hover:bg-feisen-azul-claro transition-colors">
          <Plus size={15} /> Nuevo usuario
        </button>
      </div>
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
      {cargando ? <Spinner /> : (
        <div className="space-y-2">
          {usuarios.map(u => (
            <div key={u.id} className={`flex items-center justify-between p-3 rounded-xl border ${!u.activo ? 'opacity-50 bg-gray-50' : 'bg-feisen-gris'}`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-feisen-azul flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{u.nombre?.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-medium text-feisen-gris-oscuro text-sm">{u.nombre}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE[u.rol]}`}>{ROLES_LABEL[u.rol] || u.rol}</span>
                    {u.almacen && <span className="text-xs text-feisen-gris-medio">{u.almacen}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => toggleUsuario(u)}
                className={`p-1 rounded-lg ${u.activo ? 'text-feisen-rojo hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                {u.activo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              </button>
            </div>
          ))}
        </div>
      )}
      {modal && (
        <Modal titulo="Nuevo usuario" onCerrar={() => setModal(false)}>
          <form onSubmit={crearUsuario} className="space-y-4">
            <Alerta tipo="info" mensaje="Se creará una cuenta en el sistema. El usuario recibirá sus credenciales de acceso." />
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Nombre completo *</label>
              <input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Correo electrónico *</label>
              <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Contraseña inicial *</label>
              <input required type="password" minLength={6} value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div>
              <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Rol *</label>
              <select required value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value, almacen: '' }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul">
                {ROLES.map(r => <option key={r} value={r}>{ROLES_LABEL[r]}</option>)}
              </select>
            </div>
            {form.rol !== 'ADMIN' && (
              <div>
                <label className="text-sm font-medium text-feisen-gris-oscuro block mb-1">Almacén asignado *</label>
                <select required value={form.almacen} onChange={e => setForm(f => ({ ...f, almacen: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
                  <option value="">Selecciona un almacén...</option>
                  {CENTROS_COSTO.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-feisen-gris-oscuro">Cancelar</button>
              <button type="submit" disabled={guardando}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {guardando ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export default function GestionConfig() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-feisen-azul">Configuración</h1>
      <SeccionBodegas />
      <SeccionUsuarios />
    </div>
  )
}
