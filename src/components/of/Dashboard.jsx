import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Spinner from '../shared/Spinner'
import { dibujarBarrasVertical, dibujarBarrasHorizontal, dibujarDona } from './shared/canvasCharts'
import { CENTRO_NOMBRE, estadoClase, ofTotalmenteDespachada } from './shared/formatters'
import { useAutoRefrescar } from './shared/useAutoRefrescar'
import { RefreshCw } from 'lucide-react'

const COLORES = ['#064794', '#B4271D', '#4B5563', '#5b8fce', '#d9807a', '#94a3ad']

function calcularMetricas(ordenes) {
  let sumProduccion = 0, nProduccion = 0
  let sumDespacho = 0, nDespacho = 0
  let sumTotal = 0, nTotal = 0

  ordenes.forEach(o => {
    const fOrden = new Date(o.fecha_orden)
    o.items_of.forEach(item => {
      if (item.entregado < item.cantidad || !item.entregas?.length) return
      const ultimaEntrega = item.entregas.reduce((max, e) => (!max || e.fecha > max) ? e.fecha : max, null)
      const fEntrega = new Date(ultimaEntrega)
      sumTotal += (fEntrega - fOrden) / 86400000
      nTotal++

      const produccionesReales = (item.producciones || []).filter(pr => pr.tipo !== 'reversion')
      if (item.producido >= item.cantidad && produccionesReales.length) {
        const fechaListo = produccionesReales.reduce((max, pr) => (!max || pr.fecha > max) ? pr.fecha : max, null)
        const fListo = new Date(fechaListo)
        sumProduccion += (fListo - fOrden) / 86400000
        nProduccion++
        sumDespacho += (fEntrega - fListo) / 86400000
        nDespacho++
      }
    })
  })

  const completas = ordenes.filter(o => ofTotalmenteDespachada(o.items_of))
  let aTiempo = 0
  completas.forEach(o => {
    let ultima = null
    o.items_of.forEach(it => it.entregas?.forEach(e => { if (!ultima || e.fecha > ultima) ultima = e.fecha }))
    if (ultima && new Date(ultima) <= new Date(o.fecha_promesa)) aTiempo++
  })

  return {
    totalOF: ordenes.length,
    despachadas: completas.length,
    activas: ordenes.length - completas.length,
    pctATiempo: completas.length ? Math.round((aTiempo / completas.length) * 100) : null,
    diasProduccion: nProduccion ? (sumProduccion / nProduccion).toFixed(1) : null,
    diasDespacho: nDespacho ? (sumDespacho / nDespacho).toFixed(1) : null,
    diasTotal: nTotal ? (sumTotal / nTotal).toFixed(1) : null,
  }
}

function calcularTopProductos(ordenes, filtroCentro) {
  const map = {}
  ordenes.forEach(o => o.items_of.forEach(it => {
    if (filtroCentro && it.centro_costo !== filtroCentro) return
    if (!map[it.producto]) map[it.producto] = { cantidad: 0, ofs: new Set() }
    map[it.producto].cantidad += it.cantidad
    map[it.producto].ofs.add(o.id)
  }))
  return Object.entries(map).map(([producto, d]) => ({ producto, cantidad: d.cantidad, ofs: d.ofs.size })).sort((a, b) => b.cantidad - a.cantidad)
}

function calcularTopClientes(ordenes, filtroCentro) {
  const map = {}
  ordenes.forEach(o => {
    let cantidad = 0
    let tieneItem = false
    o.items_of.forEach(it => {
      if (filtroCentro && it.centro_costo !== filtroCentro) return
      cantidad += it.cantidad
      tieneItem = true
    })
    if (!tieneItem) return
    if (!map[o.cliente]) map[o.cliente] = { cantidad: 0, ofs: new Set() }
    map[o.cliente].cantidad += cantidad
    map[o.cliente].ofs.add(o.id)
  })
  return Object.entries(map).map(([cliente, d]) => ({ cliente, cantidad: d.cantidad, ofs: d.ofs.size })).sort((a, b) => b.cantidad - a.cantidad)
}

function calcularPorCentro(ordenes) {
  const map = { construequipos: 0, aluminio: 0, fundicionHierro: 0, repuestos: 0 }
  ordenes.forEach(o => o.items_of.forEach(it => { map[it.centro_costo] += it.cantidad }))
  return Object.keys(map).map(c => ({ centro: CENTRO_NOMBRE[c], cantidad: map[c] }))
}

function calcularPorEstado(ordenes) {
  const map = { pendiente: 0, parcial: 0, listo: 0, entregado: 0 }
  const nombres = { pendiente: 'Pendiente producción', parcial: 'Producción parcial', listo: 'Listo para despacho', entregado: 'Entregado' }
  ordenes.forEach(o => o.items_of.forEach(it => { map[estadoClase(it)]++ }))
  return Object.keys(map).map(e => ({ estado: nombres[e], cantidad: map[e] }))
}

