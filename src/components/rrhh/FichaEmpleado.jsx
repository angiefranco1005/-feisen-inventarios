import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import {
  ArrowLeft, Camera, Pencil, User, Briefcase, HeartPulse, Wallet, FolderOpen,
  Upload, FileText, Trash2, ExternalLink, Mail, Smartphone, CalendarDays, AlertTriangle,
  MapPin, Users, Building2, Contact, Clock, Shirt, CheckCircle2, Circle, ChevronDown, Plus,
} from 'lucide-react'
import {
  BUCKET_RRHH, AREAS, TIPOS_DOCUMENTO, TIPOS_CONTRATO, TIPOS_VINCULACION, JORNADAS, GENEROS, ESTADOS_CIVILES,
  GRUPOS_SANGUINEOS, NIVELES_EDUCATIVOS, TIPOS_CUENTA, PARENTESCOS, DOCUMENTOS_REQUERIDOS, OTROS_DOCUMENTOS, ESTADOS_EMPLEADO,
  nombreCompleto, iniciales, tiempoDesde, edad, diasParaVencer, formatoFecha, formatoPesos, urlsFirmadas,
  subirFotoEmpleado, calcularFinContrato,
} from './catalogosRRHH'
import * as E from './estilos'

const inputCls = E.input

// Como en Buk: cada sección de la ficha se arma con tarjetas ("bloques"), y
// cada tarjeta se edita por separado. El mismo arreglo de campos sirve para
// la vista de lectura y para el formulario de edición.
const SECCIONES = [
  {
    id: 'personal', label: 'Información personal', icon: User,
    bloques: [
      { id: 'datos', titulo: 'Datos personales', icon: Contact, campos: [
        { k: 'nombres', label: 'Nombres', req: true },
        { k: 'apellidos', label: 'Apellidos', req: true },
        { k: 'tipo_documento', label: 'Tipo de documento', tipo: 'select', opciones: TIPOS_DOCUMENTO, req: true },
        { k: 'numero_documento', label: 'Número de documento', req: true },
        { k: 'fecha_expedicion', label: 'Fecha de expedición', tipo: 'date' },
        { k: 'lugar_expedicion', label: 'Lugar de expedición' },
        { k: 'fecha_nacimiento', label: 'Fecha de nacimiento', tipo: 'date',
          extra: (e) => edad(e.fecha_nacimiento) !== null ? `${edad(e.fecha_nacimiento)} años` : null },
        { k: 'lugar_nacimiento', label: 'Lugar de nacimiento' },
        { k: 'genero', label: 'Género', tipo: 'select', opciones: GENEROS },
        { k: 'estado_civil', label: 'Estado civil', tipo: 'select', opciones: ESTADOS_CIVILES },
        { k: 'grupo_sanguineo', label: 'Grupo sanguíneo (RH)', tipo: 'select', opciones: GRUPOS_SANGUINEOS },
        { k: 'nivel_educativo', label: 'Nivel educativo', tipo: 'select', opciones: NIVELES_EDUCATIVOS },
      ] },
      { id: 'contacto', titulo: 'Contacto y dirección', icon: MapPin, campos: [
        { k: 'celular', label: 'Celular' },
        { k: 'telefono', label: 'Teléfono fijo' },
        { k: 'email_personal', label: 'Correo personal', tipo: 'email' },
        { k: 'direccion', label: 'Dirección' },
        { k: 'barrio', label: 'Barrio' },
        { k: 'ciudad', label: 'Ciudad' },
      ] },
      { id: 'emergencia', titulo: 'Contacto de emergencia', icon: Users, campos: [
        { k: 'emergencia_nombre', label: 'Nombre del contacto' },
        { k: 'emergencia_parentesco', label: 'Parentesco', tipo: 'select', opciones: PARENTESCOS },
        { k: 'emergencia_telefono', label: 'Teléfono' },
      ] },
      { id: 'tallas', titulo: 'Tallas de dotación', icon: Shirt, campos: [
        { k: 'talla_camisa', label: 'Camisa' },
        { k: 'talla_pantalon', label: 'Pantalón' },
        { k: 'talla_calzado', label: 'Calzado / botas' },
      ] },
    ],
  },
  {
    id: 'laboral', label: 'Información laboral', icon: Briefcase,
    bloques: [
      { id: 'cargo', titulo: 'Cargo', icon: Building2, campos: [
        { k: 'cargo', label: 'Cargo', req: true },
        { k: 'area', label: 'Área', tipo: 'select', opciones: AREAS, req: true },
        { k: 'jefe_id', label: 'Jefe inmediato', tipo: 'jefe' },
        { k: 'email_corporativo', label: 'Correo corporativo', tipo: 'email' },
      ] },
      { id: 'contrato', titulo: 'Contrato', icon: FileText,
        // Término fijo: la fecha fin se sugiere sola con ingreso + duración (editable por si hubo prórroga)
        derivar: (f, k) => (['fecha_ingreso', 'duracion_meses', 'tipo_contrato'].includes(k) && f.tipo_contrato === 'Término fijo'
          && calcularFinContrato(f.fecha_ingreso, f.duracion_meses))
          ? { ...f, fecha_fin_contrato: calcularFinContrato(f.fecha_ingreso, f.duracion_meses) } : f,
        campos: [
        { k: 'fecha_ingreso', label: 'Fecha de ingreso', tipo: 'date', req: true,
          extra: (e) => e.fecha_ingreso ? `Antigüedad: ${tiempoDesde(e.fecha_ingreso, e.estado === 'retirado' ? e.fecha_retiro : null) || '—'}` : null },
        { k: 'tipo_contrato', label: 'Tipo de contrato', tipo: 'select', opciones: TIPOS_CONTRATO, req: true },
        { k: 'duracion_meses', label: 'Duración (meses)', tipo: 'number', req: true,
          visible: (f) => f.tipo_contrato === 'Término fijo',
},
        { k: 'fecha_fin_contrato', label: 'Fecha fin de contrato', tipo: 'date', req: true,
          visible: (f) => f.tipo_contrato === 'Término fijo',
          nota: 'Se calcula con la fecha de ingreso y la duración. Cámbiala si el contrato se prorrogó.' },
        { k: 'tipo_vinculacion', label: 'Tipo de vinculación', tipo: 'select', opciones: TIPOS_VINCULACION, req: true,
          visible: (f) => f.tipo_contrato === 'Contratista' },
        { k: 'jornada', label: 'Jornada', tipo: 'select', opciones: JORNADAS },
        { k: 'salario_base', label: 'Salario / honorarios', tipo: 'money',
          nota: (f) => f.tipo_vinculacion === 'dia' && f.tipo_contrato === 'Contratista' ? 'Valor por día trabajado'
            : f.tipo_vinculacion === 'destajo' && f.tipo_contrato === 'Contratista' ? 'Se paga según las piezas producidas (opcional)' : null },
      ] },
      { id: 'estado', titulo: 'Estado', icon: Clock, campos: [
        { k: 'estado', label: 'Estado', tipo: 'select', req: true,
          opciones: Object.entries(ESTADOS_EMPLEADO).map(([value, v]) => ({ value, label: v.label })) },
        { k: 'fecha_retiro', label: 'Fecha de retiro', tipo: 'date', visible: (f) => f.estado === 'retirado', req: true },
        { k: 'motivo_retiro', label: 'Motivo de retiro', visible: (f) => f.estado === 'retirado' },
        { k: 'observaciones', label: 'Observaciones', tipo: 'textarea', full: true },
      ] },
    ],
  },
  {
    id: 'seguridad', label: 'Seguridad social', icon: HeartPulse,
    bloques: [
      { id: 'afiliaciones', titulo: 'Afiliaciones', icon: HeartPulse, campos: [
        { k: 'eps', label: 'EPS' },
        { k: 'fondo_pension', label: 'Fondo de pensiones' },
        { k: 'fondo_cesantias', label: 'Fondo de cesantías' },
        { k: 'caja_compensacion', label: 'Caja de compensación' },
        { k: 'arl', label: 'ARL' },
        { k: 'nivel_riesgo_arl', label: 'Nivel de riesgo ARL', tipo: 'select',
          opciones: [1, 2, 3, 4, 5].map(n => ({ value: String(n), label: `Riesgo ${n}` })) },
      ] },
    ],
  },
  {
    id: 'pago', label: 'Pago', icon: Wallet,
    bloques: [
      { id: 'cuenta', titulo: 'Cuenta para el pago de nómina', icon: Wallet, campos: [
        { k: 'banco', label: 'Banco' },
        { k: 'tipo_cuenta', label: 'Tipo de cuenta', tipo: 'select', opciones: TIPOS_CUENTA },
        { k: 'numero_cuenta', label: 'Número de cuenta' },
      ] },
    ],
  },
  { id: 'documentos', label: 'Documentos', icon: FolderOpen },
]

