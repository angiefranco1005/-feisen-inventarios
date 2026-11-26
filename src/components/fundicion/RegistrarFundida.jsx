import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { nombreBodega } from '../../utils/bodegasCatalogo'
import { coincideBusqueda, sinTildes } from '../../utils/busqueda'
import { EncabezadoPagina, useAviso } from '../shared/ui'
import { Plus, X, XCircle, Clock, Users, Package, Flame, List } from '../shared/iconos'
import { useUnaVez } from '../../hooks/useUnaVez'

const FUND_BODEGA_ID = 'a0604489-2768-445b-8e68-e450ef8520ed'

// Materiales del formulario que tienen item en inventario → se descontarán al guardar
const MATERIAL_ITEMS = {
  carbon:      '7314b94c-385c-4c22-b0f8-04861fbc644e', // CARBÓN
  caliza:      '8dac18cd-3909-4ea5-ace5-316a2cf6a894', // CALIZA
  ferromolido: '8a13934b-6d19-4ef1-975f-8b36f3429abd', // FERROMOLIDO
  exlac:       '55974f24-8892-475f-8658-eb57f5f496cc', // EXLAC (slax)
}

const MATERIAL_LABELS = {
  carbon:      'Carbón',
  caliza:      'Caliza',
  ferromolido: 'Ferromolido',
  exlac:       'Exlac (slax)',
}

async function generarNumSalida(perfil) {
  const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
  const pre = `SAL-${iniciales}-`
  const { data: last } = await supabase
    .from('movimientos').select('numero').like('numero', `${pre}%`)
    .order('numero', { ascending: false }).limit(1).maybeSingle()
  const n = last?.numero ? parseInt(last.numero.replace(pre, ''), 10) || 0 : 0
  return `${pre}${String(n + 1).padStart(4, '0')}`
}

function hoyCol() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

const claseInput = 'w-full border border-feisen-borde rounded-lg px-3 min-h-[44px] bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'

// ── Piezas de la pantalla ───────────────────────────────────────────────────
function Bloque({ titulo, icono: Icono, detalle, children }) {
  return (
    <section className="bg-white border border-feisen-borde rounded-xl p-4 space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">
          {Icono && <Icono size={14} />} {titulo}
        </h2>
        {detalle && <span className="text-xs text-gray-400 text-right">{detalle}</span>}
      </div>
      {children}
    </section>
  )
}

function Etiqueta({ htmlFor, children, requerido, opcional }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-feisen-texto mb-1.5">
      {children}
      {requerido && <span className="text-feisen-rojo ml-0.5" aria-hidden="true">*</span>}
      {opcional && <span className="font-normal text-gray-400"> (opcional)</span>}
    </label>
  )
}

// Nombre comparable: sin tildes, mayúsculas ni espacios de más
const claveNombre = n => sinTildes(String(n || '').replace(/\s+/g, ' ').trim())
const AREAS = { fundicionHierro: 'Fundición', aluminio: 'Aluminio', construequipos: 'Construequipos', administracion: 'Administración' }

