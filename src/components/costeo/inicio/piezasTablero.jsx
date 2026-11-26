import { tipoTitulo } from '../utils/nombres'
import { pct } from './datosInicio'

// Piezas visuales compartidas por el inicio de Costeo y el tablero de una máquina (estilo Stripe:
// tarjetas blancas, cifra grande, barra que muestra cómo se reparte el precio).

export const COLORES = { mp: '#064794', mo: '#5FA8D3', cif: '#A9BCD6', utilidad: '#16A34A', perdida: '#B4271D' }
export const RAYADO = 'repeating-linear-gradient(135deg, #FFF7E8 0 6px, #FCE9C4 6px 12px)'

// "MEZCLADORA - 2 B" → "Mezcladora 2 bultos"; "MEZCLADORA - 1 1/2 B" → "Mezcladora 1 1/2 bulto"
export function nombreProducto(p) {
  const s = String(p || '').replace(/\s*-\s*/g, ' ').trim()
  const fin = /(^|\s)([2-9]|\d{2,})\s+B$/i.test(s) ? ' bultos' : ' bulto'
  return tipoTitulo(s.replace(/\s+B$/i, '')) + (/\s+B$/i.test(s) ? fin : '')
}

// Barra del precio: MP, MO, CIF y, si el costeo está completo, la utilidad (o la pérdida).
// Si no está completo, el resto va rayado: "sin costear todavía".
export function BarraPrecio({ m, alto = 12, texto }) {
  const { precio, desglose, costo, completo } = m
  if (!(precio > 0)) return <div className="rounded-md bg-[#F1F3F7]" style={{ height: alto }} />
  const w = (v) => `${Math.max(0, Math.min(100, (v / precio) * 100))}%`
  const pierde = costo > precio
  return (
    <div className="flex overflow-hidden rounded-md shadow-[inset_0_0_0_1px_#E5E7EB]" style={{ height: alto }} role="img" aria-label={`Costo ${pct(costo / precio)} del precio`}>
      {pierde ? (
        <div className="flex-1 flex items-center px-3 text-xs font-medium text-white" style={{ background: COLORES.perdida }}>El costo ya pasa el precio</div>
      ) : (
        <>
          <div style={{ width: w(desglose.mp), background: COLORES.mp }} title="Materia prima" />
          <div style={{ width: w(desglose.mo), background: COLORES.mo }} title="Mano de obra" />
          <div style={{ width: w(desglose.cif), background: COLORES.cif }} title="CIF y equipos" />
          {completo ? (
            <div className="flex-1" style={{ background: COLORES.utilidad }} title="Utilidad" />
          ) : (
            <div className="flex-1 flex items-center pl-3 text-xs font-medium text-[#8A5A0A] truncate" style={{ background: RAYADO }}>{texto}</div>
          )}
        </>
      )}
    </div>
  )
}

export function Anillo({ valor, tam = 44, grosor = 5 }) {
  const r = (tam - grosor) / 2 - 1
  const c = 2 * Math.PI * r
  const v = valor === null || valor === undefined ? null : Math.max(0, Math.min(1, valor))
  const color = v === 1 ? '#16A34A' : '#D9A13B'
  const txt = v === null ? '—' : `${Math.round(v * 100)}%`
  return (
    <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} role="img" aria-label={`Avance del costeo ${txt}`} className="flex-none">
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="#ECEEF1" strokeWidth={grosor} />
      {v > 0 && (
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" strokeDasharray={`${v * c} ${c}`} transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />
      )}
      <text x={tam / 2} y={tam / 2 + tam * 0.09} textAnchor="middle" fontSize={tam * 0.24} fontWeight="600" fill="#1F2937">{txt}</text>
    </svg>
  )
}

export function ChipMargen({ m }) {
  if (m.margen === null) return <span className="text-xs rounded-full px-2 py-0.5 bg-[#F1F3F7] text-feisen-texto-2 whitespace-nowrap">Sin dato</span>
  const negativo = m.margen < 0
  const estilo = !m.completo ? 'bg-[#FEF3E2] text-[#92400E]' : negativo ? 'bg-feisen-rojo-suave text-feisen-rojo' : 'bg-[#E7F6EC] text-[#166534]'
  return (
    <span className={`text-xs font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${estilo}`}>
      {negativo ? '▼ ' : ''}{pct(m.margen)}{m.completo ? '' : ' provisional'}
    </span>
  )
}

export function Leyenda({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-feisen-texto-2">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  )
}
