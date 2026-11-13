import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { EncabezadoPagina, useAviso } from '../shared/ui'
import { ChevronDown, ChevronRight, RefreshCw } from '../shared/iconos'
import { useOdoo, Cargando, ErrorOdoo, pesos, millones, hoyCol } from './comun'
import {
  AUTO, BLOQUES, CENTROS, EMPRESAS, FILAS_COSTO, PRECIO_KG_HIERRO, VENTAS,
  calcularMes, calcularMesHistorico, hayHistorico, leerErpMes, leerOdooMes,
} from './calculoEeff'
import { calcularBalance, esDisponibleFc } from './calculoBalance'

// EEFF consolidados de Feisen y FC, armados paso a paso con el método de Angie (empezó con octubre 2026).
// Estructura = hoja "P&G CONSOLIDADO" de su Excel EEFF 2026. Ver OBSERVACIONES.md (2026-11-11).
//
// Esta pantalla solo pinta: **todo el cálculo está en calculoEeff.js** y lo comparten las dos vistas,
// "Un mes" y "Todo el año". Así no puede pasar que las dos muestren cifras distintas del mismo mes.
// Los criterios, en palabras, están en EEFF-CRITERIOS.md.
//
//  - Un mes: el informe completo, con las casillas que se escriben a mano.
//  - Todo el año: los mismos renglones con un mes por columna y el total del año al final,
//    como la hoja del consolidado de su Excel. Ahí no se escribe nada: solo se mira.
//  - Balance: el balance general a hoy. **No comparte cálculo con las otras dos**: tiene su
//    propio dato (acción `cuentas` de Odoo) y su propia cuenta, en calculoBalance.js.

// Filtro de vista: consolidado o un centro de costo (se recuerda en este equipo)
const CLAVE_VISTA = 'feisen-eeff-vista'
const VISTAS = [
  { valor: 'consolidado', texto: 'Consolidado', titulo: 'consolidado' },
  { valor: 'construequipos', texto: 'Construequipos', titulo: 'Construequipos' },
  { valor: 'hierro', texto: 'Fundición Hierro', titulo: 'Fundición Hierro' },
  { valor: 'aluminio', texto: 'Aluminio', titulo: 'Aluminio' },
]

// Modo de ver: un mes, el año entero o el balance general (también se recuerda en este equipo)
const CLAVE_MODO = 'feisen-eeff-modo'
const MODOS = [
  { valor: 'mes', texto: 'Un mes' },
  { valor: 'ano', texto: 'Todo el año' },
  { valor: 'balance', texto: 'Balance' },
]

// Cómo se ven las cifras de la tabla del año (también se recuerda en este equipo).
// Arranca en pesos: Angie casi nunca mira las cifras en millones.
const CLAVE_FORMATO = 'feisen-eeff-formato'
const FORMATOS = [
  { valor: 'pesos', texto: 'Pesos' },
  { valor: 'millones', texto: 'Millones' },
  { valor: 'pct', texto: '% ventas' },
]

// Pesos apretados, solo para la tabla del año: sin espacio después del $, para que quepan los doce meses
const pesosApretado = n => `$${Math.round(n || 0).toLocaleString('es-CO')}`

// Un renglón como porcentaje de los ingresos netos (análisis vertical), con coma decimal
const porcentaje = (v, base) => (base ? `${((v / base) * 100).toFixed(1).replace('.', ',')} %` : '—')

// Columnas de cada renglón: concepto + Feisen / FC / Total (en celular solo concepto + Total)
const GRID = 'grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,8rem)_4.5rem] gap-3'

// Análisis vertical: cada renglón como % de los ingresos netos de la vista (consolidado o centro),
// igual que la hoja "ANÁLISIS VERTICAL" del Excel de Angie.
const BaseVertical = createContext(0)

// Los EEFF del ERP arrancan en 2026 (antes todo estaba en SIIGO y en el Excel)
const ANIOS = Array.from({ length: Math.max(1, Number(hoyCol().slice(0, 4)) - 2025) }, (_, i) => String(2026 + i))

const MES_CORTO =['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
// Todos los meses que se pueden escoger, del más nuevo al más viejo: desde enero de 2026 hasta el mes
// en curso. Se arma una lista y no un calendario para que escoger el mes sea un clic y se lea el nombre.
const MESES_ELEGIBLES = ANIOS.flatMap(a => Array.from({ length: 12 }, (_, i) => `${a}-${String(i + 1).padStart(2, '0')}`))
  .filter(m => m <= hoyCol().slice(0, 7))
  .reverse()
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreLargo = mes => MES_LARGO[Number(mes.slice(5, 7)) - 1]

// ── Barra de controles ──
// Cada control es un grupo con su etiqueta chiquita al lado. Los grupos se acomodan solos:
// en pantalla ancha van en una sola línea y en celular se van bajando, sin cortar los nombres.

// Caja de un control con su etiqueta
function Grupo({ etiqueta, children }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">{etiqueta}</span>
      {children}
    </div>
  )
}

// Botones en fila para escoger una opción. El escogido queda en azul, como en el resto de la app.
function Pildoras({ opciones, valor, onCambiar }) {
  return (
    <div role="group" className="flex flex-wrap gap-0.5 bg-feisen-fondo border border-feisen-borde rounded-lg p-0.5">
      {opciones.map(o => {
        const activo = valor === o.valor
        return (
          <button key={o.valor} type="button" aria-pressed={activo} onClick={() => onCambiar(o.valor)}
            className={`rounded-md px-2.5 min-h-[40px] sm:min-h-[32px] text-[13px] transition-colors active:scale-[.98]
              ${activo ? 'bg-feisen-azul-suave text-feisen-azul font-semibold' : 'text-feisen-texto-2 font-medium hover:bg-white'}`}>
            {o.texto}
          </button>
        )
      })}
    </div>
  )
}

// Mismo alto y mismo borde que las píldoras, para que la barra se vea pareja
const CAMPO = 'min-h-[42px] sm:min-h-[36px] border border-feisen-borde rounded-lg px-2 bg-white text-[13px] text-feisen-texto focus:outline-none focus:ring-2 focus:ring-feisen-azul-suave'

