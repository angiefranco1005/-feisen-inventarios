import { createPortal } from 'react-dom'
import { ETAPAS } from './utils/etapas'

const FILAS_MINIMAS = 18

// Planilla en papel para que el jefe de área anote los tiempos en planta.
// Se monta fuera de #root y solo se ve al imprimir (ver reglas @media print en index.css).
export default function PlanillaTiempos({ fichaNombre, estimados }) {
  // Una fila por cada parte + etapa que ya está en Mano de Obra, en el orden de producción.
  const vistas = new Set()
  const sugeridas = []
  for (const f of estimados) {
    const k = `${f.parte || ''}|${f.etapa}`
    if (vistas.has(k)) continue
    vistas.add(k)
    sugeridas.push({ parte: f.parte || '', etapa: f.etapa })
  }
  sugeridas.sort(
    (a, b) => ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa) || a.parte.localeCompare(b.parte)
  )
  const filas = [
    ...sugeridas,
    ...Array.from({ length: Math.max(0, FILAS_MINIMAS - sugeridas.length) }, () => ({ parte: '', etapa: '' })),
  ]

  const celda = 'border border-black px-1.5 h-8 text-[11px] align-middle'

  return createPortal(
    <div className="planilla-impresion text-black font-sans">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-lg font-bold">Feisen — Toma de tiempos de producción</div>
          <div className="text-sm">
            Ficha: <strong>{fichaNombre}</strong>
          </div>
        </div>
        <div className="text-xs text-right leading-6">
          Área: ______________________ &nbsp; Semana del ____/____ al ____/____
          <br />
          Jefe de área: ______________________________
        </div>
      </div>

      <div className="text-[10.5px] border border-black px-2 py-1 mb-2 leading-snug">
        <strong>Cómo llenarla:</strong> una fila por cada vez que se hace una etapa. Anota la hora en que
        empezó y en que terminó, los minutos de pausa (almuerzo, esperas de material, daños) y cuántas
        unidades quedaron <strong>buenas</strong>. Si fueron varios operarios a la vez, pon cuántos.
        Reprocesos o rechazos van en Observaciones. Esto es para costear la máquina, no para evaluar a
        nadie: trabaja a tu ritmo normal.
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-200 text-[10px] uppercase">
            <th className={`${celda} w-[7%]`}>Fecha</th>
            <th className={`${celda} w-[8%]`}>Orden / lote</th>
            <th className={`${celda} w-[13%]`}>Parte</th>
            <th className={`${celda} w-[12%]`}>Etapa</th>
            <th className={`${celda} w-[13%]`}>Responsable</th>
            <th className={`${celda} w-[5%]`}>N° oper.</th>
            <th className={`${celda} w-[6%]`}>Hora inicio</th>
            <th className={`${celda} w-[6%]`}>Hora fin</th>
            <th className={`${celda} w-[6%]`}>Pausas (min)</th>
            <th className={`${celda} w-[6%]`}>Unid. buenas</th>
            <th className={celda}>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="break-inside-avoid">
              <td className={celda}></td>
              <td className={celda}></td>
              <td className={celda}>{f.parte}</td>
              <td className={celda}>{f.etapa}</td>
              <td className={celda}></td>
              <td className={celda}></td>
              <td className={celda}></td>
              <td className={celda}></td>
              <td className={celda}></td>
              <td className={celda}></td>
              <td className={celda}></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-[10px] mt-2 flex justify-between">
        <span>Al terminar la semana entrega esta hoja para cargarla en Costeo → Tiempos reales.</span>
        <span>Firma jefe de área: ______________________</span>
      </div>
    </div>,
    document.body
  )
}
