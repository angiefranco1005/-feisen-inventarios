import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import {
  ArrowLeft, Briefcase, GraduationCap, Banknote, BookOpen, ClipboardCheck, HardHat, Award, Hammer,
  Users, FileText, Upload, ExternalLink, Trash2, ChevronRight, Network, Target, AlertTriangle,
} from '../shared/iconos'
import * as E from './estilos'
import { Bloque, valoresIniciales, valoresParaGuardar } from './FichaComun'
import {
  BUCKET_RRHH, AREAS, NIVELES_EDUCATIVOS, PERIODICIDADES, TIPOS_VINCULACION,
  nombreCompleto, iniciales, formatoPesos, urlsFirmadas, descendientes, abrirArchivoRRHH,
} from './catalogosRRHH'

const sumaPesos = (filas) => (filas || []).reduce((t, f) => t + (Number(f?.peso) || 0), 0)

// Secciones de la ficha del cargo. Igual que la ficha del colaborador: cada
// sección tiene tarjetas que se editan por separado.
const SECCIONES = [
  {
    id: 'general', label: 'General', icon: Briefcase,
    bloques: [
      { id: 'datos', titulo: 'Datos del cargo', icon: Briefcase, campos: [
        { k: 'nombre', label: 'Nombre del cargo', req: true },
        { k: 'area', label: 'Área', tipo: 'select', opciones: AREAS },
        { k: 'cargo_padre_id', label: 'Reporta a', tipo: 'select', vacio: '— Ninguno (cargo de más arriba) —',
          opciones: (ctx) => ctx.posiblesPadres.map(c => ({ value: c.id, label: c.area ? `${c.nombre} · ${c.area}` : c.nombre })),
          mostrar: (r, ctx) => ctx.padre?.nombre || null },
        { k: 'plazas', label: 'Plazas', tipo: 'number', min: 0, req: true,
          nota: 'Cuántas personas deberían ocupar este cargo.' },
        { k: 'objetivo', label: 'Objetivo del cargo', tipo: 'textarea', full: true },
      ] },
    ],
  },
  {
    id: 'perfil', label: 'Perfil requerido', icon: GraduationCap,
    bloques: [
      { id: 'formacion', titulo: 'Formación y experiencia', icon: GraduationCap, campos: [
        { k: 'nivel_educativo', label: 'Nivel educativo mínimo', tipo: 'select', opciones: NIVELES_EDUCATIVOS },
        { k: 'formacion', label: 'Formación / título' },
        { k: 'experiencia', label: 'Experiencia', nota: 'Ej: 2 años en fundición' },
        { k: 'requisitos_adicionales', label: 'Requisitos adicionales', tipo: 'textarea', full: true,
          nota: 'Licencias, curso de alturas, manejo de montacargas…' },
      ] },
      { id: 'competencias', titulo: 'Competencias', icon: Target, campos: [
        { k: 'competencias', label: 'Competencias', tipo: 'lista', placeholder: 'Ej: Trabajo en equipo', agregar: 'Agregar competencia' },
      ] },
    ],
  },
  {
    id: 'salario', label: 'Asignación salarial', icon: Banknote,
    bloques: [
      { id: 'salario', titulo: 'Asignación salarial', icon: Banknote, campos: [
        { k: 'salario_min', label: 'Salario / honorarios desde', tipo: 'money' },
        { k: 'salario_max', label: 'Hasta', tipo: 'money', nota: 'Déjalo vacío si es un valor único.' },
        { k: 'nota_salarial', label: 'Observaciones', tipo: 'textarea', full: true,
          nota: 'Ej: contratistas al destajo según tabla de precios por pieza; bonificaciones…' },
      ] },
    ],
  },
  {
    id: 'funciones', label: 'Manual de funciones', icon: BookOpen,
    bloques: [
      { id: 'funciones', titulo: 'Funciones del cargo', icon: BookOpen, campos: [
        { k: 'funciones', label: 'Funciones', tipo: 'lista', placeholder: 'Describe una función', agregar: 'Agregar función' },
      ] },
    ],
  },
  {
    id: 'evaluacion', label: 'Evaluación de desempeño', icon: ClipboardCheck,
    bloques: [
      { id: 'evaluacion', titulo: 'Evaluación de desempeño', icon: ClipboardCheck,
        ayuda: 'Criterios con los que se evalúa a quien ocupa el cargo. Los pesos deben sumar 100%.',
        campos: [
          { k: 'evaluacion_periodicidad', label: 'Periodicidad', tipo: 'select', opciones: PERIODICIDADES },
          { k: 'evaluacion_criterios', label: 'Criterios', tipo: 'lista', agregar: 'Agregar criterio',
            columnas: [
              { k: 'criterio', label: 'Criterio', placeholder: 'Ej: Cumplimiento de metas de producción' },
              { k: 'peso', label: 'Peso %', tipo: 'number', ancho: 'sm:w-28', sufijo: '%' },
            ],
            nota: (f) => {
              const t = sumaPesos(f?.evaluacion_criterios)
              return t ? `Suma de pesos: ${t}%${t !== 100 ? ' (debería ser 100%)' : ''}` : null
            },
            pie: (filas) => {
              const t = sumaPesos(filas)
              return (
                <tr className="border-t border-feisen-borde-suave">
                  <td className="px-3 py-2 text-xs text-feisen-gris-medio text-right">Total</td>
                  <td className={`px-3 py-2 text-sm font-medium ${t === 100 ? 'text-green-600' : 'text-amber-600'}`}>{t}%</td>
                </tr>
              )
            } },
        ] },
    ],
  },
  {
    id: 'epp', label: 'EPP', icon: HardHat,
    bloques: [
      { id: 'epp', titulo: 'Elementos de protección personal', icon: HardHat, campos: [
        { k: 'epp', label: 'EPP', tipo: 'lista', agregar: 'Agregar elemento',
          columnas: [
            { k: 'elemento', label: 'Elemento', placeholder: 'Ej: Botas de seguridad con puntera' },
            { k: 'reposicion', label: 'Reposición', placeholder: 'Ej: Cada 6 meses', ancho: 'sm:w-48' },
          ] },
      ] },
    ],
  },
  {
    id: 'capacitacion', label: 'Capacitación', icon: Award,
    bloques: [
      { id: 'capacitacion', titulo: 'Capacitación', icon: Award, campos: [
        { k: 'capacitaciones', label: 'Capacitaciones', tipo: 'lista', agregar: 'Agregar capacitación',
          columnas: [
            { k: 'tema', label: 'Tema', placeholder: 'Ej: Manejo seguro de metal fundido' },
            { k: 'periodicidad', label: 'Periodicidad', placeholder: 'Ej: Al ingreso y anual', ancho: 'sm:w-48' },
          ] },
      ] },
    ],
  },
  {
    id: 'herramientas', label: 'Herramientas', icon: Hammer,
    bloques: [
      { id: 'herramientas', titulo: 'Herramientas a entregar', icon: Hammer, campos: [
        { k: 'herramientas', label: 'Herramientas', tipo: 'lista', agregar: 'Agregar herramienta',
          columnas: [
            { k: 'herramienta', label: 'Herramienta', placeholder: 'Ej: Pinza de crisol' },
            { k: 'cantidad', label: 'Cantidad', tipo: 'number', ancho: 'sm:w-28' },
          ] },
      ] },
    ],
  },
]

