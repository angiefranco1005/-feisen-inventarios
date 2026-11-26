// Plantilla de Excel para planear el moldeo fuera de la app (pedido del jefe de Fundición, 24/11/2026).
// Un archivo = una orden de moldeo, igual que "Nueva orden de moldeo": fecha arriba y dos pestañas:
//   · Por máquina:    un bloque por máquina. Se escribe cuántas máquinas se van a producir y debajo
//                     salen solas sus piezas del BOM (máquinas × cantidad por máquina); a cada pieza
//                     se le asigna el moldeador (ej.: 5 ANDAMIO COLGANTE → 10 PIÑON CORONA ANDAMIO…).
//   · Piezas sueltas: Pieza · Cantidad · Moldeador, para lo que no sale de una máquina.
// A la derecha de "Por máquina" va el resumen: piezas y kg, piezas sin moldeador y carga por moldeador.
// Las listas (piezas, máquinas, BOM y moldeadores) se leen AL DÍA al descargar, por eso no es un
// archivo fijo. Moldeadores: función moldeadores_fundicion() (solo nombres; la lista avisa pero deja
// escribir otro nombre).
//
// xlsx-js-style no escribe listas desplegables ni validaciones: después de armar el libro se abre el
// .xlsx (es un zip) con SheetJS.CFB y se agregan al XML, junto con el encabezado fijo y "recalcular al
// abrir" (las fórmulas no traen valor guardado). Dos cosas que Excel no acepta y que se evitan aquí
// (salía "Encontramos un problema con contenido…"): <dataValidations> después de <ignoredErrors>, y
// celdas de texto vacío (<c t="str"><v></v></c>).
import XLSX from 'xlsx-js-style'
import { supabase } from '../lib/supabase'
import { BODEGA_FUNDICION_ID, CAT_FUNDIDO_HIERRO_ID } from './bodegasCatalogo'

const AZUL = '064794'
const FONT = 'Arial'
const linea = { style: 'thin', color: { rgb: 'D9DEE5' } }
const borde = { top: linea, bottom: linea, left: linea, right: linea }
const relleno = rgb => ({ patternType: 'solid', fgColor: { rgb } })
const fuente = (extra = {}) => ({ name: FONT, sz: 10, color: { rgb: '1F2937' }, ...extra })
const est = {
  titulo:   { font: fuente({ sz: 14, bold: true }) },
  normal:   { font: fuente() },
  gris:     { font: fuente({ sz: 9, color: { rgb: '5B6472' } }) },
  etiqueta: { font: fuente({ bold: true }), alignment: { horizontal: 'right', vertical: 'center' } },
  encab:    { font: fuente({ bold: true, color: { rgb: 'FFFFFF' } }), fill: relleno(AZUL),
              alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: borde },
  maquina:  { font: fuente({ bold: true, color: { rgb: AZUL } }), fill: relleno('E8EEF7'), border: borde },
  maqDato:  { font: fuente({ color: { rgb: '5B6472' } }), fill: relleno('E8EEF7'), border: borde, alignment: { horizontal: 'right' } },
  entrada:  { font: fuente({ bold: true }), fill: relleno('FFF7CC'), border: borde },
  pieza:    { font: fuente(), border: borde, alignment: { indent: 2 } },
  calculo:  { font: fuente(), fill: relleno('F7F8FA'), border: borde, alignment: { horizontal: 'right' } },
  negrita:  { font: fuente({ bold: true }), alignment: { horizontal: 'right' } },
  dato:     { font: fuente(), border: borde },
}
const derecha = s => ({ ...s, alignment: { ...(s.alignment || {}), horizontal: 'right' } })

const FILA_ENC = 6           // encabezado de las tablas (1-based)
const FILAS_SUELTAS = 120
const serialFecha = iso => (Date.UTC(...iso.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0))) - Date.UTC(1899, 11, 30)) / 86400000
const FECHA_MIN = serialFecha('2026-01-01'), FECHA_MAX = serialFecha('2030-12-31')
const VACIA = '§VACIA§'      // marca de celda vacía con estilo (se limpia en el XML, ver sinMarca)
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

