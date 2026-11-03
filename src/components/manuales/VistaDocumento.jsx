import { bloquesDocumento, controlCambios, metaDocumento, textoCelda } from './documento'
import { svgDiagrama } from './diagrama'

const fechaCO = iso => iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export function Diagrama({ pasos }) {
  const { svg } = svgDiagrama(pasos)
  return <div className="overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:mx-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}

function Tabla({ columnas, filas }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm border border-feisen-borde">
        <thead><tr className="bg-feisen-azul text-white text-left">{columnas.map(c => <th key={c} className="px-2.5 py-1.5 font-semibold">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-feisen-borde">
          {filas.map((f, i) => (
            <tr key={i} className="align-top">
              {f.map((c, j) => (
                <td key={j} className="px-2.5 py-2 border-l border-feisen-borde first:border-l-0 whitespace-pre-line">
                  {typeof c === 'object' && c ? <><p className="font-semibold text-feisen-texto">{c.titulo}</p>{c.detalle && <p className="text-feisen-texto-2 whitespace-pre-line">{c.detalle}</p>}</> : textoCelda(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Formato({ contenido }) {
  const columnas = (contenido.columnas || []).map(c => c.nombre).filter(Boolean)
  const filas = Math.max(1, Math.min(60, parseInt(contenido.filas, 10) || 15))
  return (
    <div className="space-y-4">
      {contenido.proposito && <p className="text-sm text-feisen-texto-2 italic">{contenido.proposito}</p>}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
        {(contenido.encabezado || []).filter(Boolean).map(c => (
          <p key={c} className="text-sm text-feisen-texto flex gap-2"><span className="shrink-0">{c}:</span><span className="flex-1 border-b border-gray-400" /></p>
        ))}
      </div>
      {columnas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-feisen-borde">
            <thead><tr className="bg-feisen-azul text-white text-left">{columnas.map(c => <th key={c} className="px-2 py-1.5 font-semibold">{c}</th>)}</tr></thead>
            <tbody>{Array.from({ length: Math.min(filas, 6) }, (_, i) => <tr key={i}>{columnas.map(c => <td key={c} className="h-8 border border-feisen-borde" />)}</tr>)}</tbody>
          </table>
          {filas > 6 && <p className="text-xs text-feisen-texto-2 mt-1">… y {filas - 6} filas más en la hoja impresa</p>}
        </div>
      )}
      <div className="h-16 border border-feisen-borde rounded px-2 py-1 text-xs text-feisen-texto-2">Observaciones:</div>
      {(contenido.firmas || []).filter(Boolean).length > 0 && (
        <div className="grid gap-6 pt-6" style={{ gridTemplateColumns: `repeat(${contenido.firmas.filter(Boolean).length}, minmax(0, 1fr))` }}>
          {contenido.firmas.filter(Boolean).map(f => <p key={f} className="border-t border-gray-400 pt-1 text-center text-xs text-feisen-texto">{f}</p>)}
        </div>
      )}
      {(contenido.instrucciones || []).filter(Boolean).length > 0 && (
        <div className="text-xs text-feisen-texto-2"><p className="font-semibold">Cómo se llena</p>
          <ul className="list-disc pl-4">{contenido.instrucciones.filter(Boolean).map(t => <li key={t}>{t}</li>)}</ul></div>
      )}
    </div>
  )
}

// El documento como se verá impreso: encabezado ISO, contenido numerado, firmas y control de cambios
export default function VistaDocumento({ manual, version, contenido, aprobadas = [] }) {
  const meta = metaDocumento(manual, version)
  const cambios = controlCambios(aprobadas)
  const esFormato = manual.tipo === 'formato'
  return (
    <article className="relative bg-white border border-feisen-borde rounded-xl overflow-hidden">
      {meta.borrador && (
        <p className="bg-amber-50 text-amber-800 text-xs font-semibold text-center py-1.5 border-b border-amber-100">BORRADOR · no es válido hasta que se apruebe</p>
      )}
      <header className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto] border-b border-feisen-borde">
        <div className="px-4 py-3 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">{meta.tipo} · {meta.area}</p>
          <h2 className="text-lg font-semibold text-feisen-texto leading-snug">{meta.titulo}</h2>
        </div>
        <dl className="border-l border-feisen-borde px-3 py-2 text-xs grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 content-center">
          <dt className="text-feisen-texto-2">Código</dt><dd className="font-semibold text-right tabular-nums">{meta.codigo}</dd>
          <dt className="text-feisen-texto-2">Versión</dt><dd className="font-semibold text-right">{meta.version}</dd>
          <dt className="text-feisen-texto-2">Vigente</dt><dd className="font-semibold text-right">{meta.vigente ? fechaCO(meta.vigente) : '—'}</dd>
        </dl>
      </header>
      <div className="px-4 sm:px-6 py-5 space-y-3 text-feisen-texto">
        {esFormato ? <Formato contenido={contenido} /> : bloquesDocumento(manual.tipo, contenido).map((b, i) => {
          if (b.tipo === 'titulo') return <h3 key={i} className="text-base font-semibold text-feisen-azul pt-2">{b.texto}</h3>
          if (b.tipo === 'subtitulo') return <h4 key={i} className="text-sm font-semibold pt-1">{b.texto}</h4>
          if (b.tipo === 'parrafo') return <p key={i} className="text-sm leading-relaxed">{b.texto}</p>
          if (b.tipo === 'lista') return <ul key={i} className="list-disc pl-5 text-sm space-y-0.5">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
          if (b.tipo === 'tabla') return <Tabla key={i} columnas={b.columnas} filas={b.filas} />
          if (b.tipo === 'diagrama') return <Diagrama key={i} pasos={b.pasos} />
          return null
        })}
        {!esFormato && (
          <>
            <h3 className="text-base font-semibold text-feisen-azul pt-3">Aprobación</h3>
            <div className="grid grid-cols-3 border border-feisen-borde rounded-lg text-xs divide-x divide-feisen-borde">
              {[['Elaboró', meta.elaboro, meta.fechaElaboro], ['Revisó', meta.reviso, meta.fechaReviso], ['Aprobó', meta.aprobo || (meta.borrador ? 'Pendiente' : ''), meta.fechaAprobo]].map(([t, n, f]) => (
                <div key={t} className="px-2.5 py-2"><p className="text-feisen-texto-2">{t}</p><p className="font-semibold text-sm truncate">{n || '—'}</p><p className="text-feisen-texto-2">{f ? fechaCO(f) : ''}</p></div>
              ))}
            </div>
            {cambios.length > 0 && <>
              <h3 className="text-base font-semibold text-feisen-azul pt-3">Control de cambios</h3>
              <Tabla columnas={['Versión', 'Vigente desde', 'Descripción del cambio']} filas={cambios.map(([v, f, t]) => [v, f ? fechaCO(f) : '—', t])} />
            </>}
          </>
        )}
      </div>
    </article>
  )
}
