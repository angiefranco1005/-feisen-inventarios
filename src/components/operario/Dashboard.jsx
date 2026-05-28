import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatNumero, formatFechaHora, CENTROS_COSTO } from '../../utils/formatters'
import Alerta from '../shared/Alerta'
import { CheckCircle, Search, LogOut } from 'lucide-react'

// Pantalla OPERARIO: máximo 2 acciones, formulario de máximo 4 campos, botones enormes
export default function DashboardOperario() {
  const { perfil, logout } = useAuth()
  const [vista, setVista] = useState('inicio') // inicio | salida | historial
  const [items, setItems] = useState([])
  const [bodegas, setBodegas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [mostrarLista, setMostrarLista] = useState(false)
  const [form, setForm] = useState({ item_id: '', item_nombre: '', bodega_origen_id: '', cantidad: '', centro_costo: 'Almacén' })
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function cargar() {
      const [{ data: it }, { data: bod }] = await Promise.all([
        supabase.from('items').select('id, nombre, unidad_medida, centro_costo, precio_costo').eq('activo', true).order('nombre'),
        supabase.from('bodegas').select('*').eq('activo', true).order('nombre')
      ])
      setItems(it || [])
      setBodegas(bod || [])
    }
    cargar()
  }, [])

  const itemsFiltrados = busqueda.length > 0
    ? items.filter(i => i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : items

  function seleccionarItem(item) {
    setForm(f => ({ ...f, item_id: item.id, item_nombre: item.nombre, centro_costo: item.centro_costo || 'Construequipos' }))
    setBusqueda(item.nombre)
    setMostrarLista(false)
  }

  async function registrarSalida(e) {
    e.preventDefault()
    setError(''); setGuardando(true)
    if (!form.item_id) { setError('Selecciona un producto.'); setGuardando(false); return }
    const cantidad = parseFloat(form.cantidad)
    if (!cantidad || cantidad <= 0) { setError('La cantidad debe ser mayor a cero.'); setGuardando(false); return }
    if (!form.bodega_origen_id) { setError('Selecciona la bodega de donde sale el material.'); setGuardando(false); return }

    const item = items.find(i => i.id === form.item_id)
    const { error: err } = await supabase.from('movimientos').insert({
      tipo: 'salida_produccion',
      item_id: form.item_id,
      bodega_origen_id: form.bodega_origen_id,
      cantidad,
      precio_costo_snapshot: item?.precio_costo || 0,
      centro_costo: form.centro_costo,
      usuario_id: perfil.id,
    })
    setGuardando(false)
    if (err) { setError('Error al registrar. Intenta de nuevo.'); return }
    setExito(true)
    setTimeout(() => {
      setExito(false)
      setVista('inicio')
      setForm({ item_id: '', item_nombre: '', bodega_origen_id: '', cantidad: '', centro_costo: 'Almacén' })
      setBusqueda('')
    }, 3000)
  }

  async function cargarHistorial() {
    setCargando(true)
    const { data } = await supabase.from('movimientos')
      .select('*, items(nombre, unidad_medida)')
      .eq('usuario_id', perfil.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setHistorial(data || [])
    setCargando(false)
  }

  function irAHistorial() {
    setVista('historial')
    cargarHistorial()
  }

  // ---- VISTA INICIO ----
  if (vista === 'inicio') {
    return (
      <div className="min-h-screen bg-feisen-gris flex flex-col">
        {/* Header */}
        <div className="bg-feisen-azul px-5 pt-8 pb-10 text-white">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-blue-200 text-sm">Bienvenido,</p>
              <h1 className="text-2xl font-bold">{perfil?.nombre}</h1>
            </div>
            <button onClick={logout} className="flex items-center gap-1 text-blue-200 text-sm">
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Botones principales */}
        <div className="px-5 -mt-5 space-y-4 flex-1">
          <button onClick={() => setVista('salida')}
            className="w-full bg-feisen-rojo text-white rounded-2xl py-7 text-xl font-bold shadow-lg hover:opacity-90 transition-opacity flex flex-col items-center gap-2">
            <span className="text-4xl">📦</span>
            Registrar salida de material
          </button>

          <button onClick={irAHistorial}
            className="w-full bg-white text-feisen-azul rounded-2xl py-7 text-xl font-bold shadow-lg hover:bg-feisen-gris transition-colors flex flex-col items-center gap-2 border border-gray-200">
            <span className="text-4xl">📋</span>
            Ver mi historial
          </button>
        </div>
      </div>
    )
  }

  // ---- VISTA HISTORIAL ----
  if (vista === 'historial') {
    return (
      <div className="min-h-screen bg-feisen-gris">
        <div className="bg-feisen-azul px-5 pt-8 pb-6 text-white">
          <button onClick={() => setVista('inicio')} className="text-blue-200 text-sm mb-3">← Volver</button>
          <h1 className="text-2xl font-bold">Mi historial</h1>
        </div>
        <div className="px-4 pt-4 space-y-3">
          {cargando ? (
            <div className="text-center py-10 text-feisen-gris-medio">Cargando...</div>
          ) : historial.length === 0 ? (
            <div className="text-center py-10 text-feisen-gris-medio">
              <p className="text-4xl mb-3">📋</p>
              <p>No tienes movimientos registrados aún.</p>
            </div>
          ) : historial.map(m => (
            <div key={m.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-feisen-gris-oscuro">{m.items?.nombre}</p>
                <span className="text-feisen-azul font-bold text-lg">
                  {formatNumero(m.cantidad)} {m.items?.unidad_medida}
                </span>
              </div>
              <p className="text-feisen-gris-medio text-sm">{formatFechaHora(m.created_at)}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ---- VISTA SALIDA ----
  return (
    <div className="min-h-screen bg-feisen-gris">
      <div className="bg-feisen-rojo px-5 pt-8 pb-6 text-white">
        <button onClick={() => setVista('inicio')} className="text-red-200 text-sm mb-3">← Volver</button>
        <h1 className="text-2xl font-bold">Registrar salida</h1>
        <p className="text-red-200 text-sm">Completa los 4 campos y confirma</p>
      </div>

      <div className="px-4 pt-5">
        {exito ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle size={72} className="text-emerald-500 mb-4" />
            <h2 className="text-2xl font-bold text-feisen-gris-oscuro mb-2">¡Listo!</h2>
            <p className="text-feisen-gris-medio">Salida registrada correctamente.</p>
          </div>
        ) : (
          <form onSubmit={registrarSalida} className="space-y-5">
            {/* 1. Producto */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-base font-bold text-feisen-gris-oscuro mb-3">1. ¿Qué material sale?</label>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
                <input value={busqueda}
                  onChange={e => { setBusqueda(e.target.value); setMostrarLista(true); setForm(f => ({ ...f, item_id: '' })) }}
                  onFocus={() => setMostrarLista(true)}
                  placeholder="Escribe el nombre del material..."
                  className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-feisen-rojo" />
              </div>
              {mostrarLista && itemsFiltrados.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {itemsFiltrados.slice(0, 15).map(item => (
                    <button key={item.id} type="button" onClick={() => seleccionarItem(item)}
                      className="w-full text-left px-4 py-3 hover:bg-feisen-gris border-b last:border-0 text-feisen-gris-oscuro font-medium text-sm">
                      {item.nombre}
                      <span className="text-xs text-feisen-gris-medio ml-2">({item.unidad_medida})</span>
                    </button>
                  ))}
                </div>
              )}
              {form.item_id && (
                <p className="mt-2 text-emerald-600 text-sm font-medium">✓ {form.item_nombre}</p>
              )}
            </div>

            {/* 2. Bodega */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-base font-bold text-feisen-gris-oscuro mb-3">2. ¿De qué bodega sale?</label>
              <div className="grid grid-cols-1 gap-2">
                {bodegas.map(b => (
                  <button key={b.id} type="button"
                    onClick={() => setForm(f => ({ ...f, bodega_origen_id: b.id }))}
                    className={`py-3 px-4 rounded-xl text-left font-medium text-sm border transition-colors
                      ${form.bodega_origen_id === b.id
                        ? 'bg-feisen-azul text-white border-feisen-azul'
                        : 'bg-feisen-gris text-feisen-gris-oscuro border-gray-200 hover:border-feisen-azul'}`}>
                    {b.nombre}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Cantidad */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-base font-bold text-feisen-gris-oscuro mb-3">3. ¿Cuánto sale?</label>
              <input required type="number" min="0.001" step="any" value={form.cantidad}
                onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))}
                placeholder="0"
                className="w-full border border-gray-300 rounded-xl px-4 py-4 text-2xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-feisen-rojo" />
            </div>

            {/* 4. Centro de costo */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-base font-bold text-feisen-gris-oscuro mb-3">4. ¿Para qué línea?</label>
              <div className="grid grid-cols-1 gap-2">
                {CENTROS_COSTO.map(cc => (
                  <button key={cc} type="button"
                    onClick={() => setForm(f => ({ ...f, centro_costo: cc }))}
                    className={`py-3 px-4 rounded-xl text-left font-medium text-sm border transition-colors
                      ${form.centro_costo === cc
                        ? 'bg-feisen-azul text-white border-feisen-azul'
                        : 'bg-feisen-gris text-feisen-gris-oscuro border-gray-200 hover:border-feisen-azul'}`}>
                    {cc}
                  </button>
                ))}
              </div>
            </div>

            {error && <Alerta tipo="error" mensaje={error} />}

            <button type="submit" disabled={guardando}
              className="w-full bg-feisen-rojo text-white rounded-2xl py-5 text-xl font-bold shadow-lg hover:opacity-90 transition-opacity disabled:opacity-60">
              {guardando ? 'Registrando...' : '✓ Confirmar salida'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
