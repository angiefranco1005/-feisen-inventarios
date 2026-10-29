import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP } from './utils/format'
import { CENTROS_COSTO } from './utils/centrosCosto'
import { mesActual, anioActual, periodoPromedio, esPromedio, anioDePromedio, formatearPeriodo } from './utils/periodoCif'

const FORM_CONCEPTO_VACIO = { concepto: '', monto: '' }

export default function CifMaestro() {
  const [periodos, setPeriodos] = useState([])
  const [periodoActivo, setPeriodoActivo] = useState(mesActual())
  const [conceptos, setConceptos] = useState([])
  const [horas, setHoras] = useState({})
  const [formPorCentro, setFormPorCentro] = useState({})
  const [guardandoConceptoCentro, setGuardandoConceptoCentro] = useState(null)
  const [guardandoHorasCentro, setGuardandoHorasCentro] = useState(null)
  const [loading, setLoading] = useState(true)

  async function cargarPeriodos() {
    const [{ data: c }, { data: h }] = await Promise.all([
      supabase.from('costeo_cif_conceptos').select('periodo'),
      supabase.from('costeo_cif_horas').select('periodo'),
    ])
    const set = new Set([...(c || []).map((x) => x.periodo), ...(h || []).map((x) => x.periodo)])
    const lista = [...set].sort((a, b) => b.localeCompare(a))
    setPeriodos(lista)
    return lista
  }

  async function cargarPeriodoActivo(periodo) {
    const [{ data: conceptosData }, { data: horasData }] = await Promise.all([
      supabase
        .from('costeo_cif_conceptos')
        .select('*')
        .eq('periodo', periodo)
        .order('created_at', { ascending: true }),
      supabase.from('costeo_cif_horas').select('*').eq('periodo', periodo),
    ])
    setConceptos(conceptosData || [])
    const mapaHoras = {}
    for (const c of CENTROS_COSTO) mapaHoras[c] = ''
    for (const h of horasData || []) {
      mapaHoras[h.centro_costo] = h.horas_mod_mes != null ? String(h.horas_mod_mes) : ''
    }
    setHoras(mapaHoras)
  }

  async function cargarTodo() {
    setLoading(true)
    const lista = await cargarPeriodos()
    const activo = lista[0] || mesActual()
    setPeriodoActivo(activo)
    await cargarPeriodoActivo(activo)
    setLoading(false)
  }

  useEffect(() => {
    cargarTodo()
  }, [])

  async function cambiarPeriodoActivo(p) {
    if (!p) return
    setPeriodoActivo(p)
    setLoading(true)
    await cargarPeriodoActivo(p)
    setLoading(false)
  }

  function actualizarFormCentro(centro, campo, valor) {
    setFormPorCentro((prev) => ({
      ...prev,
      [centro]: { ...(prev[centro] || FORM_CONCEPTO_VACIO), [campo]: valor },
    }))
  }

  async function agregarConcepto(centro) {
    const f = formPorCentro[centro] || FORM_CONCEPTO_VACIO
    if (!f.concepto?.trim()) return
    setGuardandoConceptoCentro(centro)
    await supabase.from('costeo_cif_conceptos').insert({
      periodo: periodoActivo,
      centro_costo: centro,
      concepto: f.concepto.trim(),
      monto: Number(f.monto || 0),
    })
    setFormPorCentro((prev) => ({ ...prev, [centro]: FORM_CONCEPTO_VACIO }))
    await Promise.all([cargarPeriodoActivo(periodoActivo), cargarPeriodos()])
    setGuardandoConceptoCentro(null)
  }

  async function eliminarConcepto(id) {
    await supabase.from('costeo_cif_conceptos').delete().eq('id', id)
    await Promise.all([cargarPeriodoActivo(periodoActivo), cargarPeriodos()])
  }

  async function guardarHoras(centro) {
    setGuardandoHorasCentro(centro)
    await supabase.from('costeo_cif_horas').upsert({
      periodo: periodoActivo,
      centro_costo: centro,
      horas_mod_mes: Number(horas[centro] || 0),
      updated_at: new Date().toISOString(),
    })
    await Promise.all([cargarPeriodoActivo(periodoActivo), cargarPeriodos()])
    setGuardandoHorasCentro(null)
  }

  const conceptosPorCentro = {}
  for (const centro of CENTROS_COSTO) conceptosPorCentro[centro] = []
  for (const c of conceptos) {
    if (!conceptosPorCentro[c.centro_costo]) conceptosPorCentro[c.centro_costo] = []
    conceptosPorCentro[c.centro_costo].push(c)
  }
  const totalGeneralPeriodo = conceptos.reduce((acc, c) => acc + Number(c.monto || 0), 0)

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-feisen-azul">CIF de planta</h1>
      <main className="mt-6">
        <p className="text-sm text-feisen-texto-2 mb-4">
          Acá cargas los CIF (costos indirectos de fabricación) de <strong>toda la planta</strong>,
          por <strong>centro de costo</strong> (Aluminio, Fundición, Feisen) y por <strong>periodo</strong> —
          puede ser un mes puntual, o un <strong>promedio anual</strong> si lo que tienes es un
          estimado de todo el año y no un mes específico. Cada ficha toma automáticamente las tasas
          del periodo más reciente que hayas cargado (o del que le hayas fijado) y reparte el CIF de
          cada centro según las horas de MOD que tuvo en las etapas de ese centro — no necesitas
          entrar a cada ficha para esto. Recuerda asignarle un centro de costo a cada etapa en
          "Responsables por etapa" para que las horas se clasifiquen bien.
        </p>

        <div className="bg-white border border-feisen-borde rounded-lg p-4 mb-6 max-w-md">
          <label className="block text-xs font-medium mb-1">Estás viendo/editando</label>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => cambiarPeriodoActivo(mesActual())}
              className={`text-xs rounded-full px-3 py-1 border ${
                !esPromedio(periodoActivo)
                  ? 'bg-feisen-azul text-white border-feisen-azul'
                  : 'bg-white text-feisen-texto-2 border-feisen-borde hover:border-feisen-azul'
              }`}
            >
              Un mes específico
            </button>
            <button
              type="button"
              onClick={() => cambiarPeriodoActivo(periodoPromedio(anioActual()))}
              className={`text-xs rounded-full px-3 py-1 border ${
                esPromedio(periodoActivo)
                  ? 'bg-feisen-azul text-white border-feisen-azul'
                  : 'bg-white text-feisen-texto-2 border-feisen-borde hover:border-feisen-azul'
              }`}
            >
              Promedio anual
            </button>
          </div>

          {esPromedio(periodoActivo) ? (
            <div>
              <label className="block text-xs font-medium mb-1">Año del promedio</label>
              <input
                type="number"
                step="1"
                value={anioDePromedio(periodoActivo)}
                onChange={(e) => cambiarPeriodoActivo(periodoPromedio(e.target.value))}
                className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
              />
              <p className="text-xs text-feisen-texto-2 mt-1">
                Usa esto cuando el CIF que tienes es un promedio de varios meses o de todo el año, no
                de un mes puntual.
              </p>
            </div>
          ) : (
            <input
              type="month"
              value={periodoActivo}
              onChange={(e) => cambiarPeriodoActivo(e.target.value)}
              className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
            />
          )}
          {periodos.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {periodos.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => cambiarPeriodoActivo(p)}
                  className={`text-xs rounded-full px-2 py-0.5 border ${
                    periodoActivo === p
                      ? 'bg-feisen-azul text-white border-feisen-azul'
                      : 'border-feisen-borde text-feisen-texto-2 hover:border-feisen-azul'
                  }`}
                >
                  {formatearPeriodo(p)}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-feisen-texto-2">Cargando…</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            {CENTROS_COSTO.map((centro) => {
              const lista = conceptosPorCentro[centro] || []
              const totalCentro = lista.reduce((acc, c) => acc + Number(c.monto || 0), 0)
              const horasCentro = Number(horas[centro] || 0)
              const tasaCentro = horasCentro > 0 ? totalCentro / horasCentro : 0
              const f = formPorCentro[centro] || FORM_CONCEPTO_VACIO
              return (
                <div key={centro} className="bg-white border border-feisen-borde rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-feisen-rojo text-white font-semibold text-sm">{centro}</div>
                  <div className="p-3">
                    {lista.length === 0 ? (
                      <p className="text-xs text-feisen-texto-2 mb-2">Sin conceptos este mes.</p>
                    ) : (
                      <table className="w-full text-xs mb-2">
                        <tbody>
                          {lista.map((c) => (
                            <tr key={c.id} className="border-t border-feisen-borde">
                              <td className="py-1 pr-2">{c.concepto}</td>
                              <td className="py-1 pr-2 text-right whitespace-nowrap">{formatCOP(c.monto)}</td>
                              <td className="py-1 text-right">
                                <button
                                  onClick={() => eliminarConcepto(c.id)}
                                  className="text-feisen-rojo hover:underline"
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-feisen-borde font-semibold">
                            <td className="py-1 pr-2">Total</td>
                            <td className="py-1 pr-2 text-right whitespace-nowrap">{formatCOP(totalCentro)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    )}

                    <div className="flex flex-col gap-1 mb-3">
                      <input
                        value={f.concepto}
                        onChange={(e) => actualizarFormCentro(centro, 'concepto', e.target.value)}
                        placeholder="Concepto (ej. Arriendo bodega)"
                        className="w-full border border-feisen-borde rounded-md px-2 py-1 text-xs outline-none focus:border-feisen-azul"
                      />
                      <div className="flex gap-1">
                        <input
                          type="number"
                          step="any"
                          value={f.monto}
                          onChange={(e) => actualizarFormCentro(centro, 'monto', e.target.value)}
                          placeholder="Monto mensual"
                          className="flex-1 border border-feisen-borde rounded-md px-2 py-1 text-xs outline-none focus:border-feisen-azul"
                        />
                        <button
                          onClick={() => agregarConcepto(centro)}
                          disabled={guardandoConceptoCentro === centro}
                          className="text-xs bg-feisen-azul text-white rounded-md px-2 hover:opacity-90 disabled:opacity-60"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-feisen-borde pt-2">
                      <label className="block text-xs font-medium mb-1">Horas MOD de planta (este centro)</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          step="any"
                          value={horas[centro] ?? ''}
                          onChange={(e) => setHoras((prev) => ({ ...prev, [centro]: e.target.value }))}
                          className="flex-1 border border-feisen-borde rounded-md px-2 py-1 text-xs outline-none focus:border-feisen-azul"
                        />
                        <button
                          onClick={() => guardarHoras(centro)}
                          disabled={guardandoHorasCentro === centro}
                          className="text-xs bg-feisen-azul text-white rounded-md px-2 hover:opacity-90 disabled:opacity-60"
                        >
                          {guardandoHorasCentro === centro ? '…' : 'Guardar'}
                        </button>
                      </div>
                      <p className="text-xs text-feisen-texto-2 mt-1">Tasa: {formatCOP(tasaCentro)}/hora</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && (
          <p className="text-sm text-feisen-texto-2">
            Total CIF de planta en {formatearPeriodo(periodoActivo)}: <strong>{formatCOP(totalGeneralPeriodo)}</strong>
          </p>
        )}
      </main>
    </div>
  )
}
