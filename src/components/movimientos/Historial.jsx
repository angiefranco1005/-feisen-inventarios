import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { esFirma } from '../../utils/firmas'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { COLUMNAS_MOVIMIENTO } from '../../utils/columnasMovimiento'
import { siguienteNumero } from '../../utils/siguienteNumero'
import { useBodegasConsulta } from '../consultor/useBodegasConsulta'
import { coincideBusqueda } from '../../utils/busqueda'
import { EncabezadoPagina, PanelLateral, useAviso, useAtajoBuscar } from '../shared/ui'
import { Search, ArrowUpDown, RotateCcw, Trash2, RefreshCw, X, Pencil, Plus, CalendarDays, MoreHorizontal, FileText, ArrowDownLeft, ArrowUpRight } from '../shared/iconos'

// Devuelve los ajustes de stock que corresponden a un movimiento, con el
// mismo criterio que usa el trigger fn_actualizar_stock en la base de datos
// (ver supabase/schema.sql). `cantidad` puede ser negativa para revertir un
// efecto ya aplicado (eliminar) o positiva para aplicar un delta (editar).
// Usa SIEMPRE bodega_origen_id / bodega_destino_id (las foreign keys reales
// del movimiento) — nunca centro_costo, que es un snapshot de texto que deja
// de coincidir si la bodega se renombra después de crear el movimiento.
function ajustesStockPorTipo(tipo, bodega_origen_id, bodega_destino_id, cantidad) {
  if (['entrada_compra', 'devolucion', 'entrada', 'ajuste_inventario'].includes(tipo)) {
    return bodega_destino_id ? [{ bodega_id: bodega_destino_id, delta: cantidad }] : []
  }
  if (['salida_produccion', 'salida_venta', 'salida'].includes(tipo)) {
    return bodega_origen_id ? [{ bodega_id: bodega_origen_id, delta: -cantidad }] : []
  }
  if (tipo === 'traslado') {
    const ajustes = []
    if (bodega_origen_id)  ajustes.push({ bodega_id: bodega_origen_id,  delta: -cantidad })
    if (bodega_destino_id) ajustes.push({ bodega_id: bodega_destino_id, delta:  cantidad })
    return ajustes
  }
  return []
}

// Ajusta el stock de un producto en una bodega al EDITAR un movimiento (al eliminar,
// lo revierte el trigger fn_revertir_stock_on_delete en la base — no hacerlo también
// aquí o se revierte dos veces). La tabla `stock` no tiene columna `id` — su llave es
// (item_id, bodega_id) —, por eso se busca y actualiza por esas dos columnas. Si el
// producto nunca tuvo stock en esa bodega (pasa al cambiar el producto de un
// movimiento por otro), se crea el renglón. Devuelve un mensaje de error o null.
async function ajustarStock(item_id, bodega_id, delta) {
  const { data: fila, error: errBuscar } = await supabase.from('stock')
    .select('cantidad_actual').eq('item_id', item_id).eq('bodega_id', bodega_id).maybeSingle()
  if (errBuscar) return `no se pudo leer el stock: ${errBuscar.message}`
  if (!fila) {
    const { error } = await supabase.from('stock')
      .insert({ item_id, bodega_id, cantidad_actual: Math.max(0, delta) })
    return error ? `no se pudo crear el stock del producto: ${error.message}` : null
  }
  const { error } = await supabase.from('stock')
    .update({ cantidad_actual: Math.max(0, Number(fila.cantidad_actual) + delta), updated_at: new Date().toISOString() })
    .eq('item_id', item_id).eq('bodega_id', bodega_id)
  return error ? `error al actualizar stock: ${error.message}` : null
}

// Aplica una lista de ajustes de ajustesStockPorTipo. Devuelve los errores (nunca
// falla en silencio).
async function aplicarAjustesStock(item_id, ajustes) {
  if (ajustes.length === 0) return ['no se pudo determinar la bodega del movimiento para ajustar el stock']
  const fallos = []
  for (const aj of ajustes) {
    const f = await ajustarStock(item_id, aj.bodega_id, aj.delta)
    if (f) fallos.push(f)
  }
  return fallos
}

// Bodega cuyo catálogo aplica al movimiento: la que recibe en una entrada, la que
// entrega en una salida (cada bodega tiene su propio renglón de `items`).
const bodegaDelMovimiento = (m) => m.tipo === 'salida' ? m.bodega_origen_id : (m.bodega_destino_id || m.bodega_origen_id)

// Cambiar el producto en el modal de edición: muestra el producto actual con un botón
// "Cambiar producto"; al tocarlo aparece un buscador (palabras sueltas, sin tildes) con
// la lista EN LÍNEA, no flotante — una lista absoluta quedaba oculta/cortada dentro del
// modal con scroll en tablet.
function SelectorProductoEdicion({ items, valorId, onElegir }) {
  const [texto,     setTexto]     = useState('')
  const [buscando,  setBuscando]  = useState(false)
  const actual = items.find(i => i.id === valorId)
  const filtrados = texto.trim() ? items.filter(i => coincideBusqueda(i.nombre, texto)) : items

  if (!buscando) return (
    <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
      <span className="flex-1 min-w-0 text-sm text-gray-800">{actual?.nombre || '—'}</span>
      <button type="button" onClick={() => { setTexto(''); setBuscando(true) }}
        className="shrink-0 bg-feisen-azul text-white rounded-lg px-3 py-2 text-sm font-semibold hover:opacity-90">
        Cambiar producto
      </button>
    </div>
  )

  return (
    <div className="border-2 border-feisen-azul rounded-xl p-2 space-y-2">
      <div className="flex items-center gap-2">
        <input autoFocus value={texto} onChange={e => setTexto(e.target.value)}
          placeholder="Escribe parte del nombre…"
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        <button type="button" onClick={() => setBuscando(false)}
          className="shrink-0 text-sm text-gray-500 px-2 py-2">Cancelar</button>
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
        {filtrados.slice(0, 200).map(i => (
          <button key={i.id} type="button" onClick={() => { onElegir(i); setBuscando(false) }}
            className={`w-full text-left px-3 py-3 text-sm hover:bg-blue-50 rounded-lg
              ${i.id === valorId ? 'font-semibold text-feisen-azul' : 'text-gray-800'}`}>
            {i.nombre}
          </button>
        ))}
        {filtrados.length === 0 && <p className="px-3 py-2.5 text-sm text-gray-400">Sin resultados en esta bodega.</p>}
        {filtrados.length > 200 && <p className="px-3 py-2 text-xs text-gray-400">Mostrando 200 de {filtrados.length}. Escribe más del nombre para acotar.</p>}
      </div>
    </div>
  )
}

// Busca el movimiento "par" de una transferencia entre bodegas (el otro lado
// de la misma operación: una salida y su entrada correspondiente). Los pares
// reales que crea la app comparten el mismo `referencia` (ver aprobar() en
// TransferenciasPendientes.jsx y handleSalida() en
// RegistrarMovimientoAlmacenista.jsx) — NUNCA comparten item_id, porque cada
// bodega tiene su propio renglón de catálogo para el mismo producto. Se
// intenta primero por referencia; si no hay referencia o no aparece nada, cae
// al criterio antiguo (mismo item_id), por compatibilidad con pares viejos
// entre bodegas que comparten catálogo. opts.soloNoRevertidos filtra a
// revertido=false (solo lo usa revertir()).
async function buscarMovimientoPar(m, opts = {}) {
  // Solo una TRANSFERENCIA entre dos bodegas distintas tiene movimiento par. Una entrada de
  // compra/producción (sin bodega origen), una salida externa (sin destino) o un mecanizado
  // (origen = destino = Mecanizados) NO tienen par. Antes se rellenaba la bodega faltante con
  // la otra (`origen || destino`), y entonces una entrada normal "encontraba" como par cualquier
  // movimiento del mismo producto y cantidad dentro de la misma bodega, lo revertía por error y
  // volvía a sumar stock (caso MOV-WA-0026, 15/10/2026).
  if (!m.bodega_origen_id || !m.bodega_destino_id || m.bodega_origen_id === m.bodega_destino_id) return null
  const base = () => {
    let q = supabase.from('movimientos')
      .select(COLS_VINCULO)
      .eq('cantidad', m.cantidad)
      .eq('bodega_origen_id', m.bodega_origen_id)
      .eq('bodega_destino_id', m.bodega_destino_id)
      .neq('tipo', m.tipo)
      .neq('id', m.id)
      .order('created_at', { ascending: false })
      .limit(1)
    if (opts.soloNoRevertidos) q = q.eq('revertido', false)
    return q
  }
  if (m.referencia) {
    const { data } = await base().eq('referencia', m.referencia).maybeSingle()
    if (data) return data
  }
  const { data } = await base().eq('item_id', m.item_id).maybeSingle()
  return data
}

