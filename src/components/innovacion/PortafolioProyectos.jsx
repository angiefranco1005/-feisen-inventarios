import { useNavigate } from 'react-router-dom'
import { formatCOP } from '../../utils/formatters'
import { AlertTriangle, FileText, Lightbulb, ChevronRight } from '../shared/iconos'
import {
  TIPOS, ESTADOS, APROBADORA, totalInversion, estadoFase, textoEstadoFase, resumenCumplimiento,
} from './comun'

// Vista «portafolio» de la lista de proyectos (opción B que eligió Angie, 2026-11-20):
// arriba «Requiere atención» (fases atrasadas y proyectos que esperan la firma), debajo una
// tarjeta por proyecto con su recorrido de fases y el último avance con miniatura.

const fechaCorta = f => f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' }) : ''

// Color del punto de cada fase en el recorrido
const PUNTO = {
  a_tiempo:   'bg-feisen-azul border-feisen-azul',
  tarde:      'bg-feisen-azul border-feisen-rojo',
  atrasada:   'bg-feisen-rojo border-feisen-rojo',
  por_vencer: 'bg-amber-400 border-amber-400',
  en_curso:   'bg-feisen-azul-suave border-feisen-azul',
  pendiente:  'bg-white border-gray-300',
  sin_fechas: 'bg-white border-gray-300',
}

export function RequiereAtencion({ proyectos, esAprobadora }) {
  const navigate = useNavigate()
  const items = []
  for (const p of proyectos) {
    if (['cerrado', 'rechazado', 'aplazado'].includes(p.estado)) continue
    if (p.estado === 'presentado') {
      items.push({ p, rojo: false, texto: `${esAprobadora ? 'espera tu firma' : `espera la firma de ${APROBADORA.nombre}`} · ${formatCOP(totalInversion(p.costos))}` })
    }
    for (const f of p.fases || []) {
      const e = estadoFase(f)
      if (e.clave === 'atrasada') items.push({ p, rojo: true, texto: `${f.fase || 'Fase'} ${textoEstadoFase(e).toLowerCase()}` })
      else if (e.clave === 'por_vencer') items.push({ p, rojo: false, texto: `${f.fase || 'Fase'} · ${textoEstadoFase(e).toLowerCase()}` })
    }
  }
  if (!items.length) return null
  // Una línea por proyecto: se juntan los motivos (lo rojo primero)
  const porProyecto = new Map()
  for (const i of items.sort((a, b) => Number(b.rojo) - Number(a.rojo))) {
    const g = porProyecto.get(i.p.id)
    if (g) { g.texto += ` · ${i.texto}`; g.rojo = g.rojo || i.rojo } else porProyecto.set(i.p.id, { ...i })
  }
  items.length = 0
  items.push(...[...porProyecto.values()].sort((a, b) => Number(b.rojo) - Number(a.rojo)))
  const hayRojo = items.some(i => i.rojo)
  return (
    <div className={`bg-white border rounded-xl px-4 py-3 ${hayRojo ? 'border-feisen-rojo/40' : 'border-amber-300'}`}>
      <p className={`flex items-center gap-2 text-sm font-semibold ${hayRojo ? 'text-feisen-rojo' : 'text-amber-700'}`}>
        <AlertTriangle size={16} /> Requiere atención · {items.length}
      </p>
      <ul className="mt-2 divide-y divide-feisen-borde-suave">
        {items.slice(0, 6).map((i, k) => (
          <li key={k}>
            <button onClick={() => navigate(`/innovacion/${i.p.id}`)} className="w-full text-left flex items-center gap-2 py-2 min-h-[40px] text-sm hover:text-feisen-azul">
              <span className={`w-2 h-2 rounded-full shrink-0 ${i.rojo ? 'bg-feisen-rojo' : 'bg-amber-400'}`} />
              <span className="font-medium text-feisen-texto truncate">{i.p.nombre}</span>
              <span className={`truncate ${i.rojo ? 'text-feisen-rojo' : 'text-feisen-texto-2'}`}>· {i.texto}</span>
              <ChevronRight size={14} className="ml-auto text-gray-400 shrink-0" />
            </button>
          </li>
        ))}
      </ul>
      {items.length > 6 && <p className="text-xs text-feisen-texto-2 pt-1">Y {items.length - 6} más: ábralos desde el cronograma.</p>}
    </div>
  )
}

