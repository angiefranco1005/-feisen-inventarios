import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { PanelLateral } from '../shared/ui'
import { CheckCircle, ChevronDown, ChevronUp, Circle, PenLine } from '../shared/iconos'
import { Etiqueta } from '../mantenimiento/comun'
import { GRUPOS_GUIA, GUIA_ISO } from './plantillasIso'
import { contenidoVacio } from './estructura'
import { TIPOS, codigoSugerido, crearDesdeGuia } from './comun'

// Guía ISO 9001: qué documentos necesita Feisen, en qué orden, por qué los pide la norma y en
// qué va cada uno. «Empezar» crea el documento con su plantilla y abre el asistente.
export default function GuiaIso({ manuales, codigosUsados, onCerrar, onEmpezado, onAbrir }) {
  const { perfil, nivel } = useAuth()
  const elabora = ['registra', 'todo'].includes(nivel('manuales'))
  const [abierto, setAbierto] = useState(null)
  const [creando, setCreando] = useState(null)
  const [error, setError] = useState('')

  const porPlantilla = Object.fromEntries(manuales.filter(m => m.plantilla).map(m => [m.plantilla, m]))
  const hechos = GUIA_ISO.filter(i => porPlantilla[i.clave]?.vigente).length
  const empezados = GUIA_ISO.filter(i => porPlantilla[i.clave] && !porPlantilla[i.clave].vigente).length

  const empezar = async item => {
    setCreando(item.clave); setError('')
    try {
      const contenido = { ...contenidoVacio(item.tipo), ...structuredClone(item.contenido) }
      const manual = await crearDesdeGuia({ item, contenidoInicial: contenido, codigo: codigoSugerido(item.tipo, item.area, codigosUsados), usuarioId: perfil?.id })
      onEmpezado(manual)
    } catch (e) { setError(e.message); setCreando(null) }
  }

  const estado = m => !m ? null : m.vigente ? { texto: `Vigente · v${m.version_actual}`, clase: 'bg-emerald-50 text-emerald-700' }
    : { texto: m.enTramite?.estado === 'borrador' ? 'En borrador' : 'En revisión', clase: 'bg-amber-50 text-amber-700' }

  return (
    <PanelLateral etiqueta="Guía ISO 9001" onCerrar={onCerrar}
      encabezado={<>
        <p className="text-xs text-gray-400">Manuales</p>
        <h2 className="text-lg font-semibold text-feisen-texto">Guía ISO 9001 para Feisen</h2>
        <p className="text-sm text-feisen-texto-2 mt-1">Los documentos que necesita la planta, en el orden sugerido. Cada uno trae una plantilla adelantada: solo hay que ajustarla.</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-emerald-600" style={{ width: `${(hechos / GUIA_ISO.length) * 100}%` }} />
          </div>
          <span className="text-xs text-feisen-texto-2 tabular-nums whitespace-nowrap">{hechos} de {GUIA_ISO.length} vigentes{empezados ? ` · ${empezados} en curso` : ''}</span>
        </div>
      </>}>
      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}
      {GRUPOS_GUIA.map(g => (
        <section key={g.clave} className="space-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">{g.titulo}</p>
            <p className="text-xs text-feisen-texto-2">{g.detalle}</p>
          </div>
          <div className="border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
            {GUIA_ISO.filter(i => i.grupo === g.clave).map(item => {
              const m = porPlantilla[item.clave]
              const est = estado(m)
              const ver = abierto === item.clave
              return (
                <div key={item.clave}>
                  <button type="button" onClick={() => setAbierto(ver ? null : item.clave)} aria-expanded={ver}
                    className="w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-feisen-fondo">
                    {m?.vigente ? <CheckCircle size={18} weight="fill" className="text-emerald-600 shrink-0 mt-0.5" /> : <Circle size={18} className={`shrink-0 mt-0.5 ${m ? 'text-amber-500' : 'text-gray-300'}`} />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-feisen-texto">{item.titulo}</span>
                      <span className="block text-xs text-feisen-texto-2">{TIPOS[item.tipo].texto} · {item.area} · ISO {item.clausula}</span>
                    </span>
                    {est && <Etiqueta clase={est.clase}>{est.texto}</Etiqueta>}
                    {ver ? <ChevronUp size={16} className="text-gray-400 shrink-0 mt-0.5" /> : <ChevronDown size={16} className="text-gray-400 shrink-0 mt-0.5" />}
                  </button>
                  {ver && (
                    <div className="px-3 pb-3 pl-10 space-y-2.5">
                      <p className="text-sm text-feisen-texto">{item.porque}</p>
                      <p className="text-xs text-feisen-texto-2">Lo elabora: {item.responsable}</p>
                      {m ? (
                        <button type="button" onClick={() => onAbrir(m)} className="min-h-[40px] px-3 rounded-lg border border-feisen-borde text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
                          Ver {m.codigo}
                        </button>
                      ) : elabora ? (
                        <button type="button" onClick={() => empezar(item)} disabled={!!creando}
                          className="flex items-center gap-1.5 min-h-[40px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold disabled:opacity-50">
                          <PenLine size={15} /> {creando === item.clave ? 'Preparando…' : 'Empezar con la plantilla'}
                        </button>
                      ) : <p className="text-xs text-feisen-texto-2">Todavía no se ha creado.</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
      <p className="text-xs text-feisen-texto-2">La norma ISO 9001:2015 no exige procedimientos con un nombre fijo: exige demostrar que los procesos están controlados. Esta lista es la forma práctica de hacerlo en una planta como Feisen; ajústala si algún proceso no aplica.</p>
    </PanelLateral>
  )
}
