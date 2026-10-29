import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import Spinner from '../../shared/Spinner'
import Alerta from '../../shared/Alerta'
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, X, Lock, Trash2, CalendarClock, Package, Fingerprint, FileText, ChevronDown } from '../../shared/iconos'
import * as E from '../estilos'
import { nombreCompleto, formatoPesos, formatoFecha, TIPOS_NOVEDAD } from '../catalogosRRHH'
import { MODALIDADES, calcularTotales, diasLaborales, diasAusente, valorHorasRecargo, esContratista, etiquetasPago, valoresHora, valorDiaBase } from './nominaCalculo'
import { generarDesprendibles } from '../../../utils/desprendiblePagoPDF'
import { nombreQuincena, guardarLiquidacion, CAMPOS_PAGO_EMPLEADO } from './nominaQuincena'

const aTexto = (v) => (v === null || v === undefined ? '' : String(v))
const fmtH = (h) => Number(h || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })

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
  const [verDias,   setVerDias]   = useState(false)
  const [cargando,  setCargando]  = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [cambios,   setCambios]   = useState(false)
  const [msg,       setMsg]       = useState(null)

  useEffect(() => { cargar() }, [liqId])

  async function cargar() {
    setCargando(true); setMsg(null); setCambios(false); setVerDias(false)
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
      horas_extra_recargo: aTexto(l.horas_extra_recargo), valor_hora_recargo: aTexto(l.valor_hora_recargo),
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

  const cerrada = !!periodo && periodo.estado !== 'borrador'   // cerrada o aprobada: solo lectura
  const totales = useMemo(() => (liq ? calcularTotales(liq, piezas) : null), [liq, piezas])
  // Al cambiar el valor del día (o el fijo) se recalculan los valores hora: día ÷ 8,4 × 1,25 y × 2
  const set = (k) => (v) => {
    setLiq(l => {
      const nl = { ...l, [k]: v }
      if (k === 'valor_dia' || k === 'valor_fijo' || k === 'modalidad') {
        const h = valoresHora(valorDiaBase(nl.modalidad, nl.valor_dia, nl.valor_fijo))
        if (h.extra) { nl.valor_hora_extra = String(h.extra); nl.valor_hora_recargo = String(h.recargo) }
      }
      return nl
    })
    setCambios(true)
  }
  const setPieza = (i, cambiosPieza) => { setPiezas(ps => ps.map((p, j) => (j === i ? { ...p, ...cambiosPieza } : p))); setCambios(true) }

  // Al escribir una pieza que coincide con una tarifa, se toma su valor
  function elegirPieza(i, texto) {
    const t = tarifas.find(x => x.nombre === texto)
    setPieza(i, t ? { descripcion: texto, item_id: t.item_id, valor_unitario: String(t.valor) } : { descripcion: texto, item_id: null })
  }

  // Aplica lo que sugiere el huellero (RRHH ya verificó que la extra está autorizada)
  function aplicarHuellero(que) {
    const h = liq.huellero
    if (que === 'horas') { set('horas_extra')(String(h.horas_extra || '')); set('horas_extra_recargo')(String(h.horas_recargo || '')) }
    if (que === 'dias') set('dias')(String(h.dias_trabajados))
  }

  function desprendible() {
    generarDesprendibles([{
      ...liq, ...totales, nombre: nombreCompleto(emp), documento: `${emp.tipo_documento || ''} ${emp.numero_documento || ''}`.trim(),
      cargo: emp.cargo, area: emp.area, tipo_contrato: emp.tipo_contrato, piezas,
    }], nombreQuincena(periodo), `desprendible_${nombreCompleto(emp).replace(/\s+/g, '_')}_${periodo.anio}_${String(periodo.mes).padStart(2, '0')}_q${periodo.quincena}`)
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
  const T = etiquetasPago(esContratista(emp, m))
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

      {cerrada && <Alerta tipo="info" mensaje={periodo.estado === 'aprobada'
        ? 'La quincena está aprobada por gerencia: solo lectura.'
        : 'La quincena está cerrada: solo lectura. Para cambiar algo, reábrela desde la planilla.'} />}
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 w-full space-y-4">
          {/* Destajo: piezas */}
          {(m === 'destajo' || piezas.length > 0) && (
            <Tarjeta titulo="Piezas (destajo)" icon={Package}>
              {piezas.length === 0 && <p className="text-xs text-feisen-gris-medio mb-2">Agrega las piezas de la quincena; al escribir una pieza con tarifa, su valor se llena solo.</p>}
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

          {/* Huellero: solo sugerencia */}
          {liq.huellero && (
            <Tarjeta titulo="Huellero (sugerido)" icon={Fingerprint} accion={
              <button onClick={() => setVerDias(v => !v)} className={`${E.btnTexto} -mr-2`}>
                Ver días <ChevronDown size={14} strokeWidth={1.8} className={`transition-transform ${verDias ? 'rotate-180' : ''}`} />
              </button>
            }>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span><span className="text-feisen-gris-medio">{T.extra}:</span> <strong className="text-feisen-texto">{fmtH(liq.huellero.horas_extra)} h</strong></span>
                <span><span className="text-feisen-gris-medio">Domingo/festivo:</span> <strong className="text-feisen-texto">{fmtH(liq.huellero.horas_recargo)} h</strong></span>
                <span><span className="text-feisen-gris-medio">Días hábiles con marcación:</span> <strong className="text-feisen-texto">{liq.huellero.dias_trabajados}</strong></span>
                {liq.huellero.incompletos > 0 && <span className="text-amber-600">{liq.huellero.incompletos} día{liq.huellero.incompletos === 1 ? '' : 's'} con una sola marcación</span>}
              </div>
              <p className="text-xs text-feisen-gris-medio mt-2">Verifica que las horas estuvieran autorizadas antes de aplicarlas. Nombre en el huellero: {liq.huellero.nombre_huellero}.</p>
              {!cerrada && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => aplicarHuellero('horas')} className={E.btnSecundario}>{T.aplicar}</button>
                  {m === 'dia' && <button onClick={() => aplicarHuellero('dias')} className={E.btnSecundario}>Usar {liq.huellero.dias_trabajados} días</button>}
                </div>
              )}
              {verDias && (
                <div className="mt-3 border border-feisen-borde-suave rounded-lg overflow-x-auto">
                  <table className="w-full text-xs min-w-[520px]">
                    <thead><tr className="text-left text-feisen-gris-medio border-b border-feisen-borde-suave">
                      <th className="font-medium px-3 py-1.5">Fecha</th><th className="font-medium px-3 py-1.5">Día</th>
                      <th className="font-medium px-3 py-1.5">Entrada</th><th className="font-medium px-3 py-1.5">Salida</th>
                      <th className="font-medium px-3 py-1.5 text-right">{T.extra}</th><th className="font-medium px-3 py-1.5 text-right">Dom/fest</th>
                    </tr></thead>
                    <tbody className="divide-y divide-feisen-borde-suave">
                      {liq.huellero.dias.map(d => (
                        <tr key={d.fecha} className={d.incompleto ? 'bg-amber-50/60' : ''}>
                          <td className="px-3 py-1.5 text-feisen-texto">{formatoFecha(d.fecha)}</td>
                          <td className="px-3 py-1.5 text-feisen-texto-2">{d.tipo === 'habil' ? 'Hábil' : d.tipo === 'sabado' ? 'Sábado' : d.tipo === 'domingo' ? 'Domingo' : `Festivo${d.festivo ? ` · ${d.festivo}` : ''}`}</td>
                          <td className="px-3 py-1.5 text-feisen-texto-2">{d.entrada || '—'}</td>
                          <td className="px-3 py-1.5 text-feisen-texto-2">{d.salida || '—'}{d.incompleto && <span className="text-amber-600"> · 1 marca</span>}</td>
                          <td className="px-3 py-1.5 text-right text-feisen-texto">{d.extra ? `${fmtH(d.extra)} h` : '—'}</td>
                          <td className="px-3 py-1.5 text-right text-feisen-texto">{d.recargo ? `${fmtH(d.recargo)} h` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Tarjeta>
          )}

          {/* Otros devengos */}
          <Tarjeta titulo={`${T.extra} y otros devengos`}>
            <div className={fila}>
              <div><L>{T.horas}</L><Numero value={liq.horas_extra} disabled={cerrada} onChange={set('horas_extra')} /></div>
              <div><L>{T.valorHora}</L><Dinero value={liq.valor_hora_extra} disabled={cerrada} onChange={set('valor_hora_extra')} /></div>
              <div className="flex items-end"><p className="text-sm text-feisen-texto py-2">= {formatoPesos((Number(liq.horas_extra) || 0) * (Number(liq.valor_hora_extra) || 0))}</p></div>
              <div><L>{T.recargo}</L><Numero value={liq.horas_extra_recargo} disabled={cerrada} onChange={set('horas_extra_recargo')} /></div>
              <div><L>{T.valorRecargo}</L><Dinero value={liq.valor_hora_recargo} disabled={cerrada} onChange={set('valor_hora_recargo')} /></div>
              <div className="flex items-end"><p className="text-sm text-feisen-texto py-2">= {formatoPesos(valorHorasRecargo(liq))}</p></div>
              <div><L>Auxilio de la quincena</L><Dinero value={liq.auxilio} disabled={cerrada} onChange={set('auxilio')} /></div>
              <div><L>Subsidio a seguridad social</L><Dinero value={liq.subsidio_ss} disabled={cerrada} onChange={set('subsidio_ss')} /></div>
              <div><L>Descuento por tiempo o pieza dañada</L><Dinero value={liq.descuento_tiempo_pieza} disabled={cerrada} onChange={set('descuento_tiempo_pieza')} /></div>
            </div>
            <p className="text-[11px] text-feisen-gris-medio mt-2">Los valores hora se calculan del valor del día: ÷ 8,4 × 1,25 (adicional) y ÷ 8,4 × 2 (domingo/festivo). Puedes ajustarlos.</p>
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
            {cerrada && <p className="px-5 pb-4 text-xs text-feisen-gris-medio flex items-center gap-1.5"><Lock size={12} strokeWidth={1.8} /> {periodo.estado === 'aprobada' ? 'Quincena aprobada' : 'Quincena cerrada'}</p>}
            {liq.email_enviado_en && <p className="px-5 pb-3 -mt-2 text-xs text-green-700">Desprendible enviado a {liq.email_enviado_a} el {new Date(liq.email_enviado_en).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
            {liq.email_error && !liq.email_enviado_en && <p className="px-5 pb-3 -mt-2 text-xs text-feisen-rojo">No se pudo enviar el desprendible: {liq.email_error}</p>}
            <div className="px-5 pb-4 -mt-1">
              <button onClick={desprendible} disabled={cambios && !cerrada} title={cambios ? 'Guarda primero los cambios' : ''} className={`${E.btnTexto} w-full justify-center`}>
                <FileText size={14} strokeWidth={1.8} /> Desprendible de pago (PDF)
              </button>
            </div>
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
