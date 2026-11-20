import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import { Segmentado } from '../shared/ui'
import { Flame, ShieldAlert, AlertTriangle, RefreshCw } from '../shared/iconos'
import DashboardLogistica from '../logistica/Dashboard'
import { cargarDatosFundicion, resumenFundicion } from './indicadoresFundicion'

// Inicio del jefe de Fundición (Julián Acuña), pedido de Angie para los KPIs 2027
// (2026-11-20): merma de hierro y piezas no conformes con su motivo, del mes y del año.
// Debajo sigue su inicio de siempre (entradas, salidas y sus movimientos recientes).
// El cálculo es el mismo de Analítica de Fundición (indicadoresFundicion.js).

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fmt = (n, dec = 0) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: dec })
const pct = n => `${Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

function Tarjeta({ icono: Icono, titulo, children }) {
  return (
    <section className="bg-white border border-feisen-borde rounded-xl min-w-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-feisen-borde-suave">
        <Icono size={18} weight="duotone" className="text-feisen-azul" />
        <h2 className="text-sm font-semibold text-feisen-texto">{titulo}</h2>
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  )
}

// Cifra del mes en grande y la del año al lado
function Par({ etiqueta, mes, anio, detalleMes, detalleAnio, nombreMes, nombreAnio }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{etiqueta}</p>
      <div className="grid grid-cols-2 gap-3 mt-1">
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums text-feisen-texto">{mes}</p>
          <p className="text-xs text-feisen-texto-2">{nombreMes}{detalleMes ? ` · ${detalleMes}` : ''}</p>
        </div>
        <div className="min-w-0 border-l border-feisen-borde-suave pl-3">
          <p className="text-2xl font-semibold tabular-nums text-feisen-texto-2">{anio}</p>
          <p className="text-xs text-feisen-texto-2">{nombreAnio}{detalleAnio ? ` · ${detalleAnio}` : ''}</p>
        </div>
      </div>
    </div>
  )
}

function Barras({ filas, vacio }) {
  if (!filas.length) return <p className="text-sm text-feisen-texto-2">{vacio}</p>
  const max = Math.max(...filas.map(f => f.piezas), 1)
  return (
    <ul className="space-y-1.5">
      {filas.map(f => (
        <li key={f.motivo} className="grid grid-cols-[minmax(0,10rem),1fr,3.5rem] gap-2 items-center text-[13px]">
          <span className={`truncate ${f.motivo === 'Sin motivo' ? 'text-amber-700' : 'text-feisen-texto-2'}`} title={f.motivo}>{f.motivo}</span>
          <span className="h-2.5 rounded bg-feisen-borde-suave overflow-hidden"><span className="block h-full rounded bg-feisen-azul" style={{ width: `${(f.piezas / max) * 100}%` }} /></span>
          <span className="text-right font-semibold tabular-nums">{fmt(f.piezas)}</span>
        </li>
      ))}
    </ul>
  )
}

export default function InicioFundicion() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const hoy = hoyBogota()
  const anio = hoy.slice(0, 4), mes = hoy.slice(0, 7)
  const nombreMes = MESES[Number(hoy.slice(5, 7)) - 1]
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [vistaMotivos, setVistaMotivos] = useState('mes')

  async function cargar() {
    setError(null); setDatos(null)
    try { setDatos(await cargarDatosFundicion(`${anio}-01-01`)) }
    catch (e) { setError(e.message || 'No se pudieron cargar los indicadores.') }
  }
  useEffect(() => { cargar() }, [])

  const r = useMemo(() => {
    if (!datos) return null
    const delMes = datos.ordenes.filter(o => String(o.fecha).slice(0, 7) === mes)
    const ncMes = datos.ncsCalidad.filter(n => String(n.fecha_deteccion).slice(0, 7) === mes)
    return {
      mes: resumenFundicion(delMes, datos.movsHierro, datos.movsVaceadero, ncMes),
      anio: resumenFundicion(datos.ordenes, datos.movsHierro, datos.movsVaceadero, datos.ncsCalidad),
    }
  }, [datos])

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const sel = r?.[vistaMotivos]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-feisen-texto">{saludo}, {perfil?.nombre?.split(' ')[0]}</h1>
          <p className="text-sm text-feisen-texto-2 mt-0.5">Fundición · indicadores de {nombreMes} y del año {anio}</p>
        </div>
        <button type="button" onClick={cargar} className="inline-flex items-center gap-1.5 text-sm text-feisen-azul min-h-[40px] px-2">
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-feisen-rojo-suave text-feisen-rojo rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={cargar} className="font-medium underline">Reintentar</button>
        </div>
      )}
      {!r && !error && <Spinner texto="Calculando indicadores..." />}

      {r && (
        <>
          {r.anio.ordenes === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>Este año no hay órdenes de moldeo con recogida registrada. La merma y las piezas no conformes salen de la <b>recogida de cada orden de moldeo</b>: sin ese registro las cifras quedan en cero.</span>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Tarjeta icono={Flame} titulo="Merma de hierro">
              <div className="space-y-4">
                <Par etiqueta="Merma" nombreMes={cap(nombreMes)} nombreAnio={`Año ${anio}`}
                  mes={r.mes.merma.totalHierro ? pct(r.mes.merma.pctMerma) : '—'}
                  anio={r.anio.merma.totalHierro ? pct(r.anio.merma.pctMerma) : '—'}
                  detalleMes={`${fmt(r.mes.merma.totalMerma)} kg`} detalleAnio={`${fmt(r.anio.merma.totalMerma)} kg`} />
                <Par etiqueta="Hierro colado" nombreMes={`${r.mes.ordenes} ${r.mes.ordenes === 1 ? 'orden' : 'órdenes'}`} nombreAnio={`${r.anio.ordenes} ${r.anio.ordenes === 1 ? 'orden' : 'órdenes'}`}
                  mes={`${fmt(r.mes.merma.totalHierro)} kg`} anio={`${fmt(r.anio.merma.totalHierro)} kg`} />
                <p className="text-xs text-feisen-texto-2">Merma = hierro colado − kg de piezas buenas − vaceadero, sobre el hierro colado de las órdenes recogidas.</p>
              </div>
            </Tarjeta>

            <Tarjeta icono={ShieldAlert} titulo="Piezas no conformes">
              <div className="space-y-4">
                <Par etiqueta="No conformes en la recogida" nombreMes={cap(nombreMes)} nombreAnio={`Año ${anio}`}
                  mes={fmt(r.mes.nc)} anio={fmt(r.anio.nc)}
                  detalleMes={r.mes.conformes + r.mes.nc ? `${pct(r.mes.pctNC)} de lo recogido` : null}
                  detalleAnio={r.anio.conformes + r.anio.nc ? `${pct(r.anio.pctNC)} de lo recogido` : null} />
                <Par etiqueta="Piezas buenas" nombreMes={cap(nombreMes)} nombreAnio={`Año ${anio}`}
                  mes={fmt(r.mes.conformes)} anio={fmt(r.anio.conformes)} />
              </div>
            </Tarjeta>
          </div>

          <Tarjeta icono={ShieldAlert} titulo="Motivos de las piezas no conformes">
            <div className="space-y-4">
              <div className="max-w-xs">
                <Segmentado valor={vistaMotivos} onCambiar={setVistaMotivos}
                  opciones={[{ valor: 'mes', texto: cap(nombreMes) }, { valor: 'anio', texto: `Año ${anio}` }]} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">En la recogida · {fmt(sel.nc)} piezas</p>
                <Barras filas={sel.motivos} vacio="No hay piezas no conformes en la recogida de este periodo." />
              </div>
              <div className="border-t border-feisen-borde-suave pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  Detectadas después, en Calidad · {fmt(sel.ncCalidad)} piezas en {sel.registrosCalidad} {sel.registrosCalidad === 1 ? 'registro' : 'registros'}
                </p>
                <Barras filas={sel.calidad} vacio="No hay no conformidades de Fundición registradas en Calidad en este periodo." />
                <p className="text-xs text-feisen-texto-2 mt-2">Se muestran aparte y no se suman a las de la recogida, para no contar la misma pieza dos veces.</p>
              </div>
            </div>
          </Tarjeta>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/recogida')} className="min-h-[44px] px-4 rounded-lg bg-feisen-azul text-white text-sm font-semibold">Registrar recogida</button>
            <button type="button" onClick={() => navigate('/analitica/fundicion')} className="min-h-[44px] px-4 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto">Ver analítica completa</button>
            <button type="button" onClick={() => navigate('/calidad')} className="min-h-[44px] px-4 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto">Ir a Calidad</button>
          </div>
        </>
      )}

      <DashboardLogistica sinSaludo />
    </div>
  )
}

function cap(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1) }
