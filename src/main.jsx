import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// ── CÓMO SE ENTERA LA APP DE QUE HAY VERSIÓN NUEVA ───────────────────────────
// La app instalada solo buscaba versión nueva al abrirse, y quien la deja abierta todo el
// día seguía con la vieja (pasó con el arreglo de "Guardando…" en Pedidos, 3/11/2026, y
// otra vez con el balance el 19/11/2026: Netlify había publicado bien, pero la ventana
// llevaba horas abierta y de frente, y así nunca preguntaba).
//
// Ahora busca en tres momentos: al abrir, al volver a la pestaña, y cada diez minutos
// aunque la ventana esté abierta y de frente.
//
// Con `autoUpdate` la página se recarga sola apenas encuentra una versión nueva, así que
// buscar mientras alguien escribe le borraría lo que lleva. Por eso, con la ventana a la
// vista, solo busca si nadie está en medio de algo: `ocupado()` manda. Si está ocupado se
// salta ese turno y vuelve a intentar a los diez minutos.
// ─────────────────────────────────────────────────────────────────────────────

const EDITABLES = ['INPUT', 'TEXTAREA', 'SELECT']

// ¿Hay algo a medio hacer que una recarga se llevaría por delante?
function ocupado() {
  const foco = document.activeElement
  if (foco && (EDITABLES.includes(foco.tagName) || foco.isContentEditable)) return true
  // Un modal abierto casi siempre es un formulario a medias o una confirmación pendiente
  if (document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]')) return true
  return false
}

registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return
    const buscar = () => { if (navigator.onLine) registro.update().catch(() => {}) }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !ocupado()) buscar()
    })
    setInterval(() => {
      if (document.visibilityState === 'hidden' || !ocupado()) buscar()
    }, 10 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
