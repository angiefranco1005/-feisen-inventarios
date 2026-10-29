import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import { EncabezadoPagina, PanelLateral, useAviso } from '../shared/ui'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { coincideBusqueda } from '../../utils/busqueda'
import { Plus, Search, AlertTriangle, Check } from '../shared/iconos'
import SeccionPermisos from './SeccionPermisos'

// Configuración (solo ADMIN): usuarios, bodegas, categorías y roles.
// Diseño de la skill ux-feisen: pestañas con conteo, lista → panel lateral de detalle,
// excepciones arriba (usuarios sin bodega) y una sola acción principal por pestaña.

const ROLES_SISTEMA = ['ADMIN', 'LOGISTICA', 'ALMACENISTA', 'OPERARIO', 'CONSULTOR'] // no se pueden borrar
const COLORES_ROL = [
  { label: 'Rojo Feisen',  value: 'bg-feisen-rojo text-white' },
  { label: 'Azul Feisen',  value: 'bg-feisen-azul text-white' },
  { label: 'Verde',        value: 'bg-emerald-600 text-white' },
  { label: 'Naranja',      value: 'bg-orange-600 text-white'  },
  { label: 'Morado',       value: 'bg-purple-600 text-white'  },
  { label: 'Amarillo',     value: 'bg-yellow-500 text-white'  },
  { label: 'Gris',         value: 'bg-gray-500 text-white'    },
]
// Qué ve cada rol (se muestra al elegirlo). Los roles nuevos sin descripción muestran solo el nombre.
const QUE_VE = {
  ADMIN:            'Ve todas las bodegas, valores, reportes y configuración.',
  LOGISTICA:        'Pedidos, compras y movimientos de su bodega.',
  ALMACENISTA:      'Entradas y salidas de su bodega.',
  JEFE_FUNDICION:   'Producción de fundición, moldeo y su bodega.',
  JEFE_MECANIZADOS: 'Registro de mecanizado, transferencias y su bodega.',
  JEFE_ENSAMBLE:    'Órdenes de ensamble y su bodega.',
  OPERARIO:         'Saca materiales de su bodega.',
  CONSULTOR:        'Solo consulta el stock y el historial de su bodega.',
  RRHH:             'Colaboradores, nómina y la bodega de Administración.',
  RECURSOS_HUMANOS: 'Colaboradores, nómina y la bodega de Administración.',
}

const claseInput = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'
const fmt = n => Number(n || 0).toLocaleString('es-CO')
const plural = (n, uno, varios) => `${fmt(n)} ${n === 1 ? uno : varios}`
const puntoRol = r => (r?.color || '').split(' ').find(c => c.startsWith('bg-')) || 'bg-gray-400'
const iniciales = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('')

