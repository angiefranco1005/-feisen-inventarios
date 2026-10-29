import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { cargarConsumo, minimoSugerido, DIAS_CONSUMO, DIAS_COBERTURA } from '../../utils/consumo'
import { coincideBusqueda } from '../../utils/busqueda'
import { Search } from '../shared/iconos'

const cant = n => Number(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })

// Sugerencias de stock mínimo para los productos que no lo tienen, calculadas con
// el consumo real (salidas) de los últimos 90 días. El usuario revisa, ajusta y
// aprueba en lote. Solo trabaja sobre los productos que el perfil puede ver.
export default function ModalMinimosSugeridos({ items, bodegasVisibles, existenciaDe, onCerrar, onAplicado }) {
  const [filas, setFilas]       = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg]           = useState(null)

  useEffect(() => {
    const sinMinimo = items.filter(i => i.activo && !(Number(i.stock_minimo) > 0))
    cargarConsumo({ bodegas: bodegasVisibles }).then(({ porItem, error }) => {
      if (error) setMsg({ tipo: 'error', texto: 'No se pudo calcular el consumo: ' + error.message })
      setFilas(sinMinimo
        .map(i => ({ item: i, consumo: porItem[i.id] || 0, sugerido: minimoSugerido(porItem[i.id]) }))
        .filter(f => f.sugerido)
        .sort((a, b) => b.consumo - a.consumo)
        .map(f => ({ ...f, valor: String(f.sugerido), marcado: true })))
    })
  }, [])

  const visibles = (filas || []).filter(f => coincideBusqueda(`${f.item.nombre} ${f.item.categorias?.nombre || ''}`, busqueda))
  const elegidas = (filas || []).filter(f => f.marcado && Number(f.valor) > 0)
  const actualizar = (id, cambio) => setFilas(fs => fs.map(f => f.item.id === id ? { ...f, ...cambio } : f))
  const todosVisiblesMarcados = visibles.length > 0 && visibles.every(f => f.marcado)

  async function aplicar() {
    setGuardando(true); setMsg(null)
    // Agrupar por valor para hacer pocas actualizaciones
    const porValor = {}
    elegidas.forEach(f => { const v = Number(f.valor); (porValor[v] ||= []).push(f.item.id) })
    const ahora = new Date().toISOString()
    for (const [v, ids] of Object.entries(porValor)) {
      const { error } = await supabase.from('items').update({ stock_minimo: Number(v), updated_at: ahora }).in('id', ids)
      if (error) { setMsg({ tipo: 'error', texto: 'Error guardando mínimos: ' + error.message }); setGuardando(false); return }
    }
    setGuardando(false)
    onAplicado(elegidas.length)
  }

  return (
    <Modal titulo="Mínimos sugeridos por consumo" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm text-feisen-texto-2">
          Para cada producto sin mínimo que tuvo salidas en los últimos {DIAS_CONSUMO} días, sugerimos un mínimo
          igual a <b>{DIAS_COBERTURA} días de consumo</b>. Revisa, ajusta el número si hace falta y aplica.
        </p>
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

        {filas === null ? (
          <p className="text-sm text-gray-400 py-8 text-center">Calculando consumo de {DIAS_CONSUMO} días…</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-feisen-texto-2 py-8 text-center">
            No hay sugerencias: los productos sin mínimo no tuvieron salidas en los últimos {DIAS_CONSUMO} días.
          </p>
        ) : (
          <>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto…"
                className="w-full border border-feisen-borde rounded-lg pl-9 pr-3 py-2 text-sm bg-feisen-fondo focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
            </div>
            <div className="border border-feisen-borde rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2 bg-feisen-fondo text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <input type="checkbox" aria-label="Marcar todos" checked={todosVisiblesMarcados}
                  onChange={e => { const ids = new Set(visibles.map(f => f.item.id)); setFilas(fs => fs.map(f => ids.has(f.item.id) ? { ...f, marcado: e.target.checked } : f)) }}
                  className="rounded border-feisen-borde text-feisen-azul focus:ring-feisen-azul" />
                <span className="flex-1">Producto</span>
                <span className="w-16 text-right hidden sm:block">Salidas</span>
                <span className="w-20 text-right">Mínimo</span>
              </div>
              <div className="max-h-[45vh] overflow-y-auto divide-y divide-feisen-borde-suave">
                {visibles.map(f => (
                  <label key={f.item.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-feisen-fondo">
                    <input type="checkbox" checked={f.marcado} onChange={e => actualizar(f.item.id, { marcado: e.target.checked })}
                      className="rounded border-feisen-borde text-feisen-azul focus:ring-feisen-azul" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-feisen-texto truncate">{f.item.nombre}</span>
                      <span className="block text-[11px] text-gray-400">
                        Hay {cant(existenciaDe(f.item))} {f.item.unidad_medida}<span className="sm:hidden"> · salieron {cant(f.consumo)}</span>
                      </span>
                    </span>
                    <span className="w-16 text-right tabular-nums text-feisen-texto-2 hidden sm:block">{cant(f.consumo)}</span>
                    <input type="number" min="0" step="any" inputMode="decimal" value={f.valor} aria-label={`Mínimo para ${f.item.nombre}`}
                      onChange={e => actualizar(f.item.id, { valor: e.target.value, marcado: true })}
                      onClick={e => e.preventDefault()}
                      className="w-20 border border-feisen-borde rounded-md px-2 py-1 text-right tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex gap-3">
          <button onClick={onCerrar} className="flex-1 border border-feisen-borde rounded-lg py-2.5 text-sm font-medium text-feisen-texto-2 hover:bg-feisen-fondo">Cancelar</button>
          <button onClick={aplicar} disabled={guardando || elegidas.length === 0}
            className="flex-1 bg-feisen-azul text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40">
            {guardando ? 'Aplicando…' : `Aplicar a ${elegidas.length} producto${elegidas.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
