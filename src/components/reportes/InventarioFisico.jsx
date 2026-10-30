import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { siguienteNumero } from '../../utils/siguienteNumero'
import { coincideBusqueda } from '../../utils/busqueda'
import { EncabezadoPagina, PanelLateral, useAviso, useAtajoBuscar } from '../shared/ui'
import { ClipboardList, Plus, Search, ChevronLeft, Pencil, Check, X, Printer } from '../shared/iconos'
import PlanillaInventario from './PlanillaInventario'
import ConteoCiclico, { nombreMes } from './ConteoCiclico'
import { cargarConteoCiclico, mesDe, tituloCiclico, leerTituloCiclico, INICIO_CICLICO } from '../../utils/conteoCiclico'

const HOY = () => new Date().toLocaleDateString('en-CA')

const PAGINA = 150 // productos que se pintan a la vez en el conteo (rápido en celular)

// Título editable en línea, desde la lista — funciona tanto para borradores
// como para inventarios ya confirmados (antes no había forma de corregir el
// título de uno ya confirmado sin volver a abrirlo).
function TituloEditable({ valor, onGuardar }) {
  const [editando, setEditando] = useState(false)
  const [draft,    setDraft]    = useState(valor || '')
  const ref = useRef()

  function activar()  { setDraft(valor || ''); setEditando(true); setTimeout(() => ref.current?.focus(), 50) }
  function cancelar()  { setDraft(valor || ''); setEditando(false) }
  function guardar() {
    const limpio = draft.trim()
    if (limpio !== (valor || '')) onGuardar(limpio)
    setEditando(false)
  }

  if (!editando) return (
    <button onClick={activar} className="flex items-center gap-2 group text-left max-w-full" title="Cambiar título">
      {valor
        ? <span className="text-feisen-texto truncate">{valor}</span>
        : <span className="text-gray-400">Agregar título</span>}
      <Pencil size={13} className="text-gray-300 group-hover:text-feisen-azul transition-colors shrink-0" />
    </button>
  )

  return (
    <div className="flex items-center gap-1.5">
      <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') cancelar() }}
        placeholder="Ej: Bodega Mecanizados — cierre de mes"
        className="border-b-2 border-feisen-azul bg-transparent text-feisen-texto focus:outline-none px-1 py-0.5 min-w-0 flex-1" />
      <button onClick={guardar} aria-label="Guardar título" className="p-1.5 text-feisen-azul hover:bg-feisen-azul-suave rounded-md"><Check size={16} /></button>
      <button onClick={cancelar} aria-label="Cancelar" className="p-1.5 text-gray-400 hover:bg-feisen-fondo rounded-md"><X size={16} /></button>
    </div>
  )
}

