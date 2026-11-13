// Impuestos (solo Odoo Feisen). Responde en vivo: ¿tengo renta por pagar o saldo a favor?,
// ¿cuánto inventario puedo pasar al costo? y ¿cuánto más tengo que vender?
// Los datos salen de la función de Supabase `finanzas-tributario` (solo lectura, solo ADMIN).
// Es una estimación para conversar con el revisor fiscal, NO una declaración de renta.
// Ver OBSERVACIONES.md (2026-11-13).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EncabezadoPagina } from '../shared/ui'
import { supabase } from '../../lib/supabase'
import { Scale, Boxes, TrendingUp, Receipt, Percent, Info, RefreshCw, Invoice } from '../shared/iconos'
import { Kpi, Cargando, ErrorOdoo, pesos, millones } from './comun'

const TARIFA_POR_DEFECTO = 35
const CLAVE_TARIFA = 'feisen-impuestos-tarifa'
const CLAVE_AJUSTE = 'feisen-impuestos-ajuste'

// Odoo Feisen no tiene asientos con fecha de enero ni de febrero de 2026: contabilidad cargó esos dos
// meses **dentro de marzo** al pasar de SIIGO a Odoo. Por eso marzo se ve tres veces más grande que los
// demás meses ($1.235 M de ingresos contra unos $500 M) y por eso el año **sí está completo**:
// no hay que sumarle nada por enero y febrero, se contarían dos veces. Comprobado el 13/11/2026
// pidiéndole a Odoo el estado de resultados de enero y de febrero: cero líneas en los dos.
const PRIMER_MES_ODOO = '2026-03'

// Las mismas cuentas que agrupa la función, para poder repartir el IVA por bimestres
const IVA = {
  generado: c => c === '240800' || c === '240801',
  devoluciones: c => c === '240802',
  descontable: c => ['240804', '240806', '240810', '240813'].includes(c),
  liquidado: c => c === '240814',
}
const BIMESTRES = [
  { texto: 'Ene–Feb', meses: ['01', '02'] },
  { texto: 'Mar–Abr', meses: ['03', '04'] },
  { texto: 'May–Jun', meses: ['05', '06'] },
  { texto: 'Jul–Ago', meses: ['07', '08'] },
  { texto: 'Sep–Oct', meses: ['09', '10'] },
  { texto: 'Nov–Dic', meses: ['11', '12'] },
]

const CERTIFICADOS = ['135501', '135503', '135504', '135508']
const AUTORRETENCIONES = ['135509', '135510']
const POR_PAGAR = c => /^(2365|2367|2368)/.test(c) || c === '241200'

const soloDigitos = s => String(s).replace(/[^\d]/g, '')
const conPuntos = s => { const d = soloDigitos(s); return d ? Number(d).toLocaleString('es-CO') : '' }
const leer = (clave, pordefecto) => { try { return localStorage.getItem(clave) ?? pordefecto } catch { return pordefecto } }
const guardar = (clave, v) => { try { localStorage.setItem(clave, v) } catch { /* sin almacenamiento */ } }

