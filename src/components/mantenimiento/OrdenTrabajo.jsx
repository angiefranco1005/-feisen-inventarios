import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAllPages } from '../../utils/fetchAllPages'
import { coincideBusqueda } from '../../utils/busqueda'
import { formatCOP, formatNumero, formatFechaHora } from '../../utils/formatters'
import { PanelLateral, Segmentado, Contador } from '../shared/ui'
import { Plus, Search, Timer, Trash2, Wrench } from '../shared/iconos'
import { ESTADO_ORDEN, Etiqueta, Titulo, campo, etiquetaCampo, duracion, fechaCorta } from './comun'

const ALMACEN = 'ALMACEN'
const aNumero = v => parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0

// Detalle de una orden de trabajo. ADMIN la puede empezar y cerrar (con repuestos y costos);
// los demás solo la ven, sin costos.
export default function OrdenTrabajo({ orden, equipo, bodegas, onCerrar, onCambio }) {
  const { esAdmin } = useAuth()
  const [costos, setCostos] = useState([])
  const [cerrando, setCerrando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const est = ESTADO_ORDEN[orden.estado]
  const abierta = orden.estado !== 'cerrada'

  useEffect(() => {
    if (!esAdmin || abierta) return
    supabase.from('mant_orden_costos').select('*').eq('orden_id', orden.id).order('created_at')
      .then(({ data }) => setCostos(data || []))
  }, [esAdmin, abierta, orden.id])

  const empezar = async () => {
    setGuardando(true); setError('')
    const { error: e1 } = await supabase.from('mant_ordenes').update({ estado: 'en_reparacion' }).eq('id', orden.id)
    if (!e1 && !orden.equipo_parado) await supabase.from('mant_equipos').update({ estado: 'mantenimiento' }).eq('id', orden.equipo_id).neq('estado', 'parado')
    setGuardando(false)
    if (e1) { setError(e1.message); return }
    onCambio(`${orden.numero} en reparación`)
  }

  return (
    <PanelLateral etiqueta={`Orden ${orden.numero}`} onCerrar={onCerrar}
      encabezado={<>
        <p className="text-xs text-gray-400 tabular-nums">{orden.numero} · {orden.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva'}</p>
        <h2 className="text-lg font-semibold text-feisen-texto leading-snug">{equipo?.nombre || 'Equipo'}</h2>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <Etiqueta clase={est.clase} punto>{est.texto}</Etiqueta>
          {orden.equipo_parado && abierta && <Etiqueta clase="bg-feisen-rojo-suave text-feisen-rojo">Equipo parado</Etiqueta>}
        </div>
      </>}>

      <section className="space-y-2">
        <Titulo>{orden.tipo === 'preventiva' ? 'Tarea' : 'Qué pasó'}</Titulo>
        <p className="text-sm text-feisen-texto whitespace-pre-line">{orden.descripcion || '—'}</p>
        {orden.foto_url && <a href={orden.foto_url} target="_blank" rel="noreferrer"><img src={orden.foto_url} alt="Foto de la falla" className="mt-1 rounded-lg border border-feisen-borde max-h-56 object-cover" /></a>}
        <p className="text-xs text-feisen-texto-2">
          {orden.tipo === 'preventiva'
            ? `Programada para el ${fechaCorta(orden.fecha_programada)}`
            : `Reportada el ${formatFechaHora(orden.reportado_at)}${orden.reportado?.nombre ? ` por ${orden.reportado.nombre}` : ''}`}
        </p>
        {orden.inicio_paro && (
          <p className="flex items-center gap-2 text-sm font-medium text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">
            <Timer size={17} /> {abierta ? `Parado desde ${formatFechaHora(orden.inicio_paro)} · ${duracion(orden.inicio_paro)}` : `Estuvo parado ${duracion(orden.inicio_paro, orden.fin_paro)}`}
          </p>
        )}
      </section>

      {!abierta && (
        <section className="space-y-2">
          <Titulo>Cierre</Titulo>
          <p className="text-sm text-feisen-texto">
            {orden.ejecutor_tipo === 'externo' ? 'Proveedor externo' : 'Personal de planta'}{orden.ejecutor_nombre ? `: ${orden.ejecutor_nombre}` : ''}
          </p>
          {orden.trabajo_realizado && <p className="text-sm text-feisen-texto-2 whitespace-pre-line">{orden.trabajo_realizado}</p>}
          <p className="text-xs text-feisen-texto-2">Cerrada el {formatFechaHora(orden.cerrada_at)}{orden.numero_salida ? ` · salida ${orden.numero_salida}` : ''}</p>
          {esAdmin && costos.length > 0 && (
            <div className="border border-feisen-borde rounded-lg divide-y divide-feisen-borde-suave">
              {costos.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-feisen-texto truncate">{c.descripcion}</p>
                    <p className="text-xs text-feisen-texto-2">{c.origen === 'inventario' ? `Inventario · ${formatNumero(c.cantidad)} und` : c.origen === 'servicio' ? 'Servicio externo' : 'Comprado aparte'}</p>
                  </div>
                  <span className="tabular-nums text-feisen-texto">{formatCOP(c.costo_total)}</span>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 text-sm font-semibold"><span>Total</span><span className="tabular-nums">{formatCOP(costos.reduce((s, c) => s + Number(c.costo_total), 0))}</span></div>
            </div>
          )}
        </section>
      )}

      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}

      {esAdmin && abierta && !cerrando && (
        <div className="flex flex-wrap gap-2">
          {orden.estado !== 'en_reparacion' && (
            <button type="button" onClick={empezar} disabled={guardando}
              className="flex items-center gap-2 min-h-[44px] px-4 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-50">
              <Wrench size={17} /> Empezar reparación
            </button>
          )}
          <button type="button" onClick={() => setCerrando(true)}
            className="min-h-[44px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold">Cerrar orden</button>
        </div>
      )}

      {esAdmin && abierta && cerrando && (
        <FormCierre orden={orden} bodegas={bodegas} onCancelar={() => setCerrando(false)} onCerrada={onCambio} />
      )}
    </PanelLateral>
  )
}

function FormCierre({ orden, bodegas, onCancelar, onCerrada }) {
  const [quien, setQuien] = useState('interno')
  const [nombre, setNombre] = useState('')
  const [trabajo, setTrabajo] = useState('')
  const [valorServicio, setValorServicio] = useState('')
  const [bodegaId, setBodegaId] = useState(() => bodegas.find(b => b.nombre === ALMACEN)?.id || bodegas[0]?.id || '')
  const [stock, setStock] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [repuestos, setRepuestos] = useState([]) // { item_id, bodega_id, nombre, unidad, precio, disponible, cantidad }
  const [compras, setCompras] = useState([])     // { id, descripcion, valor }
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!bodegaId) return
    setStock(null)
    fetchAllPages((d, h) => supabase.from('stock')
      .select('cantidad_actual, items!inner(id, nombre, unidad_medida, precio_costo, activo)')
      .eq('bodega_id', bodegaId).gt('cantidad_actual', 0).eq('items.activo', true).range(d, h))
      .then(({ data }) => setStock((data || []).map(s => ({ ...s.items, disponible: Number(s.cantidad_actual) }))))
  }, [bodegaId])

  const resultados = useMemo(() => !busqueda.trim() || !stock ? [] :
    stock.filter(i => coincideBusqueda(i.nombre, busqueda)).slice(0, 30), [stock, busqueda])

  const agregar = it => {
    setRepuestos(prev => prev.some(r => r.item_id === it.id && r.bodega_id === bodegaId)
      ? prev.map(r => r.item_id === it.id && r.bodega_id === bodegaId ? { ...r, cantidad: String(aNumero(r.cantidad) + 1) } : r)
      : [...prev, { item_id: it.id, bodega_id: bodegaId, bodega: bodegas.find(b => b.id === bodegaId)?.nombre, nombre: it.nombre, unidad: it.unidad_medida, precio: Number(it.precio_costo) || 0, disponible: it.disponible, cantidad: '1' }])
    setBusqueda('')
  }

  const problema = r => {
    const n = parseFloat(String(r.cantidad).replace(',', '.'))
    if (!(n > 0)) return 'Cantidad inválida'
    if (n > r.disponible) return `Solo hay ${formatNumero(r.disponible)}`
    return null
  }
  const totalRepuestos = repuestos.reduce((s, r) => s + (parseFloat(String(r.cantidad).replace(',', '.')) || 0) * r.precio, 0)
  const totalCompras = compras.reduce((s, c) => s + aNumero(c.valor), 0)
  const total = totalRepuestos + totalCompras + (quien === 'externo' ? aNumero(valorServicio) : 0)
  const hayProblemas = repuestos.some(problema)

  const cerrar = async () => {
    if (hayProblemas) { setError('Revisa las cantidades de los repuestos.'); return }
    if (quien === 'externo' && !nombre.trim()) { setError('Escribe el nombre del proveedor.'); return }
    setGuardando(true); setError('')
    const lineas = [
      ...repuestos.map(r => ({ origen: 'inventario', item_id: r.item_id, bodega_id: r.bodega_id, cantidad: parseFloat(String(r.cantidad).replace(',', '.')) })),
      ...compras.filter(c => c.descripcion.trim() || aNumero(c.valor)).map(c => ({ origen: 'compra', descripcion: c.descripcion, costo_total: aNumero(c.valor) })),
      ...(quien === 'externo' && aNumero(valorServicio) ? [{ origen: 'servicio', descripcion: `Servicio de ${nombre.trim()}`, costo_total: aNumero(valorServicio) }] : []),
    ]
    const { error: err } = await supabase.rpc('mant_cerrar_orden', {
      p_orden: orden.id, p_ejecutor_tipo: quien, p_ejecutor_nombre: nombre, p_trabajo: trabajo, p_fin_paro: null, p_lineas: lineas,
    })
    setGuardando(false)
    if (err) { setError(err.message); return }
    onCerrada(`${orden.numero} cerrada${repuestos.length ? ' y repuestos descontados del inventario' : ''}`)
  }

  return (
    <section className="space-y-5 border-t border-feisen-borde-suave pt-5">
      <div>
        <p className={etiquetaCampo}>¿Quién lo arregló?</p>
        <Segmentado valor={quien} onCambiar={setQuien}
          opciones={[{ valor: 'interno', texto: 'Personal de planta' }, { valor: 'externo', texto: 'Proveedor externo' }]} />
        <input value={nombre} onChange={e => setNombre(e.target.value)} className={`${campo} mt-2`}
          placeholder={quien === 'externo' ? 'Nombre del proveedor' : 'Nombre de quien lo hizo'} />
        {quien === 'externo' && (
          <input inputMode="numeric" value={valorServicio} onChange={e => setValorServicio(e.target.value)}
            className={`${campo} mt-2 tabular-nums`} placeholder="Valor del servicio (factura), en pesos" />
        )}
      </div>

      <div>
        <label htmlFor="cierre-trabajo" className={etiquetaCampo}>Qué se hizo <span className="font-normal text-feisen-texto-2">(opcional)</span></label>
        <textarea id="cierre-trabajo" rows={2} value={trabajo} onChange={e => setTrabajo(e.target.value)} className={campo} />
      </div>

      <div className="space-y-2">
        <p className={etiquetaCampo}>Repuestos del inventario</p>
        <div className="flex gap-2">
          <select value={bodegaId} onChange={e => setBodegaId(e.target.value)} aria-label="Bodega de donde salen"
            className="border border-feisen-borde rounded-lg px-2 py-2.5 bg-white text-sm max-w-[40%]">
            {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder={stock ? 'Buscar repuesto' : 'Cargando…'}
              className={`${campo} pl-9`} />
          </div>
        </div>
        {busqueda.trim() && (
          <div className="border border-feisen-borde rounded-lg divide-y divide-feisen-borde-suave max-h-56 overflow-y-auto bg-white">
            {resultados.length === 0 && <p className="px-3 py-2.5 text-sm text-feisen-texto-2">Nada con existencias en esta bodega.</p>}
            {resultados.map(it => (
              <button key={it.id} type="button" onClick={() => agregar(it)} className="w-full flex justify-between gap-3 text-left px-3 py-2.5 min-h-[44px] hover:bg-feisen-fondo">
                <span className="text-sm text-feisen-texto">{it.nombre}</span>
                <span className="text-xs text-feisen-texto-2 tabular-nums whitespace-nowrap">{formatNumero(it.disponible)} {it.unidad_medida}</span>
              </button>
            ))}
          </div>
        )}
        {repuestos.map((r, k) => {
          const p = problema(r)
          return (
            <div key={`${r.item_id}-${r.bodega_id}`} className={`flex items-center gap-3 border rounded-lg px-3 py-2 bg-white ${p ? 'border-feisen-rojo' : 'border-feisen-borde'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-feisen-texto truncate">{r.nombre}</p>
                <p className={`text-xs ${p ? 'text-feisen-rojo' : 'text-feisen-texto-2'}`}>{p || `${r.bodega} · quedan ${formatNumero(r.disponible)} ${r.unidad}`}</p>
              </div>
              <Contador valor={r.cantidad} etiqueta={`Cantidad de ${r.nombre}`} ancho="w-12"
                onCambiar={v => setRepuestos(prev => prev.map((x, j) => j === k ? { ...x, cantidad: v } : x))} />
              <button type="button" onClick={() => setRepuestos(prev => prev.filter((_, j) => j !== k))} aria-label={`Quitar ${r.nombre}`}
                className="p-2 text-gray-400 hover:text-feisen-rojo"><Trash2 size={16} /></button>
            </div>
          )
        })}
      </div>

      <div className="space-y-2">
        <p className={etiquetaCampo}>Comprado aparte</p>
        {compras.map((c, k) => (
          <div key={c.id} className="flex gap-2">
            <input value={c.descripcion} onChange={e => setCompras(prev => prev.map(x => x.id === c.id ? { ...x, descripcion: e.target.value } : x))}
              placeholder="Qué se compró" className={`${campo} flex-1`} aria-label={`Compra ${k + 1}`} />
            <input inputMode="numeric" value={c.valor} onChange={e => setCompras(prev => prev.map(x => x.id === c.id ? { ...x, valor: e.target.value } : x))}
              placeholder="Valor" className={`${campo} w-32 tabular-nums`} aria-label={`Valor compra ${k + 1}`} />
            <button type="button" onClick={() => setCompras(prev => prev.filter(x => x.id !== c.id))} aria-label="Quitar compra"
              className="p-2 text-gray-400 hover:text-feisen-rojo"><Trash2 size={16} /></button>
          </div>
        ))}
        <button type="button" onClick={() => setCompras(prev => [...prev, { id: Date.now(), descripcion: '', valor: '' }])}
          className="flex items-center gap-1.5 text-sm font-medium text-feisen-azul py-1"><Plus size={15} /> Agregar compra</button>
      </div>

      <div className="flex justify-between items-baseline text-sm text-feisen-texto-2">
        <span>Costo total de la orden</span><b className="text-lg text-feisen-texto tabular-nums">{formatCOP(total)}</b>
      </div>
      {orden.inicio_paro && <p className="text-xs text-feisen-texto-2">Al cerrar, el equipo vuelve a quedar operando y se guarda el tiempo parado ({duracion(orden.inicio_paro)}).</p>}

      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}

      <div className="sticky bottom-0 -mx-5 -mb-4 px-5 py-3 bg-white border-t border-feisen-borde-suave flex gap-2">
        <button type="button" onClick={onCancelar} className="min-h-[48px] px-4 rounded-lg border border-feisen-borde text-sm font-medium text-feisen-texto">Cancelar</button>
        <button type="button" onClick={cerrar} disabled={guardando || hayProblemas}
          className="flex-1 min-h-[48px] rounded-lg bg-feisen-azul text-white font-semibold disabled:opacity-50">
          {guardando ? 'Cerrando…' : 'Cerrar y volver a operar'}
        </button>
      </div>
    </section>
  )
}
