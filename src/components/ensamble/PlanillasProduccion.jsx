import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Trash2, Search, ClipboardList, Lock, X } from '../shared/iconos'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import { EncabezadoPagina, PanelLateral, useAviso, useAtajoBuscar } from '../shared/ui'
import { coincideBusqueda, sinTildes } from '../../utils/busqueda'
import {
  HOY_COL, fechaCorta, num, claveSerial, cargarCatalogos, cargarPlanillas, siguienteSerial,
  problemaPlanilla, guardarPlanilla, borrarPlanilla,
} from './planillasDatos'

const input = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul disabled:bg-feisen-fondo'
const etiqueta = 'block text-xs font-medium uppercase tracking-wide text-feisen-texto-2 mb-1'
const LINEA0 = { tarea_id: '', tarea_texto: '', cantidad: '', completa: false, modelo: '', seriales: [] }

// Busca en una lista por texto exacto (sin tildes ni mayúsculas): para los campos con datalist
const porTexto = (lista, campo, texto) => lista.find(x => sinTildes(x[campo]).trim() === sinTildes(texto).trim())

// Números de máquina propuestos: el siguiente consecutivo, sin chocar con los del formulario
function proponerSeriales(lineas, idx, n, base) {
  const usados = new Set(lineas.flatMap((l, j) => (j !== idx && l.completa ? l.seriales.map(claveSerial) : [])))
  const actuales = lineas[idx].seriales
  let siguiente = base
  const res = []
  for (let i = 0; i < n; i++) {
    if (actuales[i]?.trim()) { res.push(actuales[i]); continue }
    if (siguiente === null) { res.push(''); continue }
    while (usados.has(String(siguiente))) siguiente++
    res.push(String(siguiente)); usados.add(String(siguiente)); siguiente++
  }
  return res
}

function formDesde(p, personas) {
  if (!p) return { empleado_id: '', persona_texto: '', fecha: HOY_COL(), notas: '', lineas: [{ ...LINEA0 }] }
  return {
    empleado_id: p.empleado_id,
    persona_texto: personas.find(x => x.id === p.empleado_id)?.nombre || '',
    fecha: p.fecha, notas: p.notas || '',
    lineas: p.lineas.map(l => ({
      tarea_id: l.tarifa_id || '', tarea_texto: l.descripcion, descripcion: l.descripcion, cantidad: String(l.cantidad),
      completa: !!l.modelo, modelo: l.modelo || '', seriales: l.seriales.map(s => s.serial),
    })),
  }
}

