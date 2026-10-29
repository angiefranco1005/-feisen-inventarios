import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { esBodegaFundicion, esBodegaMecanizados, BODEGA_ENSAMBLE_ID, nombreBodega } from '../../utils/bodegasCatalogo'
import { Plus, Trash2, Search, Check, Flame, ShoppingCart, Wrench, Factory, Settings, X, CalendarDays, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import Alerta from '../shared/Alerta'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import FirmaCanvas from '../shared/FirmaCanvas'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { coincideBusqueda } from '../../utils/busqueda'
import { EncabezadoPagina, ChipBodega, Segmentado, Contador, useAviso, useAtajoBuscar } from '../shared/ui'

const cant = n => Number(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
const claseInput = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'

// ── Piezas de la pantalla ───────────────────────────────────────────────────
function Bloque({ titulo, detalle, children }) {
  return (
    <section className="bg-white border border-feisen-borde rounded-xl p-4 space-y-3 min-w-0">
      {titulo && (
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">{titulo}</h2>
          {detalle && <span className="text-xs text-gray-400">{detalle}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

function Campo({ etiqueta, opcional, children }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <label className="block text-sm font-medium text-feisen-texto">
        {etiqueta} {opcional && <span className="font-normal text-gray-400">(opcional)</span>}
      </label>
      {children}
    </div>
  )
}

function BotonOpcion({ activo, onClick, children }) {
  return (
    <button type="button" aria-pressed={activo} onClick={onClick}
      className={`min-h-[48px] px-3 rounded-lg border text-sm font-semibold transition-colors active:scale-[.98]
        ${activo ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul' : 'border-feisen-borde bg-white text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
      {children}
    </button>
  )
}

// ── Productos del movimiento: buscador + una tarjeta por producto con − / + ──
// Búsqueda por palabras sueltas sin tildes (coincideBusqueda). La lista de resultados
// va en línea (no flotante) para que no quede tapada en tablet.
function ListaProductos({ items, lineas, setLineas, stockPorItem, esSalida, nombreBodega, extra }) {
  const [texto, setTexto] = useState('')
  const inputRef = useRef(null)
  useAtajoBuscar(inputRef)
  // Todos los que coinciden (antes solo 8); en salidas primero los que tienen existencias
  const coinciden = texto.trim() ? items.filter(i => coincideBusqueda(i.nombre, texto)) : []
  const resultados = esSalida ? [...coinciden].sort((a, b) => ((stockPorItem[b.id] ?? 0) > 0) - ((stockPorItem[a.id] ?? 0) > 0)) : coinciden
  const MAX = 200 // tope solo para no dibujar miles de filas

  function agregar(item) {
    setLineas(prev => prev.some(l => l.item_id === item.id)
      ? prev.map(l => l.item_id === item.id ? { ...l, cantidad: String((parseFloat(l.cantidad) || 0) + 1) } : l)
      : [...prev, { item_id: item.id, item_nombre: item.nombre, unidad: item.unidad_medida, cantidad: '1', peso_unitario: item.peso_unitario ?? null }])
    setTexto('')
    inputRef.current?.focus()
  }
  const cambiarCantidad = (id, v) => setLineas(prev => prev.map(l => l.item_id === id ? { ...l, cantidad: v.replace(',', '.') } : l))
  const quitar = id => setLineas(prev => prev.filter(l => l.item_id !== id))

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input ref={inputRef} type="search" value={texto} autoComplete="off"
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (resultados[0]) agregar(resultados[0]) }
            if (e.key === 'Escape') setTexto('')
          }}
          placeholder={esSalida ? 'Buscar producto: “tllo 3/8”, “rodamiento 62”…' : 'Buscar el producto que llegó…'}
          aria-label="Buscar producto"
          className="w-full border border-feisen-borde rounded-lg pl-10 pr-3 py-2.5 bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
      </div>

      {texto.trim() && (
        <div className="border border-feisen-borde rounded-lg overflow-y-auto overscroll-contain max-h-[26rem] divide-y divide-feisen-borde-suave">
          {resultados.length > 0 && (
            <p className="sticky top-0 z-10 px-3 py-1.5 text-xs text-feisen-texto-2 bg-feisen-fondo">
              {resultados.length.toLocaleString('es-CO')} {resultados.length === 1 ? 'producto' : 'productos'}{resultados.length > 6 ? ' · desliza para ver todos' : ''}
            </p>
          )}
          {resultados.length === 0 && (
            <p className="px-3 py-3 text-sm text-feisen-texto-2">
              Ningún producto de {nombreBodega || 'la bodega'} tiene “{texto.trim()}” en el nombre. Prueba con una sola palabra.
            </p>
          )}
          {resultados.slice(0, MAX).map(i => {
            const ya = lineas.some(l => l.item_id === i.id)
            const hay = stockPorItem[i.id] ?? 0
            return (
              <button key={i.id} type="button" onClick={() => agregar(i)}
                className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[52px] text-left bg-white hover:bg-feisen-fondo">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-feisen-texto break-words">{i.nombre}</span>
                  <span className={`block text-xs tabular-nums ${esSalida && hay <= 0 ? 'text-feisen-rojo' : 'text-feisen-texto-2'}`}>
                    {esSalida ? (hay > 0 ? `Disponible ${cant(hay)} ${i.unidad_medida}` : 'Sin stock') : `Hay ${cant(hay)} ${i.unidad_medida}`}
                  </span>
                </span>
                <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 text-sm font-semibold ${ya ? 'bg-feisen-fondo text-feisen-texto-2' : 'bg-feisen-azul-suave text-feisen-azul'}`}>
                  {ya ? '+1' : <Plus size={16} />}
                </span>
              </button>
            )
          })}
          {resultados.length > MAX && (
            <p className="px-3 py-2 text-xs text-gray-400 bg-white">Se muestran {MAX} de {resultados.length}. Escribe otra palabra para afinar.</p>
          )}
        </div>
      )}

      {lineas.length === 0 ? (
        <p className="border border-dashed border-feisen-borde rounded-lg px-4 py-5 text-center text-sm text-feisen-texto-2">
          {esSalida ? 'Busca un producto arriba' + ' o toca un paquete para agregar varias piezas de una vez.' : 'Busca arriba los productos que llegaron.'}
        </p>
      ) : (
        <ul className="border border-feisen-borde rounded-lg overflow-hidden divide-y divide-feisen-borde-suave">
          {lineas.map(l => {
            const hay = stockPorItem[l.item_id] ?? 0
            const n = parseFloat(l.cantidad) || 0
            const falta = esSalida && n > hay
            return (
              <li key={l.item_id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 pl-3 pr-1.5 py-2.5 ${falta ? 'bg-feisen-rojo-suave' : 'bg-white'}`}>
                <div className="flex-1 min-w-[11rem]">
                  <p className="text-sm font-medium text-feisen-texto break-words">{l.item_nombre}</p>
                  <p className={`text-xs tabular-nums ${falta ? 'text-feisen-rojo font-medium' : 'text-feisen-texto-2'}`}>
                    {falta ? `Solo hay ${cant(hay)} ${l.unidad} en ${nombreBodega || 'la bodega'}`
                      : esSalida ? `Quedan ${cant(hay - n)} ${l.unidad}` : `Quedarán ${cant(hay + n)} ${l.unidad}`}
                  </p>
                  {extra?.(l)}
                </div>
                <div className="flex items-center gap-2">
                  <Contador valor={l.cantidad} onCambiar={v => cambiarCantidad(l.item_id, v)} etiqueta={`Cantidad de ${l.item_nombre}`} />
                  <span className="text-xs text-feisen-texto-2 w-9">{l.unidad}</span>
                  <button type="button" onClick={() => quitar(l.item_id)} aria-label={`Quitar ${l.item_nombre}`}
                    className="p-2.5 rounded-lg text-gray-400 hover:text-feisen-rojo hover:bg-white">
                    <X size={17} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Input con sugerencias (recibe el array directamente) ─────────────────
function InputConSugerencias({ value, onChange, placeholder, sugerencias = [] }) {
  const [open, setOpen] = useState(false)
  const filtradas = value.trim()
    ? sugerencias.filter(s => coincideBusqueda(s, value) && s.toLowerCase() !== value.toLowerCase())
    : sugerencias

  return (
    <div className="relative">
      <input
        type="text" required
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={claseInput}
      />
      {open && filtradas.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-feisen-borde rounded-lg shadow-sm max-h-44 overflow-y-auto">
          {filtradas.map((s, i) => (
            <button key={i} type="button"
              onMouseDown={() => { onChange(s); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 text-sm text-feisen-texto hover:bg-feisen-fondo border-b border-feisen-borde-suave last:border-0">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Agrupar productos duplicados sumando sus cantidades ───────────────────
function agruparProductos(lista) {
  const mapa = {}
  for (const p of lista) {
    if (!p.item_id || parseFloat(p.cantidad) <= 0) continue
    if (mapa[p.item_id]) {
      mapa[p.item_id].cantidad += parseFloat(p.cantidad)
    } else {
      mapa[p.item_id] = { ...p, cantidad: parseFloat(p.cantidad) }
    }
  }
  return Object.values(mapa)
}

const MECANIZADOS_BODEGA_ID = '03a709ac-0bee-457a-80a1-0a1603218d34'

// ── Componente principal ───────────────────────────────────────────────────
export default function RegistrarMovimientoAlmacenista() {
  const { perfil, bodegasOperacion, rolEfectivo, esAdmin, esAlmacenista } = useAuth()

  const AREA_POR_ROL = { JEFE_MECANIZADOS: 'MECANIZADOS', JEFE_FUNDICION: 'FUNDICION', LOGISTICA: 'LOGISTICA', ALMACENISTA: 'ALMACEN', JEFE_ENSAMBLE: 'PRODUCCION', RRHH: 'ADMINISTRACION' }
  const miArea = AREA_POR_ROL[rolEfectivo] || null

  // Query de pedidos filtrada: admin ve todos; los demás solo los suyos
  function queryPedidos() {
    let q = supabase.from('pedidos')
      .select('id, numero, estado, area, pedido_items(descripcion, cantidad, unidad)')
      .in('estado', ['pendiente', 'en_transito'])
      .order('created_at', { ascending: false })
      .limit(50)
    if (!esAdmin) q = q.eq('solicitante_id', perfil.id)
    return q
  }
  const [searchParams] = useSearchParams()

  const HOY_COL = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD en hora local

  const tipoInicial = searchParams.get('tipo') === 'entrada' ? 'entrada' : 'salida'
  const [tipo,        setTipo]        = useState(tipoInicial)
  const [tipoEntrada, setTipoEntrada] = useState('compra')    // 'compra' | 'produccion'
  const [tipoSalida,  setTipoSalida]  = useState('externa')   // 'externa' | 'interna'
  const [fechaMov,    setFechaMov]    = useState(HOY_COL)
  const [items,       setItems]       = useState([])
  const [bodega,      setBodega]      = useState(null)
  const [cargando,    setCargando]    = useState(true)
  const [guardando,        setGuardando]        = useState(false)
  const [exitoPendiente,   setExitoPendiente]   = useState(false)
  const [avisoSinEntrada,  setAvisoSinEntrada]  = useState([]) // productos de la transferencia que no existen en el catálogo del destino
  const [error,            setError]            = useState('')
  const [formKey,     setFormKey]     = useState(0)   // fuerza remonte de SelectorItem al resetear

  // ── Estado ENTRADA ──
  const [proveedor,  setProveedor]  = useState('')
  const [colada,     setColada]     = useState('')
  const [productos,  setProductos]  = useState([])
  const [pedidos,    setPedidos]    = useState([])
  const [pedidoId,   setPedidoId]   = useState('')

  // ── Estado SALIDA ──
  const [sProductos,     setSProductos]     = useState([])
  const [receptor,       setReceptor]       = useState('')
  const [notas,          setNotas]          = useState('')
  const [destinoBodegaId,setDestinoBodegaId]= useState('') // ID de bodega destino (transferencia interna)
  const [numeroOF,       setNumeroOF]       = useState('')
  const [firmaDataUrl,      setFirmaDataUrl]      = useState(null)
  const [firmaEntradaUrl,   setFirmaEntradaUrl]   = useState(null)
  const [todasBodegas,      setTodasBodegas]      = useState([])
  // ── Estado salida MECANIZADOS ──
  const [tipoSalidaMec,  setTipoSalidaMec]  = useState('externa')   // 'externa' | 'produccion'
  const [numeroOrden,    setNumeroOrden]    = useState('')
  const [colaborador,    setColaborador]    = useState('')
  const [firmaReceptorUrl, setFirmaReceptorUrl] = useState(null)
  const [destinoMec,     setDestinoMec]     = useState('')  // 'ALMACEN' | 'SOLDADURA'
  const [paqueteSelId,   setPaqueteSelId]   = useState('')
  const [multiplicadorPaq, setMultiplicadorPaq] = useState(1)
  // Paquetes ya sumados a esta salida (se pueden mezclar máquinas): { [paquete_id]: máquinas }
  const [paquetesAgregados, setPaquetesAgregados] = useState({})
  // Paquetes activos (con sus piezas) de la bodega del usuario: Mecanizados y Almacén
  const [paquetesBodega, setPaquetesBodega] = useState([])
  // Existencia de cada producto en la bodega: para mostrar "Disponible" y avisar antes de guardar
  const [stockPorItem,   setStockPorItem]   = useState({})
  const navigate = useNavigate()
  const [aviso, avisar] = useAviso()
  const verEnHistorial = { texto: 'Ver', alHacer: () => navigate('/movimientos') }

  // Por ID, no por nombre: la bodega se puede renombrar sin que se pierda este flujo
  const esFundicion   = esBodegaFundicion(bodega)
  const esMecanizados = esBodegaMecanizados(bodega)

  // ── Sugerencias sincronizadas con Supabase ──
  const [sugsDB,      setSugsDB]      = useState({})
  const [modalListas,  setModalListas]  = useState(false)
  const [tabLista,     setTabLista]     = useState('feisen_proveedores')
  const [nuevaSug,     setNuevaSug]     = useState('')
  const [editandoSug,  setEditandoSug]  = useState(null)  // { key, idx, valor }


  useEffect(() => {
    if (!perfil) return
    // Usar perfil.sugerencias que ya viene cargado desde AuthContext (no hacer segunda query)
    const enDB = perfil.sugerencias || {}

    // Migrar sugerencias viejas de localStorage si las hay
    const KEYS = ['feisen_proveedores', 'feisen_receptores', 'feisen_colaboradores']
    let hayMigracion = false
    const fusionado = { ...enDB }
    for (const key of KEYS) {
      const local = JSON.parse(localStorage.getItem(key) || '[]')
      if (local.length > 0) {
        const existentes = enDB[key] || []
        const merged = [...new Set([...existentes, ...local])].slice(0, 30)
        if (merged.length > existentes.length) {
          fusionado[key] = merged
          hayMigracion = true
        }
        localStorage.removeItem(key)
      }
    }

    if (hayMigracion) {
      supabase.from('profiles').update({ sugerencias: fusionado }).eq('id', perfil.id)
      setSugsDB(fusionado)
    } else {
      setSugsDB(enDB)
    }
  }, [perfil])

  async function guardarSugerencia(key, valor) {
    const existentes = sugsDB[key] || []
    const nuevas = [valor, ...existentes.filter(s => s !== valor)].slice(0, 30)
    const nuevasSugs = { ...sugsDB, [key]: nuevas }
    setSugsDB(nuevasSugs)
    if (perfil?.id) {
      await supabase.from('profiles').update({ sugerencias: nuevasSugs }).eq('id', perfil.id)
    }
  }

  async function eliminarSugerencia(key, valor) {
    const nuevas = (sugsDB[key] || []).filter(s => s !== valor)
    const nuevasSugs = { ...sugsDB, [key]: nuevas }
    setSugsDB(nuevasSugs)
    if (perfil?.id) {
      await supabase.from('profiles').update({ sugerencias: nuevasSugs }).eq('id', perfil.id)
    }
  }

  async function agregarSugerenciaManual(key, valor) {
    const trimmed = valor.trim()
    if (!trimmed) return
    await guardarSugerencia(key, trimmed)
    setNuevaSug('')
  }

  async function guardarEdicionSug(key, idx, nuevoValor) {
    const trimmed = nuevoValor.trim()
    if (!trimmed) { setEditandoSug(null); return }
    const lista = [...(sugsDB[key] || [])]
    lista[idx] = trimmed
    const nuevasSugs = { ...sugsDB, [key]: lista }
    setSugsDB(nuevasSugs)
    if (perfil?.id) {
      await supabase.from('profiles').update({ sugerencias: nuevasSugs }).eq('id', perfil.id)
    }
    setEditandoSug(null)
  }

  // Para modo vista de admin: selector de bodega manual
  const [bodegaPreviewId, setBodegaPreviewId] = useState('')
  const [bodegasDisponibles, setBodegasDisponibles] = useState([])
  const esAdminEnPreview = !bodegasOperacion && perfil

  useEffect(() => {
    if (!esAdminEnPreview) return
    supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre')
      .then(async ({ data }) => {
        const bods = data || []
        setBodegasDisponibles(bods)
        if (bods.length > 0) {
          const b = bods[0]
          setBodegaPreviewId(b.id)
          setBodega(b)
          const [{ data: its }, { data: peds }, { data: allBods }] = await Promise.all([
            fetchAllPages((d, h) => supabase.from('items').select('id, nombre, unidad_medida, bodega_id, precio_costo, peso_unitario').eq('bodega_id', b.id).eq('activo', true).order('nombre').order('id').range(d, h)),
            queryPedidos(),
            supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
          ])
          setItems(its || [])
          setPedidos(peds || [])
          setTodasBodegas((allBods || []).filter(bd => bd.id !== b.id))
        }
        setCargando(false)
      })
  }, [esAdminEnPreview])

  async function cambiarBodegaPreview(bodegaId) {
    const b = bodegasDisponibles.find(b => b.id === bodegaId)
    if (!b) return
    setBodegaPreviewId(bodegaId)
    setBodega(b)
    const [{ data: its }, { data: peds }, { data: allBods }] = await Promise.all([
      fetchAllPages((d, h) => supabase.from('items').select('id, nombre, unidad_medida, bodega_id, precio_costo, peso_unitario').eq('bodega_id', b.id).eq('activo', true).order('nombre').order('id').range(d, h)),
      supabase.from('pedidos').select('id, numero, estado, area, pedido_items(descripcion, cantidad, unidad)').in('estado', ['pendiente', 'en_transito']).order('created_at', { ascending: false }).limit(50),
      supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setItems(its || [])
    setPedidos(miArea ? (peds || []).filter(p => p.area === miArea || !p.area) : (peds || []))
    setTodasBodegas((allBods || []).filter(bd => bd.id !== b.id))
  }

  useEffect(() => {
    async function cargar() {
      if (!bodegasOperacion?.[0]) { setCargando(false); return }
      const [{ data: bod }, { data: ownItems }, { data: peds }, { data: bods }] = await Promise.all([
        supabase.from('bodegas').select('id, nombre').eq('id', bodegasOperacion[0]).single(),
        fetchAllPages((d, h) => supabase.from('items')
          .select('id, nombre, unidad_medida, bodega_id, precio_costo, peso_unitario')
          .eq('bodega_id', bodegasOperacion[0]).eq('activo', true).order('nombre').order('id').range(d, h)),
        queryPedidos(),
        supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
      ])

      // Solo el ALMACENISTA puede ver items de otras bodegas con stock aquí
      // Los jefes de área (MECANIZADOS, FUNDICIÓN, etc.) solo ven sus propios items
      let extraItems = []
      if (rolEfectivo === 'ALMACENISTA') {
        const { data: stockRows } = await supabase
          .from('stock').select('item_id').eq('bodega_id', bodegasOperacion[0]).gt('cantidad_actual', 0)
        const ownIds  = new Set((ownItems || []).map(i => i.id))
        const extraIds = (stockRows || []).map(r => r.item_id).filter(id => !ownIds.has(id))
        if (extraIds.length > 0) {
          const { data: ext } = await supabase.from('items')
            .select('id, nombre, unidad_medida, bodega_id, precio_costo, peso_unitario')
            .in('id', extraIds).eq('activo', true)
          extraItems = ext || []
        }
      }
      const todosItems = [...(ownItems || []), ...extraItems].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

      setBodega(bod)
      setItems(todosItems)
      setPedidos(miArea ? (peds || []).filter(p => p.area === miArea || !p.area) : (peds || []))
      setTodasBodegas((bods || []).filter(b => b.id !== bodegasOperacion[0]))
      setCargando(false)
    }
    cargar()
  }, [])

  async function cargarStock(bodegaId) {
    const { data } = await fetchAllPages((d, h) => supabase.from('stock')
      .select('item_id, cantidad_actual').eq('bodega_id', bodegaId).order('item_id').range(d, h))
    setStockPorItem(Object.fromEntries((data || []).map(r => [r.item_id, Number(r.cantidad_actual) || 0])))
  }
  useEffect(() => { if (bodega?.id) cargarStock(bodega.id) }, [bodega?.id])
  // El botón de guardar está abajo y los errores arriba: al aparecer un error, subir a mostrarlo
  useEffect(() => { if (error) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [error])

  // ── Paquetes de la bodega (kits de piezas por máquina para la salida) ──
  useEffect(() => {
    if (!bodega?.id) { setPaquetesBodega([]); return }
    async function cargarPaquetes() {
      const { data } = await supabase
        .from('paquetes')
        .select('id, nombre, descripcion, activo, paquete_items(id, item_id, cantidad, items(nombre, unidad_medida))')
        .eq('bodega_id', bodega.id)
        .eq('activo', true)
        .order('nombre')
      setPaquetesBodega(data || [])
    }
    cargarPaquetes()
  }, [bodega?.id])

  // ── Aplicar un paquete a la lista de productos de la salida ──
  // Nota: no confiamos únicamente en el "items(nombre, unidad_medida)" que viene
  // embebido en la consulta de paquetes (puede venir vacío por caché de esquema
  // de PostgREST u otros casos borde) — resolvemos cada pieza contra el catálogo
  // `items` ya cargado para esta bodega, que es la misma fuente que usa el buscador
  // de "Productos" de abajo y sabemos que funciona.
  function aplicarPaquete() {
    const paq = paquetesBodega.find(p => p.id === paqueteSelId)
    if (!paq) return
    const mult = Number(multiplicadorPaq)
    if (!mult || mult <= 0) { setError('La cantidad de paquetes debe ser mayor a 0.'); return }

    const piezas = paq.paquete_items || []
    if (piezas.length === 0) { setError('Este paquete no tiene piezas configuradas.'); return }

    const nuevasLineas = []
    let faltantes = 0
    for (const pi of piezas) {
      const cat    = items.find(i => i.id === pi.item_id)
      const nombre = cat?.nombre || pi.items?.nombre
      if (!nombre) { faltantes++; continue }
      nuevasLineas.push({
        item_id:       pi.item_id,
        item_nombre:   nombre,
        unidad:        cat?.unidad_medida || pi.items?.unidad_medida || '',
        cantidad:      String(Number(pi.cantidad) * mult),
        peso_unitario: cat?.peso_unitario ?? null,
      })
    }

    if (nuevasLineas.length === 0) {
      setError(`No se pudo cargar el paquete: sus piezas ya no están en el catálogo activo de ${bodega.nombre}.`)
      return
    }

    // Se SUMA a lo que ya está en la lista (se pueden sacar varios paquetes en la misma salida)
    setSProductos(prev => {
      const res = [...prev]
      for (const nl of nuevasLineas) {
        const k = res.findIndex(l => l.item_id === nl.item_id)
        if (k >= 0) res[k] = { ...res[k], cantidad: String((parseFloat(res[k].cantidad) || 0) + parseFloat(nl.cantidad)) }
        else res.push(nl)
      }
      return res
    })
    setError(faltantes > 0
      ? `Se agregaron ${nuevasLineas.length} de ${piezas.length} piezas del paquete — ${faltantes} ya no están en el catálogo activo.`
      : '')
    if (!faltantes) avisar(`${paq.nombre}: ${nuevasLineas.length} productos × ${mult} ${mult === 1 ? 'máquina' : 'máquinas'}`)
    setPaquetesAgregados(prev => ({ ...prev, [paq.id]: (prev[paq.id] || 0) + mult }))
    setPaqueteSelId('')
    setMultiplicadorPaq(1)
  }
  // Si la lista de productos queda vacía (se guardó o se quitó todo), el resumen de paquetes también
  useEffect(() => { if (!sProductos.length) setPaquetesAgregados({}) }, [sProductos.length])

  // ── Generador de número ──
  async function generarNumero(prefixBase) {
    const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
    const prefix = `${prefixBase}-${iniciales}-`
    const { data: last } = await supabase
      .from('movimientos').select('numero').like('numero', `${prefix}%`)
      .order('numero', { ascending: false }).limit(1).maybeSingle()
    const n = last?.numero ? parseInt(last.numero.replace(prefix, ''), 10) || 0 : 0
    return `${prefix}${String(n + 1).padStart(4, '0')}`
  }

  // ── SUBMIT ENTRADA ──
  async function handleEntrada(e) {
    e.preventDefault()
    setError('')
    if (!bodega) { setError('No tienes bodega asignada. Contacta al administrador.'); return }

    const esCompra = !esFundicion || tipoEntrada === 'compra'
    if (esCompra && !proveedor.trim()) { setError('Ingresa el nombre del proveedor.'); return }

    const agrupados = agruparProductos(productos)
    if (agrupados.length === 0) { setError('Agrega al menos un producto con cantidad.'); return }

    setGuardando(true)
    try {
      const numero = await generarNumero('REC')
      const proveedorFinal  = esCompra ? proveedor.trim() : 'Producción interna'
      const referenciaFinal = (!esCompra && colada.trim()) ? colada.trim() : null

      const payloads = agrupados.map(p => ({
        numero,
        tipo:                  'entrada',
        item_id:               p.item_id,
        bodega_destino_id:     bodega.id,
        bodega_origen_id:      null,
        cantidad:              p.cantidad,
        precio_costo_snapshot: items.find(i => i.id === p.item_id)?.precio_costo || 0,
        centro_costo:          bodega.nombre,
        usuario_id:            perfil.id,
        proveedor:             proveedorFinal,
        pedido_id:             esCompra ? (pedidoId || null) : null,
        referencia:            referenciaFinal,
        fecha_movimiento:      fechaMov || null,
        foto_remision_url: firmaEntradaUrl || null, destino: null,
        numero_of: null, serial_motor: null, motivo: null, cliente: null,
      }))
      const { error: err } = await supabase.from('movimientos').insert(payloads)
      if (err) { setError('Error al guardar: ' + err.message); return }
      if (esCompra) guardarSugerencia('feisen_proveedores', proveedor.trim())
      // Resetear formulario inmediatamente
      setProveedor('')
      setColada('')
      setProductos([])
      setPedidoId('')
      setFechaMov(HOY_COL)
      setFirmaEntradaUrl(null)
      setFormKey(k => k + 1)
      avisar(`Entrada ${numero} registrada`, verEnHistorial)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      cargarStock(bodega.id)
    } catch (err) {
      setError('Error inesperado: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  // ── SUBMIT SALIDA ──
  async function handleSalida(e) {
    e.preventDefault()
    setError('')
    if (!bodega) { setError('No tienes bodega asignada.'); return }

    const esInterna        = esFundicion && tipoSalida === 'interna'
    const esExternaFundic  = esFundicion && tipoSalida === 'externa'

    if (!esFundicion && !esMecanizados && !receptor.trim())                           { setError('Ingresa el nombre de quien recibe.'); return }
    if (esExternaFundic && !numeroOF.trim())                                          { setError('Ingresa el N° OF.'); return }
    if (esInterna && !destinoBodegaId)                                                { setError('Selecciona el destino interno.'); return }
    if (!esAlmacenista && !firmaDataUrl && !(esMecanizados && tipoSalidaMec === 'produccion')) { setError('Se requiere la firma del responsable.'); return }
    if (esMecanizados && tipoSalidaMec === 'externa' && !numeroOrden.trim())          { setError('Ingresa el N° de orden.'); return }
    if (esMecanizados && tipoSalidaMec === 'produccion' && !destinoMec)               { setError('Selecciona el destino (Almacén o Soldadura y Armado).'); return }
    if (esMecanizados && tipoSalidaMec === 'produccion' && !colaborador.trim())       { setError('Ingresa el colaborador que recibe.'); return }
    if (esMecanizados && tipoSalidaMec === 'produccion' && !firmaReceptorUrl)         { setError('Se requiere la firma del colaborador que recibe.'); return }

    const agrupados = agruparProductos(sProductos)
    if (agrupados.length === 0) { setError('Agrega al menos un producto con cantidad.'); return }

    // Mecanizados → "Soldadura y Armado": las piezas entran con stock a la bodega de
    // Ensamble (se consumen al registrar el avance de una orden de ensamble).
    const esMecEnsamble = esMecanizados && tipoSalidaMec === 'produccion' && destinoMec === 'SOLDADURA Y ARMADO'
    const destinoPareadoId = esInterna ? destinoBodegaId : (esMecEnsamble ? BODEGA_ENSAMBLE_ID : null)
    const destNombre = esInterna ? (todasBodegas.find(b => b.id === destinoBodegaId)?.nombre || '') : null
    const destPareadoNombre = esMecEnsamble ? await nombreBodega(BODEGA_ENSAMBLE_ID, 'Producción y Ensamble') : destNombre

    // ── CASO ESPECIAL: Fundición → Mecanizados = transferencia pendiente ──
    const esTransferMecanizados = esInterna && destinoBodegaId === MECANIZADOS_BODEGA_ID
    if (esTransferMecanizados) {
      setGuardando(true)
      try {
        const { data: lastTrf } = await supabase
          .from('transferencias_pendientes')
          .select('numero')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const lastNum = lastTrf?.numero
          ? parseInt(lastTrf.numero.replace(/^TRF-0*/, ''), 10) || 0
          : 0
        const numeroTrf = `TRF-${String(lastNum + 1).padStart(4, '0')}`

        const itemsPayload = agrupados.map(p => ({
          item_id:      p.item_id,
          item_nombre:  p.item_nombre,
          cantidad:     p.cantidad,
          unidad:       p.unidad,
          precio_costo: items.find(i => i.id === p.item_id)?.precio_costo || 0,
        }))

        const { error: errTrf } = await supabase.from('transferencias_pendientes').insert({
          numero:            numeroTrf,
          estado:            'pendiente',
          origen_bodega_id:  bodega.id,
          destino_bodega_id: destinoBodegaId,
          items:             itemsPayload,
          creado_por:        perfil.id,
          notas:             notas.trim() || null,
          fecha_movimiento:  fechaMov || null,
        })
        if (errTrf) { setError('Error al registrar transferencia: ' + errTrf.message); return }

        setSProductos([])
        setNotas('')
        setDestinoBodegaId('')
        setFirmaDataUrl(null)
        setFechaMov(HOY_COL)
        setFormKey(k => k + 1)
        setExitoPendiente(true)
        setTimeout(() => setExitoPendiente(false), 5000)
      } catch (err) {
        setError('Error inesperado: ' + err.message)
      } finally {
        setGuardando(false)
      }
      return
    }

    setGuardando(true)

    // Validar stock suficiente para cada producto antes de guardar
    for (const p of agrupados) {
      const { data: stockRow } = await supabase
        .from('stock')
        .select('cantidad_actual')
        .eq('item_id', p.item_id)
        .eq('bodega_id', bodega.id)
        .maybeSingle()
      const stockActual = stockRow?.cantidad_actual ?? 0
      if (stockActual < p.cantidad) {
        const itemNombre = items.find(i => i.id === p.item_id)?.nombre || p.item_id
        setError(`Stock insuficiente para "${itemNombre}". Disponible: ${stockActual.toLocaleString('es-CO')} — solicitado: ${p.cantidad.toLocaleString('es-CO')}`)
        setGuardando(false)
        return
      }
    }

    // Transferencia interna a una bodega con catálogo propio (no Mecanizados,
    // que usa aprobación): cada bodega tiene su propio item_id para el mismo
    // nombre de producto (ver aprobar() en TransferenciasPendientes.jsx), así
    // que hay que mapear cada producto al renglón de catálogo del destino
    // ANTES de guardar nada, para poder crear la entrada pareada después.
    let entradaPareadaPayloads = null
    let sinCatalogarNombres = []
    if (destinoPareadoId) {
      const normaliza = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, '') // sin tildes ni espacios: tolera "-1 B(" vs "- 1B ("
      const { data: itemsDestino } = await fetchAllPages((d, h) =>
        supabase.from('items').select('id, nombre').eq('bodega_id', destinoPareadoId).eq('activo', true).range(d, h)
      )
      const destinoPorNombre = {}
      itemsDestino?.forEach(i => { destinoPorNombre[normaliza(i.nombre)] = i.id })

      // Si el producto no existe en el catálogo del destino NO se bloquea: se registra
      // solo la salida (comportamiento anterior al 03/10/2026) y se avisa cuáles
      // quedaron sin entrada. Pasa p. ej. con bodegas que aún no usan la app.
      const conCatalogo = agrupados.filter(p => destinoPorNombre[normaliza(p.item_nombre)])
      sinCatalogarNombres = agrupados.filter(p => !destinoPorNombre[normaliza(p.item_nombre)]).map(p => p.item_nombre)
      if (conCatalogo.length > 0) {
        entradaPareadaPayloads = conCatalogo.map(p => ({
          item_id:               destinoPorNombre[normaliza(p.item_nombre)],
          cantidad:              p.cantidad,
          precio_costo_snapshot: items.find(i => i.id === p.item_id)?.precio_costo || 0,
        }))
      }
    }

    try {
      const numero = await generarNumero('SAL')
      const referenciaPar = notas.trim() || null
      const payloads = agrupados.map(p => ({
        numero,
        tipo:                  'salida',
        item_id:               p.item_id,
        bodega_origen_id:      bodega.id,
        bodega_destino_id:     destinoPareadoId,
        cantidad:              p.cantidad,
        precio_costo_snapshot: items.find(i => i.id === p.item_id)?.precio_costo || 0,
        centro_costo:          bodega.nombre,
        usuario_id:            perfil.id,
        cliente:               esMecanizados && tipoSalidaMec === 'produccion'
                                 ? colaborador.trim()
                                 : (!esFundicion && !esMecanizados ? receptor.trim() : null),
        referencia:            referenciaPar,
        destino:               esMecanizados && tipoSalidaMec === 'produccion' ? destinoMec : destNombre,
        numero_of:             esExternaFundic ? numeroOF.trim()
                                 : (esMecanizados && tipoSalidaMec === 'externa' ? numeroOrden.trim() : null),
        foto_remision_url:     firmaDataUrl,
        firma_receptor_url:    (esMecanizados && tipoSalidaMec === 'produccion') ? firmaReceptorUrl : null,
        fecha_movimiento:      fechaMov || null,
        proveedor: null, pedido_id: null, serial_motor: null, motivo: null,
      }))
      const { error: err } = await supabase.from('movimientos').insert(payloads)
      if (err) { setError('Error al guardar: ' + err.message); return }

      // Crear la entrada pareada en la bodega destino — el trigger de stock
      // solo acredita bodega_destino_id cuando tipo='entrada'; un movimiento
      // tipo='salida' solo resta en bodega_origen_id y nunca suma en destino,
      // así que sin esto el stock del destino nunca sube (bug ya corregido).
      if (destinoPareadoId && entradaPareadaPayloads) {
        const numeroRec = await generarNumero('REC')
        const payloadsEntrada = entradaPareadaPayloads.map(p => ({
          numero:                numeroRec,
          tipo:                  'entrada',
          item_id:               p.item_id,
          bodega_origen_id:      bodega.id,
          bodega_destino_id:     destinoPareadoId,
          cantidad:              p.cantidad,
          precio_costo_snapshot: p.precio_costo_snapshot,
          centro_costo:          destPareadoNombre,
          usuario_id:            perfil.id,
          referencia:            referenciaPar,
          fecha_movimiento:      fechaMov || null,
          proveedor: null, pedido_id: null, serial_motor: null, motivo: null,
          cliente: null, foto_remision_url: null, firma_receptor_url: null,
          destino: null, numero_of: null,
        }))
        const { error: errEnt } = await supabase.from('movimientos').insert(payloadsEntrada)
        if (errEnt) { setError(`Salida creada (${numero}), pero error al crear la entrada en ${destPareadoNombre}: ` + errEnt.message); return }
      }

      if (!esInterna && !esMecanizados) guardarSugerencia('feisen_receptores', receptor.trim())
      // Resetear formulario inmediatamente
      setSProductos([])
      setReceptor('')
      setNotas('')
      setDestinoBodegaId('')
      setNumeroOF('')
      setFirmaDataUrl(null)
      setFirmaReceptorUrl(null)
      setNumeroOrden('')
      setColaborador('')
      setTipoSalidaMec('externa')
      setDestinoMec('')
      setFechaMov(HOY_COL)
      setFormKey(k => k + 1)
      avisar(`Salida ${numero} registrada`, verEnHistorial)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      cargarStock(bodega.id)
      if (sinCatalogarNombres.length > 0) {
        setAvisoSinEntrada(sinCatalogarNombres.map(n => ({ n, d: destPareadoNombre })))
        setTimeout(() => setAvisoSinEntrada([]), 15000)
      }
    } catch (err) {
      setError('Error inesperado: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return <div className="flex justify-center py-20"><Spinner /></div>

  const esSalida = tipo === 'salida'
  const lineas    = esSalida ? sProductos : productos
  const setLineas = esSalida ? setSProductos : setProductos
  const conCantidad = lineas.filter(l => parseFloat(l.cantidad) > 0)
  const totalUnidades = conCantidad.reduce((s, l) => s + parseFloat(l.cantidad), 0)
  const sinStock = esSalida ? lineas.filter(l => parseFloat(l.cantidad) > (stockPorItem[l.item_id] ?? 0)).length : 0
  const esProduccionFundicion = esFundicion && tipoEntrada === 'produccion'
  const esEnvioMecanizados = esFundicion && tipoSalida === 'interna' && destinoBodegaId === MECANIZADOS_BODEGA_ID
  const textoBoton = guardando ? 'Registrando…'
    : !esSalida ? (esProduccionFundicion ? 'Registrar producción' : 'Registrar entrada')
    : esEnvioMecanizados ? 'Enviar a Mecanizados' : 'Registrar salida'
  const usaPaquetes = esSalida && paquetesBodega.length > 0 && ((esMecanizados && tipoSalidaMec === 'produccion') || (!esFundicion && !esMecanizados))

  // Botón principal fijo abajo (encima de la barra de navegación en celular), con el resumen
  const barraAccion = (
    <div className="sticky bottom-[calc(4.5rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10 mt-2">
      <div className="flex items-center gap-3 bg-white border border-feisen-borde rounded-xl shadow-sm pl-4 pr-2 py-2">
        <div className="flex-1 min-w-0 text-sm leading-tight">
          {conCantidad.length === 0
            ? <><p className="font-semibold text-feisen-texto">Sin productos</p><p className="text-feisen-texto-2 text-xs">Agrega al menos uno</p></>
            : <><p className="font-semibold text-feisen-texto tabular-nums">{conCantidad.length} {conCantidad.length === 1 ? 'producto' : 'productos'}</p>
                <p className={`text-xs tabular-nums ${sinStock ? 'text-feisen-rojo font-medium' : 'text-feisen-texto-2'}`}>
                  {sinStock ? `${sinStock} sin stock suficiente` : `${cant(totalUnidades)} en total`}
                </p></>}
        </div>
        <button type="submit" disabled={guardando}
          className="bg-feisen-azul text-white rounded-lg px-5 min-h-[48px] text-[15px] font-semibold disabled:opacity-60 hover:opacity-90 active:scale-[.98] transition">
          {textoBoton}
        </button>
      </div>
    </div>
  )

  const listaProductos = (
    <Bloque titulo="Productos" detalle={conCantidad.length ? `${conCantidad.length} ${conCantidad.length === 1 ? 'producto' : 'productos'}` : null}>
      <ListaProductos items={items} lineas={lineas} setLineas={setLineas} stockPorItem={stockPorItem}
        esSalida={esSalida} nombreBodega={bodega?.nombre}
        extra={l => esProduccionFundicion && l.peso_unitario && parseFloat(l.cantidad) > 0 && (
          <p className="text-xs text-feisen-texto-2 tabular-nums">
            Peso total: {(parseFloat(l.cantidad) * parseFloat(l.peso_unitario)).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
          </p>
        )} />
    </Bloque>
  )

  const campoNotas = (placeholder = 'Observaciones adicionales…') => (
    <Campo etiqueta="Notas" opcional>
      <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder={placeholder} rows={2}
        className={claseInput + ' resize-none'} />
    </Campo>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {aviso}
      <EncabezadoPagina modulo="Inventarios" titulo="Registrar movimiento"
        subtitulo={esAdminEnPreview
          ? <span className="inline-flex items-center gap-2">Bodega (vista)
              <select value={bodegaPreviewId} onChange={e => cambiarBodegaPreview(e.target.value)}
                className="border border-feisen-borde rounded-md px-2 py-0.5 text-xs font-semibold text-feisen-azul bg-feisen-azul-suave focus:outline-none">
                {bodegasDisponibles.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select></span>
          : bodega && <span>Bodega <ChipBodega>{bodega.nombre}</ChipBodega></span>}>
        <button type="button" onClick={() => setModalListas(true)}
          className="inline-flex items-center gap-1.5 text-sm text-feisen-texto-2 hover:text-feisen-texto border border-feisen-borde rounded-lg px-3 py-2 bg-white hover:bg-feisen-fondo transition-colors">
          <Settings size={15} /> Mis listas
        </button>
      </EncabezadoPagina>

      <Segmentado grande valor={tipo} onCambiar={t => { setTipo(t); setError('') }}
        opciones={[
          { valor: 'salida',  texto: 'Salida',  icono: ArrowUpRight },
          { valor: 'entrada', texto: 'Entrada', icono: ArrowDownLeft },
        ]} />

      <div className="flex items-center gap-2 text-sm text-feisen-texto-2">
        <CalendarDays size={16} className="shrink-0" />
        <label htmlFor="fecha-mov">Fecha del movimiento</label>
        <input id="fecha-mov" type="date" value={fechaMov} max={new Date().toLocaleDateString('en-CA')}
          onChange={e => setFechaMov(e.target.value)}
          className="border border-feisen-borde rounded-lg px-2.5 py-1.5 bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul" />
        {fechaMov !== HOY_COL && <button type="button" onClick={() => setFechaMov(HOY_COL)} className="text-feisen-azul font-medium text-sm">Hoy</button>}
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}
      {avisoSinEntrada.length > 0 && (
        <Alerta tipo="alerta" mensaje={`Salida registrada, pero sin entrada en ${avisoSinEntrada[0].d}: ${avisoSinEntrada.map(a => a.n).join(', ')} no existe(n) en su catálogo, así que su stock allá no se actualizó.`} />
      )}
      {exitoPendiente && (
        <Alerta tipo="info" mensaje='Transferencia enviada a Mecanizados. El stock se mueve cuando Mecanizados la apruebe; puedes seguirla en "Transferencias".' />
      )}

      {/* ── ENTRADA ── */}
      {tipo === 'entrada' && (
        <form key={formKey} onSubmit={handleEntrada} className="space-y-4">
          {esFundicion && (
            <Segmentado valor={tipoEntrada} onCambiar={v => { setTipoEntrada(v); setError('') }}
              opciones={[
                { valor: 'compra',     texto: 'Compra · materia prima', icono: ShoppingCart },
                { valor: 'produccion', texto: 'Producción · fundida',   icono: Flame },
              ]} />
          )}

          {listaProductos}

          <Bloque titulo={esProduccionFundicion ? 'Producción' : 'De dónde viene'}>
            {!esProduccionFundicion && (
              <>
                <Campo etiqueta="Proveedor">
                  <InputConSugerencias value={proveedor} onChange={setProveedor} placeholder="Nombre del proveedor"
                    sugerencias={sugsDB['feisen_proveedores'] || []} />
                </Campo>
                <Campo etiqueta="Pedido asociado" opcional>
                  {pedidos.length === 0 ? (
                    <p className="text-sm text-feisen-texto-2">No hay pedidos pendientes{miArea ? ` de ${miArea}` : ''}.</p>
                  ) : (
                    <select value={pedidoId} onChange={e => setPedidoId(e.target.value)} className={claseInput}>
                      <option value="">Sin pedido asociado</option>
                      {pedidos.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.numero} · {p.estado === 'en_transito' ? 'En tránsito' : 'Pendiente'}{p.area ? ` · ${p.area}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {pedidoId && (() => {
                    const ped = pedidos.find(p => p.id === pedidoId)
                    const items_ped = ped?.pedido_items || []
                    if (!items_ped.length) return null
                    return (
                      <div className="mt-2 bg-feisen-fondo border border-feisen-borde-suave rounded-lg p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Lo que se pidió en {ped.numero}</p>
                        <ul className="space-y-1">
                          {items_ped.map((it, i) => (
                            <li key={i} className="flex justify-between gap-3 text-sm">
                              <span className="text-feisen-texto">{it.descripcion}</span>
                              <span className="text-feisen-texto-2 tabular-nums whitespace-nowrap">{it.cantidad} {it.unidad}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-gray-400 mt-2">Es solo de referencia: arriba van las cantidades que llegaron.</p>
                      </div>
                    )
                  })()}
                </Campo>
              </>
            )}
            {esProduccionFundicion && (
              <Campo etiqueta="N° de colada" opcional>
                <input type="text" value={colada} onChange={e => setColada(e.target.value)} placeholder="Ej: C-2026-001" className={claseInput} />
              </Campo>
            )}
            {!esAlmacenista && (
              <FirmaCanvas onFirma={setFirmaEntradaUrl} firmaDataUrl={firmaEntradaUrl} label="Firma del responsable" />
            )}
          </Bloque>

          {barraAccion}
        </form>
      )}

      {/* ── SALIDA ── */}
      {tipo === 'salida' && (
        <form key={formKey} onSubmit={handleSalida} className="space-y-4">

          {/* Tipo de salida de FUNDICIÓN */}
          {esFundicion && (
            <Segmentado valor={tipoSalida} onCambiar={v => { setTipoSalida(v); setError('') }}
              opciones={[
                { valor: 'externa', texto: 'Venta externa',         icono: Factory },
                { valor: 'interna', texto: 'Transferencia interna', icono: Wrench },
              ]} />
          )}
          {/* Tipo de salida de MECANIZADOS */}
          {esMecanizados && (
            <Segmentado valor={tipoSalidaMec} onCambiar={v => { setTipoSalidaMec(v); setError('') }}
              opciones={[
                { valor: 'externa',    texto: 'Cliente externo',     icono: Factory },
                { valor: 'produccion', texto: 'Producción interna',  icono: Wrench },
              ]} />
          )}

          {/* Destino: transferencia interna de Fundición */}
          {esFundicion && tipoSalida === 'interna' && (
            <Bloque titulo="¿A qué bodega va?">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {todasBodegas.map(b => (
                  <BotonOpcion key={b.id} activo={destinoBodegaId === b.id} onClick={() => setDestinoBodegaId(b.id)}>{b.nombre}</BotonOpcion>
                ))}
              </div>
              {destinoBodegaId && destinoBodegaId !== MECANIZADOS_BODEGA_ID && (
                <p className="text-xs text-feisen-texto-2">Se crea la entrada automática en <b>{todasBodegas.find(b => b.id === destinoBodegaId)?.nombre}</b>.</p>
              )}
              {destinoBodegaId === MECANIZADOS_BODEGA_ID && (
                <p className="text-xs text-amber-700">Queda pendiente de aprobación: el stock se mueve cuando Mecanizados la apruebe.</p>
              )}
            </Bloque>
          )}

          {/* Destino: producción interna de Mecanizados */}
          {esMecanizados && tipoSalidaMec === 'produccion' && (
            <Bloque titulo="¿A dónde va?">
              <div className="grid grid-cols-2 gap-2">
                <BotonOpcion activo={destinoMec === 'ALMACEN'} onClick={() => setDestinoMec('ALMACEN')}>Almacén</BotonOpcion>
                <BotonOpcion activo={destinoMec === 'SOLDADURA Y ARMADO'} onClick={() => setDestinoMec('SOLDADURA Y ARMADO')}>Soldadura y Armado</BotonOpcion>
              </div>
            </Bloque>
          )}

          {/* Paquetes de piezas por máquina */}
          {usaPaquetes && (
            <Bloque titulo="Sacar paquetes por máquina" detalle="opcional · puedes mezclar máquinas">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {paquetesBodega.map(p => {
                  const activo = paqueteSelId === p.id
                  return (
                    <button key={p.id} type="button" aria-pressed={activo}
                      onClick={() => { setPaqueteSelId(activo ? '' : p.id); setMultiplicadorPaq(1) }}
                      className={`min-h-[44px] text-left rounded-lg border px-3 py-2.5 transition-colors active:scale-[.98]
                        ${activo ? 'border-feisen-azul bg-feisen-azul-suave' : 'border-feisen-borde bg-white hover:bg-feisen-fondo'}`}>
                      <span className="block text-sm font-semibold text-feisen-texto leading-snug">{p.nombre}</span>
                      <span className="block text-xs text-feisen-texto-2 mt-0.5">{(p.paquete_items || []).length} productos por máquina</span>
                      {paquetesAgregados[p.id] > 0 && (
                        <span className="inline-flex items-center gap-1 mt-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-feisen-azul text-white">
                          <Check size={12} /> Agregado × {paquetesAgregados[p.id]}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {paqueteSelId && (
                <div className="flex flex-wrap items-center gap-3 bg-feisen-fondo rounded-lg p-3">
                  <p className="flex-1 min-w-[10rem] text-sm text-feisen-texto-2">
                    <span className="block font-medium text-feisen-texto">{paquetesBodega.find(p => p.id === paqueteSelId)?.nombre}</span>
                    ¿Para cuántas máquinas?
                  </p>
                  <Contador valor={String(multiplicadorPaq)} onCambiar={v => setMultiplicadorPaq(v)} min={1} etiqueta="Máquinas" ancho="w-14" />
                  <button type="button" onClick={aplicarPaquete}
                    className="border border-feisen-azul text-feisen-azul bg-white rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:bg-feisen-azul-suave active:scale-[.98] transition">
                    Agregar {(paquetesBodega.find(p => p.id === paqueteSelId)?.paquete_items || []).length} productos
                  </button>
                </div>
              )}
              {Object.keys(paquetesAgregados).length > 0 && (
                <p className="text-sm text-feisen-texto-2">
                  <span className="font-medium text-feisen-texto">En esta salida:</span>{' '}
                  {Object.entries(paquetesAgregados).map(([id, n]) => `${paquetesBodega.find(p => p.id === id)?.nombre || 'Paquete'} × ${n}`).join(' · ')}.
                  {' '}Toca otro paquete para sumarlo.
                </p>
              )}
            </Bloque>
          )}

          {listaProductos}

          {/* Quién recibe / datos de la salida */}
          {esMecanizados && tipoSalidaMec === 'externa' && (
            <Bloque titulo="Datos de la salida">
              <Campo etiqueta="N° de orden">
                <input type="text" value={numeroOrden} onChange={e => setNumeroOrden(e.target.value)} placeholder="Ej: ORD-2026-001" className={claseInput} />
              </Campo>
              {campoNotas()}
            </Bloque>
          )}
          {esMecanizados && tipoSalidaMec === 'produccion' && (
            <Bloque titulo="Quién recibe">
              <Campo etiqueta="Colaborador que recibe">
                <InputConSugerencias value={colaborador} onChange={setColaborador} placeholder="Nombre del colaborador"
                  sugerencias={sugsDB['feisen_colaboradores'] || []} />
              </Campo>
              <FirmaCanvas onFirma={setFirmaReceptorUrl} firmaDataUrl={firmaReceptorUrl} label="Firma del colaborador que recibe" />
              {campoNotas()}
            </Bloque>
          )}
          {!esFundicion && !esMecanizados && (
            <Bloque titulo="Quién recibe">
              <div className="grid sm:grid-cols-2 gap-3">
                <Campo etiqueta="Recibido por">
                  <InputConSugerencias value={receptor} onChange={setReceptor} placeholder="Nombre de quien recibe"
                    sugerencias={sugsDB['feisen_receptores'] || []} />
                </Campo>
                <Campo etiqueta="Notas" opcional>
                  <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
                    placeholder="Ej: mezcladora #7, pedido urgente" className={claseInput} />
                </Campo>
              </div>
            </Bloque>
          )}
          {esFundicion && tipoSalida === 'externa' && (
            <Bloque titulo="Datos de la venta">
              <Campo etiqueta="N° OF">
                <input type="text" value={numeroOF} onChange={e => setNumeroOF(e.target.value)} placeholder="Ej: OF-2026-042" className={claseInput} />
              </Campo>
              {campoNotas()}
            </Bloque>
          )}
          {esFundicion && tipoSalida === 'interna' && (
            <Bloque titulo="Notas">{campoNotas()}</Bloque>
          )}

          {/* Firma del responsable — no aplica para mecanizados producción ni para almacenista */}
          {!esAlmacenista && !(esMecanizados && tipoSalidaMec === 'produccion') && (
            <Bloque titulo="Firma">
              <FirmaCanvas onFirma={setFirmaDataUrl} firmaDataUrl={firmaDataUrl} label="Firma del responsable" />
            </Bloque>
          )}

          {barraAccion}
        </form>
      )}

      {/* ── MODAL MIS LISTAS ── */}
      {modalListas && (
        <Modal titulo="Mis listas de sugerencias" onCerrar={() => { setModalListas(false); setNuevaSug('') }}>
          <div className="space-y-4">
            <Segmentado valor={tabLista} onCambiar={k => { setTabLista(k); setNuevaSug('') }}
              opciones={[
                { valor: 'feisen_proveedores', texto: 'Proveedores' },
                { valor: 'feisen_receptores',  texto: 'Quienes reciben' },
              ]} />

            <div className="max-h-52 overflow-y-auto divide-y divide-feisen-borde-suave border border-feisen-borde rounded-lg">
              {(sugsDB[tabLista] || []).length === 0
                ? <p className="text-sm text-feisen-texto-2 text-center py-6">Todavía no hay nombres. Se guardan solos al registrar, o agrégalos abajo.</p>
                : (sugsDB[tabLista] || []).map((s, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                      {editandoSug?.key === tabLista && editandoSug?.idx === i ? (
                        <input
                          autoFocus
                          value={editandoSug.valor}
                          onChange={e => setEditandoSug(ed => ({ ...ed, valor: e.target.value }))}
                          onBlur={() => guardarEdicionSug(tabLista, i, editandoSug.valor)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') guardarEdicionSug(tabLista, i, editandoSug.valor)
                            if (e.key === 'Escape') setEditandoSug(null)
                          }}
                          className="flex-1 border border-feisen-azul rounded-md px-2 py-1 focus:outline-none"
                        />
                      ) : (
                        <button type="button" className="flex-1 text-left text-sm text-feisen-texto py-1.5 hover:text-feisen-azul"
                          onClick={() => setEditandoSug({ key: tabLista, idx: i, valor: s })} title="Toca para editar">
                          {s}
                        </button>
                      )}
                      <button type="button" onClick={() => eliminarSugerencia(tabLista, s)} aria-label={`Quitar ${s}`}
                        className="p-2 text-gray-400 hover:text-feisen-rojo transition-colors flex-shrink-0">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
              }
            </div>

            <div className="flex gap-2">
              <input
                value={nuevaSug}
                onChange={e => setNuevaSug(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarSugerenciaManual(tabLista, nuevaSug) } }}
                placeholder="Agregar nombre…"
                className={claseInput + ' flex-1'}
              />
              <button type="button" onClick={() => agregarSugerenciaManual(tabLista, nuevaSug)}
                className="bg-feisen-azul text-white px-4 rounded-lg text-sm font-semibold hover:opacity-90">
                Agregar
              </button>
            </div>
            <p className="text-xs text-gray-400">Los cambios se guardan solos y se ven en todos tus dispositivos.</p>
          </div>
        </Modal>
      )}
    </div>
  )
}
