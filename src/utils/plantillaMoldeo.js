// Plantilla de Excel para planear el moldeo fuera de la app (pedido del jefe de Fundición, 24/11/2026).
// Dos pestañas para llenar, como en "Nueva orden de moldeo":
//   · Por máquina:     Fecha · Máquina · Cantidad de máquinas · Moldeador (las piezas salen del BOM)
//   · Piezas sueltas:  Fecha · Pieza · Cantidad · Moldeador
// Las filas con la misma fecha (en las dos pestañas) forman una orden de moldeo. Las listas
// (piezas, máquinas, BOM y moldeadores) se leen AL DÍA al descargar, por eso no es un archivo fijo.
// Moldeadores: función moldeadores_fundicion() (solo nombres; empleados de Fundición Hierro con
// cargo de moldeo). La lista avisa pero deja escribir otro nombre.
//
// xlsx-js-style no escribe listas desplegables ni validaciones: después de armar el libro se
// abre el .xlsx (es un zip) con SheetJS.CFB y se agregan al XML de cada hoja, junto con el
// encabezado fijo y "recalcular al abrir" para que las fórmulas salgan con valor.
import XLSX from 'xlsx-js-style'
import { supabase } from '../lib/supabase'
import { BODEGA_FUNDICION_ID, CAT_FUNDIDO_HIERRO_ID } from './bodegasCatalogo'

const AZUL = '064794'
const FONT = 'Arial'
const linea = { style: 'thin', color: { rgb: 'D9DEE5' } }
const borde = { top: linea, bottom: linea, left: linea, right: linea }
const relleno = rgb => ({ patternType: 'solid', fgColor: { rgb } })
const est = {
  titulo:  { font: { name: FONT, sz: 14, bold: true, color: { rgb: '1F2937' } } },
  normal:  { font: { name: FONT, sz: 10, color: { rgb: '1F2937' } } },
  gris:    { font: { name: FONT, sz: 9, color: { rgb: '5B6472' } } },
  encab:   { font: { name: FONT, sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, fill: relleno(AZUL),
             alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: borde },
  entrada: { font: { name: FONT, sz: 10, color: { rgb: '1F2937' } }, fill: relleno('FFF7CC'), border: borde },
  ejemplo: { font: { name: FONT, sz: 10, italic: true, color: { rgb: '8A93A0' } }, fill: relleno('F1F3F5'), border: borde },
  calculo: { font: { name: FONT, sz: 10, color: { rgb: '1F2937' } }, fill: relleno('F7F8FA'), border: borde },
  negrita: { font: { name: FONT, sz: 10, bold: true, color: { rgb: '1F2937' } }, alignment: { horizontal: 'right' } },
  dato:    { font: { name: FONT, sz: 10, color: { rgb: '1F2937' } }, border: borde },
}
const derecha = s => ({ ...s, alignment: { horizontal: 'right' } })

const FILA_ENC = 6          // encabezado de las tablas (1-based)
const FILAS_VACIAS = 150
const serialFecha = iso => (Date.UTC(...iso.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0))) - Date.UTC(1899, 11, 30)) / 86400000
const VACIA = '§VACIA§'
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const FECHA_MIN = serialFecha('2026-01-01'), FECHA_MAX = serialFecha('2030-12-31')

