import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, FileSpreadsheet, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatCOP, formatNumber } from '../utils/format'
import { tipoTitulo } from '../utils/nombres'
import { LECTURAS, construirPlantillaTiempos, duracion, etapasSugeridas, lecturasNecesarias, leerPlantillaTiempos, segundosPorPieza } from '../utils/plantillaTiempos'
import { falta } from './datosPasos'

// Paso 4 · Tiempos por etapas con plantilla de Excel (Angie, 2026-11-26).
// Descargar plantilla → el jefe toma los tiempos en planta (3 lecturas por etapa para empezar) → subirla.
// Al subir: se crean/actualizan las etapas (costeo_proceso_etapas), se reemplazan sus lecturas
// (costeo_etapa_lecturas) y por cada operación se deja UNA medición en costeo_tiempos_reales con
// origen 'etapas' (horas por pieza, unidades 1, a la persona de la operación). Así la mano de obra y
// el CIF salen de las vistas de siempre. Volver a subir el archivo reemplaza, no duplica.
const cop = (n) => formatCOP(n).replace(/,00$/, '')
const BTN = 'h-10 inline-flex items-center gap-1.5 rounded-lg px-3 text-sm'
const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const ok = ({ error: e, data }) => {
  if (e) throw new Error(e.message)
  return data
}

// Deja UNA fila en costeo_tiempos_reales (origen 'etapas') para la operación, calculada con TODAS sus
// etapas y lecturas tal como quedaron guardadas en la base. La usan la subida de la plantilla y la toma
// a mano, para que las dos calculen igual. Devuelve los segundos por pieza (0 si no hay lecturas).
async function recalcularResumen({ proceso, persona, fuente }) {
  const et = ok(await supabase.from('costeo_proceso_etapas').select('id, piezas_por_vez').eq('proceso_id', proceso.id)) || []
  const ids = et.map((e) => e.id)
  const lec = ids.length ? ok(await supabase.from('costeo_etapa_lecturas').select('etapa_id, segundos').in('etapa_id', ids)) || [] : []
  const todas = et.map((e) => ({ piezas: e.piezas_por_vez, lecturas: lec.filter((l) => l.etapa_id === e.id).map((l) => Number(l.segundos)) }))
  const seg = segundosPorPieza(todas)
  const medidas = todas.filter((e) => e.lecturas.some((x) => x > 0)).length
  ok(await supabase.from('costeo_tiempos_reales').delete().eq('proceso_id', proceso.id).eq('origen', 'etapas'))
  if (seg > 0) {
    ok(
      await supabase.from('costeo_tiempos_reales').insert({
        ficha_id: proceso.ficha_id,
        proceso_id: proceso.id,
        mano_obra_id: persona?.mano_obra_id || null,
        responsable: persona?.nombre || null,
        etapa: proceso.nombre,
        fecha: hoyISO(),
        num_operarios: 1,
        horas: seg / 3600,
        unidades: 1,
        notas: `${fuente}: ${medidas} etapas medidas (${duracion(seg)} por pieza)`,
        origen: 'etapas',
      })
    )
  }
  return seg
}

