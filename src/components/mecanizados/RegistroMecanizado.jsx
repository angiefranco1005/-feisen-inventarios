import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Wrench, Plus, Trash2, CheckCircle, AlertTriangle, ChevronDown } from 'lucide-react'
import Spinner from '../shared/Spinner'

const BODEGA_MECANIZADOS      = '03a709ac-0bee-457a-80a1-0a1603218d34'
const CAT_PRODUCTO_MECANIZADO = 'bff5d482-1647-426c-a88f-dedd72ff5b06'
const CATEGORIAS_MECANIZABLES = new Set([
  'cfa47941-3a0e-4fc8-a9c5-6a676bbb5c50', // FERRETERIA - MECANIZADOS
  '549c8036-364a-433b-b18f-d4a444c9f9a2', // ACEROS
  'a735b04a-9bd7-424b-b695-1ac8ce1a5bf4', // FUNDICIÓN - MECANIZADOS
])

function hoyISO() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

export default function RegistroMecanizado() {
  // Catálogo de materia prima disponible
  const [catalogo, setCatalogo]   = useState([])
  const [cargando, setCargando]   = useState(true)

  // Cabecera del registro
  const [fecha, setFecha]         = useState(hoyISO())
  const [operario, setOperario]   = useState('')

  // Línea en construcción
  const [selItem, setSelItem]     = useState('')   // id del item
  const [cantidad, setCantidad]   = useState('')

  // Líneas ya agregadas
  const [lineas, setLineas]       = useState([])

  // Estado de envío
  const [enviando, setEnviando]   = useState(false)
  const [alerta, setAlerta]       = useState(null) // { tipo, msg }

  /* ── Cargar catálogo ─────────────────────────────────────── */
  const cargarCatalogo = useCallback(async () => {
    setCargando(true)
    try {
      const { data: rawItems, error } = await supabase
        .from('items')
        .select('id, nombre, unidad, cantidad_inicial, categoria_id')
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
        stock: Math.max(0, (i.cantidad_inicial || 0) + (neto[i.id] || 0)),
      })))
    } catch (e) {
      setAlerta({ tipo: 'error', msg: 'Error cargando productos: ' + e.message })
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargarCatalogo() }, [cargarCatalogo])

  /* ── Stock real = catálogo − lo que ya agregué en líneas ─── */
  const stockDisponible = (itemId) => {
    const base = catalogo.find(i => i.id === itemId)?.stock ?? 0
    const usado = lineas.filter(l => l.itemId === itemId).reduce((s, l) => s + l.cantidad, 0)
    return Math.max(0, base - usado)
  }

  /* ── Agregar línea ───────────────────────────────────────── */
  const agregarLinea = () => {
    setAlerta(null)
    if (!selItem) { setAlerta({ tipo: 'error', msg: 'Selecciona un producto.' }); return }
    const cant = parseFloat(cantidad)
    if (!cant || cant <= 0) { setAlerta({ tipo: 'error', msg: 'Ingresa una cantidad válida.' }); return }
    const disp = stockDisponible(selItem)
    if (cant > disp) { setAlerta({ tipo: 'error', msg: `Stock insuficiente. Disponible: ${disp}` }); return }

    const item = catalogo.find(i => i.id === selItem)
    setLineas(prev => [...prev, { itemId: item.id, nombre: item.nombre, unidad: item.unidad, cantidad: cant }])
    setSelItem('')
    setCantidad('')
  }

  const eliminarLinea = (idx) => setLineas(prev => prev.filter((_, i) => i !== idx))

  /* ── Confirmar registro ──────────────────────────────────── */
  const confirmar = async () => {
    setAlerta(null)
    if (!operario.trim()) { setAlerta({ tipo: 'error', msg: 'Ingresa el nombre del operario.' }); return }
    if (!fecha) { setAlerta({ tipo: 'error', msg: 'Selecciona la fecha.' }); return }
    if (!lineas.length) { setAlerta({ tipo: 'error', msg: 'Agrega al menos un producto.' }); return }

    setEnviando(true)
    try {
      // Resolver ítems destino en paralelo
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
        if (!data?.length) throw new Error(`No se encontró "${nombreDest}" en PRODUCTO MECANIZADO.`)
        return data[0].id
      }))

      const fechaISO  = new Date(fecha + 'T12:00:00').toISOString()
      const motivo    = `Mecanizado por: ${operario.trim()}`
      const movs      = []

      lineas.forEach((l, i) => {
        const base = {
          bodega_origen_id:      BODEGA_MECANIZADOS,
          precio_costo_snapshot: 0,
          motivo,
          fecha_movimiento:      fechaISO,
          centro_costo:          'Construequipos',
        }
        movs.push({ ...base, item_id: l.itemId,    tipo: 'salida',  cantidad: l.cantidad })
        movs.push({ ...base, item_id: destinos[i], tipo: 'entrada', cantidad: l.cantidad })
      })

      const { error } = await supabase.from('movimientos').insert(movs)
      if (error) throw error

      setAlerta({ tipo: 'ok', msg: `✓ Registro guardado: ${lineas.length} producto(s) mecanizados por ${operario.trim()}.` })
      setLineas([])
      setOperario('')
      setFecha(hoyISO())
      await cargarCatalogo()
    } catch (e) {
      setAlerta({ tipo: 'error', msg: e.message })
    } finally {
      setEnviando(false)
    }
  }

  const itemSeleccionado = catalogo.find(i => i.id === selItem)

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">

      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#064794' }}>
          <Wrench className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Registro de mecanizado</h1>
          <p className="text-sm text-gray-500">Registra la transformación de materia prima</p>
        </div>
      </div>

      {/* ── SECCIÓN 1: Cabecera del registro ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Información del turno</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Operario <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={operario}
              onChange={e => setOperario(e.target.value)}
              placeholder="Nombre del operario"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* ── SECCIÓN 2: Agregar líneas ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Agregar productos</h2>

        {cargando ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : (
          <div className="space-y-3">
            {/* Selector de producto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Producto (materia prima)</label>
              <div className="relative">
                <select
                  value={selItem}
                  onChange={e => { setSelItem(e.target.value); setCantidad('') }}
                  className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white pr-9"
                >
                  <option value="">-- Selecciona un producto --</option>
                  {catalogo.map(i => (
                    <option key={i.id} value={i.id} disabled={stockDisponible(i.id) === 0}>
                      {i.nombre} — Stock: {stockDisponible(i.id)} {i.unidad}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Cantidad */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={selItem ? stockDisponible(selItem) : undefined}
                  value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  placeholder={selItem ? `Máx. ${stockDisponible(selItem)} ${itemSeleccionado?.unidad ?? ''}` : 'Selecciona un producto primero'}
                  disabled={!selItem}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <button
                  onClick={agregarLinea}
                  disabled={!selItem || !cantidad}
                  className="px-4 py-2.5 rounded-lg text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-40"
                  style={{ backgroundColor: '#064794' }}
                >
                  <Plus className="w-4 h-4" /> Agregar
                </button>
              </div>
            </div>

            {/* Info destino */}
            {selItem && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                → Producto destino: <strong>{itemSeleccionado?.nombre} - MECANIZADO</strong>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── SECCIÓN 3: Líneas agregadas ── */}
      {lineas.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Productos a mecanizar <span className="ml-1 text-blue-600">({lineas.length})</span>
          </h2>

          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{l.nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">→ {l.nombre} - MECANIZADO</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-blue-700">{l.cantidad} {l.unidad}</span>
                  <button onClick={() => eliminarLinea(i)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerta */}
      {alerta && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
          alerta.tipo === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
        }`}>
          {alerta.tipo === 'ok'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          }
          <span>{alerta.msg}</span>
        </div>
      )}

      {/* Botón confirmar */}
      <button
        onClick={confirmar}
        disabled={enviando || !lineas.length || !operario.trim() || !fecha}
        className="w-full py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#B4271D' }}
      >
        {enviando ? <Spinner className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
        {enviando ? 'Guardando...' : `Confirmar registro${lineas.length ? ` (${lineas.length} producto${lineas.length > 1 ? 's' : ''})` : ''}`}
      </button>

    </div>
  )
}
