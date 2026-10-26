import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import {
  ArrowLeft, Camera, Pencil, User, Briefcase, HeartPulse, Wallet, Phone, FolderOpen,
  Upload, FileText, Trash2, ExternalLink, Mail, Smartphone, CalendarDays, AlertTriangle,
} from 'lucide-react'
import {
  BUCKET_RRHH, AREAS, TIPOS_DOCUMENTO, TIPOS_CONTRATO, JORNADAS, GENEROS, ESTADOS_CIVILES,
  GRUPOS_SANGUINEOS, NIVELES_EDUCATIVOS, TIPOS_CUENTA, PARENTESCOS, TIPOS_ARCHIVO, ESTADOS_EMPLEADO,
  nombreCompleto, iniciales, tiempoDesde, edad, diasParaVencer, formatoFecha, formatoPesos, urlsFirmadas,
} from './catalogosRRHH'

const inputCls = 'w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul'
const CONTRATOS_CON_FIN = ['Término fijo', 'Aprendizaje (SENA)', 'Prestación de servicios', 'Obra o labor']

// Cada pestaña de la ficha se describe con sus campos; el mismo arreglo
// sirve para la vista de lectura y para el formulario de edición.
const SECCIONES = [
  {
    id: 'personal', label: 'Personal', icon: User,
    campos: [
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
      { k: 'profesion', label: 'Profesión / oficio' },
      { k: 'celular', label: 'Celular' },
      { k: 'telefono', label: 'Teléfono fijo' },
      { k: 'email_personal', label: 'Correo personal', tipo: 'email' },
      { k: 'direccion', label: 'Dirección' },
      { k: 'barrio', label: 'Barrio' },
      { k: 'ciudad', label: 'Ciudad' },
      { grupo: 'Tallas de dotación' },
      { k: 'talla_camisa', label: 'Camisa' },
      { k: 'talla_pantalon', label: 'Pantalón' },
      { k: 'talla_calzado', label: 'Calzado / botas' },
    ],
  },
  {
    id: 'laboral', label: 'Laboral', icon: Briefcase,
    campos: [
      { k: 'cargo', label: 'Cargo', req: true },
      { k: 'area', label: 'Área', tipo: 'select', opciones: AREAS, req: true },
      { k: 'jefe_id', label: 'Jefe inmediato', tipo: 'jefe' },
      { k: 'email_corporativo', label: 'Correo corporativo', tipo: 'email' },
      { grupo: 'Contrato' },
      { k: 'fecha_ingreso', label: 'Fecha de ingreso', tipo: 'date', req: true,
        extra: (e) => e.fecha_ingreso ? `Antigüedad: ${tiempoDesde(e.fecha_ingreso, e.estado === 'retirado' ? e.fecha_retiro : null) || '—'}` : null },
      { k: 'tipo_contrato', label: 'Tipo de contrato', tipo: 'select', opciones: TIPOS_CONTRATO },
      { k: 'fecha_fin_contrato', label: 'Fecha fin de contrato', tipo: 'date',
        visible: (f) => CONTRATOS_CON_FIN.includes(f.tipo_contrato) },
      { k: 'jornada', label: 'Jornada', tipo: 'select', opciones: JORNADAS },
      { k: 'salario_base', label: 'Salario base mensual', tipo: 'money' },
      { k: 'auxilio_transporte', label: 'Recibe auxilio de transporte', tipo: 'bool' },
      { grupo: 'Estado' },
      { k: 'estado', label: 'Estado', tipo: 'select',
        opciones: Object.entries(ESTADOS_EMPLEADO).map(([value, v]) => ({ value, label: v.label })) },
      { k: 'fecha_retiro', label: 'Fecha de retiro', tipo: 'date', visible: (f) => f.estado === 'retirado', req: true },
      { k: 'motivo_retiro', label: 'Motivo de retiro', visible: (f) => f.estado === 'retirado' },
      { k: 'observaciones', label: 'Observaciones', tipo: 'textarea', full: true },
    ],
  },
  {
    id: 'seguridad', label: 'Seguridad social', icon: HeartPulse,
    campos: [
      { k: 'eps', label: 'EPS' },
      { k: 'fondo_pension', label: 'Fondo de pensiones' },
      { k: 'fondo_cesantias', label: 'Fondo de cesantías' },
      { k: 'caja_compensacion', label: 'Caja de compensación' },
      { k: 'arl', label: 'ARL' },
      { k: 'nivel_riesgo_arl', label: 'Nivel de riesgo ARL', tipo: 'select',
        opciones: [1, 2, 3, 4, 5].map(n => ({ value: String(n), label: `Riesgo ${n}` })) },
    ],
  },
  {
    id: 'pago', label: 'Pago', icon: Wallet,
    campos: [
      { k: 'banco', label: 'Banco' },
      { k: 'tipo_cuenta', label: 'Tipo de cuenta', tipo: 'select', opciones: TIPOS_CUENTA },
      { k: 'numero_cuenta', label: 'Número de cuenta' },
    ],
  },
  {
    id: 'emergencia', label: 'Emergencia', icon: Phone,
    campos: [
      { k: 'emergencia_nombre', label: 'Nombre del contacto' },
      { k: 'emergencia_parentesco', label: 'Parentesco', tipo: 'select', opciones: PARENTESCOS },
      { k: 'emergencia_telefono', label: 'Teléfono' },
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

  const [emp,        setEmp]        = useState(null)
  const [otros,      setOtros]      = useState([])   // para el selector de jefe
  const [fotoUrl,    setFotoUrl]    = useState(null)
  const [cargando,   setCargando]   = useState(true)
  const [tab,        setTab]        = useState('personal')
  const [editando,   setEditando]   = useState(false)
  const [form,       setForm]       = useState({})
  const [guardando,  setGuardando]  = useState(false)
  const [msg,        setMsg]        = useState(null)

  useEffect(() => { cargar() }, [id])

  async function cargar() {
    setCargando(true)
    const [{ data, error }, { data: lista }] = await Promise.all([
      supabase.from('empleados').select('*').eq('id', id).single(),
      supabase.from('empleados').select('id, nombres, apellidos, cargo').neq('id', id).neq('estado', 'retirado').order('nombres'),
    ])
    if (error) { setMsg({ tipo: 'error', texto: error.message }); setCargando(false); return }
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

  function empezarEdicion() {
    const f = {}
    for (const c of seccion.campos) if (c.k) f[c.k] = emp[c.k] ?? (c.tipo === 'bool' ? false : '')
    if (f.nivel_riesgo_arl !== undefined && f.nivel_riesgo_arl !== '') f.nivel_riesgo_arl = String(f.nivel_riesgo_arl)
    setForm(f); setMsg(null); setEditando(true)
  }

  async function guardar(e) {
    e.preventDefault(); setMsg(null); setGuardando(true)
    const cambios = {}
    for (const c of seccion.campos) {
      if (!c.k) continue
      let v = form[c.k]
      if (typeof v === 'string') v = v.trim()
      if (v === '') v = null
      if (c.tipo === 'money' && v !== null) v = Number(String(v).replace(/[^\d.]/g, ''))
      if (c.k === 'nivel_riesgo_arl' && v !== null) v = Number(v)
      if (c.visible && !c.visible(form)) v = null
      cambios[c.k] = v
    }
    if (cambios.estado && cambios.estado !== 'retirado') { cambios.fecha_retiro = null; cambios.motivo_retiro = null }
    const { data, error } = await supabase.from('empleados').update(cambios).eq('id', id).select('*').single()
    setGuardando(false)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message.includes('numero_documento')
        ? 'Ya existe otro empleado con ese número de documento.' : error.message })
      return
    }
    setEmp(data); setEditando(false)
    setMsg({ tipo: 'exito', texto: 'Cambios guardados.' })
  }

  async function subirFoto(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setMsg({ tipo: 'error', texto: 'La foto debe ser una imagen.' }); return }
    setMsg(null)
    const ext = file.name.split('.').pop()
    const path = `${id}/foto-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET_RRHH).upload(path, file)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    const anterior = emp.foto_path
    const { error: errUpd } = await supabase.from('empleados').update({ foto_path: path }).eq('id', id)
    if (errUpd) { setMsg({ tipo: 'error', texto: errUpd.message }); return }
    if (anterior) await supabase.storage.from(BUCKET_RRHH).remove([anterior])
    setEmp(e => ({ ...e, foto_path: path }))
    setFotoUrl(URL.createObjectURL(file))
  }

  if (cargando) return <Spinner />
  if (!emp) return (
    <div className="max-w-5xl mx-auto space-y-4">
      <button onClick={() => navigate('/rrhh/empleados')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-feisen-azul">
        <ArrowLeft size={16} /> Colaboradores
      </button>
      <Alerta tipo="error" mensaje={msg?.texto || 'No se encontró el colaborador.'} />
    </div>
  )

  const est = ESTADOS_EMPLEADO[emp.estado] || ESTADOS_EMPLEADO.activo
  const jefe = otros.find(o => o.id === emp.jefe_id)
  const diasFin = emp.estado !== 'retirado' ? diasParaVencer(emp.fecha_fin_contrato) : null

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <button onClick={() => navigate('/rrhh/empleados')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-feisen-azul">
        <ArrowLeft size={16} /> Colaboradores
      </button>

      {/* Encabezado de la ficha */}
      <div className="bg-white rounded-xl border border-feisen-borde p-5 lg:p-6">
        <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
          <button onClick={() => inputFoto.current?.click()} title="Cambiar foto"
            className="relative w-24 h-24 rounded-full flex-shrink-0 group self-center sm:self-auto">
            {fotoUrl
              ? <img src={fotoUrl} alt="" className="w-24 h-24 rounded-full object-cover" />
              : <div className="w-24 h-24 rounded-full bg-feisen-azul-suave flex items-center justify-center">
                  <span className="font-bold text-feisen-azul text-3xl">{iniciales(emp)}</span>
                </div>}
            <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Camera size={22} className="text-white" />
            </span>
            <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-feisen-azul border-2 border-white flex items-center justify-center sm:hidden">
              <Camera size={13} className="text-white" />
            </span>
          </button>
          <input ref={inputFoto} type="file" accept="image/*" className="hidden" onChange={subirFoto} />

          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
              <h1 className="text-2xl font-bold text-feisen-texto">{nombreCompleto(emp)}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${est.color}`}>{est.label}</span>
            </div>
            <p className="text-gray-600 mt-0.5">
              {emp.cargo || 'Sin cargo'}{emp.area && <span className="text-gray-400"> · {emp.area}</span>}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm text-gray-500 justify-center sm:justify-start">
              <span className="font-mono text-xs bg-gray-100 rounded-md px-2 py-0.5 text-gray-600">{emp.codigo}</span>
              <span>{emp.tipo_documento} {emp.numero_documento}</span>
              {emp.celular && <a href={`tel:${emp.celular}`} className="flex items-center gap-1.5 hover:text-feisen-azul"><Smartphone size={14} />{emp.celular}</a>}
              {(emp.email_corporativo || emp.email_personal) && (
                <a href={`mailto:${emp.email_corporativo || emp.email_personal}`} className="flex items-center gap-1.5 hover:text-feisen-azul">
                  <Mail size={14} />{emp.email_corporativo || emp.email_personal}
                </a>
              )}
              {emp.fecha_ingreso && (
                <span className="flex items-center gap-1.5"><CalendarDays size={14} />
                  Ingreso {formatoFecha(emp.fecha_ingreso)} · {tiempoDesde(emp.fecha_ingreso, emp.estado === 'retirado' ? emp.fecha_retiro : null) || '—'}
                </span>
              )}
            </div>
          </div>
        </div>

        {diasFin !== null && diasFin <= 45 && (
          <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2.5 text-sm">
            <AlertTriangle size={16} className="flex-shrink-0" />
            {diasFin < 0
              ? `El contrato venció el ${formatoFecha(emp.fecha_fin_contrato)} (hace ${-diasFin} días).`
              : `El contrato (${emp.tipo_contrato}) vence el ${formatoFecha(emp.fecha_fin_contrato)} — faltan ${diasFin} días.`}
          </div>
        )}
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 overflow-x-auto bg-white rounded-xl border border-feisen-borde p-1.5">
        {SECCIONES.map(s => (
          <button key={s.id} onClick={() => cambiarTab(s.id)} disabled={editando && tab !== s.id}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-40
              ${tab === s.id ? 'bg-feisen-azul text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            <s.icon size={16} /> {s.label}
          </button>
        ))}
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {tab === 'documentos'
        ? <DocumentosEmpleado empleadoId={id} perfilId={perfil?.id} />
        : (
        <div className="bg-white rounded-xl border border-feisen-borde p-5 lg:p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-800 text-lg flex items-center gap-2">
              <seccion.icon size={18} className="text-feisen-azul" /> {seccion.label}
            </h2>
            {!editando && (
              <button onClick={empezarEdicion}
                className="flex items-center gap-1.5 text-sm font-semibold text-feisen-azul hover:bg-blue-50 px-3 py-1.5 rounded-lg">
                <Pencil size={14} /> Editar
              </button>
            )}
          </div>

          {editando ? (
            <form onSubmit={guardar}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {seccion.campos.map((c, i) => c.grupo
                  ? <p key={i} className="col-span-full text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">{c.grupo}</p>
                  : (!c.visible || c.visible(form)) && (
                    <CampoEditable key={c.k} campo={c} valor={form[c.k]} otros={otros}
                      onChange={v => setForm(f => ({ ...f, [c.k]: v }))} />
                  ))}
              </div>
              <div className="flex gap-3 justify-end pt-6">
                <button type="button" onClick={() => { setEditando(false); setMsg(null) }}
                  className="border border-feisen-borde rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
                <button type="submit" disabled={guardando}
                  className="bg-feisen-azul text-white rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
              {seccion.campos.map((c, i) => {
                if (c.grupo) return <p key={i} className="col-span-full text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2 border-t border-feisen-borde mt-1">{c.grupo}</p>
                if (c.visible && !c.visible(emp)) return null
                const v = emp[c.k]
                let texto
                if (c.tipo === 'bool') texto = v ? 'Sí' : 'No'
                else if (v === null || v === undefined || v === '') texto = null
                else if (c.tipo === 'date') texto = formatoFecha(v)
                else if (c.tipo === 'money') texto = formatoPesos(v)
                else if (c.tipo === 'select') texto = opcionLabel(c, v)
                else if (c.tipo === 'jefe') texto = jefe ? `${nombreCompleto(jefe)}${jefe.cargo ? ` · ${jefe.cargo}` : ''}` : '—'
                else texto = v
                const extra = c.extra?.(emp)
                return (
                  <div key={c.k} className={c.full ? 'col-span-full' : ''}>
                    <dt className="text-xs text-gray-400 mb-0.5">{c.label}</dt>
                    <dd className={`text-sm whitespace-pre-line ${texto ? 'text-gray-800 font-medium' : 'text-gray-300'}`}>
                      {texto || 'Sin registrar'}
                      {extra && <span className="block text-xs text-gray-400 font-normal">{extra}</span>}
                    </dd>
                  </div>
                )
              })}
            </dl>
          )}
        </div>
      )}
    </div>
  )
}

