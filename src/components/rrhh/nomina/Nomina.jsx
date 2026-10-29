import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchAllPages } from '../../../utils/fetchAllPages'
import Spinner from '../../shared/Spinner'
import Modal from '../../shared/Modal'
import Alerta from '../../shared/Alerta'
import { Plus, ChevronRight, Wallet, Tags, Lock, CheckCircle2 } from '../../shared/iconos'
import * as E from '../estilos'
import { formatoPesos } from '../catalogosRRHH'
import { nombreQuincena, rangoQuincena, crearQuincena } from './nominaQuincena'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Quincena siguiente a la última creada (o la actual si no hay ninguna)
function siguienteQuincena(periodos) {
  if (!periodos.length) {
    const h = new Date()
    return { anio: h.getFullYear(), mes: h.getMonth() + 1, quincena: h.getDate() <= 15 ? 1 : 2 }
  }
  const u = periodos[0]
  if (u.quincena === 1) return { anio: u.anio, mes: u.mes, quincena: 2 }
  return u.mes === 12 ? { anio: u.anio + 1, mes: 1, quincena: 1 } : { anio: u.anio, mes: u.mes + 1, quincena: 1 }
}

// Nómina: lista de quincenas y creación de una nueva
export default function Nomina() {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const [periodos,  setPeriodos]  = useState([])
  const [totales,   setTotales]   = useState({})   // periodo_id → { personas, neto }
  const [cargando,  setCargando]  = useState(true)
  const [modal,     setModal]     = useState(false)
  const [form,      setForm]      = useState(null)
  const [creando,   setCreando]   = useState(false)
  const [msg,       setMsg]       = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: ps, error }, { data: liqs }] = await Promise.all([
      supabase.from('nomina_periodos').select('*').order('anio', { ascending: false }).order('mes', { ascending: false }).order('quincena', { ascending: false }),
      fetchAllPages((d, h) => supabase.from('nomina_liquidaciones').select('periodo_id, neto').range(d, h)),
    ])
    if (error) setMsg({ tipo: 'error', texto: error.message })
    const t = {}
    for (const l of liqs || []) {
      if (!t[l.periodo_id]) t[l.periodo_id] = { personas: 0, neto: 0 }
      t[l.periodo_id].personas++
      t[l.periodo_id].neto += Number(l.neto) || 0
    }
    setPeriodos(ps || [])
    setTotales(t)
    setCargando(false)
  }

  function abrir() {
    setForm(siguienteQuincena(periodos)); setMsg(null); setModal(true)
  }

  async function crear(e) {
    e.preventDefault(); setMsg(null)
    if (periodos.some(p => p.anio === form.anio && p.mes === form.mes && p.quincena === form.quincena)) {
      setMsg({ tipo: 'error', texto: 'Esa quincena ya existe.' }); return
    }
    setCreando(true)
    try {
      const id = await crearQuincena(form, perfil?.id)
      navigate(`/rrhh/nomina/${id}`)
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
      setCreando(false)
    }
  }

  const rango = form ? rangoQuincena(form.anio, form.mes, form.quincena) : null

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={E.tituloPagina}>Nómina</h1>
          <p className={E.subtituloPagina}>Liquidación quincenal por persona: destajo, al día y fijo</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/rrhh/nomina/tarifas')} className={E.btnSecundario}>
            <Tags {...E.ICONO} /> Tarifas de destajo
          </button>
          <button onClick={abrir} className={E.btnPrimario}>
            <Plus {...E.ICONO} /> Nueva quincena
          </button>
        </div>
      </div>

      {!modal && msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {cargando ? <Spinner /> : periodos.length === 0 ? (
        <div className={`${E.tarjeta} py-14 text-center`}>
          <Wallet size={28} strokeWidth={1.5} className="mx-auto text-feisen-gris-medio mb-2" />
          <p className="text-sm text-feisen-texto-2">Aún no hay quincenas. Crea la primera: la app carga a cada colaborador activo con su forma de pago.</p>
          <button onClick={abrir} className="mt-3 text-sm font-medium text-feisen-azul hover:underline">Crear la primera quincena</button>
        </div>
      ) : (
        <div className={`${E.tarjeta} divide-y divide-feisen-borde-suave overflow-hidden`}>
          {periodos.map(p => {
            const t = totales[p.id] || { personas: 0, neto: 0 }
            return (
              <button key={p.id} onClick={() => navigate(`/rrhh/nomina/${p.id}`)}
                className="w-full flex items-center gap-4 px-5 py-3 hover:bg-feisen-fondo text-left">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-feisen-texto">{nombreQuincena(p)}</p>
                  <p className="text-xs text-feisen-gris-medio">{t.personas} persona{t.personas === 1 ? '' : 's'}</p>
                </div>
                <span className="text-sm text-feisen-texto">{formatoPesos(t.neto)}</span>
                <span className={`inline-flex items-center gap-1.5 text-xs ${p.estado === 'aprobada' ? 'text-green-700' : p.estado === 'cerrada' ? 'text-feisen-texto-2' : 'text-amber-600'}`}>
                  {p.estado === 'aprobada' ? <><CheckCircle2 size={12} strokeWidth={1.8} /> Aprobada</>
                    : p.estado === 'cerrada' ? <><Lock size={12} strokeWidth={1.8} /> Por aprobar</> : 'En borrador'}
                </span>
                <ChevronRight size={16} strokeWidth={1.8} className="text-feisen-gris-medio" />
              </button>
            )
          })}
        </div>
      )}

      {modal && form && (
        <Modal titulo="Nueva quincena" onCerrar={() => !creando && setModal(false)}>
          <form onSubmit={crear} className="space-y-4">
            {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={E.labelForm}>Año</label>
                <input type="number" value={form.anio} onChange={e => setForm(f => ({ ...f, anio: Number(e.target.value) }))} className={E.input} />
              </div>
              <div>
                <label className={E.labelForm}>Mes</label>
                <select value={form.mes} onChange={e => setForm(f => ({ ...f, mes: Number(e.target.value) }))} className={E.input}>
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={E.labelForm}>Quincena</label>
                <select value={form.quincena} onChange={e => setForm(f => ({ ...f, quincena: Number(e.target.value) }))} className={E.input}>
                  <option value={1}>1 al 15</option>
                  <option value={2}>16 al fin de mes</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-feisen-texto-2">
              Periodo: {rango.inicio.split('-').reverse().join('/')} al {rango.fin.split('-').reverse().join('/')}.
              Se cargan los colaboradores activos con su forma de pago y los valores de su ficha; las piezas de los de
              destajo se proponen desde la producción registrada, y los días de los de "al día" se calculan de lunes a
              viernes sin festivos, descontando sus ausencias. Todo se puede ajustar después.
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={creando} onClick={() => setModal(false)} className={`${E.btnSecundario} flex-1`}>Cancelar</button>
              <button type="submit" disabled={creando} className={`${E.btnPrimario} flex-1`}>{creando ? 'Preparando la quincena…' : 'Crear quincena'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
