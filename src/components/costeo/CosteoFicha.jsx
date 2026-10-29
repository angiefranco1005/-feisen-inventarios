import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import MaterialesTab from './MaterialesTab'
import ManoDeObraTab from './ManoDeObraTab'
import CifTab from './CifTab'
import EquiposTab from './EquiposTab'
import PiezasTab from './PiezasTab'
import TiemposTab from './TiemposTab'
import ResumenTab from './ResumenTab'

const TABS = [
  { id: 'materiales', label: 'Materiales (MP)' },
  { id: 'mano_obra', label: 'Mano de Obra (MOD)' },
  { id: 'cif', label: 'CIF' },
  { id: 'equipos', label: 'Equipos' },
  { id: 'piezas', label: 'Piezas' },
  { id: 'tiempos', label: 'Tiempos reales' },
  { id: 'resumen', label: 'Resumen' },
]

// Una ficha de costeo con sus pestañas. La pestaña va en la URL (?tab=tiempos), así el
// enlace para celular de "Tiempos reales" abre directo ahí.
export default function CosteoFicha() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'materiales'
  const [ficha, setFicha] = useState(undefined) // undefined = cargando, null = no existe
  // Cada clic en una pestaña la vuelve a montar para que lea datos frescos (igual que en la app de costeo).
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setFicha(undefined)
    supabase
      .from('costeo_fichas')
      .select('id, nombre, tipo')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setFicha(data || null))
  }, [id])

  async function renombrar() {
    const nuevoNombre = window.prompt('Nuevo nombre:', ficha.nombre)
    if (nuevoNombre === null) return
    const trimmed = nuevoNombre.trim()
    if (!trimmed) return
    const { error } = await supabase
      .from('costeo_fichas')
      .update({ nombre: trimmed, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      window.alert('No se pudo renombrar: ' + error.message)
      return
    }
    setFicha({ ...ficha, nombre: trimmed })
  }

  if (ficha === undefined) return <p className="text-sm text-feisen-texto-2">Cargando…</p>
  if (ficha === null) {
    return (
      <div className="max-w-4xl mx-auto text-sm text-feisen-texto-2">
        No se encontró esta ficha.{' '}
        <Link to="/costeo" className="text-feisen-azul hover:underline">Volver a Costeo</Link>
      </div>
    )
  }

  const esPieza = ficha.tipo === 'pieza'

  return (
    <div className="max-w-4xl mx-auto">
      <Link to={esPieza ? '/costeo?catalogo=pieza' : '/costeo'} className="text-xs text-feisen-azul hover:underline">
        ← {esPieza ? 'Catálogo de piezas' : 'Mis máquinas'}
      </Link>
      <h1 className="text-2xl font-bold text-feisen-azul mt-1">
        {ficha.nombre}
        {esPieza && <span className="text-sm font-normal text-feisen-texto-2 ml-2">(pieza)</span>}
      </h1>
      <button onClick={renombrar} className="text-xs text-feisen-azul hover:underline">
        Editar nombre
      </button>

      <nav className="pt-4 flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setParams(t.id === 'materiales' ? {} : { tab: t.id }, { replace: true })
              setRefreshKey((k) => k + 1)
            }}
            className={`text-sm font-medium rounded-full px-4 py-1.5 border ${
              tab === t.id
                ? 'bg-feisen-rojo text-white border-feisen-rojo'
                : 'bg-white text-feisen-texto-2 border-feisen-borde hover:border-feisen-rojo'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="py-6">
        {tab === 'materiales' && <MaterialesTab key={`m-${id}-${refreshKey}`} fichaId={id} />}
        {tab === 'mano_obra' && <ManoDeObraTab key={`mo-${id}-${refreshKey}`} fichaId={id} />}
        {tab === 'cif' && <CifTab key={`c-${id}-${refreshKey}`} fichaId={id} />}
        {tab === 'equipos' && <EquiposTab key={`e-${id}-${refreshKey}`} fichaId={id} />}
        {tab === 'piezas' && <PiezasTab key={`p-${id}-${refreshKey}`} fichaId={id} />}
        {tab === 'tiempos' && <TiemposTab key={`t-${id}-${refreshKey}`} fichaId={id} fichaNombre={ficha.nombre} />}
        {tab === 'resumen' && <ResumenTab key={`r-${id}-${refreshKey}`} fichaId={id} />}
      </main>
    </div>
  )
}
