import { useNavigate, useSearchParams } from 'react-router-dom'
import FichasList from './FichasList'

// Listado de fichas de costeo (máquinas o catálogo de piezas). El catálogo va en la URL
// (?catalogo=pieza) para que "← Catálogo de piezas" desde una ficha vuelva al mismo listado.
export default function CosteoFichas() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tipo = params.get('catalogo') === 'pieza' ? 'pieza' : 'maquina'

  return (
    <FichasList
      tipo={tipo}
      onCambiarCatalogo={(t) => setParams(t === 'pieza' ? { catalogo: 'pieza' } : {}, { replace: true })}
      onSelect={(id) => navigate(`/costeo/fichas/${id}`)}
    />
  )
}
