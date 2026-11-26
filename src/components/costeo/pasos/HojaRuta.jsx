import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Copy, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatNumber } from '../utils/format'
import { tipoTitulo } from '../utils/nombres'
import { falta, normalizar } from './datosPasos'
import { IndicadorObservaciones } from '../Observaciones'

// Paso 2 · Hojas de ruta como secuencia de fichas (opción B; Angie, 2026-11-26).
// Cada pieza es un renglón con sus operaciones en orden. Cada ficha dice la máquina, quién la hace
// (cargo del organigrama) y si es interna o externa (con proveedor). Las operaciones se agregan con un
// toque desde la biblioteca (costeo_operaciones), que trae esos datos llenos; la biblioteca aprende:
// si una operación no tenía máquina o cargo y se lo pones, queda para la próxima.
// Las máquinas salen de Mantenimiento (mant_equipos) y de las que ya tenga costeo; la operación guarda
// el equipo de costeo (costeo_equipos_planta) y, al escoger uno de Mantenimiento sin enlace, se crea
// su par en costeo y se enlaza (mant_equipos.costeo_equipo_id). Una máquina nueva se crea en los dos.
// Al poner el cargo en una operación interna se crea su línea de mano de obra (costeo_proceso_mano_obra)
// para que el paso 4 (tiempos) ya sepa a quién medir.

const BTN = 'h-9 inline-flex items-center gap-1.5 rounded-lg px-3 text-sm'
const CAMPO = 'h-10 w-full rounded-lg border border-feisen-borde bg-white px-2 text-sm text-feisen-texto'