// Columnas de los movimientos "vinculados" (par de una transferencia, reversión, original).
const COLS_VINCULO = 'id, tipo, item_id, cantidad, bodega_origen_id, bodega_destino_id, precio_costo_snapshot, ' +
  'centro_costo, numero, referencia, revertido, revertido_en, pedido_id, items(nombre, unidad_medida)'

// Una fila de REVERSIÓN es el contramovimiento que crea "Revertir": lleva revertido_en y la
// referencia "REVERSIÓN <número>" (o "REVERSIÓN PAR <número>" para el otro lado de una transferencia).
const esFilaReversion = m => !!m.revertido_en && !m.revertido && /^REVERSIÓN /.test(m.referencia || '')

// La reversión que se creó para el movimiento `m` (ya revertido). `usados` evita tomar dos veces la
// misma fila cuando un movimiento tiene dos líneas iguales (mismo producto y cantidad).
async function buscarReversion(m, usados = new Set()) {
  const clave = m.numero || m.id
  const { data, error } = await supabase.from('movimientos').select(COLS_VINCULO)
    .in('referencia', [`REVERSIÓN ${clave}`, `REVERSIÓN PAR ${clave}`])
    .eq('item_id', m.item_id).eq('cantidad', m.cantidad).neq('tipo', m.tipo)
    .not('revertido_en', 'is', null)
    .order('created_at')
  if (error) throw error
  return (data || []).find(r => !usados.has(r.id)) || null
}

// El movimiento original (marcado revertido) de una fila de reversión.
async function buscarOriginal(r, usados = new Set()) {
  const clave = (r.referencia || '').replace(/^REVERSIÓN (PAR )?/, '').trim()
  if (!clave) return null
  let q = supabase.from('movimientos').select(COLS_VINCULO)
    .eq('item_id', r.item_id).eq('cantidad', r.cantidad).neq('tipo', r.tipo).eq('revertido', true)
  q = /^[0-9a-f-]{36}$/i.test(clave) ? q.eq('id', clave) : q.eq('numero', clave)
  const { data, error } = await q.order('created_at')
  if (error) throw error
  return (data || []).find(o => !usados.has(o.id)) || null
}

// Revierte UNA fila: crea el contramovimiento (el trigger fn_actualizar_stock ajusta el stock al
// insertarlo) y marca la original como revertida (el trigger fn_motor_seriales_sync libera/borra
// sus seriales de motor). Si no se puede marcar, borra el contramovimiento recién creado (el
// trigger fn_revertir_stock_on_delete deshace su stock) para no dejar el stock movido dos veces.
// Devuelve un texto de error o null.
async function revertirFila(m, { numero, usuarioId, esPar }) {
  if (m.tipo !== 'entrada' && m.tipo !== 'salida') return `el tipo "${m.tipo}" no se puede revertir desde aquí`
  const esEntrada = m.tipo === 'entrada'
  const bodega = esEntrada ? m.bodega_destino_id : m.bodega_origen_id
  if (!bodega) return 'no tiene bodega registrada, no se sabe de dónde devolver el stock'
  const contra = {
    tipo:                  esEntrada ? 'salida' : 'entrada',
    item_id:               m.item_id,
    bodega_origen_id:      esEntrada ? bodega : null,
    bodega_destino_id:     esEntrada ? null : bodega,
    cantidad:              m.cantidad,
    precio_costo_snapshot: m.precio_costo_snapshot || 0,
    centro_costo:          m.centro_costo || '',
    usuario_id:            usuarioId,
    referencia:            `REVERSIÓN ${esPar ? 'PAR ' : ''}${m.numero || m.id}`,
    revertido:             false,
    revertido_en:          new Date().toISOString(),
    numero,
  }
  const { data: nuevo, error: e1 } = await supabase.from('movimientos').insert(contra).select('id').single()
  if (e1) return `no se pudo crear la reversión: ${e1.message}`
  const { data: marcados, error: e2 } = await supabase.from('movimientos')
    .update({ revertido: true }).eq('id', m.id).eq('revertido', false).select('id')
  if (e2 || !marcados?.length) {
    await supabase.from('movimientos').delete().eq('id', nuevo.id)
    return e2 ? `no se pudo marcar como revertido: ${e2.message}` : 'ya estaba revertido'
  }
  return null
}

// Qué filas hay que borrar para eliminar `m` sin dejar el stock descuadrado:
// - si `m` ya está revertido, también su reversión (entre las dos el stock queda igual);
// - si `m` ES una reversión, también el original que revirtió;
// - si es una transferencia, también su movimiento en la otra bodega (y la reversión de ese).
// Cada fila borrada la deshace el trigger fn_revertir_stock_on_delete. Devuelve
// { filas: [{ fila, motivo }] } o { error }.
async function planEliminacion(m, usados) {
  const filas = []
  const tomar = (fila, motivo) => { filas.push({ fila, motivo }); usados.add(fila.id) }
  const etiqueta = f => `${f.items?.nombre || 'producto'} (${f.numero || 'sin número'})`
  tomar(m, null)
  let original = m
  if (m.revertido) {
    const r = await buscarReversion(m, usados)
    if (!r) return { error: `${etiqueta(m)} ya está revertido y no se encontró su reversión. Eliminarlo movería el stock otra vez; déjalo como está.` }
    tomar(r, 'su reversión')
  } else if (esFilaReversion(m)) {
    const o = await buscarOriginal(m, usados)
    if (o) tomar(o, 'el movimiento que revirtió')
    original = o
  }
  if (original) {
    const par = await buscarMovimientoPar(original, {})
    if (par && !usados.has(par.id)) {
      tomar(par, 'su movimiento en la otra bodega')
      if (par.revertido) {
        const rp = await buscarReversion(par, usados)
        if (!rp) return { error: `El movimiento en la otra bodega de ${etiqueta(m)} ya está revertido y no se encontró su reversión. No se elimina nada.` }
        tomar(rp, 'la reversión del movimiento en la otra bodega')
      }
    }
  }
  return { filas }
}

// Deja constancia en el historial del pedido cuando se revierte, elimina o corrige una entrada
// que llegó por un pedido (el estado del pedido no cambia solo).
async function anotarEnPedidos(filas, accion, usuarioId, detalleDe) {
  const porPedido = {}
  for (const f of filas) if (f.pedido_id && f.tipo === 'entrada') (porPedido[f.pedido_id] ||= []).push(f)
  for (const [pedido_id, fs] of Object.entries(porPedido)) {
    await supabase.from('pedido_historial').insert({ pedido_id, usuario_id: usuarioId, accion, detalle: detalleDe(fs) })
  }
}

