import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Plus, Edit2, Trash2, Users, Warehouse, Tag, ToggleLeft, ToggleRight } from 'lucide-react'

const ROLES       = ['ADMIN', 'LOGISTICA', 'CONSULTOR']
const ROLES_LABEL = { ADMIN: 'Administrador', LOGISTICA: 'Logística', CONSULTOR: 'Consultor' }
const BADGE       = { ADMIN: 'bg-feisen-rojo text-white', LOGISTICA: 'bg-feisen-azul text-white', CONSULTOR: 'bg-gray-500 text-white' }

// ─── SECCIÓN BODEGAS ──────────────────────────────────────────────────────────
function SeccionBodegas() {
  const [bodegas,  setBodegas]  = useState([])
  const [cargando, setCargando] = useState(true)
  const [modal,    setModal]    = useState(false)
  const [editando, setEditando] = useState(null)
  const [form,     setForm]     = useState({ nombre: '', descripcion: '' })
  const [msg,      setMsg]      = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('bodegas').select('*').order('nombre')
    setBodegas(data || [])
    setCargando(false)
  }

  function abrir(b = null) {
    setEditando(b)
    setForm(b ? { nombre: b.nombre, descripcion: b.descripcion || '' } : { nombre: '', descripcion: '' })
    setMsg(null); setModal(true)
  }

  async function guardar(e) {
    e.preventDefault(); setMsg(null)
    let error
    if (editando) ({ error } = await supabase.from('bodegas').update(form).eq('id', editando.id))
    else          ({ error } = await supabase.from('bodegas').insert(form))
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setModal(false); cargar()
  }

  async function toggle(b) {
    await supabase.from('bodegas').update({ activo: !b.activo }).eq('id', b.id)
    cargar()
  }

  if (cargando) return <Spinner />

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><Warehouse size={18} className="text-feisen-azul" /> Bodegas</h2>
        <button onClick={() => abrir()}
          className="flex items-center gap-1 bg-feisen-azul text-white px-3 py-1.5 rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={15} /> Nueva
        </button>
      </div>
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
      <div className="space-y-2">
        {bodegas.map(b => (
          <div key={b.id} className={`flex items-center justify-between p-3 rounded-xl border ${b.activo ? 'border-gray-100 bg-gray-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
            <div>
              <p className="font-medium text-gray-800 text-sm">{b.nombre}</p>
              {b.descripcion && <p className="text-xs text-gray-400">{b.descripcion}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => abrir(b)} className="p-1.5 text-feisen-azul hover:bg-blue-50 rounded-lg"><Edit2 size={14} /></button>
              <button onClick={() => toggle(b)} className={`p-1.5 rounded-lg ${b.activo ? 'text-feisen-rojo hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                {b.activo ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>
      {modal && (
        <Modal titulo={editando ? 'Editar bodega' : 'Nueva bodega'} onCerrar={() => setModal(false)}>
          <form onSubmit={guardar} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nombre *</label>
              <input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                placeholder="Ej: Bodega Motores" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Descripción</label>
              <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                placeholder="Opcional" />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setModal(false)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit" className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90">Guardar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── SECCIÓN CATEGORÍAS ───────────────────────────────────────────────────────
function SeccionCategorias() {
  const [cats,     setCats]     = useState([])
  const [bodegas,  setBodegas]  = useState([])
  const [cargando, setCargando] = useState(true)
  const [modal,    setModal]    = useState(false)
  const [editando, setEditando] = useState(null)
  const [form,     setForm]     = useState({ nombre: '', bodega_id: '' })
  const [msg,      setMsg]      = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: cs }, { data: bs }] = await Promise.all([
      supabase.from('categorias').select('*, bodegas(nombre)').order('nombre'),
      supabase.from('bodegas').select('*').eq('activo', true).order('nombre'),
    ])
    setCats(cs || [])
    setBodegas(bs || [])
    setCargando(false)
  }

  function abrir(c = null) {
    setEditando(c)
    setForm(c ? { nombre: c.nombre, bodega_id: c.bodega_id || '' } : { nombre: '', bodega_id: bodegas[0]?.id || '' })
    setMsg(null); setModal(true)
  }

  async function guardar(e) {
    e.preventDefault(); setMsg(null)
    if (!form.bodega_id) { setMsg({ tipo: 'error', texto: 'Selecciona una bodega.' }); return }
    let error
    if (editando) ({ error } = await supabase.from('categorias').update(form).eq('id', editando.id))
    else          ({ error } = await supabase.from('categorias').insert(form))
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setModal(false); cargar()
  }

  async function eliminar(c) {
    const { error } = await supabase.from('categorias').delete().eq('id', c.id)
    if (error) setMsg({ tipo: 'error', texto: 'No se puede eliminar: tiene productos asociados.' })
    else cargar()
  }

  if (cargando) return <Spinner />

  // Agrupar por bodega
  const porBodega = bodegas.map(b => ({
    bodega: b,
    cats: cats.filter(c => c.bodega_id === b.id),
  }))

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><Tag size={18} className="text-feisen-azul" /> Categorías</h2>
        <button onClick={() => abrir()}
          className="flex items-center gap-1 bg-feisen-azul text-white px-3 py-1.5 rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={15} /> Nueva
        </button>
      </div>
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
      <div className="space-y-4">
        {porBodega.map(({ bodega, cats: cs }) => (
          <div key={bodega.id}>
            <p className="text-xs font-semibold text-feisen-azul uppercase tracking-wide mb-2">{bodega.nombre}</p>
            {cs.length === 0
              ? <p className="text-xs text-gray-400 pl-2">Sin categorías</p>
              : cs.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 mb-1.5">
                  <p className="font-medium text-gray-800 text-sm">{c.nombre}</p>
                  <div className="flex gap-2">
                    <button onClick={() => abrir(c)} className="p-1.5 text-feisen-azul hover:bg-blue-50 rounded-lg"><Edit2 size={14} /></button>
                    <button onClick={() => eliminar(c)} className="p-1.5 text-gray-300 hover:text-feisen-rojo hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))
            }
          </div>
        ))}
        {cats.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No hay categorías aún.</p>}
      </div>
      {modal && (
        <Modal titulo={editando ? 'Editar categoría' : 'Nueva categoría'} onCerrar={() => setModal(false)}>
          <form onSubmit={guardar} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Bodega *</label>
              <select required value={form.bodega_id} onChange={e => setForm(f => ({ ...f, bodega_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
                <option value="">Selecciona bodega</option>
                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nombre *</label>
              <input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                placeholder="Ej: Motores" />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setModal(false)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit" className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90">Guardar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── SECCIÓN USUARIOS ─────────────────────────────────────────────────────────
function SeccionUsuarios() {
  const [usuarios,      setUsuarios]      = useState([])
  const [todasBodegas,  setTodasBodegas]  = useState([])
  const [cargando,      setCargando]      = useState(true)
  const [modal,         setModal]         = useState(false)
  const [editando,      setEditando]      = useState(null)
  const [form,          setForm]          = useState({ email: '', password: '', nombre: '', rol: 'LOGISTICA' })
  const [bodegasSelec,  setBodegasSelec]  = useState([]) // IDs de bodegas asignadas al usuario en edición
  const [msg,           setMsg]           = useState(null)
  const [guardando,     setGuardando]     = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: us }, { data: bs }] = await Promise.all([
      supabase.from('profiles').select('*').order('nombre'),
      supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setUsuarios(us || [])
    setTodasBodegas(bs || [])
    setCargando(false)
  }

  function abrirNuevo() {
    setEditando(null)
    setForm({ email: '', password: '', nombre: '', rol: 'LOGISTICA' })
    setBodegasSelec([])
    setMsg(null); setModal(true)
  }

  async function abrirEditar(u) {
    setEditando(u)
    setForm({ email: '', password: '', nombre: u.nombre, rol: u.rol })
    setMsg(null)
    // Cargar bodegas actuales del usuario
    const { data: pb } = await supabase.from('profile_bodegas').select('bodega_id').eq('profile_id', u.id)
    setBodegasSelec((pb || []).map(r => r.bodega_id))
    setModal(true)
  }

  function toggleBodega(id) {
    setBodegasSelec(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function guardar(e) {
    e.preventDefault(); setMsg(null); setGuardando(true)

    if (editando) {
      const { error } = await supabase.from('profiles').update({ nombre: form.nombre, rol: form.rol }).eq('id', editando.id)
      if (error) { setMsg({ tipo: 'error', texto: error.message }); setGuardando(false); return }

      // Sincronizar bodegas: borrar las viejas, insertar las nuevas
      await supabase.from('profile_bodegas').delete().eq('profile_id', editando.id)
      if (bodegasSelec.length > 0) {
        await supabase.from('profile_bodegas').insert(
          bodegasSelec.map(bid => ({ profile_id: editando.id, bodega_id: bid }))
        )
      }

      setGuardando(false)
      setModal(false); cargar(); return
    }

    // Crear usuario vía Edge Function
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crear-usuario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: form.email, password: form.password, nombre: form.nombre, rol: form.rol }),
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || 'Error al crear usuario')
      setModal(false); cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    }
    setGuardando(false)
  }

  // Mapear bodegas asignadas por usuario (para mostrar en la lista)
  const [bodegasPorUsuario, setBodegasPorUsuario] = useState({})
  useEffect(() => {
    if (usuarios.length === 0 || todasBodegas.length === 0) return
    supabase.from('profile_bodegas').select('profile_id, bodega_id').then(({ data }) => {
      const mapa = {}
      ;(data || []).forEach(r => {
        if (!mapa[r.profile_id]) mapa[r.profile_id] = []
        const b = todasBodegas.find(b => b.id === r.bodega_id)
        if (b) mapa[r.profile_id].push(b.nombre)
      })
      setBodegasPorUsuario(mapa)
    })
  }, [usuarios, todasBodegas])

  if (cargando) return <Spinner />

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><Users size={18} className="text-feisen-azul" /> Usuarios</h2>
        <button onClick={abrirNuevo}
          className="flex items-center gap-1 bg-feisen-azul text-white px-3 py-1.5 rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={15} /> Nuevo
        </button>
      </div>
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
      <div className="space-y-2">
        {usuarios.map(u => {
          const bodegas = bodegasPorUsuario[u.id] || []
          return (
            <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="font-bold text-feisen-azul text-xs">{u.nombre?.charAt(0)?.toUpperCase()}</span>
                </div>
                <div>
                  <p className="font-medium text-gray-800 text-sm">{u.nombre}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE[u.rol] || 'bg-gray-200 text-gray-600'}`}>
                      {ROLES_LABEL[u.rol] || u.rol}
                    </span>
                    {u.rol !== 'ADMIN' && (
                      bodegas.length > 0
                        ? bodegas.map(nb => (
                            <span key={nb} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-feisen-azul border border-blue-100">
                              {nb}
                            </span>
                          ))
                        : <span className="text-xs text-amber-500">⚠ Sin bodega asignada</span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => abrirEditar(u)} className="p-1.5 text-feisen-azul hover:bg-blue-50 rounded-lg"><Edit2 size={14} /></button>
            </div>
          )
        })}
      </div>

      {modal && (
        <Modal titulo={editando ? 'Editar usuario' : 'Nuevo usuario'} onCerrar={() => setModal(false)}>
          <form onSubmit={guardar} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nombre completo *</label>
              <input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                placeholder="Ej: Efrain Palma" />
            </div>
            {!editando && (
              <>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Email *</label>
                  <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                    placeholder="correo@feisen.com" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Contraseña temporal *</label>
                  <input required type="password" minLength={6} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                    placeholder="Mínimo 6 caracteres" />
                </div>
              </>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Rol *</label>
              <select required value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
                {ROLES.map(r => <option key={r} value={r}>{ROLES_LABEL[r]}</option>)}
              </select>
            </div>

            {/* Bodegas asignadas — solo aplica para no-admin */}
            {form.rol !== 'ADMIN' && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Bodegas que puede ver</label>
                {todasBodegas.length === 0
                  ? <p className="text-xs text-gray-400">No hay bodegas activas creadas aún.</p>
                  : (
                    <div className="space-y-2">
                      {todasBodegas.map(b => (
                        <label key={b.id} className="flex items-center gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={bodegasSelec.includes(b.id)}
                            onChange={() => toggleBodega(b.id)}
                            className="w-4 h-4 accent-feisen-azul rounded"
                          />
                          <span className="text-sm text-gray-700">{b.nombre}</span>
                        </label>
                      ))}
                    </div>
                  )
                }
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(false)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit" disabled={guardando} className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60 hover:opacity-90">
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function GestionConfig() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-feisen-azul">Configuración</h1>
      <SeccionUsuarios />
      <SeccionBodegas />
      <SeccionCategorias />
    </div>
  )
}