// Una pestaña para llenar: encabezado, filas de ejemplo (grises), filas vacías (amarillas),
// columna de kg calculada y un resumen a la derecha. Devuelve la hoja y sus validaciones.
function hojaEntrada({ titulo, ayuda, columnas, ejemplos, formulaKg, listaB, listaMoldeadores, errorB }) {
  const ws = {}
  const pon = (ref, v, s, extra = {}) => { ws[ref] = { v, t: typeof v === 'number' ? 'n' : 's', s, ...extra } }
  pon('A1', titulo, est.titulo)
  pon('A2', 'Las filas con la misma fecha (en esta pestaña y en la otra) forman una orden de moldeo.', est.normal)
  pon('A3', 'Llene solo las celdas amarillas. Las filas grises son un ejemplo: bórrelas antes de subir el archivo.', est.gris)
  pon('A4', ayuda, est.gris)
  columnas.forEach((t, i) => pon(XLSX.utils.encode_cell({ r: FILA_ENC - 1, c: i }), t, est.encab))

  const primera = FILA_ENC + 1
  const ultima = primera + ejemplos.length + FILAS_VACIAS - 1
  for (let r = primera; r <= ultima; r++) {
    const ej = ejemplos[r - primera]
    const s = ej ? est.ejemplo : est.entrada
    // Las vacías llevan una marca que después se cambia en el XML por una celda sin valor que conserva
    // el color (<c r s/>). xlsx-js-style no escribe celdas vacías con estilo, y un texto vacío ('')
    // queda como <c t="str"><v></v></c>, que Excel no acepta ("encontramos un problema…").
    const celda = (ref, v, sv, extra = {}) => { if (ej) pon(ref, v, sv, extra); else ws[ref] = { t: 's', v: VACIA, s: sv, ...extra } }
    celda(`A${r}`, ej && serialFecha(ej[0]), s, { z: 'dd/mm/yyyy' })
    celda(`B${r}`, ej && ej[1], s)
    celda(`C${r}`, ej && ej[2], derecha(s), { z: '#,##0' })
    celda(`D${r}`, ej && ej[3], s)
    ws[`E${r}`] = { t: 'n', f: formulaKg(r), z: '#,##0.00', s: derecha(ej ? est.ejemplo : est.calculo) }
  }

  pon('G6', 'Resumen', { font: { name: FONT, sz: 10, bold: true, color: { rgb: '1F2937' } } })
  pon('G7', columnas[2], est.normal)
  ws.H7 = { t: 'n', f: `SUM(C${primera}:C${ultima})`, z: '#,##0', s: est.negrita }
  pon('G8', 'Kg a moldear', est.normal)
  ws.H8 = { t: 'n', f: `SUM(E${primera}:E${ultima})`, z: '#,##0.00', s: est.negrita }
  pon('G9', `${columnas[1]}s que no están en la lista`, est.normal)
  ws.H9 = { t: 'n', f: `SUMPRODUCT((B${primera}:B${ultima}<>"")*ISNA(MATCH(B${primera}:B${ultima},${listaB},0)))`, z: '#,##0', s: est.negrita }
  pon('G10', 'Debe quedar en 0: si no, revise el nombre.', est.gris)

  ws['!ref'] = `A1:H${ultima}`
  ws['!cols'] = [{ wch: 13 }, { wch: 44 }, { wch: 12 }, { wch: 34 }, { wch: 14 }, { wch: 3 }, { wch: 30 }, { wch: 12 }]
  ws['!rows'] = Object.assign([], { [FILA_ENC - 1]: { hpt: 30 } })

  const rango = c => `${c}${primera}:${c}${ultima}`
  const validaciones = [
    { sqref: rango('A'), tipo: 'date', f1: FECHA_MIN, f2: FECHA_MAX, extra: 'operator="between"', titulo: 'Fecha', msg: 'Escriba una fecha, por ejemplo 25/11/2026.' },
    { sqref: rango('B'), tipo: 'list', f1: listaB, titulo: columnas[1], msg: errorB },
    { sqref: rango('C'), tipo: 'whole', f1: 0, extra: 'operator="greaterThan"', titulo: 'Cantidad', msg: 'La cantidad es un número entero mayor que 0.' },
  ]
  // Moldeador: lista de RRHH, pero solo avisa (deja escribir otro nombre)
  if (listaMoldeadores) validaciones.push({ sqref: rango('D'), tipo: 'list', f1: listaMoldeadores, aviso: true,
    titulo: 'Moldeador', msg: 'Ese nombre no está en la lista de moldeadores de RRHH. ¿Lo deja así?' })
  return { ws, validaciones, primera }
}

