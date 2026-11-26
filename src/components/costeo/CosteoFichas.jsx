import { useNavigate, useSearchParams } from 'react-router-dom'
import FichasList from './FichasList'
import InicioCosteo from './inicio/InicioCosteo'

// /costeo: el inicio es el tablero de todas las máquinas (InicioCosteo). La lista clásica sigue
// disponible para renombrar o eliminar: ?vista=lista (máquinas) o ?catalogo=pieza (catálogo de piezas),
// así "← Catálogo de piezas" desde una ficha vuelve al mismo listado.
export default function CosteoFichas() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tipo = params.get('catalogo') === 'pieza' ? 'pieza' : 'maquina'
  if (tipo === 'maquina' && params.get('vista') !== 'lista') return <InicioCosteo />

  return (
    <FichasList
      tipo={tipo}
      onCambiarCatalogo={(t) => setParams(t === 'pieza' ? { catalogo: 'pieza' } : { vista: 'lista' }, { replace: true })}
      onSelect={(id) => navigate(`/costeo/fichas/${id}`)}
    />
  )
}
