// Clases compartidas del módulo RRHH: misma estética limpia del menú lateral
// (Layout.jsx): texto compacto, bordes finos, íconos grises delgados y el azul
// suave solo para lo activo. Cambiar aquí cambia todo el módulo.
export const ICONO = { size: 16, strokeWidth: 1.8 }

export const tarjeta     = 'bg-white rounded-xl border border-feisen-borde'
export const cabTarjeta  = 'flex items-center justify-between gap-3 px-5 py-3 border-b border-feisen-borde-suave'
export const tituloTarj  = 'text-sm font-semibold text-feisen-texto flex items-center gap-2'
export const iconoTitulo = 'text-feisen-gris-medio'

export const tituloPagina    = 'text-xl font-semibold text-feisen-texto'
export const subtituloPagina = 'text-sm text-feisen-texto-2'

export const etiqueta  = 'text-xs text-feisen-gris-medio'
export const labelForm = 'text-xs font-medium text-feisen-texto-2 block mb-1'
export const input     = 'w-full border border-feisen-borde bg-white rounded-lg px-3 py-2 text-sm text-feisen-texto placeholder:text-feisen-gris-medio focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul/15'

export const btnPrimario   = 'inline-flex items-center justify-center gap-1.5 bg-feisen-azul text-white rounded-lg px-3.5 py-2 text-sm font-medium hover:bg-feisen-azul-claro disabled:opacity-60 transition-colors'
export const btnSecundario = 'inline-flex items-center justify-center gap-1.5 border border-feisen-borde bg-white text-feisen-texto rounded-lg px-3.5 py-2 text-sm font-medium hover:bg-feisen-fondo disabled:opacity-60 transition-colors'
export const btnTexto      = 'inline-flex items-center gap-1.5 text-feisen-texto-2 rounded-lg px-2.5 py-1.5 text-sm font-medium hover:bg-feisen-fondo hover:text-feisen-texto disabled:opacity-40 transition-colors'

// Ítem de navegación interna: idéntico al NavLink del menú lateral
export const navItem = (activo) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap text-left transition-colors disabled:opacity-40
  ${activo ? 'bg-feisen-azul-suave text-feisen-azul font-semibold' : 'text-feisen-texto-2 font-medium hover:bg-white hover:text-feisen-texto'}`
export const btnTextoAzul  = 'inline-flex items-center gap-1.5 text-feisen-azul rounded-lg px-2.5 py-1.5 text-sm font-medium hover:bg-feisen-azul-suave disabled:opacity-40 transition-colors'
