import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import Spinner from '../../shared/Spinner'
import Alerta from '../../shared/Alerta'
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, X, RefreshCw, Lock, Trash2, CalendarClock, Package } from 'lucide-react'
import * as E from '../estilos'
import { nombreCompleto, formatoPesos, formatoFecha, TIPOS_NOVEDAD } from '../catalogosRRHH'
import { MODALIDADES, calcularTotales, diasLaborales, diasAusente } from './nominaCalculo'
import { nombreQuincena, contextoQuincena, piezasSugeridas, guardarLiquidacion, CAMPOS_PAGO_EMPLEADO } from './nominaQuincena'

const aTexto = (v) => (v === null || v === undefined ? '' : String(v))

// Campo de dinero: muestra miles con punto y guarda solo dígitos
function Dinero({ value, onChange, disabled, placeholder }) {
  const txt = value === '' || value === null || value === undefined ? '' : Number(String(value).replace(/[^\d]/g, '')).toLocaleString('es-CO')
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-feisen-gris-medio">$</span>
      <input inputMode="numeric" disabled={disabled} value={txt} placeholder={placeholder}
        onChange={e => onChange(e.target.value.replace(/[^\d]/g, ''))} className={`${E.input} pl-7 disabled:bg-feisen-fondo`} />
    </div>
  )
}

function Numero({ value, onChange, disabled, step = '0.5' }) {
  return <input type="number" min="0" step={step} disabled={disabled} value={value ?? ''} onChange={e => onChange(e.target.value)}
    className={`${E.input} disabled:bg-feisen-fondo`} />
}

