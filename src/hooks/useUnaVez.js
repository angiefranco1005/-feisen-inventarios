import { useCallback, useRef } from 'react'

// Candado contra el doble guardado (doble clic, clic + Enter, toques repetidos con
// conexión lenta). El `disabled={guardando}` del botón solo actúa cuando React vuelve
// a pintar, y un segundo clic alcanza a entrar antes; este candado es síncrono.
// Uso: const unaVez = useUnaVez();  <form onSubmit={unaVez(handleSubmit)}>
//                                    <button onClick={unaVez(() => guardar(x))}>
export function useUnaVez() {
  const ocupado = useRef(false)
  return useCallback(fn => async (...args) => {
    if (ocupado.current) { args[0]?.preventDefault?.(); return }
    ocupado.current = true
    try { return await fn(...args) } finally { ocupado.current = false }
  }, [])
}
