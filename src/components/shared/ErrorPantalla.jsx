import { Component } from 'react'

// Si una pantalla falla al dibujarse, React desmontaba toda la app y el ERP quedaba en blanco
// (2026-11-27). Esto atrapa el error: se ve un aviso con el detalle y el botón Recargar, y el
// menú sigue funcionando. Layout lo usa con key = ruta, así que al cambiar de pantalla se limpia.
export default class ErrorPantalla extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) {
    console.error('Pantalla con error:', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white border border-feisen-borde rounded-xl p-6 space-y-3">
        <p className="font-semibold text-feisen-texto">Esta pantalla tuvo un error y no se pudo mostrar</p>
        <p className="text-sm text-feisen-texto-2">
          Recarga la página. Si vuelve a pasar, avísale a administración con una captura de este mensaje.
        </p>
        <p className="text-xs font-mono bg-feisen-fondo rounded-lg px-3 py-2 text-feisen-texto-2 break-words">{String(error?.message || error)}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.location.reload()}
            className="bg-feisen-azul text-white rounded-lg px-4 min-h-[44px] text-sm font-semibold hover:opacity-90">Recargar</button>
          <button type="button" onClick={() => window.location.assign('/dashboard')}
            className="border border-feisen-borde rounded-lg px-4 min-h-[44px] text-sm font-medium text-feisen-texto hover:bg-feisen-fondo">Ir al inicio</button>
        </div>
      </div>
    )
  }
}
