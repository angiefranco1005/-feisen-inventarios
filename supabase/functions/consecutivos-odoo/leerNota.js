// Lee los consecutivos de equipos de la nota de una factura / cotización de Odoo.
// JavaScript puro (sin Deno ni React) para poder probarlo con node:  node probarNota.mjs
//
// Cómo los escriben los asesores (visto en Odoo Feisen y FC, nov 2026):
//   OF-0579
//   REF 25768, 25769
//   REF MOTOR SN 251031614, SN 250918453        ← seriales de motor: NO son consecutivos
//   REF 25753/ 4677, 4682/ 2158/ 25764          ← un grupo por producto, en el orden de las líneas
//   REF 197. 198 / 84                           ← andamio colgante completo = ganchos / canastilla
// Las claves de tipo son las mismas de src/components/of/consecutivos/tiposEquipo.js

// Producto de Odoo → tipo(s) de equipo. El orden importa (lo más específico primero).
// Un producto que no sea equipo (FLETE, repuestos…) devuelve [] y no recibe consecutivos.
// Ojo: «CANASTILLA - PLUMA 300 KG», «GANCHO PARA PLUMA» y «BALDE (PLUMA…)» son accesorios de la pluma, sin consecutivo.
const REGLAS = [
  [/^ANDAMIO\W*COLGANTE/, ['gancho_andamio', 'canastilla_andamio']],   // «ANDAMIO - COLGANTE», «ANDAMIO COLGANTE COMPLETO»
  [/^PLATAFORMA\s+ANDAMIO\s+COLGANTE/, ['canastilla_andamio']],
  [/^CANAST(?!.*PLUMA)/, ['canastilla_andamio']],
  [/^GANCHO(?!.*PLUMA)/, ['gancho_andamio']],
  [/^MEZCLADORA.*\bLITE\b|LITE\s*-?\s*MIX/, ['lite_mix']],   // "MEZCLADORA LITE MIX 1 B"
  [/MEZCLADORA/, ['mezcla']],
  [/RANA|VIBROCOMPACTADORA/, ['rana']],
  [/PLUMA.*LITE/, ['pluma_lite']],
  [/PLUMA/, ['pluma']],
  [/CORTADORA\s+DE\s+LADRILLO/, ['cort_lad']],
  [/CORTADORA\s+DE\s+(PISO|PAVIMENTO|CONCRETO|ASFALTO)/, ['cort_pav']],
  [/REGLA/, ['regla']],
]

// Los productos de repuesto llevan el nombre del equipo ("POLEA MEZCLADORA…"): solo cuenta si el
// nombre EMPIEZA por el equipo (quitando el código [022]).
export function tiposDeProducto(nombre) {
  const n = String(nombre || '').replace(/^\[[^\]]*\]\s*/, '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const [re, tipos] of REGLAS) {
    const m = n.match(re)
    if (m && m.index <= 2) return tipos
  }
  return []
}

// "MEZCLADORA - 2 B" → "2 B" · "MEZCLADORA (1 1/2 B)" → "1 1/2 B" · "PLUMA GRÚA (PLUMA 300 KG)" → "300 KG"
export function capacidadDeProducto(nombre) {
  const n = String(nombre || '').toUpperCase()
  const b = n.match(/(\d+(?:\s+\d\/\d)?|\d\/\d)\s*B(?:ULTOS?)?\b/)
  if (b) return `${b[1].replace(/\s+/g, ' ')} B`
  const kg = n.match(/(\d+)\s*KG/)
  return kg ? `${kg[1]} KG` : ''
}

export function textoPlano(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
}

