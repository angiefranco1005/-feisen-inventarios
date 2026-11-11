import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { exportarTransferenciasInternas } from '../../utils/exportExcel'
import { fetchAllPages } from '../../utils/fetchAllPages'
import Alerta from '../shared/Alerta'
import { MoveRight, Download, RefreshCw } from '../shared/iconos'

// ─────────────────────────────────────────────────────────────────────────────
//  Informe: Transferencias internas entre bodegas (11/11/2026, pedido de Angie).
//  Qué le pasó cada bodega a otra (Fundición → Mecanizados, Mecanizados →
//  Armado y Soldadura, …) en un período: productos, cantidades y valor.
//  Reemplaza a "Ventas internas de Fundición" (16/10/2026), que era lo mismo
//  solo con origen Fundición; esa ruta abre este informe con Fundición elegida.
//
//  Reglas (las mismas de "Ventas internas"):
//   - Solo cuenta la SALIDA de la bodega origen (tipo 'salida' con bodega_destino
//     distinta). No se suma la entrada pareada (REC-) del destino: duplicaría.
//   - Valor = cantidad × precio_costo_snapshot (costo guardado en el movimiento).
//     Costo 0 → "sin costo", vale $0 (el Excel trae el costo actual de referencia).
//   - Se excluyen movimientos revertidos y los de reversión.
//   - Fecha = fecha_movimiento (si no hay, fecha de creación).
//   - Kg = cantidad × peso_unitario del producto (útil para hierro).
// ─────────────────────────────────────────────────────────────────────────────

const hoy = new Date()
const pad = (n) => String(n).padStart(2, '0')
const primerDiaMes = () => `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-01`
const ultimoDiaMes = () => {
  const u = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  return `${u.getFullYear()}-${pad(u.getMonth() + 1)}-${pad(u.getDate())}`
}
const mesAnterior = () => {
  const i = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const u = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
  return [`${i.getFullYear()}-${pad(i.getMonth() + 1)}-01`, `${u.getFullYear()}-${pad(u.getMonth() + 1)}-${pad(u.getDate())}`]
}

const fmt = (n) => `$${Math.round(n || 0).toLocaleString('es-CO')}`
const fmtNum = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString('es-CO')
const sinTildes = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

