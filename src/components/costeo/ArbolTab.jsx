import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatCOP } from './utils/format'
import { cargarArbol, recorrerArbol } from './utils/arbolCosteo'
import RamaFicha from './RamaFicha'

// Árbol de costeo de una ficha, por niveles:
//   máquina → procesos (materia prima, toma de tiempos, CIF) y sub-piezas,
//   cada sub-pieza → sus propios procesos y sub-piezas, a cualquier profundidad.
// Los costos vienen de las vistas costeo_procesos_resumen y costeo_resumen (que ya suma las
// sub-piezas por niveles). La mano de obra sale SOLO del tiempo real medido: lo que falta medir
// se avisa arriba, con la ruta de la pieza, para no confiar en un costo incompleto.
export default function ArbolTab({ fichaId }) {
  const [arbol, setArbol] = useState(null)
  const [error, setError] = useState('')
  const [abiertos, setAbiertos] = useState(() => new Set())

  async function recargar() {
    try {
      setArbol(await cargarArbol(fichaId))
    } catch (e) {
      setError('No se pudo cargar el árbol: ' + (e.message || e))
    }
  }

  useEffect(() => {
    setArbol(null)
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId])

  function alternar(clave, abrir) {
    setAbiertos((s) => {
      const n = new Set(s)
      if (abrir === true) n.add(clave)
      else if (n.has(clave)) n.delete(clave)
      else n.add(clave)
      return n
    })
  }

  if (error) return <p className="text-sm text-feisen-rojo">{error}</p>
  if (!arbol) return <p className="text-sm text-feisen-texto-2">Cargando…</p>

  // Avisos de todo el árbol, con la ruta de la pieza donde está el proceso.
  const sinTiempos = []
  const sinTarifa = []
  const sinCentro = []
  recorrerArbol(arbol, (id, ruta) => {
    for (const p of arbol.procesos[id] || []) {
      const etiqueta = [...ruta, p.nombre].join(' › ')
      const c = arbol.costos[p.id]
      // Por persona (línea de mano de obra): por hora sin mediciones, o sin tarifa / valor
      if (Number(c?.lineas_sin_tiempo) > 0) sinTiempos.push(etiqueta)
      if (Number(c?.lineas_sin_tarifa) > 0) sinTarifa.push(etiqueta)
      if (c?.centro_costo_usado === 'Sin centro') sinCentro.push(etiqueta)
    }
  })
  const unicos = (l) => [...new Set(l)]
  const resumen = arbol.resumen[fichaId]

  return (
    <div className="space-y-4">
      {/* Total y desglose */}
      <div className="bg-white border border-feisen-borde rounded-xl p-4">
        <p className="text-xs uppercase tracking-wide text-feisen-texto-2">Costo total por unidad</p>
        <p className="text-3xl font-semibold text-feisen-texto tabular-nums mt-1">{formatCOP(resumen?.costo_total)}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-feisen-texto-2 tabular-nums">
          <span>Materia prima {formatCOP(resumen?.total_mp)}</span>
          <span>Mano de obra {formatCOP(resumen?.total_mod)}</span>
          <span>CIF {formatCOP(resumen?.cif_asignado)}</span>
          {Number(resumen?.total_equipos) > 0 && <span>Equipos {formatCOP(resumen.total_equipos)}</span>}
          {Number(resumen?.costo_piezas_incluidas) > 0 && (
            <span>Sub-piezas {formatCOP(resumen.costo_piezas_incluidas)}</span>
          )}
        </div>
        {resumen?.cif_periodo_usado && (
          <p className="text-xs text-feisen-texto-2 mt-2">CIF con las tasas del período {resumen.cif_periodo_usado}.</p>
        )}
      </div>

      {/* Avisos: lo que deja el costo incompleto va primero */}
      {(sinTiempos.length > 0 || sinTarifa.length > 0 || sinCentro.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 space-y-1">
          {sinTiempos.length > 0 && (
            <Aviso>
              <b>Costo incompleto, sin tiempos medidos</b> (no suman mano de obra ni CIF): {unicos(sinTiempos).join(', ')}.
            </Aviso>
          )}
          {sinTarifa.length > 0 && (
            <Aviso>Sin tarifa: {unicos(sinTarifa).join(', ')}. Ábrelo y ponle la tarifa o el valor a cada persona en "Mano de obra".</Aviso>
          )}
          {sinCentro.length > 0 && (
            <Aviso>
              Sin centro de costo, no suman CIF: {unicos(sinCentro).join(', ')}. Escógelo en "Editar proceso" o en Costeo ›
              Responsables por etapa.
            </Aviso>
          )}
        </div>
      )}

      <div className="bg-white border border-feisen-borde rounded-xl">
        <RamaFicha
          arbol={arbol}
          fichaId={fichaId}
          enCamino={new Set([fichaId])}
          abiertos={abiertos}
          alternar={alternar}
          recargar={recargar}
          raiz
        />
      </div>
    </div>
  )
}

function Aviso({ children }) {
  return (
    <p className="flex gap-2">
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </p>
  )
}
