// Plantilla de Excel para tomar tiempos por etapas (Costeo paso 4; Angie, 2026-11-26).
// Una hoja «Tiempos»: por cada operación interna de la máquina (en el orden de la hoja de ruta) una
// fila gris con «Pieza · n · Operación · Cargo» y debajo sus etapas. Cada etapa: «Piezas que salen
// cada vez» (1 = se hace para cada pieza; 3 = una vez sirve para 3 piezas, ej. subir la lámina de la
// que salen 3 conos), 10 lecturas en segundos y, calculado en el Excel, promedio, segundos por pieza y
// si bastan las lecturas (fórmula del estudio de tiempos, 95 % de confianza y ±5 % de error):
//   n' = ( 40 · √(n·Σx² − (Σx)²) / Σx )²
// La columna A (oculta) lleva el código: P:<proceso> en la fila de la operación, E:<etapa> en etapas
// ya guardadas, vacía en etapas nuevas o sugeridas, T en el total. Al leer, una etapa sin código se crea.
// Mismos cuidados que plantillaMoldeo.js: celdas vacías con estilo vía marca + limpieza del XML, y
// «recalcular al abrir» porque las fórmulas no traen valor guardado.
import XLSX from 'xlsx-js-style'

export const LECTURAS = 10
const FILA_ENC = 5 // 1-based
const VACIA = '§VACIA§'
const AZUL = '064794'
const linea = { style: 'thin', color: { rgb: 'D9DEE5' } }
const borde = { top: linea, bottom: linea, left: linea, right: linea }
const relleno = (rgb) => ({ patternType: 'solid', fgColor: { rgb } })
const fuente = (extra = {}) => ({ name: 'Arial', sz: 10, color: { rgb: '1F2937' }, ...extra })
const est = {
  titulo: { font: fuente({ sz: 14, bold: true }) },
  gris: { font: fuente({ sz: 9, color: { rgb: '5B6472' } }), alignment: { wrapText: true, vertical: 'top' } },
  encab: { font: fuente({ bold: true, color: { rgb: 'FFFFFF' } }), fill: relleno(AZUL), alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: borde },
  operacion: { font: fuente({ bold: true, color: { rgb: AZUL } }), fill: relleno('E8EEF7'), border: borde },
  entrada: { font: fuente(), fill: relleno('FFF7CC'), border: borde },
  entradaNum: { font: fuente(), fill: relleno('FFF7CC'), border: borde, alignment: { horizontal: 'right' } },
  calculo: { font: fuente(), fill: relleno('F7F8FA'), border: borde, alignment: { horizontal: 'right' } },
  total: { font: fuente({ bold: true }), fill: relleno('F7F8FA'), border: borde, alignment: { horizontal: 'right' } },
  codigo: { font: fuente({ sz: 8, color: { rgb: '9AA3AF' } }) },
}

