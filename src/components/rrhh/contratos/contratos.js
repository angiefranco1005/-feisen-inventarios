// Contratos (pedido de Angie, 2026-11-26): cada cargo tiene plantillas en Word, una por tipo
// de contrato (un cargo puede contratarse de varias formas). La plantilla lleva campos entre
// llaves, p. ej. {nombre} o {salario}; al generar, se llenan con la ficha de la persona y el
// cargo (editables antes de descargar). Las plantillas se escriben sobre la plantilla base con
// el membrete de Feisen (public/plantillas/plantilla_base_contrato_feisen.docx).
import { NIT_FEISEN } from '../../../utils/exportOrdenCompraPDF'
import { TIPOS_DOCUMENTO, nombreCompleto } from '../catalogosRRHH'

export const PLANTILLA_BASE_URL = '/plantillas/plantilla_base_contrato_feisen.docx'

// Campos que se pueden usar en las plantillas (el orden es el del formulario)
export const CAMPOS_CONTRATO = [
  { k: 'nombre',           label: 'Nombre completo' },
  { k: 'tipo_documento',   label: 'Tipo de documento' },
  { k: 'documento',        label: 'Número de documento' },
  { k: 'lugar_expedicion', label: 'Lugar de expedición' },
  { k: 'direccion',        label: 'Dirección' },
  { k: 'ciudad',           label: 'Ciudad de residencia' },
  { k: 'celular',          label: 'Celular' },
  { k: 'correo',           label: 'Correo' },
  { k: 'cargo',            label: 'Cargo' },
  { k: 'area',             label: 'Área' },
  { k: 'tipo_contrato',    label: 'Tipo de contrato' },
  { k: 'fecha_inicio',     label: 'Fecha de inicio' },
  { k: 'fecha_fin',        label: 'Fecha de terminación' },
  { k: 'duracion',         label: 'Duración' },
  { k: 'salario',          label: 'Salario / honorarios' },
  { k: 'salario_letras',   label: 'Salario en letras' },
  { k: 'jornada',          label: 'Jornada' },
  { k: 'funciones',        label: 'Funciones del cargo', largo: true },
  { k: 'ciudad_firma',     label: 'Ciudad de firma' },
  { k: 'fecha_hoy',        label: 'Fecha de firma' },
  { k: 'empresa',          label: 'Empresa' },
  { k: 'nit',              label: 'NIT de la empresa' },
]

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const fechaLarga = (iso) => {
  if (!iso) return ''
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${a}`
}
const pesos = (v) => (v === null || v === undefined || v === '' ? '' : `$ ${Math.round(Number(v)).toLocaleString('es-CO')}`)

// Número en letras para el salario ("UN MILLÓN SETECIENTOS CINCUENTA MIL PESOS M/CTE")
const UNI = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE',
  'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO',
  'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
const DEC = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CEN = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']
function cientos(n) {
  if (n === 100) return 'CIEN'
  const c = Math.floor(n / 100), r = n % 100
  const resto = r < 30 ? UNI[r] : `${DEC[Math.floor(r / 10)]}${r % 10 ? ` Y ${UNI[r % 10]}` : ''}`
  return [CEN[c], resto].filter(Boolean).join(' ')
}
export function numeroALetras(valor) {
  const n = Math.round(Number(valor) || 0)
  if (!n) return ''
  const millones = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000
  const partes = []
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${cientos(millones)} MILLONES`)
  if (miles) partes.push(miles === 1 ? 'MIL' : `${cientos(miles)} MIL`)
  if (resto) partes.push(cientos(resto))
  const de = !miles && !resto && millones ? ' DE' : ''
  return `${partes.join(' ')}${de} PESOS M/CTE`
}

// Valores sugeridos para el formulario a partir de la ficha y el cargo
export function valoresContrato(emp, cargo, tipoContrato) {
  const tipoDoc = TIPOS_DOCUMENTO.find(t => t.value === emp.tipo_documento)?.label || emp.tipo_documento || ''
  const funciones = (cargo?.funciones || []).map(f => (typeof f === 'string' ? f : f?.texto || f?.funcion || '')).filter(Boolean)
  return {
    nombre: nombreCompleto(emp).toUpperCase(),
    tipo_documento: tipoDoc,
    documento: emp.numero_documento || '',
    lugar_expedicion: emp.lugar_expedicion || '',
    direccion: emp.direccion || '',
    ciudad: emp.ciudad || '',
    celular: emp.celular || '',
    correo: emp.email_personal || emp.email_corporativo || '',
    cargo: cargo?.nombre || emp.cargo || '',
    area: emp.area || cargo?.area || '',
    tipo_contrato: (tipoContrato || emp.tipo_contrato || '').toUpperCase(),
    fecha_inicio: fechaLarga(emp.fecha_ingreso),
    fecha_fin: fechaLarga(emp.fecha_fin_contrato),
    duracion: emp.duracion_meses ? `${emp.duracion_meses} mes${emp.duracion_meses > 1 ? 'es' : ''}` : '',
    salario: pesos(emp.salario_base),
    salario_letras: numeroALetras(emp.salario_base),
    jornada: emp.jornada || '',
    funciones: funciones.map((f, i) => `${i + 1}. ${f}`).join('\n'),
    ciudad_firma: emp.ciudad || '',
    fecha_hoy: fechaLarga(new Date().toLocaleDateString('en-CA')),
    empresa: 'FEISEN S.A.S.',
    nit: NIT_FEISEN,
  }
}

// Llena la plantilla (ArrayBuffer del .docx) y devuelve el Word generado como Blob.
// Las librerías se cargan solo al generar, para no engordar la app.
export async function llenarPlantilla(buffer, valores) {
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([import('pizzip'), import('docxtemplater')])
  let doc
  try {
    doc = new Docxtemplater(new PizZip(buffer), { paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
    doc.render(valores)
  } catch (err) {
    // Errores de la plantilla (p. ej. una llave sin cerrar): decir cuáles
    const detalles = (err.properties?.errors || []).map(e => e.properties?.explanation).filter(Boolean)
    throw new Error(detalles.length ? `La plantilla tiene errores: ${detalles.join(' · ')}` : `No se pudo llenar la plantilla: ${err.message}`)
  }
  return doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

export const limpiarNombreArchivo = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
