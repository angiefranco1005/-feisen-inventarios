import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import {
  ArrowLeft, Camera, Pencil, User, Briefcase, HeartPulse, Wallet, FolderOpen,
  Upload, FileText, Trash2, ExternalLink, Mail, Smartphone, CalendarDays, AlertTriangle,
  MapPin, Users, Building2, Contact, Clock, Shirt,
} from 'lucide-react'
import {
  BUCKET_RRHH, AREAS, TIPOS_DOCUMENTO, TIPOS_CONTRATO, TIPOS_VINCULACION, JORNADAS, GENEROS, ESTADOS_CIVILES,
  GRUPOS_SANGUINEOS, NIVELES_EDUCATIVOS, TIPOS_CUENTA, PARENTESCOS, TIPOS_ARCHIVO, ESTADOS_EMPLEADO,
  nombreCompleto, iniciales, tiempoDesde, edad, diasParaVencer, formatoFecha, formatoPesos, urlsFirmadas,
  subirFotoEmpleado, calcularFinContrato,
} from './catalogosRRHH'

const inputCls = 'w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul'

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
  if (!emp) return (
    <div className="max-w-6xl mx-auto space-y-4">
      <button onClick={() => navigate('/rrhh/empleados')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-feisen-azul">
        <ArrowLeft size={16} /> Colaboradores
      </button>
      <Alerta tipo="error" mensaje={errorCarga || 'No se encontró el colaborador.'} />
    </div>
  )

  const est = ESTADOS_EMPLEADO[emp.estado] || ESTADOS_EMPLEADO.activo
  const jefe = otros.find(o => o.id === emp.jefe_id)
  const diasFin = emp.estado !== 'retirado' ? diasParaVencer(emp.fecha_fin_contrato) : null
  const antig = tiempoDesde(emp.fecha_ingreso, emp.estado === 'retirado' ? emp.fecha_retiro : null)

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <button onClick={() => navigate('/rrhh/empleados')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-feisen-azul">
        <ArrowLeft size={16} /> Colaboradores
      </button>

      {/* Encabezado tipo Buk: franja de color + foto grande */}
      <div className="bg-white rounded-xl border border-feisen-borde overflow-hidden">
        <div className="h-24 sm:h-28 bg-gradient-to-r from-feisen-azul to-feisen-azul-claro" />
        <div className="px-5 lg:px-7 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-14 sm:-mt-12">
            <div className="flex flex-col items-center self-center sm:self-auto">
              <button onClick={() => inputFoto.current?.click()} disabled={subiendoFoto} title="Cambiar foto"
                className="relative w-28 h-28 rounded-full ring-4 ring-white bg-white group">
                {fotoUrl
                  ? <img src={fotoUrl} alt="" className="w-28 h-28 rounded-full object-cover" />
                  : <div className="w-28 h-28 rounded-full bg-feisen-azul-suave flex items-center justify-center">
                      <span className="font-bold text-feisen-azul text-4xl">{iniciales(emp)}</span>
                    </div>}
                <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Camera size={24} className="text-white" />
                </span>
                <span className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-feisen-azul ring-2 ring-white flex items-center justify-center">
                  {subiendoFoto
                    ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    : <Camera size={15} className="text-white" />}
                </span>
              </button>
              <button onClick={() => inputFoto.current?.click()} disabled={subiendoFoto}
                className="mt-2 text-xs font-semibold text-feisen-azul hover:underline disabled:opacity-60">
                {subiendoFoto ? 'Subiendo foto…' : fotoUrl ? 'Cambiar foto' : 'Subir foto'}
              </button>
              <input ref={inputFoto} type="file" accept="image/*" className="hidden" onChange={subirFoto} />
            </div>

            <div className="flex-1 min-w-0 text-center sm:text-left sm:pb-7">
              <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                <h1 className="text-2xl font-bold text-feisen-texto">{nombreCompleto(emp)}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${est.color}`}>{est.label}</span>
              </div>
              <p className="text-gray-600 mt-0.5">
                {emp.cargo || 'Sin cargo'}{emp.area && <span className="text-gray-400"> · {emp.area}</span>}
              </p>
            </div>
          </div>

          {msgFoto && <div className="mt-3"><Alerta tipo={msgFoto.tipo} mensaje={msgFoto.texto} /></div>}

          {/* Datos rápidos */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            <DatoRapido icon={Contact} label="Documento" valor={`${emp.tipo_documento} ${emp.numero_documento}`} />
            <DatoRapido icon={CalendarDays} label="Fecha de ingreso" valor={formatoFecha(emp.fecha_ingreso)} sub={antig} />
            <DatoRapido icon={Smartphone} label="Celular" valor={emp.celular} href={emp.celular && `tel:${emp.celular}`} />
            <DatoRapido icon={Mail} label="Correo" valor={emp.email_corporativo || emp.email_personal}
              href={(emp.email_corporativo || emp.email_personal) && `mailto:${emp.email_corporativo || emp.email_personal}`} />
          </div>

          {diasFin !== null && diasFin <= 45 && (
            <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm">
              <AlertTriangle size={16} className="flex-shrink-0" />
              {diasFin < 0
                ? `El contrato venció el ${formatoFecha(emp.fecha_fin_contrato)} (hace ${-diasFin} días).`
                : `El contrato (${emp.tipo_contrato}) vence el ${formatoFecha(emp.fecha_fin_contrato)} — faltan ${diasFin} días.`}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Menú de secciones: vertical en escritorio, horizontal en celular */}
        <nav className="w-full lg:w-60 flex-shrink-0 bg-white rounded-xl border border-feisen-borde p-1.5 flex lg:flex-col gap-1 overflow-x-auto lg:sticky lg:top-6">
          {SECCIONES.map(s => (
            <button key={s.id} onClick={() => cambiarTab(s.id)} disabled={!!editando && tab !== s.id}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap text-left transition-colors disabled:opacity-40
                ${tab === s.id ? 'bg-feisen-azul-suave text-feisen-azul' : 'text-gray-600 hover:bg-gray-50'}`}>
              <s.icon size={17} /> {s.label}
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
        </div>
      </div>
    </div>
  )
}

