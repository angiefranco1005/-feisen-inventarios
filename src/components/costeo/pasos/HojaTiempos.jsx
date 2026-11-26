import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Upload, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatCOP, formatNumber } from '../utils/format'
import { tipoTitulo } from '../utils/nombres'
import { construirPlantillaTiempos, duracion, etapasSugeridas, lecturasNecesarias, leerPlantillaTiempos, segundosPorPieza } from '../utils/plantillaTiempos'
import { falta } from './datosPasos'

// Paso 4 · Tiempos por etapas con plantilla de Excel (Angie, 2026-11-26).
// Descargar plantilla → el jefe toma los tiempos en planta (10 lecturas por etapa) → subirla.
// Al subir: se crean/actualizan las etapas (costeo_proceso_etapas), se reemplazan sus lecturas
// (costeo_etapa_lecturas) y por cada operación se deja UNA medición en costeo_tiempos_reales con
// origen 'etapas' (horas por pieza, unidades 1, a la persona de la operación). Así la mano de obra y
// el CIF salen de las vistas de siempre. Volver a subir el archivo reemplaza, no duplica.
const cop = (n) => formatCOP(n).replace(/,00$/, '')
const BTN = 'h-10 inline-flex items-center gap-1.5 rounded-lg px-3 text-sm'
const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

