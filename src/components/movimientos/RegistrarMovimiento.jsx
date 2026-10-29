import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { useAuth } from '../../contexts/AuthContext'
import { Search, Upload, FileImage, X, CalendarDays, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import Alerta from '../shared/Alerta'
import Spinner from '../shared/Spinner'
import FirmaCanvas from '../shared/FirmaCanvas'
import { coincideBusqueda } from '../../utils/busqueda'
import { EncabezadoPagina, ChipBodega, Segmentado, Contador, useAviso, useAtajoBuscar } from '../shared/ui'
import { esBodegaMotores, ajustarSeriales, problemaSeriales, serialesYaEnBodega, registrarSerialesEntrada, CamposSerial, MAX_SERIALES } from '../shared/seriales'

const TIPOS     = { ADMIN: ['entrada', 'salida'], LOGISTICA: ['entrada', 'salida'], ALMACENISTA: ['entrada', 'salida'] }
const TIPO_LABEL = { entrada: 'Entrada', salida: 'Salida' }
const DESTINOS   = ['Producción y ensamble', 'Venta externa', 'Otro']

export default function RegistrarMovimiento() {
  const { perfil, esAdmin, bodegasOperacion } = useAuth()
  const [searchParams] = useSearchParams()
  const location          = useLocation()
  const tipoInicial       = searchParams.get('tipo') || ''
  const tiposDisponibles  = TIPOS[perfil?.rol] || []

  const [bodegas,        setBodegas]        = useState([])
  const [items,          setItems]          = useState([])
  const [pedidos,        setPedidos]        = useState([])
  const [itemsFiltrados, setItemsFiltrados] = useState([])
  const [busqueda,       setBusqueda]       = useState('')
  const [mostrarLista,   setMostrarLista]   = useState(false)
  const [cargando,       setCargando]       = useState(true)
  const [guardando,      setGuardando]      = useState(false)
  const [subiendo,       setSubiendo]       = useState(false)
  const [stockPorClave,  setStockPorClave]  = useState({}) // `${item_id}_${bodega_id}` → cantidad
  const navigate  = useNavigate()
  const buscarRef = useRef(null)
  const [aviso, avisar] = useAviso()
  useAtajoBuscar(buscarRef)
  const [error,          setError]          = useState('')
  const [firmaDataUrl,   setFirmaDataUrl]   = useState(null)
  // Fecha en que ocurrió el movimiento (hora de Colombia). Por defecto hoy; se puede mover hacia atrás.
  const HOY_COL = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const [fechaMov, setFechaMov] = useState(HOY_COL)
  // Motores (bodega MOTORES): una unidad por serial. En la salida se eligen de los que
  // están en bodega; si el producto no tiene seriales cargados (o faltan), se escriben.
  const [serialesDisp,     setSerialesDisp]     = useState([])        // [{ id, serial }] disponibles del producto
  const [serialesElegidos, setSerialesElegidos] = useState(new Set()) // ids de serialesDisp que salen
  const [serialesTexto,    setSerialesTexto]    = useState([])        // seriales escritos a mano

  const pedidoDesdeNav    = location.state?.pedido_id        || ''
  const cantidadDesdeNav  = location.state?.cantidad_sugerida || ''

  const [form, setForm] = useState({
    tipo:              tiposDisponibles.includes(tipoInicial) ? tipoInicial : (tiposDisponibles[0] || 'entrada'),
    item_id:           '',
    item_nombre:       '',
    cantidad:          cantidadDesdeNav ? String(cantidadDesdeNav) : '',
    bodega_id:         '',
    destino:           '',
    referencia:        '',
    numero_of:         '',
    serial_motor:      '',
    proveedor:         '',
    pedido_id:         pedidoDesdeNav,
    foto_remision_url: '',
  })

  useEffect(() => {
    async function cargar() {
      let bodegasQ = supabase.from('bodegas').select('*').eq('activo', true).order('nombre')
      // Catálogo paginado: el servidor corta a 1.000 filas y el catálogo ya tiene más de 1.500 productos
      const itemsQ = fetchAllPages((d, h) => {
        let q = supabase.from('items').select('id, nombre, unidad_medida, bodega_id, precio_costo')
          .eq('activo', true).order('nombre').order('id').range(d, h)
        if (bodegasOperacion) q = q.in('bodega_id', bodegasOperacion)
        return q
      })
      if (bodegasOperacion) {
        bodegasQ = bodegasQ.in('id', bodegasOperacion)
      }

      const stockQ = fetchAllPages((d, h) => {
        let q = supabase.from('stock').select('item_id, bodega_id, cantidad_actual').order('item_id').order('bodega_id').range(d, h)
        if (bodegasOperacion) q = q.in('bodega_id', bodegasOperacion)
        return q
      })
      const [{ data: bods }, { data: its }, { data: peds }, { data: stk }] = await Promise.all([
        bodegasQ,
        itemsQ,
        supabase.from('pedidos').select('id, numero, estado').in('estado', ['pendiente', 'en_transito', 'recibido']).order('created_at', { ascending: false }).limit(50),
        stockQ,
      ])
      setStockPorClave(Object.fromEntries((stk || []).map(r => [`${r.item_id}_${r.bodega_id}`, Number(r.cantidad_actual) || 0])))
      setBodegas(bods || [])
      setItems(its || [])
      setItemsFiltrados(its || [])
      setPedidos(peds || [])
      if (bods?.length === 1) setForm(f => ({ ...f, bodega_id: bods[0].id }))
      setCargando(false)
    }
    cargar()
  }, [])

  // Búsqueda por palabras sueltas, sin tildes ni orden (igual que el resto de la app)
  useEffect(() => {
    setItemsFiltrados(busqueda.trim() ? items.filter(i => coincideBusqueda(i.nombre, busqueda)) : items)
  }, [busqueda, items])

  const itemSelBase  = items.find(i => i.id === form.item_id)
  const bodegaSelNom = bodegas.find(b => b.id === (form.bodega_id || itemSelBase?.bodega_id))?.nombre
  const esMotor      = !!itemSelBase && esBodegaMotores(bodegaSelNom)
  const modoLista    = esMotor && form.tipo === 'salida' && serialesDisp.length > 0

  // Seriales disponibles del motor elegido
  useEffect(() => {
    setSerialesDisp([]); setSerialesElegidos(new Set()); setSerialesTexto([])
    if (!esMotor || !form.item_id) return
    let vigente = true
    supabase.from('motor_seriales').select('id, serial')
      .eq('item_id', form.item_id).eq('estado', 'disponible').order('serial')
      .then(({ data }) => { if (vigente) setSerialesDisp(data || []) })
    return () => { vigente = false }
  }, [form.item_id, esMotor, form.tipo])

  // Sin lista: un campo de serial por cada unidad del contador
  useEffect(() => {
    if (esMotor && !modoLista) setSerialesTexto(l => ajustarSeriales(l, parseFloat(form.cantidad)))
  }, [esMotor, modoLista, form.cantidad])

  function seleccionarItem(item) {
    setForm(f => ({ ...f, item_id: item.id, item_nombre: item.nombre, bodega_id: item.bodega_id || f.bodega_id, cantidad: f.cantidad || '1' }))
    setBusqueda('')
    setMostrarLista(false)
  }

  async function subirRemision(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    const ext  = file.name.split('.').pop()
    const path = `remision_${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('remisiones').upload(path, file)
    if (uploadErr) { setError('Error al subir imagen: ' + uploadErr.message); setSubiendo(false); return }
    const { data: { publicUrl } } = supabase.storage.from('remisiones').getPublicUrl(path)
    setForm(f => ({ ...f, foto_remision_url: publicUrl }))
    setSubiendo(false)
  }

  // El botón de guardar queda abajo y los errores arriba: al aparecer uno, subir a mostrarlo
  useEffect(() => { if (error) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [error])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setGuardando(true)

    if (!form.item_id)   { setError('Selecciona un producto.'); setGuardando(false); return }
    if (!form.bodega_id) { setError('Selecciona una bodega.');  setGuardando(false); return }
    const elegidos = serialesDisp.filter(s => serialesElegidos.has(s.id))
    const cantidad = modoLista ? elegidos.length + serialesTexto.length : parseFloat(form.cantidad)
    const falla = msg => { setError(msg); setGuardando(false) }
    if (modoLista && cantidad === 0) return falla('Toca el serial del motor que sale.')
    if (!cantidad || cantidad <= 0) return falla('La cantidad debe ser mayor a cero.')
    if (form.tipo === 'salida' && !form.destino) return falla('Selecciona el destino.')

    // Motores: un serial por unidad, sin repetir; la salida va siempre a una OF
    const seriales = esMotor ? [...elegidos.map(s => s.serial), ...serialesTexto] : []
    if (esMotor) {
      if (!Number.isInteger(cantidad)) return falla('Los motores se registran por unidades enteras.')
      if (cantidad > MAX_SERIALES) return falla(`Registra máximo ${MAX_SERIALES} motores por vez.`)
      const problema = problemaSeriales(seriales)
      if (problema) return falla(problema)
      if (form.tipo === 'salida' && !form.numero_of.trim()) return falla('Escribe la OF (orden de fabricación) a la que va el motor.')
      if (form.tipo === 'entrada') {
        const repetidos = await serialesYaEnBodega(form.item_id, seriales)
        if (repetidos.length) return falla(`Ya hay en bodega un motor con el serial ${repetidos.join(', ')}. Revisa la placa.`)
      }
    }

    // Validar stock disponible antes de registrar salida
    if (form.tipo === 'salida') {
      const { data: stockRow } = await supabase
        .from('stock')
        .select('cantidad_actual')
        .eq('item_id', form.item_id)
        .eq('bodega_id', form.bodega_id)
        .maybeSingle()
      const stockActual = stockRow?.cantidad_actual ?? 0
      if (stockActual < cantidad) {
        setError(`Stock insuficiente. Disponible: ${stockActual.toLocaleString('es-CO')} — solicitado: ${cantidad.toLocaleString('es-CO')}`)
        setGuardando(false)
        return
      }
    }

    const item = items.find(i => i.id === form.item_id)

    const iniciales = (perfil?.nombre || 'USR')
      .trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
    const prefix = `MOV-${iniciales}-`
    const { data: lastMov } = await supabase
      .from('movimientos').select('numero').like('numero', `${prefix}%`)
      .order('numero', { ascending: false }).limit(1).maybeSingle()
    const lastNum = lastMov?.numero ? parseInt(lastMov.numero.replace(prefix, ''), 10) || 0 : 0
    const numero = `${prefix}${String(lastNum + 1).padStart(4, '0')}`

    const payload = {
      numero,
      tipo:                  form.tipo,
      item_id:               form.item_id,
      bodega_origen_id:      form.tipo === 'salida'  ? form.bodega_id : null,
      bodega_destino_id:     form.tipo === 'entrada' ? form.bodega_id : null,
      cantidad,
      precio_costo_snapshot: item?.precio_costo || 0,
      centro_costo:          bodegas.find(b => b.id === form.bodega_id)?.nombre || '',
      usuario_id:            perfil.id,
      // Entrada
      proveedor:             form.tipo === 'entrada' ? (form.proveedor || null) : null,
      pedido_id:             form.tipo === 'entrada' ? (form.pedido_id || null) : null,
      foto_remision_url:     firmaDataUrl || (form.tipo === 'entrada' ? (form.foto_remision_url || null) : null),
      // Salida
      destino:               form.tipo === 'salida'  ? form.destino       : null,
      numero_of:             form.tipo === 'salida'  ? (form.numero_of    || null) : null,
      serial_motor:          form.tipo === 'salida'  ? (form.serial_motor || null) : null,  // motores: uno por fila, abajo
      referencia:            form.tipo === 'salida'  ? (form.referencia   || null) : null,
      motivo: null, cliente: null,
      fecha_movimiento:      fechaMov || HOY_COL,
    }

    // Motores: una fila de 1 unidad por serial (todas con el mismo N°), para seguir cada motor
    const filas = esMotor
      ? seriales.map(s => ({ ...payload, cantidad: 1, serial_motor: s.trim() }))
      : [payload]
    const { data: movs, error: err } = await supabase.from('movimientos').insert(filas)
      .select('id, item_id, serial_motor, bodega_destino_id')
    setGuardando(false)
    if (err) { setError('Error: ' + err.message); return }

    let errSeriales = null
    if (esMotor && form.tipo === 'entrada') errSeriales = await registrarSerialesEntrada(movs || [])
    if (esMotor && form.tipo === 'salida' && elegidos.length) {
      const movPorSerial = Object.fromEntries((movs || []).map(m => [m.serial_motor, m.id]))
      const res = await Promise.all(elegidos.map(s => supabase.from('motor_seriales').update({
        estado: 'despachado', salida_mov_id: movPorSerial[s.serial.trim()] || null,
        numero_of: form.numero_of.trim(), despachado_en: new Date().toISOString(),
      }).eq('id', s.id)))
      errSeriales = res.find(r => r.error)?.error || null
    }
    if (errSeriales) setError(`El movimiento ${numero} quedó registrado, pero no se pudo actualizar la lista de seriales (${errSeriales.message}). Avisa a administración.`)

    // Si la entrada tiene pedido asociado, marcarlo como recibido
    if (form.tipo === 'entrada' && form.pedido_id) {
      await supabase.from('pedidos')
        .update({ estado: 'recibido', fecha_recibido: new Date().toISOString() })
        .eq('id', form.pedido_id)
    }
    // Aviso corto y formulario limpio para el siguiente (antes: pantalla de éxito de 2,5 s)
    avisar(`${form.tipo === 'entrada' ? 'Entrada' : 'Salida'} ${numero} registrada`, { texto: 'Ver', alHacer: () => navigate('/movimientos') })
    const delta = form.tipo === 'entrada' ? cantidad : -cantidad
    const clave = `${form.item_id}_${form.bodega_id}`
    setStockPorClave(prev => ({ ...prev, [clave]: (prev[clave] || 0) + delta }))
    setForm(f => ({
      ...f, item_id: '', item_nombre: '', cantidad: '', referencia: '',
      numero_of: '', serial_motor: '', destino: '', proveedor: '', pedido_id: '', foto_remision_url: '',
    }))
    setSerialesDisp([]); setSerialesElegidos(new Set()); setSerialesTexto([])
    setBusqueda('')
    setFirmaDataUrl(null)
    setFechaMov(HOY_COL)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (cargando) return <Spinner texto="Cargando formulario..." />

  const esEntrada = form.tipo === 'entrada'
  const titulo    = esAdmin ? 'Registrar movimiento' : (esEntrada ? 'Registro de entrada' : 'Registro de salida')
  const itemSel   = itemSelBase
  const hay       = (itemId, bodegaId) => stockPorClave[`${itemId}_${bodegaId}`] ?? 0
  const haySel    = itemSel ? hay(itemSel.id, form.bodega_id || itemSel.bodega_id) : 0
  const cantNum   = modoLista ? serialesElegidos.size + serialesTexto.length : (parseFloat(form.cantidad) || 0)
  const extrasPermitidos = Math.max(0, haySel - serialesDisp.length) // unidades viejas sin serial cargado
  const falta     = !esEntrada && itemSel && cantNum > haySel
  const claseInput = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'
  const campo = (etiqueta, contenido, opcional = false) => (
    <div className="space-y-1.5 min-w-0">
      <label className="block text-sm font-medium text-feisen-texto">{etiqueta} {opcional && <span className="font-normal text-gray-400">(opcional)</span>}</label>
      {contenido}
    </div>
  )
  const bloque = (titulo, contenido) => (
    <section className="bg-white border border-feisen-borde rounded-xl p-4 space-y-3 min-w-0">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">{titulo}</h2>
      {contenido}
    </section>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {aviso}
      <EncabezadoPagina modulo="Inventarios" titulo={titulo}
        subtitulo={bodegas.length === 1 && <span>Bodega <ChipBodega>{bodegas[0].nombre}</ChipBodega></span>} />

      {tiposDisponibles.length > 1 && (
        <Segmentado grande valor={form.tipo} onCambiar={t => { setForm(f => ({ ...f, tipo: t, destino: '' })); setError('') }}
          opciones={[
            { valor: 'salida',  texto: 'Salida',  icono: ArrowUpRight },
            { valor: 'entrada', texto: 'Entrada', icono: ArrowDownLeft },
          ].filter(o => tiposDisponibles.includes(o.valor))} />
      )}

      <div className="flex items-center gap-2 text-sm text-feisen-texto-2">
        <CalendarDays size={16} className="shrink-0" />
        <label htmlFor="fecha-mov-log">Fecha del movimiento</label>
        <input id="fecha-mov-log" type="date" value={fechaMov} max={HOY_COL} onChange={e => setFechaMov(e.target.value)}
          className="border border-feisen-borde rounded-lg px-2.5 py-1.5 bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul" />
        {fechaMov !== HOY_COL && <button type="button" onClick={() => setFechaMov(HOY_COL)} className="text-feisen-azul font-medium">Hoy</button>}
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Producto */}
        {bloque('Producto', <>
          {!itemSel ? (
            <>
              <div className="relative">
                <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input ref={buscarRef} type="search" value={busqueda} autoComplete="off" aria-label="Buscar producto"
                  onChange={e => { setBusqueda(e.target.value); setMostrarLista(true) }}
                  onFocus={() => setMostrarLista(true)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (busqueda.trim() && itemsFiltrados[0]) seleccionarItem(itemsFiltrados[0]) } }}
                  placeholder="Buscar producto por palabras del nombre…"
                  className="w-full border border-feisen-borde rounded-lg pl-10 pr-3 py-2.5 bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
              </div>
              {mostrarLista && busqueda.trim() && (
                <div className="border border-feisen-borde rounded-lg overflow-y-auto overscroll-contain max-h-[26rem] divide-y divide-feisen-borde-suave">
                  {itemsFiltrados.length > 0 && (
                    <p className="sticky top-0 z-10 px-3 py-1.5 text-xs text-feisen-texto-2 bg-feisen-fondo">
                      {itemsFiltrados.length.toLocaleString('es-CO')} {itemsFiltrados.length === 1 ? 'producto' : 'productos'}{itemsFiltrados.length > 6 ? ' · desliza para ver todos' : ''}
                    </p>
                  )}
                  {itemsFiltrados.length === 0 && (
                    <p className="px-3 py-3 text-sm text-feisen-texto-2">Ningún producto tiene “{busqueda.trim()}” en el nombre. Prueba con una sola palabra.</p>
                  )}
                  {itemsFiltrados.slice(0, 200).map(item => {
                    const h = hay(item.id, item.bodega_id)
                    return (
                      <button key={item.id} type="button" onClick={() => seleccionarItem(item)}
                        className="w-full text-left px-3 py-2.5 min-h-[52px] bg-white hover:bg-feisen-fondo">
                        <span className="block text-sm text-feisen-texto break-words">{item.nombre}</span>
                        <span className={`block text-xs tabular-nums ${!esEntrada && h <= 0 ? 'text-feisen-rojo' : 'text-feisen-texto-2'}`}>
                          {h > 0 ? `Hay ${h.toLocaleString('es-CO')} ${item.unidad_medida}` : 'Sin stock'}
                          {bodegas.length > 1 ? ` · ${bodegas.find(b => b.id === item.bodega_id)?.nombre || ''}` : ''}
                        </span>
                      </button>
                    )
                  })}
                  {itemsFiltrados.length > 200 && <p className="px-3 py-2 text-xs text-gray-400 bg-white">Se muestran 200 de {itemsFiltrados.length}. Escribe otra palabra para afinar.</p>}
                </div>
              )}
            </>
          ) : (
            <div className={`rounded-lg border px-3 py-3 space-y-3 ${falta ? 'border-transparent bg-feisen-rojo-suave' : 'border-feisen-borde'}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-feisen-texto break-words">{itemSel.nombre}</p>
                  <p className={`text-xs tabular-nums ${falta ? 'text-feisen-rojo font-medium' : 'text-feisen-texto-2'}`}>
                    {falta ? `Solo hay ${haySel.toLocaleString('es-CO')} ${itemSel.unidad_medida}`
                      : esEntrada ? `Hay ${haySel.toLocaleString('es-CO')} · quedarán ${(haySel + cantNum).toLocaleString('es-CO')} ${itemSel.unidad_medida}`
                      : `Hay ${haySel.toLocaleString('es-CO')} · quedan ${(haySel - cantNum).toLocaleString('es-CO')} ${itemSel.unidad_medida}`}
                  </p>
                </div>
                <button type="button" aria-label="Cambiar producto" onClick={() => { setForm(f => ({ ...f, item_id: '', item_nombre: '' })); setTimeout(() => buscarRef.current?.focus(), 0) }}
                  className="p-2 -m-1 rounded-lg text-gray-400 hover:text-feisen-texto hover:bg-white"><X size={17} /></button>
              </div>
              {modoLista ? (
                <p className="text-sm text-feisen-texto-2">
                  {cantNum === 0 ? 'Elige abajo el serial que sale' : <>Sale{cantNum === 1 ? '' : 'n'} <b className="text-feisen-texto">{cantNum}</b> {itemSel.unidad_medida}</>}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <Contador valor={form.cantidad} onCambiar={v => setForm(f => ({ ...f, cantidad: v.replace(',', '.') }))} etiqueta="Cantidad" ancho="w-20" />
                  <span className="text-sm text-feisen-texto-2">{itemSel.unidad_medida}</span>
                </div>
              )}
            </div>
          )}
          {bodegas.length > 1 && campo('Bodega',
            <select required value={form.bodega_id} onChange={e => setForm(f => ({ ...f, bodega_id: e.target.value }))} className={claseInput}>
              <option value="">Selecciona bodega</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>)}
        </>)}

        {/* Motores: serial por unidad */}
        {esMotor && bloque(esEntrada ? 'Serial de cada motor' : '¿Qué motor sale?', modoLista ? <>
          <p className="text-sm text-feisen-texto-2">Toca el serial que está en la placa del motor que sale.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {serialesDisp.map(sd => {
              const activo = serialesElegidos.has(sd.id)
              return (
                <button key={sd.id} type="button" aria-pressed={activo}
                  onClick={() => setSerialesElegidos(prev => { const n = new Set(prev); n.has(sd.id) ? n.delete(sd.id) : n.add(sd.id); return n })}
                  className={`min-h-[48px] px-3 rounded-lg border text-left font-mono text-[15px] font-semibold transition-colors active:scale-[.98] flex items-center gap-2
                    ${activo ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul' : 'border-feisen-borde bg-white text-feisen-texto hover:bg-feisen-fondo'}`}>
                  <span className={`w-5 h-5 rounded border flex items-center justify-center text-xs shrink-0 ${activo ? 'bg-feisen-azul border-feisen-azul text-white' : 'border-feisen-borde'}`}>{activo ? '✓' : ''}</span>
                  <span className="break-all">{sd.serial}</span>
                </button>
              )
            })}
          </div>
          {serialesTexto.length > 0 && <>
            <p className="text-xs text-feisen-texto-2">Motores sin serial cargado (escríbelo de la placa):</p>
            <CamposSerial valores={serialesTexto} onCambiar={setSerialesTexto} claseInput={claseInput} />
          </>}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {serialesTexto.length < extrasPermitidos && (
              <button type="button" onClick={() => setSerialesTexto(l => [...l, ''])} className="text-sm font-medium text-feisen-azul">
                + El serial no está en la lista
              </button>
            )}
            {serialesTexto.length > 0 && (
              <button type="button" onClick={() => setSerialesTexto(l => l.slice(0, -1))} className="text-sm font-medium text-feisen-texto-2">
                Quitar el último
              </button>
            )}
          </div>
        </> : <>
          <p className="text-sm text-feisen-texto-2">
            {esEntrada
              ? 'Escribe el serial de la placa de cada motor. Cada motor queda registrado aparte para seguirlo hasta su salida.'
              : 'Este motor no tiene seriales cargados: escríbelo tal como está en la placa.'}
          </p>
          <CamposSerial valores={serialesTexto} onCambiar={setSerialesTexto} claseInput={claseInput} />
        </>)}

        {/* Entrada */}
        {esEntrada && bloque('De dónde viene', <>
          <div className="grid sm:grid-cols-2 gap-3">
            {campo('Proveedor', <input value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
              placeholder="Ej: Distribuidora Motors S.A.S." className={claseInput} />, true)}
            {campo('Pedido asociado',
              <select value={form.pedido_id} onChange={e => setForm(f => ({ ...f, pedido_id: e.target.value }))} className={claseInput}>
                <option value="">Sin pedido asociado</option>
                {pedidos.map(p => <option key={p.id} value={p.id}>{p.numero} · {p.estado === 'en_transito' ? 'En tránsito' : p.estado === 'recibido' ? 'Recibido' : 'Pendiente'}</option>)}
              </select>, true)}
          </div>
          {campo('Foto de la remisión', form.foto_remision_url ? (
            <div className="space-y-2">
              <img src={form.foto_remision_url} alt="Remisión" className="w-full max-h-48 object-contain rounded-lg border border-feisen-borde bg-feisen-fondo" />
              <button type="button" onClick={() => setForm(f => ({ ...f, foto_remision_url: '' }))} className="text-sm text-feisen-rojo font-medium">Quitar foto</button>
            </div>
          ) : (
            <label className={`flex items-center justify-center gap-2 cursor-pointer border border-dashed rounded-lg px-4 py-5 text-sm transition-colors
              ${subiendo ? 'border-feisen-borde bg-feisen-fondo text-gray-400' : 'border-feisen-borde text-feisen-texto-2 hover:border-feisen-azul hover:text-feisen-azul'}`}>
              {subiendo ? <><FileImage size={18} className="animate-pulse" /> Subiendo…</> : <><Upload size={18} /> Toca para adjuntar la foto</>}
              <input type="file" accept="image/*" className="hidden" onChange={subirRemision} disabled={subiendo} />
            </label>
          ), true)}
        </>)}

        {/* Salida */}
        {!esEntrada && bloque('¿A dónde va?', <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {DESTINOS.map(d => (
              <button key={d} type="button" aria-pressed={form.destino === d} onClick={() => setForm(f => ({ ...f, destino: d }))}
                className={`min-h-[48px] px-3 rounded-lg border text-sm font-semibold transition-colors active:scale-[.98]
                  ${form.destino === d ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul' : 'border-feisen-borde bg-white text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
                {d}
              </button>
            ))}
          </div>
          {esMotor ? (
            campo('OF (orden de fabricación) a la que va el motor',
              <input value={form.numero_of} onChange={e => setForm(f => ({ ...f, numero_of: e.target.value }))} placeholder="Ej: 8465" className={claseInput} />)
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {campo('N° orden de fabricación', <input value={form.numero_of} onChange={e => setForm(f => ({ ...f, numero_of: e.target.value }))} placeholder="Ej: 8465" className={claseInput} />, true)}
              {campo('Serial del motor', <input value={form.serial_motor} onChange={e => setForm(f => ({ ...f, serial_motor: e.target.value }))} placeholder="Ej: 215325060196" className={claseInput} />, true)}
            </div>
          )}
          {campo('Referencia / observación', <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} placeholder="Ej: Factura 001" className={claseInput} />, true)}
        </>)}

        {bloque('Firma', <FirmaCanvas onFirma={setFirmaDataUrl} firmaDataUrl={firmaDataUrl} />)}

        {/* Botón fijo abajo */}
        <div className="sticky bottom-[calc(4.5rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10">
          <div className="flex items-center gap-3 bg-white border border-feisen-borde rounded-xl shadow-sm pl-4 pr-2 py-2">
            <p className="flex-1 min-w-0 text-sm leading-tight">
              {itemSel
                ? <><b className="block text-feisen-texto truncate">{itemSel.nombre}</b>
                    <span className={`text-xs tabular-nums ${falta ? 'text-feisen-rojo font-medium' : 'text-feisen-texto-2'}`}>{esEntrada ? '+' : '−'}{cantNum.toLocaleString('es-CO')} {itemSel.unidad_medida}{falta ? ' · sin stock' : ''}</span></>
                : <><b className="block text-feisen-texto">Sin producto</b><span className="text-xs text-feisen-texto-2">Busca uno arriba</span></>}
            </p>
            <button type="submit" disabled={guardando || subiendo}
              className="bg-feisen-azul text-white rounded-lg px-5 min-h-[48px] text-[15px] font-semibold disabled:opacity-60 hover:opacity-90 active:scale-[.98] transition">
              {guardando ? 'Registrando…' : esEntrada ? 'Registrar entrada' : 'Registrar salida'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