// Campo de persona: menú con los colaboradores internos (de RRHH, vía colaboradores_fundida()) y
// los externos usados antes (localStorage). Si no está, se escribe y se usa como externo
// (gente contratada solo por el día). Debajo dice si quedó como Interno o Externo.
function InputPersona({ value, onChange, placeholder, storageKey, ariaLabel, internos }) {
  const [mostrar, setMostrar] = useState(false)
  const texto = String(value || '')
  const clave = claveNombre(texto)
  const esInterno = !!clave && internos.some(c => claveNombre(c.nombre) === clave)

  const leerExternos = () => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { return [] }
  }
  const coincide = n => !texto.trim() || coincideBusqueda(n, texto)
  const deFundicion = internos.filter(c => c.area === 'fundicionHierro' && coincide(c.nombre))
  const otrasAreas  = internos.filter(c => c.area !== 'fundicionHierro' && coincide(c.nombre))
  const externos    = mostrar ? leerExternos()
    .filter(n => !internos.some(c => claveNombre(c.nombre) === claveNombre(n)) && coincide(n)) : []
  const exacto = [...internos.map(c => c.nombre), ...externos].some(n => claveNombre(n) === clave)

  function elegir(n) { onChange(n); setMostrar(false) }
  function guardarExterno(val) {
    const v = String(val || '').trim()
    if (!v || internos.some(c => claveNombre(c.nombre) === claveNombre(v))) return
    try {
      const saved = leerExternos()
      if (!saved.some(x => claveNombre(x) === claveNombre(v))) localStorage.setItem(storageKey, JSON.stringify([v, ...saved].slice(0, 40)))
    } catch { /* sin almacenamiento: no pasa nada */ }
  }

  const fila = (n, detalle) => (
    <button key={n + (detalle || '')} type="button" onMouseDown={() => elegir(n)}
      className="w-full text-left px-3 min-h-[44px] text-sm text-feisen-texto hover:bg-feisen-fondo active:bg-feisen-azul-suave flex items-center justify-between gap-2">
      <span className="min-w-0 truncate">{n}</span>
      {detalle && <span className="shrink-0 text-xs text-feisen-texto-2">{detalle}</span>}
    </button>
  )
  const titulo = t => <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">{t}</p>
  const hayAlgo = deFundicion.length + otrasAreas.length + externos.length > 0 || (texto.trim() && !exacto)

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setMostrar(true) }}
        onFocus={() => setMostrar(true)}
        onBlur={() => { setTimeout(() => setMostrar(false), 150); guardarExterno(value) }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        className={claseInput}
      />
      {texto.trim() && (
        <span className={`mt-1 inline-block text-[11px] font-medium px-1.5 py-px rounded-md ${esInterno ? 'bg-feisen-azul-suave text-feisen-azul' : 'bg-amber-50 text-amber-700'}`}>
          {esInterno ? 'Interno' : 'Externo'}
        </span>
      )}
      {mostrar && hayAlgo && (
        <div className="absolute z-30 w-full bg-white border border-feisen-borde rounded-lg shadow-lg mt-1 max-h-[min(22rem,50vh)] overflow-y-auto overscroll-contain py-1">
          {texto.trim() && !exacto && (
            <button type="button" onMouseDown={() => { guardarExterno(texto); setMostrar(false) }}
              className="w-full text-left px-3 min-h-[44px] text-sm font-medium text-feisen-azul hover:bg-feisen-azul-suave flex items-center gap-1.5">
              <Plus size={15} className="shrink-0" /> <span className="truncate">Usar «{texto.trim()}» como externo</span>
            </button>
          )}
          {deFundicion.length > 0 && <>{titulo('Internos · Fundición')}{deFundicion.map(c => fila(c.nombre))}</>}
          {otrasAreas.length > 0 && <>{titulo('Internos · otras áreas')}{otrasAreas.map(c => fila(c.nombre, AREAS[c.area] || c.area))}</>}
          {externos.length > 0 && <>{titulo('Externos usados antes')}{externos.map(n => fila(n))}</>}
        </div>
      )}
    </div>
  )
}