export default function InformeTransferenciasInternas({ origenFundicion = false }) {
  const { esAdmin } = useAuth()
  const [fechaInicio, setFechaInicio] = useState(primerDiaMes())
  const [fechaFin,    setFechaFin]    = useState(ultimoDiaMes())
  const [bodegas,     setBodegas]     = useState([])
  const [origenId,    setOrigenId]    = useState('')
  const [destinoId,   setDestinoId]   = useState('')
  const [cargando,    setCargando]    = useState(false)
  const [error,       setError]       = useState('')
  const [resultado,   setResultado]   = useState(null)
  const [ruta,        setRuta]        = useState('')   // ruta elegida en el resumen ('' = todas)
  const [buscar,      setBuscar]      = useState('')

  useEffect(() => {
    supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        const lista = data || []
        setBodegas(lista)
        if (origenFundicion) {
          const f = lista.find(b => sinTildes(b.nombre).includes('FUNDICION'))
          if (f) setOrigenId(f.id)
        }
      })
  }, [origenFundicion])

  async function generar() {
    setCargando(true)
    setError('')
    setResultado(null)
    setRuta('')
    try {
      const { data, error: err } = await fetchAllPages((desde, hasta) => {
        let q = supabase
          .from('movimientos')
          .select('id, numero, fecha_movimiento, created_at, cantidad, precio_costo_snapshot, referencia, bodega_origen_id, bodega_destino_id, items(nombre, unidad_medida, precio_costo, peso_unitario, categorias(nombre)), bodegas_origen:bodega_origen_id(nombre), bodegas_destino:bodega_destino_id(nombre), profiles(nombre)')
          .eq('tipo', 'salida')
          .not('bodega_origen_id', 'is', null)
          .not('bodega_destino_id', 'is', null)
          .is('revertido_en', null)
          .or('revertido.is.null,revertido.eq.false')
          .or(`and(fecha_movimiento.gte.${fechaInicio},fecha_movimiento.lte.${fechaFin}),and(fecha_movimiento.is.null,created_at.gte.${fechaInicio}T00:00:00,created_at.lte.${fechaFin}T23:59:59)`)
        if (origenId)  q = q.eq('bodega_origen_id', origenId)
        if (destinoId) q = q.eq('bodega_destino_id', destinoId)
        return q.order('created_at', { ascending: true }).order('id', { ascending: true }).range(desde, hasta)
      })
      if (err) throw err

      const filas = (data || [])
        .filter(m => m.bodega_origen_id && m.bodega_destino_id && m.bodega_destino_id !== m.bodega_origen_id)
        .map(m => {
          const costo = Number(m.precio_costo_snapshot) || 0
          const cantidad = Number(m.cantidad) || 0
          const origen = m.bodegas_origen?.nombre || '(sin nombre)'
          const destino = m.bodegas_destino?.nombre || '(sin nombre)'
          return {
            id: m.id,
            fecha: (m.fecha_movimiento || m.created_at || '').slice(0, 10),
            numero: m.numero || '',
            producto: m.items?.nombre || '(producto eliminado)',
            categoria: m.items?.categorias?.nombre || '',
            origen, destino, ruta: `${origen} → ${destino}`,
            cantidad,
            unidad: m.items?.unidad_medida || '',
            kg: cantidad * (Number(m.items?.peso_unitario) || 0),
            costo,
            valor: cantidad * costo,
            costoActual: Number(m.items?.precio_costo) || 0,
            usuario: m.profiles?.nombre || '',
            referencia: m.referencia || '',
            sinCosto: costo <= 0,
          }
        })
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero))

      // Resumen por ruta (origen → destino)
      const porRuta = {}
      for (const f of filas) {
        const r = (porRuta[f.ruta] ||= { ruta: f.ruta, origen: f.origen, destino: f.destino, movs: new Set(), prods: new Set(), lineas: 0, cantidad: 0, kg: 0, valor: 0, sinCosto: 0 })
        r.movs.add(f.numero || f.id); r.prods.add(f.producto)
        r.lineas += 1; r.cantidad += f.cantidad; r.kg += f.kg; r.valor += f.valor
        if (f.sinCosto) r.sinCosto += 1
      }
      const rutas = Object.values(porRuta)
        .map(({ movs, prods, ...r }) => ({ ...r, movimientos: movs.size, productos: prods.size }))
        .sort((a, b) => b.valor - a.valor)

      // Por producto dentro de cada ruta
      const porProd = {}
      for (const f of filas) {
        const k = `${f.ruta}|${f.producto}`
        const p = (porProd[k] ||= { ruta: f.ruta, origen: f.origen, destino: f.destino, producto: f.producto, categoria: f.categoria, unidad: f.unidad, cantidad: 0, kg: 0, valor: 0, sinCosto: 0, veces: 0 })
        p.cantidad += f.cantidad; p.kg += f.kg; p.valor += f.valor; p.veces += 1
        if (f.sinCosto) p.sinCosto += 1
      }
      const productos = Object.values(porProd)
        .map(p => ({ ...p, costoProm: p.cantidad ? p.valor / p.cantidad : 0 }))
        .sort((a, b) => a.ruta.localeCompare(b.ruta) || b.valor - a.valor)

      setResultado({
        filas, rutas, productos,
        totalValor: filas.reduce((s, f) => s + f.valor, 0),
        totalCantidad: filas.reduce((s, f) => s + f.cantidad, 0),
        totalKg: filas.reduce((s, f) => s + f.kg, 0),
        totalMovimientos: new Set(filas.map(f => f.numero || f.id)).size,
        sinCosto: filas.filter(f => f.sinCosto).length,
      })
    } catch (e) {
      setError('No se pudo generar el informe: ' + (e.message || e))
    } finally {
      setCargando(false)
    }
  }

  // Calcula solo al cambiar filtros (y al abrir, cuando ya cargaron las bodegas)
  useEffect(() => {
    if (!esAdmin || !bodegas.length || !fechaInicio || !fechaFin || fechaInicio > fechaFin) return
    generar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdmin, bodegas.length, fechaInicio, fechaFin, origenId, destinoId])

  const productosVista = useMemo(() => {
    if (!resultado) return []
    const q = sinTildes(buscar).trim().split(/\s+/).filter(Boolean)
    return resultado.productos.filter(p =>
      (!ruta || p.ruta === ruta) &&
      q.every(w => sinTildes(`${p.producto} ${p.categoria}`).includes(w)))
  }, [resultado, ruta, buscar])

  const totVista = useMemo(() => productosVista.reduce((s, p) => ({
    cantidad: s.cantidad + p.cantidad, kg: s.kg + p.kg, valor: s.valor + p.valor,
  }), { cantidad: 0, kg: 0, valor: 0 }), [productosVista])

  function descargar() {
    if (!resultado) return
    const nom = (id) => bodegas.find(b => b.id === id)?.nombre
    exportarTransferenciasInternas(resultado, fechaInicio, fechaFin, {
      origen: nom(origenId) || 'Todas', destino: nom(destinoId) || 'Todas',
    })
  }

  if (!esAdmin) {
    return (
      <div className="max-w-3xl mx-auto">
        <Alerta tipo="alerta" mensaje="Este informe muestra valores en pesos y solo está disponible para el administrador." />
      </div>
    )
  }

  const [mAntIni, mAntFin] = mesAnterior()
  const chips = [
    { label: 'Este mes',     ini: primerDiaMes(), fin: ultimoDiaMes() },
    { label: 'Mes anterior', ini: mAntIni,        fin: mAntFin },
    { label: 'Este año',     ini: `${hoy.getFullYear()}-01-01`, fin: `${hoy.getFullYear()}-12-31` },
  ]
  const input = 'w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white'
  const th = 'px-3 py-2.5 text-xs font-semibold text-gray-500'
  const hayKg = resultado?.totalKg > 0

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-feisen-azul flex items-center gap-2">
          <MoveRight size={24} /> Transferencias internas
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Lo que cada bodega le pasó a otra en el período: productos, cantidades y valor al costo de cada movimiento.
          Cuenta la salida de la bodega que entrega (no la entrada del destino, para no contar doble) y no incluye movimientos revertidos.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-feisen-borde p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Desde</label>
            <input type="date" value={fechaInicio} max={fechaFin || undefined} onChange={e => setFechaInicio(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Hasta</label>
            <input type="date" value={fechaFin} min={fechaInicio || undefined} onChange={e => setFechaFin(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Entrega (origen)</label>
            <select value={origenId} onChange={e => { setOrigenId(e.target.value); if (e.target.value === destinoId) setDestinoId('') }} className={input}>
              <option value="">Todas las bodegas</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Recibe (destino)</label>
            <select value={destinoId} onChange={e => setDestinoId(e.target.value)} className={input}>
              <option value="">Todas las bodegas</option>
              {bodegas.filter(b => b.id !== origenId).map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chips.map(c => {
            const activo = fechaInicio === c.ini && fechaFin === c.fin
            return (
              <button key={c.label} onClick={() => { setFechaInicio(c.ini); setFechaFin(c.fin) }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${activo ? 'bg-feisen-azul text-white border-feisen-azul' : 'border-feisen-borde text-gray-600 hover:bg-gray-50'}`}>
                {c.label}
              </button>
            )
          })}
          <div className="flex-1" />
          {cargando && <span className="flex items-center gap-1.5 text-xs text-gray-500"><RefreshCw size={14} className="animate-spin" /> Calculando…</span>}
          <button onClick={descargar} disabled={!resultado || cargando || !resultado.filas.length}
            className="flex items-center gap-2 bg-feisen-azul text-white px-4 py-2 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
            <Download size={16} /> Descargar Excel
          </button>
        </div>
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}

      {resultado && (
        resultado.filas.length === 0 ? (
          <div className="bg-white rounded-xl text-center py-12 text-gray-400 border border-feisen-borde">
            No hay transferencias entre bodegas con estos filtros.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Valor transferido', valor: fmt(resultado.totalValor), color: 'text-feisen-azul' },
                { label: 'Unidades', valor: fmtNum(resultado.totalCantidad), sub: hayKg ? `${fmtNum(resultado.totalKg)} kg` : null, color: 'text-gray-800' },
                { label: 'Movimientos', valor: resultado.totalMovimientos.toLocaleString('es-CO'), sub: `${resultado.filas.length.toLocaleString('es-CO')} líneas`, color: 'text-gray-800' },
                { label: 'Líneas sin costo', valor: resultado.sinCosto.toLocaleString('es-CO'), sub: resultado.sinCosto ? 'valen $0' : null, color: resultado.sinCosto ? 'text-feisen-rojo' : 'text-green-700' },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-xl border border-feisen-borde p-4">
                  <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                  <p className={`font-bold text-lg ${k.color}`}>{k.valor}</p>
                  {k.sub && <p className="text-xs text-gray-400">{k.sub}</p>}
                </div>
              ))}
            </div>

            {resultado.sinCosto > 0 && (
              <Alerta tipo="alerta"
                mensaje={`${resultado.sinCosto} línea(s) se registraron con costo $0, así que no suman valor. En el Excel van en rojo, con el costo actual del producto como referencia.`} />
            )}

            {/* Resumen por ruta */}
            <div className="bg-white rounded-xl border border-feisen-borde overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-sm font-semibold text-gray-700">Quién le pasó a quién</p>
                <p className="text-xs text-gray-400">Toca una fila para ver sus productos abajo.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className={`${th} text-left`}>Entrega → Recibe</th>
                      <th className={`${th} text-right hidden sm:table-cell`}>Movimientos</th>
                      <th className={`${th} text-right hidden sm:table-cell`}>Productos</th>
                      <th className={`${th} text-right`}>Unidades</th>
                      {hayKg && <th className={`${th} text-right hidden md:table-cell`}>Kg</th>}
                      <th className={`${th} text-right`}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.rutas.map(r => {
                      const activa = ruta === r.ruta
                      return (
                        <tr key={r.ruta} onClick={() => setRuta(activa ? '' : r.ruta)}
                          className={`border-t border-gray-100 cursor-pointer transition-colors ${activa ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-3 py-2.5 font-medium text-gray-800">
                            {r.origen} <span className="text-gray-400">→</span> {r.destino}
                            {r.sinCosto > 0 && <span className="ml-2 text-xs text-feisen-rojo">{r.sinCosto} sin costo</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600 hidden sm:table-cell">{r.movimientos}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600 hidden sm:table-cell">{r.productos}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{fmtNum(r.cantidad)}</td>
                          {hayKg && <td className="px-3 py-2.5 text-right text-gray-600 hidden md:table-cell">{fmtNum(r.kg)}</td>}
                          <td className="px-3 py-2.5 text-right font-semibold text-feisen-azul whitespace-nowrap">{fmt(r.valor)}</td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-feisen-azul bg-blue-50/60">
                      <td className="px-3 py-2.5 font-bold text-feisen-azul">Total</td>
                      <td className="px-3 py-2.5 text-right font-bold text-feisen-azul hidden sm:table-cell">{resultado.totalMovimientos}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell" />
                      <td className="px-3 py-2.5 text-right font-bold text-feisen-azul">{fmtNum(resultado.totalCantidad)}</td>
                      {hayKg && <td className="px-3 py-2.5 text-right font-bold text-feisen-azul hidden md:table-cell">{fmtNum(resultado.totalKg)}</td>}
                      <td className="px-3 py-2.5 text-right font-bold text-feisen-azul whitespace-nowrap">{fmt(resultado.totalValor)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Productos */}
            <div className="bg-white rounded-xl border border-feisen-borde overflow-hidden">
              <div className="px-4 pt-4 pb-3 flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-gray-700 mr-auto">
                  Productos {ruta ? <span className="font-normal text-gray-500">· {ruta}</span> : <span className="font-normal text-gray-500">· todas las rutas</span>}
                  {ruta && <button onClick={() => setRuta('')} className="ml-2 text-xs text-feisen-azul underline">ver todas</button>}
                </p>
                <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar producto…"
                  className="border border-feisen-borde rounded-lg px-3 py-1.5 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
              </div>
              <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className={`${th} text-left`}>Producto</th>
                      {!ruta && <th className={`${th} text-left hidden md:table-cell`}>Entrega → Recibe</th>}
                      <th className={`${th} text-right`}>Cantidad</th>
                      {hayKg && <th className={`${th} text-right hidden md:table-cell`}>Kg</th>}
                      <th className={`${th} text-right hidden sm:table-cell`}>Costo prom.</th>
                      <th className={`${th} text-right`}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosVista.map(p => (
                      <tr key={`${p.ruta}|${p.producto}`} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-800">
                          {p.producto}
                          {p.categoria && <span className="block text-xs text-gray-400">{p.categoria}</span>}
                          {!ruta && <span className="block text-xs text-gray-500 md:hidden">{p.origen} → {p.destino}</span>}
                        </td>
                        {!ruta && <td className="px-3 py-2 text-gray-600 text-xs hidden md:table-cell">{p.origen} → {p.destino}</td>}
                        <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{fmtNum(p.cantidad)} <span className="text-xs text-gray-400">{p.unidad}</span></td>
                        {hayKg && <td className="px-3 py-2 text-right text-gray-600 hidden md:table-cell">{p.kg ? fmtNum(p.kg) : '—'}</td>}
                        <td className="px-3 py-2 text-right text-gray-600 hidden sm:table-cell whitespace-nowrap">
                          {p.sinCosto === p.veces ? <span className="text-feisen-rojo font-semibold">sin costo</span> : fmt(p.costoProm)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">{fmt(p.valor)}</td>
                      </tr>
                    ))}
                    {productosVista.length === 0 && (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Ningún producto coincide con la búsqueda.</td></tr>
                    )}
                  </tbody>
                  {productosVista.length > 0 && (
                    <tfoot className="sticky bottom-0 bg-blue-50">
                      <tr className="border-t-2 border-feisen-azul">
                        <td className="px-3 py-2.5 font-bold text-feisen-azul">{productosVista.length} productos</td>
                        {!ruta && <td className="hidden md:table-cell" />}
                        <td className="px-3 py-2.5 text-right font-bold text-feisen-azul">{fmtNum(totVista.cantidad)}</td>
                        {hayKg && <td className="px-3 py-2.5 text-right font-bold text-feisen-azul hidden md:table-cell">{fmtNum(totVista.kg)}</td>}
                        <td className="hidden sm:table-cell" />
                        <td className="px-3 py-2.5 text-right font-bold text-feisen-azul whitespace-nowrap">{fmt(totVista.valor)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )
      )}
    </div>
  )
}