// Etapas típicas por operación (se proponen solo si la operación todavía no tiene etapas guardadas).
const SUGERIDAS = [
  [/plasma|oxicorte|laser/, ['Subir lámina a la mesa', 'Cargar programa', 'Cortar', 'Bajar piezas y limpiar escoria']],
  [/cizalla|corte|sierra/, ['Trazar', 'Cortar', 'Retirar pieza']],
  [/dobl/, ['Cuadrar pieza', 'Doblar', 'Retirar pieza']],
  [/rol/, ['Montar en roladora', 'Rolar', 'Desmontar']],
  [/embomb/, ['Montar', 'Embombar', 'Desmontar']],
  [/torn/, ['Montar en torno', 'Tornear', 'Desmontar y medir']],
  [/mecaniz|cnc|fresa/, ['Montar pieza', 'Mecanizar', 'Desmontar y medir']],
  [/taladr/, ['Trazar', 'Taladrar', 'Quitar rebaba']],
  [/sold|pegar|unir/, ['Preparar y puntear', 'Soldar', 'Limpiar escoria']],
  [/arma|ensambl|montar/, ['Alistar piezas', 'Armar', 'Revisar']],
  [/pul|esmeril/, ['Pulir']],
  [/pint/, ['Preparar superficie', 'Pintar', 'Secado']],
]
export function etapasSugeridas(nombreOperacion) {
  const n = String(nombreOperacion || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  return (SUGERIDAS.find(([re]) => re.test(n)) || [null, ['Preparar', 'Hacer la operación', 'Terminar']])[1]
}

// Cuántas lecturas pide la fórmula (null si no se puede calcular todavía).
export function lecturasNecesarias(valores) {
  const xs = valores.map(Number).filter((x) => x > 0)
  const n = xs.length
  if (n < 2) return null
  const s = xs.reduce((a, b) => a + b, 0)
  const ss = xs.reduce((a, b) => a + b * b, 0)
  const dentro = n * ss - s * s
  if (!(s > 0)) return null
  return Math.max(1, Math.ceil(((40 * Math.sqrt(Math.max(0, dentro))) / s) ** 2))
}

const col = (c) => XLSX.utils.encode_col(c)
const C_ID = 0, C_ETAPA = 1, C_PIEZAS = 2, C_L1 = 3
const C_PROM = C_L1 + LECTURAS, C_PIEZA = C_PROM + 1, C_BASTAN = C_PIEZA + 1, C_OPERARIO = C_BASTAN + 1, C_FECHA = C_OPERARIO + 1, C_NOTAS = C_FECHA + 1

const isoAFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

// operaciones: [{ procesoId, titulo, etapas: [{ id|null, nombre, piezas, lecturas: [seg], operario, fecha (iso), notas }] }]
export function construirPlantillaTiempos({ maquina, operaciones }) {
  const ws = {}
  const pon = (r, c, v, s) => {
    const ref = XLSX.utils.encode_cell({ r, c })
    ws[ref] = v === '' || v == null ? { t: 's', v: VACIA, s } : { v, t: typeof v === 'number' ? 'n' : 's', s }
  }
  const formula = (r, c, f, s, z) => {
    ws[XLSX.utils.encode_cell({ r, c })] = { t: 'n', f, s, ...(z ? { z } : {}) }
  }
  const merges = []

  pon(0, C_ETAPA, `Toma de tiempos · ${maquina}`, est.titulo)
  pon(1, C_ETAPA, 'Escribe en las celdas amarillas los SEGUNDOS de cada lectura del cronómetro (o minutos:segundos, ej. 2:15). Para empezar, 10 lecturas por etapa; la columna «¿Bastan?» dice si hacen falta más.', est.gris)
  pon(2, C_ETAPA, '«Piezas que salen cada vez»: 1 si la etapa se hace para cada pieza. Si una vez sirve para varias (ej. subir una lámina de la que salen 3 conos), escribe cuántas. Para agregar una etapa, escríbela en una fila amarilla vacía. No borres las filas azules.', est.gris)
  merges.push({ s: { r: 1, c: C_ETAPA }, e: { r: 1, c: C_NOTAS } }, { s: { r: 2, c: C_ETAPA }, e: { r: 2, c: C_NOTAS } })

  const enc = ['Código', 'Etapa', 'Piezas que salen cada vez', ...Array.from({ length: LECTURAS }, (_, i) => String(i + 1)), 'Promedio (s)', 'Segundos por pieza', '¿Bastan las lecturas?', 'Operario', 'Fecha (dd/mm/aaaa)', 'Notas']
  enc.forEach((t, c) => pon(FILA_ENC - 1, c, t, est.encab))

  let r = FILA_ENC
  for (const op of operaciones) {
    pon(r, C_ID, `P:${op.procesoId}`, est.codigo)
    pon(r, C_ETAPA, op.titulo, est.operacion)
    for (let c = C_PIEZAS; c <= C_NOTAS; c++) pon(r, c, '', est.operacion)
    merges.push({ s: { r, c: C_ETAPA }, e: { r, c: C_NOTAS } })
    r++
    const primera = r
    const filas = [...op.etapas, { id: null, nombre: '', piezas: null, lecturas: [] }, { id: null, nombre: '', piezas: null, lecturas: [] }]
    for (const et of filas) {
      const R = r + 1 // 1-based para fórmulas
      const rango = `${col(C_L1)}${R}:${col(C_L1 + LECTURAS - 1)}${R}`
      pon(r, C_ID, et.id ? `E:${et.id}` : '', est.codigo)
      pon(r, C_ETAPA, et.nombre || '', est.entrada)
      pon(r, C_PIEZAS, et.nombre ? Number(et.piezas) || 1 : '', est.entradaNum)
      for (let i = 0; i < LECTURAS; i++) pon(r, C_L1 + i, et.lecturas?.[i] > 0 ? Math.round(et.lecturas[i] * 10) / 10 : '', est.entradaNum)
      formula(r, C_PROM, `IF(COUNT(${rango})=0,"",AVERAGE(${rango}))`, est.calculo, '0.0')
      formula(r, C_PIEZA, `IF(${col(C_PROM)}${R}="","",${col(C_PROM)}${R}/MAX(1,N(${col(C_PIEZAS)}${R})))`, est.calculo, '0.0')
      const nn = `ROUNDUP((40*SQRT(MAX(0,COUNT(${rango})*SUMSQ(${rango})-SUM(${rango})^2))/SUM(${rango}))^2,0)`
      ws[XLSX.utils.encode_cell({ r, c: C_BASTAN })] = { t: 's', f: `IF(COUNT(${rango})<2,"",IF(${nn}<=COUNT(${rango}),"Sí","Faltan "&(${nn}-COUNT(${rango}))))`, s: est.calculo }
      pon(r, C_OPERARIO, et.operario || '', est.entrada)
      pon(r, C_FECHA, isoAFecha(et.fecha), est.entrada)
      pon(r, C_NOTAS, et.notas || '', est.entrada)
      r++
    }
    pon(r, C_ID, 'T', est.codigo)
    pon(r, C_ETAPA, 'Total por pieza (segundos)', est.total)
    for (let c = C_PIEZAS; c <= C_NOTAS; c++) pon(r, c, '', est.total)
    formula(r, C_PIEZA, `SUM(${col(C_PIEZA)}${primera + 1}:${col(C_PIEZA)}${r})`, est.total, '0.0')
    formula(r, C_PROM, `IF(${col(C_PIEZA)}${r + 1}=0,"",${col(C_PIEZA)}${r + 1}/60)`, est.total, '0.0" min"')
    r += 2
  }

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, FILA_ENC + 1), c: C_NOTAS } })
  ws['!cols'] = [{ wch: 10, hidden: true }, { wch: 34 }, { wch: 12 }, ...Array.from({ length: LECTURAS }, () => ({ wch: 7 })), { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 16 }, { wch: 13 }, { wch: 30 }]
  ws['!rows'] = [{ hpt: 22 }, { hpt: 30 }, { hpt: 30 }, {}, { hpt: 32 }]
  ws['!merges'] = merges

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Tiempos')
  const bruto = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

  const zip = XLSX.CFB.read(new Uint8Array(bruto), { type: 'array' })
  const editar = (ruta, fn) => {
    const e = XLSX.CFB.find(zip, ruta)
    if (!e) return
    e.content = new TextEncoder().encode(fn(new TextDecoder().decode(e.content)))
    e.size = e.content.length
  }
  editar('/xl/worksheets/sheet1.xml', (xml) =>
    xml
      .replace(/<c r="([A-Z]+\d+)"( s="\d+")?( t="(?:str|s|inlineStr)")?>(?:<v>§VACIA§<\/v>|<is><t>§VACIA§<\/t><\/is>)<\/c>/g, '<c r="$1"$2/>')
      .replace(/<sheetView([^>]*?)\/>/, `<sheetView$1><pane xSplit="2" ySplit="${FILA_ENC}" topLeftCell="C${FILA_ENC + 1}" activePane="bottomRight" state="frozen"/></sheetView>`)
  )
  editar('/xl/workbook.xml', (xml) => (xml.includes('<calcPr') ? xml.replace(/<calcPr([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>') : xml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>')))
  return new Uint8Array(XLSX.CFB.write(zip, { fileType: 'zip', type: 'array' }))
}

// Segundos de una celda: número = segundos; "2:15" (texto) = 2 min 15 s; si Excel lo convirtió en hora
// (2:15 → 2 h 15 min), se toma como minutos:segundos; "0:02:15" = h:mm:ss.
function segundosDe(cell) {
  if (!cell || cell.v == null || cell.v === '') return null
  if (cell.t === 'n') {
    const w = String(cell.w || '')
    if (/^\d+:\d{2}(\s*(a|p)\.?\s*m\.?)?$/i.test(w)) return cell.v * 1440
    if (/^\d+:\d{2}:\d{2}/.test(w)) return cell.v * 86400
    return cell.v
  }
  const s = String(cell.v).trim().replace(',', '.')
  const m = s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function fechaDe(cell) {
  if (!cell || cell.v == null || cell.v === '') return null
  if (cell.t === 'n' && cell.v > 40000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(cell.v) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const m = String(cell.w ?? cell.v).trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!m) return null
  const a = m[3].length === 2 ? '20' + m[3] : m[3]
  return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

// → { operaciones: [{ procesoId, fila, etapas: [{ id|null, nombre, piezas, lecturas: [seg], operario, fecha, notas, fila }] }], avisos: [texto] }
export function leerPlantillaTiempos(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets.Tiempos || wb.Sheets[wb.SheetNames[0]]
  if (!ws || !ws['!ref']) throw new Error('El archivo no tiene la hoja «Tiempos».')
  const rango = XLSX.utils.decode_range(ws['!ref'])
  const celda = (r, c) => ws[XLSX.utils.encode_cell({ r, c })]
  const texto = (r, c) => String(celda(r, c)?.v ?? '').trim()
  const operaciones = []
  const avisos = []
  let actual = null
  for (let r = FILA_ENC; r <= rango.e.r; r++) {
    const codigo = texto(r, C_ID)
    if (codigo.startsWith('P:')) {
      actual = { procesoId: codigo.slice(2), titulo: texto(r, C_ETAPA), fila: r + 1, etapas: [] }
      operaciones.push(actual)
      continue
    }
    if (codigo === 'T' || !actual) continue
    const nombre = texto(r, C_ETAPA)
    const lecturas = []
    for (let i = 0; i < LECTURAS; i++) {
      const s = segundosDe(celda(r, C_L1 + i))
      if (s != null && s > 0) lecturas.push(Math.round(s * 100) / 100)
      else if (s != null && s <= 0) avisos.push(`Fila ${r + 1}: se ignoró una lectura en cero o negativa.`)
    }
    if (!nombre) {
      if (lecturas.length) avisos.push(`Fila ${r + 1}: tiene lecturas pero no el nombre de la etapa; no se guardó.`)
      continue
    }
    const p = Number(String(celda(r, C_PIEZAS)?.v ?? '').replace(',', '.'))
    actual.etapas.push({
      id: codigo.startsWith('E:') ? codigo.slice(2) : null,
      nombre,
      piezas: p > 0 ? p : 1,
      lecturas,
      operario: texto(r, C_OPERARIO) || null,
      fecha: fechaDe(celda(r, C_FECHA)),
      notas: texto(r, C_NOTAS) || null,
      fila: r + 1,
    })
  }
  if (!operaciones.length) throw new Error('No encontré operaciones en el archivo. ¿Es la plantilla de tiempos descargada del ERP?')
  return { operaciones, avisos }
}

// Segundos por pieza de una operación: suma de (promedio ÷ piezas que salen cada vez) de las etapas medidas.
export function segundosPorPieza(etapas) {
  return etapas.reduce((s, e) => {
    const xs = (e.lecturas || []).filter((x) => x > 0)
    return xs.length ? s + xs.reduce((a, b) => a + b, 0) / xs.length / (Number(e.piezas) || 1) : s
  }, 0)
}

export function duracion(seg) {
  if (!(seg > 0)) return '—'
  if (seg < 60) return `${Math.round(seg)} s`
  const m = Math.floor(seg / 60)
  const s = Math.round(seg % 60)
  if (m < 60) return s ? `${m} min ${s} s` : `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}
