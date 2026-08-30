import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import {
  ClipboardList, Plus, Search, AlertTriangle, CheckCircle,
  ChevronLeft, RefreshCw, Package, FileText, Pencil, Eye
} from 'lucide-react'

const HOY = () => new Date().toLocaleDateString('en-CA')

// ── helpers ────────────────────────────────────────────────────────────────
function badge(estado) {
  return estado === 'confirmado'
    ? 'bg-green-100 text-green-700'
    : 'bg-amber-100 text-amber-700'
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
  const [notas,        setNotas]       = useState('')
  const [fecha,        setFecha]       = useState(HOY())
  const [invId,        setInvId]       = useState(null)
  const [numero,       setNumero]      = useState('')
  const [soloConDif,   setSoloConDif]  = useState(false)

  // Modal confirmación
  const [modalConfirm, setModalConfirm] = useState(false)
  // Vista detalle de inventario anterior
  const [verDetalle, setVerDetalle]   = useState(null)
  const [detalleItems, setDetalleItems] = useState([])
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  useEffect(() => { cargarLista() }, [])

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

  // ── iniciar nuevo inventario ─────────────────────────────────────────────
  async function iniciarNuevo() {
    setCargando(true)

    // Cargar stock, bodegas y contador en paralelo
    const [
      { data: stockData },
      { data: bodegasData },
      { count },
    ] = await Promise.all([
      supabase.from('stock').select('item_id, bodega_id, cantidad_actual').range(0, 9999),
      supabase.from('bodegas').select('*').eq('activo', true).order('nombre'),
      supabase.from('inventarios_fisicos').select('*', { count: 'exact', head: true }),
    ])

    // Cargar ítems en lotes de 1000 (límite de Supabase)
    let itemsData = []
    let from = 0
    while (true) {
      const { data: lote, error: err } = await supabase.from('items')
        .select('id, nombre, unidad_medida, precio_costo, bodega_id, categorias(nombre)')
        .eq('activo', true)
        .order('nombre')
        .range(from, from + 999)
      if (err) {
        setMsg({ tipo: 'error', texto: 'Error cargando ítems: ' + err.message })
        setCargando(false)
        setVista('editor')
        return
      }
      itemsData = itemsData.concat(lote || [])
      if (!lote || lote.length < 1000) break
      from += 1000
    }

    // Mapa bodega_id → nombre
    const bodegaMap = {}
    for (const b of (bodegasData || [])) { bodegaMap[b.id] = b.nombre }

    // Mapa de stock: "item_id_bodega_id" → cantidad_actual
    const stockMap = {}
    for (const s of (stockData || [])) {
      stockMap[`${s.item_id}_${s.bodega_id}`] = Number(s.cantidad_actual ?? 0)
    }

    const rows = []
    for (const item of (itemsData || [])) {
      if (!item.nombre || !item.bodega_id) continue
      const key = `${item.id}_${item.bodega_id}`
      rows.push({
        key,
        item_id:          item.id,
        item_nombre:      item.nombre,
        item_unidad:      item.unidad_medida,
        bodega_id:        item.bodega_id,
        bodega_nombre:    bodegaMap[item.bodega_id] || '',
        categoria_nombre: item.categorias?.nombre || '',
        cantidad_sistema: stockMap[key] ?? 0,
        precio_costo:     item.precio_costo || 0,
      })
    }
    // Ordenar por bodega → nombre
    rows.sort((a, b) => a.bodega_nombre.localeCompare(b.bodega_nombre) || a.item_nombre.localeCompare(b.item_nombre))

    const num = `INV-FIS-${String((count || 0) + 1).padStart(4, '0')}`
    setItems(rows)
    setBodegas(bodegasData || [])
    setConteos({})
    setBusqueda('')
    setFiltroBodega('')
    setNotas('')
    setFecha(HOY())
    setInvId(null)
    setNumero(num)
    setSoloConDif(false)
    setVista('editor')
    setCargando(false)
  }

  // ── items derivados ──────────────────────────────────────────────────────
  const itemsConCalculo = useMemo(() => items.map(i => {
    const fis = conteos[i.key] !== undefined && conteos[i.key] !== ''
      ? parseFloat(conteos[i.key])
      : null
    const dif = fis !== null ? fis - i.cantidad_sistema : null
    const valorDif = dif !== null && i.precio_costo > 0 ? dif * i.precio_costo : null
    return { ...i, cantidad_fisica: fis, diferencia: dif, valor_diferencia: valorDif }
  }), [items, conteos])

  const cop = n => `$${Math.round(n).toLocaleString('es-CO')}`

  const totalSobrante = itemsConCalculo
    .filter(i => i.valor_diferencia !== null && i.valor_diferencia > 0)
    .reduce((s, i) => s + i.valor_diferencia, 0)
  const totalFaltante = itemsConCalculo
    .filter(i => i.valor_diferencia !== null && i.valor_diferencia < 0)
    .reduce((s, i) => s + i.valor_diferencia, 0)

  const itemsFiltrados = useMemo(() => {
    return itemsConCalculo.filter(i => {
      const matchB = !filtroBodega || i.bodega_id === filtroBodega
      const matchQ = !busqueda    || i.item_nombre.toLowerCase().includes(busqueda.toLowerCase())
      const matchD = !soloConDif  || (i.diferencia !== null && i.diferencia !== 0)
      return matchB && matchQ && matchD
    })
  }, [itemsConCalculo, filtroBodega, busqueda, soloConDif])

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
        .update({ notas, updated_at: new Date().toISOString() }).eq('id', id)
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

    setMsg({ tipo: 'exito', texto: 'Borrador guardado.' })
    setGuardando(false)
  }

  // ── aplicar correcciones ─────────────────────────────────────────────────
  async function aplicarCorrecciones() {
    setAplicando(true)
    const hoy = HOY()
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

    for (const item of conDif) {
      const esSalida = item.diferencia < 0
      // Número único por movimiento
      const numMov = esSalida
        ? `${preSAL}${String(++seqSal).padStart(4, '0')}`
        : `${preENT}${String(++seqEnt).padStart(4, '0')}`

      // Insertar movimiento → el trigger fn_actualizar_stock actualiza stock automáticamente
      await supabase.from('movimientos').insert({
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
        motivo:            `Ajuste inv. físico. Sistema: ${item.cantidad_sistema} → Físico: ${item.cantidad_fisica}`,
        fecha_movimiento:  hoy,
        revertido:         false,
        foto_remision_url: null, destino: null, numero_of: null, serial_motor: null, cliente: null, proveedor: null,
      })
    }

    // Confirmar inventario
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
          cantidad_sistema: i.cantidad_sistema, cantidad_fisica: i.cantidad_fisica, ajustado: i.diferencia !== 0,
        }))
      if (rows.length > 0) await supabase.from('inventario_fisico_items').insert(rows)
    } else {
      await supabase.from('inventarios_fisicos')
        .update({ estado: 'confirmado', updated_at: new Date().toISOString() }).eq('id', id)
      await supabase.from('inventario_fisico_items')
        .update({ ajustado: true }).eq('inventario_id', id)
    }

    setAplicando(false)
    setModalConfirm(false)
    setMsg({ tipo: 'exito', texto: `✅ ${conDif.length} productos ajustados en el sistema.` })
    setTimeout(() => { setVista('lista'); cargarLista() }, 2200)
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
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <ClipboardList size={24} className="text-feisen-azul" /> Inventario Físico
            </h1>
            <p className="text-sm text-gray-500 mt-1">Solo visible para administradores</p>
          </div>
          <button onClick={iniciarNuevo}
            className="flex items-center gap-2 bg-feisen-azul text-white px-4 py-2.5 rounded-xl font-medium hover:opacity-90 transition-opacity">
            <Plus size={18} /> Nuevo inventario
          </button>
        </div>

        {cargando ? <Spinner /> : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {inventarios.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                <Package size={40} className="text-gray-200" />
                <p className="font-medium">No hay inventarios físicos registrados</p>
                <button onClick={iniciarNuevo}
                  className="text-sm text-feisen-azul hover:underline">Crear el primero</button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500">Número</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500">Fecha</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500">Estado</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden sm:table-cell">Creado por</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-500">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {inventarios.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-feisen-azul">{inv.numero}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(inv.fecha + 'T12:00:00').toLocaleDateString('es-CO')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge(inv.estado)}`}>
                          {inv.estado === 'confirmado' ? '✓ Confirmado' : '⏳ Borrador'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                        {inv.profiles?.nombre || '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => abrirDetalle(inv)}
                          className="p-1.5 text-feisen-azul hover:bg-blue-50 rounded-lg" title="Ver detalle">
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Modal detalle inventario anterior */}
        {verDetalle && (
          <Modal titulo={`${verDetalle.numero} — Detalle`} onCerrar={() => setVerDetalle(null)}>
            {cargandoDetalle ? <Spinner /> : (
              <div className="space-y-3 max-h-[65vh] overflow-y-auto">
                <div className="flex gap-4 text-sm text-gray-600 pb-2 border-b border-gray-100">
                  <span>Fecha: <strong>{new Date(verDetalle.fecha + 'T12:00:00').toLocaleDateString('es-CO')}</strong></span>
                  <span>Items contados: <strong>{detalleItems.length}</strong></span>
                  <span>Con diferencia: <strong>{detalleItems.filter(i => (i.cantidad_fisica - i.cantidad_sistema) !== 0).length}</strong></span>
                </div>
                {verDetalle.notas && (
                  <p className="text-sm text-gray-500 italic">{verDetalle.notas}</p>
                )}
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Producto</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Bodega</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500">Sistema</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500">Físico</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {detalleItems.map(i => {
                      const dif = (i.cantidad_fisica ?? 0) - i.cantidad_sistema
                      return (
                        <tr key={i.id} className={dif !== 0 ? (dif > 0 ? 'bg-blue-50' : 'bg-red-50') : ''}>
                          <td className="px-3 py-2 font-medium text-gray-700">{i.item_nombre}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{i.bodega_nombre}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{i.cantidad_sistema}</td>
                          <td className="px-3 py-2 text-right font-semibold">{i.cantidad_fisica ?? '—'}</td>
                          <td className={`px-3 py-2 text-right font-bold ${dif > 0 ? 'text-feisen-azul' : dif < 0 ? 'text-feisen-rojo' : 'text-gray-400'}`}>
                            {dif !== 0 ? (dif > 0 ? `+${dif}` : dif) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Modal>
        )}
      </div>
    )
  }

  // ── VISTA EDITOR ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => setVista('lista')}
          className="p-2 text-gray-400 hover:text-feisen-azul hover:bg-blue-50 rounded-xl">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">
            Inventario Físico — <span className="text-feisen-azul">{numero}</span>
          </h1>
          <p className="text-xs text-gray-400">Ingresa las cantidades físicas contadas</p>
        </div>
        <div className="flex gap-2">
          <button onClick={guardarBorrador} disabled={guardando}
            className="flex items-center gap-2 border border-feisen-azul text-feisen-azul px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50">
            {guardando ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
            Guardar borrador
          </button>
          <button
            onClick={() => conDiferencia > 0 ? setModalConfirm(true) : setMsg({ tipo: 'alerta', texto: 'No hay diferencias para corregir.' })}
            className="flex items-center gap-2 bg-feisen-rojo text-white px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
            <CheckCircle size={14} /> Aplicar correcciones
          </button>
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Fecha del conteo</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <div className="col-span-2 sm:col-span-2">
          <label className="text-xs font-medium text-gray-500 block mb-1">Notas (opcional)</label>
          <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: Conteo fin de mes agosto"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-6">
        <div className="flex-1">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progreso del conteo</span>
            <span className="font-semibold">{contados} / {items.length} productos</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className="bg-feisen-azul h-2.5 rounded-full transition-all"
              style={{ width: items.length ? `${(contados / items.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
        <div className={`text-center px-4 py-2 rounded-xl ${conDiferencia > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
          <p className={`text-xl font-bold ${conDiferencia > 0 ? 'text-feisen-rojo' : 'text-gray-400'}`}>
            {conDiferencia}
          </p>
          <p className="text-xs text-gray-500">Con diferencia</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <select value={filtroBodega} onChange={e => setFiltroBodega(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
          <option value="">Todas las bodegas</option>
          {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
        <button onClick={() => setSoloConDif(v => !v)}
          className={`flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl border font-medium transition-colors
            ${soloConDif ? 'bg-feisen-rojo text-white border-feisen-rojo' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          <AlertTriangle size={13} /> Solo diferencias ({conDiferencia})
        </button>
      </div>

      {/* Tabla */}
      {cargando ? <Spinner /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-500">Producto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden md:table-cell">Bodega</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500">Sistema</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500">Físico (contado)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itemsFiltrados.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400">Sin resultados</td></tr>
              ) : itemsFiltrados.map(item => {
                const tieneDif = item.diferencia !== null && item.diferencia !== 0
                const rowBg = tieneDif
                  ? item.diferencia > 0 ? 'bg-blue-50' : 'bg-red-50'
                  : item.cantidad_fisica !== null ? 'bg-green-50' : ''
                return (
                  <tr key={item.key} className={`transition-colors ${rowBg}`}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{item.item_nombre}</p>
                      <p className="text-xs text-gray-400">{item.categoria_nombre} · {item.item_unidad}</p>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <span className="text-xs bg-blue-50 text-feisen-azul px-2 py-0.5 rounded-full">
                        {item.bodega_nombre}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-semibold text-gray-700">{item.cantidad_sistema}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={conteos[item.key] ?? ''}
                        onChange={e => setConteos(prev => ({ ...prev, [item.key]: e.target.value }))}
                        placeholder="—"
                        className="w-24 text-center border border-gray-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul font-medium"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {item.diferencia === null ? (
                        <span className="text-gray-300">—</span>
                      ) : item.diferencia === 0 ? (
                        <span className="text-green-500 font-semibold">✓ 0</span>
                      ) : (
                        <span className={`font-bold text-base ${item.diferencia > 0 ? 'text-feisen-azul' : 'text-feisen-rojo'}`}>
                          {item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Reporte de diferencias */}
      {conDiferencia > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-feisen-rojo" />
            <h2 className="font-semibold text-gray-700">Reporte de diferencias ({conDiferencia} productos)</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Producto</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500 hidden sm:table-cell">Bodega</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Sistema</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Físico</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Dif. und.</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Valor COP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itemsConCalculo
                .filter(i => i.diferencia !== null && i.diferencia !== 0)
                .sort((a, b) => Math.abs(b.valor_diferencia ?? 0) - Math.abs(a.valor_diferencia ?? 0))
                .map(item => (
                  <tr key={item.key} className={item.diferencia > 0 ? 'bg-blue-50' : 'bg-red-50'}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{item.item_nombre}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs hidden sm:table-cell">{item.bodega_nombre}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{item.cantidad_sistema}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{item.cantidad_fisica}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${item.diferencia > 0 ? 'text-feisen-azul' : 'text-feisen-rojo'}`}>
                      {item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${item.valor_diferencia === null ? 'text-gray-300' : item.valor_diferencia > 0 ? 'text-feisen-azul' : 'text-feisen-rojo'}`}>
                      {item.valor_diferencia === null
                        ? 'Sin precio'
                        : item.valor_diferencia > 0
                          ? `+${cop(item.valor_diferencia)}`
                          : cop(item.valor_diferencia)}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-600">Totales</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-500">—</td>
                <td className="px-4 py-3 text-right text-sm">
                  <div className="flex flex-col items-end gap-0.5">
                    {totalSobrante > 0 && <span className="text-feisen-azul font-semibold">+{cop(totalSobrante)}</span>}
                    {totalFaltante < 0 && <span className="text-feisen-rojo font-semibold">{cop(totalFaltante)}</span>}
                    <span className={`font-bold text-base ${(totalSobrante + totalFaltante) >= 0 ? 'text-feisen-azul' : 'text-feisen-rojo'}`}>
                      Neto: {(totalSobrante + totalFaltante) >= 0 ? '+' : ''}{cop(totalSobrante + totalFaltante)}
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Modal confirmación */}
      {modalConfirm && (
        <Modal titulo="¿Aplicar correcciones al sistema?" onCerrar={() => !aplicando && setModalConfirm(false)}>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800 font-medium flex items-center gap-2">
                <AlertTriangle size={16} /> Esta acción actualizará el stock de {conDiferencia} producto{conDiferencia > 1 ? 's' : ''} en el sistema.
              </p>
              <p className="text-xs text-amber-600 mt-1">
                El cambio quedará registrado en el historial de movimientos como "Ajuste inventario físico".
              </p>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-gray-500">Producto</th>
                    <th className="text-right px-3 py-2 text-gray-500">Sistema → Físico</th>
                    <th className="text-right px-3 py-2 text-gray-500">Dif.</th>
                    <th className="text-right px-3 py-2 text-gray-500">Valor COP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {itemsConCalculo.filter(i => i.diferencia !== null && i.diferencia !== 0).map(item => (
                    <tr key={item.key}>
                      <td className="px-3 py-1.5 font-medium text-gray-700">{item.item_nombre}</td>
                      <td className="px-3 py-1.5 text-right text-gray-500">
                        {item.cantidad_sistema} → {item.cantidad_fisica}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-bold ${item.diferencia > 0 ? 'text-feisen-azul' : 'text-feisen-rojo'}`}>
                        {item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia}
                      </td>
                      <td className={`px-3 py-1.5 text-right text-xs ${item.valor_diferencia === null ? 'text-gray-300' : item.valor_diferencia > 0 ? 'text-feisen-azul' : 'text-feisen-rojo'}`}>
                        {item.valor_diferencia === null ? '—' : item.valor_diferencia > 0 ? `+${cop(item.valor_diferencia)}` : cop(item.valor_diferencia)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setModalConfirm(false)} disabled={aplicando}
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={aplicarCorrecciones} disabled={aplicando}
                className="flex items-center gap-2 px-4 py-2 bg-feisen-azul text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {aplicando ? <><RefreshCw size={14} className="animate-spin" /> Aplicando...</> : <><CheckCircle size={14} /> Sí, corregir inventario</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
