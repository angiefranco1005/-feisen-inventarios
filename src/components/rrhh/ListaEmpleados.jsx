import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { siguienteNumero } from '../../utils/siguienteNumero'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Users, Plus, Search, ChevronRight, AlertTriangle, Camera, Cake } from 'lucide-react'
import * as E from './estilos'
import {
  AREAS, TIPOS_DOCUMENTO, TIPOS_CONTRATO, tieneFechaFin, GRUPOS_VINCULO, grupoVinculoDe, TIPOS_VINCULACION, ESTADOS_EMPLEADO, calcularFinContrato, proximosCumpleanos, preavisoDe, hoyISO,
  nombreCompleto, iniciales, tiempoDesde, diasParaVencer, formatoFecha, urlsFirmadas,
  subirFotoEmpleado,
} from './catalogosRRHH'

const FORM_VACIO = {
  tipo_documento: 'CC',
  numero_documento: '',
  nombres: '',
  apellidos: '',
  cargo_id: '',
  area: '',
  fecha_ingreso: new Date().toISOString().split('T')[0],
  tipo_contrato: 'Indefinido',
  duracion_meses: '',
  fecha_fin_contrato: '',
  tipo_vinculacion: '',
  celular: '',
}


export default function ListaEmpleados() {
  const navigate = useNavigate()
  const [empleados,    setEmpleados]    = useState([])
  const [fotos,        setFotos]        = useState({})
  const [cargando,     setCargando]     = useState(true)
  const [busqueda,     setBusqueda]     = useState('')
  const [filtroArea,   setFiltroArea]   = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activo')
  const [filtroVinculo, setFiltroVinculo] = useState('')
  const [modal,        setModal]        = useState(false)
  const [form,         setForm]         = useState(FORM_VACIO)
  const [guardando,    setGuardando]    = useState(false)
  const [msg,          setMsg]          = useState(null)
  const [foto,         setFoto]         = useState(null)   // { file, url } foto opcional al crear
  const inputFoto = useRef(null)
  const [cargos,       setCargos]       = useState([])     // catálogo del organigrama

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data, error }, { data: cats }] = await Promise.all([
      supabase.from('empleados')
        .select('id, codigo, nombres, apellidos, tipo_documento, numero_documento, cargo, area, estado, fecha_ingreso, tipo_contrato, fecha_fin_contrato, celular, foto_path, fecha_nacimiento, preaviso_fecha_entrega, preaviso_para_fin, preaviso_documento_id')
        .order('nombres'),
      supabase.from('cargos').select('id, nombre, area').order('nombre'),
    ])
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setCargos(cats || [])
    setEmpleados(data || [])
    setFotos(await urlsFirmadas((data || []).map(e => e.foto_path)))
    setCargando(false)
  }

  const cumpleSemana = useMemo(() => proximosCumpleanos(empleados, 7), [empleados])

  const conteo = useMemo(() => ({
    activo:   empleados.filter(e => e.estado === 'activo').length,
    licencia: empleados.filter(e => e.estado === 'licencia').length,
    retirado: empleados.filter(e => e.estado === 'retirado').length,
  }), [empleados])

  // Contratos a término fijo / obra que vencen en los próximos 45 días
  const porVencer = useMemo(() => empleados
    .filter(e => e.estado !== 'retirado' && e.fecha_fin_contrato)
    .map(e => ({ ...e, dias: diasParaVencer(e.fecha_fin_contrato) }))
    .filter(e => e.dias !== null && e.dias <= 45)
    .sort((a, b) => a.dias - b.dias), [empleados])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return empleados.filter(e =>
      (!filtroEstado || e.estado === filtroEstado) &&
      (!filtroArea || e.area === filtroArea) &&
      (!filtroVinculo || grupoVinculoDe(e.tipo_contrato) === filtroVinculo) &&
      (!q || nombreCompleto(e).toLowerCase().includes(q)
          || (e.numero_documento || '').includes(q)
          || (e.cargo || '').toLowerCase().includes(q)))
  }, [empleados, busqueda, filtroArea, filtroEstado, filtroVinculo])

  function abrirNuevo() {
    setForm(FORM_VACIO); setFoto(null); setMsg(null); setModal(true)
  }

  async function crear(e) {
    e.preventDefault(); setMsg(null); setGuardando(true)
    try {
      const codigo = await siguienteNumero('empleados', 'EMP', 'codigo')
      const fila = {
        ...form,
        codigo,
        cargo: cargos.find(c => c.id === form.cargo_id)?.nombre ?? null,
        numero_documento: form.numero_documento.trim(),
        nombres: form.nombres.trim(),
        apellidos: form.apellidos.trim(),
        duracion_meses: esFijo ? Number(form.duracion_meses) : null,
        fecha_fin_contrato: esFijo ? form.fecha_fin_contrato || null : null,
        tipo_vinculacion: esContratista ? form.tipo_vinculacion : null,
      }
      const { data, error } = await supabase.from('empleados').insert(fila).select('id').single()
      if (error) throw error
      if (foto) {
        try {
          await subirFotoEmpleado(data.id, foto.file)
        } catch (errFoto) {
          // La ficha ya quedó creada: se avisa y se puede subir la foto desde la ficha
          setModal(false); setGuardando(false); await cargar()
          setMsg({ tipo: 'alerta', texto: `Se creó la ficha, pero la foto no se pudo subir (${errFoto.message}). Súbela desde la ficha.` })
          return
        }
      }
      setModal(false)
      navigate(`/rrhh/empleados/${data.id}`)
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message?.includes('numero_documento')
        ? 'Ya existe un empleado con ese número de documento.' : err.message })
    }
    setGuardando(false)
  }

  // Término fijo y aprendices: la fecha fin se sugiere con ingreso + duración (sigue siendo editable)
  const set = (k) => (ev) => setForm(f => {
    const nf = { ...f, [k]: ev.target.value }
    if (k === 'cargo_id') {
      const area = cargos.find(c => c.id === nf.cargo_id)?.area
      if (area) nf.area = area
    }
    const fin = tieneFechaFin(nf.tipo_contrato) && ['fecha_ingreso', 'duracion_meses', 'tipo_contrato'].includes(k)
      && calcularFinContrato(nf.fecha_ingreso, nf.duracion_meses)
    return fin ? { ...nf, fecha_fin_contrato: fin } : nf
  })
  const esFijo        = tieneFechaFin(form.tipo_contrato)
  const esContratista = form.tipo_contrato === 'Contratista'

  const columnas = 'md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_6.5rem]'

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Encabezado */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>Colaboradores</h1>
          <p className={E.subtituloPagina}>Fichas del personal de Feisen</p>
        </div>
        <button onClick={abrirNuevo} className={E.btnPrimario}>
          <Plus {...E.ICONO} /> Nuevo colaborador
        </button>
      </div>

      {/* Indicadores: clic para filtrar por estado */}
      <div className={`${E.tarjeta} grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-feisen-borde-suave overflow-hidden`}>
        {[
          { k: 'activo',   label: 'Activos' },
          { k: 'licencia', label: 'En licencia' },
          { k: 'retirado', label: 'Retirados' },
        ].map(c => (
          <button key={c.k} onClick={() => setFiltroEstado(filtroEstado === c.k ? '' : c.k)}
            className={`px-5 py-3.5 text-left transition-colors ${filtroEstado === c.k ? 'bg-feisen-azul-suave' : 'hover:bg-feisen-fondo'}`}>
            <p className={`${E.etiqueta} flex items-center gap-1.5`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ESTADOS_EMPLEADO[c.k].punto}`} /> {c.label}
            </p>
            <p className={`text-2xl font-semibold mt-0.5 ${filtroEstado === c.k ? 'text-feisen-azul' : 'text-feisen-texto'}`}>{conteo[c.k]}</p>
          </button>
        ))}
        <div className="px-5 py-3.5">
          <p className={`${E.etiqueta} flex items-center gap-1.5`}>
            <span className="w-1.5 h-1.5 rounded-full bg-feisen-rojo" /> Contratos por vencer
          </p>
          <p className={`text-2xl font-semibold mt-0.5 ${porVencer.length ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{porVencer.length}</p>
        </div>
      </div>

      {/* Recordatorio: cumpleaños de los próximos 7 días */}
      {cumpleSemana.length > 0 && (
        <div className={`${E.tarjeta} px-5 py-3 flex flex-wrap items-center gap-2`}>
          <span className={`${E.tituloTarj} mr-1`}><Cake {...E.ICONO} className="text-pink-500" /> Cumpleaños esta semana</span>
          {cumpleSemana.map(p => (
            <button key={p.empleado.id} onClick={() => navigate(`/rrhh/empleados/${p.empleado.id}`)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-feisen-fondo
                ${p.enDias === 0 ? 'border-pink-200 bg-pink-50 text-pink-700' : 'border-feisen-borde text-feisen-texto'}`}>
              {nombreCompleto(p.empleado)}
              <span className={p.enDias === 0 ? 'font-medium' : 'text-feisen-gris-medio'}>
                · {p.enDias === 0 ? '¡hoy!' : p.enDias === 1 ? 'mañana' : formatoFecha(p.fecha)}
              </span>
            </button>
          ))}
          <button onClick={() => navigate('/rrhh/calendario')} className="ml-auto text-xs font-medium text-feisen-azul hover:underline">Ver calendario</button>
        </div>
      )}

      {/* Contratos que vencen en los próximos 45 días */}
      {porVencer.length > 0 && (
        <div className={E.tarjeta}>
          <div className={E.cabTarjeta}>
            <h2 className={E.tituloTarj}><AlertTriangle {...E.ICONO} className="text-amber-500" /> Contratos que vencen pronto</h2>
            <span className={E.etiqueta}>Próximos 45 días</span>
          </div>
          <div className="divide-y divide-feisen-borde-suave">
            {porVencer.map(e => (
              <button key={e.id} onClick={() => navigate(`/rrhh/empleados/${e.id}`)}
                className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-feisen-fondo text-left">
                <span className="min-w-0">
                  <span className="block truncate">
                    <span className="font-medium text-feisen-texto">{nombreCompleto(e)}</span>
                    <span className="text-feisen-texto-2"> · {e.tipo_contrato}</span>
                  </span>
                  {(() => {
                    // Término fijo: plazo para dar el preaviso de no prórroga (30 días antes)
                    const p = preavisoDe(e)
                    if (!p || e.dias < 0) return null
                    if (p.entregado) return (
                      <span className={`block text-xs ${p.entregado.aTiempo ? 'text-green-700' : 'text-feisen-rojo'}`}>
                        Preaviso entregado el {formatoFecha(p.entregado.fecha)}{!p.entregado.aTiempo && ' (fuera de plazo)'}
                        {!p.entregado.conCarta && <span className="text-amber-600"> · falta la carta</span>}
                      </span>
                    )
                    const vencido = p.limite < hoyISO()
                    return (
                      <span className={`block text-xs ${vencido ? 'text-feisen-rojo' : 'text-orange-600'}`}>
                        {vencido ? `Ya pasó el plazo del preaviso (${formatoFecha(p.limite)})` : `Dar preaviso a más tardar el ${formatoFecha(p.limite)}`}
                      </span>
                    )
                  })()}
                </span>
                <span className={`text-xs whitespace-nowrap ${e.dias < 0 ? 'text-feisen-rojo' : 'text-amber-600'}`}>
                  {e.dias < 0 ? `Venció hace ${-e.dias} días` : e.dias === 0 ? 'Vence hoy' : `${formatoFecha(e.fecha_fin_contrato)} · ${e.dias} días`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search {...E.ICONO} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, documento o cargo" className={`${E.input} pl-9`} />
        </div>
        <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} className={`${E.input} sm:w-48`}>
          <option value="">Todas las áreas</option>
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtroVinculo} onChange={e => setFiltroVinculo(e.target.value)} className={`${E.input} sm:w-44`}>
          <option value="">Toda vinculación</option>
          {GRUPOS_VINCULO.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={`${E.input} sm:w-44`}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_EMPLEADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {!modal && msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Listado */}
      {cargando ? <Spinner /> : filtrados.length === 0 ? (
        <div className={`${E.tarjeta} py-14 text-center`}>
          <Users size={28} strokeWidth={1.5} className="mx-auto text-feisen-gris-medio mb-2" />
          <p className="text-sm text-feisen-texto-2">
            {empleados.length === 0 ? 'Aún no hay colaboradores registrados' : 'Ningún colaborador coincide con los filtros'}
          </p>
          {empleados.length === 0 && (
            <button onClick={abrirNuevo} className="mt-3 text-sm font-medium text-feisen-azul hover:underline">Crear el primero</button>
          )}
        </div>
      ) : (
        <div className={`${E.tarjeta} overflow-hidden`}>
          <div className={`hidden md:grid ${columnas} gap-4 px-5 py-2 border-b border-feisen-borde-suave text-xs font-medium text-feisen-gris-medio`}>
            <span>Colaborador</span><span>Documento</span><span>Área</span><span>Ingreso</span><span>Estado</span>
          </div>
          <div className="divide-y divide-feisen-borde-suave">
            {filtrados.map(e => {
              const est = ESTADOS_EMPLEADO[e.estado] || ESTADOS_EMPLEADO.activo
              return (
                <button key={e.id} onClick={() => navigate(`/rrhh/empleados/${e.id}`)}
                  className={`w-full grid grid-cols-[minmax(0,1fr)_auto] ${columnas} gap-4 items-center px-5 py-2.5 hover:bg-feisen-fondo text-left`}>
                  <div className="flex items-center gap-3 min-w-0">
                    {fotos[e.foto_path]
                      ? <img src={fotos[e.foto_path]} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-8 h-8 rounded-full bg-feisen-fondo border border-feisen-borde-suave flex items-center justify-center flex-shrink-0">
                          <span className="font-semibold text-feisen-texto-2 text-xs">{iniciales(e)}</span>
                        </div>}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-feisen-texto truncate">{nombreCompleto(e)}</p>
                      <p className="text-xs text-feisen-texto-2 truncate">
                        {e.cargo || 'Sin cargo'}<span className="md:hidden">{e.area && ` · ${e.area}`}</span>
                      </p>
                    </div>
                  </div>
                  <span className="hidden md:block text-sm text-feisen-texto-2 truncate">{e.tipo_documento || 'CC'} {e.numero_documento}</span>
                  <span className="hidden md:block text-sm text-feisen-texto-2 truncate">{e.area || '—'}</span>
                  <span className="hidden md:block text-sm text-feisen-texto-2 min-w-0">
                    {formatoFecha(e.fecha_ingreso)}
                    {e.fecha_ingreso && <span className="block text-xs text-feisen-gris-medio truncate">{tiempoDesde(e.fecha_ingreso) || '—'}</span>}
                  </span>
                  <span className="flex items-center justify-end md:justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-feisen-texto-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${est.punto}`} /> {est.label}
                    </span>
                    <ChevronRight size={16} strokeWidth={1.8} className="text-feisen-gris-medio flex-shrink-0" />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal nuevo */}
      {modal && (
        <Modal titulo="Nuevo colaborador" onCerrar={() => setModal(false)}>
          <form onSubmit={crear} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <p className="text-xs text-feisen-texto-2">Datos básicos para crear la ficha. El resto se completa desde la ficha.</p>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => inputFoto.current?.click()}
                className="relative w-16 h-16 rounded-full flex-shrink-0 bg-feisen-fondo border border-dashed border-feisen-borde hover:border-feisen-azul flex items-center justify-center overflow-hidden">
                {foto ? <img src={foto.url} alt="" className="w-full h-full object-cover" /> : <Camera size={20} strokeWidth={1.6} className="text-feisen-gris-medio" />}
              </button>
              <div>
                <button type="button" onClick={() => inputFoto.current?.click()} className="text-sm font-medium text-feisen-azul hover:underline">
                  {foto ? 'Cambiar foto' : 'Subir foto'}
                </button>
                <p className="text-xs text-feisen-gris-medio">Opcional · JPG o PNG. Desde el celular puedes tomarla con la cámara.</p>
                {foto && <button type="button" onClick={() => setFoto(null)} className="text-xs text-feisen-gris-medio hover:text-feisen-rojo mt-0.5">Quitar</button>}
              </div>
              <input ref={inputFoto} type="file" accept="image/*" className="hidden"
                onChange={ev => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) setFoto({ file: f, url: URL.createObjectURL(f) }) }} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={E.labelForm}>Tipo *</label>
                <select value={form.tipo_documento} onChange={set('tipo_documento')} className={E.input}>
                  {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={E.labelForm}>Número de documento *</label>
                <input required value={form.numero_documento} onChange={set('numero_documento')} inputMode="numeric" className={E.input} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={E.labelForm}>Nombres *</label>
                <input required value={form.nombres} onChange={set('nombres')} className={E.input} />
              </div>
              <div>
                <label className={E.labelForm}>Apellidos *</label>
                <input required value={form.apellidos} onChange={set('apellidos')} className={E.input} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={E.labelForm}>Cargo *</label>
                <select required value={form.cargo_id} onChange={set('cargo_id')} className={E.input}>
                  <option value="">{cargos.length ? 'Seleccionar…' : 'Primero crea cargos en el Organigrama'}</option>
                  {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.area ? ` · ${c.area}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className={E.labelForm}>Área *</label>
                <select required value={form.area} onChange={set('area')} className={E.input}>
                  <option value="">Seleccionar…</option>
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={E.labelForm}>Fecha de ingreso *</label>
                <input required type="date" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} className={E.input} />
              </div>
              <div>
                <label className={E.labelForm}>Celular</label>
                <input value={form.celular} onChange={set('celular')} inputMode="tel" className={E.input} />
              </div>
            </div>
            <div>
              <label className={E.labelForm}>Tipo de contrato *</label>
              <select value={form.tipo_contrato} onChange={set('tipo_contrato')} className={E.input}>
                {TIPOS_CONTRATO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {esFijo && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={E.labelForm}>Duración (meses) *</label>
                  <input required type="number" min="1" step="1" inputMode="numeric" value={form.duracion_meses}
                    onChange={set('duracion_meses')} placeholder="Ej: 6" className={E.input} />
                </div>
                <div>
                  <label className={E.labelForm}>Fin de contrato *</label>
                  <input required type="date" value={form.fecha_fin_contrato} onChange={set('fecha_fin_contrato')} className={E.input} />
                </div>
              </div>
            )}
            {esContratista && (
              <div>
                <label className={E.labelForm}>Tipo de vinculación *</label>
                <select required value={form.tipo_vinculacion} onChange={set('tipo_vinculacion')} className={E.input}>
                  <option value="">Seleccionar…</option>
                  {TIPOS_VINCULACION.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(false)}
                className={`${E.btnSecundario} flex-1`}>Cancelar</button>
              <button type="submit" disabled={guardando}
                className={`${E.btnPrimario} flex-1`}>
                {guardando ? 'Creando...' : 'Crear ficha'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
