import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { exportarBalanceHierro } from '../../utils/exportExcel'
import { fetchAllPages } from '../../utils/fetchAllPages'
import Alerta from '../shared/Alerta'
import { Scale, Download, RefreshCw } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
//  Informe: BALANCE DE HIERRO de Fundición (Fase 1).
//
//  Objetivo (Angie, 16/10/2026): que cuadre mes a mes lo que se compra de hierro
//  con lo fundido, las piezas que salieron, el vaceadero, la merma y lo que queda
//  en inventario — para detectar faltantes a tiempo.
//
//  Cadena de datos que usa la app hoy:
//   · Compras / entradas de hierro ........ movimientos (entrada) a bodega FUNDICIÓN
//   · Hierro cargado al horno ............. tabla fundidas (hierro_colado, kg)
//   · Hierro DESCONTADO del inventario .... salida de HIERRO COLADO al cerrar una
//                                           orden de moldeo con su fundida
//                                           (referencia "ORD-MOL-xxxx · FUN-xxxx")
//   · Piezas buenas / NC .................. ordenes_moldeo_piezas × peso_unitario
//   · Vaceadero ........................... entrada de VACEADERO (kg manual + kg NC)
//   · Merma real = hierro descontado − piezas buenas − vaceadero (igual que la
//     pantalla de Recogida). Merma esperada = % que fija Angie.
//
//  Controles de integridad: fundidas sin descontar, órdenes sin hierro, salidas
//  de hierro que NO son consumo de horno, piezas sin peso, mermas fuera de rango,
//  compras sin proveedor y el residuo contable sin explicar.
// ─────────────────────────────────────────────────────────────────────────────

const FUND_BODEGA_ID      = 'a0604489-2768-445b-8e68-e450ef8520ed'
const HIERRO_COLADO_ID    = '52546e1a-dd2b-46c6-8857-9895497f228a'
const VACEADERO_ID        = 'afc4f062-48c1-47cc-92c2-c9e4536bfff5'
// El balance cuenta solo estos dos productos de Fundición (definido por Angie, 16/10/2026)
const IDS_HIERRO = [HIERRO_COLADO_ID, VACEADERO_ID]
const NOMBRES_ITEM = { [HIERRO_COLADO_ID]: 'HIERRO COLADO', [VACEADERO_ID]: 'VACEADERO' }
const LS_KEY = 'feisen_balance_hierro_cfg_v1'