export default function Eeff() {
  const [mes, setMes] = useState('2026-10')
  const [aviso, avisar] = useAviso()
  const [abierto, setAbierto] = useState(null)
  const [vista, setVista] = useState(() => {
    try { const v = localStorage.getItem(CLAVE_VISTA); return VISTAS.some(o => o.valor === v) ? v : 'consolidado' } catch { return 'consolidado' }
  })
  const [modo, setModo] = useState(() => {
    try { const v = localStorage.getItem(CLAVE_MODO); return MODOS.some(o => o.valor === v) ? v : 'mes' } catch { return 'mes' }
  })
  const [formato, setFormato] = useState(() => {
    try { const v = localStorage.getItem(CLAVE_FORMATO); return FORMATOS.some(o => o.valor === v) ? v : 'pesos' } catch { return 'pesos' }
  })
  const cambiarVista = v => { setVista(v); setAbierto(null); try { localStorage.setItem(CLAVE_VISTA, v) } catch { /* sin almacenamiento */ } }
  const cambiarModo = v => { setModo(v); setAbierto(null); try { localStorage.setItem(CLAVE_MODO, v) } catch { /* sin almacenamiento */ } }
  const cambiarFormato = v => { setFormato(v); try { localStorage.setItem(CLAVE_FORMATO, v) } catch { /* sin almacenamiento */ } }
  const verMes = modo === 'mes'
  const verAno = modo === 'ano'
  const verBalance = modo === 'balance'
  const centroId = vista === 'consolidado' ? null : vista

  // ── Datos del mes que se está mirando ──
  const pideOdoo = verMes && !hayHistorico(mes)
  const { datos, cargando, error, recargar } = useOdoo('pyg', 'ambas', { mes }, pideOdoo)
  const compras = useOdoo('resultado', 'feisen', { mes }, pideOdoo)
  const [erp, setErp] = useState({ cargando: true, hierro: null, nomina: null, error: '' })
  const [manual, setManual] = useState({})
  const cargarErp = useCallback(async () => {
    setErp(e => ({ ...e, cargando: true, error: '' }))
    try {
      const { manual: man, nomina, hierro } = await leerErpMes(mes)
      setManual(man)
      setErp({ cargando: false, error: '', nomina, hierro })
    } catch (e) {
      setErp({ cargando: false, hierro: null, nomina: null, error: e.message || 'No se pudo leer el ERP.' })
    }
  }, [mes])
  // Igual que las consultas de Odoo: solo se pide una vez por mes, no cada vez que se vuelve a esta vista
  const erpPedido = useRef(null)
  useEffect(() => {
    if (!verMes || erpPedido.current === cargarErp) return
    erpPedido.current = cargarErp
    cargarErp()
  }, [cargarErp, verMes])

  // ── Datos del año (se piden mes por mes y se guardan; cambiar de centro no vuelve a pedirlos) ──
  const [anio, setAnio] = useState(() => hoyCol().slice(0, 4))
  const ano = useAno(anio, verAno)

  // ── Datos del balance (solo se piden cuando se abre el modo Balance) ──
  // El `saldo` que devuelve la acción `cuentas` es el acumulado de toda la historia, así que
  // el balance es siempre "a hoy": el año que se le pasa solo le sirve al movimiento del año,
  // que esta vista no usa.
  const bal = useOdoo('cuentas', 'ambas', { mes: hoyCol().slice(0, 4) }, verBalance)

  // El cálculo del mes: la misma función que usa la vista del año
  // Los meses anteriores a octubre salen del Excel de Angie, igual que en la vista del año: si aquí se
  // leyera Odoo, el mismo mes mostraría cifras distintas en cada vista. En Odoo esos meses están
  // incompletos (Feisen venía de SIIGO y contabilidad cargó enero a marzo dentro de marzo).
  const esHistorico = hayHistorico(mes)
  const calc = useMemo(() => esHistorico ? calcularMesHistorico(mes, centroId) : calcularMes({
    pyg: datos, compras: compras.datos, hierro: erp.hierro?.valor, nomina: erp.nomina, manual, centroId,
  }), [esHistorico, mes, datos, compras.datos, erp.hierro, erp.nomina, manual, centroId])

  const {
    centro, ing, val, suma, totalVentas, neto, transfHierro, transfAluminio,
    escrito, valorEmpresa, valorFila, nominaDeLaVista,
    porBloque, ingresoBase, utilidadNeta, UTILIDAD, llenas, parcial,
  } = calc

  // Borrar la casilla devuelve el renglón a lo que trae Odoo; escribir en ella reemplaza ese valor
  async function guardarManual(concepto, empresa, texto) {
    const limpio = String(texto).replace(/[^\d-]/g, '')
    if (limpio === '') {
      const { error: err } = await supabase.from('eeff_manual').delete().eq('mes', mes).eq('concepto', concepto).eq('empresa', empresa)
      if (err) { avisar('No se pudo borrar: ' + err.message); return }
      setManual(m => { const n = { ...m }; delete n[`${concepto}|${empresa}`]; return n })
      avisar('Casilla vacía')
      return
    }
    const valor = Number(limpio) || 0
    const { error: err } = await supabase.from('eeff_manual').upsert({ mes, concepto, empresa, valor, updated_at: new Date().toISOString() })
    if (err) { avisar('No se pudo guardar: ' + err.message); return }
    setManual(m => ({ ...m, [`${concepto}|${empresa}`]: valor }))
    avisar('Guardado')
  }

  const [y, m] = mes.split('-').map(Number)
  const nombreMes = new Date(y, m - 1, 15).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  const Titulo = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)
  const tituloVista = VISTAS.find(v => v.valor === vista)?.titulo || 'consolidado'

  const alternar = id => setAbierto(a => (a === id ? null : id))
  const detalleDe = id => [...ing.feisen[id].detalle.map(d => ({ ...d, emp: 'Feisen' })), ...ing.fc[id].detalle.map(d => ({ ...d, emp: 'FC' }))]
  const filaVenta = (id, sangria) => (
    <Fila key={id} nombre={VENTAS.find(v => v.id === id).nombre} feisen={val('feisen', id)} fc={val('fc', id)} sangria={sangria}
      abierto={abierto === id} onClick={() => alternar(id)} detalle={detalleDe(id)} />
  )
  const filaDevoluciones = (
    <Fila nombre="(−) Devoluciones y descuentos comerciales" feisen={val('feisen', 'devoluciones')} fc={val('fc', 'devoluciones')}
      abierto={abierto === 'dev'} onClick={() => alternar('dev')} detalle={detalleDe('devoluciones')} />
  )
  const notaHierro = erp.cargando ? 'Leyendo salidas de Fundición…' : erp.error ? `Error: ${erp.error}`
    : `${Math.round(erp.hierro.piezas).toLocaleString('es-CO')} piezas · ${Math.round(erp.hierro.kg).toLocaleString('es-CO')} kg × $${PRECIO_KG_HIERRO.toLocaleString('es-CO')}${erp.hierro.sinPeso ? ` · ${erp.hierro.sinPeso} sin peso` : ''}${erp.hierro.excluido
      ? ` · Observación: se descontaron ${pesos(erp.hierro.excluido.valor)} de materia prima de Fundición registrada como salida a otra bodega (${erp.hierro.excluido.documentos.join(', ')}); no es transferencia interna`
      : ''}`
  const casillaAluminio = esHistorico
    ? <Cifra v={transfAluminio} />
    : <CasillaPesos key={`${mes}-${transfAluminio}`} valor={transfAluminio} onGuardar={t => guardarManual('transferencia_aluminio', 'total', t)} />

  // De dónde sale cada renglón, para que se vea en la pantalla
  const notaFila = f => {
    const extra = centro?.id === 'construequipos' && f.id === 'materia_prima' ? 'abajo van las piezas recibidas de Hierro y Aluminio' : ''
    if (f.id === 'mano_obra') return 'Feisen: mano de obra directa con prestaciones (7205xx) · FC: la nómina del ERP más lo que escribas'
    // La columna de FC ya no muestra el desglose abajo, así que la nota explica de dónde sale
    if (f.id === 'nomina_admin') return `Feisen: ${AUTO.feisen.nomina_admin.nota} · FC: nómina de administración del ERP más las quincenas escritas a mano`
    const notas = EMPRESAS.filter(e => AUTO[e.id]?.[f.id]).map(e => [e.nombre, AUTO[e.id][f.id].nota])
    // Si las dos empresas sacan el renglón de lo mismo, no se repite el texto
    const iguales = notas.length === 2 && notas[0][1] === notas[1][1]
    const auto = iguales ? [notas[0][1]] : notas.map(([emp, n]) => `${emp}: ${n}`)
    return [auto.join(' · '), extra].filter(Boolean).join(' · ') || undefined
  }
  // Celda de una empresa: casilla para escribir en la vista de un centro, cifra en Consolidado o si sale de Odoo
  const celda = (f, empresa) => {
    // En un mes que viene del Excel no se escribe nada: esas cifras ya están cerradas
    if (esHistorico) return <Cifra v={valorEmpresa(f.id, empresa)} />
    // Mano de obra de FC: la columna muestra el total (nómina del ERP + lo escrito); se escribe abajo
    if (!centro || AUTO[empresa]?.[f.id] || (empresa === 'fc' && (f.id === 'mano_obra' || f.id === 'nomina_admin'))) return <Cifra v={valorEmpresa(f.id, empresa)} />
    return <CasillaPesos key={`${mes}-${centro.id}-${f.id}-${empresa}-${escrito(centro.id, f.id, empresa)}`}
      valor={escrito(centro.id, f.id, empresa)} onGuardar={t => guardarManual(`${centro.id}:${f.id}`, empresa, t)} />
  }

  // Costos y gastos: cada renglón con su valor de Feisen y el de FC, como en el Excel.
  // En Construequipos, debajo de "Materia prima" van las piezas recibidas de Hierro y Aluminio.
  const pendientes = BLOQUES.map((b, i) => (
    <div key={b.id}>
      <Seccion titulo={b.seccion} nota={i !== 0 ? undefined
        : esHistorico ? 'Este mes viene de tu Excel: las cifras están cerradas y no se escriben aquí.'
        : centro ? 'Escribe el valor del mes en cada empresa: la utilidad de abajo se actualiza sola.'
        : 'Suma de los tres centros. Para escribir o corregir un valor, elige un centro arriba.'} />
      {b.filas.map(f => (
        <div key={f.id}>
          <div className={`${GRID} px-4 py-2 text-sm items-center border-t border-feisen-borde-suave`}>
            <span className="min-w-0">
              <span className="block text-feisen-texto">{f.nombre}</span>
              {notaFila(f) && <span className="block text-xs text-feisen-texto-2">{notaFila(f)}</span>}
            </span>
            <span className="hidden sm:contents">{celda(f, 'feisen')}{celda(f, 'fc')}</span>
            <Cifra v={valorFila(f.id)} fuerte />
            <Pct v={valorFila(f.id)} />
          </div>
          {f.id === 'mano_obra' && !esHistorico && (
            <SoloTotal nombre="De esa, la nómina ya cargada en el ERP (FC)" sangria valor={erp.nomina ? nominaDeLaVista() : null}
              nota={erp.cargando ? 'Leyendo la nómina…' : erp.error ? `Error: ${erp.error}`
                : erp.nomina?.quincenas?.length
                  ? `RRHH › Nómina · ${erp.nomina.quincenas.map(([q, e]) => `${q}.ª quincena${e !== 'cerrada' ? ` (${e})` : ''}`).join(' y ')} · total devengado de producción, sin administración`
                  : 'Todavía no hay nómina cargada de este mes: escribe el valor abajo'} />
          )}
          {f.id === 'mano_obra' && centro && !esHistorico && (
            <SoloTotal nombre="Más las quincenas que falten (FC)" sangria
              nota="Lo que todavía no está en el ERP. Se suma a lo de arriba.">
              <CasillaPesos key={`${mes}-${centro.id}-mano_obra-fc-${escrito(centro.id, 'mano_obra', 'fc')}`}
                valor={escrito(centro.id, 'mano_obra', 'fc')} onGuardar={t => guardarManual(`${centro.id}:mano_obra`, 'fc', t)} />
            </SoloTotal>
          )}
          {/* Los dos sub-renglones de nómina administrativa (lo del ERP y la casilla de las quincenas
              que falten) se quitaron de la vista el 13/11/2026: Angie no los necesita en el informe.
              El valor escrito a mano sigue guardado y sigue sumando en la columna de FC; ahora solo
              se cambia desde la base de datos (eeff_manual, concepto 'todos:nomina_admin'). */}
          {centro?.id === 'construequipos' && f.id === 'materia_prima' && (<>
            <SoloTotal nombre="Transferencia recibida — Fundición Hierro" nota={`del ERP · ${notaHierro}`} valor={erp.hierro ? transfHierro : null} sangria />
            <SoloTotal nombre="Transferencia recibida — Aluminio"
              nota={transfAluminio == null ? 'Sin valor: escríbelo en la vista Aluminio o Consolidado' : 'a mano'} valor={transfAluminio} sangria />
          </>)}
        </div>
      ))}
      <SoloTotal nombre={b.subtotal} valor={porBloque[b.id] || null} total />
      {b.utilidad && <SoloTotal nombre={b.utilidad} nota={parcial ? `con lo que va cargado: ${llenas} de ${FILAS_COSTO.length} renglones` : undefined}
        valor={UTILIDAD[b.utilidad]} total destacado />}
    </div>
  ))

  const cargandoMes = cargando || compras.cargando
  const recargandoAhora = verMes ? cargandoMes : verBalance ? bal.cargando : ano.cargando
  const recargarTodo = () => {
    if (verMes) { recargar(); compras.recargar(); cargarErp() }
    else if (verBalance) bal.recargar()
    else ano.recargar()
  }
  return (
    <div className={`${verAno ? 'max-w-[90rem]' : 'max-w-5xl'} mx-auto space-y-5 pb-24 lg:pb-8`}>
      <EncabezadoPagina modulo="Finanzas" titulo="EEFF"
        subtitulo={verBalance
          ? 'Qué tiene y qué debe la empresa hoy: Feisen y FC, con los saldos que hay en Odoo.'
          : 'Estado de resultados de Feisen y FC juntos, armado paso a paso con tu método.'}>
        <button type="button" onClick={recargarTodo} disabled={recargandoAhora}
          className="flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-60">
          <RefreshCw size={16} className={recargandoAhora ? 'animate-spin' : ''} /> Actualizar
        </button>
      </EncabezadoPagina>

      {/* Una sola barra de controles: qué período, qué centro y cómo se ven las cifras.
          En celular cada grupo se va acomodando solo; el escogido se ve en azul. */}
      <div className="bg-white border border-feisen-borde rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <Grupo etiqueta="Ver">
          <Pildoras opciones={MODOS} valor={modo} onCambiar={cambiarModo} />
        </Grupo>
        {verMes ? (
          <Grupo etiqueta="Mes">
            <select value={mes} onChange={e => setMes(e.target.value)} className={CAMPO}>
              {MESES_ELEGIBLES.map(m => (
                <option key={m} value={m}>
                  {`${nombreLargo(m).charAt(0).toUpperCase()}${nombreLargo(m).slice(1)} de ${m.slice(0, 4)}`}
                </option>
              ))}
            </select>
          </Grupo>
        ) : verAno ? (
          <Grupo etiqueta="Año">
            <select value={anio} onChange={e => setAnio(e.target.value)} className={CAMPO}>
              {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Grupo>
        ) : (
          <Grupo etiqueta="Fecha">
            <span className="text-[13px] text-feisen-texto">A hoy · saldos acumulados</span>
          </Grupo>
        )}
        {/* Un balance no se divide por centro de costo: el filtro no aparece en ese modo */}
        {!verBalance && (
          <Grupo etiqueta="Centro de costo">
            <Pildoras opciones={VISTAS} valor={vista} onCambiar={cambiarVista} />
          </Grupo>
        )}
        {verAno && (
          <Grupo etiqueta="Cifras en">
            <Pildoras opciones={FORMATOS} valor={formato} onCambiar={cambiarFormato} />
          </Grupo>
        )}
        {verMes && esHistorico && (
          <span className="sm:ml-auto text-xs bg-feisen-azul-suave text-feisen-azul rounded-md px-2 py-1 font-medium">
            De tu Excel de EEFF 2026 · desde octubre las cifras salen solas de Odoo
          </span>
        )}
        {verMes && !esHistorico && (
          <span className="sm:ml-auto text-xs bg-amber-50 text-amber-700 rounded-md px-2 py-1 font-medium">
            Vamos por partes · {llenas} de {FILAS_COSTO.length} renglones de costos y gastos con valor
          </span>
        )}
        {verBalance && (
          <span className="sm:ml-auto text-xs bg-feisen-azul-suave text-feisen-azul rounded-md px-2 py-1 font-medium">
            El balance no se divide por centro de costo
          </span>
        )}
        {verAno && ano.cargando && (
          <span className="sm:ml-auto flex items-center gap-2 text-xs font-medium text-feisen-texto-2">
            <RefreshCw size={14} className="animate-spin" />
            Vamos por {nombreLargo(ano.actual)}… {ano.listos} de {ano.lista.length} meses
          </span>
        )}
      </div>

      {verBalance ? (
        bal.cargando && !bal.datos ? <Cargando texto="Trayendo los saldos de las dos contabilidades…" />
        : bal.error ? <ErrorOdoo mensaje={bal.error} onReintentar={bal.recargar} />
        : bal.datos && <VistaBalance datos={bal.datos} cargando={bal.cargando} />
      ) : verAno ? <VistaAno ano={ano} anio={anio} centroId={centroId} tituloVista={tituloVista} formato={formato} /> :
        (cargandoMes && !datos) || (compras.cargando && !compras.datos) ? <Cargando />
        : error || compras.error ? <ErrorOdoo mensaje={error || compras.error} onReintentar={() => { recargar(); compras.recargar() }} /> : datos && (
        <BaseVertical.Provider value={ingresoBase}>
        <div className={`bg-white border border-feisen-borde rounded-xl overflow-hidden ${cargandoMes ? 'opacity-60' : ''}`}>
          <div className="px-4 py-3 border-b border-feisen-borde-suave flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-feisen-texto">P&amp;G {tituloVista} · {Titulo}</span>
            <span className={`text-xs font-semibold rounded-md px-2 py-1 tabular-nums ${utilidadNeta < 0 ? 'bg-feisen-rojo-suave text-feisen-rojo'
              : parcial ? 'bg-amber-50 text-amber-700' : 'bg-feisen-azul-suave text-feisen-azul'}`}>
              Utilidad neta{parcial ? ' parcial' : ''}: {millones(utilidadNeta)}
            </span>
          </div>
          <Encabezado />

          {!centro ? (<>
            {/* Consolidado: ingresos agrupados por centro, con subtotal de cada uno */}
            <Seccion titulo="Ingresos" />
            {CENTROS.map(c => (
              <div key={c.id}>
                <Subtitulo titulo={c.nombre} />
                {c.renglones.map(id => filaVenta(id, true))}
                <Total nombre={`Subtotal ${c.nombre}`} feisen={suma('feisen', c.renglones)} fc={suma('fc', c.renglones)} />
              </div>
            ))}
            <div className="h-2" />
            <Total nombre="Total ventas" feisen={totalVentas('feisen')} fc={totalVentas('fc')} fuerte />
            {filaDevoluciones}
            <Total nombre="Ingresos netos" feisen={neto('feisen')} fc={neto('fc')} fuerte />

            <Seccion titulo="Transferencias internas a Construequipos" nota="Ingreso de Hierro y Aluminio y materia prima de Construequipos: en el consolidado se anulan, no suman a los ingresos netos" />
            <SoloTotal nombre={<>Fundición Hierro <span className="text-xs text-feisen-texto-2">· del ERP</span></>} nota={notaHierro} valor={erp.hierro ? transfHierro : null} sangria />
            <SoloTotal nombre={<>Aluminio <span className="text-xs text-feisen-texto-2">· a mano</span></>}
              nota="Total del mes de tu Excel de control (Aluminio aún no está en el ERP)" sangria>{casillaAluminio}</SoloTotal>
            <SoloTotal nombre="Total transferencias internas" valor={transfHierro + (transfAluminio || 0)} total />
          </>) : centro.id === 'construequipos' ? (<>
            {/* Construequipos: sus ventas, devoluciones e ingresos netos */}
            <Seccion titulo="Ingresos" />
            {centro.renglones.map(id => filaVenta(id))}
            <Total nombre="Total ventas" feisen={suma('feisen', centro.renglones)} fc={suma('fc', centro.renglones)} fuerte />
            {filaDevoluciones}
            <Total nombre="Ingresos netos" feisen={suma('feisen', centro.renglones) - val('feisen', 'devoluciones')}
              fc={suma('fc', centro.renglones) - val('fc', 'devoluciones')} fuerte />
          </>) : (<>
            {/* Fundición Hierro o Aluminio: ventas + transferencia interna (piezas a Construequipos) */}
            <Seccion titulo="Ingresos" />
            {filaVenta(centro.id)}
            <Total nombre="Ingresos netos" feisen={val('feisen', centro.id)} fc={val('fc', centro.id)} fuerte />
            {centro.id === 'hierro'
              ? <SoloTotal nombre="Transferencia interna — ingreso (piezas a Construequipos)" nota={`del ERP · ${notaHierro}`} valor={erp.hierro ? transfHierro : null} />
              : <SoloTotal nombre="Transferencia interna — ingreso (piezas a Construequipos)" nota="a mano · total del mes de tu Excel de control">{casillaAluminio}</SoloTotal>}
            <SoloTotal nombre="Ingresos totales" total
              valor={val('feisen', centro.id) + val('fc', centro.id) + (centro.id === 'hierro' ? transfHierro : (transfAluminio || 0))} />
          </>)}

          {pendientes}

        </div>
        </BaseVertical.Provider>
      )}

      {!verBalance && <p className="text-xs text-feisen-texto-2 leading-relaxed">
        Ventas = cuenta 412000 de cada Odoo por centro; las demás cuentas de ingreso (no operacionales) van dentro de Construequipos.
        Devoluciones = descuentos comerciales (530508) y devoluciones en ventas; hoy todas son de Construequipos. Las notas crédito ya vienen restadas en las ventas.
        Toca un renglón de ingresos para ver de qué cuentas sale.
        La columna "% ventas" es el análisis vertical: cada renglón como porcentaje de los ingresos netos de la vista.
        Los costos y gastos se escriben por centro, en su columna de Feisen o de FC, y Consolidado suma los tres centros.
        Las dos vistas, "Un mes" y "Todo el año", hacen la misma cuenta: en el año los valores se ven pero no se escriben.
        Lo que viene sin centro se reparte entre los centros según lo que vendió cada uno. Enero, febrero y marzo no están en Odoo.
      </p>}
      {aviso}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TODO EL AÑO
// ─────────────────────────────────────────────────────────────────────────────

// Trae el año mes por mes: una tanda de llamadas por mes, en fila, pintando lo que ya llegó.
// Lo que ya se pidió se guarda, así que cambiar el filtro de centro **no vuelve a pedir nada**:
// el reparto por centro se calcula con los mismos datos.
function useAno(anio, activo) {
  const [meses, setMeses] = useState({})       // { '2026-01': { pyg, compras, hierro, nomina, manual } }
  const [estado, setEstado] = useState({ cargando: false, listos: 0, actual: null, error: '' })
  const guardados = useRef({})
  const anioRef = useRef(anio)
  const tanda = useRef(0)

  const lista = useMemo(() => {
    const hasta = hoyCol().slice(0, 4) === anio ? Number(hoyCol().slice(5, 7)) : 12
    return Array.from({ length: hasta }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`)
  }, [anio])

  const cargar = useCallback(async (forzar) => {
    const mio = ++tanda.current
    if (anioRef.current !== anio || forzar) { guardados.current = {}; setMeses({}); anioRef.current = anio }
    // Los meses anteriores a octubre salen del Excel (eeffHistorico.js): no se le piden a Odoo
    const faltan = lista.filter(m => !guardados.current[m] && !hayHistorico(m))
    if (!faltan.length) { setEstado({ cargando: false, listos: lista.length, actual: null, error: '' }); return }
    setEstado({ cargando: true, listos: lista.length - faltan.length, actual: faltan[0], error: '' })
    const fallos = []
    for (const m of faltan) {
      if (tanda.current !== mio) return              // se cambió de año o se pidió actualizar: se abandona esta tanda
      setEstado(e => ({ ...e, actual: m }))
      try {
        const [odoo, erp] = await Promise.all([leerOdooMes(m), leerErpMes(m)])
        guardados.current[m] = { ...odoo, hierro: erp.hierro?.valor, nomina: erp.nomina, manual: erp.manual }
      } catch (e) {
        fallos.push(`${nombreLargo(m)} (${e.message || 'sin detalle'})`)
        guardados.current[m] = { fallo: true, manual: {} }
      }
      if (tanda.current !== mio) return
      setMeses({ ...guardados.current })
      setEstado(e => ({ ...e, listos: e.listos + 1 }))
    }
    setEstado({ cargando: false, listos: lista.length, actual: null, error: fallos.length ? `No se pudo leer ${fallos.join(' · ')}` : '' })
  }, [anio, lista])

  useEffect(() => { if (activo) cargar(false) }, [activo, cargar])
  return { meses, lista, ...estado, recargar: () => cargar(true) }
}

// Los renglones de la tabla del año. Cada uno sabe sacar su valor del cálculo de un mes
// (el mismo `calcularMes` de la vista mensual), así que no hay ninguna cuenta repetida aquí.
function renglonesAno(centroId) {
  const centro = CENTROS.find(c => c.id === centroId) || null
  const filas = [{ tipo: 'seccion', nombre: 'Ingresos' }]
  if (!centro) {
    for (const c of CENTROS) filas.push({ tipo: 'dato', nombre: `Ventas ${c.nombre}`, valor: k => k.suma('feisen', c.renglones) + k.suma('fc', c.renglones) })
    filas.push({ tipo: 'total', nombre: 'Total ventas', valor: k => k.totalVentas('feisen') + k.totalVentas('fc') })
    filas.push({ tipo: 'dato', nombre: '(−) Devoluciones y descuentos comerciales', valor: k => k.val('feisen', 'devoluciones') + k.val('fc', 'devoluciones') })
    filas.push({ tipo: 'total', nombre: 'Ingresos netos', valor: k => k.ingresoBase, fuerte: true })
    filas.push({ tipo: 'dato', nombre: 'Transferencias internas a Construequipos', nota: 'ingreso de las fundiciones y materia prima de Construequipos: en el consolidado se anulan', valor: k => k.transfRecibidas })
  } else if (centro.id === 'construequipos') {
    for (const id of centro.renglones) filas.push({ tipo: 'dato', nombre: VENTAS.find(v => v.id === id).nombre, valor: k => k.val('feisen', id) + k.val('fc', id) })
    filas.push({ tipo: 'total', nombre: 'Total ventas', valor: k => k.suma('feisen', centro.renglones) + k.suma('fc', centro.renglones) })
    filas.push({ tipo: 'dato', nombre: '(−) Devoluciones y descuentos comerciales', valor: k => k.val('feisen', 'devoluciones') + k.val('fc', 'devoluciones') })
    filas.push({ tipo: 'total', nombre: 'Ingresos netos', valor: k => k.ingresoBase, fuerte: true })
  } else {
    filas.push({ tipo: 'dato', nombre: 'Ventas', valor: k => k.val('feisen', centro.id) + k.val('fc', centro.id) })
    filas.push({ tipo: 'dato', nombre: 'Transferencia interna (piezas a Construequipos)', valor: k => centro.id === 'hierro' ? k.transfHierro : (k.transfAluminio || 0) })
    filas.push({ tipo: 'total', nombre: 'Ingresos totales', valor: k => k.ingresoBase, fuerte: true })
  }
  for (const b of BLOQUES) {
    filas.push({ tipo: 'seccion', nombre: b.seccion })
    for (const f of b.filas) filas.push({ tipo: 'dato', nombre: f.nombre, valor: k => k.valorFila(f.id) })
    filas.push({ tipo: 'total', nombre: b.subtotal, valor: k => k.porBloque[b.id] })
    if (b.utilidad) filas.push({ tipo: 'utilidad', nombre: b.utilidad, valor: k => k.UTILIDAD[b.utilidad] })
  }
  return filas
}

function VistaAno({ ano, anio, centroId, tituloVista, formato }) {
  // Un cálculo por mes, con la misma función de la vista mensual. Cambiar de centro rehace solo
  // esta cuenta (es instantánea): no se vuelve a pedir nada a Odoo.
  const porMes = useMemo(() => ano.lista.map(mes => {
    if (hayHistorico(mes)) return { mes, listo: true, fallo: false, historico: true, calc: calcularMesHistorico(mes, centroId) }
    const d = ano.meses[mes]
    return {
      mes,
      listo: !!d && !d.fallo,
      fallo: !!d?.fallo,
      calc: d ? calcularMes({ pyg: d.pyg, compras: d.compras, hierro: d.hierro, nomina: d.nomina, manual: d.manual, centroId }) : null,
    }
  }), [ano.meses, ano.lista, centroId])

  const filas = useMemo(() => renglonesAno(centroId), [centroId])
  const listos = porMes.filter(x => x.listo)
  const totalDe = fila => listos.reduce((s, x) => s + (fila.valor(x.calc) || 0), 0)
  const baseAno = listos.reduce((s, x) => s + x.calc.ingresoBase, 0)
  const utilidadAno = listos.reduce((s, x) => s + x.calc.utilidadNeta, 0)
  const deExcel = listos.filter(x => x.historico)
  // Un mes sin mano de obra no es un mes barato: es un mes al que le falta el dato. La nómina de
  // producción se empezó a cargar en el ERP hace poco y antes de eso no quedó en ninguna parte, así
  // que esos meses muestran una utilidad que no es real. Se marcan igual que los meses sin Odoo.
  const sinManoObra = x => !!x.calc && x.calc.ingresoBase > 0 && !Math.round(x.calc.valorFila('mano_obra'))
  const cojo = x => sinManoObra(x)
  const mesesSinManoObra = listos.filter(sinManoObra)
  const anoParcial = listos.some(cojo)

  const texto = (v, base) => {
    if (formato === 'pct') return porcentaje(v, base)
    if (!v) return '—'
    return formato === 'pesos' ? pesosApretado(v) : millones(v)
  }
  // El análisis vertical de la columna del año: la cifra y debajo su % de los ingresos netos del año.
  // Los meses se quedan solo con la cifra para no saturar la tabla.
  const verticalAno = formato !== 'pct'
  const anchoMes = formato === 'pesos' ? 'min-w-[5.75rem]' : 'min-w-[4.5rem]'

  if (!listos.length && ano.error) return <ErrorOdoo mensaje={ano.error} onReintentar={ano.recargar} />
  if (!listos.length) return <Cargando texto={`Trayendo el año mes por mes · vamos por ${nombreLargo(ano.actual || ano.lista[0])}…`} />

  return (
    <div className="space-y-3">
      {ano.error && <p className="text-xs text-feisen-rojo bg-feisen-rojo-suave rounded-md px-3 py-2">{ano.error}</p>}

      <div className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-feisen-borde-suave flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-feisen-texto">P&amp;G {tituloVista} · año {anio}</span>
          <span className={`text-xs font-semibold rounded-md px-2 py-1 tabular-nums ${utilidadAno < 0 ? 'bg-feisen-rojo-suave text-feisen-rojo' : 'bg-feisen-azul-suave text-feisen-azul'}`}>
            Utilidad neta del año{anoParcial ? ' (incompleta)' : ''}: {millones(utilidadAno)}
          </span>
        </div>

        <p className="px-4 py-2 text-xs text-feisen-texto-2 sm:hidden border-b border-feisen-borde-suave">
          Desliza la tabla a los lados para ver los demás meses. El concepto se queda quieto.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-white text-left align-bottom px-3 py-1.5 min-w-[11rem] sm:min-w-[14rem] border-b border-r border-feisen-borde-suave text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">
                  Concepto
                </th>
                {porMes.map(x => (
                  <th key={x.mes} className={`px-1.5 py-1.5 text-right align-bottom ${anchoMes} border-b border-feisen-borde-suave text-[11px] font-semibold uppercase tracking-wide ${cojo(x) ? 'bg-amber-50 text-amber-700' : 'text-feisen-texto-2'}`}>
                    {MES_CORTO[Number(x.mes.slice(5, 7)) - 1]}
                    {sinManoObra(x) && <span className="block text-[10px] font-medium normal-case">sin mano de obra</span>}
                    {!x.listo && <span className="block text-[10px] font-medium normal-case text-feisen-texto-2">{x.fallo ? 'con error' : 'cargando…'}</span>}
                  </th>
                ))}
                <th className={`px-1.5 py-1.5 text-right align-bottom ${anchoMes} border-b border-l border-feisen-borde-suave bg-feisen-fondo text-[11px] font-semibold uppercase tracking-wide text-feisen-texto`}>
                  Año
                  {verticalAno && <span className="block text-[10px] font-medium normal-case text-feisen-texto-2">y su % de ventas</span>}
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                if (f.tipo === 'seccion') return (
                  <tr key={i}>
                    <th scope="colgroup" className="sticky left-0 z-10 text-left px-3 pt-3.5 pb-1 bg-white border-r border-feisen-borde-suave text-[11px] font-semibold uppercase tracking-wide text-feisen-azul">
                      {f.nombre}
                    </th>
                    <td colSpan={porMes.length + 1} className="bg-white" />
                  </tr>
                )
                const fondo = f.tipo === 'utilidad' ? 'bg-feisen-azul-suave' : f.tipo === 'total' ? 'bg-feisen-fondo' : 'bg-white'
                const letra = f.tipo === 'utilidad' ? 'font-semibold text-feisen-azul' : f.tipo === 'total' ? 'font-semibold text-feisen-texto' : 'text-feisen-texto'
                const total = totalDe(f)
                return (
                  <tr key={i}>
                    <th scope="row" className={`sticky left-0 z-10 text-left px-3 py-1.5 border-t border-r border-feisen-borde-suave font-normal ${fondo}`}>
                      <span className={`block ${letra}`}>{f.nombre}</span>
                      {f.nota && <span className="block text-[11px] text-feisen-texto-2">{f.nota}</span>}
                    </th>
                    {porMes.map(x => (
                      <td key={x.mes} className={`px-1.5 py-1.5 text-right tabular-nums text-xs border-t border-feisen-borde-suave ${letra} ${fondo}`}>
                        {!x.listo ? <span className="text-feisen-texto-2">·</span>
                          : <Numero v={f.valor(x.calc)} texto={texto(f.valor(x.calc), x.calc.ingresoBase)} />}
                      </td>
                    ))}
                    <td className={`px-1.5 py-1.5 text-right tabular-nums text-xs border-t border-l border-feisen-borde-suave font-semibold ${f.tipo === 'utilidad' ? 'bg-feisen-azul-suave text-feisen-azul' : 'bg-feisen-fondo text-feisen-texto'}`}>
                      <Numero v={total} texto={texto(total, baseAno)} />
                      {/* Análisis vertical del acumulado: el mismo % que muestra la vista de un mes */}
                      {verticalAno && !!total && (
                        <span className="block text-[10px] font-medium text-feisen-texto-2">{porcentaje(total, baseAno)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {anoParcial && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-md px-3 py-2 leading-relaxed">
          <strong>La utilidad del año todavía no es real.</strong> Hay meses a los que les falta el costo,
          y un mes sin costo muestra una utilidad que no existe. Mientras falten esos datos, el número del
          año sirve para ver la tendencia, no para reportarlo.
        </p>
      )}
      {!!mesesSinManoObra.length && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2 leading-relaxed">
          {mesesSinManoObra.map(x => nombreLargo(x.mes)).join(', ')} no {mesesSinManoObra.length === 1 ? 'tiene' : 'tienen'} mano
          de obra: la nómina de producción se empezó a cargar en el ERP hace poco y la de FC nunca se registró en Odoo.
          Esos meses se ven más rentables de lo que fueron.
        </p>
      )}
      {!!deExcel.length && (
        <p className="text-xs text-feisen-texto-2 leading-relaxed">
          {nombreLargo(deExcel[0].mes)} a {nombreLargo(deExcel[deExcel.length - 1].mes)} salen de tu Excel de EEFF 2026,
          tal como los llevabas a mano. De octubre en adelante las cifras salen solas de Odoo y del ERP.
        </p>
      )}
      <p className="text-xs text-feisen-texto-2 leading-relaxed">
        Los renglones y los subtotales son los mismos de la vista de un mes, hechos con la misma cuenta.
        {formato === 'pct' ? ' Cada celda es el renglón como porcentaje de los ingresos netos de ese mes (la columna del año, sobre los ingresos del año).'
          : ` En la columna "Año", debajo de cada cifra va el análisis vertical: ese renglón como porcentaje de los ingresos netos del año.${
            formato === 'millones' ? ' Las cifras están en millones; cambia a "Pesos" para ver el valor exacto.' : ''}`}
        {' '}Para escribir o corregir un valor a mano, vuelve a "Un mes".
      </p>
    </div>
  )
}

// Cifra de la tabla del año: en rojo si es negativa
function Numero({ v, texto }) {
  return <span className={v < 0 ? 'text-feisen-rojo' : ''}>{texto}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE GENERAL
//
// Qué tiene y qué debe la empresa hoy. No comparte nada con el estado de resultados:
// el dato viene de la acción `cuentas` de Odoo (saldo acumulado de toda la historia)
// y la cuenta está en calculoBalance.js.
// ─────────────────────────────────────────────────────────────────────────────

// Mismas columnas que el P&G (concepto · Feisen · FC · Total), pero sin la de "% ventas":
// un balance no se lee como porcentaje de las ventas. En celular solo concepto y total.
const GRID_BAL = 'grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,9rem)] gap-3'

// `heredar` deja que el renglón ponga el color (totales en azul o en rojo);
// `ceros` muestra "$ 0" en vez de la raya, que es justo lo que tiene que verse en la comprobación.
function CifraB({ v, fuerte, alerta, tenue, heredar, ceros }) {
  const color = heredar ? '' : alerta ? 'text-amber-700' : v < 0 ? 'text-feisen-rojo' : tenue ? 'text-feisen-texto-2' : 'text-feisen-texto'
  return <span className={`text-right tabular-nums ${fuerte ? 'font-semibold' : ''} ${alerta ? 'font-medium' : ''} ${color}`}>
    {v || ceros ? pesos(v) : '—'}</span>
}

function EncabezadoBal() {
  return (
    <div className="hidden sm:grid grid-cols-[1fr_repeat(3,9rem)] gap-3 px-4 py-2 border-b border-feisen-borde-suave text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">
      <span>Concepto</span><span className="text-right">Feisen</span><span className="text-right">FC</span><span className="text-right">Total</span>
    </div>
  )
}

// Una cuenta del detalle: código, nombre y saldo. En celular, Feisen y FC van debajo del nombre.
function FilaCuenta({ c, alerta }) {
  return (
    <div className={`${GRID_BAL} px-4 py-1 pl-9 text-xs items-center ${alerta ? 'bg-amber-50' : ''}`}>
      <span className="min-w-0">
        <span className="block truncate text-feisen-texto-2"><span className="tabular-nums">{c.codigo}</span> · {c.nombre}</span>
        <span className="block sm:hidden tabular-nums text-[11px] text-feisen-texto-2">
          Feisen {pesos(c.feisen)} · FC {pesos(c.fc)}
        </span>
      </span>
      <span className="hidden sm:contents"><CifraB v={c.feisen} tenue /><CifraB v={c.fc} tenue alerta={alerta} /></span>
      <CifraB v={c.total} />
    </div>
  )
}

// El detalle de un grupo. Propiedad, planta y equipo trae `partes` para que se vea la resta
// (costo menos depreciación acumulada) y no solo el neto.
function DetalleBalance({ grupo, alertaFc }) {
  const marca = c => alertaFc && esDisponibleFc('fc', c.codigo) && !!c.fc
  if (!grupo.detalle.length) {
    return <p className="px-4 pb-2 pl-9 text-xs text-feisen-texto-2">Ninguna de las dos empresas tiene saldo en este grupo.</p>
  }
  const partes = grupo.partes
    ? grupo.partes.map(p => ({ ...p, cuentas: grupo.detalle.filter(c => p.test(c.codigo)) })).filter(p => p.cuentas.length)
    : null
  if (!partes) return <div className="pb-2">{grupo.detalle.map(c => <FilaCuenta key={c.codigo} c={c} alerta={marca(c)} />)}</div>
  return (
    <div className="pb-2">
      {partes.map(p => {
        const feisen = p.cuentas.reduce((s, c) => s + c.feisen, 0)
        const fc = p.cuentas.reduce((s, c) => s + c.fc, 0)
        return (
          <div key={p.id}>
            <div className={`${GRID_BAL} px-4 pt-2 pb-1 pl-9 text-xs items-center font-semibold`}>
              <span className="uppercase tracking-wide text-feisen-texto-2">{p.nombre}</span>
              <span className="hidden sm:contents"><CifraB v={feisen} fuerte /><CifraB v={fc} fuerte /></span>
              <CifraB v={feisen + fc} fuerte />
            </div>
            {p.cuentas.map(c => <FilaCuenta key={c.codigo} c={c} alerta={marca(c)} />)}
          </div>
        )
      })}
    </div>
  )
}

// Un grupo del PUC. Se abre y muestra el detalle cuenta por cuenta, igual que los
// renglones de ventas de la vista de un mes.
function FilaBalance({ grupo, abierto, onClick, alertaFc }) {
  const Icono = abierto ? ChevronDown : ChevronRight
  const codigos = grupo.prefijos?.length ? grupo.prefijos.join(' y ') : ''
  return (
    <div className="border-t border-feisen-borde-suave">
      <button type="button" onClick={onClick}
        className={`w-full ${GRID_BAL} px-4 py-2 text-sm items-center text-left hover:bg-feisen-fondo`}>
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-feisen-texto">
            <Icono size={14} className="text-gray-400 shrink-0" />
            <span className="truncate">{codigos && <span className="tabular-nums text-feisen-texto-2">{codigos} </span>}{grupo.nombre}</span>
          </span>
          {alertaFc ? <span className="block pl-5 text-xs text-amber-700">{alertaFc}</span>
            : grupo.nota && <span className="block pl-5 text-xs text-feisen-texto-2">{grupo.nota}</span>}
        </span>
        <span className="hidden sm:contents"><CifraB v={grupo.feisen} /><CifraB v={grupo.fc} alerta={!!alertaFc} /></span>
        <CifraB v={grupo.total} fuerte />
      </button>
      {abierto && <DetalleBalance grupo={grupo} alertaFc={!!alertaFc} />}
    </div>
  )
}

function TotalBalance({ nombre, nota, cifras, destacado, alerta, ceros }) {
  const pintado = destacado || alerta
  const fondo = alerta ? 'bg-feisen-rojo-suave border-y border-feisen-borde text-feisen-rojo'
    : destacado ? 'bg-feisen-azul-suave border-y border-feisen-borde text-feisen-azul'
    : 'bg-feisen-fondo border-y border-feisen-borde-suave text-feisen-texto'
  const c = { fuerte: true, heredar: pintado, ceros }
  return (
    <div className={`${GRID_BAL} px-4 py-2.5 text-sm font-semibold items-center ${fondo}`}>
      <span className="min-w-0">
        <span className="block">{nombre}</span>
        {nota && <span className="block text-xs font-normal opacity-80">{nota}</span>}
      </span>
      <span className="hidden sm:contents"><CifraB v={cifras.feisen} {...c} /><CifraB v={cifras.fc} {...c} /></span>
      <CifraB v={cifras.total} {...c} />
    </div>
  )
}

function VistaBalance({ datos, cargando }) {
  const [abierto, setAbierto] = useState(null)
  const b = useMemo(() => calcularBalance(datos), [datos])
  const alternar = id => setAbierto(a => (a === id ? null : id))

  const activo = b.secciones.find(s => s.id === 'activo')
  const descuadre = !b.comprobacion.cuadra
  // El aviso del banco de FC se arma con la cifra que hay hoy, no con una cifra escrita aquí
  const pesoBancoFc = activo.fc ? Math.round((b.disponibleFc / activo.fc) * 100) : 0

  return (
    <div className="space-y-3">
      {/* Lo que hay que saber antes de leer las cifras va arriba, no al pie */}
      {(b.disponibleFc > 0 || !!b.transitorias.fc || !b.patrimonioRegistrado.fc || descuadre) &&
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2 text-xs text-amber-800 leading-relaxed">
        <p className="text-sm font-semibold text-amber-900">Antes de leer estas cifras</p>
        {b.disponibleFc > 0 && (
          <p>
            <strong>El “banco” de FC dice {pesos(b.disponibleFc)} y no es plata real.</strong> Es la cuenta donde caen
            los movimientos que todavía no se concilian, y hoy son el {pesoBancoFc} % de los activos de FC. Por eso los
            bancos de FC están excluidos de la pantalla de Flujo de caja. Aquí sí aparecen, porque si no el balance no
            cuadraría, pero van marcados en ámbar.
          </p>
        )}
        {!!b.transitorias.fc && (
          <p>
            <strong>FC tiene {pesos(b.transitorias.fc)} en “Movimientos transitorios”:</strong> plata ya contabilizada
            que todavía no tiene cuenta definitiva. Va en su propio bloque, al final.
          </p>
        )}
        {!b.patrimonioRegistrado.fc && (
          <p>
            <strong>FC no tiene patrimonio registrado</strong> ni cierre de años anteriores, así que su “resultado del
            periodo” ({pesos(b.resultado.fc)}) es de varios años acumulados, no de 2026. El de Feisen
            ({pesos(b.resultado.feisen)}) sí es solo de 2026, porque su contabilidad en Odoo empieza en marzo.
          </p>
        )}
        {!descuadre && (
          <p>
            <strong>Las dos contabilidades cuadran:</strong> la suma de todas sus cuentas da cero. El problema no es un
            descuadre sino <strong>dónde está ubicada la plata</strong>.
          </p>
        )}
      </div>}

      <div className={`bg-white border border-feisen-borde rounded-xl overflow-hidden ${cargando ? 'opacity-60' : ''}`}>
        <div className="px-4 py-3 border-b border-feisen-borde-suave flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-feisen-texto">Balance general · Feisen y FC · a hoy</span>
          <span className={`text-xs font-semibold rounded-md px-2 py-1 tabular-nums ${descuadre
            ? 'bg-feisen-rojo-suave text-feisen-rojo' : 'bg-feisen-azul-suave text-feisen-azul'}`}>
            {descuadre ? `Descuadre de ${pesos(b.comprobacion.total)}` : `Total activo: ${millones(activo.total)}`}
          </span>
        </div>
        <EncabezadoBal />

        {b.secciones.map(sec => (
          <div key={sec.id}>
            <Seccion titulo={sec.titulo} nota={sec.id === 'pasivo' ? 'el pasivo y el patrimonio vienen en negativo de Odoo: aquí se muestran en positivo'
              : sec.id === 'patrimonio' ? 'incluye el resultado del periodo, que es lo que lleva ganado la empresa y todavía no está cerrado en una cuenta de patrimonio'
              : undefined} />
            {sec.grupos.map(g => (
              <FilaBalance key={g.id} grupo={g} abierto={abierto === `${sec.id}-${g.id}`} onClick={() => alternar(`${sec.id}-${g.id}`)}
                alertaFc={sec.id === 'activo' && g.id === '11' && b.disponibleFc > 0
                  ? `El disponible de FC (${pesos(b.disponibleFc)}) son movimientos sin conciliar, no plata en el banco`
                  : null} />
            ))}
            <TotalBalance nombre={sec.tituloTotal} cifras={sec} destacado={sec.id === 'activo'} />
          </div>
        ))}

        <Seccion titulo="Cuentas transitorias"
          nota="Plata ya contabilizada que todavía no tiene cuenta definitiva (cuentas del grupo 9). No es ni activo ni pasivo: queda en el aire hasta que contabilidad la clasifique. Se muestra con el signo que trae Odoo: en positivo se comporta como un activo, en negativo como un pasivo." />
        <FilaBalance grupo={b.transitorias} abierto={abierto === 'transitorias'} onClick={() => alternar('transitorias')} />
        <TotalBalance nombre="Total cuentas transitorias" cifras={b.transitorias} />

        <Seccion titulo="Comprobación" />
        <TotalBalance nombre="Activo + transitorias − pasivo − patrimonio" alerta={descuadre} ceros
          nota={descuadre
            ? 'Esto debería dar $0. Si no da, hay cuentas que no se están leyendo o algo cambió en el plan de cuentas de Odoo.'
            : 'Es lo mismo que sumar el saldo de todas las cuentas de la empresa: da $0, o sea que la contabilidad cuadra.'}
          cifras={b.comprobacion} />
      </div>

      <p className="text-xs text-feisen-texto-2 leading-relaxed">
        El balance sale de los saldos de Odoo de las dos empresas ({b.cuentas.toLocaleString('es-CO')} cuentas en total),
        acumulados desde que arrancó cada contabilidad: por eso es “a hoy” y no de un mes.
        Toca un grupo para ver el detalle cuenta por cuenta.
        En Odoo el pasivo, el patrimonio y los ingresos vienen en negativo; aquí <strong>se les volteó el signo</strong> para
        que se lean en positivo, así que un número en rojo en esas secciones es un saldo al revés de lo normal.
        Propiedad, planta y equipo se muestra <strong>neta</strong>: el costo menos la depreciación acumulada (las cuentas 159xxx,
        que vienen en negativo); ábrelo para ver la resta.
        <strong> El balance no se divide entre corriente y no corriente</strong>, como sí lo hacía tu Excel: Odoo no trae esa
        división y deducirla por el código de la cuenta sería adivinar.
        Un balance tampoco se divide por centro de costo, por eso ese filtro no aparece en este modo.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Piezas de la vista de un mes
// ─────────────────────────────────────────────────────────────────────────────

function Encabezado() {
  return (
    <div className="hidden sm:grid grid-cols-[1fr_repeat(3,8rem)_4.5rem] gap-3 px-4 py-2 border-b border-feisen-borde-suave text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">
      <span>Concepto</span><span className="text-right">Feisen</span><span className="text-right">FC</span><span className="text-right">Total</span><span className="text-right">% ventas</span>
    </div>
  )
}

function Seccion({ titulo, nota }) {
  return (
    <div className="px-4 pt-4 pb-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-feisen-azul">{titulo}</span>
      {nota && <span className="block text-xs text-feisen-texto-2">{nota}</span>}
    </div>
  )
}

// Celda del análisis vertical
function Pct({ v }) {
  const base = useContext(BaseVertical)
  return <span className="hidden sm:block text-right tabular-nums text-xs text-feisen-texto-2">
    {base && v ? porcentaje(v, base) : ''}</span>
}

function Cifra({ v, fuerte }) {
  return <span className={`text-right tabular-nums ${fuerte ? 'font-semibold' : ''} ${v < 0 ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{v ? pesos(v) : '—'}</span>
}

// Nombre del centro dentro de la sección (vista consolidada)
function Subtitulo({ titulo }) {
  return <div className="px-4 pt-3 pb-1 border-t border-feisen-borde-suave text-sm font-semibold text-feisen-texto">{titulo}</div>
}

function Fila({ nombre, feisen, fc, detalle, abierto, onClick, sangria }) {
  const Icono = abierto ? ChevronDown : ChevronRight
  return (
    <div className="border-t border-feisen-borde-suave">
      <button type="button" onClick={onClick}
        className={`w-full ${GRID} px-4 py-2 text-sm items-center text-left hover:bg-feisen-fondo`}>
        <span className={`flex items-center gap-1 text-feisen-texto min-w-0 ${sangria ? 'pl-3' : ''}`}>
          <Icono size={14} className="text-gray-400 shrink-0" /><span className="truncate">{nombre}</span>
        </span>
        <span className="hidden sm:contents"><Cifra v={feisen} /><Cifra v={fc} /></span>
        <Cifra v={feisen + fc} fuerte />
        <Pct v={feisen + fc} />
      </button>
      {abierto && (
        <div className={`px-4 pb-2 space-y-1 ${sangria ? 'pl-11' : 'pl-8'}`}>
          {detalle.length === 0 ? <p className="text-xs text-feisen-texto-2">Sin movimiento en el mes.</p>
            : detalle.map((d, i) => (
              <div key={i} className="flex justify-between gap-3 text-xs text-feisen-texto-2">
                <span className="truncate">{d.emp} · {d.codigo} {d.cuenta} · {d.centro}</span>
                <span className="tabular-nums shrink-0">{pesos(d.valor)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function Total({ nombre, feisen, fc, fuerte }) {
  return (
    <div className={`${GRID} px-4 py-2.5 bg-feisen-fondo border-y border-feisen-borde-suave text-sm ${fuerte ? 'font-semibold' : 'font-medium'}`}>
      <span className="text-feisen-texto">{nombre}</span>
      <span className="hidden sm:contents"><Cifra v={feisen} fuerte={fuerte} /><Cifra v={fc} fuerte={fuerte} /></span>
      <Cifra v={feisen + fc} fuerte />
      <Pct v={feisen + fc} />
    </div>
  )
}

// Renglón que solo tiene valor en la columna Total (transferencias, costos y gastos).
// `children` reemplaza la cifra (casilla a mano); `destacado` es para las utilidades.
function SoloTotal({ nombre, nota, valor, sangria, total, destacado, children }) {
  return (
    <div className={`${GRID} px-4 text-sm items-center ${destacado ? 'py-3 bg-feisen-azul-suave border-y border-feisen-borde font-semibold'
      : total ? 'py-2.5 bg-feisen-fondo border-y border-feisen-borde-suave font-semibold' : 'py-2 border-t border-feisen-borde-suave'}`}>
      <span className={`min-w-0 ${sangria ? 'pl-3' : ''}`}>
        <span className={`block ${destacado ? 'text-feisen-azul' : 'text-feisen-texto'}`}>{nombre}</span>
        {nota && <span className="block text-xs font-normal text-feisen-texto-2">{nota}</span>}
      </span>
      <span className="hidden sm:block" /><span className="hidden sm:block" />
      {children || <span className={`text-right tabular-nums ${valor < 0 ? 'text-feisen-rojo' : destacado ? 'text-feisen-azul' : 'text-feisen-texto'}`}>
        {valor != null ? pesos(valor) : '—'}</span>}
      <Pct v={valor || 0} />
    </div>
  )
}

// Casilla de pesos que guarda al salir del campo o con Enter
function CasillaPesos({ valor, auto, onGuardar }) {
  const [texto, setTexto] = useState(valor != null ? Math.round(valor).toLocaleString('es-CO') : '')
  const guardar = () => {
    const limpio = texto.replace(/[^\d-]/g, '')
    if (limpio === String(Math.round(valor ?? NaN))) return
    if (limpio === '' && valor == null) return
    onGuardar(limpio)
  }
  return (
    <input inputMode="numeric" value={texto} placeholder={auto ? `$ ${Math.round(auto).toLocaleString('es-CO')}` : '$ escribe el valor'}
      onChange={e => setTexto(e.target.value)} onBlur={guardar} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      onFocus={e => e.target.select()}
      className="w-full sm:w-32 justify-self-end text-right tabular-nums min-h-[36px] border border-feisen-borde rounded-lg px-2 bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul-suave" />
  )
}
