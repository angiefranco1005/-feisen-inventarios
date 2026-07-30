import { useEffect, useState, useRef } from 'react'

/**
 * Detecta si Netlify publicó un nuevo deploy comparando el hash
 * del bundle JS en index.html. Polling cada 3 minutos.
 */
export function useUpdateAvailable() {
  const [hayActualizacion, setHayActualizacion] = useState(false)
  const versionRef = useRef(null)

  useEffect(() => {
    async function verificar() {
      try {
        const res = await fetch('/', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        })
        if (!res.ok) return
        const html = await res.text()
        // Vite pone hashes en los assets: /assets/index-XXXXXXXX.js
        const match = html.match(/src="\/assets\/index-[^"]+\.js"/)
        const version = match?.[0] ?? null
        if (!version) return
        if (versionRef.current === null) {
          versionRef.current = version   // guarda versión inicial
        } else if (versionRef.current !== version) {
          setHayActualizacion(true)      // ¡nueva versión detectada!
        }
      } catch {
        // falla silenciosa (sin conexión, etc.)
      }
    }

    verificar()
    const timer = setInterval(verificar, 3 * 60 * 1000) // cada 3 min
    return () => clearInterval(timer)
  }, [])

  function actualizar() {
    window.location.reload(true)
  }

  return { hayActualizacion, actualizar }
}
