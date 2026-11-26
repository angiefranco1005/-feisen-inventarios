// Lee el Excel «CONSECUTIVO EQUIPOS» (una hoja por tipo de equipo) y devuelve las filas para
// consecutivos_importar_excel: [{ t, c, f, of, cl, cap, d, e, obs }].
// Solo se importan las filas con cliente (las demás son números aún sin usar).
// Recibe el libro ya leído con XLSX.read(..., { cellDates: true }) y el módulo XLSX.
import { TIPOS_EQUIPO, empresaDeDocumento } from './tiposEquipo.js'

const limpiar = v => String(v ?? '').replace(/\s+/g, ' ').trim()
const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

// Fechas como vienen en el Excel: Date, serial de Excel, "19/11/2026", "19-11-2026", "4-3-21", "19/11/2026/".
// Día primero. Año fuera de 2015..año siguiente (ej. "14/09/0202", "19/11/2029") → sin fecha.
export function fechaExcel(v, hoy = new Date()) {
  let y, m, d
  if (v instanceof Date && !isNaN(v)) { y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate() }
  else if (typeof v === 'number' && v > 20000 && v < 80000) {
    const t = new Date(Math.round((v - 25569) * 86400000)); y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate()
  } else {
    const s = limpiar(v).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
    if (!s) return null
    d = +s[1]; m = +s[2]; y = +s[3]; if (s[3].length === 2) y += 2000
  }
  if (!(y >= 2015 && y <= hoy.getFullYear() + 1) || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// "CF/2026/791" → "CF/2026/00791" (así lo nombra Odoo FC) · "COT/2026/1171" → "COT/2026/01171" · "CF 6351" → "CF6351"
export function documentoExcel(v) {
  let s = limpiar(v).toUpperCase().replace(/\/+$/, '')
  if (!s || s === '-' || s === '0') return ''
  s = s.replace(/^(CF|COT)\s+(?=\d)/, '$1')
  const m = s.match(/^(CF|COT)\s*\/\s*(\d{4})\s*\/\s*(\d+)$/)
  if (m) return `${m[1]}/${m[2]}/${m[3].padStart(5, '0')}`
  return s
}

// "MZ 1 1/2" / "MEZ 1 1/2" / "MEZCLADORA 1 1/2" → "1 1/2 B" · "1/2" → "1/2 B" · "MZ 2" → "2 B" (mezcladoras); lo demás como viene
export function capacidadExcel(v, tipo) {
  const s = limpiar(v).toUpperCase()
  if (!s) return ''
  if (tipo === 'mezcla' || tipo === 'lite_mix' || tipo === 'mez_esp') {
    const m = s.match(/^(?:MZ|MEZ|MEZCLADORA|LITE\s*MIX)?\.?\s*(\d+(?:\s+\d\/\d)?|\d\/\d)\s*(?:B|BULTOS?)?$/)
    if (m) return `${m[1].replace(/\s+/g, ' ')} B`
  }
  return limpiar(v)
}

function consecutivoExcel(v) {
  const s = limpiar(v).replace(/\.0+$/, '')
  return /^\d+$/.test(s) ? String(Number(s)) : s
}

export function leerLibroConsecutivos(wb, XLSX) {
  const filas = []
  const resumen = []
  const omitidas = []
  for (const nombreHoja of wb.SheetNames) {
    const tipo = TIPOS_EQUIPO.find(t => t.hoja === limpiar(nombreHoja).toUpperCase())
    if (!tipo) { omitidas.push(limpiar(nombreHoja)); continue }
    const datos = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: '', raw: true })
    if (!datos.length) continue
    const enc = datos[0].map(h => sinTildes(limpiar(h).toUpperCase()))
    const col = re => enc.findIndex(h => re.test(h))
    const iF = col(/^FECHA/), iC = col(/CONSECUTIVO|MAQUINA/), iP = col(/PEDIDO/), iCl = col(/^CLIENTE/)
    const iCap = col(/CAPACIDAD/), iD = col(/DESPACHO/)
    // Columna sin título justo después de "orden de despacho" (ej. OTRA RANA: ZANJERA / LAMINA)
    const iExtra = iD >= 0 && !enc[iD + 1] ? iD + 1 : -1
    let n = 0
    for (const r of datos.slice(1)) {
      const cliente = limpiar(r[iCl])
      const c = consecutivoExcel(r[iC])
      if (!cliente || !c) continue
      const pedido = limpiar(r[iP])
      const numOF = /^\d{1,6}$/.test(pedido) ? Number(pedido) : null
      const d = documentoExcel(r[iD])
      const obs = [pedido && numOF === null && pedido !== '-' ? `Pedido: ${pedido}` : '', iExtra >= 0 ? limpiar(r[iExtra]) : '']
        .filter(Boolean).join(' · ')
      filas.push({
        t: tipo.clave, c, f: fechaExcel(r[iF]), of: numOF, cl: cliente,
        cap: iCap >= 0 ? capacidadExcel(r[iCap], tipo.clave) : '', d, e: empresaDeDocumento(d), obs,
      })
      n++
    }
    resumen.push({ tipo: tipo.clave, hoja: limpiar(nombreHoja), filas: n })
  }
  return { filas, resumen, omitidas }
}
