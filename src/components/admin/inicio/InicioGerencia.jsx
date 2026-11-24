import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import Spinner from '../../shared/Spinner'
import { TIPOS_NOVEDAD, motivoRetiroLabel } from '../../rrhh/catalogosRRHH'
import { cargarFoto, cargarPeriodo, rangoPeriodo, opcionesMeses, rotacionPeriodo, retirosPorMotivo } from './datosInicio'
import { Warehouse, Truck, Wrench, Flame, HardHat, ShieldAlert, RefreshCw, Target, LogOut } from '../../shared/iconos'
import DashboardVentas from '../../of/ventas/DashboardVentas'
import DashboardOF from '../../of/Dashboard'
import InformeSinRotacion from './InformeSinRotacion'
import DashboardLogistica from '../../logistica/Dashboard'
import IndicadoresLogistica from './IndicadoresLogistica'
import MotoresOF from '../../logistica/MotoresOF'

// Inicio de gerencia: une el antiguo Inicio y Analítica, por pestañas para no llenar la
// pantalla (2026-11-04): cada módulo tiene su pestaña (Ventas = dashboard de Odoo, Pedidos OF =
// análisis de las OF). La pestaña Resumen se quitó a pedido de Angie (2026-11-23); los
// pendientes siguen marcados con un punto en la pestaña de su módulo.
// La pestaña queda en la URL (?vista=) y se recuerda en este navegador.
// Ver OBSERVACIONES.md (2026-10-28, 2026-11-04) y la skill ux-feisen.

const VISTAS = [
  { id: 'ventas',      texto: 'Ventas' },
  { id: 'of',          texto: 'Pedidos OF' },
  { id: 'inventarios', texto: 'Inventarios' },
  { id: 'logistica',   texto: 'Logística' },
  { id: 'produccion',  texto: 'Producción' },
  { id: 'personas',    texto: 'RRHH' },
]
// Inicio de Logística (Efraín, 2026-11-20): su inicio de siempre + Inventarios y Logística de gerencia
const VISTAS_LOGISTICA = [
  { id: 'inicio',      texto: 'Inicio' },
  { id: 'inventarios', texto: 'Inventarios' },
  { id: 'logistica',   texto: 'Logística' },
]
const VISTAS_RRHH = [{ id: 'personas', texto: 'RRHH' }]
// Pestañas que usan el selector de periodo
const CON_PERIODO = ['produccion', 'personas']

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS  = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const fmt = n => Number(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })
const millones = n => `$${(Number(n || 0) / 1e6).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`
const cap = s => (s || '').charAt(0) + (s || '').slice(1).toLowerCase()
const leer = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def } catch { return def } }
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin almacenamiento */ } }

const Etiqueta = ({ periodo }) => (
  <span className={`ml-1.5 align-[1px] text-[10px] font-semibold uppercase tracking-wide px-1.5 py-px rounded ${periodo ? 'bg-feisen-azul-suave text-feisen-azul' : 'bg-feisen-borde-suave text-gray-400'}`}>
    {periodo ? 'Periodo' : 'Hoy'}
  </span>
)
const Estado = ({ tono, children }) => {
  const c = { rojo: 'bg-feisen-rojo-suave text-feisen-rojo', ambar: 'bg-amber-50 text-amber-700', verde: 'bg-emerald-50 text-emerald-700', gris: 'bg-gray-100 text-feisen-texto-2' }[tono]
  return <span className={`text-[11.5px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${c}`}>{children}</span>
}
const Cifra = ({ etiqueta, valor, contexto, tono }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 leading-tight">{etiqueta}</p>
    <p className={`text-xl font-semibold tabular-nums mt-0.5 ${tono === 'rojo' ? 'text-feisen-rojo' : tono === 'ambar' ? 'text-amber-700' : 'text-feisen-texto'}`}>{valor}</p>
    {contexto && <p className="text-xs text-feisen-texto-2">{contexto}</p>}
  </div>
)
function Tarjeta({ icono: Icono, titulo, estado, enlace, onIr, children }) {
  return (
    <article className="bg-white border border-feisen-borde rounded-xl flex flex-col min-w-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-feisen-borde-suave">
        <Icono size={18} weight="duotone" className="text-feisen-azul" />
        <h3 className="text-sm font-semibold text-feisen-texto flex-1">{titulo}</h3>
        {estado}
      </div>
      <div className="px-4 py-3.5 flex flex-col gap-4 flex-1">{children}</div>
      <div className="px-4 py-2.5 border-t border-feisen-borde-suave">
        <button onClick={onIr} className="text-sm font-medium text-feisen-azul hover:underline">{enlace} →</button>
      </div>
    </article>
  )
}
const BarraPersona = ({ nombre, valor, max, sufijo = '' }) => (
  <div className="grid grid-cols-[150px,1fr,52px] gap-2 items-center text-[13px] py-0.5">
    <span className="text-feisen-texto-2 truncate" title={nombre}>{nombre}</span>
    <span className="h-2.5 rounded bg-feisen-borde-suave overflow-hidden"><span className="block h-full rounded bg-feisen-azul" style={{ width: `${max ? (valor / max) * 100 : 0}%` }} /></span>
    <span className="text-right font-semibold tabular-nums">{fmt(valor)}{sufijo}</span>
  </div>
)

// Mosaico: el más grande ocupa su parte del lado largo y el resto se reparte igual
function mosaico(items, x, y, w, h, out = []) {
  if (!items.length) return out
  if (items.length === 1) { out.push({ ...items[0], x, y, w, h }); return out }
  const tot = items.reduce((t, i) => t + i.valor, 0), [a, ...resto] = items, f = tot ? a.valor / tot : 0
  if (w >= h) { out.push({ ...a, x, y, w: w * f, h }); mosaico(resto, x + w * f, y, w * (1 - f), h, out) }
  else { out.push({ ...a, x, y, w, h: h * f }); mosaico(resto, x, y + h * f, w, h * (1 - f), out) }
  return out
}
const TONOS = ['#064794', '#2F5E9E', '#4E78B0', '#6E93C8', '#8FAAD2', '#A9BCDB', '#C3D3E8']

