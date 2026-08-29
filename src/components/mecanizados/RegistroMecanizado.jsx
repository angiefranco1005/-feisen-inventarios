import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Wrench, Plus, Minus, Trash2, CheckCircle, AlertTriangle, Search, Check } from 'lucide-react'
import Spinner from '../shared/Spinner'

const BODEGA_MECANIZADOS      = '03a709ac-0bee-457a-80a1-0a1603218d34'
const CAT_PRODUCTO_MECANIZADO = 'bff5d482-1647-426c-a88f-dedd72ff5b06'
const CATEGORIAS_MECANIZABLES = new Set([
  'cfa47941-3a0e-4fc8-a9c5-6a676bbb5c50',
  '549c8036-364a-433b-b18f-d4a444c9f9a2',
  'a735b04a-9bd7-424b-b695-1ac8ce1a5bf4',
])

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function RegistroMecanizado() {
  const { perfil, session } = useAuth()
  const [catalogo, setCatalogo] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const [fecha, setFecha]       = useState(hoyISO())
  const [operario, setOperario] = useState('')

  // Producto seleccionado para agregar
  const [selItem, setSelItem]   = useState(null)  // objeto item completo
  const [cantidad, setCantidad] = useState(1)

  const [lineas, setLineas]     = useState([])
  const [enviando, setEnviando] = useState(false)
  const [alerta, setAlerta]     = useState(null)

  /* ─── Cargar catálogo ─── */
  const cargarCatalogo = useCallback(async () => {
    setCargando(true)
    try {
      const { data: rawItems, error } = await supabase
        .from('items')
        .select('id, nombre, unidad_medida, categoria_id')
        .eq('bodega_id', BODEGA_MECANIZADOS)
        .eq('activo', true)
        .order('nombre')

      if (error) throw error

      const mecanizables = rawItems.filter(i => CATEGORIAS_MECANIZABLES.has(i.categoria_id))
      if (!mecanizables.length) { setCatalogo([]); return }

      const ids = mecanizables.map(i => i.id)
      const { data: movs, error: eM } = await supabase
        .from('movimientos')
        .select('item_id, tipo, cantidad')
        .in('item_id', ids)

      if (eM) throw eM

      const neto = {}
      for (const m of movs) {
        neto[m.item_id] = (neto[m.item_id] || 0) + (m.tipo === 'entrada' ? m.cantidad : -m.cantidad)
      }

      setCatalogo(mecanizables.map(i => ({
        ...i,
        unidad: i.unidad_medida || 'und',
        stock: Math.max(0, neto[i.id] || 0),
      })))
    } catch (e) {
      setAlerta({ tipo: 'error', msg: 'Error cargando productos: ' + e.message })
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargarCatalogo() }, [cargarCatalogo])

  const stockDisponible = (itemId) => {
    const base = catalogo.find(i => i.id === itemId)?.stock ?? 0
    const usado = lineas.filter(l => l.itemId === itemId).reduce((s, l) => s + l.cantidad, 0)
    return Math.max(0, base - usado)
  }

  /* ─── Seleccionar producto ─── */
  const seleccionar = (item) => {
    if (stockDisponible(item.id) === 0) return
    setSelItem(item)
    setCantidad(1)
    setAlerta(null)
  }

  /* ─── Agregar línea ─── */
  const agregarLinea = () => {
    setAlerta(null)
    if (!selItem) return
    const cant = Number(cantidad)
    if (!cant || cant <= 0) { setAlerta({ tipo: 'error', msg: 'La cantidad debe ser mayor a 0.' }); return }
    const disp = stockDisponible(selItem.id)
    if (cant > disp) { setAlerta({ tipo: 'error', msg: `Solo hay ${disp} ${selItem.unidad} disponibles.` }); return }

    setLineas(prev => [...prev, { itemId: selItem.id, nombre: selItem.nombre, unidad: selItem.unidad, cantidad: cant }])
    setSelItem(null)
    setCantidad(1)
  }

  const eliminarLinea = (idx) => setLineas(prev => prev.filter((_, i) => i !== idx))

  /* ─── Confirmar ─── */
  const confirmar = async () => {
    setAlerta(null)
    const usuarioId = perfil?.id || session?.user?.id
    if (!usuarioId)        { setAlerta({ tipo: 'error', msg: 'Sesión no cargada. Recarga la página.' }); return }
    if (!operario.trim())  { setAlerta({ tipo: 'error', msg: 'Escribe el nombre del operario.' }); return }
    if (!fecha)            { setAlerta({ tipo: 'error', msg: 'Selecciona la fecha.' }); return }
    if (!lineas.length)    { setAlerta({ tipo: 'error', msg: 'Agrega al menos un producto.' }); return }

    setEnviando(true)
    try {
      const destinos = await Promise.all(lineas.map(async (l) => {
        const nombreDest = l.nombre.trim() + ' - MECANIZADO'
        const { data, error } = await supabase
          .from('items')
          .select('id')
          .eq('categoria_id', CAT_PRODUCTO_MECANIZADO)
          .ilike('nombre', nombreDest)
          .eq('activo', true)
          .limit(1)
        if (error) throw error
        if (!data?.length) throw new Error(`No se encontró "${nombreDest}".`)
        return data[0].id
      }))

      const motivo = `Mecanizado por: ${operario.trim()}`
      const movs   = []
      lineas.forEach((l, i) => {
        const base = { bodega_origen_id: BODEGA_MECANIZADOS, precio_costo_snapshot: 0, motivo, fecha_movimiento: fecha, centro_costo: 'MECANIZADOS', usuario_id: usuarioId }
        movs.push({ ...base, item_id: l.itemId,    tipo: 'salida',  cantidad: l.cantidad })
        movs.push({ ...base, item_id: destinos[i], tipo: 'entrada', cantidad: l.cantidad })
      })

      const { error } = await supabase.from('movimientos').insert(movs)
      if (error) throw error

      setAlerta({ tipo: 'ok', msg: `✓ Guardado. ${lineas.length} producto(s) mecanizados por ${operario.trim()}.` })
      setLineas([])
      setOperario('')
      setFecha(hoyISO())
      setSelItem(null)
      await cargarCatalogo()
    } catch (e) {
      setAlerta({ tipo: 'error', msg: e.message })
    } finally {
      setEnviando(false)
    }
  }

  const filtrados = catalogo.filter(i =>
    i.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 pb-10">

      {/* ── Título ── */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#064794' }}>
          <Wrench className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Registro de mecanizado</h1>
      </div>

      {/* ── PASO 1: Fecha y operario ── */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-5 space-y-4">
        <p className="text-lg font-bold text-gray-800">① Fecha y operario</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-base font-semibold text-gray-700 mb-2">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-base font-semibold text-gray-700 mb-2">Operario</label>
            <input
              type="text"
              value={operario}
              onChange={e => setOperario(e.target.value)}
              placeholder="Nombre del operario"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* ── PASO 2: Seleccionar producto ── */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-5 space-y-4">
        <p className="text-lg font-bold text-gray-800">② Selecciona un producto</p>

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl text-lg focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Tarjetas de productos */}
        {cargando ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : filtrados.length === 0 ? (
          <p className="text-center text-gray-400 text-lg py-8">Sin productos disponibles.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
            {filtrados.map(item => {
              const disp    = stockDisponible(item.id)
              const agotado = disp === 0
              const activo  = selItem?.id === item.id

              return (
                <button
                  key={item.id}
                  onClick={() => seleccionar(item)}
                  disabled={agotado}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    activo
                      ? 'border-blue-500 bg-blue-50'
                      : agotado
                        ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                        : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow-sm'
                  }`}
                >
                  <p className={`font-bold leading-snug ${activo ? 'text-blue-800' : 'text-gray-900'}`}
                    style={{ fontSize: '1rem' }}>
                    {item.nombre}
                  </p>
                  <p className={`mt-1 text-base font-semibold ${disp > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    Stock: {disp} {item.unidad}
                  </p>
                  {activo && (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-blue-600">
                      <Check className="w-3 h-3" /> Seleccionado
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Panel de cantidad (solo si hay producto seleccionado) */}
        {selItem && (
          <div className="mt-2 bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 space-y-4">
            <p className="text-base font-semibold text-blue-900">
              Cantidad de <strong>{selItem.nombre}</strong> a mecanizar
            </p>

            {/* Botones +/− */}
            <div className="flex items-center gap-4 justify-center">
              <button
                onClick={() => setCantidad(c => Math.max(1, Number(c) - 1))}
                className="w-14 h-14 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-gray-700 hover:border-blue-400 active:bg-gray-100 shadow-sm"
              >
                <Minus className="w-6 h-6" />
              </button>

              <input
                type="number"
                min="1"
                max={stockDisponible(selItem.id)}
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                className="w-28 text-center text-4xl font-bold text-gray-900 border-2 border-gray-200 rounded-xl py-2 focus:outline-none focus:border-blue-500 bg-white"
              />

              <button
                onClick={() => setCantidad(c => Math.min(stockDisponible(selItem.id), Number(c) + 1))}
                className="w-14 h-14 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-gray-700 hover:border-blue-400 active:bg-gray-100 shadow-sm"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>

            <p className="text-center text-gray-500 text-sm">
              Disponible: {stockDisponible(selItem.id)} {selItem.unidad}
            </p>

            <button
              onClick={agregarLinea}
              className="w-full py-4 rounded-xl text-white text-lg font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: '#064794' }}
            >
              <Plus className="w-5 h-5" /> Agregar al registro
            </button>
          </div>
        )}
      </div>

      {/* ── PASO 3: Productos agregados ── */}
      {lineas.length > 0 && (
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-5 space-y-3">
          <p className="text-lg font-bold text-gray-800">
            ③ Productos para mecanizar
            <span className="ml-2 text-base font-semibold text-blue-600">({lineas.length})</span>
          </p>

          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-gray-900 truncate">{l.nombre}</p>
                  <p className="text-sm text-gray-400 mt-0.5">→ {l.nombre} - MECANIZADO</p>
                </div>
                <div className="flex items-center gap-4 ml-3">
                  <span className="text-xl font-bold text-blue-700 whitespace-nowrap">
                    {l.cantidad} {l.unidad}
                  </span>
                  <button
                    onClick={() => eliminarLinea(i)}
                    className="w-10 h-10 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-gray-400 hover:border-red-400 hover:text-red-500"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Alerta ── */}
      {alerta && (
        <div className={`flex items-start gap-3 rounded-xl px-5 py-4 text-base ${
          alerta.tipo === 'ok' ? 'bg-green-50 text-green-800 border-2 border-green-200' : 'bg-red-50 text-red-700 border-2 border-red-200'
        }`}>
          {alerta.tipo === 'ok'
            ? <CheckCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
            : <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" />
          }
          <span className="font-medium">{alerta.msg}</span>
        </div>
      )}

      {/* ── Botón confirmar ── */}
      <button
        onClick={confirmar}
        disabled={enviando || !lineas.length || !operario.trim() || !fecha}
        className="w-full py-5 rounded-2xl text-white text-xl font-bold flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        style={{ backgroundColor: '#B4271D' }}
      >
        {enviando
          ? <><Spinner className="w-6 h-6" /> Guardando...</>
          : <><Wrench className="w-6 h-6" /> Confirmar registro {lineas.length > 0 && `(${lineas.length} producto${lineas.length > 1 ? 's' : ''})`}</>
        }
      </button>

    </div>
  )
}
