import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP } from '../../utils/formatters'
import { PanelLateral, Segmentado } from '../shared/ui'
import { CENTROS_COSTO } from '../costeo/utils/centrosCosto'
import { calcularCostosEquipo } from '../costeo/utils/equipoCosto'
import {
  campo, etiquetaCampo, Titulo, FUENTES_ENERGIA, SERVICIOS, VOLTAJES, ESTADO_LLEGADA, FASES, kwDe,
} from './comun'

// Crear o editar la ficha de un equipo (solo ADMIN) con los datos del formato FO-MAN-001.
// El área es una bodega; sin bodega = General (lo ven todos los jefes).
// «Valor del equipo» se guarda en costeo_equipos_planta (lo usa Costeo para el valor hora-máquina):
// si el equipo no está vinculado, se crea allá al llenar algún valor, o se vincula con uno que ya exista.
const NUEVO_COSTEO = 'nuevo'
const SIN_COSTEO = 'ninguno'
const txt = v => (v === null || v === undefined ? '' : String(v))
const numero = s => { const t = String(s).trim().replace(/\./g, '').replace(',', '.'); return t === '' ? null : Number(t) }
const numeroCO = v => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','))

const valoresCosteo = c => ({
  centro_costo: c?.centro_costo || '', valor_activo: numeroCO(c?.valor_activo), saldo_pendiente_depreciar: numeroCO(c?.saldo_pendiente_depreciar),
  vida_util_anios: numeroCO(c?.vida_util_anios), tarifa_kwh: numeroCO(c?.tarifa_kwh), horas_disponibles_anio: numeroCO(c?.horas_disponibles_anio),
  mantenimiento_anual: numeroCO(c?.mantenimiento_anual),
})
const CAMPOS_VALOR = ['valor_activo', 'saldo_pendiente_depreciar', 'vida_util_anios', 'tarifa_kwh', 'horas_disponibles_anio', 'mantenimiento_anual']

