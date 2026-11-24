// Coquillada de poleas de aluminio (Fundición). Un solo registro por coquillada: fecha y, por
// polea, cuántas salieron buenas y cuántas dañadas. Al guardar:
//   · sale de Fundición el LINGOTE ALUMINIO = peso × buenas (las dañadas vuelven al horno, no se descuentan)
//   · entran a Fundición las poleas buenas (categoría POLEAS ALUMINIO - FUNDICIÓN)
// El aluminio llega a Fundición por transferencia desde Almacén (lo entrega el almacenista el día
// de la coquillada). Decisiones de Angie, 24/11/2026. Ver OBSERVACIONES.md y
// supabase/migraciones/2026-11-24_coquillada_poleas.sql.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { BODEGA_FUNDICION_ID, CAT_ALUMINIO_FUNDICION_ID, CAT_POLEAS_ALUMINIO_ID, nombreBodega } from '../../utils/bodegasCatalogo'
import { coincideBusqueda } from '../../utils/busqueda'
import { AlertTriangle, Calendar, Disc, History, Plus, Search, X } from '../shared/iconos'
import { EncabezadoPagina, ChipBodega, Segmentado, Contador, PanelLateral, useAviso, useAtajoBuscar } from '../shared/ui'

const numCoq = n => `COQ-${String(n).padStart(4, '0')}`
const kg = n => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })
const num = n => Number(n || 0).toLocaleString('es-CO')
const entero = v => Math.max(0, Math.round(parseFloat(String(v ?? '').replace(',', '.')) || 0))
function hoyCol() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) }
function fmtFecha(f) { if (!f) return '—'; const [y, m, d] = f.split('-'); return `${d}/${m}/${y}` }

const claseInput = 'w-full border border-feisen-borde rounded-lg px-3 min-h-[44px] text-sm bg-white focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'
const claseEtiqueta = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400'

// Consecutivo del usuario (SAL-/ENT-iniciales-0001), igual que en Fundidas y Recogida
async function generarNumero(perfil, prefijo) {
  const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
  const pre = `${prefijo}-${iniciales}-`
  const { data: last } = await supabase.from('movimientos').select('numero').like('numero', `${pre}%`)
    .order('numero', { ascending: false }).limit(1).maybeSingle()
  const n = last?.numero ? parseInt(last.numero.replace(pre, ''), 10) || 0 : 0
  return `${pre}${String(n + 1).padStart(4, '0')}`
}