function DatoRapido({ icon: Icon, label, valor, sub, href }) {
  const contenido = (
    <>
      <p className="text-xs text-gray-400 flex items-center gap-1.5"><Icon size={13} /> {label}</p>
      <p className={`text-sm font-medium truncate mt-0.5 ${valor ? 'text-feisen-texto' : 'text-gray-300'}`}>{valor || 'Sin registrar'}</p>
      {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
    </>
  )
  const cls = 'block bg-feisen-fondo rounded-lg px-3.5 py-2.5 min-w-0'
  return href ? <a href={href} className={`${cls} hover:bg-feisen-azul-suave`}>{contenido}</a> : <div className={cls}>{contenido}</div>
}

function Bloque({ bloque, emp, jefe, otros, editando, bloqueado, form, setForm, guardando, msg, onEditar, onCancelar, onGuardar }) {
  return (
    <div className="bg-white rounded-xl border border-feisen-borde">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-feisen-borde-suave">
        <h2 className="font-semibold text-feisen-texto flex items-center gap-2">
          <bloque.icon size={17} className="text-feisen-azul" /> {bloque.titulo}
        </h2>
        {!editando && (
          <button onClick={onEditar} disabled={bloqueado}
            className="flex items-center gap-1.5 text-sm font-semibold text-feisen-azul hover:bg-feisen-azul-suave px-3 py-1.5 rounded-lg disabled:opacity-30">
            <Pencil size={14} /> Editar
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
            <div className="flex gap-3 justify-end pt-5">
              <button type="button" onClick={onCancelar}
                className="border border-feisen-borde rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit" disabled={guardando}
                className="bg-feisen-azul text-white rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
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
                  <dt className="text-xs text-gray-400 mb-0.5">{c.label}</dt>
                  <dd className={`text-sm whitespace-pre-line ${texto ? 'text-feisen-texto font-medium' : 'text-gray-300'}`}>
                    {texto || 'Sin registrar'}
                    {extra && <span className="block text-xs text-gray-400 font-normal">{extra}</span>}
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
  const label = <label className="text-sm font-medium text-gray-700 block mb-1">{c.label}{c.req && ' *'}</label>
  const nota = typeof c.nota === 'function' ? c.nota(form) : c.nota
  const wrap = (input) => (
    <div className={c.full ? 'col-span-full' : ''}>
      {label}{input}
      {nota && <p className="text-xs text-gray-400 mt-1">{nota}</p>}
    </div>
  )

  if (c.tipo === 'bool') return (
    <label className="flex items-center gap-3 border border-feisen-borde rounded-xl px-4 py-2.5 self-end cursor-pointer">
      <input type="checkbox" checked={!!valor} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-feisen-azul" />
      <span className="text-sm text-gray-700">{c.label}</span>
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
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
      <input inputMode="numeric" value={valor === null || valor === '' ? '' : Number(String(valor).replace(/[^\d]/g, '')).toLocaleString('es-CO')}
        onChange={e => onChange(e.target.value.replace(/[^\d]/g, ''))} className={`${inputCls} pl-8`} />
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

// ─── Documentos adjuntos ─────────────────────────────────────────────────────
function DocumentosEmpleado({ empleadoId, perfilId }) {
  const inputArchivo = useRef(null)
  const [docs,      setDocs]      = useState([])
  const [cargando,  setCargando]  = useState(true)
  const [tipo,      setTipo]      = useState(TIPOS_ARCHIVO[0])
  const [subiendo,  setSubiendo]  = useState(false)
  const [msg,       setMsg]       = useState(null)

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

  async function subir(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setMsg(null); setSubiendo(true)
    const limpio = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
    const path = `${empleadoId}/docs/${Date.now()}-${limpio}`
    const { error } = await supabase.storage.from(BUCKET_RRHH).upload(path, file)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); setSubiendo(false); return }
    const { error: errIns } = await supabase.from('empleado_documentos')
      .insert({ empleado_id: empleadoId, tipo, nombre: file.name, path, subido_por: perfilId })
    if (errIns) {
      await supabase.storage.from(BUCKET_RRHH).remove([path])
      setMsg({ tipo: 'error', texto: errIns.message })
    } else {
      setMsg({ tipo: 'exito', texto: `${tipo}: "${file.name}" cargado.` })
      await cargar()
    }
    setSubiendo(false)
  }

  async function abrir(d) {
    // Se abre la pestaña antes del await para que el navegador no la bloquee
    const ventana = window.open('', '_blank')
    const { data, error } = await supabase.storage.from(BUCKET_RRHH).createSignedUrl(d.path, 300)
    if (error || !data?.signedUrl) { ventana?.close(); setMsg({ tipo: 'error', texto: error?.message || 'No se pudo abrir el archivo.' }); return }
    if (ventana) ventana.location.href = data.signedUrl
    else window.location.href = data.signedUrl
  }

  async function eliminar(d) {
    if (!window.confirm(`¿Eliminar "${d.nombre}"? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('empleado_documentos').delete().eq('id', d.id)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    await supabase.storage.from(BUCKET_RRHH).remove([d.path])
    setDocs(ds => ds.filter(x => x.id !== d.id))
  }

  return (
    <div className="bg-white rounded-xl border border-feisen-borde">
      <div className="px-5 py-3.5 border-b border-feisen-borde-suave">
        <h2 className="font-semibold text-feisen-texto flex items-center gap-2">
          <FolderOpen size={17} className="text-feisen-azul" /> Documentos
        </h2>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 bg-feisen-fondo rounded-lg p-3">
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={`${inputCls} sm:flex-1 bg-white`}>
            {TIPOS_ARCHIVO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => inputArchivo.current?.click()} disabled={subiendo}
            className="flex items-center justify-center gap-2 bg-feisen-azul text-white rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
            <Upload size={16} /> {subiendo ? 'Subiendo...' : 'Subir archivo'}
          </button>
          <input ref={inputArchivo} type="file" accept=".pdf,image/*,.doc,.docx" className="hidden" onChange={subir} />
        </div>

        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

        {cargando ? <Spinner /> : docs.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">Aún no hay documentos cargados.</p>
        ) : (
          <div className="divide-y divide-feisen-borde-suave border border-feisen-borde rounded-lg">
            {docs.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-feisen-azul-suave flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-feisen-azul" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-feisen-texto truncate">{d.tipo}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {d.nombre} · {new Date(d.created_at).toLocaleDateString('es-CO')}{d.subido?.nombre && ` · ${d.subido.nombre}`}
                  </p>
                </div>
                <button onClick={() => abrir(d)} title="Ver" className="p-2 text-gray-400 hover:text-feisen-azul hover:bg-feisen-azul-suave rounded-lg">
                  <ExternalLink size={16} />
                </button>
                <button onClick={() => eliminar(d)} title="Eliminar" className="p-2 text-gray-300 hover:text-feisen-rojo hover:bg-feisen-rojo-suave rounded-lg">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