export default function HojaRuta({ arbol, filas, corto, buscar, soloFalta, onCambio }) {
  const [cat, setCat] = useState(null) // { operaciones, equipos, mant, maquinas, cargos, proveedores }
  const [abierto, setAbierto] = useState(null) // { fichaId, modo: 'agregar' | 'editar' | 'copiar', procesoId? }
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function cargarCatalogos() {
    const [op, eq, ca, pr, mt] = await Promise.all([
      supabase.from('costeo_operaciones').select('*').order('orden').order('nombre'),
      supabase.from('costeo_equipos_planta').select('id, nombre').order('nombre'),
      supabase.from('cargos').select('id, nombre, area, subarea').order('area').order('nombre'),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('mant_equipos').select('id, codigo, nombre, costeo_equipo_id').eq('activo', true).order('codigo'),
    ])
    const e = op.error || eq.error || ca.error || pr.error || mt.error
    if (e) setError('No se pudieron cargar las listas: ' + e.message)
    const equipos = eq.data || []
    const mant = mt.data || []
    // Lista única de máquinas: primero las de Mantenimiento, luego las de costeo sin par en Mantenimiento.
    const maquinas = [
      ...mant.map((m) => ({ key: 'm:' + m.id, label: `${m.codigo} · ${tipoTitulo(m.nombre)}`, costeoId: m.costeo_equipo_id || null })),
      ...equipos.filter((x) => !mant.some((m) => m.costeo_equipo_id === x.id)).map((x) => ({ key: 'c:' + x.id, label: tipoTitulo(x.nombre), costeoId: x.id })),
    ]
    setCat({ operaciones: op.data || [], equipos, mant, maquinas, cargos: ca.data || [], proveedores: pr.data || [] })
  }
  useEffect(() => {
    cargarCatalogos()
  }, [])

  // Renglones: cada pieza o conjunto del despiece y, al final, el ensamble de la máquina.
  const renglones = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    const out = filas
      .filter((f) => !q || (f.ficha?.nombre || '').toLowerCase().includes(q))
      .filter((f) => !soloFalta || falta.ruta(f))
      .map((f) => ({ key: f.key, fichaId: f.fichaId, nombre: corto(f.ficha?.nombre), nivel: f.nivel, cant: f.cant, esConjunto: f.esConjunto }))
    if (!soloFalta && !q) out.push({ key: 'raiz', fichaId: arbol.raizId, nombre: 'Ensamble final de la máquina', nivel: 0, cant: 1, esConjunto: true, raiz: true })
    return out
  }, [filas, buscar, soloFalta, corto, arbol.raizId])

  const procesosDe = (fichaId) => [...(arbol.procesos[fichaId] || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  const nombreEquipo = (id) => {
    if (!id || !cat) return null
    const n = cat.mant.find((m) => m.costeo_equipo_id === id)?.nombre || cat.equipos.find((e) => e.id === id)?.nombre
    return n ? tipoTitulo(n) : null
  }
  const claveEquipo = (id) => (id ? cat?.maquinas.find((m) => m.costeoId === id)?.key || 'c:' + id : '')

  // De la clave escogida (m:<mantenimiento> | c:<costeo>) al id de costeo_equipos_planta.
  async function resolverEquipo(clave) {
    if (!clave) return null
    if (clave.startsWith('c:')) return clave.slice(2)
    const m = cat.mant.find((x) => x.id === clave.slice(2))
    if (!m) return null
    if (m.costeo_equipo_id) return m.costeo_equipo_id
    const [nuevo] = ok(await supabase.from('costeo_equipos_planta').insert({ nombre: m.nombre, centro_costo: 'Feisen' }).select())
    ok(await supabase.from('mant_equipos').update({ costeo_equipo_id: nuevo.id }).eq('id', m.id))
    return nuevo.id
  }
  const nombreProveedor = (id) => cat?.proveedores.find((p) => p.id === id)?.nombre

  async function correr(fn) {
    setOcupado(true)
    setError('')
    try {
      await fn()
      await onCambio()
    } catch (e) {
      setError(e.message || String(e))
    }
    setOcupado(false)
  }
  const ok = ({ error: e, data }) => {
    if (e) throw new Error(e.message)
    return data
  }

  // Línea de mano de obra del cargo (para el paso 4). Solo se crea o cambia si es una sola línea.
  async function sincronizarPersona(procesoId, v) {
    const lineas = arbol.manoObra[procesoId] || []
    if (v.externo) {
      const sinMedir = lineas.filter((l) => !Number(l.mediciones)).map((l) => l.mano_obra_id)
      if (sinMedir.length) ok(await supabase.from('costeo_proceso_mano_obra').delete().in('id', sinMedir))
      return
    }
    if (!v.cargo_id) return
    if (!lineas.length) {
      const { data: ult } = await supabase.from('costeo_proceso_mano_obra').select('tipo_pago, tarifa_hora, precio_destajo').eq('cargo_id', v.cargo_id).order('created_at', { ascending: false }).limit(1)
      const u = ult?.[0] || {}
      ok(await supabase.from('costeo_proceso_mano_obra').insert({ proceso_id: procesoId, nombre: v.cargo_nombre, cargo_id: v.cargo_id, tipo_pago: u.tipo_pago || 'hora', tarifa_hora: u.tarifa_hora || 0, precio_destajo: u.precio_destajo || 0, orden: 1 }))
    } else if (lineas.length === 1 && lineas[0].cargo_id !== v.cargo_id) {
      ok(await supabase.from('costeo_proceso_mano_obra').update({ cargo_id: v.cargo_id, nombre: v.cargo_nombre }).eq('id', lineas[0].mano_obra_id))
    }
  }

  // La biblioteca aprende: llena lo que la operación no tenía; si la operación no existe, la crea.
  async function aprender(v) {
    const op = cat.operaciones.find((o) => normalizar(o.nombre) === normalizar(v.nombre))
    if (!op) {
      ok(await supabase.from('costeo_operaciones').insert({ nombre: v.nombre, equipo_id: v.equipo_id, cargo_id: v.cargo_id, cargo_nombre: v.cargo_nombre, externo: v.externo, proveedor_id: v.proveedor_id, orden: 1000 }))
      return
    }
    const cambios = {}
    if (!op.equipo_id && v.equipo_id) cambios.equipo_id = v.equipo_id
    if (!op.externo && !op.cargo_id && v.cargo_id && !v.externo) Object.assign(cambios, { cargo_id: v.cargo_id, cargo_nombre: v.cargo_nombre })
    if (!op.cargo_id && !op.proveedor_id && v.externo) Object.assign(cambios, { externo: true, proveedor_id: v.proveedor_id })
    if (Object.keys(cambios).length) ok(await supabase.from('costeo_operaciones').update(cambios).eq('id', op.id))
  }

  async function insertar(fichaId, v) {
    const orden = Math.max(0, ...procesosDe(fichaId).map((p) => p.orden ?? 0)) + 1
    const fila = { ficha_id: fichaId, nombre: v.nombre, orden, equipo_id: v.equipo_id || null, cargo_id: v.externo ? null : v.cargo_id || null, cargo_nombre: v.externo ? null : v.cargo_nombre || null, externo: !!v.externo, proveedor_id: v.externo ? v.proveedor_id || null : null }
    const [nuevo] = ok(await supabase.from('costeo_procesos').insert(fila).select())
    if (nuevo) await sincronizarPersona(nuevo.id, fila)
    return nuevo
  }

  const agregarDeBiblioteca = (fichaId, op) =>
    correr(async () => {
      await insertar(fichaId, op)
    })

  const agregarOtra = (fichaId, nombre) =>
    correr(async () => {
      const v = { nombre: tipoTitulo(nombre.trim()), externo: false }
      await aprender(v)
      const nuevo = await insertar(fichaId, v)
      await cargarCatalogos()
      if (nuevo) setAbierto({ fichaId, modo: 'editar', procesoId: nuevo.id })
    })

  const guardar = (p, v) =>
    correr(async () => {
      const equipoId = v.externo ? null : await resolverEquipo(v.equipo)
      const cambios = { nombre: v.nombre.trim(), equipo_id: equipoId, externo: v.externo, cargo_id: v.externo ? null : v.cargo_id || null, cargo_nombre: v.externo ? null : v.cargo_nombre || null, proveedor_id: v.externo ? v.proveedor_id || null : null }
      ok(await supabase.from('costeo_procesos').update(cambios).eq('id', p.id))
      await sincronizarPersona(p.id, cambios)
      await aprender(cambios)
      await cargarCatalogos()
      setAbierto(null)
    })

  const mover = (fichaId, p, paso) =>
    correr(async () => {
      const lista = procesosDe(fichaId)
      const i = lista.findIndex((x) => x.id === p.id)
      const j = i + paso
      if (j < 0 || j >= lista.length) return
      ;[lista[i], lista[j]] = [lista[j], lista[i]]
      for (let k = 0; k < lista.length; k++) if (lista[k].orden !== k + 1) ok(await supabase.from('costeo_procesos').update({ orden: k + 1 }).eq('id', lista[k].id))
    })

  function quitar(p) {
    const tieneDatos = (arbol.materiales[p.id] || []).length || (arbol.tiempos[p.id] || []).length
    const aviso = `¿Quitar «${p.nombre}» de la ruta?${tieneDatos ? '\n\nTiene materia prima o tiempos registrados y también se borran.' : ''}`
    if (!window.confirm(aviso)) return
    correr(async () => {
      ok(await supabase.from('costeo_procesos').delete().eq('id', p.id))
      setAbierto(null)
    })
  }

  const copiar = (destinoId, origenId) =>
    correr(async () => {
      for (const p of procesosDe(origenId)) await insertar(destinoId, p)
      setAbierto(null)
    })

  // Máquina nueva: se crea en Mantenimiento (código consecutivo) y su par en costeo, enlazados.
  const crearEquipo = async (nombre) => {
    setError('')
    try {
      const n = nombre.trim().toUpperCase()
      const sig = Math.max(0, ...cat.mant.map((m) => Number(m.codigo)).filter((x) => Number.isFinite(x))) + 1
      const [eq] = ok(await supabase.from('costeo_equipos_planta').insert({ nombre: n, centro_costo: 'Feisen' }).select())
      const [m] = ok(await supabase.from('mant_equipos').insert({ codigo: String(sig), nombre: n, costeo_equipo_id: eq.id, activo: true }).select())
      await cargarCatalogos()
      return 'm:' + m.id
    } catch (e) {
      setError('No se pudo crear la máquina: ' + (e.message || e))
      return null
    }
  }

  if (!filas.length) {
    return <p className="px-6 py-10 text-center text-sm text-feisen-texto-2">Primero agrega las piezas en el paso 1 · Despiece.</p>
  }
  const conRuta = renglones.filter((r) => !r.esConjunto && procesosDe(r.fichaId).length).length
  const piezas = filas.filter((f) => !f.esConjunto)
  const origenes = (destino) => renglones.filter((r) => r.fichaId !== destino && procesosDe(r.fichaId).length)

  return (
    <div className="divide-y divide-feisen-borde-suave">
      {error && <p className="px-4 py-3 text-sm text-feisen-rojo">{error}</p>}
      {!renglones.length && <p className="px-4 py-8 text-center text-sm text-feisen-texto-2">Todas las piezas tienen su hoja de ruta.</p>}
      {renglones.map((r) => {
        const procs = procesosDe(r.fichaId)
        const ab = abierto?.fichaId === r.fichaId ? abierto : null
        const editando = ab?.modo === 'editar' ? procs.find((p) => p.id === ab.procesoId) : null
        return (
          <section key={r.key} className={`px-3 sm:px-4 py-3 ${r.esConjunto ? 'bg-feisen-fondo' : 'bg-white'}`}>
            <div className="flex flex-wrap items-baseline gap-x-2 mb-2" style={{ paddingLeft: Math.min(r.nivel, 4) * 16 }}>
              <h3 className={`text-sm ${r.esConjunto ? 'font-semibold' : 'font-medium'} text-feisen-texto`}>
                {r.esConjunto && !r.raiz ? `Ensamble · ${r.nombre}` : r.nombre}
              </h3>
              <IndicadorObservaciones n={arbol.observaciones?.[r.fichaId]} />
              {r.cant !== 1 && <span className="text-xs text-feisen-texto-2">× {formatNumber(r.cant, r.cant % 1 ? 2 : 0)}</span>}
              {!r.esConjunto && !procs.length && <span className="text-xs rounded-full px-2 py-0.5 bg-amber-50 text-amber-800">Sin ruta</span>}
            </div>
            <div className="flex flex-wrap items-stretch gap-1.5" style={{ paddingLeft: Math.min(r.nivel, 4) * 16 }}>
              {procs.map((p, i) => (
                <div key={p.id} className="flex items-stretch gap-1.5">
                  {i > 0 && <span className="self-center text-feisen-gris-medio" aria-hidden="true">→</span>}
                  <Ficha
                    n={i + 1}
                    p={p}
                    equipo={nombreEquipo(p.equipo_id)}
                    proveedor={nombreProveedor(p.proveedor_id)}
                    activa={editando?.id === p.id}
                    onClick={() => setAbierto(editando?.id === p.id ? null : { fichaId: r.fichaId, modo: 'editar', procesoId: p.id })}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAbierto(ab?.modo === 'agregar' ? null : { fichaId: r.fichaId, modo: 'agregar' })}
                className={`self-center ${BTN} border border-dashed ${ab?.modo === 'agregar' ? 'border-feisen-azul text-feisen-azul bg-feisen-azul-suave' : 'border-feisen-borde text-feisen-texto-2 hover:text-feisen-azul hover:border-feisen-azul'}`}
              >
                <Plus size={14} /> Operación
              </button>
              {origenes(r.fichaId).length > 0 && (
                <button
                  type="button"
                  onClick={() => setAbierto(ab?.modo === 'copiar' ? null : { fichaId: r.fichaId, modo: 'copiar' })}
                  className={`self-center ${BTN} text-feisen-texto-2 hover:text-feisen-azul`}
                >
                  <Copy size={14} /> Copiar ruta de…
                </button>
              )}
            </div>

            {ab?.modo === 'agregar' && cat && (
              <Biblioteca operaciones={cat.operaciones} ocupado={ocupado} onEscoger={(op) => agregarDeBiblioteca(r.fichaId, op)} onOtra={(n) => agregarOtra(r.fichaId, n)} onCerrar={() => setAbierto(null)} />
            )}
            {ab?.modo === 'copiar' && (
              <CopiarRuta origenes={origenes(r.fichaId)} procesosDe={procesosDe} ocupado={ocupado} onCopiar={(o) => copiar(r.fichaId, o)} onCerrar={() => setAbierto(null)} />
            )}
            {editando && cat && (
              <Editor
                key={editando.id}
                p={editando}
                claveEquipo={claveEquipo(editando.equipo_id)}
                cat={cat}
                ocupado={ocupado}
                primero={procs[0]?.id === editando.id}
                ultimo={procs[procs.length - 1]?.id === editando.id}
                onGuardar={(v) => guardar(editando, v)}
                onMover={(paso) => mover(r.fichaId, editando, paso)}
                onQuitar={() => quitar(editando)}
                onCrearEquipo={crearEquipo}
                onCerrar={() => setAbierto(null)}
              />
            )}
          </section>
        )
      })}
      <div className="px-4 py-2 bg-feisen-gris text-xs text-feisen-texto-2">
        {soloFalta || buscar ? `${renglones.length} mostradas` : `${conRuta} de ${piezas.length} piezas con ruta`}
      </div>
    </div>
  )
}

function Ficha({ n, p, equipo, proveedor, activa, onClick }) {
  const faltaQuien = !p.externo && !p.cargo_id && !p.cargo_nombre
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={activa}
      className={`text-left rounded-lg border px-2.5 py-1.5 min-w-[150px] max-w-[220px] bg-white hover:border-feisen-azul ${activa ? 'border-feisen-azul ring-2 ring-feisen-azul/20' : 'border-feisen-borde'}`}
    >
      <div className="text-[13px] font-semibold text-feisen-texto truncate">
        {n} · {p.nombre}
      </div>
      <div className="text-xs text-feisen-texto-2 truncate">{p.externo ? proveedor || 'Proveedor sin escoger' : equipo || 'Sin máquina'}</div>
      <div className={`text-xs truncate ${faltaQuien ? 'text-amber-700' : 'text-feisen-texto-2'}`}>{p.externo ? 'Tercero' : faltaQuien ? 'Falta quién lo hace' : tipoTitulo(p.cargo_nombre)}</div>
      <span className={`mt-1 inline-block rounded px-1.5 text-[11px] font-medium ${p.externo ? 'bg-amber-50 text-amber-800' : 'bg-feisen-gris text-feisen-texto-2'}`}>{p.externo ? 'Externo' : 'Interno'}</span>
    </button>
  )
}

function Caja({ titulo, onCerrar, children }) {
  return (
    <div className="mt-3 rounded-xl border border-feisen-borde bg-white p-3 sm:p-4 max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-feisen-texto">{titulo}</div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="w-9 h-9 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo">
          <X size={16} />
        </button>
      </div>
      {children}
    </div>
  )
}

function Biblioteca({ operaciones, ocupado, onEscoger, onOtra, onCerrar }) {
  const [otra, setOtra] = useState('')
  return (
    <Caja titulo="Toca una operación para agregarla al final de la ruta" onCerrar={onCerrar}>
      <div className="flex flex-wrap gap-1.5">
        {operaciones.map((o) => (
          <button key={o.id} type="button" disabled={ocupado} onClick={() => onEscoger(o)} className="h-9 rounded-lg border border-feisen-borde bg-feisen-fondo px-3 text-sm text-feisen-texto hover:border-feisen-azul hover:text-feisen-azul disabled:opacity-60" title={o.externo ? 'Externa' : o.cargo_nombre ? tipoTitulo(o.cargo_nombre) : ''}>
            {o.nombre}
            {o.externo && <span className="ml-1 text-[11px] text-amber-700">ext.</span>}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (otra.trim()) onOtra(otra).then(() => setOtra(''))
        }}
      >
        <label className="sr-only" htmlFor="otra-op">Otra operación</label>
        <input id="otra-op" value={otra} onChange={(e) => setOtra(e.target.value)} placeholder="Otra operación (ej. Embutido)" className="h-10 flex-1 min-w-0 rounded-lg border border-feisen-borde px-3 text-sm" />
        <button type="submit" disabled={ocupado || !otra.trim()} className={`${BTN} h-10 border border-feisen-borde text-feisen-azul hover:bg-feisen-azul-suave disabled:opacity-50`}>
          Agregar
        </button>
      </form>
    </Caja>
  )
}

function CopiarRuta({ origenes, procesosDe, ocupado, onCopiar, onCerrar }) {
  const [origen, setOrigen] = useState(origenes[0]?.fichaId || '')
  const vista = procesosDe(origen).map((p) => p.nombre).join(' → ')
  return (
    <Caja titulo="Copiar la ruta de otra pieza (se agrega al final)" onCerrar={onCerrar}>
      <label className="block text-xs text-feisen-texto-2 mb-1" htmlFor="copiar-de">Copiar de</label>
      <select id="copiar-de" value={origen} onChange={(e) => setOrigen(e.target.value)} className={CAMPO}>
        {origenes.map((o) => (
          <option key={o.key} value={o.fichaId}>{o.esConjunto && !o.raiz ? `Ensamble · ${o.nombre}` : o.nombre}</option>
        ))}
      </select>
      {vista && <p className="text-xs text-feisen-texto-2 mt-2">{vista}</p>}
      <button type="button" disabled={ocupado || !origen} onClick={() => onCopiar(origen)} className={`${BTN} h-10 mt-3 bg-feisen-azul text-white font-medium disabled:opacity-60`}>
        Copiar ruta
      </button>
    </Caja>
  )
}

function Editor({ p, claveEquipo, cat, ocupado, primero, ultimo, onGuardar, onMover, onQuitar, onCrearEquipo, onCerrar }) {
  const [v, setV] = useState({ nombre: p.nombre, equipo: claveEquipo, externo: !!p.externo, cargo_id: p.cargo_id || '', cargo_nombre: p.cargo_nombre || '', proveedor_id: p.proveedor_id || '' })
  const [nuevaMaq, setNuevaMaq] = useState(null) // null | texto
  const [buscarProv, setBuscarProv] = useState('')
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }))

  const areas = useMemo(() => {
    const m = new Map()
    for (const c of cat.cargos) {
      const a = c.subarea ? `${c.area} › ${c.subarea}` : c.area || 'Sin área'
      if (!m.has(a)) m.set(a, [])
      m.get(a).push(c)
    }
    return [...m]
  }, [cat.cargos])

  const provs = useMemo(() => {
    const q = normalizar(buscarProv)
    const lista = cat.proveedores.filter((x) => !q || normalizar(x.nombre).includes(q)).slice(0, 60)
    const actual = cat.proveedores.find((x) => x.id === v.proveedor_id)
    return actual && !lista.includes(actual) ? [actual, ...lista] : lista
  }, [cat.proveedores, buscarProv, v.proveedor_id])

  async function escogerEquipo(e) {
    if (e.target.value === '__nueva') return setNuevaMaq('')
    setV((x) => ({ ...x, equipo: e.target.value }))
  }
  async function guardarMaquina() {
    if (!nuevaMaq?.trim()) return
    const clave = await onCrearEquipo(nuevaMaq)
    if (clave) {
      setV((x) => ({ ...x, equipo: clave }))
      setNuevaMaq(null)
    }
  }

  return (
    <Caja titulo={`Editar operación`} onCerrar={onCerrar}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (v.nombre.trim()) onGuardar(v)
        }}
      >
        <label className="block sm:col-span-2">
          <span className="block text-xs text-feisen-texto-2 mb-1">Operación</span>
          <input value={v.nombre} onChange={set('nombre')} list="ops-biblioteca" required className={CAMPO} />
          <datalist id="ops-biblioteca">
            {cat.operaciones.map((o) => (
              <option key={o.id} value={o.nombre} />
            ))}
          </datalist>
        </label>

        <fieldset className="sm:col-span-2">
          <legend className="block text-xs text-feisen-texto-2 mb-1">¿Dónde se hace?</legend>
          <div className="inline-flex rounded-lg border border-feisen-borde p-0.5 bg-feisen-fondo">
            {[
              [false, 'Interno (en planta)'],
              [true, 'Externo (un tercero)'],
            ].map(([val, txt]) => (
              <button key={txt} type="button" aria-pressed={v.externo === val} onClick={() => setV((x) => ({ ...x, externo: val }))} className={`h-9 rounded-md px-3 text-sm ${v.externo === val ? 'bg-white shadow-sm font-medium text-feisen-texto' : 'text-feisen-texto-2'}`}>
                {txt}
              </button>
            ))}
          </div>
        </fieldset>

        {!v.externo ? (
          <>
            <label className="block">
              <span className="block text-xs text-feisen-texto-2 mb-1">Máquina (de Mantenimiento)</span>
              {nuevaMaq === null ? (
                <select value={v.equipo} onChange={escogerEquipo} className={CAMPO}>
                  <option value="">Sin máquina (manual)</option>
                  {cat.maquinas.map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                  <option value="__nueva">+ Nueva máquina…</option>
                </select>
              ) : (
                <span className="flex gap-2">
                  <input autoFocus value={nuevaMaq} onChange={(e) => setNuevaMaq(e.target.value)} placeholder="Ej. Roladora" className={CAMPO} />
                  <button type="button" onClick={guardarMaquina} disabled={!nuevaMaq.trim()} className={`${BTN} h-10 border border-feisen-borde text-feisen-azul disabled:opacity-50`}>Crear</button>
                  <button type="button" onClick={() => setNuevaMaq(null)} aria-label="Cancelar" className="w-10 h-10 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo"><X size={16} /></button>
                </span>
              )}
            </label>
            <label className="block">
              <span className="block text-xs text-feisen-texto-2 mb-1">Quién lo hace (cargo)</span>
              <select
                value={v.cargo_id}
                onChange={(e) => {
                  const c = cat.cargos.find((x) => x.id === e.target.value)
                  setV((x) => ({ ...x, cargo_id: e.target.value, cargo_nombre: c?.nombre || '' }))
                }}
                className={CAMPO}
              >
                <option value="">{v.cargo_nombre && !v.cargo_id ? tipoTitulo(v.cargo_nombre) : 'Escoge el cargo'}</option>
                {areas.map(([a, lista]) => (
                  <optgroup key={a} label={a}>
                    {lista.map((c) => (
                      <option key={c.id} value={c.id}>{tipoTitulo(c.nombre)}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </>
        ) : (
          <div className="sm:col-span-2">
            <label className="block text-xs text-feisen-texto-2 mb-1" htmlFor="buscar-prov">Proveedor</label>
            <input id="buscar-prov" value={buscarProv} onChange={(e) => setBuscarProv(e.target.value)} placeholder="Buscar proveedor" className={`${CAMPO} mb-2`} />
            <select value={v.proveedor_id} onChange={set('proveedor_id')} className={CAMPO} aria-label="Proveedor">
              <option value="">Sin escoger todavía</option>
              {provs.map((x) => (
                <option key={x.id} value={x.id}>{x.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" disabled={ocupado} className={`${BTN} h-10 bg-feisen-azul text-white font-medium disabled:opacity-60`}>Guardar</button>
          <button type="button" disabled={ocupado || primero} onClick={() => onMover(-1)} className={`${BTN} h-10 text-feisen-texto-2 hover:bg-feisen-fondo disabled:opacity-40`}><ArrowLeft size={14} /> Antes</button>
          <button type="button" disabled={ocupado || ultimo} onClick={() => onMover(1)} className={`${BTN} h-10 text-feisen-texto-2 hover:bg-feisen-fondo disabled:opacity-40`}>Después <ArrowRight size={14} /></button>
          <span className="flex-1" />
          <button type="button" disabled={ocupado} onClick={onQuitar} className={`${BTN} h-10 text-feisen-rojo hover:bg-feisen-rojo-suave`}><Trash2 size={14} /> Quitar</button>
        </div>
      </form>
    </Caja>
  )
}
