// Diagrama de flujo armado solo a partir de los pasos del documento: Inicio → cada paso
// (rectángulo; las decisiones en rombo con su salida «No» a la derecha) → Fin. Se genera como
// SVG (para la pantalla) y se pasa a PNG (para el PDF y el Word), así hay un solo dibujo.

const AZUL = '#064794'
const TEXTO = '#1F2937'
const GRIS = '#5B6472'
const ANCHO = 560
const CX = 200                 // centro de la columna principal
const CAJA = 260               // ancho de los rectángulos
const ROMBO = 280              // ancho del rombo
const LINEA = 15               // alto de cada renglón de texto
const SEP = 26                 // espacio vertical entre figuras

const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Parte el texto en renglones de máximo `max` caracteres (sin cortar palabras)
function renglones(texto, max) {
  const out = []
  let actual = ''
  for (const w of String(texto || '').split(/\s+/).filter(Boolean)) {
    if ((actual + ' ' + w).trim().length > max && actual) { out.push(actual); actual = w } else actual = (actual + ' ' + w).trim()
  }
  if (actual) out.push(actual)
  return out.length ? out : ['']
}

const textoSvg = (lineas, x, yCentro, { color = TEXTO, peso = 400, tam = 12, ancla = 'middle' } = {}) => {
  const y0 = yCentro - ((lineas.length - 1) * LINEA) / 2 + 4
  return lineas.map((l, i) => `<text x="${x}" y="${y0 + i * LINEA}" text-anchor="${ancla}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${tam}" font-weight="${peso}" fill="${color}">${esc(l)}</text>`).join('')
}

const flecha = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${GRIS}" stroke-width="1.4" marker-end="url(#punta)"/>`

// pasos: [{ actividad, responsable, decision, siNo }] → { svg, ancho, alto }
export function svgDiagrama(pasos) {
  const lista = (pasos || []).filter(p => String(p.actividad || '').trim())
  let y = 12
  const partes = []

  const ovalo = texto => {
    const h = 34
    partes.push(`<rect x="${CX - 60}" y="${y}" width="120" height="${h}" rx="17" fill="${AZUL}"/>`)
    partes.push(textoSvg([texto], CX, y + h / 2, { color: '#fff', peso: 600 }))
    y += h
  }

  ovalo('Inicio')
  lista.forEach((p, i) => {
    partes.push(flecha(CX, y, CX, y + SEP - 2)); y += SEP
    const titulo = renglones(`${i + 1}. ${p.actividad}`, p.decision ? 26 : 34)
    const quien = p.responsable ? renglones(p.responsable, 34) : []
    if (p.decision) {
      const h = Math.max(70, (titulo.length + 1) * LINEA + 30)
      const cy = y + h / 2
      partes.push(`<polygon points="${CX},${y} ${CX + ROMBO / 2},${cy} ${CX},${y + h} ${CX - ROMBO / 2},${cy}" fill="#FEF7E6" stroke="#B7791F" stroke-width="1.4"/>`)
      partes.push(textoSvg(titulo, CX, cy - (quien.length ? 6 : 0), { peso: 600 }))
      if (quien.length) partes.push(textoSvg([quien[0]], CX, cy + (titulo.length * LINEA) / 2 + 4, { color: GRIS, tam: 10.5 }))
      // Salida «No» a la derecha con la nota de qué pasa
      const nota = renglones(p.siNo || 'Ver procedimiento', 22)
      const xNota = CX + ROMBO / 2 + 26
      const hNota = nota.length * LINEA + 14
      partes.push(flecha(CX + ROMBO / 2, cy, xNota - 2, cy))
      partes.push(textoSvg(['No'], CX + ROMBO / 2 + 12, cy - 7, { color: '#B4271D', peso: 600, tam: 10.5 }))
      partes.push(`<rect x="${xNota}" y="${cy - hNota / 2}" width="${ANCHO - xNota - 6}" height="${hNota}" rx="6" fill="#FDECEA" stroke="#B4271D" stroke-width="1"/>`)
      partes.push(textoSvg(nota, xNota + 8, cy, { color: TEXTO, tam: 10.5, ancla: 'start' }))
      partes.push(textoSvg(['Sí'], CX + 12, y + h + 14, { color: '#1F7A4D', peso: 600, tam: 10.5, ancla: 'start' }))
      y += h
    } else {
      const lineas = [...titulo]
      const h = lineas.length * LINEA + (quien.length ? LINEA : 0) + 18
      partes.push(`<rect x="${CX - CAJA / 2}" y="${y}" width="${CAJA}" height="${h}" rx="6" fill="#EEF4FB" stroke="${AZUL}" stroke-width="1.2"/>`)
      partes.push(textoSvg(lineas, CX, y + h / 2 - (quien.length ? LINEA / 2 : 0), { peso: 600 }))
      if (quien.length) partes.push(textoSvg([quien[0]], CX, y + h / 2 + (lineas.length * LINEA) / 2 + 2, { color: GRIS, tam: 10.5 }))
      y += h
    }
  })
  partes.push(flecha(CX, y, CX, y + SEP - 2)); y += SEP
  ovalo('Fin')
  y += 12

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${y}" viewBox="0 0 ${ANCHO} ${y}">` +
    `<defs><marker id="punta" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${GRIS}"/></marker></defs>` +
    `<rect width="100%" height="100%" fill="#fff"/>${partes.join('')}</svg>`
  return { svg, ancho: ANCHO, alto: y }
}

// SVG → PNG (data URL) para el PDF y el Word
export function svgAPng({ svg, ancho, alto }, escala = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = ancho * escala; c.height = alto * escala
      const ctx = c.getContext('2d')
      ctx.scale(escala, escala)
      ctx.drawImage(img, 0, 0)
      resolve({ dataUrl: c.toDataURL('image/png'), ancho, alto })
    }
    img.onerror = () => reject(new Error('No se pudo dibujar el diagrama'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}
