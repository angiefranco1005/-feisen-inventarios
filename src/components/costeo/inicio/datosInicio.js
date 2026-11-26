import { supabase } from '../../../lib/supabase'
import { normalizar } from '../pasos/datosPasos'

// Datos del inicio de Costeo (tarjetas de todas las máquinas) y del tablero de una máquina.
// - Costo: vista costeo_resumen (ya suma las piezas de adentro). El desglose MP / MO / CIF de la
//   máquina completa se arma aquí recorriendo costeo_ficha_piezas.
// - Precio y unidades: ventas_odoo de Feisen (se actualiza sola cada 15 min). Precio = valor / unidades.
//   Si la ficha tiene precio_venta_actual > 0, ese precio manda (es el "precio de lista").
// - Familia mostrada: productos de Odoo que empiezan por MEZCLADORA + los vinculados a una ficha.
// - Avance: conjuntos de primer nivel que ya tienen costo / total de conjuntos.

export const FAMILIA = 'MEZCLADORA'
const RELLENO = new Set(['b', 'bulto', 'bultos', 'de'])

function palabras(t) {
  return new Set(normalizar(t).split(/[^a-z0-9/]+/).filter((x) => x && !RELLENO.has(x)))
}

// Propone el producto de Odoo de una máquina por nombre: igual de palabras (sin "B", "bulto", "-").
export function proponerProducto(nombreFicha, productos) {
  const a = palabras(nombreFicha)
  let mejor = null
  let puntaje = 0
  for (const p of productos) {
    const b = palabras(p)
    const comunes = [...a].filter((x) => b.has(x)).length
    const union = new Set([...a, ...b]).size
    const j = union ? comunes / union : 0
    if (j > puntaje) {
      puntaje = j
      mejor = p
    }
  }
  return puntaje >= 0.75 ? mejor : null
}

async function leerTodo(consulta) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999)
    if (error) throw error
    filas.push(...(data || []))
    if (!data || data.length < 1000) return filas
  }
}

export async function cargarDatosCosteo() {
  const [res, fic, enl] = await Promise.all([
    supabase.from('costeo_resumen').select('ficha_id, nombre, tipo, precio_venta_actual, total_mp, total_mod, cif_asignado, total_equipos, costo_total'),
    supabase.from('costeo_fichas').select('id, producto_odoo').eq('tipo', 'maquina'),
    supabase.from('costeo_ficha_piezas').select('contenedor_id, pieza_id, cantidad'),
  ])
  const err = res.error || fic.error || enl.error
  if (err) throw err

  const vinculados = (fic.data || []).map((f) => f.producto_odoo).filter(Boolean)
  const ventas = await leerTodo(() =>
    supabase.from('ventas_odoo').select('producto, mes, valor, cantidad').eq('empresa', 'feisen').ilike('producto', FAMILIA + '%')
  )
  const faltan = vinculados.filter((p) => !p.toUpperCase().startsWith(FAMILIA))
  if (faltan.length) ventas.push(...(await leerTodo(() => supabase.from('ventas_odoo').select('producto, mes, valor, cantidad').eq('empresa', 'feisen').in('producto', faltan))))

  return armar(res.data || [], fic.data || [], enl.data || [], ventas)
}

