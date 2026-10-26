import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import { Plus, CalendarClock, Paperclip, ChevronRight } from 'lucide-react'
import * as E from './estilos'
import ModalNovedad from './ModalNovedad'
import { TIPOS_NOVEDAD, formatoFecha, hoyISO } from './catalogosRRHH'

const fmtNum = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })

// Sección "Novedades" de la ficha del colaborador: su historial y resumen del año.
export default function NovedadesEmpleado({ empleado, perfilId }) {
  const [novedades, setNovedades] = useState([])
  const [nSoportes, setNSoportes] = useState({})
  const [cargando,  setCargando]  = useState(true)
  const [modal,     setModal]     = useState(null)
  const [msg,       setMsg]       = useState(null)
  const anio = new Date().getFullYear()
  const hoy = hoyISO()

  useEffect(() => { cargar() }, [empleado.id])

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase.from('novedades').select('*')
      .eq('empleado_id', empleado.id).order('fecha_inicio', { ascending: false })
    if (error) setMsg({ tipo: 'error', texto: error.message })
    const lista = data || []
    setNovedades(lista)
    if (lista.length) {
      const { data: sops } = await supabase.from('novedad_soportes').select('novedad_id').in('novedad_id', lista.map(n => n.id))
      const cuenta = {}
      for (const s of sops || []) cuenta[s.novedad_id] = (cuenta[s.novedad_id] || 0) + 1
      setNSoportes(cuenta)
    }
    setCargando(false)
  }

  // Resumen del año en curso por tipo
  const delAnio = novedades.filter(n => n.fecha_fin >= `${anio}-01-01` && n.fecha_inicio <= `${anio}-12-31`)
  const resumen = Object.fromEntries(Object.keys(TIPOS_NOVEDAD).map(k => {
    const ns = delAnio.filter(n => n.tipo === k)
    return [k, { n: ns.length, dias: ns.reduce((t, n) => t + (Number(n.dias) || 0), 0), horas: ns.reduce((t, n) => t + (Number(n.horas) || 0), 0) }]
  }))

  return (
    <div className="space-y-4">
      <div className={E.tarjeta}>
        <div className={E.cabTarjeta}>
          <h2 className={E.tituloTarj}><CalendarClock {...E.ICONO} className={E.iconoTitulo} /> Resumen {anio}</h2>
          <button onClick={() => setModal('nueva')} className={`${E.btnTextoAzul} -mr-2`}>
            <Plus size={14} strokeWidth={1.8} /> Registrar novedad
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-feisen-borde-suave">
          {Object.entries(TIPOS_NOVEDAD).map(([k, t]) => (
            <div key={k} className="px-5 py-3">
              <p className={`${E.etiqueta} flex items-center gap-1.5`}><span className={`w-1.5 h-1.5 rounded-full ${t.punto}`} /> {t.plural}</p>
              <p className="text-lg font-semibold text-feisen-texto">{fmtNum(resumen[k].dias)}<span className="text-xs font-normal text-feisen-gris-medio"> días</span></p>
              <p className="text-[11px] text-feisen-gris-medio">{resumen[k].n} registro{resumen[k].n === 1 ? '' : 's'}{resumen[k].horas > 0 && ` · ${fmtNum(resumen[k].horas)} h`}</p>
            </div>
          ))}
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      <div className={E.tarjeta}>
        <div className={E.cabTarjeta}>
          <h2 className={E.tituloTarj}>Historial</h2>
          <span className={E.etiqueta}>{novedades.length}</span>
        </div>
        {cargando ? <Spinner /> : novedades.length === 0
          ? <p className="px-5 py-4 text-sm text-feisen-gris-medio">Sin novedades registradas.</p>
          : <div className="divide-y divide-feisen-borde-suave">
              {novedades.map(n => {
                const t = TIPOS_NOVEDAD[n.tipo]
                const ns = nSoportes[n.id] || 0
                const enCurso = n.fecha_inicio <= hoy && n.fecha_fin >= hoy
                return (
                  <button key={n.id} onClick={() => setModal(n)}
                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-feisen-fondo text-left">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t?.punto}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-feisen-texto truncate">{t?.label}{n.subtipo && <span className="text-feisen-texto-2"> · {n.subtipo}</span>}</p>
                      <p className="text-xs text-feisen-gris-medio truncate">
                        {formatoFecha(n.fecha_inicio)}{!n.por_horas && n.fecha_fin !== n.fecha_inicio && ` – ${formatoFecha(n.fecha_fin)}`}
                        {' · '}{n.por_horas ? `${fmtNum(n.horas)} h` : `${fmtNum(n.dias)} d`}
                        {enCurso && <span className="text-feisen-azul"> · En curso</span>}
                      </p>
                    </div>
                    {ns > 0
                      ? <span className="inline-flex items-center gap-1 text-xs text-feisen-texto-2"><Paperclip size={12} strokeWidth={1.8} /> {ns}</span>
                      : t?.soporte && <span className="text-xs text-amber-600">Sin soporte</span>}
                    <ChevronRight size={16} strokeWidth={1.8} className="text-feisen-gris-medio" />
                  </button>
                )
              })}
            </div>}
      </div>

      {modal && (
        <ModalNovedad
          novedad={modal === 'nueva' ? null : modal}
          empleados={[empleado]}
          empleadoFijo={empleado.id}
          existentes={novedades}
          perfilId={perfilId}
          onCerrar={() => setModal(null)}
          onGuardado={(r) => { setModal(null); setMsg(r?.aviso ? { tipo: 'alerta', texto: r.aviso } : null); cargar() }} />
      )}
    </div>
  )
}
