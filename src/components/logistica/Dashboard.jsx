import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PackagePlus, PackageMinus, BarChart2 } from 'lucide-react'
import Spinner from '../shared/Spinner'

export default function DashboardLogistica() {
  const { perfil } = useAuth()
  const [recientes, setRecientes] = useState([])
  const [cargando, setCargando]   = useState(true)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('movimientos')
        .select('*, items(nombre, unidad_medida)')
        .eq('usuario_id', perfil.id)
        .order('created_at', { ascending: false })
        .limit(8)
      setRecientes(data || [])
      setCargando(false)
    }
    cargar()
  }, [])

  if (cargando) return <Spinner />

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-feisen-azul">Hola, {perfil?.nombre?.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm mt-1">Logística · Bodega Motores</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/movimientos/nuevo?tipo=entrada"
          className="bg-feisen-azul text-white rounded-2xl p-5 text-center font-bold hover:opacity-90 transition-opacity">
          <PackagePlus size={28} className="mx-auto mb-2" />
          Registro de entrada
        </Link>
        <Link to="/movimientos/nuevo?tipo=salida"
          className="bg-feisen-rojo text-white rounded-2xl p-5 text-center font-bold hover:opacity-90 transition-opacity">
          <PackageMinus size={28} className="mx-auto mb-2" />
          Registro de salida
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <BarChart2 size={18} className="text-feisen-azul" />
          <h2 className="font-semibold text-gray-700">Mis movimientos recientes</h2>
        </div>
        {recientes.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">No hay movimientos aún.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {recientes.map(m => (
              <div key={m.id} className="px-5 py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-800">{m.items?.nombre}</p>
                  <p className="text-xs text-gray-400">
                    {m.tipo === 'entrada' ? '↓ Entrada' : '↑ Salida'} · {new Date(m.created_at).toLocaleDateString('es-CO')}
                  </p>
                </div>
                <span className={`font-bold text-sm ${m.tipo === 'entrada' ? 'text-green-600' : 'text-feisen-rojo'}`}>
                  {m.tipo === 'entrada' ? '+' : '-'}{m.cantidad} {m.items?.unidad_medida}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