const TIPOS_ENTRADA = ['entrada', 'entrada_compra', 'devolucion']
const TIPOS_SALIDA  = ['salida', 'salida_produccion', 'salida_venta']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const kg  = (n) => (Number(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })
const pct = (n) => `${(Number(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`
const labelMes = (ym) => { const [y, m] = ym.split('-'); return `${MESES[Number(m) - 1]} ${y}` }
const fmtFecha = (iso) => { if (!iso) return ''; const [a, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${a}` }

function mesActual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function sumarMeses(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function listaMeses(desde, hasta) {
  const out = []
  let cur = desde
  while (cur <= hasta && out.length < 36) { out.push(cur); cur = sumarMeses(cur, 1) }
  return out
}
function ultimoDia(ym) {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}
const fechaMov = (m) => (m.fecha_movimiento || m.created_at || '').slice(0, 10)
const numOrden = (n) => `ORD-MOL-${String(n).padStart(4, '0')}`
const numFun   = (n) => `FUN-${String(n).padStart(4, '0')}`

function cargarCfg() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') || {} } catch { return {} }
}
function guardarCfg(cfg) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)) } catch { /* sin storage: se ignora */ }
}

export default function InformeBalanceHierro() {
  const { esAdmin } = useAuth()
  const cfgInicial = cargarCfg()

  const [mesDesde,  setMesDesde]  = useState(cfgInicial.mesDesde || sumarMeses(mesActual(), -5))
  const [mesHasta,  setMesHasta]  = useState(cfgInicial.mesHasta || mesActual())
  const [mermaPct,  setMermaPct]  = useState(cfgInicial.mermaPct ?? '')   // '' = usar histórico
  const [tolerancia, setTolerancia] = useState(cfgInicial.tolerancia ?? '3')
  const [cargando,  setCargando]  = useState(false)
  const [error,     setError]     = useState('')
  const [datos,     setDatos]     = useState(null)       // datos crudos ya cargados
  const [mesDetalle, setMesDetalle] = useState('')
  const [conteo,    setConteo]    = useState({})         // conteo físico por item: { id: '123' }

  async function generar() {
    setCargando(true); setError(''); setDatos(null)
    try {
      const ids = IDS_HIERRO
      const inicio = `${mesDesde}-01`
      const fin = ultimoDia(mesHasta)
      guardarCfg({ mesDesde, mesHasta, mermaPct, tolerancia })

      const movSel = 'id, numero, tipo, item_id, cantidad, bodega_origen_id, bodega_destino_id, fecha_movimiento, created_at, referencia, motivo, proveedor, destino, revertido, revertido_en, items(nombre, unidad_medida), profiles(nombre)'

      const [movs, stock, vac, fund, ords] = await Promise.all([
        // Movimientos del hierro desde el inicio del rango en adelante (sin tope superior,
        // para poder reconstruir el stock de cada fin de mes desde el stock actual)
        fetchAllPages((d, h) => supabase.from('movimientos').select(movSel)
          .in('item_id', ids)
          .or(`bodega_origen_id.eq.${FUND_BODEGA_ID},bodega_destino_id.eq.${FUND_BODEGA_ID}`)
          .or(`fecha_movimiento.gte.${inicio},and(fecha_movimiento.is.null,created_at.gte.${inicio}T00:00:00)`)
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(d, h)),
        supabase.from('stock').select('item_id, cantidad_actual').eq('bodega_id', FUND_BODEGA_ID).in('item_id', ids),
        // Vaceadero (entradas) del rango
        fetchAllPages((d, h) => supabase.from('movimientos')
          .select('id, cantidad, referencia, fecha_movimiento, created_at, revertido, revertido_en')
          .eq('item_id', VACEADERO_ID).eq('tipo', 'entrada').eq('bodega_destino_id', FUND_BODEGA_ID)
          .or(`and(fecha_movimiento.gte.${inicio},fecha_movimiento.lte.${fin}),and(fecha_movimiento.is.null,created_at.gte.${inicio}T00:00:00,created_at.lte.${fin}T23:59:59)`)
          .range(d, h)),
        fetchAllPages((d, h) => supabase.from('fundidas')
          .select('id, numero, fecha, hierro_colado')
          .gte('fecha', inicio).lte('fecha', fin).order('fecha').range(d, h)),
        fetchAllPages((d, h) => supabase.from('ordenes_moldeo')
          .select('id, numero, fecha, estado, ordenes_moldeo_piezas(id, asignado_a, cantidad_planeada, cantidad_conforme, cantidad_nc, motivo_nc, items(nombre, peso_unitario))')
          .in('estado', ['completado', 'completada'])
          .gte('fecha', inicio).lte('fecha', fin).order('fecha').range(d, h)),
      ])
      for (const r of [movs, vac, fund, ords]) if (r.error) throw r.error
      if (stock.error) throw stock.error

      setDatos({
        movs: movs.data || [], stock: stock.data || [], vac: vac.data || [],
        fundidas: fund.data || [], ordenes: ords.data || [], ids, inicio, fin,
      })
      setMesDetalle(mesHasta)
    } catch (e) {
      setError('No se pudo generar el informe: ' + (e.message || e))
    } finally {
      setCargando(false)
    }
  }

  // ── Cálculo (se recalcula al cambiar % de merma / tolerancia sin volver a consultar) ──
  const res = useMemo(() => {
    if (!datos) return null
    const meses = listaMeses(mesDesde, mesHasta)
    const { movs, stock, vac, fundidas, ordenes, ids } = datos

    // Efecto de cada movimiento sobre el stock de Fundición
    const efecto = (m) => {
      const c = Number(m.cantidad) || 0
      if (TIPOS_ENTRADA.includes(m.tipo)) return m.bodega_destino_id === FUND_BODEGA_ID ? c : 0
      if (TIPOS_SALIDA.includes(m.tipo))  return m.bodega_origen_id  === FUND_BODEGA_ID ? -c : 0
      if (m.tipo === 'traslado') return (m.bodega_destino_id === FUND_BODEGA_ID ? c : 0) - (m.bodega_origen_id === FUND_BODEGA_ID ? c : 0)
      if (m.tipo === 'ajuste_inventario') return m.bodega_destino_id === FUND_BODEGA_ID ? c : 0
      return 0
    }
    // Flujo "real": sin movimientos revertidos ni movimientos de reversión
    const esReal = (m) => m.revertido !== true && !m.revertido_en
    const esConsumoHorno = (m) => /FUN-|ORD-MOL-/i.test(m.referencia || '') || /consumo horno/i.test(m.motivo || '')

    const stockActual = stock.reduce((s, r) => s + Number(r.cantidad_actual || 0), 0)
    const porMes = {}
    meses.forEach(ym => { porMes[ym] = {
      mes: ym, net: 0, compras: 0, otrasEntradas: 0, vacEntra: 0, vacSale: 0, ajustes: 0, consumoHorno: 0, otrasSalidas: 0,
      hierroCargado: 0, fundidasSinDescontar: 0, hierroOrdenes: 0, buenas: 0, nc: 0, vaceadero: 0, merma: 0,
      ordenes: 0, plan: 0, conf: 0, ncUds: 0, faltanteUds: 0,
    } })
    const netPorItem = {}   // item → { total: neto desde inicio, despuesFin: neto posterior al rango }
    const salidasNoHorno = [], salidasVaceadero = [], comprasSinProveedor = []
    let netPosterior = 0
    const mesFinRango = meses[meses.length - 1]

    for (const m of movs) {
      const ym = fechaMov(m).slice(0, 7)
      const ef = efecto(m)
      const ni = (netPorItem[m.item_id] ||= { despuesFin: 0 })
      if (ym > mesFinRango) { netPosterior += ef; ni.despuesFin += ef }
      const b = porMes[ym]
      if (!b) continue
      b.net += ef
      if (!esReal(m)) continue
      if (m.tipo === 'ajuste_inventario') { b.ajustes += ef; continue }
      if (m.item_id === VACEADERO_ID) {
        // Vaceadero: lo que se genera al cerrar órdenes (entra) y lo que sale/reutiliza
        if (ef > 0) b.vacEntra += ef
        else if (ef < 0) {
          b.vacSale += -ef
          salidasVaceadero.push({ fecha: fechaMov(m), numero: m.numero, item: 'VACEADERO', kg: -ef, destino: m.destino || '', referencia: m.referencia || '', usuario: m.profiles?.nombre || '' })
        }
        continue
      }
      if (ef > 0) {
        if (!m.bodega_origen_id) {
          b.compras += ef
          if (!m.proveedor && TIPOS_ENTRADA.includes(m.tipo)) comprasSinProveedor.push({ fecha: fechaMov(m), numero: m.numero, item: m.items?.nombre, kg: ef, usuario: m.profiles?.nombre })
        } else b.otrasEntradas += ef
      } else if (ef < 0) {
        if (esConsumoHorno(m)) b.consumoHorno += -ef
        else {
          b.otrasSalidas += -ef
          salidasNoHorno.push({ fecha: fechaMov(m), numero: m.numero, item: m.items?.nombre, kg: -ef, destino: m.destino || '', referencia: m.referencia || '', usuario: m.profiles?.nombre || '' })
        }
      }
    }

    // Stock de sistema al cierre de cada mes (se retrocede desde el stock actual)
    let acumPosterior = netPosterior
    for (let i = meses.length - 1; i >= 0; i--) {
      const b = porMes[meses[i]]
      b.stockFin = stockActual - acumPosterior
      b.stockIni = b.stockFin - b.net
      acumPosterior += b.net
      b.residuo = b.stockFin - (b.stockIni + b.compras + b.otrasEntradas + b.vacEntra + b.ajustes - b.consumoHorno - b.otrasSalidas - b.vacSale)
    }

    // Hierro descontado por orden / fundida (referencia "ORD-MOL-xxxx · FUN-xxxx")
    const hierroPorOrden = {}      // número de orden → kg
    const fundidasVinculadas = new Set()
    for (const m of movs) {
      if (m.item_id !== HIERRO_COLADO_ID || !esReal(m) || efecto(m) >= 0) continue
      const mo = (m.referencia || '').match(/ORD-MOL-(\d+)/i)
      if (mo) hierroPorOrden[Number(mo[1])] = (hierroPorOrden[Number(mo[1])] || 0) + (-efecto(m))
      const mf = (m.referencia || '').match(/FUN-(\d+)/i)
      if (mf) fundidasVinculadas.add(Number(mf[1]))
    }
    const vacioPorOrden = {}
    for (const v of vac) {
      if (v.revertido === true || v.revertido_en) continue
      const mo = (v.referencia || '').match(/ORD-MOL-(\d+)/i)
      if (mo) vacioPorOrden[Number(mo[1])] = (vacioPorOrden[Number(mo[1])] || 0) + Number(v.cantidad || 0)
    }

    // Fundidas: hierro cargado vs descontado
    const fundidasSinDescontar = []
    for (const f of fundidas) {
      const b = porMes[(f.fecha || '').slice(0, 7)]
      if (!b) continue
      const kgF = Number(f.hierro_colado || 0)
      b.hierroCargado += kgF
      if (!fundidasVinculadas.has(Number(f.numero)) && kgF > 0) {
        b.fundidasSinDescontar += kgF
        fundidasSinDescontar.push({ numero: numFun(f.numero), fecha: f.fecha, kg: kgF })
      }
    }

    // Órdenes completadas: piezas, vaceadero, merma
    const detalleOrdenes = [], noConformes = [], porMoldeador = {}
    const ordenesSinHierro = [], ordenesSinPeso = []
    for (const o of ordenes) {
      const ym = (o.fecha || '').slice(0, 7)
      const b = porMes[ym]
      if (!b) continue
      let buenas = 0, ncKg = 0, plan = 0, conf = 0, ncUds = 0, faltante = 0, sinPeso = false
      for (const p of (o.ordenes_moldeo_piezas || [])) {
        const peso = Number(p.items?.peso_unitario || 0)
        const c = Number(p.cantidad_conforme || 0), n = Number(p.cantidad_nc || 0), pl = Number(p.cantidad_planeada || 0)
        const falt = pl > 0 ? Math.max(0, pl - c - n) : 0
        buenas += c * peso; ncKg += n * peso; plan += pl; conf += c; ncUds += n; faltante += falt
        if ((c + n) > 0 && peso <= 0) sinPeso = true
        const mold = (p.asignado_a || 'Sin asignar').trim()
        noConformes.push({ mes: ym, orden: numOrden(o.numero), fecha: o.fecha, pieza: p.items?.nombre || '', moldeador: mold, plan: pl, conf: c, nc: n, faltante: falt, kgNC: n * peso, motivo: p.motivo_nc || '' })
        const key = `${ym}|${mold}`
        const pm = (porMoldeador[key] ||= { mes: ym, moldeador: mold, plan: 0, conf: 0, nc: 0, faltante: 0, kgBuenas: 0, kgNC: 0 })
        pm.plan += pl; pm.conf += c; pm.nc += n; pm.faltante += falt; pm.kgBuenas += c * peso; pm.kgNC += n * peso
      }
      const hierro = hierroPorOrden[Number(o.numero)] || 0
      const vaceadero = vacioPorOrden[Number(o.numero)] || 0
      const merma = hierro - buenas - vaceadero
      const fila = { orden: numOrden(o.numero), numero: o.numero, fecha: o.fecha, mes: ym, hierro, buenas, ncKg, vaceadero, merma, pct: hierro > 0 ? (merma / hierro) * 100 : null, plan, conf, ncUds, faltante }
      detalleOrdenes.push(fila)
      b.ordenes += 1; b.plan += plan; b.conf += conf; b.ncUds += ncUds; b.faltanteUds += faltante
      b.buenas += buenas; b.nc += ncKg; b.vaceadero += vaceadero
      if (hierro > 0) { b.hierroOrdenes += hierro; b.merma += merma } else ordenesSinHierro.push(fila)
      if (sinPeso) ordenesSinPeso.push(fila)
    }

    // % de merma esperado: el que fija Angie; si está vacío, el histórico del rango
    const filasMes = meses.map(ym => porMes[ym])
    const totHierro = filasMes.reduce((s, b) => s + b.hierroOrdenes, 0)
    const totMerma  = filasMes.reduce((s, b) => s + b.merma, 0)
    const historico = totHierro > 0 ? (totMerma / totHierro) * 100 : 0
    const mermaEsperada = mermaPct !== '' && !isNaN(parseFloat(mermaPct)) ? parseFloat(mermaPct) : historico
    const tol = parseFloat(tolerancia) || 0
    filasMes.forEach(b => {
      b.mermaPct = b.hierroOrdenes > 0 ? (b.merma / b.hierroOrdenes) * 100 : 0
      b.mermaEsperadaKg = b.hierroOrdenes * mermaEsperada / 100
      b.desviacionKg = b.merma - b.mermaEsperadaKg
      b.pctNC = (b.conf + b.ncUds) > 0 ? (b.ncUds / (b.conf + b.ncUds)) * 100 : 0
      b.alerta = b.hierroOrdenes > 0 && b.mermaPct > mermaEsperada + tol
    })
    detalleOrdenes.forEach(f => { f.alerta = f.pct !== null && f.pct > mermaEsperada + tol; f.negativa = f.pct !== null && f.pct < 0 })

    // Stock por producto al cierre del rango (para comparar con el conteo físico)
    const stockPorItem = ids.map(id => {
      const fila = stock.find(s => s.item_id === id)
      const nombre = NOMBRES_ITEM[id] || id
      const actual = Number(fila?.cantidad_actual || 0)
      return { id, nombre, sistema: actual - (netPorItem[id]?.despuesFin || 0) }
    })

    return {
      meses: filasMes, detalleOrdenes: detalleOrdenes.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      noConformes, moldeadores: Object.values(porMoldeador).sort((a, b) => a.mes.localeCompare(b.mes) || a.moldeador.localeCompare(b.moldeador, 'es')),
      fundidasSinDescontar, ordenesSinHierro, ordenesSinPeso,
      salidasNoHorno: salidasNoHorno.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      salidasVaceadero: salidasVaceadero.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      comprasSinProveedor, stockPorItem, historico, mermaEsperada, tolerancia: tol,
      stockActual,
    }
  }, [datos, mermaPct, tolerancia, mesDesde, mesHasta])

  function descargar() {
    if (!res) return
    exportarBalanceHierro(res, { mesDesde, mesHasta, conteo, labelMes })
  }

  if (!esAdmin) {
    return (
      <div className="max-w-3xl mx-auto">
        <Alerta tipo="alerta" mensaje="Este informe es solo para el administrador." />
      </div>
    )
  }

  const ultimoMes = res?.meses?.[res.meses.length - 1]
  const detalleMes = res ? res.detalleOrdenes.filter(o => o.mes === mesDetalle) : []

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-feisen-azul flex items-center gap-2">
        <Scale size={24} /> Balance de hierro — Fundición
      </h1>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <p className="text-sm text-gray-500">
          Cruza, mes a mes, lo que entra de hierro, lo que se descuenta al fundir, las piezas buenas, el vaceadero y la merma,
          contra el stock del sistema y tu conteo físico. Sirve para detectar a tiempo faltantes o descuadres.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Desde (mes)</label>
            <input type="month" value={mesDesde} max={mesHasta} onChange={e => setMesDesde(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Hasta (mes)</label>
            <input type="month" value={mesHasta} min={mesDesde} onChange={e => setMesHasta(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Merma esperada (%)</label>
            <input type="number" step="0.1" min="0" value={mermaPct} onChange={e => setMermaPct(e.target.value)}
              placeholder={res ? `histórico ${res.historico.toFixed(1)}` : 'vacío = histórico'}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Tolerancia (puntos %)</label>
            <input type="number" step="0.5" min="0" value={tolerancia} onChange={e => setTolerancia(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
          </div>
        </div>

        <p className="text-xs text-gray-400">El balance cuenta dos productos de Fundición: <strong>HIERRO COLADO</strong> y <strong>VACEADERO</strong>. Las piezas fundidas se calculan desde las órdenes de moldeo.</p>

        <div className="flex gap-3 pt-1">
          <button onClick={generar} disabled={cargando || !mesDesde || !mesHasta}
            className="flex items-center gap-2 bg-feisen-azul text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60">
            {cargando ? <RefreshCw size={16} className="animate-spin" /> : <Scale size={16} />}
            {cargando ? 'Calculando...' : 'Calcular'}
          </button>
          {res && (
            <button onClick={descargar}
              className="flex items-center gap-2 border border-feisen-azul text-feisen-azul px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-50">
              <Download size={16} /> Descargar Excel
            </button>
          )}
        </div>
      </div>

      {error && <Alerta tipo="error" mensaje={error} />}

      {res && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: `Merma real ${labelMes(ultimoMes.mes)}`, valor: ultimoMes.hierroOrdenes > 0 ? pct(ultimoMes.mermaPct) : '—', sub: `esperada ${pct(res.mermaEsperada)} ±${res.tolerancia}`, color: ultimoMes.alerta ? 'text-feisen-rojo' : 'text-green-700' },
              { label: 'Desviación de merma (kg)', valor: kg(ultimoMes.desviacionKg), sub: 'real − esperada, ese mes', color: ultimoMes.desviacionKg > 0 ? 'text-feisen-rojo' : 'text-gray-700' },
              { label: 'Hierro cargado sin descontar (kg)', valor: kg(res.meses.reduce((s, b) => s + b.fundidasSinDescontar, 0)), sub: 'fundidas sin orden cerrada', color: res.fundidasSinDescontar.length ? 'text-feisen-rojo' : 'text-green-700' },
              { label: 'Salidas de hierro que no son horno (kg)', valor: kg(res.meses.reduce((s, b) => s + b.otrasSalidas, 0)), sub: `${res.salidasNoHorno.length} movimientos`, color: res.salidasNoHorno.length ? 'text-amber-700' : 'text-green-700' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                <p className={`font-bold text-lg ${c.color}`}>{c.valor}</p>
                <p className="text-xs text-gray-400">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Controles de integridad */}
          <div className="space-y-2">
            {res.fundidasSinDescontar.length > 0 && (
              <Alerta tipo="alerta" mensaje={`${res.fundidasSinDescontar.length} fundida(s) tienen hierro cargado que NO se ha descontado del inventario (${res.fundidasSinDescontar.map(f => `${f.numero}: ${kg(f.kg)} kg`).join(' · ')}). Falta cerrar la orden de moldeo con esa fundida vinculada.`} />
            )}
            {res.ordenesSinHierro.length > 0 && (
              <Alerta tipo="alerta" mensaje={`${res.ordenesSinHierro.length} orden(es) cerradas sin hierro descontado (${res.ordenesSinHierro.map(o => o.orden).join(', ')}). No se les puede calcular merma.`} />
            )}
            {res.ordenesSinPeso.length > 0 && (
              <Alerta tipo="alerta" mensaje={`${res.ordenesSinPeso.length} orden(es) tienen piezas sin peso unitario (${res.ordenesSinPeso.map(o => o.orden).join(', ')}): sus kg de piezas salen en 0 y la merma queda inflada. Carga el peso en el catálogo.`} />
            )}
            {res.detalleOrdenes.some(o => o.negativa) && (
              <Alerta tipo="error" mensaje={`Merma NEGATIVA en ${res.detalleOrdenes.filter(o => o.negativa).map(o => o.orden).join(', ')}: salió más producto que hierro descontado. Revisa los pesos o el kg de hierro registrado.`} />
            )}
            {res.meses.some(b => Math.abs(b.residuo) > 0.5) && (
              <Alerta tipo="alerta" mensaje={`Hay meses con diferencia contable sin explicar (columna "Sin explicar"): el stock del sistema no coincide con inicio + movimientos. Suele venir de ajustes manuales por SQL o de stock que se forzó a 0.`} />
            )}
            {res.comprasSinProveedor.length > 0 && (
              <Alerta tipo="alerta" mensaje={`${res.comprasSinProveedor.length} entrada(s) de hierro sin proveedor registrado (${kg(res.comprasSinProveedor.reduce((s, c) => s + c.kg, 0))} kg).`} />
            )}
          </div>

          {/* Balance mensual */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <p className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Balance mensual (kg)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-gray-50">
                  <tr>
                    {['Mes', 'Stock inicial', '+ Compras', '+ Otras entradas', '+ Vaceadero generado', '− Consumo horno', '− Otras salidas', '− Vaceadero que sale', 'Ajustes', 'Sin explicar', '= Stock final'].map(h => (
                      <th key={h} className="text-right first:text-left px-3 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.meses.map(b => (
                    <tr key={b.mes} className="border-t border-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{labelMes(b.mes)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{kg(b.stockIni)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(b.compras)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(b.otrasEntradas)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(b.vacEntra)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(b.consumoHorno)}</td>
                      <td className={`px-3 py-2 text-right ${b.otrasSalidas > 0 ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>{kg(b.otrasSalidas)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(b.vacSale)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{kg(b.ajustes)}</td>
                      <td className={`px-3 py-2 text-right ${Math.abs(b.residuo) > 0.5 ? 'text-feisen-rojo font-semibold' : 'text-gray-400'}`}>{kg(b.residuo)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-feisen-azul">{kg(b.stockFin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Producción y merma mensual */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <p className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Fundido, piezas y merma (kg)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-gray-50">
                  <tr>
                    {['Mes', 'Hierro cargado (fundidas)', 'Hierro descontado (órdenes)', 'Piezas buenas', 'NC (kg)', 'Vaceadero', 'Merma real', '% real', 'Merma esperada', 'Desviación'].map(h => (
                      <th key={h} className="text-right first:text-left px-3 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.meses.map(b => (
                    <tr key={b.mes} className={`border-t border-gray-50 ${b.alerta ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-2 font-medium text-gray-800">{labelMes(b.mes)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(b.hierroCargado)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(b.hierroOrdenes)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(b.buenas)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{kg(b.nc)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(b.vaceadero)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(b.merma)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${b.alerta ? 'text-feisen-rojo' : 'text-gray-700'}`}>{b.hierroOrdenes > 0 ? pct(b.mermaPct) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{kg(b.mermaEsperadaKg)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${b.desviacionKg > 0 && b.alerta ? 'text-feisen-rojo' : 'text-gray-700'}`}>{kg(b.desviacionKg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2 text-xs text-gray-400">
              Merma real = hierro descontado − piezas buenas − vaceadero (el vaceadero ya incluye los kg de piezas NC que vuelven al horno).
              Se marca en rojo el mes cuya merma pasa de {pct(res.mermaEsperada)} + {res.tolerancia} puntos.
            </p>
          </div>

          {/* Detalle por orden */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center gap-3">
              <p className="text-sm font-semibold text-gray-700">Detalle por orden de moldeo</p>
              <select value={mesDetalle} onChange={e => setMesDetalle(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white">
                {res.meses.map(b => <option key={b.mes} value={b.mes}>{labelMes(b.mes)}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-gray-50">
                  <tr>
                    {['Orden', 'Fecha', 'Hierro descontado', 'Piezas buenas', 'Vaceadero', 'Merma', '% merma', 'Uds. NC', 'Uds. faltantes'].map(h => (
                      <th key={h} className="text-right first:text-left px-3 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detalleMes.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">No hay órdenes completadas en este mes.</td></tr>
                  )}
                  {detalleMes.map(o => (
                    <tr key={o.orden} className={`border-t border-gray-50 ${o.alerta || o.negativa ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-2 font-mono text-xs text-gray-800">{o.orden}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmtFecha(o.fecha)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(o.hierro)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(o.buenas)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{kg(o.vaceadero)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{o.pct === null ? '—' : kg(o.merma)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${o.alerta || o.negativa ? 'text-feisen-rojo' : 'text-gray-700'}`}>{o.pct === null ? 'sin hierro' : pct(o.pct)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{o.ncUds}</td>
                      <td className={`px-3 py-2 text-right ${o.faltante > 0 ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>{o.faltante}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Piezas no conformes por mes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <p className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Piezas no conformes y faltantes por mes</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-gray-50">
                  <tr>
                    {['Mes', 'Órdenes', 'Planeadas', 'Conformes', 'No conformes', '% NC', 'Faltantes (uds.)', 'NC (kg)'].map(h => (
                      <th key={h} className="text-right first:text-left px-3 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.meses.map(b => (
                    <tr key={b.mes} className="border-t border-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{labelMes(b.mes)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{b.ordenes}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{b.plan}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{b.conf}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{b.ncUds}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{pct(b.pctNC)}</td>
                      <td className={`px-3 py-2 text-right ${b.faltanteUds > 0 ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>{b.faltanteUds}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{kg(b.nc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2 text-xs text-gray-400">El detalle por pieza, motivo y moldeador está en el Excel (hojas "No conformes" y "Moldeadores").</p>
          </div>

          {/* Conteo físico */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Conteo físico vs. sistema al cierre de {labelMes(ultimoMes.mes)}</p>
            <p className="text-xs text-gray-400">Escribe lo que hay en patio/bodega. Esa diferencia es la señal más directa de faltante. No se guarda; se incluye en el Excel si lo diligencias antes de descargar.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Producto</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Sistema (kg)</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Conteo físico (kg)</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {res.stockPorItem.map(r => {
                    const v = conteo[r.id]
                    const dif = v !== undefined && v !== '' ? parseFloat(v) - r.sistema : null
                    return (
                      <tr key={r.id} className="border-t border-gray-50">
                        <td className="px-3 py-2 text-gray-800">{r.nombre}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{kg(r.sistema)}</td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" step="0.1" value={v ?? ''} onChange={e => setConteo(c => ({ ...c, [r.id]: e.target.value }))}
                            className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-right text-sm" />
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${dif === null ? 'text-gray-300' : dif < -0.5 ? 'text-feisen-rojo' : 'text-gray-700'}`}>
                          {dif === null ? '—' : kg(dif)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Salidas que no son horno */}
          {res.salidasNoHorno.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <p className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Salidas de hierro que NO son consumo de horno</p>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['Fecha', 'N°', 'Producto', 'Kg', 'Destino', 'Referencia', 'Registró'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {res.salidasNoHorno.map((s, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-3 py-2 text-gray-600">{fmtFecha(s.fecha)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{s.numero}</td>
                        <td className="px-3 py-2 text-gray-800">{s.item}</td>
                        <td className="px-3 py-2 font-semibold text-amber-700">{kg(s.kg)}</td>
                        <td className="px-3 py-2 text-gray-600">{s.destino}</td>
                        <td className="px-3 py-2 text-gray-600">{s.referencia}</td>
                        <td className="px-3 py-2 text-gray-600">{s.usuario}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
