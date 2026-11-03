import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// La app instalada solo buscaba versión nueva al abrirse, y quien la deja abierta todo el día
// seguía con la vieja (pasó con el arreglo de "Guardando…" en Pedidos, 3/11/2026).
// Ahora también busca al volver a la app y cada hora si está en segundo plano. Con
// autoUpdate la página se recarga sola al instalar la nueva, por eso nunca se busca
// mientras alguien está trabajando en pantalla (no se pierde un formulario a medias).
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return
    const buscar = () => { if (navigator.onLine) registro.update().catch(() => {}) }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscar() })
    setInterval(() => { if (document.visibilityState === 'hidden') buscar() }, 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