function Tarjeta({ titulo, icon: Icon, accion, children }) {
  return (
    <div className={E.tarjeta}>
      <div className={E.cabTarjeta}>
        <h2 className={E.tituloTarj}>{Icon && <Icon {...E.ICONO} className={E.iconoTitulo} />} {titulo}</h2>
        {accion}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// Lista editable de conceptos con valor (otros devengos / otras deducciones)
function Conceptos({ lista, onChange, disabled, agregar }) {
  const filas = lista || []
  return (
    <div className="space-y-2">
      {filas.map((o, i) => (
        <div key={i} className="flex gap-2">
          <input value={o.concepto || ''} disabled={disabled} placeholder="Concepto"
            onChange={e => onChange(filas.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)))} className={`${E.input} flex-1 disabled:bg-feisen-fondo`} />
          <div className="w-40"><Dinero value={o.valor} disabled={disabled} onChange={v => onChange(filas.map((x, j) => (j === i ? { ...x, valor: v } : x)))} /></div>
          {!disabled && <button type="button" onClick={() => onChange(filas.filter((_, j) => j !== i))} className="p-2 text-feisen-gris-medio hover:text-feisen-rojo"><X size={15} strokeWidth={1.8} /></button>}
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={() => onChange([...filas, { concepto: '', valor: '' }])} className={`${E.btnTextoAzul} -ml-2.5`}>
          <Plus size={14} strokeWidth={1.8} /> {agregar}
        </button>
      )}
    </div>
  )
}

// Liquidación de una persona en una quincena
export default function LiquidacionPersona() {
  const { periodoId, liqId } = useParams()
  const navigate = useNavigate()
  const [periodo,   setPeriodo]   = useState(null)
  const [emp,       setEmp]       = useState(null)
  const [liq,       setLiq]       = useState(null)
  const [piezas,    setPiezas]    = useState([])
  const [tarifas,   setTarifas]   = useState([])
  const [novedades, setNovedades] = useState([])
  const [orden,     setOrden]     = useState([])     // ids de liquidaciones en orden alfabético (anterior/siguiente)
  const [ncInfo,    setNcInfo]    = useState(null)
  const [cargando,  setCargando]  = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [trayendo,  setTrayendo]  = useState(false)
  const [cambios,   setCambios]   = useState(false)
  const [msg,       setMsg]       = useState(null)

  useEffect(() => { cargar() }, [liqId])

  async function cargar() {
    setCargando(true); setMsg(null); setCambios(false); setNcInfo(null)
    const [{ data: l, error }, { data: pz }, { data: p }, { data: tfs }, { data: todas }] = await Promise.all([
      supabase.from('nomina_liquidaciones').select('*').eq('id', liqId).single(),
      supabase.from('nomina_piezas').select('*').eq('liquidacion_id', liqId),
      supabase.from('nomina_periodos').select('*').eq('id', periodoId).single(),
      supabase.from('nomina_tarifas').select('id, item_id, descripcion, valor, activo, items(nombre)').eq('activo', true),
      supabase.from('nomina_liquidaciones').select('id, empleado_id').eq('periodo_id', periodoId),
    ])
    if (error) { setMsg({ tipo: 'error', texto: error.message }); setCargando(false); return }
    const [{ data: e }, { data: novs }, { data: nombres }] = await Promise.all([
      supabase.from('empleados').select(CAMPOS_PAGO_EMPLEADO).eq('id', l.empleado_id).single(),
      supabase.from('novedades').select('*').eq('empleado_id', l.empleado_id).lte('fecha_inicio', p.fecha_fin).gte('fecha_fin', p.fecha_inicio),
      supabase.from('empleados').select('id, nombres, apellidos').in('id', (todas || []).map(t => t.empleado_id)),
    ])
    const nom = new Map((nombres || []).map(n => [n.id, nombreCompleto(n)]))
    setOrden((todas || []).sort((a, b) => (nom.get(a.empleado_id) || '').localeCompare(nom.get(b.empleado_id) || '')).map(t => t.id))
    setLiq({
      ...l,
      dias: aTexto(l.dias), valor_dia: aTexto(l.valor_dia), horas_extra: aTexto(l.horas_extra), valor_hora_extra: aTexto(l.valor_hora_extra),
      valor_fijo: aTexto(l.valor_fijo), auxilio: aTexto(l.auxilio), subsidio_ss: aTexto(l.subsidio_ss),
      descuento_tiempo_pieza: aTexto(l.descuento_tiempo_pieza), seguridad: aTexto(l.seguridad), anticipo: aTexto(l.anticipo),
      dotacion_herramienta: aTexto(l.dotacion_herramienta), observaciones: l.observaciones || '',
    })
    setPiezas((pz || []).map(x => ({ ...x, cantidad: aTexto(x.cantidad), valor_unitario: aTexto(x.valor_unitario) })))
    setPeriodo(p)
    setEmp(e)
    setTarifas((tfs || []).map(t => ({ ...t, nombre: t.items?.nombre || t.descripcion })))
    setNovedades((novs || []).filter(n => n.fecha_fin >= p.fecha_inicio && n.fecha_inicio <= p.fecha_fin))
    setCargando(false)
  }

  const cerrada = periodo?.estado === 'cerrada'
  const totales = useMemo(() => (liq ? calcularTotales(liq, piezas) : null), [liq, piezas])
  const set = (k) => (v) => { setLiq(l => ({ ...l, [k]: v })); setCambios(true) }
  const setPieza = (i, cambiosPieza) => { setPiezas(ps => ps.map((p, j) => (j === i ? { ...p, ...cambiosPieza } : p))); setCambios(true) }

  // Al escribir una pieza que coincide con una tarifa, se toma su valor
  function elegirPieza(i, texto) {
    const t = tarifas.find(x => x.nombre === texto)
    setPieza(i, t ? { descripcion: texto, item_id: t.item_id, valor_unitario: String(t.valor) } : { descripcion: texto, item_id: null })
  }

  async function traerProduccion() {
    setTrayendo(true); setMsg(null)
    try {
      const ctx = await contextoQuincena(periodo.fecha_inicio, periodo.fecha_fin)
      const nuevas = piezasSugeridas(emp.id, ctx).map(p => ({ ...p, cantidad: String(p.cantidad), valor_unitario: String(p.valor_unitario) }))
      const nc = ctx.grupos.filter(g => g.empleado_id === emp.id && g.nc > 0)
      setNcInfo(nc)
      // Se reemplazan las líneas que venían de producción; las manuales se conservan
      setPiezas(ps => [...ps.filter(p => p.origen === 'manual'), ...nuevas])
      setCambios(true)
      setMsg({ tipo: nuevas.length ? 'exito' : 'info', texto: nuevas.length
        ? `${nuevas.length} referencia${nuevas.length === 1 ? '' : 's'} traída${nuevas.length === 1 ? '' : 's'} de producción. Revisa y guarda.`
        : 'No hay producción registrada a nombre de esta persona en la quincena. Si aparece con otro nombre, vincúlalo en "Producción sin colaborador" de la planilla.' })
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    }
    setTrayendo(false)
  }

  function recalcularDias() {
    const lab = diasLaborales(periodo.fecha_inicio, periodo.fecha_fin)
    set('dias')(String(Math.max(0, lab - diasAusente(novedades, periodo.fecha_inicio, periodo.fecha_fin))))
  }

  async function guardar(irA) {
    setGuardando(true); setMsg(null)
    try {
      await guardarLiquidacion(liqId, liq, piezas)
      setCambios(false)
      if (irA) navigate(irA)
      else setMsg({ tipo: 'exito', texto: 'Liquidación guardada.' })
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    }
    setGuardando(false)
  }

  async function quitar() {
    if (!window.confirm(`¿Quitar a ${nombreCompleto(emp)} de esta quincena?`)) return
    const { error } = await supabase.from('nomina_liquidaciones').delete().eq('id', liqId)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    navigate(`/rrhh/nomina/${periodoId}`)
  }

  function ir(destino) {
    if (cambios && !cerrada) {
      if (window.confirm('Tienes cambios sin guardar. ¿Guardarlos antes de salir?')) { guardar(destino); return }
    }
    navigate(destino)
  }

  if (cargando) return <Spinner />
  if (!liq || !emp) return (
    <div className="max-w-6xl mx-auto space-y-4">
      <button onClick={() => navigate(`/rrhh/nomina/${periodoId}`)} className={`${E.btnTexto} -ml-2.5`}><ArrowLeft {...E.ICONO} /> Planilla</button>
      <Alerta tipo="error" mensaje={msg?.texto || 'No se encontró la liquidación.'} />
    </div>
  )

  const pos = orden.indexOf(liqId)
  const anterior = pos > 0 ? orden[pos - 1] : null
  const siguiente = pos >= 0 && pos < orden.length - 1 ? orden[pos + 1] : null
  const lab = diasLaborales(periodo.fecha_inicio, periodo.fecha_fin)
  const aus = diasAusente(novedades, periodo.fecha_inicio, periodo.fecha_fin)
  const m = liq.modalidad
  const fila = 'grid grid-cols-1 sm:grid-cols-3 gap-3'
  const L = ({ children }) => <label className={E.labelForm}>{children}</label>

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => ir(`/rrhh/nomina/${periodoId}`)} className={`${E.btnTexto} -ml-2.5`}><ArrowLeft {...E.ICONO} /> {nombreQuincena(periodo)}</button>
        <div className="flex items-center gap-1">
          <button disabled={!anterior} onClick={() => ir(`/rrhh/nomina/${periodoId}/${anterior}`)} title="Anterior" className="p-1.5 rounded-lg text-feisen-texto-2 hover:bg-white disabled:opacity-30"><ChevronLeft size={16} strokeWidth={1.8} /></button>
          <span className="text-xs text-feisen-gris-medio">{pos + 1} de {orden.length}</span>
          <button disabled={!siguiente} onClick={() => ir(`/rrhh/nomina/${periodoId}/${siguiente}`)} title="Siguiente" className="p-1.5 rounded-lg text-feisen-texto-2 hover:bg-white disabled:opacity-30"><ChevronRight size={16} strokeWidth={1.8} /></button>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>{nombreCompleto(emp)}</h1>
          <p className={E.subtituloPagina}>{emp.cargo || 'Sin cargo'}{emp.area && ` · ${emp.area}`} · {emp.tipo_documento} {emp.numero_documento}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={E.etiqueta}>Forma de pago</span>
          <select value={m} disabled={cerrada} onChange={e => set('modalidad')(e.target.value)} className={`${E.input} w-40 disabled:bg-feisen-fondo`}>
            {Object.entries(MODALIDADES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
          </select>
        </div>
      </div>

      {cerrada && <Alerta tipo="info" mensaje="La quincena está cerrada: solo lectura. Para cambiar algo, reábrela desde la planilla." />}
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 w-full space-y-4">
          {/* Destajo: piezas */}
          {(m === 'destajo' || piezas.length > 0) && (
            <Tarjeta titulo="Piezas (destajo)" icon={Package} accion={!cerrada && (
              <button onClick={traerProduccion} disabled={trayendo} className={`${E.btnTextoAzul} -mr-2`}>
                <RefreshCw size={14} strokeWidth={1.8} className={trayendo ? 'animate-spin' : ''} /> Traer de producción
              </button>
            )}>
              <datalist id="tarifas-destajo">{tarifas.map(t => <option key={t.id} value={t.nombre} />)}</datalist>
              {piezas.length > 0 && (
                <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_6rem_9rem_8rem_2rem] gap-2 mb-1.5 text-xs text-feisen-gris-medio">
                  <span>Pieza</span><span>Cantidad</span><span>Valor pieza</span><span className="text-right">Subtotal</span><span />
                </div>
              )}
              <div className="space-y-2">
                {piezas.map((p, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_6rem_9rem_8rem_2rem] gap-2 items-center">
                    <div className="col-span-2 sm:col-span-1 min-w-0">
                      <input list="tarifas-destajo" value={p.descripcion} disabled={cerrada} placeholder="Pieza o trabajo"
                        onChange={e => elegirPieza(i, e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} />
                      {p.origen !== 'manual' && <p className="text-[11px] text-feisen-gris-medio mt-0.5">De producción ({p.origen})</p>}
                    </div>
                    <Numero value={p.cantidad} disabled={cerrada} step="1" onChange={v => setPieza(i, { cantidad: v })} />
                    <div>
                      <Dinero value={p.valor_unitario} disabled={cerrada} onChange={v => setPieza(i, { valor_unitario: v })} />
                      {!Number(p.valor_unitario) && <p className="text-[11px] text-amber-600 mt-0.5">Sin tarifa</p>}
                    </div>
                    <span className="text-sm text-right text-feisen-texto">{formatoPesos((Number(p.cantidad) || 0) * (Number(p.valor_unitario) || 0))}</span>
                    {!cerrada && <button type="button" onClick={() => { setPiezas(ps => ps.filter((_, j) => j !== i)); setCambios(true) }} className="p-2 text-feisen-gris-medio hover:text-feisen-rojo justify-self-end"><X size={15} strokeWidth={1.8} /></button>}
                  </div>
                ))}
              </div>
              {!cerrada && (
                <button type="button" onClick={() => { setPiezas(ps => [...ps, { descripcion: '', cantidad: '', valor_unitario: '', item_id: null, origen: 'manual' }]); setCambios(true) }}
                  className={`${E.btnTextoAzul} -ml-2.5 mt-2`}>
                  <Plus size={14} strokeWidth={1.8} /> Agregar pieza
                </button>
              )}
              {ncInfo && ncInfo.length > 0 && (
                <p className="mt-3 text-xs text-amber-700 border-t border-feisen-borde-suave pt-2">
                  No conformes registradas en la quincena: {ncInfo.map(g => `${g.nc} ${g.item_nombre}`).join(', ')}. Si se descuentan, ponlo en "Descuento por tiempo o pieza dañada".
                </p>
              )}
            </Tarjeta>
          )}

          {/* Al día */}
          {m === 'dia' && (
            <Tarjeta titulo="Días trabajados" icon={CalendarClock}>
              <div className={fila}>
                <div><L>Días</L><Numero value={liq.dias} disabled={cerrada} onChange={set('dias')} /></div>
                <div><L>Valor del día</L><Dinero value={liq.valor_dia} disabled={cerrada} onChange={set('valor_dia')} /></div>
                <div className="flex items-end"><p className="text-sm text-feisen-texto py-2">= {formatoPesos((Number(liq.dias) || 0) * (Number(liq.valor_dia) || 0))}</p></div>
              </div>
              <p className="text-xs text-feisen-gris-medio mt-2">
                La quincena tiene {lab} días laborales (lunes a viernes sin festivos){aus > 0 && `; ${aus} con novedad no remunerada`}.
                {!cerrada && <> <button onClick={recalcularDias} className="text-feisen-azul hover:underline">Usar {Math.max(0, lab - aus)} días</button></>}
              </p>
            </Tarjeta>
          )}

          {/* Fijo */}
          {m === 'fijo' && (
            <Tarjeta titulo="Valor fijo de la quincena">
              <div className={fila}>
                <div><L>Valor quincena</L><Dinero value={liq.valor_fijo} disabled={cerrada} onChange={set('valor_fijo')} /></div>
              </div>
              {aus > 0 && <p className="text-xs text-amber-700 mt-2">Tuvo {aus} día{aus === 1 ? '' : 's'} laboral{aus === 1 ? '' : 'es'} con novedad no remunerada en la quincena; ajusta el valor si corresponde.</p>}
            </Tarjeta>
          )}

          {/* Otros devengos */}
          <Tarjeta titulo="Otros devengos">
            <div className={fila}>
              <div><L>Horas extra</L><Numero value={liq.horas_extra} disabled={cerrada} onChange={set('horas_extra')} /></div>
              <div><L>Valor hora extra</L><Dinero value={liq.valor_hora_extra} disabled={cerrada} onChange={set('valor_hora_extra')} /></div>
              <div className="flex items-end"><p className="text-sm text-feisen-texto py-2">= {formatoPesos((Number(liq.horas_extra) || 0) * (Number(liq.valor_hora_extra) || 0))}</p></div>
              <div><L>Auxilio de la quincena</L><Dinero value={liq.auxilio} disabled={cerrada} onChange={set('auxilio')} /></div>
              <div><L>Subsidio a seguridad social</L><Dinero value={liq.subsidio_ss} disabled={cerrada} onChange={set('subsidio_ss')} /></div>
              <div><L>Descuento por tiempo o pieza dañada</L><Dinero value={liq.descuento_tiempo_pieza} disabled={cerrada} onChange={set('descuento_tiempo_pieza')} /></div>
            </div>
            <div className="mt-4">
              <L>Otros (bonificaciones, piezas varias…)</L>
              <Conceptos lista={liq.otros_devengos} disabled={cerrada} agregar="Agregar devengo" onChange={set('otros_devengos')} />
            </div>
          </Tarjeta>

          {/* Deducciones */}
          <Tarjeta titulo="Deducciones">
            <div className={fila}>
              <div><L>Seguridad social (planilla)</L><Dinero value={liq.seguridad} disabled={cerrada} onChange={set('seguridad')} /></div>
              <div><L>Anticipo</L><Dinero value={liq.anticipo} disabled={cerrada} onChange={set('anticipo')} /></div>
              <div><L>Dotación / herramienta</L><Dinero value={liq.dotacion_herramienta} disabled={cerrada} onChange={set('dotacion_herramienta')} /></div>
            </div>
            <div className="mt-4">
              <L>Otras deducciones</L>
              <Conceptos lista={liq.otras_deducciones} disabled={cerrada} agregar="Agregar deducción" onChange={set('otras_deducciones')} />
            </div>
          </Tarjeta>

          <Tarjeta titulo="Observaciones">
            <textarea rows={2} disabled={cerrada} value={liq.observaciones} onChange={e => set('observaciones')(e.target.value)} className={`${E.input} disabled:bg-feisen-fondo`} />
          </Tarjeta>
        </div>

        {/* Resumen */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-4 lg:sticky lg:top-6">
          <div className={E.tarjeta}>
            <div className="px-5 py-4 space-y-2 text-sm">
              {totales.total_piezas > 0 && <div className="flex justify-between text-feisen-texto-2"><span>Piezas</span><span>{formatoPesos(totales.total_piezas)}</span></div>}
              <div className="flex justify-between text-feisen-texto"><span>Total devengado</span><span>{formatoPesos(totales.total_devengado)}</span></div>
              <div className="flex justify-between text-feisen-texto"><span>Total deducciones</span><span>− {formatoPesos(totales.total_deducciones)}</span></div>
              <div className="flex justify-between border-t border-feisen-borde-suave pt-2 text-base font-semibold text-feisen-azul"><span>A pagar</span><span>{formatoPesos(totales.neto)}</span></div>
              {totales.neto < 0 && <p className="text-xs text-feisen-rojo">El total a pagar es negativo: revisa anticipos y deducciones.</p>}
            </div>
            {!cerrada && (
              <div className="px-5 pb-4 space-y-2">
                <button onClick={() => guardar()} disabled={guardando || !cambios} className={`${E.btnPrimario} w-full`}>{guardando ? 'Guardando…' : cambios ? 'Guardar' : 'Guardado'}</button>
                {siguiente && <button onClick={() => (cambios ? guardar(`/rrhh/nomina/${periodoId}/${siguiente}`) : navigate(`/rrhh/nomina/${periodoId}/${siguiente}`))} disabled={guardando} className={`${E.btnSecundario} w-full`}>
                  {cambios ? 'Guardar y siguiente' : 'Siguiente persona'} <ChevronRight size={15} strokeWidth={1.8} />
                </button>}
              </div>
            )}
            {cerrada && <p className="px-5 pb-4 text-xs text-feisen-gris-medio flex items-center gap-1.5"><Lock size={12} strokeWidth={1.8} /> Quincena cerrada</p>}
          </div>

          {novedades.length > 0 && (
            <div className={E.tarjeta}>
              <div className={E.cabTarjeta}><h2 className={E.tituloTarj}><CalendarClock {...E.ICONO} className={E.iconoTitulo} /> Novedades en la quincena</h2></div>
              <div className="px-5 py-3 space-y-1.5">
                {novedades.map(n => (
                  <p key={n.id} className="text-xs text-feisen-texto-2 flex items-start gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${TIPOS_NOVEDAD[n.tipo]?.punto}`} />
                    <span>{TIPOS_NOVEDAD[n.tipo]?.label}{n.subtipo && ` · ${n.subtipo}`} — {formatoFecha(n.fecha_inicio)}{n.fecha_fin !== n.fecha_inicio && ` al ${formatoFecha(n.fecha_fin)}`}
                      {n.remunerado === true && ' (remunerado)'}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {!cerrada && (
            <button onClick={quitar} className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-feisen-gris-medio hover:text-feisen-rojo py-1.5">
              <Trash2 size={14} strokeWidth={1.8} /> Quitar de esta quincena
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
