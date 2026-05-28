import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { CENTROS_COSTO, TIPOS_MOVIMIENTO } from '../../utils/formatters'
import Alerta from '../shared/Alerta'
import Spinner from '../shared/Spinner'
import { CheckCircle, Search } from 'lucide-react'

// Tipos de movimiento permitidos por rol
const TIPOS_POR_ROL = {
  ADMIN:     ['entrada', 'salida'],
  BODEGUERO: ['entrada', 'salida'],
  JEFE_AREA: ['entrada', 'salida'],
  OPERARIO:  ['salida'],
}

export default function RegistrarMovimiento() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tipoInicial = searchParams.get('tipo') || ''

  const [bodegas, setBodegas] = useState([])
  const [items, setItems] = useState([])
  const [itemsFiltrados, setItemsFiltrados] = useState([])
  const [busquedaItem, setBusquedaItem] = useState('')
  const [mostrarLista, setMostrarLista] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  const [error, setError] = useState('')

  const tiposDisponibles = TIPOS_POR_ROL[perfil?.rol] || []
  const esAdmin = perfil?.rol === 'ADMIN'
  const almacenFijo = !esAdmin ? (perfil?.almacen || '') : ''

  const [form, setForm] = useState({
    tipo: tiposDisponibles.includes(tipoInicial) ? tipoInicial : (tiposDisponibles[0] || ''),
    item_id: '',
    item_nombre: '',
    cantidad: '',
    centro_costo: esAdmin ? 'Almacén' : almacenFijo,
    destino: '',
    referencia: '',
  })

  useEffect(() => {
    async function cargar() {
      const [{ data: bod }, { data: it }] = await Promise.all([
        supabase.from('bodegas').select('*').eq('activo', true).order('nombre'),
        supabase.from('items').select('id, nombre, unidad_medida, centro_costo, precio_costo').eq('activo', true).order('nombre')
      ])
      setBodegas(bod || [])
      setItems(it || [])
      setItemsFiltrados(it || [])
      setCargando(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (busquedaItem.length === 0) {
      setItemsFiltrados(items)
    } else {
      setItemsFiltrados(items.filter(i => i.nombre.toLowerCase().includes(busquedaItem.toLowerCase())))
    }
  }, [busquedaItem, items])

  function seleccionarItem(item) {
    setForm(f => ({
      ...f,
      item_id: item.id,
      item_nombre: item.nombre,
      centro_costo: item.centro_costo || f.centro_costo
    }))
    setBusquedaItem(item.nombre)
    setMostrarLista(false)
  }

  function setTipo(tipo) {
    setForm(f => ({ ...f, tipo, bodega_origen_id: '', bodega_destino_id: '' }))
  }

  const DESTINOS_SALIDA = ['Producción y ensamble', 'Venta externa']

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setGuardando(true)

    if (!form.item_id) { setError('Debes seleccionar un producto.'); setGuardando(false); return }

    const cantidad = parseFloat(form.cantidad)
    if (!cantidad || cantidad <= 0) { setError('La cantidad debe ser mayor a cero.'); setGuardando(false); return }

    // Obtener precio_costo snapshot del ítem seleccionado
    const item = items.find(i => i.id === form.item_id)

    if (form.tipo === 'salida' && !form.destino) {
      setError('Debes seleccionar el destino de la salida.'); setGuardando(false); return
    }

    const payload = {
      tipo: form.tipo,
      item_id: form.item_id,
      bodega_origen_id: null,
      bodega_destino_id: null,
      cantidad,
      precio_costo_snapshot: item?.precio_costo || 0,
      centro_costo: form.centro_costo,
      destino: form.tipo === 'salida' ? form.destino : null,
      usuario_id: perfil.id,
      referencia: form.referencia || null,
      motivo: null,
      proveedor: null,
      cliente: null,
    }

    const { error: err } = await supabase.from('movimientos').insert(payload)
    setGuardando(false)
    if (err) { setError('Error al registrar: ' + err.message); return }
    setExito(true)
    setTimeout(() => {
      setExito(false)
      setForm(f => ({ ...f, item_id: '', item_nombre: '', cantidad: '', referencia: '', motivo: '', proveedor: '', cliente: '' }))
      setBusquedaItem('')
    }, 2500)
  }

  if (cargando) return <Spinner texto="Cargando formulario..." />

  if (!esAdmin && !almacenFijo) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center p-8 bg-white rounded-2xl shadow-sm">
        <div className="text-amber-500 text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-feisen-gris-oscuro mb-2">Sin almacén asignado</h2>
        <p className="text-feisen-gris-medio text-sm">No puedes registrar movimientos hasta que el administrador te asigne un almacén.</p>
      </div>
    )
  }

  if (exito) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <CheckCircle size={64} className="text-emerald-500 mb-4" />
        <h2 className="text-2xl font-bold text-feisen-gris-oscuro mb-2">¡Movimiento registrado!</h2>
        <p className="text-feisen-gris-medio">El inventario fue actualizado correctamente.</p>
      </div>
    )
  }

  const Label = ({ children }) => (
    <label className="block text-sm font-medium text-feisen-gris-oscuro mb-1">{children}</label>
  )
  const Input = ({ ...props }) => (
    <input {...props}
      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
  )
  const Select = ({ children, ...props }) => (
    <select {...props}
      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
      {children}
    </select>
  )

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-feisen-azul mb-6">Registrar movimiento</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Tipo de movimiento */}
        {tiposDisponibles.length > 1 && (
          <div>
            <Label>Tipo de movimiento *</Label>
            <div className="grid grid-cols-2 gap-2">
              {tiposDisponibles.map(t => (
                <button key={t} type="button" onClick={() => setTipo(t)}
                  className={`px-3 py-3 rounded-xl text-sm font-medium border transition-colors text-left
                    ${form.tipo === t ? 'bg-feisen-azul text-white border-feisen-azul' : 'bg-white text-feisen-gris-oscuro border-gray-300 hover:bg-feisen-gris'}`}>
                  {TIPOS_MOVIMIENTO[t]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Búsqueda de producto */}
        <div className="relative">
          <Label>Producto *</Label>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio z-10" />
            <input
              value={busquedaItem}
              onChange={e => { setBusquedaItem(e.target.value); setMostrarLista(true); setForm(f => ({ ...f, item_id: '' })) }}
              onFocus={() => setMostrarLista(true)}
              placeholder="Escribe para buscar el producto..."
              className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul"
            />
          </div>
          {mostrarLista && itemsFiltrados.length > 0 && (
            <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
              {itemsFiltrados.slice(0, 20).map(item => (
                <button key={item.id} type="button" onClick={() => seleccionarItem(item)}
                  className="w-full text-left px-4 py-3 hover:bg-feisen-gris transition-colors flex items-center gap-3 border-b last:border-0">
                  <div>
                    <p className="font-medium text-feisen-gris-oscuro text-sm">{item.nombre}</p>
                    <p className="text-xs text-feisen-gris-medio">{item.unidad_medida} · {item.centro_costo}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Destino (solo para salidas) */}
        {form.tipo === 'salida' && (
          <div>
            <Label>Destino *</Label>
            <div className="grid grid-cols-2 gap-2">
              {DESTINOS_SALIDA.map(d => (
                <button key={d} type="button" onClick={() => setForm(f => ({ ...f, destino: d }))}
                  className={`px-3 py-3 rounded-xl text-sm font-medium border transition-colors text-left
                    ${form.destino === d ? 'bg-feisen-azul text-white border-feisen-azul' : 'bg-white text-feisen-gris-oscuro border-gray-300 hover:bg-feisen-gris'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cantidad */}
        <div>
          <Label>Cantidad *</Label>
          <Input required type="number" min="0.001" step="0.001" value={form.cantidad}
            onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))}
            placeholder="0" />
        </div>

        {/* Almacén */}
        {esAdmin ? (
          <div>
            <Label>Almacén *</Label>
            <Select required value={form.centro_costo} onChange={e => setForm(f => ({ ...f, centro_costo: e.target.value }))}>
              {CENTROS_COSTO.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        ) : (
          <div>
            <Label>Almacén</Label>
            <div className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-feisen-gris text-feisen-gris-oscuro font-medium">
              {almacenFijo || <span className="text-amber-500 text-sm">Sin almacén asignado — contacta al administrador</span>}
            </div>
          </div>
        )}

        {/* Referencia opcional */}
        <div>
          <Label>Referencia / Orden (opcional)</Label>
          <Input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
            placeholder="Ej: OP-2026-001" />
        </div>

        {error && <Alerta tipo="error" mensaje={error} />}

        <button type="submit" disabled={guardando}
          className="w-full bg-feisen-azul text-white rounded-2xl py-4 text-lg font-bold hover:bg-feisen-azul-claro transition-colors disabled:opacity-60 mt-2">
          {guardando ? 'Registrando...' : 'Registrar movimiento'}
        </button>
      </form>
    </div>
  )
}
