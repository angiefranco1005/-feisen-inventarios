import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import Modal from '../../shared/Modal'
import { formatNumber } from '../utils/format'
import { nombreCorto } from '../utils/nombres'
import { normalizar } from './datosPasos'

// Trae al despiece de costeo las piezas del BOM de fundición (Fundición › BOM:
// maquinas_fundicion + bom_maquina_piezas + items.peso_unitario), para no escribirlas dos veces.
// Cada pieza se busca en el catálogo de piezas de costeo por nombre (sin importar mayúsculas); si no
// existe se crea, y se enlaza dentro del conjunto que se escoja con la cantidad por máquina del BOM.
// No copia el peso: el peso sigue viviendo en Inventarios.

// Puntaje simple para proponer la máquina de fundición que corresponde a la de costeo.
function parecido(a, b) {
  const ta = new Set(normalizar(a).split(/[^a-z0-9/]+/).filter(Boolean))
  const tb = normalizar(b).split(/[^a-z0-9/]+/).filter(Boolean)
  return tb.filter((t) => ta.has(t)).length
}

export default function TraerFundicion({ arbol, filas, onCerrar, onListo }) {
  const raiz = arbol.fichas[arbol.raizId]
  const [maquinas, setMaquinas] = useState(null)
  const [maqId, setMaqId] = useState('')
  const [bom, setBom] = useState(null)
  const [destino, setDestino] = useState(arbol.raizId)
  const [marcadas, setMarcadas] = useState(new Set())
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase
      .from('maquinas_fundicion')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data, error: e }) => {
        if (e) return setError('No se pudieron leer las máquinas de fundición: ' + e.message)
        const lista = data || []
        setMaquinas(lista)
        const mejor = [...lista].sort((a, b) => parecido(raiz?.nombre, b.nombre) - parecido(raiz?.nombre, a.nombre))[0]
        if (mejor && parecido(raiz?.nombre, mejor.nombre) > 0) setMaqId(mejor.id)
      })
  }, [raiz?.nombre])

  // Nombres que ya están en el despiece de esta máquina (en cualquier nivel).
  const yaEstan = useMemo(() => new Set(filas.map((f) => normalizar(f.ficha?.nombre))), [filas])

  useEffect(() => {
    if (!maqId) return setBom(null)
    setBom(undefined)
    supabase
      .from('bom_maquina_piezas')
      .select('id, cantidad_por_maquina, items(id, nombre, peso_unitario)')
      .eq('maquina_id', maqId)
      .then(({ data, error: e }) => {
        if (e) return setError('No se pudo leer el BOM de fundición: ' + e.message)
        const lista = (data || [])
          .filter((b) => b.items)
          .map((b) => ({ id: b.id, nombre: b.items.nombre.trim(), cant: Number(b.cantidad_por_maquina || 0), peso: Number(b.items.peso_unitario || 0) }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
        setBom(lista)
        setMarcadas(new Set(lista.filter((p) => !yaEstan.has(normalizar(p.nombre))).map((p) => p.id)))
      })
  }, [maqId, yaEstan])

  // Destinos: la máquina y sus conjuntos (filas con piezas adentro o de primer nivel).
  const destinos = [{ id: arbol.raizId, nombre: `${raiz?.nombre} (la máquina)` }].concat(
    filas.filter((f) => f.esConjunto || f.nivel === 0).map((f) => ({ id: f.fichaId, nombre: `${'  '.repeat(f.nivel + 1)}${nombreCorto(f.ficha?.nombre, raiz?.nombre)}` }))
  )
  const destinosUnicos = destinos.filter((d, i) => destinos.findIndex((x) => x.id === d.id) === i)

  const elegidas = (bom || []).filter((p) => marcadas.has(p.id))
  const pesoElegido = elegidas.reduce((s, p) => s + p.peso * p.cant, 0)

  function alternar(id) {
    setMarcadas((m) => {
      const n = new Set(m)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  async function traer() {
    setError('')
    if (!elegidas.length) return setError('Marca al menos una pieza.')
    setGuardando(true)
    try {
      for (const p of elegidas) {
        const { data: existentes, error: e0 } = await supabase.from('costeo_fichas').select('id, nombre').eq('tipo', 'pieza').ilike('nombre', p.nombre)
        if (e0) throw new Error(`No se pudo revisar el catálogo (${p.nombre}): ${e0.message}`)
        let pieza = (existentes || []).find((c) => normalizar(c.nombre) === normalizar(p.nombre))
        if (pieza?.id === destino) throw new Error(`"${p.nombre}" no puede ir dentro de sí misma.`)
        if (!pieza) {
          const { data, error } = await supabase.from('costeo_fichas').insert({ nombre: p.nombre, tipo: 'pieza' }).select('id, nombre').single()
          if (error) throw new Error(`No se pudo crear ${p.nombre}: ${error.message}`)
          pieza = data
        }
        const { error } = await supabase.from('costeo_ficha_piezas').insert({ contenedor_id: destino, pieza_id: pieza.id, cantidad: p.cant > 0 ? p.cant : 1 })
        if (error) throw new Error(`No se pudo agregar ${p.nombre}: ${error.message}`)
      }
      await onListo()
    } catch (e) {
      setError(e.message + ' Las piezas anteriores a esa sí quedaron agregadas.')
      setGuardando(false)
    }
  }

  return (
    <Modal titulo="Traer piezas de fundición" onCerrar={onCerrar}>
      <div className="space-y-4 text-sm">
        <p className="text-feisen-texto-2">Copia al despiece las piezas del BOM de Fundición, con su cantidad por máquina. Las que ya están en el despiece salen sin marcar.</p>

        <label className="block">
          <span className="block text-xs text-feisen-texto-2 mb-1">Máquina en el BOM de Fundición</span>
          <select value={maqId} onChange={(e) => setMaqId(e.target.value)} className="h-10 w-full rounded-lg border border-feisen-borde bg-white px-3">
            <option value="">Escoge la máquina…</option>
            {(maquinas || []).map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-feisen-texto-2 mb-1">¿Dentro de qué conjunto van?</span>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-10 w-full rounded-lg border border-feisen-borde bg-white px-3 whitespace-pre">
            {destinosUnicos.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </label>

        {bom === undefined && <p className="text-feisen-texto-2">Cargando piezas…</p>}
        {bom && !bom.length && <p className="text-feisen-texto-2">Esta máquina no tiene piezas en el BOM de Fundición.</p>}
        {bom && bom.length > 0 && (
          <div className="border border-feisen-borde rounded-lg overflow-hidden">
            <div className="grid grid-cols-[36px_minmax(0,1fr)_56px_88px] bg-feisen-gris text-xs text-feisen-texto-2 font-medium">
              <span />
              <span className="px-2 py-2">Pieza</span>
              <span className="px-2 py-2 text-right">Cant.</span>
              <span className="px-2 py-2 text-right">Peso c/u</span>
            </div>
            {bom.map((p) => {
              const esta = yaEstan.has(normalizar(p.nombre))
              return (
                <label key={p.id} className="grid grid-cols-[36px_minmax(0,1fr)_56px_88px] items-center border-t border-feisen-borde-suave min-h-[44px] cursor-pointer hover:bg-feisen-fondo">
                  <span className="grid place-items-center">
                    <input type="checkbox" checked={marcadas.has(p.id)} onChange={() => alternar(p.id)} className="w-4 h-4" />
                  </span>
                  <span className="px-2 py-2 text-feisen-texto">
                    {p.nombre}
                    {esta && <span className="ml-2 text-xs text-feisen-texto-2">ya está en el despiece</span>}
                  </span>
                  <span className="px-2 py-2 text-right tabular-nums">{formatNumber(p.cant, p.cant % 1 ? 2 : 0)}</span>
                  <span className="px-2 py-2 text-right tabular-nums text-feisen-texto-2">{p.peso ? `${formatNumber(p.peso, 2)} kg` : '—'}</span>
                </label>
              )
            })}
          </div>
        )}

        {error && <p className="text-feisen-rojo">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-feisen-texto-2 tabular-nums">
            {elegidas.length} {elegidas.length === 1 ? 'pieza' : 'piezas'} · {formatNumber(pesoElegido, 2)} kg por máquina
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onCerrar} className="h-10 px-3 rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo">Cancelar</button>
            <button type="button" onClick={traer} disabled={guardando || !elegidas.length} className="h-10 px-4 rounded-lg bg-feisen-azul text-white font-medium disabled:opacity-50">
              {guardando ? 'Trayendo…' : `Traer ${elegidas.length || ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
