import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { esBodegaFundicion, nombreBodega } from '../../utils/bodegasCatalogo'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { Plus, Search, Package, AlertTriangle, Upload, RefreshCw, Download, Wrench, ArrowUpDown, X } from '../shared/iconos'
import { exportarInventarioActual } from '../../utils/exportExcel'
import { coincideBusqueda } from '../../utils/busqueda'
import DetalleProducto, { ESTADOS, colorNivel } from './DetalleProducto'
import ModalMinimosSugeridos from './ModalMinimosSugeridos'

const UNIDADES = ['unidad', 'kg', 'g', 'lb', 'm', 'cm', 'm²', 'L', 'ml', 'galón', 'rollo', 'par', 'caja', 'bulto', 'juego']

const BODEGA_MECANIZADOS      = '03a709ac-0bee-457a-80a1-0a1603218d34'
const CAT_PRODUCTO_MECANIZADO = 'bff5d482-1647-426c-a88f-dedd72ff5b06'
const CATEGORIAS_MECANIZABLES = new Set([
  'cfa47941-3a0e-4fc8-a9c5-6a676bbb5c50', // FERRETERIA - MECANIZADOS
  '549c8036-364a-433b-b18f-d4a444c9f9a2', // ACEROS
  'a735b04a-9bd7-424b-b695-1ac8ce1a5bf4', // FUNDICIÓN - MECANIZADOS
])