export default function PortafolioProyectos({ proyectos, ultimoAvance, miniaturas, esAprobadora }) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {proyectos.map(p => (
        <TarjetaProyecto key={p.id} p={p} avance={ultimoAvance[p.id]} miniatura={miniaturas[p.id]} esAprobadora={esAprobadora} />
      ))}
    </div>
  )
}

function TarjetaProyecto({ p, avance, miniatura, esAprobadora }) {
  const navigate = useNavigate()
  const est = ESTADOS[p.estado] || ESTADOS.borrador
  const r = resumenCumplimiento(p.fases)
  const fases = (p.fases || []).filter(f => f.fase)
  const inv = p.monto_aprobado ?? totalInversion(p.costos)
  const actual = fases.find(f => !f.terminada)
  const archivos = avance?.archivos || []

  return (
    <button onClick={() => navigate(`/innovacion/${p.id}`)}
      className="text-left bg-white border border-feisen-borde rounded-xl p-4 hover:border-feisen-azul/50 hover:bg-feisen-fondo/40 transition-colors flex flex-col gap-3">
      {/* Encabezado: miniatura, nombre, estado */}
      <div className="flex gap-3">
        <div className="w-16 h-16 rounded-lg border border-feisen-borde-suave bg-feisen-fondo grid place-items-center overflow-hidden shrink-0">
          {miniatura
            ? <img src={miniatura} alt="" className="w-full h-full object-cover" loading="lazy" />
            : archivos.length ? <FileText size={22} className="text-gray-400" /> : <Lightbulb size={22} className="text-gray-300" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-feisen-texto-2 tabular-nums">{p.numero} · {TIPOS[p.tipo] || ''}</p>
          <p className="font-semibold text-feisen-texto leading-snug line-clamp-2">{p.nombre}</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${est.clase}`}>
              {p.estado === 'presentado' ? (esAprobadora ? 'Espera tu firma' : 'Espera firma') : est.texto}
            </span>
            {r.atrasadas > 0 && <span className="rounded-md px-2 py-0.5 text-xs font-medium bg-feisen-rojo-suave text-feisen-rojo">{r.atrasadas} fase{r.atrasadas === 1 ? '' : 's'} atrasada{r.atrasadas === 1 ? '' : 's'}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold tabular-nums text-feisen-texto">{inv ? formatCOP(inv) : '—'}</p>
          <p className="text-xs text-feisen-texto-2">{p.monto_aprobado != null ? 'aprobado' : 'inversión'}</p>
        </div>
      </div>

      {/* Recorrido de fases */}
      {fases.length > 0 && (
        <div>
          <div className="flex items-center">
            {fases.map((f, i) => {
              const e = estadoFase(f)
              const hecha = e.clave === 'a_tiempo' || e.clave === 'tarde'
              return (
                <div key={i} className={`flex items-center ${i < fases.length - 1 ? 'flex-1' : ''}`}>
                  <span title={`${f.fase}: ${textoEstadoFase(e)}`} className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${PUNTO[e.clave]}`} />
                  {i < fases.length - 1 && <span className={`flex-1 h-0.5 mx-1 ${hecha ? 'bg-feisen-azul' : 'bg-feisen-borde'}`} />}
                </div>
              )
            })}
          </div>
          <div className="flex justify-between gap-2 mt-1.5">
            {fases.map((f, i) => (
              <span key={i} className={`text-[11px] leading-tight truncate ${i === 0 ? 'text-left' : i === fases.length - 1 ? 'text-right' : 'text-center'} flex-1 ${f === actual ? 'text-feisen-texto font-semibold' : 'text-feisen-texto-2'}`}>{f.fase}</span>
            ))}
          </div>
          {actual && (() => {
            const e = estadoFase(actual)
            const color = e.clave === 'atrasada' ? 'text-feisen-rojo' : e.clave === 'por_vencer' ? 'text-amber-700' : 'text-feisen-texto-2'
            return <p className={`text-xs mt-1.5 ${color}`}>Ahora: {actual.fase} · {textoEstadoFase(e)}</p>
          })()}
        </div>
      )}

      {/* Último avance */}
      <p className="text-xs text-feisen-texto-2 border-t border-feisen-borde-suave pt-2 truncate">
        {avance
          ? <>Último avance {fechaCorta(avance.fecha)}{avance.nota ? `: «${avance.nota}»` : ''}{archivos.length ? ` · ${archivos.length} archivo${archivos.length === 1 ? '' : 's'}` : ''}</>
          : 'Sin avances todavía'}
      </p>
    </button>
  )
}
