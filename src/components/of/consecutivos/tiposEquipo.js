// Tipos de equipo con consecutivo propio. La clave es la que guarda equipos_consecutivos.tipo y la
// misma que usa supabase/functions/consecutivos-odoo/leerNota.js. `hoja` = nombre de la hoja en el
// Excel «CONSECUTIVO EQUIPOS» (sin espacios a los lados). Las hojas MOTOR y MANTENIMIENTO no se
// importan: los motores están en Inventarios › Motores por serial y Mantenimiento es otro registro.
export const TIPOS_EQUIPO = [
  { clave: 'mezcla',             nombre: 'Mezcladora',               hoja: 'MEZCLA' },
  { clave: 'rana',               nombre: 'Rana',                     hoja: 'RANA' },
  { clave: 'pluma',              nombre: 'Pluma grúa',               hoja: 'PLUMA' },
  { clave: 'cort_pav',           nombre: 'Cortadora de piso',        hoja: 'CORT PAV' },
  { clave: 'cort_lad',           nombre: 'Cortadora de ladrillo',    hoja: 'CORT LAD' },
  { clave: 'lite_mix',           nombre: 'Lite mix',                 hoja: 'LITE MIX' },
  { clave: 'pluma_lite',         nombre: 'Pluma lite',               hoja: 'PLUMA LITE' },
  { clave: 'gancho_andamio',     nombre: 'Gancho andamio colgante',  hoja: 'GANCHO ANDAMIOS COL' },
  { clave: 'regla',              nombre: 'Regla vibratoria',         hoja: 'REGLA VIBRATORIA' },
  { clave: 'canastilla_andamio', nombre: 'Canastilla andamio',       hoja: 'CANASTILLA ANDAMIO COL' },
  { clave: 'mez_esp',            nombre: 'Mezcladora especial',      hoja: 'MEZ ESP' },
  { clave: 'otra_rana',          nombre: 'Otra rana',                hoja: 'OTRA RANA' },
]
// Números que leyó Odoo sin saber de qué equipo son (se ven en «Por revisar»)
export const TIPO_REVISAR = 'revisar'

export const nombreTipo = clave => TIPOS_EQUIPO.find(t => t.clave === clave)?.nombre || (clave === TIPO_REVISAR ? 'Sin clasificar' : clave)

// Empresa por el número del documento: CF6351 = Feisen · CF/2026/00791 = FC · COT/… = cotización de Feisen · S0… = de FC
export function empresaDeDocumento(doc) {
  const d = String(doc || '').toUpperCase()
  if (/^CF\d+$/.test(d) || /^COT\//.test(d)) return 'feisen'
  if (/^CF\/\d{4}\//.test(d) || /^S\d{4,}$/.test(d)) return 'fc'
  return null
}
