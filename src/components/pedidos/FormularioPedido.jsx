import { useState } from 'react'
import Alerta from '../shared/Alerta'
import { Contador } from '../shared/ui'
import { Plus, Search, Trash2, Camera, X } from '../shared/iconos'

// Formulario de pedido (nuevo y editar). Rediseño 4/11/2026 con el estilo del resto del ERP
// (skill ux-feisen): una lista de productos con divisiones de 1 px en vez de cajas grises,
// contador y prioridad como en Movimientos, etiquetas pequeñas en mayúscula y botones de 44 px.

export const UNIDADES = ['und', 'kg', 'g', 'lb', 'm', 'cm', 'L', 'ml', 'rollo', 'par', 'caja', 'bulto']

const PRIORIDADES = [
  { valor: 'urgente',       texto: 'Urgente',       activo: 'bg-feisen-rojo-suave text-feisen-rojo' },
  { valor: 'normal',        texto: 'Normal',        activo: 'bg-feisen-azul-suave text-feisen-azul' },
  { valor: 'puede_esperar', texto: 'Puede esperar', activo: 'bg-emerald-50 text-emerald-700' },
]

const normalizar = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Buscador del catálogo: palabras sueltas en cualquier orden, sin tildes ni mayúsculas
// ("polea 8" encuentra "POLEA 8 X 2B"). Si lo escrito no es un producto, se borra al salir.
function SelectorProducto({ value, onSelect, productos }) {
  const [busqueda, setBusqueda] = useState(value || '')
  const [abierto,  setAbierto]  = useState(false)

  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean)
  const filtrados = palabras.length
    ? productos.filter(p => { const n = normalizar(p.nombre); return palabras.every(w => n.includes(w)) })
    : productos

  return (
    <div className="relative w-full min-w-0">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-texto-2 pointer-events-none" />
      <input required value={busqueda}
        onChange={e => { setBusqueda(e.target.value); setAbierto(true); if (!e.target.value) onSelect('', '', null) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => {
          setAbierto(false)
          const coincide = productos.some(p => p.nombre === busqueda)
          if (busqueda && !coincide) { setBusqueda(''); onSelect('', '', null) }
        }, 150)}
        placeholder="Buscar producto…" autoComplete="off"
        className={`w-full h-11 border rounded-lg pl-9 pr-3 text-base sm:text-sm text-feisen-texto placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-feisen-azul ${value ? 'border-feisen-borde font-medium' : 'border-feisen-borde'}`} />
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-feisen-borde rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {filtrados.slice(0, 200).map(p => (
            <button key={p.id} type="button" onMouseDown={() => { setBusqueda(p.nombre); setAbierto(false); onSelect(p.nombre, p.unidad_medida, p.id) }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-feisen-fondo active:bg-feisen-azul-suave border-b border-feisen-borde-suave last:border-0 flex justify-between items-center gap-3">
              <span className="text-feisen-texto">{p.nombre}</span>
              <span className="text-xs text-feisen-texto-2 shrink-0">{p.unidad_medida}</span>
            </button>
          ))}
        </div>
      )}
      {abierto && palabras.length > 0 && filtrados.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-feisen-borde rounded-xl shadow-lg px-3 py-2.5 text-sm text-feisen-texto-2">
          Ningún producto coincide. Prueba con otra palabra.
        </div>
      )}
    </div>
  )
}

const Etiqueta = ({ children, extra }) => (
  <p className="text-xs font-semibold uppercase tracking-wide text-feisen-texto-2 mb-2">
    {children}{extra && <span className="normal-case tracking-normal font-normal"> {extra}</span>}
  </p>
)

