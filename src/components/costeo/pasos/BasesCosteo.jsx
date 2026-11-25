import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

// Paso 0 del costeo por pasos: lo que vale para todas las máquinas (tarifas, CIF y equipos).
// Solo agrupa las pantallas que ya existían; cada una sigue en su ruta de siempre.
const BASES = [
  { to: '/costeo/etapas', titulo: 'Responsables por etapa', texto: 'Quién hace cada etapa, cómo se le paga y su centro de costo. Se usa al crear cada proceso.' },
  { to: '/costeo/cif', titulo: 'CIF de planta', texto: 'Costos indirectos del mes por centro de costo y la tasa por hora con que se reparten.' },
  { to: '/costeo/equipos', titulo: 'Equipos de planta', texto: 'Máquinas y equipos con su valor y vida útil, para el costo por hora-máquina.' },
]

export default function BasesCosteo() {
  return (
    <div className="max-w-4xl mx-auto">
      <p className="text-xs text-feisen-texto-2">Costeo por pasos</p>
      <h1 className="text-xl font-semibold text-feisen-texto tracking-tight">Paso 0 · Bases</h1>
      <p className="text-sm text-feisen-texto-2 mt-0.5">Lo que vale para todas las máquinas. Conviene tenerlo listo antes de costear, porque de aquí salen las tarifas y el CIF.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {BASES.map((b) => (
          <Link key={b.to} to={b.to} className="group bg-white border border-feisen-borde rounded-xl p-4 hover:border-feisen-azul">
            <p className="font-semibold text-feisen-texto flex items-center justify-between gap-2">
              {b.titulo} <ArrowRight size={14} className="text-feisen-gris-medio group-hover:text-feisen-azul" />
            </p>
            <p className="text-sm text-feisen-texto-2 mt-1">{b.texto}</p>
          </Link>
        ))}
      </div>
      <Link to="/costeo/pasos/despiece" className="mt-6 inline-flex items-center gap-1.5 h-10 rounded-lg bg-feisen-azul px-4 text-sm font-medium text-white hover:opacity-90">
        Seguir con el paso 1 · Despiece <ArrowRight size={14} />
      </Link>
    </div>
  )
}
