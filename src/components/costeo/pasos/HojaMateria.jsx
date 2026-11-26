import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatCOP, formatNumber } from '../utils/format'
import { tipoTitulo } from '../utils/nombres'
import { falta, materialesDe } from './datosPasos'

// Paso 3 · Materia prima con la pregunta "¿cuántas salen de una unidad?" (opción A; Angie, 2026-11-26).
// El material se escoge del inventario (items, que se compran por unidad: lámina, ángulo, barra…).
// Dos formas de decir cuánto gasta una pieza:
//   salen  → "de 1 lámina salen 3 conos"   → cantidad = 1/3, rendimiento = 3
//   usa    → "usa 2 rodamientos por pieza" → cantidad = 2,  rendimiento = null
// costeo_materiales necesita un proceso: el material entra en la PRIMERA operación de la ruta de la
// pieza (normalmente el corte). Sin ruta, se pide hacer primero el paso 2.
const cop = (n) => formatCOP(n).replace(/,00$/, '')
const BTN = 'h-9 inline-flex items-center gap-1.5 rounded-lg px-3 text-sm'
const CAMPO = 'h-10 w-full rounded-lg border border-feisen-borde bg-white px-2 text-sm text-feisen-texto'

export default function HojaMateria({ arbol, filas, corto, buscar, soloFalta, onCambio }) {
  const maquinaId = arbol.raizId
  const [abierto, setAbierto] = useState(null) // { fichaId, materialId? }
  const [error, setError] = useState('')

  const renglones = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return filas
      .filter((f) => !q || (f.ficha?.nombre || '').toLowerCase().includes(q))
      .filter((f) => !soloFalta || falta.materia(f, arbol))
  }, [filas, buscar, soloFalta, arbol])

  if (!filas.length) return <p className="px-6 py-10 text-center text-sm text-feisen-texto-2">Primero agrega las piezas en el paso 1 · Despiece.</p>

  const precioDe = (m) => Number(m.items?.precio_costo || 0)
  const costoPieza = (fichaId) => materialesDe(arbol, fichaId).reduce((s, m) => s + Number(m.cantidad || 0) * precioDe(m), 0)
  const totalMaquina = filas.reduce((s, f) => s + costoPieza(f.fichaId) * f.cantTotal, 0)
  const hojas = filas.filter((f) => !f.esConjunto)
  const conMaterial = hojas.filter((f) => !falta.materia(f, arbol)).length

  async function quitar(m) {
    if (!window.confirm(`¿Quitar ${m.items?.nombre ?? m.item_nombre_libre} de esta pieza?`)) return
    const { error: e } = await supabase.from('costeo_materiales').delete().eq('id', m.id)
    if (e) return setError('No se pudo quitar: ' + e.message)
    setAbierto(null)
    onCambio()
  }

  return (
    <div className="divide-y divide-feisen-borde-suave">
      {error && <p className="px-4 py-3 text-sm text-feisen-rojo">{error}</p>}
      {!renglones.length && <p className="px-4 py-8 text-center text-sm text-feisen-texto-2">Todas las piezas tienen su materia prima.</p>}
      {renglones.map((f) => {
        const mats = materialesDe(arbol, f.fichaId)
        const primerProceso = [...(arbol.procesos[f.fichaId] || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))[0]
        const ab = abierto?.fichaId === f.fichaId ? abierto : null
        const editando = ab?.materialId ? mats.find((m) => m.id === ab.materialId) : null
        const costo = costoPieza(f.fichaId)
        return (
          <section key={f.key} className={`px-3 sm:px-4 py-3 ${f.esConjunto ? 'bg-feisen-fondo' : 'bg-white'}`}>
            <div style={{ paddingLeft: Math.min(f.nivel, 4) * 16 }}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className={`text-sm ${f.esConjunto ? 'font-semibold' : 'font-medium'} text-feisen-texto`}>{f.esConjunto ? `Ensamble · ${corto(f.ficha?.nombre)}` : corto(f.ficha?.nombre)}</h3>
                {f.cant !== 1 && <span className="text-xs text-feisen-texto-2">× {formatNumber(f.cant, f.cant % 1 ? 2 : 0)}</span>}
                {!f.esConjunto && !mats.length && <span className="text-xs rounded-full px-2 py-0.5 bg-amber-50 text-amber-800">Sin material</span>}
                <span className="flex-1" />
                {costo > 0 && (
                  <span className="text-sm tabular-nums text-feisen-texto">
                    {cop(costo)} <span className="text-xs text-feisen-texto-2">por pieza{f.cant !== 1 ? ` · ${cop(costo * f.cant)} × ${formatNumber(f.cant, f.cant % 1 ? 2 : 0)}` : ''}</span>
                  </span>
                )}
              </div>

              {mats.map((m) => (
                <div key={m.id} className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-feisen-borde-suave bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-feisen-texto min-w-0">{tipoTitulo(m.items?.nombre || m.item_nombre_libre || 'Material')}</span>
                  <span className="text-feisen-texto-2 tabular-nums">{lectura(m)}</span>
                  <span className="flex-1" />
                  {precioDe(m) > 0 ? (
                    <span className="tabular-nums text-feisen-texto">{cop(Number(m.cantidad) * precioDe(m))}</span>
                  ) : (
                    <span className="text-xs rounded-full px-2 py-0.5 bg-amber-50 text-amber-800">{m.item_id ? 'Sin precio en inventario' : 'No está en inventario'}</span>
                  )}
                  <button type="button" onClick={() => setAbierto({ fichaId: f.fichaId, materialId: m.id })} aria-label="Editar material" className="w-8 h-8 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo"><Pencil size={14} /></button>
                  <button type="button" onClick={() => quitar(m)} aria-label="Quitar material" className="w-8 h-8 grid place-items-center rounded-lg text-feisen-texto-2 hover:text-feisen-rojo hover:bg-feisen-rojo-suave"><Trash2 size={14} /></button>
                </div>
              ))}

              {!primerProceso ? (
                <p className="mt-1.5 text-xs text-feisen-texto-2">
                  {f.esConjunto ? 'Sin operaciones de ensamble.' : 'Primero ponle la hoja de ruta: el material entra en su primera operación.'}{' '}
                  {!f.esConjunto && <Link to={`/costeo/pasos/ruta?maquina=${maquinaId}`} className="text-feisen-azul hover:underline">Ir al paso 2</Link>}
                </p>
              ) : (
                !ab && (
                  <button type="button" onClick={() => setAbierto({ fichaId: f.fichaId })} className={`mt-2 ${BTN} border border-dashed border-feisen-borde text-feisen-texto-2 hover:text-feisen-azul hover:border-feisen-azul`}>
                    <Plus size={14} /> Material
                  </button>
                )
              )}

              {ab && primerProceso && (
                <FormMaterial
                  key={ab.materialId || 'nuevo'}
                  material={editando}
                  proceso={primerProceso}
                  nombrePieza={corto(f.ficha?.nombre)}
                  onCerrar={() => setAbierto(null)}
                  onGuardado={() => {
                    setAbierto(null)
                    onCambio()
                  }}
                />
              )}
            </div>
          </section>
        )
      })}
      <div className="px-4 py-2 bg-feisen-gris text-xs text-feisen-texto-2 flex flex-wrap justify-between gap-2">
        <span>{conMaterial} de {hojas.length} piezas con material</span>
        <span className="tabular-nums">Materia prima de la máquina: <b className="font-semibold text-feisen-texto">{cop(totalMaquina)}</b></span>
      </div>
    </div>
  )
}

