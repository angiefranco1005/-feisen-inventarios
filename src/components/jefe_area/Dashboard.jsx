import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatNumero, formatFechaHora, TIPOS_MOVIMIENTO } from '../../utils/formatters'
import Spinner from '../shared/Spinner'
import { Link } from 'react-router-dom'
import { ArrowUpDown, MoveRight } from 'lucide-react'

export default function DashboardJefeArea() {
  const { perfil } = useAuth()
  const [movRecientes, setMovRecientes] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('movimientos')
      .select('*, items(nombre, unidad_medida)')
      .eq('usuario_id', perfil.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setMovRecientes(data || [])
    setCargando(false)
  }

  if (cargando) return <Spinner />

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-feisen-azul">Hola, {perfil?.nombre?.split(' ')[0]}</h1>
        <p className="text-feisen-gris-medio text-sm mt-1">Jefe de área</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/movimientos/nuevo?tipo=salida_produccion"
          className="bg-feisen-rojo text-white rounded-2xl p-5 text-center font-bold text-base hover:opacity-90 transition-opacity">
          <ArrowUpDown size={28} className="mx-auto mb-2" />
          Salida a producción
        </Link>
        <Link to="/movimientos/nuevo?tipo=traslado"
          className="bg-feisen-azul text-white rounded-2xl p-5 text-center font-bold text-base hover:opacity-90 transition-opacity">
          <MoveRight size={28} className="mx-auto mb-2" />
          Traslado entre bodegas
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-feisen-gris-oscuro">Mis movimientos recientes</h2>
        </div>
        {movRecientes.length === 0 ? (
          <p className="text-center text-feisen-gris-medio py-10 text-sm">No hay movimientos registrados aún.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {movRecientes.map(m => (
              <div key={m.id} className="px-5 py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-feisen-gris-oscuro">{m.items?.nombre}</p>
                  <p className="text-xs text-feisen-gris-medio">{TIPOS_MOVIMIENTO[m.tipo]} · {formatFechaHora(m.created_at)}</p>
                </div>
                <span className="font-bold text-feisen-azul text-sm">
                  {formatNumero(m.cantidad)} {m.items?.unidad_medida}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