// Llama a finanzas-tributario (una sola empresa: Feisen)
function useTributario(anio) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: '' })
  const cargar = useCallback(async () => {
    setEstado(e => ({ ...e, cargando: true, error: '' }))
    try {
      const { data, error } = await supabase.functions.invoke('finanzas-tributario', { body: { anio } })
      if (error) {
        let msg = error.message
        try { msg = (await error.context.json()).error || msg } catch { /* sin cuerpo */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      setEstado({ datos: data, cargando: false, error: '' })
    } catch (e) {
      setEstado({ datos: null, cargando: false, error: e.message || 'No se pudo consultar Odoo.' })
    }
  }, [anio])
  const pedido = useRef(null)
  useEffect(() => {
    if (pedido.current === cargar) return
    pedido.current = cargar
    cargar()
  }, [cargar])
  return { ...estado, recargar: cargar }
}

function Bloque({ titulo, descripcion, children, derecha }) {
  return (
    <section className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-feisen-borde-suave flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-feisen-texto">{titulo}</h2>
          {descripcion && <p className="text-xs text-feisen-texto-2 mt-0.5">{descripcion}</p>}
        </div>
        {derecha}
      </div>
      {children}
    </section>
  )
}

// Renglón de cuenta: código y nombre a la izquierda, plata a la derecha
function Renglon({ codigo, nombre, valor, fuerte }) {
  return (
    <div className="px-4 py-2.5 flex items-start gap-3">
      <span className="flex-1 min-w-0">
        <span className={`block text-sm truncate ${fuerte ? 'font-semibold text-feisen-texto' : 'text-feisen-texto'}`}>{nombre || 'Sin nombre'}</span>
        {codigo && <span className="block text-xs text-feisen-texto-2 tabular-nums">Cuenta {codigo}</span>}
      </span>
      <span className={`shrink-0 text-sm tabular-nums ${fuerte ? 'font-semibold' : ''} text-feisen-texto`}>{pesos(valor)}</span>
    </div>
  )
}

export default function Impuestos() {
  const anio = String(new Date().getFullYear())
  const { datos, cargando, error, recargar } = useTributario(anio)
  const [tarifaTexto, setTarifaTexto] = useState(() => leer(CLAVE_TARIFA, String(TARIFA_POR_DEFECTO)))
  const [ajusteTexto, setAjusteTexto] = useState(() => leer(CLAVE_AJUSTE, ''))

  const cambiarTarifa = v => { setTarifaTexto(v); guardar(CLAVE_TARIFA, v) }
  const cambiarAjuste = v => { const t = conPuntos(v); setAjusteTexto(t); guardar(CLAVE_AJUSTE, t) }

  const tarifaPct = Number(String(tarifaTexto).replace(',', '.'))
  const tarifaOk = Number.isFinite(tarifaPct) && tarifaPct > 0 && tarifaPct <= 100
  const tarifa = tarifaOk ? tarifaPct / 100 : TARIFA_POR_DEFECTO / 100
  const ajuste = Number(soloDigitos(ajusteTexto) || 0)

  const calc = useMemo(() => {
    if (!datos) return null
    const t = datos.totales || {}
    const utilidadOdoo = datos.resultado?.utilidad || 0
    const ingresos = datos.resultado?.ingresos || 0
    const utilidad = utilidadOdoo + ajuste
    const renta = utilidad * tarifa
    const certificados = t.retenciones_certificados || 0
    const autorretenciones = t.autorretenciones || 0
    const anticipos = certificados + autorretenciones
    const neto = renta - anticipos            // > 0 por pagar · < 0 saldo a favor
    const margen = ingresos > 0 ? utilidad / ingresos : 0

    // Palanca 1: hasta cuánto inventario se puede pasar al costo antes de quedar en saldo a favor
    const topeInventario = utilidad - (tarifa > 0 ? anticipos / tarifa : 0)
    const inventario = t.inventario || 0

    // Palanca 2: cuánta venta adicional, al margen de hoy, haría que la renta alcance los anticipos
    const ventaFaltante = neto < 0 && margen > 0 ? (anticipos / tarifa - utilidad) / margen : 0
    const rentaPor100 = 100e6 * margen * tarifa

    // IVA (las cuentas de IVA generado vienen en negativo porque son un crédito contable)
    const generado = -(t.iva_generado || 0)
    const devoluciones = t.iva_devoluciones || 0
    const descontable = t.iva_descontable || 0
    const diferencia = generado - devoluciones - descontable
    const liquidado = -(t.iva_por_pagar || 0)
    // Contabilidad cierra las cuentas de IVA al final de cada bimestre: revierte el generado y el
    // descontable y pasa el neto a la 240814. Se comprobó mirando el movimiento mes a mes (marzo se
    // revierte en abril, mayo en junio, julio en agosto). Por eso lo que queda vivo en las cuentas 2408
    // es SOLO lo de los bimestres que todavía no se han cerrado, y hay que SUMARLO a la 240814, no
    // restarlo: son dos deudas distintas con la DIAN.
    const porDeclarar = diferencia
    const totalIva = porDeclarar + liquidado

    const porMes = datos.porMes || {}
    const bimestres = BIMESTRES.map(b => {
      const suma = test => b.meses.reduce((s, m) => {
        const mes = porMes[`${datos.anio}-${m}`] || {}
        return s + Object.entries(mes).filter(([c]) => test(c)).reduce((x, [, v]) => x + v, 0)
      }, 0)
      const g = -suma(IVA.generado)
      const dev = suma(IVA.devoluciones)
      const desc = suma(IVA.descontable)
      const liq = -suma(IVA.liquidado)
      const conDatos = b.meses.some(m => porMes[`${datos.anio}-${m}`])
      // Un bimestre ya cerrado queda en casi cero, porque contabilidad reversa el generado y el
      // descontable y pasa el neto a «Iva por pagar». Mostrar esos ceros haría creer que no hubo IVA
      // ese bimestre, que es falso: lo que pasa es que ya está declarado.
      const cerrado = conDatos && Math.abs(g) < 1_000_000 && Math.abs(desc) < 3_000_000
      return { ...b, generado: g, devoluciones: dev, descontable: desc, liquidado: liq, diferencia: g - dev - desc, conDatos, cerrado }
    })

    const detalle = datos.detalle || []
    const porCodigo = c => detalle.filter(x => c.includes(x.codigo))
    return {
      utilidadOdoo, utilidad, ingresos, renta, certificados, autorretenciones, anticipos, neto, margen,
      topeInventario, inventario, ventaFaltante, rentaPor100,
      generado, devoluciones, descontable, diferencia, liquidado, porDeclarar, totalIva, bimestres,
      ctasCertificados: porCodigo(CERTIFICADOS),
      ctasAutorretenciones: porCodigo(AUTORRETENCIONES),
      ctasPorPagar: detalle.filter(x => POR_PAGAR(x.codigo)),
    }
  }, [datos, tarifa, ajuste])

  const aFavor = calc && calc.neto < 0
  const magnitud = calc ? Math.abs(calc.neto) : 0
  const pctInventario = calc && calc.inventario > 0 ? Math.round(Math.max(calc.topeInventario, 0) / calc.inventario * 100) : 0

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24 lg:pb-8">
      <EncabezadoPagina modulo="Finanzas" titulo="Impuestos"
        subtitulo="¿Tengo renta por pagar o saldo a favor, y qué puedo hacer? Cifras en vivo de Odoo Feisen.">
        <button type="button" onClick={recargar} disabled={cargando}
          className="flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-60">
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </EncabezadoPagina>

      {cargando && !calc ? <Cargando /> : error ? <ErrorOdoo mensaje={error} onReintentar={recargar} /> : calc && <>

        {/* 1. La respuesta primero */}
        <section className={`rounded-xl border p-5 sm:p-6 ${aFavor ? 'border-feisen-rojo-suave bg-feisen-rojo-suave' : 'border-feisen-borde bg-white'} ${cargando ? 'opacity-60' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">
            {aFavor ? 'Saldo a favor en la DIAN' : 'Renta por pagar'}
          </p>
          <p className={`text-3xl sm:text-4xl font-semibold tabular-nums mt-1 ${aFavor ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{pesos(magnitud)}</p>
          <p className="text-sm text-feisen-texto mt-2 max-w-2xl">
            {aFavor
              ? <>Con lo que hay hoy en Odoo, a Feisen <strong>le quedaría un saldo a favor</strong>: ya le anticiparon {pesos(calc.anticipos)} entre retenciones y autorretenciones, y la renta del año daría apenas {pesos(calc.renta)}. Esa diferencia de {pesos(magnitud)} se queda en la DIAN en vez de quedarse en la caja.</>
              : <>Con lo que hay hoy en Odoo, a Feisen <strong>le quedaría renta por pagar</strong>: la utilidad del año va en {pesos(calc.utilidad)}, al {tarifaPct} % la renta daría {pesos(calc.renta)}, y ya le han anticipado {pesos(calc.anticipos)}. Quedaría debiendo unos {pesos(magnitud)}.</>}
          </p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 border-t border-feisen-borde-suave pt-3">
            {[
              ['Utilidad del año', pesos(calc.utilidad)],
              [`Renta al ${tarifaPct} %`, pesos(calc.renta)],
              ['Anticipos del año', `− ${pesos(calc.anticipos)}`],
              [aFavor ? 'Saldo a favor' : 'Queda por pagar', pesos(magnitud)],
            ].map(([k, v], i) => (
              <div key={k} className="min-w-0">
                <span className="block text-[11px] uppercase tracking-wide text-feisen-texto-2 truncate">{k}</span>
                <span className={`block text-sm font-semibold tabular-nums truncate ${i === 3 && aFavor ? 'text-feisen-rojo' : 'text-feisen-texto'}`}>{v}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Aviso: esto no es una declaración de renta */}
        <div className="flex items-start gap-2.5 rounded-xl border border-feisen-borde bg-white px-4 py-3">
          <Info size={18} className="text-feisen-texto-2 shrink-0 mt-0.5" />
          <p className="text-xs text-feisen-texto-2">
            Esto es <strong className="text-feisen-texto">una estimación para conversar con el revisor fiscal, no una declaración de renta</strong>.
            La renta real tiene depuración fiscal (gastos no deducibles, renta presuntiva, tasa mínima de tributación, descuentos) que esta pantalla no hace.
            Sirve para decidir a tiempo; la cifra definitiva la da el revisor fiscal.
          </p>
        </div>

        {/* Supuestos: tarifa y utilidad de enero y febrero */}
        <Bloque titulo="Con qué se hizo la cuenta" descripcion="Cambia estos dos datos y todo lo de arriba y lo de abajo se recalcula solo.">
          <div className="p-4 grid gap-4 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Tarifa de renta</span>
              <span className="mt-1.5 flex items-center gap-2 rounded-lg border border-feisen-borde px-3 focus-within:border-feisen-azul">
                <Percent size={16} className="text-feisen-texto-2 shrink-0" />
                <input value={tarifaTexto} onChange={e => cambiarTarifa(e.target.value)} inputMode="decimal"
                  className="flex-1 min-w-0 min-h-[44px] text-sm tabular-nums bg-transparent focus:outline-none" />
                <span className="text-sm text-feisen-texto-2 shrink-0">%</span>
              </span>
              <span className={`block text-xs mt-1 ${tarifaOk ? 'text-feisen-texto-2' : 'text-feisen-rojo'}`}>
                {tarifaOk ? '35 % es la tarifa general en Colombia. Cámbiala si al revisor fiscal le aplica otra.' : `Escribe un número entre 1 y 100. Mientras tanto se usa el ${TARIFA_POR_DEFECTO} %.`}
              </span>
            </label>
            <label className="block min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wide text-feisen-texto-2">Ajuste del revisor fiscal</span>
              <span className="mt-1.5 flex items-center gap-2 rounded-lg border border-feisen-borde px-3 focus-within:border-feisen-azul">
                <span className="text-sm text-feisen-texto-2 shrink-0">$</span>
                <input value={ajusteTexto} onChange={e => cambiarAjuste(e.target.value)} inputMode="numeric" placeholder="0"
                  className="flex-1 min-w-0 min-h-[44px] text-sm tabular-nums bg-transparent focus:outline-none" />
              </span>
              <span className="block text-xs mt-1 text-feisen-texto-2">
                {ajuste
                  ? `Se suma a la utilidad de Odoo (${pesos(calc.utilidadOdoo)}).`
                  : 'Déjalo vacío si no hay nada que ajustar. Sirve para meter una corrección que te dé el revisor fiscal, sin tocar la contabilidad.'}
              </span>
            </label>
          </div>
          {true && (
            <p className="px-4 pb-4 -mt-1 text-xs text-feisen-texto-2">
              El año está completo: aunque en Odoo no hay asientos con fecha de enero ni de febrero, contabilidad cargó esos dos meses
              dentro de marzo al pasar de SIIGO a Odoo. Por eso marzo se ve tres veces más grande que los demás meses. No hay que
              sumarle nada por enero y febrero: se contarían dos veces.
            </p>
          )}
        </Bloque>

        {/* 2. Las dos palancas */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Inventario al costo */}
          <section className="bg-white border border-feisen-borde rounded-xl p-5 flex flex-col gap-2">
            <span className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-feisen-azul-suave text-feisen-azul"><Boxes size={18} weight="duotone" /></span>
              <span className="text-sm font-semibold text-feisen-texto">¿Cuánto inventario puedo pasar al costo?</span>
            </span>
            {calc.topeInventario > 0 ? <>
              <span className="text-2xl sm:text-3xl font-semibold tabular-nums text-feisen-texto">{pesos(calc.topeInventario)}</span>
              <span className="text-sm text-feisen-texto-2">
                Es el tope antes de quedar en saldo a favor. Equivale al <strong className="text-feisen-texto">{pctInventario} %</strong> del inventario de hoy ({pesos(calc.inventario)}).
              </span>
              <span className="block h-2 rounded-full bg-feisen-fondo overflow-hidden">
                <span className="block h-full rounded-full bg-feisen-azul" style={{ width: `${Math.min(pctInventario, 100)}%` }} />
              </span>
              <span className="text-xs text-feisen-texto-2 mt-auto pt-1">
                Pasar inventario al costo baja la utilidad y con ella la renta. Si pasas más de {millones(calc.topeInventario)}, la renta no alcanza a cubrir los anticipos y la plata se le queda a la DIAN.
              </span>
            </> : <>
              <span className="text-2xl sm:text-3xl font-semibold tabular-nums text-feisen-rojo">Nada más</span>
              <span className="text-sm text-feisen-texto-2">
                Hoy ya estás en saldo a favor: la renta no alcanza a cubrir los anticipos que te hicieron. Pasar más inventario al costo solo aumenta la plata atrapada en la DIAN.
              </span>
              <span className="text-xs text-feisen-texto-2 mt-auto pt-1">Inventario en libros hoy: {pesos(calc.inventario)}.</span>
            </>}
          </section>

          {/* Venta adicional */}
          <section className="bg-white border border-feisen-borde rounded-xl p-5 flex flex-col gap-2">
            <span className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-feisen-azul-suave text-feisen-azul"><TrendingUp size={18} weight="duotone" /></span>
              <span className="text-sm font-semibold text-feisen-texto">¿Cuánto más tengo que vender?</span>
            </span>
            {aFavor && calc.ventaFaltante > 0 ? <>
              <span className="text-2xl sm:text-3xl font-semibold tabular-nums text-feisen-texto">{pesos(calc.ventaFaltante)}</span>
              <span className="text-sm text-feisen-texto-2">
                Vendiendo eso de más, al margen de utilidad de hoy ({(calc.margen * 100).toFixed(1).replace('.', ',')} %), la renta alcanzaría justo para cubrir los anticipos y no quedaría saldo a favor.
              </span>
              <span className="text-xs text-feisen-texto-2 mt-auto pt-1">
                La otra cara de la misma moneda: con esa venta la utilidad sube {millones(calc.ventaFaltante * calc.margen)}. También ayuda mesurar las compras y los gastos, que suben el costo y bajan la utilidad.
              </span>
            </> : <>
              <span className="text-2xl sm:text-3xl font-semibold text-feisen-texto">Hoy no hace falta</span>
              <span className="text-sm text-feisen-texto-2">
                No te hace falta vender más para cubrir los anticipos: la renta del año ya los supera y queda algo por pagar, que es justo lo que buscabas.
              </span>
              <span className="text-xs text-feisen-texto-2 mt-auto pt-1">
                Para dimensionar: al margen de hoy ({(calc.margen * 100).toFixed(1).replace('.', ',')} %), cada $100 millones de venta adicional suman {millones(100e6 * calc.margen)} de utilidad y {millones(calc.rentaPor100)} más de renta por pagar.
              </span>
            </>}
          </section>
        </div>

        {/* 3. IVA */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi Icono={Receipt} clase="bg-feisen-azul-suave text-feisen-azul" titulo="IVA generado" valor={millones(calc.generado)}
            detalle={calc.devoluciones ? `menos ${millones(calc.devoluciones)} de devoluciones` : 'el que cobramos en las ventas'} />
          <Kpi Icono={Invoice} clase="bg-gray-100 text-feisen-texto-2" titulo="IVA descontable" valor={millones(calc.descontable)}
            detalle="el que pagamos en las compras" />
          <Kpi Icono={Scale} clase="bg-amber-50 text-amber-700" titulo="De los bimestres sin cerrar" valor={millones(calc.porDeclarar)}
            detalle={calc.porDeclarar < 0 ? 'queda a favor de Feisen' : 'todavía no se ha declarado'} />
          <Kpi Icono={Percent} clase="bg-feisen-azul-suave text-feisen-azul" titulo="Total que le debemos a la DIAN" valor={millones(calc.totalIva)}
            detalle={`más ${millones(calc.liquidado)} ya declarados y sin pagar`} />
        </div>

        <Bloque titulo="IVA bimestre por bimestre" descripcion="En Colombia el IVA se declara por bimestres, así que se agrupa de a dos meses.">
          <div className="px-4 py-2 flex items-center gap-3 border-b border-feisen-borde-suave text-[11px] uppercase tracking-wide text-feisen-texto-2">
            <span className="w-16 sm:w-24 shrink-0">Bimestre</span>
            <span className="flex-1 grid grid-cols-3 gap-2 text-right">
              <span className="truncate">Generado</span><span className="truncate">Descontable</span><span className="truncate">Diferencia</span>
            </span>
          </div>
          <div className="divide-y divide-feisen-borde-suave">
            {calc.bimestres.map(b => (
              <div key={b.texto} className={`px-4 py-2.5 flex items-center gap-3 ${b.conDatos ? '' : 'opacity-50'}`}>
                <span className="w-16 sm:w-24 shrink-0 text-sm text-feisen-texto">{b.texto}</span>
                {b.conDatos && b.cerrado ? (
                  <span className="flex-1 text-right text-xs sm:text-sm text-feisen-texto-2">
                    ya declarado y cerrado contra «Iva por pagar»
                  </span>
                ) : b.conDatos ? (
                  <span className="flex-1 grid grid-cols-3 gap-2 text-right text-xs sm:text-sm tabular-nums text-feisen-texto">
                    <span className="truncate">{millones(b.generado)}</span>
                    <span className="truncate">{millones(b.descontable)}</span>
                    <span className="truncate font-semibold">{millones(b.diferencia)}</span>
                  </span>
                ) : (
                  <span className="flex-1 text-right text-xs text-feisen-texto-2">sin movimiento en Odoo</span>
                )}
              </div>
            ))}
          </div>
          <p className="px-4 py-3 border-t border-feisen-borde-suave text-xs text-feisen-texto-2">
            El bimestre Ene–Feb sale vacío porque Odoo Feisen solo tiene movimiento desde marzo de {anio}; esos dos meses estaban en SIIGO.
            Contabilidad cierra las cuentas de IVA al final de cada bimestre y pasa el neto a la cuenta «Iva por pagar»: por eso lo que
            sigue vivo en las cuentas de IVA es solo lo de los bimestres que todavía no se han cerrado, y se <strong>suma</strong> a lo ya
            declarado, no se resta. Los dos juntos son lo que hoy le debemos a la DIAN por IVA.
          </p>
        </Bloque>

        {/* 4. Certificados de renta */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Bloque titulo="Lo que me retuvieron" descripcion="Certificados de retención que nos practican los clientes."
            derecha={<span className="text-base font-semibold tabular-nums text-feisen-texto">{pesos(calc.certificados)}</span>}>
            {calc.ctasCertificados.length === 0
              ? <p className="px-4 py-6 text-center text-sm text-feisen-texto-2">Odoo no muestra saldo en las cuentas de retenciones (1355). Si el revisor fiscal tiene certificados, hay que contabilizarlos para que entren aquí.</p>
              : <div className="divide-y divide-feisen-borde-suave">{calc.ctasCertificados.map(x => <Renglon key={x.codigo} {...x} valor={x.saldo} />)}</div>}
          </Bloque>
          <Bloque titulo="Lo que me autorretuve" descripcion="Autorretención que Feisen se liquida y paga ella misma."
            derecha={<span className="text-base font-semibold tabular-nums text-feisen-texto">{pesos(calc.autorretenciones)}</span>}>
            {calc.ctasAutorretenciones.length === 0
              ? <p className="px-4 py-6 text-center text-sm text-feisen-texto-2">Odoo no muestra saldo de autorretención (135509 / 135510) este año.</p>
              : <div className="divide-y divide-feisen-borde-suave">{calc.ctasAutorretenciones.map(x => <Renglon key={x.codigo} {...x} valor={x.saldo} />)}</div>}
          </Bloque>
        </div>
        <p className="-mt-1 text-xs text-feisen-texto-2 px-1">
          Las dos cosas se restan de la renta del año: suman {pesos(calc.anticipos)} de anticipos.
        </p>

        {/* 5. Los demás impuestos por pagar */}
        <Bloque titulo="Los demás impuestos por pagar" descripcion="Retención en la fuente, ICA y autorretención de ICA que están pendientes de pagar en Odoo."
          derecha={<span className="text-base font-semibold tabular-nums text-feisen-texto">{pesos(calc.ctasPorPagar.reduce((s, x) => s + Math.abs(x.saldo), 0))}</span>}>
          {calc.ctasPorPagar.length === 0
            ? <p className="px-4 py-6 text-center text-sm text-feisen-texto-2">No hay saldo pendiente en las cuentas de retención en la fuente ni de ICA.</p>
            : <div className="divide-y divide-feisen-borde-suave">{calc.ctasPorPagar.map(x => <Renglon key={x.codigo} codigo={x.codigo} nombre={x.nombre} valor={Math.abs(x.saldo)} />)}</div>}
        </Bloque>

        <p className="text-xs text-feisen-texto-2 px-1">
          Todo sale de Odoo Feisen, año {anio}, desde {PRIMER_MES_ODOO.slice(5)}/{PRIMER_MES_ODOO.slice(0, 4)}. No incluye FC ni lo que estaba en SIIGO.
        </p>
      </>}
    </div>
  )
}
