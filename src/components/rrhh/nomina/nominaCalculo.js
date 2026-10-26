// Lógica de la nómina quincenal (sin JSX): modalidades, días laborales,
// cálculo de totales y lectura del archivo del huellero (horas extra sugeridas).
import * as XLSX from 'xlsx'
import { festivosColombia } from '../catalogosRRHH'

export const MODALIDADES = {
  destajo: { label: 'Destajo',  detalle: 'Por pieza',          punto: 'bg-violet-500' },
  dia:     { label: 'Al día',   detalle: 'Por día trabajado',  punto: 'bg-sky-500' },
  fijo:    { label: 'Fijo',     detalle: 'Valor por quincena', punto: 'bg-emerald-500' },
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Nombres de los conceptos según el tipo de vinculación. A los contratistas no
// se les dice "horas extra" ni "recargo" (decisión de Angie, 2026-10-26: para
// ellos son "servicios adicionales"). Ojo: el nombre no cambia la naturaleza de
// la relación; ver OBSERVACIONES (riesgo de contrato realidad).
export const esContratista = (emp, modalidad) => (emp ? emp.tipo_contrato === 'Contratista' : ['destajo', 'dia'].includes(modalidad))
export function etiquetasPago(contratista) {
  return contratista ? {
    extra: 'Servicios adicionales', horas: 'Horas de servicios adicionales', valorHora: 'Valor hora servicio adicional',
    recargo: 'Servicios adicionales domingo/festivo', valorRecargo: 'Valor hora domingo/festivo', aplicar: 'Aplicar servicios adicionales',
  } : {
    extra: 'Horas extra', horas: 'Horas extra', valorHora: 'Valor hora extra',
    recargo: 'Horas domingo/festivo (recargo 100 %)', valorRecargo: 'Valor hora con recargo 100 %', aplicar: 'Aplicar horas extra',
  }
}

// Modalidad de pago según el contrato de la ficha
export function modalidadDe(emp) {
  if (emp?.tipo_contrato === 'Contratista') return emp.tipo_vinculacion === 'destajo' ? 'destajo' : 'dia'
  return 'fijo'
}

const pad = (n) => String(n).padStart(2, '0')

export function rangoQuincena(anio, mes, quincena) {
  const ultimo = new Date(anio, mes, 0).getDate()
  return {
    inicio: `${anio}-${pad(mes)}-${quincena === 1 ? '01' : '16'}`,
    fin: `${anio}-${pad(mes)}-${quincena === 1 ? '15' : pad(ultimo)}`,
  }
}

export function nombreQuincena(p) {
  const { inicio, fin } = rangoQuincena(p.anio, p.mes, p.quincena)
  return `Del ${Number(inicio.slice(8))} al ${Number(fin.slice(8))} de ${MESES[p.mes - 1]} ${p.anio}`
}

// Días laborales de Feisen: lunes a viernes sin festivos. Verificado contra la
// planilla de Excel 2026 (p. ej. 1–15 oct = 10 días, 16–30 sep = 11).
export function esDiaLaboral(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  const dia = new Date(a, m - 1, d).getDay()
  return dia >= 1 && dia <= 5 && !festivosColombia(a).has(iso)
}

function* diasEntre(ini, fin) {
  const [a, m, d] = ini.split('-').map(Number)
  for (let x = new Date(a, m - 1, d); ; x.setDate(x.getDate() + 1)) {
    const iso = `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
    if (iso > fin) return
    yield iso
  }
}

export function diasLaborales(ini, fin) {
  let n = 0
  for (const iso of diasEntre(ini, fin)) if (esDiaLaboral(iso)) n++
  return n
}

// Días laborales de la quincena que la persona no trabajó por novedades no
// remuneradas (incapacidades, vacaciones, permisos/licencias no remunerados).
// Los permisos por horas no descuentan días.
export function diasAusente(novedades, ini, fin) {
  const dias = new Set()
  for (const n of novedades) {
    if (n.por_horas || n.remunerado === true) continue
    const desde = n.fecha_inicio > ini ? n.fecha_inicio : ini
    const hasta = n.fecha_fin < fin ? n.fecha_fin : fin
    if (desde > hasta) continue
    for (const iso of diasEntre(desde, hasta)) if (esDiaLaboral(iso)) dias.add(iso)
  }
  return dias.size
}

const num = (v) => Number(v) || 0
export const sumaLista = (lista) => (lista || []).reduce((t, x) => t + num(x?.valor), 0)

export const valorHorasRecargo = (liq) => num(liq.horas_extra_recargo) * num(liq.valor_hora_extra) * 2

// Totales de una liquidación. Todos los conceptos suman si tienen valor
// (un destajo puede tener además horas extra u otros, como en el Excel).
export function calcularTotales(liq, piezas = []) {
  const total_piezas = piezas.reduce((t, p) => t + num(p.cantidad) * num(p.valor_unitario), 0)
  const total_devengado = total_piezas
    + num(liq.dias) * num(liq.valor_dia)
    + num(liq.horas_extra) * num(liq.valor_hora_extra)
    + num(liq.horas_extra_recargo) * num(liq.valor_hora_extra) * 2   // domingo/festivo: recargo del 100 %
    + num(liq.valor_fijo)
    + num(liq.auxilio)
    + num(liq.subsidio_ss)
    + sumaLista(liq.otros_devengos)
    - num(liq.descuento_tiempo_pieza)
  const total_deducciones = num(liq.seguridad) + num(liq.anticipo) + num(liq.dotacion_herramienta) + sumaLista(liq.otras_deducciones)
  const r = (n) => Math.round(n * 100) / 100
  return { total_piezas: r(total_piezas), total_devengado: r(total_devengado), total_deducciones: r(total_deducciones), neto: r(total_devengado - total_deducciones) }
}

// ─── Huellero → horas extra sugeridas ────────────────────────────────────────
// Reglas de Feisen (definidas por Angie, 2026-10-26):
//   • Horario: lunes a jueves 7:30 a. m. – 5:30 p. m.; viernes 7:30 a. m. – 4:00 p. m.
//   • Cuenta como extra llegar antes de las 7:30 y quedarse después de la salida.
//   • Desde 15 minutos cuenta media hora; se redondea a la media hora
//     (15–44 min = 0,5 h; 45–74 min = 1 h; …). Se aplica a cada tramo (antes / después).
//   • Sábado: todo lo trabajado es extra normal.
//   • Domingo y festivo: todo lo trabajado es extra con recargo del 100 %.
// Es SOLO una sugerencia: RRHH verifica si la extra estaba autorizada.
export const HORARIO = { entrada: 7 * 60 + 30, salidaLJ: 17 * 60 + 30, salidaV: 16 * 60 }
export const horasDeMinutos = (min) => (min > 0 ? Math.floor((min + 15) / 30) / 2 : 0)

export const normalizarAlias = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

// Busca el colaborador de un nombre del huellero: primero en los nombres ya
// vinculados; si no, el único colaborador que tenga todas las palabras. La
// última palabra puede venir recortada ("DAGOBERTO NEUT" → "Dagoberto Neuto").
export function emparejarAlias(alias, empleados, mapaAlias) {
  if (mapaAlias.has(alias)) return mapaAlias.get(alias)
  const palabras = alias.split(' ').filter(Boolean)
  if (!palabras.length || palabras.every(p => /^\d+$/.test(p))) return null
  const candidatos = empleados.filter(e => {
    const completo = normalizarAlias(`${e.nombres} ${e.apellidos}`).split(' ')
    return palabras.every((p, i) => completo.includes(p)
      || (i === palabras.length - 1 && palabras.length > 1 && completo.some(c => c.startsWith(p))))
  })
  return candidatos.length === 1 ? candidatos[0].id : null
}

const hhmm = (min) => (min === null || min === undefined ? null : `${pad(Math.floor(min / 60))}:${pad(Math.floor(min % 60))}`)

// Convierte la celda de fecha/hora del huellero en { fecha 'YYYY-MM-DD', minutos del día }
function leerFechaHora(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {                       // número de serie de Excel (días desde 1899-12-30)
    if (v < 1) return null
    const d = new Date(Math.round((v - 25569) * 86400) * 1000)
    return { fecha: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, min: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 }
  }
  if (v instanceof Date) return { fecha: `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`, min: v.getHours() * 60 + v.getMinutes() }
  const m = String(v).trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s*m\.?)?/i)
  if (!m) return null
  let h = Number(m[4])
  const ampm = (m[7] || '').toLowerCase().replace(/[^ap]/g, '')
  if (ampm === 'p' && h < 12) h += 12
  if (ampm === 'a' && h === 12) h = 0
  return { fecha: `${m[3]}-${pad(m[2])}-${pad(m[1])}`, min: h * 60 + Number(m[5]) + (Number(m[6]) || 0) / 60 }
}

// Lee el archivo (Excel o CSV) y devuelve las marcaciones: [{ nombre, fecha, min }]
export function leerArchivoHuellero(buffer) {
  // raw: en CSV deja las fechas como texto; si no, la librería lee "01/10/2026" como 10 de enero (formato EE. UU.)
  const wb = XLSX.read(buffer, { type: 'array', raw: true })
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })
  // Columnas: busca el encabezado "Nombre" y "Fecha/Hora"; si no, usa A y B
  let colNombre = 0, colFecha = 1, inicio = 0
  const iEnc = filas.findIndex(f => f.some(c => /nombre/i.test(String(c))) && f.some(c => /fecha|hora/i.test(String(c))))
  if (iEnc >= 0) {
    colNombre = filas[iEnc].findIndex(c => /nombre/i.test(String(c)))
    colFecha = filas[iEnc].findIndex(c => /fecha|hora/i.test(String(c)))
    inicio = iEnc + 1
  }
  const marcas = []
  let ilegibles = 0
  for (const f of filas.slice(inicio)) {
    const nombre = String(f[colNombre] ?? '').trim()
    if (!nombre) continue
    const fh = leerFechaHora(f[colFecha])
    if (!fh) { ilegibles++; continue }
    marcas.push({ nombre, ...fh })
  }
  return { marcas, ilegibles }
}

// Calcula, por nombre del huellero, las horas extra sugeridas dentro de la quincena
export function calcularHuellero(marcas, inicio, fin) {
  const porPersona = new Map()
  for (const m of marcas) {
    if (m.fecha < inicio || m.fecha > fin) continue
    const alias = normalizarAlias(m.nombre)
    if (!porPersona.has(alias)) porPersona.set(alias, { alias, nombre: m.nombre, dias: new Map() })
    const p = porPersona.get(alias)
    if (!p.dias.has(m.fecha)) p.dias.set(m.fecha, [])
    p.dias.get(m.fecha).push(m.min)
  }
  const resultado = []
  for (const p of porPersona.values()) {
    const dias = []
    for (const [fecha, lista] of [...p.dias.entries()].sort()) {
      // Marcas repetidas con segundos de diferencia cuentan como una sola
      const ms = lista.sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 3)
      let entrada = null, salida = null
      if (ms.length >= 2) { entrada = ms[0]; salida = ms[ms.length - 1] }
      else if (ms[0] < 12 * 60) entrada = ms[0]
      else salida = ms[0]
      const [a, mm, d] = fecha.split('-').map(Number)
      const dow = new Date(a, mm - 1, d).getDay()
      const festivo = festivosColombia(a).get(fecha)
      const completo = entrada !== null && salida !== null
      const dia = { fecha, entrada: hhmm(entrada), salida: hhmm(salida), marcas: ms.length, incompleto: !completo, extra: 0, recargo: 0 }
      if (dow === 0 || festivo) {
        dia.tipo = festivo ? 'festivo' : 'domingo'
        if (festivo) dia.festivo = festivo
        if (completo) dia.recargo = horasDeMinutos(salida - entrada)
      } else if (dow === 6) {
        dia.tipo = 'sabado'
        if (completo) dia.extra = horasDeMinutos(salida - entrada)
      } else {
        dia.tipo = 'habil'
        const salidaHorario = dow === 5 ? HORARIO.salidaV : HORARIO.salidaLJ
        dia.temprano = entrada !== null ? horasDeMinutos(HORARIO.entrada - entrada) : 0
        dia.tarde = salida !== null ? horasDeMinutos(salida - salidaHorario) : 0
        dia.extra = dia.temprano + dia.tarde
      }
      dias.push(dia)
    }
    resultado.push({
      alias: p.alias, nombre: p.nombre, dias,
      horas_extra: dias.reduce((t, x) => t + x.extra, 0),
      horas_recargo: dias.reduce((t, x) => t + x.recargo, 0),
      dias_trabajados: dias.filter(x => x.tipo === 'habil').length,
      incompletos: dias.filter(x => x.incompleto).length,
    })
  }
  return resultado.sort((a, b) => a.nombre.localeCompare(b.nombre))
}