export default function HojaTiempos({ arbol, procesos, corto, buscar, soloFalta, onAbrir, onCambio }) {
  const [etapas, setEtapas] = useState(null) // { [procesoId]: [{ id, nombre, piezas_por_vez, orden, lecturas: [...] }] }
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(null) // resultado de leer el Excel, antes de guardar
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const archivo = useRef(null)

  const internos = useMemo(() => procesos.filter((p) => !p.proceso.externo), [procesos])
  const nombreMaquina = tipoTitulo(arbol.fichas[arbol.raizId]?.nombre || 'Máquina')

  async function cargarEtapas() {
    const ids = procesos.map((p) => p.proceso.id)
    if (!ids.length) return setEtapas({})
    const { data: et, error: e1 } = await supabase.from('costeo_proceso_etapas').select('*').in('proceso_id', ids).order('orden')
    if (e1) return setError('No se pudieron leer las etapas: ' + e1.message)
    const etIds = (et || []).map((e) => e.id)
    const { data: lec, error: e2 } = etIds.length ? await supabase.from('costeo_etapa_lecturas').select('*').in('etapa_id', etIds).order('n') : { data: [] }
    if (e2) return setError('No se pudieron leer las lecturas: ' + e2.message)
    const porProceso = {}
    for (const e of [...(et || [])].sort((a, b) => a.orden - b.orden)) {
      ;(porProceso[e.proceso_id] ||= []).push({ ...e, lecturas: (lec || []).filter((l) => l.etapa_id === e.id).sort((a, b) => a.n - b.n) })
    }
    setEtapas(porProceso)
  }
  useEffect(() => {
    cargarEtapas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procesos])

  const titulo = (p) => {
    const pieza = p.fila ? corto(p.fila.ficha?.nombre) : 'Ensamble final'
    const n = (arbol.procesos[p.proceso.ficha_id] || []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).findIndex((x) => x.id === p.proceso.id) + 1
    const cargo = p.proceso.cargo_nombre ? ` · ${tipoTitulo(p.proceso.cargo_nombre)}` : ''
    return `${pieza} · ${n} · ${p.proceso.nombre}${cargo}`
  }

  function descargar() {
    setError('')
    const operaciones = internos.map((p) => {
      const guardadas = etapas?.[p.proceso.id] || []
      return {
        procesoId: p.proceso.id,
        titulo: titulo(p),
        etapas: guardadas.length
          ? guardadas.map((e) => ({
              id: e.id,
              nombre: e.nombre,
              piezas: e.piezas_por_vez,
              lecturas: e.lecturas.map((l) => Number(l.segundos)),
              operario: e.lecturas.find((l) => l.operario)?.operario,
              fecha: e.lecturas.find((l) => l.fecha)?.fecha,
              notas: e.lecturas.find((l) => l.notas)?.notas,
            }))
          : etapasSugeridas(p.proceso.nombre).map((nombre) => ({ id: null, nombre, piezas: 1, lecturas: [] })),
      }
    })
    if (!operaciones.length) return setError('Esta máquina todavía no tiene operaciones internas. Agrégalas en el paso 2 · Hojas de ruta.')
    const bytes = construirPlantillaTiempos({ maquina: nombreMaquina, operaciones })
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `Tiempos ${nombreMaquina.replace(/[\\/:*?"<>|]/g, '-')} ${hoyISO()}.xlsx`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  async function leer(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError('')
    setAviso('')
    try {
      const r = leerPlantillaTiempos(new Uint8Array(await f.arrayBuffer()))
      const conocidos = new Map(procesos.map((p) => [p.proceso.id, p]))
      const ops = []
      for (const op of r.operaciones) {
        const p = conocidos.get(op.procesoId)
        if (!p) {
          r.avisos.push(`«${op.titulo}» no es de esta máquina o ya no existe; se ignoró.`)
          continue
        }
        if (p.proceso.externo) {
          r.avisos.push(`«${op.titulo}» ahora es externa; se ignoró.`)
          continue
        }
        // Código desconocido → etapa nueva. Sin código pero con el mismo nombre de una etapa guardada →
        // es esa (así subir dos veces el mismo archivo no duplica etapas).
        const guardadas = etapas?.[op.procesoId] || []
        const ids = new Set(guardadas.map((x) => x.id))
        const norm = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
        const usadas = new Set()
        op.etapas = op.etapas.map((et) => {
          let id = et.id && ids.has(et.id) ? et.id : null
          if (!id) id = guardadas.find((g) => !usadas.has(g.id) && norm(g.nombre) === norm(et.nombre))?.id || null
          if (id) usadas.add(id)
          return { ...et, id }
        })
        ops.push({ ...op, p })
      }
      setRevision({ archivo: f.name, operaciones: ops, avisos: r.avisos })
    } catch (err) {
      setError('No se pudo leer el archivo: ' + (err.message || err))
    }
  }

  async function guardar() {
    setGuardando(true)
    setError('')
    const ok = ({ error: e, data }) => {
      if (e) throw new Error(e.message)
      return data
    }
    try {
      let nEtapas = 0
      let nLecturas = 0
      for (const op of revision.operaciones) {
        for (const [i, et] of op.etapas.entries()) {
          let id = et.id
          const fila = { nombre: et.nombre, piezas_por_vez: et.piezas, orden: i + 1 }
          if (id) ok(await supabase.from('costeo_proceso_etapas').update(fila).eq('id', id))
          else id = ok(await supabase.from('costeo_proceso_etapas').insert({ proceso_id: op.procesoId, ...fila }).select())[0].id
          ok(await supabase.from('costeo_etapa_lecturas').delete().eq('etapa_id', id))
          if (et.lecturas.length) {
            ok(await supabase.from('costeo_etapa_lecturas').insert(et.lecturas.map((s, k) => ({ etapa_id: id, n: k + 1, segundos: s, operario: et.operario, fecha: et.fecha, notas: et.notas }))))
          }
          nEtapas++
          nLecturas += et.lecturas.length
        }
        // Etapas guardadas que no venían en el archivo: se conservan y cuentan para el total.
        const enArchivo = new Set(op.etapas.map((e) => e.id).filter(Boolean))
        const otras = (etapas?.[op.procesoId] || []).filter((e) => !enArchivo.has(e.id)).map((e) => ({ piezas: e.piezas_por_vez, lecturas: e.lecturas.map((l) => Number(l.segundos)) }))
        const seg = segundosPorPieza([...op.etapas, ...otras])
        ok(await supabase.from('costeo_tiempos_reales').delete().eq('proceso_id', op.procesoId).eq('origen', 'etapas'))
        if (seg > 0) {
          const persona = (arbol.manoObra[op.procesoId] || [])[0]
          const medidas = op.etapas.filter((e) => e.lecturas.length).length + otras.filter((e) => e.lecturas.length).length
          ok(
            await supabase.from('costeo_tiempos_reales').insert({
              ficha_id: op.p.proceso.ficha_id,
              proceso_id: op.procesoId,
              mano_obra_id: persona?.mano_obra_id || null,
              responsable: persona?.nombre || null,
              etapa: op.p.proceso.nombre,
              fecha: hoyISO(),
              num_operarios: 1,
              horas: seg / 3600,
              unidades: 1,
              notas: `Plantilla de etapas: ${medidas} etapas medidas (${duracion(seg)} por pieza)`,
              origen: 'etapas',
            })
          )
        }
      }
      setRevision(null)
      setAviso(`Listo: ${nEtapas} etapas y ${nLecturas} lecturas guardadas.`)
      await cargarEtapas()
      await onCambio()
    } catch (err) {
      setError('No se pudo guardar todo: ' + (err.message || err) + '. Lo que alcanzó a guardarse quedó; puedes volver a subir el archivo.')
    }
    setGuardando(false)
  }

  const q = buscar.trim().toLowerCase()
  const visibles = procesos.filter((p) => {
    const nombre = `${p.fila?.ficha?.nombre || ''} ${p.proceso.nombre}`.toLowerCase()
    return (!q || nombre.includes(q)) && (!soloFalta || falta.tiempos(p.proceso, p.costo))
  })

  return (
    <div>
      <div className="px-3 sm:px-4 py-3 border-b border-feisen-borde-suave bg-feisen-azul-suave/40 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px] text-sm text-feisen-texto-2">
          <span className="font-medium text-feisen-texto">Plantilla de tiempos.</span> Descárgala, toma 10 lecturas por etapa con cronómetro y súbela. Si la vuelves a subir con más lecturas, se actualiza.
        </div>
        <button type="button" onClick={descargar} disabled={!etapas} className={`${BTN} border border-feisen-borde bg-white text-feisen-azul hover:bg-feisen-azul-suave disabled:opacity-60`}>
          <Download size={15} /> Descargar plantilla
        </button>
        <button type="button" onClick={() => archivo.current?.click()} className={`${BTN} bg-feisen-azul text-white font-medium hover:opacity-90`}>
          <Upload size={15} /> Subir plantilla
        </button>
        <input ref={archivo} type="file" accept=".xlsx,.xls" onChange={leer} className="hidden" />
      </div>
      {error && <p className="px-4 py-3 text-sm text-feisen-rojo">{error}</p>}
      {aviso && <p className="px-4 py-3 text-sm text-emerald-800 bg-emerald-50">{aviso}</p>}

      {revision && <Revision revision={revision} etapas={etapas} titulo={titulo} guardando={guardando} onGuardar={guardar} onCancelar={() => setRevision(null)} />}

      {!procesos.length ? (
        <p className="px-6 py-10 text-center text-sm text-feisen-texto-2">Todavía no hay operaciones. Agrégalas en el paso 2 · Hojas de ruta.</p>
      ) : !visibles.length ? (
        <p className="px-6 py-10 text-center text-sm text-feisen-texto-2">Todas las operaciones tienen su tiempo.</p>
      ) : (
        <div className="divide-y divide-feisen-borde-suave">
          {visibles.map((p) => (
            <Operacion key={p.key} p={p} titulo={titulo(p)} etapas={etapas?.[p.proceso.id] || []} manuales={(arbol.tiempos[p.proceso.id] || []).filter((t) => t.origen !== 'etapas').length} onAbrir={onAbrir} />
          ))}
        </div>
      )}
      <div className="px-4 py-2 bg-feisen-gris text-xs text-feisen-texto-2">
        {internos.length} operaciones internas · {internos.filter((p) => !falta.tiempos(p.proceso, p.costo)).length} con tiempo
      </div>
    </div>
  )
}

function Operacion({ p, titulo, etapas, manuales, onAbrir }) {
  if (p.proceso.externo) {
    return (
      <section className="px-3 sm:px-4 py-3 text-sm text-feisen-texto-2">
        <span className="font-medium text-feisen-texto">{titulo}</span> · <span className="rounded px-1.5 text-[11px] font-medium bg-amber-50 text-amber-800">Externa</span> no lleva toma de tiempos.
      </section>
    )
  }
  const datos = etapas.map((e) => {
    const xs = e.lecturas.map((l) => Number(l.segundos))
    const prom = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
    const necesita = lecturasNecesarias(xs)
    return { ...e, xs, prom, porPieza: prom / (Number(e.piezas_por_vez) || 1), necesita }
  })
  const total = datos.reduce((s, e) => s + e.porPieza, 0)
  const sinPersona = Number(p.costo.lineas_mano_obra || 0) === 0
  return (
    <section className="px-3 sm:px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium text-feisen-texto">{titulo}</h3>
        <span className="flex-1" />
        {total > 0 && <span className="text-sm tabular-nums font-semibold text-feisen-texto">{duracion(total)} <span className="font-normal text-xs text-feisen-texto-2">por pieza</span></span>}
        {Number(p.costo.total_mod) > 0 && <span className="text-sm tabular-nums text-feisen-texto-2">MO {cop(p.costo.total_mod)}</span>}
        {sinPersona && <span className="text-xs rounded-full px-2 py-0.5 bg-amber-50 text-amber-800">Falta quién lo hace (paso 2)</span>}
        <button type="button" onClick={() => onAbrir({ tipo: 'proceso', id: p.proceso.id })} className="text-xs text-feisen-azul hover:underline">Detalle</button>
      </div>
      {!datos.length ? (
        <p className="mt-1 text-xs text-feisen-texto-2">Sin etapas todavía: vienen propuestas en la plantilla.{manuales ? ` Tiene ${manuales} ${manuales === 1 ? 'medición' : 'mediciones'} sueltas de antes.` : ''}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm border-collapse">
            <thead>
              <tr className="text-xs text-feisen-texto-2 text-left">
                <th className="font-medium py-1 pr-2">Etapa</th>
                <th className="font-medium py-1 px-2 text-right">Piezas cada vez</th>
                <th className="font-medium py-1 px-2 text-right">Lecturas</th>
                <th className="font-medium py-1 px-2 text-right">Promedio</th>
                <th className="font-medium py-1 px-2 text-right">Por pieza</th>
                <th className="font-medium py-1 px-2 w-32">Peso</th>
                <th className="font-medium py-1 pl-2">¿Bastan?</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((e) => {
                const pct = total > 0 ? e.porPieza / total : 0
                const faltan = e.necesita ? Math.max(0, e.necesita - e.xs.length) : null
                return (
                  <tr key={e.id} className="border-t border-feisen-borde-suave tabular-nums [&>td:not(:first-child)]:whitespace-nowrap">
                    <td className="py-1.5 pr-2 text-feisen-texto">{e.nombre}</td>
                    <td className="py-1.5 px-2 text-right">{formatNumber(e.piezas_por_vez, e.piezas_por_vez % 1 ? 2 : 0)}</td>
                    <td className="py-1.5 px-2 text-right">{e.xs.length || '—'}</td>
                    <td className="py-1.5 px-2 text-right">{e.xs.length ? duracion(e.prom) : '—'}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{e.xs.length ? duracion(e.porPieza) : '—'}</td>
                    <td className="py-1.5 px-2">
                      {pct > 0 && (
                        <span className="flex items-center gap-1.5 text-xs text-feisen-texto-2">
                          <span className="h-2 rounded-full bg-feisen-azul" style={{ width: `${Math.max(4, pct * 80)}px` }} />
                          {Math.round(pct * 100)} %
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pl-2 text-xs">
                      {!e.xs.length ? <span className="text-amber-700">Sin lecturas</span> : faltan === null ? <span className="text-feisen-texto-2">Faltan lecturas</span> : faltan === 0 ? <span className="text-emerald-700">Sí</span> : <span className="text-amber-700">Faltan {faltan}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Revision({ revision, etapas, titulo, guardando, onGuardar, onCancelar }) {
  const total = revision.operaciones.reduce((s, op) => s + op.etapas.reduce((a, e) => a + e.lecturas.length, 0), 0)
  return (
    <div className="m-3 sm:m-4 rounded-xl border border-feisen-azul bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-feisen-texto">Revisa antes de guardar</div>
          <div className="text-xs text-feisen-texto-2">{revision.archivo} · {revision.operaciones.length} operaciones · {total} lecturas</div>
        </div>
        <button type="button" onClick={onCancelar} aria-label="Cancelar" className="w-9 h-9 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo"><X size={16} /></button>
      </div>
      <ul className="mt-3 divide-y divide-feisen-borde-suave text-sm">
        {revision.operaciones.map((op) => {
          const nuevas = op.etapas.filter((e) => !e.id).length
          const seg = segundosPorPieza(op.etapas)
          const antes = (etapas?.[op.procesoId] || []).length
          return (
            <li key={op.procesoId} className="py-2 flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="text-feisen-texto">{titulo(op.p)}</span>
              <span className="flex-1" />
              <span className="text-xs text-feisen-texto-2 tabular-nums">
                {op.etapas.length} etapas{nuevas && antes ? ` (${nuevas} nuevas)` : ''} · {op.etapas.reduce((a, e) => a + e.lecturas.length, 0)} lecturas · {seg > 0 ? `${duracion(seg)} por pieza` : 'sin lecturas'}
              </span>
            </li>
          )
        })}
      </ul>
      {revision.avisos.length > 0 && (
        <ul className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 list-disc pl-6">
          {revision.avisos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onGuardar} disabled={guardando || !revision.operaciones.length} className={`${BTN} bg-feisen-azul text-white font-medium disabled:opacity-60`}>{guardando ? 'Guardando…' : 'Guardar tiempos'}</button>
        <button type="button" onClick={onCancelar} className={`${BTN} text-feisen-texto-2 hover:bg-feisen-fondo`}>Cancelar</button>
      </div>
    </div>
  )
}
