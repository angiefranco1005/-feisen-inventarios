import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Alerta from './shared/Alerta'
import Spinner from '../shared/Spinner'
import SelectBuscable from './shared/SelectBuscable'
import AutocompletarTexto from './shared/AutocompletarTexto'
import { Plus, X, Paperclip, Check, ArrowLeft, ArrowRight } from 'lucide-react'
import { CENTRO_NOMBRE, TRANSPORTE_NOMBRE, hoyISO, formatoOF, formatFecha } from './shared/formatters'

const PASOS = [
  { n: 1, label: 'Cliente y fechas' },
  { n: 2, label: 'Productos' },
  { n: 3, label: 'Envío' },
]

export default function NuevaOrden() {
  const { perfil, esAdmin } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const ordenEditandoId = params.get('editar')
  const editando = !!ordenEditandoId

  const [paso, setPaso] = useState(1)
  const [cargandoOrden, setCargandoOrden] = useState(editando)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [proximoNumero, setProximoNumero] = useState(null)

  // Paso 1
  const [cliente, setCliente] = useState('')
  const [clientes, setClientes] = useState([])
  const [fechaOrden, setFechaOrden] = useState(hoyISO())
  const [fechaPromesa, setFechaPromesa] = useState('')
  const [numeroCotizacion, setNumeroCotizacion] = useState('')
  const [notas, setNotas] = useState('')

  // Paso 2
  const [lineas, setLineas] = useState([]) // {id?, producto, color, cantidad, centro_costo, detalle, bloqueado}
  const [idsOriginales, setIdsOriginales] = useState([]) // ids de items_of que ya existían al abrir la OF a editar
  const [productos, setProductos] = useState([])
  const [lProducto, setLProducto] = useState('')
  const [lColor, setLColor] = useState('')
  const [lCantidad, setLCantidad] = useState(1)
  const [lCentro, setLCentro] = useState('')
  const [lDetalle, setLDetalle] = useState('')

  // Paso 3
  const [ciudad, setCiudad] = useState('')
  const [direccion, setDireccion] = useState('')
  const [contacto, setContacto] = useState('')
  const [transporte, setTransporte] = useState('propio_cliente')
  const [nombreTransportadora, setNombreTransportadora] = useState('')
  const [archivo, setArchivo] = useState(null) // File nuevo a subir
  const [archivoActual, setArchivoActual] = useState(null) // {url, nombre} ya guardado

  useEffect(() => {
    if (editando) cargarOrden()
  }, [ordenEditandoId])

  useEffect(() => { cargarProductos(); cargarClientes(); if (!editando) cargarProximoNumero() }, [])

  async function cargarProximoNumero() {
    const { data } = await supabase.from('ordenes_fabricacion')
      .select('numero').order('numero', { ascending: false }).limit(1)
    const ultimo = data && data[0] ? data[0].numero : 0
    setProximoNumero(ultimo + 1)
  }

  async function cargarProductos() {
    const { data } = await supabase.from('of_productos').select('nombre').eq('activo', true).order('nombre')
    const nombres = (data || []).map(p => p.nombre)
    setProductos(nombres)
    setLProducto(prev => prev || nombres[0] || '')
  }

  async function cargarClientes() {
    const { data } = await supabase.from('of_clientes').select('nombre').order('nombre')
    setClientes((data || []).map(c => c.nombre))
  }

  async function cargarOrden() {
    setCargandoOrden(true)
    const { data: orden } = await supabase.from('ordenes_fabricacion').select('*').eq('id', ordenEditandoId).single()
    const { data: items } = await supabase.from('items_of').select('*').eq('orden_id', ordenEditandoId)
    if (orden) {
      setCliente(orden.cliente)
      setFechaOrden(orden.fecha_orden)
      setFechaPromesa(orden.fecha_promesa)
      setNumeroCotizacion(orden.numero_cotizacion || '')
      setNotas(orden.notas || '')
      setCiudad(orden.ciudad)
      setDireccion(orden.direccion || '')
      setContacto(orden.contacto || '')
      setTransporte(orden.transporte)
      setNombreTransportadora(orden.nombre_transportadora || '')
      if (orden.archivo_oc_url) setArchivoActual({ url: orden.archivo_oc_url, nombre: orden.archivo_oc_nombre })
    }
    setLineas((items || []).map(it => ({
      id: it.id,
      producto: it.producto, color: it.color, cantidad: it.cantidad,
      centro_costo: it.centro_costo, detalle: it.detalle || '',
      bloqueado: it.producido > 0 || it.entregado > 0,
    })))
    setIdsOriginales((items || []).map(it => it.id))
    setCargandoOrden(false)
  }

  function agregarLinea() {
    if (!lProducto) return
    if (!lCentro) { setMsg({ tipo: 'error', texto: 'Selecciona el centro de costo antes de agregar el producto.' }); return }
    const cant = Number(lCantidad)
    if (!cant || cant <= 0) { setMsg({ tipo: 'error', texto: 'La cantidad debe ser mayor que cero.' }); return }
    setMsg(null)
    setLineas(ls => [...ls, {
      producto: lProducto, color: lColor.trim() || '-', cantidad: cant,
      centro_costo: lCentro, detalle: lDetalle.trim(),
    }])
    setLColor(''); setLCantidad(1); setLDetalle('')
  }

  function quitarLinea(idx) {
    setLineas(ls => ls.filter((_, i) => i !== idx))
  }

  async function guardar() {
    setMsg(null)
    if (!cliente.trim() || !fechaPromesa) { setMsg({ tipo: 'error', texto: 'Cliente y fecha de promesa son obligatorios.' }); setPaso(1); return }
    if (lineas.length === 0) { setMsg({ tipo: 'error', texto: 'Agrega al menos un producto.' }); setPaso(2); return }
    if (!ciudad.trim()) { setMsg({ tipo: 'error', texto: 'La ciudad de destino es obligatoria.' }); setPaso(3); return }

    setGuardando(true)
    try {
      // Guarda el cliente en el catálogo si es nuevo (no existía antes), para que la próxima vez ya salga sugerido
      const clienteTrim = cliente.trim()
      if (!clientes.some(c => c.toLowerCase() === clienteTrim.toLowerCase())) {
        await supabase.from('of_clientes').upsert({ nombre: clienteTrim, creado_por: perfil.id }, { onConflict: 'nombre', ignoreDuplicates: true })
      }

      let archivoUrl = archivoActual?.url || null
      let archivoNombre = archivoActual?.nombre || null
      if (archivo) {
        // Supabase Storage rechaza nombres con tildes, ñ, espacios raros, etc. ("Invalid key"):
        // en la ruta se usa una versión limpia del nombre; el nombre original se guarda aparte para mostrarlo
        const nombreLimpio = archivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${Date.now()}_${nombreLimpio}`
        const { error: upErr } = await supabase.storage.from('of-adjuntos').upload(path, archivo)
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('of-adjuntos').getPublicUrl(path)
        archivoUrl = pub.publicUrl
        archivoNombre = archivo.name
      }

      const payload = {
        cliente: cliente.trim(),
        fecha_orden: fechaOrden,
        fecha_promesa: fechaPromesa,
        numero_cotizacion: numeroCotizacion.trim() || null,
        notas: notas.trim() || null,
        ciudad: ciudad.trim(),
        direccion: direccion.trim() || null,
        contacto: contacto.trim() || null,
        transporte,
        nombre_transportadora: nombreTransportadora.trim() || null,
        archivo_oc_url: archivoUrl,
        archivo_oc_nombre: archivoNombre,
      }

      let ordenId = ordenEditandoId
      if (editando) {
        const { error } = await supabase.from('ordenes_fabricacion').update(payload).eq('id', ordenId)
        if (error) throw error

        // Productos que quitaste de la lista (tenían id y ya no están): se eliminan de verdad en la base de datos
        const idsActuales = lineas.filter(l => l.id).map(l => l.id)
        const idsAEliminar = idsOriginales.filter(id => !idsActuales.includes(id))
        if (idsAEliminar.length) {
          const { error: errDel } = await supabase.from('items_of').delete().in('id', idsAEliminar)
          if (errDel) throw errDel
        }

        // Solo se insertan las líneas nuevas (sin id); las existentes bloqueadas o no, no se tocan aquí
        const nuevasLineas = lineas.filter(l => !l.id)
        if (nuevasLineas.length) {
          const { error: errItems } = await supabase.from('items_of').insert(
            nuevasLineas.map(l => ({ orden_id: ordenId, producto: l.producto, color: l.color, cantidad: l.cantidad, centro_costo: l.centro_costo, detalle: l.detalle || null }))
          )
          if (errItems) throw errItems
        }
      } else {
        const { data: nueva, error } = await supabase.from('ordenes_fabricacion')
          .insert({ ...payload, creado_por: perfil.id })
          .select().single()
        if (error) throw error
        ordenId = nueva.id
        const { error: errItems } = await supabase.from('items_of').insert(
          lineas.map(l => ({ orden_id: ordenId, producto: l.producto, color: l.color, cantidad: l.cantidad, centro_costo: l.centro_costo, detalle: l.detalle || null }))
        )
        if (errItems) {
          // La OF quedó creada pero sin productos: se marca cancelada para que no aparezca vacía
          // como activa, y así al reintentar no queda una OF duplicada
          await supabase.from('ordenes_fabricacion')
            .update({ cancelada: true, motivo_cancelacion: 'Error al guardar los productos (creada de nuevo)', cancelada_en: new Date().toISOString() })
            .eq('id', ordenId)
          throw errItems
        }
        setMsg({ tipo: 'exito', texto: `${formatoOF(nueva.numero)} guardada con ${lineas.length} producto(s).` })
      }
      navigate('/of/ordenes')
    } catch (err) {
      setMsg({ tipo: 'error', texto: 'Error al guardar: ' + err.message })
    } finally {
      setGuardando(false)
    }
  }

  if (cargandoOrden) return <Spinner texto="Cargando Orden de Fabricación..." />

  const totalUnidades = lineas.reduce((s, l) => s + Number(l.cantidad || 0), 0)
  const mostrar = n => editando || paso === n

  // OJO: las secciones son variables JSX (no componentes) para que los campos no pierdan el foco al escribir
  const seccionCliente = (
    <div className="p-5 grid sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <Campo label="Cliente *">
          <AutocompletarTexto
            opciones={clientes}
            value={cliente}
            onChange={setCliente}
            placeholder="Busca un cliente existente o escribe uno nuevo..."
          />
        </Campo>
      </div>
      <Campo label="Fecha de la orden">
        <input type="date" value={fechaOrden} onChange={e => setFechaOrden(e.target.value)} className={INPUT} />
      </Campo>
      <Campo label="Fecha de promesa de entrega *">
        <input type="date" value={fechaPromesa} onChange={e => setFechaPromesa(e.target.value)} className={INPUT} />
      </Campo>
      <Campo label="Número de cotización (opcional)">
        <input value={numeroCotizacion} onChange={e => setNumeroCotizacion(e.target.value)} placeholder="Ej: COT-1234" className={INPUT} />
      </Campo>
      <div className="sm:col-span-2">
        <Campo label="Notas (opcional)">
          <textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Detalles adicionales de la orden" className={INPUT} />
        </Campo>
      </div>
      <div className="sm:col-span-2">
        <Campo label="Orden de compra del cliente (adjunto)">
          <label className="flex items-center gap-2 text-sm border border-dashed border-feisen-borde rounded-lg px-3 py-2.5 cursor-pointer bg-white hover:bg-feisen-fondo text-feisen-texto-2">
            <Paperclip size={15} strokeWidth={1.8} className="text-feisen-azul flex-shrink-0" />
            <span className="truncate">{archivo ? archivo.name : (archivoActual ? archivoActual.nombre + ' (ya adjunta, clic para reemplazar)' : 'Adjuntar archivo')}</span>
            <input type="file" className="hidden" onChange={e => setArchivo(e.target.files[0])} />
          </label>
        </Campo>
      </div>
    </div>
  )

  const seccionProductos = (
    <>
      <div className="p-5 space-y-4">
        {productos.length === 0 && (
          <Alerta tipo="info" mensaje={<>Todavía no hay productos en el catálogo. Ve a <Link to="/of/productos" className="underline font-semibold">Productos</Link> para crear el primero.</>} />
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Campo label="Producto">
              <SelectBuscable
                opciones={productos}
                value={lProducto}
                onChange={setLProducto}
                placeholder="Escribe para buscar un producto..."
                disabled={productos.length === 0}
              />
            </Campo>
          </div>
          <Campo label="Color de la máquina">
            <input value={lColor} onChange={e => setLColor(e.target.value)} placeholder="Ej: Rojo Feisen" className={INPUT} />
          </Campo>
          <Campo label="Cantidad">
            <input type="number" min={1} value={lCantidad} onChange={e => setLCantidad(e.target.value)} className={INPUT} />
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Centro de costo *">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Centro de costo">
                {Object.keys(CENTRO_NOMBRE).map(c => (
                  <button key={c} type="button" role="radio" aria-checked={lCentro === c} onClick={() => setLCentro(c)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors
                      ${lCentro === c
                        ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-semibold'
                        : 'border-feisen-borde bg-white text-feisen-texto-2 hover:border-feisen-gris-medio'}`}>
                    {CENTRO_NOMBRE[c]}
                  </button>
                ))}
              </div>
            </Campo>
          </div>
          <div className="sm:col-span-2">
            <Campo label="Detalle (opcional)">
              <textarea rows={2} value={lDetalle} onChange={e => setLDetalle(e.target.value)} placeholder="Ej: con parrilla adicional, motor a gasolina" className={INPUT} />
            </Campo>
          </div>
        </div>
        <button onClick={agregarLinea} disabled={productos.length === 0}
          className="flex items-center gap-1.5 text-sm border border-feisen-azul text-feisen-azul hover:bg-feisen-azul-suave px-3.5 py-2 rounded-lg font-semibold transition-colors disabled:opacity-60">
          <Plus size={15} /> Agregar a la OF
        </button>
      </div>

      <div className="border-t border-feisen-borde-suave">
        <p className="px-5 pt-4 pb-1 text-xs font-semibold text-feisen-texto-2">
          Productos en esta OF <span className="text-feisen-gris-medio font-medium tabular-nums">{lineas.length}</span>
        </p>
        {lineas.length === 0 && <p className="px-5 pb-4 pt-1 text-sm text-feisen-gris-medio italic">Todavía no has agregado productos.</p>}
        <div className="divide-y divide-feisen-borde-suave">
          {lineas.map((l, idx) => (
            <div key={idx} className="px-5 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-feisen-texto">
                  <span className="font-medium">{l.producto}</span>
                  <span className="text-feisen-texto-2"> · {l.color} · </span>
                  <span className="font-semibold tabular-nums">{l.cantidad} uds</span>
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-gray-100 text-feisen-texto-2">{CENTRO_NOMBRE[l.centro_costo]}</span>
                  {l.detalle && <span className="text-xs text-feisen-gris-medio">{l.detalle}</span>}
                </div>
              </div>
              {l.bloqueado ? (
                <span className="text-[11px] text-feisen-gris-medio whitespace-nowrap">En producción / despachado</span>
              ) : (
                <button onClick={() => quitarLinea(idx)} aria-label={`Quitar ${l.producto}`} className="text-feisen-gris-medio hover:text-feisen-rojo p-1"><X size={16} /></button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )

  const seccionEnvio = (
    <div className="p-5 grid sm:grid-cols-2 gap-4">
      <Campo label="Ciudad de destino *">
        <input value={ciudad} onChange={e => setCiudad(e.target.value)} placeholder="Ej: Bucaramanga" className={INPUT} />
      </Campo>
      <Campo label="Tipo de transporte">
        <select value={transporte} onChange={e => setTransporte(e.target.value)} className={INPUT}>
          {Object.keys(TRANSPORTE_NOMBRE).map(t => <option key={t} value={t}>{TRANSPORTE_NOMBRE[t]}</option>)}
        </select>
      </Campo>
      <Campo label="Nombre de la transportadora (si aplica)">
        <input value={nombreTransportadora} onChange={e => setNombreTransportadora(e.target.value)} placeholder="Ej: Coordinadora, TCC, Envía..." className={INPUT} />
      </Campo>
      <Campo label="Contacto y teléfono en destino">
        <input value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Ej: Andrés Ruiz - 300 123 4567" className={INPUT} />
      </Campo>
      <div className="sm:col-span-2">
        <Campo label="Dirección de entrega">
          <input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Ej: Cra 15 #23-40, Bodega 3" className={INPUT} />
        </Campo>
      </div>
    </div>
  )

  const botonGuardar = (
    <button onClick={guardar} disabled={guardando}
      className="bg-feisen-rojo hover:bg-feisen-rojo-claro text-white rounded-lg px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-60">
      {guardando ? 'Guardando...' : (editando ? 'Guardar cambios' : 'Guardar Orden de Fabricación')}
    </button>
  )
  const botonContinuar = (n, texto) => (
    <button onClick={() => setPaso(n)}
      className="flex items-center gap-1.5 bg-feisen-azul hover:bg-feisen-azul-claro text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors">
      {texto} <ArrowRight size={15} />
    </button>
  )
  const botonAtras = n => (
    <button onClick={() => setPaso(n)} className="flex items-center gap-1.5 text-sm text-feisen-texto-2 hover:text-feisen-texto font-medium px-1 py-2">
      <ArrowLeft size={15} /> Atrás
    </button>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        {esAdmin && !editando && (
          <p className="text-sm text-feisen-texto-2">¡Hola, {perfil?.nombre?.split(' ')[0] || 'Angie'}!</p>
        )}
        <h1 className="text-xl font-semibold text-feisen-texto mt-0.5">
          {editando ? 'Editar Orden de Fabricación' : 'Nueva Orden de Fabricación'}
        </h1>
        {!editando && proximoNumero && (
          <p className="text-xs text-feisen-gris-medio mt-1">
            Se guardará como <span className="font-semibold text-feisen-azul tabular-nums">{formatoOF(proximoNumero)}</span> (número estimado; puede variar si alguien más crea una OF al mismo tiempo)
          </p>
        )}
      </div>

      {editando && (
        <Alerta tipo="info" mensaje="Estás editando una OF existente. Los productos que ya tienen fabricación o despacho registrado no se pueden modificar ni quitar desde aquí." />
      )}
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Pasos (solo al crear) */}
      {!editando && (
        <div className="bg-white border border-feisen-borde rounded-xl px-4 py-3 flex items-center gap-2 sm:gap-3">
          {PASOS.map((p, i) => {
            const hecho = paso > p.n
            const actual = paso === p.n
            return (
              <div key={p.n} className="contents">
                {i > 0 && <div className="flex-1 h-px bg-feisen-borde min-w-[12px]" />}
                <button onClick={() => setPaso(p.n)} className={`flex items-center gap-2 text-sm whitespace-nowrap ${actual ? 'text-feisen-azul font-semibold' : hecho ? 'text-feisen-texto-2 font-medium' : 'text-feisen-gris-medio font-medium'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 border
                    ${actual ? 'bg-feisen-azul border-feisen-azul text-white' : hecho ? 'bg-feisen-azul-suave border-feisen-azul-suave text-feisen-azul' : 'bg-white border-feisen-borde'}`}>
                    {hecho ? <Check size={13} strokeWidth={2.5} /> : p.n}
                  </span>
                  <span className={actual ? '' : 'hidden sm:inline'}>{p.label}</span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-5 items-start">
        <div className="space-y-5">
          {mostrar(1) && (
            <Tarjeta titulo={editando ? '1. Cliente y fechas' : 'Cliente y fechas'}
              pie={!editando && <><span />{botonContinuar(2, 'Continuar a productos')}</>}>
              {seccionCliente}
            </Tarjeta>
          )}
          {mostrar(2) && (
            <Tarjeta titulo={editando ? '2. Productos' : 'Agregar producto'}
              pie={!editando && <>{botonAtras(1)}{botonContinuar(3, 'Continuar a envío')}</>}>
              {seccionProductos}
            </Tarjeta>
          )}
          {mostrar(3) && (
            <Tarjeta titulo={editando ? '3. Datos de envío' : 'Datos de envío'}
              pie={<>{!editando ? botonAtras(2) : <span />}{botonGuardar}</>}>
              {seccionEnvio}
            </Tarjeta>
          )}
        </div>

        {/* Resumen de lo registrado hasta ahora */}
        <aside className="bg-white border border-feisen-borde rounded-xl px-5 py-4 lg:sticky lg:top-6">
          <p className="font-semibold text-feisen-texto mb-2">Resumen de la OF</p>
          <dl className="text-sm divide-y divide-feisen-borde-suave">
            <FilaResumen label="Cliente" valor={cliente.trim()} />
            <FilaResumen label="Fecha orden" valor={fechaOrden && formatFecha(fechaOrden)} />
            <FilaResumen label="Promesa" valor={fechaPromesa && formatFecha(fechaPromesa)} />
            <FilaResumen label="Cotización" valor={numeroCotizacion.trim()} />
            <FilaResumen label="Productos" valor={lineas.length ? `${lineas.length} · ${totalUnidades} uds` : ''} />
            <FilaResumen label="Envío" valor={ciudad.trim() && `${ciudad.trim()} · ${TRANSPORTE_CORTO[transporte] || ''}`} />
          </dl>
          {(archivo || archivoActual) && (
            <div className="mt-3 px-3 py-2 bg-feisen-fondo rounded-lg text-xs text-feisen-texto-2 flex items-center gap-2">
              <Paperclip size={13} className="flex-shrink-0" /> <span className="truncate">{archivo ? archivo.name : archivoActual.nombre}</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

const INPUT = 'w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm bg-white text-feisen-texto placeholder:text-feisen-gris-medio focus:outline-none focus:ring-2 focus:ring-feisen-azul/25 focus:border-feisen-azul'

const TRANSPORTE_CORTO = {
  directo: 'Vehículo propio',
  contratado: 'Transporte tercerizado',
  propio_cliente: 'Recoge en planta',
  transportadora: 'Transportadora',
}

function Campo({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-feisen-texto-2 block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Tarjeta({ titulo, pie, children }) {
  return (
    <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
      <p className="px-5 pt-4 font-semibold text-feisen-texto">{titulo}</p>
      {children}
      {pie && (
        <div className="px-5 py-3 border-t border-feisen-borde-suave bg-feisen-fondo/60 flex items-center justify-between gap-3">
          {pie}
        </div>
      )}
    </div>
  )
}

function FilaResumen({ label, valor }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-feisen-gris-medio">{label}</dt>
      <dd className={`text-right tabular-nums ${valor ? 'text-feisen-texto font-medium' : 'text-feisen-gris-medio'}`}>{valor || 'Pendiente'}</dd>
    </div>
  )
}