// Lista dinámica de personas
function ListaPersonas({ label, singular, valores, onChange, storageKey, placeholder, requerido, internos = [] }) {
  function agregar() { onChange([...valores, '']) }
  function cambiar(i, v) { const a = [...valores]; a[i] = v; onChange(a) }
  function quitar(i) { onChange(valores.filter((_, idx) => idx !== i)) }

  return (
    <div className="min-w-0">
      <Etiqueta requerido={requerido} opcional={!requerido}>{label}</Etiqueta>
      <div className="space-y-2">
        {valores.map((v, i) => (
          <div key={i} className="flex gap-1 items-center">
            <div className="flex-1 min-w-0">
              <InputPersona
                value={v}
                onChange={val => cambiar(i, val)}
                placeholder={placeholder}
                storageKey={storageKey}
                ariaLabel={`${singular} ${i + 1}`}
                internos={internos}
              />
            </div>
            {valores.length > 1 && (
              <button
                type="button"
                onClick={() => quitar(i)}
                aria-label={`Quitar ${singular.toLowerCase()} ${i + 1}`}
                className="w-11 h-11 grid place-items-center rounded-lg text-gray-400 hover:text-feisen-rojo hover:bg-feisen-rojo-suave transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={agregar}
        className="mt-1 -ml-2 inline-flex items-center gap-1 min-h-[44px] px-2 text-sm text-feisen-azul font-medium rounded-lg hover:bg-feisen-azul-suave transition-colors"
      >
        <Plus size={15} /> Agregar {singular.toLowerCase()}
      </button>
    </div>
  )
}

const MATERIALES = [
  { key: 'pesoVaceadero',     dbKey: 'peso_vaceadero',            label: 'Peso vaceadero',             unit: 'kg' },
  { key: 'hierroColado',      dbKey: 'hierro_colado',             label: 'Hierro colado',              unit: 'kg' },
  { key: 'carbon',            dbKey: 'carbon',                    label: 'Carbón',                     unit: 'kg' },
  { key: 'caliza',            dbKey: 'caliza',                    label: 'Caliza',                     unit: 'kg' },
  { key: 'ferromolido',       dbKey: 'ferromolido',               label: 'Ferromolido',                unit: 'kg' },
  { key: 'exlac',             dbKey: 'exlac',                     label: 'Exlac',                      unit: 'kg' },
  { key: 'temperatura',       dbKey: 'temperatura',               label: 'Temperatura aprox.',         unit: '°C' },
]

// Solo visual: separa lo que se descuenta del inventario (consumo del horno) de lo que solo se anota
const MAT_CONSUMO = MATERIALES.filter(m => MATERIAL_ITEMS[m.key])
const MAT_COLADA  = MATERIALES.filter(m => !MATERIAL_ITEMS[m.key])

function CampoMaterial({ m, valor, onCambiar }) {
  const id = `mat-${m.key}`
  return (
    <div className="min-w-0">
      <Etiqueta htmlFor={id}>{m.label}</Etiqueta>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={valor}
          onChange={e => onCambiar(m.key, e.target.value)}
          onFocus={e => e.target.select()}
          placeholder="0"
          className={claseInput + ' pr-10 text-right tabular-nums'}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">
          {m.unit}
        </span>
      </div>
    </div>
  )
}

function numFun(n) {
  return `FUN-${String(n).padStart(4, '0')}`
}

export default function RegistrarFundida() {
  const unaVez = useUnaVez()
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const [aviso, avisar] = useAviso()
  const errorRef = useRef(null)

  const [fecha,       setFecha]       = useState(hoyCol())
  const [horaInicio,  setHoraInicio]  = useState('')
  const [horaFin,     setHoraFin]     = useState('')
  const [horneros,    setHorneros]    = useState([''])
  const [vaceadores,  setVaceadores]  = useState([''])
  const [auxiliares,  setAuxiliares]  = useState([''])
  // Cargos del horno (26/11/2026): texto libre, puede ser gente externa contratada por el día
  const [pisadores,   setPisadores]   = useState([''])
  const [reparadores, setReparadores] = useState([''])
  const [picadores,   setPicadores]   = useState([''])
  const [horaCarga,   setHoraCarga]   = useState('')   // primera carga al caldero
  // Colaboradores internos para el menú del personal (solo nombre y área). Si la función no existe
  // o falla, el campo sigue funcionando como texto libre.
  const [internos,    setInternos]    = useState([])
  useEffect(() => {
    supabase.rpc('colaboradores_fundida').then(({ data, error }) => { if (!error && Array.isArray(data)) setInternos(data.filter(c => c?.nombre)) })
  }, [])
  const [materiales,  setMateriales]  = useState(
    Object.fromEntries(MATERIALES.map(m => [m.key, '']))
  )
  const [observaciones, setObservaciones] = useState('')

  const [guardando,      setGuardando]      = useState(false)
  const [error,          setError]          = useState('')
  const [ultima,         setUltima]         = useState(null)
  const [proximoNumero,  setProximoNumero]  = useState(null)
  // Fundida guardada a la que le falta descontar materiales: { numero, fecha, cantidades }
  const [pendiente,      setPendiente]      = useState(null)

  useEffect(() => {
    supabase.from('fundidas').select('numero').order('numero', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setProximoNumero((data?.numero || 0) + 1))
  }, [])

  // Si aparece un error, llevarlo a la vista (el botón de guardar está abajo)
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  function setMat(key, val) {
    setMateriales(prev => ({ ...prev, [key]: val }))
  }

  function limpiar() {
    setFecha(hoyCol()); setHoraInicio(''); setHoraFin(''); setHoraCarga('')
    setHorneros(['']); setVaceadores(['']); setAuxiliares([''])
    setPisadores(['']); setReparadores(['']); setPicadores([''])
    setMateriales(Object.fromEntries(MATERIALES.map(m => [m.key, ''])))
    setObservaciones(''); setError('')
  }

  // Al guardar con éxito: aviso corto con el número asignado y el formulario queda listo para la siguiente
  function registrada(numero) {
    limpiar()
    setUltima(numero)
    setProximoNumero(numero + 1)
    avisar(`Fundida ${numFun(numero)} registrada`, { texto: 'Ver fundidas', alHacer: () => navigate('/fundidas') }, 6000)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (pendiente) { reintentarDescuento(); return } // la fundida ya existe: solo falta el descuento
    setError('')

    if (!fecha)       { setError('Ingresa la fecha.'); return }
    if (!horaInicio)  { setError('Ingresa la hora de encendido del horno.'); return }
    if (!horaCarga)   { setError('Ingresa la hora en que salió la primera carga al caldero.'); return }
    const limpiar = l => l.map(x => x.trim()).filter(Boolean)
    const hornerosFiltrados   = limpiar(horneros)
    const vaceadoresFiltrados = limpiar(vaceadores)
    const pisadoresF   = limpiar(pisadores)
    const reparadoresF = limpiar(reparadores)
    const picadoresF   = limpiar(picadores)
    if (hornerosFiltrados.length === 0)   { setError('Ingresa al menos un hornero.'); return }
    if (vaceadoresFiltrados.length === 0) { setError('Ingresa al menos un vaceador.'); return }
    if (pisadoresF.length === 0)   { setError('Ingresa quién pisó el horno.'); return }
    if (reparadoresF.length === 0) { setError('Ingresa quién arregló o ladrilló el horno.'); return }
    if (picadoresF.length === 0)   { setError('Ingresa quién picó.'); return }

    setGuardando(true)
    try {
      // Validar stock disponible de cada material antes de guardar
      const materialesConsumir = Object.entries(MATERIAL_ITEMS)
        .filter(([key]) => materiales[key] !== '' && parseFloat(materiales[key]) > 0)

      if (materialesConsumir.length > 0) {
        const faltantes = []
        for (const [key, itemId] of materialesConsumir) {
          const { data: stockRow } = await supabase
            .from('stock')
            .select('cantidad_actual')
            .eq('item_id', itemId)
            .eq('bodega_id', FUND_BODEGA_ID)
            .maybeSingle()
          const disponible = Number(stockRow?.cantidad_actual ?? 0)
          const solicitado = parseFloat(materiales[key])
          if (disponible < solicitado) {
            faltantes.push(
              `• ${MATERIAL_LABELS[key]}: necesitas ${solicitado} kg, hay ${disponible.toFixed(2)} kg`
            )
          }
        }
        if (faltantes.length > 0) {
          setError('Stock insuficiente en FUNDICIÓN:\n' + faltantes.join('\n'))
          setGuardando(false)
          return
        }
      }

      const payload = {
        fecha,
        hora_inicio: horaInicio,
        hora_fin:    horaFin || null,
        horneros:    hornerosFiltrados,
        vaceadores:  vaceadoresFiltrados,
        auxiliares:  auxiliares.filter(a => a.trim()),
        pisadores:          pisadoresF,
        reparadores_horno:  reparadoresF,
        picadores:          picadoresF,
        hora_primera_carga: horaCarga,
        observaciones: observaciones.trim() || null,
        usuario_id:  perfil.id,
      }
      MATERIALES.forEach(({ key, dbKey }) => {
        payload[dbKey] = materiales[key] !== '' ? parseFloat(materiales[key]) : null
      })

      const { data, error: err } = await supabase
        .from('fundidas')
        .insert(payload)
        .select('numero')
        .single()

      if (err) { setError('Error al guardar: ' + err.message); return }

      // Crear salidas automáticas de materiales consumidos en el horno
      const cantidades = Object.fromEntries(materialesConsumir.map(([key]) => [key, parseFloat(materiales[key])]))
      const ok = await descontarMateriales({ numero: data.numero, fecha, cantidades })
      if (ok) registrada(data.numero)
    } finally {
      setGuardando(false)
    }
  }

  // Descuenta del stock los materiales del horno de una fundida ya guardada. Si falla, la fundida
  // queda en `pendiente` y el botón solo reintenta este paso (no vuelve a crear la fundida).
  // Antes de insertar revisa si un intento anterior ya alcanzó a guardar la salida.
  async function descontarMateriales(p) {
    const numFun = `FUN-${String(p.numero).padStart(4, '0')}`
    const filas = Object.entries(p.cantidades)
    try {
      if (filas.length > 0) {
        const { data: previas, error: errPrev } = await supabase.from('movimientos')
          .select('id').eq('referencia', numFun).eq('tipo', 'salida').eq('revertido', false)
          .in('item_id', filas.map(([key]) => MATERIAL_ITEMS[key]))
        if (errPrev) throw errPrev
        if ((previas || []).length === 0) {
          const numSal = await generarNumSalida(perfil)
          const ccFundicion = await nombreBodega(FUND_BODEGA_ID, 'FUNDICIÓN') // nombre actual de la bodega
          const { error: errMat } = await supabase.from('movimientos').insert(
            filas.map(([key, cantidad]) => ({
              numero:                numSal,
              tipo:                  'salida',
              item_id:               MATERIAL_ITEMS[key],
              bodega_origen_id:      FUND_BODEGA_ID,
              bodega_destino_id:     null,
              cantidad,
              precio_costo_snapshot: 0,
              centro_costo:          ccFundicion,
              usuario_id:            perfil.id,
              referencia:            numFun,
              fecha_movimiento:      p.fecha || null,
              motivo:                'Consumo horno fundición',
              foto_remision_url: null, destino: null,
              numero_of: null, serial_motor: null, cliente: null, proveedor: null,
            }))
          )
          if (errMat) throw errMat
        }
      }
      setPendiente(null)
      return true
    } catch (e) {
      setPendiente(p)
      setError(`La fundida ${numFun} se guardó, pero no se pudo descontar el consumo de materiales del stock: ${e.message}. Toca "Reintentar descuento": no se vuelve a crear la fundida.`)
      return false
    }
  }

  async function reintentarDescuento() {
    setError(''); setGuardando(true)
    try {
      if (await descontarMateriales(pendiente)) registrada(pendiente.numero)
    } finally {
      setGuardando(false)
    }
  }

  // Resumen de la barra de acción (solo visual)
  const aDescontar = MAT_CONSUMO.filter(m => materiales[m.key] !== '' && parseFloat(materiales[m.key]) > 0)

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {aviso}
      <EncabezadoPagina modulo="Fundición" titulo="Registrar fundida"
        subtitulo={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {proximoNumero
              ? <>Se registrará como <span className="font-mono font-semibold text-feisen-texto bg-white border border-feisen-borde rounded-md px-1.5 py-px">{numFun(proximoNumero)}</span></>
              : 'Datos de la colada: horario, personal y materiales.'}
            {ultima && <span className="text-gray-400">· última: {numFun(ultima)}</span>}
          </span>
        }>
        <button type="button" onClick={() => navigate('/fundidas')}
          className="inline-flex items-center gap-1.5 text-sm text-feisen-texto-2 hover:text-feisen-texto border border-feisen-borde rounded-lg px-3 min-h-[44px] bg-white hover:bg-feisen-fondo transition-colors">
          <List size={15} /> Ver fundidas
        </button>
      </EncabezadoPagina>

      {error && (
        <div ref={errorRef} role="alert" className="flex items-start gap-3 bg-feisen-rojo-suave border border-feisen-rojo/30 rounded-xl p-4">
          <XCircle size={20} className="text-feisen-rojo shrink-0 mt-0.5" />
          <p className="text-sm text-feisen-rojo font-medium whitespace-pre-line">{error}</p>
        </div>
      )}

      <form onSubmit={unaVez(handleSubmit)} className="space-y-4">

        {/* ── HORARIO ── */}
        <Bloque titulo="Horario" icono={Clock}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <div className="col-span-2 sm:col-span-1 min-w-0">
              <Etiqueta htmlFor="fun-fecha" requerido>Fecha</Etiqueta>
              <input id="fun-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={claseInput} />
            </div>
            <div className="min-w-0">
              <Etiqueta htmlFor="fun-hini" requerido>Encendido del horno</Etiqueta>
              <input id="fun-hini" type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className={claseInput} />
            </div>
            <div className="min-w-0">
              <Etiqueta htmlFor="fun-hcarga" requerido>Primera carga al caldero</Etiqueta>
              <input id="fun-hcarga" type="time" value={horaCarga} onChange={e => setHoraCarga(e.target.value)} className={claseInput} />
            </div>
            <div className="min-w-0">
              <Etiqueta htmlFor="fun-hfin" opcional>Hora fin</Etiqueta>
              <input id="fun-hfin" type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} className={claseInput} />
            </div>
          </div>
        </Bloque>

        {/* ── PERSONAL ── */}
        <Bloque titulo="Personal" icono={Users} detalle="Toca un campo para ver nombres usados antes. Puedes escribir personas externas contratadas por el día.">
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-4">
            <ListaPersonas internos={internos}
              label="Horneros" singular="Hornero" requerido
              valores={horneros} onChange={setHorneros}
              storageKey="feisen_horneros" placeholder="Nombre del hornero"
            />
            <ListaPersonas internos={internos}
              label="Vaceadores" singular="Vaceador" requerido
              valores={vaceadores} onChange={setVaceadores}
              storageKey="feisen_vaceadores" placeholder="Nombre del vaceador"
            />
            <ListaPersonas internos={internos}
              label="Auxiliares" singular="Auxiliar"
              valores={auxiliares} onChange={setAuxiliares}
              storageKey="feisen_auxiliares" placeholder="Nombre del auxiliar"
            />
            <ListaPersonas internos={internos}
              label="Pisan el horno" singular="Persona que pisa" requerido
              valores={pisadores} onChange={setPisadores}
              storageKey="feisen_pisadores" placeholder="Quién pisa el horno"
            />
            <ListaPersonas internos={internos}
              label="Arreglan / ladrillan el horno" singular="Persona que arregla" requerido
              valores={reparadores} onChange={setReparadores}
              storageKey="feisen_reparadores_horno" placeholder="Quién arregla o ladrilla"
            />
            <ListaPersonas internos={internos}
              label="Pican" singular="Persona que pica" requerido
              valores={picadores} onChange={setPicadores}
              storageKey="feisen_picadores" placeholder="Quién pica"
            />
          </div>
        </Bloque>

        {/* ── CONSUMO DEL HORNO (se descuenta del inventario) ── */}
        <Bloque titulo="Consumo del horno" icono={Package} detalle="Se descuenta de la bodega Fundición">
          <div className="grid grid-cols-2 gap-3">
            {MAT_CONSUMO.map(m => <CampoMaterial key={m.key} m={m} valor={materiales[m.key]} onCambiar={setMat} />)}
          </div>
          <p className="text-xs text-feisen-texto-2">Antes de guardar se revisa que haya existencias suficientes. Deja en blanco lo que no se usó.</p>
        </Bloque>

        {/* ── COLADA (solo se anota) ── */}
        <Bloque titulo="Colada" icono={Flame} detalle="Solo se anota, no mueve inventario">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {MAT_COLADA.map(m => <CampoMaterial key={m.key} m={m} valor={materiales[m.key]} onCambiar={setMat} />)}
          </div>
        </Bloque>

        {/* ── OBSERVACIONES ── */}
        <Bloque titulo="Observaciones">
          <div>
            <label htmlFor="fun-obs" className="sr-only">Observaciones</label>
            <textarea
              id="fun-obs"
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Problemas o novedades durante el proceso (opcional). Quedará marcada como «Novedad» en la lista."
              rows={3}
              className={claseInput + ' py-2.5 resize-none'}
            />
          </div>
        </Bloque>

        {/* ── BARRA DE ACCIÓN (fija abajo en celular) ── */}
        <div className="sticky bottom-[calc(4.5rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10 mt-2">
          <div className="flex items-center gap-3 bg-white border border-feisen-borde rounded-xl shadow-sm pl-4 pr-2 py-2">
            <div className="flex-1 min-w-0 text-sm leading-tight">
              <p className="font-semibold text-feisen-texto truncate">{pendiente ? numFun(pendiente.numero) : proximoNumero ? numFun(proximoNumero) : 'Nueva fundida'}</p>
              <p className="text-xs text-feisen-texto-2 tabular-nums truncate">
                {pendiente ? 'Guardada · falta descontar materiales' : aDescontar.length === 0
                  ? 'Sin consumo de inventario'
                  : `Descuenta ${aDescontar.map(m => MATERIAL_LABELS[m.key].replace(' (slax)', '').toLowerCase()).join(', ')}`}
              </p>
            </div>
            <button
              type="submit"
              disabled={guardando}
              className="bg-feisen-azul text-white rounded-lg px-5 min-h-[48px] text-[15px] font-semibold disabled:opacity-60 hover:opacity-90 active:scale-[.98] transition shrink-0"
            >
              {guardando ? 'Registrando…' : pendiente ? 'Reintentar descuento' : 'Registrar fundida'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
