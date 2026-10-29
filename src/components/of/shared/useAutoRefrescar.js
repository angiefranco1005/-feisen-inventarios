import { useEffect } from 'react'

// Vuelve a llamar la función "cargar" cada vez que el usuario regresa a la
// app (por ejemplo, la anclada en el celular) después de haber estado en
// segundo plano, o cuando la pestaña/ventana recupera el foco. Así, si otro
// usuario agregó o cambió algo mientras tanto, se ve reflejado sin tener que
// cerrar y volver a abrir la app.
export function useAutoRefrescar(cargar) {
  useEffect(() => {
    function alVolver() {
      if (document.visibilityState === 'visible') cargar()
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