function CampoEditable({ campo: c, valor, onChange, otros }) {
  const label = <label className="text-sm font-medium text-gray-700 block mb-1">{c.label}{c.req && ' *'}</label>
  const wrap = (input) => <div className={c.full ? 'col-span-full' : ''}>{label}{input}</div>

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
      {otros.map(o => <option key={o.id} value={o.id}>{nombreCompleto(o)}{o.cargo ? ` · ${o.cargo}` : ''}</option>)}
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
    <div className="bg-white rounded-xl border border-feisen-borde p-5 lg:p-6 space-y-5">
      <h2 className="font-semibold text-gray-800 text-lg flex items-center gap-2">
        <FolderOpen size={18} className="text-feisen-azul" /> Documentos
      </h2>

      <div className="flex flex-col sm:flex-row gap-3 bg-gray-50 rounded-xl p-3">
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
        <div className="divide-y divide-feisen-borde-suave border border-feisen-borde rounded-xl">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-lg bg-feisen-azul-suave flex items-center justify-center flex-shrink-0">
                <FileText size={18} className="text-feisen-azul" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{d.tipo}</p>
                <p className="text-xs text-gray-400 truncate">
                  {d.nombre} · {new Date(d.created_at).toLocaleDateString('es-CO')}{d.subido?.nombre && ` · ${d.subido.nombre}`}
                </p>
              </div>
              <button onClick={() => abrir(d)} title="Ver" className="p-2 text-gray-400 hover:text-feisen-azul hover:bg-blue-50 rounded-lg">
                <ExternalLink size={16} />
              </button>
              <button onClick={() => eliminar(d)} title="Eliminar" className="p-2 text-gray-300 hover:text-feisen-rojo hover:bg-red-50 rounded-lg">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
