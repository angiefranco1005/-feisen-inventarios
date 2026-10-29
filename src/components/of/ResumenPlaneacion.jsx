import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Alerta from './shared/Alerta'
import Modal from './shared/Modal'
import { pendienteProducir, disponibleDespacho, CENTRO_NOMBRE, formatoOF, formatFecha } from './shared/formatters'
import { useAutoRefrescar } from './shared/useAutoRefrescar'
import { RefreshCw } from 'lucide-react'

export default function ResumenPlaneacion() {
  const { esAdmin } = useAuth()
  const [ordenes, setOrdenes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState(null)
  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroProducto, setFiltroProducto] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [productoSeleccionado, setProductoSeleccionado] = useState(null)

  useEffect(() => { cargar().finally(() => setCargando(false)) }, [])
  useAutoRefrescar(async () => { setActualizando(true); await cargar(); setActualizando(false) })

  async function cargar() {
    const { data, error } = await supabase.from('ordenes_fabricacion')
      .select('id, numero, cliente, fecha_promesa, cancelada, items_of(*)')
    if (error) setError(error.message)
    setOrdenes(data || [])
  }

  async function refrescarManual() {
    setActualizando(true)
    await cargar()
    setActualizando(false)
  }

  if (cargando) return <Spinner texto="Calculando resumen..." />
  if (error) return <Alerta tipo="error" mensaje={`No se pudo cargar el resumen: ${error}`} />

  const grupos = {} // producto -> { pendienteFabricar, pendienteDespachar, despachado, ordenes:Set, detalle:[{orden, item, centro_costo}] }
  function sumar(producto, orden, item) {
    if (!grupos[producto]) grupos[producto] = { pendienteFabricar: 0, pendienteDespachar: 0, despachado: 0, ordenes: new Set(), detalle: [] }
    grupos[producto].pendienteFabricar += pendienteProducir(item)
    grupos[producto].pendienteDespachar += disponibleDespacho(item)
    grupos[producto].despachado += item.entregado
    grupos[producto].ordenes.add(orden.id)
    grupos[producto].detalle.push({ orden, item, centro_costo: item.centro_costo })
  }

  const titulo = 'Resumen de planeación — fabricación y despacho'

  const vigentes = ordenes.filter(o => !o.cancelada)

  vigentes.forEach(o => {
    if (fechaDesde && o.fecha_promesa < fechaDesde) return
    if (fechaHasta && o.fecha_promesa > fechaHasta) return
    o.items_of.forEach(it => {
      if (filtroCentro && it.centro_costo !== filtroCentro) return
      if (filtroProducto && !it.producto.toLowerCase().includes(filtroProducto.trim().toLowerCase())) return
      sumar(it.producto, o, it)
    })
  })

  const productos = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'es'))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-feisen-azul">{titulo}</h1>
        <button onClick={refrescarManual} disabled={actualizando}
          className="flex items-center gap-1.5 text-sm text-feisen-azul font-medium px-3 py-1.5 rounded-lg hover:bg-feisen-gris disabled:opacity-60">
          <RefreshCw size={14} className={actualizando ? 'animate-spin' : ''} />
          {actualizando ? 'Actualizando...' : 'Refrescar'}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl">
        <div>
          <label className="text-xs font-medium text-feisen-gris-oscuro block mb-1">Centro de costo</label>
          <select value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
            <option value="">Todos</option>
            {Object.keys(CENTRO_NOMBRE).map(c => <option key={c} value={c}>{CENTRO_NOMBRE[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-feisen-gris-oscuro block mb-1">Producto</label>
          <input value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)} placeholder="Ej: mezcladora"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <div>
          <label className="text-xs font-medium text-feisen-gris-oscuro block mb-1">Fecha de entrega desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <div>
          <label className="text-xs font-medium text-feisen-gris-oscuro block mb-1">Fecha de entrega hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-feisen-gris-medio uppercase border-b border-gray-200">
              <th className="py-3 px-4">Producto</th>
              <th className="px-2">Pendiente fabricar</th>
              <th className="px-2">Pendiente despachar</th>
              <th className="px-2">Despachado</th>
              <th className="px-2"># OF</th>
            </tr>
          </thead>
          <tbody>
            {productos.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-feisen-gris-medio italic py-8">No hay datos para estos filtros.</td></tr>
            ) : productos.map(prod => {
              const g = grupos[prod]
              return (
                <tr key={prod}
                  onClick={esAdmin ? () => setProductoSeleccionado(prod) : undefined}
                  className={`border-b border-gray-100 ${esAdmin ? 'cursor-pointer hover:bg-feisen-gris' : ''}`}>
                  <td className="py-3 px-4 font-medium text-feisen-gris-oscuro">{prod}</td>
                  <td className="px-2 font-bold text-feisen-azul">{g.pendienteFabricar} uds</td>
                  <td className="px-2 font-bold text-feisen-azul">{g.pendienteDespachar} uds</td>
                  <td className="px-2 font-bold text-emerald-600">{g.despachado} uds</td>
                  <td className="px-2">{g.ordenes.size}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {esAdmin && productoSeleccionado && grupos[productoSeleccionado] && (
        <Modal titulo={`OF relacionadas — ${productoSeleccionado}`} onCerrar={() => setProductoSeleccionado(null)} ancho="sm:max-w-2xl">
          <div className="space-y-3">
            <p className="text-sm text-feisen-gris-medio">
              Pendiente fabricar: <span className="font-bold text-feisen-azul">{grupos[productoSeleccionado].pendienteFabricar} uds</span> ·
              {' '}Pendiente despachar: <span className="font-bold text-feisen-azul">{grupos[productoSeleccionado].pendienteDespachar} uds</span> ·
              {' '}Despachado: <span className="font-bold text-emerald-600">{grupos[productoSeleccionado].despachado} uds</span>
              {' '}en {grupos[productoSeleccionado].ordenes.size} OF.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-feisen-gris-medio uppercase border-b border-gray-200">
                    <th className="py-2 pr-2">OF</th>
                    <th className="py-2 pr-2">Cliente</th>
                    <th className="py-2 pr-2">Centro de costo</th>
                    <th className="py-2 pr-2">Pend. fabricar</th>
                    <th className="py-2 pr-2">Pend. despachar</th>
                    <th className="py-2 pr-2">Despachado</th>
                    <th className="py-2 pr-2">F. promesa</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos[productoSeleccionado].detalle
                    .sort((a, b) => a.orden.numero - b.orden.numero)
                    .map((d, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 pr-2 font-medium text-feisen-azul whitespace-nowrap">{formatoOF(d.orden.numero)}</td>
                        <td className="py-2 pr-2">{d.orden.cliente}</td>
                        <td className="py-2 pr-2 whitespace-nowrap">{CENTRO_NOMBRE[d.centro_costo]}</td>
                        <td className="py-2 pr-2 font-bold text-feisen-azul">{pendienteProducir(d.item)} uds</td>
                        <td className="py-2 pr-2 font-bold text-feisen-azul">{disponibleDespacho(d.item)} uds</td>
                        <td className="py-2 pr-2 font-bold text-emerald-600">{d.item.entregado} uds</td>
                        <td className="py-2 pr-2 whitespace-nowrap">{formatFecha(d.orden.fecha_promesa)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