function armar(resumen, fichasMaq, enlaces, ventas) {
  const porId = Object.fromEntries(resumen.map((r) => [r.ficha_id, r]))
  const hijos = {}
  for (const e of enlaces) (hijos[e.contenedor_id] ||= []).push(e)

  // Desglose recursivo (MP, MO, CIF, equipos) de una ficha con todo lo de adentro.
  const memo = {}
  function desglose(id, pila = new Set()) {
    if (memo[id]) return memo[id]
    const r = porId[id] || {}
    const d = { mp: +r.total_mp || 0, mo: +r.total_mod || 0, cif: (+r.cif_asignado || 0) + (+r.total_equipos || 0) }
    if (!pila.has(id)) {
      pila.add(id)
      for (const h of hijos[id] || []) {
        const s = desglose(h.pieza_id, pila)
        const c = +h.cantidad || 0
        d.mp += c * s.mp
        d.mo += c * s.mo
        d.cif += c * s.cif
      }
      pila.delete(id)
    }
    return (memo[id] = d)
  }

  // Ventas por producto
  const prod = {}
  let meses = new Set()
  for (const v of ventas) {
    const p = (prod[v.producto] ||= { producto: v.producto, valor: 0, unidades: 0 })
    p.valor += +v.valor || 0
    p.unidades += +v.cantidad || 0
    if (v.mes) meses.add(v.mes)
  }
  meses = [...meses].sort()
  const productos = Object.keys(prod)
  const totalVentas = Object.values(prod).reduce((s, p) => s + p.valor, 0)
  const totalUnidades = Object.values(prod).reduce((s, p) => s + p.unidades, 0)

  const vinculo = Object.fromEntries(fichasMaq.map((f) => [f.id, f.producto_odoo]))
  // Los productos ya vinculados a mano quedan apartados antes de proponer los demás.
  const usados = new Set(fichasMaq.map((f) => f.producto_odoo).filter(Boolean))

  const maquinas = resumen
    .filter((r) => r.tipo === 'maquina')
    .map((r) => {
      const guardado = vinculo[r.ficha_id] || null
      const producto = guardado || proponerProducto(r.nombre, productos.filter((p) => !usados.has(p)))
      if (producto) usados.add(producto)

      const v = producto ? prod[producto] : null
      const conjuntos = (hijos[r.ficha_id] || []).map((h) => {
        const c = porId[h.pieza_id] || {}
        return { id: h.pieza_id, nombre: c.nombre || '—', cantidad: +h.cantidad || 0, costo: (+c.costo_total || 0) * (+h.cantidad || 0) }
      })
      const costeados = conjuntos.filter((c) => c.costo > 0).length
      return filaMaquina({
        fichaId: r.ficha_id,
        nombre: r.nombre,
        producto,
        productoGuardado: !!guardado,
        precioLista: +r.precio_venta_actual || 0,
        ventas: v,
        costo: +r.costo_total || 0,
        desglose: desglose(r.ficha_id),
        conjuntos,
        avance: conjuntos.length ? costeados / conjuntos.length : +r.costo_total > 0 ? null : 0,
        costeados,
        totalVentas,
      })
    })

  const sinFicha = productos
    .filter((p) => !usados.has(p))
    .map((p) => ({ producto: p, ...prod[p], precio: prod[p].unidades ? prod[p].valor / prod[p].unidades : 0, participacion: totalVentas ? prod[p].valor / totalVentas : 0 }))
    .sort((a, b) => b.valor - a.valor)

  return { maquinas, sinFicha, productos: productos.sort(), totalVentas, totalUnidades, meses }
}

function filaMaquina(m) {
  const precioOdoo = m.ventas?.unidades ? m.ventas.valor / m.ventas.unidades : 0
  const precio = m.precioLista > 0 ? m.precioLista : precioOdoo
  const completo = m.avance === 1 || (m.avance === null && m.costo > 0)
  const utilidad = precio > 0 && m.costo > 0 ? precio - m.costo : null
  return {
    ...m,
    precioOdoo,
    precio,
    fuentePrecio: m.precioLista > 0 ? 'lista' : precioOdoo > 0 ? 'odoo' : null,
    unidades: m.ventas?.unidades || 0,
    valorVentas: m.ventas?.valor || 0,
    participacion: m.totalVentas && m.ventas ? m.ventas.valor / m.totalVentas : 0,
    completo,
    utilidad,
    margen: utilidad !== null ? utilidad / precio : null,
  }
}

// "abr–nov 2026" a partir de meses 'AAAA-MM'
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function periodoTexto(meses) {
  if (!meses?.length) return ''
  const [a1, m1] = meses[0].split('-')
  const [a2, m2] = meses[meses.length - 1].split('-')
  const t1 = MES[+m1 - 1]
  const t2 = MES[+m2 - 1]
  return a1 === a2 ? `${t1}–${t2} ${a2}` : `${t1} ${a1} – ${t2} ${a2}`
}

export function millones(v) {
  return '$' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round((v || 0) / 1e6)) + ' M'
}

export function pct(v, dec = 1) {
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format((v || 0) * 100) + ' %'
}
