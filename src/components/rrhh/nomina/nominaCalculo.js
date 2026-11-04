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
    extra: 'Servicios adicionales', horas: 'Servicios adicionales diurnos (h)', valorHora: 'Valor hora diurna',
    nocturna: 'Servicios adicionales nocturnos (h)', valorNocturna: 'Valor hora nocturna',
    recargo: 'Servicios adicionales domingo/festivo (h)', valorRecargo: 'Valor hora domingo/festivo', aplicar: 'Aplicar servicios adicionales',
    corto: { diurna: 'Diurnos', nocturna: 'Nocturnos', festiva: 'Dom./festivo' },
  } : {
    extra: 'Horas extra', horas: 'Horas extra diurnas', valorHora: 'Valor hora extra diurna (+25 %)',
    nocturna: 'Horas extra nocturnas', valorNocturna: 'Valor hora extra nocturna (+75 %)',
    recargo: 'Horas extra domingo/festivo', valorRecargo: 'Valor hora con recargo 100 %', aplicar: 'Aplicar horas extra',
    corto: { diurna: 'Diurnas', nocturna: 'Nocturnas', festiva: 'Dom./festivo' },
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

// ─── Valor hora a partir del valor del día ───────────────────────────────────
// Fórmula que Feisen ya usaba en el Excel desde la 2.ª quincena de julio 2026
// (verificada fila por fila): hora normal = día ÷ 8,4 h (42 h semanales ÷ 5 días;
// antes de esa fecha dividían por 9). Hora adicional = normal × 1,25;
// domingo/festivo = normal × 2 (recargo del 100 %, decisión de Angie 2026-10-26).
// Se trunca a $100, como en el Excel. Siempre editable en la ficha y la liquidación.
export const HORAS_DIA = 8.4
const a100 = (v) => Math.floor(v / 100) * 100
// Extra nocturna = normal × 1,75 (recargo del 75 %, art. 168 CST; pedido de Angie 2026-11-04).
export function valoresHora(valorDia) {
  const d = num(valorDia)
  if (!d) return { extra: null, nocturna: null, recargo: null }
  return { extra: a100(d / HORAS_DIA * 1.25), nocturna: a100(d / HORAS_DIA * 1.75), recargo: a100(d / HORAS_DIA * 2) }
}
// Valor de un día de trabajo según la forma de pago (fijo: quincena ÷ 15)
export const valorDiaBase = (modalidad, valorDia, valorQuincena) =>
  (modalidad === 'fijo' ? (num(valorQuincena) ? num(valorQuincena) / 15 : null) : (num(valorDia) || null))

// Valor de la hora de domingo/festivo; las liquidaciones viejas sin ese valor usan el doble de la hora adicional
export const valorHoraRecargo = (liq) => (liq.valor_hora_recargo !== null && liq.valor_hora_recargo !== undefined && liq.valor_hora_recargo !== ''
  ? num(liq.valor_hora_recargo) : num(liq.valor_hora_extra) * 2)
export const valorHorasRecargo = (liq) => num(liq.horas_extra_recargo) * valorHoraRecargo(liq)
// Valor de la hora extra nocturna; sin valor guardado se deriva de la diurna (× 1,75 / 1,25)
export const valorHoraNocturna = (liq) => (liq.valor_hora_nocturna !== null && liq.valor_hora_nocturna !== undefined && liq.valor_hora_nocturna !== ''
  ? num(liq.valor_hora_nocturna) : a100(num(liq.valor_hora_extra) * 1.4))
export const valorHorasNocturna = (liq) => num(liq.horas_extra_nocturna) * valorHoraNocturna(liq)

// Totales de una liquidación. Todos los conceptos suman si tienen valor
// (un destajo puede tener además horas extra u otros, como en el Excel).
export function calcularTotales(liq, piezas = []) {
  const total_piezas = piezas.reduce((t, p) => t + num(p.cantidad) * num(p.valor_unitario), 0)
  const total_devengado = total_piezas
    + num(liq.dias) * num(liq.valor_dia)
    + num(liq.horas_extra) * num(liq.valor_hora_extra)
    + valorHorasNocturna(liq)  // extra nocturna: recargo del 75 %
    + valorHorasRecargo(liq)   // domingo/festivo: recargo del 100 %
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
//   • Extra nocturna (2026-11-04): la parte de un tramo extra entre las 7:00 p. m.
//     y las 6:00 a. m. (jornada nocturna de la Ley 2466 de 2025). Se redondea el
//     tramo completo y de ese total se separan las horas nocturnas, así la suma
//     no cambia por partir el tramo. Domingo y festivo no se parten (todo al 100 %).
// Es SOLO una sugerencia: RRHH verifica si la extra estaba autorizada.
export const HORARIO = { entrada: 7 * 60 + 30, salidaLJ: 17 * 60 + 30, salidaV: 16 * 60, nocheDesde: 19 * 60, nocheHasta: 6 * 60 }
export const horasDeMinutos = (min) => (min > 0 ? Math.floor((min + 15) / 30) / 2 : 0)
const cruce = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c))
// Horas de un tramo extra [desde, hasta) en minutos del día → { diurna, nocturna }
export function partirTramo(desde, hasta) {
  if (desde === null || hasta === null || hasta <= desde) return { diurna: 0, nocturna: 0 }
  const total = horasDeMinutos(hasta - desde)
  const minNoche = cruce(desde, hasta, 0, HORARIO.nocheHasta) + cruce(desde, hasta, HORARIO.nocheDesde, 24 * 60)
  const nocturna = Math.min(total, horasDeMinutos(minNoche))
  return { diurna: total - nocturna, nocturna }
}

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
      const dia = { fecha, entrada: hhmm(entrada), salida: hhmm(salida), marcas: ms.length, incompleto: !completo, extra: 0, nocturna: 0, recargo: 0 }
      if (dow === 0 || festivo) {
        dia.tipo = festivo ? 'festivo' : 'domingo'
        if (festivo) dia.festivo = festivo
        if (completo) dia.recargo = horasDeMinutos(salida - entrada)
      } else if (dow === 6) {
        dia.tipo = 'sabado'
        if (completo) { const h = partirTramo(entrada, salida); dia.extra = h.diurna; dia.nocturna = h.nocturna }
      } else {
        dia.tipo = 'habil'
        const salidaHorario = dow === 5 ? HORARIO.salidaV : HORARIO.salidaLJ
        const antes = entrada !== null ? partirTramo(entrada, HORARIO.entrada) : { diurna: 0, nocturna: 0 }
        const despues = salida !== null ? partirTramo(salidaHorario, salida) : { diurna: 0, nocturna: 0 }
        dia.temprano = antes.diurna + antes.nocturna
        dia.tarde = despues.diurna + despues.nocturna
        dia.extra = antes.diurna + despues.diurna
        dia.nocturna = antes.nocturna + despues.nocturna
      }
      dias.push(dia)
    }
    resultado.push({
      alias: p.alias, nombre: p.nombre, dias,
      horas_extra: dias.reduce((t, x) => t + x.extra, 0),
      horas_nocturna: dias.reduce((t, x) => t + (x.nocturna || 0), 0),
      horas_recargo: dias.reduce((t, x) => t + x.recargo, 0),
      dias_trabajados: dias.filter(x => x.tipo === 'habil').length,
      incompletos: dias.filter(x => x.incompleto).length,
    })
  }
  return resultado.sort((a, b) => a.nombre.localeCompare(b.nombre))
}
