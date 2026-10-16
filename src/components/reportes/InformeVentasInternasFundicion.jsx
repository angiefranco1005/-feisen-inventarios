import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { exportarVentasInternasFundicion } from '../../utils/exportExcel'
import { fetchAllPages } from '../../utils/fetchAllPages'
import Alerta from '../shared/Alerta'
import { Flame, Download, RefreshCw } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
//  Informe: "Ventas internas" de Fundición hacia el proceso productivo.
//
//  Para el análisis por centro de costo (PyG): cada salida de Fundición hacia
//  OTRA bodega (Mecanizados, Armado y Soldadura, etc.) se trata como una venta
//  interna de Fundición, y su valor se lleva como COSTO al centro de costos
//  Construequipos.
//
//  Reglas (decididas con Angie, 16/10/2026):
//   - Solo cuenta la SALIDA de Fundición (tipo 'salida' con bodega_origen =
//     Fundición y bodega_destino = otra bodega). No se suma la entrada pareada
//     (REC-) del destino, para no duplicar el valor.
//   - Valor = cantidad × precio_costo_snapshot (costo guardado en el movimiento).
//   - Se excluyen movimientos revertidos y los movimientos de reversión.
//   - Fecha contable = fecha_movimiento (si no existe, fecha de creación).
// ─────────────────────────────────────────────────────────────────────────────

function primerDiaMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function ultimoDiaMes() {
  const d = new Date()
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, '0')}-${String(ultimo.getDate()).padStart(2, '0')}`
}

const fmt = (n) => `$${Math.round(n || 0).toLocaleString('es-CO')}`

// '2026-10-05' → '05/10/2026'
function fmtFecha(iso) {
  if (!iso) return ''
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const esFundicion = (nombre) => (nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().includes('FUNDICION')

export default function InformeVentasInternasFundicion() {
  const { esAdmin } = useAuth()
  const [fechaInicio, setFechaInicio] = useState(primerDiaMes())
  const [fechaFin,    setFechaFin]    = useState(ultimoDiaMes())
  const [bodegasFund, setBodegasFund] = useState([])
  const [bodegaId,    setBodegaId]    = useState('') // '' = todas las de Fundición
  const [cargando,    setCargando]    = useState(false)
  const [error,       setError]       = useState('')
  const [resultado,   setResultado]   = useState(null)

  useEffect(() => {
    supabase.from('bodegas').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setBodegasFund((data || []).filter(b => esFundicion(b.nombre))))
  }, [])

  async function generar() {
    setCargando(true)
    setError('')
    setResultado(null)
    try {
      const idsFund = bodegaId ? [bodegaId] : bodegasFund.map(b => b.id)
      if (idsFund.length === 0) throw new Error('No se encontró la bodega de Fundición.')

      const { data, error: err } = await fetchAllPages((desde, hasta) =>
        supabase
          .from('movimientos')
          .select('id, numero, fecha_movimiento, created_at, cantidad, precio_costo_snapshot, referencia, bodega_origen_id, bodega_destino_id, items(nombre, unidad_medida, precio_costo, categorias(nombre)), bodegas_origen:bodega_origen_id(nombre), bodegas_destino:bodega_destino_id(nombre), profiles(nombre)')
          .eq('tipo', 'salida')
          .in('bodega_origen_id', idsFund)
          .not('bodega_destino_id', 'is', null)
          .is('revertido_en', null)
          .or('revertido.is.null,revertido.eq.false')
          .or(`and(fecha_movimiento.gte.${fechaInicio},fecha_movimiento.lte.${fechaFin}),and(fecha_movimiento.is.null,created_at.gte.${fechaInicio}T00:00:00,created_at.lte.${fechaFin}T23:59:59)`)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(desde, hasta)
      )
      if (err) throw err

      const filas = (data || [])
        .filter(m => m.bodega_destino_id && m.bodega_destino_id !== m.bodega_origen_id)
        .map(m => {
          const costo = Number(m.precio_costo_snapshot) || 0
          const cantidad = Number(m.cantidad) || 0
          return {
            id:           m.id,
            fecha:        (m.fecha_movimiento || m.created_at || '').slice(0, 10),
            numero:       m.numero || '',
            producto:     m.items?.nombre || '(producto eliminado)',
            categoria:    m.items?.categorias?.nombre || '',
            origen:       m.bodegas_origen?.nombre || '',
            destino:      m.bodegas_destino?.nombre || '(sin nombre)',
            cantidad,
            unidad:       m.items?.unidad_medida || '',
            costo,
            valor:        cantidad * costo,
            costoActual:  Number(m.items?.precio_costo) || 0,
            usuario:      m.profiles?.nombre || '',
            referencia:   m.referencia || '',
            sinCosto:     costo <= 0,
          }
        })
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero))

      // Resumen por destino
      const porDestino = {}
      for (const f of filas) {
        const r = (porDestino[f.destino] ||= { destino: f.destino, lineas: 0, movimientos: new Set(), valor: 0, sinCosto: 0 })
        r.lineas += 1
        r.movimientos.add(f.numero || f.id)
        r.valor += f.valor
        if (f.sinCosto) r.sinCosto += 1
      }
      const resumen = Object.values(porDestino)
        .map(r => ({ ...r, movimientos: r.movimientos.size }))
        .sort((a, b) => b.valor - a.valor)

      setResultado({
        filas,
        resumen,
        totalValor:       filas.reduce((s, f) => s + f.valor, 0),
        totalLineas:      filas.length,
        totalMovimientos: new Set(filas.map(f => f.numero || f.id)).size,
        sinCosto:         filas.filter(f => f.sinCosto),
      })
    } catch (e) {
      setError('No se pudo generar el informe: ' + (e.message || e))
    } finally {
      setCargando(false)
    }
  }

  function descargar() {
    if (!resultado) return
    const bodegaNombre = bodegaId
      ? (bodegasFund.find(b => b.id === bodegaId)?.nombre || 'Fundición')
      : (bodegasFund.length === 1 ? bodegasFund[0].nombre : 'Todas las bodegas de Fundición')
    exportarVentasInternasFundicion(resultado, fechaInicio, fechaFin, bodegaNombre)
  }

  if (!esAdmin) {
    return (
      <div className="max-w-3xl mx-auto">
        <Alerta tipo="alerta" mensaje="Este informe muestra valores en pesos y solo está disponible para el administrador." />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-feisen-azul flex items-center gap-2">
        <Flame size={24} /> Ventas internas de Fundición
      </h1>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <p className="text-sm text-gray-500">
          Todo lo que Fundición despacha a otras bodegas (Mecanizados, Armado y Soldadura, etc.), valorizado al costo
          registrado en cada movimiento. Es el valor que se lleva como costo al centro de costos <strong>Construequipos</strong>.
          Solo cuenta la salida de Fundición (no la entrada del destino) y no incluye movimientos revertidos.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Fecha inicio</label>
            <input type="date" value={fechaInicio} max={fechaFin || undefined}
              onChange={e => setFechaInicio(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Fecha fin</label>
            <input type="date" value={fechaFin} min={fechaInicio || undefined}
              onChange={e => setFechaFin(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Bodega de origen</label>
            <select value={bodegaId} onChange={e => setBodegaId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white">
              <option value="">{bodegasFund.length > 1 ? 'Todas las de Fundición' : (bodegasFund[0]?.nombre || 'Fundición')}</option>
              {bodegasFund.length > 1 && bodegasFund.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={generar} disabled={cargando || !fechaInicio || !fechaFin}
            className="flex items-center gap-2 bg-feisen-azul text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition-opacity">
            {cargando ? <RefreshCw size={16} className="animate-spin" /> : <Flame size={16} />}
            {cargando ? 'Calculando...' : 'Calcular'}
          </button>
          {resultado && (
            <button onClick={descargar}
              className="flex items-center gap-2 border border-feisen-azul text-feisen-azul px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-50 transition-colors">
              <Download size={16} /> Descargar Excel
            </button>
          )}
        </div>
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}

      {resultado && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Valor total (costo Construequipos)', valor: fmt(resultado.totalValor), color: 'text-feisen-azul' },
              { label: 'Movimientos',                         valor: resultado.totalMovimientos.toLocaleString('es-CO'), color: 'text-gray-700' },
              { label: 'Líneas de producto',                  valor: resultado.totalLineas.toLocaleString('es-CO'), color: 'text-gray-700' },
              { label: 'Líneas sin costo',                    valor: resultado.sinCosto.length.toLocaleString('es-CO'), color: resultado.sinCosto.length ? 'text-feisen-rojo' : 'text-green-700' },
            ].map(({ label, valor, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className={`font-bold text-lg ${color}`}>{valor}</p>
              </div>
            ))}
          </div>

          {resultado.sinCosto.length > 0 && (
            <Alerta tipo="alerta"
              mensaje={`${resultado.sinCosto.length} línea(s) tienen costo $0 en el movimiento, así que valen $0 en este informe. Van marcadas en el Excel (con el costo actual del catálogo como referencia) para que decidas si completas el costo del producto.`} />
          )}

          {resultado.filas.length === 0 ? (
            <div className="bg-white rounded-2xl text-center py-12 text-gray-400 border border-gray-100">
              No hay salidas de Fundición a otras bodegas en este período.
            </div>
          ) : (
            <>
              {/* Resumen por destino */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <p className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Resumen por destino</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Destino</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Movimientos</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Líneas</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Valor (COP)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.resumen.map(r => (
                        <tr key={r.destino} className="border-t border-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{r.destino}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{r.movimientos}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{r.lineas}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-feisen-azul">{fmt(r.valor)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-feisen-azul bg-blue-50">
                        <td className="px-4 py-2.5 font-bold text-feisen-azul">TOTAL</td>
                        <td className="px-4 py-2.5 text-right font-bold text-feisen-azul">{resultado.totalMovimientos}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-feisen-azul">{resultado.totalLineas}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-feisen-azul">{fmt(resultado.totalValor)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detalle */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <p className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Detalle de movimientos</p>
                <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Fecha</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">N°</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Producto</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 hidden md:table-cell">Destino</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500">Cant.</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 hidden sm:table-cell">Costo unit.</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.filas.map(f => (
                        <tr key={f.id} className={`border-t border-gray-50 ${f.sinCosto ? 'bg-red-50' : ''}`}>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtFecha(f.fecha)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-700">{f.numero}</td>
                          <td className="px-3 py-2 text-gray-800">{f.producto}</td>
                          <td className="px-3 py-2 text-gray-600 hidden md:table-cell">{f.destino}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{f.cantidad.toLocaleString('es-CO')}</td>
                          <td className="px-3 py-2 text-right text-gray-600 hidden sm:table-cell">{f.sinCosto ? <span className="text-feisen-rojo font-semibold">sin costo</span> : fmt(f.costo)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmt(f.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