export default function FichaCargo() {
  const { id } = useParams()
  const navigate = useNavigate()
  const navRef = useRef(null)
  const inputManual = useRef(null)

  const [cargo,      setCargo]      = useState(null)
  const [todos,      setTodos]      = useState([])
  const [personas,   setPersonas]   = useState([])
  const [fotos,      setFotos]      = useState({})
  const [cargando,   setCargando]   = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [tab,        setTab]        = useState('general')
  const [editando,   setEditando]   = useState(null)
  const [form,       setForm]       = useState({})
  const [guardando,  setGuardando]  = useState(false)
  const [msg,        setMsg]        = useState(null)
  const [subiendo,   setSubiendo]   = useState(false)

  useEffect(() => { setTab('general'); setEditando(null); cargar() }, [id])

  async function cargar() {
    setCargando(true); setErrorCarga(null)
    const [{ data, error }, { data: cs }, { data: ps }] = await Promise.all([
      supabase.from('cargos').select('*').eq('id', id).single(),
      supabase.from('cargos').select('id, nombre, area, cargo_padre_id, plazas, orden').order('nombre'),
      supabase.from('empleados')
        .select('id, nombres, apellidos, foto_path, estado, salario_base, tipo_contrato, tipo_vinculacion, fecha_ingreso')
        .eq('cargo_id', id).neq('estado', 'retirado').order('nombres'),
    ])
    if (error) { setErrorCarga(error.message); setCargo(null); setCargando(false); return }
    setCargo(data)
    setTodos(cs || [])
    setPersonas(ps || [])
    setFotos(await urlsFirmadas((ps || []).map(p => p.foto_path)))
    setCargando(false)
  }

  useEffect(() => {
    navRef.current?.querySelector('[data-activo="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab])

  const seccion = SECCIONES.find(s => s.id === tab)
  const excluidos = cargo ? descendientes(todos, cargo.id) : new Set()
  const ctx = {
    padre: cargo ? todos.find(c => c.id === cargo.cargo_padre_id) : null,
    posiblesPadres: todos.filter(c => c.id !== cargo?.id && !excluidos.has(c.id)),
  }
  const subordinados = todos.filter(c => c.cargo_padre_id === cargo?.id)

  function cambiarTab(t) {
    if (editando) return
    setTab(t); setMsg(null)
  }

  async function guardar(e, bloque) {
    e.preventDefault(); setMsg(null); setGuardando(true)
    const cambios = valoresParaGuardar(bloque, form, ctx)
    const { data, error } = await supabase.from('cargos').update(cambios).eq('id', id).select('*').single()
    setGuardando(false)
    if (error) { setMsg({ bloque: bloque.id, tipo: 'error', texto: error.message }); return }
    // Si cambió el nombre, mantener sincronizado el texto `cargo` de las fichas
    if (cambios.nombre && cambios.nombre !== cargo.nombre) {
      await supabase.from('empleados').update({ cargo: cambios.nombre }).eq('cargo_id', id)
    }
    setCargo(data); setEditando(null)
    setTodos(ts => ts.map(t => (t.id === id ? { ...t, ...data } : t)))
    setMsg({ bloque: bloque.id, tipo: 'exito', texto: 'Cambios guardados.' })
  }

  async function subirManual(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setMsg(null); setSubiendo(true)
    const limpio = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
    const path = `cargos/${id}/manual-${Date.now()}-${limpio}`
    const { error } = await supabase.storage.from(BUCKET_RRHH).upload(path, file)
    if (error) { setMsg({ bloque: 'manual', tipo: 'error', texto: `No se pudo subir: ${error.message}` }); setSubiendo(false); return }
    const anterior = cargo.manual_path
    const { error: errUpd } = await supabase.from('cargos').update({ manual_path: path, manual_nombre: file.name }).eq('id', id)
    if (errUpd) {
      await supabase.storage.from(BUCKET_RRHH).remove([path])
      setMsg({ bloque: 'manual', tipo: 'error', texto: errUpd.message })
    } else {
      if (anterior) await supabase.storage.from(BUCKET_RRHH).remove([anterior])
      setCargo(c => ({ ...c, manual_path: path, manual_nombre: file.name }))
      setMsg({ bloque: 'manual', tipo: 'exito', texto: 'Manual de funciones cargado.' })
    }
    setSubiendo(false)
  }

  async function eliminar() {
    if (!window.confirm(`¿Eliminar el cargo "${cargo.nombre}"? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('cargos').delete().eq('id', id)
    if (error) { setMsg({ bloque: 'datos', tipo: 'error', texto: error.message }); return }
    if (cargo.manual_path) await supabase.storage.from(BUCKET_RRHH).remove([cargo.manual_path])
    navigate('/rrhh/organigrama')
  }

  const volver = (
    <button onClick={() => navigate('/rrhh/organigrama')} className={`${E.btnTexto} -ml-2.5`}>
      <ArrowLeft {...E.ICONO} /> Organigrama
    </button>
  )

  if (cargando) return <Spinner />
  if (!cargo) return (
    <div className="max-w-6xl mx-auto space-y-4">
      {volver}
      <Alerta tipo="error" mensaje={errorCarga || 'No se encontró el cargo.'} />
    </div>
  )

  const libres = Math.max(0, (cargo.plazas || 0) - personas.length)
  const puedeEliminar = personas.length === 0 && subordinados.length === 0

  const Avatar = ({ p }) => fotos[p.foto_path]
    ? <img src={fotos[p.foto_path]} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
    : <span className="w-8 h-8 rounded-full bg-feisen-fondo border border-feisen-borde-suave flex items-center justify-center text-xs font-semibold text-feisen-texto-2 flex-shrink-0">{iniciales(p)}</span>

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {volver}

      {/* Encabezado */}
      <div className={`${E.tarjeta} p-5`}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-feisen-fondo border border-feisen-borde flex items-center justify-center flex-shrink-0">
            <Briefcase size={20} strokeWidth={1.6} className="text-feisen-texto-2" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className={E.tituloPagina}>{cargo.nombre}</h1>
            <p className="text-sm text-feisen-texto-2 mt-0.5">
              {cargo.area || 'Sin área'}
              {ctx.padre && <> · Reporta a <button onClick={() => navigate(`/rrhh/organigrama/${ctx.padre.id}`)} className="text-feisen-azul hover:underline">{ctx.padre.nombre}</button></>}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-sm text-feisen-texto-2">
              <span className="inline-flex items-center gap-1.5"><Users size={14} strokeWidth={1.8} className="text-feisen-gris-medio" />
                {personas.length} de {cargo.plazas} plaza{cargo.plazas === 1 ? '' : 's'} ocupada{cargo.plazas === 1 ? '' : 's'}
              </span>
              {libres > 0 && <span className="text-amber-600">{libres} vacante{libres > 1 ? 's' : ''}</span>}
              {subordinados.length > 0 && (
                <span className="inline-flex items-center gap-1.5"><Network size={14} strokeWidth={1.8} className="text-feisen-gris-medio" />
                  {subordinados.length} cargo{subordinados.length > 1 ? 's' : ''} le reporta{subordinados.length > 1 ? 'n' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <nav ref={navRef} className="w-full lg:w-56 flex-shrink-0 flex lg:flex-col gap-0.5 overflow-x-auto lg:sticky lg:top-6 -mx-1 px-1 lg:mx-0 lg:px-0">
          {SECCIONES.map(s => (
            <button key={s.id} onClick={() => cambiarTab(s.id)} disabled={!!editando && tab !== s.id}
              data-activo={tab === s.id} className={E.navItem(tab === s.id)}>
              <s.icon size={17} strokeWidth={tab === s.id ? 2.2 : 1.8} /> {s.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 w-full space-y-4">
          {seccion.bloques.map(b => (
            <Bloque key={b.id} bloque={b} registro={cargo} ctx={ctx}
              editando={editando === b.id} bloqueado={!!editando && editando !== b.id}
              form={form} setForm={setForm} guardando={guardando}
              msg={msg?.bloque === b.id ? msg : null}
              onEditar={() => { setForm(valoresIniciales(b, cargo)); setMsg(null); setEditando(b.id) }}
              onCancelar={() => { setEditando(null); setMsg(null) }}
              onGuardar={(e) => guardar(e, b)} />
          ))}

          {/* General: quién ocupa el cargo y qué cargos le reportan */}
          {tab === 'general' && (
            <>
              <div className={E.tarjeta}>
                <div className={E.cabTarjeta}>
                  <h2 className={E.tituloTarj}><Users {...E.ICONO} className={E.iconoTitulo} /> Personas en este cargo</h2>
                  <span className={E.etiqueta}>{personas.length} de {cargo.plazas}</span>
                </div>
                {personas.length === 0
                  ? <p className="px-5 py-4 text-sm text-feisen-gris-medio">Nadie ocupa este cargo todavía. Se asigna desde la ficha del colaborador (Información laboral → Cargo).</p>
                  : <div className="divide-y divide-feisen-borde-suave">
                      {personas.map(p => (
                        <button key={p.id} onClick={() => navigate(`/rrhh/empleados/${p.id}`)}
                          className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-feisen-fondo text-left">
                          <Avatar p={p} />
                          <span className="flex-1 text-sm text-feisen-texto truncate">{nombreCompleto(p)}</span>
                          {p.estado === 'licencia' && <span className="text-xs text-amber-600">En licencia</span>}
                          <ChevronRight size={16} strokeWidth={1.8} className="text-feisen-gris-medio" />
                        </button>
                      ))}
                    </div>}
              </div>
              {subordinados.length > 0 && (
                <div className={E.tarjeta}>
                  <div className={E.cabTarjeta}>
                    <h2 className={E.tituloTarj}><Network {...E.ICONO} className={E.iconoTitulo} /> Cargos que le reportan</h2>
                  </div>
                  <div className="divide-y divide-feisen-borde-suave">
                    {subordinados.map(c => (
                      <button key={c.id} onClick={() => navigate(`/rrhh/organigrama/${c.id}`)}
                        className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-feisen-fondo text-left">
                        <span className="flex-1 text-sm text-feisen-texto truncate">{c.nombre}</span>
                        {c.area && <span className="text-xs text-feisen-gris-medio">{c.area}</span>}
                        <ChevronRight size={16} strokeWidth={1.8} className="text-feisen-gris-medio" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={eliminar} disabled={!puedeEliminar || !!editando}
                  title={puedeEliminar ? '' : 'Solo se puede eliminar un cargo sin personas ni cargos que le reporten'}
                  className="inline-flex items-center gap-1.5 text-sm text-feisen-gris-medio hover:text-feisen-rojo disabled:opacity-40 disabled:hover:text-feisen-gris-medio px-2 py-1.5 rounded-lg">
                  <Trash2 size={14} strokeWidth={1.8} /> Eliminar cargo
                </button>
              </div>
            </>
          )}

          {/* Salario: comparar lo que ganan hoy las personas del cargo con el rango */}
          {tab === 'salario' && personas.length > 0 && (
            <div className={E.tarjeta}>
              <div className={E.cabTarjeta}>
                <h2 className={E.tituloTarj}><Users {...E.ICONO} className={E.iconoTitulo} /> Lo que ganan hoy</h2>
              </div>
              <div className="divide-y divide-feisen-borde-suave">
                {personas.map(p => {
                  const s = Number(p.salario_base) || null
                  const min = Number(cargo.salario_min) || null
                  const max = Number(cargo.salario_max) || min
                  const fuera = s && min && (s < min || s > max)
                  const vinc = TIPOS_VINCULACION.find(t => t.value === p.tipo_vinculacion)
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                      <Avatar p={p} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-feisen-texto truncate">{nombreCompleto(p)}</p>
                        <p className="text-xs text-feisen-gris-medio truncate">{p.tipo_contrato || '—'}{vinc && ` · ${vinc.label}`}</p>
                      </div>
                      <span className={`text-sm ${fuera ? 'text-amber-600' : 'text-feisen-texto'}`}>{s ? formatoPesos(s) : '—'}</span>
                      {fuera && <AlertTriangle size={14} strokeWidth={1.8} className="text-amber-500" title="Fuera del rango del cargo" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Manual de funciones en PDF */}
          {tab === 'funciones' && (
            <div className={E.tarjeta}>
              <div className={E.cabTarjeta}>
                <h2 className={E.tituloTarj}><FileText {...E.ICONO} className={E.iconoTitulo} /> Documento del manual</h2>
              </div>
              <div className="px-5 py-4 space-y-3">
                {msg?.bloque === 'manual' && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {cargo.manual_path ? (
                    <button onClick={() => abrirArchivoRRHH(cargo.manual_path).catch(err => setMsg({ bloque: 'manual', tipo: 'error', texto: err.message }))}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left border border-feisen-borde-suave hover:bg-feisen-fondo rounded-lg px-3 py-2.5">
                      <FileText {...E.ICONO} className="text-feisen-gris-medio flex-shrink-0" />
                      <span className="flex-1 text-sm text-feisen-texto truncate">{cargo.manual_nombre || 'Manual de funciones'}</span>
                      <ExternalLink size={15} strokeWidth={1.8} className="text-feisen-gris-medio flex-shrink-0" />
                    </button>
                  ) : (
                    <p className="flex-1 text-sm text-feisen-gris-medio">Si el manual ya existe en Word o PDF, súbelo aquí.</p>
                  )}
                  <button onClick={() => inputManual.current?.click()} disabled={subiendo}
                    className={`${cargo.manual_path ? E.btnSecundario : E.btnPrimario} whitespace-nowrap`}>
                    <Upload {...E.ICONO} /> {subiendo ? 'Subiendo...' : cargo.manual_path ? 'Reemplazar' : 'Subir manual'}
                  </button>
                  <input ref={inputManual} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={subirManual} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
