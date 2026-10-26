import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { exportarNominaQuincena } from '../../../utils/exportExcel'
import Spinner from '../../shared/Spinner'
import Alerta from '../../shared/Alerta'
import Modal from '../../shared/Modal'
import { ArrowLeft, Download, Lock, Unlock, ChevronRight, UserPlus, Search, AlertTriangle, FileText, Fingerprint, CalendarRange, CheckCircle2, Mail, MailX, Send } from 'lucide-react'
import * as E from '../estilos'
import { nombreCompleto, iniciales, formatoPesos, urlsFirmadas } from '../catalogosRRHH'
import { MODALIDADES, diasLaborales, calcularTotales } from './nominaCalculo'
import HuelleroQuincena from './HuelleroQuincena'
import { generarDesprendibles, desprendibleBase64, nombreArchivoDesprendible } from '../../../utils/desprendiblePagoPDF'
import { nombreQuincena, contextoQuincena, liquidacionSugerida, cambiarQuincena, rangoQuincena, CAMPOS_PAGO_EMPLEADO } from './nominaQuincena'

// Planilla de una quincena: todas las personas con lo que se les paga
export default function PeriodoNomina() {
  const { periodoId } = useParams()
  const navigate = useNavigate()
  const { perfil, esAdmin } = useAuth()
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
  const [editFechas, setEditFechas] = useState(null)   // { anio, mes, quincena } mientras se edita
  const [envio,      setEnvio]      = useState(null)   // { hechos, total, errores[] } mientras se envían correos

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
  // borrador → cerrada (RRHH) → aprobada (gerencia). Cerrada o aprobada = solo lectura.
  const cerrada = !!periodo && periodo.estado !== 'borrador'
  const aprobada = periodo?.estado === 'aprobada'
  const correoDe = (e) => (e?.email_corporativo || e?.email_personal || '').trim()
  const fuera = empleados.filter(e => e.estado !== 'retirado' && !liqs.some(l => l.empleado_id === e.id))

  async function cambiarEstado() {
    const cerrar = periodo.estado === 'borrador'
    if (!window.confirm(cerrar
      ? '¿Cerrar la quincena? Ya no se podrá editar (se puede reabrir después).'
      : '¿Reabrir la quincena para hacer cambios?')) return
    const { data, error } = await supabase.from('nomina_periodos')
      .update(cerrar ? { estado: 'cerrada', cerrada_por: perfil?.id, cerrada_en: new Date().toISOString() } : { estado: 'borrador', cerrada_por: null, cerrada_en: null })
      .eq('id', periodoId).select('*').single()
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setPeriodo(data)
  }

  // ── Aprobación de gerencia y envío de desprendibles ──
  async function aprobarYEnviar() {
    const conCorreo = liqs.filter(l => correoDe(empPorId.get(l.empleado_id)))
    const sinCorreo = liqs.filter(l => !correoDe(empPorId.get(l.empleado_id)))
    if (!window.confirm(`¿Aprobar la nómina ${nombreQuincena(periodo).toLowerCase()}?\n\n`
      + `Se enviará el desprendible por correo a ${conCorreo.length} persona${conCorreo.length === 1 ? '' : 's'}.`
      + (sinCorreo.length ? `\n${sinCorreo.length} no tiene${sinCorreo.length === 1 ? '' : 'n'} correo en la ficha: ${sinCorreo.map(l => nombreCompleto(empPorId.get(l.empleado_id))).join(', ')}.` : '')
      + '\n\nDespués de aprobada, nadie de RRHH puede modificarla.')) return
    setMsg(null)
    const { data, error } = await supabase.from('nomina_periodos')
      .update({ estado: 'aprobada', aprobada_por: perfil?.id, aprobada_en: new Date().toISOString() })
      .eq('id', periodoId).select('*').single()
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setPeriodo(data)
    await enviarDesprendibles(conCorreo.filter(l => !l.email_enviado_en), data)
  }

  async function desaprobar() {
    if (!window.confirm('¿Quitar la aprobación? La quincena vuelve a "cerrada" y RRHH podrá reabrirla. Los correos ya enviados no se recuperan.')) return
    const { data, error } = await supabase.from('nomina_periodos')
      .update({ estado: 'cerrada', aprobada_por: null, aprobada_en: null }).eq('id', periodoId).select('*').single()
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setPeriodo(data)
  }

  // Envía uno por uno (cada correo lleva su PDF) y deja el estado en cada liquidación
  async function enviarDesprendibles(lista, per = periodo) {
    if (!lista.length) { setMsg({ tipo: 'info', texto: 'No hay desprendibles pendientes por enviar.' }); return }
    const { data: pzs } = await supabase.from('nomina_piezas').select('liquidacion_id, descripcion, cantidad, valor_unitario').in('liquidacion_id', lista.map(l => l.id))
    const errores = []
    setEnvio({ hechos: 0, total: lista.length, errores })
    for (const [i, l] of lista.entries()) {
      const emp = empPorId.get(l.empleado_id)
      const doc = {
        ...l, nombre: nombreCompleto(emp), documento: `${emp?.tipo_documento || ''} ${emp?.numero_documento || ''}`.trim(),
        cargo: emp?.cargo, area: emp?.area, tipo_contrato: emp?.tipo_contrato, piezas: (pzs || []).filter(p => p.liquidacion_id === l.id),
      }
      try {
        const { error } = await supabase.functions.invoke('enviar-desprendible', {
          body: {
            liquidacion_id: l.id, para: correoDe(emp), nombre: doc.nombre, periodo: nombreQuincena(per),
            pdf_base64: desprendibleBase64(doc, nombreQuincena(per)), nombre_archivo: nombreArchivoDesprendible(doc, per),
          },
        })
        if (error) {
          let detalle = error.message
          try { detalle = (await error.context?.json())?.error || detalle } catch { /* sin detalle */ }
          throw new Error(detalle)
        }
      } catch (err) {
        errores.push(`${doc.nombre}: ${err.message}`)
      }
      setEnvio({ hechos: i + 1, total: lista.length, errores })
    }
    setEnvio(null)
    setMsg(errores.length
      ? { tipo: 'error', texto: `Se enviaron ${lista.length - errores.length} de ${lista.length}. Fallaron: ${errores.join(' · ')}` }
      : { tipo: 'exito', texto: `Se enviaron los ${lista.length} desprendibles por correo.` })
    await cargar()
  }

  // Mover la quincena a otras fechas (solo en borrador)
  async function moverQuincena(destino, { desdeHuellero = false } = {}) {
    setTrabajando(true); setMsg(null)
    try {
      await cambiarQuincena(periodo, destino)
      setEditFechas(null)
      setMsg({ tipo: 'exito', texto: desdeHuellero
        ? 'Fechas actualizadas y días de los de "al día" recalculados. El archivo del huellero se está cargando.'
        : 'Fechas actualizadas. Se recalcularon los días de los de "al día"; si tenías un archivo de huellero, vuelve a cargarlo.' })
      await cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    }
    setTrabajando(false)
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
  // Con correo y sin desprendible enviado (para "Enviar pendientes")
  const pendientesEnvio = liqs.filter(l => !l.email_enviado_en && correoDe(empPorId.get(l.empleado_id)))
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
            {aprobada
              ? <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 size={12} strokeWidth={1.8} /> Aprobada por gerencia</span>
              : cerrada
              ? <span className="inline-flex items-center gap-1"><Lock size={12} strokeWidth={1.8} /> Cerrada · pendiente de aprobación de gerencia</span>
              : <span className="text-amber-600">En borrador</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!cerrada && (
            <button onClick={() => setEditFechas({ anio: periodo.anio, mes: periodo.mes, quincena: periodo.quincena })} className={E.btnSecundario}>
              <CalendarRange {...E.ICONO} /> Cambiar fechas
            </button>
          )}
          <button onClick={desprendibles} disabled={!filas.length} className={E.btnSecundario} title="Un PDF con el desprendible de cada persona de la vista">
            <FileText {...E.ICONO} /> Desprendibles
          </button>
          <button onClick={exportar} className={E.btnSecundario}><Download {...E.ICONO} /> Excel</button>
          {!aprobada && (
            <button onClick={cambiarEstado} disabled={!!envio} className={cerrada ? E.btnSecundario : E.btnPrimario}>
              {cerrada ? <><Unlock {...E.ICONO} /> Reabrir</> : <><Lock {...E.ICONO} /> Cerrar quincena</>}
            </button>
          )}
          {cerrada && !aprobada && esAdmin && (
            <button onClick={aprobarYEnviar} disabled={!!envio} className={E.btnPrimario}>
              <CheckCircle2 {...E.ICONO} /> Aprobar y enviar desprendibles
            </button>
          )}
          {aprobada && esAdmin && pendientesEnvio.length > 0 && (
            <button onClick={() => enviarDesprendibles(pendientesEnvio)} disabled={!!envio} className={E.btnPrimario}>
              <Send {...E.ICONO} /> Enviar pendientes ({pendientesEnvio.length})
            </button>
          )}
          {aprobada && esAdmin && (
            <button onClick={desaprobar} disabled={!!envio} className={E.btnSecundario}>Quitar aprobación</button>
          )}
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
      {envio && (
        <div className={`${E.tarjeta} px-5 py-3`}>
          <p className="text-sm text-feisen-texto">Enviando desprendibles… {envio.hechos} de {envio.total}</p>
          <div className="mt-2 h-1 rounded-full bg-feisen-borde-suave overflow-hidden">
            <div className="h-full bg-feisen-azul transition-all" style={{ width: `${(envio.hechos / envio.total) * 100}%` }} />
          </div>
        </div>
      )}
      {cerrada && !aprobada && !esAdmin && (
        <Alerta tipo="info" mensaje="Quincena cerrada. Falta la aprobación de gerencia; al aprobarla se envía a cada persona su desprendible por correo." />
      )}

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

      <HuelleroQuincena periodo={periodo} liqs={liqs} empleados={empleados} cerrada={cerrada} onActualizado={cargar} onMoverQuincena={moverQuincena} />

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
                    <span className="text-sm text-right font-medium text-feisen-texto inline-flex items-center justify-end gap-1.5">
                      {aprobada && (l.email_enviado_en
                        ? <Mail size={13} strokeWidth={1.8} className="text-green-600" title={`Enviado a ${l.email_enviado_a}`} />
                        : l.email_error
                        ? <MailX size={13} strokeWidth={1.8} className="text-feisen-rojo" title={l.email_error} />
                        : !correoDe(l.emp) && <MailX size={13} strokeWidth={1.8} className="text-feisen-gris-medio" title="Sin correo en la ficha" />)}
                      {formatoPesos(l.neto)}
                    </span>
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

      {editFechas && (
        <Modal titulo="Cambiar fechas de la nómina" onCerrar={() => !trabajando && setEditFechas(null)}>
          <form onSubmit={e => { e.preventDefault(); moverQuincena(editFechas) }} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={E.labelForm}>Año</label>
                <input type="number" value={editFechas.anio} onChange={e => setEditFechas(f => ({ ...f, anio: Number(e.target.value) }))} className={E.input} />
              </div>
              <div>
                <label className={E.labelForm}>Mes</label>
                <select value={editFechas.mes} onChange={e => setEditFechas(f => ({ ...f, mes: Number(e.target.value) }))} className={E.input}>
                  {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((mm, i) => <option key={mm} value={i + 1}>{mm}</option>)}
                </select>
              </div>
              <div>
                <label className={E.labelForm}>Quincena</label>
                <select value={editFechas.quincena} onChange={e => setEditFechas(f => ({ ...f, quincena: Number(e.target.value) }))} className={E.input}>
                  <option value={1}>1 al 15</option>
                  <option value={2}>16 al fin de mes</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-feisen-texto-2">
              Nuevo periodo: {(() => { const r = rangoQuincena(editFechas.anio, editFechas.mes, editFechas.quincena); return `${r.inicio.split('-').reverse().join('/')} al ${r.fin.split('-').reverse().join('/')}` })()}.
              Se recalculan los días sugeridos de los de "al día" y se borra la sugerencia del huellero (corresponde a las fechas anteriores).
              Piezas, valores, anticipos y demás conceptos se conservan.
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={trabajando} onClick={() => setEditFechas(null)} className={`${E.btnSecundario} flex-1`}>Cancelar</button>
              <button type="submit" disabled={trabajando} className={`${E.btnPrimario} flex-1`}>{trabajando ? 'Guardando…' : 'Cambiar fechas'}</button>
            </div>
          </form>
        </Modal>
      )}

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
