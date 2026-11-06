import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Settings2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatNumber } from './utils/format'
import { CENTROS_COSTO } from './utils/centrosCosto'
import ProcesoMateriales from './ProcesoMateriales'
import ProcesoTiempos from './ProcesoTiempos'

// Una rama del árbol: el proceso con su total; abierto muestra materia prima, toma de tiempos
// y de dónde sale el costo de mano de obra y CIF.
export default function ProcesoNodo({ proceso, costo, abierto, onAlternar, onCambio, onSubir, onBajar, numero }) {
  const [editando, setEditando] = useState(false)
  const medido = Number(costo?.mediciones) > 0
  const porHora = proceso.tipo_pago === 'hora'

  return (
    <div>
      <button
        onClick={onAlternar}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-feisen-fondo"
      >
        {abierto ? (
          <ChevronDown size={16} className="text-feisen-texto-2 shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-feisen-texto-2 shrink-0" />
        )}
        <span className="text-xs text-feisen-texto-2 tabular-nums w-5 shrink-0">{numero}.</span>
        <span className="min-w-0">
          <span className="font-medium text-feisen-texto">{proceso.nombre}</span>
          <span className="hidden sm:block text-xs text-feisen-texto-2">
            MP {formatCOP(costo?.total_mp)} · MO {formatCOP(costo?.total_mod)} · CIF {formatCOP(costo?.cif)}
          </span>
        </span>
        {porHora && !medido && (
          <span className="shrink-0 bg-amber-50 text-amber-700 rounded-md px-2 py-0.5 text-xs font-medium">
            Sin tiempos
          </span>
        )}
        <span className="ml-auto font-semibold tabular-nums text-feisen-texto">{formatCOP(costo?.costo_total)}</span>
      </button>

      {abierto && (
        <div className="ml-6 border-l border-feisen-borde pl-4 pr-4 pb-4 space-y-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-feisen-texto-2">
            <span>
              {porHora
                ? `Por hora · ${formatCOP(proceso.tarifa_hora)}/h`
                : `A destajo · ${formatCOP(proceso.precio_destajo)} por unidad`}
            </span>
            <span>Centro de costo: {costo?.centro_costo_usado || '—'}</span>
            <span className="ml-auto flex items-center gap-3">
              {onSubir && (
                <button onClick={onSubir} title="Subir" className="hover:text-feisen-azul">
                  <ArrowUp size={14} />
                </button>
              )}
              {onBajar && (
                <button onClick={onBajar} title="Bajar" className="hover:text-feisen-azul">
                  <ArrowDown size={14} />
                </button>
              )}
              <button onClick={() => setEditando((v) => !v)} className="flex items-center gap-1 text-feisen-azul hover:underline">
                <Settings2 size={14} /> Editar proceso
              </button>
            </span>
          </div>

          {editando && (
            <EditarProceso
              proceso={proceso}
              onListo={() => {
                setEditando(false)
                onCambio()
              }}
            />
          )}

          <ProcesoMateriales proceso={proceso} onCambio={onCambio} />
          <ProcesoTiempos proceso={proceso} onCambio={onCambio} />

          {/* De dónde sale el costo de este proceso */}
          <div className="bg-feisen-fondo rounded-lg p-3 text-sm space-y-1 tabular-nums">
            <Linea label="Materia prima" valor={costo?.total_mp} />
            <Linea
              label={
                porHora
                  ? `Mano de obra: ${formatNumber(costo?.horas_hombre_unidad, 2)} h-h por unidad × ${formatCOP(proceso.tarifa_hora)}`
                  : 'Mano de obra: precio a destajo por unidad'
              }
              valor={costo?.total_mod}
            />
            <Linea
              label={`CIF: ${formatNumber(costo?.horas_hombre_unidad, 2)} h-h × ${formatCOP(costo?.tasa_cif_hora)}/h (${costo?.centro_costo_usado || '—'})`}
              valor={costo?.cif}
            />
            <div className="border-t border-feisen-borde pt-1">
              <Linea label="Total del proceso" valor={costo?.costo_total} fuerte />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Linea({ label, valor, fuerte }) {
  return (
    <div className={`flex justify-between gap-3 ${fuerte ? 'font-semibold text-feisen-texto' : 'text-feisen-texto-2'}`}>
      <span>{label}</span>
      <span className="whitespace-nowrap">{formatCOP(valor)}</span>
    </div>
  )
}

function EditarProceso({ proceso, onListo }) {
  const [f, setF] = useState({
    nombre: proceso.nombre,
    tipo_pago: proceso.tipo_pago,
    tarifa_hora: String(proceso.tarifa_hora ?? ''),
    precio_destajo: String(proceso.precio_destajo ?? ''),
    centro_costo: proceso.centro_costo || '',
  })
  const [error, setError] = useState('')
  const campo = 'w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm outline-none focus:border-feisen-azul bg-white'

  async function guardar(e) {
    e.preventDefault()
    if (!f.nombre.trim()) {
      setError('El proceso necesita un nombre.')
      return
    }
    const { error } = await supabase
      .from('costeo_procesos')
      .update({
        nombre: f.nombre.trim(),
        tipo_pago: f.tipo_pago,
        tarifa_hora: Number(f.tarifa_hora || 0),
        precio_destajo: Number(f.precio_destajo || 0),
        centro_costo: f.centro_costo || null,
      })
      .eq('id', proceso.id)
    if (error) {
      setError('No se pudo guardar: ' + error.message)
      return
    }
    onListo()
  }

  async function eliminar() {
    if (!window.confirm(`¿Quitar "${proceso.nombre}"? Se borran también su materia prima y sus tiempos medidos.`)) return
    const { error } = await supabase.from('costeo_procesos').delete().eq('id', proceso.id)
    if (error) {
      setError('No se pudo quitar: ' + error.message)
      return
    }
    onListo()
  }

  return (
    <form onSubmit={guardar} className="border border-feisen-borde rounded-lg p-3 grid sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs text-feisen-texto-2 mb-1">Proceso</label>
        <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={campo} />
      </div>
      <div>
        <label className="block text-xs text-feisen-texto-2 mb-1">Se paga</label>
        <select value={f.tipo_pago} onChange={(e) => setF({ ...f, tipo_pago: e.target.value })} className={campo}>
          <option value="hora">Por hora</option>
          <option value="destajo">A destajo (por unidad)</option>
        </select>
      </div>
      {f.tipo_pago === 'hora' ? (
        <div>
          <label className="block text-xs text-feisen-texto-2 mb-1">Tarifa por hora (COP)</label>
          <input type="number" step="any" value={f.tarifa_hora} onChange={(e) => setF({ ...f, tarifa_hora: e.target.value })} className={campo} />
        </div>
      ) : (
        <div>
          <label className="block text-xs text-feisen-texto-2 mb-1">Precio por unidad (COP)</label>
          <input type="number" step="any" value={f.precio_destajo} onChange={(e) => setF({ ...f, precio_destajo: e.target.value })} className={campo} />
        </div>
      )}
      <div>
        <label className="block text-xs text-feisen-texto-2 mb-1">Centro de costo (para el CIF)</label>
        <select value={f.centro_costo} onChange={(e) => setF({ ...f, centro_costo: e.target.value })} className={campo}>
          <option value="">El de "Responsables por etapa"</option>
          {CENTROS_COSTO.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-feisen-rojo text-xs sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2 flex items-center gap-3">
        <button type="submit" className="bg-feisen-azul text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-feisen-azul-claro">
          Guardar
        </button>
        <button type="button" onClick={onListo} className="text-sm text-feisen-texto-2 hover:underline">
          Cancelar
        </button>
        <button type="button" onClick={eliminar} className="ml-auto text-sm text-feisen-rojo hover:underline">
          Quitar proceso
        </button>
      </div>
    </form>
  )
}