// ── Formulario / detalle de una planilla ─────────────────────────────────────
function PanelPlanilla({ planilla, catalogos, perfil, onCerrar, onGuardada }) {
  const { personas, tareas, modelos } = catalogos
  const bloqueada = !!planilla && (planilla.enNomina > 0 || planilla.despachadas > 0)
  const [form, setForm] = useState(() => formDesde(planilla, personas))
  const [baseSerial, setBaseSerial] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { siguienteSerial().then(setBaseSerial).catch(() => setBaseSerial(null)) }, [])

  const setLinea = (i, cambios) => setForm(f => {
    const lineas = f.lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l))
    const l = lineas[i]
    const n = Math.min(100, Math.floor(Number(l.cantidad)) || 0)
    if (l.completa && l.seriales.length !== n) {
      lineas[i] = { ...l, seriales: proponerSeriales(lineas, i, n, baseSerial) }
    }
    return { ...f, lineas }
  })

  function elegirPersona(texto) {
    const p = porTexto(personas, 'nombre', texto)
    setForm(f => ({ ...f, persona_texto: texto, empleado_id: p?.id || '' }))
  }
  function elegirTarea(i, texto) {
    const t = porTexto(tareas, 'descripcion', texto)
    setLinea(i, { tarea_texto: texto, tarea_id: t?.id || '' })
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    const problema = problemaPlanilla(form)
    if (problema) { setError(problema); return }
    setGuardando(true)
    try {
      const persona = personas.find(p => p.id === form.empleado_id)
      const numero = await guardarPlanilla(form, { perfil, persona, tareas, existente: planilla })
      onGuardada(numero, !!planilla)
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar la planilla ${planilla.numero}? También se borran sus números de máquina.`)) return
    try { await borrarPlanilla(planilla); onGuardada(planilla.numero, true, true) } catch (err) { setError(err.message) }
  }

  const maquinas = form.lineas.filter(l => l.completa).reduce((s, l) => s + (Number(l.cantidad) || 0), 0)

  return (
    <PanelLateral etiqueta="Planilla de producción" onCerrar={onCerrar} encabezado={
      <div>
        <p className="text-xs text-feisen-texto-2">{planilla ? planilla.numero : 'Nueva planilla'}</p>
        <p className="font-semibold text-feisen-texto">{planilla ? form.persona_texto : 'Pasar planilla de papel'}</p>
      </div>
    }>
      {bloqueada && (
        <Alerta tipo="info" mensaje={`No se puede editar: ${[
          planilla.enNomina > 0 && 'RRHH ya la cargó a la nómina',
          planilla.despachadas > 0 && `${planilla.despachadas} máquina${planilla.despachadas > 1 ? 's ya se despacharon' : ' ya se despachó'}`,
        ].filter(Boolean).join(' y ')}.`} />
      )}
      <form id="form-planilla" onSubmit={guardar} className="space-y-5">
        <datalist id="pp-personas">{personas.map(p => <option key={p.id} value={p.nombre}>{p.area || ''}</option>)}</datalist>
        <datalist id="pp-tareas">{tareas.map(t => <option key={t.id} value={t.descripcion} />)}</datalist>
        <datalist id="pp-modelos">{modelos.map(m => <option key={m} value={m} />)}</datalist>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_9.5rem] gap-3">
          <div>
            <label className={etiqueta}>Contratista</label>
            <input list="pp-personas" value={form.persona_texto} disabled={bloqueada} autoComplete="off"
              onChange={e => elegirPersona(e.target.value)} placeholder="Escribe el nombre" className={input} />
            {form.persona_texto && !form.empleado_id && <p className="text-xs text-feisen-rojo mt-1">Escoge un nombre de la lista.</p>}
          </div>
          <div>
            <label className={etiqueta}>Fecha</label>
            <input type="date" value={form.fecha} max={HOY_COL()} disabled={bloqueada}
              onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={input} />
          </div>
        </div>

        <div className="space-y-3">
          <p className={etiqueta}>Lo que entregó</p>
          {form.lineas.map((l, i) => (
            <div key={i} className="border border-feisen-borde rounded-xl p-3 space-y-3">
              <div className="grid grid-cols-[1fr_5.5rem_2rem] gap-2 items-start">
                <div>
                  <input list="pp-tareas" value={l.tarea_texto} disabled={bloqueada} autoComplete="off" aria-label={`Tarea ${i + 1}`}
                    onChange={e => elegirTarea(i, e.target.value)} placeholder="Tarea (cabina, chasis…)" className={input} />
                  {l.tarea_texto && !l.tarea_id && <p className="text-xs text-feisen-rojo mt-1">Escoge una tarea de la lista.</p>}
                </div>
                <input type="number" inputMode="decimal" min="0" step="any" value={l.cantidad} disabled={bloqueada} aria-label={`Cantidad ${i + 1}`}
                  onChange={e => setLinea(i, { cantidad: e.target.value })} placeholder="Cant." className={`${input} text-right tabular-nums`} />
                {!bloqueada && form.lineas.length > 1 ? (
                  <button type="button" aria-label="Quitar renglón" onClick={() => setForm(f => ({ ...f, lineas: f.lineas.filter((_, j) => j !== i) }))}
                    className="p-2 text-feisen-gris-medio hover:text-feisen-rojo"><X size={16} /></button>
                ) : <span />}
              </div>

              <label className="flex items-center gap-2 text-sm text-feisen-texto min-h-[32px]">
                <input type="checkbox" checked={l.completa} disabled={bloqueada}
                  onChange={e => setLinea(i, { completa: e.target.checked, seriales: e.target.checked ? l.seriales : [] })}
                  className="w-4 h-4 accent-feisen-azul" />
                Máquina completa (lleva número)
              </label>

              {l.completa && (
                <div className="space-y-2 bg-feisen-fondo rounded-lg p-3">
                  <div>
                    <label className={etiqueta}>Modelo</label>
                    <input list="pp-modelos" value={l.modelo} disabled={bloqueada} autoComplete="off"
                      onChange={e => setLinea(i, { modelo: e.target.value })} placeholder="Ej: MEZCLADORA - 1 B" className={input} />
                  </div>
                  {l.seriales.length === 0 ? (
                    <p className="text-xs text-feisen-texto-2">Escribe la cantidad para poner el número de cada máquina.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {l.seriales.map((s, k) => (
                        <input key={k} value={s} disabled={bloqueada} aria-label={`Número de máquina ${k + 1}`} autoComplete="off"
                          onChange={e => setLinea(i, { seriales: l.seriales.map((x, j) => (j === k ? e.target.value : x)) })}
                          placeholder={`N.º ${k + 1}`} className={`${input} font-mono`} />
                      ))}
                    </div>
                  )}
                  {baseSerial === null && l.seriales.length > 0 && (
                    <p className="text-xs text-feisen-texto-2">Es la primera máquina en la app: escribe el número que tiene marcado y desde ahí la app propone los siguientes.</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {!bloqueada && (
            <button type="button" onClick={() => setForm(f => ({ ...f, lineas: [...f.lineas, { ...LINEA0 }] }))}
              className="flex items-center gap-1.5 text-sm font-semibold text-feisen-azul px-1 py-2">
              <Plus size={16} /> Agregar tarea
            </button>
          )}
        </div>

        <div>
          <label className={etiqueta}>Notas (opcional)</label>
          <textarea value={form.notas} disabled={bloqueada} rows={2} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className={input} />
        </div>

        {error && <Alerta tipo="error" mensaje={error} />}

        {!bloqueada && (
          <div className="flex items-center gap-3">
            {planilla && (
              <button type="button" onClick={borrar} className="flex items-center gap-1.5 text-sm text-feisen-texto-2 hover:text-feisen-rojo px-1 py-2">
                <Trash2 size={16} /> Borrar
              </button>
            )}
            <button type="submit" disabled={guardando}
              className="ml-auto bg-feisen-azul text-white rounded-xl px-5 min-h-[44px] text-sm font-semibold disabled:opacity-50">
              {guardando ? 'Guardando…' : planilla ? 'Guardar cambios' : `Guardar planilla${maquinas ? ` · ${num(maquinas)} máq.` : ''}`}
            </button>
          </div>
        )}
      </form>
    </PanelLateral>
  )
}

// ── Lista ─────────────────────────────────────────────────────────────────────
export default function PlanillasProduccion() {
  const { perfil } = useAuth()
  const [catalogos, setCatalogos] = useState(null)
  const [planillas, setPlanillas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [abierta, setAbierta] = useState(null)   // null | 'nueva' | planilla
  const [aviso, avisar] = useAviso()
  const buscador = useRef(null)
  useAtajoBuscar(buscador)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    try {
      const [cat, pls] = await Promise.all([cargarCatalogos(), cargarPlanillas()])
      setCatalogos(cat)
      setPlanillas(pls)
      setError('')
    } catch (err) {
      setError('No se pudieron cargar las planillas: ' + err.message)
    }
    setCargando(false)
  }

  const nombreDe = useMemo(() => Object.fromEntries((catalogos?.personas || []).map(p => [p.id, p.nombre])), [catalogos])
  const pendientes = planillas.filter(p => p.lineas.length > 0 && p.enNomina < p.lineas.length).length

  const visibles = planillas.filter(p => {
    if (filtro === 'pendientes' && !(p.enNomina < p.lineas.length)) return false
    if (!busqueda.trim()) return true
    const texto = [p.numero, nombreDe[p.empleado_id], ...p.lineas.flatMap(l => [l.descripcion, l.modelo, ...l.seriales.map(s => s.serial)])].join(' ')
    return coincideBusqueda(texto, busqueda)
  })

  if (cargando) return <Spinner />

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-24">
      <EncabezadoPagina modulo="Ensamble" titulo="Planillas de producción"
        subtitulo="Lo que entrega cada contratista: va a la nómina de destajo y numera las máquinas">
        <button onClick={() => setAbierta('nueva')} disabled={!catalogos}
          className="flex items-center gap-2 bg-feisen-azul text-white rounded-xl px-4 min-h-[44px] text-sm font-semibold disabled:opacity-50">
          <Plus size={16} /> Nueva planilla
        </button>
      </EncabezadoPagina>

      {error && <Alerta tipo="error" mensaje={error} />}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-texto-2" />
          <input ref={buscador} value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar contratista, tarea o número de máquina" className={`${input} pl-9`} />
        </div>
        <div className="flex gap-2">
          {[['todas', 'Todas', planillas.length], ['pendientes', 'Sin cargar a nómina', pendientes]].map(([k, t, n]) => (
            <button key={k} onClick={() => setFiltro(k)}
              className={`px-3 min-h-[40px] rounded-lg text-sm font-medium whitespace-nowrap border ${filtro === k ? 'bg-feisen-azul-suave text-feisen-azul border-transparent' : 'bg-white border-feisen-borde text-feisen-texto-2'}`}>
              {t} · {n}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl p-8 text-center">
          <ClipboardList size={28} className="mx-auto text-feisen-texto-2" />
          <p className="font-semibold text-feisen-texto mt-2">
            {planillas.length === 0 ? 'Todavía no hay planillas' : 'Ninguna planilla coincide'}
          </p>
          <p className="text-sm text-feisen-texto-2 mt-1">
            {planillas.length === 0
              ? 'Cuando un contratista te entregue su planilla de papel, pásala aquí con “Nueva planilla”.'
              : 'Prueba con otra palabra o quita el filtro.'}
          </p>
        </div>
      ) : (
        <ul className="bg-white border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
          {visibles.map(p => {
            const maquinas = p.lineas.flatMap(l => l.seriales)
            const enNomina = p.lineas.length > 0 && p.enNomina === p.lineas.length
            return (
              <li key={p.id}>
                <button onClick={() => setAbierta(p)} className="w-full text-left px-4 py-3 hover:bg-feisen-fondo flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-feisen-texto truncate">{nombreDe[p.empleado_id] || 'Contratista'}</p>
                    <p className="text-sm text-feisen-texto-2">
                      {p.lineas.map(l => `${num(l.cantidad)} ${l.descripcion}`).join(' · ') || 'Sin tareas'}
                    </p>
                    {maquinas.length > 0 && (
                      <p className="text-xs text-feisen-texto-2 mt-0.5 font-mono break-words">N.º {maquinas.map(s => s.serial).join(', ')}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm text-feisen-texto tabular-nums">{fechaCorta(p.fecha)}</p>
                    <p className="text-xs text-feisen-texto-2">{p.numero}</p>
                    {enNomina
                      ? <span className="inline-flex items-center gap-1 text-xs font-medium bg-feisen-fondo text-feisen-texto-2 rounded-md px-2 py-0.5"><Lock size={11} /> En nómina</span>
                      : p.enNomina > 0 && <span className="text-xs font-medium bg-amber-50 text-amber-700 rounded-md px-2 py-0.5">Parcial en nómina</span>}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {abierta && catalogos && (
        <PanelPlanilla planilla={abierta === 'nueva' ? null : abierta} catalogos={catalogos} perfil={perfil}
          onCerrar={() => setAbierta(null)}
          onGuardada={(numero, edicion, borrada) => {
            setAbierta(null)
            avisar(borrada ? `Planilla ${numero} borrada` : edicion ? `Planilla ${numero} actualizada` : `Planilla ${numero} guardada`)
            cargar()
          }} />
      )}
      {aviso}
    </div>
  )
}