// Utilidades para escribir celdas en una hoja
function hoja() {
  const ws = {}
  const pon = (ref, v, s, extra = {}) => {
    ws[ref] = v === '' || v == null ? { t: 's', v: VACIA, s, ...extra } : { v, t: typeof v === 'number' ? 'n' : 's', s, ...extra }
  }
  const formula = (ref, f, s, z) => { ws[ref] = { t: 'n', f, s, ...(z ? { z } : {}) } }
  return { ws, pon, formula }
}

function hojaDatos(encabezados, filas, anchos, notas = []) {
  const { ws, pon } = hoja()
  encabezados.forEach((t, c) => pon(XLSX.utils.encode_cell({ r: 0, c }), t, est.encab))
  filas.forEach((fila, r) => fila.forEach((v, c) => {
    pon(XLSX.utils.encode_cell({ r: r + 1, c }), v, est.dato, typeof v === 'number' ? { z: '#,##0.00' } : {})
  }))
  const colNota = encabezados.length + 1
  notas.forEach((t, r) => pon(XLSX.utils.encode_cell({ r, c: colNota }), t, est.gris))
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, filas.length, notas.length - 1), c: colNota } })
  ws['!cols'] = [...anchos.map(wch => ({ wch })), { wch: 3 }, { wch: 80 }]
  return ws
}