export default function InventarioFisico() {
  const { perfil, esAdmin } = useAuth()

  const [vista,       setVista]       = useState('lista')   // 'lista' | 'editor'
  const [cargando,    setCargando]    = useState(true)
  const [guardando,   setGuardando]   = useState(false)
  const [aplicando,   setAplicando]   = useState(false)
  const [msg,         setMsg]         = useState(null)

  // Lista
  const [inventarios, setInventarios] = useState([])

  // Editor
  const [items,        setItems]       = useState([])
  const [bodegas,      setBodegas]     = useState([])
  const [conteos,      setConteos]     = useState({})        // { key: string }
  const [busqueda,     setBusqueda]    = useState('')
  const [filtroBodega, setFiltroBodega] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [notas,        setNotas]       = useState('')
  const [fecha,        setFecha]       = useState(HOY())
  const [invId,        setInvId]       = useState(null)
  const [numero,       setNumero]      = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos') // 'todos' | 'faltan' | 'dif'
  const [limite,       setLimite]      = useState(PAGINA)
  const buscarRef = useRef(null)
  const [aviso, avisar] = useAviso()
  useAtajoBuscar(buscarRef)
  // Conteo con fecha ANTERIOR a hoy: efecto neto (por producto+bodega) de los movimientos
  // posteriores a esa fecha, para calcular el "Sistema" al cierre del día contado.
  // null = conteo de hoy (el Sistema es el stock actual).
  const [deltasPost,   setDeltasPost]  = useState(null)
  const [cargandoCorte, setCargandoCorte] = useState(false)
  const [movsPosteriores, setMovsPosteriores] = useState(0)

  // Modal confirmación
  const [modalConfirm, setModalConfirm] = useState(false)
  // Vista detalle de inventario anterior
  const [verDetalle, setVerDetalle]   = useState(null)
  const [detalleItems, setDetalleItems] = useState([])
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  // Planilla imprimible para contar en papel (por bodega, sin la cantidad del sistema)
  const [modalPlanilla, setModalPlanilla] = useState(false)
  const [opcPlanilla,   setOpcPlanilla]   = useState({ bodegas: [], categorias: [] })
  const [bodegaPl,      setBodegaPl]      = useState('')
  const [categoriaPl,   setCategoriaPl]   = useState('')
  const [preparandoPl,  setPreparandoPl]  = useState(false)
  const [planilla,      setPlanilla]      = useState(null) // { bodega, categoria, items } mientras se imprime

  // Conteo cíclico del mes (sugerencia por bodega). soloKeys restringe el editor a esa lista.
  const [ciclico,  setCiclico]  = useState(null)
  const [soloKeys, setSoloKeys] = useState(null)

  useEffect(() => { cargarLista() }, [])
  useEffect(() => { if (esAdmin) recargarCiclico() }, [esAdmin])
  function recargarCiclico() {
    const mes = mesDe(HOY())
    // Antes de la fecha de arranque solo se muestra el aviso
    if (mes < INICIO_CICLICO) { setCiclico({ antesDeIniciar: true }); return }
    cargarConteoCiclico(supabase, mes).then(({ datos }) => { if (datos) setCiclico(datos) })
  }

  // Borrador ya empezado para la bodega en este mes (para "Seguir" en vez de crear otro)
  function borradorCiclico(b) {
    const t = tituloCiclico(b.bodega, ciclico.mes)
    return inventarios.find(i => i.estado !== 'confirmado' && i.notas === t) || null
  }

  async function contarCiclico(b, borrador) {
    if (borrador) { await continuarBorrador(borrador); return }
    setCargando(true)
    let num
    try { num = await siguienteNumero('inventarios_fisicos', 'INV-FIS') }
    catch (e) { setMsg({ tipo: 'error', texto: 'No se pudo generar el número: ' + e.message }); setCargando(false); return }
    await cargarEditorConConteos(null, num, HOY(), tituloCiclico(b.bodega, ciclico.mes), {}, new Set(b.elegidos.map(e => e.key)))
  }

  function imprimirCiclico(b) {
    setPlanilla({ bodega: b.bodega, detalle: `Conteo cíclico de ${nombreMes(ciclico.mes)}`, items: b.elegidos })
  }

  async function abrirPlanilla() {
    setModalPlanilla(true)
    if (opcPlanilla.bodegas.length) return
    const [{ data: bods }, { data: cats }] = await Promise.all([
      supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('categorias').select('id, nombre, bodega_id').order('nombre'),
    ])
    setOpcPlanilla({ bodegas: bods || [], categorias: cats || [] })
    if (bods?.length === 1) setBodegaPl(bods[0].id)
  }

  async function imprimirPlanilla() {
    if (!bodegaPl) return
    setPreparandoPl(true)
    const { data, error } = await fetchAllPages((d, h) => {
      let q = supabase.from('items').select('id, nombre, unidad_medida, categorias(nombre)')
        .eq('activo', true).eq('bodega_id', bodegaPl).order('nombre').order('id').range(d, h)
      if (categoriaPl) q = q.eq('categoria_id', categoriaPl)
      return q
    })
    setPreparandoPl(false)
    if (error) { avisar('No se pudo cargar los productos: ' + error.message); return }
    const lista = (data || []).sort((a, b) =>
      (a.categorias?.nombre || '~').trim().localeCompare((b.categorias?.nombre || '~').trim()) || a.nombre.localeCompare(b.nombre))
    if (!lista.length) { avisar('Esa bodega no tiene productos activos.'); return }
    setModalPlanilla(false)
    setPlanilla({
      bodega:    opcPlanilla.bodegas.find(b => b.id === bodegaPl)?.nombre || '',
      categoria: opcPlanilla.categorias.find(c => c.id === categoriaPl)?.nombre?.trim() || '',
      items:     lista,
    })
  }

  // La planilla se monta, se imprime y se desmonta al cerrar el diálogo de impresión
  useEffect(() => {
    if (!planilla) return
    const terminar = () => setPlanilla(null)
    window.addEventListener('afterprint', terminar)
    const t = setTimeout(() => window.print(), 50)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', terminar) }
  }, [planilla])

  // ── carga lista ─────────────────────────────────────────────────────────
  async function cargarLista() {
    setCargando(true)
    const { data } = await supabase
      .from('inventarios_fisicos')
      .select('*, profiles(nombre)')
      .order('created_at', { ascending: false })
      .limit(100)
    setInventarios(data || [])
    setCargando(false)
  }

  // ── renombrar título desde la lista ─────────────────────────────────────
  async function renombrarTitulo(inv, nuevoTitulo) {
    const { error } = await supabase.from('inventarios_fisicos')
      .update({ notas: nuevoTitulo || null })
      .eq('id', inv.id)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al renombrar: ' + error.message }); return }
    setInventarios(prev => prev.map(i => i.id === inv.id ? { ...i, notas: nuevoTitulo || null } : i))
  }

  // ── abrir detalle inventario anterior ───────────────────────────────────
  async function abrirDetalle(inv) {
    setVerDetalle(inv)
    setCargandoDetalle(true)
    const { data } = await supabase
      .from('inventario_fisico_items')
      .select('*')
      .eq('inventario_id', inv.id)
      .order('bodega_nombre')
    setDetalleItems(data || [])
    setCargandoDetalle(false)
  }

  // ── continuar borrador ───────────────────────────────────────────────────
  async function continuarBorrador(inv) {
    setCargando(true)
    // Cargar items guardados del borrador
    const { data: itemsGuardados } = await supabase
      .from('inventario_fisico_items')
      .select('*')
      .eq('inventario_id', inv.id)
    // Reconstruir conteos desde los ítems guardados
    const conteosGuardados = {}
    for (const it of (itemsGuardados || [])) {
      const key = `${it.item_id}_${it.bodega_id}`
      if (it.cantidad_fisica !== null) conteosGuardados[key] = String(it.cantidad_fisica)
    }
    // Conteo cíclico: se vuelve a mostrar solo la lista de esa bodega y mes
    let keys = null
    const cic = leerTituloCiclico(inv.notas)
    if (cic) {
      const { datos } = cic.mes === ciclico?.mes ? { datos: ciclico } : await cargarConteoCiclico(supabase, cic.mes)
      const b = datos?.porBodega.find(x => x.bodega === cic.bodega)
      if (b) keys = new Set([...b.elegidos.map(e => e.key), ...Object.keys(conteosGuardados)])
    }
    // Luego cargar items completos igual que iniciarNuevo
    await cargarEditorConConteos(inv.id, inv.numero, inv.fecha, inv.notas || '', conteosGuardados, keys)
  }

  // ── lógica compartida: cargar items + abrir editor ───────────────────────
  async function cargarEditorConConteos(id, num, fecha_, notas_, conteosIniciales, keys = null) {
    const [
      { data: stockData },
      { data: bodegasData },
    ] = await Promise.all([
      // Se pagina: .range(0, 9999) no supera el tope de 1000 filas del servidor, y
      // los productos que quedaban fuera aparecían con Sistema = 0 → el conteo se
      // sumaba encima del stock real (bug INV-FIS-0033, 05/10/2026).
      fetchAllPages((d, h) => supabase.from('stock').select('item_id, bodega_id, cantidad_actual').range(d, h)),
      supabase.from('bodegas').select('*').eq('activo', true).order('nombre'),
    ])

    let itemsData = []
    const bodegaIds = (bodegasData || []).map(b => b.id)
    for (const bodegaId of bodegaIds) {
      const { data: lote, error: err } = await fetchAllPages((d, h) => supabase.from('items')
        .select('id, nombre, unidad_medida, precio_costo, bodega_id, categorias(nombre)')
        .eq('activo', true)
        .eq('bodega_id', bodegaId)
        .order('nombre')
        .range(d, h))
      if (err) { setMsg({ tipo: 'error', texto: 'Error: ' + err.message }); setCargando(false); setVista('editor'); return }
      itemsData = itemsData.concat(lote || [])
    }

    const bodegaMap = {}
    for (const b of (bodegasData || [])) { bodegaMap[b.id] = b.nombre }
    const stockMap = {}
    for (const s of (stockData || [])) {
      stockMap[`${s.item_id}_${s.bodega_id}`] = Number(s.cantidad_actual ?? 0)
    }
    const rows = []
    for (const item of itemsData) {
      if (!item.nombre || !item.bodega_id) continue
      const key = `${item.id}_${item.bodega_id}`
      if (keys && !keys.has(key)) continue
      rows.push({
        key, item_id: item.id, item_nombre: item.nombre, item_unidad: item.unidad_medida,
        bodega_id: item.bodega_id, bodega_nombre: bodegaMap[item.bodega_id] || '',
        categoria_nombre: item.categorias?.nombre || '',
        stock_hoy: stockMap[key] ?? 0, precio_costo: item.precio_costo || 0,
      })
    }
    rows.sort((a, b) => a.bodega_nombre.localeCompare(b.bodega_nombre) || a.item_nombre.localeCompare(b.item_nombre))

    setItems(rows)
    setSoloKeys(keys)
    setBodegas(bodegasData || [])
    setConteos(conteosIniciales || {})
    setBusqueda('')
    setFiltroBodega('')
    setFiltroCategoria('')
    setNotas(notas_)
    setFecha(fecha_)
    setInvId(id)
    setNumero(num)
    setFiltroEstado('todos')
    setLimite(PAGINA)
    setVista('editor')
    setCargando(false)
  }

  // ── iniciar nuevo inventario ─────────────────────────────────────────────
  async function iniciarNuevo() {
    setCargando(true)
    let num
    try { num = await siguienteNumero('inventarios_fisicos', 'INV-FIS') }
    catch (e) { setMsg({ tipo: 'error', texto: 'No se pudo generar el número: ' + e.message }); setCargando(false); return }
    await cargarEditorConConteos(null, num, HOY(), '', {}, null)
  }

  // ── conteo con fecha pasada: calcular el Sistema a PRIMERA HORA de esa fecha ──
  // Se asume que el conteo se hizo lo primero del día: Sistema = stock actual − efecto
  // neto de los movimientos de la fecha del conteo EN ADELANTE (inclusive ese mismo día).
  // Así, al aplicar, el stock actual queda = conteo físico + movimientos de ese día y
  // posteriores (en vez de pisarlos con el conteo viejo). Ver OBSERVACIONES.md (22/10/2026).
  useEffect(() => {
    if (vista !== 'editor') return
    if (!fecha || fecha >= HOY()) { setDeltasPost(null); setMovsPosteriores(0); setCargandoCorte(false); return }
    let cancelado = false
    ;(async () => {
      setCargandoCorte(true)
      const inicioDia = `${fecha}T00:00:00`
      // movimientos.created_at guarda hora de Bogotá ya convertida: se compara tal cual.
      const { data: movs, error } = await fetchAllPages((d, h) =>
        supabase.from('movimientos')
          .select('id, item_id, tipo, cantidad, bodega_origen_id, bodega_destino_id')
          .or(`fecha_movimiento.gte.${fecha},and(fecha_movimiento.is.null,created_at.gte.${inicioDia})`)
          .order('created_at').order('id').range(d, h)
      )
      if (cancelado) return
      if (error) {
        setMsg({ tipo: 'error', texto: 'No se pudieron leer los movimientos posteriores al conteo: ' + error.message })
        setDeltasPost(null); setCargandoCorte(false); return
      }
      const TIPOS_ENTRADA = new Set(['entrada', 'entrada_compra', 'devolucion'])
      const TIPOS_SALIDA  = new Set(['salida', 'salida_produccion', 'salida_venta'])
      const deltas = {}
      const sumar = (itemId, bodegaId, v) => {
        if (!itemId || !bodegaId) return
        const k = `${itemId}_${bodegaId}`
        deltas[k] = (deltas[k] || 0) + v
      }
      for (const m of movs || []) {
        const c = Number(m.cantidad || 0)
        if (TIPOS_ENTRADA.has(m.tipo))      sumar(m.item_id, m.bodega_destino_id, c)
        else if (TIPOS_SALIDA.has(m.tipo))  sumar(m.item_id, m.bodega_origen_id, -c)
        else if (m.tipo === 'traslado') {
          sumar(m.item_id, m.bodega_origen_id, -c)
          sumar(m.item_id, m.bodega_destino_id, c)
        } else if (m.tipo === 'ajuste_inventario') sumar(m.item_id, m.bodega_destino_id, c)
      }
      setDeltasPost(deltas)
      setMovsPosteriores((movs || []).length)
      setCargandoCorte(false)
    })()
    return () => { cancelado = true }
  }, [fecha, vista])

  // ── items derivados ──────────────────────────────────────────────────────
  const itemsConCalculo = useMemo(() => items.map(i => {
    const fis = conteos[i.key] !== undefined && conteos[i.key] !== ''
      ? parseFloat(conteos[i.key])
      : null
    // Sistema = stock actual (conteo de hoy) o stock al cierre de la fecha del conteo (fecha pasada)
    const bruto = deltasPost ? Number((i.stock_hoy - (deltasPost[i.key] || 0)).toFixed(3)) : i.stock_hoy
    const cantidad_sistema = Math.max(0, bruto)
    const dif = fis !== null ? Number((fis - cantidad_sistema).toFixed(3)) : null
    const valorDif = dif !== null && i.precio_costo > 0 ? dif * i.precio_costo : null
    // Stock que quedará HOY al aplicar el ajuste (el trigger no deja bajar de 0)
    const quedara = dif !== null ? Math.max(0, Number((i.stock_hoy + dif).toFixed(3))) : null
    return { ...i, cantidad_sistema, cantidad_sistema_bruto: bruto, cantidad_fisica: fis, diferencia: dif, valor_diferencia: valorDif, quedara }
  }), [items, conteos, deltasPost])

  const esConteoPasado = deltasPost !== null
  const negativosCorte = esConteoPasado ? itemsConCalculo.filter(i => i.cantidad_sistema_bruto < 0).length : 0

  const totalSobrante = itemsConCalculo
    .filter(i => i.valor_diferencia !== null && i.valor_diferencia > 0)
    .reduce((s, i) => s + i.valor_diferencia, 0)
  const totalFaltante = itemsConCalculo
    .filter(i => i.valor_diferencia !== null && i.valor_diferencia < 0)
    .reduce((s, i) => s + i.valor_diferencia, 0)

  const categoriasDisp = useMemo(() => {
    const set = new Set(items.map(i => i.categoria_nombre).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [items])

  const itemsFiltrados = useMemo(() => {
    return itemsConCalculo.filter(i => {
      const matchB = !filtroBodega    || i.bodega_id === filtroBodega
      const matchC = !filtroCategoria || i.categoria_nombre === filtroCategoria
      const matchQ = !busqueda.trim() || coincideBusqueda(i.item_nombre, busqueda)
      const matchE = filtroEstado === 'todos'
        || (filtroEstado === 'faltan' && i.cantidad_fisica === null)
        || (filtroEstado === 'dif' && i.diferencia !== null && i.diferencia !== 0)
      return matchB && matchC && matchQ && matchE
    })
  }, [itemsConCalculo, filtroBodega, filtroCategoria, busqueda, filtroEstado])

  const contados      = itemsConCalculo.filter(i => i.cantidad_fisica !== null).length
  const conDiferencia = itemsConCalculo.filter(i => i.diferencia !== null && i.diferencia !== 0).length

  // ── guardar borrador ─────────────────────────────────────────────────────
  async function guardarBorrador() {
    setGuardando(true)
    setMsg(null)

    let id = invId
    if (!id) {
      const { data: h, error } = await supabase.from('inventarios_fisicos').insert({
        numero, fecha, notas, estado: 'borrador', usuario_id: perfil.id,
      }).select('id').single()
      if (error) { setMsg({ tipo: 'error', texto: error.message }); setGuardando(false); return }
      id = h.id
      setInvId(id)
    } else {
      await supabase.from('inventarios_fisicos')
        .update({ notas, fecha, updated_at: new Date().toISOString() }).eq('id', id)
    }

    const rows = itemsConCalculo
      .filter(i => i.cantidad_fisica !== null)
      .map(i => ({
        inventario_id: id,
        item_id: i.item_id, bodega_id: i.bodega_id,
        item_nombre: i.item_nombre, bodega_nombre: i.bodega_nombre,
        cantidad_sistema: i.cantidad_sistema, cantidad_fisica: i.cantidad_fisica,
      }))

    if (rows.length > 0) {
      await supabase.from('inventario_fisico_items').delete().eq('inventario_id', id)
      await supabase.from('inventario_fisico_items').insert(rows)
    }

    avisar(`Borrador guardado · ${rows.length} productos contados`)
    setGuardando(false)
  }

  // ── aplicar correcciones ─────────────────────────────────────────────────
  async function aplicarCorrecciones() {
    if (cargandoCorte) return
    setAplicando(true)
    // El ajuste queda fechado el día del conteo (si es hoy, es hoy). El stock actual
    // cambia igual (el trigger aplica la diferencia sobre el stock de hoy).
    const fechaAjuste = fecha || HOY()
    // La diferencia se calcula contra el stock que se cargó al abrir el conteo
    // (cantidad_sistema), que ahora sí es completo (paginado). Así el stock final
    // = conteo físico + los movimientos que ocurrieron MIENTRAS se contaba
    // (ej. una recogida de fundición registrada a media jornada), en vez de
    // pisarlos. No se recalcula contra el stock "fresco" al confirmar: eso
    // borraría movimientos legítimos hechos durante el conteo.
    const conDif = itemsConCalculo.filter(i => i.diferencia !== null && i.diferencia !== 0)

    // Generar número de movimiento base
    const iniciales = (perfil?.nombre || 'ADM').trim().split(/\s+/).map(n => n[0].toUpperCase()).join('')
    const preENT = `ENT-${iniciales}-`, preSAL = `SAL-${iniciales}-`
    const [{ data: lastEnt }, { data: lastSal }] = await Promise.all([
      supabase.from('movimientos').select('numero').like('numero', `${preENT}%`).order('numero', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('movimientos').select('numero').like('numero', `${preSAL}%`).order('numero', { ascending: false }).limit(1).maybeSingle(),
    ])
    let seqEnt = lastEnt?.numero ? parseInt(lastEnt.numero.replace(preENT, ''), 10) || 0 : 0
    let seqSal = lastSal?.numero ? parseInt(lastSal.numero.replace(preSAL, ''), 10) || 0 : 0

    // Items cuyo movimiento de ajuste falló al insertarse — antes esto se
    // ignoraba en silencio: el inventario quedaba "confirmado" y se mostraba
    // el mensaje de éxito igual, pero el stock de ese ítem nunca se corregía.
    // Eso fue justo lo que pasó con varios ítems el 28-sept (antes de que el
    // trigger reconociera 'entrada'/'salida'): el movimiento quedó bien
    // guardado en el historial, pero el stock nunca se movió.
    const fallos = []
    const itemsAjustados = []

    for (const item of conDif) {
      const esSalida = item.diferencia < 0
      // Número único por movimiento
      const numMov = esSalida
        ? `${preSAL}${String(++seqSal).padStart(4, '0')}`
        : `${preENT}${String(++seqEnt).padStart(4, '0')}`

      // Insertar movimiento → el trigger fn_actualizar_stock actualiza stock automáticamente
      const { error: errMov } = await supabase.from('movimientos').insert({
        numero:            numMov,
        tipo:              esSalida ? 'salida' : 'entrada',
        item_id:           item.item_id,
        bodega_origen_id:  esSalida ? item.bodega_id : null,
        bodega_destino_id: esSalida ? null : item.bodega_id,
        cantidad:          Math.abs(item.diferencia),
        precio_costo_snapshot: item.precio_costo || 0,
        usuario_id:        perfil.id,
        centro_costo:      item.bodega_nombre,
        referencia:        numero,
        motivo:            `Ajuste inv. físico${esConteoPasado ? ' (conteo del ' + fecha + ')' : ''}. Sistema: ${item.cantidad_sistema} → Físico: ${item.cantidad_fisica}`,
        fecha_movimiento:  fechaAjuste,
        revertido:         false,
        foto_remision_url: null, destino: null, numero_of: null, serial_motor: null, cliente: null, proveedor: null,
      })

      if (errMov) {
        // No restamos la secuencia reservada (numMov) para no reutilizar el
        // número en un reintento futuro — simplemente queda "saltado".
        fallos.push({ nombre: item.item_nombre, bodega: item.bodega_nombre, error: errMov.message })
      } else {
        itemsAjustados.push(item)
      }
    }

    // Confirmar inventario — "ajustado" solo para los que de verdad se aplicaron
    let id = invId
    if (!id) {
      const { data: h } = await supabase.from('inventarios_fisicos').insert({
        numero, fecha, notas, estado: 'confirmado', usuario_id: perfil.id,
      }).select('id').single()
      id = h.id
      const rows = itemsConCalculo
        .filter(i => i.cantidad_fisica !== null)
        .map(i => ({
          inventario_id: id, item_id: i.item_id, bodega_id: i.bodega_id,
          item_nombre: i.item_nombre, bodega_nombre: i.bodega_nombre,
          cantidad_sistema: i.cantidad_sistema, cantidad_fisica: i.cantidad_fisica,
          ajustado: itemsAjustados.some(a => a.key === i.key),
        }))
      if (rows.length > 0) await supabase.from('inventario_fisico_items').insert(rows)
    } else {
      await supabase.from('inventarios_fisicos')
        .update({ estado: 'confirmado', updated_at: new Date().toISOString() }).eq('id', id)
      // Solo marcamos ajustado=true los ítems cuyo movimiento sí se insertó bien
      for (const item of itemsAjustados) {
        await supabase.from('inventario_fisico_items')
          .update({ ajustado: true })
          .eq('inventario_id', id).eq('item_id', item.item_id).eq('bodega_id', item.bodega_id)
      }
    }

    setAplicando(false)
    setModalConfirm(false)
    if (fallos.length > 0) {
      const detalle = fallos.map(f => `${f.nombre} (${f.bodega})`).join(', ')
      setMsg({
        tipo: 'error',
        texto: `Inventario confirmado, pero ${fallos.length} producto(s) NO se pudieron ajustar — corrígelos manualmente: ${detalle}.`,
      })
      setTimeout(() => { setVista('lista'); cargarLista() }, 5000)
    } else {
      avisar(`${numero} confirmado · ${conDif.length} productos ajustados`)
      setMsg(null); setVista('lista'); cargarLista()
      recargarCiclico()
    }
  }

  // ── guard ────────────────────────────────────────────────────────────────
  if (!esAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p>Acceso restringido.</p>
      </div>
    )
  }

  // ── VISTA LISTA ──────────────────────────────────────────────────────────
  if (vista === 'lista') {
    const borradores   = inventarios.filter(i => i.estado !== 'confirmado')
    const confirmados  = inventarios.filter(i => i.estado === 'confirmado')
    const fila = inv => (
      <div key={inv.id} className="flex items-center gap-3 px-4 py-3 min-h-[60px] hover:bg-feisen-fondo transition-colors">
        <button type="button" onClick={() => abrirDetalle(inv)} className="flex-1 min-w-0 text-left" aria-label={`Ver ${inv.numero}`}>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-feisen-texto">{inv.numero}</span>
            <EstadoBadge estado={inv.estado} />
          </span>
          {inv.notas && <span className="sm:hidden block text-sm text-feisen-texto truncate mt-0.5">{inv.notas}</span>}
          <span className="block text-xs text-feisen-texto-2 mt-0.5">
            {fechaLarga(inv.fecha)}{inv.profiles?.nombre ? ` · ${inv.profiles.nombre}` : ''}
          </span>
        </button>
        <div className="hidden sm:block w-64 min-w-0 text-sm">
          <TituloEditable valor={inv.notas} onGuardar={val => renombrarTitulo(inv, val)} />
        </div>
        {inv.estado !== 'confirmado' && (
          <button onClick={() => continuarBorrador(inv)}
            className="shrink-0 border border-feisen-azul text-feisen-azul bg-white rounded-lg px-3 min-h-[40px] text-sm font-semibold hover:bg-feisen-azul-suave active:scale-[.98] transition">
            Continuar
          </button>
        )}
      </div>
    )
    return (
      <div className="space-y-5 max-w-5xl mx-auto">
        {aviso}
        <EncabezadoPagina modulo="Inventarios" titulo="Inventario físico"
          subtitulo="Cuenta lo que hay en las bodegas y corrige el sistema con las diferencias.">
          <button onClick={abrirPlanilla}
            className="inline-flex items-center gap-1.5 border border-feisen-borde bg-white text-feisen-texto rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-feisen-fondo active:scale-[.98] transition">
            <Printer size={16} /> Planilla para imprimir
          </button>
          <button onClick={iniciarNuevo} disabled={cargando}
            className="inline-flex items-center gap-1.5 bg-feisen-azul text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:opacity-90 active:scale-[.98] transition disabled:opacity-60">
            <Plus size={16} /> Nuevo conteo
          </button>
        </EncabezadoPagina>

        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

        {modalPlanilla && (
          <Modal titulo="Planilla para contar en papel" onCerrar={() => setModalPlanilla(false)}>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <p className="text-sm text-feisen-texto-2">
                Sale la lista de productos de la bodega con una casilla en blanco para escribir lo que se contó.
                No muestra la cantidad del sistema, para que se cuente de verdad.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="pl-bodega" className="block text-sm font-medium text-feisen-texto">Bodega</label>
                <select id="pl-bodega" value={bodegaPl} onChange={e => { setBodegaPl(e.target.value); setCategoriaPl('') }}
                  className="w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul">
                  <option value="">{opcPlanilla.bodegas.length ? 'Selecciona bodega' : 'Cargando…'}</option>
                  {opcPlanilla.bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              </div>
              {bodegaPl && opcPlanilla.categorias.some(c => c.bodega_id === bodegaPl) && (
                <div className="space-y-1.5">
                  <label htmlFor="pl-cat" className="block text-sm font-medium text-feisen-texto">Categoría <span className="font-normal text-gray-400">(opcional)</span></label>
                  <select id="pl-cat" value={categoriaPl} onChange={e => setCategoriaPl(e.target.value)}
                    className="w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul">
                    <option value="">Toda la bodega</option>
                    {opcPlanilla.categorias.filter(c => c.bodega_id === bodegaPl).map(c => <option key={c.id} value={c.id}>{c.nombre.trim()}</option>)}
                  </select>
                </div>
              )}
              <p className="text-xs text-feisen-texto-2">En la ventana de impresión puedes elegir la impresora o “Guardar como PDF”.</p>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setModalPlanilla(false)}
                  className="px-4 min-h-[44px] rounded-lg text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">Cancelar</button>
                <button type="button" onClick={imprimirPlanilla} disabled={!bodegaPl || preparandoPl}
                  className="inline-flex items-center gap-1.5 bg-feisen-azul text-white rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:opacity-90 disabled:opacity-60">
                  <Printer size={16} /> {preparandoPl ? 'Preparando…' : 'Imprimir'}
                </button>
              </div>
            </div>
          </Modal>
        )}
        {planilla && <PlanillaInventario {...planilla} />}

        {ciclico && (ciclico.antesDeIniciar || ciclico.porBodega.length > 0) && (
          <ConteoCiclico datos={ciclico} borradorDe={borradorCiclico} ocupado={cargando}
            onContar={contarCiclico} onImprimir={imprimirCiclico} />
        )}

        {cargando ? <Spinner /> : inventarios.length === 0 ? (
          <div className="bg-white border border-feisen-borde rounded-xl text-center px-6 py-14">
            <ClipboardList size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-feisen-texto">Todavía no hay conteos</p>
            <p className="text-sm text-feisen-texto-2 mt-1">Empieza uno con “Nuevo conteo”: puedes guardarlo como borrador y seguir después.</p>
          </div>
        ) : (
          <>
            {borradores.length > 0 && (
              <section className="space-y-1.5">
                <h2 className="text-xs font-semibold text-feisen-texto-2 px-0.5">En curso <span className="font-normal text-gray-400">· {borradores.length}</span></h2>
                <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden divide-y divide-feisen-borde-suave">{borradores.map(fila)}</div>
              </section>
            )}
            {confirmados.length > 0 && (
              <section className="space-y-1.5">
                <h2 className="text-xs font-semibold text-feisen-texto-2 px-0.5">Confirmados <span className="font-normal text-gray-400">· {confirmados.length}</span></h2>
                <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden divide-y divide-feisen-borde-suave">{confirmados.map(fila)}</div>
              </section>
            )}
          </>
        )}

        {/* Panel con el detalle de un conteo */}
        {verDetalle && (() => {
          const conDifDet = detalleItems.filter(i => (i.cantidad_fisica ?? 0) - i.cantidad_sistema !== 0)
          const ordenados = [...conDifDet, ...detalleItems.filter(i => (i.cantidad_fisica ?? 0) - i.cantidad_sistema === 0)]
          return (
            <PanelLateral etiqueta={`Detalle de ${verDetalle.numero}`} onCerrar={() => setVerDetalle(null)} encabezado={
              <div className="space-y-1.5">
                <h3 className="font-mono text-base font-semibold text-feisen-texto">{verDetalle.numero}</h3>
                <div className="flex flex-wrap items-center gap-1.5"><EstadoBadge estado={verDetalle.estado} />
                  <span className="text-xs text-feisen-texto-2">{fechaLarga(verDetalle.fecha)}</span></div>
              </div>
            }>
              <div className="sm:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Título</p>
                <TituloEditable valor={verDetalle.notas} onGuardar={val => { renombrarTitulo(verDetalle, val); setVerDetalle(v => ({ ...v, notas: val || null })) }} />
              </div>
              {verDetalle.notas && <p className="hidden sm:block text-sm text-feisen-texto">{verDetalle.notas}</p>}
              {cargandoDetalle ? <Spinner /> : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-feisen-borde rounded-lg px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Contados</p>
                      <p className="text-2xl font-semibold text-feisen-texto tabular-nums">{detalleItems.length.toLocaleString('es-CO')}</p>
                    </div>
                    <div className="border border-feisen-borde rounded-lg px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Con diferencia</p>
                      <p className={`text-2xl font-semibold tabular-nums ${conDifDet.length ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{conDifDet.length.toLocaleString('es-CO')}</p>
                    </div>
                  </div>
                  <section>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1 grid grid-cols-[1fr_auto] gap-3">
                      <span>Producto</span><span>Sistema → Físico</span>
                    </h4>
                    {ordenados.length === 0 && <p className="text-sm text-feisen-texto-2 py-4">Este conteo no tiene productos contados.</p>}
                    <ul className="divide-y divide-feisen-borde-suave">
                      {ordenados.map(i => {
                        const dif = Number(((i.cantidad_fisica ?? 0) - i.cantidad_sistema).toFixed(3))
                        return (
                          <li key={i.id} className="grid grid-cols-[1fr_auto] gap-3 py-2.5">
                            <span className="min-w-0">
                              <span className="block text-sm text-feisen-texto break-words">{i.item_nombre}</span>
                              <span className="block text-xs text-gray-400">{i.bodega_nombre}</span>
                            </span>
                            <span className="text-right tabular-nums">
                              <span className="block text-sm text-feisen-texto-2 whitespace-nowrap">{cant(i.cantidad_sistema)} → <b className="text-feisen-texto">{i.cantidad_fisica == null ? '—' : cant(i.cantidad_fisica)}</b></span>
                              <Diferencia dif={dif} />
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                </>
              )}
            </PanelLateral>
          )
        })()}
      </div>
    )
  }

  // ── VISTA EDITOR (conteo) ────────────────────────────────────────────────
  const visibles = itemsFiltrados.slice(0, limite)
  const pct = items.length ? Math.round((contados / items.length) * 100) : 0
  const neto = totalSobrante + totalFaltante
  const chipsEstado = [
    ['todos', 'Todos', items.length],
    ['faltan', 'Sin contar', items.length - contados],
    ['dif', 'Con diferencia', conDiferencia],
  ]
  // Enter en un campo pasa al siguiente producto (contar rápido con el teclado numérico)
  function siguienteCampo(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const campos = [...document.querySelectorAll('input[data-conteo]')]
    campos[campos.indexOf(e.target) + 1]?.focus()
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {aviso}
      <div className="flex items-start gap-2">
        <button onClick={() => {
            setVista('lista'); setMsg(null); cargarLista()
            // Un borrador recién guardado cuenta para el avance del cíclico y para "Seguir"
            if (soloKeys) recargarCiclico()
          }} aria-label="Volver a la lista"
          className="p-2 -ml-2 mt-3 text-feisen-texto-2 hover:text-feisen-texto hover:bg-white rounded-lg">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <EncabezadoPagina modulo="Inventario físico" titulo={<>Conteo <span className="font-mono text-lg">{numero}</span></>}
            subtitulo={soloKeys ? `Conteo cíclico: solo los ${items.length} productos sugeridos este mes.`
              : esConteoPasado ? `Contado el ${fechaLarga(fecha)}` : 'Escribe lo que contaste; la diferencia se calcula sola.'} />
        </div>
      </div>

      <div className="grid sm:grid-cols-[1fr_auto] gap-3">
        <label className="block text-sm font-medium text-feisen-texto space-y-1.5">
          <span>Título <span className="font-normal text-gray-400">(opcional)</span></span>
          <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: Bodega Mecanizados — cierre de mes"
            className="w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
        </label>
        <label className="block text-sm font-medium text-feisen-texto space-y-1.5">
          <span>Fecha del conteo</span>
          <input type="date" value={fecha} max={HOY()} onChange={e => setFecha(e.target.value)}
            className="w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-feisen-azul" />
        </label>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
      {cargandoCorte && <Alerta tipo="info" mensaje="Calculando el stock del sistema a primera hora de la fecha del conteo…" />}
      {esConteoPasado && !cargandoCorte && (
        <details className="bg-feisen-azul-suave rounded-lg px-4 py-3 text-sm text-feisen-azul">
          <summary className="cursor-pointer font-medium">
            Conteo con fecha anterior a hoy: “Sistema” es el stock a primera hora del {fechaLarga(fecha)}
          </summary>
          <div className="mt-2 space-y-1 text-xs leading-relaxed">
            <p>Se deshacen {movsPosteriores} movimiento{movsPosteriores === 1 ? '' : 's'} registrados desde esa fecha (incluido ese día). Al aplicar, el ajuste
              queda con esa fecha y el stock de hoy queda = <b>conteo + movimientos de ese día y posteriores</b>. Si la fecha no es la del conteo, cámbiala arriba.</p>
            {negativosCorte > 0 && (
              <p className="text-amber-700">{negativosCorte} producto{negativosCorte === 1 ? '' : 's'} tenían salidas por encima del stock a esa hora: su Sistema se tomó como 0.</p>
            )}
          </div>
        </details>
      )}

      {/* Avance del conteo */}
      <div className="bg-white border border-feisen-borde rounded-xl p-4 grid grid-cols-2 sm:grid-cols-[1fr_auto_auto] gap-4 items-center">
        <div className="col-span-2 sm:col-span-1">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-feisen-texto-2">Contados</span>
            <span className="font-semibold text-feisen-texto tabular-nums">{contados.toLocaleString('es-CO')} de {items.length.toLocaleString('es-CO')} · {pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-feisen-borde-suave overflow-hidden">
            <div className="h-full rounded-full bg-feisen-azul transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button type="button" onClick={() => { setFiltroEstado('dif'); setLimite(PAGINA) }}
          className="text-left sm:text-right sm:pl-4 sm:border-l border-feisen-borde-suave">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Con diferencia</p>
          <p className={`text-2xl font-semibold tabular-nums ${conDiferencia ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{conDiferencia.toLocaleString('es-CO')}</p>
        </button>
        <div className="text-right sm:pl-4 sm:border-l border-feisen-borde-suave">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Valor neto</p>
          <p className={`text-2xl font-semibold tabular-nums ${neto < 0 ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{neto > 0 ? '+' : ''}{copCorto(neto)}</p>
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input ref={buscarRef} type="search" value={busqueda} onChange={e => { setBusqueda(e.target.value); setLimite(PAGINA) }}
            placeholder="Buscar producto por palabras del nombre…"
            className="w-full border border-feisen-borde rounded-lg pl-10 pr-3 py-2.5 bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
          {chipsEstado.map(([k, t, n]) => (
            <button key={k} type="button" aria-pressed={filtroEstado === k} onClick={() => { setFiltroEstado(k); setLimite(PAGINA) }}
              className={`shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors
                ${filtroEstado === k ? 'bg-feisen-texto text-white border-feisen-texto' : 'bg-white text-feisen-texto-2 border-feisen-borde hover:bg-feisen-fondo'}`}>
              {t} <span className={`tabular-nums ${filtroEstado === k ? 'text-white/70' : 'text-gray-400'}`}>{n.toLocaleString('es-CO')}</span>
            </button>
          ))}
          <select value={filtroBodega} onChange={e => { setFiltroBodega(e.target.value); setLimite(PAGINA) }} aria-label="Bodega"
            className={`shrink-0 min-h-[36px] rounded-full border px-3 text-sm font-medium focus:outline-none
              ${filtroBodega ? 'bg-feisen-azul-suave text-feisen-azul border-transparent' : 'bg-white text-feisen-texto-2 border-feisen-borde'}`}>
            <option value="">Todas las bodegas</option>
            {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
          <select value={filtroCategoria} onChange={e => { setFiltroCategoria(e.target.value); setLimite(PAGINA) }} aria-label="Categoría"
            className={`shrink-0 min-h-[36px] rounded-full border px-3 text-sm font-medium focus:outline-none
              ${filtroCategoria ? 'bg-feisen-azul-suave text-feisen-azul border-transparent' : 'bg-white text-feisen-texto-2 border-feisen-borde'}`}>
            <option value="">Todas las categorías</option>
            {categoriasDisp.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Productos a contar */}
      {cargando ? <Spinner /> : (
        <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_6rem_8rem_6rem] gap-3 px-4 py-2 border-b border-feisen-borde text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <span>Producto</span><span className="text-right">Sistema</span><span className="text-center">Contado</span><span className="text-right">Diferencia</span>
          </div>
          {visibles.length === 0 ? (
            <p className="text-center text-sm text-feisen-texto-2 px-6 py-10">
              {filtroEstado === 'dif' ? 'Ningún producto contado tiene diferencia.' : filtroEstado === 'faltan' ? 'Ya contaste todos los productos de este filtro.' : 'Ningún producto coincide con la búsqueda.'}
            </p>
          ) : (
            <ul className="divide-y divide-feisen-borde-suave">
              {visibles.map(item => {
                const d = item.diferencia
                const fondo = d === null || d === 0 ? '' : d < 0 ? 'bg-feisen-rojo-suave' : 'bg-amber-50'
                return (
                  <li key={item.key} className={`grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_6rem_8rem_6rem] gap-x-3 gap-y-2 items-center px-4 py-2.5 ${fondo}`}>
                    <div className="min-w-0 col-span-2 sm:col-span-1">
                      <p className="text-sm font-medium text-feisen-texto break-words">{item.item_nombre}</p>
                      <p className="text-xs text-gray-400">{[filtroBodega ? null : item.bodega_nombre, item.categoria_nombre, item.item_unidad].filter(Boolean).join(' · ')}</p>
                    </div>
                    <p className="text-sm text-feisen-texto-2 tabular-nums sm:text-right">
                      <span className="sm:hidden">Sistema </span><b className="font-semibold text-feisen-texto">{cant(item.cantidad_sistema)}</b>
                    </p>
                    <div className="flex items-center justify-end gap-3 sm:contents">
                      <input data-conteo inputMode="decimal" enterKeyHint="next" aria-label={`Contado de ${item.item_nombre}`}
                        value={conteos[item.key] ?? ''} placeholder="—"
                        onChange={e => setConteos(prev => ({ ...prev, [item.key]: e.target.value.replace(',', '.') }))}
                        onKeyDown={siguienteCampo}
                        className="w-28 sm:w-full h-11 text-center font-semibold tabular-nums border border-feisen-borde rounded-lg bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
                      <span className="w-16 sm:w-auto text-right"><Diferencia dif={d} /></span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {itemsFiltrados.length > visibles.length && (
            <button type="button" onClick={() => setLimite(l => l + PAGINA)}
              className="w-full border-t border-feisen-borde py-3 text-sm font-medium text-feisen-azul hover:bg-feisen-fondo">
              Mostrar {Math.min(PAGINA, itemsFiltrados.length - visibles.length)} más · van {visibles.length.toLocaleString('es-CO')} de {itemsFiltrados.length.toLocaleString('es-CO')}
            </button>
          )}
        </div>
      )}

      {/* Resumen de diferencias (valor) */}
      {conDiferencia > 0 && (
        <details className="bg-white border border-feisen-borde rounded-xl">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-feisen-texto flex flex-wrap justify-between gap-2">
            <span>Resumen de diferencias · {conDiferencia} productos</span>
            <span className="tabular-nums text-feisen-texto-2">
              Faltante <b className="text-feisen-rojo">{cop(totalFaltante)}</b> · Sobrante <b className="text-feisen-texto">+{cop(totalSobrante)}</b>
            </span>
          </summary>
          <ul className="divide-y divide-feisen-borde-suave border-t border-feisen-borde-suave">
            {itemsConCalculo
              .filter(i => i.diferencia !== null && i.diferencia !== 0)
              .sort((a, b) => Math.abs(b.valor_diferencia ?? 0) - Math.abs(a.valor_diferencia ?? 0))
              .map(item => (
                <li key={item.key} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 text-sm items-center">
                  <span className="min-w-0">
                    <span className="block text-feisen-texto break-words">{item.item_nombre}</span>
                    <span className="block text-xs text-gray-400 tabular-nums">{item.bodega_nombre} · {cant(item.cantidad_sistema)} → {cant(item.cantidad_fisica)}</span>
                  </span>
                  <Diferencia dif={item.diferencia} />
                  <span className={`w-24 text-right tabular-nums text-xs ${item.valor_diferencia === null ? 'text-gray-300' : item.valor_diferencia < 0 ? 'text-feisen-rojo' : 'text-feisen-texto-2'}`}>
                    {item.valor_diferencia === null ? 'Sin precio' : (item.valor_diferencia > 0 ? '+' : '') + cop(item.valor_diferencia)}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}

      {/* Acciones fijas abajo */}
      <div className="sticky bottom-[calc(4.5rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10">
        <div className="flex items-center gap-2 bg-white border border-feisen-borde rounded-xl shadow-sm pl-3 sm:pl-4 pr-2 py-2">
          <p className="flex-1 min-w-0 text-sm leading-tight">
            <b className="block text-feisen-texto tabular-nums">{contados.toLocaleString('es-CO')} contados</b>
            <span className={`text-xs tabular-nums ${conDiferencia ? 'text-feisen-rojo font-medium' : 'text-feisen-texto-2'}`}>
              {conDiferencia ? `${conDiferencia} con diferencia` : 'Sin diferencias'}
            </span>
          </p>
          <button onClick={guardarBorrador} disabled={guardando}
            className="border border-feisen-borde bg-white rounded-lg px-3 min-h-[44px] text-sm font-semibold text-feisen-texto hover:bg-feisen-fondo disabled:opacity-60">
            {guardando ? 'Guardando…' : <><span className="sm:hidden">Guardar</span><span className="hidden sm:inline">Guardar borrador</span></>}
          </button>
          <button
            onClick={() => conDiferencia > 0 ? setModalConfirm(true) : setMsg({ tipo: 'alerta', texto: 'No hay diferencias para corregir: el sistema ya coincide con lo contado.' })}
            disabled={cargandoCorte}
            className="bg-feisen-azul text-white rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:opacity-90 active:scale-[.98] transition disabled:opacity-60">
            {cargandoCorte ? 'Calculando…' : <><span className="sm:hidden">Aplicar</span><span className="hidden sm:inline">Aplicar correcciones</span></>}
          </button>
        </div>
      </div>

      {/* Modal confirmación */}
      {modalConfirm && (
        <Modal titulo="¿Corregir el stock con el conteo?" onCerrar={() => !aplicando && setModalConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-feisen-texto">
              Se ajusta el stock de <b>{conDiferencia} producto{conDiferencia > 1 ? 's' : ''}</b>. Cada ajuste queda en el Historial como movimiento
              con referencia {numero}. Valor neto: <b className={neto < 0 ? 'text-feisen-rojo' : ''}>{neto > 0 ? '+' : ''}{cop(neto)}</b>.
            </p>
            <ul className="max-h-60 overflow-y-auto border border-feisen-borde rounded-lg divide-y divide-feisen-borde-suave">
              {itemsConCalculo.filter(i => i.diferencia !== null && i.diferencia !== 0).map(item => (
                <li key={item.key} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block text-feisen-texto break-words">{item.item_nombre}</span>
                    <span className="block text-xs text-gray-400 tabular-nums">
                      Sistema {cant(item.cantidad_sistema)} → contado {cant(item.cantidad_fisica)}
                      {esConteoPasado && ` · hoy ${cant(item.stock_hoy)} → ${cant(item.quedara)}`}
                    </span>
                  </span>
                  <Diferencia dif={item.diferencia} />
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button onClick={() => setModalConfirm(false)} disabled={aplicando}
                className="flex-1 border border-feisen-borde rounded-lg py-2.5 text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">
                Cancelar
              </button>
              <button onClick={aplicarCorrecciones} disabled={aplicando}
                className="flex-1 bg-feisen-azul text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 active:scale-[.98] transition">
                {aplicando ? 'Aplicando…' : 'Sí, corregir'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Ayudas de formato ───────────────────────────────────────────────────────
const cant = n => Number(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
const cop  = n => `$${Math.round(n).toLocaleString('es-CO')}`
function copCorto(n) {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  if (a >= 1e6) return `${s}$${(a / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  return `${s}$${Math.round(a).toLocaleString('es-CO')}`
}
function fechaLarga(f) {
  if (!f) return '—'
  const d = new Date(f + 'T12:00:00')
  const conAnio = d.getFullYear() !== new Date().getFullYear()
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', ...(conAnio ? { year: 'numeric' } : {}) })
}

function EstadoBadge({ estado }) {
  return estado === 'confirmado'
    ? <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-gray-100 text-feisen-texto-2">Confirmado</span>
    : <span className="text-[11px] font-medium px-1.5 py-px rounded-md bg-amber-50 text-amber-700">Borrador</span>
}

// Diferencia contado − sistema: rojo si falta, ámbar si sobra, check si coincide
function Diferencia({ dif }) {
  if (dif === null || dif === undefined) return <span className="text-sm text-gray-300">—</span>
  if (dif === 0) return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Check size={13} /> Igual</span>
  return (
    <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${dif < 0 ? 'text-feisen-rojo' : 'text-amber-700'}`}>
      {dif > 0 ? '+' : '−'}{cant(Math.abs(dif))}
    </span>
  )
}
