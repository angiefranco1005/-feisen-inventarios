import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP } from '../../utils/formatters'
import { PanelLateral, Segmentado } from '../shared/ui'
import { campo, etiquetaCampo } from './comun'

// Crear o editar la ficha de un equipo (solo ADMIN). El área es una bodega; sin bodega = General
// (lo ven todos los jefes). Vincularlo con Costeo trae el presupuesto anual de mantenimiento.
export default function FormEquipo({ equipo, bodegas, equiposCosteo, codigosUsados, onCerrar, onGuardado }) {
  const nuevo = !equipo?.id
  const [f, setF] = useState({
    codigo: equipo?.codigo || '', nombre: equipo?.nombre || '', marca: equipo?.marca || '', modelo: equipo?.modelo || '',
    serie: equipo?.serie || '', bodega_id: equipo?.bodega_id || '', importancia: equipo?.importancia || 'importante',
    fecha_compra: equipo?.fecha_compra || '', garantia_hasta: equipo?.garantia_hasta || '',
    costeo_equipo_id: equipo?.costeo_equipo_id || '', notas: equipo?.notas || '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const cambiar = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  const guardar = async () => {
    const codigo = f.codigo.trim().toUpperCase()
    if (!codigo || !f.nombre.trim()) { setError('El código y el nombre son obligatorios.'); return }
    if (codigosUsados.has(codigo) && codigo !== equipo?.codigo) { setError(`Ya hay un equipo con el código ${codigo}.`); return }
    setGuardando(true); setError('')
    const fila = {
      ...f, codigo, nombre: f.nombre.trim(),
      bodega_id: f.bodega_id || null, costeo_equipo_id: f.costeo_equipo_id || null,
      fecha_compra: f.fecha_compra || null, garantia_hasta: f.garantia_hasta || null,
      marca: f.marca.trim() || null, modelo: f.modelo.trim() || null, serie: f.serie.trim() || null, notas: f.notas.trim() || null,
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

  return (
    <PanelLateral etiqueta={nuevo ? 'Nuevo equipo' : 'Editar equipo'} onCerrar={onCerrar}
      encabezado={<><p className="text-xs text-gray-400">Mantenimiento</p><h2 className="text-lg font-semibold text-feisen-texto">{nuevo ? 'Nuevo equipo' : `Editar ${equipo.codigo}`}</h2></>}>
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        {input('codigo', 'Código', { placeholder: 'MEC-01', className: `${campo} uppercase` })}
        {input('nombre', 'Nombre', { placeholder: 'Torno CNC' })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {input('marca', 'Marca')}
        {input('modelo', 'Modelo')}
      </div>
      {input('serie', 'Serie')}
      <div><label htmlFor="eq-area" className={etiquetaCampo}>Área</label>
        <select id="eq-area" value={f.bodega_id} onChange={e => cambiar('bodega_id', e.target.value)} className={campo}>
          <option value="">General (lo ven todas las áreas)</option>
          {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
        <p className="text-xs text-feisen-texto-2 mt-1">Los jefes ven y reportan fallas solo de los equipos de su área.</p>
      </div>
      <div><p className={etiquetaCampo}>Importancia</p>
        <Segmentado valor={f.importancia} onCambiar={v => cambiar('importancia', v)}
          opciones={[{ valor: 'critico', texto: 'Crítico' }, { valor: 'importante', texto: 'Importante' }, { valor: 'secundario', texto: 'Secundario' }]} />
        <p className="text-xs text-feisen-texto-2 mt-1">Crítico: si se para, se para el área.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {input('fecha_compra', 'En la planta desde', { type: 'date' })}
        {input('garantia_hasta', 'Garantía hasta', { type: 'date' })}
      </div>
      <div><label htmlFor="eq-costeo" className={etiquetaCampo}>Equipo en Costeo</label>
        <select id="eq-costeo" value={f.costeo_equipo_id} onChange={e => cambiar('costeo_equipo_id', e.target.value)} className={campo}>
          <option value="">Sin vincular</option>
          {equiposCosteo.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.mantenimiento_anual ? ` · ${formatCOP(c.mantenimiento_anual)} al año` : ''}</option>)}
        </select>
        <p className="text-xs text-feisen-texto-2 mt-1">De ahí sale el presupuesto anual de mantenimiento.</p>
      </div>
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