export default function Dashboard() {
  const [ordenes, setOrdenes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [filtroCentro, setFiltroCentro] = useState('')

  const refTiempos = useRef(null)
  const refProductos = useRef(null)
  const refClientes = useRef(null)
  const refCentros = useRef(null)
  const refEstados = useRef(null)

  useEffect(() => { cargar().finally(() => setCargando(false)) }, [])
  useAutoRefrescar(async () => { setActualizando(true); await cargar(); setActualizando(false) })

  async function cargar() {
    const { data } = await supabase.from('ordenes_fabricacion').select('*, items_of(*, producciones:of_producciones(*), entregas:of_entregas(*))')
    setOrdenes(data || [])
  }

  async function refrescarManual() {
    setActualizando(true)
    await cargar()
    setActualizando(false)
  }

  const vigentes = ordenes.filter(o => !o.cancelada)
  const canceladas = ordenes.length - vigentes.length

  const m = calcularMetricas(vigentes)
  const productos = calcularTopProductos(vigentes, filtroCentro)
  const clientes = calcularTopClientes(vigentes, filtroCentro)
  const centros = calcularPorCentro(vigentes)
  const estados = calcularPorEstado(vigentes)

  function redibujar() {
    if (!refTiempos.current) return
    dibujarBarrasVertical(refTiempos.current, ['Producción', 'Despacho', 'Total'],
      [Number(m.diasProduccion) || 0, Number(m.diasDespacho) || 0, Number(m.diasTotal) || 0],
      [COLORES[0], COLORES[1], COLORES[2]])
    if (refProductos.current) dibujarBarrasHorizontal(refProductos.current, productos.slice(0, 6).map(p => p.producto), productos.slice(0, 6).map(p => p.cantidad), COLORES[0])
    if (refClientes.current) dibujarBarrasHorizontal(refClientes.current, clientes.slice(0, 6).map(c => c.cliente), clientes.slice(0, 6).map(c => c.cantidad), COLORES[1])
    dibujarDona(refCentros.current, centros.map(c => c.centro), centros.map(c => c.cantidad), COLORES)
    dibujarDona(refEstados.current, estados.map(e => e.estado), estados.map(e => e.cantidad), [COLORES[2], '#5b8fce', COLORES[1], COLORES[0]])
  }

  useEffect(() => {
    redibujar()
    window.addEventListener('resize', redibujar)
    return () => window.removeEventListener('resize', redibujar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // "cargando" va en las dependencias: los datos llegan mientras se muestra el spinner (sin
    // canvas todavía) y sin esto las gráficas quedaban en blanco hasta cambiar el filtro
  }, [ordenes, filtroCentro, cargando])

  if (cargando) return <Spinner texto="Calculando métricas..." />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-feisen-azul">Dashboard</h1>
        <button onClick={refrescarManual} disabled={actualizando}
          className="flex items-center gap-1.5 text-sm text-feisen-azul font-medium px-3 py-1.5 rounded-lg hover:bg-feisen-gris disabled:opacity-60">
          <RefreshCw size={14} className={actualizando ? 'animate-spin' : ''} />
          {actualizando ? 'Actualizando...' : 'Refrescar'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <TarjetaMetrica valor={m.totalOF} label="OF totales" />
        <TarjetaMetrica valor={m.activas} label="OF activas" />
        <TarjetaMetrica valor={m.despachadas} label="OF despachadas" />
        <TarjetaMetrica valor={m.pctATiempo !== null ? m.pctATiempo + '%' : '-'} label="Entregadas a tiempo" />
        <TarjetaMetrica valor={canceladas} label="OF canceladas" />
      </div>
      <p className="text-xs text-feisen-gris-medio -mt-3">Las métricas y gráficos de abajo no incluyen las OF canceladas.</p>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-semibold text-feisen-gris-oscuro mb-4">Tiempos de entrega (promedio, sobre OF ya despachadas)</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="h-56"><canvas ref={refTiempos} className="w-full h-full" /></div>
          <table className="text-sm w-full self-start">
            <tbody>
              <tr className="border-b border-gray-100"><td className="py-2">Producción (orden registrada → fabricación terminada)</td><td className="py-2 text-right font-medium">{m.diasProduccion !== null ? m.diasProduccion + ' días' : 'Sin datos'}</td></tr>
              <tr className="border-b border-gray-100"><td className="py-2">Despacho (fabricación terminada → entrega final)</td><td className="py-2 text-right font-medium">{m.diasDespacho !== null ? m.diasDespacho + ' días' : 'Sin datos'}</td></tr>
              <tr><td className="py-2 font-semibold">Total (orden registrada → entrega final)</td><td className="py-2 text-right font-bold text-feisen-azul">{m.diasTotal !== null ? m.diasTotal + ' días' : 'Sin datos'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 max-w-xs">
        <label className="text-xs font-medium text-feisen-gris-oscuro block mb-1">Filtrar equipos y clientes por centro de costo</label>
        <select value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
          <option value="">Todos</option>
          {Object.keys(CENTRO_NOMBRE).map(c => <option key={c} value={c}>{CENTRO_NOMBRE[c]}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-semibold text-feisen-gris-oscuro mb-4">
          Equipos que más se piden{filtroCentro ? ` — ${CENTRO_NOMBRE[filtroCentro]}` : ''}
        </h2>
        {productos.length === 0 ? (
          <p className="text-sm text-feisen-gris-medio italic">No hay pedidos en este centro de costo.</p>
        ) : (
          <div className="h-56"><canvas ref={refProductos} className="w-full h-full" /></div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-semibold text-feisen-gris-oscuro mb-4">
          Clientes que más piden{filtroCentro ? ` — ${CENTRO_NOMBRE[filtroCentro]}` : ''}
        </h2>
        {clientes.length === 0 ? (
          <p className="text-sm text-feisen-gris-medio italic">No hay pedidos en este centro de costo.</p>
        ) : (
          <div className="h-56"><canvas ref={refClientes} className="w-full h-full" /></div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-semibold text-feisen-gris-oscuro mb-4">Carga por centro de costo y estado</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="h-48"><canvas ref={refCentros} className="w-full h-full" /></div>
          <div className="h-48"><canvas ref={refEstados} className="w-full h-full" /></div>
        </div>
      </div>
    </div>
  )
}

function TarjetaMetrica({ valor, label }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
      <p className="text-2xl font-extrabold text-feisen-azul">{valor}</p>
      <p className="text-xs text-feisen-gris-medio mt-1">{label}</p>
    </div>
  )
}