export default function GestionProductos() {
  const navigate = useNavigate()
  const { perfil, esAdmin, bodegasPermitidas, bodegasOperacion } = useAuth()
  // Solo ADMIN ve todas las bodegas y el valor del inventario; el resto (Logística incluida) solo su bodega asignada
  const puedeEditar = esAdmin || perfil?.rol === 'LOGISTICA' || perfil?.rol === 'ALMACENISTA' || perfil?.rol === 'OPERARIO' || perfil?.rol === 'JEFE_FUNDICION' || perfil?.rol === 'JEFE_MECANIZADOS' || perfil?.rol === 'JEFE_ENSAMBLE' || perfil?.rol === 'RRHH'
  const puedeBorrar = (item) => esAdmin || (puedeEditar && (bodegasOperacion === null || bodegasOperacion.includes(item.bodega_id)))

  const [items,      setItems]      = useState([])
  const [categorias, setCategorias] = useState([])
  const [bodegas,    setBodegas]    = useState([])
  const [cargando,   setCargando]   = useState(true)
  const [busqueda,        setBusqueda]        = useState('')
  const [filtroBodega,    setFiltroBodega]    = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroEstado,    setFiltroEstado]    = useState('') // '', agotado, bajo, sinmin, inactivo
  const [detalleId,       setDetalleId]       = useState(null)
  const [modalSugeridos,  setModalSugeridos]  = useState(false)
  const [msg,             setMsg]             = useState(null)
  const [modal,      setModal]      = useState(false)
  const [editando,   setEditando]   = useState(null)
  const [confirm,    setConfirm]    = useState(null)
  const [subiendo,   setSubiendo]   = useState(false)
  const [pagina,     setPagina]     = useState(1)
  const POR_PAGINA = 25

  // ── Estado modal Mecanizar ──────────────────────────────────────────────────
  const [modalMecanizar,  setModalMecanizar]  = useState(false)
  const [itemMecanizar,   setItemMecanizar]   = useState(null)
  const [formMec,         setFormMec]         = useState({ cantidad: '1', operario: '' })
  const [guardandoMec,    setGuardandoMec]    = useState(false)

  const FORM0 = { nombre: '', categoria_id: '', bodega_id: '', unidad_medida: 'unidad', precio_costo: '', stock_minimo: '0', stock_maximo: '0', foto_url: '', peso_unitario: '', cantidad_inicial: '0' }
  const [form, setForm] = useState(FORM0)

  useEffect(() => { cargar() }, [])
  useEffect(() => { setPagina(1) }, [busqueda, filtroBodega, filtroCategoria, filtroEstado])

  async function cargar() {
    setCargando(true)

    // Si no es admin y no tiene bodegas asignadas → no ve nada
    if (!esAdmin && bodegasPermitidas !== null && bodegasPermitidas.length === 0) {
      setItems([]); setCategorias([]); setBodegas([])
      setCargando(false); return
    }

    // Construir base de query de items — stock embebido para no depender de query separada
    const buildItemsQ = (from, to) => {
      let q = supabase.from('items')
        .select('*, categorias(nombre), bodegas!bodega_id(nombre), stock(item_id, bodega_id, cantidad_actual)')
        .order('nombre').range(from, to)
      if (!esAdmin && bodegasPermitidas) q = q.in('bodega_id', bodegasPermitidas)
      return q
    }

    const [
      { data: it, error: e1 },
      { data: cats, error: e2 },
      { data: bods, error: e3 },
    ] = await Promise.all([
      fetchAllPages(buildItemsQ),
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('bodegas').select('*').eq('activo', true).order('nombre'),
    ])
    if (e1 || e2 || e3) {
      const errMsg = (e1 || e2 || e3)?.message || 'Error desconocido'
      setMsg({ tipo: 'error', texto: `Error cargando datos: ${errMsg}` })
    }
    // Índice de stock construido desde el stock embebido en cada item
    const stockIdx = {}
    for (const i of it) {
      for (const s of (i.stock || [])) {
        if (!stockIdx[i.id]) stockIdx[i.id] = []
        stockIdx[i.id].push({ bodega_id: s.bodega_id, cantidad_actual: s.cantidad_actual })
      }
    }

    // También traemos stock separado para la lógica de "extra items" (usuarios con bodegas limitadas)
    // Se pagina con fetchAllPages(): un .limit() no puede superar el tope de
    // filas por request del servidor (1000 por defecto), y el viejo doble
    // .range(0,999)/.range(1000,1999) solo cubría 2000 filas en total — si
    // el stock ya pasó de ahí, igual se recortaba. Ver OBSERVACIONES.md,
    // 2026-10-03.
    const { data: stockData } = await fetchAllPages((desde, hasta) =>
      supabase.from('stock').select('item_id, bodega_id, cantidad_actual').range(desde, hasta)
    )
    const allStock = stockData || []
    for (const s of allStock) {
      if (!stockIdx[s.item_id]) stockIdx[s.item_id] = []
      // Evitar duplicados si ya lo tenemos del join embebido
      if (!stockIdx[s.item_id].some(x => x.bodega_id === s.bodega_id)) {
        stockIdx[s.item_id].push({ bodega_id: s.bodega_id, cantidad_actual: s.cantidad_actual })
      }
    }

    let todosItems = (it || []).map(i => ({ ...i, stock: stockIdx[i.id] || [] }))

    // Cada perfil solo ve los ítems de su propia bodega (bodega_id coincide con sus bodegas asignadas)

    setItems(todosItems)
    // Para no-admin: filtrar categorías y bodegas visibles
    if (!esAdmin && bodegasPermitidas) {
      setCategorias((cats || []).filter(c => bodegasPermitidas.includes(c.bodega_id)))
      setBodegas((bods || []).filter(b => bodegasPermitidas.includes(b.id)))
    } else {
      setCategorias(cats || [])
      setBodegas(bods || [])
    }
    setCargando(false)
  }

  function abrirNuevo() {
    setEditando(null)
    setForm(FORM0)
    setMsg(null)
    setModal(true)
  }

  function abrirEditar(item) {
    setEditando(item)
    setForm({
      nombre:           item.nombre,
      categoria_id:     item.categoria_id  || '',
      bodega_id:        item.bodega_id     || '',
      unidad_medida:    item.unidad_medida,
      precio_costo:     item.precio_costo  || '',
      stock_minimo:     item.stock_minimo  || '0',
      stock_maximo:     item.stock_maximo  || '0',
      foto_url:         item.foto_url      || '',
      peso_unitario:    item.peso_unitario ?? '',
      cantidad_inicial: '0',
    })
    setMsg(null)
    setModal(true)
  }

  async function subirFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    const ext  = file.name.split('.').pop()
    const path = `${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('productos-fotos').upload(path, file)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al subir foto.' }); setSubiendo(false); return }
    const { data: { publicUrl } } = supabase.storage.from('productos-fotos').getPublicUrl(path)
    setForm(f => ({ ...f, foto_url: publicUrl }))
    setSubiendo(false)
  }

  async function guardar(e) {
    e.preventDefault()
    setMsg(null)
    const bodega = bodegas.find(b => b.id === form.bodega_id)
    const esFundicion = esBodegaFundicion(bodega)
    const payload = {
      nombre:        form.nombre.trim(),
      categoria_id:  form.categoria_id  || null,
      bodega_id:     form.bodega_id     || null,
      centro_costo:  bodega?.nombre     || '',
      unidad_medida: form.unidad_medida,
      precio_costo:  (esAdmin || perfil?.rol === 'ALMACENISTA' || perfil?.rol === 'LOGISTICA') ? (parseFloat(form.precio_costo) || 0) : undefined,
      stock_minimo:  parseFloat(form.stock_minimo) || 0,
      stock_maximo:  parseFloat(form.stock_maximo) || 0,
      foto_url:      form.foto_url      || null,
      peso_unitario: esFundicion ? (parseFloat(form.peso_unitario) || null) : null,
      updated_at:    new Date().toISOString(),
    }
    if (!esAdmin && perfil?.rol !== 'ALMACENISTA' && perfil?.rol !== 'LOGISTICA') delete payload.precio_costo

    let error
    if (editando) {
      ({ error } = await supabase.from('items').update(payload).eq('id', editando.id))
      if (error) { setMsg({ tipo: 'error', texto: 'Error: ' + error.message }); return }
    } else {
      const { data: newItem, error: e1 } = await supabase.from('items').insert(payload).select('id').single()
      if (e1) { setMsg({ tipo: 'error', texto: 'Error: ' + e1.message }); return }

      // Stock inicial (solo si la bodega está definida)
      if (newItem?.id && form.bodega_id) {
        const cantInicial = parseFloat(form.cantidad_inicial) || 0
        const { error: e2 } = await supabase.from('stock').upsert(
          { item_id: newItem.id, bodega_id: form.bodega_id, cantidad_actual: cantInicial },
          { onConflict: 'item_id,bodega_id' }
        )
        if (e2) { setMsg({ tipo: 'error', texto: 'Producto creado pero error al guardar stock: ' + e2.message }); cargar(); return }
      }
    }
    setMsg({ tipo: 'exito', texto: editando ? 'Producto actualizado.' : 'Producto creado.' })
    setModal(false)
    cargar()
  }

  async function eliminar(item) {
    const [{ count: cs }, { count: cm }] = await Promise.all([
      supabase.from('stock').select('*', { count: 'exact', head: true }).eq('item_id', item.id),
      supabase.from('movimientos').select('*', { count: 'exact', head: true }).eq('item_id', item.id),
    ])
    if (cs > 0 || cm > 0) {
      setMsg({ tipo: 'error', texto: `"${item.nombre}" tiene stock o movimientos. Desactívalo en su lugar.` })
      setConfirm(null); return
    }
    await supabase.from('items').delete().eq('id', item.id)
    setConfirm(null)
    cargar()
  }

  // ── Mecanizado ─────────────────────────────────────────────────────────────
  function abrirMecanizar(item) {
    setItemMecanizar(item)
    setFormMec({ cantidad: '1', operario: '' })
    setMsg(null)
    setModalMecanizar(true)
  }

  async function ejecutarMecanizado(e) {
    e.preventDefault()
    setMsg(null)
    setGuardandoMec(true)

    const cantidad = parseFloat(formMec.cantidad)
    if (!cantidad || cantidad <= 0) {
      setMsg({ tipo: 'error', texto: 'Ingresa una cantidad válida.' })
      setGuardandoMec(false); return
    }

    const stockDisp = getStock(itemMecanizar)
    if (stockDisp !== null && cantidad > stockDisp) {
      setMsg({ tipo: 'error', texto: `Stock insuficiente. Disponible: ${stockDisp}` })
      setGuardandoMec(false); return
    }

    // Buscar el item destino "- MECANIZADO"
    // normaliza() colapsa espacios dobles/triples a uno solo — algunos nombres del catálogo
    // tienen espacios de más por error de tipeo, y eso hacía que la búsqueda exacta fallara.
    const normaliza = (s) => s.toUpperCase().trim().replace(/\s+/g, ' ')
    const nombreTarget = normaliza(itemMecanizar.nombre) + ' - MECANIZADO'
    const itemTarget = items.find(i =>
      normaliza(i.nombre) === nombreTarget &&
      i.categoria_id === CAT_PRODUCTO_MECANIZADO &&
      i.bodega_id === BODEGA_MECANIZADOS
    )
    if (!itemTarget) {
      setMsg({ tipo: 'error', texto: `No se encontró "${nombreTarget}" en la base de datos.` })
      setGuardandoMec(false); return
    }

    const hoy    = new Date().toISOString().split('T')[0]
    const ccMecanizados = await nombreBodega(BODEGA_MECANIZADOS, 'MECANIZADOS') // nombre actual de la bodega
    const motivo = formMec.operario.trim()
      ? `Mecanizado por: ${formMec.operario.trim()}`
      : 'Proceso de mecanizado'

    // Salida de materia prima
    const { error: e1 } = await supabase.from('movimientos').insert({
      item_id:               itemMecanizar.id,
      bodega_origen_id:      BODEGA_MECANIZADOS,
      tipo:                  'salida',
      cantidad,
      precio_costo_snapshot: itemMecanizar.precio_costo || 0,
      motivo,
      fecha_movimiento:      hoy,
      centro_costo:          ccMecanizados,
      usuario_id:            perfil?.id,
    })
    if (e1) { setMsg({ tipo: 'error', texto: 'Error al registrar salida: ' + e1.message }); setGuardandoMec(false); return }

    // Entrada a producto mecanizado
    const { error: e2 } = await supabase.from('movimientos').insert({
      item_id:               itemTarget.id,
      bodega_origen_id:      BODEGA_MECANIZADOS,
      bodega_destino_id:     BODEGA_MECANIZADOS,
      tipo:                  'entrada',
      cantidad,
      precio_costo_snapshot: itemTarget.precio_costo || 0,
      motivo,
      fecha_movimiento:      hoy,
      centro_costo:          ccMecanizados,
      usuario_id:            perfil?.id,
    })
    if (e2) { setMsg({ tipo: 'error', texto: 'Error al registrar entrada: ' + e2.message }); setGuardandoMec(false); return }

    setModalMecanizar(false)
    setGuardandoMec(false)
    setMsg({ tipo: 'exito', texto: `${cantidad} und mecanizadas correctamente.` })
    cargar()
  }

  async function toggleActivo(item) {
    await supabase.from('items').update({ activo: !item.activo }).eq('id', item.id)
    cargar()
  }

  // Existencia que el perfil puede ver: admin suma todas las bodegas; el resto solo las suyas
  function getStock(item) {
    const filas = (item.stock || []).filter(s => !bodegasPermitidas || bodegasPermitidas.includes(s.bodega_id))
    if (filas.length === 0) return null
    return filas.reduce((t, r) => t + (Number(r.cantidad_actual) || 0), 0)
  }

  function estadoDe(item) {
    if (!item.activo) return 'inactivo'
    const cant = getStock(item) ?? 0
    if (cant <= 0) return 'agotado'
    if (item.stock_minimo > 0) return cant <= item.stock_minimo ? 'bajo' : 'ok'
    return 'sinmin'
  }

  const verValor = esAdmin
  const verCosto = esAdmin || perfil?.rol === 'ALMACENISTA' || perfil?.rol === 'LOGISTICA'
  const nombreBodegaPorId = useMemo(() => Object.fromEntries(bodegas.map(b => [b.id, b.nombre])), [bodegas])
  const nombreBodega = id => nombreBodegaPorId[id] || '—'
  // Columna/filtro de bodega solo si el perfil ve más de una
  const variasBodegas = bodegas.length > 1

  // Alcance: productos de la bodega elegida (o todas las visibles)
  const enBodega = items.filter(i => !filtroBodega || i.bodega_id === filtroBodega)
  const activos  = items.filter(i => i.activo)
  const conteo = { agotado: 0, bajo: 0, sinmin: 0, ok: 0, inactivo: 0 }
  enBodega.forEach(i => { conteo[estadoDe(i)]++ })
  const kpi = { agotado: 0, bajo: 0, sinmin: 0 }
  activos.forEach(i => { const e = estadoDe(i); if (e in kpi) kpi[e]++ })
  const valorTotal = verValor
    ? activos.reduce((t, i) => t + (getStock(i) || 0) * (Number(i.precio_costo) || 0), 0)
    : 0

  // Franja de bodegas (solo administración): valor y agotados de cada una
  const resumenBodegas = verValor ? bodegas.map(b => {
    const suyos = activos.filter(i => i.bodega_id === b.id)
    const valor = activos.reduce((t, i) => t + (i.stock || []).filter(s => s.bodega_id === b.id)
      .reduce((u, s) => u + (Number(s.cantidad_actual) || 0) * (Number(i.precio_costo) || 0), 0), 0)
    return { ...b, valor, productos: suyos.length, agotados: suyos.filter(i => estadoDe(i) === 'agotado').length }
  }).filter(b => b.productos > 0 || b.valor > 0) : []
  const maxValorBodega = Math.max(1, ...resumenBodegas.map(b => b.valor))

  // Categorías con conteo, tomadas de los productos visibles en la bodega elegida
  const categoriasConConteo = Object.values(enBodega.reduce((acc, i) => {
    const id = i.categoria_id || '__sin__'
    acc[id] = acc[id] || { id, nombre: i.categorias?.nombre || 'Sin categoría', n: 0 }
    acc[id].n++
    return acc
  }, {})).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const filtrados = enBodega.filter(i => {
    const e = estadoDe(i)
    const matchEstado    = filtroEstado ? e === filtroEstado : e !== 'inactivo'
    const matchCategoria = !filtroCategoria || (i.categoria_id || '__sin__') === filtroCategoria
    const matchBusqueda  = coincideBusqueda(`${i.nombre} ${i.categorias?.nombre || ''}`, busqueda)
    return matchEstado && matchCategoria && matchBusqueda
  })

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const paginados    = filtrados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA)

  const detalle = detalleId ? items.find(i => i.id === detalleId) : null
  const hayFiltros = busqueda || filtroCategoria || filtroEstado || filtroBodega
  const fmt = n => Number(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })
  const millones = n => n >= 1e6 ? `$${(n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M` : `$${Math.round(n).toLocaleString('es-CO')}`
  const pctNivel = (item) => {
    const q = getStock(item) || 0
    const tope = Math.max(Number(item.stock_maximo) || 0, (Number(item.stock_minimo) || 0) * 3, q, 1)
    return Math.min(100, (q / tope) * 100)
  }
  const toggleEstado = e => setFiltroEstado(v => v === e ? '' : e)

  if (cargando) return <Spinner texto="Cargando productos..." />

  if (!esAdmin && bodegasPermitidas !== null && bodegasPermitidas.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 space-y-2">
        <Package size={40} className="mx-auto text-gray-300" />
        <h1 className="text-lg font-semibold text-feisen-texto">No tienes una bodega asignada</h1>
        <p className="text-sm text-feisen-texto-2">Pide a administración que te asigne una bodega en Configuración → Usuarios para ver sus productos.</p>
      </div>
    )
  }

  const EstadoBadge = ({ e }) => <span className={`text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${ESTADOS[e].clase}`}>{ESTADOS[e].texto}</span>

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400">Inventarios</p>
          <h1 className="text-xl font-semibold text-feisen-texto">Productos y stock</h1>
          <p className="text-sm text-feisen-texto-2 mt-0.5">
            {esAdmin
              ? 'Existencias de todas las bodegas y lo que necesita atención.'
              : <>Bodega asignada{bodegas.length > 1 ? 's' : ''}{' '}
                  {bodegas.map(b => <span key={b.id} className="inline-block bg-feisen-azul-suave text-feisen-azul font-semibold text-xs px-2 py-0.5 rounded-md mr-1">{b.nombre}</span>)}
                  · Solo ves los productos de tu bodega.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargar} title="Refrescar" className="p-2 rounded-lg border border-feisen-borde bg-white text-feisen-texto-2 hover:bg-feisen-fondo">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => exportarInventarioActual(filtrados.map(i => ({ ...i, stock: [{ cantidad_actual: getStock(i) ?? 0 }] })))}
            title="Descargar Excel de lo que estás viendo"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-feisen-borde bg-white text-feisen-texto-2 hover:bg-feisen-fondo text-sm font-medium">
            <Download size={15} /> Excel
          </button>
          <button onClick={() => navigate('/movimientos/nuevo')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-feisen-borde bg-white text-feisen-texto hover:bg-feisen-fondo text-sm font-medium">
            <ArrowUpDown size={15} /> Registrar movimiento
          </button>
          {puedeEditar && (
            <button onClick={abrirNuevo} className="flex items-center gap-1.5 bg-feisen-azul text-white px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90">
              <Plus size={16} /> Nuevo producto
            </button>
          )}
        </div>
      </div>

      {msg && !modal && !modalMecanizar && !confirm && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Indicadores: los de excepción filtran la lista */}
      <div className={`grid grid-cols-2 gap-3 ${verValor ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {verValor && (
          <div className="bg-white border border-feisen-borde rounded-xl px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Valor del inventario</p>
            <p className="text-2xl font-semibold text-feisen-texto tabular-nums mt-0.5">{millones(valorTotal)}</p>
            <p className="text-xs text-feisen-texto-2">{bodegas.length} bodegas · a precio de costo</p>
          </div>
        )}
        {[
          { e: 'agotado', t: 'Agotados',           ctx: 'Existencia en cero',     punto: 'bg-feisen-rojo', cifra: 'text-feisen-rojo' },
          { e: 'bajo',    t: 'Bajo el mínimo',     ctx: 'Hay que pedir pronto',   punto: 'bg-amber-500',   cifra: 'text-amber-700' },
          { e: 'sinmin',  t: 'Sin mínimo definido', ctx: `de ${fmt(activos.length)} productos activos`, punto: 'bg-gray-400', cifra: 'text-feisen-texto' },
        ].map(k => (
          <button key={k.e} onClick={() => toggleEstado(k.e)} aria-pressed={filtroEstado === k.e}
            className={`text-left bg-white border rounded-xl px-4 py-3 transition-colors ${!verValor && k.e === 'sinmin' ? 'col-span-2 lg:col-span-1' : ''} ${filtroEstado === k.e ? 'border-feisen-azul ring-1 ring-feisen-azul' : 'border-feisen-borde hover:border-gray-300'}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${k.punto}`} />{k.t}</p>
            <p className={`text-2xl font-semibold tabular-nums mt-0.5 ${k.cifra}`}>{fmt(kpi[k.e])}</p>
            <p className="text-xs text-feisen-texto-2">{k.ctx}</p>
          </button>
        ))}
      </div>

      {/* Aviso de mínimos: sin mínimo, las alertas de stock bajo no pueden avisar */}
      {puedeEditar && activos.length > 0 && kpi.sinmin / activos.length > 0.3 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-amber-50 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 hidden sm:block" />
          <p className="text-sm text-feisen-texto flex-1">
            <b>Las alertas de stock bajo casi no están avisando.</b> Solo {fmt(activos.length - kpi.sinmin)} de {fmt(activos.length)} productos
            {esAdmin ? '' : ' de tu bodega'} tienen un mínimo configurado. Te sugerimos uno por producto según lo que salió en los últimos 90 días.
          </p>
          <button onClick={() => setModalSugeridos(true)}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-amber-300 text-sm font-medium text-amber-800 hover:bg-amber-100 whitespace-nowrap">
            Revisar sugerencias
          </button>
        </div>
      )}

      {/* Franja de bodegas — solo administración */}
      {verValor && resumenBodegas.length > 1 && (
        <section className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
          <div className="flex items-baseline justify-between px-4 py-2.5 border-b border-feisen-borde-suave">
            <h2 className="text-sm font-semibold text-feisen-texto">Valor por bodega</h2>
            <span className="text-xs text-gray-400">Toca una bodega para filtrar</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
            {resumenBodegas.map(b => (
              <button key={b.id} onClick={() => { setFiltroBodega(v => v === b.id ? '' : b.id); setFiltroCategoria('') }} aria-pressed={filtroBodega === b.id}
                className={`text-left px-4 py-3 border-r border-b border-feisen-borde-suave space-y-1.5 min-w-0 ${filtroBodega === b.id ? 'bg-feisen-azul-suave' : 'hover:bg-feisen-fondo'}`}>
                <p className="text-xs font-medium text-feisen-texto-2 truncate">{b.nombre}</p>
                <p className="text-[15px] font-semibold tabular-nums text-feisen-texto">{millones(b.valor)}</p>
                <div className="h-1 rounded-full bg-feisen-borde-suave overflow-hidden">
                  <div className="h-full bg-feisen-azul rounded-full" style={{ width: `${Math.max(b.valor ? 2 : 0, (b.valor / maxValorBodega) * 100)}%` }} />
                </div>
                <p className="text-[11px] text-gray-400">{b.agotados ? <span className="text-feisen-rojo font-semibold">{b.agotados} agotados</span> : 'Sin agotados'} · {fmt(b.productos)} prod.</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Lista */}
      <section className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-feisen-borde-suave">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Escribe parte del nombre: polea 8, correa, rodamiento…" aria-label="Buscar producto por nombre"
              className="w-full border border-feisen-borde rounded-lg pl-9 pr-8 py-2 text-sm bg-feisen-fondo focus:outline-none focus:ring-2 focus:ring-feisen-azul focus:bg-white" />
            {busqueda && (
              <button onClick={() => setBusqueda('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
            )}
          </div>
          {variasBodegas && !verValor && (
            <select value={filtroBodega} onChange={e => { setFiltroBodega(e.target.value); setFiltroCategoria('') }} aria-label="Filtrar por bodega"
              className={`border rounded-lg px-3 py-2 text-sm max-w-full ${filtroBodega ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul' : 'border-feisen-borde bg-white text-feisen-texto-2'}`}>
              <option value="">Todas mis bodegas</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          )}
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} aria-label="Filtrar por categoría"
            className={`border rounded-lg px-3 py-2 text-sm max-w-full min-w-0 ${filtroCategoria ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul' : 'border-feisen-borde bg-white text-feisen-texto-2'}`}>
            <option value="">Todas las categorías</option>
            {categoriasConConteo.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.n})</option>)}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {[['', 'Todos', enBodega.length - conteo.inactivo], ['agotado', 'Agotados', conteo.agotado], ['bajo', 'Bajo mínimo', conteo.bajo], ['sinmin', 'Sin mínimo', conteo.sinmin], ['inactivo', 'Inactivos', conteo.inactivo]]
              .filter(([e, , n]) => e !== 'inactivo' || n > 0)
              .map(([e, t, n]) => (
                <button key={e || 'todos'} onClick={() => setFiltroEstado(e)} aria-pressed={filtroEstado === e}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${filtroEstado === e ? 'bg-feisen-texto text-white border-feisen-texto' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
                  {t} <span className="opacity-60 tabular-nums">{fmt(n)}</span>
                </button>
              ))}
          </div>
          {verValor && filtroBodega && (
            <button onClick={() => setFiltroBodega('')} className="flex items-center gap-1 bg-feisen-azul-suave text-feisen-azul rounded-full pl-2.5 pr-1.5 py-1 text-xs font-medium">
              Bodega: {nombreBodega(filtroBodega)} <X size={13} />
            </button>
          )}
        </div>

        {filtrados.length === 0 ? (
          <div className="text-center py-14 px-4 text-sm text-feisen-texto-2">
            <Package size={36} className="mx-auto mb-3 text-gray-300" />
            {busqueda.trim()
              ? <>No encontramos “{busqueda.trim()}”{filtroCategoria ? ' en esa categoría' : ''}. Prueba con una sola palabra del nombre{hayFiltros && (filtroCategoria || filtroEstado) ? ' o quita los filtros' : ''}.</>
              : hayFiltros ? 'Ningún producto coincide con los filtros.' : 'Todavía no hay productos en esta bodega.'}
          </div>
        ) : (
          <>
            {/* Escritorio: tabla */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-feisen-borde-suave text-[11px] uppercase tracking-wide text-gray-400">
                    <th className="text-left font-semibold px-4 py-2.5">Producto</th>
                    {variasBodegas && <th className="text-left font-semibold px-4 py-2.5">Bodega</th>}
                    <th className="text-left font-semibold px-4 py-2.5">Estado</th>
                    <th className="text-right font-semibold px-4 py-2.5">Existencia</th>
                    {verCosto && <th className="text-right font-semibold px-4 py-2.5">{verValor ? 'Valor' : 'Costo unit.'}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-feisen-borde-suave">
                  {paginados.map(item => {
                    const e = estadoDe(item), q = getStock(item)
                    return (
                      <tr key={item.id} tabIndex={0} onClick={() => setDetalleId(item.id)}
                        onKeyDown={ev => { if (ev.key === 'Enter') setDetalleId(item.id) }}
                        className={`cursor-pointer ${detalleId === item.id ? 'bg-feisen-azul-suave' : 'hover:bg-feisen-fondo'} ${!item.activo ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-feisen-texto">{item.nombre}</p>
                          <p className="text-xs text-gray-400">{item.categorias?.nombre || 'Sin categoría'} · {item.unidad_medida}</p>
                        </td>
                        {variasBodegas && <td className="px-4 py-2.5 text-feisen-texto-2 whitespace-nowrap">{item.bodegas?.nombre || '—'}</td>}
                        <td className="px-4 py-2.5"><EstadoBadge e={e} /></td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-semibold tabular-nums text-feisen-texto">
                              {q === null ? '—' : fmt(q)}
                              {item.stock_minimo > 0 && <span className="text-[11px] font-normal text-gray-400 ml-1">mín {fmt(item.stock_minimo)}</span>}
                            </span>
                            <span className="w-20 h-1 rounded-full bg-feisen-borde-suave overflow-hidden">
                              <span className={`block h-full rounded-full ${colorNivel(e)}`} style={{ width: `${pctNivel(item)}%` }} />
                            </span>
                          </div>
                        </td>
                        {verCosto && (
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {!(item.precio_costo > 0)
                              ? <span className="text-xs text-amber-600">Sin precio</span>
                              : verValor ? `$${Math.round((q || 0) * item.precio_costo).toLocaleString('es-CO')}` : `$${Number(item.precio_costo).toLocaleString('es-CO')}`}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Celular: tarjetas */}
            <div className="md:hidden divide-y divide-feisen-borde-suave">
              {paginados.map(item => {
                const e = estadoDe(item), q = getStock(item)
                return (
                  <button key={item.id} onClick={() => setDetalleId(item.id)}
                    className={`w-full text-left flex items-center justify-between gap-3 px-4 py-3 ${!item.activo ? 'opacity-50' : ''}`}>
                    <span className="min-w-0">
                      <span className="block font-medium text-feisen-texto">{item.nombre}</span>
                      <span className="block text-xs text-gray-400 mt-0.5">{variasBodegas && item.bodegas?.nombre ? `${item.bodegas.nombre} · ` : ''}{item.categorias?.nombre || 'Sin categoría'}</span>
                      <span className="inline-block mt-1.5"><EstadoBadge e={e} /></span>
                    </span>
                    <span className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="font-semibold tabular-nums text-feisen-texto">{q === null ? '—' : fmt(q)} <span className="text-[11px] font-normal text-gray-400">{item.unidad_medida}</span></span>
                      <span className="w-16 h-1 rounded-full bg-feisen-borde-suave overflow-hidden">
                        <span className={`block h-full rounded-full ${colorNivel(e)}`} style={{ width: `${pctNivel(item)}%` }} />
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Pie con paginación */}
        {filtrados.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-feisen-borde-suave text-xs text-gray-400">
            <span className="tabular-nums">
              Mostrando {(paginaActual - 1) * POR_PAGINA + 1}–{Math.min(paginaActual * POR_PAGINA, filtrados.length)} de {fmt(filtrados.length)} productos
            </span>
            {totalPaginas > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
                  className="px-2.5 py-1 rounded-md border border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo disabled:opacity-30">←</button>
                <span className="px-2 tabular-nums text-feisen-texto-2">{paginaActual} / {totalPaginas}</span>
                <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
                  className="px-2.5 py-1 rounded-md border border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo disabled:opacity-30">→</button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* PANEL DE DETALLE */}
      {detalle && (
        <DetalleProducto
          item={detalle}
          existencia={getStock(detalle)}
          estado={estadoDe(detalle)}
          bodegasVisibles={bodegasPermitidas}
          nombreBodega={nombreBodega}
          verValor={verValor}
          verCosto={verCosto}
          puedeEditar={puedeEditar}
          puedeBorrar={puedeBorrar(detalle)}
          onCerrar={() => setDetalleId(null)}
          onEditar={() => abrirEditar(detalle)}
          onToggleActivo={() => toggleActivo(detalle)}
          onEliminar={() => { setMsg(null); setConfirm(detalle) }}
          onNivelesGuardados={(id, mn, mx) => setItems(its => its.map(i => i.id === id ? { ...i, stock_minimo: mn, stock_maximo: mx } : i))}
        />
      )}

      {/* MÍNIMOS SUGERIDOS */}
      {modalSugeridos && (
        <ModalMinimosSugeridos
          items={items}
          bodegasVisibles={bodegasPermitidas}
          existenciaDe={i => getStock(i) ?? 0}
          onCerrar={() => setModalSugeridos(false)}
          onAplicado={n => { setModalSugeridos(false); setMsg({ tipo: 'exito', texto: `Mínimo aplicado a ${n} producto${n === 1 ? '' : 's'}.` }); cargar() }}
        />
      )}

      {/* MODAL MECANIZAR */}
      {modalMecanizar && itemMecanizar && (
        <Modal titulo="Registrar mecanizado" onCerrar={() => setModalMecanizar(false)}>
          <form onSubmit={ejecutarMecanizado} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs w-24">Materia prima</span>
                <span className="font-semibold text-gray-800">{itemMecanizar.nombre}</span>
              </div>
              <div className="flex items-center gap-2 text-orange-400 text-xs pl-1">↓ se transforma en</div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs w-24">Producto final</span>
                <span className="font-semibold text-orange-700">{itemMecanizar.nombre} - MECANIZADO</span>
              </div>
              <p className="text-xs text-gray-400 pt-1">Stock disponible: <strong>{getStock(itemMecanizar)}</strong> {itemMecanizar.unidad_medida}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Cantidad *</label>
              <input required type="number" min="0.001" step="0.001"
                value={formMec.cantidad}
                onChange={e => setFormMec(f => ({ ...f, cantidad: e.target.value }))}
                className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="1" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Operario</label>
              <input type="text"
                value={formMec.operario}
                onChange={e => setFormMec(f => ({ ...f, operario: e.target.value }))}
                className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Nombre del operario (opcional)" />
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalMecanizar(false)}
                className="flex-1 border border-feisen-borde rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit" disabled={guardandoMec}
                className="flex-1 bg-orange-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                <Wrench size={15} /> {guardandoMec ? 'Registrando...' : 'Confirmar mecanizado'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL ELIMINAR */}
      {confirm && (
        <Modal titulo="Eliminar producto" onCerrar={() => setConfirm(null)}>
          <div className="space-y-4">
            <Alerta tipo="alerta" mensaje={`¿Eliminar "${confirm.nombre}"? Si tiene stock o movimientos no se permitirá.`} />
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 border border-feisen-borde rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button onClick={() => eliminar(confirm)} className="flex-1 bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold">Eliminar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL NUEVO/EDITAR */}
      {modal && (
        <Modal titulo={editando ? 'Editar producto' : 'Nuevo producto'} onCerrar={() => setModal(false)}>
          <form onSubmit={guardar} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nombre *</label>
              <input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                placeholder="Ej: Motor Honda GX160" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Bodega *</label>
                <select required value={form.bodega_id}
                  onChange={e => setForm(f => ({ ...f, bodega_id: e.target.value, categoria_id: '' }))}
                  className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
                  <option value="">Selecciona</option>
                  {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Categoría</label>
                <select value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
                  className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white"
                  disabled={!form.bodega_id}>
                  <option value="">Sin categoría</option>
                  {categorias.filter(c => c.bodega_id === form.bodega_id).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Unidad de medida</label>
                <select value={form.unidad_medida} onChange={e => setForm(f => ({ ...f, unidad_medida: e.target.value }))}
                  className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Stock mínimo</label>
                <input type="number" min="0" step="1" value={form.stock_minimo}
                  onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))}
                  className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="0" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Stock máximo</label>
                <input type="number" min="0" step="1" value={form.stock_maximo}
                  onChange={e => setForm(f => ({ ...f, stock_maximo: e.target.value }))}
                  className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="0" />
              </div>
            </div>

            {!editando && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Cantidad inicial en bodega</label>
                <input type="number" min="0" step="0.001" value={form.cantidad_inicial}
                  onChange={e => setForm(f => ({ ...f, cantidad_inicial: e.target.value }))}
                  className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="0" />
                <p className="text-xs text-gray-400 mt-1">Puedes dejarlo en 0 y registrar entradas después.</p>
              </div>
            )}

            {esBodegaFundicion(form.bodega_id) && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Peso unitario (kg) *</label>
                <input required type="number" min="0.01" step="0.01" value={form.peso_unitario}
                  onChange={e => setForm(f => ({ ...f, peso_unitario: e.target.value }))}
                  className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="Ej: 13.8" />
              </div>
            )}

            {(esAdmin || perfil?.rol === 'ALMACENISTA' || perfil?.rol === 'LOGISTICA') && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Precio de costo (COP)</label>
                <input type="number" min="0" step="1" value={form.precio_costo}
                  onChange={e => setForm(f => ({ ...f, precio_costo: e.target.value }))}
                  className="w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="0" />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Foto (opcional)</label>
              {form.foto_url && <img src={form.foto_url} alt="preview" className="w-20 h-20 rounded-xl object-cover mb-2 border" />}
              <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-feisen-borde rounded-xl px-4 py-3 text-sm text-gray-400 hover:border-feisen-azul transition-colors">
                <Upload size={16} />
                {subiendo ? 'Subiendo...' : 'Subir foto'}
                <input type="file" accept="image/*" className="hidden" onChange={subirFoto} disabled={subiendo} />
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(false)}
                className="flex-1 border border-feisen-borde rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit"
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90">
                {editando ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