// Arma el .xlsx (Uint8Array).
//   piezas      [{ nombre, peso }]                     catálogo de Fundición
//   maquinas    [{ nombre }]                            máquinas activas
//   bom         [{ maquina, pieza, cantidad, peso }]    piezas por máquina
//   moldeadores [nombre]                                de RRHH (puede venir vacío)
export function construirPlantillaMoldeo({ piezas, maquinas, bom, moldeadores }) {
  const hoy = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
  const nPiezas = piezas.length
  const listaPiezas = `Piezas!$A$2:$A$${1 + nPiezas}`
  const pesoDe = celda => `IFERROR(INDEX(Piezas!$B$2:$B$${1 + nPiezas},MATCH(${celda},${listaPiezas},0)),0)`
  const listaMoldeadores = moldeadores.length ? `Listas!$A$2:$A$${1 + moldeadores.length}` : null
  const validacionMoldeador = sqref => listaMoldeadores && { sqref, tipo: 'list', f1: listaMoldeadores, aviso: true,
    titulo: 'Moldeador', msg: 'Ese nombre no está en la lista de moldeadores de RRHH. ¿Lo deja así?' }

  // ── Pestaña "Por máquina" ──────────────────────────────────────────────────────────────
  const pm = hoja()
  pm.pon('A1', 'Planeación de moldeo · Fundición', est.titulo)
  pm.pon('A2', 'Fecha de la orden', est.etiqueta)
  pm.pon('B2', serialFecha(hoyISO()), est.entrada, { z: 'dd/mm/yyyy' })
  pm.pon('C2', 'vale para las dos pestañas (un archivo = una orden)', est.gris)
  pm.pon('A3', 'En cada máquina escriba cuántas va a producir (celda amarilla): sus piezas del BOM se calculan solas debajo. Luego asigne el moldeador a cada pieza.', est.normal)
  pm.pon('A4', 'Ej.: 5 en ANDAMIO COLGANTE → 10 PIÑON CORONA ANDAMIO, 10 SOPORTE POLEA ANDAMIO y 10 SOPORTE SIN FIN ANDAMIO. Las máquinas que no se producen se dejan en blanco.', est.gris)
  ;['Máquina / pieza', 'Por máquina', 'Cantidad', 'Moldeador', 'Kg (se calcula)']
    .forEach((t, c) => pm.pon(XLSX.utils.encode_cell({ r: FILA_ENC - 1, c }), t, est.encab))

  let r = FILA_ENC + 1
  const filasMaquina = [], filasPieza = []
  const maquinasConBom = maquinas.filter(m => bom.some(b => b.maquina === m.nombre))
  for (const m of maquinasConBom) {
    const suyas = bom.filter(b => b.maquina === m.nombre)
    const fm = r
    filasMaquina.push(fm)
    pm.pon(`A${fm}`, m.nombre, est.maquina)
    pm.pon(`B${fm}`, 'Máquinas a producir →', est.maqDato)
    pm.pon(`C${fm}`, '', derecha(est.entrada), { z: '#,##0' })
    pm.pon(`D${fm}`, `${suyas.length} pieza${suyas.length !== 1 ? 's' : ''} en el BOM`, est.maqDato)
    pm.formula(`E${fm}`, `IF(C${fm}="","",SUM(E${fm + 1}:E${fm + suyas.length}))`, { ...est.maqDato, font: fuente({ bold: true, color: { rgb: AZUL } }) }, '#,##0.00')
    r++
    for (const b of suyas) {
      filasPieza.push(r)
      pm.pon(`A${r}`, b.pieza, est.pieza)
      pm.pon(`B${r}`, Number(b.cantidad) || 0, derecha(est.dato))
      pm.formula(`C${r}`, `IF($C$${fm}="","",$C$${fm}*B${r})`, est.calculo, '#,##0')
      pm.pon(`D${r}`, '', est.entrada)
      pm.formula(`E${r}`, `IF(C${r}="","",C${r}*${pesoDe(`A${r}`)})`, est.calculo, '#,##0.00')
      r++
    }
  }
  const ultimaPm = Math.max(r - 1, FILA_ENC + 1)
  const rango = c => `${c}${FILA_ENC + 1}:${c}${ultimaPm}`

  // Resumen a la derecha (las filas de pieza son las que tienen número en "Por máquina")
  const sueltasPrimera = FILA_ENC + 1, sueltasUltima = FILA_ENC + FILAS_SUELTAS
  const rs = c => `'Piezas sueltas'!${c}${sueltasPrimera}:${c}${sueltasUltima}`
  pm.pon('G6', 'Resumen de la orden', { font: fuente({ bold: true }) })
  pm.pon('G7', 'Piezas a moldear (máquinas)', est.normal)
  pm.formula('H7', `SUMIFS(${rango('C')},${rango('B')},">0")`, est.negrita, '#,##0')
  pm.pon('G8', 'Piezas sueltas', est.normal)
  pm.formula('H8', `SUM(${rs('B')})`, est.negrita, '#,##0')
  pm.pon('G9', 'Kg a moldear (todo)', est.normal)
  pm.formula('H9', `SUMIFS(${rango('E')},${rango('B')},">0")+SUM(${rs('D')})`, est.negrita, '#,##0.00')
  pm.pon('G10', 'Piezas sin moldeador', est.normal)
  pm.formula('H10', `COUNTIFS(${rango('B')},">0",${rango('C')},">0",${rango('D')},"")+COUNTIFS(${rs('B')},">0",${rs('C')},"")`,
    { ...est.negrita, font: fuente({ bold: true, color: { rgb: 'B4271D' } }) }, '#,##0')
  pm.pon('G11', 'Debe quedar en 0 antes de subir el archivo.', est.gris)

  // Carga por moldeador (como "Por moldeador" en la app): piezas y kg en las dos pestañas
  pm.pon('G13', 'Carga por moldeador', { font: fuente({ bold: true }) })
  pm.pon('G14', 'Moldeador', est.encab); pm.pon('H14', 'Piezas', est.encab); pm.pon('I14', 'Kg', est.encab)
  const nombresCarga = moldeadores.length ? moldeadores : []
  nombresCarga.forEach((n, i) => {
    const fr = 15 + i
    pm.pon(`G${fr}`, n, est.dato)
    pm.formula(`H${fr}`, `SUMIFS(${rango('C')},${rango('D')},G${fr},${rango('B')},">0")+SUMIFS(${rs('B')},${rs('C')},G${fr})`, derecha(est.dato), '#,##0')
    pm.formula(`I${fr}`, `SUMIFS(${rango('E')},${rango('D')},G${fr},${rango('B')},">0")+SUMIFS(${rs('D')},${rs('C')},G${fr})`, derecha(est.dato), '#,##0.00')
  })
  if (!nombresCarga.length) pm.pon('G15', 'Sin lista de moldeadores de RRHH: la carga se ve en la app.', est.gris)

  pm.ws['!ref'] = `A1:I${Math.max(ultimaPm, 15 + nombresCarga.length)}`
  pm.ws['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 11 }, { wch: 34 }, { wch: 14 }, { wch: 3 }, { wch: 32 }, { wch: 10 }, { wch: 10 }]
  pm.ws['!rows'] = Object.assign([], { [FILA_ENC - 1]: { hpt: 30 } })

  const validacionesPm = [
    { sqref: 'B2', tipo: 'date', f1: FECHA_MIN, f2: FECHA_MAX, extra: 'operator="between"', titulo: 'Fecha', msg: 'Escriba una fecha, por ejemplo 25/11/2026.' },
    filasMaquina.length && { sqref: filasMaquina.map(f => `C${f}`).join(' '), tipo: 'whole', f1: 0, extra: 'operator="greaterThanOrEqual"',
      titulo: 'Máquinas', msg: 'Escriba cuántas máquinas va a producir (número entero).' },
    filasPieza.length && validacionMoldeador(filasPieza.map(f => `D${f}`).join(' ')),
  ].filter(Boolean)

  // ── Pestaña "Piezas sueltas" ───────────────────────────────────────────────────────────
  const ps = hoja()
  ps.pon('A1', 'Piezas sueltas · Fundición', est.titulo)
  ps.pon('A2', 'Piezas que no salen de una máquina. Van en la misma orden, con la fecha de la pestaña "Por máquina".', est.normal)
  ps.pon('A3', 'Llene solo las celdas amarillas. Deje en blanco las filas que no use.', est.gris)
  ps.pon('A4', 'Pieza: elíjala de la lista (pestaña Piezas). Cantidad: número entero. Moldeador: de la lista o escriba el nombre.', est.gris)
  ;['Pieza', 'Cantidad', 'Moldeador', 'Kg (se calcula)'].forEach((t, c) => ps.pon(XLSX.utils.encode_cell({ r: FILA_ENC - 1, c }), t, est.encab))
  // Sin fila de ejemplo: al subir el archivo se cargaría como una pieza real si nadie la borra
  for (let f = sueltasPrimera; f <= sueltasUltima; f++) {
    ps.pon(`A${f}`, '', est.entrada)
    ps.pon(`B${f}`, '', derecha(est.entrada), { z: '#,##0' })
    ps.pon(`C${f}`, '', est.entrada)
    ps.formula(`D${f}`, `IF(OR(A${f}="",B${f}=""),"",B${f}*${pesoDe(`A${f}`)})`, est.calculo, '#,##0.00')
  }
  ps.ws['!ref'] = `A1:D${sueltasUltima}`
  ps.ws['!cols'] = [{ wch: 44 }, { wch: 11 }, { wch: 34 }, { wch: 14 }]
  ps.ws['!rows'] = Object.assign([], { [FILA_ENC - 1]: { hpt: 30 } })
  const rps = c => `${c}${sueltasPrimera}:${c}${sueltasUltima}`
  const validacionesPs = [
    { sqref: rps('A'), tipo: 'list', f1: listaPiezas, titulo: 'Pieza', msg: 'Elija la pieza de la lista. Si no está, hay que crearla primero en Productos (bodega Fundición).' },
    { sqref: rps('B'), tipo: 'whole', f1: 0, extra: 'operator="greaterThan"', titulo: 'Cantidad', msg: 'La cantidad es un número entero mayor que 0.' },
    validacionMoldeador(rps('C')),
  ].filter(Boolean)

  // ── Pestañas de consulta ───────────────────────────────────────────────────────────────
  const wsBom = hojaDatos(['Máquina', 'Pieza', 'Cantidad por máquina', 'Peso pieza (kg)', 'Kg por máquina'],
    bom.map(b => [b.maquina, b.pieza, Number(b.cantidad) || 0, Number(b.peso) || 0, (Number(b.cantidad) || 0) * (Number(b.peso) || 0)]),
    [36, 40, 12, 12, 12],
    [`Piezas que lleva cada máquina (Fundición › BOM) al ${hoy}.`, 'Viene del sistema: no lo edite aquí. Se cambia en la app, en BOM.'])
  const wsPiezas = hojaDatos(['Pieza', 'Peso (kg)'], piezas.map(p => [p.nombre, Number(p.peso) || 0]), [46, 11],
    [`Catálogo de piezas de Fundición (MATERIAL FUNDIDO HIERRO - FUNDICIÓN) al ${hoy}.`,
     'Viene del sistema: no lo edite aquí. Si falta una pieza, créela primero en Productos.'])
  const wsListas = hojaDatos(['Moldeadores (RRHH)'], moldeadores.map(n => [n]), [40],
    [moldeadores.length ? 'Colaboradores activos de Fundición Hierro con cargo de moldeo en RRHH. No la edite aquí.'
      : 'No llegó la lista de moldeadores de RRHH: el nombre se escribe a mano.'])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, pm.ws, 'Por máquina')
  XLSX.utils.book_append_sheet(wb, ps.ws, 'Piezas sueltas')
  XLSX.utils.book_append_sheet(wb, wsBom, 'BOM')
  XLSX.utils.book_append_sheet(wb, wsPiezas, 'Piezas')
  XLSX.utils.book_append_sheet(wb, wsListas, 'Listas')
  const bruto = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

  // ── Ajustes al XML: celdas vacías, validaciones, encabezado fijo, recalcular al abrir ──
  const xmlValidaciones = lista => `<dataValidations count="${lista.length}">` + lista.map(v =>
    `<dataValidation type="${v.tipo}" ${v.extra || ''} ${v.aviso ? 'errorStyle="warning"' : ''} allowBlank="1" showErrorMessage="1" ` +
    `errorTitle="${xmlEsc(v.titulo)}" error="${xmlEsc(v.msg)}" sqref="${v.sqref}"><formula1>${xmlEsc(v.f1)}</formula1>` +
    `${v.f2 != null ? `<formula2>${v.f2}</formula2>` : ''}</dataValidation>`).join('') + '</dataValidations>'

  const zip = XLSX.CFB.read(new Uint8Array(bruto), { type: 'array' })
  const editar = (ruta, fn) => {
    const e = XLSX.CFB.find(zip, ruta)
    if (!e) return
    e.content = new TextEncoder().encode(fn(new TextDecoder().decode(e.content)))
    e.size = e.content.length
  }
  // Marca de celda vacía → celda sin valor que conserva su estilo (<c r s/>)
  const sinMarca = xml => xml.replace(/<c r="([A-Z]+\d+)"( s="\d+")?( t="(?:str|s|inlineStr)")?>(?:<v>§VACIA§<\/v>|<is><t>§VACIA§<\/t><\/is>)<\/c>/g, '<c r="$1"$2/>')
  const fijarYValidar = validaciones => xml => {
    xml = xml.replace(/<sheetView([^>]*?)\/>/, `<sheetView$1><pane ySplit="${FILA_ENC}" topLeftCell="A${FILA_ENC + 1}" activePane="bottomLeft" state="frozen"/></sheetView>`)
    if (!validaciones.length) return xml
    // dataValidations va antes de estos elementos (orden del esquema; si queda después, Excel pide "reparar")
    const antes = ['<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<rowBreaks', '<colBreaks',
      '<customProperties', '<cellWatches', '<ignoredErrors', '<smartTags', '<drawing', '<legacyDrawing', '<picture',
      '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>']
    const i = Math.min(...antes.map(t => xml.indexOf(t)).filter(n => n >= 0))
    return xml.slice(0, i) + xmlValidaciones(validaciones) + xml.slice(i)
  }
  for (let i = 1; i <= 5; i++) editar(`/xl/worksheets/sheet${i}.xml`, sinMarca)
  editar('/xl/worksheets/sheet1.xml', fijarYValidar(validacionesPm))
  editar('/xl/worksheets/sheet2.xml', fijarYValidar(validacionesPs))
  editar('/xl/workbook.xml', xml => xml.includes('<calcPr')
    ? xml.replace(/<calcPr([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>')
    : xml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>'))
  return new Uint8Array(XLSX.CFB.write(zip, { fileType: 'zip', type: 'array' }))
}

// Lee las listas al día y descarga la plantilla
export async function descargarPlantillaMoldeo() {
  const [rp, rm, rb, rmo] = await Promise.all([
    supabase.from('items').select('nombre, peso_unitario')
      .eq('bodega_id', BODEGA_FUNDICION_ID).eq('categoria_id', CAT_FUNDIDO_HIERRO_ID).eq('activo', true).order('nombre'),
    supabase.from('maquinas_fundicion').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('bom_maquina_piezas').select('maquina_id, cantidad_por_maquina, items(nombre, peso_unitario)'),
    supabase.rpc('moldeadores_fundicion'),
  ])
  if (rp.error) throw rp.error
  if (rm.error) throw rm.error
  if (rb.error) throw rb.error
  const piezas = (rp.data || []).map(i => ({ nombre: i.nombre.trim(), peso: i.peso_unitario }))
  if (piezas.length === 0) throw new Error('No hay piezas en el catálogo de Fundición')
  const maquinas = (rm.data || []).map(m => ({ id: m.id, nombre: m.nombre.trim() }))
  const nombreMaq = Object.fromEntries(maquinas.map(m => [m.id, m.nombre]))
  const bom = (rb.data || []).filter(b => nombreMaq[b.maquina_id])
    .map(b => ({ maquina: nombreMaq[b.maquina_id], pieza: b.items?.nombre?.trim() || '', cantidad: b.cantidad_por_maquina, peso: b.items?.peso_unitario }))
    .sort((a, b) => a.maquina.localeCompare(b.maquina, 'es') || a.pieza.localeCompare(b.pieza, 'es'))
  // Si la función de moldeadores falla (rol sin permiso) la plantilla sale sin esa lista
  const moldeadores = rmo.error ? [] : (rmo.data || []).map(m => `${m.nombres || ''} ${m.apellidos || ''}`.trim()).filter(Boolean)

  const archivo = construirPlantillaMoldeo({ piezas, maquinas, bom, moldeadores })
  const url = URL.createObjectURL(new Blob([archivo], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `Plantilla planeacion moldeo ${hoyISO()}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Subir la plantilla llena ──────────────────────────────────────────────────────────────
// Lee el Excel (ArrayBuffer) y lo convierte en lo que necesita "Nueva orden de moldeo":
//   { fecha: 'YYYY-MM-DD', cantidades: { maquinaId: n }, lineas: [{ item_id, nombre, peso_unitario,
//     cantidad_planeada, asignado_a, origen: 'bom'|'libre' }], avisos: [texto] }
// La cantidad de cada pieza se calcula aquí (máquinas × por máquina), no se confía en el valor que
// Excel guardó. Las piezas se juntan por pieza + moldeador. Lo que no se reconoce va en `avisos`;
// lo que impide cargar lanza un error con el motivo.
const normNombre = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
const numero = v => {
  if (typeof v === 'number') return v
  const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}
const fechaDe = v => {
  if (typeof v === 'number' && v > 30000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const m = String(v ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

export function leerPlantillaMoldeo(buffer, { maquinas, items }) {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const pm = wb.Sheets['Por máquina'], ps = wb.Sheets['Piezas sueltas']
  if (!pm || !ps) throw new Error('El archivo no es la plantilla de planeación de moldeo (faltan las pestañas "Por máquina" y "Piezas sueltas").')
  const val = (ws, ref) => ws[ref]?.v
  if (normNombre(val(pm, 'A6')) === 'FECHA') {
    throw new Error('Esta es la versión anterior de la plantilla (una fecha por fila). Descargue la plantilla nueva con "Descargar plantilla" y vuelva a llenarla.')
  }

  const avisos = []
  const itemPorNombre = new Map(items.map(i => [normNombre(i.nombre), i]))
  const maqPorNombre = new Map(maquinas.map(m => [normNombre(m.nombre), m]))

  let fecha = fechaDe(val(pm, 'B2'))
  if (!fecha) { fecha = hoyISO(); avisos.push('La fecha de la orden no se pudo leer: quedó la de hoy. Revísela.') }

  const ultimaFila = ws => XLSX.utils.decode_range(ws['!ref'] || 'A1:A1').e.r + 1
  const lineas = new Map()   // pieza|moldeador → línea
  const sinCatalogo = new Set()
  let sinMoldeador = 0
  const sumar = (nombrePieza, cantidad, moldeador, origen) => {
    const item = itemPorNombre.get(normNombre(nombrePieza))
    if (!item) { sinCatalogo.add(String(nombrePieza).trim()); return }
    const mold = String(moldeador ?? '').trim()
    if (!mold) sinMoldeador++
    const k = `${item.id}|${normNombre(mold)}`
    const l = lineas.get(k) || { item_id: item.id, nombre: item.nombre, peso_unitario: item.peso_unitario || 0,
      cantidad_planeada: 0, asignado_a: mold, origen }
    l.cantidad_planeada += cantidad
    if (origen === 'bom') l.origen = 'bom'
    lineas.set(k, l)
  }

  // Por máquina: fila de máquina (B = "Máquinas a producir →", C = cuántas) y debajo sus piezas
  const cantidades = {}
  let cantMaquina = 0
  for (let r = FILA_ENC + 1; r <= ultimaFila(pm); r++) {
    const a = val(pm, `A${r}`), b = val(pm, `B${r}`), c = val(pm, `C${r}`), d = val(pm, `D${r}`)
    if (a == null || String(a).trim() === '') continue
    if (typeof b === 'string' && /producir/i.test(b)) {
      cantMaquina = numero(c)
      if (!Number.isFinite(cantMaquina) || cantMaquina < 0) cantMaquina = 0
      cantMaquina = Math.round(cantMaquina)
      if (cantMaquina > 0) {
        const m = maqPorNombre.get(normNombre(a))
        if (m) cantidades[m.id] = cantMaquina
        else avisos.push(`La máquina "${String(a).trim()}" ya no está activa en el sistema: sus piezas sí se cargaron.`)
      }
      continue
    }
    const porMaquina = numero(b)
    if (cantMaquina > 0 && Number.isFinite(porMaquina) && porMaquina > 0) sumar(a, cantMaquina * porMaquina, d, 'bom')
  }

  // Piezas sueltas: Pieza · Cantidad · Moldeador
  for (let r = FILA_ENC + 1; r <= ultimaFila(ps); r++) {
    const a = val(ps, `A${r}`), b = numero(val(ps, `B${r}`)), c = val(ps, `C${r}`)
    if (a == null || String(a).trim() === '') continue
    if (!Number.isFinite(b) || b <= 0) { avisos.push(`Piezas sueltas, fila ${r}: "${String(a).trim()}" no tiene cantidad; no se cargó.`); continue }
    sumar(a, Math.round(b), c, 'libre')
  }

  if (sinCatalogo.size) avisos.push(`No están en el catálogo de Fundición y no se cargaron: ${[...sinCatalogo].join(', ')}.`)
  if (sinMoldeador) avisos.push(`${sinMoldeador} pieza${sinMoldeador !== 1 ? 's quedaron' : ' quedó'} sin moldeador: asígnelo antes de guardar si corresponde.`)
  const resultado = [...lineas.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es') || x.asignado_a.localeCompare(y.asignado_a, 'es'))
  if (resultado.length === 0) throw new Error('La plantilla no tiene nada para moldear: escriba cuántas máquinas producir o agregue piezas sueltas.')
  return { fecha, cantidades, lineas: resultado, avisos }
}
