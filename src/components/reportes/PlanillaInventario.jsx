import { createPortal } from 'react-dom'

const FILAS_EXTRA = 8 // filas en blanco al final para productos que no están en la lista

// Planilla en papel para el conteo físico de una bodega. Conteo a ciegas: no muestra lo
// que dice el sistema, para que quien cuenta no copie el número. Se monta fuera de #root
// y solo se ve al imprimir (ver reglas @media print en index.css).
export default function PlanillaInventario({ bodega, categoria, detalle, items }) {
  // Agrupada por categoría, en el orden en que llegan (categoría y nombre)
  const grupos = []
  for (const it of items) {
    const cat = it.categorias?.nombre?.trim() || 'Sin categoría'
    if (grupos.at(-1)?.cat !== cat) grupos.push({ cat, items: [] })
    grupos.at(-1).items.push(it)
  }
  let n = 0

  const celda = 'border border-black px-1.5 h-7 text-[11px] align-middle'

  return createPortal(
    <div className="planilla-impresion planilla-vertical text-black font-sans">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th colSpan={5} className="text-left font-normal pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-bold">Feisen — Inventario físico</div>
                  <div className="text-sm">
                    Bodega: <strong>{bodega}</strong>
                    {categoria ? <> · Categoría: <strong>{categoria}</strong></> : null}
                    {detalle ? <> · {detalle}</> : null}
                    {' '}· {items.length} productos
                  </div>
                </div>
                <div className="text-xs text-right leading-6 shrink-0">
                  Fecha: ____/____/______
                  <br />
                  Contó: _________________________
                </div>
              </div>
            </th>
          </tr>
          <tr className="bg-gray-200 text-[10px] uppercase">
            <th className={`${celda} w-[6%]`}>N°</th>
            <th className={celda}>Producto</th>
            <th className={`${celda} w-[11%]`}>Unidad</th>
            <th className={`${celda} w-[14%]`}>Cantidad contada</th>
            <th className={`${celda} w-[24%]`}>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={5} className="text-[10.5px] border border-black px-2 py-1 leading-snug">
              <strong>Cómo llenarla:</strong> cuenta cada producto y escribe la cantidad en la unidad indicada.
              Si no hay ninguno, escribe <strong>0</strong> (no dejes la casilla vacía). Lo dañado o
              incompleto va en Observaciones. Si encuentras algo que no está en la lista, anótalo en las filas
              en blanco del final.
            </td>
          </tr>
          {grupos.map(g => [
            grupos.length > 1 && (
              <tr key={`c-${g.cat}`} className="break-inside-avoid">
                <td colSpan={5} className="border border-black px-1.5 h-6 text-[10.5px] font-bold uppercase bg-gray-100">{g.cat}</td>
              </tr>
            ),
            ...g.items.map(it => (
              <tr key={it.id} className="break-inside-avoid">
                <td className={`${celda} text-center tabular-nums`}>{++n}</td>
                <td className={celda}>{it.nombre}</td>
                <td className={celda}>{it.unidad_medida}</td>
                <td className={celda}></td>
                <td className={celda}></td>
              </tr>
            )),
          ])}
          {Array.from({ length: FILAS_EXTRA }, (_, i) => (
            <tr key={`extra-${i}`} className="break-inside-avoid">
              <td className={celda}></td>
              <td className={celda}></td>
              <td className={celda}></td>
              <td className={celda}></td>
              <td className={celda}></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-[10.5px] mt-6 flex justify-between gap-8 break-inside-avoid">
        <span className="flex-1 border-t border-black pt-1">Firma de quien contó</span>
        <span className="flex-1 border-t border-black pt-1">Firma de quien revisó</span>
      </div>
      <div className="text-[10px] mt-3">Entrega esta hoja para pasar el conteo a la app en Inventarios → Inventario físico.</div>
    </div>,
    document.body
  )
}