function Cifra({ etiqueta, valor, detalle, alerta }) {
  return (
    <div className="bg-white border border-feisen-borde rounded-xl px-4 py-3 min-w-0">
      <p className={claseEtiqueta}>{etiqueta}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-0.5 truncate ${alerta ? 'text-amber-700' : 'text-feisen-texto'}`}>{valor}</p>
      {detalle && <p className="text-xs text-feisen-texto-2 truncate">{detalle}</p>}
    </div>
  )
}

export default function Coquillada() {
  const { perfil } = useAuth()
  const [aviso, avisar] = useAviso()
  const buscarRef = useRef(null)
  useAtajoBuscar(buscarRef)

  const [vista, setVista]         = useState('registrar')
  const [cargando, setCargando]   = useState(true)
  const [poleas, setPoleas]       = useState([])   // [{ id, nombre, peso_unitario, precio_costo, stock }]
  const [aluminio, setAluminio]   = useState(null) // { id, nombre, precio_costo, stock }
  const [historial, setHistorial] = useState([])   // coquilladas con sus piezas
  const [abierta, setAbierta]     = useState(null)

  const [fecha, setFecha]         = useState(hoyCol())
  const [obs, setObs]             = useState('')
  const [cant, setCant]           = useState({})   // { [itemId]: { buenas, danadas } }
  const [busqueda, setBusqueda]   = useState('')
  const [error, setError]         = useState('')
  const [guardando, setGuardando] = useState(false)
  // Coquillada ya guardada a la que le faltan los movimientos de inventario (reintento sin duplicar)
  const [pendiente, setPendiente] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: its }, { data: coqs }] = await Promise.all([
      supabase.from('items').select('id, nombre, peso_unitario, precio_costo, categoria_id')
        .eq('bodega_id', BODEGA_FUNDICION_ID).eq('activo', true)
        .in('categoria_id', [CAT_POLEAS_ALUMINIO_ID, CAT_ALUMINIO_FUNDICION_ID]),
      supabase.from('coquilladas')
        .select('id, numero, fecha, kg_aluminio, kg_retorno, observaciones, created_at, coquillada_piezas(id, item_id, buenas, danadas, peso_unitario, items(nombre))')
        .order('numero', { ascending: false }).limit(60),
    ])
    const ids = (its || []).map(i => i.id)
    const { data: st } = ids.length
      ? await supabase.from('stock').select('item_id, cantidad_actual').in('item_id', ids).eq('bodega_id', BODEGA_FUNDICION_ID)
      : { data: [] }
    const stock = Object.fromEntries((st || []).map(s => [s.item_id, Number(s.cantidad_actual ?? 0)]))
    const conStock = (its || []).map(i => ({ ...i, stock: stock[i.id] ?? 0 }))
    // Orden natural por medida ("2X1" antes que "10X1"); los nombres sin número al final
    const clave = n => { const m = String(n).match(/^(\d+)(?:\s+(\d)\/(\d))?/); return m ? Number(m[1]) + (m[2] ? m[2] / m[3] : 0) : 999 }
    setPoleas(conStock.filter(i => i.categoria_id === CAT_POLEAS_ALUMINIO_ID)
      .sort((a, b) => clave(a.nombre) - clave(b.nombre) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true })))
    const alums = conStock.filter(i => i.categoria_id === CAT_ALUMINIO_FUNDICION_ID)
    setAluminio(alums.find(i => /lingote/i.test(i.nombre)) || alums[0] || null)
    setHistorial(coqs || [])
    setCargando(false)
  }

  const setC = (id, campo, v) => setCant(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [campo]: v } }))
  const getC = (id, campo) => cant[id]?.[campo] ?? ''

  const filas = poleas
    .map(p => ({ polea: p, buenas: entero(getC(p.id, 'buenas')), danadas: entero(getC(p.id, 'danadas')) }))
    .filter(f => f.buenas > 0 || f.danadas > 0)
  const totBuenas  = filas.reduce((s, f) => s + f.buenas, 0)
  const totDanadas = filas.reduce((s, f) => s + f.danadas, 0)
  const kgBuenas   = filas.reduce((s, f) => s + f.buenas * Number(f.polea.peso_unitario || 0), 0)
  const kgRetorno  = filas.reduce((s, f) => s + f.danadas * Number(f.polea.peso_unitario || 0), 0)
  const faltaAl    = aluminio && kgBuenas > aluminio.stock

  const visibles = busqueda.trim() ? poleas.filter(p => coincideBusqueda(p.nombre, busqueda)) : poleas

  // Indicadores del mes
  const mes = hoyCol().slice(0, 7)
  const delMes = historial.filter(c => (c.fecha || '').startsWith(mes))
  const mesBuenas  = delMes.reduce((s, c) => s + (c.coquillada_piezas || []).reduce((a, p) => a + Number(p.buenas), 0), 0)
  const mesDanadas = delMes.reduce((s, c) => s + (c.coquillada_piezas || []).reduce((a, p) => a + Number(p.danadas), 0), 0)
  const pctDanadas = mesBuenas + mesDanadas > 0 ? Math.round((mesDanadas / (mesBuenas + mesDanadas)) * 100) : null

  async function guardar() {
    setError('')
    if (!aluminio) { setError('No hay aluminio creado en la bodega Fundición (categoría ALUMINIO - FUNDICIÓN).'); return }
    if (!pendiente) {
      if (!fecha) { setError('Escribe la fecha de la coquillada.'); return }
      if (filas.length === 0) { setError('Anota al menos una polea buena o dañada.'); return }
      const sinPeso = filas.filter(f => !Number(f.polea.peso_unitario)).map(f => f.polea.nombre)
      if (sinPeso.length) { setError(`Estas poleas no tienen peso: ${sinPeso.join(', ')}. Ponle el peso en Productos antes de registrar.`); return }
    }
    setGuardando(true)
    try {
      // Stock de aluminio al momento de guardar (no el que se cargó al abrir la pantalla)
      const { data: stAl, error: errSt } = await supabase.from('stock').select('cantidad_actual')
        .eq('item_id', aluminio.id).eq('bodega_id', BODEGA_FUNDICION_ID).maybeSingle()
      if (errSt) throw errSt

      // 1. La coquillada y sus poleas (si un intento anterior ya la guardó, se reutiliza)
      let coq = pendiente
      if (!coq) {
        const disponible = Number(stAl?.cantidad_actual ?? 0)
        if (kgBuenas > disponible) {
          setError(`No alcanza el aluminio en Fundición: las buenas pesan ${kg(kgBuenas)} kg y hay ${kg(disponible)} kg. Pide al almacenista que transfiera ${kg(kgBuenas - disponible)} kg más de ${aluminio.nombre}.`)
          return
        }
        const { data: cab, error: e1 } = await supabase.from('coquilladas')
          .insert({ fecha, kg_aluminio: kgBuenas, kg_retorno: kgRetorno, observaciones: obs.trim() || null, usuario_id: perfil.id })
          .select('id, numero').single()
        if (e1) throw e1
        coq = {
          ...cab, fecha, kgBuenas,
          filas: filas.map(f => ({ id: f.polea.id, nombre: f.polea.nombre, buenas: f.buenas, danadas: f.danadas,
            peso: Number(f.polea.peso_unitario), precio: Number(f.polea.precio_costo || 0) })),
        }
        setPendiente(coq)
      }

      // Las poleas de la coquillada (si ya están, no se repiten)
      const { data: pzPrev, error: ePz } = await supabase.from('coquillada_piezas').select('id').eq('coquillada_id', coq.id)
      if (ePz) throw ePz
      if ((pzPrev || []).length === 0) {
        const { error: e2 } = await supabase.from('coquillada_piezas').insert(coq.filas.map(f => ({
          coquillada_id: coq.id, item_id: f.id, buenas: f.buenas, danadas: f.danadas, peso_unitario: f.peso,
        })))
        if (e2) throw e2
      }

      // 2. Movimientos de inventario, cada uno solo si no existe ya (reintento sin duplicar)
      const ref = numCoq(coq.numero)
      const cc = await nombreBodega(BODEGA_FUNDICION_ID, 'FUNDICIÓN')
      const base = {
        bodega_destino_id: null, bodega_origen_id: null, centro_costo: cc, usuario_id: perfil.id, referencia: ref,
        fecha_movimiento: coq.fecha, foto_remision_url: null, destino: null, numero_of: null, serial_motor: null, cliente: null, proveedor: null,
      }
      const existentes = async (tipo, ids) => {
        const { data, error } = await supabase.from('movimientos').select('id').eq('referencia', ref).eq('tipo', tipo)
          .in('item_id', ids).eq('revertido', false)
        if (error) throw error
        return (data || []).length > 0
      }
      if (coq.kgBuenas > 0 && !(await existentes('salida', [aluminio.id]))) {
        const { error } = await supabase.from('movimientos').insert({
          ...base, numero: await generarNumero(perfil, 'SAL'), tipo: 'salida', item_id: aluminio.id,
          bodega_origen_id: BODEGA_FUNDICION_ID, cantidad: Math.round(coq.kgBuenas * 1000) / 1000,
          precio_costo_snapshot: Number(aluminio.precio_costo || 0), motivo: 'Consumo coquillada de poleas',
        })
        if (error) throw error
      }
      const buenas = coq.filas.filter(f => f.buenas > 0)
      if (buenas.length && !(await existentes('entrada', buenas.map(f => f.id)))) {
        const numEnt = await generarNumero(perfil, 'ENT')
        const { error } = await supabase.from('movimientos').insert(buenas.map(f => ({
          ...base, numero: numEnt, tipo: 'entrada', item_id: f.id, bodega_destino_id: BODEGA_FUNDICION_ID,
          cantidad: f.buenas, precio_costo_snapshot: f.precio, proveedor: 'Producción interna', motivo: 'Coquillada de poleas',
        })))
        if (error) throw error
      }

      setPendiente(null); setCant({}); setObs(''); setBusqueda('')
      avisar(`Coquillada ${ref} registrada`, { texto: 'Ver historial', alHacer: () => setVista('historial') }, 6000)
      await cargar()
    } catch (e) {
      setError(`Error al guardar: ${e.message}. Puedes volver a intentar: lo que alcanzó a guardarse no se repite.`)
    } finally {
      setGuardando(false)
    }
  }

  const coqAbierta = historial.find(c => c.id === abierta)

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {aviso}
      <EncabezadoPagina modulo="Fundición" titulo="Coquillada de poleas"
        subtitulo={<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">Poleas de aluminio que salen de la coquilla · Bodega <ChipBodega>Fundición</ChipBodega></span>} />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Cifra etiqueta="Aluminio en Fundición" valor={aluminio ? `${kg(aluminio.stock)} kg` : '—'}
          detalle={aluminio ? aluminio.nombre : 'no está creado'} alerta={!aluminio || aluminio.stock <= 0} />
        <Cifra etiqueta="Buenas este mes" valor={num(mesBuenas)} detalle={`${delMes.length} coquillada${delMes.length !== 1 ? 's' : ''}`} />
        <Cifra etiqueta="Dañadas este mes" valor={pctDanadas == null ? '—' : `${pctDanadas}%`}
          detalle={`${num(mesDanadas)} poleas`} alerta={pctDanadas != null && pctDanadas >= 10} />
      </div>

      <Segmentado valor={vista} onCambiar={setVista} opciones={[
        { valor: 'registrar', texto: 'Registrar', icono: Plus },
        { valor: 'historial', texto: `Historial · ${historial.length}`, icono: History },
      ]} />

      {cargando && <p className="text-center text-sm text-feisen-texto-2 py-12" aria-busy="true">Cargando…</p>}

      {/* ── Registrar ── */}
      {!cargando && vista === 'registrar' && (
        poleas.length === 0 ? (
          <div className="bg-white border border-feisen-borde rounded-xl px-6 py-10 text-center">
            <Disc size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium text-feisen-texto">No hay poleas de aluminio en el catálogo</p>
            <p className="text-xs text-feisen-texto-2 mt-1">Créalas en Productos, bodega Fundición, categoría POLEAS ALUMINIO - FUNDICIÓN, con su peso en kg.</p>
          </div>
        ) : (
          <>
            {aluminio && aluminio.stock <= 0 && (
              <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                No hay aluminio en Fundición. El almacenista debe transferir {aluminio.nombre} desde Almacén antes de registrar.
              </p>
            )}

            <section className="bg-white border border-feisen-borde rounded-xl p-4 grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-feisen-texto block mb-1.5">Fecha</span>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} disabled={!!pendiente} className={claseInput} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-feisen-texto block mb-1.5">Observaciones <span className="text-gray-400 font-normal">(opcional)</span></span>
                <input value={obs} onChange={e => setObs(e.target.value)} disabled={!!pendiente} placeholder="Ej: coquilla caliente, se trabó la 8X2" className={claseInput} />
              </label>
            </section>

            {error && (
              <div role="alert" className="flex items-start gap-2 bg-feisen-rojo-suave text-feisen-rojo text-sm rounded-lg px-3 py-2.5">
                <AlertTriangle size={16} className="shrink-0 mt-px" /> <span>{error}</span>
              </div>
            )}

            {pendiente ? (
              <p className="text-sm text-feisen-texto-2 bg-white border border-feisen-borde rounded-xl px-4 py-3">
                La coquillada <span className="font-mono font-semibold text-feisen-texto">{numCoq(pendiente.numero)}</span> ya quedó guardada;
                falta actualizar el inventario. Toca “Reintentar”: no se vuelve a crear la coquillada.
              </p>
            ) : (
              <section className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
                <div className="p-3 border-b border-feisen-borde-suave">
                  <div className="relative">
                    <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-texto-2 pointer-events-none" />
                    <input ref={buscarRef} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar polea (ej: 8x2, tambor)"
                      className={`${claseInput} pl-10 pr-10`} />
                    {busqueda && (
                      <button type="button" aria-label="Borrar búsqueda" onClick={() => setBusqueda('')}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center text-feisen-texto-2"><X size={16} /></button>
                    )}
                  </div>
                  <p className="text-xs text-feisen-texto-2 mt-2">Anota cuántas salieron buenas y cuántas dañadas. Deja en blanco las que no se coquillaron.</p>
                </div>
                {visibles.length === 0 ? (
                  <p className="text-sm text-feisen-texto-2 text-center py-8">Ninguna polea coincide con “{busqueda}”.</p>
                ) : (
                  <ul className="divide-y divide-feisen-borde-suave">
                    {visibles.map(p => {
                      const b = entero(getC(p.id, 'buenas')), d = entero(getC(p.id, 'danadas'))
                      return (
                        <li key={p.id} className={`px-4 py-3 sm:flex sm:items-center sm:gap-4 ${b || d ? 'bg-feisen-azul-suave/40' : ''}`}>
                          <div className="flex-1 min-w-0 mb-2 sm:mb-0">
                            <p className="text-sm font-semibold text-feisen-texto">{p.nombre}</p>
                            <p className="text-xs text-feisen-texto-2 tabular-nums">
                              {kg(p.peso_unitario)} kg c/u · en bodega {num(p.stock)}
                              {b > 0 && <span className="text-feisen-azul font-medium"> · {kg(b * Number(p.peso_unitario || 0))} kg de aluminio</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-center">
                              <p className="text-[11px] text-feisen-texto-2 mb-1">Buenas</p>
                              <Contador valor={getC(p.id, 'buenas')} onCambiar={v => setC(p.id, 'buenas', v.replace(/[^0-9]/g, ''))}
                                etiqueta={`Buenas de ${p.nombre}`} ancho="w-12" />
                            </div>
                            <div className="text-center">
                              <p className="text-[11px] text-feisen-texto-2 mb-1">Dañadas</p>
                              <Contador valor={getC(p.id, 'danadas')} onCambiar={v => setC(p.id, 'danadas', v.replace(/[^0-9]/g, ''))}
                                etiqueta={`Dañadas de ${p.nombre}`} ancho="w-12" />
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )}

            {/* Barra fija: resumen y acción principal */}
            <div className="sticky bottom-[calc(4.5rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10">
              <div className="bg-white border border-feisen-borde rounded-xl shadow-sm px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-feisen-texto tabular-nums truncate">
                    {pendiente ? numCoq(pendiente.numero) : `${num(totBuenas)} buenas · ${num(totDanadas)} dañadas`}
                  </p>
                  <p className={`text-xs tabular-nums truncate ${faltaAl && !pendiente ? 'text-amber-700' : 'text-feisen-texto-2'}`}>
                    {pendiente ? 'Guardada · falta el inventario'
                      : `Descuenta ${kg(kgBuenas)} kg de aluminio${kgRetorno > 0 ? ` · ${kg(kgRetorno)} kg vuelven al horno` : ''}${faltaAl ? ' · no alcanza' : ''}`}
                  </p>
                </div>
                <button type="button" onClick={guardar} disabled={guardando}
                  className="bg-feisen-azul text-white rounded-lg px-5 min-h-[48px] text-[15px] font-semibold disabled:opacity-60 hover:opacity-90 active:scale-[.98] transition shrink-0">
                  {guardando ? 'Guardando…' : pendiente ? 'Reintentar' : <>Registrar<span className="hidden sm:inline"> coquillada</span></>}
                </button>
              </div>
            </div>
          </>
        )
      )}

      {/* ── Historial ── */}
      {!cargando && vista === 'historial' && (
        historial.length === 0 ? (
          <div className="bg-white border border-feisen-borde rounded-xl px-6 py-10 text-center">
            <History size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium text-feisen-texto">Aún no hay coquilladas registradas</p>
            <p className="text-xs text-feisen-texto-2 mt-1">Registra la primera en la pestaña “Registrar”.</p>
          </div>
        ) : (
          <ul className="bg-white border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave overflow-hidden">
            {historial.map(c => {
              const pz = c.coquillada_piezas || []
              const b = pz.reduce((s, p) => s + Number(p.buenas), 0), d = pz.reduce((s, p) => s + Number(p.danadas), 0)
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setAbierta(c.id)} className="w-full flex items-center gap-3 px-4 py-3 min-h-[64px] text-left hover:bg-feisen-fondo">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm font-semibold text-feisen-texto">{numCoq(c.numero)}</p>
                      <p className="text-xs text-feisen-texto-2 flex items-center gap-1"><Calendar size={12} /> {fmtFecha(c.fecha)} · {pz.length} referencia{pz.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-feisen-texto tabular-nums">{num(b)} buenas</p>
                      <p className={`text-xs tabular-nums ${d > 0 ? 'text-amber-700' : 'text-feisen-texto-2'}`}>{num(d)} dañadas · {kg(c.kg_aluminio)} kg</p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )
      )}

      {coqAbierta && (
        <PanelLateral etiqueta={`Coquillada ${numCoq(coqAbierta.numero)}`} onCerrar={() => setAbierta(null)}
          encabezado={<div>
            <h3 className="font-mono text-base font-semibold text-feisen-texto">{numCoq(coqAbierta.numero)}</h3>
            <p className="text-xs text-feisen-texto-2 flex items-center gap-1 mt-1"><Calendar size={13} /> {fmtFecha(coqAbierta.fecha)}</p>
          </div>}>
          <section className="grid grid-cols-2 gap-3">
            <div><p className={claseEtiqueta}>Aluminio descontado</p><p className="text-xl font-semibold tabular-nums">{kg(coqAbierta.kg_aluminio)} kg</p></div>
            <div><p className={claseEtiqueta}>Volvió al horno</p><p className="text-xl font-semibold tabular-nums">{kg(coqAbierta.kg_retorno)} kg</p></div>
          </section>
          {coqAbierta.observaciones && <p className="text-sm text-feisen-texto bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{coqAbierta.observaciones}</p>}
          <ul className="divide-y divide-feisen-borde-suave border-y border-feisen-borde-suave">
            {(coqAbierta.coquillada_piezas || []).map(p => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-feisen-texto">{p.items?.nombre}</p>
                  <p className="text-xs text-feisen-texto-2 tabular-nums">{kg(p.peso_unitario)} kg c/u</p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-sm font-semibold text-feisen-texto">{num(p.buenas)} buenas</p>
                  <p className={`text-xs ${Number(p.danadas) > 0 ? 'text-amber-700' : 'text-feisen-texto-2'}`}>{num(p.danadas)} dañadas</p>
                </div>
              </li>
            ))}
          </ul>
        </PanelLateral>
      )}
    </div>
  )
}
