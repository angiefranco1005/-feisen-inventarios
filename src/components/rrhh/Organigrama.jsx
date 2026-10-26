import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Plus, Network, ListTree, AlertTriangle, ChevronRight } from 'lucide-react'
import * as E from './estilos'
import { AREAS, nombreCompleto, iniciales, urlsFirmadas, hijosPorPadre } from './catalogosRRHH'

const FORM_VACIO = { nombre: '', area: '', cargo_padre_id: '', plazas: '1' }

// Organigrama por cargos (puestos de trabajo): cada tarjeta es un cargo con
// las personas que lo ocupan y sus vacantes; clic abre la ficha del cargo.
export default function Organigrama() {
  const navigate = useNavigate()
  const [cargos,    setCargos]    = useState([])
  const [personas,  setPersonas]  = useState([])
  const [fotos,     setFotos]     = useState({})
  const [cargando,  setCargando]  = useState(true)
  const [vista,     setVista]     = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'lista' : 'arbol'))
  const [modal,     setModal]     = useState(false)
  const [form,      setForm]      = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [msg,       setMsg]       = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: cs, error }, { data: ps }] = await Promise.all([
      supabase.from('cargos').select('id, nombre, area, cargo_padre_id, plazas, orden').order('nombre'),
      supabase.from('empleados').select('id, nombres, apellidos, cargo_id, foto_path, estado').neq('estado', 'retirado').order('nombres'),
    ])
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setCargos(cs || [])
    setPersonas(ps || [])
    setFotos(await urlsFirmadas((ps || []).map(p => p.foto_path)))
    setCargando(false)
  }

  const hijos = useMemo(() => hijosPorPadre(cargos), [cargos])
  const porCargo = useMemo(() => {
    const m = new Map()
    for (const p of personas) if (p.cargo_id) { if (!m.has(p.cargo_id)) m.set(p.cargo_id, []); m.get(p.cargo_id).push(p) }
    return m
  }, [personas])
  const sinCargo = personas.filter(p => !p.cargo_id || !cargos.some(c => c.id === p.cargo_id))
  const vacantes = cargos.reduce((t, c) => t + Math.max(0, (c.plazas || 0) - (porCargo.get(c.id)?.length || 0)), 0)

  function abrirNuevo(padreId = '') {
    const padre = cargos.find(c => c.id === padreId)
    setForm({ ...FORM_VACIO, cargo_padre_id: padreId, area: padre?.area || '' })
    setMsg(null); setModal(true)
  }

  async function crear(e) {
    e.preventDefault(); setMsg(null); setGuardando(true)
    const { data, error } = await supabase.from('cargos').insert({
      nombre: form.nombre.trim(),
      area: form.area || null,
      cargo_padre_id: form.cargo_padre_id || null,
      plazas: Number(form.plazas || 0),
    }).select('id').single()
    setGuardando(false)
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    setModal(false)
    navigate(`/rrhh/organigrama/${data.id}`)
  }

  const set = (k) => (ev) => setForm(f => {
    const nf = { ...f, [k]: ev.target.value }
    if (k === 'cargo_padre_id' && !f.area) nf.area = cargos.find(c => c.id === nf.cargo_padre_id)?.area || ''
    return nf
  })

  const Avatar = ({ p, tam = 'w-6 h-6 text-[10px]' }) => fotos[p.foto_path]
    ? <img src={fotos[p.foto_path]} alt="" title={nombreCompleto(p)} className={`${tam} rounded-full object-cover ring-2 ring-white`} />
    : <span title={nombreCompleto(p)} className={`${tam} rounded-full bg-feisen-fondo border border-feisen-borde-suave ring-2 ring-white flex items-center justify-center font-semibold text-feisen-texto-2`}>{iniciales(p)}</span>

  // Tarjeta de un cargo dentro del árbol
  function Tarjeta({ c }) {
    const ocupantes = porCargo.get(c.id) || []
    const libres = Math.max(0, (c.plazas || 0) - ocupantes.length)
    return (
      <div className="group relative">
        <button onClick={() => navigate(`/rrhh/organigrama/${c.id}`)}
          className={`${E.tarjeta} w-52 px-3.5 py-3 text-left hover:border-feisen-azul/40 hover:shadow-sm transition`}>
          <p className="text-sm font-medium text-feisen-texto leading-snug">{c.nombre}</p>
          {c.area && <p className="text-xs text-feisen-gris-medio mt-0.5">{c.area}</p>}
          <div className="flex items-center justify-between gap-2 mt-2.5">
            <div className="flex -space-x-1.5">
              {ocupantes.slice(0, 4).map(p => <Avatar key={p.id} p={p} />)}
              {ocupantes.length > 4 && <span className="w-6 h-6 rounded-full bg-feisen-fondo ring-2 ring-white text-[10px] text-feisen-texto-2 flex items-center justify-center">+{ocupantes.length - 4}</span>}
              {ocupantes.length === 0 && <span className="text-xs text-feisen-gris-medio">Sin asignar</span>}
            </div>
            {libres > 0
              ? <span className="text-[11px] text-amber-600 whitespace-nowrap">{libres} vacante{libres > 1 ? 's' : ''}</span>
              : <span className="text-[11px] text-feisen-gris-medio whitespace-nowrap">{ocupantes.length}/{c.plazas}</span>}
          </div>
          {ocupantes.length === 1 && <p className="text-xs text-feisen-texto-2 truncate mt-1.5">{nombreCompleto(ocupantes[0])}</p>}
        </button>
        <button onClick={() => abrirNuevo(c.id)} title="Agregar cargo que le reporta"
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border border-feisen-borde text-feisen-texto-2 hover:text-feisen-azul hover:border-feisen-azul flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10">
          <Plus size={13} strokeWidth={2} />
        </button>
      </div>
    )
  }

  function Rama({ c }) {
    const subs = hijos.get(c.id) || []
    return (
      <li>
        <Tarjeta c={c} />
        {subs.length > 0 && <ul>{subs.map(h => <Rama key={h.id} c={h} />)}</ul>}
      </li>
    )
  }

  // Vista de lista: mismo árbol con sangría (cómoda en celular)
  function FilaLista({ c, nivel }) {
    const ocupantes = porCargo.get(c.id) || []
    const libres = Math.max(0, (c.plazas || 0) - ocupantes.length)
    return (
      <>
        <button onClick={() => navigate(`/rrhh/organigrama/${c.id}`)}
          className="w-full flex items-center gap-3 py-2.5 pr-4 hover:bg-feisen-fondo text-left"
          style={{ paddingLeft: 16 + nivel * 22 }}>
          {nivel > 0 && <span className="w-2.5 h-px bg-feisen-borde flex-shrink-0 -ml-1" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-feisen-texto truncate">{c.nombre}</p>
            <p className="text-xs text-feisen-texto-2 truncate">
              {ocupantes.length ? ocupantes.map(nombreCompleto).join(', ') : 'Sin asignar'}
              {c.area && <span className="text-feisen-gris-medio"> · {c.area}</span>}
            </p>
          </div>
          {libres > 0 && <span className="text-[11px] text-amber-600 whitespace-nowrap">{libres} vacante{libres > 1 ? 's' : ''}</span>}
          <ChevronRight size={16} strokeWidth={1.8} className="text-feisen-gris-medio flex-shrink-0" />
        </button>
        {(hijos.get(c.id) || []).map(h => <FilaLista key={h.id} c={h} nivel={nivel + 1} />)}
      </>
    )
  }

  const raices = hijos.get(null) || []

  return (
    <div className="space-y-5">
      <div className="max-w-6xl mx-auto flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>Organigrama</h1>
          <p className={E.subtituloPagina}>
            {cargos.length} cargos · {personas.length - sinCargo.length} personas asignadas
            {vacantes > 0 && <span className="text-amber-600"> · {vacantes} vacante{vacantes > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-feisen-borde rounded-lg p-0.5 bg-white">
            {[{ id: 'arbol', icon: Network, label: 'Árbol' }, { id: 'lista', icon: ListTree, label: 'Lista' }].map(v => (
              <button key={v.id} onClick={() => setVista(v.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors
                  ${vista === v.id ? 'bg-feisen-azul-suave text-feisen-azul font-medium' : 'text-feisen-texto-2 hover:text-feisen-texto'}`}>
                <v.icon size={15} strokeWidth={1.8} /> {v.label}
              </button>
            ))}
          </div>
          <button onClick={() => abrirNuevo('')} className={E.btnPrimario}>
            <Plus {...E.ICONO} /> Nuevo cargo
          </button>
        </div>
      </div>

      {!modal && msg && <div className="max-w-6xl mx-auto"><Alerta tipo={msg.tipo} mensaje={msg.texto} /></div>}

      {!cargando && sinCargo.length > 0 && (
        <div className={`${E.tarjeta} max-w-6xl mx-auto`}>
          <div className={E.cabTarjeta}>
            <h2 className={E.tituloTarj}><AlertTriangle {...E.ICONO} className="text-amber-500" /> Colaboradores sin cargo asignado</h2>
            <span className={E.etiqueta}>{sinCargo.length}</span>
          </div>
          <div className="px-5 py-3 flex flex-wrap gap-2">
            {sinCargo.map(p => (
              <button key={p.id} onClick={() => navigate(`/rrhh/empleados/${p.id}`)}
                className="inline-flex items-center gap-2 border border-feisen-borde rounded-full pl-1 pr-3 py-1 text-sm text-feisen-texto hover:bg-feisen-fondo">
                <Avatar p={p} /> {nombreCompleto(p)}
              </button>
            ))}
          </div>
        </div>
      )}

      {cargando ? <Spinner /> : cargos.length === 0 ? (
        <div className={`${E.tarjeta} max-w-6xl mx-auto py-14 text-center`}>
          <Network size={28} strokeWidth={1.5} className="mx-auto text-feisen-gris-medio mb-2" />
          <p className="text-sm text-feisen-texto-2">Aún no hay cargos. Empieza por el cargo de más arriba (por ejemplo, Gerente General).</p>
          <button onClick={() => abrirNuevo('')} className="mt-3 text-sm font-medium text-feisen-azul hover:underline">Crear el primer cargo</button>
        </div>
      ) : vista === 'arbol' ? (
        <div className={`${E.tarjeta} overflow-auto`}>
          <div className="organigrama min-w-max p-8 mx-auto">
            <ul>{raices.map(c => <Rama key={c.id} c={c} />)}</ul>
          </div>
        </div>
      ) : (
        <div className={`${E.tarjeta} max-w-6xl mx-auto divide-y divide-feisen-borde-suave overflow-hidden`}>
          {raices.map(c => <FilaLista key={c.id} c={c} nivel={0} />)}
        </div>
      )}

      {modal && (
        <Modal titulo="Nuevo cargo" onCerrar={() => setModal(false)}>
          <form onSubmit={crear} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <div>
              <label className={E.labelForm}>Nombre del cargo *</label>
              <input required autoFocus value={form.nombre} onChange={set('nombre')} placeholder="Ej: Moldeador" className={E.input} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={E.labelForm}>Área</label>
                <select value={form.area} onChange={set('area')} className={E.input}>
                  <option value="">—</option>
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className={E.labelForm}>Plazas</label>
                <input type="number" min="0" step="1" value={form.plazas} onChange={set('plazas')} className={E.input} />
              </div>
            </div>
            <div>
              <label className={E.labelForm}>Reporta a</label>
              <select value={form.cargo_padre_id} onChange={set('cargo_padre_id')} className={E.input}>
                <option value="">— Ninguno (cargo de más arriba) —</option>
                {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.area ? ` · ${c.area}` : ''}</option>)}
              </select>
            </div>
            <p className="text-xs text-feisen-gris-medio">Después de crearlo completas el perfil, salario, funciones, evaluación, EPP, capacitación y herramientas.</p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setModal(false)} className={`${E.btnSecundario} flex-1`}>Cancelar</button>
              <button type="submit" disabled={guardando} className={`${E.btnPrimario} flex-1`}>{guardando ? 'Creando...' : 'Crear cargo'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