export default function Historial() {
  const { perfil, esAdmin, esLogistica, esAlmacenista, esConsultor, bodegasOperacion } = useAuth()
  // Consultor (Ventas): solo lectura de sus bodegas (MOTORES); undefined mientras se resuelven
  const bodegasConsulta = useBodegasConsulta(esConsultor)
  const [searchParams] = useSearchParams()
  const [movimientos,  setMovimientos]  = useState([])
  const [items,        setItems]        = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [busqueda,     setBusqueda]     = useState('')
  const [filtroTipo,   setFiltroTipo]   = useState('todos')
  const [filtroItem,   setFiltroItem]   = useState('')
  const [confirmRevert,      setConfirmRevert]      = useState(null)
  const [revirtiendo,        setRevirtiendo]        = useState(false)
  const [confirmDelete,      setConfirmDelete]      = useState(null)
  const [eliminando,         setEliminando]         = useState(false)
  const [msg,                setMsg]                = useState(null)
  const [busquedaProducto,   setBusquedaProducto]   = useState('') // nombre del producto filtrado desde ?item=
  const [filtroUsuario,      setFiltroUsuario]      = useState('')
  const [editModal,          setEditModal]          = useState(null)
  const [editForm,           setEditForm]           = useState({})
  const [editGuardando,      setEditGuardando]      = useState(false)
  const [editHistorial,      setEditHistorial]      = useState([])
  const [editados,           setEditados]           = useState(new Set())
  const [fechaInicio,        setFechaInicio]        = useState('')
  const [fechaFin,           setFechaFin]           = useState('')
  const [verFechas,          setVerFechas]          = useState(false)
  const [detalle,            setDetalle]            = useState(null) // número del movimiento abierto en el panel
  const [menuLinea,          setMenuLinea]          = useState(null) // línea con las acciones a la vista
  const buscarRef = useRef(null)
  const planVez = useRef(0) // para descartar la revisión de "Eliminar" si el modal ya se cerró
  const [aviso, avisar] = useAviso()
  useAtajoBuscar(buscarRef)

  // Los mensajes de éxito salen como aviso corto abajo; errores y alertas se quedan a la vista
  useEffect(() => {
    if (msg?.tipo === 'exito') { avisar(msg.texto.replace(/^[✅⚠️\s]+/u, '')); setMsg(null) }
  }, [msg])

  function cerrarDetalle() { setDetalle(null); setMenuLinea(null); setMsg(null) }

  useEffect(() => {
    if (esConsultor && bodegasConsulta === undefined) return
    cargar('', '')
  }, [esConsultor ? bodegasConsulta : null])

  // Pre-filtrar por item si viene en la URL (?item=<id>)
  useEffect(() => {
    const itemId = searchParams.get('item')
    if (itemId && items.length > 0) {
      const found = items.find(i => i.id === itemId)
      if (found) {
        setFiltroItem(found.id)
        setBusquedaProducto(found.nombre)
      }
    }
  }, [items, searchParams])

  async function cargar(fi, ff) {
    // fi/ff: fechas explícitas (para evitar timing de estado React)
    // si no se pasan, usa los valores del estado actual
    const inicio = fi !== undefined ? fi : fechaInicio
    const fin    = ff !== undefined ? ff : fechaFin
    const conRango = !!(inicio && fin)

    setCargando(true)
    const verTodo = esAdmin
    // Se arma la consulta con .range() para paginar: el servidor corta en 1000
    // filas por request, así que sin paginar se perdían movimientos en silencio.
    const armarQuery = (desde, hasta) => {
      let q = supabase
        .from('movimientos')
        .select(`${COLUMNAS_MOVIMIENTO}, items(nombre, unidad_medida), profiles(nombre), bodegas_origen:bodega_origen_id(nombre), bodegas_destino:bodega_destino_id(nombre), pedidos(numero)`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })

      if (conRango) {
        // Filtro server-side por rango de fechas: usa fecha_movimiento, con fallback a created_at
        q = q.or(
          `and(fecha_movimiento.gte.${inicio},fecha_movimiento.lte.${fin}),` +
          `and(fecha_movimiento.is.null,created_at.gte.${inicio}T00:00:00,created_at.lte.${fin}T23:59:59)`
        )
      }

      if (esConsultor) {
        // Ventas: movimientos que entran o salen de sus bodegas (sin bodegas → nada)
        const ids = bodegasConsulta?.length ? bodegasConsulta : ['00000000-0000-0000-0000-000000000000']
        q = q.or(`bodega_origen_id.in.(${ids.join(',')}),bodega_destino_id.in.(${ids.join(',')})`)
      } else if (!verTodo) {
        if (esAlmacenista) {
          // Almacenista: solo sus propios movimientos
          q = q.eq('usuario_id', perfil.id)
        } else if (bodegasOperacion?.length) {
          // Jefes de área: solo movimientos que entran o salen de sus bodegas
          q = q.or(
            `bodega_origen_id.in.(${bodegasOperacion.join(',')}),bodega_destino_id.in.(${bodegasOperacion.join(',')})`
          )
        } else {
          q = q.eq('usuario_id', perfil.id)
        }
      }
      return q.range(desde, hasta)
    }

    // Sin rango: los últimos 5.000 (5 páginas pedidas a la vez, no una tras otra). Con rango: todos los del periodo.
    const [{ data: movs, error: errMovs }, { data: its }] = await Promise.all([
      conRango
        ? fetchAllPages(armarQuery)
        : Promise.all([0, 1, 2, 3, 4].map(p => armarQuery(p * 1000, p * 1000 + 999))).then(res => {
            const error = res.find(r => r.error)?.error || null
            // Las páginas van en orden; si una vino incompleta, las siguientes ya no traen nada.
            // Sin repetidos: si alguien registra un movimiento mientras carga, las páginas se corren
            // una fila y la del borde llegaría dos veces.
            const vistos = new Set()
            return { data: res.flatMap(r => r.data || []).filter(m => !vistos.has(m.id) && vistos.add(m.id)), error }
          }),
      fetchAllPages((d, h) => {
        let q = supabase.from('items').select('id, nombre, bodega_id').order('nombre').range(d, h)
        // Ventas solo puede filtrar por los productos de sus bodegas
        if (esConsultor) q = q.in('bodega_id', bodegasConsulta?.length ? bodegasConsulta : ['00000000-0000-0000-0000-000000000000'])
        return q
      }),
    ])
    if (errMovs) {
      setMsg({ tipo: 'error', texto: 'No se pudo cargar el historial: ' + errMovs.message })
    }
    setMovimientos(movs || [])
    setItems(its || [])

    setCargando(false)

    // Cargar indicadores de edición en segundo plano (no bloquea la carga principal)
    supabase.from('movimientos_ediciones').select('movimiento_id').limit(5000)
      .then(({ data: edData }) => setEditados(new Set((edData || []).map(e => e.movimiento_id))))
      .catch(() => {})
  }

  // ── editar movimiento (solo admin) ───────────────────────────────────────
  function abrirEdicion(m) {
    setEditForm({
      item_id:               m.item_id || '',
      fecha_movimiento:      m.fecha_movimiento || new Date(m.created_at).toISOString().split('T')[0],
      cantidad:              String(m.cantidad ?? ''),
      precio_costo_snapshot: String(m.precio_costo_snapshot ?? ''),
      referencia:            m.referencia || '',
      proveedor:             m.proveedor  || '',
      cliente:               m.cliente    || '',
      numero_of:             m.numero_of  || '',
      serial_motor:          m.serial_motor || '',
    })
    setEditHistorial([])
    setEditModal(m)
    supabase.from('movimientos_ediciones')
      .select('*, profiles(nombre)')
      .eq('movimiento_id', m.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setEditHistorial(data || []))
  }

  async function guardarEdicion() {
    setEditGuardando(true)
    const m = editModal
    const LABEL = {
      fecha_movimiento: 'Fecha', cantidad: 'Cantidad', precio_costo_snapshot: 'Precio costo',
      referencia: 'Referencia', proveedor: 'Proveedor', cliente: 'Cliente',
      numero_of: 'N° OF', serial_motor: 'Serial motor',
    }
    const cambios = {}
    for (const campo of Object.keys(LABEL)) {
      const esNum  = campo === 'cantidad' || campo === 'precio_costo_snapshot'
      const viejoRaw = m[campo]
      const viejoStr = esNum ? String(viejoRaw ?? 0) : String(viejoRaw ?? '')
      const nuevoStr = editForm[campo]
      if (viejoStr !== nuevoStr) {
        cambios[campo] = { de: esNum ? parseFloat(viejoRaw ?? 0) : (viejoRaw ?? ''), a: esNum ? parseFloat(nuevoStr) : nuevoStr, label: LABEL[campo] }
      }
    }
    const cambiaProducto = !!editForm.item_id && editForm.item_id !== m.item_id
    if (cambiaProducto) {
      const nuevo = items.find(i => i.id === editForm.item_id)
      cambios.item_id = { de: m.items?.nombre || '', a: nuevo?.nombre || '', label: 'Producto' }
    }
    if (Object.keys(cambios).length === 0) { setEditGuardando(false); setEditModal(null); return }

    // Un movimiento revertido (o una reversión) ya está compensado por su contrario: cambiarle la
    // cantidad o el producto descuadraría el stock. Solo se corrigen los datos de texto/fecha/costo.
    const bloqueado = m.revertido || !!m.revertido_en
    if (bloqueado && (cambios.cantidad || cambiaProducto)) {
      setMsg({ tipo: 'error', texto: 'Este movimiento ya está revertido: no se le puede cambiar la cantidad ni el producto.' })
      setEditGuardando(false); setEditModal(null); return
    }
    if (cambios.cantidad && !(cambios.cantidad.a > 0)) {
      setMsg({ tipo: 'error', texto: 'La cantidad debe ser mayor que cero. Para quitar la línea usa Eliminar.' })
      setEditGuardando(false); setEditModal(null); return
    }

    const updates = Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v.a]))
    if (cambiaProducto) updates.item_id = editForm.item_id

    // El otro lado de una transferencia se busca ANTES de guardar (la búsqueda usa la cantidad actual)
    const par = (cambios.cantidad || cambiaProducto) ? await buscarMovimientoPar(m) : null

    const { error } = await supabase.from('movimientos').update(updates).eq('id', m.id)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message }); setEditGuardando(false); return }

    // Ajustar stock si cambió la cantidad o el producto — usa las FKs reales del
    // movimiento (bodega_origen_id/bodega_destino_id), nunca centro_costo.
    // Cambio de producto: se deshace el efecto sobre el producto anterior y se
    // aplica completo (con la cantidad nueva) sobre el producto correcto.
    let fallosStock = []
    const cantVieja = Number(m.cantidad ?? 0)
    const cantNueva = cambios.cantidad ? cambios.cantidad.a : cantVieja
    const ajustesDe = (cant) => ajustesStockPorTipo(m.tipo, m.bodega_origen_id, m.bodega_destino_id, cant)
    if (cambiaProducto) {
      if (m.item_id) fallosStock = await aplicarAjustesStock(m.item_id, ajustesDe(-cantVieja))
      fallosStock = [...fallosStock, ...await aplicarAjustesStock(editForm.item_id, ajustesDe(cantNueva))]
    } else if (cantNueva !== cantVieja && m.item_id) {
      fallosStock = await aplicarAjustesStock(m.item_id, ajustesDe(cantNueva - cantVieja))
    }

    await supabase.from('movimientos_ediciones').insert({ movimiento_id: m.id, usuario_id: perfil.id, cambios })

    // Transferencia: la cantidad del otro lado (en la otra bodega) se corrige igual, con su stock
    if (par && cambios.cantidad && !par.revertido) {
      const { error: errPar } = await supabase.from('movimientos').update({ cantidad: cantNueva }).eq('id', par.id)
      if (errPar) fallosStock.push(`no se pudo corregir la cantidad del movimiento en la otra bodega (${par.numero || 'par'}): ${errPar.message}`)
      else {
        fallosStock.push(...await aplicarAjustesStock(par.item_id,
          ajustesStockPorTipo(par.tipo, par.bodega_origen_id, par.bodega_destino_id, cantNueva - Number(par.cantidad ?? 0))))
        await supabase.from('movimientos_ediciones').insert({ movimiento_id: par.id, usuario_id: perfil.id,
          cambios: { cantidad: { de: Number(par.cantidad ?? 0), a: cantNueva, label: `Cantidad (igual que ${m.numero || 'su par'})` } } })
      }
    }

    if (cambios.cantidad || cambiaProducto) {
      await anotarEnPedidos([m], 'Entrada corregida', perfil.id, () =>
        `${m.numero || ''} · ${[cambiaProducto && `producto ${cambios.item_id.de} → ${cambios.item_id.a}`, cambios.cantidad && `cantidad ${cant(cambios.cantidad.de)} → ${cant(cambios.cantidad.a)}`].filter(Boolean).join(', ')}`)
    }

    if (fallosStock.length > 0) {
      setMsg({ tipo: 'error', texto: `El movimiento se editó, pero el stock no se pudo ajustar automáticamente (${fallosStock.join('; ')}). Corrígelo manualmente.` })
    } else if (cambiaProducto) {
      // Una transferencia tiene su otro lado en la bodega destino/origen, con su propio
      // renglón de catálogo: ese no se cambia solo, hay que editarlo también.
      setMsg(par
        ? { tipo: 'alerta', texto: `Producto corregido. Este movimiento es parte de una transferencia: edita también ${par.numero || 'el movimiento par'} para cambiar el producto en la otra bodega.` }
        : { tipo: 'exito', texto: `Producto corregido: ${cambios.item_id.de} → ${cambios.item_id.a}. El stock se movió al producto correcto.` })
    } else {
      setMsg({ tipo: 'exito', texto: `Cambios guardados en ${m.numero || 'el movimiento'}` })
    }

    setEditados(prev => new Set([...prev, m.id]))
    setEditGuardando(false)
    setEditModal(null)
    cargar()
  }

  async function generarNumero() {
    // max+1 entre los MOV-NNNN (los MOV-XX-NNNN con iniciales no cuentan); el conteo
    // de filas repetía números en cuanto se eliminaba un movimiento
    return siguienteNumero('movimientos', 'MOV')
  }

  // ── revertir (solo admin) ────────────────────────────────────────────────
  // `lineas`: una línea (desde su menú ···) o todas las del movimiento. Las reversiones de un
  // mismo movimiento comparten un número nuevo, así se ven como un solo movimiento contrario.
  async function revertir(lineas) {
    setRevirtiendo(true)
    setMsg(null)
    const errores = []
    const hechos = new Set()
    const revertidas = []
    let numero = null, numeroPar = null
    for (const m of lineas) {
      if (hechos.has(m.id) || m.revertido || m.revertido_en) continue
      hechos.add(m.id)
      const nombre = m.items?.nombre || 'Producto'
      try { numero ||= await generarNumero() }
      catch (e) { errores.push('No se pudo generar el número: ' + e.message); break }
      // El par se busca ANTES de marcar el original (la búsqueda filtra los no revertidos)
      const par = await buscarMovimientoPar(m, { soloNoRevertidos: true })
      const err = await revertirFila(m, { numero, usuarioId: perfil.id, esPar: false })
      if (err) { errores.push(`${nombre}: ${err}`); continue }
      revertidas.push(m)
      if (par && !hechos.has(par.id)) {
        hechos.add(par.id)
        let errPar
        try {
          numeroPar ||= await generarNumero()
          errPar = await revertirFila(par, { numero: numeroPar, usuarioId: perfil.id, esPar: true })
        } catch (e) { errPar = e.message }
        if (errPar) errores.push(`${nombre} se revirtió, pero no su movimiento en la otra bodega (${par.numero || 'par'}): ${errPar}. Corrígelo a mano.`)
        else revertidas.push(par)
      }
    }
    await anotarEnPedidos(revertidas, 'Entrada revertida', perfil.id,
      fs => `${[...new Set(fs.map(f => f.numero))].join(', ')} · ${fs.map(f => `${f.items?.nombre || 'producto'} (${cant(f.cantidad)})`).join(', ')} · reversión ${numero}`)

    if (errores.length) setMsg({ tipo: 'error', texto: (revertidas.length ? `Se revirtió una parte (${numero}). ` : 'No se revirtió. ') + errores.join(' · ') })
    else if (revertidas.length) setMsg({ tipo: 'exito', texto: `${lineas.length === 1 ? (lineas[0].items?.nombre || 'Movimiento') : `${detalle || 'Movimiento'}`} revertido (${numero})` })
    setRevirtiendo(false)
    setConfirmRevert(null)
    cargar()
  }

  // ── eliminar (solo admin) ────────────────────────────────────────────────
  // Antes de confirmar se arma el plan (qué filas se borran y por qué) para mostrarlo en el modal.
  async function abrirEliminar(lineas) {
    const vez = ++planVez.current
    // Si se cerró el modal (o se abrió otro) mientras se revisaba, no se vuelve a abrir
    const mostrar = estado => setConfirmDelete(prev => (prev && planVez.current === vez) ? estado : prev)
    setConfirmDelete({ lineas, cargando: true })
    const usados = new Set()
    const filas = []
    try {
      for (const m of lineas) {
        if (usados.has(m.id)) continue
        const plan = await planEliminacion(m, usados)
        if (plan.error) { mostrar({ lineas, error: plan.error }); return }
        filas.push(...plan.filas)
      }
      mostrar({ lineas, filas })
    } catch (e) {
      mostrar({ lineas, error: 'No se pudo revisar el movimiento: ' + e.message })
    }
  }

  async function eliminarMovimiento({ lineas, filas }) {
    setEliminando(true)
    setMsg(null)
    const ids = filas.map(f => f.fila.id)
    // Un solo DELETE: se borran todas o ninguna. El stock lo devuelve el trigger
    // fn_revertir_stock_on_delete con las bodegas reales de cada fila (la pantalla no lo toca).
    const { data: borradas, error } = await supabase.from('movimientos').delete().in('id', ids).select('id')
    if (error) {
      setMsg({ tipo: 'error', texto: 'No se eliminó: ' + error.message })
      setEliminando(false)
      setConfirmDelete(null)
      return
    }
    await anotarEnPedidos(filas.map(f => f.fila).filter(f => !f.revertido && !f.revertido_en), 'Entrada eliminada', perfil.id,
      fs => `${[...new Set(fs.map(f => f.numero))].join(', ')} · ${fs.map(f => `${f.items?.nombre || 'producto'} (${cant(f.cantidad)})`).join(', ')} · eliminada desde el historial de movimientos`)
    const fuera = new Set(ids)
    setMovimientos(prev => prev.filter(mov => !fuera.has(mov.id)))
    if ((borradas?.length ?? ids.length) < ids.length) {
      setMsg({ tipo: 'alerta', texto: `Se eliminaron ${borradas.length} de ${ids.length} filas (las demás ya no existían). Revisa el stock.` })
    } else {
      setMsg({ tipo: 'exito', texto: lineas.length === 1
        ? `${lineas[0].items?.nombre || 'Producto'} eliminado de ${lineas[0].numero || 'el movimiento'}`
        : `${lineas[0].numero || 'Movimiento'} eliminado` })
    }
    if (lineasDetalle.every(l => fuera.has(l.id))) setDetalle(null)
    setConfirmDelete(null)
    setEliminando(false)
  }

  // Lista de usuarios únicos para el filtro (solo para admin/logística)
  const usuariosUnicos = (esAdmin || esLogistica)
    ? Object.values(
        movimientos.reduce((acc, m) => {
          if (m.usuario_id && m.profiles?.nombre && !acc[m.usuario_id]) {
            acc[m.usuario_id] = { id: m.usuario_id, nombre: m.profiles.nombre }
          }
          return acc
        }, {})
      ).sort((a, b) => a.nombre.localeCompare(b.nombre))
    : []

  // Búsqueda por palabras sueltas, sin tildes, en número, producto, proveedor, quién recibe, OF…
  const textoBusqueda = m => [m.numero, m.items?.nombre, m.referencia, m.serial_motor, m.numero_of, m.proveedor, m.cliente, m.destino].filter(Boolean).join(' ')
  const filtradosBase = movimientos.filter(m =>
    (!filtroItem || m.item_id === filtroItem) &&
    (!filtroUsuario || m.usuario_id === filtroUsuario) &&
    (!busqueda.trim() || coincideBusqueda(textoBusqueda(m), busqueda))
  )

  // Agrupar por número de movimiento: un movimiento con 12 productos es una sola fila
  const gruposBase = Object.values(
    filtradosBase.reduce((acc, m) => {
      const key = m.numero || m.id
      if (!acc[key]) acc[key] = { numero: key, lineas: [], tipo: m.tipo, created_at: m.created_at, revertido: m.revertido }
      acc[key].lineas.push(m)
      return acc
    }, {})
  )
  const esEditado = g => g.lineas.some(l => editados.has(l.id))
  const conteos = {
    todos:    gruposBase.length,
    salida:   gruposBase.filter(g => g.tipo === 'salida').length,
    entrada:  gruposBase.filter(g => g.tipo === 'entrada').length,
    editados: gruposBase.filter(esEditado).length,
  }
  const grupos = gruposBase.filter(g =>
    filtroTipo === 'todos' || (filtroTipo === 'editados' ? esEditado(g) : g.tipo === filtroTipo))

  // Secciones por día (Hoy, Ayer, martes 21 de octubre…)
  const porDia = []
  for (const g of grupos) {
    const clave = claveDia(g.lineas[0])
    let sec = porDia.find(s => s.clave === clave)
    if (!sec) { sec = { clave, grupos: [] }; porDia.push(sec) }
    sec.grupos.push(g)
  }
  porDia.sort((a, b) => b.clave.localeCompare(a.clave))

  // Detalle abierto: todas las líneas del movimiento (sin filtros)
  const lineasDetalle = detalle ? movimientos.filter(m => (m.numero || m.id) === detalle) : []

  // Firma y foto de la remisión: no vienen en la lista (pesan mucho), se piden al abrir el detalle
  const [imagenes, setImagenes] = useState({})   // id de la primera línea -> { firma_receptor_url, foto_remision_url }
  const idImagenes = lineasDetalle[0]?.id
  useEffect(() => {
    if (!idImagenes || imagenes[idImagenes]) return
    supabase.from('movimientos').select('firma_receptor_url, foto_remision_url').eq('id', idImagenes).maybeSingle()
      .then(({ data }) => setImagenes(prev => ({ ...prev, [idImagenes]: data || {} })))
  }, [idImagenes])

  // Spinner solo en la primera carga: al refrescar (después de editar, revertir…) la lista y el panel se quedan
  if (cargando && movimientos.length === 0) return <Spinner texto="Cargando historial..." />

  const hayFechas = !!(fechaInicio && fechaFin)

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {aviso}
      <EncabezadoPagina modulo="Inventarios" titulo="Historial de movimientos"
        subtitulo={esAdmin ? 'Todo lo que entra y sale de las bodegas.' : esAlmacenista ? 'Los movimientos que tú registraste.' : 'Lo que entra y sale de tu bodega.'}>
        <button onClick={() => cargar(fechaInicio, fechaFin)} title="Actualizar" aria-label="Actualizar"
          className="p-2.5 rounded-lg border border-feisen-borde bg-white text-feisen-texto-2 hover:bg-feisen-fondo transition-colors">
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
        </button>
        {!esConsultor && (
          <Link to="/movimientos/nuevo"
            className="inline-flex items-center gap-1.5 bg-feisen-azul text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:opacity-90 active:scale-[.98] transition">
            <Plus size={16} /> Nuevo movimiento
          </Link>
        )}
      </EncabezadoPagina>

      {msg && !(detalle && lineasDetalle.length > 0) && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Búsqueda y filtros */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input ref={buscarRef} type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por número, producto, proveedor, OF, quién recibe…"
            className="w-full border border-feisen-borde rounded-lg pl-10 pr-10 py-2.5 bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
          <kbd className="hidden lg:block absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 border border-feisen-borde rounded px-1.5">/</kbd>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
          {[['todos', 'Todos'], ['salida', 'Salidas'], ['entrada', 'Entradas'], ['editados', 'Editados']].map(([k, t]) => (
            <button key={k} type="button" aria-pressed={filtroTipo === k} onClick={() => setFiltroTipo(k)}
              className={`shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors
                ${filtroTipo === k ? 'bg-feisen-texto text-white border-feisen-texto' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
              {t} <span className={`tabular-nums ${filtroTipo === k ? 'text-white/70' : 'text-gray-400'}`}>{conteos[k].toLocaleString('es-CO')}</span>
            </button>
          ))}
          <button type="button" aria-pressed={verFechas || hayFechas} onClick={() => setVerFechas(v => !v)}
            className={`shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors
              ${hayFechas ? 'bg-feisen-azul-suave text-feisen-azul border-transparent' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
            <CalendarDays size={15} />
            {hayFechas ? `${fechaCorta(fechaInicio)} – ${fechaCorta(fechaFin)}` : 'Fechas'}
          </button>
          {(esAdmin || esLogistica) && usuariosUnicos.length > 0 && (
            <select value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)} aria-label="Filtrar por usuario"
              className={`shrink-0 min-h-[36px] rounded-full border px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-feisen-azul-suave
                ${filtroUsuario ? 'bg-feisen-azul-suave text-feisen-azul border-transparent' : 'bg-white text-feisen-texto-2 border-feisen-borde'}`}>
              <option value="">Todos los usuarios</option>
              {usuariosUnicos.map(u => <option key={u.id} value={u.id}>{u.nombre.split(' ').slice(0, 2).join(' ')}</option>)}
            </select>
          )}
          {filtroItem && (
            <button type="button" onClick={() => { setFiltroItem(''); setBusquedaProducto('') }}
              className="shrink-0 inline-flex items-center gap-1 min-h-[36px] bg-feisen-azul-suave text-feisen-azul rounded-full pl-3 pr-2 text-sm font-medium">
              {busquedaProducto || 'Un producto'} <X size={14} />
            </button>
          )}
        </div>

        {verFechas && (
          <div className="flex flex-wrap items-end gap-3 bg-white border border-feisen-borde rounded-xl px-4 py-3">
            <label className="text-xs font-medium text-feisen-texto-2 space-y-1">
              <span className="block">Desde</span>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                className="border border-feisen-borde rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-feisen-azul" />
            </label>
            <label className="text-xs font-medium text-feisen-texto-2 space-y-1">
              <span className="block">Hasta</span>
              <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                className="border border-feisen-borde rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-feisen-azul" />
            </label>
            <button onClick={() => { cargar(fechaInicio, fechaFin); setVerFechas(false) }} disabled={!fechaInicio || !fechaFin}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-feisen-azul text-white disabled:opacity-40 hover:opacity-90">
              Ver periodo
            </button>
            {(fechaInicio || fechaFin) && (
              <button onClick={() => { setFechaInicio(''); setFechaFin(''); cargar('', ''); setVerFechas(false) }}
                className="px-3 py-2.5 rounded-lg text-sm text-feisen-texto-2 border border-feisen-borde hover:bg-feisen-fondo">
                Quitar fechas
              </button>
            )}
            <p className="w-full text-xs text-gray-400">
              {hayFechas ? 'Se muestran todos los movimientos del periodo.' : 'Sin fechas se muestran los últimos 5.000 movimientos.'}
            </p>
          </div>
        )}
      </div>

      {/* Lista agrupada por día */}
      {porDia.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl text-center px-6 py-14">
          <ArrowUpDown size={32} className="mx-auto mb-3 text-gray-300" />
          {busqueda.trim()
            ? <><p className="font-medium text-feisen-texto">Nada coincide con “{busqueda.trim()}”</p>
                <p className="text-sm text-feisen-texto-2 mt-1">Busca por número (SAL-MG-0141) o por una palabra del producto.</p></>
            : <><p className="font-medium text-feisen-texto">No hay movimientos con este filtro</p>
                <p className="text-sm text-feisen-texto-2 mt-1">Prueba con “Todos” o cambia las fechas.</p></>}
        </div>
      ) : porDia.map(sec => (
        <section key={sec.clave} className="space-y-1.5">
          <h2 className="text-xs font-semibold text-feisen-texto-2 px-0.5">
            {etiquetaDia(sec.clave)} <span className="font-normal text-gray-400">· {sec.grupos.length} {sec.grupos.length === 1 ? 'movimiento' : 'movimientos'}</span>
          </h2>
          <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden divide-y divide-feisen-borde-suave">
            {sec.grupos.map(g => filaMovimiento(g))}
          </div>
        </section>
      ))}
      <p className="text-xs text-gray-400 text-right tabular-nums">
        {grupos.length.toLocaleString('es-CO')} {grupos.length === 1 ? 'movimiento' : 'movimientos'}
        {hayFechas ? ' en el periodo' : ' · últimos 5.000 registros'}
      </p>

      {/* Panel de detalle */}
      {detalle && lineasDetalle.length > 0 && panelDetalle(lineasDetalle)}

      {/* Modal confirmación eliminación (muestra todo lo que se va a borrar) */}
      {confirmDelete && (
        <Modal titulo={confirmDelete.lineas.length > 1 ? `Eliminar ${confirmDelete.lineas[0].numero || 'movimiento'}` : 'Eliminar del movimiento'}
          onCerrar={() => { if (!eliminando) setConfirmDelete(null) }}>
          <div className="space-y-4">
            {confirmDelete.cargando && <Spinner texto="Revisando qué se elimina…" />}
            {confirmDelete.error && <Alerta tipo="error" mensaje={confirmDelete.error} />}
            {confirmDelete.filas && (
              <>
                <p className="text-sm text-feisen-texto">
                  {confirmDelete.filas.length === 1 ? 'Se elimina esta línea:' : `Se eliminan estas ${confirmDelete.filas.length} líneas:`}
                </p>
                <ul className="border border-feisen-borde-suave rounded-lg divide-y divide-feisen-borde-suave max-h-60 overflow-y-auto">
                  {confirmDelete.filas.map(({ fila, motivo }) => (
                    <li key={fila.id} className="px-3 py-2 text-sm flex items-start gap-2">
                      <span className="flex-1 min-w-0">
                        <span className="block text-feisen-texto break-words">{fila.items?.nombre || 'Producto'}</span>
                        <span className="block text-xs text-feisen-texto-2">
                          {[fila.numero, fila.tipo === 'salida' ? 'Salida' : 'Entrada', motivo].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="tabular-nums font-medium text-feisen-texto whitespace-nowrap">
                        {fila.tipo === 'salida' ? '−' : '+'}{cant(fila.cantidad)} {fila.items?.unidad_medida}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-feisen-texto-2">
                  {confirmDelete.filas.some(f => f.motivo === 'su reversión' || f.motivo === 'el movimiento que revirtió')
                    ? 'El movimiento y su reversión se eliminan juntos, así que ese stock no cambia. '
                    : ''}
                  El stock de cada bodega queda como si estas líneas nunca se hubieran registrado.
                </p>
                {confirmDelete.filas.some(f => f.fila.pedido_id && f.fila.tipo === 'entrada' && !f.fila.revertido) && (
                  <Alerta tipo="alerta" mensaje="Esta entrada llegó por un pedido: queda anotado en el historial del pedido, pero el pedido no cambia de estado." />
                )}
                <p className="text-xs text-feisen-texto-2">Esto no se puede deshacer. Si solo quieres anular el efecto y dejar rastro, usa Revertir.</p>
              </>
            )}
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} disabled={eliminando}
                className="flex-1 border border-feisen-borde rounded-lg py-2.5 text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">
                Cancelar
              </button>
              {confirmDelete.filas && (
                <button onClick={() => eliminarMovimiento(confirmDelete)} disabled={eliminando}
                  className="flex-1 bg-feisen-rojo text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 active:scale-[.98] transition">
                  {eliminando ? 'Eliminando…' : 'Eliminar'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal editar movimiento */}
      {editModal && (
        <Modal titulo={`Editar ${editModal.numero || 'movimiento'}`} onCerrar={() => setEditModal(null)}>
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            <div className="flex items-center gap-2 text-sm">
              <BadgeTipo tipo={editModal.tipo} />
              <span className="font-medium text-feisen-texto">{editModal.items?.nombre}</span>
            </div>
            <div>
              <label className="text-xs text-feisen-texto-2 font-medium block mb-1">Producto</label>
              {(editModal.revertido || editModal.revertido_en) ? (
                <p className="text-xs text-feisen-texto-2 bg-feisen-fondo rounded-lg px-3 py-2">
                  Ya está revertido: el producto y la cantidad no se pueden cambiar (descuadraría el stock). Puedes corregir los demás datos.
                </p>
              ) : <SelectorProductoEdicion
                items={items.filter(i => i.bodega_id === bodegaDelMovimiento(editModal))}
                valorId={editForm.item_id}
                onElegir={async (it) => {
                  setEditForm(p => ({ ...p, item_id: it.id }))
                  // El costo del movimiento pasa a ser el del producto correcto
                  if (it.id !== editModal.item_id) {
                    const { data } = await supabase.from('items').select('precio_costo').eq('id', it.id).maybeSingle()
                    if (data?.precio_costo != null) setEditForm(p => ({ ...p, precio_costo_snapshot: String(data.precio_costo) }))
                  }
                }} />}
              {editForm.item_id && editForm.item_id !== editModal.item_id && (
                <p className="text-xs text-amber-700 mt-1">
                  Al guardar, el stock se devuelve a "{editModal.items?.nombre}" y se descuenta/suma del producto nuevo.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'fecha_movimiento', label: 'Fecha', type: 'date' },
                { key: 'cantidad',         label: 'Cantidad', type: 'number' },
                { key: 'precio_costo_snapshot', label: 'Precio costo ($)', type: 'number' },
                { key: 'numero_of',        label: 'N° OF', type: 'text' },
                { key: 'proveedor',        label: 'Proveedor', type: 'text' },
                { key: 'cliente',          label: 'Cliente / recibió', type: 'text' },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="text-xs text-feisen-texto-2 font-medium block mb-1">{label}</label>
                  <input type={type} step={type === 'number' ? '0.001' : undefined}
                    disabled={key === 'cantidad' && !!(editModal.revertido || editModal.revertido_en)}
                    value={editForm[key] ?? ''}
                    onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full border border-feisen-borde rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave disabled:bg-feisen-fondo disabled:text-gray-400" />
                </div>
              ))}
            </div>
            {[
              { key: 'referencia', label: 'Referencia / notas' },
              { key: 'serial_motor', label: 'Serial motor' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs text-feisen-texto-2 font-medium block mb-1">{label}</label>
                <input type="text" value={editForm[key] ?? ''}
                  onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                  className="w-full border border-feisen-borde rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave disabled:bg-feisen-fondo disabled:text-gray-400" />
              </div>
            ))}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditModal(null)}
                className="flex-1 border border-feisen-borde rounded-lg py-2.5 text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">
                Cancelar
              </button>
              <button onClick={guardarEdicion} disabled={editGuardando}
                className="flex-1 bg-feisen-azul text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 active:scale-[.98] transition">
                {editGuardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>

            {/* Historial de cambios */}
            {editHistorial.length > 0 && (
              <div className="border-t border-feisen-borde-suave pt-4 space-y-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Historial de cambios</p>
                {editHistorial.map(e => (
                  <div key={e.id} className="bg-feisen-fondo rounded-lg px-3 py-2.5 text-xs space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-feisen-texto">{e.profiles?.nombre || '—'}</span>
                      <span className="text-gray-400">{new Date(e.created_at).toLocaleString('es-CO')}</span>
                    </div>
                    {Object.entries(e.cambios || {}).map(([campo, val]) => (
                      <p key={campo} className="text-feisen-texto-2">
                        <span className="font-medium">{val.label || campo}:</span>{' '}
                        <span className="line-through">{String(val.de ?? '—')}</span>
                        {' → '}
                        <span className="font-medium text-feisen-texto">{String(val.a ?? '—')}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal confirmación reversión */}
      {confirmRevert && (() => {
        const aRevertir = confirmRevert.filter(l => !l.revertido && !l.revertido_en)
        const hayTransferencia = aRevertir.some(l => l.bodega_origen_id && l.bodega_destino_id && l.bodega_origen_id !== l.bodega_destino_id)
        const pedido = aRevertir.find(l => l.pedido_id && l.tipo === 'entrada')?.pedidos?.numero
        return (
          <Modal titulo={confirmRevert.length > 1 ? `Revertir ${confirmRevert[0].numero || 'movimiento'}` : 'Revertir'}
            onCerrar={() => { if (!revirtiendo) setConfirmRevert(null) }}>
            <div className="space-y-4">
              <p className="text-sm text-feisen-texto">
                {aRevertir.length === 1
                  ? <>Se crea un movimiento contrario para <b>{aRevertir[0].items?.nombre}</b> ({cant(aRevertir[0].cantidad)} {aRevertir[0].items?.unidad_medida})</>
                  : <>Se crea un movimiento contrario para las <b>{aRevertir.length} líneas</b></>}
                {' '}y el stock vuelve a como estaba ({aRevertir[0]?.tipo === 'salida' ? 'la cantidad regresa a la bodega' : 'la cantidad se descuenta de la bodega'}).
                {' '}El movimiento original queda en el historial marcado como revertido.
              </p>
              {aRevertir.length < confirmRevert.length && (
                <p className="text-xs text-feisen-texto-2">{confirmRevert.length - aRevertir.length} {confirmRevert.length - aRevertir.length === 1 ? 'línea ya estaba revertida y no se toca' : 'líneas ya estaban revertidas y no se tocan'}.</p>
              )}
              {hayTransferencia && <Alerta tipo="alerta" mensaje="Es una transferencia entre bodegas: también se revierte su movimiento en la otra bodega." />}
              {pedido && <Alerta tipo="alerta" mensaje={`Esta entrada llegó por el pedido ${pedido}: queda anotado en el historial del pedido, pero el pedido no cambia de estado.`} />}
              <div className="flex gap-3">
                <button onClick={() => setConfirmRevert(null)} disabled={revirtiendo}
                  className="flex-1 border border-feisen-borde rounded-lg py-2.5 text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">
                  Cancelar
                </button>
                <button onClick={() => revertir(aRevertir)} disabled={revirtiendo || aRevertir.length === 0}
                  className="flex-1 bg-feisen-rojo text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 active:scale-[.98] transition">
                  {revirtiendo ? 'Revirtiendo…' : 'Revertir'}
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}
    </div>
  )

  // ── Fila de la lista ─────────────────────────────────────────────────────
  // Se llaman como funciones (no como <Componente/>) para que React no las remonte en cada render
  function filaMovimiento(g) {
    const primera = g.lineas[0]
    const esSalida = g.tipo === 'salida'
    const unidades = new Set(g.lineas.map(l => l.items?.unidad_medida || ''))
    const total = g.lineas.reduce((s, l) => s + Number(l.cantidad || 0), 0)
    const contraparte = contraparteDe(primera)
    const valorTotal = esAdmin ? g.lineas.reduce((s, l) => s + (l.precio_costo_snapshot || 0) * (l.cantidad || 0), 0) : 0
    return (
      <button key={g.numero} type="button" onClick={() => setDetalle(g.numero)} aria-current={detalle === g.numero}
        className={`w-full text-left grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 min-h-[64px] transition-colors
          ${detalle === g.numero ? 'bg-feisen-azul-suave' : 'hover:bg-feisen-fondo'} ${g.revertido ? 'opacity-60' : ''}`}>
        <IconoTipo tipo={g.tipo} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-feisen-texto">{g.numero}</span>
            <BadgeTipo tipo={g.tipo} />
            {esEditado(g) && <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-amber-50 text-amber-700">Editado</span>}
            {g.revertido && <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-gray-100 text-gray-500">Revertido</span>}
            {g.lineas.some(l => l.revertido_en) && <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-feisen-rojo-suave text-feisen-rojo">Reversión</span>}
          </span>
          <span className="block text-sm text-feisen-texto truncate mt-0.5">{resumenProductos(g.lineas)}</span>
          {(contraparte || (esAdmin && primera.profiles?.nombre)) && (
            <span className="block text-xs text-feisen-texto-2 truncate">
              {[contraparte, esAdmin ? primera.profiles?.nombre?.split(' ')[0] : null].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <span className="text-right">
          <span className="block text-sm font-semibold text-feisen-texto tabular-nums whitespace-nowrap">
            {unidades.size === 1
              ? `${esSalida ? '−' : '+'}${cant(total)} ${[...unidades][0]}`
              : `${g.lineas.length} productos`}
          </span>
          <span className="block text-xs text-gray-400 tabular-nums whitespace-nowrap">
            {esAdmin && valorTotal > 0 && <span className="hidden sm:inline">{cop(valorTotal)} · </span>}{hora(g.created_at)}
          </span>
        </span>
      </button>
    )
  }

  // ── Panel lateral con el detalle del movimiento ──────────────────────────
  function panelDetalle(lineas) {
    const p = { ...lineas[0], ...(imagenes[lineas[0].id] || {}) }
    const esSalida = p.tipo === 'salida'
    const valorTotal = lineas.reduce((s, l) => s + (l.precio_costo_snapshot || 0) * (l.cantidad || 0), 0)
    const bodegas = [p.bodegas_origen?.nombre, p.bodegas_destino?.nombre].filter(Boolean)
    const revertibles = lineas.filter(l => !l.revertido && !l.revertido_en)
    const menuPorLinea = esAdmin && lineas.length > 1 // con una sola línea bastan los botones de arriba
    const dato = (t, v) => v ? <div key={t}><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t}</dt><dd className="text-sm text-feisen-texto mt-0.5 break-words">{v}</dd></div> : null
    const firmas = [
      esFirma(p.foto_remision_url) && { t: 'Firma del responsable', src: p.foto_remision_url },
      p.firma_receptor_url && { t: 'Firma de quien recibe', src: p.firma_receptor_url },
    ].filter(Boolean)
    return (
      <PanelLateral etiqueta={`Detalle de ${detalle}`} onCerrar={cerrarDetalle} encabezado={
        <div className="space-y-1.5">
          <h3 className="font-mono text-base font-semibold text-feisen-texto">{detalle}</h3>
          <div className="flex flex-wrap gap-1.5">
            <BadgeTipo tipo={p.tipo} />
            {lineas.some(l => editados.has(l.id)) && <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-amber-50 text-amber-700">Editado</span>}
            {p.revertido && <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-gray-100 text-gray-500">Revertido</span>}
          </div>
        </div>
      }>
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {dato('Fecha', `${fechaLarga(claveDia(p))} · ${hora(p.created_at)}`)}
          {dato('Registró', p.profiles?.nombre)}
          {dato(bodegas.length > 1 ? 'Bodegas' : 'Bodega', bodegas.join(' → '))}
          {dato(esSalida ? 'Recibió' : 'Proveedor', esSalida ? p.cliente : p.proveedor)}
          {dato('Destino', p.destino)}
          {dato('N° OF / orden', p.numero_of)}
          {dato('Pedido', p.pedidos?.numero)}
          {dato(p.proveedor === 'Producción interna' ? 'Colada' : 'Notas', p.referencia)}
          {dato('Serial motor', p.serial_motor)}
          {esAdmin && valorTotal > 0 && dato('Valor', cop(valorTotal))}
        </dl>

        {esAdmin && (
          <section aria-label="Acciones del movimiento" className="space-y-1.5">
            <div className="flex flex-wrap gap-2">
              {lineas.length === 1 && (
                <button type="button" onClick={() => abrirEdicion(lineas[0])}
                  className="inline-flex items-center gap-1.5 border border-feisen-borde rounded-lg px-3 py-2 text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
                  <Pencil size={16} /> Editar
                </button>
              )}
              {revertibles.length > 0 && (
                <button type="button" onClick={() => setConfirmRevert(lineas)}
                  className="inline-flex items-center gap-1.5 border border-feisen-borde rounded-lg px-3 py-2 text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
                  <RotateCcw size={16} /> {lineas.length > 1 ? 'Revertir todo' : 'Revertir'}
                </button>
              )}
              <button type="button" onClick={() => abrirEliminar(lineas)}
                className="inline-flex items-center gap-1.5 border border-feisen-borde rounded-lg px-3 py-2 text-sm font-medium text-feisen-rojo hover:bg-feisen-rojo-suave">
                <Trash2 size={16} /> {lineas.length > 1 ? 'Eliminar todo' : 'Eliminar'}
              </button>
            </div>
            {lineas.length > 1 && (
              <p className="text-xs text-feisen-texto-2">Para editar, revertir o quitar un solo producto, usa <MoreHorizontal size={14} weight="bold" className="inline -mt-0.5" /> en su línea.</p>
            )}
          </section>
        )}

        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1 flex justify-between">
            <span>Productos · {lineas.length}</span><span>Cantidad</span>
          </h4>
          <ul className="divide-y divide-feisen-borde-suave">
            {lineas.map(m => {
              const esReversion = !!m.revertido_en
              const abiertoMenu = menuLinea === m.id
              return (
                <li key={m.id} className="py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-feisen-texto break-words">{m.items?.nombre || 'Producto eliminado'}</p>
                      <p className="flex flex-wrap gap-1.5 mt-0.5">
                        {editados.has(m.id) && <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-amber-50 text-amber-700">Editado</span>}
                        {esReversion && <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-feisen-rojo-suave text-feisen-rojo">Reversión</span>}
                        {esAdmin && m.precio_costo_snapshot > 0 && <span className="text-xs text-gray-400 tabular-nums">{cop(m.precio_costo_snapshot * m.cantidad)}</span>}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-feisen-texto tabular-nums whitespace-nowrap pt-px">
                      {esSalida ? '−' : '+'}{cant(m.cantidad)} {m.items?.unidad_medida}
                    </span>
                    {menuPorLinea && (
                      <button type="button" onClick={() => setMenuLinea(abiertoMenu ? null : m.id)}
                        aria-label={`Acciones de ${m.items?.nombre || 'la línea'}`} aria-expanded={abiertoMenu}
                        className={`-my-1 p-2 rounded-lg text-feisen-texto-2 hover:text-feisen-texto hover:bg-feisen-fondo ${abiertoMenu ? 'bg-feisen-fondo text-feisen-texto' : ''}`}>
                        <MoreHorizontal size={20} weight="bold" />
                      </button>
                    )}
                  </div>
                  {menuPorLinea && abiertoMenu && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button type="button" onClick={() => { setMenuLinea(null); abrirEdicion(m) }}
                        className="inline-flex items-center gap-1.5 border border-feisen-borde rounded-lg px-3 py-2 text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
                        <Pencil size={14} /> Editar
                      </button>
                      {!m.revertido && !esReversion && (
                        <button type="button" onClick={() => { setMenuLinea(null); setConfirmRevert([m]) }}
                          className="inline-flex items-center gap-1.5 border border-feisen-borde rounded-lg px-3 py-2 text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
                          <RotateCcw size={14} /> Revertir
                        </button>
                      )}
                      <button type="button" onClick={() => { setMenuLinea(null); abrirEliminar([m]) }}
                        className="inline-flex items-center gap-1.5 border border-feisen-borde rounded-lg px-3 py-2 text-sm font-medium text-feisen-rojo hover:bg-feisen-rojo-suave">
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {firmas.map(f => (
          <section key={f.t}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{f.t}</h4>
            <div className="border border-feisen-borde-suave rounded-lg bg-feisen-fondo">
              <img src={f.src} alt={f.t} className="w-full max-h-40 object-contain" />
            </div>
          </section>
        ))}
        {p.foto_remision_url && !esFirma(p.foto_remision_url) && (
          <a href={p.foto_remision_url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-feisen-azul font-medium hover:underline">
            <FileText size={15} /> Ver remisión
          </a>
        )}
      </PanelLateral>
    )
  }
}

// ── Ayudas de formato ───────────────────────────────────────────────────────
const cant = n => Number(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
const cop  = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const hora = f => new Date(f).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
const claveDia = m => m.fecha_movimiento || new Date(m.created_at).toLocaleDateString('en-CA')
const fechaCorta = d => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
function fechaLarga(clave) {
  const d = new Date(clave + 'T12:00:00')
  const conAnio = d.getFullYear() !== new Date().getFullYear()
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', ...(conAnio ? { year: 'numeric' } : {}) })
}
function etiquetaDia(clave) {
  const hoy = new Date()
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1)
  if (clave === hoy.toLocaleDateString('en-CA')) return 'Hoy'
  if (clave === ayer.toLocaleDateString('en-CA')) return 'Ayer'
  const t = fechaLarga(clave)
  return t.charAt(0).toUpperCase() + t.slice(1)
}
function resumenProductos(lineas) {
  const n = lineas.map(l => l.items?.nombre || 'Producto eliminado')
  if (n.length === 1) return n[0]
  if (n.length === 2) return `${n[0]} y ${n[1]}`
  return `${n[0]} y ${n.length - 1} más`
}
// A quién o de dónde: destino interno, quien recibe o proveedor
function contraparteDe(m) {
  if (m.destino) return `→ ${m.destino}`
  if (m.tipo === 'salida') return m.cliente ? `Recibió ${m.cliente}` : (m.bodegas_destino?.nombre ? `→ ${m.bodegas_destino.nombre}` : null)
  if (m.bodegas_origen?.nombre && m.bodegas_destino?.nombre && m.bodegas_origen.nombre !== m.bodegas_destino.nombre) return `Desde ${m.bodegas_origen.nombre}`
  return m.proveedor || null
}

function IconoTipo({ tipo }) {
  const entrada = tipo !== 'salida'
  return (
    <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${entrada ? 'bg-feisen-azul-suave text-feisen-azul' : 'bg-feisen-fondo text-feisen-texto-2'}`}>
      {entrada ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
    </span>
  )
}
function BadgeTipo({ tipo }) {
  return tipo === 'salida'
    ? <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-gray-100 text-feisen-texto-2">Salida</span>
    : <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-feisen-azul-suave text-feisen-azul">{tipo === 'entrada' ? 'Entrada' : tipo}</span>
}
