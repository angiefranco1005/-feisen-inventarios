import { useEffect, useRef } from 'react'
import { PenLine } from 'lucide-react'

export default function FirmaCanvas({ onFirma, firmaDataUrl, label = 'Firma del responsable' }) {
  const canvasRef   = useRef(null)
  const dibujando   = useRef(false)
  const tieneTrazos = useRef(false)

  // Limpiar canvas cuando el padre resetea firmaDataUrl a null
  useEffect(() => {
    if (!firmaDataUrl && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      tieneTrazos.current = false
      dibujando.current   = false
    }
  }, [firmaDataUrl])

  function getPos(e, canvas) {
    const rect   = canvas.getBoundingClientRect()
    const touch  = e.touches?.[0]
    const clientX = touch ? touch.clientX : e.clientX
    const clientY = touch ? touch.clientY : e.clientY
    return {
      x: (clientX - rect.left) * (canvas.width  / rect.width),
      y: (clientY - rect.top)  * (canvas.height / rect.height),
    }
  }

  function iniciar(e) {
    e.preventDefault()
    dibujando.current = true
    const canvas = canvasRef.current
    const pos    = getPos(e, canvas)
    const ctx    = canvas.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function dibujar(e) {
    e.preventDefault()
    if (!dibujando.current) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const pos    = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#064794'
    ctx.lineWidth   = 2.5
    ctx.lineJoin    = 'round'
    ctx.lineCap     = 'round'
    ctx.stroke()
    tieneTrazos.current = true
  }

  function terminar(e) {
    e.preventDefault()
    if (!dibujando.current) return
    dibujando.current = false
    if (tieneTrazos.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png')
      onFirma(dataUrl)
    }
  }

  function limpiar() {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    tieneTrazos.current = false
    onFirma(null)
  }

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        <PenLine size={15} /> {label}
      </label>
      <div className={`rounded-xl overflow-hidden border-2 transition-colors ${firmaDataUrl ? 'border-green-400' : 'border-dashed border-gray-300'}`}>
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          className="w-full touch-none bg-white block cursor-crosshair"
          onMouseDown={iniciar}
          onMouseMove={dibujar}
          onMouseUp={terminar}
          onMouseLeave={terminar}
          onTouchStart={iniciar}
          onTouchMove={dibujar}
          onTouchEnd={terminar}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        {firmaDataUrl
          ? <p className="text-xs text-green-600 font-medium">✓ Firma registrada</p>
          : <p className="text-xs text-gray-400">Firma con el dedo o el mouse</p>
        }
        {firmaDataUrl && (
          <button type="button" onClick={limpiar}
            className="text-xs text-feisen-rojo hover:underline">
            Limpiar firma
          </button>
        )}
      </div>
    </div>
  )
}