export function ofDeNota(texto) {
  const m = texto.match(/\bOF\s*[-–#.:]?\s*0*(\d{1,5})\b/i)
  return m ? Number(m[1]) : null
}

// Números de un grupo: "25768, 25769" · "197. 198" · "25764 AL 25767" (rango hasta 60)
function numerosDe(grupo) {
  const out = []
  const g = grupo.replace(/(\d+)\s*(?:AL|A|HASTA)\s*(\d+)/gi, (_, a, b) => {
    const x = Number(a), y = Number(b)
    if (y > x && y - x <= 60) return Array.from({ length: y - x + 1 }, (_, i) => x + i).join(',')
    return `${a},${b}`
  })
  // Solo números sueltos de 1 a 6 cifras: no «6.5HP», «GCBBH-1376318» ni seriales largos. «1654,1655» sí son dos.
  for (const m of g.matchAll(/(?<![A-Za-z0-9]|\d\.)(\d{1,6})(?![A-Za-z0-9]|\.\d)/g)) out.push(String(Number(m[1])))
  return out
}

// Grupo con etiqueta: «REF GANCHOS: 187 - 188 REF CANASTILLA: 80» (el orden puede venir al revés)
function etiquetaDe(txt) {
  if (/GANCH/i.test(txt)) return 'gancho_andamio'
  if (/CANAST/i.test(txt)) return 'canastilla_andamio'
  return null
}

// Grupos de consecutivos de la nota: [{ nums: ['25753'] }, { nums: ['4677','4682'] }, …]
export function gruposDeNota(texto) {
  const grupos = []
  for (const linea of texto.split('\n')) {
    // Puede venir todo en una línea (FC): se corta en cada "REF"
    for (const trozo of linea.split(/(?=\bREF\b)/i)) {
      const m = trozo.match(/^\s*REF\b\.?\s*:?\s*(.*)$/i)
      if (!m) continue
      let resto = m[1]
      if (/^(MOTOR|MOTORES|SN\b|S\/N)/i.test(resto.trim())) continue
      if (/^\W*[A-Z0-9]*\d{7,}/i.test(resto.trim())) continue          // serial largo (motor) sin la palabra MOTOR
      resto = resto.split(/\b(COLOR|OC|OF|GARANT|MOTOR|NOTA)/i)[0]     // lo que sigue ya no es consecutivo
      for (const g of resto.split('/')) {
        const nums = numerosDe(g)
        if (nums.length) grupos.push({ nums, etiqueta: etiquetaDe(g) })
      }
    }
  }
  return grupos
}

// Reparte los grupos entre las líneas de equipo de la factura.
// lineas: [{ producto, cantidad }] en el orden de la factura.
// rangos (opcional): { tipo: [desde, hasta] } de los consecutivos recientes de cada tipo, para corregir
//   un número que quedó en el equipo equivocado porque la nota no vino en el orden de la factura.
// Devuelve { filas: [{ tipo, consecutivo, capacidad, producto }], problema: texto | null }
export function repartir(grupos, lineas, rangos = {}) {
  const equipos = []
  for (const l of lineas) {
    const tipos = tiposDeProducto(l.producto)
    tipos.forEach(t => equipos.push({ tipo: t, cantidad: Math.round(Number(l.cantidad) || 0), producto: String(l.producto || '').replace(/^\[[^\]]*\]\s*/, '').split('\n')[0], capacidad: capacidadDeProducto(l.producto) }))
  }
  const todos = grupos.flatMap(g => g.nums)
  if (!todos.length) return { filas: [], problema: equipos.length ? 'sin consecutivo' : null }
  // Factura sin equipos (mantenimiento, servicio, motor suelto): el REF es de una máquina que ya existe
  if (!equipos.length) return { filas: [], problema: 'tiene REF pero ningún equipo en la factura' }
  const fila = (e, c) => ({ tipo: e.tipo, consecutivo: c, capacidad: e.capacidad, producto: e.producto })

  let filas = null
  // Grupos con etiqueta (ganchos / canastilla): cada uno a su tipo
  if (grupos.every(g => g.etiqueta) && grupos.every(g => equipos.some(e => e.tipo === g.etiqueta))) {
    filas = grupos.flatMap(g => g.nums.map(c => fila(equipos.find(e => e.tipo === g.etiqueta), c)))
  }
  // Un grupo por producto (lo normal)
  else if (grupos.length === equipos.length) filas = grupos.flatMap((g, i) => g.nums.map(c => fila(equipos[i], c)))
  // Un solo tipo de equipo: todos los números son de ese tipo
  else if (new Set(equipos.map(e => e.tipo)).size === 1) filas = todos.map(c => fila(equipos[0], c))
  else {
    // Sin «/»: se reparten en orden según la cantidad de cada línea, si cuadra exacto
    const totalCant = equipos.reduce((s, e) => s + e.cantidad, 0)
    if (grupos.length === 1 && totalCant === todos.length) {
      filas = []; let k = 0
      equipos.forEach(e => { for (let i = 0; i < e.cantidad; i++) filas.push(fila(e, todos[k++])) })
    } else if (grupos.length < equipos.length) {
      // Faltan grupos: cada grupo va a la siguiente línea con la misma cantidad (ej. no escribieron la pluma)
      filas = []; let k = 0
      for (const g of grupos) {
        while (k < equipos.length && equipos[k].cantidad !== g.nums.length) k++
        if (k >= equipos.length) { filas = null; break }
        g.nums.forEach(c => filas.push(fila(equipos[k], c))); k++
      }
    }
  }
  // Andamio colgante escrito en un solo grupo («115-116 -58»): ganchos y canastilla juntos
  if (!filas && equipos.some(e => e.tipo === 'gancho_andamio')) {
    const juntos = []
    equipos.forEach(e => { if (e.tipo !== 'canastilla_andamio' || !juntos.some(j => j.andamio)) juntos.push(e.tipo === 'gancho_andamio' ? { ...e, andamio: true } : e) })
    if (juntos.length === grupos.length) {
      const dentroT = (t, n) => rangos[t] && n >= rangos[t][0] && n <= rangos[t][1]
      const canast = equipos.find(e => e.tipo === 'canastilla_andamio') || equipos.find(e => e.tipo === 'gancho_andamio')
      filas = grupos.flatMap((g, i) => {
        const e = juntos[i]
        if (!e.andamio) return g.nums.map(c => fila(e, c))
        const tercio = Math.ceil(g.nums.length * 2 / 3)
        return g.nums.map((c, k) => {
          const n = Number(c)
          const esCanast = rangos.canastilla_andamio ? dentroT('canastilla_andamio', n) && !dentroT('gancho_andamio', n) : k >= tercio
          return fila(esCanast ? { ...canast, tipo: 'canastilla_andamio' } : e, c)
        })
      })
    }
  }
  if (!filas) return { filas: todos.map(c => ({ tipo: null, consecutivo: c, capacidad: '', producto: '' })), problema: 'no se pudo saber de qué equipo es cada número' }

  // Corrección por rangos: si un número no cabe en el rango de su tipo pero sí en el de otro equipo de la factura
  const dentro = (t, n, margen = 0) => rangos[t] && n >= rangos[t][0] && n <= rangos[t][1] + margen
  const cerca = (t, n) => !rangos[t] || (n >= rangos[t][0] - 50 && n <= rangos[t][1] + 300)
  const dudosos = []
  filas = filas.map(f => {
    const n = Number(f.consecutivo)
    if (cerca(f.tipo, n)) return f
    const tipos = [...new Set(equipos.map(e => e.tipo))].filter(t => t !== f.tipo)
    let otros = tipos.filter(t => dentro(t, n))                       // dentro del rango exacto
    if (!otros.length) otros = tipos.filter(t => dentro(t, n, 60))     // o recién fabricado (un poco arriba)
    if (otros.length === 1) return fila(equipos.find(e => e.tipo === otros[0]), f.consecutivo)
    dudosos.push(f.consecutivo)
    return f
  })
  return { filas, problema: dudosos.length ? `revisar ${dudosos.join(', ')}: no parece de ese equipo` : null }
}

export function leerDocumento({ nota, lineas, rangos }) {
  const texto = textoPlano(nota)
  const r = repartir(gruposDeNota(texto), lineas, rangos)
  // Se facturaron más equipos de los consecutivos escritos (ej. 3 mezcladoras y 2 REF)
  if (!r.problema && r.filas.length) {
    const esperados = lineas.reduce((s, l) => s + tiposDeProducto(l.producto).length * Math.round(Number(l.cantidad) || 0), 0)
    const reales = r.filas.length
    if (esperados > reales) r.problema = `faltan ${esperados - reales} de ${esperados} consecutivos`
  }
  return { numero_of: ofDeNota(texto), ...r }
}
