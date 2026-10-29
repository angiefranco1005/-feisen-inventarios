// Gráficas dibujadas con Canvas nativo del navegador — sin librerías externas,
// para que el dashboard funcione siempre, incluso sin conexión a internet.

function prepararCanvas(canvas) {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(rect.width, 10) * dpr
  canvas.height = Math.max(rect.height, 10) * dpr
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, rect.width, rect.height)
  return { ctx, w: rect.width, h: rect.height }
}

export function dibujarBarrasVertical(canvas, labels, valores, colores) {
  const { ctx, w, h } = prepararCanvas(canvas)
  const max = Math.max(...valores, 1)
  const padTop = 18, padBottom = 26, gap = 18
  const barW = (w - gap * (labels.length + 1)) / labels.length
  ctx.font = '11px Inter, Arial, sans-serif'
  ctx.textAlign = 'center'
  labels.forEach((label, i) => {
    const val = Number(valores[i]) || 0
    const barH = (val / max) * (h - padTop - padBottom)
    const x = gap + i * (barW + gap)
    const y = h - padBottom - barH
    ctx.fillStyle = colores[i % colores.length]
    ctx.fillRect(x, y, barW, Math.max(barH, 0))
    ctx.fillStyle = '#2B2B2B'
    ctx.fillText(String(val), x + barW / 2, y - 6 < 10 ? 10 : y - 6)
    ctx.fillStyle = '#4B5563'
    ctx.fillText(label, x + barW / 2, h - padBottom + 15)
  })
}

export function dibujarBarrasHorizontal(canvas, labels, valores, color) {
  const { ctx, w, h } = prepararCanvas(canvas)
  if (labels.length === 0) {
    ctx.fillStyle = '#9CA3AF'
    ctx.font = '12px Inter, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Sin datos todavía', w / 2, h / 2)
    return
  }
  const max = Math.max(...valores, 1)
  const leftPad = 4, rightPad = 34
  const rowH = h / labels.length
  ctx.font = '11px Inter, Arial, sans-serif'
  labels.forEach((label, i) => {
    const val = Number(valores[i]) || 0
    const barW = (val / max) * (w - leftPad - rightPad)
    const y = i * rowH + rowH * 0.22
    const barH = rowH * 0.56
    ctx.fillStyle = color
    ctx.fillRect(leftPad, y, Math.max(barW, 2), barH)
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'left'
    const texto = label.length > 24 ? label.slice(0, 22) + '…' : label
    ctx.fillText(texto, leftPad + 6, y + barH / 2 + 4)
    ctx.fillStyle = '#4B5563'
    ctx.textAlign = 'right'
    ctx.fillText(String(val), w - 4, y + barH / 2 + 4)
  })
}

export function dibujarDona(canvas, labels, valores, colores) {
  const { ctx, w, h } = prepararCanvas(canvas)
  const total = valores.reduce((a, b) => a + b, 0)
  const filasLeyenda = Math.ceil(labels.length / 2)
  const legendH = filasLeyenda * 15 + 6
  const cx = w / 2, cy = (h - legendH) / 2 + 2
  const radio = Math.max(Math.min(cx, cy) - 6, 10)
  const radioInterno = radio * 0.55

  if (total === 0) {
    ctx.fillStyle = '#9CA3AF'
    ctx.font = '12px Inter, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Sin datos todavía', cx, cy)
    return
  }

  let angulo = -Math.PI / 2
  labels.forEach((label, i) => {
    const val = valores[i]
    const porcion = (val / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radio, angulo, angulo + porcion)
    ctx.closePath()
    ctx.fillStyle = colores[i % colores.length]
    ctx.fill()
    angulo += porcion
  })

  ctx.beginPath()
  ctx.arc(cx, cy, radioInterno, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()

  const colW = w / 2
  ctx.font = '10px Inter, Arial, sans-serif'
  ctx.textAlign = 'left'
  labels.forEach((label, i) => {
    const col = i % 2
    const fila = Math.floor(i / 2)
    const lx = 4 + col * colW
    const ly = h - legendH + fila * 15 + 10
    ctx.fillStyle = colores[i % colores.length]
    ctx.fillRect(lx, ly - 8, 8, 8)
    ctx.fillStyle = '#4B5563'
    const texto = label.length > 16 ? label.slice(0, 14) + '…' : label
    ctx.fillText(texto + ': ' + valores[i], lx + 11, ly)
  })
}