export default function HojaTiempos({ arbol, procesos, corto, buscar, soloFalta, onAbrir, onCambio }) {
  const [etapas, setEtapas] = useState(null) // { [procesoId]: [{ id, nombre, piezas_por_vez, orden, lecturas: [...] }] }
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(null) // resultado de leer el Excel, antes de guardar
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const archivo = useRef(null)
  const [menu, setMenu] = useState(false) // menú «Plantilla de Excel»
  const [piezasAbiertas, setPiezasAbiertas] = useState(() => new Set())
  const [opsAbiertas, setOpsAbiertas] = useState(() => new Set())

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
        // Etapas guardadas que no venían en el archivo se conservan y cuentan para el total.
        await recalcularResumen({ proceso: op.p.proceso, persona: (arbol.manoObra[op.procesoId] || [])[0], fuente: 'Plantilla de etapas' })
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

  // Vista «desplegables por pieza» (Angie, 2026-11-26): arriba tres números; abajo una línea por pieza
  // (cerrada al entrar) y, al abrirla, una línea por operación; al abrir la operación, sus etapas.
  const q = buscar.trim().toLowerCase()
  const visibles = procesos.filter((p) => {
    const nombre = `${p.fila?.ficha?.nombre || ''} ${p.proceso.nombre}`.toLowerCase()
    return (!q || nombre.includes(q)) && (!soloFalta || falta.tiempos(p.proceso, p.costo))
  })
  const filtrando = !!q || soloFalta
  const resumenDe = (p) => resumenOperacion(etapas?.[p.proceso.id] || [])
  const grupos = []
  for (const p of visibles) {
    const fichaId = p.fila?.fichaId || arbol.raizId
    let g = grupos.find((x) => x.fichaId === fichaId)
    if (!g) {
      const nombre = !p.fila ? 'Ensamble final de la máquina' : p.fila.esConjunto ? `Ensamble · ${corto(p.fila.ficha?.nombre)}` : corto(p.fila.ficha?.nombre)
      g = { fichaId, nombre, cant: p.fila?.cant ?? 1, ops: [] }
      grupos.push(g)
    }
    g.ops.push(p)
  }
  // Números de arriba: mano de obra de una máquina completa (tiempo por pieza × cuántas lleva).
  const conTiempo = internos.filter((p) => resumenDe(p).total > 0)
  const totalMaquina = internos.reduce((s, p) => s + resumenDe(p).total * (p.fila?.cantTotal ?? 1), 0)
  const masLarga = conTiempo.reduce((m, p) => {
    const t = resumenDe(p).total * (p.fila?.cantTotal ?? 1)
    return !m || t > m.t ? { p, t } : m
  }, null)
  const alternar = (setFn, key) =>
    setFn((c) => {
      const n = new Set(c)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })

  return (
    <div>
      <div className="px-3 sm:px-4 pt-4 pb-3 grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))]">
        <Numero titulo="Mano de obra por máquina" valor={totalMaquina > 0 ? duracion(totalMaquina) : '—'} />
        <Numero titulo="Operaciones con tiempo" valor={`${conTiempo.length} de ${internos.length}`} />
        <Numero titulo="Lo que más demora" valor={masLarga ? masLarga.p.proceso.nombre : '—'} nota={masLarga ? `${masLarga.p.fila ? corto(masLarga.p.fila.ficha?.nombre) : 'Ensamble final'} · ${duracion(masLarga.t)}` : ''} />
      </div>
      <div className="px-3 sm:px-4 pb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-feisen-texto-2 flex-1 min-w-[200px]">Toca una pieza para ver sus operaciones, y una operación para ver sus etapas.</span>
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} className={`${BTN} h-9 border border-feisen-borde bg-white text-feisen-texto hover:bg-feisen-fondo`}>
            <FileSpreadsheet size={15} /> Plantilla de Excel <ChevronDown size={14} />
          </button>
          {menu && (
            <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-feisen-borde bg-white p-1 shadow-lg">
              <button type="button" disabled={!etapas} onClick={() => { setMenu(false); descargar() }} className="w-full flex items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-feisen-fondo disabled:opacity-60">
                <Download size={15} className="mt-0.5 text-feisen-azul" />
                <span><span className="block text-feisen-texto">Descargar plantilla</span><span className="block text-xs text-feisen-texto-2">Para tomar los tiempos en planta: 3 lecturas por etapa.</span></span>
              </button>
              <button type="button" onClick={() => { setMenu(false); archivo.current?.click() }} className="w-full flex items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-feisen-fondo">
                <Upload size={15} className="mt-0.5 text-feisen-azul" />
                <span><span className="block text-feisen-texto">Subir plantilla llena</span><span className="block text-xs text-feisen-texto-2">Te muestra un resumen antes de guardar.</span></span>
              </button>
            </div>
          )}
          <input ref={archivo} type="file" accept=".xlsx,.xls" onChange={leer} className="hidden" />
        </div>
      </div>
      {error && <p className="px-4 py-3 text-sm text-feisen-rojo">{error}</p>}
      {aviso && <p className="px-4 py-3 text-sm text-emerald-800 bg-emerald-50">{aviso}</p>}

      {revision && <Revision revision={revision} etapas={etapas} titulo={titulo} guardando={guardando} onGuardar={guardar} onCancelar={() => setRevision(null)} />}

      {!procesos.length ? (
        <p className="px-6 py-10 text-center text-sm text-feisen-texto-2">Todavía no hay operaciones. Agrégalas en el paso 2 · Hojas de ruta.</p>
      ) : !visibles.length ? (
        <p className="px-6 py-10 text-center text-sm text-feisen-texto-2">Todas las operaciones tienen su tiempo.</p>
      ) : (
        <div className="px-3 sm:px-4 pb-4 flex flex-col gap-2">
          {grupos.map((g) => {
            const abierto = filtrando || piezasAbiertas.has(g.fichaId)
            const internasG = g.ops.filter((p) => !p.proceso.externo)
            const totalG = internasG.reduce((s, p) => s + resumenDe(p).total, 0)
            const estadoG = !internasG.length ? 'gris' : internasG.every((p) => resumenDe(p).estado === 'ok') ? 'ok' : totalG > 0 ? 'falta' : 'gris'
            return (
              <section key={g.fichaId} className="rounded-xl border border-feisen-borde bg-white overflow-hidden">
                <button type="button" onClick={() => alternar(setPiezasAbiertas, g.fichaId)} aria-expanded={abierto} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-feisen-fondo">
                  {abierto ? <ChevronDown size={16} className="text-feisen-texto-2 flex-none" /> : <ChevronRight size={16} className="text-feisen-texto-2 flex-none" />}
                  <Punto estado={estadoG} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold text-feisen-texto">{g.nombre}</span>
                    {g.cant !== 1 && <span className="text-xs text-feisen-texto-2"> × {formatNumber(g.cant, g.cant % 1 ? 2 : 0)}</span>}
                    <span className="hidden sm:inline text-xs text-feisen-texto-2"> · {g.ops.length} {g.ops.length === 1 ? 'operación' : 'operaciones'}</span>
                  </span>
                  <span className={`flex-none text-right tabular-nums ${totalG > 0 ? 'text-sm font-semibold text-feisen-texto' : 'text-xs text-feisen-texto-2'}`}>
                    {totalG > 0 ? duracion(totalG) : 'Sin tiempos'}
                    {totalG > 0 && <span className="hidden sm:inline text-xs font-normal text-feisen-texto-2"> por pieza</span>}
                  </span>
                </button>
                {abierto &&
                  g.ops.map((p) => (
                    <Operacion
                      key={p.key}
                      p={p}
                      resumen={resumenDe(p)}
                      etapas={etapas?.[p.proceso.id] || []}
                      abierta={filtrando || opsAbiertas.has(p.proceso.id)}
                      onAlternar={() => alternar(setOpsAbiertas, p.proceso.id)}
                      manuales={(arbol.tiempos[p.proceso.id] || []).filter((t) => t.origen !== 'etapas').length}
                      persona={(arbol.manoObra[p.proceso.id] || [])[0]}
                      onAbrir={onAbrir}
                      onGuardado={async (msg) => {
                        setAviso(msg)
                        await cargarEtapas()
                        await onCambio()
                      }}
                    />
                  ))}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Estado de una operación a partir de sus etapas guardadas.
function resumenOperacion(etapas) {
  const datos = etapas.map((e) => {
    const xs = e.lecturas.map((l) => Number(l.segundos)).filter((x) => x > 0)
    const prom = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
    return { ...e, xs, prom, porPieza: prom / (Number(e.piezas_por_vez) || 1) }
  })
  const total = datos.reduce((s, e) => s + e.porPieza, 0)
  let faltan = 0
  let sinTomar = 0
  for (const e of datos) {
    if (!e.xs.length) sinTomar++
    else faltan += Math.max(0, lecturasNecesarias(e.xs, total > 0 ? e.porPieza / total : null) - e.xs.length)
  }
  const estado = total <= 0 ? 'gris' : faltan || sinTomar ? 'falta' : 'ok'
  const texto = !datos.length ? 'Sin etapas' : total <= 0 ? 'Sin tomar' : faltan ? `Faltan ${faltan} ${faltan === 1 ? 'toma' : 'tomas'}` : sinTomar ? `${sinTomar} ${sinTomar === 1 ? 'etapa' : 'etapas'} sin tomar` : `${datos.length} ${datos.length === 1 ? 'etapa' : 'etapas'}`
  return { datos, total, estado, texto }
}

function Punto({ estado }) {
  return <span className={`w-2 h-2 rounded-full flex-none ${estado === 'ok' ? 'bg-emerald-600' : estado === 'falta' ? 'bg-amber-500' : 'bg-feisen-borde'}`} aria-hidden="true" />
}

function Numero({ titulo, valor, nota }) {
  return (
    <div className="rounded-lg bg-feisen-fondo px-3 py-2.5 min-w-0">
      <div className="text-xs text-feisen-texto-2">{titulo}</div>
      <div className="text-lg font-semibold text-feisen-texto tabular-nums truncate">{valor}</div>
      {nota && <div className="text-xs text-feisen-texto-2 truncate">{nota}</div>}
    </div>
  )
}

function Operacion({ p, resumen, etapas, abierta, onAlternar, manuales, persona, onAbrir, onGuardado }) {
  const [editando, setEditando] = useState(false)
  if (p.proceso.externo) {
    return (
      <div className="flex items-center gap-2 border-t border-feisen-borde-suave px-3 py-2 pl-9 text-sm text-feisen-texto-2">
        <Punto estado="gris" />
        <span className="truncate">{p.proceso.nombre}</span>
        <span className="ml-auto text-xs">Externa · no lleva tiempo</span>
      </div>
    )
  }
  const { datos, total } = resumen
  const sinPersona = Number(p.costo.lineas_mano_obra || 0) === 0
  const ver = abierta || editando
  return (
    <div className="border-t border-feisen-borde-suave">
      <button type="button" onClick={onAlternar} aria-expanded={ver} className="w-full flex items-center gap-2 px-3 py-2 pl-5 sm:pl-7 text-left hover:bg-feisen-fondo">
        {ver ? <ChevronDown size={14} className="text-feisen-texto-2 flex-none" /> : <ChevronRight size={14} className="text-feisen-texto-2 flex-none" />}
        <Punto estado={resumen.estado} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-feisen-texto">
            {p.proceso.nombre}
            {p.proceso.cargo_nombre && <span className="hidden sm:inline text-feisen-texto-2"> · {tipoTitulo(p.proceso.cargo_nombre)}</span>}
          </span>
          <span className={`block text-xs ${resumen.estado === 'ok' ? 'text-feisen-texto-2' : 'text-amber-700'}`}>{resumen.texto}</span>
        </span>
        <span className="flex-none text-right text-sm font-semibold tabular-nums text-feisen-texto">{total > 0 ? duracion(total) : '—'}</span>
      </button>
      {ver && (
        <div className="bg-feisen-fondo/60 border-t border-feisen-borde-suave px-3 sm:pl-14 pl-8 pr-3 py-3">
          {sinPersona && <p className="mb-2 text-xs text-amber-700">Falta quién lo hace: ponle el cargo en el paso 2 · Hojas de ruta.</p>}
          {editando ? (
            <EditorTiempos
              proceso={p.proceso}
              etapas={etapas}
              persona={persona}
              onCancelar={() => setEditando(false)}
              onGuardado={async (msg) => {
                setEditando(false)
                await onGuardado(msg)
              }}
            />
          ) : (
            <>
              {!datos.length ? (
                <p className="text-xs text-feisen-texto-2">Sin etapas todavía: vienen propuestas en la plantilla, o tómalos a mano.{manuales ? ` Tiene ${manuales} ${manuales === 1 ? 'medición' : 'mediciones'} sueltas de antes.` : ''}</p>
              ) : (
                <ul className="flex flex-col gap-1.5 max-w-2xl">
                  {datos.map((e) => {
                    const pct = total > 0 ? e.porPieza / total : 0
                    const faltan = e.xs.length ? Math.max(0, lecturasNecesarias(e.xs, total > 0 ? pct : null) - e.xs.length) : 0
                    return (
                      <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(60px,30%)_96px] items-center gap-3 text-sm" title={e.xs.length ? `${e.xs.length} lecturas · promedio ${duracion(e.prom)}` : ''}>
                        <span className="min-w-0 text-feisen-texto">
                          {e.nombre}
                          {Number(e.piezas_por_vez) !== 1 && <span className="text-xs text-feisen-texto-2"> (salen {formatNumber(e.piezas_por_vez, e.piezas_por_vez % 1 ? 2 : 0)})</span>}
                        </span>
                        <span className="hidden sm:block h-1.5 rounded-full bg-feisen-azul-suave">
                          <span className="block h-1.5 rounded-full bg-feisen-azul" style={{ width: `${Math.round(pct * 100)}%` }} />
                        </span>
                        <span className="text-right tabular-nums whitespace-nowrap">
                          {!e.xs.length ? (
                            <span className="text-xs rounded px-1.5 py-0.5 bg-amber-50 text-amber-800">Sin tomar</span>
                          ) : (
                            <>
                              {duracion(e.porPieza)}
                              {faltan > 0 && <span className="block text-[11px] text-amber-700">faltan {faltan}</span>}
                            </>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setEditando(true)} className={`${BTN} h-9 border border-feisen-borde bg-white text-feisen-azul hover:bg-feisen-azul-suave`}>
                  <Pencil size={14} /> {datos.length ? 'Editar tiempos' : 'Tomar a mano'}
                </button>
                {Number(p.costo.total_mod) > 0 && <span className="text-xs text-feisen-texto-2 tabular-nums">Mano de obra {cop(p.costo.total_mod)} por pieza</span>}
                <button type="button" onClick={() => onAbrir({ tipo: 'proceso', id: p.proceso.id })} className="text-xs text-feisen-azul hover:underline">Ver detalle</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Lectura escrita a mano: «230» = 230 s; «3:50» = 3 min 50 s (acepta coma decimal). '' = vacía.
function leerSegundos(texto) {
  const t = String(texto ?? '').trim().replace(',', '.')
  if (!t) return { vacia: true }
  const m = t.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/)
  if (m) return Number(m[2]) >= 60 ? { error: 'Los segundos van de 0 a 59' } : { seg: Number(m[1]) * 60 + Number(m[2]) }
  const n = Number(t)
  if (!Number.isFinite(n) || !/^\d*\.?\d+$|^-/.test(t)) return { error: 'Escribe segundos (230) o min:seg (3:50)' }
  return n > 0 ? { seg: n } : { error: 'Debe ser mayor que 0' }
}
const textoSeg = (s) => {
  const n = Number(s)
  if (!(n > 0)) return ''
  if (n < 60) return String(Math.round(n * 100) / 100)
  const m = Math.floor(n / 60)
  const r = Math.round((n - m * 60) * 100) / 100
  return r >= 60 ? `${m + 1}:00` : `${m}:${String(r).padStart(2, '0')}`
}
let llave = 0
const filaNueva = (nombre = '') => ({ key: `n${++llave}`, id: null, nombre, piezas: '1', lecturas: Array(LECTURAS).fill(''), operario: '', fecha: hoyISO(), notas: null, guardadas: 0 })

// Toma de tiempos a mano, sin plantilla (Angie, 2026-11-26). Editor en línea para UNA operación: no se
// guarda nada hasta «Guardar». Al guardar: actualiza/crea/borra etapas, reemplaza sus lecturas y
// recalcula la fila resumen con recalcularResumen (la misma función que usa la subida del Excel).
function EditorTiempos({ proceso, etapas, persona, onCancelar, onGuardado }) {
  const [filas, setFilas] = useState(() =>
    etapas.length
      ? etapas.map((e) => {
          const xs = e.lecturas.map((l) => textoSeg(l.segundos))
          return {
            key: e.id,
            id: e.id,
            nombre: e.nombre,
            piezas: String(e.piezas_por_vez ?? 1),
            lecturas: [...xs, ...Array(Math.max(0, LECTURAS - xs.length)).fill('')],
            operario: e.lecturas.find((l) => l.operario)?.operario || '',
            fecha: e.lecturas.find((l) => l.fecha)?.fecha || hoyISO(),
            notas: e.lecturas.find((l) => l.notas)?.notas || null,
            guardadas: e.lecturas.length,
          }
        })
      : etapasSugeridas(proceso.nombre).map((n) => filaNueva(n))
  )
  const [intentado, setIntentado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cambiar = (i, campo, v) => setFilas((fs) => fs.map((f, k) => (k === i ? { ...f, [campo]: v } : f)))
  const cambiarLectura = (i, j, v) => setFilas((fs) => fs.map((f, k) => (k === i ? { ...f, lecturas: f.lecturas.map((x, m) => (m === j ? v : x)) } : f)))
  const mover = (i, d) =>
    setFilas((fs) => {
      const j = i + d
      if (j < 0 || j >= fs.length) return fs
      const c = [...fs]
      ;[c[i], c[j]] = [c[j], c[i]]
      return c
    })
  const quitar = (i) => {
    const f = filas[i]
    if (f.guardadas > 0 && !window.confirm(`¿Quitar la etapa «${f.nombre || 'sin nombre'}» y sus ${f.guardadas} lecturas guardadas? Se borra al guardar.`)) return
    setFilas((fs) => fs.filter((_, k) => k !== i))
  }

  // Cálculo en vivo y validación.
  const calc = filas.map((f) => {
    const lect = f.lecturas.map(leerSegundos)
    const xs = lect.filter((l) => l.seg > 0).map((l) => l.seg)
    const pz = Number(String(f.piezas).trim().replace(',', '.'))
    const piezasOk = String(f.piezas).trim() !== '' && Number.isFinite(pz) && pz > 0
    const prom = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
    const errores = []
    if (!f.nombre.trim() && (xs.length || f.id)) errores.push('Escribe el nombre de la etapa.')
    if (!piezasOk) errores.push('«Piezas que salen cada vez» debe ser un número mayor que 0.')
    return { lect, xs, pz: piezasOk ? pz : 1, piezasOk, prom, porPieza: prom / (piezasOk ? pz : 1), errores }
  })
  const total = calc.reduce((s, c) => s + c.porPieza, 0)
  const hayErrores = calc.some((c) => c.errores.length || c.lect.some((l) => l.error))

  async function guardar() {
    setIntentado(true)
    setError('')
    if (hayErrores) return setError('Revisa los campos en rojo antes de guardar.')
    setGuardando(true)
    try {
      // Filas en blanco (sin nombre, sin lecturas y nuevas) no se guardan.
      const quedan = filas.map((f, i) => ({ f, c: calc[i] })).filter(({ f, c }) => f.id || f.nombre.trim() || c.xs.length)
      const siguen = new Set(quedan.map(({ f }) => f.id).filter(Boolean))
      const borrar = etapas.filter((e) => !siguen.has(e.id)).map((e) => e.id)
      if (borrar.length) {
        ok(await supabase.from('costeo_etapa_lecturas').delete().in('etapa_id', borrar))
        ok(await supabase.from('costeo_proceso_etapas').delete().in('id', borrar))
      }
      let nLecturas = 0
      for (const [i, { f, c }] of quedan.entries()) {
        const fila = { nombre: f.nombre.trim(), piezas_por_vez: c.pz, orden: i + 1 }
        let id = f.id
        if (id) ok(await supabase.from('costeo_proceso_etapas').update(fila).eq('id', id))
        else id = ok(await supabase.from('costeo_proceso_etapas').insert({ proceso_id: proceso.id, ...fila }).select())[0].id
        ok(await supabase.from('costeo_etapa_lecturas').delete().eq('etapa_id', id))
        if (c.xs.length) {
          ok(
            await supabase.from('costeo_etapa_lecturas').insert(
              c.xs.map((s, k) => ({ etapa_id: id, n: k + 1, segundos: Math.round(s * 100) / 100, operario: f.operario.trim() || null, fecha: f.fecha || null, notas: f.notas || null }))
            )
          )
        }
        nLecturas += c.xs.length
      }
      const seg = await recalcularResumen({ proceso, persona, fuente: 'Tiempos a mano' })
      await onGuardado(`Listo: ${proceso.nombre} · ${quedan.length} etapas y ${nLecturas} lecturas guardadas${seg > 0 ? ` (${duracion(seg)} por pieza)` : ''}.`)
    } catch (err) {
      setError('No se pudo guardar todo: ' + (err.message || err) + '. Lo que alcanzó a guardarse quedó; revisa y vuelve a guardar.')
      setGuardando(false)
    }
  }

  const campo = 'h-10 rounded-lg border bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul/30'
  const borde = (mal) => (mal ? 'border-feisen-rojo' : 'border-feisen-borde')
  const icono = 'w-10 h-10 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo disabled:opacity-30'
  return (
    <div className="mt-2 rounded-xl border border-feisen-azul bg-white p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="font-medium text-sm text-feisen-texto">Tiempos a mano</div>
        <div className="flex-1 min-w-[200px] text-xs text-feisen-texto-2">Cada lectura en segundos (230) o minutos:segundos (3:50). Con 3 por etapa basta para empezar.</div>
        {total > 0 && <div className="text-sm tabular-nums font-semibold text-feisen-texto">{duracion(total)} <span className="font-normal text-xs text-feisen-texto-2">por pieza</span></div>}
      </div>

      <ol className="mt-3 space-y-3">
        {filas.map((f, i) => {
          const c = calc[i]
          const pct = total > 0 ? c.porPieza / total : 0
          const faltan = Math.max(0, lecturasNecesarias(c.xs, total > 0 ? pct : null) - c.xs.length)
          const errLect = c.lect.find((l) => l.error)?.error
          return (
            <li key={f.key} className="rounded-lg border border-feisen-borde-suave bg-feisen-gris/40 p-2">
              <div className="flex items-center gap-1">
                <span className="w-6 text-center text-xs text-feisen-texto-2 tabular-nums">{i + 1}</span>
                <input value={f.nombre} onChange={(e) => cambiar(i, 'nombre', e.target.value)} placeholder="Nombre de la etapa" aria-label={`Nombre de la etapa ${i + 1}`} className={`${campo} ${borde(intentado && !f.nombre.trim() && (c.xs.length || f.id))} min-w-0 flex-1`} />
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir etapa" title="Subir" className={icono}><ArrowUp size={16} /></button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === filas.length - 1} aria-label="Bajar etapa" title="Bajar" className={icono}><ArrowDown size={16} /></button>
                <button type="button" onClick={() => quitar(i)} aria-label="Quitar etapa" title="Quitar etapa" className={`${icono} hover:text-feisen-rojo`}><Trash2 size={16} /></button>
              </div>

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="text-xs text-feisen-texto-2">
                  <span className="block mb-0.5">Piezas que salen cada vez</span>
                  <input value={f.piezas} onChange={(e) => cambiar(i, 'piezas', e.target.value)} inputMode="decimal" className={`${campo} ${borde(intentado && !c.piezasOk)} w-24 text-right tabular-nums`} />
                </label>
                <label className="text-xs text-feisen-texto-2 flex-1 min-w-[120px]">
                  <span className="block mb-0.5">Operario (opcional)</span>
                  <input value={f.operario} onChange={(e) => cambiar(i, 'operario', e.target.value)} className={`${campo} ${borde(false)} w-full`} />
                </label>
                <label className="text-xs text-feisen-texto-2">
                  <span className="block mb-0.5">Fecha</span>
                  <input type="date" value={f.fecha} onChange={(e) => cambiar(i, 'fecha', e.target.value)} className={`${campo} ${borde(false)} w-40`} />
                </label>
              </div>

              <div className="mt-2 text-xs text-feisen-texto-2">Lecturas</div>
              <div className="mt-0.5 overflow-x-auto -mx-1 px-1 pb-1">
                <div className="flex gap-1.5 w-max">
                  {f.lecturas.map((v, j) => (
                    <input
                      key={j}
                      value={v}
                      onChange={(e) => cambiarLectura(i, j, e.target.value)}
                      inputMode="text"
                      autoComplete="off"
                      placeholder={String(j + 1)}
                      aria-label={`Etapa ${i + 1}, lectura ${j + 1}`}
                      className={`${campo} ${borde(c.lect[j].error && (intentado || v.trim().length > 0))} w-[4.5rem] text-right tabular-nums placeholder:text-feisen-texto-2/50`}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums text-feisen-texto-2">
                <span>Promedio <b className="font-medium text-feisen-texto">{c.xs.length ? duracion(c.prom) : '—'}</b></span>
                <span>Por pieza <b className="font-medium text-feisen-texto">{c.xs.length ? duracion(c.porPieza) : '—'}</b></span>
                {pct > 0 && <span>Peso {Math.round(pct * 100)} %</span>}
                <span>
                  ¿Bastan?{' '}
                  {!c.xs.length ? <span className="text-amber-700">Sin lecturas</span> : faltan === 0 ? <span className="text-emerald-700">Sí</span> : <span className="text-amber-700">Faltan {faltan}</span>}
                </span>
              </div>
              {(errLect || (intentado && c.errores.length > 0)) && (
                <ul className="mt-1 text-xs text-feisen-rojo">
                  {errLect && <li>Lectura: {errLect}.</li>}
                  {intentado && c.errores.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
            </li>
          )
        })}
      </ol>

      <button type="button" onClick={() => setFilas((fs) => [...fs, filaNueva()])} className={`${BTN} mt-2 text-feisen-azul hover:bg-feisen-azul-suave`}>
        <Plus size={15} /> Etapa
      </button>

      {error && <p className="mt-2 text-sm text-feisen-rojo">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={guardar} disabled={guardando} className={`${BTN} bg-feisen-azul text-white font-medium hover:opacity-90 disabled:opacity-60`}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" onClick={onCancelar} disabled={guardando} className={`${BTN} text-feisen-texto-2 hover:bg-feisen-fondo`}>Cancelar</button>
      </div>
    </div>
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
