import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { coincideBusqueda } from '../../utils/busqueda'
import { EncabezadoPagina, useAviso, useAtajoBuscar } from '../shared/ui'
import Spinner from '../shared/Spinner'
import { BookOpenText, CalendarCheck, ChevronRight, Eye, FileDown, Plus, Search, Sparkles, WarningOctagon } from '../shared/iconos'
import { exportarListadoMaestro } from '../../utils/exportExcel'
import { Etiqueta, fechaCorta, hoyCol, sumarDias } from '../mantenimiento/comun'
import { AREAS, ESTADOS_VERSION, TIPOS, avisarCambioManuales, dirigidoA, ponerNombres } from './comun'
import FichaManual from './FichaManual'
import FormManual from './FormManual'

const ORDEN_AREA = Object.fromEntries(AREAS.map((a, i) => [a.valor, i]))

// Manuales de procedimiento: biblioteca de manuales, procedimientos, instructivos, formatos y
// políticas por área, con versión vigente e historial. Cada versión pasa por elaboró → revisó →
// aprobó (ISO 9001 §7.5). Nivel 've': consulta lo aprobado · 'registra': elabora borradores ·
// 'todo': revisa, edita y marca obsoletos · ADMIN: aprueba. Arriba, lo que le toca a cada quien,
// incluidos los documentos que debe leer y confirmar («leído y entendido»).
export default function Manuales() {
  const { nivel, perfil, esAdmin, rolEfectivo } = useAuth()
  const gestiona = nivel('manuales') === 'todo'
  const elabora = gestiona || nivel('manuales') === 'registra'
  const [params, setParams] = useSearchParams()
  const [aviso, avisar] = useAviso()
  const buscarRef = useRef(null)
  useAtajoBuscar(buscarRef)

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [manuales, setManuales] = useState([])
  const [leidas, setLeidas] = useState(new Set())      // versiones que yo confirmé
  const [lecturas, setLecturas] = useState({})         // manual_id → { leidos, total } (nivel 'todo')
  const [busqueda, setBusqueda] = useState('')
  const [area, setArea] = useState('')
  const [filtro, setFiltro] = useState('todos') // todos | revision | sinarchivo | recientes | porleer | obsoletos

  // Paneles: ?manual=<id> · ?editar=<id>|nuevo
  const abrir = (clave, valor) => setParams(valor ? { [clave]: valor } : {}, { replace: false })
  const cerrarPanel = () => setParams({}, { replace: false })

  const cargar = useCallback(async () => {
    setError('')
    const [ma, le, re] = await Promise.all([
      supabase.from('manuales').select('*, manual_versiones(id, version, estado, vigente_desde, created_at, subido_por, revisado_por, aprobado_por, comentario_revision, aprobado_externo)').order('codigo'),
      supabase.from('manual_lecturas').select('version_id').eq('usuario_id', perfil?.id),
      gestiona ? supabase.rpc('manual_lecturas_resumen') : Promise.resolve({ data: [] }),
    ])
    if (ma.error) setError(ma.error.message)
    const versiones = await ponerNombres((ma.data || []).flatMap(m => m.manual_versiones))
    const porId = Object.fromEntries(versiones.map(v => [v.id, v]))
    setManuales((ma.data || []).map(m => {
      const vs = m.manual_versiones.map(v => porId[v.id])
      const enTramite = vs.find(v => v.estado !== 'aprobada') || null
      return {
        ...m, enTramite, tramite: enTramite ? `${enTramite.id}:${enTramite.estado}` : '',
        vigente: vs.find(v => v.version === m.version_actual && v.estado === 'aprobada') || null,
      }
    }))
    setLeidas(new Set((le.data || []).map(l => l.version_id)))
    setLecturas(Object.fromEntries((re.data || []).map(r => [r.manual_id, r])))
    setCargando(false)
    avisarCambioManuales()
  }, [perfil?.id, gestiona])
  useEffect(() => { cargar() }, [cargar])

  const hoy = hoyCol()
  const hace30 = sumarDias(hoy, -30)
  const activos = manuales.filter(m => m.activo)
  const conArchivo = activos.filter(m => m.vigente)
  const revisionVencida = activos.filter(m => m.proxima_revision && m.proxima_revision < hoy)
  const revisionProxima = activos.filter(m => m.proxima_revision && m.proxima_revision >= hoy && m.proxima_revision <= sumarDias(hoy, 30))
  const porLeer = activos.filter(m => m.vigente && dirigidoA(m, rolEfectivo) && !leidas.has(m.vigente.id))
  const sinArchivo = activos.filter(m => !m.vigente)
  const recientes = conArchivo.filter(m => (m.vigente.vigente_desde || '') >= hace30)
  const obsoletos = manuales.filter(m => !m.activo)
  const codigosUsados = useMemo(() => new Set(manuales.map(m => m.codigo)), [manuales])

  // Lo que le toca a esta persona: aprobar (ADMIN), revisar ('todo', no lo suyo), corregir o enviar
  // (lo suyo), revisiones periódicas vencidas ('todo') y documentos por leer
  const firmas = v => `elaboró ${v.elaboro?.nombre || '—'}${v.reviso?.nombre ? ` · revisó ${v.reviso.nombre}` : ''}`
  const pendientes = [
    ...activos.filter(m => m.enTramite).map(m => {
      const v = m.enTramite
      const mio = v.subido_por === perfil?.id
      const item = (peso, etiqueta, color, detalle = firmas(v)) => ({ m, clave: v.id, version: v.version, peso, etiqueta, color, detalle })
      if (esAdmin && (v.estado === 'revisada' || (v.estado === 'en_revision' && !mio))) return item(0, 'Por aprobar', 'bg-feisen-azul')
      if (gestiona && v.estado === 'en_revision' && !mio) return item(1, 'Por revisar', 'bg-amber-500')
      if (mio && v.estado === 'borrador') return v.comentario_revision ? item(0, 'Devuelto', 'bg-feisen-rojo', v.comentario_revision) : item(3, 'Sin enviar', 'bg-gray-400')
      return null
    }),
    ...(gestiona ? revisionVencida : []).map(m => ({ m, clave: `rev-${m.id}`, version: m.version_actual, peso: 2, etiqueta: 'Revisión vencida', color: 'bg-amber-500',
      detalle: `tocaba revisarlo el ${fechaCorta(m.proxima_revision)} ${m.proxima_revision.slice(0, 4)}${m.responsable ? ` · ${m.responsable}` : ''}` })),
    ...porLeer.map(m => ({ m, clave: `leer-${m.id}`, version: m.version_actual, peso: 2, etiqueta: 'Por leer', color: 'bg-feisen-azul',
      detalle: `versión vigente desde el ${fechaCorta(m.vigente.vigente_desde)} · confirma que lo leíste` })),
  ].filter(Boolean).sort((a, b) => a.peso - b.peso)
  const enTramite = activos.filter(m => m.enTramite)

  const descargarListado = () => exportarListadoMaestro([...activos, ...obsoletos].sort((a, b) => a.codigo.localeCompare(b.codigo)).map(m => {
    const v = m.vigente
    return {
      codigo: m.codigo, titulo: m.titulo, tipo: TIPOS[m.tipo].texto, area: m.area, responsable: m.responsable,
      version: v ? m.version_actual : '—', vigente: v?.vigente_desde || '',
      elaboro: v ? (v.aprobado_externo ? 'Aprobado en papel' : v.elaboro?.nombre || '') : '',
      reviso: v && !v.aprobado_externo ? v.reviso?.nombre || '' : '', aprobo: v?.aprobo?.nombre || '',
      revision: m.activo ? m.proxima_revision || '' : '',
      lectura: lecturas[m.id] ? `${lecturas[m.id].leidos} de ${lecturas[m.id].total}` : '',
      estado: !m.activo ? 'Obsoleto' : !v ? 'Sin versión aprobada' : m.enTramite ? `Vigente · v${m.enTramite.version} ${ESTADOS_VERSION[m.enTramite.estado].texto.toLowerCase()}` : 'Vigente',
    }
  }))

  const base = filtro === 'obsoletos' ? obsoletos
    : filtro === 'revision' ? revisionVencida
    : filtro === 'sinarchivo' ? sinArchivo
    : filtro === 'recientes' ? recientes
    : filtro === 'porleer' ? porLeer
    : activos
  const buscados = base.filter(m => coincideBusqueda(`${m.codigo} ${m.titulo} ${m.descripcion || ''} ${m.responsable || ''} ${m.area}`, busqueda))
  const lista = buscados.filter(m => !area || m.area === area)
    .sort((a, b) => (ORDEN_AREA[a.area] ?? 99) - (ORDEN_AREA[b.area] ?? 99) || a.codigo.localeCompare(b.codigo))
  const areasConDocs = AREAS.filter(a => buscados.some(m => m.area === a.valor))

  const alGuardar = (mensaje, id) => { abrir('manual', id); avisar(mensaje); cargar() }
  const alCambiar = mensaje => { avisar(mensaje); cargar() }

  if (cargando) return <div className="py-20 grid place-items-center"><Spinner /></div>

  const manualPanel = manuales.find(m => m.id === params.get('manual'))
  const editar = params.get('editar')

  const Kpi = ({ id, clase, Icono, titulo, valor, detalle }) => {
    const activo = filtro === id
    return (
      <button type="button" onClick={() => id && setFiltro(activo ? 'todos' : id)} disabled={!id}
        className={`text-left bg-white border rounded-xl p-4 flex flex-col gap-1 transition-shadow ${activo ? 'border-feisen-azul ring-2 ring-feisen-azul-suave' : 'border-feisen-borde'} ${id ? 'hover:border-gray-300' : 'cursor-default'}`}>
        <span className="flex items-center gap-2">
          <span className={`w-8 h-8 rounded-lg grid place-items-center ${clase}`}><Icono size={18} weight="duotone" /></span>
          <span className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">{titulo}</span>
        </span>
        <span className="text-2xl font-semibold tabular-nums text-feisen-texto">{valor}</span>
        <span className="text-xs text-feisen-texto-2 truncate">{detalle}</span>
      </button>
    )
  }

  const chip = (activo, texto, alHacer, clave) => (
    <button key={clave} type="button" onClick={alHacer} aria-pressed={activo}
      className={`min-h-[34px] px-3 rounded-full border text-[13px] whitespace-nowrap ${activo ? 'bg-feisen-azul border-feisen-azul text-white' : 'bg-white border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
      {texto}
    </button>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-24 lg:pb-8">
      <EncabezadoPagina titulo="Manuales de procedimiento" subtitulo="Cómo se hace cada proceso en Feisen: la versión vigente y su historial.">
        {gestiona && manuales.length > 0 && (
          <button type="button" onClick={descargarListado}
            className="hidden sm:flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
            <FileDown size={16} /> Listado maestro
          </button>
        )}
        {elabora && (
          <button type="button" onClick={() => abrir('editar', 'nuevo')}
            className="flex items-center gap-1.5 min-h-[40px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold">
            <Plus size={16} /> Nuevo documento
          </button>
        )}
      </EncabezadoPagina>

      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">No se pudo cargar: {error}</p>}

      {manuales.length === 0 ? (
        <div className="bg-white border border-feisen-borde rounded-xl px-6 py-12 text-center space-y-2">
          <BookOpenText size={32} weight="duotone" className="mx-auto text-feisen-texto-2" />
          <p className="font-semibold text-feisen-texto">Todavía no hay manuales publicados</p>
          <p className="text-sm text-feisen-texto-2 max-w-md mx-auto">
            {elabora ? 'Crea el primer documento: elige el tipo y el área, y el código se arma solo (PR-FUN-001). Sube el archivo en PDF; queda como borrador hasta que lo revisen y gerencia lo apruebe.'
              : 'Cuando la administración publique los procedimientos de tu área, aquí podrás consultarlos y descargarlos.'}
          </p>
          {elabora && <button type="button" onClick={() => abrir('editar', 'nuevo')} className="mt-3 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold"><Plus size={16} /> Crear el primer documento</button>}
        </div>
      ) : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi clase="bg-feisen-azul-suave text-feisen-azul" Icono={BookOpenText} titulo="Vigentes" valor={conArchivo.length}
            detalle={`en ${new Set(conArchivo.map(m => m.area)).size} áreas`} />
          <Kpi id="recientes" clase="bg-gray-100 text-feisen-texto-2" Icono={Sparkles} titulo="Actualizados" valor={recientes.length}
            detalle="en los últimos 30 días" />
          <Kpi id="revision" clase="bg-amber-50 text-amber-700" Icono={CalendarCheck} titulo="Revisión vencida" valor={revisionVencida.length}
            detalle={revisionVencida.length ? `toca revisarlos${revisionProxima.length ? ` · ${revisionProxima.length} vencen en 30 días` : ''}`
              : revisionProxima.length ? `${revisionProxima.length} vencen en 30 días` : 'Todo al día'} />
          {elabora
            ? <Kpi id="sinarchivo" clase="bg-feisen-rojo-suave text-feisen-rojo" Icono={WarningOctagon} titulo="Sin aprobar" valor={sinArchivo.length}
                detalle={sinArchivo.length ? `sin versión vigente · ${enTramite.length} en trámite` : 'Todos tienen versión vigente'} />
            : <Kpi id="porleer" clase="bg-feisen-azul-suave text-feisen-azul" Icono={Eye} titulo="Por leer" valor={porLeer.length}
                detalle={porLeer.length ? 'confirma que los leíste' : 'Estás al día'} />}
        </div>

        {pendientes.length > 0 && (
          <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
            <div className="flex justify-between px-4 py-3 border-b border-feisen-borde-suave">
              <span className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Te toca</span>
              <span className="text-xs text-feisen-texto-2">{pendientes.length} {pendientes.length === 1 ? 'documento' : 'documentos'}</span>
            </div>
            <div className="divide-y divide-feisen-borde-suave">
              {pendientes.map(({ m, clave, version, etiqueta, color, detalle }) => (
                <button key={clave} type="button" onClick={() => abrir('manual', m.id)} className="relative w-full flex items-center gap-3 text-left px-4 py-3 hover:bg-feisen-fondo">
                  <span className={`absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r ${color}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-feisen-texto truncate">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mr-1.5">{etiqueta}</span>
                      <b className="font-semibold">{m.titulo}</b>{version ? ` · v${version}` : ''}
                    </span>
                    <span className="block text-xs text-feisen-texto-2 truncate">
                      {m.codigo} · {detalle}
                    </span>
                  </span>
                  <ChevronRight size={16} className="text-gray-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative sm:w-80">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input ref={buscarRef} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por título, código o responsable"
                className="w-full border border-feisen-borde rounded-lg pl-10 pr-3 py-2.5 bg-white text-sm focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave" />
            </div>
            {filtro !== 'todos' && (
              <button type="button" onClick={() => setFiltro('todos')} className="self-start sm:self-auto text-sm text-feisen-azul font-medium">
                Quitar filtro «{{ revision: 'Revisión vencida', sinarchivo: 'Sin aprobar', porleer: 'Por leer', recientes: 'Actualizados', obsoletos: 'Obsoletos' }[filtro]}» ×
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto sm:flex-wrap -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
            {chip(!area, `Todas · ${buscados.length}`, () => setArea(''), 'todas')}
            {areasConDocs.map(a => chip(area === a.valor, `${a.valor} · ${buscados.filter(m => m.area === a.valor).length}`, () => setArea(area === a.valor ? '' : a.valor), a.valor))}
            {gestiona && obsoletos.length > 0 && chip(filtro === 'obsoletos', `Obsoletos · ${obsoletos.length}`, () => setFiltro(filtro === 'obsoletos' ? 'todos' : 'obsoletos'), 'obsoletos')}
          </div>
        </div>

        <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
          {lista.length === 0 && <p className="px-4 py-8 text-center text-sm text-feisen-texto-2">Ningún documento cumple el filtro. <button type="button" onClick={() => { setFiltro('todos'); setArea(''); setBusqueda('') }} className="text-feisen-azul font-medium">Ver todos</button></p>}
          {lista.length > 0 && (
            <table className="w-full text-sm hidden md:table">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-feisen-texto-2 border-b border-feisen-borde">
                <th className="px-4 py-2.5 font-semibold">Código</th><th className="px-4 py-2.5 font-semibold">Documento</th><th className="px-4 py-2.5 font-semibold">Tipo</th>
                <th className="px-4 py-2.5 font-semibold">Área</th><th className="px-4 py-2.5 font-semibold text-right">Versión</th><th className="px-4 py-2.5 font-semibold">Vigente desde</th>
              </tr></thead>
              <tbody className="divide-y divide-feisen-borde-suave">
                {lista.map(m => (
                  <tr key={m.id} onClick={() => abrir('manual', m.id)} className="cursor-pointer hover:bg-feisen-fondo">
                    <td className="px-4 py-3 text-xs font-medium text-feisen-texto-2 tabular-nums whitespace-nowrap">{m.codigo}</td>
                    <td className="px-4 py-3 max-w-md">
                      <p className="font-semibold text-feisen-texto">{m.titulo}</p>
                      <p className="text-xs text-feisen-texto-2 truncate">{m.descripcion || m.responsable || '—'}</p>
                    </td>
                    <td className="px-4 py-3"><Etiqueta clase={TIPOS[m.tipo].clase}>{TIPOS[m.tipo].texto}</Etiqueta></td>
                    <td className="px-4 py-3 text-feisen-texto-2 whitespace-nowrap">{m.area}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {m.vigente ? `v${m.version_actual}` : <span className="text-xs text-feisen-rojo">Sin aprobar</span>}
                      {m.enTramite && <p className="text-xs text-feisen-texto-2 whitespace-nowrap">v{m.enTramite.version} {ESTADOS_VERSION[m.enTramite.estado].texto.toLowerCase()}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-feisen-texto">{m.vigente ? `${fechaCorta(m.vigente.vigente_desde)} ${m.vigente.vigente_desde.slice(0, 4)}` : '—'}</p>
                      {m.activo && m.proxima_revision && m.proxima_revision < hoy && <p className="text-xs text-amber-700 font-medium">Revisión vencida</p>}
                      {lecturas[m.id] && <p className={`text-xs ${lecturas[m.id].leidos < lecturas[m.id].total ? 'text-feisen-texto-2' : 'text-emerald-700'}`}>Leído {lecturas[m.id].leidos} de {lecturas[m.id].total}</p>}
                      {!gestiona && m.vigente && porLeer.includes(m) && <p className="text-xs text-feisen-azul font-medium">Por leer</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="md:hidden divide-y divide-feisen-borde-suave">
            {lista.map(m => (
              <button key={m.id} type="button" onClick={() => abrir('manual', m.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-feisen-fondo">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-feisen-texto">{m.titulo}</span>
                  <span className="block text-xs text-feisen-texto-2">{m.codigo} · {m.area} · {m.vigente ? `v${m.version_actual}` : 'sin aprobar'}{m.enTramite ? ` · v${m.enTramite.version} ${ESTADOS_VERSION[m.enTramite.estado].texto.toLowerCase()}` : ''}</span>
                  {m.activo && m.proxima_revision && m.proxima_revision < hoy && <span className="block text-xs text-amber-700 font-medium mt-0.5">Revisión vencida</span>}
                  {porLeer.includes(m) && <span className="block text-xs text-feisen-azul font-medium mt-0.5">Por leer</span>}
                </span>
                <ChevronRight size={16} className="text-gray-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </>}

      {manualPanel && !editar && (
        <FichaManual manual={manualPanel} onCerrar={cerrarPanel} onEditar={() => abrir('editar', manualPanel.id)} onCambio={alCambiar} />
      )}
      {((elabora && editar === 'nuevo') || (gestiona && manuales.some(m => m.id === editar))) && (
        <FormManual manual={editar === 'nuevo' ? null : manuales.find(m => m.id === editar)} codigosUsados={codigosUsados}
          onCerrar={cerrarPanel} onGuardado={alGuardar} />
      )}
      {aviso}
    </div>
  )
}