function Etiqueta({ children, htmlFor }) {
  return <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2 mb-1.5">{children}</label>
}
function Buscador({ valor, onCambiar, placeholder }) {
  return (
    <div className="relative flex-1 min-w-[14rem]">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input type="search" value={valor} onChange={e => onCambiar(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="w-full border border-feisen-borde rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
    </div>
  )
}
function Chip({ activo, onClick, children, n }) {
  return (
    <button type="button" aria-pressed={activo} onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors
        ${activo ? 'bg-feisen-texto text-white border-feisen-texto' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
      {children}{n != null && <span className={`tabular-nums ${activo ? 'text-white/70' : 'text-gray-400'}`}>{fmt(n)}</span>}
    </button>
  )
}
function PiePanel({ onCancelar, guardando, texto, deshabilitado }) {
  return (
    <div className="sticky bottom-0 -mx-5 -mb-4 px-5 py-3 bg-white border-t border-feisen-borde flex justify-end gap-2">
      <button type="button" onClick={onCancelar} className="border border-feisen-borde rounded-lg px-4 min-h-[44px] text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">Cancelar</button>
      <button type="submit" disabled={guardando || deshabilitado}
        className="bg-feisen-azul text-white rounded-lg px-5 min-h-[44px] text-sm font-semibold disabled:opacity-40 hover:opacity-90">
        {guardando ? 'Guardando…' : texto}
      </button>
    </div>
  )
}

// ─── USUARIOS ─────────────────────────────────────────────────────────────────
function PanelUsuario({ usuario, datos, onCerrar, onGuardado }) {
  const { perfil } = useAuth()
  const nuevo = !usuario
  const yoMismo = usuario?.id === perfil?.id
  const [form, setForm] = useState({ nombre: usuario?.nombre || '', rol: usuario?.rol || 'ALMACENISTA', email: '', password: '' })
  const [bodegasSel, setBodegasSel] = useState(usuario ? (datos.bodegasDe[usuario.id] || []) : [])
  const [activo, setActivo] = useState(usuario?.activo !== false)
  const [emailOriginal, setEmailOriginal] = useState('')
  const [msg, setMsg] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Correo actual (solo al editar)
  useEffect(() => {
    if (!usuario) return
    supabase.rpc('get_user_email', { user_id: usuario.id }).then(({ data }) => {
      const email = typeof data === 'string' ? data : ''
      setEmailOriginal(email)
      setForm(f => ({ ...f, email }))
    })
  }, [usuario])

  const esAdminRol = form.rol === 'ADMIN'
  const faltaBodega = !esAdminRol && bodegasSel.length === 0
  const alternarBodega = id => setBodegasSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  async function llamarFuncion(nombre, cuerpo) {
    const { data: { session } } = await supabase.auth.getSession()
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${nombre}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(cuerpo),
    })
    const result = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error(result.error || 'No se pudo guardar el acceso')
    return result
  }

  async function guardarBodegas(id) {
    const { error: eDel } = await supabase.from('profile_bodegas').delete().eq('profile_id', id)
    if (eDel) throw eDel
    if (!esAdminRol && bodegasSel.length) {
      const { error } = await supabase.from('profile_bodegas').insert(bodegasSel.map(bid => ({ profile_id: id, bodega_id: bid })))
      if (error) throw error
    }
  }

  async function guardar(e) {
    e.preventDefault()
    if (faltaBodega) return
    setMsg(''); setGuardando(true)
    try {
      if (nuevo) {
        await llamarFuncion('crear-usuario', { email: form.email.trim(), password: form.password, nombre: form.nombre.trim(), rol: form.rol })
        // crear-usuario solo responde { ok }: se busca el perfil recién creado para guardarle sus bodegas
        const { data: creado } = await supabase.from('profiles').select('id')
          .eq('nombre', form.nombre.trim()).order('created_at', { ascending: false }).limit(1).maybeSingle()
        const id = creado?.id
        if (id) await guardarBodegas(id)
        onGuardado(id ? 'Usuario creado' : 'Usuario creado. Ábrelo para asignarle sus bodegas.')
        return
      }
      const cambios = { nombre: form.nombre.trim(), rol: form.rol }
      if (!yoMismo) cambios.activo = activo
      const { error } = await supabase.from('profiles').update(cambios).eq('id', usuario.id)
      if (error) throw error
      const email = form.email.trim(), pass = form.password.trim()
      if (pass || (email && email !== emailOriginal)) {
        await llamarFuncion('actualizar-usuario', { userId: usuario.id, email: email || undefined, password: pass || undefined })
      }
      await guardarBodegas(usuario.id)
      onGuardado(activo === (usuario.activo !== false) ? 'Cambios guardados' : activo ? 'Usuario reactivado' : 'Usuario desactivado')
    } catch (err) {
      setMsg(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const rolesOrden = [...datos.roles].sort((a, b) => (a.nombre === 'ADMIN') - (b.nombre === 'ADMIN'))

  return (
    <PanelLateral etiqueta={nuevo ? 'Nuevo usuario' : `Usuario ${usuario.nombre}`} onCerrar={onCerrar}
      encabezado={
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-feisen-azul-suave text-feisen-azul grid place-items-center text-sm font-semibold shrink-0">{nuevo ? '+' : iniciales(usuario.nombre)}</span>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-feisen-texto truncate">{nuevo ? 'Nuevo usuario' : usuario.nombre}</p>
            <p className="text-xs text-feisen-texto-2">{nuevo ? 'Entra con el correo y la contraseña que pongas aquí' : (activo ? 'Activo' : 'Desactivado')}</p>
          </div>
        </div>
      }>
      <form onSubmit={guardar} className="space-y-5">
        {msg && <Alerta tipo="error" mensaje={msg} />}
        <div>
          <Etiqueta htmlFor="u-nombre">Nombre completo</Etiqueta>
          <input id="u-nombre" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Efrain Palma" className={claseInput} />
        </div>

        <div>
          <Etiqueta>Rol · qué puede hacer</Etiqueta>
          {yoMismo && <p className="text-xs text-feisen-texto-2 mb-2">No puedes cambiar tu propio rol.</p>}
          <div className="space-y-1.5">
            {rolesOrden.map(r => {
              const on = form.rol === r.nombre
              return (
                <button key={r.nombre} type="button" disabled={yoMismo && !on} aria-pressed={on}
                  onClick={() => setForm(f => ({ ...f, rol: r.nombre }))}
                  className={`w-full flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 transition-colors disabled:opacity-40
                    ${on ? 'border-feisen-azul bg-feisen-azul-suave' : 'border-feisen-borde bg-white hover:bg-feisen-fondo'}`}>
                  <span className={`mt-0.5 w-4 h-4 rounded-full shrink-0 ${on ? 'border-[5px] border-feisen-azul' : 'border-2 border-feisen-borde'}`} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-feisen-texto"><i className={`w-2 h-2 rounded-full ${puntoRol(r)}`} />{r.label}</span>
                    {QUE_VE[r.nombre] && <span className="block text-xs text-feisen-texto-2">{QUE_VE[r.nombre]}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {esAdminRol ? (
          <p className="text-sm text-feisen-texto-2">El administrador ve todas las bodegas; no hace falta asignarle ninguna.</p>
        ) : (
          <div>
            <Etiqueta>Bodegas que puede ver</Etiqueta>
            <div className="flex flex-wrap gap-1.5">
              {datos.bodegas.filter(b => b.activo).map(b => {
                const on = bodegasSel.includes(b.id)
                return (
                  <button key={b.id} type="button" aria-pressed={on} onClick={() => alternarBodega(b.id)}
                    className={`inline-flex items-center gap-1 min-h-[40px] px-3 rounded-lg border text-sm font-medium transition-colors
                      ${on ? 'bg-feisen-azul border-feisen-azul text-white' : 'bg-white border-feisen-borde text-feisen-texto hover:bg-feisen-fondo'}`}>
                    {on && <Check size={14} />}{b.nombre}
                  </button>
                )
              })}
            </div>
            {faltaBodega && <p className="text-xs text-amber-700 mt-2">Marca al menos una bodega: sin bodega esta persona no ve ningún producto.</p>}
          </div>
        )}

        <div className="border border-feisen-borde rounded-lg p-3 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">Acceso</p>
          <div>
            <Etiqueta htmlFor="u-email">Correo</Etiqueta>
            <input id="u-email" type="email" required={nuevo} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="correo@feisen.com.co" className={claseInput} />
          </div>
          <div>
            <Etiqueta htmlFor="u-pass">{nuevo ? 'Contraseña' : 'Nueva contraseña'}</Etiqueta>
            <input id="u-pass" type="password" required={nuevo} minLength={nuevo ? 6 : undefined} autoComplete="new-password"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder={nuevo ? 'Mínimo 6 caracteres' : 'Déjala vacía para no cambiarla'} className={claseInput} />
          </div>
        </div>

        {!nuevo && !yoMismo && (
          <div className="flex items-center justify-between gap-3 border-t border-feisen-borde-suave pt-4">
            <p className="text-sm text-feisen-texto-2">
              {activo ? 'Desactivar le quita la entrada a la app. Su historial se conserva.' : 'Desactivado: no puede entrar a la app. Al guardar queda así.'}
            </p>
            <button type="button" onClick={() => setActivo(a => !a)}
              className={`shrink-0 border rounded-lg px-3 min-h-[40px] text-sm font-medium bg-white hover:bg-feisen-fondo ${activo ? 'border-feisen-borde text-feisen-rojo' : 'border-feisen-azul text-feisen-azul'}`}>
              {activo ? 'Desactivar' : 'Reactivar'}
            </button>
          </div>
        )}

        <PiePanel onCancelar={onCerrar} guardando={guardando} deshabilitado={faltaBodega}
          texto={nuevo ? 'Crear usuario' : 'Guardar cambios'} />
      </form>
    </PanelLateral>
  )
}

function SeccionUsuarios({ datos, abrir }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  const rolDe = n => datos.roles.find(r => r.nombre === n)
  const nombreBodega = id => datos.bodegas.find(b => b.id === id)?.nombre
  const sinBodega = datos.usuarios.filter(u => u.activo !== false && u.rol !== 'ADMIN' && !(datos.bodegasDe[u.id] || []).length)
  const conteo = {}
  datos.usuarios.forEach(u => { conteo[u.rol] = (conteo[u.rol] || 0) + 1 })
  const lista = datos.usuarios
    .filter(u => (!filtroRol || u.rol === filtroRol) && (!busqueda.trim() || coincideBusqueda(u.nombre || '', busqueda)))
    .sort((a, b) => (a.activo === false) - (b.activo === false) || (a.nombre || '').localeCompare(b.nombre || '', 'es'))

  return (
    <div className="space-y-3">
      {sinBodega.map(u => (
        <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-50 text-amber-800 rounded-lg px-3 py-2.5 text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1 min-w-[12rem]"><b className="text-feisen-texto">{u.nombre}</b> no tiene bodega asignada, así que no ve ningún producto.</span>
          <button type="button" onClick={() => abrir(u)} className="font-semibold text-feisen-azul">Asignar bodega</button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar por nombre…" />
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
          <Chip activo={!filtroRol} onClick={() => setFiltroRol('')} n={datos.usuarios.length}>Todos</Chip>
          {Object.entries(conteo).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
            <Chip key={r} activo={filtroRol === r} onClick={() => setFiltroRol(r)} n={n}>{rolDe(r)?.label || r}</Chip>
          ))}
        </div>
      </div>

      <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,2fr)_6rem] gap-3 px-4 py-2 bg-feisen-fondo border-b border-feisen-borde text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">
          <span>Persona</span><span>Rol</span><span>Bodegas que ve</span><span className="text-right">Estado</span>
        </div>
        {lista.length === 0 && <p className="px-4 py-6 text-sm text-feisen-texto-2">Nadie coincide con la búsqueda.</p>}
        <ul className="divide-y divide-feisen-borde-suave">
          {lista.map(u => {
            const r = rolDe(u.rol)
            const bods = (datos.bodegasDe[u.id] || []).map(nombreBodega).filter(Boolean)
            const inactivo = u.activo === false
            return (
              <li key={u.id}>
                <button type="button" onClick={() => abrir(u)}
                  className={`w-full text-left grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,2fr)_6rem] gap-x-3 gap-y-1.5 items-center px-4 py-3 min-h-[60px] hover:bg-feisen-fondo ${inactivo ? 'opacity-55' : ''}`}>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-feisen-azul-suave text-feisen-azul grid place-items-center text-xs font-semibold shrink-0">{iniciales(u.nombre)}</span>
                    <span className="font-semibold text-feisen-texto truncate">{u.nombre}</span>
                  </span>
                  <span className={`text-xs text-right md:order-last ${inactivo ? 'text-gray-400' : 'text-feisen-texto-2'}`}>{inactivo ? 'Desactivado' : 'Activo'}</span>
                  <span className="col-span-2 md:col-span-1 flex items-center gap-1.5 text-sm text-feisen-texto pl-[2.6rem] md:pl-0">
                    <i className={`w-2 h-2 rounded-full ${puntoRol(r)}`} />{r?.label || u.rol}
                  </span>
                  <span className="col-span-2 md:col-span-1 flex flex-wrap gap-1 pl-[2.6rem] md:pl-0">
                    {u.rol === 'ADMIN'
                      ? <span className="text-xs bg-feisen-fondo text-feisen-texto-2 rounded-md px-2 py-0.5">Todas</span>
                      : bods.length
                        ? bods.map(b => <span key={b} className="text-xs bg-feisen-azul-suave text-feisen-azul font-medium rounded-md px-2 py-0.5">{b}</span>)
                        : <span className="text-xs bg-amber-50 text-amber-700 font-medium rounded-md px-2 py-0.5">Sin bodega</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ─── BODEGAS ──────────────────────────────────────────────────────────────────
function PanelBodega({ bodega, productos, onCerrar, onGuardado }) {
  const nuevo = !bodega
  const [form, setForm] = useState({ nombre: bodega?.nombre || '', descripcion: bodega?.descripcion || '' })
  const [activo, setActivo] = useState(bodega?.activo !== false)
  const [msg, setMsg] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(e) {
    e.preventDefault(); setMsg(''); setGuardando(true)
    const datos = { nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null }
    const { error } = nuevo
      ? await supabase.from('bodegas').insert(datos)
      : await supabase.from('bodegas').update({ ...datos, activo }).eq('id', bodega.id)
    setGuardando(false)
    if (error) { setMsg(error.message); return }
    onGuardado(nuevo ? 'Bodega creada' : 'Cambios guardados')
  }

  async function eliminar() {
    if (!window.confirm(`¿Eliminar la bodega "${bodega.nombre}"? No se puede deshacer.`)) return
    const { error } = await supabase.from('bodegas').delete().eq('id', bodega.id)
    if (error) { setMsg('No se puede eliminar: tiene categorías, stock, movimientos o personas asociadas. Desactívala en su lugar.'); return }
    onGuardado('Bodega eliminada')
  }

  return (
    <PanelLateral etiqueta={nuevo ? 'Nueva bodega' : `Bodega ${bodega.nombre}`} onCerrar={onCerrar}
      encabezado={<p className="text-lg font-semibold text-feisen-texto">{nuevo ? 'Nueva bodega' : bodega.nombre}</p>}>
      <form onSubmit={guardar} className="space-y-5">
        {msg && <Alerta tipo="error" mensaje={msg} />}
        <div>
          <Etiqueta htmlFor="b-nombre">Nombre</Etiqueta>
          <input id="b-nombre" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Bodega Motores" className={claseInput} />
        </div>
        <div>
          <Etiqueta htmlFor="b-desc">Descripción (opcional)</Etiqueta>
          <input id="b-desc" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Para qué se usa" className={claseInput} />
        </div>
        {!nuevo && (
          <div className="flex items-center justify-between gap-3 border-t border-feisen-borde-suave pt-4">
            <p className="text-sm text-feisen-texto-2">
              {activo ? 'Desactivarla la oculta de las listas para elegir bodega. Sus datos se conservan.' : 'Inactiva: no aparece para elegir. Al guardar queda así.'}
            </p>
            <button type="button" onClick={() => setActivo(a => !a)}
              className={`shrink-0 border rounded-lg px-3 min-h-[40px] text-sm font-medium bg-white hover:bg-feisen-fondo ${activo ? 'border-feisen-borde text-feisen-rojo' : 'border-feisen-azul text-feisen-azul'}`}>
              {activo ? 'Desactivar' : 'Reactivar'}
            </button>
          </div>
        )}
        {!nuevo && productos === 0 && (
          <button type="button" onClick={eliminar} className="text-sm font-medium text-feisen-rojo">Eliminar bodega</button>
        )}
        <PiePanel onCancelar={onCerrar} guardando={guardando} texto={nuevo ? 'Crear bodega' : 'Guardar cambios'} />
      </form>
    </PanelLateral>
  )
}

function SeccionBodegas({ datos, abrir }) {
  const lista = [...datos.bodegas].sort((a, b) =>
    (a.activo === false) - (b.activo === false) || (datos.productosBodega[b.id] || 0) - (datos.productosBodega[a.id] || 0))
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {lista.map(b => {
        const productos = datos.productosBodega[b.id] || 0
        const cats = datos.categorias.filter(c => c.bodega_id === b.id).length
        const gente = datos.usuarios.filter(u => u.activo !== false && (datos.bodegasDe[u.id] || []).includes(b.id))
        const inactiva = b.activo === false
        return (
          <button key={b.id} type="button" onClick={() => abrir(b)}
            className={`text-left bg-white border border-feisen-borde rounded-xl p-4 space-y-3 hover:border-gray-300 ${inactiva || !productos ? 'opacity-70' : ''}`}>
            <span className="flex items-start justify-between gap-2">
              <span className="font-semibold text-feisen-texto break-words">{b.nombre}</span>
              <span className={`shrink-0 text-xs font-medium rounded-md px-2 py-0.5 ${inactiva ? 'bg-feisen-fondo text-gray-500' : productos ? 'bg-feisen-azul-suave text-feisen-azul' : 'bg-feisen-fondo text-feisen-texto-2'}`}>
                {inactiva ? 'Inactiva' : productos ? 'Activa' : 'Sin productos'}
              </span>
            </span>
            <span className="grid grid-cols-3 gap-2">
              {[['Productos', productos], ['Categorías', cats], ['Personas', gente.length]].map(([t, n]) => (
                <span key={t}><span className="block text-[11px] text-feisen-texto-2">{t}</span><span className="block text-lg font-semibold text-feisen-texto tabular-nums">{fmt(n)}</span></span>
              ))}
            </span>
            <span className="block text-xs text-feisen-texto-2 truncate">
              {gente.length ? gente.map(u => (u.nombre || '').trim().split(/\s+/)[0]).join(', ') : 'Nadie la tiene asignada'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── CATEGORÍAS ───────────────────────────────────────────────────────────────
function PanelCategoria({ categoria, datos, onCerrar, onGuardado }) {
  const nuevo = !categoria
  const activas = datos.bodegas.filter(b => b.activo)
  const [form, setForm] = useState({ nombre: categoria?.nombre || '', bodega_id: categoria?.bodega_id || activas[0]?.id || '' })
  const [msg, setMsg] = useState('')
  const [guardando, setGuardando] = useState(false)
  const productos = categoria ? (datos.productosCategoria[categoria.id] || 0) : 0

  async function guardar(e) {
    e.preventDefault(); setMsg('')
    if (!form.bodega_id) { setMsg('Elige una bodega.'); return }
    setGuardando(true)
    const datosCat = { nombre: form.nombre.trim(), bodega_id: form.bodega_id }
    const { error } = nuevo
      ? await supabase.from('categorias').insert(datosCat)
      : await supabase.from('categorias').update(datosCat).eq('id', categoria.id)
    setGuardando(false)
    if (error) { setMsg(error.message); return }
    onGuardado(nuevo ? 'Categoría creada' : 'Cambios guardados')
  }

  async function eliminar() {
    if (!window.confirm(`¿Eliminar la categoría "${categoria.nombre}"?`)) return
    const { error } = await supabase.from('categorias').delete().eq('id', categoria.id)
    if (error) { setMsg('No se puede eliminar: tiene productos asociados (también los inactivos).'); return }
    onGuardado('Categoría eliminada')
  }

  return (
    <PanelLateral etiqueta={nuevo ? 'Nueva categoría' : `Categoría ${categoria.nombre}`} onCerrar={onCerrar}
      encabezado={<div><p className="text-lg font-semibold text-feisen-texto">{nuevo ? 'Nueva categoría' : categoria.nombre}</p>
        {!nuevo && <p className="text-xs text-feisen-texto-2">{plural(productos, 'producto activo', 'productos activos')}</p>}</div>}>
      <form onSubmit={guardar} className="space-y-5">
        {msg && <Alerta tipo="error" mensaje={msg} />}
        <div>
          <Etiqueta htmlFor="c-bodega">Bodega</Etiqueta>
          <select id="c-bodega" required value={form.bodega_id} onChange={e => setForm(f => ({ ...f, bodega_id: e.target.value }))} className={claseInput}>
            <option value="">Elige la bodega</option>
            {activas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </div>
        <div>
          <Etiqueta htmlFor="c-nombre">Nombre</Etiqueta>
          <input id="c-nombre" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Rodamientos" className={claseInput} />
        </div>
        {!nuevo && productos === 0 && (
          <button type="button" onClick={eliminar} className="text-sm font-medium text-feisen-rojo">Eliminar categoría</button>
        )}
        <PiePanel onCancelar={onCerrar} guardando={guardando} texto={nuevo ? 'Crear categoría' : 'Guardar cambios'} />
      </form>
    </PanelLateral>
  )
}

function SeccionCategorias({ datos, abrir }) {
  const [busqueda, setBusqueda] = useState('')
  const grupos = datos.bodegas
    .map(b => ({ bodega: b, cats: datos.categorias.filter(c => c.bodega_id === b.id).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')) }))
    .filter(g => g.cats.length)
    .sort((a, b) => b.cats.length - a.cats.length)
  return (
    <div className="space-y-3">
      <div className="flex"><Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar categoría…" /></div>
      {grupos.map(({ bodega, cats }) => {
        const visibles = busqueda.trim() ? cats.filter(c => coincideBusqueda(c.nombre, busqueda)) : cats
        if (!visibles.length) return null
        return (
          <section key={bodega.id} className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
            <h3 className="flex justify-between gap-2 px-4 py-2 bg-feisen-fondo border-b border-feisen-borde text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">
              <span>{bodega.nombre}</span><span>{plural(cats.length, 'categoría', 'categorías')}</span>
            </h3>
            <ul className="divide-y divide-feisen-borde-suave">
              {visibles.map(c => {
                const n = datos.productosCategoria[c.id] || 0
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => abrir(c)} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 min-h-[48px] text-left hover:bg-feisen-fondo">
                      <span className="text-sm text-feisen-texto">
                        {c.nombre}
                        {!n && <span className="ml-2 text-xs font-medium bg-amber-50 text-amber-700 rounded-md px-1.5 py-0.5">vacía</span>}
                      </span>
                      <span className="text-sm text-feisen-texto-2 tabular-nums whitespace-nowrap">{plural(n, 'producto', 'productos')}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

// ─── ROLES ────────────────────────────────────────────────────────────────────
function PanelRol({ onCerrar, onGuardado }) {
  const [form, setForm] = useState({ nombre: '', label: '', color: COLORES_ROL[3].value })
  const [msg, setMsg] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(e) {
    e.preventDefault(); setMsg(''); setGuardando(true)
    const nombre = form.nombre.trim().toUpperCase().replace(/\s+/g, '_')
    const { error } = await supabase.from('roles').insert({ nombre, label: form.label.trim(), color: form.color })
    setGuardando(false)
    if (error) { setMsg(error.message.includes('unique') ? 'Ya existe un rol con ese nombre.' : error.message); return }
    onGuardado('Rol creado')
  }

  return (
    <PanelLateral etiqueta="Nuevo rol" onCerrar={onCerrar}
      encabezado={<div><p className="text-lg font-semibold text-feisen-texto">Nuevo rol</p>
        <p className="text-xs text-feisen-texto-2">Un rol nuevo no ve ninguna pantalla hasta que se programe qué puede hacer.</p></div>}>
      <form onSubmit={guardar} className="space-y-5">
        {msg && <Alerta tipo="error" mensaje={msg} />}
        <div>
          <Etiqueta htmlFor="r-label">Nombre visible</Etiqueta>
          <input id="r-label" required value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ej: Jefe Ensamble" className={claseInput} />
        </div>
        <div>
          <Etiqueta htmlFor="r-nombre">Código</Etiqueta>
          <input id="r-nombre" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: JEFE_ENSAMBLE" className={claseInput + ' font-mono uppercase'} />
          <p className="text-xs text-feisen-texto-2 mt-1">Se guarda en mayúsculas con guion bajo.</p>
        </div>
        <div>
          <Etiqueta>Color del punto</Etiqueta>
          <div className="flex flex-wrap gap-1.5">
            {COLORES_ROL.map(c => {
              const on = form.color === c.value
              return (
                <button key={c.value} type="button" aria-pressed={on} onClick={() => setForm(f => ({ ...f, color: c.value }))}
                  className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border text-sm ${on ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-medium' : 'border-feisen-borde bg-white text-feisen-texto'}`}>
                  <i className={`w-2.5 h-2.5 rounded-full ${c.value.split(' ')[0]}`} />{c.label}
                </button>
              )
            })}
          </div>
        </div>
        <PiePanel onCancelar={onCerrar} guardando={guardando} texto="Crear rol" />
      </form>
    </PanelLateral>
  )
}

function SeccionRoles({ datos, recargar, avisar }) {
  const [msg, setMsg] = useState('')
  const conteo = {}
  datos.usuarios.forEach(u => { conteo[u.rol] = (conteo[u.rol] || 0) + 1 })

  async function eliminar(r) {
    if (!window.confirm(`¿Eliminar el rol "${r.label}"?`)) return
    const { error } = await supabase.from('roles').delete().eq('id', r.id)
    if (error) { setMsg('No se puede eliminar: hay usuarios con este rol.'); return }
    avisar('Rol eliminado'); recargar()
  }

  return (
    <div className="space-y-3">
      {msg && <Alerta tipo="error" mensaje={msg} />}
      <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(0,1.3fr)_minmax(0,2.4fr)_5rem_5rem] gap-3 px-4 py-2 bg-feisen-fondo border-b border-feisen-borde text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">
          <span>Rol</span><span>Qué ve</span><span className="text-right">Personas</span><span />
        </div>
        <ul className="divide-y divide-feisen-borde-suave">
          {datos.roles.map(r => {
            const n = conteo[r.nombre] || 0
            const sistema = ROLES_SISTEMA.includes(r.nombre)
            return (
              <li key={r.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,2.4fr)_5rem_5rem] gap-x-3 gap-y-1 items-center px-4 py-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-feisen-texto"><i className={`w-2 h-2 rounded-full ${puntoRol(r)}`} />{r.label}</span>
                  <span className="block text-[11px] font-mono text-gray-400">{r.nombre}</span>
                </span>
                <span className="text-sm text-feisen-texto-2 tabular-nums text-right md:order-3">{plural(n, 'persona', 'personas')}</span>
                <span className="col-span-2 md:col-span-1 md:order-2 text-sm text-feisen-texto-2">{QUE_VE[r.nombre] || 'Asígnale módulos en la pestaña Permisos.'}</span>
                <span className="hidden md:block md:order-4 text-right text-xs text-gray-400">
                  {sistema ? 'sistema' : n === 0 && <button type="button" onClick={() => eliminar(r)} className="text-sm font-medium text-feisen-rojo">Borrar</button>}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ─── PANTALLA ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'usuarios',   label: 'Usuarios',   nuevo: 'Nuevo usuario',   cuantos: d => d.usuarios.length },
  { id: 'bodegas',    label: 'Bodegas',    nuevo: 'Nueva bodega',    cuantos: d => d.bodegas.length },
  { id: 'categorias', label: 'Categorías', nuevo: 'Nueva categoría', cuantos: d => d.categorias.length },
  { id: 'roles',      label: 'Roles',      nuevo: 'Nuevo rol',       cuantos: d => d.roles.length },
  { id: 'permisos',   label: 'Permisos',   nuevo: null,              cuantos: () => null },
]

export default function GestionConfig() {
  const [tab, setTab] = useState('usuarios')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [panel, setPanel] = useState(null) // { tipo, registro } — registro null = nuevo
  const [aviso, avisar] = useAviso()

  const cargar = useCallback(async () => {
    try {
      const [us, pb, bs, cs, rs, its] = await Promise.all([
        supabase.from('profiles').select('id, nombre, rol, activo').order('nombre'),
        supabase.from('profile_bodegas').select('profile_id, bodega_id'),
        supabase.from('bodegas').select('*').order('nombre'),
        supabase.from('categorias').select('id, nombre, bodega_id').order('nombre'),
        supabase.from('roles').select('*').order('created_at'),
        fetchAllPages((d, h) => supabase.from('items').select('id, bodega_id, categoria_id').eq('activo', true).order('id').range(d, h)),
      ])
      const fallo = [us, pb, bs, cs, rs, its].find(r => r.error)
      if (fallo) throw fallo.error
      const bodegasDe = {}
      for (const r of pb.data || []) (bodegasDe[r.profile_id] ||= []).push(r.bodega_id)
      const productosBodega = {}, productosCategoria = {}
      for (const i of its.data || []) {
        productosBodega[i.bodega_id] = (productosBodega[i.bodega_id] || 0) + 1
        if (i.categoria_id) productosCategoria[i.categoria_id] = (productosCategoria[i.categoria_id] || 0) + 1
      }
      setDatos({ usuarios: us.data || [], bodegasDe, bodegas: bs.data || [], categorias: cs.data || [], roles: rs.data || [], productosBodega, productosCategoria })
    } catch (e) {
      setError('No se pudo cargar la configuración: ' + e.message)
    }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const tabActual = TABS.find(t => t.id === tab)
  const abrir = tipo => registro => setPanel({ tipo, registro })
  const cerrar = () => setPanel(null)
  const guardado = texto => { setPanel(null); avisar(texto); cargar() }

  return (
    <div className={`${tab === 'permisos' ? 'max-w-7xl' : 'max-w-4xl'} mx-auto space-y-4`}>
      {aviso}
      <EncabezadoPagina modulo="Administración" titulo="Configuración"
        subtitulo="Quién entra a la app, qué ve cada rol, qué bodega tiene cada persona y cómo se ordena el inventario.">
        {tabActual.nuevo && (
          <button type="button" onClick={() => setPanel({ tipo: tab, registro: null })}
            className="inline-flex items-center gap-1.5 bg-feisen-azul text-white rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:opacity-90">
            <Plus size={16} /> {tabActual.nuevo}
          </button>
        )}
      </EncabezadoPagina>

      <div role="tablist" className="flex gap-1 border-b border-feisen-borde overflow-x-auto [scrollbar-width:none]">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 px-3 py-2.5 -mb-px border-b-2 text-sm transition-colors
              ${tab === t.id ? 'border-feisen-azul text-feisen-azul font-semibold' : 'border-transparent text-feisen-texto-2 font-medium hover:text-feisen-texto'}`}>
            {t.label}{datos && t.cuantos(datos) != null && <span className="ml-1.5 text-gray-400 tabular-nums font-normal">{fmt(t.cuantos(datos))}</span>}
          </button>
        ))}
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}
      {!datos && !error && <div className="flex justify-center py-10"><Spinner /></div>}

      {datos && tab === 'usuarios'   && <SeccionUsuarios datos={datos} abrir={abrir('usuarios')} />}
      {datos && tab === 'bodegas'    && <SeccionBodegas datos={datos} abrir={abrir('bodegas')} />}
      {datos && tab === 'categorias' && <SeccionCategorias datos={datos} abrir={abrir('categorias')} />}
      {datos && tab === 'roles'      && <SeccionRoles datos={datos} recargar={cargar} avisar={avisar} />}
      {datos && tab === 'permisos'   && <SeccionPermisos datos={datos} avisar={avisar} />}

      {panel?.tipo === 'usuarios'   && <PanelUsuario usuario={panel.registro} datos={datos} onCerrar={cerrar} onGuardado={guardado} />}
      {panel?.tipo === 'bodegas'    && <PanelBodega bodega={panel.registro} productos={panel.registro ? (datos.productosBodega[panel.registro.id] || 0) : 0} onCerrar={cerrar} onGuardado={guardado} />}
      {panel?.tipo === 'categorias' && <PanelCategoria categoria={panel.registro} datos={datos} onCerrar={cerrar} onGuardado={guardado} />}
      {panel?.tipo === 'roles'      && <PanelRol onCerrar={cerrar} onGuardado={guardado} />}
    </div>
  )
}