export default function FormularioPedido({
  items, setItems, itemVacio, productos,
  prioridad, setPrioridad, obs, setObs,
  foto, setFoto, subiendoFoto, onSubirFoto,
  msg, onSubmit, onCancelar, textoGuardar, guardando,
}) {
  const cambiar = (idx, cambios) => setItems(items.map((it, i) => i === idx ? { ...it, ...cambios } : it))

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      <section>
        <Etiqueta extra={items.length > 1 ? `· ${items.length}` : null}>Productos</Etiqueta>
        <div className="border border-feisen-borde rounded-xl divide-y divide-feisen-borde-suave">
          {items.map((it, idx) => (
            <div key={idx} className="p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 shrink-0 grid place-items-center rounded-md bg-feisen-fondo text-xs font-semibold text-feisen-texto-2 tabular-nums">{idx + 1}</span>
                <SelectorProducto value={it.descripcion} productos={productos}
                  onSelect={(nombre, unidad, itemId) => cambiar(idx, { descripcion: nombre, unidad: unidad || it.unidad, item_id: itemId || null })} />
                {items.length > 1 && (
                  <button type="button" aria-label={`Quitar producto ${idx + 1}`} title="Quitar"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    className="w-11 h-11 shrink-0 grid place-items-center rounded-lg text-feisen-texto-2 hover:text-feisen-rojo hover:bg-feisen-rojo-suave">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 pl-8">
                <Contador valor={it.cantidad} onCambiar={v => cambiar(idx, { cantidad: v })} min={1} ancho="w-20" />
                <select value={it.unidad} onChange={e => cambiar(idx, { unidad: e.target.value })} aria-label="Unidad"
                  className="h-11 border border-feisen-borde rounded-lg px-2.5 text-base sm:text-sm text-feisen-texto bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul">
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setItems([...items, { ...itemVacio }])}
            className="w-full h-11 flex items-center gap-2 px-3 text-sm font-semibold text-feisen-azul hover:bg-feisen-fondo rounded-b-xl">
            <Plus size={16} /> Agregar otro producto
          </button>
        </div>
      </section>

      <section>
        <Etiqueta>Prioridad</Etiqueta>
        <div role="group" className="grid grid-cols-3 gap-1 bg-white border border-feisen-borde rounded-xl p-1">
          {PRIORIDADES.map(o => (
            <button key={o.valor} type="button" aria-pressed={prioridad === o.valor} onClick={() => setPrioridad(o.valor)}
              className={`min-h-[42px] rounded-lg px-1 text-[13px] sm:text-sm font-semibold whitespace-nowrap transition-colors
                ${prioridad === o.valor ? o.activo : 'text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
              {o.texto}
            </button>
          ))}
        </div>
      </section>

      <section>
        <Etiqueta extra="(opcional)">Observaciones</Etiqueta>
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
          className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-base sm:text-sm text-feisen-texto placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-feisen-azul resize-none"
          placeholder="Especificaciones, referencias, para qué es…" />
      </section>

      <section>
        <Etiqueta extra="(opcional)">Foto de muestra</Etiqueta>
        {foto ? (
          <div className="flex items-center gap-3 border border-feisen-borde rounded-xl p-2 pr-3">
            <a href={foto} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <img src={foto} alt="Muestra" className="w-14 h-14 object-cover rounded-lg bg-feisen-fondo" />
            </a>
            <span className="flex-1 text-sm text-feisen-texto">Foto adjunta</span>
            <button type="button" onClick={() => setFoto('')}
              className="inline-flex items-center gap-1 h-11 px-2 text-sm font-medium text-feisen-texto-2 hover:text-feisen-rojo">
              <X size={14} /> Quitar
            </button>
          </div>
        ) : (
          <label className={`flex items-center justify-center gap-2 h-12 rounded-xl border border-dashed text-sm font-medium transition-colors
            ${subiendoFoto ? 'border-feisen-borde text-feisen-texto-2 bg-feisen-fondo' : 'border-feisen-borde text-feisen-texto-2 cursor-pointer hover:border-feisen-azul hover:text-feisen-azul'}`}>
            <Camera size={18} className={subiendoFoto ? 'animate-pulse' : ''} />
            {subiendoFoto ? 'Subiendo foto…' : 'Adjuntar foto de la muestra o referencia'}
            <input type="file" accept="image/*" className="hidden" disabled={subiendoFoto}
              onChange={e => onSubirFoto(e.target.files?.[0])} />
          </label>
        )}
      </section>

      <div className="sticky -bottom-5 -mx-6 -mb-5 px-6 pt-4 pb-5 bg-white border-t border-feisen-borde flex gap-2 sm:justify-end">
        <button type="button" onClick={onCancelar}
          className="flex-1 sm:flex-none h-11 px-5 border border-feisen-borde rounded-xl text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">
          Cancelar
        </button>
        <button type="submit" disabled={guardando || subiendoFoto}
          className="flex-1 sm:flex-none h-11 px-6 bg-feisen-azul text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-60">
          {textoGuardar}
        </button>
      </div>
    </form>
  )
}
