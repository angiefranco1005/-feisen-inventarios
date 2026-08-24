import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { FileSpreadsheet, Download, Eye, History, RefreshCw } from 'lucide-react'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function hoy() {
  const d = new Date()
  return { anio: d.getFullYear(), mes: d.getMonth() + 1, quincena: d.getDate() <= 15 ? 1 : 2 }
}

function rangoPeriodo(anio, mes, quincena) {
  const inicio = quincena === 1
    ? `${anio}-${String(mes).padStart(2,'0')}-01`
    : `${anio}-${String(mes).padStart(2,'0')}-16`
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const fin = quincena === 1
    ? `${anio}-${String(mes).padStart(2,'0')}-15`
    : `${anio}-${String(mes).padStart(2,'0')}-${ultimoDia}`
  return { inicio, fin }
}

function labelPeriodo(anio, mes, quincena) {
  return `${quincena === 1 ? '1ra' : '2da'} quincena ${MESES[mes-1]} ${anio}`
}

function fmtFecha(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

async function fetchDatosPeriodo(anio, mes, quincena) {
  const { inicio, fin } = rangoPeriodo(anio, mes, quincena)
  const [{ data: ordenes }, { data: fundidas }] = await Promise.all([
    supabase.from('ordenes_moldeo').select(`
      id, numero, fecha, estado,
      ordenes_moldeo_piezas(
        id, asignado_a, cantidad_planeada, cantidad_conforme, cantidad_nc, motivo_nc,
        items(nombre, peso_unitario)
      )
    `).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
    supabase.from('fundidas')
      .select('id, numero, fecha, horneros, vaceadores, auxiliares')
      .gte('fecha', inicio).lte('fecha', fin).order('fecha'),
  ])
  return { ordenes: ordenes || [], fundidas: fundidas || [] }
}

function calcularPersonas(ordenes, fundidas) {
  const personas = {}
  function persona(nombre) {
    const k = (nombre || '').trim()
    if (!k) return null
    if (!personas[k]) personas[k] = {
      nombre: k, planeadas: 0, conformes: 0, nc: 0, kgConformes: 0,
      hornero: 0, vaceador: 0, auxiliar: 0,
    }
    return personas[k]
  }
  for (const ord of ordenes) {
    for (const p of (ord.ordenes_moldeo_piezas || [])) {
      const pr = persona(p.asignado_a || 'Sin asignar')
      if (!pr) continue
      const conf = Number(p.cantidad_conforme || 0)
      const peso = Number(p.items?.peso_unitario || 0)
      pr.planeadas   += Number(p.cantidad_planeada || 0)
      pr.conformes   += conf
      pr.nc          += Number(p.cantidad_nc || 0)
      pr.kgConformes += conf * peso
    }
  }
  for (const f of fundidas) {
    for (const h of (f.horneros  || []).filter(Boolean)) { const pr = persona(h); if (pr) pr.hornero++ }
    for (const v of (f.vaceadores|| []).filter(Boolean)) { const pr = persona(v); if (pr) pr.vaceador++ }
    for (const a of (f.auxiliares|| []).filter(Boolean)) { const pr = persona(a); if (pr) pr.auxiliar++ }
    ;[...(f.horneros||[]),...(f.vaceadores||[]),...(f.auxiliares||[])].filter(Boolean).forEach(n => persona(n))
  }
  return Object.values(personas).sort((a,b) => a.nombre.localeCompare(b.nombre,'es'))
}

function generarWorkbook(anio, mes, quincena, ordenes, fundidas) {
  const personas = calcularPersonas(ordenes, fundidas)
  const periodo  = labelPeriodo(anio, mes, quincena)
  const wb = XLSX.utils.book_new()

  // Hoja 1: Resumen
  const hResumen = [
    [`FEISEN — Informe Quincenal Fundición`],
    [`Período: ${periodo}`],
    [],
    ['PERSONA','PIEZAS PLAN.','CONFORMES','NC','% RENDIMIENTO','KG CONFORMES','FUNDIDAS HORNERO','FUNDIDAS VACEADOR','FUNDIDAS AUXILIAR'],
    ...personas.map(p => [
      p.nombre, p.planeadas, p.conformes, p.nc,
      p.planeadas > 0 ? +(((p.conformes/p.planeadas)*100).toFixed(1)) : '',
      +p.kgConformes.toFixed(2),
      p.hornero||'', p.vaceador||'', p.auxiliar||'',
    ]),
    [],
    ['TOTALES',
      personas.reduce((s,p)=>s+p.planeadas,0),
      personas.reduce((s,p)=>s+p.conformes,0),
      personas.reduce((s,p)=>s+p.nc,0), '',
      +personas.reduce((s,p)=>s+p.kgConformes,0).toFixed(2),
    ],
  ]
  const wsRes = XLSX.utils.aoa_to_sheet(hResumen)
  wsRes['!cols'] = [22,14,12,8,14,14,18,18,16].map(w=>({wch:w}))
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen')

  // Hoja 2: Detalle Moldeo
  const hDetalle = [
    [`DETALLE MOLDEO — ${periodo}`], [],
    ['ORDEN','FECHA','PIEZA','PESO UNIT. (kg)','MOLDEADOR','PLANEADAS','CONFORMES','NC','MOTIVO NC','KG CONFORMES'],
  ]
  for (const ord of ordenes) {
    for (const p of (ord.ordenes_moldeo_piezas||[])) {
      const conf = Number(p.cantidad_conforme||0)
      const peso = Number(p.items?.peso_unitario||0)
      const [y,m,d] = (ord.fecha||'').split('-')
      hDetalle.push([
        `ORD-MOL-${String(ord.numero).padStart(4,'0')}`,
        ord.fecha ? `${d}/${m}/${y}` : '',
        p.items?.nombre||'', peso||'',
        p.asignado_a||'Sin asignar',
        Number(p.cantidad_planeada||0), conf,
        Number(p.cantidad_nc||0), p.motivo_nc||'',
        +((conf*peso).toFixed(2)),
      ])
    }
  }
  const wsDet = XLSX.utils.aoa_to_sheet(hDetalle)
  wsDet['!cols'] = [14,12,28,14,18,10,10,8,20,14].map(w=>({wch:w}))
  XLSX.utils.book_append_sheet(wb, wsDet, 'Detalle Moldeo')

  // Hoja 3: Fundidas
  const hFundidas = [
    [`FUNDIDAS — ${periodo}`], [],
    ['FUNDIDA','FECHA','HORNEROS','VACEADORES','AUXILIARES'],
    ...(fundidas||[]).map(f => {
      const [y,m,d] = (f.fecha||'').split('-')
      return [
        `FUN-${String(f.numero).padStart(4,'0')}`,
        f.fecha ? `${d}/${m}/${y}` : '',
        (f.horneros ||[]).filter(Boolean).join(', '),
        (f.vaceadores||[]).filter(Boolean).join(', '),
        (f.auxiliares||[]).filter(Boolean).join(', '),
      ]
    }),
  ]
  const wsFun = XLSX.utils.aoa_to_sheet(hFundidas)
  wsFun['!cols'] = [14,12,30,30,30].map(w=>({wch:w}))
  XLSX.utils.book_append_sheet(wb, wsFun, 'Fundidas')

  return wb
}

export default function InformeNomina() {
  const { perfil } = useAuth()
  const ini = hoy()
  const [anio,      setAnio]      = useState(ini.anio)
  const [mes,       setMes]       = useState(ini.mes)
  const [quincena,  setQuincena]  = useState(ini.quincena)
  const [cargando,  setCargando]  = useState(false)
  const [resumen,   setResumen]   = useState(null)
  const [error,     setError]     = useState('')
  const [historial, setHistorial] = useState([])
  const [cargandoH, setCargandoH] = useState(false)
  const [descargando, setDescargando] = useState(null) // id del informe que se está re-descargando

  const cargarHistorial = useCallback(async () => {
    setCargandoH(true)
    const { data } = await supabase
      .from('informes_nomina')
      .select('*')
      .order('anio', { ascending: false })
      .order('mes',  { ascending: false })
      .order('quincena', { ascending: false })
    setHistorial(data || [])
    setCargandoH(false)
  }, [])

  useEffect(() => { cargarHistorial() }, [cargarHistorial])

  async function cargarDatos() {
    setError(''); setCargando(true); setResumen(null)
    try {
      const { ordenes, fundidas } = await fetchDatosPeriodo(anio, mes, quincena)
      setResumen({ ordenes, fundidas })
    } catch (e) {
      setError('Error al cargar datos: ' + e.message)
    } finally {
      setCargando(false)
    }
  }

  async function descargarExcel() {
    if (!resumen) return
    const { ordenes, fundidas } = resumen
    const wb = generarWorkbook(anio, mes, quincena, ordenes, fundidas)
    XLSX.writeFile(wb, `Nomina_Fundicion_${MESES[mes-1]}_Q${quincena}_${anio}.xlsx`)

    // Guardar en historial (upsert por período)
    const ya = historial.find(h => h.anio === anio && h.mes === mes && h.quincena === quincena)
    if (ya) {
      await supabase.from('informes_nomina').update({
        fecha_generado: new Date().toISOString(),
        generado_por_id:     perfil?.user_id || null,
        generado_por_nombre: perfil?.nombre  || null,
      }).eq('id', ya.id)
    } else {
      await supabase.from('informes_nomina').insert({
        anio, mes, quincena,
        generado_por_id:     perfil?.user_id || null,
        generado_por_nombre: perfil?.nombre  || null,
      })
    }
    cargarHistorial()
  }

  async function reDescargar(informe) {
    setDescargando(informe.id)
    try {
      const { ordenes, fundidas } = await fetchDatosPeriodo(informe.anio, informe.mes, informe.quincena)
      const wb = generarWorkbook(informe.anio, informe.mes, informe.quincena, ordenes, fundidas)
      XLSX.writeFile(wb, `Nomina_Fundicion_${MESES[informe.mes-1]}_Q${informe.quincena}_${informe.anio}.xlsx`)
    } catch(e) {
      alert('Error al regenerar: ' + e.message)
    } finally {
      setDescargando(null)
    }
  }

  const personas = resumen ? calcularPersonas(resumen.ordenes, resumen.fundidas) : []

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-green-100 p-2.5 rounded-xl">
          <FileSpreadsheet size={22} className="text-green-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Informe Nómina — Fundición</h1>
          <p className="text-xs text-gray-500">Moldeo, recogida y participación en fundidas por persona</p>
        </div>
      </div>

      {/* Selector de período */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Seleccionar quincena</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Año</label>
            <select value={anio} onChange={e => { setAnio(Number(e.target.value)); setResumen(null) }}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul">
              {[2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mes</label>
            <select value={mes} onChange={e => { setMes(Number(e.target.value)); setResumen(null) }}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul">
              {MESES.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Quincena</label>
            <div className="flex rounded-xl overflow-hidden border border-gray-300">
              {[[1,'1ra  (1–15)'],[2,'2da  (16–fin)']].map(([val,lab]) => (
                <button key={val} type="button"
                  onClick={() => { setQuincena(val); setResumen(null) }}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors leading-tight px-1
                    ${quincena === val ? 'bg-feisen-azul text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {lab}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 bg-blue-50 rounded-xl px-4 py-2.5 text-sm font-semibold text-feisen-azul text-center">
          {labelPeriodo(anio, mes, quincena)}
        </div>

        <button onClick={cargarDatos} disabled={cargando}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-feisen-azul text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity">
          <Eye size={16} />
          {cargando ? 'Cargando…' : 'Previsualizar informe'}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* Preview */}
      {resumen && (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <p className="text-sm font-bold text-gray-700">Resumen por persona</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {personas.length} personas · {resumen.ordenes.length} órdenes · {resumen.fundidas.length} fundidas
                </p>
              </div>
              <button onClick={descargarExcel}
                className="flex items-center gap-2 bg-green-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity">
                <Download size={15} /> Descargar Excel
              </button>
            </div>

            {personas.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">Sin datos en este período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 font-bold uppercase border-b border-gray-100">
                      <th className="text-left px-4 py-3">Persona</th>
                      <th className="text-center px-3 py-3">Plan.</th>
                      <th className="text-center px-3 py-3">✓ Conf.</th>
                      <th className="text-center px-3 py-3">✗ NC</th>
                      <th className="text-center px-3 py-3">%</th>
                      <th className="text-center px-3 py-3">Kg conf.</th>
                      <th className="text-center px-3 py-3 text-orange-500">🔥 Fund.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {personas.map(p => {
                      const rend = p.planeadas > 0 ? Math.round((p.conformes/p.planeadas)*100) : null
                      const enFundidas = p.hornero + p.vaceador + p.auxiliar
                      return (
                        <tr key={p.nombre} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-semibold text-gray-800">{p.nombre}</td>
                          <td className="px-3 py-3 text-center text-gray-500">{p.planeadas||'—'}</td>
                          <td className="px-3 py-3 text-center font-bold text-green-600">{p.conformes||'—'}</td>
                          <td className="px-3 py-3 text-center font-bold text-red-500">{p.nc||'—'}</td>
                          <td className="px-3 py-3 text-center">
                            {rend != null ? (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                rend>=80?'bg-green-100 text-green-700':rend>=60?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-600'}`}>
                                {rend}%
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-feisen-azul">
                            {p.kgConformes>0 ? p.kgConformes.toLocaleString('es-CO',{maximumFractionDigits:1}) : '—'}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {enFundidas>0 ? (
                              <div className="flex flex-col items-center gap-0.5 text-xs">
                                {p.hornero  >0 && <span className="text-orange-500 font-semibold">{p.hornero}H</span>}
                                {p.vaceador >0 && <span className="text-blue-500 font-semibold">{p.vaceador}V</span>}
                                {p.auxiliar >0 && <span className="text-gray-500">{p.auxiliar}A</span>}
                              </div>
                            ) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-feisen-azul/5 font-bold text-sm border-t border-feisen-azul/20">
                      <td className="px-4 py-3 text-feisen-azul">Totales</td>
                      <td className="px-3 py-3 text-center">{personas.reduce((s,p)=>s+p.planeadas,0)}</td>
                      <td className="px-3 py-3 text-center text-green-600">{personas.reduce((s,p)=>s+p.conformes,0)}</td>
                      <td className="px-3 py-3 text-center text-red-500">{personas.reduce((s,p)=>s+p.nc,0)}</td>
                      <td />
                      <td className="px-3 py-3 text-center text-feisen-azul">
                        {personas.reduce((s,p)=>s+p.kgConformes,0).toLocaleString('es-CO',{maximumFractionDigits:1})}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {personas.some(p=>p.hornero+p.vaceador+p.auxiliar>0) && (
            <p className="text-xs text-gray-400 text-center mb-4">
              H = Hornero · V = Vaceador · A = Auxiliar
            </p>
          )}

          <button onClick={descargarExcel}
            className="w-full flex items-center justify-center gap-2 bg-green-600 text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity mb-6">
            <Download size={16} /> Descargar Excel completo (3 hojas)
          </button>
        </>
      )}

      {/* Historial de informes generados */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <History size={16} className="text-gray-400" />
            <p className="text-sm font-bold text-gray-700">Historial de informes</p>
          </div>
          <button onClick={cargarHistorial} disabled={cargandoH}
            className="text-gray-400 hover:text-feisen-azul transition-colors">
            <RefreshCw size={15} className={cargandoH ? 'animate-spin' : ''} />
          </button>
        </div>

        {historial.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">
            Aún no hay informes generados. El primero que descargues quedará aquí.
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {historial.map(inf => (
              <div key={inf.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{labelPeriodo(inf.anio, inf.mes, inf.quincena)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Generado {fmtFecha(inf.fecha_generado)}
                    {inf.generado_por_nombre && ` · ${inf.generado_por_nombre}`}
                  </p>
                </div>
                <button onClick={() => reDescargar(inf)} disabled={descargando === inf.id}
                  className="flex items-center gap-1.5 text-xs font-semibold text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-60">
                  <Download size={13} />
                  {descargando === inf.id ? 'Generando…' : 'Re-descargar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