// Pestañas por módulo (punto rojo/ámbar si tienen pendientes)
function Pestanas({ vistas, vista, elegir, avisoDe = () => null }) {
  return (
    <div role="tablist" aria-label="Módulo" className="flex gap-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-feisen-borde [scrollbar-width:none]">
      {vistas.map(v => {
        const aviso = avisoDe(v.id)
        return (
          <button key={v.id} role="tab" aria-selected={vista === v.id} onClick={() => elegir(v.id)}
            className={`relative whitespace-nowrap px-3 py-2 text-[13.5px] -mb-px border-b-2 transition-colors ${vista === v.id ? 'border-feisen-azul text-feisen-azul font-semibold' : 'border-transparent text-feisen-texto-2 hover:text-feisen-texto'}`}>
            {v.texto}
            {aviso && <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle ${aviso === 'rojo' ? 'bg-feisen-rojo' : 'bg-amber-500'}`} aria-label="tiene pendientes" />}
          </button>
        )
      })}
    </div>
  )
}

export default function InicioGerencia({ modo = 'gerencia' }) {
  const esLog = modo === 'logistica'
  // Inicio de Recursos Humanos (Zaray, 2026-11-20): solo la pestaña RRHH de gerencia
  const esRRHH = modo === 'rrhh'
  const vistas = esLog ? VISTAS_LOGISTICA : esRRHH ? VISTAS_RRHH : VISTAS
  const claveVista = esLog ? 'inicio-log-vista' : esRRHH ? 'inicio-rrhh-vista' : 'inicio-vista'
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const [foto, setFoto]           = useState(null)
  const [error, setError]         = useState(null)
  const [periodo, setPeriodo]     = useState(() => leer('inicio-periodo', '30d'))
  const [datosP, setDatosP]       = useState(null)
  const [ocultas]                 = useState(() => new Set(leer('inicio-ocultas', [])))
  const [vistaValor, setVistaValor] = useState(() => leer('inicio-vista-valor', 'barras'))
  const [bodPareto, setBodPareto] = useState(() => leer('inicio-pareto', ''))
  const [ausPor, setAusPorEstado] = useState(() => leer('inicio-ausencias-por', 'tipo'))   // ausencias por 'tipo' o 'area'
  const setAusPor = v => { setAusPorEstado(v); guardar('inicio-ausencias-por', v) }
  const [bodRot, setBodRotEstado] = useState(() => leer('inicio-rotacion-bodega', ''))
  const setBodRot = v => setBodRotEstado(prev => { const n = typeof v === 'function' ? v(prev) : v; guardar('inicio-rotacion-bodega', n); return n })
  const [params, setParams]       = useSearchParams()
  const guardada = leer(claveVista, vistas[0].id)
  const vista = vistas.some(v => v.id === params.get('vista')) ? params.get('vista')
    : vistas.some(v => v.id === guardada) ? guardada : vistas[0].id
  // Informe completo de productos sin rotación (dentro de la pestaña Inventarios, en la URL)
  const informe = vista === 'inventarios' && params.get('informe') === 'sin-rotacion'
  function abrirInforme(abrir) {
    setParams(prev => { const n = new URLSearchParams(prev); n.set('vista', 'inventarios'); if (abrir) n.set('informe', 'sin-rotacion'); else n.delete('informe'); return n })
    window.scrollTo({ top: 0 })
  }
  function elegirVista(v) {
    guardar(claveVista, v)
    setParams(prev => { const n = new URLSearchParams(prev); n.set('vista', v); n.delete('informe'); return n }, { replace: true })
  }

  async function recargar() {
    setError(null)
    try { setFoto(await cargarFoto({ soloOperacion: esLog, soloRRHH: esRRHH })) } catch (e) { setError(e.message || 'No se pudieron cargar los datos.') }
  }
  useEffect(() => { recargar() }, [])

  const rango = useMemo(() => rangoPeriodo(periodo), [periodo])
  useEffect(() => {
    if (!foto || esLog) return
    let vigente = true
    setDatosP(null)
    cargarPeriodo(rango.desde, rango.hasta, foto, { soloRRHH: esRRHH }).then(d => { if (vigente) setDatosP(d) })
    return () => { vigente = false }
  }, [foto, rango])

  function elegirPeriodo(p) { if (!p) return; setPeriodo(p); guardar('inicio-periodo', p) }

  if (error) return (
    <div className="max-w-xl mx-auto text-center py-20 space-y-3">
      <p className="text-feisen-texto font-medium">No se pudo cargar el tablero.</p>
      <p className="text-sm text-feisen-texto-2">{error}</p>
      <button onClick={recargar} className="px-3 py-2 rounded-lg border border-feisen-borde text-sm">Reintentar</button>
    </div>
  )
  // En Logística la pestaña Inicio no espera la carga del tablero
  if (!foto && !(esLog && vista === 'inicio')) return <Spinner texto="Armando el tablero..." />
  if (!foto) return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-feisen-texto">{new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 19 ? 'Buenas tardes' : 'Buenas noches'}, {perfil?.nombre?.split(' ')[0]}</h1>
        <p className="text-sm text-feisen-texto-2 mt-0.5">Logística · Bodega Motores</p>
      </div>
      <Pestanas vistas={vistas} vista={vista} elegir={elegirVista} />
      <DashboardLogistica sinSaludo />
    </div>
  )

  const { inv, bodegas, logistica, rrhh, calidad, fundicion } = foto
  const rot = rotacionPeriodo(foto.empleados || [], rango.desde, rango.hasta)
  const salidas = retirosPorMotivo(foto.empleados || [])
  const evals = rrhh.evaluaciones
  const hoy = new Date()
  const saludo = hoy.getHours() < 12 ? 'Buenos días' : hoy.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches'
  const meses = opcionesMeses(foto.primerMov)
  const anios = [...new Set(meses.map(m => m.clave.slice(2, 6)))]

  // ── Requiere tu atención (la clave incluye la cifra: si cambia, vuelve a aparecer) ──
  const nom = rrhh.nomina
  const alertas = [
    nom && nom.estado !== 'aprobada' && {
      id: `nomina-${nom.id}-${nom.estado}`, tono: 'ambar', mod: 'RR. HH.', vista: 'personas', prim: true,
      titulo: `Nómina de la ${nom.quincena}.ª quincena de ${MESES[nom.mes - 1]} ${nom.estado === 'cerrada' ? 'por aprobar' : 'en borrador'}`,
      detalle: nom.estado === 'cerrada' ? 'Está lista: falta tu aprobación para enviar desprendibles.' : 'Falta cerrarla y aprobarla para enviar desprendibles.',
      boton: 'Revisar nómina', ir: `/rrhh/nomina/${nom.id}`,
    },
    logistica.atrasados > 0 && {
      id: `pedidos-atrasados-${logistica.atrasados}`, tono: 'rojo', mod: 'Logística', vista: 'logistica',
      titulo: `${logistica.atrasados} pedido${logistica.atrasados === 1 ? '' : 's'} en tránsito pasaron su fecha de llegada`,
      detalle: logistica.peorAtraso ? `El más atrasado es ${logistica.peorAtraso.numero}, con ${logistica.peorAtraso.dias} ${logistica.peorAtraso.dias === 1 ? 'día hábil' : 'días hábiles'} de retraso.` : '',
      boton: 'Ver pedidos', ir: '/pedidos',
    },
    (inv.agotados > 0 || inv.bajo > 0) && {
      id: `agotados-${inv.agotados}-${inv.bajo}`, tono: 'rojo', mod: 'Inventarios', vista: 'inventarios',
      titulo: `${fmt(inv.agotados)} productos agotados · ${fmt(inv.bajo)} bajo el mínimo`,
      detalle: inv.sinMinimo > inv.activos * 0.3 ? `${fmt(inv.sinMinimo)} productos aún no tienen mínimo, así que la alerta se queda corta.` : 'Revisa qué hay que pedir.',
      boton: 'Ver productos', ir: '/productos',
    },
    inv.nuncaMovidos > 0 && {
      id: `nunca-movidos-${inv.nuncaMovidos}`, tono: 'ambar', mod: 'Inventarios', vista: 'inventarios',
      titulo: `${fmt(inv.nuncaMovidos)} productos con existencia nunca se han movido`,
      detalle: `Suman ${millones(inv.valorNuncaMovidos)}. Revisa si siguen en uso o se pueden vender.`,
      boton: 'Ver rotación', ir: '#rotacion',
    },
    calidad.abiertas > 0 && {
      id: `nc-abiertas-${calidad.abiertas}`, tono: 'ambar', mod: 'Calidad', vista: 'produccion',
      titulo: `${calidad.abiertas} no conformidad${calidad.abiertas === 1 ? '' : 'es'} abierta${calidad.abiertas === 1 ? '' : 's'}${calidad.area ? ` en ${cap(calidad.area)}` : ''}`,
      detalle: `${fmt(calidad.unidades)} unidades afectadas${calidad.defecto ? ` · defecto más frecuente: ${calidad.defecto.toLowerCase()}` : ''}.`,
      boton: 'Ver calidad', ir: '/calidad',
    },
    fundicion.fundidas30 === 0 && {
      id: 'fundidas-0', tono: 'gris', mod: 'Fundición', vista: 'produccion',
      titulo: 'No hay fundidas registradas en los últimos 30 días',
      detalle: 'Sin el registro de fundidas no se puede medir hierro colado ni rendimiento del horno.',
      boton: 'Registrar fundida', ir: '/fundidas/nueva',
    },
    rrhh.contratosVencen > 0 && {
      id: `contratos-${rrhh.contratosVencen}`, tono: 'ambar', mod: 'RR. HH.', vista: 'personas',
      titulo: `${rrhh.contratosVencen} contrato${rrhh.contratosVencen === 1 ? '' : 's'} vence${rrhh.contratosVencen === 1 ? '' : 'n'} en los próximos 30 días`,
      detalle: 'Decide si se renuevan para enviar el preaviso a tiempo.', boton: 'Ver colaboradores', ir: '/rrhh/empleados',
    },
  ].filter(Boolean)
  const visibles = alertas.filter(a => !ocultas.has(a.id))
  // '#rotacion' está en la pestaña Inventarios: se cambia de pestaña y luego se baja hasta ahí
  const ir = destino => {
    if (!destino.startsWith('#')) return navigate(destino)
    elegirVista('inventarios')
    setTimeout(() => document.getElementById(destino.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50)
  }
  // Punto en la pestaña si tiene algo pendiente (rojo si es urgente)
  const avisoDe = id => {
    const de = visibles.filter(a => a.vista === id)
    return de.some(a => a.tono === 'rojo') ? 'rojo' : de.some(a => a.tono === 'ambar') ? 'ambar' : null
  }

  // ── Inventarios ──
  const maxValor = Math.max(1, ...bodegas.map(b => b.valor))
  const bodP = bodegas.find(b => b.id === bodPareto) || bodegas.find(b => b.pareto.length) || bodegas[0]
  const tiles = mosaico(bodegas.filter(b => b.valor > 0).map((b, i) => ({ ...b, color: TONOS[i] || TONOS[6] })), 0, 0, 100, 100)
  // Filtro de bodega de la rotación (si la bodega guardada ya no tiene existencias, se ven todas)
  const bodRotObj = bodegas.find(b => b.id === bodRot)
  const bodRotSel = bodRotObj ? bodRot : ''
  const bodegasRot = bodRotObj ? [bodRotObj] : bodegas
  const quietosLista = bodRotObj
    ? bodRotObj.quietos.slice(0, 12).map(f => ({ ...f, bodega: '' }))
    : bodegas.flatMap(b => b.quietos.map(f => ({ ...f, bodega: cap(b.nombre) }))).sort((x, y) => y.valor - x.valor).slice(0, 8)
  const rotTot = bodegasRot.reduce((t, b) => ({
    valor: t.valor + b.valor, quieto: t.quieto + b.rot.r60 + b.rot.r90 + b.rot.nunca, n: t.n + b.quietos.length,
    nunca: t.nunca + b.quietos.filter(f => f.dias === null).length,
  }), { valor: 0, quieto: 0, n: 0, nunca: 0 })

  // ── Periodo ──
  const mec = datosP?.mecanizado, fun = datosP?.fundicion, aus = datosP?.ausencias
  const maxSemana = Math.max(1, ...fundicion.semanas)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Encabezado + periodo */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-feisen-texto">{saludo}, {perfil?.nombre?.split(' ')[0]}</h1>
          <p className="text-sm text-feisen-texto-2 mt-0.5">{DIAS[hoy.getDay()]} {hoy.getDate()} de {MESES[hoy.getMonth()]}{esLog ? ' · Logística · Bodega Motores' : esRRHH ? ' · Recursos Humanos' : ' · Elige el módulo en las pestañas'}</p>
        </div>
        {(vista === 'inventarios' || vista === 'logistica') && (
          <button onClick={recargar} title="Actualizar datos" className="p-2 rounded-lg border border-feisen-borde bg-white text-feisen-texto-2 hover:bg-feisen-fondo"><RefreshCw size={15} /></button>
        )}
        {CON_PERIODO.includes(vista) && <div className="flex flex-col items-start sm:items-end gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={recargar} title="Actualizar datos" className="p-2 rounded-lg border border-feisen-borde bg-white text-feisen-texto-2 hover:bg-feisen-fondo"><RefreshCw size={15} /></button>
            <div className="inline-flex border border-feisen-borde rounded-lg overflow-hidden bg-white" role="group" aria-label="Periodo">
              {[['7d', '7 días'], ['15d', '15 días'], ['30d', 'Último mes']].map(([k, t]) => (
                <button key={k} onClick={() => elegirPeriodo(k)} aria-pressed={periodo === k}
                  className={`px-3 py-1.5 text-[13px] ${periodo === k ? 'bg-feisen-azul-suave text-feisen-azul font-semibold' : 'text-feisen-texto-2 hover:bg-feisen-fondo'}`}>{t}</button>
              ))}
            </div>
            <select value={periodo.startsWith('m:') ? periodo : ''} onChange={e => elegirPeriodo(e.target.value)} aria-label="Elegir mes"
              className={`border rounded-lg px-2.5 py-1.5 text-[13px] ${periodo.startsWith('m:') ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-semibold' : 'border-feisen-borde bg-white text-feisen-texto-2'}`}>
              <option value="">Mes…</option>
              {meses.map(m => <option key={m.clave} value={m.clave}>{m.texto}</option>)}
            </select>
            <select value={periodo.startsWith('a:') ? periodo : ''} onChange={e => elegirPeriodo(e.target.value)} aria-label="Elegir año"
              className={`border rounded-lg px-2.5 py-1.5 text-[13px] ${periodo.startsWith('a:') ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-semibold' : 'border-feisen-borde bg-white text-feisen-texto-2'}`}>
              <option value="">Año…</option>
              {anios.map(a => <option key={a} value={`a:${a}`}>{a}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-400">{rango.texto}</p>
        </div>}
      </div>


      {/* Pestañas por módulo */}
      {!esRRHH && <Pestanas vistas={vistas} vista={vista} elegir={elegirVista} avisoDe={avisoDe} />}

      {vista === 'inicio' && <DashboardLogistica sinSaludo />}


      {vista === 'ventas' && <DashboardVentas />}
      {vista === 'of' && <DashboardOF />}

      {informe && <InformeSinRotacion bodegas={bodegas} bodega={bodRotSel} onBodega={setBodRot} onVolver={() => abrirInforme(false)} />}

      {vista === 'inventarios' && !informe && <>
        {/* Inventarios */}
        <section className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-feisen-borde-suave">
            <Warehouse size={16} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-feisen-texto flex-1">Inventarios</h3>
            {inv.agotados > 0 ? <Estado tono="rojo">{fmt(inv.agotados)} agotados</Estado> : <Estado tono="verde">Sin agotados</Estado>}
            <button onClick={() => navigate('/productos')} className="text-sm font-medium text-feisen-azul hover:underline">Ir a Productos y stock →</button>
          </div>
          <div className="grid lg:grid-cols-2">
            {/* Valor */}
            <div className="p-4 border-b border-feisen-borde-suave min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <h4 className="text-[13px] font-semibold">Valor del inventario <Etiqueta /></h4>
                  <p className="text-xs text-gray-400">Productos activos a precio de costo</p>
                </div>
                <div className="inline-flex border border-feisen-borde rounded-md overflow-hidden" role="group" aria-label="Forma de ver el valor por bodega">
                  {[['barras', 'Barras'], ['mosaico', 'Mosaico']].map(([k, t]) => (
                    <button key={k} onClick={() => { setVistaValor(k); guardar('inicio-vista-valor', k) }} aria-pressed={vistaValor === k}
                      className={`px-2.5 py-1 text-xs ${vistaValor === k ? 'bg-feisen-azul-suave text-feisen-azul font-semibold' : 'text-feisen-texto-2'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2.5 mb-3.5">
                <span className="text-3xl font-semibold tabular-nums text-feisen-texto">{millones(inv.valorTotal)}</span>
                <span className="text-[13px] text-feisen-texto-2">en {bodegas.filter(b => b.valor > 0).length} bodegas{bodegas.some(b => b.valor === 0) ? ` · ${bodegas.filter(b => b.valor === 0).map(b => cap(b.nombre)).join(', ')} en $0 (sin costos)` : ''}</span>
              </div>
              {vistaValor === 'barras' ? (
                <div className="space-y-1">
                  {bodegas.map(b => (
                    <div key={b.id} className="grid grid-cols-[96px,1fr,64px,36px] sm:grid-cols-[120px,1fr,72px,40px] gap-2.5 items-center text-[13px]">
                      <span className="text-feisen-texto-2 truncate" title={b.nombre}>{cap(b.nombre)}</span>
                      <span className="h-3 rounded bg-feisen-borde-suave overflow-hidden"><span className="block h-full rounded bg-feisen-azul" style={{ width: `${(b.valor / maxValor) * 100}%` }} /></span>
                      <span className="text-right font-semibold tabular-nums">{millones(b.valor)}</span>
                      <span className="text-right text-xs text-gray-400 tabular-nums">{inv.valorTotal ? fmt((b.valor / inv.valorTotal) * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="relative w-full h-56 rounded-lg overflow-hidden">
                  {tiles.map((t, i) => (
                    <div key={t.id} title={`${cap(t.nombre)} ${millones(t.valor)}`}
                      className="absolute p-2 overflow-hidden border-2 border-white rounded-lg flex flex-col justify-between"
                      style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%`, background: t.color, color: i >= 4 ? '#0B1B33' : '#fff' }}>
                      <span className="text-xs font-semibold leading-tight">{cap(t.nombre)}</span>
                      {t.w * t.h > 420 && <span className="text-[15px] font-semibold tabular-nums">{millones(t.valor)} <span className="text-[11px] opacity-80">· {fmt((t.valor / inv.valorTotal) * 100)}%</span></span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pareto */}
            <div className="p-4 border-b border-feisen-borde-suave lg:border-l min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <h4 className="text-[13px] font-semibold">Pareto por almacén <Etiqueta /></h4>
                  <p className="text-xs text-gray-400">Productos ordenados por valor y % acumulado</p>
                </div>
                <select value={bodP?.id || ''} onChange={e => { setBodPareto(e.target.value); guardar('inicio-pareto', e.target.value) }} aria-label="Bodega del pareto"
                  className="border border-feisen-borde rounded-md px-2 py-1 text-[12.5px] bg-white">
                  {bodegas.filter(b => b.pareto.length).map(b => <option key={b.id} value={b.id}>{cap(b.nombre)}</option>)}
                </select>
              </div>
              {bodP && bodP.pareto.length ? (
                <>
                  <p className="bg-feisen-azul-suave rounded-lg px-3 py-2 text-[13px] mb-2.5">
                    <b className="tabular-nums">{bodP.n80} de {bodP.nConValor} productos</b> ({fmt((bodP.n80 / bodP.nConValor) * 100)}%) concentran el <b>80% del valor</b> de {cap(bodP.nombre)}: {millones(bodP.valor)}.
                  </p>
                  <div className="divide-y divide-feisen-borde-suave">
                    {bodP.pareto.slice(0, 10).map((f, i) => (
                      <div key={f.item_id} className="grid grid-cols-[20px,1fr,72px,44px] gap-2 items-center text-[12.5px] py-1">
                        <span className="text-gray-400 tabular-nums">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="block truncate" title={f.nombre}>
                            <span className={`inline-block text-[10px] font-bold rounded px-1 mr-1 ${f.clase === 'A' ? 'bg-feisen-azul text-white' : 'bg-[#9DB5D6] text-feisen-texto'}`}>{f.clase}</span>{f.nombre}
                          </span>
                          <span className={`block h-1 rounded mt-0.5 ${f.clase === 'A' ? 'bg-feisen-azul' : 'bg-[#9DB5D6]'}`} style={{ width: `${(f.valor / bodP.pareto[0].valor) * 100}%` }} />
                        </span>
                        <span className="text-right font-semibold tabular-nums">{millones(f.valor)}</span>
                        <span className="text-right text-gray-400 tabular-nums">{fmt(f.acum * 100)}%</span>
                      </div>
                    ))}
                  </div>
                  {bodP.nConValor > 10 && <p className="text-xs text-gray-400 mt-2">Top 10 de {bodP.nConValor}. La última columna es el % acumulado del valor.</p>}
                </>
              ) : <p className="text-sm text-feisen-texto-2">Esta bodega no tiene productos con costo.</p>}
            </div>

            {/* Rotación */}
            <div id="rotacion" className="p-4 lg:col-span-2 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <h4 className="text-[13px] font-semibold">Rotación: ¿qué se está moviendo? <Etiqueta /></h4>
                  <p className="text-xs text-gray-400">Valor de cada bodega según el último movimiento de cada producto · filtra por bodega o toca una barra</p>
                </div>
                <select value={bodRotSel} onChange={e => setBodRot(e.target.value)} aria-label="Bodega de la rotación"
                  className={`border rounded-md px-2 py-1 text-[12.5px] ${bodRotSel ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-semibold' : 'border-feisen-borde bg-white'}`}>
                  <option value="">Todas las bodegas</option>
                  {bodegas.map(b => <option key={b.id} value={b.id}>{cap(b.nombre)}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
                <p className="text-[13px] text-feisen-texto-2">
                  {rotTot.n
                    ? <>Sin rotación{bodRotObj ? ` en ${cap(bodRotObj.nombre)}` : ''}: <b className="text-feisen-texto tabular-nums">{fmt(rotTot.n)} productos · {millones(rotTot.quieto)}</b>{rotTot.valor ? ` (${fmt((rotTot.quieto / rotTot.valor) * 100)}% del valor)` : ''}{rotTot.nunca ? <> · <span className="text-feisen-rojo">{fmt(rotTot.nunca)} nunca movidos</span></> : ''}</>
                    : `Todo${bodRotObj ? ` lo de ${cap(bodRotObj.nombre)}` : ''} se movió en los últimos 30 días.`}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-feisen-texto-2">
                  <span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-feisen-azul" />Últimos 30 días</span>
                  <span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-[#9DB5D6]" />31–60 días</span>
                  <span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-amber-500" />Más de 60</span>
                  <span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-feisen-rojo" />Nunca se ha movido</span>
                </div>
              </div>
              <div className="grid lg:grid-cols-2 gap-6">
                <div>
                  {bodegasRot.map(b => {
                    const t = b.valor || 1, quieto = b.rot.r60 + b.rot.r90 + b.rot.nunca
                    return (
                      <button key={b.id} onClick={() => setBodRot(v => v === b.id ? '' : b.id)} aria-pressed={bodRot === b.id}
                        className={`w-full grid grid-cols-[96px,1fr,96px] sm:grid-cols-[120px,1fr,112px] gap-2.5 items-center text-[13px] text-left rounded-md px-1.5 py-1.5 ${bodRot === b.id ? 'bg-feisen-azul-suave' : 'hover:bg-feisen-fondo'}`}>
                        <span className={`truncate ${bodRot === b.id ? 'text-feisen-azul font-semibold' : 'text-feisen-texto-2'}`}>{cap(b.nombre)}</span>
                        <span className="flex h-3 rounded overflow-hidden bg-feisen-borde-suave">
                          <span className="bg-feisen-azul" style={{ width: `${(b.rot.r30 / t) * 100}%` }} />
                          <span className="bg-[#9DB5D6]" style={{ width: `${(b.rot.r60 / t) * 100}%` }} />
                          <span className="bg-amber-500" style={{ width: `${(b.rot.r90 / t) * 100}%` }} />
                          <span className="bg-feisen-rojo" style={{ width: `${(b.rot.nunca / t) * 100}%` }} />
                        </span>
                        <span className="text-right text-xs text-feisen-texto-2 tabular-nums">{b.quietos.length ? `${millones(quieto)} · ${b.quietos.length} prod.` : 'Todo se movió'}</span>
                      </button>
                    )
                  })}
                  <p className="text-xs text-gray-400 mt-2">"Quieto" = sin movimiento en más de 30 días.</p>
                </div>
                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <p className="text-[13px] font-semibold">{bodRotObj ? `Quietos en ${cap(bodRotObj.nombre)} · ${bodRotObj.quietos.length} producto${bodRotObj.quietos.length === 1 ? '' : 's'}` : 'Productos quietos con más valor · todas las bodegas'}</p>
                    {bodRot && <button onClick={() => setBodRot('')} className="text-[13px] font-medium text-feisen-azul hover:underline whitespace-nowrap">Ver todas</button>}
                  </div>
                  {quietosLista.length === 0 ? <p className="text-sm text-feisen-texto-2 py-2">Todo lo de esta bodega se movió en los últimos 30 días.</p> : (
                    <div className="divide-y divide-feisen-borde-suave">
                      {quietosLista.map(f => (
                        <div key={`${f.item_id}-${f.bodega}`} className="grid grid-cols-[1fr,auto,auto] gap-3 items-baseline text-[13px] py-1.5">
                          <span className="min-w-0"><span className="block truncate" title={f.nombre}>{f.nombre}</span>
                            <span className="block text-[11.5px] text-gray-400">{f.bodega ? `${f.bodega} · ` : ''}{fmt(f.q)} {f.unidad}</span></span>
                          <span className={`text-xs whitespace-nowrap ${f.dias === null ? 'text-feisen-rojo' : 'text-amber-700'}`}>{f.dias === null ? 'Nunca se ha movido' : `${f.dias} días quieto`}</span>
                          <span className="text-right font-semibold tabular-nums">{f.valor > 0 ? millones(f.valor) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {rotTot.n > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-feisen-borde-suave">
                      <span className="text-xs text-gray-400">{rotTot.n > quietosLista.length ? `Los ${quietosLista.length} de más valor de ${fmt(rotTot.n)}.` : ''}</span>
                      <button onClick={() => abrirInforme(true)} className="text-sm font-medium text-feisen-azul hover:underline">Ver informe completo →</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

      </>}

      {vista === 'logistica' && (
          <div className="grid lg:grid-cols-2 gap-3.5">
            <Tarjeta icono={Truck} titulo="Logística" enlace="Ir a Pedidos" onIr={() => navigate('/pedidos')}
              estado={logistica.atrasados ? <Estado tono="rojo">{logistica.atrasados} atrasados</Estado> : <Estado tono="verde">Al día</Estado>}>
              <div className="grid grid-cols-3 gap-2.5">
                <Cifra etiqueta="En curso" valor={logistica.enCurso} contexto="pedidos" />
                <Cifra etiqueta="Atrasados" valor={logistica.atrasados} contexto="en tránsito" tono={logistica.atrasados ? 'rojo' : ''} />
                <Cifra etiqueta="Lead time" valor={logistica.leadTime != null ? `${fmt(logistica.leadTime)} d` : '—'} contexto={`últimos 3 meses · ${logistica.leadTimeN} pedidos`} />
              </div>
              {logistica.enCurso > 0 && (
                <div>
                  <p className="text-xs text-feisen-texto-2">Pedidos en curso por estado <Etiqueta /></p>
                  <div className="flex h-2 rounded overflow-hidden bg-feisen-borde-suave mt-1.5">
                    <span className="bg-amber-500" style={{ width: `${(logistica.pendientes / logistica.enCurso) * 100}%` }} />
                    <span className="bg-feisen-azul" style={{ width: `${(logistica.transito / logistica.enCurso) * 100}%` }} />
                    <span className="bg-[#9DB5D6]" style={{ width: `${(logistica.parcial / logistica.enCurso) * 100}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-feisen-texto-2 mt-1.5">
                    <span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-amber-500" />Pendientes {logistica.pendientes}</span>
                    <span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-feisen-azul" />En tránsito {logistica.transito}</span>
                    <span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-[#9DB5D6]" />Recibido parcial {logistica.parcial}</span>
                  </div>
                </div>
              )}
              <div className="divide-y divide-feisen-borde-suave">
                {logistica.porArea.slice(0, 4).map(([a, n]) => (
                  <div key={a} className="flex justify-between text-[13px] py-1"><span className="text-feisen-texto-2">{cap(a)}</span><span className="font-semibold tabular-nums">{n}</span></div>
                ))}
              </div>
            </Tarjeta>

            <IndicadoresLogistica mensual={logistica.mensual} porBodega={logistica.porBodega} />
            {/* Motores para OF (2026-11-24): va aquí y no en el menú, pedido de Angie */}
            <div className="lg:col-span-2"><MotoresOF enInicio /></div>
          </div>
      )}
      {vista === 'produccion' && (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            <Tarjeta icono={Wrench} titulo="Mecanizados" enlace="Ir a Mecanizados" onIr={() => navigate('/mecanizados/registro')}
              estado={mec ? (mec.piezas ? <Estado tono="verde">{fmt(mec.piezas)} piezas</Estado> : <Estado tono="gris">Sin registros</Estado>) : null}>
              {!mec ? <p className="text-sm text-gray-400">Cargando…</p> : (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Cifra etiqueta="Piezas mecanizadas" valor={fmt(mec.piezas)} contexto="en el periodo" />
                    <Cifra etiqueta="Operarios" valor={mec.personas.filter(p => p.nombre !== 'Sin operario').length} contexto="registraron piezas" />
                  </div>
                  <div>
                    <p className="text-xs text-feisen-texto-2 mb-1.5">Piezas por persona <Etiqueta periodo /></p>
                    {mec.personas.length === 0 ? <p className="text-sm text-feisen-texto-2">No hay registros de mecanizado en este periodo.</p>
                      : mec.personas.slice(0, 8).map(p => <BarraPersona key={p.nombre} nombre={p.nombre} valor={p.und} max={mec.personas[0].und} />)}
                    {mec.personas.length > 0 && <p className="text-xs text-gray-400 mt-1.5">Las piezas hechas en pareja cuentan para cada uno.</p>}
                  </div>
                </>
              )}
            </Tarjeta>

            <Tarjeta icono={Flame} titulo="Fundición" enlace="Ir a Fundición" onIr={() => navigate('/fundidas')}
              estado={fundicion.fundidas30 === 0 ? <Estado tono="ambar">Faltan registros</Estado> : fun?.nc ? <Estado tono="ambar">{fmt(fun.nc)} und no conformes</Estado> : <Estado tono="verde">Al día</Estado>}>
              {!fun ? <p className="text-sm text-gray-400">Cargando…</p> : (
                <div className="grid grid-cols-3 gap-2.5">
                  <Cifra etiqueta="Producido" valor={fun.kg >= 1000 ? `${fmt(fun.kg / 1000)} t` : `${fmt(fun.kg)} kg`} contexto={`${fmt(fun.und)} piezas`} />
                  <Cifra etiqueta="No conforme" valor={`${fmt(fun.nc)} und`} contexto={fun.nc ? `${fmt(fun.ncDetalle.ncFund)} NC + ${fmt(fun.ncDetalle.ncMoldeo)} moldeo` : 'sin reportes'} tono={fun.nc ? 'ambar' : ''} />
                  <Cifra etiqueta="% no conforme" valor={fun.und ? `${fmt((fun.nc / fun.und) * 100)} %` : '—'} contexto="de las piezas" />
                </div>
              )}
              <div>
                <div className="flex justify-between text-xs text-feisen-texto-2"><span>Kilos producidos por semana <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-px rounded bg-feisen-borde-suave text-gray-400">8 semanas</span></span><span className="tabular-nums">máx. {fmt(maxSemana)} kg</span></div>
                <svg viewBox="0 0 320 64" preserveAspectRatio="none" className="w-full h-16 mt-1.5" role="img" aria-label="Kilos producidos por semana, últimas 8 semanas">
                  {fundicion.semanas.map((v, i) => {
                    const w = (320 - 6 * 7) / 8, h = Math.max(2, (v / maxSemana) * 60)
                    return <rect key={i} x={i * (w + 6)} y={64 - h} width={w} height={h} rx="3" fill={i === 7 ? '#064794' : '#9DB5D6'}><title>{fmt(v)} kg</title></rect>
                  })}
                </svg>
              </div>
              {fundicion.fundidas30 === 0 && <p className="bg-feisen-fondo rounded-lg px-3 py-2 text-[12.5px] text-feisen-texto-2"><b className="text-feisen-texto">Fundidas sin registrar.</b> Con ellas se sumaría hierro colado y rendimiento del horno.</p>}
            </Tarjeta>

            <Tarjeta icono={ShieldAlert} titulo="Calidad" enlace="Ir a Calidad" onIr={() => navigate('/calidad')}
              estado={calidad.abiertas ? <Estado tono="ambar">{calidad.abiertas} abierta{calidad.abiertas === 1 ? '' : 's'}</Estado> : <Estado tono="verde">Sin abiertas</Estado>}>
              <div className="grid grid-cols-2 gap-2.5">
                <Cifra etiqueta="Abiertas" valor={calidad.abiertas} contexto="no conformidades" tono={calidad.abiertas ? 'ambar' : ''} />
                <Cifra etiqueta="Unidades" valor={fmt(calidad.unidades)} contexto="afectadas" />
              </div>
              <div className="divide-y divide-feisen-borde-suave">
                <div className="flex justify-between text-[13px] py-1"><span className="text-feisen-texto-2">Defecto más frecuente</span><span className="font-semibold">{calidad.defecto || '—'}</span></div>
                <div className="flex justify-between text-[13px] py-1"><span className="text-feisen-texto-2">Área con más casos abiertos</span><span className="font-semibold">{calidad.area ? cap(calidad.area) : '—'}</span></div>
              </div>
            </Tarjeta>

          </div>
      )}
      {vista === 'personas' && (
          <div className="grid lg:grid-cols-2 gap-3.5">
            <Tarjeta icono={HardHat} titulo="Recursos Humanos" enlace="Ir a Recursos Humanos" onIr={() => navigate('/rrhh/empleados')}
              estado={nom && nom.estado !== 'aprobada' ? <Estado tono="ambar">Nómina pendiente</Estado> : <Estado tono="verde">Al día</Estado>}>
              <div className="grid grid-cols-3 gap-2.5">
                <Cifra etiqueta="Activos" valor={rrhh.activos} contexto="colaboradores" />
                <Cifra etiqueta="Ausentes hoy" valor={rrhh.ausentesHoy} contexto="por novedades" tono={rrhh.ausentesHoy ? 'ambar' : ''} />
                <Cifra etiqueta="En prueba" valor={rrhh.enPrueba} contexto="< 60 días" />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-xs text-feisen-texto-2">Días de ausencia por {ausPor === 'area' ? 'área' : 'tipo'} <Etiqueta periodo /></p>
                  <div className="flex border border-feisen-borde rounded-md p-0.5 text-[11.5px]">
                    {[['tipo', 'Tipo'], ['area', 'Área']].map(([k, txt]) => (
                      <button key={k} onClick={() => setAusPor(k)}
                        className={`px-2 py-0.5 rounded ${ausPor === k ? 'bg-feisen-azul-suave text-feisen-azul font-semibold' : 'text-feisen-texto-2 hover:text-feisen-texto'}`}>{txt}</button>
                    ))}
                  </div>
                </div>
                {!aus ? <p className="text-sm text-gray-400">Cargando…</p>
                  : aus.registros === 0
                    ? <p className="bg-feisen-fondo rounded-lg px-3 py-2 text-[12.5px] text-feisen-texto-2">No hay novedades en este periodo. Las incapacidades, permisos y vacaciones que se registren en Recursos Humanos → Novedades aparecerán aquí.</p>
                    : ausPor === 'area'
                      ? aus.porArea.map(([a, d, p]) => <BarraPersona key={a} nombre={`${a} (${p} pers.)`} valor={d} max={aus.porArea[0][1]} sufijo=" d" />)
                      : aus.porTipo.map(([t, d]) => <BarraPersona key={t} nombre={TIPOS_NOVEDAD[t]?.plural || cap(t)} valor={d} max={aus.porTipo[0][1]} sufijo=" d" />)}
                {aus?.top?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-feisen-texto-2 mb-1.5">Top 3 con más novedades <Etiqueta periodo /></p>
                    <ol className="divide-y divide-feisen-borde-suave">
                      {aus.top.map((p, i) => (
                        <li key={p.nombre + i} className="flex items-center gap-2.5 py-1.5 text-[13px]">
                          <span className="w-5 h-5 rounded-full bg-feisen-azul-suave text-feisen-azul text-[11px] font-semibold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block truncate text-feisen-texto">{p.nombre.toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase())}</span>
                            <span className="block text-[11.5px] text-gray-400 truncate">{p.area}</span>
                          </span>
                          <span className="text-right tabular-nums whitespace-nowrap">
                            <strong>{p.novedades}</strong> novedad{p.novedades === 1 ? '' : 'es'}
                            <span className="text-feisen-texto-2"> · {fmt(p.dias)} d</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </Tarjeta>

            {/* Rotación y por qué se va la gente (pedido de Angie, 2026-11-20) */}
            <Tarjeta icono={LogOut} titulo="Rotación de personal" enlace="Ver colaboradores" onIr={() => navigate('/rrhh/empleados')}
              estado={rot.pct ? <Estado tono={rot.pct > 0.05 ? 'ambar' : 'verde'}>{fmt(rot.pct * 100)} %</Estado> : null}>
              <div className="grid grid-cols-3 gap-2.5">
                <Cifra etiqueta="Rotación" valor={rot.pct === null ? '—' : `${fmt(rot.pct * 100)} %`} contexto="retiros ÷ plantilla promedio" tono={rot.pct > 0.05 ? 'ambar' : ''} />
                <Cifra etiqueta="Retiros" valor={rot.retiros} contexto="en el periodo" />
                <Cifra etiqueta="Ingresos" valor={rot.ingresos} contexto="en el periodo" />
              </div>
              <div>
                <p className="text-xs text-feisen-texto-2 mb-1.5">¿Por qué se va la gente? <span className="text-gray-400">· últimos 12 meses ({salidas.total} retiro{salidas.total === 1 ? '' : 's'})</span></p>
                {salidas.total === 0
                  ? <p className="bg-feisen-fondo rounded-lg px-3 py-2 text-[12.5px] text-feisen-texto-2">No hay retiros en los últimos 12 meses.</p>
                  : <>
                      <div>
                        {salidas.porMotivo.map(([m, n]) => <BarraPersona key={m || '_'} nombre={`${motivoRetiroLabel(m)} (${fmt((n / salidas.total) * 100)} %)`} valor={n} max={salidas.porMotivo[0][1]} />)}
                      </div>
                      {salidas.porMotivo.some(([m]) => !m) && <p className="text-xs text-amber-700 mt-1">Hay retiros sin causal: regístrala en la ficha de la persona (Laboral → Estado).</p>}
                    </>}
              </div>
            </Tarjeta>

            {/* Evaluaciones de desempeño: % realizadas del ciclo más reciente */}
            <Tarjeta icono={Target} titulo="Evaluaciones de desempeño" enlace="Ir a Desempeño"
              onIr={() => navigate(evals ? `/rrhh/desempeno/${evals.ciclo.id}` : '/rrhh/desempeno')}
              estado={evals?.pct !== null && evals ? <Estado tono={evals.pct === 1 ? 'verde' : 'ambar'}>{fmt(evals.pct * 100)} % realizadas</Estado> : null}>
              {!evals
                ? <p className="bg-feisen-fondo rounded-lg px-3 py-2 text-[12.5px] text-feisen-texto-2">Aún no hay ciclos de evaluación. Se crean en Recursos Humanos → Desempeño → Nuevo ciclo.</p>
                : <>
                    <div className="grid grid-cols-3 gap-2.5">
                      <Cifra etiqueta="Realizadas" valor={evals.pct === null ? '—' : `${fmt(evals.pct * 100)} %`} contexto={`${evals.completas} de ${evals.total}`} tono={evals.pct < 1 ? 'ambar' : ''} />
                      <Cifra etiqueta="Pendientes" valor={evals.total - evals.completas} contexto="personas" />
                      <Cifra etiqueta="Ciclo" valor={<span className="text-sm">{evals.ciclo.nombre}</span>} contexto={evals.ciclo.estado === 'cerrado' ? 'cerrado' : 'abierto'} />
                    </div>
                    <div>
                      <p className="text-xs text-feisen-texto-2 mb-1.5">% realizadas por evaluador</p>
                      {evals.porEvaluador.map(g => <BarraPersona key={g.evaluador} nombre={`${g.evaluador} (${g.completas}/${g.total})`} valor={(g.completas / g.total) * 100} max={100} sufijo=" %" />)}
                    </div>
                    {evals.pendientes.length > 0 && (
                      <p className="text-[12.5px] text-feisen-texto-2"><span className="font-medium text-feisen-texto">Falta evaluar:</span> {evals.pendientes.slice(0, 12).join(', ')}{evals.pendientes.length > 12 && ` y ${evals.pendientes.length - 12} más`}</p>
                    )}
                  </>}
            </Tarjeta>

          </div>
      )}
    </div>
  )
}
