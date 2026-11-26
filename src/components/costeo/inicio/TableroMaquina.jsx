import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { formatCOP } from '../utils/format'
import { nombreCorto, tipoTitulo } from '../utils/nombres'
import { cargarDatosCosteo, pct, periodoTexto } from './datosInicio'
import EtapasMaquina from './EtapasMaquina'
import { Anillo, BarraPrecio, COLORES, Leyenda, RAYADO } from './piezasTablero'

// Tablero de una máquina (2026-11-26, opción B estilo Stripe): cómo se reparte el precio de venta
// (MP, MO, CIF, utilidad o lo que falta por costear), el avance por conjunto y cuánto puede costar
// como máximo para ganar 30/35/40 %.
const METAS = [0.3, 0.35, 0.4]

export default function TableroMaquina() {
  const { id } = useParams()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  function cargar() {
    return cargarDatosCosteo().then(setDatos).catch((e) => setError('No se pudieron leer los datos: ' + e.message))
  }
  useEffect(() => {
    cargar()
  }, [])

  async function cambiarProducto(producto) {
    setGuardando(true)
    const { error: e } = await supabase.from('costeo_fichas').update({ producto_odoo: producto || null, updated_at: new Date().toISOString() }).eq('id', id)
    if (e) setError('No se pudo guardar el producto: ' + e.message)
    await cargar()
    setGuardando(false)
  }

  if (error) return <p className="text-sm text-feisen-rojo">{error}</p>
  if (!datos) return <p className="text-sm text-feisen-texto-2">Cargando…</p>
  const m = datos.maquinas.find((x) => x.fichaId === id)
  if (!m) {
    return (
      <p className="text-sm text-feisen-texto-2">
        No se encontró esta máquina. <Link to="/costeo" className="text-feisen-azul hover:underline">Volver a Costeo</Link>
      </p>
    )
  }

  const periodo = periodoTexto(datos.meses)
  const faltan = m.conjuntos.filter((c) => !(c.costo > 0)).length
  const textoRayado = m.conjuntos.length ? `Sin costear todavía: faltan ${faltan} de ${m.conjuntos.length} conjuntos` : 'Sin costear todavía'

  return (
    <div className="max-w-6xl mx-auto tabular-nums">
      <main className="min-w-0 flex flex-col gap-6">
        <Link to="/costeo" className="text-xs text-feisen-azul hover:underline -mb-4">← Fichas de costeo</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-feisen-texto-2">Fichas y precio</div>
            <h1 className="text-2xl font-semibold tracking-tight text-feisen-texto mt-1">{tipoTitulo(m.nombre)}</h1>
            <p className="text-sm text-feisen-texto-2 mt-1">
              {m.ventas ? `${new Intl.NumberFormat('es-CO').format(m.unidades)} vendidas ${periodo} · ${formatCOP(m.valorVentas)} en ventas` : 'Sin ventas vinculadas en Odoo'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link to={`/costeo/fichas/${m.fichaId}`} className="h-10 px-3 inline-flex items-center rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">Abrir ficha</Link>
          </div>
        </div>

        <EtapasMaquina maquinaId={m.fichaId} activa="resumen" />

        <section className="bg-white border border-[#ECEEF1] rounded-[14px] p-5 sm:p-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="text-xs text-feisen-texto-2">Así se reparte el precio de venta</div>
              <div className={`text-3xl sm:text-[34px] font-semibold tracking-tight mt-1 ${m.precio > 0 ? 'text-feisen-texto' : 'text-feisen-gris-medio'}`}>{m.precio > 0 ? formatCOP(m.precio) : 'Sin precio'}</div>
              <div className="text-xs text-feisen-texto-2 mt-1">
                {m.fuentePrecio === 'lista' ? 'Precio de lista guardado en la ficha' : m.fuentePrecio === 'odoo' ? 'Promedio facturado por Feisen en Odoo' : 'Vincula el producto de Odoo o pon un precio de lista en la ficha'}
              </div>
            </div>
            <div className="flex flex-wrap gap-7">
              <Cifra titulo="Costo registrado" valor={m.costo > 0 ? formatCOP(m.costo) : '—'} />
              <Cifra
                titulo={m.completo ? 'Utilidad' : 'Utilidad provisional'}
                valor={m.utilidad !== null ? `${formatCOP(m.utilidad)} · ${pct(m.margen)}` : '—'}
                color={m.utilidad === null ? '' : !m.completo ? 'text-feisen-gris-medio' : m.utilidad < 0 ? 'text-feisen-rojo' : 'text-[#166534]'}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <BarraPrecio m={m} alto={28} texto={textoRayado} />
            <Leyenda
              items={[
                [COLORES.mp, `Materia prima ${formatCOP(m.desglose.mp)}${m.precio > 0 ? ` (${pct(m.desglose.mp / m.precio)})` : ''}`],
                [COLORES.mo, `Mano de obra ${formatCOP(m.desglose.mo)}`],
                [COLORES.cif, `CIF y equipos ${formatCOP(m.desglose.cif)}`],
                m.completo ? [COLORES.utilidad, 'Utilidad'] : [RAYADO, 'Sin costear'],
              ]}
            />
          </div>
          <label className="flex flex-wrap items-center gap-2 text-xs text-feisen-texto-2 border-t border-[#F2F3F5] pt-4">
            Producto en Odoo:
            <select value={m.productoGuardado ? m.producto : ''} disabled={guardando} onChange={(e) => cambiarProducto(e.target.value)} className="h-9 rounded-lg border border-feisen-borde bg-white px-2 text-sm text-feisen-texto max-w-full">
              <option value="">{m.producto && !m.productoGuardado ? `Propuesto: ${m.producto}` : 'Ninguno'}</option>
              {datos.productos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {m.producto && !m.productoGuardado && <span>(lo propuse por el nombre; escógelo para dejarlo fijo)</span>}
          </label>
        </section>

        <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))]">
          <section className="bg-white border border-[#ECEEF1] rounded-[14px] p-5">
            <div className="flex items-center gap-4">
              <Anillo valor={m.avance} tam={72} grosor={7} />
              <div>
                <div className="font-semibold text-[15px] text-feisen-texto">Avance del costeo</div>
                <div className="text-sm text-feisen-texto-2 mt-0.5">
                  {m.conjuntos.length ? `${m.costeados} de ${m.conjuntos.length} conjuntos con costo` : 'Todavía no tiene conjuntos en el despiece'}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col">
              {m.conjuntos.map((c) => (
                <div key={c.id} className="flex items-center gap-2.5 py-2 border-t border-[#F2F3F5] text-sm">
                  <span className="w-2 h-2 rounded-full flex-none" style={{ background: c.costo > 0 ? '#16A34A' : '#E5B865' }} />
                  <span className="flex-1 min-w-0 truncate text-feisen-texto">
                    {nombreCorto(c.nombre, m.nombre)}
                    {c.cantidad !== 1 && <span className="text-feisen-texto-2"> × {new Intl.NumberFormat('es-CO').format(c.cantidad)}</span>}
                  </span>
                  <span className={c.costo > 0 ? 'font-semibold text-feisen-texto' : 'text-feisen-gris-medio'}>{c.costo > 0 ? formatCOP(c.costo) : 'Sin costear'}</span>
                </div>
              ))}
              {!m.conjuntos.length && (
                <Link to={`/costeo/pasos/despiece?maquina=${m.fichaId}`} className="mt-2 text-sm text-feisen-azul hover:underline">Ir al despiece →</Link>
              )}
            </div>
          </section>

          <section className="bg-white border border-[#ECEEF1] rounded-[14px] p-5 flex flex-col gap-3">
            <div className="font-semibold text-[15px] text-feisen-texto">¿Cuánto puede costar como máximo?</div>
            {m.precio > 0 ? (
              <>
                <div className="text-sm text-feisen-texto-2">Con el precio de hoy ({formatCOP(m.precio)}), para ganar:</div>
                {METAS.map((meta) => {
                  const tope = m.precio * (1 - meta)
                  const uso = tope ? m.costo / tope : 0
                  return (
                    <div key={meta} className="grid grid-cols-[52px_minmax(0,1fr)_100px] gap-3 items-center text-sm">
                      <span className="font-medium text-feisen-texto">{pct(meta, 0)}</span>
                      <div className="h-2.5 rounded-full bg-[#ECEEF1]" title={`Llevas ${pct(uso, 0)} de ese tope`}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, uso * 100)}%`, background: uso > 1 ? COLORES.perdida : COLORES.mp }} />
                      </div>
                      <span className="text-right font-semibold text-feisen-texto">{formatCOP(tope)}</span>
                    </div>
                  )
                })}
                <div className="text-xs text-feisen-texto-2 mt-1">
                  La barra muestra cuánto del tope ya se gastó con el costo registrado ({formatCOP(m.costo)}).{!m.completo && ' Falta costear parte de la máquina, así que va a subir.'}
                </div>
              </>
            ) : (
              <div className="text-sm text-feisen-texto-2">Necesita un precio: vincula el producto de Odoo arriba o pon un precio de lista en la ficha.</div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function Cifra({ titulo, valor, color = '' }) {
  return (
    <div>
      <div className="text-xs text-feisen-texto-2">{titulo}</div>
      <div className={`text-lg font-semibold mt-0.5 ${color || 'text-feisen-texto'}`}>{valor}</div>
    </div>
  )
}
