import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Wrench, Search, ChevronRight, X, AlertTriangle, CheckCircle } from 'lucide-react'
import Spinner from '../shared/Spinner'

const BODEGA_MECANIZADOS      = '03a709ac-0bee-457a-80a1-0a1603218d34'
const CAT_PRODUCTO_MECANIZADO = 'bff5d482-1647-426c-a88f-dedd72ff5b06'
const CATEGORIAS_MECANIZABLES = new Set([
  'cfa47941-3a0e-4fc8-a9c5-6a676bbb5c50', // FERRETERIA - MECANIZADOS
  '549c8036-364a-433b-b18f-d4a444c9f9a2', // ACEROS
  'a735b04a-9bd7-424b-b695-1ac8ce1a5bf4', // FUNDICIÓN - MECANIZADOS
])

export default function RegistroMecanizado() {
  const [items, setItems]       = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal]       = useState(null)   // item seleccionado
  const [cantidad, setCantidad] = useState('')
  const [operario, setOperario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [alerta, setAlerta]     = useState(null)   // { tipo: 'ok'|'error', msg }

  const cargarItems = useCallback(async () => {
    setCargando(true)
    try {
      // Traer todos los ítems del bodega MECANIZADOS con sus categorías
      const { data: rawItems, error } = await supabase
        .from('items')
        .select('id, nombre, unidad, cantidad_inicial, categoria_id, categorias(nombre)')
        .eq('bodega_id', BODEGA_MECANIZADOS)
        .eq('activo', true)
        .order('nombre')

      if (error) throw error

      // Filtrar solo las categorías mecanizables
      const mecanizables = rawItems.filter(i => CATEGORIAS_MECANIZABLES.has(i.categoria_id))

      if (mecanizables.length === 0) {
        setItems([])
        return
      }

      // Calcular stock desde movimientos
      const ids = mecanizables.map(i => i.id)
      const { data: movs, error: eMovs } = await supabase
        .from('movimientos')
        .select('item_id, tipo, cantidad')
        .in('item_id', ids)

      if (eMovs) throw eMovs

      const neto = {}
      for (const m of movs) {
        if (!neto[m.item_id]) neto[m.item_id] = 0
        neto[m.item_id] += m.tipo === 'entrada' ? m.cantidad : -m.cantidad
      }

      const resultado = mecanizables.map(i => ({
        ...i,
        stock: Math.max(0, (i.cantidad_inicial || 0) + (neto[i.id] || 0)),
        categoria_nombre: i.categorias?.nombre || '',
      }))

      setItems(resultado)
    } catch (e) {
      setAlerta({ tipo: 'error', msg: 'Error cargando productos: ' + e.message })
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargarItems() }, [cargarItems])

  const abrirModal = (item) => {
    setModal(item)
    setCantidad('')
    setOperario('')
    setAlerta(null)
  }

  const cerrarModal = () => {
    if (enviando) return
    setModal(null)
    setAlerta(null)
  }

  const ejecutarMecanizado = async () => {
    const cant = parseFloat(cantidad)
    if (!cant || cant <= 0) {
      setAlerta({ tipo: 'error', msg: 'Ingresa una cantidad válida.' })
      return
    }
    if (cant > modal.stock) {
      setAlerta({ tipo: 'error', msg: `Stock insuficiente. Disponible: ${modal.stock} ${modal.unidad}` })
      return
    }
    if (!operario.trim()) {
      setAlerta({ tipo: 'error', msg: 'Ingresa el nombre del operario.' })
      return
    }

    setEnviando(true)
    setAlerta(null)

    try {
      // Buscar el ítem destino: mismo nombre + ' - MECANIZADO', categoría PRODUCTO MECANIZADO
      const nombreDestino = modal.nombre.trim() + ' - MECANIZADO'
      const { data: destinos, error: eDest } = await supabase
        .from('items')
        .select('id, nombre')
        .eq('categoria_id', CAT_PRODUCTO_MECANIZADO)
        .ilike('nombre', nombreDestino)
        .eq('activo', true)
        .limit(1)

      if (eDest) throw eDest
      if (!destinos || destinos.length === 0) {
        throw new Error(`No se encontró el producto destino "${nombreDestino}". Verifica que exista en PRODUCTO MECANIZADO.`)
      }

      const destino = destinos[0]
      const motivo  = `Mecanizado por: ${operario.trim()}`
      const ahora   = new Date().toISOString()

      // 1) Salida del ítem de materia prima
      const { error: eSal } = await supabase
        .from('movimientos')
        .insert({
          item_id:               modal.id,
          bodega_origen_id:      BODEGA_MECANIZADOS,
          tipo:                  'salida',
          cantidad:              cant,
          precio_costo_snapshot: 0,
          motivo,
          fecha_movimiento:      ahora,
          centro_costo:          'Construequipos',
        })

      if (eSal) throw eSal

      // 2) Entrada al ítem mecanizado
      const { error: eEnt } = await supabase
        .from('movimientos')
        .insert({
          item_id:               destino.id,
          bodega_origen_id:      BODEGA_MECANIZADOS,
          tipo:                  'entrada',
          cantidad:              cant,
          precio_costo_snapshot: 0,
          motivo,
          fecha_movimiento:      ahora,
          centro_costo:          'Construequipos',
        })

      if (eEnt) throw eEnt

      setAlerta({ tipo: 'ok', msg: `✓ ${cant} ${modal.unidad} de "${modal.nombre}" mecanizadas por ${operario.trim()}.` })
      await cargarItems()

      // Cerrar modal después de un momento
      setTimeout(() => {
        setModal(null)
        setAlerta(null)
      }, 2000)
    } catch (e) {
      setAlerta({ tipo: 'error', msg: e.message })
    } finally {
      setEnviando(false)
    }
  }

  const filtrados = items.filter(i =>
    i.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    i.categoria_nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#064794' }}>
          <Wrench className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Registro de mecanizado</h1>
          <p className="text-sm text-gray-500">Transforma materia prima en producto mecanizado</p>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar producto o categoría..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Lista */}
      {cargando ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{busqueda ? 'Sin resultados para tu búsqueda.' : 'No hay productos mecanizables en bodega.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(item => (
            <button
              key={item.id}
              onClick={() => abrirModal(item)}
              className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-sm transition-all text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{item.nombre}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.categoria_nombre}</p>
              </div>
              <div className="flex items-center gap-4 ml-4">
                <div className="text-right">
                  <p className={`text-sm font-semibold ${item.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {item.stock} {item.unidad}
                  </p>
                  <p className="text-xs text-gray-400">en stock</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            {/* Header modal */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-bold text-gray-900">Mecanizar producto</h2>
                <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{modal.nombre}</p>
              </div>
              <button onClick={cerrarModal} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Stock disponible */}
              <div className="bg-gray-50 rounded-lg px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-gray-600">Stock disponible</span>
                <span className={`font-bold ${modal.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {modal.stock} {modal.unidad}
                </span>
              </div>

              {/* Cantidad */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cantidad a mecanizar <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={modal.stock}
                  value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  placeholder={`Máx. ${modal.stock}`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {/* Operario */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del operario <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={operario}
                  onChange={e => setOperario(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Producto destino (informativo) */}
              <div className="bg-blue-50 rounded-lg px-4 py-3">
                <p className="text-xs text-blue-600 font-medium">Producto destino</p>
                <p className="text-sm text-blue-900 mt-0.5">{modal.nombre} - MECANIZADO</p>
              </div>

              {/* Alerta */}
              {alerta && (
                <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
                  alerta.tipo === 'ok'
                    ? 'bg-green-50 text-green-800'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {alerta.tipo === 'ok'
                    ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  }
                  <span>{alerta.msg}</span>
                </div>
              )}
            </div>

            {/* Footer modal */}
            <div className="flex gap-3 p-5 pt-0">
              <button
                onClick={cerrarModal}
                disabled={enviando}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarMecanizado}
                disabled={enviando || modal.stock === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#064794' }}
              >
                {enviando ? <Spinner className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                {enviando ? 'Registrando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