function opcionLabel(campo, valor) {
  const op = (campo.opciones || []).find(o => (typeof o === 'object' ? String(o.value) : o) === String(valor))
  return op ? (typeof op === 'object' ? op.label : op) : valor
}

export default function FichaEmpleado() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const inputFoto = useRef(null)
  const navRef = useRef(null)

  const [emp,         setEmp]         = useState(null)
  const [otros,       setOtros]       = useState([])   // para el selector de jefe
  const [fotoUrl,     setFotoUrl]     = useState(null)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [msgFoto,     setMsgFoto]     = useState(null)
  const [cargando,    setCargando]    = useState(true)
  const [errorCarga,  setErrorCarga]  = useState(null)
  const [tab,         setTab]         = useState('personal')
  const [editando,    setEditando]    = useState(null)  // id del bloque en edición
  const [form,        setForm]        = useState({})
  const [guardando,   setGuardando]   = useState(false)
  const [msg,         setMsg]         = useState(null)  // { bloque, tipo, texto }

  useEffect(() => { cargar() }, [id])

  async function cargar() {
    setCargando(true)
    const [{ data, error }, { data: lista }] = await Promise.all([
      supabase.from('empleados').select('*').eq('id', id).single(),
      supabase.from('empleados').select('id, nombres, apellidos, cargo, estado').neq('id', id).order('nombres'),
    ])
    if (error) { setErrorCarga(error.message); setCargando(false); return }
    setEmp(data)
    setOtros(lista || [])
    const urls = await urlsFirmadas([data.foto_path])
    setFotoUrl(urls[data.foto_path] || null)
    setCargando(false)
  }

  const seccion = SECCIONES.find(s => s.id === tab)

  // En celular el menú de secciones es horizontal: mantener visible la activa
  useEffect(() => {
    navRef.current?.querySelector('[data-activo="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab])

  function cambiarTab(t) {
    if (editando) return
    setTab(t); setMsg(null)
  }

  function empezarEdicion(bloque) {
    const f = {}
    for (const c of bloque.campos) f[c.k] = emp[c.k] ?? (c.tipo === 'bool' ? false : '')
    if (f.nivel_riesgo_arl !== undefined && f.nivel_riesgo_arl !== '') f.nivel_riesgo_arl = String(f.nivel_riesgo_arl)
    setForm(f); setMsg(null); setEditando(bloque.id)
  }

  async function guardar(e, bloque) {
    e.preventDefault(); setMsg(null); setGuardando(true)
    const cambios = {}
    for (const c of bloque.campos) {
      let v = form[c.k]
      if (typeof v === 'string') v = v.trim()
      if (v === '') v = null
      if (c.tipo === 'money' && v !== null) v = Number(String(v).replace(/[^\d.]/g, ''))
      if ((c.k === 'nivel_riesgo_arl' || c.tipo === 'number') && v !== null) v = Number(v)
      if (c.visible && !c.visible(form)) v = null
      cambios[c.k] = v
    }
    const { data, error } = await supabase.from('empleados').update(cambios).eq('id', id).select('*').single()
    setGuardando(false)
    if (error) {
      setMsg({ bloque: bloque.id, tipo: 'error', texto: error.message.includes('numero_documento')
        ? 'Ya existe otro colaborador con ese número de documento.' : error.message })
      return
    }
    setEmp(data); setEditando(null)
    setMsg({ bloque: bloque.id, tipo: 'exito', texto: 'Cambios guardados.' })
  }

  async function subirFoto(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setMsgFoto(null); setSubiendoFoto(true)
    try {
      const path = await subirFotoEmpleado(id, file, emp.foto_path)
      setEmp(e => ({ ...e, foto_path: path }))
      setFotoUrl(URL.createObjectURL(file))
      setMsgFoto({ tipo: 'exito', texto: 'Foto actualizada.' })
    } catch (err) {
      setMsgFoto({ tipo: 'error', texto: err.message })
    }
    setSubiendoFoto(false)
  }

  if (cargando) return <Spinner />
  const volver = (
    <button onClick={() => navigate('/rrhh/empleados')} className={`${E.btnTexto} -ml-2.5`}>
      <ArrowLeft {...E.ICONO} /> Colaboradores
    </button>
  )

  if (!emp) return (
    <div className="max-w-6xl mx-auto space-y-4">
      {volver}
      <Alerta tipo="error" mensaje={errorCarga || 'No se encontró el colaborador.'} />
    </div>
  )

  const est = ESTADOS_EMPLEADO[emp.estado] || ESTADOS_EMPLEADO.activo
  const jefe = otros.find(o => o.id === emp.jefe_id)
  const diasFin = emp.estado !== 'retirado' ? diasParaVencer(emp.fecha_fin_contrato) : null
  const antig = tiempoDesde(emp.fecha_ingreso, emp.estado === 'retirado' ? emp.fecha_retiro : null)
  const correo = emp.email_corporativo || emp.email_personal

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {volver}

      {/* Encabezado */}
      <div className={`${E.tarjeta} p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex flex-col items-center gap-1.5 self-center sm:self-auto">
            <button onClick={() => inputFoto.current?.click()} disabled={subiendoFoto} title="Cambiar foto"
              className="relative w-20 h-20 rounded-full group">
              {fotoUrl
                ? <img src={fotoUrl} alt="" className="w-20 h-20 rounded-full object-cover border border-feisen-borde-suave" />
                : <div className="w-20 h-20 rounded-full bg-feisen-fondo border border-feisen-borde flex items-center justify-center">
                    <span className="font-semibold text-feisen-texto-2 text-2xl">{iniciales(emp)}</span>
                  </div>}
              <span className="absolute inset-0 rounded-full bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera size={20} strokeWidth={1.8} className="text-white" />
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-white border border-feisen-borde flex items-center justify-center">
                {subiendoFoto
                  ? <span className="animate-spin h-3.5 w-3.5 border-2 border-feisen-azul border-t-transparent rounded-full" />
                  : <Camera size={14} strokeWidth={1.8} className="text-feisen-texto-2" />}
              </span>
            </button>
            <button onClick={() => inputFoto.current?.click()} disabled={subiendoFoto}
              className="text-xs font-medium text-feisen-azul hover:underline disabled:opacity-60">
              {subiendoFoto ? 'Subiendo…' : fotoUrl ? 'Cambiar foto' : 'Subir foto'}
            </button>
            <input ref={inputFoto} type="file" accept="image/*" className="hidden" onChange={subirFoto} />
          </div>

          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
              <h1 className={E.tituloPagina}>{nombreCompleto(emp)}</h1>
              <span className="inline-flex items-center gap-1.5 text-xs text-feisen-texto-2 border border-feisen-borde rounded-full px-2 py-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${est.punto}`} /> {est.label}
              </span>
            </div>
            <p className="text-sm text-feisen-texto-2 mt-0.5">
              {emp.cargo || 'Sin cargo'}{emp.area && ` · ${emp.area}`}
              <span className="text-feisen-gris-medio"> · {emp.codigo}</span>
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm text-feisen-texto-2 justify-center sm:justify-start">
              <DatoRapido icon={Contact} valor={`${emp.tipo_documento} ${emp.numero_documento}`} />
              <DatoRapido icon={CalendarDays} valor={emp.fecha_ingreso && `Ingreso ${formatoFecha(emp.fecha_ingreso)}${antig ? ` · ${antig}` : ''}`} />
              <DatoRapido icon={Smartphone} valor={emp.celular} href={emp.celular && `tel:${emp.celular}`} />
              <DatoRapido icon={Mail} valor={correo} href={correo && `mailto:${correo}`} />
            </div>
          </div>
        </div>

        {msgFoto && <div className="mt-4"><Alerta tipo={msgFoto.tipo} mensaje={msgFoto.texto} /></div>}

        {diasFin !== null && diasFin <= 45 && (
          <div className="mt-4 flex items-center gap-2 border border-amber-200 bg-amber-50 text-amber-800 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle {...E.ICONO} className="flex-shrink-0 text-amber-500" />
            {diasFin < 0
              ? `El contrato venció el ${formatoFecha(emp.fecha_fin_contrato)} (hace ${-diasFin} días).`
              : `El contrato (${emp.tipo_contrato}) vence el ${formatoFecha(emp.fecha_fin_contrato)} — faltan ${diasFin} días.`}
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Menú de secciones: mismo estilo del menú lateral; horizontal en celular */}
        <nav ref={navRef} className="w-full lg:w-52 flex-shrink-0 flex lg:flex-col gap-0.5 overflow-x-auto lg:sticky lg:top-6 -mx-1 px-1 lg:mx-0 lg:px-0">
          {SECCIONES.map(s => (
            <button key={s.id} onClick={() => cambiarTab(s.id)} disabled={!!editando && tab !== s.id}
              data-activo={tab === s.id} className={E.navItem(tab === s.id)}>
              <s.icon size={17} strokeWidth={tab === s.id ? 2.2 : 1.8} /> {s.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 w-full space-y-4">
          {tab === 'documentos'
            ? <DocumentosEmpleado empleadoId={id} perfilId={perfil?.id} />
            : seccion.bloques.map(b => (
              <Bloque key={b.id} bloque={b} emp={emp} jefe={jefe} otros={otros}
                editando={editando === b.id} bloqueado={!!editando && editando !== b.id}
                form={form} setForm={setForm} guardando={guardando}
                msg={msg?.bloque === b.id ? msg : null}
                onEditar={() => empezarEdicion(b)}
                onCancelar={() => { setEditando(null); setMsg(null) }}
                onGuardar={(e) => guardar(e, b)} />
            ))}
          {tab === 'pago' && <CertificacionBancaria empleadoId={id} perfilId={perfil?.id} />}
        </div>
      </div>
    </div>
  )
}

function DatoRapido({ icon: Icon, valor, href }) {
  if (!valor) return null
  const contenido = <><Icon size={14} strokeWidth={1.8} className="text-feisen-gris-medio flex-shrink-0" /><span className="truncate">{valor}</span></>
  const cls = 'inline-flex items-center gap-1.5 min-w-0'
  return href ? <a href={href} className={`${cls} hover:text-feisen-azul`}>{contenido}</a> : <span className={cls}>{contenido}</span>
}

function Bloque({ bloque, emp, jefe, otros, editando, bloqueado, form, setForm, guardando, msg, onEditar, onCancelar, onGuardar }) {
  return (
    <div className={E.tarjeta}>
      <div className={E.cabTarjeta}>
        <h2 className={E.tituloTarj}>
          <bloque.icon {...E.ICONO} className={E.iconoTitulo} /> {bloque.titulo}
        </h2>
        {!editando && (
          <button onClick={onEditar} disabled={bloqueado} className={`${E.btnTexto} -mr-2`}>
            <Pencil size={14} strokeWidth={1.8} /> Editar
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {msg && <div className="mb-4"><Alerta tipo={msg.tipo} mensaje={msg.texto} /></div>}
        {editando ? (
          <form onSubmit={onGuardar}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {bloque.campos.map(c => (!c.visible || c.visible(form)) && (
                <CampoEditable key={c.k} campo={c} valor={form[c.k]} otros={otros} form={form}
                  onChange={v => setForm(f => {
                    const nf = { ...f, [c.k]: v }
                    return bloque.derivar ? bloque.derivar(nf, c.k) : nf
                  })} />
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-5">
              <button type="button" onClick={onCancelar} className={E.btnSecundario}>Cancelar</button>
              <button type="submit" disabled={guardando} className={E.btnPrimario}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3.5">
            {bloque.campos.map(c => {
              if (c.visible && !c.visible(emp)) return null
              const v = emp[c.k]
              let texto
              if (c.tipo === 'bool') texto = v ? 'Sí' : 'No'
              else if (v === null || v === undefined || v === '') texto = null
              else if (c.tipo === 'date') texto = formatoFecha(v)
              else if (c.tipo === 'money') texto = formatoPesos(v)
              else if (c.k === 'duracion_meses') texto = `${v} mes${v > 1 ? 'es' : ''}`
              else if (c.tipo === 'select') texto = opcionLabel(c, v)
              else if (c.tipo === 'jefe') texto = jefe ? `${nombreCompleto(jefe)}${jefe.cargo ? ` · ${jefe.cargo}` : ''}` : null
              else texto = v
              const extra = c.extra?.(emp) || (texto && typeof c.nota === 'function' ? c.nota(emp) : null)
              return (
                <div key={c.k} className={c.full ? 'col-span-full' : ''}>
                  <dt className={`${E.etiqueta} mb-0.5`}>{c.label}</dt>
                  <dd className={`text-sm whitespace-pre-line ${texto ? 'text-feisen-texto' : 'text-feisen-gris-medio/70'}`}>
                    {texto || '—'}
                    {extra && <span className="block text-xs text-feisen-gris-medio">{extra}</span>}
                  </dd>
                </div>
              )
            })}
          </dl>
        )}
      </div>
    </div>
  )
}

function CampoEditable({ campo: c, valor, onChange, otros, form }) {
  const label = <label className={E.labelForm}>{c.label}{c.req && ' *'}</label>
  const nota = typeof c.nota === 'function' ? c.nota(form) : c.nota
  const wrap = (input) => (
    <div className={c.full ? 'col-span-full' : ''}>
      {label}{input}
      {nota && <p className="text-xs text-feisen-gris-medio mt-1">{nota}</p>}
    </div>
  )

  if (c.tipo === 'bool') return (
    <label className="flex items-center gap-2.5 border border-feisen-borde rounded-lg px-3 py-2 self-end cursor-pointer">
      <input type="checkbox" checked={!!valor} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-feisen-azul" />
      <span className="text-sm text-feisen-texto">{c.label}</span>
    </label>
  )
  if (c.tipo === 'select') return wrap(
    <select required={c.req} value={valor ?? ''} onChange={e => onChange(e.target.value)} className={inputCls}>
      {!c.req && <option value="">—</option>}
      {c.opciones.map(o => typeof o === 'object'
        ? <option key={o.value} value={o.value}>{o.label}</option>
        : <option key={o} value={o}>{o}</option>)}
    </select>
  )
  if (c.tipo === 'jefe') return wrap(
    <select value={valor ?? ''} onChange={e => onChange(e.target.value)} className={inputCls}>
      <option value="">— Sin jefe asignado —</option>
      {otros.filter(o => o.estado !== 'retirado' || o.id === valor).map(o =>
        <option key={o.id} value={o.id}>{nombreCompleto(o)}{o.cargo ? ` · ${o.cargo}` : ''}</option>)}
    </select>
  )
  if (c.tipo === 'textarea') return wrap(
    <textarea rows={3} value={valor ?? ''} onChange={e => onChange(e.target.value)} className={inputCls} />
  )
  if (c.tipo === 'money') return wrap(
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-feisen-gris-medio">$</span>
      <input inputMode="numeric" value={valor === null || valor === '' ? '' : Number(String(valor).replace(/[^\d]/g, '')).toLocaleString('es-CO')}
        onChange={e => onChange(e.target.value.replace(/[^\d]/g, ''))} className={`${inputCls} pl-7`} />
    </div>
  )
  if (c.tipo === 'number') return wrap(
    <input required={c.req} type="number" min="1" step="1" inputMode="numeric"
      value={valor ?? ''} onChange={e => onChange(e.target.value)} className={inputCls} />
  )
  return wrap(
    <input required={c.req} type={c.tipo === 'date' ? 'date' : c.tipo === 'email' ? 'email' : 'text'}
      value={valor ?? ''} onChange={e => onChange(e.target.value)} className={inputCls} />
  )
}

// ─── Helpers de documentos (pestaña Documentos y certificación bancaria en Pago) ─
async function subirDocumento(empleadoId, tipo, file, perfilId) {
  const limpio = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_')
  const path = `${empleadoId}/docs/${Date.now()}-${limpio}`
  const { error } = await supabase.storage.from(BUCKET_RRHH).upload(path, file)
  if (error) throw new Error(error.message)
  const { error: errIns } = await supabase.from('empleado_documentos')
    .insert({ empleado_id: empleadoId, tipo, nombre: file.name, path, subido_por: perfilId })
  if (errIns) {
    await supabase.storage.from(BUCKET_RRHH).remove([path])
    throw new Error(errIns.message)
  }
}

async function abrirDocumento(d) {
  // Se abre la pestaña antes del await para que el navegador no la bloquee
  const ventana = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(BUCKET_RRHH).createSignedUrl(d.path, 300)
  if (error || !data?.signedUrl) { ventana?.close(); throw new Error(error?.message || 'No se pudo abrir el archivo.') }
  if (ventana) ventana.location.href = data.signedUrl
  else window.location.href = data.signedUrl
}

const TIPO_CERT_BANCARIA = 'Certificación bancaria'

// Tarjeta en la sección Pago: muestra la certificación bancaria más reciente.
// Al reemplazarla, la anterior queda como historial en la pestaña Documentos.
function CertificacionBancaria({ empleadoId, perfilId }) {
  const input = useRef(null)
  const [cert,     setCert]     = useState(null)
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [msg,      setMsg]      = useState(null)

  useEffect(() => { cargar() }, [empleadoId])

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase.from('empleado_documentos')
      .select('*, subido:profiles!empleado_documentos_subido_por_fkey(nombre)')
      .eq('empleado_id', empleadoId).eq('tipo', TIPO_CERT_BANCARIA)
      .order('created_at', { ascending: false }).limit(1)
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setCert(data?.[0] || null)
    setCargando(false)
  }

  async function subir(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setMsg(null); setSubiendo(true)
    try {
      await subirDocumento(empleadoId, TIPO_CERT_BANCARIA, file, perfilId)
      setMsg({ tipo: 'exito', texto: 'Certificación bancaria cargada.' })
      await cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: `No se pudo subir: ${err.message}` })
    }
    setSubiendo(false)
  }

  async function abrir() {
    try { await abrirDocumento(cert) } catch (err) { setMsg({ tipo: 'error', texto: err.message }) }
  }

  return (
    <div className={E.tarjeta}>
      <div className={E.cabTarjeta}>
        <h2 className={E.tituloTarj}>
          <FileText {...E.ICONO} className={E.iconoTitulo} /> Certificación bancaria
        </h2>
      </div>
      <div className="px-5 py-4 space-y-3">
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
        {cargando ? <Spinner /> : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {cert ? (
              <button onClick={abrir} className="flex-1 min-w-0 flex items-center gap-3 text-left border border-feisen-borde-suave hover:bg-feisen-fondo rounded-lg px-3 py-2.5">
                <FileText {...E.ICONO} className="text-feisen-gris-medio flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-feisen-texto truncate">{cert.nombre}</p>
                  <p className="text-xs text-feisen-gris-medio truncate">
                    Cargada el {new Date(cert.created_at).toLocaleDateString('es-CO')}{cert.subido?.nombre && ` · ${cert.subido.nombre}`}
                  </p>
                </div>
                <ExternalLink size={15} strokeWidth={1.8} className="text-feisen-gris-medio flex-shrink-0" />
              </button>
            ) : (
              <p className="flex-1 text-sm text-feisen-gris-medio">Aún no se ha cargado la certificación bancaria.</p>
            )}
            <button onClick={() => input.current?.click()} disabled={subiendo}
              className={`${cert ? E.btnSecundario : E.btnPrimario} whitespace-nowrap`}>
              <Upload {...E.ICONO} /> {subiendo ? 'Subiendo...' : cert ? 'Reemplazar' : 'Subir certificación'}
            </button>
            <input ref={input} type="file" accept=".pdf,image/*" className="hidden" onChange={subir} />
          </div>
        )}
        {cert && <p className="text-xs text-feisen-gris-medio">Las certificaciones anteriores quedan en la pestaña Documentos.</p>}
      </div>
    </div>
  )
}

// ─── Documentos adjuntos ─────────────────────────────────────────────────────
function DocumentosEmpleado({ empleadoId, perfilId }) {
  const inputArchivo = useRef(null)
  const [docs,        setDocs]        = useState([])
  const [cargando,    setCargando]    = useState(true)
  const tipoSubida = useRef(null)   // tipo al que va el archivo elegido (ref: se lee en el onChange del input)
  const [subiendo,    setSubiendo]    = useState(null)   // tipo que se está subiendo
  const [abierto,     setAbierto]     = useState(null)   // fila del checklist expandida
  const [tipoOtro,    setTipoOtro]    = useState(OTROS_DOCUMENTOS[0])
  const [msg,         setMsg]         = useState(null)

  useEffect(() => { cargar() }, [empleadoId])

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase.from('empleado_documentos')
      .select('*, subido:profiles!empleado_documentos_subido_por_fkey(nombre)')
      .eq('empleado_id', empleadoId).order('created_at', { ascending: false })
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setDocs(data || [])
    setCargando(false)
  }

  function elegirArchivo(tipo) {
    tipoSubida.current = tipo
    inputArchivo.current?.click()
  }

  async function subir(ev) {
    const files = [...(ev.target.files || [])]
    ev.target.value = ''
    const tipo = tipoSubida.current
    if (files.length === 0 || !tipo) return
    setMsg(null); setSubiendo(tipo)
    try {
      for (const f of files) await subirDocumento(empleadoId, tipo, f, perfilId)
      setMsg({ tipo: 'exito', texto: `${tipo}: ${files.length === 1 ? `"${files[0].name}" cargado` : `${files.length} archivos cargados`}.` })
      if (DOCUMENTOS_REQUERIDOS.includes(tipo)) setAbierto(tipo)
      await cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: `${tipo}: ${err.message}` })
      await cargar()
    }
    setSubiendo(null)
  }

  async function abrir(d) {
    try { await abrirDocumento(d) } catch (err) { setMsg({ tipo: 'error', texto: err.message }) }
  }

  async function eliminar(d) {
    if (!window.confirm(`¿Eliminar "${d.nombre}"? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('empleado_documentos').delete().eq('id', d.id)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    await supabase.storage.from(BUCKET_RRHH).remove([d.path])
    setDocs(ds => ds.filter(x => x.id !== d.id))
  }

  const porTipo = (t) => docs.filter(d => d.tipo === t)
  const completos = DOCUMENTOS_REQUERIDOS.filter(t => porTipo(t).length > 0).length
  const total = DOCUMENTOS_REQUERIDOS.length
  const otros = docs.filter(d => !DOCUMENTOS_REQUERIDOS.includes(d.tipo))

  const filaArchivo = (d, conTipo = false) => (
    <div key={d.id} className="flex items-center gap-3 px-3 py-2">
      <FileText size={15} strokeWidth={1.8} className="text-feisen-gris-medio flex-shrink-0" />
      <button onClick={() => abrir(d)} className="flex-1 min-w-0 text-left group">
        <p className="text-sm text-feisen-texto truncate group-hover:text-feisen-azul group-hover:underline">
          {conTipo && <span className="font-medium">{d.tipo} · </span>}{d.nombre}
        </p>
        <p className="text-xs text-feisen-gris-medio truncate">
          {new Date(d.created_at).toLocaleDateString('es-CO')}{d.subido?.nombre && ` · ${d.subido.nombre}`}
        </p>
      </button>
      <button onClick={() => abrir(d)} title="Ver" className="p-1.5 text-feisen-gris-medio hover:text-feisen-texto hover:bg-feisen-fondo rounded-lg">
        <ExternalLink size={15} strokeWidth={1.8} />
      </button>
      <button onClick={() => eliminar(d)} title="Eliminar" className="p-1.5 text-feisen-gris-medio hover:text-feisen-rojo hover:bg-feisen-rojo-suave rounded-lg">
        <Trash2 size={15} strokeWidth={1.8} />
      </button>
    </div>
  )

  return (
    <div className="space-y-4">
      <input ref={inputArchivo} type="file" multiple accept=".pdf,image/*,.doc,.docx" className="hidden" onChange={subir} />

      {/* Checklist de documentos de ingreso */}
      <div className={E.tarjeta}>
        <div className="px-5 py-3 border-b border-feisen-borde-suave">
          <div className="flex items-center justify-between gap-3">
            <h2 className={E.tituloTarj}>
              <FolderOpen {...E.ICONO} className={E.iconoTitulo} /> Documentos de ingreso
            </h2>
            <span className={`text-xs font-medium ${completos === total ? 'text-green-600' : 'text-feisen-texto-2'}`}>
              {completos} de {total}{completos === total && ' · Completo'}
            </span>
          </div>
          <div className="mt-2.5 h-1 rounded-full bg-feisen-borde-suave overflow-hidden">
            <div className={`h-full rounded-full transition-all ${completos === total ? 'bg-green-500' : 'bg-feisen-azul'}`}
              style={{ width: `${(completos / total) * 100}%` }} />
          </div>
        </div>

        {msg && <div className="px-5 pt-4"><Alerta tipo={msg.tipo} mensaje={msg.texto} /></div>}

        {cargando ? <Spinner /> : (
          <div className="divide-y divide-feisen-borde-suave">
            {DOCUMENTOS_REQUERIDOS.map(t => {
              const archivos = porTipo(t)
              const ok = archivos.length > 0
              const expandido = abierto === t && ok
              return (
                <div key={t}>
                  <div className="flex items-center gap-3 px-5 py-2.5 hover:bg-feisen-fondo/60">
                    <button onClick={() => ok && setAbierto(expandido ? null : t)} disabled={!ok}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left">
                      {ok
                        ? <CheckCircle2 size={18} strokeWidth={2} className="text-green-500 flex-shrink-0" />
                        : <Circle size={18} strokeWidth={1.6} className="text-feisen-borde flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${ok ? 'text-feisen-texto' : 'text-feisen-texto-2'}`}>{t}</p>
                        <p className={`text-xs truncate ${ok ? 'text-feisen-gris-medio' : 'text-amber-600'}`}>
                          {ok
                            ? `${archivos.length} archivo${archivos.length > 1 ? 's' : ''} · ${new Date(archivos[0].created_at).toLocaleDateString('es-CO')}`
                            : 'Pendiente'}
                        </p>
                      </div>
                      {ok && <ChevronDown size={15} strokeWidth={1.8} className={`text-feisen-gris-medio flex-shrink-0 transition-transform ${expandido ? 'rotate-180' : ''}`} />}
                    </button>
                    <button onClick={() => elegirArchivo(t)} disabled={!!subiendo}
                      className={`${ok ? E.btnTexto : E.btnTextoAzul} -mr-2.5`}>
                      {subiendo === t
                        ? <><span className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" /> Subiendo…</>
                        : ok ? <><Plus size={14} strokeWidth={1.8} /> Agregar</> : <><Upload size={14} strokeWidth={1.8} /> Subir</>}
                    </button>
                  </div>
                  {expandido && (
                    <div className="mx-5 mb-3 ml-12 border border-feisen-borde-suave rounded-lg divide-y divide-feisen-borde-suave">
                      {archivos.map(d => filaArchivo(d))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Otros documentos (fuera del checklist) */}
      <div className={E.tarjeta}>
        <div className={E.cabTarjeta}>
          <h2 className={E.tituloTarj}>
            <FileText {...E.ICONO} className={E.iconoTitulo} /> Otros documentos
          </h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={tipoOtro} onChange={e => setTipoOtro(e.target.value)} className={`${inputCls} sm:flex-1`}>
              {OTROS_DOCUMENTOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={() => elegirArchivo(tipoOtro)} disabled={!!subiendo}
              className={E.btnSecundario}>
              <Upload {...E.ICONO} /> {subiendo && !DOCUMENTOS_REQUERIDOS.includes(subiendo) ? 'Subiendo...' : 'Subir archivo'}
            </button>
          </div>
          {!cargando && (otros.length === 0
            ? <p className="text-sm text-feisen-gris-medio">No hay otros documentos.</p>
            : <div className="border border-feisen-borde-suave rounded-lg divide-y divide-feisen-borde-suave">
                {otros.map(d => filaArchivo(d, true))}
              </div>)}
        </div>
      </div>
    </div>
  )
}
