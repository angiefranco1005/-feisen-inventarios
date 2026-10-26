import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { exportarNominaQuincena } from '../../../utils/exportExcel'
import Spinner from '../../shared/Spinner'
import Alerta from '../../shared/Alerta'
import { ArrowLeft, Download, Lock, Unlock, ChevronRight, UserPlus, Search, AlertTriangle, FileText, Fingerprint } from 'lucide-react'
import * as E from '../estilos'
import { nombreCompleto, iniciales, formatoPesos, urlsFirmadas } from '../catalogosRRHH'
import { MODALIDADES, diasLaborales, calcularTotales } from './nominaCalculo'
import HuelleroQuincena from './HuelleroQuincena'
import { generarDesprendibles } from '../../../utils/desprendiblePagoPDF'
import { nombreQuincena, contextoQuincena, liquidacionSugerida, CAMPOS_PAGO_EMPLEADO } from './nominaQuincena'

// Planilla de una quincena: todas las personas con lo que se les paga
export default function PeriodoNomina() {
  const { periodoId } = useParams()
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const [periodo,   setPeriodo]   = useState(null)
  const [liqs,      setLiqs]      = useState([])
  const [piezas,    setPiezas]    = useState([])
  const [empleados, setEmpleados] = useState([])
  const [fotos,     setFotos]     = useState({})
  const [cargando,  setCargando]  = useState(true)
  const [msg,       setMsg]       = useState(null)
  const [fMod,      setFMod]      = useState('')
  const [busqueda,  setBusqueda]  = useState('')
  const [agregar,   setAgregar]   = useState('')
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => { cargar() }, [periodoId])

  async function cargar() {
    setCargando(true)
    const [{ data: p, error }, { data: ls }, { data: emps }] = await Promise.all([
      supabase.from('nomina_periodos').select('*').eq('id', periodoId).single(),
      supabase.from('nomina_liquidaciones').select('*').eq('periodo_id', periodoId),
      supabase.from('empleados').select(CAMPOS_PAGO_EMPLEADO).order('nombres'),
    ])
    if (error) { setMsg({ tipo: 'error', texto: error.message }); setCargando(false); return }
    const ids = (ls || []).map(l => l.id)
    const { data: pz } = ids.length
      ? await supabase.from('nomina_piezas').select('liquidacion_id, descripcion, cantidad, valor_unitario').in('liquidacion_id', ids)
      : { data: [] }
    setPeriodo(p)
    setLiqs(ls || [])
    setPiezas(pz || [])
    setEmpleados(emps || [])
    setFotos(await urlsFirmadas((emps || []).map(e => e.foto_path)))
    setCargando(false)
  }

  const empPorId = useMemo(() => new Map(empleados.map(e => [e.id, e])), [empleados])
  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return liqs
      .map(l => ({ ...l, emp: empPorId.get(l.empleado_id) }))
      .filter(l => (!fMod || l.modalidad === fMod) && (!q || nombreCompleto(l.emp).toLowerCase().includes(q)))
      .sort((a, b) => nombreCompleto(a.emp).localeCompare(nombreCompleto(b.emp)))
  }, [liqs, empPorId, fMod, busqueda])

  const suma = (lista, k) => lista.reduce((t, l) => t + (Number(l[k]) || 0), 0)
  const cerrada = periodo?.estado === 'cerrada'
  const fuera = empleados.filter(e => e.estado !== 'retirado' && !liqs.some(l => l.empleado_id === e.id))

  async function cambiarEstado() {
    const cerrar = !cerrada
    if (!window.confirm(cerrar
      ? '¿Cerrar la quincena? Ya no se podrá editar (se puede reabrir después).'
      : '¿Reabrir la quincena para hacer cambios?')) return
    const { data, error } = await supabase.from('nomina_periodos')
      .update(cerrar ? { estado: 'cerrada', cerrada_por: perfil?.id, cerrada_en: new Date().toISOString() } : { estado: 'borrador', cerrada_por: null, cerrada_en: null })
      .eq('id', periodoId).select('*').single()
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setPeriodo(data)
  }

  async function agregarPersona() {
    const emp = empPorId.get(agregar)
    if (!emp) return
    setTrabajando(true); setMsg(null)
    try {
      const ctx = await contextoQuincena(periodo.fecha_inicio, periodo.fecha_fin)
      const { liq, piezas: pz } = liquidacionSugerida(emp, periodo.fecha_inicio, periodo.fecha_fin, ctx)
      const { data, error } = await supabase.from('nomina_liquidaciones')
        .insert({ ...liq, periodo_id: periodoId, ...calcularTotales(liq, pz) }).select('id').single()
      if (error) throw error
      if (pz.length) await supabase.from('nomina_piezas').insert(pz.map(p => ({ ...p, liquidacion_id: data.id })))
      navigate(`/rrhh/nomina/${periodoId}/${data.id}`)
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
      setTrabajando(false)
    }
  }

  const paraDocumentos = () => filas.map(l => ({
    ...l, nombre: nombreCompleto(l.emp), documento: l.emp ? `${l.emp.tipo_documento || ''} ${l.emp.numero_documento || ''}`.trim() : '',
    cargo: l.emp?.cargo, area: l.emp?.area, tipo_contrato: l.emp?.tipo_contrato, piezas: piezas.filter(p => p.liquidacion_id === l.id),
  }))
  function exportar() {
    exportarNominaQuincena({ titulo: nombreQuincena(periodo), filas: paraDocumentos() })
  }
  function desprendibles() {
    generarDesprendibles(paraDocumentos(), nombreQuincena(periodo), `desprendibles_${periodo.anio}_${String(periodo.mes).padStart(2, '0')}_q${periodo.quincena}`)
  }

  if (cargando) return <Spinner />
  if (!periodo) return (
    <div className="max-w-6xl mx-auto space-y-4">
      <button onClick={() => navigate('/rrhh/nomina')} className={`${E.btnTexto} -ml-2.5`}><ArrowLeft {...E.ICONO} /> Nómina</button>
      <Alerta tipo="error" mensaje={msg?.texto || 'No se encontró la quincena.'} />
    </div>
  )

  const Avatar = ({ e }) => e && fotos[e.foto_path]
    ? <img src={fotos[e.foto_path]} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
    : <span className="w-8 h-8 rounded-full bg-feisen-fondo border border-feisen-borde-suave flex items-center justify-center text-xs font-semibold text-feisen-texto-2 flex-shrink-0">{e ? iniciales(e) : '?'}</span>

  const detalle = (l) => {
    if (l.modalidad === 'destajo') {
      const pz = piezas.filter(p => p.liquidacion_id === l.id)
      const n = pz.reduce((t, p) => t + Number(p.cantidad || 0), 0)
      return pz.length ? `${n.toLocaleString('es-CO')} pieza${n === 1 ? '' : 's'} · ${pz.length} referencia${pz.length === 1 ? '' : 's'}` : 'Sin piezas'
    }
    if (l.modalidad === 'dia') return l.dias !== null ? `${Number(l.dias).toLocaleString('es-CO')} días × ${formatoPesos(l.valor_dia)}` : 'Sin días'
    return l.valor_fijo ? `Fijo ${formatoPesos(l.valor_fijo)}` : 'Sin valor fijo'
  }
  const sinValor = (l) => (l.modalidad === 'dia' && !Number(l.valor_dia)) || (l.modalidad === 'fijo' && !Number(l.valor_fijo))
    || (l.modalidad === 'destajo' && piezas.some(p => p.liquidacion_id === l.id && !Number(p.valor_unitario)))
  // El huellero sugiere horas distintas a las que ya tiene la liquidación
  const huelleroPendiente = (l) => l.huellero && (Number(l.huellero.horas_extra || 0) !== Number(l.horas_extra || 0)
    || Number(l.huellero.horas_recargo || 0) !== Number(l.horas_extra_recargo || 0))
  const columnas = 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.5fr)_8rem_8rem_8rem_1rem]'

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <button onClick={() => navigate('/rrhh/nomina')} className={`${E.btnTexto} -ml-2.5`}><ArrowLeft {...E.ICONO} /> Nómina</button>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>{nombreQuincena(periodo)}</h1>
          <p className={E.subtituloPagina}>
            {diasLaborales(periodo.fecha_inicio, periodo.fecha_fin)} días laborales (lunes a viernes sin festivos) ·{' '}
            {cerrada ? <span className="inline-flex items-center gap-1"><Lock size={12} strokeWidth={1.8} /> Cerrada</span> : <span className="text-amber-600">En borrador</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={desprendibles} disabled={!filas.length} className={E.btnSecundario} title="Un PDF con el desprendible de cada persona de la vista">
            <FileText {...E.ICONO} /> Desprendibles
          </button>
          <button onClick={exportar} className={E.btnSecundario}><Download {...E.ICONO} /> Excel</button>
          <button onClick={cambiarEstado} className={cerrada ? E.btnSecundario : E.btnPrimario}>
            {cerrada ? <><Unlock {...E.ICONO} /> Reabrir</> : <><Lock {...E.ICONO} /> Cerrar quincena</>}
          </button>
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Totales */}
      <div className={`${E.tarjeta} grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-feisen-borde-suave overflow-hidden`}>
        {[
          { label: 'Personas', valor: filas.length.toLocaleString('es-CO') },
          { label: 'Total devengado', valor: formatoPesos(suma(filas, 'total_devengado')) },
          { label: 'Total deducciones', valor: formatoPesos(suma(filas, 'total_deducciones')) },
          { label: 'Total a pagar', valor: formatoPesos(suma(filas, 'neto')), fuerte: true },
        ].map(k => (
          <div key={k.label} className="px-5 py-3.5">
            <p className={E.etiqueta}>{k.label}</p>
            <p className={`text-xl font-semibold mt-0.5 ${k.fuerte ? 'text-feisen-azul' : 'text-feisen-texto'}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      <HuelleroQuincena periodo={periodo} liqs={liqs} empleados={empleados} cerrada={cerrada} onActualizado={cargar} />

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex border border-feisen-borde rounded-lg p-0.5 bg-white self-start">
          {[['', 'Todos'], ...Object.entries(MODALIDADES).map(([k, m]) => [k, m.label])].map(([k, label]) => (
            <button key={k} onClick={() => setFMod(k)}
              className={`px-2.5 py-1.5 rounded-md text-sm transition-colors ${fMod === k ? 'bg-feisen-azul-suave text-feisen-azul font-medium' : 'text-feisen-texto-2 hover:text-feisen-texto'}`}>
              {label} <span className="text-xs text-feisen-gris-medio">{(k ? liqs.filter(l => l.modalidad === k) : liqs).length}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search {...E.ICONO} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar persona" className={`${E.input} pl-9`} />
        </div>
      </div>

      {/* Planilla */}
      <div className={`${E.tarjeta} overflow-hidden`}>
        <div className={`hidden md:grid ${columnas} gap-4 px-5 py-2 border-b border-feisen-borde-suave text-xs font-medium text-feisen-gris-medio`}>
          <span>Colaborador</span><span>Detalle</span><span className="text-right">Devengado</span><span className="text-right">Deducciones</span><span className="text-right">A pagar</span><span />
        </div>
        {filas.length === 0
          ? <p className="px-5 py-6 text-sm text-feisen-gris-medio text-center">No hay personas en esta vista.</p>
          : <div className="divide-y divide-feisen-borde-suave">
              {filas.map(l => {
                const m = MODALIDADES[l.modalidad]
                return (
                  <button key={l.id} onClick={() => navigate(`/rrhh/nomina/${periodoId}/${l.id}`)}
                    className={`w-full grid grid-cols-[minmax(0,1fr)_auto] ${columnas} gap-x-4 gap-y-0.5 items-center px-5 py-2.5 hover:bg-feisen-fondo text-left`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar e={l.emp} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-feisen-texto truncate">{nombreCompleto(l.emp)}</p>
                        <p className="text-xs text-feisen-gris-medio truncate flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${m?.punto}`} /> {m?.label}{l.emp?.area && ` · ${l.emp.area}`}
                        </p>
                      </div>
                    </div>
                    <span className="hidden md:flex items-center gap-1.5 text-sm text-feisen-texto-2 truncate">
                      {detalle(l)}
                      {huelleroPendiente(l) && <span title="El huellero sugiere horas adicionales distintas a las registradas" className="inline-flex items-center gap-0.5 text-xs text-feisen-azul"><Fingerprint size={12} strokeWidth={1.8} /> {(Number(l.huellero.horas_extra) + Number(l.huellero.horas_recargo)).toLocaleString('es-CO')} h</span>}
                      {sinValor(l) && <AlertTriangle size={13} strokeWidth={1.8} className="text-amber-500 flex-shrink-0" />}
                    </span>
                    <span className="hidden md:block text-sm text-right text-feisen-texto-2">{formatoPesos(l.total_devengado)}</span>
                    <span className="hidden md:block text-sm text-right text-feisen-texto-2">{formatoPesos(l.total_deducciones)}</span>
                    <span className="text-sm text-right font-medium text-feisen-texto">{formatoPesos(l.neto)}</span>
                    <ChevronRight size={16} strokeWidth={1.8} className="hidden md:block text-feisen-gris-medio justify-self-end" />
                    <p className="md:hidden col-span-2 pl-11 text-xs text-feisen-texto-2 truncate">{detalle(l)}</p>
                  </button>
                )
              })}
            </div>}
      </div>
      <p className="text-xs text-feisen-gris-medio flex items-center gap-1.5">
        <AlertTriangle size={12} strokeWidth={1.8} className="text-amber-500" /> Falta un valor (día, fijo o tarifa de alguna pieza): revísalo antes de cerrar.
        <Fingerprint size={12} strokeWidth={1.8} className="text-feisen-azul ml-3" /> Horas adicionales que sugiere el huellero y aún no se han aplicado.
      </p>

      {!cerrada && (
        <div className={E.tarjeta}>
          <div className={E.cabTarjeta}><h2 className={E.tituloTarj}><UserPlus {...E.ICONO} className={E.iconoTitulo} /> Agregar persona</h2></div>
          <div className="px-5 py-4 flex gap-2">
            <select value={agregar} onChange={e => setAgregar(e.target.value)} className={`${E.input} flex-1`}>
              <option value="">{fuera.length ? 'Seleccionar…' : 'Todos los activos ya están'}</option>
              {fuera.map(e => <option key={e.id} value={e.id}>{nombreCompleto(e)}</option>)}
            </select>
            <button onClick={agregarPersona} disabled={!agregar || trabajando} className={E.btnPrimario}>Agregar</button>
          </div>
        </div>
      )}
    </div>
  )
}