function hojaDatos(encabezados, filas, anchos, notas = []) {
  const ws = {}
  encabezados.forEach((t, c) => { ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: t || VACIA, s: est.encab } })
  filas.forEach((fila, r) => fila.forEach((v, c) => {
    ws[XLSX.utils.encode_cell({ r: r + 1, c })] = typeof v === 'number'
      ? { t: 'n', v, z: '#,##0.00', s: est.dato } : v ? { t: 's', v, s: est.dato } : { t: 's', v: VACIA, s: est.dato }
  }))
  const colNota = encabezados.length + 1
  notas.forEach((t, r) => { ws[XLSX.utils.encode_cell({ r, c: colNota })] = { t: 's', v: t, s: est.gris } })
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
  const listaPiezas = `Piezas!$A$2:$A$${1 + piezas.length}`
  const listaMaquinas = `Listas!$A$2:$A$${1 + Math.max(1, maquinas.length)}`
  const listaMoldeadores = moldeadores.length ? `Listas!$C$2:$C$${1 + moldeadores.length}` : null
  const mold = i => moldeadores[i] || `Moldeador ${i + 1}`
  const conBom = maquinas.filter(m => bom.some(b => b.maquina === m.nombre))
  const maqEj = (conBom[0] || maquinas[0])?.nombre || ''
  const existe = new Set(piezas.map(p => p.nombre))
  const pieza = (n, i) => existe.has(n) ? n : piezas[i]?.nombre || ''

  const porMaquina = hojaEntrada({
    titulo: 'Planeación de moldeo por máquina · Fundición',
    ayuda: 'Máquina: elíjala de la lista; las piezas salen solas del BOM (pestaña BOM). Moldeador: elíjalo de la lista o escriba el nombre.',
    columnas: ['Fecha', 'Máquina', 'Cantidad de máquinas', 'Moldeador', 'Kg (se calcula)'],
    ejemplos: maqEj ? [['2026-11-25', maqEj, 4, mold(0)]] : [],
    formulaKg: r => `IF(OR(B${r}="",C${r}=""),"",C${r}*SUMIF(BOM!$A:$A,B${r},BOM!$E:$E))`,
    listaB: listaMaquinas, listaMoldeadores,
    errorB: 'Elija la máquina de la lista. Si no está, hay que crearla primero en Fundición › BOM.',
  })
  const sueltas = hojaEntrada({
    titulo: 'Planeación de moldeo · piezas sueltas · Fundición',
    ayuda: 'Pieza: elíjala de la lista (pestaña Piezas). Cantidad: piezas a moldear, número entero. Moldeador: elíjalo de la lista o escriba el nombre.',
    columnas: ['Fecha', 'Pieza', 'Cantidad planeada', 'Moldeador', 'Kg (se calcula)'],
    ejemplos: [
      ['2026-11-25', pieza('PIÑON 1 BULTO', 0), 4, mold(0)],
      ['2026-11-26', pieza('POLEA 4 X 2B', 1), 20, mold(1)],
    ],
    formulaKg: r => `IF(OR(B${r}="",C${r}=""),"",C${r}*IFERROR(INDEX(Piezas!$B$2:$B$${1 + piezas.length},MATCH(B${r},${listaPiezas},0)),0))`,
    listaB: listaPiezas, listaMoldeadores,
    errorB: 'Elija la pieza de la lista. Si no está, hay que crearla primero en Productos (bodega Fundición).',
  })

  const wsPiezas = hojaDatos(['Pieza', 'Peso (kg)'], piezas.map(p => [p.nombre, Number(p.peso) || 0]), [46, 11],
    [`Catálogo de piezas de Fundición (MATERIAL FUNDIDO HIERRO - FUNDICIÓN) al ${hoy}.`,
     'Viene del sistema: no lo edite aquí. Si falta una pieza, créela primero en Productos.'])
  const wsBom = hojaDatos(['Máquina', 'Pieza', 'Cantidad por máquina', 'Peso pieza (kg)', 'Kg por máquina'],
    bom.map(b => [b.maquina, b.pieza, Number(b.cantidad) || 0, Number(b.peso) || 0, (Number(b.cantidad) || 0) * (Number(b.peso) || 0)]),
    [36, 40, 12, 12, 12],
    [`Piezas que lleva cada máquina (Fundición › BOM) al ${hoy}.`, 'Viene del sistema: no lo edite aquí. Se cambia en la app, en BOM.'])
  const largo = Math.max(maquinas.length, moldeadores.length)
  const wsListas = hojaDatos(['Máquinas', '', 'Moldeadores (RRHH)'],
    Array.from({ length: largo }, (_, i) => [maquinas[i]?.nombre ?? '', '', moldeadores[i] ?? '']), [36, 3, 40],
    ['Listas para los desplegables. Vienen del sistema: no las edite aquí.',
     moldeadores.length ? 'Moldeadores: colaboradores activos de Fundición Hierro con cargo de moldeo en RRHH.'
       : 'No llegó la lista de moldeadores de RRHH: en la plantilla se escribe el nombre a mano.'])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, porMaquina.ws, 'Por máquina')
  XLSX.utils.book_append_sheet(wb, sueltas.ws, 'Piezas sueltas')
  XLSX.utils.book_append_sheet(wb, wsBom, 'BOM')
  XLSX.utils.book_append_sheet(wb, wsPiezas, 'Piezas')
  XLSX.utils.book_append_sheet(wb, wsListas, 'Listas')
  const bruto = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

  // Validaciones, encabezado fijo y "recalcular al abrir", agregados al XML
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
  const fijarYValidar = (primera, validaciones) => xml => {
    xml = xml.replace(/<sheetView([^>]*?)\/>/, `<sheetView$1><pane ySplit="${primera - 1}" topLeftCell="A${primera}" activePane="bottomLeft" state="frozen"/></sheetView>`)
    // dataValidations va antes de estos elementos (orden del esquema; si queda después, Excel pide "reparar"
    // el archivo). SheetJS escribe <ignoredErrors> justo después de <sheetData>.
    const antes = ['<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<rowBreaks', '<colBreaks',
      '<customProperties', '<cellWatches', '<ignoredErrors', '<smartTags', '<drawing', '<legacyDrawing', '<picture',
      '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>']
    const i = Math.min(...antes.map(t => xml.indexOf(t)).filter(n => n >= 0))
    return xml.slice(0, i) + xmlValidaciones(validaciones) + xml.slice(i)
  }
  // Marcas de celda vacía → celda sin valor con su estilo, en todas las hojas
  const sinMarca = xml => xml.replace(/<c r="([A-Z]+\d+)"( s="\d+")?( t="(?:str|s|inlineStr)")?>(?:<v>§VACIA§<\/v>|<is><t>§VACIA§<\/t><\/is>)<\/c>/g, '<c r="$1"$2/>')
  for (let i = 1; i <= 5; i++) editar(`/xl/worksheets/sheet${i}.xml`, sinMarca)
  editar('/xl/worksheets/sheet1.xml', fijarYValidar(porMaquina.primera, porMaquina.validaciones))
  editar('/xl/worksheets/sheet2.xml', fijarYValidar(sueltas.primera, sueltas.validaciones))
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
  // Si la función de moldeadores falla (rol sin permiso, aún no creada) la plantilla sale sin esa lista
  const moldeadores = rmo.error ? [] : (rmo.data || []).map(m => `${m.nombres || ''} ${m.apellidos || ''}`.trim()).filter(Boolean)

  const archivo = construirPlantillaMoldeo({ piezas, maquinas, bom, moldeadores })
  const url = URL.createObjectURL(new Blob([archivo], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `Plantilla planeacion moldeo ${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
