import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { siguienteNumero } from '../../utils/siguienteNumero'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Users, Plus, Search, ChevronRight, AlertTriangle, UserCheck, UserX, Clock } from 'lucide-react'
import {
  AREAS, TIPOS_DOCUMENTO, TIPOS_CONTRATO, ESTADOS_EMPLEADO,
  nombreCompleto, iniciales, tiempoDesde, diasParaVencer, formatoFecha, urlsFirmadas,
} from './catalogosRRHH'

const FORM_VACIO = {
  tipo_documento: 'CC',
  numero_documento: '',
  nombres: '',
  apellidos: '',
  cargo: '',
  area: '',
  fecha_ingreso: new Date().toISOString().split('T')[0],
  tipo_contrato: 'Término indefinido',
  fecha_fin_contrato: '',
  celular: '',
}

const inputCls = 'w-full border border-feisen-borde rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul'

export default function ListaEmpleados() {
  const navigate = useNavigate()
  const [empleados,    setEmpleados]    = useState([])
  const [fotos,        setFotos]        = useState({})
  const [cargando,     setCargando]     = useState(true)
  const [busqueda,     setBusqueda]     = useState('')
  const [filtroArea,   setFiltroArea]   = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activo')
  const [modal,        setModal]        = useState(false)
  const [form,         setForm]         = useState(FORM_VACIO)
  const [guardando,    setGuardando]    = useState(false)
  const [msg,          setMsg]          = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase.from('empleados')
      .select('id, codigo, nombres, apellidos, tipo_documento, numero_documento, cargo, area, estado, fecha_ingreso, tipo_contrato, fecha_fin_contrato, celular, foto_path')
      .order('nombres')
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setEmpleados(data || [])
    setFotos(await urlsFirmadas((data || []).map(e => e.foto_path)))
    setCargando(false)
  }

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
      (!q || nombreCompleto(e).toLowerCase().includes(q)
          || (e.numero_documento || '').includes(q)
          || (e.cargo || '').toLowerCase().includes(q)))
  }, [empleados, busqueda, filtroArea, filtroEstado])

  function abrirNuevo() {
    setForm(FORM_VACIO); setMsg(null); setModal(true)
  }

  async function crear(e) {
    e.preventDefault(); setMsg(null); setGuardando(true)
    try {
      const codigo = await siguienteNumero('empleados', 'EMP', 'codigo')
      const fila = {
        ...form,
        codigo,
        numero_documento: form.numero_documento.trim(),
        nombres: form.nombres.trim(),
        apellidos: form.apellidos.trim(),
        fecha_fin_contrato: form.fecha_fin_contrato || null,
      }
      const { data, error } = await supabase.from('empleados').insert(fila).select('id').single()
      if (error) throw error
      setModal(false)
      navigate(`/rrhh/empleados/${data.id}`)
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message?.includes('numero_documento')
        ? 'Ya existe un empleado con ese número de documento.' : err.message })
    }
    setGuardando(false)
  }

  const set = (k) => (ev) => setForm(f => ({ ...f, [k]: ev.target.value }))
  const requiereFin = ['Término fijo', 'Aprendizaje (SENA)', 'Prestación de servicios'].includes(form.tipo_contrato)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-pink-50 flex items-center justify-center">
            <Users size={22} className="text-pink-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-feisen-texto">Colaboradores</h1>
            <p className="text-sm text-gray-500">Fichas del personal de Feisen</p>
          </div>
        </div>
        <button onClick={abrirNuevo}
          className="flex items-center gap-2 bg-feisen-azul text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-feisen-azul-claro">
          <Plus size={18} /> Nuevo colaborador
        </button>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { k: 'activo',   icon: UserCheck, label: 'Activos',   color: 'text-green-600 bg-green-50' },
          { k: 'licencia', icon: Clock,     label: 'En licencia', color: 'text-amber-600 bg-amber-50' },
          { k: 'retirado', icon: UserX,     label: 'Retirados', color: 'text-gray-500 bg-gray-100' },
        ].map(c => (
          <button key={c.k} onClick={() => setFiltroEstado(filtroEstado === c.k ? '' : c.k)}
            className={`bg-white rounded-xl p-4 border text-left transition-colors
              ${filtroEstado === c.k ? 'border-feisen-azul ring-1 ring-feisen-azul' : 'border-feisen-borde hover:border-feisen-borde'}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${c.color}`}><c.icon size={16} /></div>
            <p className="text-2xl font-bold text-gray-800">{conteo[c.k]}</p>
            <p className="text-xs text-gray-500">{c.label}</p>
          </button>
        ))}
        <div className="bg-white rounded-xl p-4 border border-feisen-borde">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 text-feisen-rojo bg-red-50"><AlertTriangle size={16} /></div>
          <p className="text-2xl font-bold text-gray-800">{porVencer.length}</p>
          <p className="text-xs text-gray-500">Contratos por vencer (45 días)</p>
        </div>
      </div>

      {/* Alertas de contratos */}
      {porVencer.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
            <AlertTriangle size={16} /> Contratos que vencen pronto
          </p>
          <div className="space-y-1">
            {porVencer.map(e => (
              <button key={e.id} onClick={() => navigate(`/rrhh/empleados/${e.id}`)}
                className="w-full flex items-center justify-between text-sm text-amber-900 hover:bg-amber-100 rounded-lg px-2 py-1.5">
                <span className="font-medium">{nombreCompleto(e)} <span className="font-normal text-amber-700">· {e.tipo_contrato}</span></span>
                <span className="text-xs font-semibold">
                  {e.dias < 0 ? `Venció hace ${-e.dias} días` : e.dias === 0 ? 'Vence hoy' : `${formatoFecha(e.fecha_fin_contrato)} · ${e.dias} días`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, documento o cargo"
            className="w-full border border-feisen-borde bg-white rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)}
          className="border border-feisen-borde bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul">
          <option value="">Todas las áreas</option>
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          className="border border-feisen-borde bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_EMPLEADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {!modal && msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Listado */}
      {cargando ? <Spinner /> : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-feisen-borde py-16 text-center">
          <Users size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">
            {empleados.length === 0 ? 'Aún no hay colaboradores registrados' : 'Ningún colaborador coincide con los filtros'}
          </p>
          {empleados.length === 0 && (
            <button onClick={abrirNuevo} className="mt-4 text-sm font-semibold text-feisen-azul hover:underline">
              Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-feisen-borde divide-y divide-feisen-borde-suave">
          {filtrados.map(e => {
            const est = ESTADOS_EMPLEADO[e.estado] || ESTADOS_EMPLEADO.activo
            return (
              <button key={e.id} onClick={() => navigate(`/rrhh/empleados/${e.id}`)}
                className="w-full flex items-center gap-4 px-4 lg:px-5 py-3.5 hover:bg-gray-50 text-left first:rounded-t-2xl last:rounded-b-2xl">
                {fotos[e.foto_path]
                  ? <img src={fotos[e.foto_path]} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-11 h-11 rounded-full bg-feisen-azul-suave flex items-center justify-center flex-shrink-0">
                      <span className="font-bold text-feisen-azul text-sm">{iniciales(e)}</span>
                    </div>}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{nombreCompleto(e)}</p>
                  <p className="text-sm text-gray-500 truncate">
                    {e.cargo || 'Sin cargo'}{e.area && <span className="text-gray-400"> · {e.area}</span>}
                  </p>
                </div>
                <div className="hidden md:block text-right text-sm w-44">
                  <p className="text-gray-600">{e.tipo_documento || 'CC'} {e.numero_documento}</p>
                  <p className="text-xs text-gray-400">{e.fecha_ingreso ? `Antigüedad: ${tiempoDesde(e.fecha_ingreso) || '—'}` : ''}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${est.color}`}>{est.label}</span>
                <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
              </button>
            )
          })}
        </div>
      )}

      {/* Modal nuevo */}
      {modal && (
        <Modal titulo="Nuevo colaborador" onCerrar={() => setModal(false)}>
          <form onSubmit={crear} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <p className="text-xs text-gray-500">Datos básicos para crear la ficha. El resto se completa desde la ficha.</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Tipo *</label>
                <select value={form.tipo_documento} onChange={set('tipo_documento')} className={inputCls}>
                  {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700 block mb-1">Número de documento *</label>
                <input required value={form.numero_documento} onChange={set('numero_documento')} inputMode="numeric" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Nombres *</label>
                <input required value={form.nombres} onChange={set('nombres')} className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Apellidos *</label>
                <input required value={form.apellidos} onChange={set('apellidos')} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Cargo *</label>
                <input required value={form.cargo} onChange={set('cargo')} placeholder="Ej: Moldeador" className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Área *</label>
                <select required value={form.area} onChange={set('area')} className={inputCls}>
                  <option value="">Seleccionar…</option>
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Fecha de ingreso *</label>
                <input required type="date" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Celular</label>
                <input value={form.celular} onChange={set('celular')} inputMode="tel" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className={requiereFin ? '' : 'col-span-2'}>
                <label className="text-sm font-medium text-gray-700 block mb-1">Tipo de contrato *</label>
                <select value={form.tipo_contrato} onChange={set('tipo_contrato')} className={inputCls}>
                  {TIPOS_CONTRATO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {requiereFin && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Fin de contrato *</label>
                  <input required type="date" value={form.fecha_fin_contrato} onChange={set('fecha_fin_contrato')} className={inputCls} />
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(false)}
                className="flex-1 border border-feisen-borde rounded-xl py-2.5 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit" disabled={guardando}
                className="flex-1 bg-feisen-azul text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {guardando ? 'Creando...' : 'Crear ficha'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
