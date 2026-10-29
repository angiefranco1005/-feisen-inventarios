import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Trash2, Search, CalendarDays } from 'lucide-react'
import Alerta from '../shared/Alerta'
import Spinner from '../shared/Spinner'
import { coincideBusqueda } from '../../utils/busqueda'
import { EncabezadoPagina, ChipBodega, Contador, useAviso, useAtajoBuscar } from '../shared/ui'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { siguienteNumero } from '../../utils/siguienteNumero'
import { nombreBodega } from '../../utils/bodegasCatalogo'
import SelectorOperarios, { unirOperarios } from './SelectorOperarios'

const BODEGA_MECANIZADOS      = '03a709ac-0bee-457a-80a1-0a1603218d34'
const CAT_PRODUCTO_MECANIZADO = 'bff5d482-1647-426c-a88f-dedd72ff5b06'
const CATEGORIAS_MECANIZABLES = new Set([
  'cfa47941-3a0e-4fc8-a9c5-6a676bbb5c50',
  '549c8036-364a-433b-b18f-d4a444c9f9a2',
  'a735b04a-9bd7-424b-b695-1ac8ce1a5bf4',
])

const cant = n => Number(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
// Clave para comparar nombres de productos: mayúsculas, sin tildes y SIN espacios
// (el catálogo suele diferir en espacios alrededor de guiones o paréntesis)
const clave = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, '')
const nombreDestino = nombre => nombre.trim().replace(/\s+/g, ' ') + ' - MECANIZADO'

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