// "Salen 3 por unidad" o "Usa 2 und por pieza".
function lectura(m) {
  const u = (m.items?.unidad_medida || 'und').toLowerCase()
  const unidad = ['unidad', 'und', 'un', 'u'].includes(u) ? 'unidad' : u
  if (Number(m.rendimiento) > 0) return `salen ${formatNumber(m.rendimiento, m.rendimiento % 1 ? 2 : 0)} de 1 ${unidad}`
  return `usa ${formatNumber(m.cantidad, m.cantidad % 1 ? 2 : 0)} ${unidad === 'unidad' ? (Number(m.cantidad) === 1 ? 'unidad' : 'unidades') : unidad} por pieza`
}

function FormMaterial({ material, proceso, nombrePieza, onCerrar, onGuardado }) {
  const [item, setItem] = useState(material?.item_id ? { id: material.item_id, ...material.items } : null)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [modo, setModo] = useState(material && !(Number(material.rendimiento) > 0) ? 'usa' : 'salen')
  const [numero, setNumero] = useState(material ? String(Number(material.rendimiento) > 0 ? material.rendimiento : material.cantidad) : '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (item || query.trim().length < 2) {
      setResultados([])
      return
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('items').select('id, nombre, precio_costo, unidad_medida').ilike('nombre', `%${query.trim()}%`).eq('activo', true).order('nombre').limit(8)
      setResultados(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [query, item])

  const n = Number(String(numero).replace(',', '.'))
  const cantidad = n > 0 ? (modo === 'salen' ? 1 / n : n) : 0
  const precio = Number(item?.precio_costo || 0)

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!item) return setError('Busca y escoge el material del inventario.')
    if (!(n > 0)) return setError(modo === 'salen' ? '¿Cuántas piezas salen? Escribe un número mayor a 0.' : '¿Cuánto usa? Escribe un número mayor a 0.')
    setGuardando(true)
    const datos = { item_id: item.id, item_nombre_libre: null, cantidad, rendimiento: modo === 'salen' ? n : null }
    const { error: err } = material
      ? await supabase.from('costeo_materiales').update(datos).eq('id', material.id)
      : await supabase.from('costeo_materiales').insert({ ficha_id: proceso.ficha_id, proceso_id: proceso.id, etapa: proceso.nombre, ...datos })
    setGuardando(false)
    if (err) return setError('No se pudo guardar: ' + err.message)
    onGuardado()
  }

  return (
    <form onSubmit={guardar} className="mt-3 rounded-xl border border-feisen-borde bg-white p-3 sm:p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-feisen-texto">{material ? 'Editar material' : 'Agregar material'}</div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="w-9 h-9 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo"><X size={16} /></button>
      </div>

      <span className="block text-xs text-feisen-texto-2 mb-1">Material (del inventario)</span>
      {item ? (
        <div className="flex items-center gap-2 rounded-lg border border-feisen-azul bg-feisen-azul-suave px-3 py-2 text-sm">
          <span className="flex-1 min-w-0 font-medium text-feisen-texto">{tipoTitulo(item.nombre)}</span>
          <span className="tabular-nums text-feisen-texto-2">{precio > 0 ? `${cop(precio)} / ${(item.unidad_medida || 'und').toLowerCase()}` : 'sin precio'}</span>
          <button type="button" onClick={() => setItem(null)} className="text-xs text-feisen-azul hover:underline">Cambiar</button>
        </div>
      ) : (
        <div>
          <label className="relative block">
            <span className="sr-only">Buscar material</span>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-feisen-gris-medio" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej. lamina 3/16, angulo, platina" className={`${CAMPO} pl-8`} />
          </label>
          {resultados.length > 0 && (
            <ul className="mt-1 rounded-lg border border-feisen-borde divide-y divide-feisen-borde-suave max-h-64 overflow-y-auto">
              {resultados.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setItem(r)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-feisen-azul-suave">
                    <span className="flex-1 min-w-0 text-feisen-texto">{tipoTitulo(r.nombre)}</span>
                    <span className="tabular-nums text-xs text-feisen-texto-2">{Number(r.precio_costo) > 0 ? cop(r.precio_costo) : 'sin precio'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && !resultados.length && <p className="mt-1 text-xs text-feisen-texto-2">No hay materiales con ese nombre en el inventario.</p>}
        </div>
      )}

      <fieldset className="mt-3">
        <legend className="block text-xs text-feisen-texto-2 mb-1">¿Cómo lo gasta?</legend>
        <div className="inline-flex rounded-lg border border-feisen-borde p-0.5 bg-feisen-fondo">
          {[
            ['salen', 'Salen varias de 1 unidad'],
            ['usa', 'Usa unidades completas'],
          ].map(([val, txt]) => (
            <button key={val} type="button" aria-pressed={modo === val} onClick={() => setModo(val)} className={`h-9 rounded-md px-3 text-sm ${modo === val ? 'bg-white shadow-sm font-medium text-feisen-texto' : 'text-feisen-texto-2'}`}>
              {txt}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-feisen-texto">
        {modo === 'salen' ? (
          <>
            De 1 {item ? (item.unidad_medida || 'unidad').toLowerCase() : 'unidad'} salen
            <input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="decimal" className="h-10 w-20 rounded-lg border border-feisen-borde px-2 text-right tabular-nums" aria-label="Piezas que salen" />
            {nombrePieza.toLowerCase()}
          </>
        ) : (
          <>
            Cada pieza usa
            <input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="decimal" className="h-10 w-20 rounded-lg border border-feisen-borde px-2 text-right tabular-nums" aria-label="Unidades por pieza" />
            {item ? (item.unidad_medida || 'unidades').toLowerCase() : 'unidades'}
          </>
        )}
      </label>

      {item && n > 0 && (
        <p className="mt-2 text-sm tabular-nums text-feisen-texto-2">
          {precio > 0 ? (
            <>
              {modo === 'salen' ? `${cop(precio)} ÷ ${formatNumber(n, n % 1 ? 2 : 0)}` : `${formatNumber(n, n % 1 ? 2 : 0)} × ${cop(precio)}`} = <b className="font-semibold text-feisen-texto">{cop(cantidad * precio)}</b> por pieza
            </>
          ) : (
            'Este material no tiene precio en el inventario: la pieza va a quedar sin costo de material hasta que se le ponga.'
          )}
        </p>
      )}
      <p className="mt-1 text-xs text-feisen-texto-2">Se registra en la operación «{proceso.nombre}».</p>
      {error && <p className="mt-2 text-sm text-feisen-rojo">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={guardando} className={`${BTN} h-10 bg-feisen-azul text-white font-medium disabled:opacity-60`}>Guardar</button>
        <button type="button" onClick={onCerrar} className={`${BTN} h-10 text-feisen-texto-2 hover:bg-feisen-fondo`}>Cancelar</button>
      </div>
    </form>
  )
}
