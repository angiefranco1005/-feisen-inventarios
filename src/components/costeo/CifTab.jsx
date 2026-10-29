import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'
import { CENTROS_COSTO } from './utils/centrosCosto'
import { formatearPeriodo } from './utils/periodoCif'

export default function CifTab({ fichaId }) {
  const [periodos, setPeriodos] = useState([])
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('')
  const [ficha, setFicha] = useState(null)
  const [resumenFicha, setResumenFicha] = useState(null)
  const [horasFichaCentro, setHorasFichaCentro] = useState({})
  const [tasasPeriodoUsado, setTasasPeriodoUsado] = useState({})
  const [fijando, setFijando] = useState(false)
  const [guardandoCentro, setGuardandoCentro] = useState(false)
  const [loading, setLoading] = useState(true)

  async function cargarPeriodos() {
    const [{ data: c }, { data: h }] = await Promise.all([
      supabase.from('costeo_cif_conceptos').select('periodo'),
      supabase.from('costeo_cif_horas').select('periodo'),
    ])
    const set = new Set([...(c || []).map((x) => x.periodo), ...(h || []).map((x) => x.periodo)])
    return [...set].sort((a, b) => b.localeCompare(a))
  }

  async function cargarTasasPeriodo(periodo) {
    if (!periodo) return {}
    const [{ data: conceptosData }, { data: horasData }] = await Promise.all([
      supabase.from('costeo_cif_conceptos').select('centro_costo, monto').eq('periodo', periodo),
      supabase.from('costeo_cif_horas').select('centro_costo, horas_mod_mes').eq('periodo', periodo),
    ])
    const mapa = {}
    for (const c of CENTROS_COSTO) mapa[c] = { total: 0, horas: 0, tasa: 0 }
    for (const c of conceptosData || []) {
      if (!mapa[c.centro_costo]) mapa[c.centro_costo] = { total: 0, horas: 0, tasa: 0 }
      mapa[c.centro_costo].total += Number(c.monto || 0)
    }
    for (const h of horasData || []) {
      if (!mapa[h.centro_costo]) mapa[h.centro_costo] = { total: 0, horas: 0, tasa: 0 }
      mapa[h.centro_costo].horas = Number(h.horas_mod_mes || 0)
    }
    for (const centro of Object.keys(mapa)) {
      mapa[centro].tasa = mapa[centro].horas > 0 ? mapa[centro].total / mapa[centro].horas : 0
    }
    return mapa
  }

  async function cargarFicha() {
    const [{ data: fichaData }, { data: resumenData }, { data: moData }, { data: maestroData }] =
      await Promise.all([
        supabase.from('costeo_fichas').select('id, cif_periodo, centro_costo').eq('id', fichaId).maybeSingle(),
        supabase.from('costeo_resumen').select('*').eq('ficha_id', fichaId).maybeSingle(),
        supabase
          .from('costeo_mano_obra')
          .select('etapa, tipo_pago, num_operarios, horas_por_unidad')
          .eq('ficha_id', fichaId),
        supabase.from('costeo_etapas_maestro').select('etapa, centro_costo'),
      ])
    setFicha(fichaData || null)
    setResumenFicha(resumenData || null)

    const mapaCentroPorEtapa = {}
    for (const m of maestroData || []) mapaCentroPorEtapa[m.etapa] = m.centro_costo
    const horasCentro = {}
    for (const f of moData || []) {
      if (f.tipo_pago === 'destajo') continue
      const centro = mapaCentroPorEtapa[f.etapa] || 'Sin centro asignado'
      const h = Number(f.num_operarios || 0) * Number(f.horas_por_unidad || 0)
      horasCentro[centro] = (horasCentro[centro] || 0) + h
    }
    setHorasFichaCentro(horasCentro)

    const periodoUsado = resumenData?.cif_periodo_usado || null
    const tasas = await cargarTasasPeriodo(periodoUsado)
    setTasasPeriodoUsado(tasas)
  }

  async function cargarTodo() {
    setLoading(true)
    const lista = await cargarPeriodos()
    setPeriodos(lista)
    await cargarFicha()
    setLoading(false)
  }

  useEffect(() => {
    cargarTodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId])

  useEffect(() => {
    if (!periodoSeleccionado && periodos.length > 0) {
      setPeriodoSeleccionado(ficha?.cif_periodo || resumenFicha?.cif_periodo_usado || periodos[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodos, ficha, resumenFicha])

  async function fijarPeriodoFicha() {
    if (!periodoSeleccionado) return
    setFijando(true)
    await supabase.from('costeo_fichas').update({ cif_periodo: periodoSeleccionado }).eq('id', fichaId)
    await cargarFicha()
    setFijando(false)
  }

  async function usarPeriodoVigente() {
    setFijando(true)
    await supabase.from('costeo_fichas').update({ cif_periodo: null }).eq('id', fichaId)
    await cargarFicha()
    setFijando(false)
  }

  async function cambiarCentroFicha(valor) {
    setGuardandoCentro(true)
    await supabase
      .from('costeo_fichas')
      .update({ centro_costo: valor || null })
      .eq('id', fichaId)
    await cargarFicha()
    setGuardandoCentro(false)
  }

  const horasSinCentro = horasFichaCentro['Sin centro asignado'] || 0
  const centroFijo = ficha?.centro_costo || ''
  const tasaCentroFijo = centroFijo ? tasasPeriodoUsado[centroFijo]?.tasa : null

  if (loading) {
    return <p className="text-sm text-feisen-texto-2">Cargando…</p>
  }

  return (
    <div>
      <p className="text-sm text-feisen-texto-2 mb-4">
        Los conceptos y las horas de CIF (por centro de costo y por periodo) se cargan desde el
        inicio, en <strong>"CIF de planta"</strong> — no aquí. Esta ficha toma la tasa del periodo
        vigente (el más reciente cargado) o de uno que le fijes, y le reparte el CIF según sus horas
        de MOD. Puedes dejar que reparta automático según el centro de cada etapa, o fijarle un{' '}
        <strong>centro de costo único</strong> a toda la ficha.
      </p>

      <div className="bg-white border border-feisen-borde rounded-lg p-4 mb-3 max-w-md">
        <label className="block text-xs font-medium mb-1">Centro de costo de esta ficha</label>
        <select
          value={centroFijo}
          onChange={(e) => cambiarCentroFicha(e.target.value)}
          disabled={guardandoCentro}
          className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
        >
          <option value="">-- Automático, según el centro de cada etapa --</option>
          {CENTROS_COSTO.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="text-xs text-feisen-texto-2 mt-1">
          {centroFijo
            ? `Todo el CIF de esta ficha sale del centro ${centroFijo}, según sus horas totales de MOD.`
            : 'Se reparte solo, según el centro de costo de cada etapa (configurado en "Responsables por etapa").'}
        </p>
      </div>

      <div className="bg-white border border-feisen-borde rounded-lg divide-y divide-feisen-borde max-w-md mb-3">
        <div className="px-4 py-2 bg-feisen-gris">
          <h3 className="text-sm font-semibold text-feisen-texto-2">CIF asignado a esta ficha</h3>
        </div>
        <div className="px-4 py-3 text-sm">
          {ficha?.cif_periodo ? (
            <div className="flex items-center justify-between mb-2">
              <span>
                Periodo fijado: <strong>{formatearPeriodo(ficha.cif_periodo)}</strong>
              </span>
              <button
                onClick={usarPeriodoVigente}
                disabled={fijando}
                className="text-xs text-feisen-azul hover:underline"
              >
                Usar periodo vigente
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-2">
              <span>
                Usando el periodo vigente:{' '}
                <strong>{formatearPeriodo(resumenFicha?.cif_periodo_usado)}</strong>
              </span>
            </div>
          )}
          {periodos.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={periodoSeleccionado}
                onChange={(e) => setPeriodoSeleccionado(e.target.value)}
                className="flex-1 border border-feisen-borde rounded-md px-2 py-1 text-xs outline-none focus:border-feisen-azul"
              >
                {periodos.map((p) => (
                  <option key={p} value={p}>
                    {formatearPeriodo(p)}
                  </option>
                ))}
              </select>
              <button
                onClick={fijarPeriodoFicha}
                disabled={fijando || !periodoSeleccionado}
                className="text-xs bg-feisen-azul text-white rounded-md px-3 py-1 hover:opacity-90 disabled:opacity-60"
              >
                Fijar
              </button>
            </div>
          )}
        </div>
        {centroFijo ? (
          <div className="flex justify-between px-4 py-2 text-sm">
            <span>{centroFijo} (fijo)</span>
            <span className="font-medium">
              {formatNumber(resumenFicha?.horas_mod_maquina)} h × {formatCOP(tasaCentroFijo)}/h
            </span>
          </div>
        ) : Object.keys(horasFichaCentro).length === 0 ? (
          <div className="px-4 py-2 text-sm text-feisen-texto-2">Esta ficha todavía no tiene horas de MOD.</div>
        ) : (
          Object.entries(horasFichaCentro).map(([centro, h]) => (
            <div key={centro} className="flex justify-between px-4 py-2 text-sm">
              <span>{centro}</span>
              <span className="font-medium">
                {h} h × {formatCOP(tasasPeriodoUsado[centro]?.tasa)}/h
              </span>
            </div>
          ))
        )}
        <div className="flex justify-between px-4 py-3 bg-feisen-azul text-white font-semibold rounded-b-lg">
          <span>CIF asignado</span>
          <span>{formatCOP(resumenFicha?.cif_asignado)}</span>
        </div>
      </div>
      {!centroFijo && horasSinCentro > 0 && (
        <p className="text-xs text-feisen-rojo max-w-md">
          Esta ficha tiene {horasSinCentro} horas en etapas sin centro de costo asignado — esas horas
          no reciben CIF. Ve a "Responsables por etapa" y asígnales un centro, o fíjale arriba un
          centro de costo único a esta ficha.
        </p>
      )}
    </div>
  )
}
