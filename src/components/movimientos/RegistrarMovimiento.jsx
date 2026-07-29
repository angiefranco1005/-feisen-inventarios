import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { CheckCircle, Search } from 'lucide-react'
import Alerta from '../shared/Alerta'
import Spinner from '../shared/Spinner'

const TIPOS = {
  ADMIN:     ['entrada', 'salida'],
  LOGISTICA: ['entrada', 'salida'],
}

const TIPO_LABEL = { entrada: 'Entrada', salida: 'Salida' }
const DESTINOS   = ['Producción y ensamble', 'Venta externa', 'Otro']

export default function RegistrarMovimiento() {
  const { perfil, esAdmin } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tipoInicial = searchParams.get('tipo') || ''

  const tiposDisponibles = TIPOS[perfil?.rol] || []

  const [bodegas,       setBodegas]       = useState([])
  const [items,         setItems]         = useState([])
  const [itemsFiltrados,setItemsFiltrados]= useState([])
  const [busqueda,      setBusqueda]      = useState('')
  const [mostrarLista,  setMostrarLista]  = useState(false)
  const [cargando,      setCargando]      = useState(true)
  const [guardando,     setGuardando]     = useState(false)
  const [exito,         setExito]         = useState(false)
  const [error,         setError]         = useState('')

  const [form, setForm] = useState({
    tipo:         tiposDisponibles.includes(tipoInicial) ? tipoInicial : (tiposDisponibles[0] || 'entrada'),
    item_id:      '',
    item_nombre:  '',
    cantidad:     '',
    bodega_id:    '',
    destino:      '',
    referencia:   '',
    numero_of:    '',
    serial_motor: '',
  })

  useEffect(() => {
    async function cargar() {
      const [{ data: bods }, { data: its }] = await Promise.all([
        supabase.from('bodegas').select('*').eq('activo', true).order('nombre'),
        supabase.from('items').select('id, nombre, unidad_medida, bodega_id, precio_costo').eq('activo', true).order('nombre'),
      ])
      setBodegas(bods || [])
      setItems(its || [])
      setItemsFiltrados(its || [])
      // Pre-seleccionar bodega si solo hay una
      if (bods?.length === 1) setForm(f => ({ ...f, bodega_id: bods[0].id }))
      setCargando(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    setItemsFiltrados(
      busqueda.trim()
        ? items.filter(i => i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
        : items
    )
  }, [busqueda, items])

  function seleccionarItem(item) {
    setForm(f => ({ ...f, item_id: item.id, item_nombre: item.nombre, bodega_id: item.bodega_id || f.bodega_id }))
    setBusqueda(item.nombre)
    setMostrarLista(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setGuardando(true)

    if (!form.item_id)  { setError('Selecciona un producto.'); setGuardando(false); return }
    if (!form.bodega_id){ setError('Selecciona una bodega.'); setGuardando(false); return }
    const cantidad = parseFloat(form.cantidad)
    if (!cantidad || cantidad <= 0) { setError('La cantidad debe ser mayor a cero.'); setGuardando(false); return }
    if (form.tipo === 'salida' && !form.destino) { setError('Selecciona el destino.'); setGuardando(false); return }

    const item = items.find(i => i.id === form.item_id)
    const payload = {
      tipo:                   form.tipo,
      item_id:                form.item_id,
      bodega_origen_id:       form.tipo === 'salida'  ? form.bodega_id : null,
      bodega_destino_id:      form.tipo === 'entrada' ? form.bodega_id : null,
      cantidad,
      precio_costo_snapshot:  item?.precio_costo || 0,
      centro_costo:           bodegas.find(b => b.id === form.bodega_id)?.nombre || '',
      destino:                form.tipo === 'salida' ? form.destino : null,
      usuario_id:             perfil.id,
      referencia:             form.referencia   || null,
      numero_of:              form.numero_of    || null,
      serial_motor:           form.serial_motor || null,
      motivo: null, proveedor: null, cliente: null,
    }

    const { error: err } = await supabase.from('movimientos').insert(payload)
    setGuardando(false)
    if (err) { setError('Error: ' + err.message); return }
    setExito(true)
    setTimeout(() => {
      setExito(false)
      setForm(f => ({ ...f, item_id: '', item_nombre: '', cantidad: '', referencia: '', numero_of: '', serial_motor: '', destino: '' }))
      setBusqueda('')
    }, 2500)
  }

  if (cargando) return <Spinner texto="Cargando formulario..." />

  if (exito) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <CheckCircle size={64} className="text-green-500 mb-4" />
      <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Movimiento registrado!</h2>
      <p className="text-gray-500">El inventario fue actualizado.</p>
    </div>
  )

  const esEntrada = form.tipo === 'entrada'
  const titulo    = esAdmin ? 'Registrar movimiento' : (esEntrada ? 'Registro de entrada' : 'Registro de salida')

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-feisen-azul mb-6">{titulo}</h1>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Tipo */}
        {tiposDisponibles.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de movimiento *</label>
            <div className="grid grid-cols-2 gap-2">
              {tiposDisponibles.map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tipo: t, destino: '' }))}
                  className={`px-3 py-3 rounded-xl text-sm font-semibold border transition-colors
                    ${form.tipo === t ? 'bg-feisen-azul text-white border-feisen-azul' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Producto */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">Producto *</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
            <input value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setMostrarLista(true); setForm(f => ({ ...f, item_id: '' })) }}
              onFocus={() => setMostrarLista(true)}
              placeholder="Escribe para buscar..."
              className="w-full border border-gray-300 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
          {mostrarLista && itemsFiltrados.length > 0 && (
            <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
              {itemsFiltrados.slice(0, 20).map(item => (
                <button key={item.id} type="button" onClick={() => seleccionarItem(item)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm border-b last:border-0 flex justify-between items-center">
                  <span className="font-medium text-gray-800">{item.nombre}</span>
                  <span className="text-xs text-gray-400">{item.unidad_medida}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bodega */}
        {bodegas.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bodega *</label>
            <select required value={form.bodega_id} onChange={e => setForm(f => ({ ...f, bodega_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
              <option value="">Selecciona bodega</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
        )}
        {bodegas.length === 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bodega</label>
            <div className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 text-gray-700 font-medium">
              {bodegas[0].nombre}
            </div>
          </div>
        )}

        {/* Destino (solo salidas) */}
        {form.tipo === 'salida' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Destino *</label>
            <div className="grid grid-cols-1 gap-2">
              {DESTINOS.map(d => (
                <button key={d} type="button" onClick={() => setForm(f => ({ ...f, destino: d }))}
                  className={`px-4 py-3 rounded-xl text-sm font-medium border text-left transition-colors
                    ${form.destino === d ? 'bg-feisen-azul text-white border-feisen-azul' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cantidad */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad *</label>
          <input required type="number" min="0.001" step="0.001" value={form.cantidad}
            onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))}
            placeholder="0"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>

        {/* N° OF */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">N° Orden de Fabricación (opcional)</label>
          <input value={form.numero_of} onChange={e => setForm(f => ({ ...f, numero_of: e.target.value }))}
            placeholder="Ej: 8465"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>

        {/* Serial motor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Serial del motor (opcional)</label>
          <input value={form.serial_motor} onChange={e => setForm(f => ({ ...f, serial_motor: e.target.value }))}
            placeholder="Ej: 215325060196"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>

        {/* Referencia */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Referencia / Observación (opcional)</label>
          <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
            placeholder="Ej: Factura 001"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>

        {error && <Alerta tipo="error" mensaje={error} />}

        <button type="submit" disabled={guardando}
          className="w-full bg-feisen-azul text-white rounded-2xl py-4 text-base font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
          {guardando ? 'Registrando...' : esEntrada ? 'Registrar entrada' : 'Registrar salida'}
        </button>
      </form>
    </div>
  )
}