function hoyISO() {
  // Fecha de hoy en hora de Colombia (toISOString usa UTC y después de las 7 p. m. daba mañana)
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

export default function RegistroMecanizado() {
  const { perfil, session } = useAuth()
  const navigate = useNavigate()
  const [aviso, avisar] = useAviso()
  const buscarRef = useRef(null)
  useAtajoBuscar(buscarRef)

  const [catalogo, setCatalogo] = useState([])
  // Productos destino ("<nombre> - MECANIZADO") por clave normalizada → { id, activo }
  const [destinos, setDestinos] = useState({})
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [verAgotados, setVerAgotados] = useState(false)

  const [fecha, setFecha]         = useState(hoyISO())
  const [operarios, setOperarios] = useState([]) // [{ clave, nombre }] — varios si trabajaron en pareja
  const operario = unirOperarios(operarios)

  const [lineas, setLineas]     = useState([]) // [{ itemId, nombre, unidad, cantidad (texto) }]
  const [enviando, setEnviando] = useState(false)
  const [error, setError]       = useState('')
  const [hoy, setHoy]           = useState([])  // lo registrado hoy (salidas MEC de la bodega)

  /* ─── Cargar catálogo ─── */
  const cargarCatalogo = useCallback(async () => {
    setCargando(true)
    try {
      const { data: rawItems, error } = await fetchAllPages((d, h) => supabase
        .from('items')
        .select('id, nombre, unidad_medida, categoria_id')
        .eq('bodega_id', BODEGA_MECANIZADOS)
        .eq('activo', true)
        .order('nombre').order('id').range(d, h))
      if (error) throw error

      const mecanizables = (rawItems || []).filter(i => CATEGORIAS_MECANIZABLES.has(i.categoria_id))

      // El stock disponible sale de la tabla `stock` (la misma que ven Inicio,
      // Inventario y Reportes), no de sumar movimientos: sumar movimientos no
      // respetaba el inventario físico ni las correcciones (ej. pines de pluma, 05/10/2026).
      const [{ data: stockRows, error: eM }, { data: destCat, error: eDest }] = await Promise.all([
        fetchAllPages((d, h) => supabase.from('stock')
          .select('item_id, cantidad_actual')
          .eq('bodega_id', BODEGA_MECANIZADOS)
          .order('item_id').range(d, h)),
        fetchAllPages((d, h) => supabase.from('items')
          .select('id, nombre, activo')
          .eq('categoria_id', CAT_PRODUCTO_MECANIZADO)
          .order('id').range(d, h)),
      ])
      if (eM) throw eM
      if (eDest) throw eDest

      const stockPorItem = {}
      for (const r of stockRows || []) stockPorItem[r.item_id] = Number(r.cantidad_actual ?? 0)

      // Si hay varios con el mismo nombre, gana el activo
      const dest = {}
      for (const d of destCat || []) {
        const k = clave(d.nombre)
        if (!dest[k] || (d.activo && !dest[k].activo)) dest[k] = { id: d.id, nombre: d.nombre, activo: d.activo }
      }
      setDestinos(dest)

      setCatalogo(mecanizables.map(i => ({
        ...i,
        unidad: i.unidad_medida || 'und',
        stock: Math.max(0, stockPorItem[i.id] || 0),
      })))
    } catch (e) {
      setError('Error cargando productos: ' + e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  const cargarHoy = useCallback(async () => {
    const { data } = await supabase.from('movimientos')
      .select('id, numero, cantidad, motivo, items(nombre, unidad_medida)')
      .like('numero', 'MEC-%').eq('tipo', 'salida')
      .eq('bodega_origen_id', BODEGA_MECANIZADOS)
      .eq('fecha_movimiento', hoyISO()).eq('revertido', false)
      .order('created_at', { ascending: false }).limit(200)
    setHoy(data || [])
  }, [])

  useEffect(() => { cargarCatalogo(); cargarHoy() }, [cargarCatalogo, cargarHoy])

  const stockDe = itemId => catalogo.find(i => i.id === itemId)?.stock ?? 0
  const usadoDe = itemId => lineas.filter(l => l.itemId === itemId).reduce((s, l) => s + (parseFloat(l.cantidad) || 0), 0)
  const disponible = itemId => Math.max(0, stockDe(itemId) - usadoDe(itemId))
  // Problema de una fila: falta el producto destino, está inactivo o no alcanza el stock
  const problemaDe = l => {
    const d = destinos[clave(nombreDestino(l.nombre))]
    if (!d) return `No existe «${nombreDestino(l.nombre)}». Créalo en Productos (categoría producto mecanizado) antes de guardar.`
    if (!d.activo) return `«${d.nombre}» está inactivo. Actívalo en Productos antes de guardar.`
    const n = parseFloat(l.cantidad) || 0
    if (n <= 0) return 'La cantidad debe ser mayor a 0.'
    if (n > stockDe(l.itemId)) return `Solo hay ${cant(stockDe(l.itemId))} ${l.unidad}.`
    return null
  }

  /* ─── Agregar / cambiar / quitar piezas ─── */
  const agregar = item => {
    setError('')
    setLineas(prev => prev.some(l => l.itemId === item.id)
      ? prev.map(l => l.itemId === item.id ? { ...l, cantidad: String((parseFloat(l.cantidad) || 0) + 1) } : l)
      : [...prev, { itemId: item.id, nombre: item.nombre, unidad: item.unidad, cantidad: '1' }])
    setBusqueda('')
    buscarRef.current?.focus()
  }
  const cambiarCantidad = (itemId, v) => setLineas(prev => prev.map(l => l.itemId === itemId ? { ...l, cantidad: v.replace(',', '.') } : l))
  const quitar = itemId => setLineas(prev => prev.filter(l => l.itemId !== itemId))

  /* ─── Confirmar ─── */
  const confirmar = async () => {
    setError('')
    const usuarioId = perfil?.id || session?.user?.id
    if (!usuarioId)       { setError('Sesión no cargada. Recarga la página.'); return }
    if (!operario.trim()) { setError('Elige quién mecanizó.'); return }
    if (!fecha)           { setError('Selecciona la fecha.'); return }
    if (!lineas.length)   { setError('Agrega al menos una pieza.'); return }
    const conProblema = lineas.find(problemaDe)
    if (conProblema)      { setError(`${conProblema.nombre}: ${problemaDe(conProblema)}`); return }

    setEnviando(true)
    try {
      // max+1, no conteo de filas: cada MEC inserta varias filas y borrar alguna repetía números
      const numeroMec = await siguienteNumero('movimientos', 'MEC')
      const motivo = `Mecanizado por: ${operario.trim()}`
      const ccMecanizados = await nombreBodega(BODEGA_MECANIZADOS, 'MECANIZADOS') // nombre actual de la bodega
      const movs = []
      lineas.forEach(l => {
        const destinoId = destinos[clave(nombreDestino(l.nombre))].id
        const cantidad = parseFloat(l.cantidad)
        const base = { bodega_origen_id: BODEGA_MECANIZADOS, bodega_destino_id: BODEGA_MECANIZADOS, precio_costo_snapshot: 0, motivo, fecha_movimiento: fecha, centro_costo: ccMecanizados, usuario_id: usuarioId, numero: numeroMec }
        movs.push({ ...base, item_id: l.itemId,   tipo: 'salida',  cantidad })
        movs.push({ ...base, item_id: destinoId, tipo: 'entrada', cantidad })
      })

      const { error } = await supabase.from('movimientos').insert(movs)
      if (error) throw error

      avisar(`${numeroMec} guardado: ${lineas.length} ${lineas.length === 1 ? 'pieza' : 'piezas'} por ${operario.trim()}`,
        { texto: 'Ver', alHacer: () => navigate('/movimientos') })
      setLineas([])
      setOperarios([])
      setFecha(hoyISO())
      await Promise.all([cargarCatalogo(), cargarHoy()])
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  /* ─── Buscador: todas las coincidencias, primero las que tienen existencias ─── */
  const texto = busqueda.trim()
  const coinciden = texto ? catalogo.filter(i => coincideBusqueda(i.nombre, texto)) : []
  const conStock = coinciden.filter(i => disponible(i.id) > 0)
  const agotados = coinciden.filter(i => disponible(i.id) <= 0)
  const resultados = verAgotados ? [...conStock, ...agotados] : conStock

  const totalUnd = lineas.reduce((s, l) => s + (parseFloat(l.cantidad) || 0), 0)
  const hayProblema = lineas.some(problemaDe)
  const totalHoy = hoy.reduce((s, m) => s + Number(m.cantidad || 0), 0)
  const numerosHoy = new Set(hoy.map(m => m.numero)).size

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {aviso}
      <EncabezadoPagina modulo="Mecanizados" titulo="Registrar mecanizado"
        subtitulo={<span className="inline-flex items-center gap-2">Bodega <ChipBodega>MECANIZADOS</ChipBodega></span>}>
        {hoy.length > 0 && (
          <div className="hidden sm:block text-right bg-white border border-feisen-borde rounded-lg px-3 py-1.5 text-xs text-feisen-texto-2">
            Hoy
            <p className="text-base font-semibold text-feisen-texto tabular-nums leading-tight">{cant(totalHoy)} piezas</p>
            {numerosHoy} {numerosHoy === 1 ? 'registro' : 'registros'}
          </div>
        )}
      </EncabezadoPagina>

      {error && <Alerta tipo="error" mensaje={error} />}

      <Bloque>
        <label className="flex items-center gap-2 text-sm text-feisen-texto-2">
          <CalendarDays size={16} /> Fecha
          <input type="date" value={fecha} max={hoyISO()} onChange={e => setFecha(e.target.value)}
            className="border border-feisen-borde rounded-lg px-3 py-2 bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul" />
        </label>
        <div className="flex items-baseline justify-between gap-2 pt-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">¿Quién mecanizó?</h2>
          <span className="text-xs text-gray-400">si fue en pareja, marca a los dos</span>
        </div>
        <SelectorOperarios value={operarios} onChange={setOperarios} />
      </Bloque>

      <Bloque titulo="Piezas" detalle={lineas.length ? `${lineas.length} en la lista` : null}>
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input ref={buscarRef} type="search" value={busqueda} autoComplete="off" aria-label="Buscar pieza"
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); if (conStock[0]) agregar(conStock[0]) }
              if (e.key === 'Escape') setBusqueda('')
            }}
            placeholder="Buscar pieza: “polea 8”, “pin pluma”…"
            className="w-full border border-feisen-borde rounded-lg pl-10 pr-3 py-2.5 bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
        </div>

        {cargando && <div className="flex justify-center py-6"><Spinner /></div>}

        {texto && !cargando && (
          coinciden.length === 0 ? (
            <p className="border border-feisen-borde rounded-lg px-3 py-3 text-sm text-feisen-texto-2">
              Ninguna pieza de Mecanizados tiene “{texto}” en el nombre. Prueba con una sola palabra.
            </p>
          ) : (
            <div className="border border-feisen-borde rounded-lg overflow-y-auto overscroll-contain max-h-[22rem] divide-y divide-feisen-borde-suave">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-feisen-texto-2 bg-feisen-fondo">
                <span>{conStock.length} {conStock.length === 1 ? 'pieza' : 'piezas'} con existencias{resultados.length > 6 ? ' · desliza para ver todas' : ''}</span>
                {agotados.length > 0 && (
                  <button type="button" onClick={() => setVerAgotados(v => !v)} className="text-feisen-azul font-medium">
                    {verAgotados ? 'Ocultar' : 'Ver'} {agotados.length} sin existencias
                  </button>
                )}
              </div>
              {resultados.slice(0, 200).map(i => {
                const d = disponible(i.id)
                return (
                  <button key={i.id} type="button" onClick={() => agregar(i)} disabled={d <= 0}
                    className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[52px] text-left bg-white hover:bg-feisen-fondo disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-feisen-texto break-words">{i.nombre}</span>
                      <span className={`block text-xs tabular-nums ${d > 0 ? 'text-feisen-texto-2' : 'text-feisen-rojo'}`}>
                        {d > 0 ? `Disponible ${cant(d)} ${i.unidad}` : 'Sin existencias'}
                      </span>
                    </span>
                    {d > 0 && <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-feisen-azul-suave text-feisen-azul"><Plus size={16} /></span>}
                  </button>
                )
              })}
            </div>
          )
        )}

        {lineas.length === 0 ? (
          <p className="border border-dashed border-feisen-borde rounded-lg px-4 py-5 text-center text-sm text-feisen-texto-2">
            Busca arriba las piezas que se mecanizaron.
          </p>
        ) : (
          <ul className="border border-feisen-borde rounded-lg overflow-hidden divide-y divide-feisen-borde-suave">
            {lineas.map(l => {
              const problema = problemaDe(l)
              const quedan = stockDe(l.itemId) - (parseFloat(l.cantidad) || 0)
              return (
                <li key={l.itemId} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 ${problema ? 'bg-feisen-rojo-suave' : 'bg-white'}`}>
                  <div className="flex-1 min-w-[12rem]">
                    <p className="text-sm font-semibold text-feisen-texto break-words">{l.nombre}</p>
                    <p className={`text-xs mt-0.5 ${problema ? 'text-feisen-rojo font-medium' : 'text-feisen-texto-2'}`}>
                      {problema || `→ ${nombreDestino(l.nombre)} · quedan ${cant(quedan)} sin mecanizar`}
                    </p>
                  </div>
                  <Contador valor={l.cantidad} onCambiar={v => cambiarCantidad(l.itemId, v)} min={1} etiqueta="Cantidad" ancho="w-14" />
                  <button type="button" onClick={() => quitar(l.itemId)} aria-label={`Quitar ${l.nombre}`}
                    className="w-10 h-10 grid place-items-center rounded-lg text-gray-400 hover:text-feisen-rojo hover:bg-feisen-rojo-suave">
                    <Trash2 size={17} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Bloque>

      {/* Botón principal fijo abajo (encima de la barra de navegación en celular), con el resumen */}
      <div className="sticky bottom-[calc(4.5rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10">
        <div className="flex items-center gap-3 bg-white border border-feisen-borde rounded-xl shadow-sm pl-4 pr-2 py-2">
          <div className="flex-1 min-w-0 text-sm leading-tight">
            <p className="font-semibold text-feisen-texto tabular-nums">
              {lineas.length ? `${lineas.length} ${lineas.length === 1 ? 'pieza' : 'piezas'} · ${cant(totalUnd)} und` : 'Sin piezas'}
            </p>
            <p className={`text-xs truncate ${hayProblema ? 'text-feisen-rojo font-medium' : 'text-feisen-texto-2'}`}>
              {!operarios.length ? 'Elige quién mecanizó'
                : hayProblema ? 'Corrige las filas en rojo'
                : lineas.length ? `Por ${operario}` : 'Agrega al menos una pieza'}
            </p>
          </div>
          <button type="button" onClick={confirmar} disabled={enviando || !lineas.length || !operarios.length || hayProblema}
            className="bg-feisen-azul text-white rounded-lg px-5 min-h-[48px] text-[15px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[.98] transition">
            {enviando ? 'Guardando…' : 'Registrar mecanizado'}
          </button>
        </div>
      </div>

      <Bloque titulo="Registrado hoy" detalle={hoy.length ? `${cant(totalHoy)} piezas` : null}>
        {hoy.length === 0 ? (
          <p className="text-sm text-feisen-texto-2">Todavía no hay mecanizados registrados hoy. Al guardar, aparecen aquí.</p>
        ) : (
          <ul className="divide-y divide-feisen-borde-suave -my-1">
            {hoy.map(m => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-feisen-texto break-words">{m.items?.nombre || 'Producto'}</p>
                  <p className="text-xs text-feisen-texto-2 tabular-nums">{m.numero} · {(m.motivo || '').replace(/^Mecanizado por:\s*/i, '')}</p>
                </div>
                <span className="text-sm font-semibold text-feisen-texto tabular-nums whitespace-nowrap">{cant(m.cantidad)} {m.items?.unidad_medida || 'und'}</span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => navigate('/movimientos')} className="text-sm font-medium text-feisen-azul">Ver historial →</button>
      </Bloque>
    </div>
  )
}
