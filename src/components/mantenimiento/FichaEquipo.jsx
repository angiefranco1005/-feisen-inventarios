import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatCOP } from '../../utils/formatters'
import { calcularCostosEquipo } from '../costeo/utils/equipoCosto'
import { PanelLateral, Segmentado } from '../shared/ui'
import { CalendarCheck, ListChecks, Pencil, Plus, Trash2, Wrench } from '../shared/iconos'
import {
  IMPORTANCIA, ESTADO_EQUIPO, ESTADO_ORDEN, Etiqueta, Titulo, campo, etiquetaCampo,
  textoProxima, diasHasta, fechaCorta, horasEntre, hoyCol, sumarDias, ESTADO_LLEGADA, FASES, kwDe,
} from './comun'

// Ficha de un equipo: datos del formato FO-MAN-001 (identificación y técnicos), valor y costeo
// (solo ADMIN, de costeo_equipos_planta), plan preventivo, últimas órdenes y costo del año
// frente al presupuesto de mantenimiento que tiene en Costeo.
export default function FichaEquipo({ equipo, tareas, ordenes, costoOrden, presupuesto, costeo, onCerrar, onEditar, onReportar, onAbrirOrden, onCambio }) {
  const { esAdmin } = useAuth()
  const [formTarea, setFormTarea] = useState(null) // null | {} (nueva) | tarea
  const imp = IMPORTANCIA[equipo.importancia]
  const est = ESTADO_EQUIPO[equipo.estado]
  const anio = hoyCol().slice(0, 4)
  const delAnio = ordenes.filter(o => o.estado === 'cerrada' && (o.cerrada_at || '').slice(0, 4) === anio)
  const costoAnio = delAnio.reduce((s, o) => s + (costoOrden[o.id] || 0), 0)
  const horasParado = delAnio.reduce((s, o) => s + horasEntre(o.inicio_paro, o.fin_paro), 0)

  const kw = kwDe(equipo.potencia, equipo.potencia_unidad)
  const costos = calcularCostosEquipo(costeo)
  const num = n => Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 })
  const dato = (t, v) => <div><p className="text-[11.5px] text-feisen-texto-2">{t}</p><p className="text-sm text-feisen-texto">{v || '—'}</p></div>

  return (
    <PanelLateral etiqueta={`Equipo ${equipo.nombre}`} onCerrar={onCerrar}
      encabezado={<>
        <p className="text-xs text-gray-400 tabular-nums">{equipo.codigo} · {equipo.bodegas?.nombre || 'General'}</p>
        <h2 className="text-lg font-semibold text-feisen-texto leading-snug">{equipo.nombre}</h2>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <Etiqueta clase={imp.clase}>{imp.texto}</Etiqueta>
          <Etiqueta clase={est.clase} punto>{est.texto}</Etiqueta>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" onClick={onReportar} className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-feisen-borde text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
            <Wrench size={15} /> Reportar falla
          </button>
          {esAdmin && (
            <button type="button" onClick={onEditar} className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-feisen-borde text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
              <Pencil size={15} /> Editar ficha
            </button>
          )}
        </div>
      </>}>

      <section className="space-y-2.5">
        <Titulo>Identificación</Titulo>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {dato('Marca y modelo', [equipo.marca, equipo.modelo].filter(Boolean).join(' · '))}
          {dato('Serie', equipo.serie)}
          {dato('Año de fabricación', equipo.anio_fabricacion)}
          {dato('Ubicación', equipo.ubicacion)}
          {dato('En la planta desde', equipo.fecha_compra && fechaCorta(equipo.fecha_compra) + ' ' + equipo.fecha_compra.slice(0, 4))}
          {dato('Garantía', equipo.garantia_hasta ? (diasHasta(equipo.garantia_hasta) >= 0 ? `Hasta el ${fechaCorta(equipo.garantia_hasta)} ${equipo.garantia_hasta.slice(0, 4)}` : 'Vencida') : null)}
          {dato('Se compró a', [equipo.proveedor, equipo.proveedor_telefono].filter(Boolean).join(' · '))}
          {dato('Llegó', ESTADO_LLEGADA[equipo.estado_llegada])}
        </div>
        {equipo.funcion && dato('Qué hace / qué produce', <span className="whitespace-pre-line">{equipo.funcion}</span>)}
        {equipo.notas && <p className="text-sm text-feisen-texto-2 whitespace-pre-line">{equipo.notas}</p>}
      </section>

      <section className="space-y-2.5">
        <Titulo>Datos técnicos y energía</Titulo>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {dato('Fuente de energía', (equipo.fuentes_energia || []).join(', '))}
          {dato('Voltaje y fases', [equipo.voltaje, FASES[equipo.fases]].filter(Boolean).join(' · '))}
          {dato('Potencia', equipo.potencia ? `${num(equipo.potencia)} ${equipo.potencia_unidad}${equipo.potencia_unidad !== 'kW' && kw ? ` (${num(kw)} kW)` : ''}` : null)}
          {dato('Motores', equipo.num_motores)}
          {dato('Amperaje', equipo.amperaje && `${num(equipo.amperaje)} A`)}
          {dato('Frecuencia', equipo.frecuencia_hz && `${num(equipo.frecuencia_hz)} Hz`)}
          {dato('Consumo de gas / combustible', equipo.consumo_combustible)}
          {dato('Capacidad', equipo.capacidad)}
        </div>
        {dato('Otros servicios', (equipo.servicios || []).join(', '))}
      </section>

      {esAdmin && (
        <section className="space-y-2.5">
          <Titulo>Valor y costeo</Titulo>
          {costeo ? <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {dato('Centro de costo', costeo.centro_costo)}
              {dato('Activo fijo', equipo.activo_fijo)}
              {dato('Valor del activo', costeo.valor_activo > 0 && formatCOP(costeo.valor_activo))}
              {dato('Saldo por depreciar', costeo.saldo_pendiente_depreciar > 0 && formatCOP(costeo.saldo_pendiente_depreciar))}
              {dato('Vida útil restante', costeo.vida_util_anios > 0 && `${num(costeo.vida_util_anios)} años`)}
              {dato('Tarifa de energía', costeo.tarifa_kwh > 0 && `${formatCOP(costeo.tarifa_kwh)} por kWh`)}
              {dato('Horas disponibles al año', costeo.horas_disponibles_anio > 0 && num(costeo.horas_disponibles_anio))}
              {dato('kW en Costeo', costeo.kw_instalados > 0 && num(costeo.kw_instalados))}
            </div>
            <div className="rounded-lg bg-feisen-fondo px-3 py-2.5 space-y-1.5 text-sm">
              {[['Depreciación al año', costos.depreciacionAnual], ['Mantenimiento al año', Number(costeo.mantenimiento_anual) || 0], ['Energía al año', costos.energiaAnual]].map(([t, val]) => (
                <div key={t} className="flex justify-between"><span className="text-feisen-texto-2">{t}</span><span className="tabular-nums">{formatCOP(val)}</span></div>
              ))}
              <div className="flex justify-between pt-1.5 border-t border-feisen-borde"><span className="font-medium">Valor hora-máquina</span>
                <b className="tabular-nums font-semibold">{costos.valorHora > 0 ? formatCOP(costos.valorHora) : 'Faltan las horas al año'}</b></div>
            </div>
            <p className="text-xs text-feisen-texto-2">Es el mismo equipo de Costeo › Equipos de planta; con este valor se costean las piezas que pasan por él.</p>
          </> : (
            <p className="text-sm text-feisen-texto-2">Sin valor en Costeo. Llénalo en «Editar ficha» › Valor del equipo{equipo.activo_fijo ? ` (activo fijo ${equipo.activo_fijo})` : ''}.</p>
          )}
        </section>
      )}

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <Titulo>Plan preventivo</Titulo>
          {esAdmin && !formTarea && (
            <button type="button" onClick={() => setFormTarea({})} className="flex items-center gap-1 text-sm font-medium text-feisen-azul"><Plus size={15} /> Agregar tarea</button>
          )}
        </div>
        {tareas.length === 0 && !formTarea && (
          <p className="text-sm text-feisen-texto-2">Sin tareas preventivas. {esAdmin ? 'Agrega una (por ejemplo «Cambio de aceite, cada 90 días») y la orden se creará sola 7 días antes.' : ''}</p>
        )}
        {tareas.map(t => {
          const d = diasHasta(t.proxima_fecha)
          return (
            <div key={t.id} className="flex items-center gap-3">
              <ListChecks size={17} className="text-gray-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-feisen-texto">{t.nombre}</p>
                <p className="text-xs text-feisen-texto-2">Cada {t.frecuencia_dias} días · {t.responsable === 'externo' ? 'proveedor externo' : 'personal de planta'}</p>
              </div>
              <Etiqueta clase={d < 0 ? 'bg-amber-50 text-amber-700' : d <= 7 ? 'bg-feisen-azul-suave text-feisen-azul' : 'bg-gray-100 text-feisen-texto-2'}>
                {d < 0 ? textoProxima(t.proxima_fecha).replace(/^v/, 'V') : textoProxima(t.proxima_fecha)}
              </Etiqueta>
              {esAdmin && <button type="button" onClick={() => setFormTarea(t)} aria-label={`Editar ${t.nombre}`} className="p-1.5 text-gray-400 hover:text-feisen-texto"><Pencil size={15} /></button>}
            </div>
          )
        })}
        {formTarea && <FormTarea tarea={formTarea} equipoId={equipo.id} onCancelar={() => setFormTarea(null)}
          onGuardada={m => { setFormTarea(null); onCambio(m) }} />}
      </section>

      <section className="space-y-2.5">
        <Titulo>Órdenes de trabajo</Titulo>
        {ordenes.length === 0 && <p className="text-sm text-feisen-texto-2">Todavía no tiene órdenes.</p>}
        {ordenes.slice(0, 8).map(o => (
          <button key={o.id} type="button" onClick={() => onAbrirOrden(o)} className="w-full flex items-start gap-3 text-left rounded-lg -mx-2 px-2 py-1.5 hover:bg-feisen-fondo">
            <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${o.tipo === 'preventiva' ? 'bg-feisen-azul-suave text-feisen-azul' : 'bg-feisen-rojo-suave text-feisen-rojo'}`}>
              {o.tipo === 'preventiva' ? <CalendarCheck size={15} weight="duotone" /> : <Wrench size={15} weight="duotone" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm text-feisen-texto truncate">{o.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva'} · {o.descripcion || '—'}</span>
              <span className="block text-xs text-feisen-texto-2">{o.numero} · {fechaCorta(o.cerrada_at || o.reportado_at)}{o.inicio_paro && o.fin_paro ? ` · ${Math.round(horasEntre(o.inicio_paro, o.fin_paro))} h parado` : ''}</span>
            </span>
            {o.estado === 'cerrada'
              ? (esAdmin && <span className="text-xs text-feisen-texto-2 tabular-nums whitespace-nowrap">{formatCOP(costoOrden[o.id] || 0)}</span>)
              : <Etiqueta clase={ESTADO_ORDEN[o.estado].clase}>{ESTADO_ORDEN[o.estado].texto}</Etiqueta>}
          </button>
        ))}
      </section>

      {esAdmin && (
        <section className="space-y-2">
          <Titulo>En {anio}</Titulo>
          <div className="flex justify-between text-sm"><span className="text-feisen-texto-2">Costo de mantenimiento</span>
            <b className="tabular-nums font-semibold">{formatCOP(costoAnio)}{presupuesto ? ` de ${formatCOP(presupuesto)}` : ''}</b></div>
          {presupuesto > 0 && <>
            <div className="h-2 rounded bg-feisen-borde-suave overflow-hidden">
              <div className={`h-full rounded ${costoAnio > presupuesto ? 'bg-feisen-rojo' : 'bg-feisen-azul'}`} style={{ width: `${Math.min(100, (costoAnio / presupuesto) * 100)}%` }} />
            </div>
            <p className="text-xs text-feisen-texto-2">Presupuesto anual tomado de Costeo · {Math.round((costoAnio / presupuesto) * 100)} %</p>
          </>}
          {!presupuesto && <p className="text-xs text-feisen-texto-2">Sin presupuesto: vincula el equipo con uno de Costeo en «Editar ficha».</p>}
          <div className="flex justify-between text-sm pt-1"><span className="text-feisen-texto-2">Tiempo parado en el año</span><b className="tabular-nums font-semibold">{Math.round(horasParado)} h</b></div>
        </section>
      )}
    </PanelLateral>
  )
}

function FormTarea({ tarea, equipoId, onCancelar, onGuardada }) {
  const nueva = !tarea.id
  const [nombre, setNombre] = useState(tarea.nombre || '')
  const [frecuencia, setFrecuencia] = useState(String(tarea.frecuencia_dias || 30))
  const [responsable, setResponsable] = useState(tarea.responsable || 'interno')
  const [proxima, setProxima] = useState(tarea.proxima_fecha || sumarDias(hoyCol(), 30))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async () => {
    const f = parseInt(frecuencia, 10)
    if (!nombre.trim()) { setError('Escribe qué hay que hacer.'); return }
    if (!(f > 0)) { setError('La frecuencia debe ser mayor que cero.'); return }
    if (!proxima) { setError('Elige la próxima fecha.'); return }
    setGuardando(true); setError('')
    const fila = { equipo_id: equipoId, nombre: nombre.trim(), frecuencia_dias: f, responsable, proxima_fecha: proxima }
    const { error: err } = nueva
      ? await supabase.from('mant_tareas').insert(fila)
      : await supabase.from('mant_tareas').update(fila).eq('id', tarea.id)
    setGuardando(false)
    if (err) { setError(err.message); return }
    onGuardada(nueva ? 'Tarea agregada al plan' : 'Tarea actualizada')
  }
  const quitar = async () => {
    setGuardando(true)
    const { error: err } = await supabase.from('mant_tareas').update({ activo: false }).eq('id', tarea.id)
    setGuardando(false)
    if (err) { setError(err.message); return }
    onGuardada('Tarea quitada del plan')
  }

  return (
    <div className="border border-feisen-borde rounded-xl p-4 space-y-3 bg-feisen-fondo">
      <div><label htmlFor="t-nombre" className={etiquetaCampo}>Qué hay que hacer</label>
        <input id="t-nombre" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej.: Cambio de aceite y filtro" className={campo} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="t-frec" className={etiquetaCampo}>Cada cuántos días</label>
          <input id="t-frec" inputMode="numeric" value={frecuencia} onChange={e => setFrecuencia(e.target.value)} className={`${campo} tabular-nums`} /></div>
        <div><label htmlFor="t-prox" className={etiquetaCampo}>Próxima vez</label>
          <input id="t-prox" type="date" value={proxima} onChange={e => setProxima(e.target.value)} className={campo} /></div>
      </div>
      <div><p className={etiquetaCampo}>Lo hace</p>
        <Segmentado valor={responsable} onCambiar={setResponsable}
          opciones={[{ valor: 'interno', texto: 'Personal de planta' }, { valor: 'externo', texto: 'Proveedor externo' }]} /></div>
      {error && <p className="text-sm text-feisen-rojo">{error}</p>}
      <div className="flex items-center gap-2">
        {!nueva && <button type="button" onClick={quitar} disabled={guardando} className="flex items-center gap-1.5 text-sm text-feisen-rojo mr-auto"><Trash2 size={15} /> Quitar del plan</button>}
        <button type="button" onClick={onCancelar} className={`min-h-[40px] px-3 rounded-lg border border-feisen-borde bg-white text-sm font-medium ${nueva ? 'ml-auto' : ''}`}>Cancelar</button>
        <button type="button" onClick={guardar} disabled={guardando} className="min-h-[40px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold disabled:opacity-50">Guardar</button>
      </div>
    </div>
  )
}
