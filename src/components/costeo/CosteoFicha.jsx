import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import ArbolTab from './ArbolTab'
import EquiposTab from './EquiposTab'
import PiezasTab from './PiezasTab'
import ResumenTab from './ResumenTab'
import DescargarPDF from './DescargarPDF'

const TABS = [
  { id: 'arbol', label: 'Procesos' },
  { id: 'piezas', label: 'Sub-piezas' },
  { id: 'equipos', label: 'Equipos' },
  { id: 'resumen', label: 'Precio y margen' },
]

// Una ficha de costeo con sus pestañas. La principal es el árbol de procesos (materia prima y
// toma de tiempos de cada proceso). La pestaña va en la URL (?tab=piezas).
export default function CosteoFicha() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'arbol'
  const [ficha, setFicha] = useState(undefined) // undefined = cargando, null = no existe
  // Cada clic en una pestaña la vuelve a montar para que lea datos frescos (igual que en la app de costeo).
  const [refreshKey, setRefreshKey] = useState(0)

  function cargarFicha() {
    return supabase
      .from('costeo_fichas')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setFicha(data || null))
  }

  useEffect(() => {
    setFicha(undefined)
    cargarFicha()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
        <div>
          <h1 className="text-2xl font-bold text-feisen-azul">
            {ficha.nombre}
            {esPieza && <span className="text-sm font-normal text-feisen-texto-2 ml-2">(pieza)</span>}
          </h1>
          <button onClick={renombrar} className="text-xs text-feisen-azul hover:underline">
            Editar nombre
          </button>
        </div>
        <DescargarPDF ficha={ficha} onFichaCambio={cargarFicha} />
      </div>

      <nav className="pt-4 flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setParams(t.id === 'arbol' ? {} : { tab: t.id }, { replace: true })
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
        {tab === 'arbol' && <ArbolTab key={`a-${id}-${refreshKey}`} fichaId={id} />}
        {tab === 'equipos' && <EquiposTab key={`e-${id}-${refreshKey}`} fichaId={id} />}
        {tab === 'piezas' && <PiezasTab key={`p-${id}-${refreshKey}`} fichaId={id} />}
        {tab === 'resumen' && <ResumenTab key={`r-${id}-${refreshKey}`} fichaId={id} />}
      </main>
    </div>
  )
}