export default function FormEquipo({ equipo, bodegas, equiposCosteo, codigosUsados, onCerrar, onGuardado }) {
  const nuevo = !equipo?.id
  const vinculado = equiposCosteo.find(c => c.id === equipo?.costeo_equipo_id)
  const otroVoltaje = equipo?.voltaje && !VOLTAJES.includes(equipo.voltaje)
  const [f, setF] = useState({
    codigo: equipo?.codigo || '', nombre: equipo?.nombre || '', marca: equipo?.marca || '', modelo: equipo?.modelo || '',
    serie: equipo?.serie || '', anio_fabricacion: txt(equipo?.anio_fabricacion), bodega_id: equipo?.bodega_id || '',
    ubicacion: equipo?.ubicacion || '', funcion: equipo?.funcion || '', importancia: equipo?.importancia || 'importante',
    fecha_compra: equipo?.fecha_compra || '', garantia_hasta: equipo?.garantia_hasta || '',
    proveedor: equipo?.proveedor || '', proveedor_telefono: equipo?.proveedor_telefono || '', estado_llegada: equipo?.estado_llegada || '',
    fuentes_energia: equipo?.fuentes_energia || [], voltaje: otroVoltaje ? 'otro' : (equipo?.voltaje || ''), voltaje_otro: otroVoltaje ? equipo.voltaje : '',
    fases: equipo?.fases || '', amperaje: numeroCO(equipo?.amperaje), frecuencia_hz: numeroCO(equipo?.frecuencia_hz),
    potencia: numeroCO(equipo?.potencia), potencia_unidad: equipo?.potencia_unidad || 'kW', num_motores: txt(equipo?.num_motores),
    consumo_combustible: equipo?.consumo_combustible || '', capacidad: equipo?.capacidad || '', servicios: equipo?.servicios || [],
    activo_fijo: equipo?.activo_fijo || '', notas: equipo?.notas || '',
  })
  const [costeoId, setCosteoId] = useState(equipo?.costeo_equipo_id || NUEVO_COSTEO)
  const [v, setV] = useState(valoresCosteo(vinculado))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const cambiar = (k, val) => setF(prev => ({ ...prev, [k]: val }))
  const cambiarV = (k, val) => setV(prev => ({ ...prev, [k]: val }))
  const alternar = (k, opcion) => cambiar(k, f[k].includes(opcion) ? f[k].filter(x => x !== opcion) : [...f[k], opcion])

  // Solo los de Costeo que no tienen ficha (o el propio)
  const libres = equiposCosteo.filter(c => c.id === equipo?.costeo_equipo_id || !c.vinculado)
  const elegirCosteo = id => { setCosteoId(id); if (![NUEVO_COSTEO, SIN_COSTEO].includes(id)) setV(valoresCosteo(equiposCosteo.find(c => c.id === id))) }

  const kw = kwDe(numero(f.potencia), f.potencia_unidad)
  const hayValor = CAMPOS_VALOR.some(k => v[k] !== '') || v.centro_costo
  const vistaCosto = calcularCostosEquipo({ ...Object.fromEntries(CAMPOS_VALOR.map(k => [k, numero(v[k]) || 0])), kw_instalados: kw || 0 })

  const guardar = async () => {
    const codigo = f.codigo.trim().toUpperCase()
    if (!codigo || !f.nombre.trim()) { setError('El código y el nombre son obligatorios.'); return }
    if (codigosUsados.has(codigo) && codigo !== equipo?.codigo) { setError(`Ya hay un equipo con el código ${codigo}.`); return }
    const numeros = ['anio_fabricacion', 'amperaje', 'frecuencia_hz', 'potencia', 'num_motores'].map(k => [k, numero(f[k])])
    if (numeros.some(([, n]) => n !== null && Number.isNaN(n))) { setError('Revisa los campos numéricos: solo números.'); return }
    const valores = Object.fromEntries(CAMPOS_VALOR.map(k => [k, numero(v[k])]))
    if (Object.values(valores).some(n => n !== null && Number.isNaN(n))) { setError('Revisa el valor del equipo: solo números.'); return }
    const llevarACosteo = costeoId !== SIN_COSTEO && (costeoId !== NUEVO_COSTEO || hayValor)
    if (llevarACosteo && !v.centro_costo) { setError('Elige el centro de costo para llevar el equipo a Costeo.'); return }

    setGuardando(true); setError('')
    let costeo_equipo_id = [NUEVO_COSTEO, SIN_COSTEO].includes(costeoId) ? null : costeoId
    if (llevarACosteo) {
      const anterior = equiposCosteo.find(c => c.id === costeo_equipo_id)
      const filaCosteo = {
        nombre: f.nombre.trim(), centro_costo: v.centro_costo,
        ...Object.fromEntries(CAMPOS_VALOR.map(k => [k, valores[k] ?? 0])),
        kw_instalados: kw ?? Number(anterior?.kw_instalados || 0),
        updated_at: new Date().toISOString(),
      }
      const r = costeo_equipo_id
        ? await supabase.from('costeo_equipos_planta').update(filaCosteo).eq('id', costeo_equipo_id)
        : await supabase.from('costeo_equipos_planta').insert(filaCosteo).select('id').single()
      if (r.error) { setGuardando(false); setError('No se pudo guardar en Costeo: ' + r.error.message); return }
      if (!costeo_equipo_id) costeo_equipo_id = r.data.id
    }

    const limpio = k => f[k].trim() || null
    const fila = {
      codigo, nombre: f.nombre.trim(),
      marca: limpio('marca'), modelo: limpio('modelo'), serie: limpio('serie'), ubicacion: limpio('ubicacion'), funcion: limpio('funcion'),
      proveedor: limpio('proveedor'), proveedor_telefono: limpio('proveedor_telefono'), consumo_combustible: limpio('consumo_combustible'),
      capacidad: limpio('capacidad'), activo_fijo: limpio('activo_fijo'), notas: limpio('notas'),
      ...Object.fromEntries(numeros),
      bodega_id: f.bodega_id || null, importancia: f.importancia,
      fecha_compra: f.fecha_compra || null, garantia_hasta: f.garantia_hasta || null,
      estado_llegada: f.estado_llegada || null, fases: f.fases || null,
      fuentes_energia: f.fuentes_energia, servicios: f.servicios,
      voltaje: f.voltaje === 'otro' ? (f.voltaje_otro.trim() || null) : (f.voltaje || null),
      potencia_unidad: numero(f.potencia) !== null ? f.potencia_unidad : null,
      costeo_equipo_id,
    }
    const { error: err } = nuevo
      ? await supabase.from('mant_equipos').insert(fila)
      : await supabase.from('mant_equipos').update(fila).eq('id', equipo.id)
    setGuardando(false)
    if (err) { setError(err.message); return }
    onGuardado(nuevo ? `${codigo} creado` : `${codigo} actualizado`)
  }

  const darDeBaja = async () => {
    setGuardando(true)
    const { error: err } = await supabase.from('mant_equipos').update({ activo: false }).eq('id', equipo.id)
    setGuardando(false)
    if (err) { setError(err.message); return }
    onGuardado(`${equipo.codigo} dado de baja`)
  }

  const input = (k, label, extra = {}) => (
    <div><label htmlFor={`eq-${k}`} className={etiquetaCampo}>{label}</label>
      <input id={`eq-${k}`} value={f[k]} onChange={e => cambiar(k, e.target.value)} className={campo} {...extra} /></div>
  )
  const inputNum = (k, label, extra = {}) => input(k, label, { inputMode: 'decimal', className: `${campo} tabular-nums`, ...extra })
  const inputValor = (k, label, ayuda) => (
    <div><label htmlFor={`v-${k}`} className={etiquetaCampo}>{label}</label>
      <input id={`v-${k}`} inputMode="decimal" value={v[k]} onChange={e => cambiarV(k, e.target.value)} className={`${campo} tabular-nums`} />
      {ayuda && <p className="text-xs text-feisen-texto-2 mt-1">{ayuda}</p>}</div>
  )
  const chips = (k, opciones) => (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map(o => {
        const activo = f[k].includes(o)
        return (
          <button key={o} type="button" aria-pressed={activo} onClick={() => alternar(k, o)}
            className={`min-h-[36px] px-3 rounded-lg border text-sm font-medium ${activo ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul' : 'border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
            {o}
          </button>
        )
      })}
    </div>
  )
  const opcion = (k, opciones, conVacio = true) => (
    <Segmentado valor={f[k]} onCambiar={val => cambiar(k, conVacio && f[k] === val ? '' : val)}
      opciones={Object.entries(opciones).map(([valor, texto]) => ({ valor, texto }))} />
  )

  return (
    <PanelLateral etiqueta={nuevo ? 'Nuevo equipo' : 'Editar equipo'} onCerrar={onCerrar}
      encabezado={<><p className="text-xs text-gray-400">Mantenimiento</p><h2 className="text-lg font-semibold text-feisen-texto">{nuevo ? 'Nuevo equipo' : `Editar ${equipo.codigo}`}</h2></>}>

      <section className="space-y-3">
        <Titulo>Identificación</Titulo>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          {input('codigo', 'Código', { placeholder: 'MEC-01', className: `${campo} uppercase` })}
          {input('nombre', 'Nombre', { placeholder: 'Torno CNC' })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {input('marca', 'Marca')}
          {input('modelo', 'Modelo')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {input('serie', 'Serie')}
          {inputNum('anio_fabricacion', 'Año de fabricación', { inputMode: 'numeric', placeholder: '2015' })}
        </div>
        <div><label htmlFor="eq-area" className={etiquetaCampo}>Área</label>
          <select id="eq-area" value={f.bodega_id} onChange={e => cambiar('bodega_id', e.target.value)} className={campo}>
            <option value="">General (lo ven todas las áreas)</option>
            {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
          <p className="text-xs text-feisen-texto-2 mt-1">Los jefes ven y reportan fallas solo de los equipos de su área.</p>
        </div>
        {input('ubicacion', 'Ubicación exacta en la planta')}
        <div><label htmlFor="eq-funcion" className={etiquetaCampo}>Qué hace / qué produce</label>
          <textarea id="eq-funcion" rows={2} value={f.funcion} onChange={e => cambiar('funcion', e.target.value)} className={campo} /></div>
        <div><p className={etiquetaCampo}>Importancia</p>
          <Segmentado valor={f.importancia} onCambiar={val => cambiar('importancia', val)}
            opciones={[{ valor: 'critico', texto: 'Crítico' }, { valor: 'importante', texto: 'Importante' }, { valor: 'secundario', texto: 'Secundario' }]} />
          <p className="text-xs text-feisen-texto-2 mt-1">Crítico: si se para, se para el área.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {input('fecha_compra', 'En la planta desde', { type: 'date' })}
          {input('garantia_hasta', 'Garantía hasta', { type: 'date' })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {input('proveedor', 'Se compró a')}
          {input('proveedor_telefono', 'Teléfono del proveedor', { inputMode: 'tel' })}
        </div>
        <div><p className={etiquetaCampo}>Estado en que llegó</p>{opcion('estado_llegada', ESTADO_LLEGADA)}</div>
      </section>

      <section className="space-y-3">
        <Titulo>Datos técnicos y energía</Titulo>
        <div><p className={etiquetaCampo}>Fuente de energía</p>{chips('fuentes_energia', FUENTES_ENERGIA)}</div>
        <div><p className={etiquetaCampo}>Voltaje</p>
          <Segmentado valor={f.voltaje} onCambiar={val => cambiar('voltaje', f.voltaje === val ? '' : val)}
            opciones={[...VOLTAJES.map(x => ({ valor: x, texto: x })), { valor: 'otro', texto: 'Otro' }]} />
          {f.voltaje === 'otro' && <input aria-label="Otro voltaje" value={f.voltaje_otro} onChange={e => cambiar('voltaje_otro', e.target.value)} placeholder="Ej.: 380 V" className={`${campo} mt-2`} />}
        </div>
        <div><p className={etiquetaCampo}>Fases</p>{opcion('fases', FASES)}</div>
        <div className="grid grid-cols-2 gap-3">
          {inputNum('amperaje', 'Amperaje (A)')}
          {inputNum('frecuencia_hz', 'Frecuencia (Hz)', { placeholder: '60' })}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          {inputNum('potencia', 'Potencia en placa')}
          <Segmentado valor={f.potencia_unidad} onCambiar={val => cambiar('potencia_unidad', val)}
            opciones={['kW', 'HP', 'CV'].map(x => ({ valor: x, texto: x }))} />
        </div>
        {kw !== null && f.potencia_unidad !== 'kW' && <p className="text-xs text-feisen-texto-2 -mt-1">Equivale a {String(kw).replace('.', ',')} kW (es lo que usa Costeo).</p>}
        <div className="grid grid-cols-2 gap-3">
          {inputNum('num_motores', 'N.º de motores', { inputMode: 'numeric' })}
          {input('consumo_combustible', 'Consumo de gas / combustible', { placeholder: 'Ej.: 3 m³ por hora' })}
        </div>
        {input('capacidad', 'Capacidad', { placeholder: 'Ej.: 500 kg por colada, volteo Ø 400 mm' })}
        <div><p className={etiquetaCampo}>Otros servicios que usa</p>{chips('servicios', SERVICIOS)}</div>
      </section>

      <section className="space-y-3">
        <Titulo>Valor del equipo · Costeo</Titulo>
        <div><label htmlFor="eq-costeo" className={etiquetaCampo}>Equipo en Costeo</label>
          <select id="eq-costeo" value={costeoId} onChange={e => elegirCosteo(e.target.value)} className={campo}>
            {!equipo?.costeo_equipo_id && <option value={NUEVO_COSTEO}>Crear en Costeo con estos datos</option>}
            <option value={SIN_COSTEO}>{equipo?.costeo_equipo_id ? 'Desvincular de Costeo' : 'No llevar a Costeo'}</option>
            {libres.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <p className="text-xs text-feisen-texto-2 mt-1">
            {costeoId === NUEVO_COSTEO ? 'Se crea en Costeo cuando llenes algún valor de esta sección.'
              : costeoId === SIN_COSTEO ? 'Los valores de esta sección no se guardan.' : 'Lo que cambies aquí se ve también en Costeo › Equipos de planta.'}
          </p>
        </div>
        <div><p className={etiquetaCampo}>Centro de costo</p>
          <Segmentado valor={v.centro_costo} onCambiar={val => cambiarV('centro_costo', val)} opciones={CENTROS_COSTO.map(c => ({ valor: c, texto: c }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {inputValor('valor_activo', 'Valor del activo ($)')}
          {inputValor('saldo_pendiente_depreciar', 'Saldo por depreciar hoy ($)', 'Si es nuevo, el valor de compra.')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {inputValor('vida_util_anios', 'Vida útil restante (años)')}
          {inputValor('tarifa_kwh', 'Tarifa de energía ($/kWh)')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {inputValor('horas_disponibles_anio', 'Horas disponibles al año')}
          {inputValor('mantenimiento_anual', 'Mantenimiento al año ($)', 'Presupuesto anual.')}
        </div>
        {input('activo_fijo', 'N.º de activo fijo / placa contable')}
        {hayValor && (
          <div className="rounded-lg bg-feisen-fondo px-3 py-2.5 text-sm flex justify-between">
            <span className="text-feisen-texto-2">Valor hora-máquina</span>
            <b className="tabular-nums font-semibold">{vistaCosto.valorHora > 0 ? formatCOP(vistaCosto.valorHora) : 'Faltan horas al año'}</b>
          </div>
        )}
      </section>

      <div><label htmlFor="eq-notas" className={etiquetaCampo}>Notas</label>
        <textarea id="eq-notas" rows={2} value={f.notas} onChange={e => cambiar('notas', e.target.value)} className={campo} /></div>

      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}

      {!nuevo && (
        <button type="button" onClick={darDeBaja} disabled={guardando} className="text-sm text-feisen-rojo hover:underline">
          Dar de baja el equipo (deja de aparecer; su historial se conserva)
        </button>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-4 px-5 py-3 bg-white border-t border-feisen-borde-suave">
        <button type="button" onClick={guardar} disabled={guardando}
          className="w-full min-h-[48px] rounded-lg bg-feisen-azul text-white font-semibold disabled:opacity-50">
          {guardando ? 'Guardando…' : nuevo ? 'Crear equipo' : 'Guardar cambios'}
        </button>
      </div>
    </PanelLateral>
  )
}
